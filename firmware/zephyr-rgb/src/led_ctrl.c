/*
 * LED Controller — behaviour engine
 *
 * Dedicated thread that drives the WS2812 LED according to the
 * selected mode.  The config can be updated at runtime from any
 * context — a mutex protects the shared state.
 */

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <string.h>
#include <math.h>

#include "led_ctrl.h"
#include "rgb_led.h"

LOG_MODULE_REGISTER(led_ctrl, LOG_LEVEL_INF);

/* ── thread resources ────────────────────────────────────────────── */

#define LED_STACK_SIZE 1024
#define LED_PRIORITY   7

static K_THREAD_STACK_DEFINE(led_stack, LED_STACK_SIZE);
static struct k_thread led_thread;

static struct k_mutex cfg_mutex;
static struct led_config active_cfg;

/* ── helpers ─────────────────────────────────────────────────────── */

/* Scale an 8-bit colour channel by a 0-255 brightness value */
static inline uint8_t scale(uint8_t ch, uint8_t bright)
{
	return (uint8_t)(((uint16_t)ch * (uint16_t)bright) / 255U);
}

/* Convert HSV (h 0-360, s/v 0-255) to RGB */
static void hsv_to_rgb(uint16_t h, uint8_t s, uint8_t v,
		       uint8_t *r, uint8_t *g, uint8_t *b)
{
	if (s == 0) {
		*r = *g = *b = v;
		return;
	}

	uint8_t region = h / 60;
	uint8_t remainder = (uint8_t)((h - (region * 60)) * 255 / 60);

	uint8_t p = (uint8_t)((uint16_t)v * (255 - s) / 255);
	uint8_t q = (uint8_t)((uint16_t)v * (255 - ((uint16_t)s * remainder / 255)) / 255);
	uint8_t t = (uint8_t)((uint16_t)v * (255 - ((uint16_t)s * (255 - remainder) / 255)) / 255);

	switch (region) {
	case 0:  *r = v; *g = t; *b = p; break;
	case 1:  *r = q; *g = v; *b = p; break;
	case 2:  *r = p; *g = v; *b = t; break;
	case 3:  *r = p; *g = q; *b = v; break;
	case 4:  *r = t; *g = p; *b = v; break;
	default: *r = v; *g = p; *b = q; break;
	}
}

/* Speed (1-255) → tick period in ms.  1 = slow (100 ms), 255 = fast (10 ms) */
static uint32_t speed_to_ms(uint8_t speed)
{
	if (speed == 0) {
		speed = 1;
	}
	/* Linear map: speed 1 → 100 ms, speed 255 → 10 ms */
	return 100 - (uint32_t)(speed - 1) * 90 / 254;
}

/* ── animation implementations ───────────────────────────────────── */

static void do_solid(const struct led_config *c)
{
	rgb_led_set(scale(c->color_r, c->brightness),
		    scale(c->color_g, c->brightness),
		    scale(c->color_b, c->brightness));
}

/* Blink: on for half-period, off for half-period */
static void do_blink(const struct led_config *c, uint32_t tick)
{
	/* period = 20 ticks (on for 10, off for 10) */
	if ((tick / 10) % 2 == 0) {
		do_solid(c);
	} else {
		rgb_led_off();
	}
}

/* Breathe: sinusoidal brightness modulation */
static void do_breathe(const struct led_config *c, uint32_t tick)
{
	/* triangular wave 0→255→0 over 512 ticks */
	uint32_t phase = tick % 512;
	uint8_t breath;
	if (phase < 256) {
		breath = (uint8_t)phase;
	} else {
		breath = (uint8_t)(511 - phase);
	}
	uint8_t b = scale(c->brightness, breath);
	rgb_led_set(scale(c->color_r, b),
		    scale(c->color_g, b),
		    scale(c->color_b, b));
}

/* Rainbow: cycle through hue at configured brightness */
static void do_rainbow(const struct led_config *c, uint32_t tick)
{
	uint16_t hue = (uint16_t)(tick % 360);
	uint8_t r, g, b;
	hsv_to_rgb(hue, 255, c->brightness, &r, &g, &b);
	rgb_led_set(r, g, b);
}

/* ── thread entry ────────────────────────────────────────────────── */

static void led_thread_fn(void *p1, void *p2, void *p3)
{
	ARG_UNUSED(p1);
	ARG_UNUSED(p2);
	ARG_UNUSED(p3);

	uint32_t tick = 0;

	while (1) {
		struct led_config c;

		k_mutex_lock(&cfg_mutex, K_FOREVER);
		memcpy(&c, &active_cfg, sizeof(c));
		k_mutex_unlock(&cfg_mutex);

		switch (c.mode) {
		case LED_MODE_SOLID:
			do_solid(&c);
			break;
		case LED_MODE_BLINK:
			do_blink(&c, tick);
			break;
		case LED_MODE_BREATHE:
			do_breathe(&c, tick);
			break;
		case LED_MODE_RAINBOW:
			do_rainbow(&c, tick);
			break;
		default:
			do_solid(&c);
			break;
		}

		tick++;
		k_sleep(K_MSEC(speed_to_ms(c.speed)));
	}
}

/* ── public API ──────────────────────────────────────────────────── */

void led_ctrl_start(const struct led_config *cfg)
{
	k_mutex_init(&cfg_mutex);
	memcpy(&active_cfg, cfg, sizeof(active_cfg));

	k_thread_create(&led_thread, led_stack,
			K_THREAD_STACK_SIZEOF(led_stack),
			led_thread_fn, NULL, NULL, NULL,
			LED_PRIORITY, 0, K_NO_WAIT);

	LOG_INF("LED controller started — mode %u", cfg->mode);
}

void led_ctrl_update(const struct led_config *cfg)
{
	k_mutex_lock(&cfg_mutex, K_FOREVER);
	memcpy(&active_cfg, cfg, sizeof(*cfg));
	k_mutex_unlock(&cfg_mutex);
}

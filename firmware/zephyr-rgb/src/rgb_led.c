/*
 * RGB LED — WS2812 single-pixel driver (GPIO bit-bang)
 *
 * Sends 24 bits (GRB order, MSB-first) over a single GPIO pin using
 * direct register writes and the CPU cycle counter (160 MHz) for
 * tight timing.  Interrupts are locked for the duration of the
 * 24-bit frame (~30 µs) to avoid jitter.
 *
 * Previous version used k_cycle_get_32() (16 MHz systimer) and the
 * Zephyr GPIO driver API, whose combined overhead (~200 ns) pushed
 * T0H above the WS2812B spec max (550 ns), corrupting data.
 *
 * WS2812B timing (±150 ns tolerance):
 *   0-bit : HIGH 400 ns, LOW 850 ns
 *   1-bit : HIGH 800 ns, LOW 450 ns
 *   Reset : LOW  ≥ 50 µs
 *
 * Target: ESP32-C6 Super Mini — WS2812B on GPIO 8
 */

#include <zephyr/kernel.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/logging/log.h>

#include "rgb_led.h"

LOG_MODULE_REGISTER(rgb_led, LOG_LEVEL_INF);

/* ── hardware constants ──────────────────────────────────────────── */

#define WS2812_GPIO_NODE  DT_NODELABEL(gpio0)
#define WS2812_GPIO_PIN   8          /* ESP32-C6 Super Mini onboard LED */
#define PIN_BIT           (1U << WS2812_GPIO_PIN)

/*
 * ESP32-C6 GPIO register addresses (direct write, no driver overhead).
 * DR_REG_GPIO_BASE = 0x60091000 on ESP32-C6.
 */
#define GPIO_OUT_W1TS_ADDR  0x60091008U   /* Set output high   */
#define GPIO_OUT_W1TC_ADDR  0x6009100CU   /* Set output low    */

#define GPIO_SET_HIGH()  (*(volatile uint32_t *)GPIO_OUT_W1TS_ADDR = PIN_BIT)
#define GPIO_SET_LOW()   (*(volatile uint32_t *)GPIO_OUT_W1TC_ADDR = PIN_BIT)

/* Nanosecond timing targets */
#define T0H_NS   400
#define T0L_NS   850
#define T1H_NS   800
#define T1L_NS   450

/*
 * ESP32-C6 CPU frequency: 160 MHz (default, from 40 MHz XTAL × 4 PLL).
 * The RISC-V performance counter (CSR 0x7E2) ticks at this rate.
 */
#define CPU_FREQ_MHZ  160

/* ── module state ────────────────────────────────────────────────── */

static const struct device *gpio_dev;
static bool initialised;

/* Pre-computed CPU cycle counts */
static uint32_t t0h_cyc;
static uint32_t t0l_cyc;
static uint32_t t1h_cyc;
static uint32_t t1l_cyc;

/*
 * Gamma correction LUT (gamma ≈ 2.8).
 * Converts sRGB colour values to linearised PWM values so that the
 * perceived LED colour matches the colour shown in the web picker.
 */
static const uint8_t gamma_lut[256] = {
	  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,
	  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  1,  1,  1,  1,
	  1,  1,  1,  1,  1,  1,  1,  1,  1,  2,  2,  2,  2,  2,  2,  2,
	  2,  3,  3,  3,  3,  3,  3,  3,  4,  4,  4,  4,  4,  5,  5,  5,
	  5,  6,  6,  6,  6,  7,  7,  7,  7,  8,  8,  8,  9,  9,  9, 10,
	 10, 10, 11, 11, 11, 12, 12, 13, 13, 13, 14, 14, 15, 15, 16, 16,
	 17, 17, 18, 18, 19, 19, 20, 20, 21, 21, 22, 22, 23, 24, 24, 25,
	 25, 26, 27, 27, 28, 29, 29, 30, 31, 32, 32, 33, 34, 35, 35, 36,
	 37, 38, 39, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 50,
	 51, 52, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 66, 67, 68,
	 69, 70, 72, 73, 74, 75, 77, 78, 79, 81, 82, 83, 85, 86, 87, 89,
	 90, 92, 93, 95, 96, 98, 99,101,102,104,105,107,109,110,112,114,
	115,117,119,120,122,124,126,127,129,131,133,135,137,138,140,142,
	144,146,148,150,152,154,156,158,160,162,164,167,169,171,173,175,
	177,180,182,184,186,189,191,193,196,198,200,203,205,208,210,213,
	215,218,220,223,225,228,231,233,236,239,241,244,247,249,252,255,
};

/* ── helpers ─────────────────────────────────────────────────────── */

static inline uint32_t ns_to_cpu_cycles(uint32_t ns)
{
	return (uint32_t)((uint64_t)ns * CPU_FREQ_MHZ / 1000ULL);
}

/*
 * Read CPU cycle counter (RISC-V performance counter CSR 0x7E2).
 * Runs at CPU_FREQ_MHZ (160 MHz → 6.25 ns resolution).
 */
static inline uint32_t cpu_cycles_now(void)
{
	uint32_t cycles;
	__asm__ volatile("csrr %0, 0x7e2" : "=r"(cycles));
	return cycles;
}

static inline void spin_until(uint32_t start, uint32_t cycles)
{
	while ((cpu_cycles_now() - start) < cycles) {
		/* busy-wait */
	}
}

/* Send a single bit — must be called with IRQs locked */
static inline void send_bit(int bit)
{
	uint32_t t;

	GPIO_SET_HIGH();
	t = cpu_cycles_now();
	spin_until(t, bit ? t1h_cyc : t0h_cyc);

	GPIO_SET_LOW();
	t = cpu_cycles_now();
	spin_until(t, bit ? t1l_cyc : t0l_cyc);
}

/* Send one byte, MSB first */
static inline void send_byte(uint8_t val)
{
	for (int i = 7; i >= 0; i--) {
		send_bit((val >> i) & 1);
	}
}

/* ── public API ──────────────────────────────────────────────────── */

int rgb_led_init(void)
{
	gpio_dev = DEVICE_DT_GET(WS2812_GPIO_NODE);
	if (!device_is_ready(gpio_dev)) {
		LOG_ERR("GPIO device not ready");
		return -ENODEV;
	}

	int ret = gpio_pin_configure(gpio_dev, WS2812_GPIO_PIN,
				     GPIO_OUTPUT_LOW);
	if (ret < 0) {
		LOG_ERR("Failed to configure GPIO%d (%d)", WS2812_GPIO_PIN, ret);
		return ret;
	}

	/* Pre-compute CPU cycle counts (160 MHz) */
	t0h_cyc = ns_to_cpu_cycles(T0H_NS);
	t0l_cyc = ns_to_cpu_cycles(T0L_NS);
	t1h_cyc = ns_to_cpu_cycles(T1H_NS);
	t1l_cyc = ns_to_cpu_cycles(T1L_NS);

	LOG_INF("WS2812 on GPIO%d  —  cpu_freq: %u MHz  "
		"t0h:%u t0l:%u t1h:%u t1l:%u",
		WS2812_GPIO_PIN, CPU_FREQ_MHZ,
		t0h_cyc, t0l_cyc, t1h_cyc, t1l_cyc);

	initialised = true;
	return 0;
}

void rgb_led_set(uint8_t r, uint8_t g, uint8_t b)
{
	if (!initialised) {
		return;
	}

	/* Gamma-correct each channel for perceptual colour accuracy */
	r = gamma_lut[r];
	g = gamma_lut[g];
	b = gamma_lut[b];

	/* WS2812 expects GRB byte order */
	unsigned int key = irq_lock();
	send_byte(g);
	send_byte(r);
	send_byte(b);
	irq_unlock(key);

	/* Reset pulse: >50 µs low (pin is already low after last bit) */
	k_busy_wait(80);
}

void rgb_led_off(void)
{
	rgb_led_set(0, 0, 0);
}

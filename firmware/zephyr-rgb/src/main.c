/*
 * UNAL Flash Tool — RGB LED Firmware (Zephyr RTOS)
 *
 * Target: ESP32-C6 Super Mini (WS2812B RGB LED on GPIO 8)
 *
 * Boot sequence:
 *   1. Init WS2812 RGB LED driver
 *   2. Load LED config from flash partition (offset 128)
 *   3. Start LED controller thread (runs chosen animation)
 *   4. Main loop: periodic heartbeat log
 *
 * Config partition layout (scratch_partition @ 0x3E0000):
 *   [128..191]  LED config   ( 64 bytes — struct led_config)
 */

#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>
#include <zephyr/logging/log.h>
#include <version.h>

#include "led_config.h"
#include "rgb_led.h"
#include "led_ctrl.h"

LOG_MODULE_REGISTER(main, LOG_LEVEL_INF);

int main(void)
{
	int ret;

	printk("\n========================================\n");
	printk("  UNAL Flash Tool — RGB LED Firmware\n");
	printk("  Framework: Zephyr RTOS %s\n", KERNEL_VERSION_STRING);
	printk("  Board: %s\n", CONFIG_BOARD);
	printk("  LED: WS2812B on GPIO 8\n");
	printk("========================================\n\n");

	/* ── 1. Initialise RGB LED driver ─────────────────────────── */
	ret = rgb_led_init();
	if (ret < 0) {
		LOG_ERR("RGB LED init failed (%d)", ret);
	}

	/* ── 2. Load LED config from flash ───────────────────────── */
	struct led_config led_cfg;
	if (led_config_load(&led_cfg) != 0) {
		LOG_INF("Using default LED config");
		led_config_defaults(&led_cfg);
	}

	/* ── 3. Start LED controller thread ──────────────────────── */
	led_ctrl_start(&led_cfg);

	/* ── 4. Heartbeat loop ───────────────────────────────────── */
	while (1) {
		printk("[%08u] LED mode: %u | Uptime: %lld ms\n",
		       k_uptime_get_32(), led_cfg.mode, k_uptime_get());
		k_sleep(K_SECONDS(5));
	}

	return 0;
}

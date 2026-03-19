/*
 * UNAL Flash Tool — RGB WiFi Firmware (Zephyr RTOS)
 *
 * Target: ESP32-C6 Super Mini (WS2812B RGB LED on GPIO 8)
 *
 * Boot sequence:
 *   1. Init WS2812 RGB LED driver
 *   2. Init WiFi manager (NVS + net callbacks)
 *   3. Load LED config from flash partition (offset 128)
 *   4. Load WiFi credentials (config partition → NVS fallback)
 *   5. Start LED controller thread (runs chosen animation)
 *   6. Connect WiFi (if credentials found)
 *   7. Main loop: periodic heartbeat log
 *
 * Config partition layout (scratch_partition @ 0x3E0000):
 *   [0..127]   WiFi config  (128 bytes — struct wifi_config)
 *   [128..191]  LED config   ( 64 bytes — struct led_config)
 */

#include <zephyr/kernel.h>
#include <zephyr/sys/printk.h>
#include <zephyr/logging/log.h>
#include <version.h>

#include "wifi_config.h"
#include "wifi_mgr.h"
#include "led_config.h"
#include "rgb_led.h"
#include "led_ctrl.h"

LOG_MODULE_REGISTER(main, LOG_LEVEL_INF);

int main(void)
{
	int ret;

	printk("\n========================================\n");
	printk("  UNAL Flash Tool — RGB WiFi Firmware\n");
	printk("  Framework: Zephyr RTOS %s\n", KERNEL_VERSION_STRING);
	printk("  Board: %s\n", CONFIG_BOARD);
	printk("  LED: WS2812B on GPIO 8\n");
	printk("========================================\n\n");

	/* ── 1. Initialise RGB LED driver ─────────────────────────── */
	ret = rgb_led_init();
	if (ret < 0) {
		LOG_ERR("RGB LED init failed (%d)", ret);
		/* Non-fatal: WiFi can still work without LED */
	}

	/* ── 2. Initialise WiFi manager ──────────────────────────── */
	ret = wifi_mgr_init();
	if (ret < 0) {
		LOG_ERR("WiFi manager init failed (%d)", ret);
	}

	/* ── 3. Load LED config from flash ───────────────────────── */
	struct led_config led_cfg;
	if (led_config_load(&led_cfg) != 0) {
		LOG_INF("Using default LED config");
		led_config_defaults(&led_cfg);
	}

	/* ── 4. Load WiFi credentials ────────────────────────────── */
	char ssid[33] = {0};
	char psk[65] = {0};
	bool creds_found = false;

	if (wifi_config_load(ssid, sizeof(ssid), psk, sizeof(psk)) == 0 &&
	    ssid[0] != '\0') {
		LOG_INF("Credentials from config partition — SSID: %s", ssid);
		creds_found = true;
	} else if (wifi_mgr_load_credentials(ssid, sizeof(ssid),
					     psk, sizeof(psk)) == 0 &&
		   ssid[0] != '\0') {
		LOG_INF("Credentials from NVS — SSID: %s", ssid);
		creds_found = true;
	}

	/* ── 5. Start LED controller thread ──────────────────────── */
	led_ctrl_start(&led_cfg);

	/* ── 6. Connect WiFi ─────────────────────────────────────── */
	if (creds_found) {
		wifi_mgr_connect(ssid, psk);
	} else {
		LOG_WRN("No WiFi credentials found");
		LOG_INF("Use the UNAL Flash Tool to flash a config binary");
	}

	/* ── 7. Heartbeat loop ───────────────────────────────────── */
	while (1) {
		enum wifi_mgr_state state = wifi_mgr_get_state();
		const char *state_str;

		switch (state) {
		case WIFI_MGR_CONNECTED:
			state_str = "CONNECTED";
			break;
		case WIFI_MGR_CONNECTING:
			state_str = "CONNECTING";
			break;
		case WIFI_MGR_DISCONNECTED:
			state_str = "DISCONNECTED";
			break;
		default:
			state_str = "IDLE";
			break;
		}

		const char *ip = wifi_mgr_get_ip();
		printk("[%08u] WiFi: %s", k_uptime_get_32(), state_str);
		if (ip[0] != '\0') {
			printk(" | IP: %s", ip);
		}
		printk(" | LED mode: %u | Uptime: %lld ms\n",
		       led_cfg.mode, k_uptime_get());

		k_sleep(K_SECONDS(5));
	}

	return 0;
}

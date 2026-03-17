/*
 * UNAL Flash Tool — WiFi Firmware (Zephyr RTOS)
 *
 * Reads WiFi credentials from NVS, connects to the configured AP,
 * and prints connection status via UART.
 *
 * Credentials are provisioned via the PROV:* serial protocol
 * from the UNAL Flash Tool web interface.
 *
 * Target: Seeed XIAO ESP32-C6
 */

#include <zephyr/kernel.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/sys/printk.h>
#include <zephyr/logging/log.h>
#include <version.h>

#include "wifi_mgr.h"
#include "prov_shell.h"

LOG_MODULE_REGISTER(main, LOG_LEVEL_INF);

/* LED from devicetree alias */
#define LED_NODE DT_ALIAS(led0)

#if !DT_NODE_HAS_STATUS_OKAY(LED_NODE)
#error "LED0 alias not defined in devicetree"
#endif

static const struct gpio_dt_spec led = GPIO_DT_SPEC_GET(LED_NODE, gpios);

/* LED blink patterns (ms) */
#define BLINK_FAST    150   /* provisioning / no credentials */
#define BLINK_MEDIUM  500   /* connecting */
#define BLINK_SLOW    1000  /* connected */

int main(void)
{
	int ret;
	uint32_t count = 0;

	printk("\n========================================\n");
	printk("  UNAL Flash Tool — WiFi Firmware\n");
	printk("  Framework: Zephyr RTOS %s\n", KERNEL_VERSION_STRING);
	printk("  Board: %s\n", CONFIG_BOARD);
	printk("========================================\n\n");

	/* Initialize LED */
	if (!gpio_is_ready_dt(&led)) {
		LOG_ERR("LED GPIO not ready");
		return -1;
	}
	ret = gpio_pin_configure_dt(&led, GPIO_OUTPUT_ACTIVE);
	if (ret < 0) {
		LOG_ERR("Could not configure LED pin (%d)", ret);
		return -1;
	}

	/* Initialize provisioning shell commands */
	prov_shell_init();

	/* Initialize WiFi manager and attempt connection from NVS */
	ret = wifi_mgr_init();
	if (ret < 0) {
		LOG_ERR("WiFi manager init failed (%d)", ret);
	}

	/* Try loading credentials from NVS and connecting */
	char ssid[33] = {0};
	char psk[65] = {0};

	if (wifi_mgr_load_credentials(ssid, sizeof(ssid), psk, sizeof(psk)) == 0 &&
	    ssid[0] != '\0') {
		LOG_INF("Credentials found in NVS — SSID: %s", ssid);
		wifi_mgr_connect(ssid, psk);
	} else {
		LOG_WRN("No WiFi credentials in NVS");
		LOG_INF("Use PROV:SET:wifi_ssid=<ssid> and PROV:SET:wifi_pass=<password>");
		LOG_INF("Then PROV:COMMIT to save and connect");
	}

	/* Main loop — blink LED based on WiFi state */
	while (1) {
		gpio_pin_toggle_dt(&led);
		count++;

		enum wifi_mgr_state state = wifi_mgr_get_state();
		int blink_ms;

		switch (state) {
		case WIFI_MGR_CONNECTED:
			blink_ms = BLINK_SLOW;
			break;
		case WIFI_MGR_CONNECTING:
			blink_ms = BLINK_MEDIUM;
			break;
		default:
			blink_ms = BLINK_FAST;
			break;
		}

		if (count % 10 == 0) {
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

			printk("[%08u] WiFi: %s | Uptime: %lld ms\n",
			       k_uptime_get_32(), state_str, k_uptime_get());
		}

		k_sleep(K_MSEC(blink_ms));
	}

	return 0;
}

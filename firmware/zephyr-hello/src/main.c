/*
 * UNAL Flash Tool — Hello World Firmware (Zephyr RTOS)
 *
 * Blinks the onboard LED and prints heartbeat messages via UART.
 * Target: Seeed XIAO ESP32-C6
 */

#include <zephyr/kernel.h>
#include <zephyr/drivers/gpio.h>
#include <zephyr/sys/printk.h>
#include <version.h>
#include <soc.h>

/* Get LED from devicetree alias "led0" */
#define LED_NODE DT_ALIAS(led0)

#if !DT_NODE_HAS_STATUS_OKAY(LED_NODE)
#error "LED0 alias not defined in devicetree"
#endif

static const struct gpio_dt_spec led = GPIO_DT_SPEC_GET(LED_NODE, gpios);

int main(void)
{
	int ret;
	uint32_t count = 0;

	printk("\n========================================\n");
	printk("  UNAL Flash Tool — Hello World\n");
	printk("  Framework: Zephyr RTOS %s\n", KERNEL_VERSION_STRING);
	printk("  Board: %s\n", CONFIG_BOARD);
	printk("========================================\n\n");

	if (!gpio_is_ready_dt(&led)) {
		printk("ERROR: LED GPIO not ready\n");
		return -1;
	}

	ret = gpio_pin_configure_dt(&led, GPIO_OUTPUT_ACTIVE);
	if (ret < 0) {
		printk("ERROR: Could not configure LED pin (%d)\n", ret);
		return -1;
	}

	printk("LED initialized on GPIO %d\n\n", led.pin);

	while (1) {
		gpio_pin_toggle_dt(&led);
		count++;

		printk("[%08u] Hello from UNAL! LED blink #%u | "
		       "Uptime: %lld ms\n",
		       k_uptime_get_32(), count, k_uptime_get());

		k_sleep(K_MSEC(1000));
	}

	return 0;
}

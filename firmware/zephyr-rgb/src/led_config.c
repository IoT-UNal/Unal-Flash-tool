/*
 * LED Config — flash partition reader
 *
 * Reads led_config from offset 128 in the scratch partition.
 */

#include <zephyr/kernel.h>
#include <zephyr/storage/flash_map.h>
#include <zephyr/logging/log.h>
#include <string.h>

#include "led_config.h"

LOG_MODULE_REGISTER(led_config, LOG_LEVEL_INF);

/* LED config at offset 128 in the scratch partition */
#define LED_CONFIG_FLASH_OFFSET 128

int led_config_load(struct led_config *cfg)
{
	const struct flash_area *fa;
	int ret;

	ret = flash_area_open(FIXED_PARTITION_ID(scratch_partition), &fa);
	if (ret != 0) {
		LOG_ERR("Failed to open scratch partition (%d)", ret);
		return -1;
	}

	ret = flash_area_read(fa, LED_CONFIG_FLASH_OFFSET, cfg, sizeof(*cfg));
	flash_area_close(fa);
	if (ret != 0) {
		LOG_ERR("Failed to read LED config from flash (%d)", ret);
		return -1;
	}

	if (cfg->magic != LED_CONFIG_MAGIC) {
		LOG_INF("No LED config in flash (magic: 0x%08x)", cfg->magic);
		return -1;
	}

	if (cfg->version != LED_CONFIG_VERSION) {
		LOG_WRN("LED config version mismatch (%u != %u)",
			cfg->version, LED_CONFIG_VERSION);
		return -1;
	}

	LOG_INF("LED config loaded — mode:%u bright:%u speed:%u "
		"color:#%02x%02x%02x",
		cfg->mode, cfg->brightness, cfg->speed,
		cfg->color_r, cfg->color_g, cfg->color_b);

	return 0;
}

void led_config_defaults(struct led_config *cfg)
{
	memset(cfg, 0xff, sizeof(*cfg));
	cfg->magic      = LED_CONFIG_MAGIC;
	cfg->version    = LED_CONFIG_VERSION;
	cfg->mode       = LED_MODE_SOLID;
	cfg->brightness = 128;  /* ~50 % — visible but not blinding */
	cfg->speed      = 128;  /* medium */
	cfg->color_r    = 0;
	cfg->color_g    = 120;
	cfg->color_b    = 255;
	cfg->flags      = 0;
}

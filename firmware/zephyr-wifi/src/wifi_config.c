/*
 * WiFi Config — flash partition reader
 *
 * Reads a wifi_config struct from the scratch partition (0x3E0000).
 * This area is unused without MCUboot OTA updates.
 *
 * The UNAL Flash Tool web interface generates this binary blob
 * and flashes it at the same offset alongside the firmware.
 */

#include <zephyr/kernel.h>
#include <zephyr/storage/flash_map.h>
#include <zephyr/logging/log.h>
#include <string.h>

#include "wifi_config.h"

LOG_MODULE_REGISTER(wifi_config, LOG_LEVEL_INF);

int wifi_config_load(char *ssid, size_t ssid_len,
		     char *psk, size_t psk_len)
{
	const struct flash_area *fa;
	struct wifi_config cfg;
	int ret;

	ret = flash_area_open(FIXED_PARTITION_ID(scratch_partition), &fa);
	if (ret != 0) {
		LOG_ERR("Failed to open scratch partition (%d)", ret);
		return -1;
	}

	ret = flash_area_read(fa, 0, &cfg, sizeof(cfg));
	flash_area_close(fa);
	if (ret != 0) {
		LOG_ERR("Failed to read config from flash (%d)", ret);
		return -1;
	}

	/* Validate magic */
	if (cfg.magic != WIFI_CONFIG_MAGIC) {
		LOG_INF("No WiFi config found in flash (magic: 0x%08x)",
			cfg.magic);
		return -1;
	}

	/* Validate version */
	if (cfg.version != WIFI_CONFIG_VERSION) {
		LOG_WRN("Config version mismatch (%u != %u)",
			cfg.version, WIFI_CONFIG_VERSION);
		return -1;
	}

	/* Validate lengths */
	if (cfg.ssid_len == 0 || cfg.ssid_len > WIFI_CONFIG_SSID_MAX) {
		LOG_WRN("Invalid SSID length: %u", cfg.ssid_len);
		return -1;
	}

	if (cfg.psk_len > WIFI_CONFIG_PSK_MAX) {
		LOG_WRN("Invalid PSK length: %u", cfg.psk_len);
		return -1;
	}

	/* Copy SSID */
	size_t copy_len = cfg.ssid_len;
	if (copy_len >= ssid_len) {
		copy_len = ssid_len - 1;
	}
	memcpy(ssid, cfg.ssid, copy_len);
	ssid[copy_len] = '\0';

	/* Copy PSK */
	copy_len = cfg.psk_len;
	if (copy_len >= psk_len) {
		copy_len = psk_len - 1;
	}
	memcpy(psk, cfg.psk, copy_len);
	psk[copy_len] = '\0';

	LOG_INF("WiFi config loaded from flash — SSID: %s", ssid);
	return 0;
}

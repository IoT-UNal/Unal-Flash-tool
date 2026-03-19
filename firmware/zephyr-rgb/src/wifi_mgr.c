/*
 * WiFi Manager — implementation
 *
 * Handles WiFi STA connection using Zephyr net_mgmt API,
 * with NVS-backed credential storage.
 */

#include <zephyr/kernel.h>
#include <zephyr/net/net_if.h>
#include <zephyr/net/wifi_mgmt.h>
#include <zephyr/net/net_event.h>
#include <zephyr/net/dhcpv4.h>
#include <zephyr/settings/settings.h>
#include <zephyr/drivers/flash.h>
#include <zephyr/storage/flash_map.h>
#include <zephyr/fs/nvs.h>
#include <zephyr/logging/log.h>
#include <string.h>
#include <stdio.h>

#include "wifi_mgr.h"

LOG_MODULE_REGISTER(wifi_mgr, LOG_LEVEL_INF);

/* NVS IDs for credential storage */
#define NVS_SSID_ID    1
#define NVS_PSK_ID     2

/* NVS partition — uses "storage" partition from devicetree */
#define NVS_PARTITION  storage_partition
#define NVS_PARTITION_DEVICE FIXED_PARTITION_DEVICE(NVS_PARTITION)
#define NVS_PARTITION_OFFSET FIXED_PARTITION_OFFSET(NVS_PARTITION)
#define NVS_PARTITION_SIZE   FIXED_PARTITION_SIZE(NVS_PARTITION)

static struct nvs_fs nvs;
static enum wifi_mgr_state current_state = WIFI_MGR_IDLE;
static char ip_addr_str[NET_IPV4_ADDR_LEN] = {0};

static struct net_mgmt_event_callback wifi_cb;
static struct net_mgmt_event_callback ipv4_cb;

/* Semaphore to signal connection result */
static K_SEM_DEFINE(wifi_connected_sem, 0, 1);

static void wifi_event_handler(struct net_mgmt_event_callback *cb,
			       uint64_t mgmt_event, struct net_if *iface)
{
	switch (mgmt_event) {
	case NET_EVENT_WIFI_CONNECT_RESULT: {
		const struct wifi_status *status =
			(const struct wifi_status *)cb->info;

		if (status->status) {
			LOG_ERR("WiFi connection failed (%d)", status->status);
			current_state = WIFI_MGR_DISCONNECTED;
		} else {
			LOG_INF("WiFi connected!");
			current_state = WIFI_MGR_CONNECTED;
			k_sem_give(&wifi_connected_sem);
		}
		break;
	}
	case NET_EVENT_WIFI_DISCONNECT_RESULT: {
		LOG_INF("WiFi disconnected");
		current_state = WIFI_MGR_DISCONNECTED;
		memset(ip_addr_str, 0, sizeof(ip_addr_str));
		break;
	}
	default:
		break;
	}
}

static void ipv4_event_handler(struct net_mgmt_event_callback *cb,
			       uint64_t mgmt_event, struct net_if *iface)
{
	if (mgmt_event != NET_EVENT_IPV4_ADDR_ADD) {
		return;
	}

	for (int i = 0; i < NET_IF_MAX_IPV4_ADDR; i++) {
		if (iface->config.ip.ipv4->unicast[i].ipv4.is_used) {
			char buf[NET_IPV4_ADDR_LEN];
			struct net_addr *addr = &iface->config.ip.ipv4->unicast[i].ipv4.address;

			if (net_addr_ntop(AF_INET, &addr->in_addr, buf, sizeof(buf))) {
				strncpy(ip_addr_str, buf, sizeof(ip_addr_str) - 1);
				LOG_INF("DHCP IP: %s", ip_addr_str);
			}
			break;
		}
	}
}

int wifi_mgr_init(void)
{
	int ret;

	/* Initialize NVS */
	nvs.flash_device = NVS_PARTITION_DEVICE;
	if (!device_is_ready(nvs.flash_device)) {
		LOG_ERR("Flash device not ready");
		return -ENODEV;
	}

	nvs.offset = NVS_PARTITION_OFFSET;
	nvs.sector_size = 4096;
	nvs.sector_count = NVS_PARTITION_SIZE / nvs.sector_size;

	ret = nvs_mount(&nvs);
	if (ret) {
		LOG_ERR("NVS mount failed (%d)", ret);
		return ret;
	}

	LOG_INF("NVS initialized (sectors: %u)", nvs.sector_count);

	/* Register WiFi event callbacks */
	net_mgmt_init_event_callback(&wifi_cb, wifi_event_handler,
				     NET_EVENT_WIFI_CONNECT_RESULT |
				     NET_EVENT_WIFI_DISCONNECT_RESULT);
	net_mgmt_add_event_callback(&wifi_cb);

	net_mgmt_init_event_callback(&ipv4_cb, ipv4_event_handler,
				     NET_EVENT_IPV4_ADDR_ADD);
	net_mgmt_add_event_callback(&ipv4_cb);

	return 0;
}

int wifi_mgr_load_credentials(char *ssid, size_t ssid_len,
			      char *psk, size_t psk_len)
{
	int ret;

	ret = nvs_read(&nvs, NVS_SSID_ID, ssid, ssid_len - 1);
	if (ret <= 0) {
		return -1;
	}
	ssid[ret] = '\0';

	ret = nvs_read(&nvs, NVS_PSK_ID, psk, psk_len - 1);
	if (ret <= 0) {
		/* Password can be empty (open network) */
		psk[0] = '\0';
	} else {
		psk[ret] = '\0';
	}

	return 0;
}

int wifi_mgr_save_credentials(const char *ssid, const char *psk)
{
	int ret;

	ret = nvs_write(&nvs, NVS_SSID_ID, ssid, strlen(ssid));
	if (ret < 0) {
		LOG_ERR("Failed to write SSID to NVS (%d)", ret);
		return ret;
	}

	if (psk && psk[0] != '\0') {
		ret = nvs_write(&nvs, NVS_PSK_ID, psk, strlen(psk));
		if (ret < 0) {
			LOG_ERR("Failed to write PSK to NVS (%d)", ret);
			return ret;
		}
	}

	LOG_INF("Credentials saved to NVS — SSID: %s", ssid);
	return 0;
}

int wifi_mgr_connect(const char *ssid, const char *psk)
{
	struct net_if *iface = net_if_get_default();

	if (!iface) {
		LOG_ERR("No network interface found");
		return -ENODEV;
	}

	struct wifi_connect_req_params params = {0};

	params.ssid = (const uint8_t *)ssid;
	params.ssid_length = strlen(ssid);
	params.channel = WIFI_CHANNEL_ANY;
	params.band = WIFI_FREQ_BAND_2_4_GHZ;

	if (psk && psk[0] != '\0') {
		params.psk = (const uint8_t *)psk;
		params.psk_length = strlen(psk);
		params.security = WIFI_SECURITY_TYPE_PSK;
	} else {
		params.security = WIFI_SECURITY_TYPE_NONE;
	}

	LOG_INF("Connecting to SSID: %s ...", ssid);
	current_state = WIFI_MGR_CONNECTING;

	int ret = net_mgmt(NET_REQUEST_WIFI_CONNECT, iface, &params,
			   sizeof(struct wifi_connect_req_params));
	if (ret) {
		LOG_ERR("WiFi connect request failed (%d)", ret);
		current_state = WIFI_MGR_DISCONNECTED;
		return ret;
	}

	return 0;
}

int wifi_mgr_disconnect(void)
{
	struct net_if *iface = net_if_get_default();

	if (!iface) {
		return -ENODEV;
	}

	int ret = net_mgmt(NET_REQUEST_WIFI_DISCONNECT, iface, NULL, 0);
	if (ret) {
		LOG_ERR("WiFi disconnect failed (%d)", ret);
	}
	return ret;
}

enum wifi_mgr_state wifi_mgr_get_state(void)
{
	return current_state;
}

const char *wifi_mgr_get_ip(void)
{
	return ip_addr_str;
}

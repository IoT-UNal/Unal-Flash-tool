/*
 * WiFi Manager — header
 *
 * Manages WiFi connection lifecycle and NVS credential storage.
 */

#ifndef WIFI_MGR_H
#define WIFI_MGR_H

#include <stddef.h>

enum wifi_mgr_state {
	WIFI_MGR_IDLE = 0,
	WIFI_MGR_CONNECTING,
	WIFI_MGR_CONNECTED,
	WIFI_MGR_DISCONNECTED,
};

/** Initialize the WiFi manager (NVS + net mgmt callbacks) */
int wifi_mgr_init(void);

/** Load credentials from NVS. Returns 0 on success, -1 if not found. */
int wifi_mgr_load_credentials(char *ssid, size_t ssid_len,
			      char *psk, size_t psk_len);

/** Save credentials to NVS. Returns 0 on success. */
int wifi_mgr_save_credentials(const char *ssid, const char *psk);

/** Connect to WiFi with given SSID and PSK. */
int wifi_mgr_connect(const char *ssid, const char *psk);

/** Disconnect from WiFi. */
int wifi_mgr_disconnect(void);

/** Get current WiFi state. */
enum wifi_mgr_state wifi_mgr_get_state(void);

/** Get the assigned IP address string (after DHCP). */
const char *wifi_mgr_get_ip(void);

#endif /* WIFI_MGR_H */

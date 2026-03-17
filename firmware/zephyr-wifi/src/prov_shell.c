/*
 * Provisioning Shell — implementation
 *
 * Handles the PROV:* serial protocol sent by the UNAL Flash Tool
 * CredentialWriter (browser side).
 *
 * Protocol:
 *   PROV:START\n       → Enter provisioning mode
 *   PROV:SET:key=val\n → Set credential in NVS
 *   PROV:COMMIT\n      → Save & connect WiFi
 *   PROV:STATUS\n      → Query current status
 *
 * Responses:
 *   PROV:OK:<info>\n
 *   PROV:ERR:<reason>\n
 */

#include <zephyr/kernel.h>
#include <zephyr/device.h>
#include <zephyr/drivers/uart.h>
#include <zephyr/logging/log.h>
#include <string.h>
#include <stdio.h>

#include "prov_shell.h"
#include "wifi_mgr.h"

LOG_MODULE_REGISTER(prov_shell, LOG_LEVEL_INF);

#define PROV_BUF_SIZE 256

/* Provisioning state */
static bool prov_active;
static char prov_ssid[33];
static char prov_psk[65];

/* UART RX buffer */
static char rx_buf[PROV_BUF_SIZE];
static int rx_pos;

/* UART device */
static const struct device *uart_dev;

static void send_response(const char *resp)
{
	const char *p = resp;
	while (*p) {
		uart_poll_out(uart_dev, *p++);
	}
	uart_poll_out(uart_dev, '\n');
}

static void handle_prov_start(void)
{
	prov_active = true;
	memset(prov_ssid, 0, sizeof(prov_ssid));
	memset(prov_psk, 0, sizeof(prov_psk));
	LOG_INF("Provisioning started");
	send_response("PROV:OK:START");
}

static void handle_prov_set(const char *payload)
{
	if (!prov_active) {
		send_response("PROV:ERR:not_started");
		return;
	}

	/* Parse key=value */
	const char *eq = strchr(payload, '=');
	if (!eq) {
		send_response("PROV:ERR:invalid_format");
		return;
	}

	/* Extract key */
	char key[32];
	size_t key_len = eq - payload;
	if (key_len >= sizeof(key)) {
		send_response("PROV:ERR:key_too_long");
		return;
	}
	memcpy(key, payload, key_len);
	key[key_len] = '\0';

	const char *value = eq + 1;

	if (strcmp(key, "wifi_ssid") == 0) {
		strncpy(prov_ssid, value, sizeof(prov_ssid) - 1);
		LOG_INF("Set wifi_ssid = %s", prov_ssid);
		send_response("PROV:OK:wifi_ssid");
	} else if (strcmp(key, "wifi_password") == 0 || strcmp(key, "wifi_pass") == 0) {
		strncpy(prov_psk, value, sizeof(prov_psk) - 1);
		LOG_INF("Set wifi_password = ****");
		send_response("PROV:OK:wifi_password");
	} else {
		LOG_WRN("Unknown credential key: %s", key);
		send_response("PROV:ERR:unknown_key");
	}
}

static void handle_prov_commit(void)
{
	if (!prov_active) {
		send_response("PROV:ERR:not_started");
		return;
	}

	if (prov_ssid[0] == '\0') {
		send_response("PROV:ERR:ssid_empty");
		return;
	}

	/* Save to NVS */
	int ret = wifi_mgr_save_credentials(prov_ssid, prov_psk);
	if (ret < 0) {
		send_response("PROV:ERR:nvs_write_failed");
		return;
	}

	LOG_INF("Credentials committed — connecting to %s", prov_ssid);
	send_response("PROV:OK:COMMIT");

	prov_active = false;

	/* Disconnect if connected, then connect with new credentials */
	wifi_mgr_disconnect();
	k_sleep(K_MSEC(500));
	wifi_mgr_connect(prov_ssid, prov_psk);
}

static void handle_prov_status(void)
{
	char buf[128];
	enum wifi_mgr_state state = wifi_mgr_get_state();
	const char *ip = wifi_mgr_get_ip();

	char ssid[33] = {0};
	char psk[65] = {0};
	wifi_mgr_load_credentials(ssid, sizeof(ssid), psk, sizeof(psk));

	const char *state_str;
	switch (state) {
	case WIFI_MGR_CONNECTED:
		state_str = "connected";
		break;
	case WIFI_MGR_CONNECTING:
		state_str = "connecting";
		break;
	case WIFI_MGR_DISCONNECTED:
		state_str = "disconnected";
		break;
	default:
		state_str = "idle";
		break;
	}

	snprintf(buf, sizeof(buf),
		 "PROV:OK:wifi_ssid=%s,wifi_pass=%s,state=%s,ip=%s",
		 ssid[0] ? "SET" : "EMPTY",
		 psk[0] ? "SET" : "EMPTY",
		 state_str,
		 ip[0] ? ip : "none");

	send_response(buf);
}

static void process_line(const char *line)
{
	if (strncmp(line, "PROV:START", 10) == 0) {
		handle_prov_start();
	} else if (strncmp(line, "PROV:SET:", 9) == 0) {
		handle_prov_set(line + 9);
	} else if (strncmp(line, "PROV:COMMIT", 11) == 0) {
		handle_prov_commit();
	} else if (strncmp(line, "PROV:STATUS", 11) == 0) {
		handle_prov_status();
	}
	/* Ignore non-PROV lines silently */
}

static void uart_isr(const struct device *dev, void *user_data)
{
	ARG_UNUSED(user_data);

	if (!uart_irq_update(dev)) {
		return;
	}

	while (uart_irq_rx_ready(dev)) {
		uint8_t c;
		int ret = uart_fifo_read(dev, &c, 1);
		if (ret <= 0) {
			break;
		}

		if (c == '\n' || c == '\r') {
			if (rx_pos > 0) {
				rx_buf[rx_pos] = '\0';
				process_line(rx_buf);
				rx_pos = 0;
			}
		} else if (rx_pos < PROV_BUF_SIZE - 1) {
			rx_buf[rx_pos++] = (char)c;
		}
	}
}

void prov_shell_init(void)
{
	uart_dev = DEVICE_DT_GET(DT_CHOSEN(zephyr_console));

	if (!device_is_ready(uart_dev)) {
		LOG_ERR("UART device not ready");
		return;
	}

	/* Set up interrupt-driven RX */
	uart_irq_callback_set(uart_dev, uart_isr);
	uart_irq_rx_enable(uart_dev);

	rx_pos = 0;

	LOG_INF("Provisioning shell initialized (PROV:* protocol)");
}

import { NextResponse } from "next/server";

// GET /api/credentials — Return default credential field definitions
export async function GET() {
  const fields = {
    groups: [
      {
        name: "WiFi",
        fields: [
          { key: "wifi_ssid", label: "WiFi SSID", type: "text", required: true },
          { key: "wifi_password", label: "WiFi Password", type: "password", required: true },
        ],
      },
      {
        name: "MQTT",
        fields: [
          { key: "mqtt_broker", label: "Broker URL", type: "text", required: false },
          { key: "mqtt_user", label: "Username", type: "text", required: false },
          { key: "mqtt_password", label: "Password", type: "password", required: false },
          { key: "mqtt_topic", label: "Base Topic", type: "text", required: false },
        ],
      },
      {
        name: "API Keys",
        fields: [
          { key: "api_key", label: "API Key", type: "password", required: false },
          { key: "api_endpoint", label: "API Endpoint", type: "text", required: false },
        ],
      },
      {
        name: "Device Identity",
        fields: [
          { key: "device_id", label: "Device ID", type: "text", required: false },
          { key: "device_name", label: "Device Name", type: "text", required: false },
        ],
      },
      {
        name: "TLS Certificates",
        fields: [
          { key: "tls_ca_cert", label: "CA Certificate", type: "file", required: false },
          { key: "tls_client_cert", label: "Client Certificate", type: "file", required: false },
          { key: "tls_client_key", label: "Client Private Key", type: "file", required: false },
        ],
      },
    ],
  };

  return NextResponse.json(fields);
}

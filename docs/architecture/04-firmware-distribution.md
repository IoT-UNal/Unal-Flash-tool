# 04 — Firmware Distribution

## GitHub Releases Integration

```
┌──────────────────────────────────────────────────────────────────┐
│  GitHub Repository (GITHUB_REPO)                                  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Releases                                                  │  │
│  │                                                            │  │
│  │  v1.2.0 ─── firmware-esp32.bin                             │  │
│  │         ├── firmware-esp32s3.bin                            │  │
│  │         ├── firmware-esp32c6.bin                            │  │
│  │         └── manifest.json                                  │  │
│  │                                                            │  │
│  │  v1.1.0 ─── firmware-esp32.bin                             │  │
│  │         └── firmware-esp32s3.bin                            │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────┬───────────────────────────────────────────────────┘
               │  GitHub API v3
               ▼
┌──────────────────────────────────────────────────────────────────┐
│  Next.js API Routes                                               │
│                                                                  │
│  GET /api/firmware                                               │
│    └── GET github.com/repos/{owner}/{repo}/releases              │
│        └── Returns: [{ id, tag, name, publishedAt, assets[] }]   │
│                                                                  │
│  GET /api/firmware/{assetId}                                     │
│    └── GET github.com/repos/{owner}/{repo}/releases/assets/{id}  │
│        └── Returns: binary data (application/octet-stream)       │
└──────────────┬───────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────┐
│  FirmwareService (Client-side)                                    │
│                                                                  │
│  listReleases()     → GET /api/firmware                          │
│  downloadBinary(id) → GET /api/firmware/{assetId}                │
│  getManifest()      → parse manifest.json from release           │
│  filterAssetsForChip(assets, chip) → filter by naming convention │
└──────────────────────────────────────────────────────────────────┘
```

## Manifest Format (manifest.json)

```json
{
  "version": "1.2.0",
  "buildDate": "2024-01-15T10:30:00Z",
  "targets": [
    {
      "chip": "esp32",
      "segments": [
        { "name": "bootloader", "offset": "0x1000", "file": "bootloader.bin" },
        { "name": "partition-table", "offset": "0x8000", "file": "partitions.bin" },
        { "name": "application", "offset": "0x10000", "file": "firmware-esp32.bin" }
      ]
    },
    {
      "chip": "esp32s3",
      "segments": [
        { "name": "bootloader", "offset": "0x0", "file": "bootloader-s3.bin" },
        { "name": "partition-table", "offset": "0x8000", "file": "partitions.bin" },
        { "name": "application", "offset": "0x10000", "file": "firmware-esp32s3.bin" }
      ]
    }
  ],
  "credentialFields": [
    { "key": "wifi_ssid", "label": "WiFi SSID", "required": true },
    { "key": "wifi_password", "label": "WiFi Password", "required": true },
    { "key": "mqtt_broker", "label": "MQTT Broker", "required": false }
  ]
}
```

## Asset Naming Convention

```
firmware-{chip}.bin          → Application binary
bootloader-{chip}.bin        → Bootloader binary
partitions.bin               → Partition table (shared)
manifest.json                → Build metadata + field definitions
```

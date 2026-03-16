# 01 — System Overview

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        Browser (Chrome / Edge 89+)                       │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                    UNAL Flash Tool (Next.js 14)                     │ │
│  │                                                                     │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐    │ │
│  │  │  Flash Tool   │  │ Serial Term  │  │  Credential Manager    │    │ │
│  │  │  (esptool-js) │  │  (xterm.js)  │  │  (NVS PROV:* Protocol)│    │ │
│  │  └──────┬───────┘  └──────┬───────┘  └─────────┬──────────────┘    │ │
│  │         │                 │                     │                   │ │
│  │         └─────────────────┼─────────────────────┘                   │ │
│  │                           │                                         │ │
│  │                   ┌───────▼────────┐                                │ │
│  │                   │  Web Serial API │                                │ │
│  │                   │  (navigator.    │                                │ │
│  │                   │   serial)       │                                │ │
│  │                   └───────┬────────┘                                │ │
│  └───────────────────────────┼─────────────────────────────────────────┘ │
│                              │ USB                                       │
└──────────────────────────────┼───────────────────────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │    ESP32 Device      │
                    │  ┌────────────────┐  │
                    │  │  USB-to-UART   │  │
                    │  │  CP2102/CH340  │  │
                    │  └───────┬────────┘  │
                    │          │            │
                    │  ┌───────▼────────┐  │
                    │  │  Bootloader    │  │
                    │  │  (ROM / 2nd)   │  │
                    │  └───────┬────────┘  │
                    │          │            │
                    │  ┌───────▼────────┐  │
                    │  │  Application   │  │
                    │  │  (Zephyr RTOS) │  │
                    │  └────────────────┘  │
                    └─────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                         Server Side (Docker)                             │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │  Next.js API Routes                                              │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐     │    │
│  │  │ /api/firmware │  │ /api/builds  │  │ /api/credentials   │     │    │
│  │  │ (GH Releases)│  │ (GH Actions) │  │ (Field Templates)  │     │    │
│  │  └──────────────┘  └──────────────┘  └────────────────────┘     │    │
│  └──────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Flash Tool | esptool-js + Web Serial | Connect to ESP32 bootloader, flash firmware |
| Serial Terminal | xterm.js + Web Serial | Interactive serial console for debugging |
| Credential Manager | Custom PROV:* protocol | Write WiFi/MQTT/API/TLS creds to NVS |
| Firmware API | Next.js API → GitHub Releases | List, download firmware binaries |
| Build API | Next.js API → GitHub Actions | Trigger Zephyr CI/CD builds |
| Credential API | Next.js API | Serve credential field templates |

## Supported Chips

| Chip | Bootloader Offset | USB Bridge |
|------|-------------------|------------|
| ESP32 | 0x1000 | CP2102, CH340, FTDI |
| ESP32-S3 | 0x0 | Native USB + CP2102 |
| ESP32-C3 | 0x0 | Native USB |
| ESP32-C6 | 0x0 | Native USB |
| ESP32-H2 | 0x0 | Native USB |

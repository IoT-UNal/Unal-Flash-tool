# UNAL Flash Tool — Architecture Documentation

## Overview

This folder contains the architecture documentation for the UNAL Flash Tool, a web platform
for flashing, monitoring, and provisioning ESP32 devices via Web Serial API.

## Documents

| # | Document | Description |
|---|----------|-------------|
| 01 | [System Overview](01-system-overview.md) | High-level architecture and component map |
| 02 | [Web Serial Flow](02-web-serial-flow.md) | USB serial communication pipeline |
| 03 | [Flash Pipeline](03-flash-pipeline.md) | Firmware flashing process with esptool-js |
| 04 | [Firmware Distribution](04-firmware-distribution.md) | GitHub Releases integration |
| 05 | [CI/CD Pipeline](05-cicd-pipeline.md) | Zephyr RTOS build workflow |
| 06 | [Credential Injection](06-credential-injection.md) | NVS runtime + Kconfig build-time strategies |
| 07 | [Frontend Architecture](07-frontend-architecture.md) | Next.js App Router structure |
| 08 | [Deployment](08-deployment.md) | Docker self-hosted deployment |
| 09 | [Security Model](09-security-model.md) | Security considerations |

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS
- **Flash**: esptool-js (Espressif official Web Serial flasher)
- **Terminal**: xterm.js (browser terminal emulator)
- **Build System**: Zephyr RTOS + west tool
- **CI/CD**: GitHub Actions
- **Distribution**: GitHub Releases API
- **Deployment**: Docker (multi-stage, node:20-alpine)

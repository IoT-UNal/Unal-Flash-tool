# 05 — CI/CD Pipeline (Zephyr RTOS)

## Build Workflow

```
┌────────────┐    Push / Tag / Trigger     ┌──────────────────────────┐
│            │ ───────────────────────────► │                          │
│  Developer │                              │  GitHub Actions          │
│  or Web UI │ ◄──────────────────────────  │  (build.yml)             │
│            │    Release with artifacts     │                          │
└────────────┘                              └───────────┬──────────────┘
                                                        │
                    ┌───────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────────────┐
│  GitHub Actions Runner                                            │
│                                                                  │
│  1. Setup Zephyr SDK                                             │
│     ├── Install west tool                                        │
│     ├── west init -m {firmware-repo}                             │
│     └── west update                                              │
│                                                                  │
│  2. Apply Configuration                                          │
│     ├── Base: prj.conf                                           │
│     ├── Board overlay: boards/{chip}.overlay                     │
│     └── Credential overlay: overlay.conf (if provided)           │
│                                                                  │
│  3. Build for each target chip                                   │
│     ├── west build -b esp32_devkitc_wroom -p always              │
│     ├── west build -b esp32s3_devkitm -p always                  │
│     └── west build -b esp32c6_devkitc -p always                  │
│                                                                  │
│  4. Package artifacts                                            │
│     ├── build/zephyr/zephyr.bin → firmware-{chip}.bin            │
│     ├── build/zephyr/merged.bin → merged-{chip}.bin              │
│     └── Generate manifest.json                                   │
│                                                                  │
│  5. Create GitHub Release (on tag push)                          │
│     └── Upload all .bin files + manifest.json                    │
└──────────────────────────────────────────────────────────────────┘
```

## Triggering Builds from the Web

```
Web UI                    Next.js API              GitHub Actions
  │                          │                          │
  │ POST /api/builds         │                          │
  │  { chip: "esp32",        │                          │
  │    workflow: "build.yml",│                          │
  │    overlay: "..." }      │                          │
  │ ─────────────────────►   │                          │
  │                          │ POST /repos/.../         │
  │                          │  actions/workflows/      │
  │                          │  build.yml/dispatches    │
  │                          │ ─────────────────────►   │
  │                          │                          │
  │                          │       204 No Content     │
  │                          │ ◄─────────────────────   │
  │                          │                          │
  │  { success: true }       │                          │
  │ ◄─────────────────────   │       [Build runs...]    │
  │                          │                          │
  │                          │       [Release created]  │
  │                          │                          │
```

## Example build.yml

```yaml
name: Build Zephyr Firmware
on:
  push:
    tags: ['v*']
  workflow_dispatch:
    inputs:
      chip:
        description: 'Target chip'
        required: true
        default: 'esp32'
        type: choice
        options: [esp32, esp32s3, esp32c6]
      overlay:
        description: 'Kconfig overlay content'
        required: false
        type: string

jobs:
  build:
    runs-on: ubuntu-latest
    container: ghcr.io/zephyrproject-rtos/ci:latest
    steps:
      - uses: actions/checkout@v4
      - name: West init
        run: |
          west init -l .
          west update
      - name: Apply overlay
        if: inputs.overlay
        run: echo "${{ inputs.overlay }}" > overlay.conf
      - name: Build
        run: west build -b ${{ inputs.chip }}_devkitc -p always
      - name: Upload
        uses: actions/upload-artifact@v4
        with:
          name: firmware-${{ inputs.chip }}
          path: build/zephyr/zephyr.bin
```

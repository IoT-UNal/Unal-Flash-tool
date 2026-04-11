#!/bin/bash
set -e

# build-ami-firmware.sh — Build AMI LwM2M firmware with optional prj.conf overlay
# Usage: ./build-ami-firmware.sh [overlay.conf] [output-dir]

OVERLAY_FILE="${1:-}"
OUTPUT_DIR="${2:-/output}"
SOURCE_DIR="/workspace/firmware/ami-lwm2m-node"

echo "[build] ======================================"
echo "[build] AMI LwM2M Firmware Builder"
echo "[build] ======================================"
echo "[build] Source: $SOURCE_DIR"
echo "[build] Output: $OUTPUT_DIR"

if [ -n "$OVERLAY_FILE" ] && [ -f "$OVERLAY_FILE" ]; then
    echo "[build] Overlay: $OVERLAY_FILE"
    echo "[build] --- Overlay contents ---"
    cat "$OVERLAY_FILE"
    echo ""
    echo "[build] --- End overlay ---"
    EXTRA_CONF="-DEXTRA_CONF_FILE=$OVERLAY_FILE"
else
    echo "[build] No overlay file — using default prj.conf"
    EXTRA_CONF=""
fi

# Patch prj.conf: remove Kconfig symbols incompatible with Zephyr 4.1.0 / RISC-V
# These live in the submodule's prj.conf and cause fatal warnings:
#   - CONFIG_FAULT_DUMP: ARM-only (ESP32-C6 is RISC-V)
#   - CONFIG_SHELL_BACKEND_SERIAL_TX_RING_BUFFER_SIZE: unmet dependency
#   - CONFIG_LWM2M_MAX_NOTIFIED_NUMERICAL_RES_TRACKED: removed in Zephyr 4.1
echo "[build] Patching prj.conf for Zephyr 4.1.0 compatibility..."
sed -i \
    -e '/^CONFIG_FAULT_DUMP=/d' \
    -e '/^CONFIG_SHELL_BACKEND_SERIAL_TX_RING_BUFFER_SIZE=/d' \
    -e '/^CONFIG_LWM2M_MAX_NOTIFIED_NUMERICAL_RES_TRACKED=/d' \
    "$SOURCE_DIR/prj.conf"

# Fix DTS overlay filename for Zephyr 4.1 qualified board name
# Board xiao_esp32c6/esp32c6 expects overlay named xiao_esp32c6_esp32c6.overlay
# but the repo has xiao_esp32c6_hpcore.overlay (older naming convention)
DTS_OVERLAY="$SOURCE_DIR/boards/xiao_esp32c6_hpcore.overlay"
DTS_TARGET="$SOURCE_DIR/boards/xiao_esp32c6_esp32c6_hpcore.overlay"
if [ -f "$DTS_OVERLAY" ]; then
    echo "[build] Renaming board overlay: xiao_esp32c6_hpcore.overlay -> xiao_esp32c6_esp32c6_hpcore.overlay"
    mv "$DTS_OVERLAY" "$DTS_TARGET"
fi

# Fix OpenThread header include for Zephyr 4.1.0
# Old: #include <openthread.h>  →  New: #include <zephyr/net/openthread.h>
echo "[build] Patching OpenThread includes for Zephyr 4.1.0..."
find "$SOURCE_DIR/src" -name '*.c' -o -name '*.h' | xargs sed -i \
    's|#include <openthread\.h>|#include <zephyr/net/openthread.h>|g'

# Clean previous build
echo "[build] Cleaning previous build..."
rm -rf /workspace/build

# Build firmware
echo "[build] Starting west build..."
cd /zephyrproject

west build -b xiao_esp32c6/esp32c6/hpcore \
    "$SOURCE_DIR" \
    -d /workspace/build \
    ${EXTRA_CONF:+-- $EXTRA_CONF}

# Copy output
echo "[build] Copying output binary..."
mkdir -p "$OUTPUT_DIR"
cp /workspace/build/zephyr/zephyr.bin "$OUTPUT_DIR/zephyr.bin"

BIN_SIZE=$(stat --printf='%s' "$OUTPUT_DIR/zephyr.bin" 2>/dev/null || stat -f%z "$OUTPUT_DIR/zephyr.bin" 2>/dev/null || echo "unknown")
echo "[build] ======================================"
echo "[build] Build complete!"
echo "[build] Binary: $OUTPUT_DIR/zephyr.bin"
echo "[build] Size: $BIN_SIZE bytes"
echo "[build] ======================================"

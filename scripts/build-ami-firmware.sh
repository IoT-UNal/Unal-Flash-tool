#!/bin/bash
set -e

# build-ami-firmware.sh — Build AMI LwM2M firmware with optional prj.conf overlay
# Usage: ./build-ami-firmware.sh [overlay.conf] [output-dir] [board-target]

OVERLAY_FILE="${1:-}"
OUTPUT_DIR="${2:-/output}"
BOARD_TARGET="${3:-${BOARD_TARGET:-xiao_esp32c6/esp32c6/hpcore}}"
SOURCE_DIR="/workspace/firmware/ami-lwm2m-node"

echo "[build] ======================================"
echo "[build] AMI LwM2M Firmware Builder"
echo "[build] ======================================"
echo "[build] Source: $SOURCE_DIR"
echo "[build] Output: $OUTPUT_DIR"
echo "[build] Board:  $BOARD_TARGET"

if [ -n "$OVERLAY_FILE" ] && [ -f "$OVERLAY_FILE" ]; then
    echo "[build] Overlay: $OVERLAY_FILE"
    echo "[build] --- Overlay contents ---"
    cat "$OVERLAY_FILE"
    echo ""
    echo "[build] --- End overlay ---"
    # Only pass .conf files as EXTRA_CONF_FILE; DTS overlays are auto-detected
    # from the boards/ directory by Zephyr's build system.
    if echo "$OVERLAY_FILE" | grep -qE '\.conf$'; then
        EXTRA_CONF="-DEXTRA_CONF_FILE=$OVERLAY_FILE"
    else
        echo "[build] (DTS overlay — will be auto-detected, not passed as EXTRA_CONF_FILE)"
        EXTRA_CONF=""
    fi
else
    echo "[build] No overlay file — using default prj.conf"
    EXTRA_CONF=""
fi

# Patch prj.conf: remove Kconfig symbols incompatible with Zephyr 4.1.0 / RISC-V
echo "[build] Patching prj.conf for Zephyr 4.1.0 compatibility..."
sed -i \
    -e '/^CONFIG_FAULT_DUMP=/d' \
    -e '/^CONFIG_SHELL_BACKEND_SERIAL_TX_RING_BUFFER_SIZE=/d' \
    -e '/^CONFIG_LWM2M_MAX_NOTIFIED_NUMERICAL_RES_TRACKED=/d' \
    "$SOURCE_DIR/prj.conf"

# Fix DTS overlay filenames for Zephyr 4.1+ qualified board names
# Zephyr 4.x expects <board>_<soc>_<variant>.overlay (e.g. xiao_esp32c6_esp32c6_hpcore.overlay)
# Older overlays may use <board>_<variant>.overlay (e.g. xiao_esp32c6_hpcore.overlay)
BOARD_UNDERSCORED=$(echo "$BOARD_TARGET" | tr '/' '_')
EXPECTED_DTS="$SOURCE_DIR/boards/${BOARD_UNDERSCORED}.overlay"

if [ ! -f "$EXPECTED_DTS" ]; then
    # Try old-style naming: strip the SoC qualifier (middle segment)
    BOARD_NAME=$(echo "$BOARD_TARGET" | cut -d'/' -f1)
    VARIANT=$(echo "$BOARD_TARGET" | cut -d'/' -f3)
    OLD_STYLE_DTS="$SOURCE_DIR/boards/${BOARD_NAME}_${VARIANT}.overlay"
    if [ -f "$OLD_STYLE_DTS" ]; then
        echo "[build] Renaming board overlay: $(basename $OLD_STYLE_DTS) -> $(basename $EXPECTED_DTS)"
        cp "$OLD_STYLE_DTS" "$EXPECTED_DTS"
    else
        echo "[build] WARNING: No DTS overlay found for $BOARD_TARGET"
        echo "[build]   Expected: $(basename $EXPECTED_DTS)"
        echo "[build]   Also tried: $(basename ${BOARD_NAME}_${VARIANT}.overlay)"
    fi
else
    echo "[build] Found DTS overlay: $(basename $EXPECTED_DTS)"
fi

# Fix OpenThread header include for Zephyr 4.1.0
echo "[build] Patching OpenThread includes for Zephyr 4.1.0..."
find "$SOURCE_DIR/src" -name '*.c' -o -name '*.h' | xargs sed -i \
    's|#include <openthread\.h>|#include <zephyr/net/openthread.h>|g'

# Clean previous build (rm contents, not the mount point itself)
echo "[build] Cleaning previous build..."
rm -rf /workspace/build/* 2>/dev/null || true

# Build firmware
echo "[build] Starting west build for $BOARD_TARGET..."
cd /zephyrproject

west build -b "$BOARD_TARGET" \
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
echo "[build] Board:  $BOARD_TARGET"
echo "[build] Binary: $OUTPUT_DIR/zephyr.bin"
echo "[build] Size: $BIN_SIZE bytes"
echo "[build] ======================================"

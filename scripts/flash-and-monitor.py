#!/usr/bin/env python3
"""
Flash AMI LwM2M firmware to ESP32-C6 and monitor serial output.

Usage:
  python scripts/flash-and-monitor.py [--port COMx] [--monitor-only] [--build-dir DIR]

The script will:
  - Flash the firmware at 460800 baud (auto-enters bootloader via DTR/RTS)
  - Reset the device using LP_AON software reset (no physical power cycle needed!)
  - Monitor serial output at 115200 baud

The LP_AON reset technique bypasses the ESP32-C6 USB-Serial/JTAG download mode
trap by clearing force_download_boot, setting usb_reset_disable, and triggering
hpsys_sw_reset — producing a non-USB reset that boots from flash.
"""

import sys
import os
import time
import struct
import subprocess
import argparse
import tempfile

BAUD_FLASH = 460800
BAUD_MONITOR = 115200
CHIP = "esp32c6"

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)


def find_firmware(build_dir=None):
    """Find the firmware binary in build or tmp directories."""
    candidates = []
    if build_dir:
        candidates.append(os.path.join(build_dir, "zephyr.bin"))
    candidates.extend([
        os.path.join(PROJECT_DIR, "build", "zephyr.bin"),
        os.path.join(PROJECT_DIR, "tmp", "ami-lwm2m-node-debug.bin"),
        os.path.join(PROJECT_DIR, "tmp", "ami-lwm2m-node.bin"),
    ])
    for path in candidates:
        if os.path.isfile(path):
            size = os.path.getsize(path)
            print(f"[+] Found firmware: {path} ({size:,} bytes)")
            return path
    print("[-] No firmware binary found!")
    sys.exit(1)


def build_lpaon_reset_image():
    """
    Build a tiny RISC-V binary that resets ESP32-C6 via LP_AON registers.

    This escapes the USB-Serial/JTAG download mode trap by:
    1. Clearing force_download_boot (LP_AON_SYS_CFG bit 30)
    2. Setting usb_reset_disable (LP_AON_USB bit 31)
    3. Triggering hpsys_sw_reset (LP_AON_SYS_CFG bit 31)
    """
    def _lui(rd, imm20):
        return (imm20 << 12) | (rd << 7) | 0x37

    def _addi(rd, rs1, imm12):
        return ((imm12 & 0xFFF) << 20) | (rs1 << 15) | (0 << 12) | (rd << 7) | 0x13

    def _sw(rs2, rs1, offset):
        return (((offset >> 5) & 0x7F) << 25) | (rs2 << 20) | (rs1 << 15) | \
               (2 << 12) | ((offset & 0x1F) << 7) | 0x23

    def _jal(rd, offset):
        o = offset & 0x1FFFFF
        return (((o >> 20) & 1) << 31) | (((o >> 1) & 0x3FF) << 21) | \
               (((o >> 11) & 1) << 20) | (((o >> 12) & 0xFF) << 12) | (rd << 7) | 0x6F

    t0, t1, zero = 5, 6, 0  # register numbers
    # LP_AON offsets: sys_cfg=0x34, usb=0x44
    code = [
        _lui(t0, 0x600B1),          # t0 = 0x600B1000 (LP_AON base)
        _addi(t1, zero, 0),         # t1 = 0
        _sw(t1, t0, 0x34),          # Clear force_download_boot in SYS_CFG
        _lui(t1, 0x80000),          # t1 = 0x80000000
        _sw(t1, t0, 0x44),          # Set usb_reset_disable in USB reg
        _lui(t1, 0x80000),          # t1 = 0x80000000
        _sw(t1, t0, 0x34),          # Trigger hpsys_sw_reset in SYS_CFG
        _jal(zero, 0),              # Infinite loop (reset fires before this matters)
    ]
    code_bytes = b"".join(struct.pack("<I", instr) for instr in code)

    # ESP firmware image format
    entry = 0x40800000
    header = struct.pack("<BBBBI", 0xE9, 1, 0, 0x0F, entry)
    ext = struct.pack("<BBBBHBHHBBBBB", 0xEE, 0, 0, 0, 0x000D, 0, 0, 0xFFFF, 0, 0, 0, 0, 0)
    seg = struct.pack("<II", 0x40800000, len(code_bytes))
    image = header + ext + seg + code_bytes

    checksum = 0xEF
    for b in code_bytes:
        checksum ^= b
    pad = (16 - ((len(image) + 1) % 16)) % 16
    image += b"\x00" * pad + bytes([checksum & 0xFF])
    return image


def flash(port, bin_path):
    """Flash firmware to ESP32-C6."""
    print(f"\n{'='*60}")
    print(f"  FLASHING {CHIP.upper()} on {port}")
    print(f"{'='*60}\n")

    cmd = [
        sys.executable, "-m", "esptool",
        "--port", port,
        "--chip", CHIP,
        "--baud", str(BAUD_FLASH),
        "--before", "default-reset",
        "--after", "no-reset",
        "write-flash",
        "--flash-mode", "dio",
        "--flash-freq", "80m",
        "--flash-size", "4MB",
        "0x0", bin_path,
    ]

    result = subprocess.run(cmd)
    if result.returncode != 0:
        print("\n[-] Flash FAILED!")
        sys.exit(1)

    print("\n[+] Flash SUCCESS!")


def software_reset(port):
    """
    Reset ESP32-C6 via LP_AON registers to escape USB download mode.

    After esptool flashes via USB-Serial/JTAG, a hard reset always enters
    download mode (rst:0x15 USB_UART_HPSYS). This function loads a tiny
    RISC-V program that triggers a software reset through the LP_AON domain,
    which produces a non-USB reset cause and boots from flash.
    """
    print(f"\n[*] Triggering LP_AON software reset on {port}...")

    reset_image = build_lpaon_reset_image()
    with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as f:
        f.write(reset_image)
        reset_bin = f.name

    try:
        cmd = [
            sys.executable, "-m", "esptool",
            "--chip", CHIP,
            "--port", port,
            "--before", "no-reset",
            "--no-stub",
            "load-ram", reset_bin,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        if result.returncode != 0:
            print(f"[-] load-ram failed: {result.stderr}")
            print("    You may need to physically power-cycle the device.")
            return False
        print("[+] LP_AON reset triggered! Device should boot from flash in ~3s...")
        time.sleep(3)
        return True
    except subprocess.TimeoutExpired:
        print("[-] load-ram timed out")
        return False
    finally:
        os.unlink(reset_bin)


def monitor(port):
    """Monitor serial output."""
    import serial

    print(f"\n{'='*60}")
    print(f"  SERIAL MONITOR — {port} @ {BAUD_MONITOR} baud")
    print(f"  Press Ctrl+C to exit")
    print(f"{'='*60}\n")

    for attempt in range(3):
        try:
            ser = serial.Serial(port, BAUD_MONITOR, timeout=0.1)
            break
        except Exception as e:
            if attempt < 2:
                print(f"[!] Cannot open {port}: {e}. Retrying in 3s...")
                time.sleep(3)
            else:
                print(f"[-] Cannot open {port}: {e}")
                sys.exit(1)

    print(f"[+] Port {port} opened. Waiting for output...\n")

    try:
        start = time.time()
        got_data = False
        while True:
            data = ser.read(ser.in_waiting or 1)
            if data:
                got_data = True
                sys.stdout.write(data.decode("utf-8", errors="replace"))
                sys.stdout.flush()
            elif not got_data and time.time() - start > 30:
                print("\n[!] No data in 30s. Try: python flash-and-monitor.py --reset-only")
    except KeyboardInterrupt:
        print("\n\n[+] Monitor stopped.")
    finally:
        ser.close()


def main():
    parser = argparse.ArgumentParser(description="Flash & monitor ESP32-C6 AMI firmware")
    parser.add_argument("--port", default="COM8", help="Serial port (default: COM8)")
    parser.add_argument("--build-dir", help="Build output directory")
    parser.add_argument("--monitor-only", action="store_true", help="Skip flash, just monitor")
    parser.add_argument("--reset-only", action="store_true", help="Only perform LP_AON reset")
    parser.add_argument("--no-reset", action="store_true", help="Skip LP_AON reset after flash")
    args = parser.parse_args()

    if args.reset_only:
        software_reset(args.port)
        monitor(args.port)
    elif args.monitor_only:
        monitor(args.port)
    else:
        bin_path = find_firmware(args.build_dir)
        flash(args.port, bin_path)
        if not args.no_reset:
            software_reset(args.port)
        monitor(args.port)


if __name__ == "__main__":
    main()

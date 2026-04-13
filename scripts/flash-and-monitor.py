#!/usr/bin/env python3
"""
Flash AMI LwM2M firmware to ESP32-C6 Super Mini and monitor serial output.

Usage:
  1. Hold BOOT button on ESP32-C6
  2. Press and release RESET (or unplug/replug USB while holding BOOT)
  3. Release BOOT
  4. Run: python scripts/flash-and-monitor.py

The script will:
  - Flash the firmware at 460800 baud
  - Reset the device
  - Monitor serial output at 115200 baud
"""

import sys
import os
import time
import subprocess

PORT = "COM8"
BAUD_FLASH = 460800
BAUD_MONITOR = 115200
CHIP = "esp32c6"

# Find firmware binary
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
BIN_CANDIDATES = [
    os.path.join(PROJECT_DIR, "tmp", "ami-lwm2m-node-debug.bin"),
    os.path.join(PROJECT_DIR, "tmp", "ami-lwm2m-node.bin"),
]

def find_firmware():
    for path in BIN_CANDIDATES:
        if os.path.isfile(path):
            size = os.path.getsize(path)
            print(f"[+] Found firmware: {path} ({size:,} bytes)")
            return path
    print("[-] No firmware binary found in tmp/")
    sys.exit(1)

def flash(bin_path):
    print(f"\n{'='*60}")
    print(f"  FLASHING {CHIP.upper()} on {PORT}")
    print(f"{'='*60}\n")
    
    cmd = [
        sys.executable, "-m", "esptool",
        "--port", PORT,
        "--chip", CHIP,
        "--baud", str(BAUD_FLASH),
        "write-flash",
        "--flash_mode", "dio",
        "--flash_freq", "40m",
        "--flash_size", "4MB",
        "0x0", bin_path,
    ]
    
    result = subprocess.run(cmd)
    if result.returncode != 0:
        print("\n[-] Flash FAILED!")
        print("    Make sure the device is in bootloader mode:")
        print("    1. Hold BOOT button")
        print("    2. Press+release RESET")
        print("    3. Release BOOT")
        print("    4. Run this script again")
        sys.exit(1)
    
    print("\n[+] Flash SUCCESS! Monitoring serial output...\n")

def monitor():
    import serial
    
    print(f"{'='*60}")
    print(f"  SERIAL MONITOR — {PORT} @ {BAUD_MONITOR} baud")
    print(f"  Press Ctrl+C to exit")
    print(f"{'='*60}\n")
    
    time.sleep(1)  # Wait for device to reset
    
    try:
        ser = serial.Serial(PORT, BAUD_MONITOR, timeout=0.1)
    except Exception as e:
        print(f"[-] Cannot open {PORT}: {e}")
        print("    The device may be resetting. Retrying in 3s...")
        time.sleep(3)
        try:
            ser = serial.Serial(PORT, BAUD_MONITOR, timeout=0.1)
        except Exception as e2:
            print(f"[-] Still cannot open {PORT}: {e2}")
            sys.exit(1)
    
    print(f"[+] Port {PORT} opened. Waiting for output...\n")
    
    try:
        start = time.time()
        got_data = False
        while True:
            data = ser.read(ser.in_waiting or 1)
            if data:
                got_data = True
                text = data.decode("utf-8", errors="replace")
                sys.stdout.write(text)
                sys.stdout.flush()
            elif not got_data and time.time() - start > 30:
                print("\n[!] No data received in 30s. Device may be hung.")
                print("    Try power cycling (unplug/replug USB).")
    except KeyboardInterrupt:
        print("\n\n[+] Monitor stopped.")
    finally:
        ser.close()

if __name__ == "__main__":
    if "--monitor-only" in sys.argv:
        monitor()
    else:
        bin_path = find_firmware()
        flash(bin_path)
        monitor()

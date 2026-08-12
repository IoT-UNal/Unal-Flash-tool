#!/usr/bin/env python3
"""
Direct serial test for PROV:* provisioning protocol.
Bypasses browser/Web Serial to isolate firmware vs app issues.

Usage: python scripts/test_prov_serial.py [COM_PORT] [BAUD_RATE]
"""

import sys
import time
import serial
from serial.tools.list_ports import comports

# --- Config ---
DEFAULT_BAUD = 115200
TIMEOUT = 5  # seconds to wait for response


def find_esp32_port():
    """Auto-detect ESP32 port by VID."""
    for p in comports():
        if p.vid == 0x303A:  # Espressif VID
            return p.device
        if p.vid == 0x303A or (p.vid and p.vid == 12346):  # decimal 0x303A = 12346
            return p.device
    return None


def test_serial(port, baud):
    print(f"\n{'='*50}")
    print(f"  PROV:* Serial Protocol Test")
    print(f"  Port: {port} @ {baud} baud")
    print(f"{'='*50}\n")

    try:
        ser = serial.Serial(port, baud, timeout=1)
    except serial.SerialException as e:
        print(f"[FAIL] Cannot open {port}: {e}")
        print("       Close the browser tab or disconnect Web Serial first.")
        return False

    # --- Test 1: Listen for boot messages ---
    print("[TEST 1] Listening for any data (3 seconds)...")
    ser.reset_input_buffer()
    
    # Toggle DTR/RTS to reset the device
    print("         Resetting device via DTR/RTS...")
    ser.dtr = False
    ser.rts = True
    time.sleep(0.1)
    ser.dtr = True
    ser.rts = False
    time.sleep(0.05)
    ser.dtr = False
    ser.rts = False

    boot_data = b""
    start = time.time()
    while time.time() - start < 3:
        chunk = ser.read(256)
        if chunk:
            boot_data += chunk
            
    if boot_data:
        print(f"[OK]   Received {len(boot_data)} bytes of boot data:")
        try:
            text = boot_data.decode("utf-8", errors="replace")
            for line in text.splitlines():
                print(f"         | {line}")
        except Exception:
            print(f"         (raw hex): {boot_data.hex()}")
    else:
        print("[WARN] No boot data received. Device may not be outputting on this port.")
        print("       Possible causes:")
        print("       - Wrong baud rate")
        print("       - Console UART is not routed to USB (check devicetree)")
        print("       - Device is stuck / not booting")

    # --- Test 2: Send PROV:STATUS (read-only, safe) ---
    print(f"\n[TEST 2] Sending PROV:STATUS...")
    ser.reset_input_buffer()
    time.sleep(0.2)  # small delay
    
    cmd = b"PROV:STATUS\n"
    print(f"         TX: {cmd!r}")
    ser.write(cmd)
    ser.flush()

    response = b""
    start = time.time()
    while time.time() - start < TIMEOUT:
        chunk = ser.read(256)
        if chunk:
            response += chunk
            # Check if we got a complete PROV: response
            if b"PROV:" in response and b"\n" in response[response.index(b"PROV:"):]:
                break

    if response:
        text = response.decode("utf-8", errors="replace")
        print(f"[OK]   Response ({len(response)} bytes):")
        for line in text.splitlines():
            print(f"         | {line}")
        if "PROV:OK" in text:
            print("[PASS] Device responds to PROV protocol!")
        elif "PROV:ERR" in text:
            print("[PASS] Device responds (with error, but protocol works)")
        else:
            print("[WARN] Got data but no PROV: response found")
    else:
        print("[FAIL] No response to PROV:STATUS")

    # --- Test 3: Send PROV:START ---
    print(f"\n[TEST 3] Sending PROV:START...")
    ser.reset_input_buffer()
    time.sleep(0.2)

    cmd = b"PROV:START\n"
    print(f"         TX: {cmd!r}")
    ser.write(cmd)
    ser.flush()

    response = b""
    start = time.time()
    while time.time() - start < TIMEOUT:
        chunk = ser.read(256)
        if chunk:
            response += chunk
            if b"PROV:" in response and b"\n" in response[response.index(b"PROV:"):]:
                break

    if response:
        text = response.decode("utf-8", errors="replace")
        print(f"[OK]   Response ({len(response)} bytes):")
        for line in text.splitlines():
            print(f"         | {line}")
        if "PROV:OK:START" in text:
            print("[PASS] PROV:START works!")
        elif "PROV:" in text:
            print("[PASS] Device responded (check message above)")
        else:
            print("[WARN] Got data but unexpected format")
    else:
        print("[FAIL] No response to PROV:START")

    # --- Test 4: Raw byte echo test ---
    print(f"\n[TEST 4] Raw loopback check — sending 'hello\\n'...")
    ser.reset_input_buffer()
    time.sleep(0.2)
    ser.write(b"hello\n")
    ser.flush()
    
    response = b""
    start = time.time()
    while time.time() - start < 2:
        chunk = ser.read(256)
        if chunk:
            response += chunk

    if response:
        text = response.decode("utf-8", errors="replace")
        print(f"         Got: {text.strip()!r}")
    else:
        print("         No echo (expected — firmware ignores non-PROV lines)")

    ser.close()
    print(f"\n{'='*50}")
    print(f"  Test complete")
    print(f"{'='*50}\n")
    return True


if __name__ == "__main__":
    port = sys.argv[1] if len(sys.argv) > 1 else None
    baud = int(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_BAUD

    if not port:
        port = find_esp32_port()
        if not port:
            print("[ERROR] No ESP32 port found. Available ports:")
            for p in comports():
                print(f"  {p.device}: {p.description}")
            sys.exit(1)

    test_serial(port, baud)

"""
Force system reset via JTAG WDT, then immediately release JTAG
so USB can re-enumerate, then capture boot output.
"""
import socket
import serial
import time
import sys
import subprocess
import os

OCD_BIN = os.path.join(os.environ["TEMP"], "openocd-esp32", "openocd-esp32", "bin", "openocd.exe")
OCD_SCRIPTS = os.path.join(os.environ["TEMP"], "openocd-esp32", "openocd-esp32", "share", "openocd", "scripts")

def run_ocd_cmds(cmds):
    """Run OpenOCD with a list of commands and exit immediately."""
    full_cmds = ["init"]
    full_cmds.extend(cmds)
    full_cmds.append("shutdown")
    
    cmd_str = "; ".join(full_cmds)
    result = subprocess.run(
        [OCD_BIN, "-s", OCD_SCRIPTS, "-f", "board/esp32c6-builtin.cfg", "-c", cmd_str],
        capture_output=True, text=True, timeout=15
    )
    return result.stdout + result.stderr

print("=== Step 1: Trigger LP_WDT system reset via JTAG ===")
# Use LP_WDT to trigger a full system reset (resets everything including USB PHY)
# LP_WDT_RWDT_CONFIG0 = 0x600B001C, LP_WDT_RWDT_CONFIG1 = 0x600B0020
# Write protection key = 0x50D83AA1
# Set SYS_RESET_LENGTH and enable WDT with very short timeout
output = run_ocd_cmds([
    "halt",
    # Clear any force_download_boot
    "mww 0x600B1034 0x00000000",
    # Enable LP_WDT write access
    "mww 0x600B001C 0x50D83AA1",
    # Configure WDT for immediate system reset: 
    # RTC_CNTL_WDT_SYS_RESET_LENGTH=1, RTC_CNTL_WDT_STG0=3 (system reset), timeout=1
    "mww 0x600B0024 0x00070000",  # stage0 = system reset
    "mww 0x600B0028 0x00000001",  # very short timeout
    "mww 0x600B001C 0x80000000",  # enable WDT (bit 31)
])
print(f"  JTAG output: {'OK' if 'shutdown' not in output.lower() or 'error' not in output.lower() else output[-200:]}")

print("=== Step 2: Waiting for USB re-enumeration (15s)... ===")
# The WDT should trigger a full system reset, USB will disconnect and reconnect
time.sleep(3)

# Check if COM8 disappeared
for i in range(20):
    try:
        p = serial.Serial("COM8", 115200, timeout=0.1)
        p.close()
        if i > 2:
            print(f"  COM8 reappeared after {i}s!")
            break
        # Port still there from before reset
        time.sleep(1)
    except:
        print(f"  COM8 disconnected at {i}s (good - USB resetting)")
        # Wait for it to come back
        for j in range(30):
            time.sleep(1)
            try:
                p = serial.Serial("COM8", 115200, timeout=0.1)
                p.close()
                print(f"  COM8 reconnected after {i+j+1}s!")
                break
            except:
                if j % 5 == 0:
                    print(f"    Still waiting... ({j}s)")
        break
else:
    print("  COM8 never disconnected - WDT may not have triggered")

time.sleep(2)

print("=== Step 3: Capturing serial output (90s)... ===")
try:
    port = serial.Serial("COM8", 115200, timeout=0.5)
    t0 = time.time()
    total = 0
    lines = []
    while time.time() - t0 < 90:
        data = port.read(4096)
        if data:
            total += len(data)
            text = data.decode("utf-8", errors="replace")
            sys.stdout.write(text)
            sys.stdout.flush()
            lines.append(text)
    
    port.close()
    full = "".join(lines)
    print(f"\n=== Total: {total} bytes in 90s ===")
    
    for marker in ["AMI ALIVE", "Thread attached", "LwM2M", "router", "leader", "child", "registered"]:
        if marker.lower() in full.lower():
            print(f'  FOUND: "{marker}"')

except Exception as e:
    print(f"Serial error: {e}")

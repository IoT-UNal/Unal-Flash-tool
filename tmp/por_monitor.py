"""Wait for USB replug (POR), capture boot, configure Thread, monitor join."""
import serial, time, sys, re

DATASET_HEX = (
    "0e0800000000000100004a0300000f35060004001fffe00208"
    "1a2578dd6ee3573b0708fdf5bffd0bd6ef74051054edebead"
    "64405b3e17193646c2942285010223ed0410bb7e7aee56236"
    "ea96ac8dc65bba183510c0402a0f7f8030b554e414c2d5468"
    "726561640003000019"
)
# Fix: the dataset hex must be exact from OTBR
DATASET_HEX = "0e0800000000000100004a0300000f35060004001fffe002081a2578dd6ee3573b0708fdf5bffd0bd6ef7405105edebead64405b3e17193646c2942285010223ed0410bb7e7aee56236ea96ac8dc65bba183510c0402a0f7f8030b554e414c2d5468726561640003000019"

print("=" * 60)
print("WAITING FOR USB REPLUG (Power-On Reset)")
print("Please physically disconnect and reconnect the ESP32-C6")
print("=" * 60)

# Wait for COM8 to appear
port = None
for attempt in range(120):
    try:
        port = serial.Serial("COM8", 115200, timeout=2)
        print(f"\nCOM8 connected! Capturing boot...")
        break
    except Exception:
        if attempt % 10 == 0:
            print(f"  Waiting... ({attempt}s)")
        time.sleep(1)

if not port:
    print("ERROR: COM8 never appeared after 120s")
    sys.exit(1)

# Capture boot output for 30s
print()
boot_text = ""
start = time.time()
while time.time() - start < 30:
    data = port.read(4096)
    if data:
        text = data.decode("utf-8", errors="replace")
        sys.stdout.write(text)
        sys.stdout.flush()
        boot_text += text

# Check reset type
m = re.search(r"rst:(0x[0-9a-f]+)", boot_text)
if m:
    rst = m.group(1)
    if rst == "0x1":
        print("\n*** POWER-ON RESET CONFIRMED (rst:0x1) ***")
    elif rst == "0xc":
        print("\n*** WARNING: SW_CPU reset (rst:0xc) - not a full POR ***")
    else:
        print(f"\n*** Reset type: {rst} ***")

# Check if MAC init error appears
if "ieee802154_mac_init" in boot_text and "failed" in boot_text:
    print("*** CRITICAL: MAC init still failing! ***")
else:
    print("*** Good: No MAC init errors in boot log ***")


def cmd(c, wait=1.5):
    port.read(4096)  # flush
    port.write((c + "\r\n").encode())
    time.sleep(wait)
    data = port.read(8192)
    text = data.decode("utf-8", errors="replace").strip() if data else "(no response)"
    lines = [l for l in text.split("\n") if not l.strip().startswith("[")]
    return "\n".join(lines).strip()


# Check dataset (should persist from NVS)
print("\n=== Checking Thread State ===")
resp = cmd("ot dataset active")
print("Dataset:")
print(resp)

if "UNAL-Thread" not in resp:
    print("\nRe-applying OTBR dataset...")
    print(cmd(f"ot dataset set active {DATASET_HEX}"))

# Check if Thread auto-started or needs manual start
state = cmd("ot state")
print(f"\nCurrent state: {state}")

if "disabled" in state:
    print("Starting Thread manually...")
    print(cmd("ot ifconfig up"))
    print(cmd("ot thread start"))

# Monitor for join (120s)
print("\n=== Monitoring Thread join (120s) ===")
prev_rx = 0
joined = False
for i in range(24):
    time.sleep(5)
    state_raw = cmd("ot state", wait=0.5)
    state = "unknown"
    for line in state_raw.split("\n"):
        line = line.strip()
        if line in ["disabled", "detached", "child", "router", "leader"]:
            state = line
            break

    counters = cmd("ot counters mac", wait=0.5)
    rx_total = tx_total = 0
    for l in counters.split("\n"):
        l = l.strip()
        if l.startswith("RxTotal:"):
            try:
                rx_total = int(l.split(":")[1].strip())
            except ValueError:
                pass
        elif l.startswith("TxTotal:"):
            try:
                tx_total = int(l.split(":")[1].strip())
            except ValueError:
                pass

    elapsed = (i + 1) * 5
    rx_delta = rx_total - prev_rx
    prev_rx = rx_total
    print(f"  [{elapsed:3d}s] state={state:10s} Rx={rx_total:4d}(+{rx_delta:2d}) Tx={tx_total:4d}")

    if state in ["child", "router"]:
        joined = True
        print("  *** JOINED THE OTBR NETWORK! ***")
        print()
        print(cmd("ot neighbor table"))
        print()
        print(cmd("ot ipaddr"))
        break

# Final status
print("\n=== Final Status ===")
print(cmd("ot state"))
print(cmd("ot counters mac"))
print(cmd("ot neighbor table"))

if joined:
    print("\n=== SUCCESS: Node joined Thread network ===")
else:
    print("\n=== Node did NOT join. Check radio/distance. ===")

port.close()

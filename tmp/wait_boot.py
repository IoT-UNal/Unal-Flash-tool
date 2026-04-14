"""Wait for ESP32-C6 replug and capture boot output."""
import serial, time, sys

print("Waiting for COM8 to appear (unplug/replug the device)...")
for i in range(120):
    try:
        port = serial.Serial("COM8", 115200, timeout=0.5)
        port.close()
        print(f"COM8 detected after {i}s!")
        break
    except:
        time.sleep(1)
        if i % 10 == 0 and i > 0:
            print(f"  Still waiting... ({i}s)")
else:
    print("Timeout waiting for COM8")
    sys.exit(1)

time.sleep(1)

port = serial.Serial("COM8", 115200, timeout=0.5)
print("=== Capturing boot output (120s)... ===")
t0 = time.time()
total = 0
lines_collected = []
while time.time() - t0 < 120:
    data = port.read(4096)
    if data:
        total += len(data)
        text = data.decode("utf-8", errors="replace")
        sys.stdout.write(text)
        sys.stdout.flush()
        lines_collected.append(text)

port.close()
full = "".join(lines_collected)
print(f"\n=== Total: {total} bytes in 120s ===")

for marker in ["AMI ALIVE", "Thread attached", "LwM2M", "router", "leader", "child", "registered", "coap"]:
    if marker.lower() in full.lower():
        print(f'  FOUND: "{marker}"')

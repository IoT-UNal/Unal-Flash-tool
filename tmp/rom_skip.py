"""
ROM Delay Loop Auto-Skip via OpenOCD Hardware Breakpoints.

Loads firmware segments to SRAM, sets HW breakpoint at ROM delay loop,
and automatically skips every delay call so the firmware can boot.
"""
import socket
import time
import re
import sys
import os

BASE = r"c:\Users\jsgir\Documents\UNAL\Unal-Flash-tool.worktrees\copilot-worktree-2026-04-11T03-51-46"
SEG0 = os.path.join(BASE, "tmp", "seg0.bin").replace("\\", "/")
SEG1 = os.path.join(BASE, "tmp", "seg1.bin").replace("\\", "/")

DELAY_LOOP_ADDR = 0x40017606  # BLTU instruction in ROM delay

def ocd_cmd(sock, cmd, timeout=3.0):
    sock.sendall((cmd + "\r\n").encode())
    data = b""
    sock.settimeout(timeout)
    deadline = time.time() + timeout
    try:
        while time.time() < deadline:
            chunk = sock.recv(4096)
            if not chunk:
                break
            data += chunk
            if b"> " in chunk or b"\n> " in chunk:
                break
    except socket.timeout:
        pass
    return data.decode("utf-8", errors="replace").strip()

def get_pc(sock):
    r = ocd_cmd(sock, "reg pc", timeout=1)
    m = re.search(r"0x([0-9a-fA-F]+)", r)
    return int(m.group(1), 16) if m else None

def main():
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.connect(("localhost", 4444))
    time.sleep(0.5)
    sock.recv(4096)  # banner

    # Step 1: Halt and check current state
    print("1. Halting CPU...")
    ocd_cmd(sock, "halt")
    pc = get_pc(sock)
    print(f"   Current PC=0x{pc:08X}" if pc else "   Could not read PC")

    # Step 2: Load firmware segments
    print("2. Loading firmware segments to SRAM...")
    r = ocd_cmd(sock, f"load_image {SEG0} 0x40800000 bin", timeout=10)
    ok0 = "bytes written" in r
    print(f"   Seg0 (0x40800000): {'OK' if ok0 else 'FAIL'}")
    if not ok0:
        print(f"   {r}")

    r = ocd_cmd(sock, f"load_image {SEG1} 0x4080E220 bin", timeout=10)
    ok1 = "bytes written" in r
    print(f"   Seg1 (0x4080E220): {'OK' if ok1 else 'FAIL'}")
    if not ok1:
        print(f"   {r}")

    if not (ok0 and ok1):
        print("FAILED to load segments. Aborting.")
        sock.close()
        return

    # Step 3: Set HW breakpoint at delay BLTU
    print(f"3. Setting HW breakpoint at 0x{DELAY_LOOP_ADDR:08X}...")
    ocd_cmd(sock, f"bp 0x{DELAY_LOOP_ADDR:08X} 2 hw")

    # Step 4: Jump to firmware entry
    entry = 0x40803DBA
    print(f"4. Setting PC to entry point 0x{entry:08X} and resuming...")
    ocd_cmd(sock, f"reg pc 0x{entry:08X}")
    ocd_cmd(sock, "resume")

    # Step 5: Auto-skip loop
    print("5. Auto-skipping ROM delay loops...")
    print("   (Ctrl+C to abort)")
    t_start = time.time()
    skip_count = 0
    app_booted = False

    try:
        for i in range(500):
            # Wait for halt
            r = ocd_cmd(sock, "wait_halt 1000", timeout=3)

            pc = get_pc(sock)
            if pc is None:
                ocd_cmd(sock, "resume")
                continue

            elapsed = time.time() - t_start

            # Check if we're in app code
            if (0x40800000 <= pc < 0x40900000) or (0x42000000 <= pc < 0x43000000):
                print(f"\n   [{elapsed:.1f}s] PC=0x{pc:08X} — APPLICATION CODE!")
                app_booted = True
                break

            if 0x40017600 <= pc <= 0x40017610:
                # In delay loop — set a0=0 to make BLTU fall through
                ocd_cmd(sock, "reg a0 0x00000000", timeout=0.5)
                ocd_cmd(sock, "step", timeout=1)
                ocd_cmd(sock, "resume", timeout=0.5)
                skip_count += 1
                if skip_count % 20 == 0:
                    print(f"   [{elapsed:.1f}s] Skipped {skip_count} delays so far")
            else:
                # Different ROM address
                print(f"   [{elapsed:.1f}s] PC=0x{pc:08X} (non-delay ROM)")
                ocd_cmd(sock, "resume")

    except KeyboardInterrupt:
        print("\n   Interrupted by user")

    # Cleanup
    print(f"\n--- Skipped {skip_count} ROM delay calls in {time.time()-t_start:.1f}s ---")

    ocd_cmd(sock, "rbp all")
    if app_booted:
        ocd_cmd(sock, "resume")
        print("=== FIRMWARE IS RUNNING! ===")
    else:
        ocd_cmd(sock, "halt")
        pc = get_pc(sock)
        print(f"Final PC=0x{pc:08X}" if pc else "Could not read PC")
        ocd_cmd(sock, "resume")

    sock.close()

if __name__ == "__main__":
    main()

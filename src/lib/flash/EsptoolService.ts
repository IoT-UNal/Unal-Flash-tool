/**
 * Server-side ESP32 flash service using esptool.py CLI.
 * Bypasses Web Serial API — runs directly on the server via child_process.
 */
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, unlink } from "fs/promises";
import path from "path";
import os from "os";

const execFileAsync = promisify(execFile);

const PORT_PATTERN = /^(COM\d{1,3}|\/dev\/tty[A-Za-z0-9_./-]+)$/;
const OFFSET_PATTERN = /^0x[0-9a-fA-F]{1,8}$/;
const VALID_CHIPS = [
  "auto",
  "esp32",
  "esp32s2",
  "esp32s3",
  "esp32c2",
  "esp32c3",
  "esp32c6",
  "esp32h2",
];

function validatePort(port: string): void {
  if (!PORT_PATTERN.test(port)) {
    throw new Error(`Invalid port format: ${port}`);
  }
}

function validateOffset(offset: string): void {
  if (!OFFSET_PATTERN.test(offset)) {
    throw new Error(`Invalid offset format: ${offset}`);
  }
}

function normalizeChipArg(chip: string): string {
  const normalized = chip.split(/[\s(]/)[0].toLowerCase().replace(/-/g, "");
  return VALID_CHIPS.includes(normalized) ? normalized : "auto";
}

let cachedPython: string | null = null;

async function getPython(): Promise<string> {
  if (cachedPython) return cachedPython;

  const candidates = ["python", "python3", "py"];
  for (const cmd of candidates) {
    try {
      await execFileAsync(cmd, ["--version"], {
        timeout: 5000,
        windowsHide: true,
      });
      cachedPython = cmd;
      return cmd;
    } catch {
      // try next
    }
  }
  throw new Error("Python not found. Install Python and ensure it is on PATH.");
}

export interface PortInfo {
  port: string;
  description: string;
  hwid: string;
}

export interface ChipDetection {
  chip: string;
  description: string;
  features: string;
  mac: string;
  crystal: string;
  flashSize: string;
  logs: string[];
}

export interface FlashResult {
  success: boolean;
  logs: string[];
}

export async function listPorts(): Promise<PortInfo[]> {
  const python = await getPython();
  const script = [
    "import json",
    "from serial.tools.list_ports import comports",
    'print(json.dumps([{"port":p.device,"description":p.description or "","hwid":p.hwid or ""} for p in comports()]))',
  ].join(";");

  const { stdout } = await execFileAsync(python, ["-c", script], {
    timeout: 10000,
    windowsHide: true,
  });
  return JSON.parse(stdout.trim());
}

export async function detectChip(port: string): Promise<ChipDetection> {
  validatePort(port);
  const python = await getPython();

  const { stdout, stderr } = await execFileAsync(
    python,
    ["-m", "esptool", "--port", port, "chip_id"],
    { timeout: 30000, windowsHide: true }
  );

  const output = stdout + "\n" + stderr;
  const lines = output
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const chipType =
    lines
      .find((l) => l.includes("Detecting chip type"))
      ?.match(/Detecting chip type\.\.\.\s*(.*)/)?.[1]
      ?.trim() || "Unknown";

  const description =
    lines
      .find((l) => l.includes("Chip is"))
      ?.replace(/.*Chip is\s*/, "")
      .trim() || "";

  const features =
    lines
      .find((l) => l.includes("Features:"))
      ?.replace(/.*Features:\s*/, "")
      .trim() || "";

  const mac =
    lines
      .find((l) => l.includes("MAC:"))
      ?.replace(/.*MAC:\s*/, "")
      .trim() || "";

  const crystal =
    lines
      .find((l) => l.includes("Crystal is"))
      ?.replace(/.*Crystal is\s*/, "")
      .trim() || "";

  const flashSizeLine = lines.find((l) =>
    l.toLowerCase().includes("flash size")
  );
  const flashSize =
    flashSizeLine?.match(/(\d+\s*[MK]B)/i)?.[0] || "Unknown";

  return { chip: chipType, description, features, mac, crystal, flashSize, logs: lines };
}

export async function flashFirmware(
  port: string,
  firmwareData: Buffer,
  offset: string,
  chip: string = "auto"
): Promise<FlashResult> {
  validatePort(port);
  validateOffset(offset);
  const normalizedChip = normalizeChipArg(chip);

  const tmpFile = path.join(
    os.tmpdir(),
    `esptool-flash-${Date.now()}.bin`
  );

  try {
    await writeFile(tmpFile, firmwareData);

    const python = await getPython();
    const { stdout, stderr } = await execFileAsync(
      python,
      [
        "-m",
        "esptool",
        "--port",
        port,
        "--chip",
        normalizedChip,
        "--baud",
        "460800",
        "write_flash",
        "--flash_mode",
        "dio",
        offset,
        tmpFile,
      ],
      { timeout: 180000, windowsHide: true }
    );

    const output = stdout + "\n" + stderr;
    const lines = output
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const success =
      output.includes("Hash of data verified") ||
      output.includes("Leaving...");

    return { success, logs: lines };
  } finally {
    try {
      await unlink(tmpFile);
    } catch {
      // temp file cleanup is best-effort
    }
  }
}

/**
 * Thread Network Config Generator
 *
 * Generates a 128-byte binary blob for OpenThread network credentials.
 * This blob is flashed at offset 0x3E0000 in the scratch partition.
 *
 * Binary layout (128 bytes):
 *   Offset  Size  Field
 *   0x00    4     magic         (0x54485244 = "THRD", little-endian)
 *   0x04    1     version       (1)
 *   0x05    1     channel       (11–26)
 *   0x06    2     pan_id        (uint16 LE)
 *   0x08    16    network_key   (128-bit, MSB first)
 *   0x18    8     ext_pan_id    (64-bit)
 *   0x20    17    network_name  (null-terminated, max 16 chars)
 *   0x31    40    server_addr   (null-terminated IPv6 string, max 39 chars)
 *   0x59    2     server_port   (uint16 LE)
 *   0x5B    1     flags         (bit 0: auto-start thread)
 *   0x5C    36    reserved      (0xFF)
 */

/** Flash offset: scratch_partition base (0x3E0000) */
export const THREAD_CONFIG_FLASH_OFFSET = 0x3e0000;

const THREAD_CONFIG_MAGIC = 0x54485244; // "THRD" in ASCII
const THREAD_CONFIG_VERSION = 1;
const THREAD_CONFIG_SIZE = 128;

export interface ThreadConfig {
  channel: number;       // 11–26
  panId: number;         // 0x0000–0xFFFF
  networkKey: string;    // 16 bytes as hex "aa:bb:cc:..." or "aabbcc..."
  extPanId: string;      // 8 bytes as hex "aa:bb:cc:..." or "aabbcc..."
  networkName: string;   // max 16 chars
  serverAddr: string;    // IPv6 address string, max 39 chars
  serverPort: number;    // 1–65535
  autoStart: boolean;
}

export const DEFAULT_THREAD_CONFIG: ThreadConfig = {
  channel: 25,
  panId: 0x23ed,
  networkKey: "5e:de:be:ad:64:40:5b:3e:17:19:36:46:c2:94:22:85",
  extPanId: "1a:25:78:dd:6e:e3:57:3b",
  networkName: "UNAL-Thread",
  serverAddr: "fdf5:bffd:bd6:ef74:b080:b8c3:367f:147f",
  serverPort: 5683,
  autoStart: true,
};

/** Parse a hex string like "aa:bb:cc" or "aabbcc" into a byte array */
function parseHexBytes(hex: string): number[] {
  const clean = hex.replace(/[:\s]/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(parseInt(clean.substring(i, i + 2), 16));
  }
  return bytes;
}

/** Format a byte array as "aa:bb:cc:..." */
export function formatHexBytes(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join(":");
}

/** Validate a hex key string (expected byte count) */
export function validateHexKey(hex: string, expectedBytes: number): boolean {
  const clean = hex.replace(/[:\s]/g, "");
  if (clean.length !== expectedBytes * 2) return false;
  return /^[0-9a-fA-F]+$/.test(clean);
}

/**
 * Generate a 128-byte binary config blob for Thread network.
 */
export function generateThreadConfigBlob(config: ThreadConfig): Uint8Array {
  const buf = new ArrayBuffer(THREAD_CONFIG_SIZE);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  // Fill with 0xFF
  bytes.fill(0xff);

  // Magic (little-endian u32)
  view.setUint32(0, THREAD_CONFIG_MAGIC, true);
  // Version
  view.setUint8(4, THREAD_CONFIG_VERSION);
  // Channel (clamped 11–26)
  view.setUint8(5, Math.max(11, Math.min(26, config.channel)));
  // PAN ID (uint16 LE)
  view.setUint16(6, config.panId & 0xffff, true);

  // Network Key (16 bytes at offset 0x08)
  const keyBytes = parseHexBytes(config.networkKey);
  for (let i = 0; i < 16 && i < keyBytes.length; i++) {
    view.setUint8(8 + i, keyBytes[i]);
  }

  // Extended PAN ID (8 bytes at offset 0x18)
  const extPanBytes = parseHexBytes(config.extPanId);
  for (let i = 0; i < 8 && i < extPanBytes.length; i++) {
    view.setUint8(0x18 + i, extPanBytes[i]);
  }

  // Network Name (null-terminated, max 16 chars at offset 0x20)
  const nameBytes = new TextEncoder().encode(config.networkName.substring(0, 16));
  for (let i = 0; i < nameBytes.length; i++) {
    view.setUint8(0x20 + i, nameBytes[i]);
  }
  view.setUint8(0x20 + Math.min(nameBytes.length, 16), 0); // null terminator

  // Server IPv6 Address (null-terminated, max 39 chars at offset 0x31)
  const addrBytes = new TextEncoder().encode(config.serverAddr.substring(0, 39));
  for (let i = 0; i < addrBytes.length; i++) {
    view.setUint8(0x31 + i, addrBytes[i]);
  }
  view.setUint8(0x31 + Math.min(addrBytes.length, 39), 0); // null terminator

  // Server Port (uint16 LE at offset 0x59)
  view.setUint16(0x59, config.serverPort & 0xffff, true);

  // Flags (offset 0x5B)
  view.setUint8(0x5b, config.autoStart ? 0x01 : 0x00);

  return bytes;
}

/**
 * Convert a Uint8Array to a binary string (for esptool-js).
 */
export function threadConfigBlobToBinaryString(blob: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 8192;
  for (let i = 0; i < blob.length; i += chunkSize) {
    const slice = blob.subarray(i, Math.min(i + chunkSize, blob.length));
    chunks.push(String.fromCharCode.apply(null, Array.from(slice)));
  }
  return chunks.join("");
}

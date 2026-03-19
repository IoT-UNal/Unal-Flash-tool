/**
 * WiFi Config Generator
 *
 * Generates a binary config blob matching the firmware's wifi_config struct.
 * This blob is flashed at offset 0x3E0000 alongside the main firmware.
 *
 * Binary layout (128 bytes):
 *   Offset  Size  Field
 *   0x00    4     magic       (0x57494649 = "WIFI", little-endian)
 *   0x04    1     version     (1)
 *   0x05    1     ssid_len
 *   0x06    1     psk_len
 *   0x07    1     flags       (reserved, 0)
 *   0x08    33    ssid        (null-terminated)
 *   0x29    65    psk         (null-terminated)
 *   0x6A    22    reserved    (0xFF padding)
 */

/** Flash offset where the config blob is written */
export const WIFI_CONFIG_FLASH_OFFSET = 0x3e0000;

const WIFI_CONFIG_MAGIC = 0x57494649; // "WIFI" in ASCII
const WIFI_CONFIG_VERSION = 1;
const WIFI_CONFIG_SIZE = 128;
const SSID_MAX = 32;
const PSK_MAX = 64;

export interface WifiConfig {
  ssid: string;
  password: string;
}

/**
 * Generate a 128-byte binary config blob for the firmware.
 * Returns a Uint8Array ready to be flashed at WIFI_CONFIG_FLASH_OFFSET.
 */
export function generateWifiConfigBlob(config: WifiConfig): Uint8Array {
  const { ssid, password } = config;

  if (!ssid || ssid.length === 0) {
    throw new Error("SSID is required");
  }
  if (ssid.length > SSID_MAX) {
    throw new Error(`SSID too long (max ${SSID_MAX} characters)`);
  }
  if (password.length > PSK_MAX) {
    throw new Error(`Password too long (max ${PSK_MAX} characters)`);
  }

  const buf = new ArrayBuffer(WIFI_CONFIG_SIZE);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  // Fill with 0xFF (erased flash default)
  bytes.fill(0xff);

  // Magic (little-endian u32)
  view.setUint32(0, WIFI_CONFIG_MAGIC, true);

  // Version
  view.setUint8(4, WIFI_CONFIG_VERSION);

  // SSID length
  view.setUint8(5, ssid.length);

  // PSK length
  view.setUint8(6, password.length);

  // Flags (reserved)
  view.setUint8(7, 0);

  // SSID (null-terminated)
  const encoder = new TextEncoder();
  const ssidBytes = encoder.encode(ssid);
  bytes.set(ssidBytes, 8);
  bytes[8 + ssidBytes.length] = 0; // null terminator

  // PSK (null-terminated)
  const pskBytes = encoder.encode(password);
  bytes.set(pskBytes, 0x29);
  bytes[0x29 + pskBytes.length] = 0; // null terminator

  return bytes;
}

/**
 * Convert a Uint8Array to a binary string (for esptool-js).
 */
export function configBlobToBinaryString(blob: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 8192;
  for (let i = 0; i < blob.length; i += chunkSize) {
    const slice = blob.subarray(i, Math.min(i + chunkSize, blob.length));
    chunks.push(String.fromCharCode.apply(null, Array.from(slice)));
  }
  return chunks.join("");
}

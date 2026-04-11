/**
 * LED Config Generator
 *
 * Generates a 64-byte binary blob matching the firmware's led_config struct.
 * This blob is flashed at offset 0x3E0080 in the scratch partition
 * (scratch_partition @ 0x3E0000 + 128-byte reserved block).
 *
 * Binary layout (64 bytes):
 *   Offset  Size  Field
 *   0x00    4     magic        (0x4C454443 = "LEDC", little-endian)
 *   0x04    1     version      (1)
 *   0x05    1     mode         (0=solid,1=blink,2=breathe,3=rainbow)
 *   0x06    1     brightness   (0–255)
 *   0x07    1     speed        (1–255)
 *   0x08    1     color_r
 *   0x09    1     color_g
 *   0x0A    1     color_b
 *   0x0B    1     flags        (reserved, 0)
 *   0x0C    52    reserved     (0xFF)
 */

/** Flash offset: scratch_partition (0x3E0000) + 128-byte reserved block */
export const LED_CONFIG_FLASH_OFFSET = 0x3e0080;

const LED_CONFIG_MAGIC = 0x4c454443; // "LEDC" in ASCII
const LED_CONFIG_VERSION = 1;
const LED_CONFIG_SIZE = 64;

export enum LedMode {
  Solid = 0,
  Blink = 1,
  Breathe = 2,
  Rainbow = 3,
}

export const LED_MODE_LABELS: Record<LedMode, string> = {
  [LedMode.Solid]: "Solid",
  [LedMode.Blink]: "Blink",
  [LedMode.Breathe]: "Breathe",
  [LedMode.Rainbow]: "Rainbow",
};

export interface LedConfig {
  mode: LedMode;
  brightness: number; // 0–255
  speed: number; // 1–255
  colorR: number; // 0–255
  colorG: number; // 0–255
  colorB: number; // 0–255
}

export const DEFAULT_LED_CONFIG: LedConfig = {
  mode: LedMode.Solid,
  brightness: 128,
  speed: 128,
  colorR: 0,
  colorG: 120,
  colorB: 255,
};

/**
 * Generate a 64-byte binary config blob for the LED.
 */
export function generateLedConfigBlob(config: LedConfig): Uint8Array {
  const buf = new ArrayBuffer(LED_CONFIG_SIZE);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  bytes.fill(0xff);

  // Magic (little-endian u32)
  view.setUint32(0, LED_CONFIG_MAGIC, true);
  view.setUint8(4, LED_CONFIG_VERSION);
  view.setUint8(5, config.mode);
  view.setUint8(6, Math.max(0, Math.min(255, config.brightness)));
  view.setUint8(7, Math.max(1, Math.min(255, config.speed)));
  view.setUint8(8, Math.max(0, Math.min(255, config.colorR)));
  view.setUint8(9, Math.max(0, Math.min(255, config.colorG)));
  view.setUint8(10, Math.max(0, Math.min(255, config.colorB)));
  view.setUint8(11, 0); // flags

  return bytes;
}

/**
 * Convert a Uint8Array to a binary string (for esptool-js).
 */
export function ledConfigBlobToBinaryString(blob: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 8192;
  for (let i = 0; i < blob.length; i += chunkSize) {
    const slice = blob.subarray(i, Math.min(i + chunkSize, blob.length));
    chunks.push(String.fromCharCode.apply(null, Array.from(slice)));
  }
  return chunks.join("");
}

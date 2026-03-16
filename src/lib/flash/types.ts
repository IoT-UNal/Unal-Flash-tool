export interface ChipInfo {
  chipFamily: string;
  chipName: string;
  mac: string;
  features: string[];
  flashSize: number;
  crystalFreq: number;
  revision: string;
}

export interface FlashSegment {
  data: string;
  address: number;
  name?: string;
}

export interface FlashOptions {
  flashMode: "dio" | "qio" | "dout" | "qout";
  flashFreq: "80m" | "60m" | "40m" | "26m" | "20m";
  flashSize: "detect" | "1MB" | "2MB" | "4MB" | "8MB" | "16MB";
  eraseAll: boolean;
  compress: boolean;
}

export interface FlashProgress {
  fileIndex: number;
  totalFiles: number;
  written: number;
  total: number;
  percentage: number;
  status: "connecting" | "erasing" | "writing" | "verifying" | "done" | "error";
  message: string;
  segmentName?: string;
}

export const FLASH_MODES: FlashOptions["flashMode"][] = ["dio", "qio", "dout", "qout"];
export const FLASH_FREQS: FlashOptions["flashFreq"][] = ["80m", "40m", "26m", "20m"];
export const FLASH_SIZES: FlashOptions["flashSize"][] = ["detect", "1MB", "2MB", "4MB", "8MB", "16MB"];

export const DEFAULT_FLASH_OPTIONS: FlashOptions = {
  flashMode: "dio",
  flashFreq: "40m",
  flashSize: "detect",
  eraseAll: false,
  compress: true,
};

/** Standard ESP32 flash segment addresses */
export const SEGMENT_ADDRESSES = {
  BOOTLOADER_LEGACY: 0x1000,
  BOOTLOADER_NEW: 0x0,
  PARTITION_TABLE: 0x8000,
  OTA_DATA: 0xe000,
  APPLICATION: 0x10000,
} as const;

/** Bootloader offsets per chip family */
export const CHIP_OFFSETS: Record<string, number> = {
  ESP32: 0x1000,
  "ESP32-S2": 0x1000,
  "ESP32-S3": 0x0,
  "ESP32-C3": 0x0,
  "ESP32-C6": 0x0,
  "ESP32-H2": 0x0,
  "ESP32-C2": 0x0,
};

/** Known chip features */
export const CHIP_FEATURES: Record<string, string[]> = {
  ESP32: ["WiFi", "Bluetooth Classic", "BLE", "Dual Core"],
  "ESP32-S2": ["WiFi", "USB OTG", "Single Core"],
  "ESP32-S3": ["WiFi", "BLE 5.0", "USB OTG", "AI Acceleration", "Dual Core"],
  "ESP32-C3": ["WiFi", "BLE 5.0", "RISC-V", "Single Core"],
  "ESP32-C6": ["WiFi 6", "BLE 5.0", "802.15.4", "RISC-V", "Single Core"],
  "ESP32-H2": ["BLE 5.0", "802.15.4", "RISC-V", "Single Core"],
  "ESP32-C2": ["WiFi", "BLE 5.0", "RISC-V", "Single Core"],
};

/** Common flash error types with user-friendly messages */
export type FlashErrorCode =
  | "NOT_IN_BOOT_MODE"
  | "TIMEOUT"
  | "WRITE_FAILED"
  | "PORT_BUSY"
  | "PERMISSION_DENIED"
  | "DEVICE_NOT_FOUND"
  | "UNKNOWN";

export interface FlashError {
  code: FlashErrorCode;
  message: string;
  suggestion: string;
}

export function classifyFlashError(err: Error): FlashError {
  const msg = err.message.toLowerCase();

  if (msg.includes("failed to connect") || msg.includes("wrong boot mode") || msg.includes("invalid head")) {
    return {
      code: "NOT_IN_BOOT_MODE",
      message: "Device is not in bootloader mode",
      suggestion:
        "Hold the BOOT/GPIO0 button, press and release RESET/EN, then release BOOT. Some boards do this automatically.",
    };
  }
  if (msg.includes("timeout") || msg.includes("timed out")) {
    return {
      code: "TIMEOUT",
      message: "Connection timed out",
      suggestion:
        "Check that your USB cable supports data transfer (not charge-only). Try a different USB port or cable.",
    };
  }
  if (msg.includes("write") && msg.includes("fail")) {
    return {
      code: "WRITE_FAILED",
      message: "Flash write failed",
      suggestion:
        "Try erasing the flash first, then re-flash. The flash memory may be corrupted or worn out.",
    };
  }
  if (msg.includes("busy") || msg.includes("in use")) {
    return {
      code: "PORT_BUSY",
      message: "Serial port is busy",
      suggestion:
        "Close any other serial monitor or application using this port (Arduino IDE, PlatformIO, PuTTY, etc).",
    };
  }
  if (msg.includes("permission") || msg.includes("access denied")) {
    return {
      code: "PERMISSION_DENIED",
      message: "Permission denied",
      suggestion:
        "On Linux, add your user to the 'dialout' group: sudo usermod -aG dialout $USER, then log out and back in.",
    };
  }
  if (msg.includes("no device") || msg.includes("not found")) {
    return {
      code: "DEVICE_NOT_FOUND",
      message: "Device not found",
      suggestion:
        "Make sure the ESP32 is connected via USB and the correct driver is installed (CP210x, CH340, or FTDI).",
    };
  }

  return {
    code: "UNKNOWN",
    message: err.message,
    suggestion: "Try disconnecting and reconnecting the device, or use a different USB port.",
  };
}

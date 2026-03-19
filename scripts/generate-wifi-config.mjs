#!/usr/bin/env node
/**
 * Generate a default WiFi config binary (128 bytes) for the scratch partition.
 *
 * Usage:
 *   node scripts/generate-wifi-config.mjs [output-path]
 *
 * Without arguments → writes to stdout (binary).
 * With path        → writes the file at that path.
 *
 * The binary is 128 bytes of 0xFF, representing an "unconfigured" config
 * partition.  The firmware checks the magic bytes (0x57494649 = "WIFI")
 * and, when absent, falls back to NVS-stored credentials.
 *
 * Flash offset: 0x3E0000  (Zephyr scratch_partition on XIAO ESP32-C6)
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const WIFI_CONFIG_SIZE = 128;

// 128 bytes of 0xFF = erased flash = "no config present"
const buf = Buffer.alloc(WIFI_CONFIG_SIZE, 0xff);

const outPath = process.argv[2];

if (outPath) {
  writeFileSync(resolve(outPath), buf);
  console.log(`wifi-config-default.bin  (${WIFI_CONFIG_SIZE} bytes) → ${resolve(outPath)}`);
} else {
  process.stdout.write(buf);
}

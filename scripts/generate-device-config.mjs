#!/usr/bin/env node
/**
 * Generate a default device config binary (192 bytes, all 0xFF = erased flash).
 * Layout:
 *   Bytes 0–127:   WiFi config  (magic 0x57494649 when written)
 *   Bytes 128–191: LED config   (magic 0x4C454443 when written)
 *
 * All 0xFF means "no config" — firmware falls back to defaults/NVS.
 */

import { writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";

const TOTAL_SIZE = 192; // 128 (WiFi) + 64 (LED)
const outputPath = process.argv[2];

if (!outputPath) {
  console.error("Usage: generate-device-config.mjs <output-path>");
  process.exit(1);
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, Buffer.alloc(TOTAL_SIZE, 0xff));
console.log(`Generated ${TOTAL_SIZE}-byte default device config → ${outputPath}`);

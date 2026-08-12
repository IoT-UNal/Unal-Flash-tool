import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

/**
 * GET /api/local-firmware/zephyr-rgb
 * Serves the locally-built zephyr-rgb binary from the firmware build output.
 */
export async function GET() {
  try {
    const binPath = path.join(
      process.cwd(),
      "firmware",
      "zephyr-rgb",
      "build",
      "zephyr",
      "zephyr.bin"
    );
    const data = await readFile(binPath);
    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="zephyr-rgb.bin"',
        "Content-Length": String(data.length),
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: "Local firmware build not found",
        hint: "Build with: west build -b xiao_esp32c6/esp32c6 firmware/zephyr-rgb",
      },
      { status: 404 }
    );
  }
}

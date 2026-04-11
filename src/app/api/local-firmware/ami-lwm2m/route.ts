import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

/**
 * GET /api/local-firmware/ami-lwm2m
 * Serves the locally-built ami-lwm2m-node binary from the firmware build output.
 */
export async function GET() {
  try {
    const binPath = path.join(
      process.cwd(),
      "firmware",
      "ami-lwm2m-node",
      "build",
      "zephyr",
      "zephyr.bin"
    );
    const data = await readFile(binPath);
    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="ami-lwm2m-node.bin"',
        "Content-Length": String(data.length),
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: "Local firmware build not found",
        hint: "Clone ami-lwm2m-node into firmware/ and build with: west build -b xiao_esp32c6/esp32c6 firmware/ami-lwm2m-node",
      },
      { status: 404 }
    );
  }
}

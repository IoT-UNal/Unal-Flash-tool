import { NextResponse } from "next/server";
import { detectChip } from "@/lib/flash/EsptoolService";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const port = body?.port;

    if (!port || typeof port !== "string") {
      return NextResponse.json(
        { error: "port is required (e.g. COM3)" },
        { status: 400 }
      );
    }

    const result = await detectChip(port);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to detect chip",
      },
      { status: 500 }
    );
  }
}

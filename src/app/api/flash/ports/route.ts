import { NextResponse } from "next/server";
import { listPorts } from "@/lib/flash/EsptoolService";

export async function GET() {
  try {
    const ports = await listPorts();
    return NextResponse.json({ ports });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to list ports",
      },
      { status: 500 }
    );
  }
}

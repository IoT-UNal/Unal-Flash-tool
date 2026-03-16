import { NextResponse } from "next/server";
import { flashFirmware } from "@/lib/flash/EsptoolService";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const file = formData.get("file") as File | null;
    const port = formData.get("port") as string | null;
    const offset = formData.get("offset") as string | null;
    const chip = (formData.get("chip") as string) || "auto";

    if (!file || !port || !offset) {
      return NextResponse.json(
        { error: "file, port, and offset are required" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await flashFirmware(port, buffer, offset, chip);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Flash failed",
      },
      { status: 500 }
    );
  }
}

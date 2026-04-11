import { NextRequest, NextResponse } from "next/server";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;

/**
 * GET /api/builds/github-actions/artifact?run_id=123456
 *
 * Downloads the ami-lwm2m-firmware artifact from a completed GitHub Actions run.
 * GitHub provides artifacts as ZIP — we extract the .bin and return it.
 */
export async function GET(request: NextRequest) {
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return NextResponse.json(
      { error: "GITHUB_TOKEN and GITHUB_REPO must be configured" },
      { status: 500 }
    );
  }

  const runId = request.nextUrl.searchParams.get("run_id");
  if (!runId) {
    return NextResponse.json({ error: "run_id parameter required" }, { status: 400 });
  }

  const ghHeaders = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "UNAL-Flash-Tool",
  };

  try {
    // List artifacts for this run
    const artifactsRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/runs/${runId}/artifacts`,
      { headers: ghHeaders }
    );

    if (!artifactsRes.ok) {
      return NextResponse.json(
        { error: `Failed to list artifacts: ${artifactsRes.status}` },
        { status: artifactsRes.status }
      );
    }

    const artifactsData = await artifactsRes.json();
    const artifact = artifactsData.artifacts?.find(
      (a: { name: string }) => a.name === "ami-lwm2m-firmware"
    );

    if (!artifact) {
      return NextResponse.json(
        { error: "Artifact 'ami-lwm2m-firmware' not found in this run" },
        { status: 404 }
      );
    }

    // Download the artifact ZIP
    const downloadRes = await fetch(artifact.archive_download_url, {
      headers: {
        ...ghHeaders,
        Accept: "application/vnd.github.v3+json",
      },
      redirect: "follow",
    });

    if (!downloadRes.ok) {
      return NextResponse.json(
        { error: `Failed to download artifact: ${downloadRes.status}` },
        { status: downloadRes.status }
      );
    }

    // GitHub returns a ZIP file containing the .bin
    const zipBuffer = new Uint8Array(await downloadRes.arrayBuffer());
    const binData = extractFirstFileFromZip(zipBuffer);

    if (!binData) {
      return NextResponse.json(
        { error: "Could not extract .bin from artifact ZIP" },
        { status: 500 }
      );
    }

    return new Response(Buffer.from(binData), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="ami-lwm2m-firmware.bin"`,
        "Content-Length": String(binData.byteLength),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to download artifact" },
      { status: 500 }
    );
  }
}

/**
 * Minimal ZIP extractor for STORE-compressed entries.
 * GitHub Actions artifacts for single files use STORE (no compression).
 */
function extractFirstFileFromZip(zip: Uint8Array): Uint8Array | null {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);

  // Find local file header signature: PK\x03\x04
  let offset = 0;
  while (offset < zip.length - 4) {
    if (view.getUint32(offset, true) === 0x04034b50) break;
    offset++;
  }
  if (offset >= zip.length - 4) return null;

  const compressionMethod = view.getUint16(offset + 8, true);
  const uncompressedSize = view.getUint32(offset + 22, true);
  const filenameLen = view.getUint16(offset + 26, true);
  const extraLen = view.getUint16(offset + 28, true);
  const dataStart = offset + 30 + filenameLen + extraLen;

  if (compressionMethod === 0) {
    // STORE — no compression
    return zip.slice(dataStart, dataStart + uncompressedSize);
  }

  if (compressionMethod === 8) {
    // DEFLATE — use Node.js zlib
    try {
      const compressedSize = view.getUint32(offset + 18, true);
      const compressed = zip.slice(dataStart, dataStart + compressedSize);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const zlib = require("zlib");
      return new Uint8Array(zlib.inflateRawSync(Buffer.from(compressed)));
    } catch {
      return null;
    }
  }

  return null;
}

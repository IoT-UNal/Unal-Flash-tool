import { NextResponse } from "next/server";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;

function getHeaders(): HeadersInit {
  const headers: HeadersInit = {
    Accept: "application/octet-stream",
    "User-Agent": "UNAL-Flash-Tool",
  };
  if (GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  }
  return headers;
}

// GET /api/firmware/[assetId] — Download a firmware binary
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const { assetId } = await params;

  if (!GITHUB_REPO) {
    return NextResponse.json(
      { error: "GITHUB_REPO not configured" },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/assets/${encodeURIComponent(assetId)}`,
      { headers: getHeaders() }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: `GitHub API error: ${res.status}` },
        { status: res.status }
      );
    }

    const buffer = await res.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": buffer.byteLength.toString(),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Download failed" },
      { status: 500 }
    );
  }
}

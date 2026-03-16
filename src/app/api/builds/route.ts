import { NextRequest, NextResponse } from "next/server";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;

// POST /api/builds — Trigger a GitHub Actions workflow
export async function POST(request: NextRequest) {
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return NextResponse.json(
      { error: "GITHUB_TOKEN and GITHUB_REPO must be configured" },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const {
      workflow = "build.yml",
      ref = "main",
      chip = "esp32",
      overlay,
    } = body as {
      workflow?: string;
      ref?: string;
      chip?: string;
      overlay?: string;
    };

    const inputs: Record<string, string> = { chip };
    if (overlay) inputs.overlay = overlay;

    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
          "User-Agent": "UNAL-Flash-Tool",
        },
        body: JSON.stringify({ ref, inputs }),
      }
    );

    if (res.status === 204) {
      return NextResponse.json({ success: true, message: "Build triggered" });
    }

    const errorText = await res.text();
    return NextResponse.json(
      { error: `GitHub Actions error: ${res.status} — ${errorText}` },
      { status: res.status }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to trigger build" },
      { status: 500 }
    );
  }
}

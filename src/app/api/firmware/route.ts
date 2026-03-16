import { NextRequest, NextResponse } from "next/server";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO; // "owner/repo"

function getHeaders(): HeadersInit {
  const headers: HeadersInit = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "UNAL-Flash-Tool",
  };
  if (GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  }
  return headers;
}

// GET /api/firmware — List releases
export async function GET(request: NextRequest) {
  if (!GITHUB_REPO) {
    return NextResponse.json(
      { error: "GITHUB_REPO not configured" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const page = searchParams.get("page") || "1";
  const perPage = searchParams.get("per_page") || "10";

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases?page=${encodeURIComponent(page)}&per_page=${encodeURIComponent(perPage)}`,
      { headers: getHeaders(), next: { revalidate: 60 } }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: `GitHub API error: ${res.status}` },
        { status: res.status }
      );
    }

    const releases = await res.json();

    const mapped = releases.map((r: Record<string, unknown>) => ({
      id: r.id,
      tagName: r.tag_name,
      name: r.name || r.tag_name,
      body: r.body || "",
      publishedAt: r.published_at,
      assets: (r.assets as Record<string, unknown>[]).map((a) => ({
        id: a.id,
        name: a.name,
        size: a.size,
        downloadUrl: a.browser_download_url,
        contentType: a.content_type,
      })),
    }));

    return NextResponse.json(mapped);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch releases" },
      { status: 500 }
    );
  }
}

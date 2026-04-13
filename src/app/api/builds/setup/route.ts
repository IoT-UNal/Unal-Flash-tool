import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import path from "path";

const ENV_PATH = path.join(process.cwd(), ".env");

/**
 * POST /api/builds/setup
 *
 * Saves GitHub token and repo to .env file for CI/CD builds.
 * Creates the file if it doesn't exist, updates values if it does.
 */
export async function POST(request: NextRequest) {
  const { githubToken, githubRepo, githubRef } = await request.json();

  if (!githubToken || !githubRepo) {
    return NextResponse.json(
      { error: "githubToken and githubRepo are required" },
      { status: 400 }
    );
  }

  // Validate token format (classic or fine-grained)
  if (
    !githubToken.startsWith("ghp_") &&
    !githubToken.startsWith("github_pat_")
  ) {
    return NextResponse.json(
      { error: "Invalid token format. Must start with ghp_ or github_pat_" },
      { status: 400 }
    );
  }

  // Validate repo format
  if (!githubRepo.match(/^[\w.-]+\/[\w.-]+$/)) {
    return NextResponse.json(
      { error: "Invalid repo format. Must be owner/repo (e.g., IoT-UNal/Unal-Flash-tool)" },
      { status: 400 }
    );
  }

  try {
    let content = "";
    try {
      content = await readFile(ENV_PATH, "utf-8");
    } catch {
      // File doesn't exist yet
    }

    // Update or add GITHUB_TOKEN
    if (content.includes("GITHUB_TOKEN=")) {
      content = content.replace(/GITHUB_TOKEN=.*/g, `GITHUB_TOKEN=${githubToken}`);
    } else {
      content += `\n# GitHub Personal Access Token (scopes: repo:read, actions:write)\nGITHUB_TOKEN=${githubToken}\n`;
    }

    // Update or add GITHUB_REPO
    if (content.includes("GITHUB_REPO=")) {
      content = content.replace(/GITHUB_REPO=.*/g, `GITHUB_REPO=${githubRepo}`);
    } else {
      content += `\n# GitHub repository (owner/repo)\nGITHUB_REPO=${githubRepo}\n`;
    }

    // Update or add GITHUB_REF (branch for workflow_dispatch)
    const ref = githubRef || "main";
    if (content.includes("GITHUB_REF=")) {
      content = content.replace(/GITHUB_REF=.*/g, `GITHUB_REF=${ref}`);
    } else {
      content += `\n# Branch to dispatch workflows on\nGITHUB_REF=${ref}\n`;
    }

    await writeFile(ENV_PATH, content.trim() + "\n");

    return NextResponse.json({
      success: true,
      message: "Configuration saved. Restart the dev server to apply changes.",
      needsRestart: true,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save configuration" },
      { status: 500 }
    );
  }
}

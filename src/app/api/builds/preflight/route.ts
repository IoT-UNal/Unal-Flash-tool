import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

export const dynamic = "force-dynamic";

const execAsync = promisify(exec);

interface PreflightResult {
  ci: {
    ready: boolean;
    hasToken: boolean;
    hasRepo: boolean;
    hasRef: boolean;
    repo: string | null;
    ref: string | null;
    tokenValid: boolean | null;
    tokenError: string | null;
    setupUrl: string;
  };
  docker: {
    ready: boolean;
    dockerAvailable: boolean;
    imageExists: boolean;
    imageName: string;
    buildCommand: string;
  };
}

/**
 * GET /api/builds/preflight
 *
 * Checks readiness of both build methods (CI/CD and Docker).
 * Returns what's configured and what's missing for each method.
 */
export async function GET() {
  const result: PreflightResult = {
    ci: {
      ready: false,
      hasToken: false,
      hasRepo: false,
      hasRef: false,
      repo: null,
      ref: null,
      tokenValid: null,
      tokenError: null,
      setupUrl: "https://github.com/settings/tokens?type=beta",
    },
    docker: {
      ready: false,
      dockerAvailable: false,
      imageExists: false,
      imageName: "unal-firmware-builder:latest",
      buildCommand: "docker compose build firmware-builder",
    },
  };

  // Check CI/CD readiness
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const ref = process.env.GITHUB_REF || "main";
  result.ci.hasToken = Boolean(token && token !== "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
  result.ci.hasRepo = Boolean(repo && repo !== "your-org/firmware-repo");
  result.ci.hasRef = Boolean(ref);
  result.ci.repo = repo || null;
  result.ci.ref = ref;
  result.ci.ready = result.ci.hasToken && result.ci.hasRepo;

  // Validate token permissions against GitHub API
  if (result.ci.hasToken && result.ci.hasRepo) {
    try {
      const resp = await fetch(
        `https://api.github.com/repos/${repo}/actions/workflows`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "UNAL-Flash-Tool",
          },
        }
      );
      if (resp.ok) {
        result.ci.tokenValid = true;
      } else if (resp.status === 403) {
        result.ci.tokenValid = false;
        result.ci.tokenError =
          "Token lacks 'Actions: Read & Write' permission. Regenerate the token with correct scopes.";
        result.ci.ready = false;
      } else if (resp.status === 404) {
        result.ci.tokenValid = false;
        result.ci.tokenError = `Repository '${repo}' not found or token lacks 'Contents: Read' permission.`;
        result.ci.ready = false;
      } else {
        result.ci.tokenValid = false;
        result.ci.tokenError = `GitHub API returned ${resp.status}`;
        result.ci.ready = false;
      }
    } catch {
      result.ci.tokenValid = null;
      result.ci.tokenError = "Could not reach GitHub API";
    }
  }

  // Check Docker readiness
  try {
    await execAsync("docker info", { timeout: 5000 });
    result.docker.dockerAvailable = true;

    const { stdout } = await execAsync(
      'docker images --format "{{.Repository}}:{{.Tag}}" unal-firmware-builder',
      { timeout: 5000 }
    );
    result.docker.imageExists = stdout.trim().includes("unal-firmware-builder:latest");
    result.docker.ready = result.docker.imageExists;
  } catch {
    result.docker.dockerAvailable = false;
  }

  return NextResponse.json(result);
}

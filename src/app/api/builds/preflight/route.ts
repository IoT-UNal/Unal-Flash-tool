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
    repo: string | null;
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
      repo: null,
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
  result.ci.hasToken = Boolean(token && token !== "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
  result.ci.hasRepo = Boolean(repo && repo !== "your-org/firmware-repo");
  result.ci.repo = repo || null;
  result.ci.ready = result.ci.hasToken && result.ci.hasRepo;

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

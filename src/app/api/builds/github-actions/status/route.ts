import { NextRequest, NextResponse } from "next/server";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;

/**
 * GET /api/builds/github-actions/status?run_id=123456
 *
 * Polls the status of a GitHub Actions workflow run.
 * Returns: status, conclusion, logs_url, and job details.
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
    // Get workflow run status
    const runRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/runs/${runId}`,
      { headers: ghHeaders }
    );

    if (!runRes.ok) {
      return NextResponse.json(
        { error: `GitHub API error: ${runRes.status}` },
        { status: runRes.status }
      );
    }

    const run = await runRes.json();

    // Get jobs for more detail
    const jobsRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/runs/${runId}/jobs`,
      { headers: ghHeaders }
    );

    let currentStep = "";
    let completedSteps = 0;
    let totalSteps = 0;

    if (jobsRes.ok) {
      const jobsData = await jobsRes.json();
      const job = jobsData.jobs?.[0];
      if (job?.steps) {
        totalSteps = job.steps.length;
        completedSteps = job.steps.filter(
          (s: { status: string }) => s.status === "completed"
        ).length;
        const activeStep = job.steps.find(
          (s: { status: string }) => s.status === "in_progress"
        );
        currentStep = activeStep?.name || job.steps[completedSteps]?.name || "";
      }
    }

    // Map GitHub status to our phases
    let phase: string;
    if (run.status === "queued" || run.status === "waiting" || run.status === "pending") {
      phase = "queued";
    } else if (run.status === "in_progress") {
      phase = "building";
    } else if (run.status === "completed") {
      phase = run.conclusion === "success" ? "done" : "error";
    } else {
      phase = "error";
    }

    return NextResponse.json({
      phase,
      status: run.status,
      conclusion: run.conclusion,
      currentStep,
      completedSteps,
      totalSteps,
      htmlUrl: run.html_url,
      createdAt: run.created_at,
      updatedAt: run.updated_at,
      artifactsUrl: run.artifacts_url,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to check build status" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import {
  validateAmiConfig,
  resolveZephyrBoard,
  type AmiConfig,
} from "@/lib/config/AmiOverlayGenerator";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_REF = process.env.GITHUB_REF || "main";
const WORKFLOW_FILE = "build-firmware.yml";

/**
 * POST /api/builds/github-actions
 *
 * Triggers a GitHub Actions workflow_dispatch build with AMI config parameters.
 * Returns the approximate run ID by querying recent runs after dispatch.
 */
export async function POST(request: NextRequest) {
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return NextResponse.json(
      { error: "GITHUB_TOKEN and GITHUB_REPO must be configured in .env" },
      { status: 500 }
    );
  }

  const config: AmiConfig = await request.json();
  const errors = validateAmiConfig(config);
  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ errors }, { status: 400 });
  }

  const ghHeaders = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
    "User-Agent": "UNAL-Flash-Tool",
  };

  try {
    // Capture timestamp before dispatch to find the run later
    const beforeDispatch = new Date().toISOString();

    // Trigger workflow_dispatch
    const dispatchRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
      {
        method: "POST",
        headers: ghHeaders,
        body: JSON.stringify({
          ref: GITHUB_REF,
          inputs: {
            build_ami_only: "true",
            board_target: resolveZephyrBoard(config.boardTarget),
            thread_channel: String(config.threadChannel),
            thread_pan_id: String(config.threadPanId),
            thread_network_key: config.threadNetworkKey,
            thread_network_name: config.threadNetworkName,
            thread_ext_pan_id: config.threadExtPanId,
            lwm2m_server_primary: config.lwm2mServerPrimary,
            lwm2m_server_secondary: config.lwm2mServerSecondary || "",
            single_phase: String(config.singlePhase),
            demo_mode: String(config.demoMode),
          },
        }),
      }
    );

    if (dispatchRes.status !== 204) {
      const errorText = await dispatchRes.text();
      return NextResponse.json(
        { error: `GitHub dispatch failed: ${dispatchRes.status} — ${errorText}` },
        { status: dispatchRes.status }
      );
    }

    // Wait briefly for GitHub to create the run
    await new Promise((r) => setTimeout(r, 3000));

    // Find the run that was just created
    const runsRes = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/runs?event=workflow_dispatch&per_page=5&created=>${beforeDispatch.slice(0, 19)}`,
      { headers: ghHeaders }
    );

    let runId: number | null = null;
    if (runsRes.ok) {
      const runsData = await runsRes.json();
      if (runsData.workflow_runs?.length > 0) {
        runId = runsData.workflow_runs[0].id;
      }
    }

    // If we couldn't find by timestamp, get the most recent one
    if (!runId) {
      const fallbackRes = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/runs?event=workflow_dispatch&per_page=1`,
        { headers: ghHeaders }
      );
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        if (fallbackData.workflow_runs?.length > 0) {
          runId = fallbackData.workflow_runs[0].id;
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: "Build triggered via GitHub Actions",
      runId,
      repo: GITHUB_REPO,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to trigger CI build" },
      { status: 500 }
    );
  }
}

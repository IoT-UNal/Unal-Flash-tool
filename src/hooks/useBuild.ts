"use client";

import { useState, useCallback, useRef } from "react";
import type { AmiConfig } from "@/lib/config/AmiOverlayGenerator";

export type BuildMethod = "docker" | "ci";

export interface BuildState {
  phase: "idle" | "queued" | "building" | "done" | "error";
  message: string;
  binarySize: number | null;
  downloadUrl: string | null;
  logs: string[];
  method: BuildMethod | null;
  /** GitHub Actions run ID (only for CI builds) */
  runId: number | null;
  /** GitHub Actions run URL (only for CI builds) */
  runUrl: string | null;
  /** CI build progress: completed steps / total steps */
  ciProgress: { completed: number; total: number } | null;
}

const INITIAL_STATE: BuildState = {
  phase: "idle",
  message: "",
  binarySize: null,
  downloadUrl: null,
  logs: [],
  method: null,
  runId: null,
  runUrl: null,
  ciProgress: null,
};

const CI_POLL_INTERVAL = 15_000; // 15 seconds

export function useBuild() {
  const [state, setState] = useState<BuildState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Docker build (existing SSE-based) ──────────────────────────────

  const startBuild = useCallback(async (config: AmiConfig) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setState({
      ...INITIAL_STATE,
      phase: "queued",
      message: "Submitting Docker build request...",
      method: "docker",
    });

    try {
      const resp = await fetch("/api/build-firmware/ami-lwm2m", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
        signal: abortRef.current.signal,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(
          err.errors
            ? `Validation: ${Object.values(err.errors).join(", ")}`
            : `Build API returned ${resp.status}`
        );
      }

      if (!resp.body) throw new Error("No response stream");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const processEvents = (raw: string) => {
        const parts = raw.split("\n\n");
        const remainder = parts.pop() || "";
        for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed) continue;
          const eventMatch = trimmed.match(
            /^event:\s*(\w+)\ndata:\s*([\s\S]+)$/
          );
          if (!eventMatch) continue;
          const [, eventType, dataStr] = eventMatch;
          try {
            const data = JSON.parse(dataStr);
            if (eventType === "status") {
              setState((s) => ({
                ...s,
                phase: data.phase ?? s.phase,
                message: data.message ?? s.message,
                binarySize: data.binarySize ?? s.binarySize,
                downloadUrl: data.downloadUrl ?? s.downloadUrl,
              }));
            } else if (eventType === "log") {
              setState((s) => ({
                ...s,
                logs: [...s.logs, data.line],
              }));
            }
          } catch {
            // skip malformed events
          }
        }
        return remainder;
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        buffer = processEvents(buffer);
      }
      if (buffer.trim()) {
        processEvents(buffer + "\n\n");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setState((s) => ({
        ...s,
        phase: "error",
        message: err instanceof Error ? err.message : "Build failed",
      }));
    }
  }, []);

  // ── GitHub Actions CI build ────────────────────────────────────────

  const startCIBuild = useCallback(async (config: AmiConfig) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    if (pollRef.current) clearInterval(pollRef.current);

    setState({
      ...INITIAL_STATE,
      phase: "queued",
      message: "Triggering GitHub Actions build...",
      method: "ci",
      logs: ["[ci] Dispatching workflow_dispatch to GitHub Actions..."],
    });

    try {
      // 1. Trigger the build
      const triggerResp = await fetch("/api/builds/github-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
        signal: abortRef.current.signal,
      });

      if (!triggerResp.ok) {
        const err = await triggerResp.json().catch(() => ({}));
        throw new Error(err.error || err.errors
          ? `Trigger failed: ${JSON.stringify(err.errors || err.error)}`
          : `Trigger API returned ${triggerResp.status}`
        );
      }

      const { runId, repo } = await triggerResp.json();

      if (!runId) {
        // Rare: dispatch succeeded but couldn't find the run ID.
        // The trigger API already retried — show error with manual fallback.
        setState((s) => ({
          ...s,
          phase: "error",
          message: "Build was triggered but could not find the run ID. Check GitHub Actions manually.",
          logs: [
            ...s.logs,
            `[ci] Build dispatched to ${repo}`,
            "[ci] Warning: Could not determine run ID — check GitHub Actions tab.",
          ],
        }));
        return;
      }

      setState((s) => ({
        ...s,
        phase: "building",
        message: "Build running on GitHub Actions...",
        runId,
        runUrl: `https://github.com/${repo}/actions/runs/${runId}`,
        logs: [
          ...s.logs,
          `[ci] Build dispatched to ${repo}`,
          `[ci] Run ID: ${runId}`,
          `[ci] Polling status every ${CI_POLL_INTERVAL / 1000}s...`,
        ],
      }));

      // 2. Start polling for status
      const pollStatus = async () => {
        if (abortRef.current?.signal.aborted) {
          if (pollRef.current) clearInterval(pollRef.current);
          return;
        }

        try {
          const statusResp = await fetch(
            `/api/builds/github-actions/status?run_id=${runId}`,
            { signal: abortRef.current?.signal }
          );

          if (!statusResp.ok) return;
          const status = await statusResp.json();

          const progressMsg = status.totalSteps > 0
            ? ` (${status.completedSteps}/${status.totalSteps} steps)`
            : "";
          const stepMsg = status.currentStep
            ? ` — ${status.currentStep}`
            : "";

          setState((s) => ({
            ...s,
            phase: status.phase,
            message:
              status.phase === "done"
                ? "Build complete! Downloading firmware..."
                : status.phase === "error"
                ? `Build failed: ${status.conclusion}${stepMsg}`
                : `Building on GitHub Actions${progressMsg}${stepMsg}`,
            ciProgress: status.totalSteps > 0
              ? { completed: status.completedSteps, total: status.totalSteps }
              : s.ciProgress,
            logs:
              status.currentStep && !s.logs.includes(`[ci] Step: ${status.currentStep}`)
                ? [...s.logs, `[ci] Step: ${status.currentStep}`]
                : s.logs,
          }));

          // Build finished — stop polling and download artifact
          if (status.phase === "done") {
            if (pollRef.current) clearInterval(pollRef.current);
            setState((s) => ({
              ...s,
              logs: [...s.logs, "[ci] Build complete! Downloading artifact..."],
              downloadUrl: `/api/builds/github-actions/artifact?run_id=${runId}`,
            }));

            // Auto-download the firmware
            try {
              const artifactResp = await fetch(
                `/api/builds/github-actions/artifact?run_id=${runId}`,
                { signal: abortRef.current?.signal }
              );
              if (!artifactResp.ok) throw new Error(`Download failed: ${artifactResp.status}`);
              const buf = await artifactResp.arrayBuffer();
              setState((s) => ({
                ...s,
                binarySize: buf.byteLength,
                message: "Firmware downloaded from CI/CD!",
                logs: [
                  ...s.logs,
                  `[ci] Firmware downloaded: ${(buf.byteLength / 1024).toFixed(1)} KB`,
                ],
              }));
            } catch (dlErr) {
              setState((s) => ({
                ...s,
                phase: "done",
                message: "Build complete — click 'Load Built Firmware' to download",
                logs: [
                  ...s.logs,
                  `[ci] Auto-download failed: ${dlErr instanceof Error ? dlErr.message : "unknown error"}`,
                  "[ci] You can still download manually.",
                ],
              }));
            }
          }

          // Build failed — stop polling
          if (status.phase === "error") {
            if (pollRef.current) clearInterval(pollRef.current);
            setState((s) => ({
              ...s,
              logs: [
                ...s.logs,
                `[ci] Build failed: ${status.conclusion}`,
                status.htmlUrl ? `[ci] See: ${status.htmlUrl}` : "",
              ].filter(Boolean),
            }));
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") {
            if (pollRef.current) clearInterval(pollRef.current);
          }
        }
      };

      // Initial poll after a delay, then every CI_POLL_INTERVAL
      await new Promise((r) => setTimeout(r, 10_000));
      await pollStatus();
      pollRef.current = setInterval(pollStatus, CI_POLL_INTERVAL);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setState((s) => ({
        ...s,
        phase: "error",
        message: err instanceof Error ? err.message : "CI build failed",
      }));
    }
  }, []);

  // ── Controls ───────────────────────────────────────────────────────

  const cancelBuild = useCallback(() => {
    abortRef.current?.abort();
    if (pollRef.current) clearInterval(pollRef.current);
    setState((s) => ({ ...s, phase: "idle", message: "Build cancelled" }));
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    if (pollRef.current) clearInterval(pollRef.current);
    setState(INITIAL_STATE);
  }, []);

  return { ...state, startBuild, startCIBuild, cancelBuild, reset };
}

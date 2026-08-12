"use client";

import { useState, useCallback, useRef } from "react";
import type { AmiConfig } from "@/lib/config/AmiOverlayGenerator";

export interface BuildState {
  phase: "idle" | "queued" | "building" | "done" | "error";
  message: string;
  binarySize: number | null;
  downloadUrl: string | null;
  logs: string[];
}

const INITIAL_STATE: BuildState = {
  phase: "idle",
  message: "",
  binarySize: null,
  downloadUrl: null,
  logs: [],
};

export function useBuild() {
  const [state, setState] = useState<BuildState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const startBuild = useCallback(async (config: AmiConfig) => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setState({
      ...INITIAL_STATE,
      phase: "queued",
      message: "Submitting build request...",
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
      // Process any remaining buffered event after stream ends
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

  const cancelBuild = useCallback(() => {
    abortRef.current?.abort();
    setState((s) => ({ ...s, phase: "idle", message: "Build cancelled" }));
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState(INITIAL_STATE);
  }, []);

  return { ...state, startBuild, cancelBuild, reset };
}

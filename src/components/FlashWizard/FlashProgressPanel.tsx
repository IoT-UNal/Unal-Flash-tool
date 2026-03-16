"use client";

import type { FlashProgress } from "@/lib/flash/types";

interface FlashProgressPanelProps {
  progress: FlashProgress | null;
  logs: string[];
}

const STATUS_CONFIG: Record<
  FlashProgress["status"],
  { color: string; label: string; icon: string }
> = {
  connecting: { color: "text-yellow-400", label: "Connecting", icon: "⟳" },
  erasing: { color: "text-orange-400", label: "Erasing", icon: "⧖" },
  writing: { color: "text-blue-400", label: "Writing", icon: "▶" },
  verifying: { color: "text-cyan-400", label: "Verifying", icon: "✓" },
  done: { color: "text-green-400", label: "Complete", icon: "✔" },
  error: { color: "text-red-400", label: "Error", icon: "✕" },
};

export default function FlashProgressPanel({
  progress,
  logs,
}: FlashProgressPanelProps) {
  if (!progress) return null;

  const config = STATUS_CONFIG[progress.status];

  return (
    <div className="space-y-3">
      {/* Status header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-lg ${config.color}`}>{config.icon}</span>
          <span className={`text-sm font-medium ${config.color}`}>
            {config.label}
          </span>
        </div>
        {progress.totalFiles > 0 && (
          <span className="text-xs text-gray-400">
            Segment {progress.fileIndex + 1} / {progress.totalFiles}
            {progress.segmentName && ` — ${progress.segmentName}`}
          </span>
        )}
      </div>

      {/* Overall progress bar */}
      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-gray-400">
          <span>{progress.message}</span>
          <span>{progress.percentage}%</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-700">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              progress.status === "error"
                ? "bg-red-500"
                : progress.status === "done"
                  ? "bg-green-500"
                  : "bg-blue-500"
            }`}
            style={{ width: `${progress.percentage}%` }}
          />
        </div>
      </div>

      {/* Per-segment progress (multi-file) */}
      {progress.totalFiles > 1 && (
        <div className="space-y-1">
          {Array.from({ length: progress.totalFiles }).map((_, i) => {
            const segDone = i < progress.fileIndex;
            const segActive = i === progress.fileIndex;
            const pct = segDone ? 100 : segActive ? progress.percentage : 0;
            return (
              <div key={i} className="flex items-center gap-2">
                <span className="w-4 text-center text-xs text-gray-500">
                  {segDone ? "✔" : segActive ? "▶" : "○"}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-700">
                  <div
                    className={`h-full rounded-full transition-all duration-200 ${
                      segDone ? "bg-green-500" : segActive ? "bg-blue-500" : "bg-gray-700"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-8 text-right text-xs text-gray-500">
                  {pct}%
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Flash log */}
      {logs.length > 0 && (
        <div className="max-h-40 overflow-y-auto rounded border border-gray-700 bg-gray-900 p-2">
          <div className="space-y-0.5 font-mono text-xs text-gray-400">
            {logs.map((log, i) => (
              <div key={i} className="whitespace-pre-wrap break-all">
                {log}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

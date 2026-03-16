"use client";

import type { ChipInfo } from "@/lib/flash/types";

interface ChipInfoCardProps {
  chipInfo: ChipInfo;
}

export default function ChipInfoCard({ chipInfo }: ChipInfoCardProps) {
  const formatFlashSize = (bytes: number): string => {
    if (bytes === 0) return "Unknown";
    if (bytes >= 1024 * 1024) return `${bytes / (1024 * 1024)} MB`;
    if (bytes >= 1024) return `${bytes / 1024} KB`;
    return `${bytes} bytes`;
  };

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/20">
          <svg
            className="h-4 w-4 text-green-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-white">
          {chipInfo.chipName || chipInfo.chipFamily}
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <InfoItem label="Family" value={chipInfo.chipFamily} />
        <InfoItem label="MAC Address" value={chipInfo.mac} mono />
        <InfoItem label="Flash Size" value={formatFlashSize(chipInfo.flashSize)} />
        <InfoItem
          label="Crystal"
          value={chipInfo.crystalFreq ? `${chipInfo.crystalFreq} MHz` : "—"}
        />
        {chipInfo.revision && (
          <InfoItem label="Revision" value={chipInfo.revision} />
        )}
      </div>

      {chipInfo.features.length > 0 && (
        <div className="mt-3 border-t border-gray-700 pt-3">
          <span className="mb-1.5 block text-xs text-gray-400">Features</span>
          <div className="flex flex-wrap gap-1.5">
            {chipInfo.features.map((f) => (
              <span
                key={f}
                className="rounded-full bg-blue-500/15 px-2 py-0.5 text-xs text-blue-300"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoItem({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <span className="block text-gray-400">{label}</span>
      <span className={`text-white ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

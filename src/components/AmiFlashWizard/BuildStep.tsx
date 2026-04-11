import { useRef, useEffect, useState } from "react";
import type { AmiConfig } from "@/lib/config/AmiOverlayGenerator";
import { generateOverlayConf } from "@/lib/config/AmiOverlayGenerator";
import type { BuildState, BuildMethod } from "@/hooks/useBuild";

interface BuildStepProps {
  config: AmiConfig;
  build: BuildState & {
    startBuild: (config: AmiConfig) => Promise<void>;
    startCIBuild: (config: AmiConfig) => Promise<void>;
    cancelBuild: () => void;
  };
  firmwareData: Uint8Array | null;
  onFirmwareLoaded: (data: Uint8Array, source: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function BuildStep({
  config,
  build,
  firmwareData,
  onFirmwareLoaded,
  onNext,
  onBack,
}: BuildStepProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [buildMethod, setBuildMethod] = useState<BuildMethod>("ci");

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [build.logs.length]);

  const handleBuild = () => {
    if (buildMethod === "ci") {
      build.startCIBuild(config);
    } else {
      build.startBuild(config);
    }
  };

  const handleDownloadBuilt = async () => {
    if (!build.downloadUrl) return;
    try {
      const resp = await fetch(build.downloadUrl);
      if (!resp.ok) throw new Error("Failed to download firmware");
      const buf = await resp.arrayBuffer();
      const source = build.method === "ci" ? "GitHub Actions CI/CD" : "Docker build";
      onFirmwareLoaded(new Uint8Array(buf), source);
    } catch (err) {
      console.error("Download error:", err);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const data = new Uint8Array(reader.result as ArrayBuffer);
      onFirmwareLoaded(data, file.name);
    };
    reader.readAsArrayBuffer(file);
  };

  // Auto-load firmware when CI build completes and auto-downloads
  useEffect(() => {
    if (
      build.phase === "done" &&
      build.method === "ci" &&
      build.binarySize &&
      build.downloadUrl &&
      !firmwareData
    ) {
      handleDownloadBuilt();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [build.phase, build.binarySize, build.downloadUrl]);

  const overlay = generateOverlayConf(config);
  const isBuilding = build.phase === "queued" || build.phase === "building";
  const isDone = build.phase === "done";
  const isError = build.phase === "error";
  const ciProgress = build.ciProgress;

  return (
    <div className="space-y-5">
      {/* Build method selector */}
      <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
        <h3 className="text-base font-semibold text-amber-400 mb-1">Build Firmware</h3>
        <p className="text-xs text-gray-500 mb-4">
          Choose how to build the firmware with your configuration.
        </p>

        {/* Method radio buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <label
            className={`relative flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              buildMethod === "ci"
                ? "bg-blue-900/20 border-blue-600"
                : "bg-gray-900/50 border-gray-700 hover:border-gray-600"
            }`}
          >
            <input
              type="radio"
              name="buildMethod"
              value="ci"
              checked={buildMethod === "ci"}
              onChange={() => setBuildMethod("ci")}
              disabled={isBuilding}
              className="mt-0.5 text-blue-500 focus:ring-blue-500"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-200">
                  GitHub Actions CI/CD
                </span>
                <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded">
                  Recommended
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Build in the cloud — no Docker required. Takes ~15-20 min.
              </p>
            </div>
          </label>

          <label
            className={`relative flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
              buildMethod === "docker"
                ? "bg-amber-900/20 border-amber-600"
                : "bg-gray-900/50 border-gray-700 hover:border-gray-600"
            }`}
          >
            <input
              type="radio"
              name="buildMethod"
              value="docker"
              checked={buildMethod === "docker"}
              onChange={() => setBuildMethod("docker")}
              disabled={isBuilding}
              className="mt-0.5 text-amber-500 focus:ring-amber-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-200">
                Docker Local Build
              </span>
              <p className="text-xs text-gray-500 mt-0.5">
                Build locally with Docker. Requires firmware-builder image.
              </p>
            </div>
          </label>
        </div>

        {/* Overlay summary */}
        <details className="mb-4">
          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-300">
            View overlay configuration ({overlay.split("\n").length} lines)
          </summary>
          <pre className="bg-gray-900 rounded p-3 mt-2 text-xs text-gray-400 font-mono overflow-x-auto max-h-32 overflow-y-auto">
            {overlay}
          </pre>
        </details>

        {/* Build actions */}
        <div className="flex gap-3 mb-4">
          <button
            onClick={handleBuild}
            disabled={isBuilding}
            className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-colors ${
              isBuilding
                ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                : buildMethod === "ci"
                ? "bg-blue-600 hover:bg-blue-500 text-white"
                : "bg-amber-600 hover:bg-amber-500 text-white"
            }`}
          >
            {isBuilding
              ? build.method === "ci"
                ? "Building on CI..."
                : "Building..."
              : isDone
              ? "Rebuild"
              : buildMethod === "ci"
              ? "Build via GitHub Actions"
              : "Build with Docker"}
          </button>

          {isBuilding && (
            <button
              onClick={build.cancelBuild}
              className="px-4 py-2.5 bg-red-700 hover:bg-red-600 text-white text-sm rounded-lg transition-colors"
            >
              Cancel
            </button>
          )}
        </div>

        {/* CI Progress bar */}
        {isBuilding && build.method === "ci" && ciProgress && ciProgress.total > 0 && (
          <div className="mb-4">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Step {ciProgress.completed}/{ciProgress.total}</span>
              <span>{Math.round((ciProgress.completed / ciProgress.total) * 100)}%</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${(ciProgress.completed / ciProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Status indicator */}
        {build.phase !== "idle" && (
          <div
            className={`p-3 rounded-lg mb-4 text-sm ${
              isDone
                ? "bg-green-900/20 border border-green-700/30 text-green-400"
                : isError
                ? "bg-red-900/20 border border-red-700/30 text-red-400"
                : build.method === "ci"
                ? "bg-blue-900/20 border border-blue-700/30 text-blue-400"
                : "bg-amber-900/20 border border-amber-700/30 text-amber-400"
            }`}
          >
            <div className="flex items-center gap-2">
              {isBuilding && (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
              <span className="flex-1">{build.message}</span>
              {build.binarySize && (
                <span className="text-xs text-gray-400 ml-auto">
                  ({(build.binarySize / 1024).toFixed(1)} KB)
                </span>
              )}
            </div>
            {build.runUrl && (
              <a
                href={build.runUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-1 text-xs text-blue-400 hover:text-blue-300 underline"
              >
                View on GitHub Actions →
              </a>
            )}
          </div>
        )}

        {/* Build logs */}
        {build.logs.length > 0 && (
          <div className="bg-gray-900 rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-xs text-gray-500">
            {build.logs.map((line, i) => (
              <div
                key={i}
                className={
                  line.includes("[ci]")
                    ? "text-blue-400"
                    : line.includes("[build]")
                    ? "text-amber-400"
                    : line.includes("error")
                    ? "text-red-400"
                    : ""
                }
              >
                {line}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}

        {/* Download built binary */}
        {isDone && build.downloadUrl && !firmwareData && (
          <button
            onClick={handleDownloadBuilt}
            className="w-full mt-3 py-2 bg-green-700 hover:bg-green-600 text-white text-sm rounded-lg transition-colors"
          >
            Load Built Firmware
          </button>
        )}
      </div>

      {/* Alternative: upload binary */}
      <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
        <h4 className="text-sm text-gray-400 mb-2">Or upload a pre-built binary</h4>
        <input
          ref={fileInputRef}
          type="file"
          accept=".bin"
          onChange={handleFileUpload}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg transition-colors"
        >
          Upload .bin File
        </button>
      </div>

      {/* Firmware loaded indicator */}
      {firmwareData && (
        <div className="bg-green-900/20 border border-green-700/30 rounded-lg p-3 text-sm text-green-400">
          Firmware loaded: {(firmwareData.length / 1024).toFixed(1)} KB
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={onBack} className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors">
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!firmwareData}
          className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-colors ${
            firmwareData
              ? "bg-amber-600 hover:bg-amber-500 text-white"
              : "bg-gray-600 text-gray-400 cursor-not-allowed"
          }`}
        >
          Next: Connect Device
        </button>
      </div>
    </div>
  );
}

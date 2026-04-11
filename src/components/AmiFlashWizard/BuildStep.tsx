import { useRef, useEffect } from "react";
import type { AmiConfig } from "@/lib/config/AmiOverlayGenerator";
import { generateOverlayConf } from "@/lib/config/AmiOverlayGenerator";
import type { BuildState } from "@/hooks/useBuild";

interface BuildStepProps {
  config: AmiConfig;
  build: BuildState & {
    startBuild: (config: AmiConfig) => Promise<void>;
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

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [build.logs.length]);

  const handleBuild = () => {
    build.startBuild(config);
  };

  const handleDownloadBuilt = async () => {
    if (!build.downloadUrl) return;
    try {
      const resp = await fetch(build.downloadUrl);
      if (!resp.ok) throw new Error("Failed to download firmware");
      const buf = await resp.arrayBuffer();
      onFirmwareLoaded(new Uint8Array(buf), "Docker build");
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

  const overlay = generateOverlayConf(config);
  const isBuilding = build.phase === "queued" || build.phase === "building";
  const isDone = build.phase === "done";
  const isError = build.phase === "error";

  return (
    <div className="space-y-5">
      <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
        <h3 className="text-base font-semibold text-amber-400 mb-1">Build Firmware</h3>
        <p className="text-xs text-gray-500 mb-4">
          Compile the AMI LwM2M firmware with your configuration. This uses Docker to run the
          Zephyr SDK build (first build may take 10-15 min, subsequent builds ~5 min with cache).
        </p>

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
                : "bg-amber-600 hover:bg-amber-500 text-white"
            }`}
          >
            {isBuilding ? "Building..." : isDone ? "Rebuild" : "Build Firmware"}
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

        {/* Status indicator */}
        {build.phase !== "idle" && (
          <div
            className={`p-3 rounded-lg mb-4 text-sm ${
              isDone
                ? "bg-green-900/20 border border-green-700/30 text-green-400"
                : isError
                ? "bg-red-900/20 border border-red-700/30 text-red-400"
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
              {build.message}
              {build.binarySize && (
                <span className="text-xs text-gray-400 ml-auto">
                  ({(build.binarySize / 1024).toFixed(1)} KB)
                </span>
              )}
            </div>
          </div>
        )}

        {/* Build logs */}
        {build.logs.length > 0 && (
          <div className="bg-gray-900 rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-xs text-gray-500">
            {build.logs.map((line, i) => (
              <div
                key={i}
                className={
                  line.includes("[build]")
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

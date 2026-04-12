import { useRef, useEffect, useState, useCallback } from "react";
import type { AmiConfig } from "@/lib/config/AmiOverlayGenerator";
import { generateOverlayConf } from "@/lib/config/AmiOverlayGenerator";
import type { BuildState, BuildMethod } from "@/hooks/useBuild";

interface PreflightStatus {
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
  const [preflight, setPreflight] = useState<PreflightStatus | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(true);

  // CI Setup form
  const [showCISetup, setShowCISetup] = useState(false);
  const [ciToken, setCiToken] = useState("");
  const [ciRepo, setCiRepo] = useState("IoT-UNal/Unal-Flash-tool");
  const [ciSaving, setCiSaving] = useState(false);
  const [ciSaveMsg, setCiSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Docker image build
  const [dockerBuilding, setDockerBuilding] = useState(false);
  const [dockerBuildLogs, setDockerBuildLogs] = useState<string[]>([]);
  const [dockerBuildDone, setDockerBuildDone] = useState(false);

  // Run preflight check on mount
  const runPreflight = useCallback(async () => {
    setPreflightLoading(true);
    try {
      const resp = await fetch("/api/builds/preflight");
      if (resp.ok) {
        const data = await resp.json();
        setPreflight(data);
        // Auto-select best available method
        if (data.ci.ready) setBuildMethod("ci");
        else if (data.docker.ready) setBuildMethod("docker");
      }
    } catch {
      // Preflight not critical
    }
    setPreflightLoading(false);
  }, []);

  useEffect(() => {
    runPreflight();
  }, [runPreflight]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [build.logs.length, dockerBuildLogs.length]);

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

  // Save CI/CD config (.env)
  const handleCISave = async () => {
    setCiSaving(true);
    setCiSaveMsg(null);
    try {
      const resp = await fetch("/api/builds/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ githubToken: ciToken, githubRepo: ciRepo }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setCiSaveMsg({
          ok: true,
          text: "✅ Saved! Restart the dev server (npm run dev) to apply.",
        });
        setCiToken("");
        setShowCISetup(false);
        // Refresh preflight after a short delay
        setTimeout(runPreflight, 1000);
      } else {
        setCiSaveMsg({ ok: false, text: data.error || "Failed to save" });
      }
    } catch {
      setCiSaveMsg({ ok: false, text: "Network error" });
    }
    setCiSaving(false);
  };

  // Build Docker firmware image
  const handleBuildDockerImage = async () => {
    setDockerBuilding(true);
    setDockerBuildLogs([]);
    setDockerBuildDone(false);
    try {
      const resp = await fetch("/api/builds/docker-image", { method: "POST" });
      if (!resp.body) throw new Error("No stream");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed) continue;
          const match = trimmed.match(/^event:\s*(\w+)\ndata:\s*([\s\S]+)$/);
          if (!match) continue;
          const [, eventType, dataStr] = match;
          try {
            const data = JSON.parse(dataStr);
            if (eventType === "log") {
              setDockerBuildLogs((l) => [...l, data.line]);
            } else if (eventType === "status") {
              if (data.phase === "done") {
                setDockerBuildDone(true);
                runPreflight();
              } else if (data.phase === "error") {
                setDockerBuildLogs((l) => [...l, `❌ ${data.message}`]);
              }
            }
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      setDockerBuildLogs((l) => [
        ...l,
        `❌ ${err instanceof Error ? err.message : "Build failed"}`,
      ]);
    }
    setDockerBuilding(false);
  };

  // Auto-load firmware when CI build completes
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

  const ciReady = preflight?.ci.ready ?? false;
  const dockerReady = preflight?.docker.ready ?? false;
  const methodReady = buildMethod === "ci" ? ciReady : dockerReady;

  return (
    <div className="space-y-5">
      {/* Preflight status */}
      {preflightLoading ? (
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 flex items-center gap-3">
          <svg className="animate-spin w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <span className="text-sm text-gray-400">Checking build environment...</span>
        </div>
      ) : preflight && (
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Build Environment</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {/* CI status */}
            <div className={`flex items-center gap-2 text-xs p-2 rounded ${ciReady ? "bg-green-900/20 text-green-400" : "bg-yellow-900/20 text-yellow-400"}`}>
              <span>{ciReady ? "✅" : "⚠️"}</span>
              <span>CI/CD: {ciReady ? "Ready" : "Needs setup"}</span>
              {!ciReady && (
                <button
                  onClick={() => setShowCISetup(!showCISetup)}
                  className="ml-auto text-blue-400 hover:text-blue-300 underline"
                >
                  Configure
                </button>
              )}
            </div>
            {/* Docker status */}
            <div className={`flex items-center gap-2 text-xs p-2 rounded ${dockerReady ? "bg-green-900/20 text-green-400" : preflight.docker.dockerAvailable ? "bg-yellow-900/20 text-yellow-400" : "bg-red-900/20 text-red-400"}`}>
              <span>{dockerReady ? "✅" : preflight.docker.dockerAvailable ? "⚠️" : "❌"}</span>
              <span>
                Docker: {dockerReady ? "Ready" : preflight.docker.dockerAvailable ? "Image missing" : "Not available"}
              </span>
              {preflight.docker.dockerAvailable && !preflight.docker.imageExists && !dockerBuilding && (
                <button
                  onClick={handleBuildDockerImage}
                  className="ml-auto text-amber-400 hover:text-amber-300 underline"
                >
                  Build image
                </button>
              )}
            </div>
          </div>

          {/* CI Setup form */}
          {showCISetup && (
            <div className="mt-4 p-4 bg-gray-900 rounded-lg border border-blue-800/50 space-y-3">
              <h4 className="text-sm font-medium text-blue-400">GitHub Actions Setup</h4>
              <p className="text-xs text-gray-400">
                Create a{" "}
                <a
                  href="https://github.com/settings/tokens?type=beta"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 underline"
                >
                  Fine-grained Personal Access Token
                </a>{" "}
                with these permissions on your repo:
              </p>
              <ul className="text-xs text-gray-500 list-disc list-inside space-y-0.5">
                <li><strong>Actions</strong>: Read and write</li>
                <li><strong>Contents</strong>: Read-only</li>
              </ul>
              <div>
                <label className="text-xs text-gray-400 block mb-1">GitHub Token</label>
                <input
                  type="password"
                  value={ciToken}
                  onChange={(e) => setCiToken(e.target.value)}
                  placeholder="github_pat_... or ghp_..."
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200 placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Repository (owner/repo)</label>
                <input
                  type="text"
                  value={ciRepo}
                  onChange={(e) => setCiRepo(e.target.value)}
                  placeholder="IoT-UNal/Unal-Flash-tool"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-200 placeholder-gray-600 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCISave}
                  disabled={!ciToken || !ciRepo || ciSaving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:text-gray-400 text-white text-sm rounded transition-colors"
                >
                  {ciSaving ? "Saving..." : "Save & Configure"}
                </button>
                <button
                  onClick={() => setShowCISetup(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded transition-colors"
                >
                  Cancel
                </button>
              </div>
              {ciSaveMsg && (
                <p className={`text-xs ${ciSaveMsg.ok ? "text-green-400" : "text-red-400"}`}>
                  {ciSaveMsg.text}
                </p>
              )}
            </div>
          )}

          {/* Docker image build progress */}
          {(dockerBuilding || dockerBuildDone) && (
            <div className="mt-4 p-3 bg-gray-900 rounded-lg border border-amber-800/50">
              <div className="flex items-center gap-2 mb-2">
                {dockerBuilding && (
                  <svg className="animate-spin w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                )}
                <span className="text-xs text-amber-400">
                  {dockerBuildDone
                    ? "✅ Docker image built! You can now use Docker builds."
                    : "Building Docker image (30+ min on first run)..."}
                </span>
              </div>
              {dockerBuildLogs.length > 0 && (
                <div className="bg-gray-950 rounded p-2 max-h-32 overflow-y-auto font-mono text-[10px] text-gray-600">
                  {dockerBuildLogs.slice(-30).map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Build method selector & actions */}
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
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${ciReady ? "bg-blue-600 text-white" : "bg-gray-600 text-gray-300"}`}>
                  {ciReady ? "Ready" : "Needs setup"}
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
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-200">
                  Docker Local Build
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${dockerReady ? "bg-green-600 text-white" : "bg-gray-600 text-gray-300"}`}>
                  {dockerReady ? "Ready" : preflight?.docker.dockerAvailable ? "Image missing" : "No Docker"}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Build locally with Docker. Requires firmware-builder image.
              </p>
            </div>
          </label>
        </div>

        {/* Setup required warning */}
        {!methodReady && !isBuilding && buildMethod === "ci" && !showCISetup && (
          <div className="mb-4 p-3 bg-yellow-900/20 border border-yellow-700/30 rounded-lg text-sm text-yellow-400">
            <p>⚠️ GitHub Actions requires a Personal Access Token.</p>
            <button
              onClick={() => setShowCISetup(true)}
              className="mt-1 text-xs text-blue-400 hover:text-blue-300 underline"
            >
              Configure now →
            </button>
          </div>
        )}
        {!methodReady && !isBuilding && buildMethod === "docker" && (
          <div className="mb-4 p-3 bg-yellow-900/20 border border-yellow-700/30 rounded-lg text-sm text-yellow-400">
            {!preflight?.docker.dockerAvailable ? (
              <p>❌ Docker is not running. Start Docker Desktop and refresh.</p>
            ) : (
              <>
                <p>⚠️ Docker image <code className="text-amber-300">unal-firmware-builder:latest</code> not found.</p>
                {!dockerBuilding && (
                  <button
                    onClick={handleBuildDockerImage}
                    className="mt-1 text-xs text-amber-400 hover:text-amber-300 underline"
                  >
                    Build the image now (~30 min first time) →
                  </button>
                )}
              </>
            )}
          </div>
        )}

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
            disabled={isBuilding || !methodReady}
            className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-colors ${
              isBuilding || !methodReady
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

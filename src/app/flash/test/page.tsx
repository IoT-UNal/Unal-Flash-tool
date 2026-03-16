"use client";

import { useState, useRef, useEffect } from "react";

interface PortInfo {
  port: string;
  description: string;
  hwid: string;
}

interface ChipDetection {
  chip: string;
  description: string;
  features: string;
  mac: string;
  crystal: string;
  flashSize: string;
  logs: string[];
}

export default function FlashTestPage() {
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [selectedPort, setSelectedPort] = useState("");
  const [chipInfo, setChipInfo] = useState<ChipDetection | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState("");
  const [offset, setOffset] = useState("0x0");
  const [file, setFile] = useState<File | null>(null);
  const [flashSuccess, setFlashSuccess] = useState<boolean | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const addLog = (msg: string) => {
    setLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] ${msg}`,
    ]);
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const scanPorts = async () => {
    setLoading("ports");
    addLog("Scanning serial ports...");
    try {
      const res = await fetch("/api/flash/ports");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPorts(data.ports);
      addLog(
        `Found ${data.ports.length} port(s): ${
          data.ports.map((p: PortInfo) => p.port).join(", ") || "none"
        }`
      );
      if (data.ports.length > 0 && !selectedPort) {
        setSelectedPort(data.ports[0].port);
      }
    } catch (err) {
      addLog(
        `ERROR: ${
          err instanceof Error ? err.message : "Failed to scan ports"
        }`
      );
    } finally {
      setLoading("");
    }
  };

  const detect = async () => {
    if (!selectedPort) {
      addLog("ERROR: Select a port first");
      return;
    }
    setLoading("detect");
    setChipInfo(null);
    addLog(`Detecting chip on ${selectedPort}...`);
    try {
      const res = await fetch("/api/flash/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ port: selectedPort }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setChipInfo(data);
      addLog(
        `Detected: ${data.chip} | ${data.description} | MAC: ${data.mac} | Flash: ${data.flashSize}`
      );
      data.logs?.forEach((l: string) => addLog(`  ${l}`));
    } catch (err) {
      addLog(
        `ERROR: ${
          err instanceof Error ? err.message : "Detection failed"
        }`
      );
    } finally {
      setLoading("");
    }
  };

  const flash = async () => {
    if (!selectedPort) {
      addLog("ERROR: Select a port first");
      return;
    }
    if (!file) {
      addLog("ERROR: Select a firmware file first");
      return;
    }
    setLoading("flash");
    setFlashSuccess(null);
    addLog(
      `Flashing ${file.name} (${(file.size / 1024).toFixed(
        1
      )} KB) to ${selectedPort} at offset ${offset}...`
    );
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("port", selectedPort);
      formData.append("offset", offset);
      if (chipInfo?.chip) formData.append("chip", chipInfo.chip);

      const res = await fetch("/api/flash/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setFlashSuccess(data.success);
      data.logs?.forEach((l: string) => addLog(`  ${l}`));
      addLog(
        data.success
          ? ">>> Flash completed successfully!"
          : ">>> Flash may have failed — check logs"
      );
    } catch (err) {
      addLog(
        `ERROR: ${err instanceof Error ? err.message : "Flash failed"}`
      );
      setFlashSuccess(false);
    } finally {
      setLoading("");
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">ESP32 Flash API Test</h1>
          <p className="text-gray-400 mt-1">
            Server-side flash via esptool.py — bypasses Web Serial API
          </p>
        </div>

        {/* 1. Port Selection */}
        <section className="bg-gray-900 rounded-lg p-4 space-y-3">
          <h2 className="text-xl font-semibold">1. Serial Port</h2>
          <div className="flex gap-3 items-center flex-wrap">
            <button
              onClick={scanPorts}
              disabled={loading === "ports"}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded font-medium transition-colors"
            >
              {loading === "ports" ? "Scanning..." : "Scan Ports"}
            </button>
            <select
              value={selectedPort}
              onChange={(e) => setSelectedPort(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 min-w-[250px]"
            >
              <option value="">-- Select port --</option>
              {ports.map((p) => (
                <option key={p.port} value={p.port}>
                  {p.port} — {p.description}
                </option>
              ))}
            </select>
          </div>
          {ports.length > 0 && (
            <div className="text-xs text-gray-500 space-y-0.5">
              {ports.map((p) => (
                <div key={p.port}>
                  {p.port}: {p.description}{" "}
                  <span className="text-gray-600">[{p.hwid}]</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 2. Chip Detection */}
        <section className="bg-gray-900 rounded-lg p-4 space-y-3">
          <h2 className="text-xl font-semibold">2. Detect Chip</h2>
          <button
            onClick={detect}
            disabled={!selectedPort || loading === "detect"}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded font-medium transition-colors"
          >
            {loading === "detect" ? "Detecting..." : "Detect Chip"}
          </button>
          {chipInfo && (
            <div className="bg-gray-800 rounded p-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-400">Chip: </span>
                {chipInfo.chip}
              </div>
              <div>
                <span className="text-gray-400">Description: </span>
                {chipInfo.description}
              </div>
              <div>
                <span className="text-gray-400">MAC: </span>
                <span className="font-mono">{chipInfo.mac}</span>
              </div>
              <div>
                <span className="text-gray-400">Crystal: </span>
                {chipInfo.crystal}
              </div>
              <div>
                <span className="text-gray-400">Features: </span>
                {chipInfo.features}
              </div>
              <div>
                <span className="text-gray-400">Flash: </span>
                {chipInfo.flashSize}
              </div>
            </div>
          )}
        </section>

        {/* 3. Flash Firmware */}
        <section className="bg-gray-900 rounded-lg p-4 space-y-3">
          <h2 className="text-xl font-semibold">3. Flash Firmware</h2>
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Firmware (.bin)
              </label>
              <input
                type="file"
                accept=".bin"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-gray-700 file:text-white file:cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Offset
              </label>
              <input
                type="text"
                value={offset}
                onChange={(e) => setOffset(e.target.value)}
                placeholder="0x0"
                className="bg-gray-800 border border-gray-700 rounded px-3 py-2 w-28 font-mono"
              />
            </div>
            <button
              onClick={flash}
              disabled={!selectedPort || !file || !!loading}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded font-medium transition-colors"
            >
              {loading === "flash" ? "Flashing..." : "Flash"}
            </button>
          </div>
          {file && (
            <p className="text-xs text-gray-500">
              {file.name} — {(file.size / 1024).toFixed(1)} KB
            </p>
          )}
          {flashSuccess !== null && (
            <div
              className={`rounded p-3 text-sm font-medium ${
                flashSuccess
                  ? "bg-green-900/50 text-green-300 border border-green-800"
                  : "bg-red-900/50 text-red-300 border border-red-800"
              }`}
            >
              {flashSuccess
                ? "Flash completed successfully"
                : "Flash failed — check logs below"}
            </div>
          )}
        </section>

        {/* Logs */}
        <section className="bg-gray-900 rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Logs</h2>
            <button
              onClick={() => setLogs([])}
              className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm transition-colors"
            >
              Clear
            </button>
          </div>
          <div className="bg-black rounded p-3 h-80 overflow-y-auto font-mono text-xs space-y-0.5">
            {logs.length === 0 ? (
              <p className="text-gray-600">
                No logs yet. Start by scanning ports.
              </p>
            ) : (
              logs.map((log, i) => (
                <div
                  key={i}
                  className={
                    log.includes("ERROR")
                      ? "text-red-400"
                      : log.includes(">>>")
                      ? "text-green-400 font-bold"
                      : log.startsWith("  ")
                      ? "text-gray-500"
                      : "text-gray-300"
                  }
                >
                  {log}
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </section>

        <p className="text-center text-gray-600 text-xs">
          <a href="/flash" className="hover:text-gray-400 underline">
            Back to Web Flash UI
          </a>
        </p>
      </div>
    </div>
  );
}

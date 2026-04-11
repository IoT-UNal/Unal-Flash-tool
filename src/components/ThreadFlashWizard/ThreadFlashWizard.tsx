"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSerial } from "@/hooks/useSerial";
import { useFlash } from "@/hooks/useFlash";
import { SerialManager } from "@/lib/serial/SerialManager";
import type { FlashOptions } from "@/lib/flash/types";
import { DEFAULT_FLASH_OPTIONS } from "@/lib/flash/types";
import {
  generateThreadConfigBlob,
  threadConfigBlobToBinaryString,
  THREAD_CONFIG_FLASH_OFFSET,
  validateHexKey,
  DEFAULT_THREAD_CONFIG,
  type ThreadConfig,
} from "@/lib/config/ThreadConfigGenerator";
import ChipInfoCard from "@/components/FlashWizard/ChipInfoCard";
import FlashProgressPanel from "@/components/FlashWizard/FlashProgressPanel";

type WizardStep = "connect" | "configure" | "flash";

const STEPS: { key: WizardStep; label: string; num: number }[] = [
  { key: "connect", label: "Connect", num: 1 },
  { key: "configure", label: "Configure", num: 2 },
  { key: "flash", label: "Flash", num: 3 },
];

const LOCAL_BIN_PATH = "/api/local-firmware/ami-lwm2m";

/** Convert Uint8Array to binary string for esptool-js */
function toBinaryString(data: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 8192;
  for (let i = 0; i < data.length; i += chunkSize) {
    const slice = data.subarray(i, Math.min(i + chunkSize, data.length));
    chunks.push(String.fromCharCode.apply(null, Array.from(slice)));
  }
  return chunks.join("");
}

export default function ThreadFlashWizard() {
  const [step, setStep] = useState<WizardStep>("connect");
  const [autoBootMode, setAutoBootMode] = useState(true);
  const [bootAttempting, setBootAttempting] = useState(false);

  // Firmware binary
  const [firmwareData, setFirmwareData] = useState<Uint8Array | null>(null);
  const [firmwareSource, setFirmwareSource] = useState<string>("");
  const [firmwareLoading, setFirmwareLoading] = useState(false);
  const [firmwareError, setFirmwareError] = useState<string>("");

  // Thread config
  const [threadConfig, setThreadConfig] = useState<ThreadConfig>({
    ...DEFAULT_THREAD_CONFIG,
  });
  const [flashOptions] = useState<FlashOptions>({
    ...DEFAULT_FLASH_OPTIONS,
    eraseAll: false,
    compress: true,
    flashSize: "8MB",
  });

  // Validation
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const serial = useSerial();
  const flash = useFlash();

  const flashDisconnectRef = useRef(flash.disconnect);
  flashDisconnectRef.current = flash.disconnect;

  useEffect(() => {
    return () => {
      flashDisconnectRef.current().catch(() => {});
    };
  }, []);

  const currentStepIdx = STEPS.findIndex((s) => s.key === step);

  // --- Validate config ---
  const validateConfig = useCallback((): boolean => {
    const errors: Record<string, string> = {};
    if (threadConfig.channel < 11 || threadConfig.channel > 26) {
      errors.channel = "Channel must be 11–26";
    }
    if (threadConfig.panId < 0 || threadConfig.panId > 0xffff) {
      errors.panId = "PAN ID must be 0x0000–0xFFFF";
    }
    if (!validateHexKey(threadConfig.networkKey, 16)) {
      errors.networkKey = "Network Key must be 16 bytes (32 hex chars)";
    }
    if (!validateHexKey(threadConfig.extPanId, 8)) {
      errors.extPanId = "Extended PAN ID must be 8 bytes (16 hex chars)";
    }
    if (!threadConfig.networkName || threadConfig.networkName.length > 16) {
      errors.networkName = "Network Name is required (max 16 chars)";
    }
    if (!threadConfig.serverAddr) {
      errors.serverAddr = "Server address is required";
    }
    if (threadConfig.serverPort < 1 || threadConfig.serverPort > 65535) {
      errors.serverPort = "Port must be 1–65535";
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [threadConfig]);

  // --- Load firmware binary ---
  const loadLocalBin = useCallback(async () => {
    setFirmwareLoading(true);
    setFirmwareError("");
    try {
      const resp = await fetch(LOCAL_BIN_PATH);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: local build not found`);
      const buf = await resp.arrayBuffer();
      setFirmwareData(new Uint8Array(buf));
      setFirmwareSource("Local build (ami-lwm2m-node)");
    } catch {
      setFirmwareError(
        "Local build not available. Upload the .bin file manually or clone and build the ami-lwm2m-node firmware."
      );
    } finally {
      setFirmwareLoading(false);
    }
  }, []);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        setFirmwareData(new Uint8Array(reader.result as ArrayBuffer));
        setFirmwareSource(file.name);
        setFirmwareError("");
      };
      reader.readAsArrayBuffer(file);
    },
    []
  );

  // --- Connect ---
  const handleConnect = useCallback(async () => {
    try {
      const manager = SerialManager.getInstance();
      if (manager.isConnected) {
        await manager.close();
      }
      await manager.requestPort();
      const port = manager.getPort();
      if (!port) throw new Error("No port selected");
      await flash.connect(port, autoBootMode);
      setStep("configure");
    } catch (err) {
      console.error("Connection failed:", err);
    }
  }, [flash, autoBootMode]);

  const handleManualBoot = useCallback(async () => {
    try {
      setBootAttempting(true);
      const manager = SerialManager.getInstance();
      let port = manager.getPort();
      if (!port) {
        await manager.requestPort();
        port = manager.getPort();
      }
      if (!port) throw new Error("No port selected");
      const wasOpen = port.readable !== null;
      if (!wasOpen) await port.open({ baudRate: 115200 });

      await port.setSignals({ dataTerminalReady: false, requestToSend: true });
      await new Promise((r) => setTimeout(r, 100));
      await port.setSignals({ dataTerminalReady: true, requestToSend: false });
      await new Promise((r) => setTimeout(r, 50));
      await port.setSignals({ dataTerminalReady: false, requestToSend: false });
      await new Promise((r) => setTimeout(r, 100));
      await port.setSignals({ dataTerminalReady: false, requestToSend: false });
      await new Promise((r) => setTimeout(r, 100));
      await port.setSignals({ dataTerminalReady: true, requestToSend: true });
      await new Promise((r) => setTimeout(r, 100));
      await port.setSignals({ dataTerminalReady: false, requestToSend: true });
      await new Promise((r) => setTimeout(r, 100));
      await port.setSignals({ dataTerminalReady: true, requestToSend: false });
      await new Promise((r) => setTimeout(r, 100));
      await port.setSignals({ dataTerminalReady: false, requestToSend: false });

      if (!wasOpen) await port.close();
      setBootAttempting(false);
    } catch (err) {
      setBootAttempting(false);
      console.error("Boot mode entry failed:", err);
    }
  }, []);

  // --- Flash ---
  const handleFlash = useCallback(async () => {
    if (!firmwareData || !flash.chipInfo) return;
    if (!validateConfig()) return;
    setStep("flash");
    try {
      const segments = [
        { data: toBinaryString(firmwareData), address: 0x0, name: "AMI LwM2M Firmware" },
      ];

      // Thread config
      const configBlob = generateThreadConfigBlob(threadConfig);
      segments.push({
        data: threadConfigBlobToBinaryString(configBlob),
        address: THREAD_CONFIG_FLASH_OFFSET,
        name: "Thread Config",
      });

      await flash.flash(segments, flashOptions);
    } catch (err) {
      console.error("Flash failed:", err);
    }
  }, [firmwareData, flash, flashOptions, threadConfig, validateConfig]);

  const handleReset = useCallback(async () => {
    try {
      await flash.disconnect();
    } catch { /* ignore */ }
    flash.clearLogs();
    flash.clearError();
    setStep("connect");
    setFirmwareData(null);
    setFirmwareSource("");
    setFirmwareError("");
    setThreadConfig({ ...DEFAULT_THREAD_CONFIG });
    setValidationErrors({});
  }, [flash]);

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                i < currentStepIdx
                  ? "bg-emerald-600 text-white"
                  : i === currentStepIdx
                    ? "bg-emerald-600 text-white ring-2 ring-emerald-400/50"
                    : "bg-gray-800 text-gray-500"
              }`}
            >
              {i < currentStepIdx ? (
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                s.num
              )}
            </div>
            <span className={`text-sm ${i <= currentStepIdx ? "text-white" : "text-gray-500"}`}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 w-12 ${i < currentStepIdx ? "bg-emerald-600" : "bg-gray-800"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Error banner */}
      {flash.error && (
        <div className="rounded-lg border border-red-800 bg-red-900/20 p-4">
          <div className="flex items-start gap-3">
            <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-red-300">{flash.error.message}</p>
              <p className="mt-1 text-xs text-red-400/80">{flash.error.suggestion}</p>
            </div>
            <button onClick={flash.clearError} className="text-red-400 hover:text-red-300">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
        {/* ===================== STEP 1: CONNECT ===================== */}
        {step === "connect" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Connect ESP32-C6 SuperMini</h2>

            <div className="rounded-lg border border-emerald-800/30 bg-emerald-900/10 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-600/20">
                  <svg className="h-5 w-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-emerald-300">AMI LwM2M — OpenThread Firmware</p>
                  <p className="mt-1 text-xs text-gray-400">
                    Flash the <strong className="text-gray-300">ami-lwm2m-node</strong> firmware and
                    configure the Thread network on your ESP32-C6 SuperMini.
                  </p>
                </div>
              </div>
            </div>

            {flash.isConnected && flash.chipInfo ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-green-400">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium">Device Connected</span>
                </div>
                <ChipInfoCard chipInfo={flash.chipInfo} />
                <button
                  onClick={() => setStep("configure")}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Continue to Configuration &rarr;
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={autoBootMode}
                    onChange={(e) => setAutoBootMode(e.target.checked)}
                    className="rounded border-gray-600 bg-gray-800 text-emerald-600"
                  />
                  Auto-enter boot mode on connect (recommended)
                </label>

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleConnect}
                    disabled={flash.isConnecting}
                    className="rounded-lg bg-emerald-600 px-6 py-3 font-medium text-white transition-colors hover:bg-emerald-700 disabled:bg-emerald-800 disabled:text-emerald-400"
                  >
                    {flash.isConnecting ? "Connecting..." : "Select USB Port"}
                  </button>
                  <button
                    onClick={handleManualBoot}
                    disabled={bootAttempting}
                    className="rounded-lg border border-yellow-600 bg-yellow-900/30 px-4 py-3 font-medium text-yellow-300 transition-colors hover:bg-yellow-900/50 disabled:opacity-50"
                  >
                    {bootAttempting ? "Sending signals..." : "Force Boot Mode"}
                  </button>
                </div>

                <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
                  <p className="mb-2 text-xs font-medium text-gray-300">
                    How to enter bootloader mode (ESP32-C6 SuperMini):
                  </p>
                  <ol className="list-inside list-decimal space-y-1 pl-2 text-xs text-gray-400">
                    <li>Hold the <strong className="text-gray-300">BOOT</strong> button</li>
                    <li>Press and release <strong className="text-gray-300">RESET</strong></li>
                    <li>Release <strong className="text-gray-300">BOOT</strong></li>
                    <li>A <strong className="text-gray-300">new USB device</strong> may appear (USB Serial/JTAG)</li>
                    <li>Click &quot;Select USB Port&quot; and choose the <strong className="text-gray-300">USB JTAG/serial debug unit</strong></li>
                  </ol>
                  <p className="mt-2 text-xs text-yellow-400/80">
                    Tip: After entering boot mode the USB port may re-enumerate. Select the new port when prompted.
                  </p>
                </div>
              </div>
            )}

            {!serial.isSupported && (
              <div className="rounded-lg border border-red-800 bg-red-900/20 p-4 text-sm text-red-300">
                Web Serial API is not supported. Please use Chrome or Edge 89+.
              </div>
            )}
          </div>
        )}

        {/* ===================== STEP 2: CONFIGURE ===================== */}
        {step === "configure" && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-white">Configure Thread Network</h2>

            {/* ---- Firmware Source ---- */}
            <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
              <h3 className="mb-3 text-sm font-medium text-white">Firmware Binary</h3>
              {firmwareData ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-green-400">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-sm">{firmwareSource}</span>
                    <span className="text-xs text-gray-500">
                      ({(firmwareData.length / 1024).toFixed(1)} KB)
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setFirmwareData(null);
                      setFirmwareSource("");
                    }}
                    className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-red-400"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={loadLocalBin}
                      disabled={firmwareLoading}
                      className="rounded-lg border border-emerald-700 bg-emerald-900/30 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-900/50 disabled:opacity-50"
                    >
                      {firmwareLoading ? "Loading..." : "Use Local Build"}
                    </button>
                    <label className="cursor-pointer rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-xs text-gray-300 hover:bg-gray-600">
                      Upload .bin File
                      <input type="file" accept=".bin" onChange={handleFileUpload} className="hidden" />
                    </label>
                  </div>
                  {firmwareError && (
                    <p className="text-xs text-red-400">{firmwareError}</p>
                  )}
                  <p className="text-xs text-gray-500">
                    Select the AMI LwM2M firmware binary. Use &quot;Local Build&quot; if available, or upload from disk.
                  </p>
                </div>
              )}
            </div>

            {/* ---- Thread Network Config ---- */}
            <div className="rounded-lg border border-emerald-800/50 bg-emerald-900/10 p-4">
              <div className="mb-3 flex items-center gap-2">
                <svg className="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0" />
                </svg>
                <span className="text-sm font-medium text-emerald-300">Thread Network Configuration</span>
              </div>
              <p className="mb-4 text-xs text-gray-400">
                Configure the OpenThread network credentials. These must match your Thread Border Router (OTBR) dataset.
              </p>

              <div className="grid grid-cols-2 gap-4">
                {/* Network Name */}
                <div>
                  <label className="mb-1 block text-xs text-gray-400">Network Name</label>
                  <input
                    type="text"
                    maxLength={16}
                    value={threadConfig.networkName}
                    onChange={(e) =>
                      setThreadConfig((c) => ({ ...c, networkName: e.target.value }))
                    }
                    className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-white placeholder-gray-600"
                    placeholder="UNAL-Thread"
                  />
                  {validationErrors.networkName && (
                    <p className="mt-0.5 text-xs text-red-400">{validationErrors.networkName}</p>
                  )}
                </div>

                {/* Channel */}
                <div>
                  <label className="mb-1 block text-xs text-gray-400">Channel (11–26)</label>
                  <select
                    value={threadConfig.channel}
                    onChange={(e) =>
                      setThreadConfig((c) => ({ ...c, channel: Number(e.target.value) }))
                    }
                    className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-white"
                  >
                    {Array.from({ length: 16 }, (_, i) => i + 11).map((ch) => (
                      <option key={ch} value={ch}>
                        {ch}
                      </option>
                    ))}
                  </select>
                  {validationErrors.channel && (
                    <p className="mt-0.5 text-xs text-red-400">{validationErrors.channel}</p>
                  )}
                </div>

                {/* PAN ID */}
                <div>
                  <label className="mb-1 block text-xs text-gray-400">PAN ID</label>
                  <input
                    type="text"
                    value={`0x${threadConfig.panId.toString(16).padStart(4, "0").toUpperCase()}`}
                    onChange={(e) => {
                      const val = e.target.value.replace(/^0x/i, "");
                      const parsed = parseInt(val, 16);
                      if (!isNaN(parsed)) {
                        setThreadConfig((c) => ({ ...c, panId: parsed & 0xffff }));
                      }
                    }}
                    className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 font-mono text-sm text-white placeholder-gray-600"
                    placeholder="0x23ED"
                  />
                  {validationErrors.panId && (
                    <p className="mt-0.5 text-xs text-red-400">{validationErrors.panId}</p>
                  )}
                </div>

                {/* Extended PAN ID */}
                <div>
                  <label className="mb-1 block text-xs text-gray-400">Extended PAN ID (8 bytes)</label>
                  <input
                    type="text"
                    value={threadConfig.extPanId}
                    onChange={(e) =>
                      setThreadConfig((c) => ({ ...c, extPanId: e.target.value }))
                    }
                    className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 font-mono text-sm text-white placeholder-gray-600"
                    placeholder="1a:25:78:dd:6e:e3:57:3b"
                  />
                  {validationErrors.extPanId && (
                    <p className="mt-0.5 text-xs text-red-400">{validationErrors.extPanId}</p>
                  )}
                </div>

                {/* Network Key (full width) */}
                <div className="col-span-2">
                  <label className="mb-1 block text-xs text-gray-400">Network Key (16 bytes)</label>
                  <input
                    type="text"
                    value={threadConfig.networkKey}
                    onChange={(e) =>
                      setThreadConfig((c) => ({ ...c, networkKey: e.target.value }))
                    }
                    className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 font-mono text-sm text-white placeholder-gray-600"
                    placeholder="5e:de:be:ad:64:40:5b:3e:17:19:36:46:c2:94:22:85"
                  />
                  {validationErrors.networkKey && (
                    <p className="mt-0.5 text-xs text-red-400">{validationErrors.networkKey}</p>
                  )}
                </div>
              </div>
            </div>

            {/* ---- LwM2M Server Config ---- */}
            <div className="rounded-lg border border-blue-800/50 bg-blue-900/10 p-4">
              <div className="mb-3 flex items-center gap-2">
                <svg className="h-4 w-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
                </svg>
                <span className="text-sm font-medium text-blue-300">LwM2M Server</span>
              </div>
              <p className="mb-4 text-xs text-gray-400">
                CoAP server address on the Thread mesh. Typically the OTBR&apos;s mesh-local EID.
              </p>

              <div className="grid grid-cols-3 gap-4">
                {/* Server IPv6 Address */}
                <div className="col-span-2">
                  <label className="mb-1 block text-xs text-gray-400">Server IPv6 Address</label>
                  <input
                    type="text"
                    value={threadConfig.serverAddr}
                    onChange={(e) =>
                      setThreadConfig((c) => ({ ...c, serverAddr: e.target.value }))
                    }
                    className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 font-mono text-sm text-white placeholder-gray-600"
                    placeholder="fdf5:bffd:bd6:ef74:b080:b8c3:367f:147f"
                  />
                  {validationErrors.serverAddr && (
                    <p className="mt-0.5 text-xs text-red-400">{validationErrors.serverAddr}</p>
                  )}
                </div>

                {/* Server Port */}
                <div>
                  <label className="mb-1 block text-xs text-gray-400">CoAP Port</label>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={threadConfig.serverPort}
                    onChange={(e) =>
                      setThreadConfig((c) => ({ ...c, serverPort: Number(e.target.value) }))
                    }
                    className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-white"
                  />
                  {validationErrors.serverPort && (
                    <p className="mt-0.5 text-xs text-red-400">{validationErrors.serverPort}</p>
                  )}
                </div>
              </div>

              {/* Auto-start */}
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={threadConfig.autoStart}
                  onChange={(e) =>
                    setThreadConfig((c) => ({ ...c, autoStart: e.target.checked }))
                  }
                  className="rounded border-gray-600 bg-gray-800 text-emerald-600"
                />
                Auto-start Thread on boot
              </label>
            </div>

            {/* ---- Summary ---- */}
            <div className="rounded-lg bg-gray-800 p-4 text-sm">
              <h4 className="mb-2 text-xs font-medium text-gray-400">Flash Summary</h4>
              <div className="space-y-1 text-xs">
                <p className="text-gray-300">
                  <span className="text-gray-500">Chip:</span> {flash.chipInfo?.chipName || "\u2014"}
                </p>
                <p className="text-gray-300">
                  <span className="text-gray-500">Firmware:</span> {firmwareSource || "Not loaded"}
                  {firmwareData && ` (${(firmwareData.length / 1024).toFixed(1)} KB)`}
                </p>
                <p className="text-gray-300">
                  <span className="text-gray-500">Segments:</span>{" "}
                  Firmware @ 0x0 + Thread Config @ 0x{THREAD_CONFIG_FLASH_OFFSET.toString(16).toUpperCase()}
                </p>
                <p className="text-gray-300">
                  <span className="text-gray-500">Network:</span>{" "}
                  {threadConfig.networkName} (Ch {threadConfig.channel}, PAN 0x{threadConfig.panId.toString(16).padStart(4, "0").toUpperCase()})
                </p>
                <p className="text-gray-300">
                  <span className="text-gray-500">LwM2M:</span>{" "}
                  coap://[{threadConfig.serverAddr}]:{threadConfig.serverPort}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setStep("connect")}
                className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
              >
                &larr; Back
              </button>
              <button
                onClick={handleFlash}
                disabled={!firmwareData}
                className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:bg-emerald-800 disabled:text-emerald-400"
              >
                Flash Thread Firmware
              </button>
            </div>
          </div>
        )}

        {/* ===================== STEP 3: FLASH ===================== */}
        {step === "flash" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">
              {flash.progress?.status === "done"
                ? "Flash Complete!"
                : flash.progress?.status === "error"
                  ? "Flash Failed"
                  : "Flashing..."}
            </h2>

            <FlashProgressPanel progress={flash.progress} logs={flash.logs} />

            {(flash.progress?.status === "done" || flash.progress?.status === "error") && (
              <div className="space-y-3">
                {flash.progress?.status === "done" && (
                  <div className="rounded-lg border border-green-800/50 bg-green-900/10 p-4">
                    <div className="flex items-start gap-3">
                      <svg className="mt-0.5 h-5 w-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <p className="text-sm font-medium text-green-300">Firmware flashed successfully!</p>
                        <p className="mt-1 text-xs text-gray-400">
                          Thread: <strong className="text-emerald-300">{threadConfig.networkName}</strong>{" "}
                          Ch {threadConfig.channel}, PAN 0x{threadConfig.panId.toString(16).padStart(4, "0").toUpperCase()}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleReset}
                    className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
                  >
                    Flash Another
                  </button>
                  {flash.progress?.status === "done" && (
                    <button
                      onClick={async () => {
                        try { await flash.hardReset(); } catch { /* ignore */ }
                      }}
                      className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-600"
                    >
                      Reset Device
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      try { await flash.disconnect(); } catch { /* ignore */ }
                      flash.clearLogs();
                      flash.clearError();
                      setStep("connect");
                    }}
                    className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
                  >
                    Disconnect
                  </button>
                  {flash.progress?.status === "error" && (
                    <button
                      onClick={handleFlash}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                    >
                      Retry
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

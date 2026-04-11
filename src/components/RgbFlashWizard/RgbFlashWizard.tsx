"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSerial } from "@/hooks/useSerial";
import { useFlash } from "@/hooks/useFlash";
import { SerialManager } from "@/lib/serial/SerialManager";
import type { FlashOptions } from "@/lib/flash/types";
import { DEFAULT_FLASH_OPTIONS } from "@/lib/flash/types";
import {
  generateLedConfigBlob,
  ledConfigBlobToBinaryString,
  LED_CONFIG_FLASH_OFFSET,
  LedMode,
  LED_MODE_LABELS,
  DEFAULT_LED_CONFIG,
  type LedConfig,
} from "@/lib/config/LedConfigGenerator";
import ChipInfoCard from "@/components/FlashWizard/ChipInfoCard";
import FlashProgressPanel from "@/components/FlashWizard/FlashProgressPanel";

type WizardStep = "connect" | "configure" | "flash";

const STEPS: { key: WizardStep; label: string; num: number }[] = [
  { key: "connect", label: "Connect", num: 1 },
  { key: "configure", label: "Configure", num: 2 },
  { key: "flash", label: "Flash", num: 3 },
];

/** Path to the locally-built zephyr-rgb merged binary */
const LOCAL_BIN_PATH = "/api/local-firmware/zephyr-rgb";

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

export default function RgbFlashWizard() {
  const [step, setStep] = useState<WizardStep>("connect");
  const [autoBootMode, setAutoBootMode] = useState(true);
  const [bootAttempting, setBootAttempting] = useState(false);

  // Firmware binary
  const [firmwareData, setFirmwareData] = useState<Uint8Array | null>(null);
  const [firmwareSource, setFirmwareSource] = useState<string>("");
  const [firmwareLoading, setFirmwareLoading] = useState(false);
  const [firmwareError, setFirmwareError] = useState<string>("");

  // Config
  const [ledConfig, setLedConfig] = useState<LedConfig>({
    ...DEFAULT_LED_CONFIG,
    mode: LedMode.Solid,
  });
  const [flashOptions] = useState<FlashOptions>({
    ...DEFAULT_FLASH_OPTIONS,
    eraseAll: false,
    compress: true,
    flashSize: "8MB",
  });

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

  // --- Load firmware binary (local build or file upload) ---
  const loadLocalBin = useCallback(async () => {
    setFirmwareLoading(true);
    setFirmwareError("");
    try {
      const resp = await fetch(LOCAL_BIN_PATH);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: local build not found`);
      const buf = await resp.arrayBuffer();
      setFirmwareData(new Uint8Array(buf));
      setFirmwareSource("Local build (zephyr-rgb)");
    } catch {
      setFirmwareError(
        "Local build not available. Upload the .bin file manually or build with: west build -b xiao_esp32c6/esp32c6 firmware/zephyr-rgb"
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

      // Classic DTR/RTS sequence
      await port.setSignals({ dataTerminalReady: false, requestToSend: true });
      await new Promise((r) => setTimeout(r, 100));
      await port.setSignals({ dataTerminalReady: true, requestToSend: false });
      await new Promise((r) => setTimeout(r, 50));
      await port.setSignals({ dataTerminalReady: false, requestToSend: false });
      await new Promise((r) => setTimeout(r, 100));
      // USB CDC/JTAG sequence for native USB (C6)
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
    setStep("flash");
    try {
      const segments = [
        { data: toBinaryString(firmwareData), address: 0x0, name: "RGB Firmware" },
      ];

      // LED config (always)
      const ledBlob = generateLedConfigBlob(ledConfig);
      segments.push({
        data: ledConfigBlobToBinaryString(ledBlob),
        address: LED_CONFIG_FLASH_OFFSET,
        name: "LED Config",
      });

      await flash.flash(segments, flashOptions);
    } catch (err) {
      console.error("Flash failed:", err);
    }
  }, [firmwareData, flash, flashOptions, ledConfig]);

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
    setLedConfig(DEFAULT_LED_CONFIG);
  }, [flash]);

  // Helper: computed LED preview color
  const previewR = Math.round((ledConfig.colorR * ledConfig.brightness) / 255);
  const previewG = Math.round((ledConfig.colorG * ledConfig.brightness) / 255);
  const previewB = Math.round((ledConfig.colorB * ledConfig.brightness) / 255);
  const hexColor = `#${ledConfig.colorR.toString(16).padStart(2, "0")}${ledConfig.colorG.toString(16).padStart(2, "0")}${ledConfig.colorB.toString(16).padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                i < currentStepIdx
                  ? "bg-purple-600 text-white"
                  : i === currentStepIdx
                    ? "bg-purple-600 text-white ring-2 ring-purple-400/50"
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
              <div className={`h-0.5 w-12 ${i < currentStepIdx ? "bg-purple-600" : "bg-gray-800"}`} />
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

            <div className="rounded-lg border border-purple-800/30 bg-purple-900/10 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-purple-600/20">
                  <svg className="h-5 w-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-purple-300">RGB LED Firmware</p>
                  <p className="mt-1 text-xs text-gray-400">
                    This wizard will flash the <strong className="text-gray-300">zephyr-rgb</strong> firmware
                    and configure the WS2812B LED on your ESP32-C6 SuperMini.
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
                  className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
                >
                  Continue to Configuration →
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={autoBootMode}
                    onChange={(e) => setAutoBootMode(e.target.checked)}
                    className="rounded border-gray-600 bg-gray-800 text-purple-600"
                  />
                  Auto-enter boot mode on connect (recommended)
                </label>

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleConnect}
                    disabled={flash.isConnecting}
                    className="rounded-lg bg-purple-600 px-6 py-3 font-medium text-white transition-colors hover:bg-purple-700 disabled:bg-purple-800 disabled:text-purple-400"
                  >
                    {flash.isConnecting ? "Connecting..." : "Select USB Port"}
                  </button>
                  <button
                    onClick={handleManualBoot}
                    disabled={bootAttempting}
                    className="rounded-lg border border-yellow-600 bg-yellow-900/30 px-4 py-3 font-medium text-yellow-300 transition-colors hover:bg-yellow-900/50 disabled:opacity-50"
                  >
                    {bootAttempting ? "Sending signals..." : "⚡ Force Boot Mode"}
                  </button>
                </div>

                {/* Boot instructions for C6 SuperMini */}
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
            <h2 className="text-lg font-semibold text-white">Configure RGB LED</h2>

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
                      className="rounded-lg border border-purple-700 bg-purple-900/30 px-3 py-2 text-xs font-medium text-purple-300 hover:bg-purple-900/50 disabled:opacity-50"
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
                    Select the RGB firmware binary. Use &quot;Local Build&quot; if you compiled with west, or upload from disk.
                  </p>
                </div>
              )}
            </div>

            {/* ---- RGB LED Config ---- */}
            <div className="rounded-lg border border-purple-800/50 bg-purple-900/10 p-4">
              <div className="mb-3 flex items-center gap-2">
                <svg className="h-4 w-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                <span className="text-sm font-medium text-purple-300">RGB LED Configuration</span>
              </div>
              <p className="mb-3 text-xs text-gray-400">
                Configure the onboard WS2812B LED behavior and color.
              </p>

              <div className="grid grid-cols-2 gap-4">
                {/* Mode selector */}
                <div>
                  <label className="mb-1 block text-xs text-gray-400">LED Mode</label>
                  <select
                    value={ledConfig.mode}
                    onChange={(e) =>
                      setLedConfig((c) => ({ ...c, mode: Number(e.target.value) as LedMode }))
                    }
                    className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-white"
                  >
                    {Object.entries(LED_MODE_LABELS)
                      .map(([val, label]) => (
                        <option key={val} value={val}>
                          {label}
                        </option>
                      ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    {ledConfig.mode === LedMode.Solid && "Constant color at set brightness"}
                    {ledConfig.mode === LedMode.Blink && "On/off blinking at set speed"}
                    {ledConfig.mode === LedMode.Breathe && "Smooth brightness fade in/out"}
                    {ledConfig.mode === LedMode.Rainbow && "Continuous hue rotation"}
                  </p>
                </div>

                {/* Color picker */}
                <div>
                  <label className="mb-1 block text-xs text-gray-400">Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={hexColor}
                      onChange={(e) => {
                        const hex = e.target.value.replace("#", "");
                        setLedConfig((c) => ({
                          ...c,
                          colorR: parseInt(hex.substring(0, 2), 16),
                          colorG: parseInt(hex.substring(2, 4), 16),
                          colorB: parseInt(hex.substring(4, 6), 16),
                        }));
                      }}
                      className="h-9 w-14 cursor-pointer rounded border border-gray-700 bg-gray-800"
                    />
                    <span className="font-mono text-xs text-gray-400">{hexColor.toUpperCase()}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {ledConfig.mode === LedMode.Rainbow ? "Color ignored in Rainbow mode" : "Base color for the LED"}
                  </p>
                </div>

                {/* Brightness slider */}
                <div>
                  <label className="mb-1 flex items-center justify-between text-xs text-gray-400">
                    <span>Brightness</span>
                    <span className="font-mono text-purple-400">
                      {Math.round((ledConfig.brightness / 255) * 100)}%
                    </span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={255}
                    value={ledConfig.brightness}
                    onChange={(e) =>
                      setLedConfig((c) => ({ ...c, brightness: Number(e.target.value) }))
                    }
                    className="w-full accent-purple-500"
                  />
                </div>

                {/* Speed slider */}
                <div>
                  <label className="mb-1 flex items-center justify-between text-xs text-gray-400">
                    <span>Speed</span>
                    <span className="font-mono text-purple-400">
                      {Math.round((ledConfig.speed / 255) * 100)}%
                    </span>
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={255}
                    value={ledConfig.speed}
                    onChange={(e) =>
                      setLedConfig((c) => ({ ...c, speed: Number(e.target.value) }))
                    }
                    className="w-full accent-purple-500"
                  />
                </div>
              </div>

              {/* Live preview */}
              <div className="mt-4 flex items-center gap-3 rounded-lg bg-gray-800/60 px-3 py-2">
                <div
                  className="h-8 w-8 rounded-full border-2 border-gray-600 shadow-lg"
                  style={{
                    backgroundColor: `rgb(${previewR}, ${previewG}, ${previewB})`,
                    boxShadow: `0 0 12px rgb(${previewR}, ${previewG}, ${previewB})`,
                  }}
                />
                <div>
                  <p className="text-xs font-medium text-gray-300">
                    {LED_MODE_LABELS[ledConfig.mode as LedMode]}
                  </p>
                  <p className="text-xs text-gray-500">
                    RGB({ledConfig.colorR}, {ledConfig.colorG}, {ledConfig.colorB}) at {Math.round((ledConfig.brightness / 255) * 100)}% brightness
                  </p>
                </div>
              </div>
            </div>

            {/* ---- Summary ---- */}
            <div className="rounded-lg bg-gray-800 p-4 text-sm">
              <h4 className="mb-2 text-xs font-medium text-gray-400">Flash Summary</h4>
              <div className="space-y-1 text-xs">
                <p className="text-gray-300">
                  <span className="text-gray-500">Chip:</span> {flash.chipInfo?.chipName || "—"}
                </p>
                <p className="text-gray-300">
                  <span className="text-gray-500">Firmware:</span> {firmwareSource || "Not loaded"}
                  {firmwareData && ` (${(firmwareData.length / 1024).toFixed(1)} KB)`}
                </p>
                <p className="text-gray-300">
                  <span className="text-gray-500">Segments:</span>{" "}
                  Firmware @ 0x0 + LED @ 0x{LED_CONFIG_FLASH_OFFSET.toString(16).toUpperCase()}
                </p>
                <p className="text-gray-300">
                  <span className="text-gray-500">Flash size:</span> 8 MB (ESP32-C6)
                </p>
                <p className="text-gray-300">
                  <span className="text-gray-500">LED:</span>{" "}
                  {LED_MODE_LABELS[ledConfig.mode as LedMode]}, {hexColor.toUpperCase()}, {Math.round((ledConfig.brightness / 255) * 100)}% brightness
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setStep("connect")}
                className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
              >
                ← Back
              </button>
              <button
                onClick={handleFlash}
                disabled={!firmwareData}
                className="rounded-lg bg-purple-600 px-6 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:bg-purple-800 disabled:text-purple-400"
              >
                Flash RGB Firmware ⚡
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
                          LED: <strong className="text-purple-300">{LED_MODE_LABELS[ledConfig.mode as LedMode]}</strong>
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
                      🔄 Reset Device
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
                      className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
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

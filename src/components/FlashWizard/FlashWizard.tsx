"use client";

import { useState, useCallback } from "react";
import { useSerial } from "@/hooks/useSerial";
import { useFlash } from "@/hooks/useFlash";
import { useFirmware } from "@/hooks/useFirmware";
import { SerialManager } from "@/lib/serial/SerialManager";
import type { FirmwareRelease, FirmwareAsset } from "@/lib/firmware/types";
import type { FlashOptions } from "@/lib/flash/types";
import {
  DEFAULT_FLASH_OPTIONS,
  FLASH_MODES,
  FLASH_FREQS,
  FLASH_SIZES,
} from "@/lib/flash/types";
import ChipInfoCard from "./ChipInfoCard";
import FlashProgressPanel from "./FlashProgressPanel";

type WizardStep = "connect" | "firmware" | "configure" | "flash";

const STEPS: { key: WizardStep; label: string; num: number }[] = [
  { key: "connect", label: "Connect", num: 1 },
  { key: "firmware", label: "Firmware", num: 2 },
  { key: "configure", label: "Configure", num: 3 },
  { key: "flash", label: "Flash", num: 4 },
];

interface SegmentFile {
  name: string;
  data: Uint8Array;
  role: "bootloader" | "partition" | "application" | "merged" | "custom";
}

/** Convert Uint8Array to binary string for esptool-js */
function toBinaryString(data: Uint8Array): string {
  // Use chunks to avoid call stack overflow on large files
  const chunks: string[] = [];
  const chunkSize = 8192;
  for (let i = 0; i < data.length; i += chunkSize) {
    const slice = data.subarray(i, Math.min(i + chunkSize, data.length));
    chunks.push(String.fromCharCode.apply(null, Array.from(slice)));
  }
  return chunks.join("");
}

export default function FlashWizard() {
  const [step, setStep] = useState<WizardStep>("connect");
  const [selectedRelease, setSelectedRelease] = useState<FirmwareRelease | null>(null);
  const [segmentFiles, setSegmentFiles] = useState<SegmentFile[]>([]);
  const [flashOptions, setFlashOptions] = useState<FlashOptions>(DEFAULT_FLASH_OPTIONS);
  const [autoBootMode, setAutoBootMode] = useState(true);
  const [bootAttempting, setBootAttempting] = useState(false);
  const serial = useSerial();
  const flash = useFlash();
  const firmware = useFirmware();

  const currentStepIdx = STEPS.findIndex((s) => s.key === step);

  // Step 1: Connect
  const handleConnect = useCallback(async () => {
    try {
      const manager = SerialManager.getInstance();
      await manager.requestPort();
      const port = manager.getPort();
      if (!port) throw new Error("No port selected");
      await flash.connect(port, autoBootMode);
      setStep("firmware");
    } catch (err) {
      console.error("Connection failed:", err);
    }
  }, [flash, autoBootMode]);

  // Manual boot mode entry on already-connected port
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

      // Open port temporarily if not open
      const wasOpen = port.readable !== null;
      if (!wasOpen) {
        await port.open({ baudRate: 115200 });
      }

      // Classic DTR/RTS sequence
      await port.setSignals({ dataTerminalReady: false, requestToSend: true });
      await new Promise((r) => setTimeout(r, 100));
      await port.setSignals({ dataTerminalReady: true, requestToSend: false });
      await new Promise((r) => setTimeout(r, 50));
      await port.setSignals({ dataTerminalReady: false, requestToSend: false });
      await new Promise((r) => setTimeout(r, 100));

      // USB CDC/JTAG sequence for native USB (C3/C6/S2/S3)
      await port.setSignals({ dataTerminalReady: false, requestToSend: false });
      await new Promise((r) => setTimeout(r, 100));
      await port.setSignals({ dataTerminalReady: true, requestToSend: true });
      await new Promise((r) => setTimeout(r, 100));
      await port.setSignals({ dataTerminalReady: false, requestToSend: true });
      await new Promise((r) => setTimeout(r, 100));
      await port.setSignals({ dataTerminalReady: true, requestToSend: false });
      await new Promise((r) => setTimeout(r, 100));
      await port.setSignals({ dataTerminalReady: false, requestToSend: false });

      if (!wasOpen) {
        await port.close();
      }

      setBootAttempting(false);
    } catch (err) {
      setBootAttempting(false);
      console.error("Boot mode entry failed:", err);
    }
  }, []);

  // Step 2: Select + download firmware binary from a release
  const handleSelectFirmware = useCallback(
    async (release: FirmwareRelease, asset: FirmwareAsset) => {
      setSelectedRelease(release);
      const buffer = await firmware.downloadBinary(asset.id);
      if (buffer) {
        const isMerged = asset.name.includes("merged");
        setSegmentFiles([
          {
            name: asset.name || "firmware.bin",
            data: new Uint8Array(buffer),
            role: isMerged ? "merged" : "application",
          },
        ]);
        setStep("configure");
      }
    },
    [firmware]
  );

  // Upload local file(s)
  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>, role: SegmentFile["role"]) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const data = new Uint8Array(reader.result as ArrayBuffer);
        setSegmentFiles((prev) => {
          // Replace if same role already exists
          const filtered = prev.filter((s) => s.role !== role);
          return [...filtered, { name: file.name, data, role }];
        });
        if (role === "application") {
          setSelectedRelease({
            id: 0,
            tagName: "local",
            body: "",
            name: file.name,
            publishedAt: new Date().toISOString(),
            assets: [],
          });
          setStep("configure");
        }
      };
      reader.readAsArrayBuffer(file);
    },
    []
  );

  const removeSegment = useCallback((role: SegmentFile["role"]) => {
    setSegmentFiles((prev) => prev.filter((s) => s.role !== role));
  }, []);

  // Step 3 → 4: Start flashing
  const handleFlash = useCallback(async () => {
    if (segmentFiles.length === 0 || !flash.chipInfo) return;
    setStep("flash");
    try {
      // Build segments from uploaded files
      const mergedFile = segmentFiles.find((s) => s.role === "merged");
      const appFile = segmentFiles.find((s) => s.role === "application");
      const bootFile = segmentFiles.find((s) => s.role === "bootloader");
      const partFile = segmentFiles.find((s) => s.role === "partition");

      let segments;
      if (mergedFile) {
        // Merged binary — flash at offset 0x0
        segments = [{ data: toBinaryString(mergedFile.data), address: 0x0, name: mergedFile.name }];
      } else {
        if (!appFile) throw new Error("Application firmware is required");
        segments = flash.buildSegments(
          toBinaryString(appFile.data),
          bootFile ? toBinaryString(bootFile.data) : undefined,
          partFile ? toBinaryString(partFile.data) : undefined
        );
      }

      // Add custom segments
      const customFiles = segmentFiles.filter((s) => s.role === "custom");
      for (const cf of customFiles) {
        segments.push({
          data: toBinaryString(cf.data),
          address: 0x10000, // Custom segments would need a user-specified address
          name: cf.name,
        });
      }

      await flash.flash(segments, flashOptions);
    } catch (err) {
      console.error("Flash failed:", err);
    }
  }, [segmentFiles, flash, flashOptions]);

  const handleReset = useCallback(() => {
    flash.clearLogs();
    flash.clearError();
    setStep("connect");
    setSelectedRelease(null);
    setSegmentFiles([]);
    setFlashOptions(DEFAULT_FLASH_OPTIONS);
  }, [flash]);

  return (
    <div className="space-y-6">
      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                i < currentStepIdx
                  ? "bg-blue-600 text-white"
                  : i === currentStepIdx
                    ? "bg-blue-600 text-white ring-2 ring-blue-400/50"
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
              <div className={`h-0.5 w-12 ${i < currentStepIdx ? "bg-blue-600" : "bg-gray-800"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Error Banner */}
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

      {/* Step Content */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
        {/* Step 1: Connect */}
        {step === "connect" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Connect Device</h2>
            <p className="text-sm text-gray-400">
              Connect your ESP32 device via USB. Make sure you have the correct USB
              driver installed (CP2102, CH340, or FTDI). For boards with native USB
              (ESP32-C3, C6, S2, S3), the built-in USB Serial/JTAG is used.
            </p>

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
                  onClick={() => setStep("firmware")}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Continue →
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Auto boot mode toggle */}
                <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={autoBootMode}
                    onChange={(e) => setAutoBootMode(e.target.checked)}
                    className="rounded border-gray-600 bg-gray-800 text-blue-600"
                  />
                  Auto-enter boot mode on connect (recommended)
                </label>

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleConnect}
                    disabled={serial.state === "connecting"}
                    className="rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:bg-blue-800 disabled:text-blue-400"
                  >
                    {serial.state === "connecting" ? "Connecting..." : "Select USB Port"}
                  </button>

                  <button
                    onClick={handleManualBoot}
                    disabled={bootAttempting}
                    className="rounded-lg border border-yellow-600 bg-yellow-900/30 px-4 py-3 font-medium text-yellow-300 transition-colors hover:bg-yellow-900/50 disabled:opacity-50"
                    title="Send DTR/RTS reset sequence to enter bootloader"
                  >
                    {bootAttempting ? "Sending signals..." : "⚡ Force Boot Mode"}
                  </button>
                </div>

                {/* Boot mode instructions - tabbed by board type */}
                <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
                  <p className="mb-3 text-xs font-medium text-gray-300">
                    If auto-boot fails, enter bootloader mode manually:
                  </p>

                  <div className="space-y-3">
                    {/* Generic ESP32 */}
                    <details className="group">
                      <summary className="cursor-pointer text-xs font-medium text-blue-400 hover:text-blue-300">
                        ESP32 / ESP32-S2 (USB-UART bridge)
                      </summary>
                      <ol className="mt-2 list-inside list-decimal space-y-1 pl-2 text-xs text-gray-400">
                        <li>Hold the <strong className="text-gray-300">BOOT</strong> (GPIO0) button</li>
                        <li>Press and release <strong className="text-gray-300">RESET</strong> (EN) button</li>
                        <li>Release the <strong className="text-gray-300">BOOT</strong> button</li>
                        <li>Click &quot;Select USB Port&quot; above</li>
                      </ol>
                    </details>

                    {/* XIAO ESP32-C6 */}
                    <details className="group" open>
                      <summary className="cursor-pointer text-xs font-medium text-blue-400 hover:text-blue-300">
                        XIAO ESP32-C6 / ESP32-C3 (native USB)
                      </summary>
                      <ol className="mt-2 list-inside list-decimal space-y-1 pl-2 text-xs text-gray-400">
                        <li>Hold the <strong className="text-gray-300">BOOT</strong> (B) button on the board</li>
                        <li>Press and release the <strong className="text-gray-300">RESET</strong> (R) button</li>
                        <li>Release the <strong className="text-gray-300">BOOT</strong> button</li>
                        <li>A <strong className="text-gray-300">new USB device</strong> may appear (USB Serial/JTAG)</li>
                        <li>Click &quot;Select USB Port&quot; and choose the <strong className="text-gray-300">USB JTAG/serial debug unit</strong></li>
                      </ol>
                      <p className="mt-2 text-xs text-yellow-400/80">
                        Tip: On XIAO C6, the BOOT (B) and RESET (R) buttons are tiny pads on the bottom of the board.
                        After entering boot mode, the USB port may re-enumerate. Select the new port when prompted.
                      </p>
                    </details>

                    {/* ESP32-S3 */}
                    <details className="group">
                      <summary className="cursor-pointer text-xs font-medium text-blue-400 hover:text-blue-300">
                        ESP32-S3 (native USB OTG)
                      </summary>
                      <ol className="mt-2 list-inside list-decimal space-y-1 pl-2 text-xs text-gray-400">
                        <li>Hold the <strong className="text-gray-300">BOOT</strong> (GPIO0) button</li>
                        <li>Press and release <strong className="text-gray-300">RESET</strong></li>
                        <li>Release <strong className="text-gray-300">BOOT</strong></li>
                        <li>If using USB OTG port, the device re-enumerates as <strong className="text-gray-300">ESP32-S3</strong></li>
                        <li>Select the new USB port when prompted</li>
                      </ol>
                    </details>
                  </div>
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

        {/* Step 2: Firmware */}
        {step === "firmware" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Select Firmware</h2>
            <p className="text-sm text-gray-400">
              Upload firmware binaries or choose from GitHub releases. You can upload
              multiple segments (bootloader, partition table, application).
            </p>

            {/* Multi-segment upload */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-white">Firmware Segments</h3>

              <SegmentUpload
                role="application"
                label="Application Binary"
                required
                description="Main firmware (.bin) — flashed at 0x10000"
                file={segmentFiles.find((s) => s.role === "application")}
                onUpload={(e) => handleFileUpload(e, "application")}
                onRemove={() => removeSegment("application")}
              />

              <SegmentUpload
                role="bootloader"
                label="Bootloader (optional)"
                description={`Bootloader binary — flashed at 0x${flash.getBootloaderOffset().toString(16)}`}
                file={segmentFiles.find((s) => s.role === "bootloader")}
                onUpload={(e) => handleFileUpload(e, "bootloader")}
                onRemove={() => removeSegment("bootloader")}
              />

              <SegmentUpload
                role="partition"
                label="Partition Table (optional)"
                description="Partition table — flashed at 0x8000"
                file={segmentFiles.find((s) => s.role === "partition")}
                onUpload={(e) => handleFileUpload(e, "partition")}
                onRemove={() => removeSegment("partition")}
              />
            </div>

            <div className="border-t border-gray-800 pt-4">
              <h3 className="text-sm font-medium text-white">Or choose from GitHub Releases</h3>
              <div className="mt-2 space-y-2">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => firmware.fetchReleases()}
                    disabled={firmware.loading}
                    className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700"
                  >
                    {firmware.loading ? "Loading..." : "Load Releases"}
                  </button>
                </div>

                {firmware.releases.length === 0 && !firmware.loading && (
                  <p className="py-4 text-center text-sm text-gray-500">
                    Click &quot;Load Releases&quot; or upload local binary files above.
                  </p>
                )}

                {firmware.releases.map((release) => {
                  const binAssets = release.assets.filter((a) => a.name.endsWith(".bin"));
                  return (
                    <div
                      key={release.id}
                      className="rounded-lg border border-gray-700 bg-gray-800 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-white">
                          {release.name || release.tagName}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(release.publishedAt).toLocaleDateString()}
                        </span>
                      </div>
                      {binAssets.length === 0 ? (
                        <p className="mt-2 text-xs text-gray-500">No .bin files in this release</p>
                      ) : (
                        <div className="mt-2 space-y-1">
                          {binAssets.map((asset) => (
                            <button
                              key={asset.id}
                              onClick={() => handleSelectFirmware(release, asset)}
                              className="flex w-full items-center justify-between rounded border border-gray-600 bg-gray-700/50 px-2.5 py-1.5 text-left transition-colors hover:bg-gray-600"
                            >
                              <span className="text-xs text-gray-200">{asset.name}</span>
                              <span className="text-xs text-gray-500">
                                {(asset.size / 1024).toFixed(0)} KB
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setStep("connect")}
                className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
              >
                ← Back
              </button>
              {segmentFiles.some((s) => s.role === "application" || s.role === "merged") && (
                <button
                  onClick={() => setStep("configure")}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Continue →
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Configure */}
        {step === "configure" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Configure Flash</h2>
            <p className="text-sm text-gray-400">Review settings before flashing.</p>

            {/* Summary */}
            <div className="rounded-lg bg-gray-800 p-4 text-sm">
              <div className="space-y-1.5">
                <p className="text-gray-300">
                  <span className="text-gray-500">Firmware:</span>{" "}
                  {selectedRelease?.name || selectedRelease?.tagName || "Local file"}
                </p>
                <p className="text-gray-300">
                  <span className="text-gray-500">Segments:</span>{" "}
                  {segmentFiles.length} file{segmentFiles.length !== 1 ? "s" : ""}
                </p>
                {segmentFiles.map((sf) => (
                  <p key={sf.role} className="pl-4 text-xs text-gray-400">
                    • {sf.name} ({(sf.data.length / 1024).toFixed(1)} KB) — {sf.role}
                  </p>
                ))}
                <p className="text-gray-300">
                  <span className="text-gray-500">Chip:</span>{" "}
                  {flash.chipInfo?.chipName || "Unknown"}
                </p>
              </div>
            </div>

            {/* Flash options */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="mb-1 block text-xs text-gray-400">Flash Mode</label>
                <select
                  value={flashOptions.flashMode}
                  onChange={(e) =>
                    setFlashOptions((o) => ({
                      ...o,
                      flashMode: e.target.value as FlashOptions["flashMode"],
                    }))
                  }
                  className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-white"
                >
                  {FLASH_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-400">Flash Frequency</label>
                <select
                  value={flashOptions.flashFreq}
                  onChange={(e) =>
                    setFlashOptions((o) => ({
                      ...o,
                      flashFreq: e.target.value as FlashOptions["flashFreq"],
                    }))
                  }
                  className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-white"
                >
                  {FLASH_FREQS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-400">Flash Size</label>
                <select
                  value={flashOptions.flashSize}
                  onChange={(e) =>
                    setFlashOptions((o) => ({
                      ...o,
                      flashSize: e.target.value as FlashOptions["flashSize"],
                    }))
                  }
                  className="w-full rounded border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-white"
                >
                  {FLASH_SIZES.map((s) => (
                    <option key={s} value={s}>
                      {s === "detect" ? "Auto Detect" : s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={flashOptions.eraseAll}
                onChange={(e) =>
                  setFlashOptions((o) => ({ ...o, eraseAll: e.target.checked }))
                }
                className="rounded border-gray-600 bg-gray-800 text-blue-600"
              />
              Erase entire flash before writing
            </label>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={flashOptions.compress}
                onChange={(e) =>
                  setFlashOptions((o) => ({ ...o, compress: e.target.checked }))
                }
                className="rounded border-gray-600 bg-gray-800 text-blue-600"
              />
              Compress data during transfer
            </label>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("firmware")}
                className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
              >
                ← Back
              </button>
              <button
                onClick={handleFlash}
                disabled={segmentFiles.length === 0}
                className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-800 disabled:text-blue-400"
              >
                Start Flash ⚡
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Flash */}
        {step === "flash" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white">
              {flash.progress?.status === "done"
                ? "Flash Complete"
                : flash.progress?.status === "error"
                  ? "Flash Failed"
                  : "Flashing..."}
            </h2>

            <FlashProgressPanel progress={flash.progress} logs={flash.logs} />

            {/* Completion actions */}
            {(flash.progress?.status === "done" || flash.progress?.status === "error") && (
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleReset}
                  className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
                >
                  Flash Another
                </button>
                <button
                  onClick={() => flash.disconnect()}
                  className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
                >
                  Disconnect
                </button>
                {flash.progress?.status === "error" && (
                  <button
                    onClick={handleFlash}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Individual segment upload row */
function SegmentUpload({
  label,
  description,
  required,
  file,
  onUpload,
  onRemove,
}: {
  role: string;
  label: string;
  description: string;
  required?: boolean;
  file?: SegmentFile;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm text-white">
            {label}
            {required && <span className="ml-1 text-red-400">*</span>}
          </span>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
        {file ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-green-400">
              {file.name} ({(file.data.length / 1024).toFixed(1)} KB)
            </span>
            <button
              onClick={onRemove}
              className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-red-400"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <label className="cursor-pointer rounded-lg border border-gray-600 bg-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-600">
            Browse
            <input type="file" accept=".bin" onChange={onUpload} className="hidden" />
          </label>
        )}
      </div>
    </div>
  );
}

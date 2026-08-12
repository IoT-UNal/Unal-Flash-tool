"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSerial } from "@/hooks/useSerial";
import { useFlash } from "@/hooks/useFlash";
import { useBuild } from "@/hooks/useBuild";
import type { FlashOptions } from "@/lib/flash/types";
import { DEFAULT_FLASH_OPTIONS } from "@/lib/flash/types";
import {
  DEFAULT_AMI_CONFIG,
  validateAmiConfig,
  type AmiConfig,
} from "@/lib/config/AmiOverlayGenerator";
import type { AmiWizardStep } from "./types";
import StepIndicator from "./StepIndicator";
import OverviewStep from "./OverviewStep";
import ThreadConfigStep from "./ThreadConfigStep";
import Lwm2mConfigStep from "./Lwm2mConfigStep";
import MeterConfigStep from "./MeterConfigStep";
import BuildStep from "./BuildStep";
import ConnectStep from "./ConnectStep";
import FlashStep from "./FlashStep";
import VerifyStep from "./VerifyStep";

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

export default function AmiFlashWizard() {
  const [step, setStep] = useState<AmiWizardStep>("overview");
  const [config, setConfig] = useState<AmiConfig>({ ...DEFAULT_AMI_CONFIG });
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [firmwareData, setFirmwareData] = useState<Uint8Array | null>(null);
  const [firmwareSource, setFirmwareSource] = useState("");
  const [flashComplete, setFlashComplete] = useState(false);

  const [flashOptions] = useState<FlashOptions>({
    ...DEFAULT_FLASH_OPTIONS,
    eraseAll: false,
    compress: true,
    flashSize: "8MB",
  });

  const serial = useSerial();
  const flash = useFlash();
  const build = useBuild();

  const flashDisconnectRef = useRef(flash.disconnect);
  flashDisconnectRef.current = flash.disconnect;

  useEffect(() => {
    return () => {
      flashDisconnectRef.current().catch(() => {});
    };
  }, []);

  // --- Config update ---
  const handleConfigChange = useCallback((patch: Partial<AmiConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
    setValidationErrors({});
  }, []);

  // --- Validation ---
  const validateStep = useCallback(
    (targetStep: AmiWizardStep): boolean => {
      if (
        targetStep === "lwm2m-config" ||
        targetStep === "meter-config" ||
        targetStep === "build"
      ) {
        const errors = validateAmiConfig(config);
        setValidationErrors(errors);
        return Object.keys(errors).length === 0;
      }
      return true;
    },
    [config]
  );

  // --- Navigation ---
  const goTo = useCallback(
    (target: AmiWizardStep) => {
      if (validateStep(target)) {
        setStep(target);
      }
    },
    [validateStep]
  );

  // --- Connect ---
  const handleConnect = useCallback(
    async (port: SerialPort, autoBootMode: boolean) => {
      await flash.connect(port, autoBootMode);
    },
    [flash]
  );

  // --- Firmware loaded ---
  const handleFirmwareLoaded = useCallback((data: Uint8Array, source: string) => {
    setFirmwareData(data);
    setFirmwareSource(source);
  }, []);

  // --- Flash ---
  const handleFlash = useCallback(async () => {
    if (!firmwareData || !flash.chipInfo) return;
    setFlashComplete(false);
    try {
      const segments = [
        { data: toBinaryString(firmwareData), address: 0x0, name: "AMI LwM2M Firmware" },
      ];
      await flash.flash(segments, flashOptions);
      setFlashComplete(true);
    } catch (err) {
      console.error("Flash failed:", err);
    }
  }, [firmwareData, flash, flashOptions]);

  // --- Reset ---
  const handleReset = useCallback(async () => {
    try {
      await flash.disconnect();
    } catch {
      /* ignore */
    }
    flash.clearLogs();
    flash.clearError();
    build.reset();
    setStep("overview");
    setConfig({ ...DEFAULT_AMI_CONFIG });
    setFirmwareData(null);
    setFirmwareSource("");
    setFlashComplete(false);
    setValidationErrors({});
  }, [flash, build]);

  return (
    <div className="space-y-6">
      <StepIndicator currentStep={step} />

      {/* Error banner */}
      {flash.error && step !== "flash" && (
        <div className="rounded-lg border border-red-800 bg-red-900/20 p-4">
          <div className="flex items-start gap-3">
            <svg
              className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-red-300">{flash.error.message}</p>
              {flash.error.suggestion && (
                <p className="mt-1 text-xs text-red-400/80">{flash.error.suggestion}</p>
              )}
            </div>
            <button onClick={flash.clearError} className="text-red-400 hover:text-red-300">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Firmware source indicator */}
      {firmwareSource && step !== "overview" && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="w-2 h-2 bg-green-500 rounded-full" />
          Firmware: {firmwareSource} ({firmwareData ? `${(firmwareData.length / 1024).toFixed(1)} KB` : ""})
        </div>
      )}

      {/* Step content */}
      {step === "overview" && <OverviewStep onNext={() => goTo("thread-config")} />}

      {step === "thread-config" && (
        <ThreadConfigStep
          config={config}
          onChange={handleConfigChange}
          errors={validationErrors}
          onNext={() => goTo("lwm2m-config")}
          onBack={() => goTo("overview")}
        />
      )}

      {step === "lwm2m-config" && (
        <Lwm2mConfigStep
          config={config}
          onChange={handleConfigChange}
          errors={validationErrors}
          onNext={() => goTo("meter-config")}
          onBack={() => goTo("thread-config")}
        />
      )}

      {step === "meter-config" && (
        <MeterConfigStep
          config={config}
          onChange={handleConfigChange}
          onNext={() => goTo("build")}
          onBack={() => goTo("lwm2m-config")}
        />
      )}

      {step === "build" && (
        <BuildStep
          config={config}
          build={build}
          firmwareData={firmwareData}
          onFirmwareLoaded={handleFirmwareLoaded}
          onNext={() => goTo("connect")}
          onBack={() => goTo("meter-config")}
        />
      )}

      {step === "connect" && (
        <ConnectStep
          chipInfo={flash.chipInfo}
          isConnected={flash.isConnected}
          onConnect={handleConnect}
          isSerialSupported={serial.isSupported}
          onNext={() => goTo("flash")}
          onBack={() => goTo("build")}
        />
      )}

      {step === "flash" && (
        <FlashStep
          progress={flash.progress ?? { fileIndex: 0, totalFiles: 0, written: 0, total: 0, percentage: 0, status: "connecting", message: "" }}
          logs={flash.logs}
          error={flash.error}
          isFlashing={flash.progress?.status === "writing" || flash.progress?.status === "erasing"}
          isComplete={flashComplete}
          onFlash={handleFlash}
          onClearError={flash.clearError}
          onNext={() => goTo("verify")}
          onBack={() => goTo("connect")}
        />
      )}

      {step === "verify" && <VerifyStep config={config} onReset={handleReset} />}
    </div>
  );
}

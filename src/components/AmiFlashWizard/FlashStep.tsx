import FlashProgressPanel from "@/components/FlashWizard/FlashProgressPanel";
import type { FlashProgress, FlashError } from "@/lib/flash/types";

interface FlashStepProps {
  progress: FlashProgress;
  logs: string[];
  error: FlashError | null;
  isFlashing: boolean;
  isComplete: boolean;
  onFlash: () => void;
  onClearError: () => void;
  onNext: () => void;
  onBack: () => void;
}

export default function FlashStep({
  progress,
  logs,
  error,
  isFlashing,
  isComplete,
  onFlash,
  onClearError,
  onNext,
  onBack,
}: FlashStepProps) {
  return (
    <div className="space-y-5">
      <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
        <h3 className="text-base font-semibold text-amber-400 mb-1">Flash Firmware</h3>
        <p className="text-xs text-gray-500 mb-4">
          Write the AMI LwM2M firmware to the ESP32-C6 flash memory at offset 0x0.
        </p>

        {/* Error */}
        {error && (
          <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-3 mb-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-red-400">{error.message}</p>
                {error.suggestion && (
                  <p className="text-xs text-red-400/70 mt-1">{error.suggestion}</p>
                )}
              </div>
              <button onClick={onClearError} className="text-red-400 hover:text-red-300 text-xs">
                Dismiss
              </button>
            </div>
          </div>
        )}

        {!isFlashing && !isComplete && (
          <button
            onClick={onFlash}
            className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium transition-colors"
          >
            Start Flashing
          </button>
        )}

        {(isFlashing || isComplete) && (
          <FlashProgressPanel progress={progress} logs={logs} />
        )}

        {isComplete && !error && (
          <div className="mt-4 bg-green-900/20 border border-green-700/30 rounded-lg p-3 text-sm text-green-400">
            Flash complete! The device has been programmed successfully.
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          disabled={isFlashing}
          className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!isComplete || !!error}
          className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-colors ${
            isComplete && !error
              ? "bg-amber-600 hover:bg-amber-500 text-white"
              : "bg-gray-600 text-gray-400 cursor-not-allowed"
          }`}
        >
          Next: Verify & Connect
        </button>
      </div>
    </div>
  );
}

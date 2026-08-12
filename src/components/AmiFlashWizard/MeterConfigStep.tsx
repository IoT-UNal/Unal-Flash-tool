import type { AmiConfig } from "@/lib/config/AmiOverlayGenerator";
import { generateOverlayConf } from "@/lib/config/AmiOverlayGenerator";

interface MeterConfigStepProps {
  config: AmiConfig;
  onChange: (patch: Partial<AmiConfig>) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function MeterConfigStep({
  config,
  onChange,
  onNext,
  onBack,
}: MeterConfigStepProps) {
  const overlay = generateOverlayConf(config);

  return (
    <div className="space-y-5">
      <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
        <h3 className="text-base font-semibold text-amber-400 mb-1">Meter Configuration</h3>
        <p className="text-xs text-gray-500 mb-4">
          Configure the smart meter type and operating mode. These settings are compiled
          into the firmware and affect which OBIS codes are read.
        </p>

        <div className="space-y-4">
          {/* Single Phase */}
          <div className="flex items-start gap-3 p-3 bg-gray-900/50 rounded-lg">
            <label className="relative inline-flex items-center cursor-pointer mt-0.5">
              <input
                type="checkbox"
                checked={config.singlePhase}
                onChange={(e) => onChange({ singlePhase: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600"></div>
            </label>
            <div>
              <p className="text-sm text-gray-200">Single-phase meter</p>
              <p className="text-xs text-gray-500">
                {config.singlePhase
                  ? "Enabled — skips Phase S/T OBIS codes, saves ~5s per poll cycle"
                  : "Disabled — all 28 OBIS codes for 3-phase meter (Phase R, S, T)"}
              </p>
            </div>
          </div>

          {/* Demo Mode */}
          <div className="flex items-start gap-3 p-3 bg-gray-900/50 rounded-lg">
            <label className="relative inline-flex items-center cursor-pointer mt-0.5">
              <input
                type="checkbox"
                checked={config.demoMode}
                onChange={(e) => onChange({ demoMode: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600"></div>
            </label>
            <div>
              <p className="text-sm text-gray-200">Demo mode</p>
              <p className="text-xs text-gray-500">
                {config.demoMode
                  ? "Enabled — generates synthetic meter readings (no physical meter needed)"
                  : "Disabled — reads real data from DLMS/COSEM meter via RS-485"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Overlay Preview */}
      <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
        <h4 className="text-sm font-medium text-gray-300 mb-2">
          Configuration Preview <span className="text-gray-500">(prj.conf overlay)</span>
        </h4>
        <pre className="bg-gray-900 rounded p-3 text-xs text-gray-400 font-mono overflow-x-auto max-h-48 overflow-y-auto">
          {overlay}
        </pre>
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors">
          Back
        </button>
        <button onClick={onNext} className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium text-sm transition-colors">
          Next: Build Firmware
        </button>
      </div>
    </div>
  );
}

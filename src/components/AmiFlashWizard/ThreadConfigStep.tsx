import type { AmiConfig } from "@/lib/config/AmiOverlayGenerator";

interface ThreadConfigStepProps {
  config: AmiConfig;
  onChange: (patch: Partial<AmiConfig>) => void;
  errors: Record<string, string>;
  onNext: () => void;
  onBack: () => void;
}

export default function ThreadConfigStep({
  config,
  onChange,
  errors,
  onNext,
  onBack,
}: ThreadConfigStepProps) {
  return (
    <div className="space-y-5">
      <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
        <h3 className="text-base font-semibold text-amber-400 mb-1">Thread Network Configuration</h3>
        <p className="text-xs text-gray-500 mb-4">
          These credentials must match your OpenThread Border Router (OTBR). All nodes on the
          same Thread network share the same channel, PAN ID, and network key.
        </p>

        <div className="space-y-4">
          {/* Network Name */}
          <div>
            <label className="block text-sm text-gray-300 mb-1">Network Name</label>
            <input
              type="text"
              maxLength={16}
              value={config.threadNetworkName}
              onChange={(e) => onChange({ threadNetworkName: e.target.value })}
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
              placeholder="UNAL-Thread"
            />
            {errors.threadNetworkName && (
              <p className="text-xs text-red-400 mt-1">{errors.threadNetworkName}</p>
            )}
          </div>

          {/* Channel */}
          <div>
            <label className="block text-sm text-gray-300 mb-1">
              Channel <span className="text-gray-500">(11-26)</span>
            </label>
            <select
              value={config.threadChannel}
              onChange={(e) => onChange({ threadChannel: Number(e.target.value) })}
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
            >
              {Array.from({ length: 16 }, (_, i) => i + 11).map((ch) => (
                <option key={ch} value={ch}>
                  Channel {ch} {ch === 25 ? "(default)" : ""}
                </option>
              ))}
            </select>
            {errors.threadChannel && (
              <p className="text-xs text-red-400 mt-1">{errors.threadChannel}</p>
            )}
          </div>

          {/* PAN ID */}
          <div>
            <label className="block text-sm text-gray-300 mb-1">
              PAN ID <span className="text-gray-500">(decimal, 0-65534)</span>
            </label>
            <input
              type="number"
              min={0}
              max={65534}
              value={config.threadPanId}
              onChange={(e) => onChange({ threadPanId: Number(e.target.value) })}
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none"
              placeholder="9197"
            />
            <p className="text-xs text-gray-500 mt-1">
              9197 decimal = 0x23ED hex
            </p>
            {errors.threadPanId && (
              <p className="text-xs text-red-400 mt-1">{errors.threadPanId}</p>
            )}
          </div>

          {/* Network Key */}
          <div>
            <label className="block text-sm text-gray-300 mb-1">
              Network Key <span className="text-gray-500">(16 bytes, colon-separated)</span>
            </label>
            <input
              type="text"
              value={config.threadNetworkKey}
              onChange={(e) => onChange({ threadNetworkKey: e.target.value })}
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-xs text-white font-mono focus:border-amber-500 focus:outline-none"
              placeholder="5e:de:be:ad:64:40:5b:3e:17:19:36:46:c2:94:22:85"
            />
            {errors.threadNetworkKey && (
              <p className="text-xs text-red-400 mt-1">{errors.threadNetworkKey}</p>
            )}
          </div>

          {/* Extended PAN ID */}
          <div>
            <label className="block text-sm text-gray-300 mb-1">
              Extended PAN ID <span className="text-gray-500">(8 bytes, colon-separated)</span>
            </label>
            <input
              type="text"
              value={config.threadExtPanId}
              onChange={(e) => onChange({ threadExtPanId: e.target.value })}
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-xs text-white font-mono focus:border-amber-500 focus:outline-none"
              placeholder="1a:25:78:dd:6e:e3:57:3b"
            />
            {errors.threadExtPanId && (
              <p className="text-xs text-red-400 mt-1">{errors.threadExtPanId}</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors">
          Back
        </button>
        <button onClick={onNext} className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium text-sm transition-colors">
          Next: LwM2M Server
        </button>
      </div>
    </div>
  );
}

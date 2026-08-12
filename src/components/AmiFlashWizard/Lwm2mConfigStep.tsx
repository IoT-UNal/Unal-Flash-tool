import { useState } from "react";
import type { AmiConfig } from "@/lib/config/AmiOverlayGenerator";
import { ipv4ToNat64 } from "@/lib/config/AmiOverlayGenerator";

interface Lwm2mConfigStepProps {
  config: AmiConfig;
  onChange: (patch: Partial<AmiConfig>) => void;
  errors: Record<string, string>;
  onNext: () => void;
  onBack: () => void;
}

export default function Lwm2mConfigStep({
  config,
  onChange,
  errors,
  onNext,
  onBack,
}: Lwm2mConfigStepProps) {
  const [ipv4Input, setIpv4Input] = useState("192.168.1.111");
  const [showNat64Helper, setShowNat64Helper] = useState(false);

  const handleNat64Convert = () => {
    const ipv6 = ipv4ToNat64(ipv4Input);
    if (ipv6) {
      onChange({ lwm2mServerPrimary: ipv6 });
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
        <h3 className="text-base font-semibold text-amber-400 mb-1">LwM2M Server Configuration</h3>
        <p className="text-xs text-gray-500 mb-4">
          Configure the IPv6 address of your ThingsBoard Edge LwM2M transport.
          Thread is IPv6-only, so you need the IPv6 address reachable from the mesh.
        </p>

        <div className="space-y-4">
          {/* NAT64 Helper */}
          <div className="bg-amber-900/10 border border-amber-700/30 rounded-lg p-3">
            <button
              type="button"
              onClick={() => setShowNat64Helper(!showNat64Helper)}
              className="flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300 w-full"
            >
              <svg className={`w-4 h-4 transition-transform ${showNat64Helper ? "rotate-90" : ""}`} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
              IPv4 to IPv6 Helper (ThingsBoard at 192.168.1.111)
            </button>

            {showNat64Helper && (
              <div className="mt-3 space-y-3">
                <p className="text-xs text-gray-400">
                  If your OTBR has NAT64 enabled, you can convert the ThingsBoard Edge IPv4
                  address to an IPv6 NAT64 address using the well-known prefix <code className="text-amber-300">64:ff9b::/96</code>.
                </p>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={ipv4Input}
                    onChange={(e) => setIpv4Input(e.target.value)}
                    className="flex-1 bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-white font-mono focus:border-amber-500 focus:outline-none"
                    placeholder="192.168.1.111"
                  />
                  <button
                    onClick={handleNat64Convert}
                    className="px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-white text-xs rounded transition-colors"
                  >
                    Convert to NAT64
                  </button>
                </div>

                {ipv4Input && ipv4ToNat64(ipv4Input) && (
                  <p className="text-xs text-gray-400">
                    NAT64: <code className="text-green-400">{ipv4ToNat64(ipv4Input)}</code>
                  </p>
                )}

                <div className="border-t border-gray-700 pt-2">
                  <p className="text-xs text-gray-500">
                    <strong>Alternative:</strong> Get the OTBR&apos;s mesh-local EID:
                  </p>
                  <code className="block text-xs text-amber-300 bg-gray-900 rounded px-2 py-1 mt-1">
                    ot-ctl ipaddr mleid
                  </code>
                  <p className="text-xs text-gray-500 mt-1">
                    Or from the OTBR web UI at <code>http://&lt;otbr-ip&gt;:8080</code>
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Primary server */}
          <div>
            <label className="block text-sm text-gray-300 mb-1">Primary LwM2M Server IPv6</label>
            <input
              type="text"
              value={config.lwm2mServerPrimary}
              onChange={(e) => onChange({ lwm2mServerPrimary: e.target.value })}
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-white font-mono focus:border-amber-500 focus:outline-none"
              placeholder="fd7d:f3c4:1736:1:89c1:9628:a3e4:f477"
            />
            {errors.lwm2mServerPrimary && (
              <p className="text-xs text-red-400 mt-1">{errors.lwm2mServerPrimary}</p>
            )}
          </div>

          {/* Secondary server */}
          <div>
            <label className="block text-sm text-gray-300 mb-1">
              Secondary LwM2M Server IPv6 <span className="text-gray-500">(optional, failover)</span>
            </label>
            <input
              type="text"
              value={config.lwm2mServerSecondary}
              onChange={(e) => onChange({ lwm2mServerSecondary: e.target.value })}
              className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-sm text-white font-mono focus:border-amber-500 focus:outline-none"
              placeholder="fdf5:bffd:bd6:ef74:b080:b8c3:367f:147f"
            />
            {errors.lwm2mServerSecondary && (
              <p className="text-xs text-red-400 mt-1">{errors.lwm2mServerSecondary}</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors">
          Back
        </button>
        <button onClick={onNext} className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium text-sm transition-colors">
          Next: Meter Config
        </button>
      </div>
    </div>
  );
}

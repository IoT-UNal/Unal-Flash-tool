import type { AmiConfig } from "@/lib/config/AmiOverlayGenerator";

interface VerifyStepProps {
  config: AmiConfig;
  onReset: () => void;
}

export default function VerifyStep({ config, onReset }: VerifyStepProps) {
  const endpointName = `ami-esp32c6-XXXX`; // The firmware derives this from the MAC

  return (
    <div className="space-y-5">
      {/* Success banner */}
      <div className="bg-green-900/20 border border-green-700/30 rounded-lg p-5 text-center">
        <div className="text-3xl mb-2">&#10003;</div>
        <h3 className="text-lg font-semibold text-green-400">Firmware Flashed Successfully!</h3>
        <p className="text-sm text-gray-400 mt-1">
          Your AMI LwM2M node is ready. Follow the steps below to connect it to ThingsBoard Edge.
        </p>
      </div>

      {/* Step 1: Power cycle */}
      <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
        <div className="flex items-start gap-3">
          <span className="flex-shrink-0 w-6 h-6 bg-amber-600 rounded-full flex items-center justify-center text-xs font-bold text-white">1</span>
          <div>
            <h4 className="text-sm font-medium text-gray-200">Power Cycle the Device</h4>
            <p className="text-xs text-gray-500 mt-1">
              Unplug and reconnect the ESP32-C6. The firmware will boot and attempt to join
              the Thread network <strong>&ldquo;{config.threadNetworkName}&rdquo;</strong> on channel {config.threadChannel}.
            </p>
            <div className="mt-2 bg-gray-900 rounded p-2 text-xs text-gray-400 font-mono">
              <p>Expected serial output (115200 baud):</p>
              <p className="text-green-400 mt-1">*** Booting Zephyr OS ***</p>
              <p className="text-green-400">[ami] AMI LwM2M Node starting...</p>
              <p className="text-green-400">[ami] Thread network: joining...</p>
              <p className="text-green-400">[ami] Thread attached! RLOC16: 0xXXXX</p>
            </div>
          </div>
        </div>
      </div>

      {/* Step 2: Verify Thread */}
      <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
        <div className="flex items-start gap-3">
          <span className="flex-shrink-0 w-6 h-6 bg-amber-600 rounded-full flex items-center justify-center text-xs font-bold text-white">2</span>
          <div>
            <h4 className="text-sm font-medium text-gray-200">Verify Thread Connection</h4>
            <p className="text-xs text-gray-500 mt-1">
              Open the serial terminal (Terminal page) and check the node joined the mesh:
            </p>
            <div className="mt-2 bg-gray-900 rounded p-2 text-xs font-mono">
              <p className="text-amber-300">uart:~$ ot state</p>
              <p className="text-green-400">router</p>
              <p className="text-amber-300">uart:~$ ot ipaddr</p>
              <p className="text-green-400">fd7d:f3c4:1736:1:xxxx:xxxx:xxxx:xxxx</p>
            </div>
          </div>
        </div>
      </div>

      {/* Step 3: ThingsBoard Edge setup */}
      <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
        <div className="flex items-start gap-3">
          <span className="flex-shrink-0 w-6 h-6 bg-amber-600 rounded-full flex items-center justify-center text-xs font-bold text-white">3</span>
          <div>
            <h4 className="text-sm font-medium text-gray-200">Create Device Profile in ThingsBoard Edge</h4>
            <p className="text-xs text-gray-500 mt-1">
              Open ThingsBoard Edge at <code className="text-amber-300">http://192.168.1.111:8080</code>
            </p>
            <ol className="text-xs text-gray-400 mt-2 space-y-1.5 list-decimal list-inside">
              <li>Go to <strong>Device Profiles</strong> &rarr; <strong>+</strong> (Add)</li>
              <li>Name: <code className="text-amber-300">AMI Smart Meter LwM2M</code></li>
              <li>Transport type: <strong>LwM2M</strong></li>
              <li>
                Add observed objects:
                <ul className="ml-4 mt-1 space-y-0.5 list-disc">
                  <li><code>/3/0</code> — Device (manufacturer, firmware version)</li>
                  <li><code>/4_1.3/0</code> — Connectivity Monitoring v1.3</li>
                  <li><code>/10242/0</code> — Custom 3-Phase Power Meter</li>
                  <li><code>/10483/0</code> — Thread Network Config</li>
                </ul>
              </li>
              <li>Observe strategy: <strong>SINGLE</strong></li>
              <li>pmin: <strong>15</strong>, pmax: <strong>30</strong> (for telemetry)</li>
              <li>Save the profile</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Step 4: Add device */}
      <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
        <div className="flex items-start gap-3">
          <span className="flex-shrink-0 w-6 h-6 bg-amber-600 rounded-full flex items-center justify-center text-xs font-bold text-white">4</span>
          <div>
            <h4 className="text-sm font-medium text-gray-200">Add Device in ThingsBoard</h4>
            <ol className="text-xs text-gray-400 mt-2 space-y-1.5 list-decimal list-inside">
              <li>Go to <strong>Devices</strong> &rarr; <strong>+</strong> (Add new device)</li>
              <li>Name: your node identifier (e.g., <code className="text-amber-300">AMI-Node-001</code>)</li>
              <li>Device profile: <code className="text-amber-300">AMI Smart Meter LwM2M</code></li>
              <li>
                Credentials tab &rarr; <strong>LwM2M Credentials</strong>:
                <ul className="ml-4 mt-1 space-y-0.5 list-disc">
                  <li>Security mode: <strong>No Security</strong></li>
                  <li>
                    Endpoint: <code className="text-amber-300">{endpointName}</code>
                    <p className="text-gray-500 italic mt-0.5">
                      (Check the serial log for the actual endpoint: &ldquo;LwM2M endpoint: ami-esp32c6-XXXX&rdquo;)
                    </p>
                  </li>
                </ul>
              </li>
              <li>Save</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Step 5: Verify telemetry */}
      <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
        <div className="flex items-start gap-3">
          <span className="flex-shrink-0 w-6 h-6 bg-amber-600 rounded-full flex items-center justify-center text-xs font-bold text-white">5</span>
          <div>
            <h4 className="text-sm font-medium text-gray-200">Verify Telemetry</h4>
            <p className="text-xs text-gray-500 mt-1">
              After the node registers with ThingsBoard (may take up to 60 seconds):
            </p>
            <ol className="text-xs text-gray-400 mt-2 space-y-1 list-decimal list-inside">
              <li>Open your device in ThingsBoard &rarr; <strong>Latest Telemetry</strong></li>
              <li>
                Expected keys (Object 10242):
                <div className="grid grid-cols-2 gap-x-4 mt-1 ml-4">
                  <span>&#x2022; voltage_r (V)</span>
                  <span>&#x2022; current_r (A)</span>
                  <span>&#x2022; active_power_r (W)</span>
                  <span>&#x2022; power_factor_r</span>
                  <span>&#x2022; frequency (Hz)</span>
                  <span>&#x2022; total_energy (kWh)</span>
                </div>
              </li>
              <li>
                {config.demoMode
                  ? "Demo mode is active — values are synthetic but realistic"
                  : "Real meter data — verify RS-485 cable is connected to the smart meter"}
              </li>
            </ol>
          </div>
        </div>
      </div>

      {/* Troubleshooting */}
      <details className="bg-gray-800/50 rounded-lg border border-gray-700">
        <summary className="p-4 text-sm text-gray-400 cursor-pointer hover:text-gray-300">
          Troubleshooting
        </summary>
        <div className="px-4 pb-4 text-xs text-gray-500 space-y-2">
          <p>
            <strong className="text-gray-400">Node doesn&apos;t join Thread:</strong> Verify
            channel ({config.threadChannel}), PAN ID ({config.threadPanId}), and network key
            match your OTBR. Run <code>ot dataset active</code> on OTBR to compare.
          </p>
          <p>
            <strong className="text-gray-400">LwM2M registration fails:</strong> Check that
            the server IPv6 <code>{config.lwm2mServerPrimary}</code> is reachable.
            Run <code>ot ping {config.lwm2mServerPrimary}</code> from the shell.
          </p>
          <p>
            <strong className="text-gray-400">No telemetry in ThingsBoard:</strong> Verify
            the endpoint name matches exactly. Check TB Edge logs for LwM2M registration events.
          </p>
          <p>
            <strong className="text-gray-400">Device shows &ldquo;connecting&rdquo; forever:</strong> The
            node retries every ~5s. Check serial log for registration timeout errors. The node
            automatically switches to the secondary server after repeated failures.
          </p>
        </div>
      </details>

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={onReset}
          className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors"
        >
          Flash Another Node
        </button>
        <a
          href="http://192.168.1.111:8080"
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium text-sm text-center transition-colors"
        >
          Open ThingsBoard Edge
        </a>
      </div>
    </div>
  );
}

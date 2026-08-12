interface OverviewStepProps {
  onNext: () => void;
}

export default function OverviewStep({ onNext }: OverviewStepProps) {
  return (
    <div className="space-y-6">
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-amber-400 mb-3">
          AMI Smart Meter Node — LwM2M over Thread
        </h3>
        <p className="text-gray-300 text-sm leading-relaxed">
          This wizard will guide you through building, configuring, and flashing the AMI
          LwM2M firmware onto an <strong>ESP32-C6 Super Mini</strong>. The node reads
          energy data from a DLMS/COSEM smart meter via RS-485 and publishes it to
          <strong> ThingsBoard Edge</strong> using LwM2M over an OpenThread mesh network.
        </p>
      </div>

      {/* Network diagram */}
      <div className="bg-gray-800/50 rounded-lg p-5 border border-gray-700">
        <h4 className="text-sm font-medium text-gray-300 mb-3">Network Architecture</h4>
        <div className="flex items-center justify-between text-xs text-gray-400 overflow-x-auto gap-2">
          <div className="flex flex-col items-center min-w-[80px]">
            <div className="w-12 h-12 bg-yellow-900/30 border border-yellow-700/50 rounded-lg flex items-center justify-center mb-1">
              <span className="text-lg">⚡</span>
            </div>
            <span className="text-center">Smart Meter<br />(DLMS)</span>
          </div>
          <span className="text-gray-600">— RS-485 —</span>
          <div className="flex flex-col items-center min-w-[80px]">
            <div className="w-12 h-12 bg-amber-900/30 border border-amber-700/50 rounded-lg flex items-center justify-center mb-1">
              <span className="text-lg">📡</span>
            </div>
            <span className="text-center">ESP32-C6<br />(AMI Node)</span>
          </div>
          <span className="text-gray-600">— 802.15.4 —</span>
          <div className="flex flex-col items-center min-w-[80px]">
            <div className="w-12 h-12 bg-green-900/30 border border-green-700/50 rounded-lg flex items-center justify-center mb-1">
              <span className="text-lg">🌐</span>
            </div>
            <span className="text-center">Thread<br />Border Router</span>
          </div>
          <span className="text-gray-600">— IPv6 —</span>
          <div className="flex flex-col items-center min-w-[80px]">
            <div className="w-12 h-12 bg-blue-900/30 border border-blue-700/50 rounded-lg flex items-center justify-center mb-1">
              <span className="text-lg">☁️</span>
            </div>
            <span className="text-center">ThingsBoard<br />Edge</span>
          </div>
        </div>
      </div>

      {/* Requirements */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
          <h4 className="text-sm font-medium text-gray-300 mb-2">Hardware Required</h4>
          <ul className="text-xs text-gray-400 space-y-1.5">
            <li className="flex items-start gap-2">
              <span className="text-amber-500 mt-0.5">&#x2022;</span>
              Seeed XIAO ESP32-C6 Super Mini
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500 mt-0.5">&#x2022;</span>
              RS-485 Expansion Board (TP8485E)
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500 mt-0.5">&#x2022;</span>
              DLMS/COSEM smart meter (or use Demo Mode)
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500 mt-0.5">&#x2022;</span>
              Thread Border Router (RPi 4 + OTBR)
            </li>
          </ul>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
          <h4 className="text-sm font-medium text-gray-300 mb-2">Software Required</h4>
          <ul className="text-xs text-gray-400 space-y-1.5">
            <li className="flex items-start gap-2">
              <span className="text-amber-500 mt-0.5">&#x2022;</span>
              Docker (for firmware compilation)
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500 mt-0.5">&#x2022;</span>
              Chrome or Edge 89+ (Web Serial API)
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-500 mt-0.5">&#x2022;</span>
              ThingsBoard Edge at 192.168.1.111
            </li>
          </ul>
        </div>
      </div>

      {/* Steps preview */}
      <div className="bg-amber-900/10 border border-amber-700/30 rounded-lg p-4">
        <h4 className="text-sm font-medium text-amber-400 mb-2">Wizard Steps</h4>
        <ol className="text-xs text-gray-400 space-y-1 list-decimal list-inside">
          <li>Configure Thread network credentials</li>
          <li>Set LwM2M server address (ThingsBoard Edge)</li>
          <li>Choose meter mode (single/3-phase, demo)</li>
          <li>Build custom firmware with your configuration</li>
          <li>Connect ESP32-C6 via USB</li>
          <li>Flash the firmware</li>
          <li>Verify connection & onboard to ThingsBoard</li>
        </ol>
      </div>

      <button
        onClick={onNext}
        className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium transition-colors"
      >
        Start Configuration
      </button>
    </div>
  );
}

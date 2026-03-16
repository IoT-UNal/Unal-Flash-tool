"use client";

import { useSerial } from "@/hooks/useSerial";

export default function Header() {
  const { state, deviceName, isSupported } = useSerial();

  const statusColor = {
    disconnected: "bg-gray-500",
    connecting: "bg-yellow-500 animate-pulse",
    connected: "bg-green-500",
    error: "bg-red-500",
  }[state];

  return (
    <header className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <h2 className="text-gray-200 font-medium text-sm">
          ESP32 Flash & Serial Platform
        </h2>
      </div>

      <div className="flex items-center gap-4">
        {/* Web Serial API support indicator */}
        {!isSupported && (
          <span
            className="text-xs text-yellow-300 bg-yellow-900/40 border border-yellow-700/50 px-2.5 py-1 rounded cursor-help"
            title="Web Serial API requires Google Chrome 89+ or Microsoft Edge 89+. Must be served over HTTPS or localhost."
          >
            ⚠ Use Chrome or Edge for serial features
          </span>
        )}

        {/* Connection status */}
        <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5">
          <div className={`w-2 h-2 rounded-full ${statusColor}`} />
          <span className="text-xs text-gray-300">{deviceName}</span>
          <span className="text-xs text-gray-500 capitalize">({state})</span>
        </div>
      </div>
    </header>
  );
}

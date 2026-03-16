"use client";

import { BAUD_RATES, type BaudRate } from "@/lib/serial/types";

export type LineEnding = "none" | "cr" | "lf" | "crlf";
export type DisplayMode = "text" | "hex";

interface SerialToolbarProps {
  isConnected: boolean;
  baudRate: BaudRate;
  dtr: boolean;
  rts: boolean;
  autoScroll: boolean;
  timestamps: boolean;
  displayMode: DisplayMode;
  lineEnding: LineEnding;
  bytesReceived: number;
  bytesSent: number;
  onConnect: () => void;
  onDisconnect: () => void;
  onBaudRateChange: (rate: BaudRate) => void;
  onDtrChange: (checked: boolean) => void;
  onRtsChange: (checked: boolean) => void;
  onAutoScrollChange: (checked: boolean) => void;
  onTimestampsChange: (checked: boolean) => void;
  onDisplayModeChange: (mode: DisplayMode) => void;
  onLineEndingChange: (ending: LineEnding) => void;
  onClear: () => void;
  onExportLog: () => void;
  onResetDevice: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function SerialToolbar({
  isConnected,
  baudRate,
  dtr,
  rts,
  autoScroll,
  timestamps,
  displayMode,
  lineEnding,
  bytesReceived,
  bytesSent,
  onConnect,
  onDisconnect,
  onBaudRateChange,
  onDtrChange,
  onRtsChange,
  onAutoScrollChange,
  onTimestampsChange,
  onDisplayModeChange,
  onLineEndingChange,
  onClear,
  onExportLog,
  onResetDevice,
}: SerialToolbarProps) {
  return (
    <div className="space-y-2">
      {/* Primary row: connection controls */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Connect/Disconnect */}
        <button
          onClick={isConnected ? onDisconnect : onConnect}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            isConnected
              ? "bg-red-600 hover:bg-red-700 text-white"
              : "bg-blue-600 hover:bg-blue-700 text-white"
          }`}
        >
          {isConnected ? "Disconnect" : "Connect"}
        </button>

        {/* Baud Rate */}
        <select
          value={baudRate}
          onChange={(e) => onBaudRateChange(Number(e.target.value) as BaudRate)}
          disabled={isConnected}
          className="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2 disabled:opacity-50"
        >
          {BAUD_RATES.map((rate) => (
            <option key={rate} value={rate}>
              {rate} baud
            </option>
          ))}
        </select>

        {/* Line Ending */}
        <select
          value={lineEnding}
          onChange={(e) => onLineEndingChange(e.target.value as LineEnding)}
          className="bg-gray-800 border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-2"
        >
          <option value="none">No line ending</option>
          <option value="lf">Newline (LF)</option>
          <option value="cr">Carriage Return (CR)</option>
          <option value="crlf">Both (CR+LF)</option>
        </select>

        {/* Signal Controls */}
        <div className="flex items-center gap-3 border-l border-gray-700 pl-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={dtr}
              onChange={(e) => onDtrChange(e.target.checked)}
              className="rounded border-gray-600 bg-gray-800 text-blue-600"
            />
            DTR
          </label>
          <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={rts}
              onChange={(e) => onRtsChange(e.target.checked)}
              className="rounded border-gray-600 bg-gray-800 text-blue-600"
            />
            RTS
          </label>
        </div>

        {/* Reset Device */}
        {isConnected && (
          <button
            onClick={onResetDevice}
            className="px-3 py-2 bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 text-sm rounded-lg border border-yellow-600/40 transition-colors"
            title="Reset ESP32 (toggle DTR/RTS)"
          >
            Reset
          </button>
        )}

        {/* Status */}
        <div className="ml-auto flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected ? "bg-green-500 animate-pulse" : "bg-gray-600"
            }`}
          />
          <span className="text-xs text-gray-500">
            {isConnected ? `Connected @ ${baudRate}` : "Disconnected"}
          </span>
        </div>
      </div>

      {/* Secondary row: display controls */}
      <div className="flex items-center gap-3 flex-wrap text-xs">
        {/* Display Mode */}
        <div className="flex items-center bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <button
            onClick={() => onDisplayModeChange("text")}
            className={`px-3 py-1.5 transition-colors ${
              displayMode === "text"
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Text
          </button>
          <button
            onClick={() => onDisplayModeChange("hex")}
            className={`px-3 py-1.5 transition-colors ${
              displayMode === "hex"
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Hex
          </button>
        </div>

        {/* Timestamps */}
        <label className="flex items-center gap-1.5 text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={timestamps}
            onChange={(e) => onTimestampsChange(e.target.checked)}
            className="rounded border-gray-600 bg-gray-800 text-blue-600"
          />
          Timestamps
        </label>

        {/* Auto-scroll */}
        <label className="flex items-center gap-1.5 text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => onAutoScrollChange(e.target.checked)}
            className="rounded border-gray-600 bg-gray-800 text-blue-600"
          />
          Auto-scroll
        </label>

        <div className="border-l border-gray-700 pl-3 flex items-center gap-2">
          {/* Clear */}
          <button
            onClick={onClear}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-700 transition-colors"
          >
            Clear
          </button>

          {/* Export Log */}
          <button
            onClick={onExportLog}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-700 transition-colors"
            title="Download terminal log as .txt file"
          >
            Export Log
          </button>
        </div>

        {/* Byte counters */}
        {isConnected && (
          <div className="ml-auto flex items-center gap-3 text-gray-500">
            <span>
              RX: <span className="text-green-400">{formatBytes(bytesReceived)}</span>
            </span>
            <span>
              TX: <span className="text-blue-400">{formatBytes(bytesSent)}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

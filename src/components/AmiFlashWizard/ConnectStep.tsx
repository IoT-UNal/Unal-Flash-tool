import { useCallback, useState } from "react";
import { SerialManager } from "@/lib/serial/SerialManager";
import type { ChipInfo } from "@/lib/flash/types";
import ChipInfoCard from "@/components/FlashWizard/ChipInfoCard";

interface ConnectStepProps {
  chipInfo: ChipInfo | null;
  isConnected: boolean;
  onConnect: (port: SerialPort, autoBootMode: boolean) => Promise<void>;
  isSerialSupported: boolean;
  onNext: () => void;
  onBack: () => void;
}

export default function ConnectStep({
  chipInfo,
  isConnected,
  onConnect,
  isSerialSupported,
  onNext,
  onBack,
}: ConnectStepProps) {
  const [autoBootMode, setAutoBootMode] = useState(true);
  const [bootAttempting, setBootAttempting] = useState(false);
  const [error, setError] = useState("");

  const handleConnect = useCallback(async () => {
    setError("");
    try {
      const manager = SerialManager.getInstance();
      if (manager.isConnected) {
        await manager.close();
      }
      await manager.requestPort();
      const port = manager.getPort();
      if (!port) throw new Error("No port selected");
      await onConnect(port, autoBootMode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    }
  }, [onConnect, autoBootMode]);

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
      const wasOpen = port.readable !== null;
      if (!wasOpen) await port.open({ baudRate: 115200 });

      await port.setSignals({ dataTerminalReady: false, requestToSend: true });
      await new Promise((r) => setTimeout(r, 100));
      await port.setSignals({ dataTerminalReady: true, requestToSend: false });
      await new Promise((r) => setTimeout(r, 50));
      await port.setSignals({ dataTerminalReady: false, requestToSend: false });
      await new Promise((r) => setTimeout(r, 100));
      await port.setSignals({ dataTerminalReady: true, requestToSend: true });
      await new Promise((r) => setTimeout(r, 100));
      await port.setSignals({ dataTerminalReady: false, requestToSend: true });
      await new Promise((r) => setTimeout(r, 100));
      await port.setSignals({ dataTerminalReady: true, requestToSend: false });
      await new Promise((r) => setTimeout(r, 100));
      await port.setSignals({ dataTerminalReady: false, requestToSend: false });

      if (!wasOpen) await port.close();
    } catch (err) {
      console.error("Boot mode entry failed:", err);
    } finally {
      setBootAttempting(false);
    }
  }, []);

  if (!isSerialSupported) {
    return (
      <div className="bg-red-900/20 border border-red-800 rounded-lg p-6 text-center">
        <p className="text-red-400 font-medium">Web Serial API not supported</p>
        <p className="text-xs text-red-400/70 mt-1">
          Please use Chrome or Edge 89+ on Desktop
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-gray-800 rounded-lg p-5 border border-gray-700">
        <h3 className="text-base font-semibold text-amber-400 mb-1">Connect ESP32-C6</h3>
        <p className="text-xs text-gray-500 mb-4">
          Connect your XIAO ESP32-C6 Super Mini via USB-C. The device will be put into
          bootloader mode for flashing.
        </p>

        {/* Auto boot mode */}
        <label className="flex items-center gap-2 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={autoBootMode}
            onChange={(e) => setAutoBootMode(e.target.checked)}
            className="rounded bg-gray-700 border-gray-600 text-amber-500 focus:ring-amber-500"
          />
          <span className="text-sm text-gray-300">Auto boot mode (recommended)</span>
        </label>

        {error && (
          <div className="bg-red-900/20 border border-red-700/30 rounded p-2 mb-4 text-xs text-red-400">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleConnect}
            disabled={isConnected}
            className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-colors ${
              isConnected
                ? "bg-green-700/30 text-green-400 border border-green-700/50"
                : "bg-amber-600 hover:bg-amber-500 text-white"
            }`}
          >
            {isConnected ? "Connected" : "Select USB Port"}
          </button>

          <button
            onClick={handleManualBoot}
            disabled={bootAttempting}
            className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg transition-colors"
          >
            {bootAttempting ? "Trying..." : "Force Boot Mode"}
          </button>
        </div>

        {/* Boot mode instructions */}
        {!isConnected && (
          <div className="mt-4 bg-gray-900/50 rounded p-3 text-xs text-gray-500">
            <p className="font-medium text-gray-400 mb-1">Manual boot mode (if auto fails):</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>Hold the BOOT button on the ESP32-C6</li>
              <li>Press and release RESET while holding BOOT</li>
              <li>Release BOOT after 1 second</li>
              <li>Click &ldquo;Select USB Port&rdquo; above</li>
            </ol>
          </div>
        )}
      </div>

      {/* Chip info */}
      {chipInfo && <ChipInfoCard chipInfo={chipInfo} />}

      <div className="flex gap-3">
        <button onClick={onBack} className="flex-1 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors">
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!isConnected}
          className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-colors ${
            isConnected
              ? "bg-amber-600 hover:bg-amber-500 text-white"
              : "bg-gray-600 text-gray-400 cursor-not-allowed"
          }`}
        >
          Next: Flash
        </button>
      </div>
    </div>
  );
}

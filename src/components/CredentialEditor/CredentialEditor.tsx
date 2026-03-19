"use client";

import { useState, useCallback } from "react";
import {
  generateWifiConfigBlob,
  WIFI_CONFIG_FLASH_OFFSET,
} from "@/lib/config/WifiConfigGenerator";

export default function CredentialEditor() {
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [generatedBlob, setGeneratedBlob] = useState<Uint8Array | null>(null);

  const handleGenerate = useCallback(() => {
    try {
      const blob = generateWifiConfigBlob({ ssid, password });
      setGeneratedBlob(blob);
      setStatus("success");
      setStatusMsg(
        `Config binary generated (${blob.length} bytes). Flash it at offset 0x${WIFI_CONFIG_FLASH_OFFSET.toString(16).toUpperCase()} alongside your firmware.`
      );
    } catch (err) {
      setStatus("error");
      setStatusMsg(err instanceof Error ? err.message : "Failed to generate config");
      setGeneratedBlob(null);
    }
  }, [ssid, password]);

  const handleDownload = useCallback(() => {
    if (!generatedBlob) return;
    const blob = new Blob([generatedBlob.buffer as ArrayBuffer], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wifi_config.bin";
    a.click();
    URL.revokeObjectURL(url);
  }, [generatedBlob]);

  return (
    <div className="space-y-6">
      {/* WiFi Config Card */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-600/20">
            <svg className="h-5 w-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">WiFi Configuration</h2>
            <p className="text-sm text-gray-400">
              Enter your WiFi credentials to generate a config binary
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-gray-400">WiFi SSID</label>
            <input
              type="text"
              value={ssid}
              onChange={(e) => setSsid(e.target.value)}
              placeholder="MyNetwork"
              maxLength={32}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-blue-600 focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-600">{ssid.length}/32 characters</p>
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-400">WiFi Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                maxLength={64}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 pr-10 text-sm text-gray-200 placeholder-gray-600 focus:border-blue-600 focus:outline-none"
              />
              <button
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-gray-300"
                type="button"
              >
                {showPassword ? (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-600">
              {password.length}/64 characters (leave empty for open networks)
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={handleGenerate}
            disabled={!ssid.trim()}
            className="rounded-lg bg-amber-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:bg-gray-700 disabled:text-gray-500"
          >
            Generate Config Binary
          </button>
          {generatedBlob && (
            <button
              onClick={handleDownload}
              className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-gray-300 transition-colors hover:bg-gray-700"
            >
              Download wifi_config.bin
            </button>
          )}
        </div>
      </div>

      {/* Status */}
      {status !== "idle" && (
        <div
          className={`rounded-lg border p-4 text-sm ${
            status === "success"
              ? "border-green-800 bg-green-900/20 text-green-300"
              : "border-red-800 bg-red-900/20 text-red-300"
          }`}
        >
          {statusMsg}
        </div>
      )}

      {/* How it works */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
        <h3 className="mb-3 text-sm font-medium text-white">How it works</h3>
        <ol className="space-y-2 text-sm text-gray-400">
          <li className="flex items-start gap-2">
            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-600/20 text-xs text-blue-400">1</span>
            Enter your WiFi SSID and password above
          </li>
          <li className="flex items-start gap-2">
            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-600/20 text-xs text-blue-400">2</span>
            Click &quot;Generate Config Binary&quot; — creates a 128-byte config blob
          </li>
          <li className="flex items-start gap-2">
            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-600/20 text-xs text-blue-400">3</span>
            In the Flash Wizard, enable &quot;WiFi firmware&quot; and the config will be flashed at offset 0x{WIFI_CONFIG_FLASH_OFFSET.toString(16).toUpperCase()} alongside your firmware
          </li>
          <li className="flex items-start gap-2">
            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-600/20 text-xs text-blue-400">4</span>
            The firmware reads the config on boot — no serial provisioning needed
          </li>
        </ol>
      </div>
    </div>
  );
}

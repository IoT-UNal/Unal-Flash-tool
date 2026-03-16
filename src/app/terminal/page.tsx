"use client";

import dynamic from "next/dynamic";
import { useState, useEffect } from "react";

const SerialTerminal = dynamic(
  () => import("@/components/SerialTerminal/SerialTerminal"),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center bg-gray-900 rounded-xl border border-gray-800">
        <span className="text-gray-500 text-sm">Loading terminal...</span>
      </div>
    ),
  }
);

export default function TerminalPage() {
  const [isSupported, setIsSupported] = useState(true);

  useEffect(() => {
    setIsSupported(
      typeof navigator !== "undefined" && "serial" in navigator
    );
  }, []);

  return (
    <div className="h-full flex flex-col">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-white">Serial Terminal</h1>
        <p className="text-gray-400 mt-1 text-sm">
          Monitor and interact with your ESP32 device via serial console.
        </p>
      </div>

      {!isSupported && (
        <div className="mb-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-yellow-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div>
              <h3 className="text-yellow-300 font-medium text-sm">Web Serial API Not Supported</h3>
              <p className="text-yellow-400/80 text-xs mt-1">
                Your browser does not support the Web Serial API. Please use
                <strong> Google Chrome 89+</strong> or <strong>Microsoft Edge 89+</strong> on desktop.
                The page must be served over <strong>HTTPS</strong> or <strong>localhost</strong>.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0">
        <SerialTerminal />
      </div>
    </div>
  );
}

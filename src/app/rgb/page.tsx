"use client";

import RgbFlashWizard from "@/components/RgbFlashWizard/RgbFlashWizard";

export default function RgbPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">RGB LED — ESP32-C6 SuperMini</h1>
        <p className="text-gray-400 mt-1">
          Configure and flash the RGB LED firmware on your ESP32-C6 SuperMini board.
        </p>
      </div>
      <RgbFlashWizard />
    </div>
  );
}

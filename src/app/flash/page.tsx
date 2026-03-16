"use client";

import dynamic from "next/dynamic";

const FlashWizard = dynamic(
  () => import("@/components/FlashWizard/FlashWizard"),
  { ssr: false }
);

export default function FlashPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Flash Device</h1>
        <p className="text-gray-400 mt-1">
          Flash firmware to your ESP32 device via USB in four simple steps.
        </p>
      </div>
      <FlashWizard />
    </div>
  );
}

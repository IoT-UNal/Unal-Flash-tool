"use client";

import AmiFlashWizard from "@/components/AmiFlashWizard";

export default function AmiPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">AMI Smart Meter — LwM2M Node</h1>
        <p className="text-gray-400 mt-1">
          Configure, build, and flash the AMI LwM2M firmware for 3-phase smart meter monitoring over Thread.
        </p>
      </div>
      <AmiFlashWizard />
    </div>
  );
}

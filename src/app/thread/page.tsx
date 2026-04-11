"use client";

import ThreadFlashWizard from "@/components/ThreadFlashWizard/ThreadFlashWizard";

export default function ThreadPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Thread / LwM2M — ESP32-C6 SuperMini</h1>
        <p className="text-gray-400 mt-1">
          Flash and configure the AMI LwM2M firmware with OpenThread networking on your ESP32-C6.
        </p>
      </div>
      <ThreadFlashWizard />
    </div>
  );
}

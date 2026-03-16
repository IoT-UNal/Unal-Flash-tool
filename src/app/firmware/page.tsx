"use client";

import FirmwareCatalog from "@/components/FirmwareCatalog/FirmwareCatalog";

export default function FirmwarePage() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Firmware Manager</h1>
        <p className="text-gray-400 mt-1">
          Browse available firmware releases, download binaries, and trigger new builds.
        </p>
      </div>
      <FirmwareCatalog />
    </div>
  );
}

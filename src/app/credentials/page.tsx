"use client";

import CredentialEditor from "@/components/CredentialEditor/CredentialEditor";

export default function CredentialsPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">WiFi Configuration</h1>
        <p className="text-gray-400 mt-1">
          Generate a WiFi config binary to flash alongside your firmware — no serial provisioning needed.
        </p>
      </div>
      <CredentialEditor />
    </div>
  );
}

"use client";

import CredentialEditor from "@/components/CredentialEditor/CredentialEditor";

export default function CredentialsPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Credential Manager</h1>
        <p className="text-gray-400 mt-1">
          Configure WiFi, MQTT, API keys, TLS certificates, and device IDs for provisioning.
        </p>
      </div>
      <CredentialEditor />
    </div>
  );
}

export interface FirmwareManifest {
  name: string;
  version: string;
  description: string;
  targets: FirmwareTarget[];
  credentials: CredentialField[];
}

export interface FirmwareTarget {
  chip: string;
  flashMode: string;
  flashFreq: string;
  segments: FirmwareSegment[];
}

export interface FirmwareSegment {
  file: string;
  address: string;
}

export interface CredentialField {
  key: string;
  type: "string" | "cert" | "number";
  required: boolean;
  label?: string;
  description?: string;
}

export interface FirmwareRelease {
  id: number;
  tagName: string;
  name: string;
  body: string;
  publishedAt: string;
  assets: FirmwareAsset[];
  manifest?: FirmwareManifest;
}

export interface FirmwareAsset {
  id: number;
  name: string;
  size: number;
  downloadUrl: string;
  contentType: string;
}

import type {
  FirmwareRelease,
  FirmwareAsset,
  FirmwareManifest,
} from "./types";

export class FirmwareService {
  private baseUrl: string;

  constructor(baseUrl = "") {
    this.baseUrl = baseUrl;
  }

  /** List available firmware releases */
  async listReleases(): Promise<FirmwareRelease[]> {
    const res = await fetch(`${this.baseUrl}/api/firmware`);
    if (!res.ok) throw new Error(`Failed to fetch releases: ${res.statusText}`);
    return res.json();
  }

  /** Get a specific release with manifest */
  async getRelease(tagName: string): Promise<FirmwareRelease> {
    const res = await fetch(
      `${this.baseUrl}/api/firmware/${encodeURIComponent(tagName)}`
    );
    if (!res.ok) throw new Error(`Release not found: ${tagName}`);
    return res.json();
  }

  /** Download a firmware binary as ArrayBuffer */
  async downloadBinary(assetId: number): Promise<ArrayBuffer> {
    const res = await fetch(
      `${this.baseUrl}/api/firmware/${assetId}`
    );
    if (!res.ok) throw new Error("Failed to download firmware binary");
    return res.arrayBuffer();
  }

  /** Parse firmware manifest from release assets */
  async getManifest(release: FirmwareRelease): Promise<FirmwareManifest | null> {
    const manifestAsset = release.assets.find(
      (a) => a.name === "firmware-manifest.json"
    );
    if (!manifestAsset) return null;

    const res = await fetch(
      `${this.baseUrl}/api/firmware/${manifestAsset.id}`
    );
    if (!res.ok) return null;
    return res.json();
  }

  /** Filter assets for a specific chip */
  filterAssetsForChip(
    assets: FirmwareAsset[],
    chip: string
  ): FirmwareAsset[] {
    const normalizedChip = chip.toLowerCase().replace("-", "");
    return assets.filter((a) => {
      const name = a.name.toLowerCase();
      return (
        name.includes(normalizedChip) &&
        name.endsWith(".bin") &&
        name !== "firmware-manifest.json"
      );
    });
  }
}

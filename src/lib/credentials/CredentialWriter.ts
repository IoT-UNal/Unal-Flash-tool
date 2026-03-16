import { SerialManager } from "../serial/SerialManager";
import type { ProvisioningResponse, ProvisioningStatus } from "./types";

const PROV_TIMEOUT = 5000;

export class CredentialWriter {
  private serial: SerialManager;
  private responseBuffer = "";
  private resolveResponse: ((resp: string) => void) | null = null;

  constructor(serial?: SerialManager) {
    this.serial = serial ?? SerialManager.getInstance();
  }

  /** Start provisioning mode on the device */
  async startProvisioning(): Promise<ProvisioningResponse> {
    return this.sendCommand("PROV:START\n");
  }

  /** Set a credential key-value pair in NVS */
  async setCredential(
    key: string,
    value: string
  ): Promise<ProvisioningResponse> {
    return this.sendCommand(`PROV:SET:${key}=${value}\n`);
  }

  /** Set a certificate (sent as base64) */
  async setCertificate(
    name: string,
    pemData: string
  ): Promise<ProvisioningResponse> {
    const base64 = btoa(pemData);
    return this.sendCommand(`PROV:CERT:${name}=${base64}\n`);
  }

  /** Commit all credentials and reboot the device */
  async commit(): Promise<ProvisioningResponse> {
    return this.sendCommand("PROV:COMMIT\n");
  }

  /** Get provisioning status */
  async getStatus(): Promise<ProvisioningStatus> {
    const resp = await this.sendCommand("PROV:STATUS\n");
    return this.parseStatus(resp);
  }

  /** Write a full set of credentials */
  async writeAll(
    credentials: Record<string, string>,
    certificates?: Record<string, string>
  ): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];

    const startResp = await this.startProvisioning();
    if (!startResp.success) {
      return { success: false, errors: ["Failed to enter provisioning mode"] };
    }

    for (const [key, value] of Object.entries(credentials)) {
      try {
        const resp = await this.setCredential(key, value);
        if (!resp.success) errors.push(`Failed to set ${key}: ${resp.error}`);
      } catch (err) {
        errors.push(
          `Error setting ${key}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    if (certificates) {
      for (const [name, pem] of Object.entries(certificates)) {
        try {
          const resp = await this.setCertificate(name, pem);
          if (!resp.success)
            errors.push(`Failed to set cert ${name}: ${resp.error}`);
        } catch (err) {
          errors.push(
            `Error setting cert ${name}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    if (errors.length === 0) {
      const commitResp = await this.commit();
      if (!commitResp.success) {
        errors.push("Failed to commit credentials");
      }
    }

    return { success: errors.length === 0, errors };
  }

  private async sendCommand(cmd: string): Promise<ProvisioningResponse> {
    const responsePromise = new Promise<string>((resolve) => {
      this.resolveResponse = resolve;
    });

    const unsub = this.serial.on("data", (data) => {
      if (data instanceof Uint8Array) {
        this.responseBuffer += new TextDecoder().decode(data);

        const lines = this.responseBuffer.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("PROV:")) {
            this.resolveResponse?.(trimmed);
            this.responseBuffer = "";
            return;
          }
        }
      }
    });

    await this.serial.write(cmd);

    const timeoutPromise = new Promise<string>((_, reject) => {
      setTimeout(() => reject(new Error("Provisioning timeout")), PROV_TIMEOUT);
    });

    try {
      const resp = await Promise.race([responsePromise, timeoutPromise]);
      return this.parseResponse(resp);
    } finally {
      unsub();
    }
  }

  private parseResponse(raw: string): ProvisioningResponse {
    // "PROV:OK:fieldName" or "PROV:ERR:reason"
    const parts = raw.split(":");
    if (parts.length >= 3 && parts[1] === "OK") {
      return { success: true, command: parts[0], field: parts.slice(2).join(":") };
    }
    if (parts.length >= 3 && parts[1] === "ERR") {
      return {
        success: false,
        command: parts[0],
        error: parts.slice(2).join(":"),
      };
    }
    return { success: false, command: raw, error: "Unknown response format" };
  }

  private parseStatus(resp: ProvisioningResponse): ProvisioningStatus {
    const fields: Record<string, "SET" | "EMPTY"> = {};

    if (resp.success && resp.field) {
      const pairs = resp.field.split(",");
      for (const pair of pairs) {
        const [key, val] = pair.split("=");
        if (key) {
          fields[key.trim()] = val?.trim() === "SET" ? "SET" : "EMPTY";
        }
      }
    }

    return { fields, mode: "provisioning" };
  }
}

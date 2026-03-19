import { SerialManager } from "../serial/SerialManager";
import type { ProvisioningResponse, ProvisioningStatus } from "./types";

const PROV_TIMEOUT = 8000;
const COMMAND_DELAY = 100;

export class CredentialWriter {
  private serial: SerialManager;

  constructor(serial?: SerialManager) {
    this.serial = serial ?? SerialManager.getInstance();
  }

  async startProvisioning(): Promise<ProvisioningResponse> {
    return this.sendCommand("PROV:START\n");
  }

  async setCredential(key: string, value: string): Promise<ProvisioningResponse> {
    return this.sendCommand(`PROV:SET:${key}=${value}\n`);
  }

  async setCertificate(name: string, pemData: string): Promise<ProvisioningResponse> {
    const base64 = btoa(pemData);
    return this.sendCommand(`PROV:CERT:${name}=${base64}\n`);
  }

  async commit(): Promise<ProvisioningResponse> {
    return this.sendCommand("PROV:COMMIT\n");
  }

  async getStatus(): Promise<ProvisioningStatus> {
    const resp = await this.sendCommand("PROV:STATUS\n");
    return this.parseStatus(resp);
  }

  async writeAll(
    credentials: Record<string, string>,
    certificates?: Record<string, string>
  ): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Drain any pending serial data before starting
    await this.drain();

    const startResp = await this.startProvisioning();
    if (!startResp.success) {
      return { success: false, errors: [`Failed to enter provisioning mode: ${startResp.error || "no response from device"}`] };
    }

    for (const [key, value] of Object.entries(credentials)) {
      try {
        await this.delay(COMMAND_DELAY);
        const resp = await this.setCredential(key, value);
        if (!resp.success) errors.push(`Failed to set ${key}: ${resp.error}`);
      } catch (err) {
        errors.push(`Error setting ${key}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (certificates) {
      for (const [name, pem] of Object.entries(certificates)) {
        try {
          await this.delay(COMMAND_DELAY);
          const resp = await this.setCertificate(name, pem);
          if (!resp.success) errors.push(`Failed to set cert ${name}: ${resp.error}`);
        } catch (err) {
          errors.push(`Error setting cert ${name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    if (errors.length === 0) {
      await this.delay(COMMAND_DELAY);
      const commitResp = await this.commit();
      if (!commitResp.success) {
        errors.push("Failed to commit credentials");
      }
    }

    return { success: errors.length === 0, errors };
  }

  /** Drain pending serial data to clear any boot messages */
  private async drain(): Promise<void> {
    return new Promise<void>((resolve) => {
      const unsub = this.serial.on("data", () => {});
      setTimeout(() => { unsub(); resolve(); }, 200);
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private sendCommand(cmd: string): Promise<ProvisioningResponse> {
    return new Promise<ProvisioningResponse>((resolve, reject) => {
      let buffer = "";
      let resolved = false;

      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          unsub();
        }
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Provisioning timeout — no response to: ${cmd.trim()}\nReceived data: ${buffer.substring(0, 200) || "(none)"}`));
      }, PROV_TIMEOUT);

      const unsub = this.serial.on("data", (data) => {
        if (resolved) return;
        if (data instanceof Uint8Array) {
          buffer += new TextDecoder().decode(data);

          // Only process complete lines (terminated by \n)
          while (buffer.includes("\n")) {
            const idx = buffer.indexOf("\n");
            const line = buffer.substring(0, idx).trim();
            buffer = buffer.substring(idx + 1);

            if (line.startsWith("PROV:")) {
              cleanup();
              resolve(this.parseResponse(line));
              return;
            }
          }
        }
      });

      this.serial.write(cmd).catch((err) => {
        cleanup();
        reject(err);
      });
    });
  }

  private parseResponse(raw: string): ProvisioningResponse {
    const parts = raw.split(":");
    if (parts.length >= 3 && parts[1] === "OK") {
      return { success: true, command: parts[0], field: parts.slice(2).join(":") };
    }
    if (parts.length >= 3 && parts[1] === "ERR") {
      return { success: false, command: parts[0], error: parts.slice(2).join(":") };
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

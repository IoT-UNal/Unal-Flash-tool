export interface CredentialProfile {
  name: string;
  fields: Record<string, string>;
  createdAt: string;
}

export interface ProvisioningStatus {
  fields: Record<string, "SET" | "EMPTY">;
  mode: "provisioning" | "normal";
}

export type ProvisioningCommand =
  | { type: "START" }
  | { type: "SET"; key: string; value: string }
  | { type: "CERT"; name: string; data: string }
  | { type: "COMMIT" }
  | { type: "STATUS" };

export interface ProvisioningResponse {
  success: boolean;
  command: string;
  field?: string;
  error?: string;
}

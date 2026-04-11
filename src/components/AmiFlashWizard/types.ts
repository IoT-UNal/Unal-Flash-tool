export type AmiWizardStep =
  | "overview"
  | "thread-config"
  | "lwm2m-config"
  | "meter-config"
  | "build"
  | "connect"
  | "flash"
  | "verify";

export interface StepDef {
  key: AmiWizardStep;
  label: string;
  num: number;
}

export const AMI_STEPS: StepDef[] = [
  { key: "overview", label: "Overview", num: 1 },
  { key: "thread-config", label: "Thread", num: 2 },
  { key: "lwm2m-config", label: "LwM2M", num: 3 },
  { key: "meter-config", label: "Meter", num: 4 },
  { key: "build", label: "Build", num: 5 },
  { key: "connect", label: "Connect", num: 6 },
  { key: "flash", label: "Flash", num: 7 },
  { key: "verify", label: "Verify", num: 8 },
];

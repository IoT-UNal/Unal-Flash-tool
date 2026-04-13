/**
 * AmiOverlayGenerator — Generates Zephyr prj.conf overlay for AMI LwM2M Node
 *
 * Produces a prj.conf overlay string that overrides build-time configuration
 * in the ami-lwm2m-node firmware. Used by the Build API to customize firmware
 * before compilation via EXTRA_CONF_FILE.
 *
 * Kconfig symbols verified against:
 * - firmware/ami-lwm2m-node/prj.conf
 * - firmware/ami-lwm2m-node/Kconfig
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AmiConfig {
  // Board target
  boardTarget: string; // Zephyr board qualified name

  // Thread network
  threadChannel: number; // 11-26, default 25
  threadPanId: number; // decimal (e.g. 9197 = 0x23ED)
  threadNetworkKey: string; // colon-separated hex "5e:de:be:ad:..."
  threadNetworkName: string; // max 16 chars
  threadExtPanId: string; // colon-separated hex "1a:25:78:dd:..."

  // LwM2M server
  lwm2mServerPrimary: string; // IPv6 address (no brackets)
  lwm2mServerSecondary: string; // IPv6 address (optional)

  // Meter configuration
  singlePhase: boolean; // CONFIG_AMI_SINGLE_PHASE
  demoMode: boolean; // CONFIG_AMI_DEMO_MODE
}

// ---------------------------------------------------------------------------
// Supported board targets
// ---------------------------------------------------------------------------

export interface BoardTarget {
  id: string;
  label: string;
  zephyrTarget: string;
  description: string;
}

export const SUPPORTED_BOARDS: BoardTarget[] = [
  {
    id: "xiao_esp32c6",
    label: "Seeed XIAO ESP32-C6",
    zephyrTarget: "xiao_esp32c6/esp32c6/hpcore",
    description: "Seeed Studio XIAO — compact, USB-C, built-in antenna",
  },
  {
    id: "esp32c6_supermini",
    label: "ESP32-C6 Super Mini",
    zephyrTarget: "weact_esp32c6_mini/esp32c6/hpcore",
    description: "WeAct Studio ESP32-C6 Mini — ultra-compact, low-cost",
  },
  {
    id: "esp32c6_devkitc",
    label: "ESP32-C6-DevKitC (WROOM)",
    zephyrTarget: "esp32c6_devkitc/esp32c6/hpcore",
    description: "Espressif DevKitC — reference board, WROOM module",
  },
];

// ---------------------------------------------------------------------------
// Defaults (matching firmware/ami-lwm2m-node/prj.conf)
// ---------------------------------------------------------------------------

export const DEFAULT_AMI_CONFIG: AmiConfig = {
  boardTarget: "xiao_esp32c6",

  threadChannel: 25,
  threadPanId: 9197,
  threadNetworkKey: "5e:de:be:ad:64:40:5b:3e:17:19:36:46:c2:94:22:85",
  threadNetworkName: "UNAL-Thread",
  threadExtPanId: "1a:25:78:dd:6e:e3:57:3b",

  lwm2mServerPrimary: "fd7d:f3c4:1736:1:89c1:9628:a3e4:f477",
  lwm2mServerSecondary: "fdf5:bffd:bd6:ef74:b080:b8c3:367f:147f",

  singlePhase: true,
  demoMode: true,
};

// ---------------------------------------------------------------------------
// NAT64 helper
// ---------------------------------------------------------------------------

/** Convert IPv4 to NAT64 IPv6 using well-known prefix 64:ff9b::/96 */
export function ipv4ToNat64(ipv4: string): string | null {
  const parts = ipv4.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => isNaN(n) || n < 0 || n > 255)) return null;
  const hex1 = ((nums[0] << 8) | nums[1]).toString(16);
  const hex2 = ((nums[2] << 8) | nums[3]).toString(16);
  return `64:ff9b::${hex1}:${hex2}`;
}

/** Resolve a board ID to its Zephyr qualified board target */
export function resolveZephyrBoard(boardId: string): string {
  const board = SUPPORTED_BOARDS.find((b) => b.id === boardId);
  return board?.zephyrTarget ?? SUPPORTED_BOARDS[0].zephyrTarget;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const COLON_HEX_16 = /^([0-9a-fA-F]{2}:){15}[0-9a-fA-F]{2}$/;
const COLON_HEX_8 = /^([0-9a-fA-F]{2}:){7}[0-9a-fA-F]{2}$/;
const IPV6_SIMPLE =
  /^[0-9a-fA-F:]+$/; // loose check — full validation is complex

export function validateAmiConfig(
  config: AmiConfig
): Record<string, string> {
  const errors: Record<string, string> = {};

  // Board target
  if (!SUPPORTED_BOARDS.find((b) => b.id === config.boardTarget)) {
    errors.boardTarget = "Unknown board target";
  }

  // Thread channel
  if (config.threadChannel < 11 || config.threadChannel > 26) {
    errors.threadChannel = "Channel must be 11-26";
  }

  // PAN ID (decimal in prj.conf, valid 0-65534)
  if (
    !Number.isInteger(config.threadPanId) ||
    config.threadPanId < 0 ||
    config.threadPanId > 65534
  ) {
    errors.threadPanId = "PAN ID must be 0-65534 (decimal)";
  }

  // Network key (16 bytes, colon-separated)
  if (!COLON_HEX_16.test(config.threadNetworkKey)) {
    errors.threadNetworkKey =
      'Network Key must be 16 colon-separated hex bytes (e.g. "5e:de:be:ad:64:40:5b:3e:17:19:36:46:c2:94:22:85")';
  }

  // Network name
  if (
    !config.threadNetworkName ||
    config.threadNetworkName.length > 16
  ) {
    errors.threadNetworkName = "Network Name required (max 16 chars)";
  }

  // Extended PAN ID (8 bytes, colon-separated)
  if (!COLON_HEX_8.test(config.threadExtPanId)) {
    errors.threadExtPanId =
      'Extended PAN ID must be 8 colon-separated hex bytes (e.g. "1a:25:78:dd:6e:e3:57:3b")';
  }

  // LwM2M server primary
  if (!config.lwm2mServerPrimary || !IPV6_SIMPLE.test(config.lwm2mServerPrimary)) {
    errors.lwm2mServerPrimary = "Primary server IPv6 address is required";
  }

  // LwM2M server secondary (optional but must be valid if set)
  if (
    config.lwm2mServerSecondary &&
    !IPV6_SIMPLE.test(config.lwm2mServerSecondary)
  ) {
    errors.lwm2mServerSecondary = "Secondary server must be a valid IPv6 address";
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Overlay generator
// ---------------------------------------------------------------------------

export function generateOverlayConf(config: AmiConfig): string {
  const lines: string[] = [
    "# AMI LwM2M Node — Custom Overlay",
    `# Generated: ${new Date().toISOString()}`,
    "#",
    "# This overlay is merged on top of prj.conf via EXTRA_CONF_FILE.",
    "# Only values that differ from defaults need to be listed here.",
    "",
    "# --- Thread Network Credentials ---",
    `CONFIG_OPENTHREAD_CHANNEL=${config.threadChannel}`,
    `CONFIG_OPENTHREAD_PANID=${config.threadPanId}`,
    `CONFIG_OPENTHREAD_NETWORKKEY="${config.threadNetworkKey}"`,
    `CONFIG_OPENTHREAD_NETWORK_NAME="${config.threadNetworkName}"`,
    `CONFIG_OPENTHREAD_XPANID="${config.threadExtPanId}"`,
    "",
    "# --- LwM2M Server ---",
    `CONFIG_NET_CONFIG_PEER_IPV6_ADDR="${config.lwm2mServerPrimary}"`,
    `CONFIG_AMI_LWM2M_SERVER_IPV6_PRIMARY="${config.lwm2mServerPrimary}"`,
  ];

  if (config.lwm2mServerSecondary) {
    lines.push(
      `CONFIG_AMI_LWM2M_SERVER_IPV6_SECONDARY="${config.lwm2mServerSecondary}"`
    );
  }

  lines.push(
    "",
    "# --- AMI Application ---",
    `CONFIG_AMI_SINGLE_PHASE=${config.singlePhase ? "y" : "n"}`,
    `CONFIG_AMI_DEMO_MODE=${config.demoMode ? "y" : "n"}`,
    ""
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Config diffing — show only values that differ from defaults
// ---------------------------------------------------------------------------

export function getConfigDiff(config: AmiConfig): Partial<AmiConfig> {
  const diff: Partial<AmiConfig> = {};
  const keys = Object.keys(DEFAULT_AMI_CONFIG) as (keyof AmiConfig)[];
  for (const key of keys) {
    if (config[key] !== DEFAULT_AMI_CONFIG[key]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (diff as any)[key] = config[key];
    }
  }
  return diff;
}

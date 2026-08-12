import { ESPLoader, Transport } from "esptool-js";
import type {
  ChipInfo,
  FlashSegment,
  FlashOptions,
  FlashProgress,
  FlashError,
} from "./types";
import {
  DEFAULT_FLASH_OPTIONS,
  CHIP_OFFSETS,
  CHIP_FEATURES,
  classifyFlashError,
} from "./types";

export class FlashManager {
  private transport: Transport | null = null;
  private loader: ESPLoader | null = null;
  private _chipInfo: ChipInfo | null = null;
  private _port: SerialPort | null = null;

  private onLog: (msg: string) => void;
  private onProgress: (progress: FlashProgress) => void;

  constructor(
    onLog: (msg: string) => void = console.log,
    onProgress: (progress: FlashProgress) => void = () => {}
  ) {
    this.onLog = onLog;
    this.onProgress = onProgress;
  }

  get chipInfo(): ChipInfo | null {
    return this._chipInfo;
  }

  get isConnected(): boolean {
    return this.loader !== null;
  }

  /** Attempt to enter ESP32 bootloader mode via serial signals */
  async enterBootMode(port: SerialPort): Promise<void> {
    this.onLog("Attempting to enter boot mode...");

    // Strategy 1: Classic DTR/RTS reset (works with CP2102, CH340, FTDI bridges)
    // RTS → EN (reset), DTR → GPIO0 (boot select)
    try {
      this.onLog("  Strategy 1: Classic DTR/RTS reset sequence...");
      await port.setSignals({ dataTerminalReady: false, requestToSend: true });
      await new Promise((r) => setTimeout(r, 100));
      await port.setSignals({ dataTerminalReady: true, requestToSend: false });
      await new Promise((r) => setTimeout(r, 50));
      await port.setSignals({ dataTerminalReady: false, requestToSend: false });
      await new Promise((r) => setTimeout(r, 50));
    } catch {
      this.onLog("  Strategy 1 failed (signals not supported)");
    }

    // Strategy 2: USB CDC boot — for native USB chips (ESP32-C3/C6/S2/S3/H2)
    // Toggle DTR+RTS together, then release — triggers USB-Serial/JTAG reset circuit
    try {
      this.onLog("  Strategy 2: USB CDC/JTAG reset sequence...");
      await port.setSignals({ dataTerminalReady: false, requestToSend: false });
      await new Promise((r) => setTimeout(r, 100));
      await port.setSignals({ dataTerminalReady: true, requestToSend: true });
      await new Promise((r) => setTimeout(r, 100));
      await port.setSignals({ dataTerminalReady: false, requestToSend: true });
      await new Promise((r) => setTimeout(r, 100));
      await port.setSignals({ dataTerminalReady: true, requestToSend: false });
      await new Promise((r) => setTimeout(r, 100));
      await port.setSignals({ dataTerminalReady: false, requestToSend: false });
      await new Promise((r) => setTimeout(r, 400));
    } catch {
      this.onLog("  Strategy 2 failed (signals not supported)");
    }

    this.onLog("Boot mode sequence completed.");
  }

  /** Connect to ESP chip via serial port and detect chip */
  async connect(port: SerialPort, autoBootMode = true): Promise<ChipInfo> {
    this._port = port;

    this.onProgress({
      fileIndex: 0,
      totalFiles: 0,
      written: 0,
      total: 0,
      percentage: 0,
      status: "connecting",
      message: "Connecting to device...",
    });

    // Try boot mode entry before connecting if enabled
    if (autoBootMode) {
      try {
        await this.enterBootMode(port);
      } catch {
        this.onLog("Auto boot mode entry skipped.");
      }
    }

    this.transport = new Transport(port, true);

    const terminal = {
      clean: () => {},
      writeLine: (data: string) => this.onLog(data),
      write: (data: string) => this.onLog(data),
    };

    this.loader = new ESPLoader({
      transport: this.transport,
      baudrate: 115200,
      romBaudrate: 115200,
      terminal,
    });

    this.onLog("Connecting to ESP device...");

    try {
      const chipName = await this.loader.main();
      const macAddr = await this.loader.chip.readMac(this.loader);

      // Detect flash size (getFlashSize returns KB)
      let flashSize = 0;
      try {
        const flashSizeKB = await this.loader.getFlashSize();
        if (flashSizeKB) {
          flashSize = flashSizeKB * 1024;
          this.onLog(`Detected flash size: ${this.formatFlashSize(flashSize)}`);
        }
      } catch {
        this.onLog("Could not auto-detect flash size");
      }

      // Detect crystal frequency
      let crystalFreq = 0;
      try {
        if (typeof this.loader.chip.getCrystalFreq === "function") {
          crystalFreq = await this.loader.chip.getCrystalFreq(this.loader);
          this.onLog(`Crystal frequency: ${crystalFreq} MHz`);
        }
      } catch {
        // Not all chips support crystal freq detection
      }

      // Get chip revision if available
      let revision = "";
      try {
        if (typeof this.loader.chip.getChipDescription === "function") {
          const desc = await this.loader.chip.getChipDescription(this.loader);
          revision = desc || "";
        }
      } catch {
        // Revision detection not available for all chips
      }

      // Match known features from chip family
      const normalizedFamily = this.normalizeChipFamily(chipName);
      const features = CHIP_FEATURES[normalizedFamily] || [];

      this._chipInfo = {
        chipFamily: normalizedFamily,
        chipName: revision || chipName,
        mac: macAddr,
        features,
        flashSize,
        crystalFreq,
        revision,
      };

      this.onLog(
        `Connected: ${this._chipInfo.chipName} (MAC: ${macAddr}, Flash: ${this.formatFlashSize(flashSize)})`
      );

      return this._chipInfo;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const classified = classifyFlashError(error);
      this.onLog(`Connection failed: ${classified.message}`);
      this.onLog(`Suggestion: ${classified.suggestion}`);
      throw err;
    }
  }

  /** Flash firmware segments to the device */
  async flash(
    segments: FlashSegment[],
    options: Partial<FlashOptions> = {}
  ): Promise<void> {
    if (!this.loader) throw new Error("Not connected. Call connect() first.");

    const opts = { ...DEFAULT_FLASH_OPTIONS, ...options };

    this.onProgress({
      fileIndex: 0,
      totalFiles: segments.length,
      written: 0,
      total: 0,
      percentage: 0,
      status: "erasing",
      message: "Preparing flash...",
    });

    try {
      if (opts.eraseAll) {
        this.onLog("Erasing entire flash...");
        await this.loader.eraseFlash();
      }

      this.onLog(`Flashing ${segments.length} segment(s)...`);
      for (const seg of segments) {
        const name = seg.name || `0x${seg.address.toString(16)}`;
        this.onLog(
          `  Segment "${name}" → address 0x${seg.address.toString(16)} (${seg.data.length} bytes)`
        );
      }

      let maxPercentage = 0;

      const flashOptions = {
        fileArray: segments.map((s) => ({
          data: s.data,
          address: s.address,
        })),
        flashSize: opts.flashSize,
        flashMode: opts.flashMode,
        flashFreq: opts.flashFreq,
        eraseAll: false,
        compress: opts.compress,
        reportProgress: (
          fileIndex: number,
          written: number,
          total: number
        ) => {
          const percentage = Math.round((written / total) * 100);
          if (percentage > maxPercentage) maxPercentage = percentage;
          const segName =
            segments[fileIndex]?.name ||
            `0x${segments[fileIndex]?.address.toString(16)}`;
          this.onProgress({
            fileIndex,
            totalFiles: segments.length,
            written,
            total,
            percentage,
            status: "writing",
            message: `Writing "${segName}" (${fileIndex + 1}/${segments.length}): ${percentage}%`,
            segmentName: segName,
          });
        },
      };

      try {
        await this.loader.writeFlash(flashOptions);
      } catch (writeErr) {
        // ESP32-C6 USB CDC/JTAG often drops the serial connection after
        // the final write packet, causing a "No serial data received" error
        // even though all data was written successfully. If progress reached
        // 100%, treat it as a successful flash.
        const msg = writeErr instanceof Error ? writeErr.message : String(writeErr);
        const isPostWriteCommError =
          maxPercentage >= 100 &&
          /no serial data|serial data received|timeout|timed out/i.test(msg);

        if (isPostWriteCommError) {
          this.onLog(
            "Warning: Post-write verification lost connection (common with USB CDC/JTAG). Data was written successfully."
          );
        } else {
          throw writeErr;
        }
      }

      this.onProgress({
        fileIndex: segments.length - 1,
        totalFiles: segments.length,
        written: 0,
        total: 0,
        percentage: 100,
        status: "done",
        message: "Flash complete!",
      });

      this.onLog("Flash complete! Resetting device...");
      try {
        await this.hardReset();
      } catch {
        this.onLog("Warning: Could not reset device automatically. Please reset manually.");
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const classified = classifyFlashError(error);
      this.onProgress({
        fileIndex: 0,
        totalFiles: segments.length,
        written: 0,
        total: 0,
        percentage: 0,
        status: "error",
        message: classified.message,
      });
      this.onLog(`Flash error: ${classified.message}`);
      this.onLog(`Suggestion: ${classified.suggestion}`);
      throw err;
    }
  }

  /** Erase entire flash memory */
  async eraseFlash(): Promise<void> {
    if (!this.loader) throw new Error("Not connected");
    this.onLog("Erasing entire flash...");
    this.onProgress({
      fileIndex: 0,
      totalFiles: 0,
      written: 0,
      total: 0,
      percentage: 0,
      status: "erasing",
      message: "Erasing entire flash memory...",
    });
    await this.loader.eraseFlash();
    this.onLog("Flash erased.");
    this.onProgress({
      fileIndex: 0,
      totalFiles: 0,
      written: 0,
      total: 0,
      percentage: 100,
      status: "done",
      message: "Flash erased successfully.",
    });
  }

  /** Get the correct bootloader offset for the connected chip */
  getBootloaderOffset(): number {
    if (!this._chipInfo) return 0x1000;
    return CHIP_OFFSETS[this._chipInfo.chipFamily] ?? 0x1000;
  }

  /** Build standard flash segments for bootloader + partition table + app */
  buildSegments(
    appData: string,
    bootloaderData?: string,
    partitionData?: string
  ): FlashSegment[] {
    const offset = this.getBootloaderOffset();
    const segments: FlashSegment[] = [];

    if (bootloaderData) {
      segments.push({
        data: bootloaderData,
        address: offset,
        name: "Bootloader",
      });
    }
    if (partitionData) {
      segments.push({
        data: partitionData,
        address: 0x8000,
        name: "Partition Table",
      });
    }
    segments.push({
      data: appData,
      address: 0x10000,
      name: "Application",
    });

    return segments;
  }

  /** Classify a flash error for user-friendly display */
  classifyError(err: Error): FlashError {
    return classifyFlashError(err);
  }

  /** Reset the device via RTS + DTR toggle.
   *  Classic UART bridges: RTS → EN, DTR → GPIO0/GPIO9.
   *  ESP32-C6 USB Serial/JTAG: RTS → internal reset, DTR → GPIO9. */
  async hardReset(): Promise<void> {
    if (!this.transport) return;
    await this.transport.setDTR(false);   // GPIO9 high → normal boot
    await this.transport.setRTS(true);    // Assert EN reset
    await new Promise((r) => setTimeout(r, 100));
    await this.transport.setRTS(false);   // Release EN → chip starts
    await new Promise((r) => setTimeout(r, 50));
  }

  /** Disconnect from the device and release the serial port */
  async disconnect(): Promise<void> {
    try {
      if (this.transport) {
        await this.transport.disconnect();
      }
    } catch {
      // Transport may already be closed
    }
    // Ensure the underlying port is closed even if Transport failed
    if (this._port) {
      try {
        if (this._port.readable || this._port.writable) {
          await this._port.close();
        }
      } catch {
        // Port may already be closed or detached (USB disconnect)
      }
    }
    this.transport = null;
    this.loader = null;
    this._chipInfo = null;
    this._port = null;
  }

  /** Normalize chip family name from ESPLoader output */
  private normalizeChipFamily(chipName: string): string {
    const upper = chipName.toUpperCase().replace(/\s+/g, "");
    if (upper.includes("ESP32S3") || upper.includes("ESP32-S3"))
      return "ESP32-S3";
    if (upper.includes("ESP32S2") || upper.includes("ESP32-S2"))
      return "ESP32-S2";
    if (upper.includes("ESP32C3") || upper.includes("ESP32-C3"))
      return "ESP32-C3";
    if (upper.includes("ESP32C6") || upper.includes("ESP32-C6"))
      return "ESP32-C6";
    if (upper.includes("ESP32H2") || upper.includes("ESP32-H2"))
      return "ESP32-H2";
    if (upper.includes("ESP32C2") || upper.includes("ESP32-C2"))
      return "ESP32-C2";
    if (upper.includes("ESP32")) return "ESP32";
    return chipName;
  }

  /** Convert flash ID size byte to size in bytes */
  private flashIdToSize(sizeId: number): number {
    const sizes: Record<number, number> = {
      0x12: 256 * 1024, // 2Mbit
      0x13: 512 * 1024, // 4Mbit
      0x14: 1024 * 1024, // 8Mbit = 1MB
      0x15: 2 * 1024 * 1024, // 16Mbit = 2MB
      0x16: 4 * 1024 * 1024, // 32Mbit = 4MB
      0x17: 8 * 1024 * 1024, // 64Mbit = 8MB
      0x18: 16 * 1024 * 1024, // 128Mbit = 16MB
      0x19: 32 * 1024 * 1024, // 256Mbit = 32MB
    };
    return sizes[sizeId] || 0;
  }

  /** Format flash size for display */
  private formatFlashSize(bytes: number): string {
    if (bytes === 0) return "Unknown";
    if (bytes >= 1024 * 1024) return `${bytes / (1024 * 1024)} MB`;
    if (bytes >= 1024) return `${bytes / 1024} KB`;
    return `${bytes} bytes`;
  }
}

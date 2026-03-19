import { SerialConfig, SerialState, USB_FILTERS } from "./types";

type SerialEventType = "data" | "connect" | "disconnect" | "error";
type SerialEventCallback = (data?: Uint8Array | Error) => void;

/**
 * Singleton manager for Web Serial API connections.
 * Handles port lifecycle, read/write streams, signal control,
 * and automatic USB disconnect detection.
 */
export class SerialManager {
  private static instance: SerialManager | null = null;

  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private readLoopActive = false;

  private _state: SerialState = "disconnected";
  private _lastConfig: SerialConfig | null = null;
  private _bytesReceived = 0;
  private _bytesSent = 0;
  private _connectedAt: number | null = null;
  private listeners: Map<SerialEventType, Set<SerialEventCallback>> = new Map();
  private navigatorDisconnectHandler: ((e: Event) => void) | null = null;

  private constructor() {
    (["data", "connect", "disconnect", "error"] as SerialEventType[]).forEach(
      (t) => this.listeners.set(t, new Set())
    );
    this.watchNavigatorDisconnect();
  }

  static getInstance(): SerialManager {
    if (!SerialManager.instance) {
      SerialManager.instance = new SerialManager();
    }
    return SerialManager.instance;
  }

  get state(): SerialState {
    return this._state;
  }

  get isConnected(): boolean {
    return this._state === "connected";
  }

  get serialPort(): SerialPort | null {
    return this.port;
  }

  get bytesReceived(): number {
    return this._bytesReceived;
  }

  get bytesSent(): number {
    return this._bytesSent;
  }

  get connectedAt(): number | null {
    return this._connectedAt;
  }

  get lastConfig(): SerialConfig | null {
    return this._lastConfig;
  }

  /** Check if the browser supports Web Serial API */
  static isSupported(): boolean {
    return typeof navigator !== "undefined" && "serial" in navigator;
  }

  on(event: SerialEventType, cb: SerialEventCallback): () => void {
    this.listeners.get(event)?.add(cb);
    return () => this.listeners.get(event)?.delete(cb);
  }

  private emit(event: SerialEventType, data?: Uint8Array | Error) {
    this.listeners.get(event)?.forEach((cb) => cb(data));
  }

  /** Watch for USB device disconnect via navigator.serial */
  private watchNavigatorDisconnect(): void {
    if (!SerialManager.isSupported()) return;

    this.navigatorDisconnectHandler = (e: Event) => {
      const disconnectedPort = (e as Event & { target: SerialPort }).target;
      if (this.port && disconnectedPort === this.port) {
        this.handleUnexpectedDisconnect();
      }
    };
    navigator.serial.addEventListener(
      "disconnect",
      this.navigatorDisconnectHandler
    );
  }

  private handleUnexpectedDisconnect(): void {
    this.readLoopActive = false;

    try {
      if (this.reader) {
        this.reader.cancel().catch(() => {});
        this.reader.releaseLock();
      }
    } catch {
      // Reader may already be released
    }

    try {
      if (this.writer) {
        this.writer.releaseLock();
      }
    } catch {
      // Writer may already be released
    }

    this.reader = null;
    this.writer = null;
    this._state = "disconnected";
    this._connectedAt = null;
    this.emit("disconnect");
  }

  /** Prompt user to select a serial port */
  async requestPort(useFilters = true): Promise<SerialPort> {
    if (!SerialManager.isSupported()) {
      throw new Error(
        "Web Serial API not supported. Use Chrome or Edge 89+."
      );
    }

    const filters = useFilters
      ? USB_FILTERS.map((f) => ({ usbVendorId: f.vendorId }))
      : undefined;

    this.port = await navigator.serial.requestPort({
      filters,
    });
    return this.port;
  }

  /** Open serial connection */
  async open(config: SerialConfig): Promise<void> {
    if (!this.port) throw new Error("No port selected. Call requestPort first.");
    if (this._state === "connected") return;

    this._state = "connecting";
    this._lastConfig = config;

    try {
      await this.port.open({
        baudRate: config.baudRate,
        dataBits: config.dataBits ?? 8,
        stopBits: config.stopBits ?? 1,
        parity: config.parity ?? "none",
        flowControl: config.flowControl ?? "none",
      });

      this._state = "connected";
      this._bytesReceived = 0;
      this._bytesSent = 0;
      this._connectedAt = Date.now();
      this.emit("connect");
      this.startReadLoop();
    } catch (err) {
      this._state = "error";
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  /** Reconnect using the last port and config */
  async reconnect(): Promise<void> {
    if (!this.port || !this._lastConfig) {
      throw new Error("No previous connection to reconnect to");
    }

    if (this._state === "connected") {
      await this.close();
    }

    this._state = "connecting";

    try {
      await this.port.open({
        baudRate: this._lastConfig.baudRate,
        dataBits: this._lastConfig.dataBits ?? 8,
        stopBits: this._lastConfig.stopBits ?? 1,
        parity: this._lastConfig.parity ?? "none",
        flowControl: this._lastConfig.flowControl ?? "none",
      });

      this._state = "connected";
      this._bytesReceived = 0;
      this._bytesSent = 0;
      this._connectedAt = Date.now();
      this.emit("connect");
      this.startReadLoop();
    } catch (err) {
      this._state = "error";
      this.emit("error", err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  /** Close serial connection and cleanup */
  async close(): Promise<void> {
    this.readLoopActive = false;

    try {
      if (this.reader) {
        await this.reader.cancel();
        this.reader.releaseLock();
        this.reader = null;
      }
      if (this.writer) {
        this.writer.releaseLock();
        this.writer = null;
      }
      if (this.port) {
        await this.port.close();
      }
    } catch {
      // Port may already be closed
    }

    this._state = "disconnected";
    this._connectedAt = null;
    this.emit("disconnect");
  }

  /** Write data to serial port */
  async write(data: Uint8Array | string): Promise<void> {
    if (!this.port?.writable) throw new Error("Port not writable");

    if (!this.writer) {
      this.writer = this.port.writable.getWriter();
    }

    const bytes =
      typeof data === "string" ? new TextEncoder().encode(data) : data;
    await this.writer.write(bytes);
    this._bytesSent += bytes.length;
  }

  /** Send a line of text (appends \r\n) */
  async writeLine(data: string): Promise<void> {
    await this.write(data + "\r\n");
  }

  /** Control DTR/RTS signals (used for ESP32 boot mode) */
  async setSignals(dtr?: boolean, rts?: boolean): Promise<void> {
    if (!this.port) throw new Error("No port connected");

    const signals: SerialOutputSignals = {};
    if (dtr !== undefined) signals.dataTerminalReady = dtr;
    if (rts !== undefined) signals.requestToSend = rts;

    await this.port.setSignals(signals);
  }

  /** Read input signal states (CTS, DSR, DCD, RI) */
  async getSignals(): Promise<SerialInputSignals | null> {
    if (!this.port) return null;
    return this.port.getSignals();
  }

  /** Reset ESP32 via DTR/RTS signaling (toggle boot mode) */
  async resetDevice(): Promise<void> {
    if (!this.port) throw new Error("No port connected");
    await this.port.setSignals({ dataTerminalReady: false, requestToSend: true });
    await new Promise((r) => setTimeout(r, 100));
    await this.port.setSignals({ dataTerminalReady: true, requestToSend: false });
    await new Promise((r) => setTimeout(r, 50));
    await this.port.setSignals({ dataTerminalReady: false, requestToSend: false });
  }

  /** Enter ESP32 bootloader mode via DTR/RTS sequence (GPIO0 + EN) */
  async enterBootloader(): Promise<void> {
    if (!this.port) throw new Error("No port connected");
    // Hold GPIO0 low (DTR), pulse EN (RTS)
    await this.port.setSignals({ dataTerminalReady: true, requestToSend: false });
    await new Promise((r) => setTimeout(r, 100));
    await this.port.setSignals({ dataTerminalReady: true, requestToSend: true });
    await new Promise((r) => setTimeout(r, 100));
    await this.port.setSignals({ dataTerminalReady: false, requestToSend: false });
  }

  /** Get the raw SerialPort handle */
  getPort(): SerialPort | null {
    return this.port;
  }

  /** Get port info (USB vendor/product ID) */
  getPortInfo(): SerialPortInfo | null {
    return this.port?.getInfo() ?? null;
  }

  /** Get the USB device name from known vendor IDs */
  getDeviceName(): string {
    const info = this.getPortInfo();
    if (!info?.usbVendorId) return "Unknown device";
    const match = USB_FILTERS.find((f) => f.vendorId === info.usbVendorId);
    return match?.name ?? `USB 0x${info.usbVendorId.toString(16)}`;
  }

  /** Get connection statistics */
  getStats(): { bytesReceived: number; bytesSent: number; uptime: number } {
    return {
      bytesReceived: this._bytesReceived,
      bytesSent: this._bytesSent,
      uptime: this._connectedAt ? Date.now() - this._connectedAt : 0,
    };
  }

  private async startReadLoop(): Promise<void> {
    if (!this.port?.readable) return;

    this.readLoopActive = true;

    while (this.readLoopActive && this.port.readable) {
      try {
        this.reader = this.port.readable.getReader();

        while (this.readLoopActive) {
          const { value, done } = await this.reader.read();
          if (done) break;
          if (value) {
            this._bytesReceived += value.length;
            this.emit("data", value);
          }
        }

        this.reader.releaseLock();
        this.reader = null;
      } catch (err) {
        this.reader = null;
        if (this.readLoopActive) {
          this.emit(
            "error",
            err instanceof Error ? err : new Error(String(err))
          );
          break;
        }
      }
    }
  }
}

/* Web Serial API type definitions for environments that don't include them */

interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

interface SerialPortFilter {
  usbVendorId?: number;
  usbProductId?: number;
}

interface SerialPortRequestOptions {
  filters?: SerialPortFilter[];
}

interface SerialOptions {
  baudRate: number;
  dataBits?: 7 | 8;
  stopBits?: 1 | 2;
  parity?: "none" | "even" | "odd";
  bufferSize?: number;
  flowControl?: "none" | "hardware";
}

interface SerialOutputSignals {
  dataTerminalReady?: boolean;
  requestToSend?: boolean;
  break?: boolean;
}

interface SerialInputSignals {
  dataCarrierDetect: boolean;
  clearToSend: boolean;
  ringIndicator: boolean;
  dataSetReady: boolean;
}

interface SerialPort extends EventTarget {
  readonly readable: ReadableStream<Uint8Array> | null;
  readonly writable: WritableStream<Uint8Array> | null;
  open(options: SerialOptions): Promise<void>;
  close(): Promise<void>;
  getInfo(): SerialPortInfo;
  setSignals(signals: SerialOutputSignals): Promise<void>;
  getSignals(): Promise<SerialInputSignals>;
  addEventListener(
    type: "connect" | "disconnect",
    listener: EventListener
  ): void;
}

interface Serial extends EventTarget {
  requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
  getPorts(): Promise<SerialPort[]>;
  addEventListener(
    type: "connect" | "disconnect",
    listener: EventListener
  ): void;
}

interface Navigator {
  readonly serial: Serial;
}

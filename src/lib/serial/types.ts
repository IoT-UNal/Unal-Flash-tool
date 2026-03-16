export type SerialState = "disconnected" | "connecting" | "connected" | "error";

export interface SerialConfig {
  baudRate: number;
  dataBits?: 7 | 8;
  stopBits?: 1 | 2;
  parity?: "none" | "even" | "odd";
  flowControl?: "none" | "hardware";
}

export const BAUD_RATES = [
  9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600,
] as const;

export type BaudRate = (typeof BAUD_RATES)[number];

export const USB_FILTERS: { name: string; vendorId: number }[] = [
  { name: "Silicon Labs CP210x", vendorId: 0x10c4 },
  { name: "CH340/CH341", vendorId: 0x1a86 },
  { name: "FTDI FT232", vendorId: 0x0403 },
  { name: "Espressif USB", vendorId: 0x303a },
];

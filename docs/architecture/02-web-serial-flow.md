# 02 — Web Serial Communication Flow

## Serial Port Lifecycle

```
┌──────────┐     requestPort()     ┌──────────────┐     open()     ┌────────────┐
│          │ ──────────────────►   │              │ ──────────►   │            │
│ Initial  │   User selects port   │  Port Ready  │  baudRate,    │ Connected  │
│          │ ◄──────────────────   │              │  dataBits     │            │
└──────────┘    User cancels       └──────────────┘               └─────┬──────┘
                                                                        │
                                         ┌──────────────────────────────┘
                                         │
                                         ▼
                              ┌──────────────────────┐
                              │  Read Loop Active     │
                              │                      │
                              │  reader.read() ──►   │
                              │   emit("data", buf)  │
                              │   loop...             │
                              │                      │
                              │  writer.write(data)  │
                              │   ◄── write(str|buf) │
                              └──────────┬───────────┘
                                         │ close()
                                         ▼
                              ┌──────────────────────┐
                              │  Disconnected         │
                              │  reader released      │
                              │  writer released      │
                              │  port closed          │
                              └──────────────────────┘
```

## SerialManager Singleton

```
┌─────────────────────────────────────────────────────────────┐
│  SerialManager (Singleton)                                   │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   State       │  │   Events     │  │   Port Handle    │  │
│  │              │  │              │  │                  │  │
│  │  idle         │  │  data        │  │  navigator.      │  │
│  │  connecting   │  │  connect     │  │  serial.         │  │
│  │  connected    │  │  disconnect  │  │  requestPort()   │  │
│  │  error        │  │  error       │  │                  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                             │
│  Methods:                                                   │
│   requestPort() ─► open USB filter dialog                   │
│   open(config)  ─► configure baud, DTR, RTS                │
│   write(data)   ─► send string or Uint8Array                │
│   setSignals()  ─► toggle DTR/RTS lines                     │
│   close()       ─► release readers/writers, close port      │
│   getPortInfo() ─► { usbVendorId, usbProductId }           │
│   getDeviceName()─► "Silicon Labs CP2102" / etc.            │
└─────────────────────────────────────────────────────────────┘
```

## USB Vendor Identification

| Vendor ID | Manufacturer | Common Chips |
|-----------|-------------|-------------|
| 0x10C4 | Silicon Labs | CP2102, CP2104 |
| 0x1A86 | QinHeng | CH340, CH341 |
| 0x0403 | FTDI | FT232R, FT2232 |
| 0x303A | Espressif | Native USB (S3, C3, C6) |

## Signal Lines

```
Host (DTR/RTS)                    ESP32
    │                               │
    ├── DTR ──────────────────────► EN (Reset)
    │                               │
    └── RTS ──────────────────────► IO0 (Boot mode)
```

- **DTR LOW + RTS HIGH** → Enter bootloader mode
- **DTR toggle** → Reset device
- esptool-js handles this automatically during flash

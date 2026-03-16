# 07 — Frontend Architecture

## Next.js App Router Structure

```
src/
├── app/                          ◄── App Router (file-based routing)
│   ├── layout.tsx                ◄── Root layout (Sidebar + Header shell)
│   ├── globals.css               ◄── Global styles (dark theme)
│   ├── page.tsx                  ◄── Dashboard (/)
│   │
│   ├── flash/
│   │   └── page.tsx              ◄── Flash page (/flash)
│   ├── terminal/
│   │   └── page.tsx              ◄── Terminal page (/terminal)
│   ├── firmware/
│   │   └── page.tsx              ◄── Firmware page (/firmware)
│   ├── credentials/
│   │   └── page.tsx              ◄── Credentials page (/credentials)
│   │
│   └── api/                      ◄── Server-side API routes
│       ├── firmware/
│       │   ├── route.ts          ◄── GET: list releases
│       │   └── [assetId]/
│       │       └── route.ts      ◄── GET: download binary
│       ├── builds/
│       │   └── route.ts          ◄── POST: trigger workflow
│       └── credentials/
│           └── route.ts          ◄── GET: field templates
│
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx           ◄── Navigation sidebar (5 routes)
│   │   └── Header.tsx            ◄── Connection status + device info
│   ├── SerialTerminal/
│   │   └── SerialTerminal.tsx    ◄── xterm.js + Web Serial integration
│   ├── FlashWizard/
│   │   └── FlashWizard.tsx       ◄── 4-step flash wizard
│   ├── FirmwareCatalog/
│   │   └── FirmwareCatalog.tsx   ◄── Release browser + download
│   └── CredentialEditor/
│       └── CredentialEditor.tsx  ◄── Form + NVS writer + overlay export
│
├── hooks/
│   ├── useSerial.ts              ◄── SerialManager React wrapper
│   ├── useFlash.ts               ◄── FlashManager React wrapper
│   └── useFirmware.ts            ◄── FirmwareService React wrapper
│
├── lib/
│   ├── serial/
│   │   ├── types.ts              ◄── SerialState, BaudRate, USB_FILTERS
│   │   └── SerialManager.ts     ◄── Singleton, read loop, event emitter
│   ├── flash/
│   │   ├── types.ts              ◄── ChipInfo, FlashSegment, CHIP_OFFSETS
│   │   └── FlashManager.ts      ◄── esptool-js wrapper
│   ├── firmware/
│   │   ├── types.ts              ◄── FirmwareRelease, FirmwareManifest
│   │   └── FirmwareService.ts   ◄── API client for /api/firmware
│   └── credentials/
│       ├── types.ts              ◄── CredentialProfile, ProvisioningStatus
│       └── CredentialWriter.ts  ◄── PROV:* protocol implementation
│
└── types/
    └── web-serial.d.ts           ◄── Web Serial API type declarations
```

## Component Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  App Shell (layout.tsx)                                          │
│  ┌──────────┐                                                   │
│  │ Sidebar  │  usePathname() → active route highlighting        │
│  └──────────┘                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Header   │  useSerial() → connection status              │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Page Content (children)                                   │   │
│  │                                                           │   │
│  │  ┌─────────────────────────────────────────────────────┐ │   │
│  │  │ Component ──► Hook ──► Lib (Singleton/Service)      │ │   │
│  │  │                                                     │ │   │
│  │  │ FlashWizard → useFlash → FlashManager → esptool-js │ │   │
│  │  │ SerialTerm  → direct  → SerialManager → Web Serial │ │   │
│  │  │ FirmwareCat → useFirm → FirmwareService → API      │ │   │
│  │  │ CredEditor  → useSerial→ CredentialWriter → Serial │ │   │
│  │  └─────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

# 09 — Security Model

## Security Layers

```
┌──────────────────────────────────────────────────────────────────┐
│  Security Boundaries                                              │
│                                                                  │
│  Layer 1: Browser Security                                       │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  • Web Serial requires user gesture (click)                │  │
│  │  • Port selection via browser-native picker (no auto-scan) │  │
│  │  • HTTPS required (or localhost)                           │  │
│  │  • Same-origin policy applies                              │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Layer 2: API Security                                           │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  • GITHUB_TOKEN stored server-side only (env var)          │  │
│  │  • Never exposed to browser                                │  │
│  │  • API routes proxy GitHub requests                        │  │
│  │  • Input validation on all API parameters                  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Layer 3: Serial Protocol                                        │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  • PROV:* protocol is plaintext over USB serial            │  │
│  │  • Physical access required (USB cable)                    │  │
│  │  • Credentials transmitted locally (not over network)      │  │
│  │  • NVS encryption available in ESP-IDF/Zephyr              │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Layer 4: Docker                                                 │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  • Runs as non-root user (nextjs:nodejs)                   │  │
│  │  • Minimal Alpine base image                               │  │
│  │  • No unnecessary packages                                 │  │
│  │  • Standalone output = minimal footprint                   │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

## Threat Model

| Threat | Mitigation |
|--------|-----------|
| Credential interception (network) | HTTPS required; serial is local USB only |
| GitHub token theft | Server-side env var; never in client bundle |
| Malicious firmware upload | User responsibility; file validated by esptool-js |
| Unauthorized API access | Self-hosted; add auth middleware if exposed to internet |
| XSS in serial output | xterm.js handles terminal escape sequences safely |
| SSRF via API routes | GitHub API URLs are constructed server-side with validated params |
| NVS data exposure | ESP-IDF/Zephyr NVS encryption available |

## Recommendations for Production

1. **Add authentication** if exposing beyond localhost (NextAuth.js or similar)
2. **Enable NVS encryption** on ESP32 for stored credentials
3. **Use HTTPS** with a valid TLS certificate (Caddy auto-cert recommended)
4. **Restrict GITHUB_TOKEN** scope to `repo` read-only (or `contents:read`)
5. **Rate-limit API routes** to prevent abuse
6. **Audit firmware binaries** before flashing (checksum verification)

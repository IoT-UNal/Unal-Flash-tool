# 08 — Deployment

## Docker Multi-Stage Build

```
┌──────────────────────────────────────────────────────────────────┐
│  Dockerfile (3 stages)                                            │
│                                                                  │
│  Stage 1: deps                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  FROM node:20-alpine AS deps                               │  │
│  │  COPY package.json package-lock.json                       │  │
│  │  RUN npm ci                                                │  │
│  │  Output: node_modules (~200MB)                             │  │
│  └────────────────────────────────────────────────────────────┘  │
│                               │                                  │
│                               ▼                                  │
│  Stage 2: builder                                                │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  FROM node:20-alpine AS builder                            │  │
│  │  COPY --from=deps node_modules                             │  │
│  │  COPY . .                                                  │  │
│  │  RUN npm run build                                         │  │
│  │  Output: .next/standalone (~50MB)                          │  │
│  └────────────────────────────────────────────────────────────┘  │
│                               │                                  │
│                               ▼                                  │
│  Stage 3: runner                                                 │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  FROM node:20-alpine AS runner                             │  │
│  │  COPY --from=builder .next/standalone                      │  │
│  │  COPY --from=builder .next/static                          │  │
│  │  COPY --from=builder public                                │  │
│  │  USER nextjs (non-root)                                    │  │
│  │  CMD ["node", "server.js"]                                 │  │
│  │  Final image: ~150MB                                       │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

## Docker Compose

```yaml
services:
  web:
    build: .
    ports:
      - "3000:3000"
    environment:
      - GITHUB_TOKEN=${GITHUB_TOKEN}
      - GITHUB_REPO=${GITHUB_REPO}
    volumes:
      - firmware-cache:/app/firmware-cache

volumes:
  firmware-cache:
```

## Network Requirements

```
┌─────────────────────────────────────────────────────────────┐
│  Browser Requirements                                        │
│                                                             │
│  ┌─────────────┐   ┌──────────────┐   ┌────────────────┐  │
│  │ Chrome 89+  │   │  HTTPS or    │   │  Web Serial    │  │
│  │ or Edge 89+ │   │  localhost   │   │  API enabled   │  │
│  └─────────────┘   └──────────────┘   └────────────────┘  │
│                                                             │
│  Web Serial requires secure context:                        │
│  ✓ https://your-domain.com                                  │
│  ✓ http://localhost:3000                                    │
│  ✓ http://127.0.0.1:3000                                   │
│  ✗ http://192.168.1.100:3000 (no HTTPS = blocked)          │
│                                                             │
│  For LAN access, set up TLS with a reverse proxy:           │
│  ┌──────────┐    ┌─────────────┐    ┌──────────────────┐  │
│  │  Browser  │──►│  Nginx/     │──►│  Docker:3000     │  │
│  │          │    │  Caddy      │    │  (Next.js)       │  │
│  │          │    │  (TLS cert) │    │                  │  │
│  └──────────┘    └─────────────┘    └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | For private repos | GitHub personal access token |
| `GITHUB_REPO` | Yes | Repository in `owner/repo` format |
| `NODE_ENV` | Auto | `production` in Docker |
| `PORT` | No | Default: 3000 |

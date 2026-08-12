# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Docker CLI + Compose plugin (needed to trigger firmware builds)
RUN apk add --no-cache docker-cli docker-cli-compose

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
# Allow nextjs user to access Docker socket
RUN addgroup nextjs docker 2>/dev/null; addgroup nextjs ping 2>/dev/null; true

# Next.js standalone output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Pre-built firmware binaries (served by /api/local-firmware/*)
COPY --from=builder --chown=nextjs:nodejs \
  /app/firmware/zephyr-rgb/build/zephyr/zephyr.bin \
  ./firmware/zephyr-rgb/build/zephyr/zephyr.bin

# ami-lwm2m-node firmware placeholder (upload via wizard or mount volume)
RUN mkdir -p ./firmware/ami-lwm2m-node/build/zephyr && chown -R nextjs:nodejs ./firmware/ami-lwm2m-node

# Overlay directory for build configs (volume mount point)
RUN mkdir -p ./tmp/overlays && chown -R nextjs:nodejs ./tmp

# docker-compose.yml needed by firmware build API to run `docker compose run`
COPY --chown=nextjs:nodejs docker-compose.yml ./

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]

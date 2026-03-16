import { Registry, Counter, Histogram, collectDefaultMetrics } from "prom-client";

const register = new Registry();

collectDefaultMetrics({ register });

// ── HTTP Metrics ──────────────────────────────────────────────
export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"] as const,
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status"] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

// ── Flash Metrics ─────────────────────────────────────────────
export const flashOperationsTotal = new Counter({
  name: "flash_operations_total",
  help: "Total flash operations",
  labelNames: ["chip", "status"] as const,
  registers: [register],
});

// ── Serial Metrics ────────────────────────────────────────────
export const serialConnectionsTotal = new Counter({
  name: "serial_connections_total",
  help: "Total serial connections",
  labelNames: ["status"] as const,
  registers: [register],
});

// ── Firmware Metrics ──────────────────────────────────────────
export const firmwareDownloadsTotal = new Counter({
  name: "firmware_downloads_total",
  help: "Total firmware downloads",
  registers: [register],
});

export const firmwareDownloadBytes = new Counter({
  name: "firmware_download_bytes_total",
  help: "Total firmware download bytes",
  registers: [register],
});

// ── Page View Metrics ─────────────────────────────────────────
export const pageViewsTotal = new Counter({
  name: "page_views_total",
  help: "Total page views",
  labelNames: ["page"] as const,
  registers: [register],
});

export { register };

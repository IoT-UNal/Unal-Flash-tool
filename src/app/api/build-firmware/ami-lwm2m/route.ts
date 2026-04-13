import { NextRequest } from "next/server";
import { writeFile, mkdir, stat } from "fs/promises";
import { exec } from "child_process";
import path from "path";
import {
  generateOverlayConf,
  validateAmiConfig,
  resolveZephyrBoard,
} from "@/lib/config/AmiOverlayGenerator";
import type { AmiConfig } from "@/lib/config/AmiOverlayGenerator";

const OVERLAY_DIR = path.join(process.cwd(), "tmp", "overlays");
const BUILD_OUTPUT = path.join(
  process.cwd(),
  "firmware",
  "ami-lwm2m-node",
  "build",
  "zephyr",
  "zephyr.bin"
);

export async function POST(request: NextRequest) {
  const config: AmiConfig = await request.json();
  const errors = validateAmiConfig(config);
  if (Object.keys(errors).length > 0) {
    return Response.json({ errors }, { status: 400 });
  }

  const overlay = generateOverlayConf(config);
  const buildId = `build-${Date.now()}`;
  const overlayPath = path.join(OVERLAY_DIR, `${buildId}.conf`);

  await mkdir(OVERLAY_DIR, { recursive: true });
  await writeFile(overlayPath, overlay);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      send("status", {
        phase: "queued",
        message: "Build queued...",
        buildId,
      });

      try {
        send("status", {
          phase: "building",
          message: "Starting Zephyr firmware build (this may take 5-15 minutes)...",
        });
        send("log", { line: "--- Generated overlay ---" });
        for (const line of overlay.split("\n")) {
          send("log", { line });
        }
        send("log", { line: "--- Starting build ---" });

        // Run firmware builder container directly (image must be pre-built)
        const overlayContainer = `/workspace/overlays/${buildId}.conf`;
        const projectName = process.env.COMPOSE_PROJECT_NAME || "unal-flash-tool";
        const zephyrBoard = resolveZephyrBoard(config.boardTarget);
        const cmd = [
          "docker", "run", "--rm",
          "-v", `${projectName}_firmware-overlays:/workspace/overlays`,
          "-v", `${projectName}_firmware-output:/output`,
          "-v", `${projectName}_ccache:/workspace/ccache`,
          "unal-firmware-builder:latest",
          overlayContainer, "/output", zephyrBoard,
        ].join(" ");

        await new Promise<void>((resolve, reject) => {
          const child = exec(cmd, {
            cwd: process.cwd(),
            timeout: 900000, // 15 min
          });

          child.stdout?.on("data", (data: string) => {
            for (const line of data.toString().split("\n").filter(Boolean)) {
              send("log", { line });
              if (line.includes("[build]")) {
                send("status", {
                  phase: "building",
                  message: line.replace("[build] ", "").trim(),
                });
              }
            }
          });

          child.stderr?.on("data", (data: string) => {
            for (const line of data.toString().split("\n").filter(Boolean)) {
              send("log", { line, level: "warn" });
            }
          });

          child.on("exit", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Build failed with exit code ${code}`));
          });

          child.on("error", reject);
        });

        // Verify output
        const stats = await stat(BUILD_OUTPUT);
        send("status", {
          phase: "done",
          message: "Build complete!",
          binarySize: stats.size,
          downloadUrl: "/api/local-firmware/ami-lwm2m",
        });
      } catch (err) {
        send("status", {
          phase: "error",
          message: err instanceof Error ? err.message : "Build failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

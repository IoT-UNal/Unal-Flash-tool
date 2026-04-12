import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * POST /api/builds/docker-image
 *
 * Builds the unal-firmware-builder Docker image using docker compose.
 * This is a long-running SSE stream (~30+ min on first build).
 */
export async function POST() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      send("status", {
        phase: "building",
        message: "Building firmware Docker image (this may take 30+ minutes on first run)...",
      });

      try {
        const cmd = "docker compose build firmware-builder";

        await new Promise<void>((resolve, reject) => {
          const child = exec(cmd, {
            cwd: process.cwd(),
            timeout: 3600000, // 60 min
          });

          child.stdout?.on("data", (data: string) => {
            for (const line of data.toString().split("\n").filter(Boolean)) {
              send("log", { line });
            }
          });

          child.stderr?.on("data", (data: string) => {
            for (const line of data.toString().split("\n").filter(Boolean)) {
              send("log", { line });
            }
          });

          child.on("exit", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Docker build failed with exit code ${code}`));
          });

          child.on("error", reject);
        });

        send("status", {
          phase: "done",
          message: "Docker image built successfully!",
        });
      } catch (err) {
        send("status", {
          phase: "error",
          message: err instanceof Error ? err.message : "Docker build failed",
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

/**
 * GET /api/builds/docker-image
 *
 * Quick check: is the Docker image available?
 */
export async function GET() {
  try {
    const { stdout } = await execAsync(
      'docker images --format "{{.Repository}}:{{.Tag}}" unal-firmware-builder',
      { timeout: 5000 }
    );

    const exists = stdout.trim().includes("unal-firmware-builder:latest");
    return NextResponse.json({ exists });
  } catch {
    return NextResponse.json({ exists: false, error: "Docker not available" });
  }
}

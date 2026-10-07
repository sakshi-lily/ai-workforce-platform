import { app } from "./app";
import { config, validateEnvironment } from "./config/env";
import { ensureSeedData } from "./services/customerService";
import { initRedis } from "./cache/redis";
import { pool } from "./db/pool";

const PORT = config.port;

async function bootstrap() {
  // 0. Validate runtime environment
  const validation = validateEnvironment();
  if (!validation.valid) {
    console.warn("[AI Workforce Platform Backend] Environment warnings:", validation.errors);
  }

  // 1. Seed initial demo data for database verification
  try {
    await ensureSeedData();
    console.log("[AI Workforce Platform Backend] Seed data verified.");
  } catch (error) {
    console.warn("[AI Workforce Platform Backend] Seed data check deferred or failed:", error);
  }

  // 2. Initialize Redis connection
  try {
    await initRedis();
  } catch (error) {
    console.warn("[AI Workforce Platform Backend] Redis connection initialization deferred:", error);
  }

  // 3. Optionally start background worker in-process if enabled
  if (process.env.START_IN_PROCESS_WORKER === "true") {
    try {
      const { backgroundWorker } = await import("./jobs/worker");
      await backgroundWorker.start();
      console.log("[AI Workforce Platform Backend] In-process background worker started.");
    } catch (error) {
      console.warn("[AI Workforce Platform Backend] In-process worker start warning:", error);
    }
  }

  const server = app.listen(PORT, () => {
    console.log(`[AI Workforce Platform Backend] Server is running on http://localhost:${PORT}`);
    console.log(`[AI Workforce Platform Backend] Process health check: http://localhost:${PORT}/api/health`);
    console.log(`[AI Workforce Platform Backend] Database health check: http://localhost:${PORT}/api/health/db`);
    console.log(`[AI Workforce Platform Backend] Redis health check: http://localhost:${PORT}/api/health/redis`);
    console.log(`[AI Workforce Platform Backend] Customers endpoint: http://localhost:${PORT}/api/customers`);
  });

  // Graceful shutdown on container termination signals (SIGTERM / SIGINT)
  const gracefulShutdown = async (signal: string) => {
    console.log(`[AI Workforce Platform Backend] Received ${signal}. Starting graceful shutdown...`);
    server.close(async () => {
      console.log("[AI Workforce Platform Backend] HTTP server closed. Draining database pool...");
      try {
        await pool.end();
        console.log("[AI Workforce Platform Backend] MySQL pool closed successfully.");
      } catch (err) {
        console.warn("[AI Workforce Platform Backend] Error closing MySQL pool:", err);
      }
      process.exit(0);
    });

    // Hard ceiling timeout in case connections hang
    setTimeout(() => {
      console.error("[AI Workforce Platform Backend] Graceful shutdown timed out. Forcing process exit.");
      process.exit(1);
    }, 10000).unref();
  };

  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
}

bootstrap();

import { app } from "./app";
import { config } from "./config/env";
import { ensureSeedData } from "./services/customerService";
import { initRedis } from "./cache/redis";

const PORT = config.port;

async function bootstrap() {
  try {
    // 1. Seed initial demo data for database verification
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

  app.listen(PORT, () => {
    console.log(`[AI Workforce Platform Backend] Server is running on http://localhost:${PORT}`);
    console.log(`[AI Workforce Platform Backend] Process health check: http://localhost:${PORT}/api/health`);
    console.log(`[AI Workforce Platform Backend] Database health check: http://localhost:${PORT}/api/health/db`);
    console.log(`[AI Workforce Platform Backend] Redis health check: http://localhost:${PORT}/api/health/redis`);
    console.log(`[AI Workforce Platform Backend] Customers endpoint: http://localhost:${PORT}/api/customers`);
  });
}

bootstrap();

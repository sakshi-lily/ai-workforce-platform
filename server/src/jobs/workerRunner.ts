/**
 * AI Workforce Platform — Phase 18: Standalone Worker Runner
 *
 * Can be run as an independent background daemon process:
 *   npx tsx src/jobs/workerRunner.ts
 */

import dotenv from "dotenv";
dotenv.config();

import { backgroundWorker } from "./worker";

async function main() {
  console.log("==================================================");
  console.log("   AI Workforce Platform — Background Worker Daemon ");
  console.log("==================================================");

  try {
    await backgroundWorker.start();

    // Keep process active
    process.on("SIGINT", async () => {
      await backgroundWorker.stop();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      await backgroundWorker.stop();
      process.exit(0);
    });
  } catch (err) {
    console.error("[Worker Runner Fatal Error]", err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

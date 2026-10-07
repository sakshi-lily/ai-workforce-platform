import { pool } from "./pool";

export async function migratePhase19() {
  console.log("[Migration] Running Phase 19 Schema Migration (Reliability, Recovery & Optimistic Concurrency)...");
  try {
    // 1. Add version column to tasks for optimistic concurrency protection
    try {
      await pool.query(`
        ALTER TABLE tasks ADD COLUMN version INT NOT NULL DEFAULT 1;
      `);
      console.log("[Migration] Added 'version' column to tasks table.");
    } catch (err: any) {
      if (err.code === "ER_DUP_FIELDNAME") {
        console.log("[Migration] 'version' column already exists in tasks table.");
      } else {
        console.warn("[Migration] tasks.version ALTER notice:", err.message);
      }
    }

    // 2. Add total_retries column to tasks for cross-layer retry budget enforcement
    try {
      await pool.query(`
        ALTER TABLE tasks ADD COLUMN total_retries INT NOT NULL DEFAULT 0;
      `);
      console.log("[Migration] Added 'total_retries' column to tasks table.");
    } catch (err: any) {
      if (err.code === "ER_DUP_FIELDNAME") {
        console.log("[Migration] 'total_retries' column already exists in tasks table.");
      } else {
        console.warn("[Migration] tasks.total_retries ALTER notice:", err.message);
      }
    }

    // 3. Create job_attempts table for durable historical attempt traceability
    await pool.query(`
      CREATE TABLE IF NOT EXISTS job_attempts (
        id VARCHAR(64) PRIMARY KEY,
        job_id VARCHAR(64) NOT NULL,
        task_id VARCHAR(36) NOT NULL,
        organization_id VARCHAR(64) NOT NULL,
        attempt_number INT NOT NULL,
        worker_id VARCHAR(64) NOT NULL,
        status ENUM('RUNNING', 'COMPLETED', 'FAILED', 'RETRYING', 'EXHAUSTED', 'TIMED_OUT', 'RECOVERED') NOT NULL DEFAULT 'RUNNING',
        error_code VARCHAR(100) NULL,
        error_category VARCHAR(100) NULL,
        error_details JSON NULL,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP NULL,
        duration_ms INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_job_attempts_task (task_id),
        INDEX idx_job_attempts_job (job_id),
        INDEX idx_job_attempts_org (organization_id)
      ) ENGINE=InnoDB;
    `);
    console.log("[Migration] job_attempts table created/verified.");

    console.log("[Migration] SUCCESS: Phase 19 Schema Migration complete.");
  } catch (err) {
    console.error("[Migration] Phase 19 Migration Failed:", err);
    throw err;
  }
}

// Allow direct execution via tsx
if (require.main === module) {
  migratePhase19()
    .then(() => {
      console.log("[Migration] Direct execution completed successfully.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("[Migration] Direct execution failed:", err);
      process.exit(1);
    });
}

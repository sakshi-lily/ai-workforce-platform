import { pool } from "./pool";

export async function migratePhase18() {
  console.log("[Migration] Running Phase 18 Schema Migration (jobs & background worker tables)...");
  try {
    // 1. Extend tasks.status enum to include QUEUED
    try {
      await pool.query(`
        ALTER TABLE tasks 
        MODIFY COLUMN status ENUM(
          'PENDING', 'REQUESTED', 'QUEUED', 'IN_PROGRESS', 'RUNNING', 
          'AWAITING_APPROVAL', 'WAITING_FOR_APPROVAL', 
          'COMPLETED', 'FAILED', 'CANCELLED'
        ) NOT NULL DEFAULT 'REQUESTED';
      `);
      console.log("[Migration] tasks.status ENUM updated to include QUEUED.");
    } catch (err: any) {
      console.warn("[Migration] tasks.status ALTER warning (might already exist):", err.message);
    }

    // 2. Create jobs table for durable operational history and background dispatch
    await pool.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id VARCHAR(64) PRIMARY KEY,
        task_id VARCHAR(36) NOT NULL,
        organization_id VARCHAR(64) NOT NULL,
        type VARCHAR(50) NOT NULL DEFAULT 'TASK_EXECUTION',
        status ENUM('QUEUED', 'ACTIVE', 'COMPLETED', 'FAILED', 'RETRYING', 'CANCELLED', 'EXHAUSTED') NOT NULL DEFAULT 'QUEUED',
        priority ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT') NOT NULL DEFAULT 'NORMAL',
        payload JSON NOT NULL,
        attempts INT NOT NULL DEFAULT 0,
        max_attempts INT NOT NULL DEFAULT 3,
        worker_id VARCHAR(64) NULL,
        last_error JSON NULL,
        locked_until TIMESTAMP NULL,
        started_at TIMESTAMP NULL,
        completed_at TIMESTAMP NULL,
        failed_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        INDEX idx_jobs_status_priority (status, priority),
        INDEX idx_jobs_task (task_id),
        INDEX idx_jobs_org (organization_id)
      ) ENGINE=InnoDB;
    `);
    console.log("[Migration] jobs table created/verified.");

    // 3. Create worker_heartbeats table for worker registry and telemetry
    await pool.query(`
      CREATE TABLE IF NOT EXISTS worker_heartbeats (
        worker_id VARCHAR(64) PRIMARY KEY,
        hostname VARCHAR(255) NULL,
        pid INT NOT NULL,
        status ENUM('ONLINE', 'BUSY', 'STOPPING', 'OFFLINE') NOT NULL DEFAULT 'ONLINE',
        concurrency INT NOT NULL DEFAULT 2,
        active_jobs INT NOT NULL DEFAULT 0,
        last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);
    console.log("[Migration] worker_heartbeats table created/verified.");

    console.log("[Migration] SUCCESS: Phase 18 Schema Migration complete.");
  } catch (err) {
    console.error("[Migration] Phase 18 Migration Failed:", err);
    throw err;
  }
}

// Allow direct execution via tsx
if (require.main === module) {
  migratePhase18()
    .then(() => {
      console.log("[Migration] Direct execution completed successfully.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("[Migration] Direct execution failed:", err);
      process.exit(1);
    });
}

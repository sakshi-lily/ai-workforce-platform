import { pool } from "./pool";

async function runMigration() {
  console.log("Running Phase 7 Schema Migration...");
  try {
    await pool.query(`
      ALTER TABLE tasks 
      MODIFY COLUMN status ENUM('PENDING', 'REQUESTED', 'IN_PROGRESS', 'RUNNING', 'AWAITING_APPROVAL', 'COMPLETED', 'FAILED', 'CANCELLED') 
      NOT NULL DEFAULT 'REQUESTED';
    `);
    console.log("SUCCESS: tasks table status ENUM updated with REQUESTED and RUNNING.");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();

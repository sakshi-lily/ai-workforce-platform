import { pool } from "./pool";

export async function migratePhase17() {
  console.log("[Migration] Running Phase 17 Schema Migration (approvals & task states)...");
  try {
    // 1. Extend tasks.status enum to include WAITING_FOR_APPROVAL if needed
    try {
      await pool.query(`
        ALTER TABLE tasks 
        MODIFY COLUMN status ENUM(
          'PENDING', 'REQUESTED', 'IN_PROGRESS', 'RUNNING', 
          'AWAITING_APPROVAL', 'WAITING_FOR_APPROVAL', 
          'COMPLETED', 'FAILED', 'CANCELLED'
        ) NOT NULL DEFAULT 'REQUESTED';
      `);
      console.log("[Migration] tasks.status ENUM updated to include WAITING_FOR_APPROVAL.");
    } catch (err: any) {
      console.warn("[Migration] tasks.status ALTER warning (might already exist):", err.message);
    }

    // 2. Extend task_steps.status enum to include WAITING_FOR_APPROVAL
    try {
      await pool.query(`
        ALTER TABLE task_steps 
        MODIFY COLUMN status ENUM(
          'PENDING', 'IN_PROGRESS', 'WAITING_FOR_APPROVAL', 'COMPLETED', 'FAILED', 'SKIPPED'
        ) NOT NULL DEFAULT 'PENDING';
      `);
      console.log("[Migration] task_steps.status ENUM updated to include WAITING_FOR_APPROVAL.");
    } catch (err: any) {
      console.warn("[Migration] task_steps.status ALTER warning:", err.message);
    }

    // 3. Extend approvals table
    try {
      await pool.query(`ALTER TABLE approvals MODIFY COLUMN id VARCHAR(64) NOT NULL;`);
      console.log("[Migration] approvals.id column widened to VARCHAR(64).");
    } catch (err: any) {
      console.warn("[Migration] approvals.id ALTER warning:", err.message);
    }

    // Update status enum
    try {
      await pool.query(`
        ALTER TABLE approvals 
        MODIFY COLUMN status ENUM(
          'PENDING', 'APPROVED', 'EXECUTING', 'EXECUTED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'MODIFIED'
        ) NOT NULL DEFAULT 'PENDING';
      `);
      console.log("[Migration] approvals.status ENUM updated.");
    } catch (err: any) {
      console.warn("[Migration] approvals.status ALTER warning:", err.message);
    }

    // Add missing columns to approvals
    const [cols] = await pool.query<any[]>("SHOW COLUMNS FROM approvals;");
    const existingColNames = cols.map((c) => c.Field);

    const columnsToAdd: { name: string; ddl: string }[] = [
      { name: "step_id", ddl: "ADD COLUMN step_id VARCHAR(36) NULL AFTER task_id" },
      { name: "organization_id", ddl: "ADD COLUMN organization_id VARCHAR(64) NULL AFTER step_id" },
      { name: "requested_by", ddl: "ADD COLUMN requested_by VARCHAR(64) NULL AFTER organization_id" },
      { name: "approved_by", ddl: "ADD COLUMN approved_by VARCHAR(64) NULL AFTER requested_by" },
      { name: "tool_name", ddl: "ADD COLUMN tool_name VARCHAR(100) NULL AFTER approved_by" },
      { name: "risk_level", ddl: "ADD COLUMN risk_level VARCHAR(50) NOT NULL DEFAULT 'EXTERNAL_SIDE_EFFECT' AFTER tool_name" },
      { name: "request_payload", ddl: "ADD COLUMN request_payload JSON NULL AFTER payload_preview" },
      { name: "decision_note", ddl: "ADD COLUMN decision_note TEXT NULL AFTER reviewer_notes" },
      { name: "requested_at", ddl: "ADD COLUMN requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER created_at" },
      { name: "decided_at", ddl: "ADD COLUMN decided_at TIMESTAMP NULL AFTER reviewed_at" },
      { name: "expires_at", ddl: "ADD COLUMN expires_at TIMESTAMP NULL AFTER decided_at" },
      { name: "executed_at", ddl: "ADD COLUMN executed_at TIMESTAMP NULL AFTER expires_at" },
    ];

    for (const col of columnsToAdd) {
      if (!existingColNames.includes(col.name)) {
        try {
          await pool.query(`ALTER TABLE approvals ${col.ddl};`);
          console.log(`[Migration] Added column ${col.name} to approvals.`);
        } catch (err: any) {
          console.warn(`[Migration] Warning adding column ${col.name}:`, err.message);
        }
      }
    }

    // Add indexes for efficient tenant query and expiration management
    try {
      await pool.query(`
        ALTER TABLE approvals 
        ADD INDEX idx_approvals_org_status (organization_id, status);
      `);
    } catch {
      // index might already exist
    }

    try {
      await pool.query(`
        ALTER TABLE approvals 
        ADD INDEX idx_approvals_expires (expires_at);
      `);
    } catch {
      // index might already exist
    }

    console.log("[Migration] SUCCESS: Phase 17 Schema Migration complete.");
  } catch (err) {
    console.error("[Migration] Phase 17 Failed:", err);
    throw err;
  }
}

if (require.main === module) {
  migratePhase17().then(() => pool.end());
}

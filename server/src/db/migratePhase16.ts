import { pool } from "./pool";

export async function migratePhase16() {
  console.log("[Migration] Running Phase 16 Schema Migration (gmail_connections)...");
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gmail_connections (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(64) NOT NULL,
        organization_id VARCHAR(64) NOT NULL,
        provider VARCHAR(50) NOT NULL DEFAULT 'google',
        email_address VARCHAR(255) NOT NULL,
        provider_account_id VARCHAR(255) NULL,
        access_token_encrypted TEXT NULL,
        refresh_token_encrypted TEXT NULL,
        token_expires_at TIMESTAMP NULL,
        scopes TEXT NULL,
        status ENUM('CONNECTED', 'EXPIRED', 'REAUTH_REQUIRED', 'DISCONNECTED', 'ERROR') NOT NULL DEFAULT 'CONNECTED',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_gmail_user (user_id),
        INDEX idx_gmail_org (organization_id),
        INDEX idx_gmail_email (email_address)
      ) ENGINE=InnoDB;
    `);
    console.log("[Migration] SUCCESS: gmail_connections table created/verified.");
  } catch (err) {
    console.error("[Migration] Failed:", err);
    throw err;
  }
}

if (require.main === module) {
  migratePhase16().then(() => pool.end());
}

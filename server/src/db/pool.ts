import mysql, { Pool } from "mysql2/promise";
import { config } from "../config/env";

// Create MySQL connection pool
export const pool: Pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: config.db.waitForConnections,
  connectionLimit: config.db.connectionLimit,
  queueLimit: config.db.queueLimit,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
});

/**
 * Health check querying the database using a lightweight SELECT 1.
 */
export async function checkDatabaseHealth(): Promise<{
  connected: boolean;
  database: string;
  serverVersion?: string;
  error?: string;
}> {
  try {
    const [rows] = await pool.query<mysql.RowDataPacket[]>("SELECT 1 AS health, VERSION() AS version;");
    const serverVersion = rows[0]?.version ? String(rows[0].version) : undefined;
    return {
      connected: true,
      database: config.db.database,
      serverVersion,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown database connection failure";
    return {
      connected: false,
      database: config.db.database,
      error: message,
    };
  }
}

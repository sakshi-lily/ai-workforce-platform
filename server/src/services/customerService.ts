import crypto from "crypto";
import { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { pool } from "../db/pool";

export interface Customer {
  id: string;
  user_id: string;
  company_name: string;
  domain: string;
  contact_name: string | null;
  contact_email: string | null;
  industry: string | null;
  qualification_score: number | null;
  qualification_rationale: string | null;
  status: "NEW" | "QUALIFIED" | "CONTACTED" | "DISQUALIFIED" | "CUSTOMER";
  created_at: string;
  updated_at: string;
}

export interface CreateCustomerInput {
  userId?: string;
  companyName: string;
  domain: string;
  contactName?: string;
  contactEmail?: string;
  industry?: string;
  status?: "NEW" | "QUALIFIED" | "CONTACTED" | "DISQUALIFIED" | "CUSTOMER";
}

const DEFAULT_DEMO_USER_ID = "usr_phase4_seed_001";

/**
 * Ensures a default workspace user and initial seed customers exist
 * so that application queries immediately demonstrate structured data persistence.
 */
export async function ensureSeedData(): Promise<void> {
  const connection = await pool.getConnection();
  try {
    // 1. Ensure demo user exists
    await connection.query(
      `INSERT INTO users (id, email, password_hash, full_name, organization_name)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE full_name = VALUES(full_name);`,
      [
        DEFAULT_DEMO_USER_ID,
        "dev@ai-workforce.local",
        "hash_placeholder_phase4",
        "Platform Developer",
        "AI Workforce Labs",
      ]
    );

    // 2. Check if sample customers exist
    const [rows] = await connection.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS count FROM customers WHERE user_id = ?;",
      [DEFAULT_DEMO_USER_ID]
    );

    const count = Number(rows[0]?.count ?? 0);
    if (count === 0) {
      const sampleCustomers = [
        {
          id: crypto.randomUUID(),
          user_id: DEFAULT_DEMO_USER_ID,
          company_name: "Apex Cloud Innovations",
          domain: "apexcloud.io",
          contact_name: "Sarah Chen",
          contact_email: "sarah@apexcloud.io",
          industry: "Cloud Infrastructure",
          qualification_score: 92,
          qualification_rationale: "High recurring cloud spend with immediate need for workflow automation.",
          status: "QUALIFIED" as const,
        },
        {
          id: crypto.randomUUID(),
          user_id: DEFAULT_DEMO_USER_ID,
          company_name: "DataPulse Analytics",
          domain: "datapulse.ai",
          contact_name: "Marcus Vance",
          contact_email: "m.vance@datapulse.ai",
          industry: "Data Engineering",
          qualification_score: 85,
          qualification_rationale: "Expanding data pipeline team seeking automated task delegation.",
          status: "NEW" as const,
        },
        {
          id: crypto.randomUUID(),
          user_id: DEFAULT_DEMO_USER_ID,
          company_name: "Quantum Logistics",
          domain: "quantumlogistics.com",
          contact_name: "Elena Rostova",
          contact_email: "elena@quantumlogistics.com",
          industry: "Supply Chain",
          qualification_score: 78,
          qualification_rationale: "Interested in automated email tracking and customer discovery.",
          status: "CONTACTED" as const,
        },
      ];

      for (const c of sampleCustomers) {
        await connection.query(
          `INSERT INTO customers 
            (id, user_id, company_name, domain, contact_name, contact_email, industry, qualification_score, qualification_rationale, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            c.id,
            c.user_id,
            c.company_name,
            c.domain,
            c.contact_name,
            c.contact_email,
            c.industry,
            c.qualification_score,
            c.qualification_rationale,
            c.status,
          ]
        );
      }
    }
  } finally {
    connection.release();
  }
}

/**
 * Fetch all customers using parameterized limit.
 */
export async function getAllCustomers(limit: number = 20): Promise<Customer[]> {
  const safeLimit = Math.min(Math.max(1, limit), 100);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, user_id, company_name, domain, contact_name, contact_email, 
            industry, qualification_score, qualification_rationale, status, created_at, updated_at
     FROM customers
     ORDER BY created_at DESC
     LIMIT ?;`,
    [safeLimit]
  );

  return rows as Customer[];
}

/**
 * Parameterized query demonstrating domain search.
 * Protects against SQL injection by binding values.
 */
export async function getCustomerByDomain(domain: string): Promise<Customer | null> {
  const normalizedDomain = domain.trim().toLowerCase();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, user_id, company_name, domain, contact_name, contact_email, 
            industry, qualification_score, qualification_rationale, status, created_at, updated_at
     FROM customers
     WHERE domain = ?
     LIMIT 1;`,
    [normalizedDomain]
  );

  if (rows.length === 0) {
    return null;
  }
  return rows[0] as Customer;
}

/**
 * Inserts a customer record with validated, parameterized inputs.
 */
export async function createCustomer(input: CreateCustomerInput): Promise<Customer> {
  const id = crypto.randomUUID();
  const userId = input.userId || DEFAULT_DEMO_USER_ID;
  const companyName = input.companyName.trim();
  const domain = input.domain.trim().toLowerCase();
  const contactName = input.contactName?.trim() || null;
  const contactEmail = input.contactEmail?.trim().toLowerCase() || null;
  const industry = input.industry?.trim() || null;
  const status = input.status || "NEW";

  await pool.query<ResultSetHeader>(
    `INSERT INTO customers 
      (id, user_id, company_name, domain, contact_name, contact_email, industry, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    [id, userId, companyName, domain, contactName, contactEmail, industry, status]
  );

  const created = await getCustomerByDomain(domain);
  if (!created) {
    throw new Error("Customer was created but could not be retrieved.");
  }
  return created;
}

import crypto from "crypto";
import { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { pool } from "../db/pool";
import { getCache, setCache, delCachePattern } from "../cache/redis";

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

export interface QueryResult<T> {
  data: T;
  source: "cache" | "database";
  latencyMs: number;
}

export const DEFAULT_DEMO_USER_ID = "usr_phase4_seed_001";

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
 * Fetch all customers using the Cache-Aside pattern:
 * 1. Check Redis cache key: `customers:list:${safeLimit}`
 * 2. On Cache HIT -> return cached data immediately
 * 3. On Cache MISS -> query MySQL, store in Redis with TTL (60s), return data
 */
export async function getAllCustomers(limit: number = 20): Promise<QueryResult<Customer[]>> {
  const safeLimit = Math.min(Math.max(1, limit), 100);
  const cacheKey = `customers:list:limit:${safeLimit}`;
  const start = performance.now();

  // 1. Try Cache Read
  const cached = await getCache<Customer[]>(cacheKey);
  if (cached) {
    const elapsed = Math.round(performance.now() - start);
    return {
      data: cached,
      source: "cache",
      latencyMs: elapsed,
    };
  }

  // 2. Cache MISS: Query MySQL
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, user_id, company_name, domain, contact_name, contact_email, 
            industry, qualification_score, qualification_rationale, status, created_at, updated_at
     FROM customers
     ORDER BY created_at DESC
     LIMIT ?;`,
    [safeLimit]
  );

  const customers = rows as Customer[];
  const elapsed = Math.round(performance.now() - start);

  // 3. Write to Redis with TTL
  await setCache(cacheKey, customers);

  return {
    data: customers,
    source: "database",
    latencyMs: elapsed,
  };
}

/**
 * Parameterized query demonstrating domain search with Cache-Aside pattern:
 * Key: `customers:domain:${normalizedDomain}`
 */
export async function getCustomerByDomain(domain: string): Promise<QueryResult<Customer | null>> {
  const normalizedDomain = domain.trim().toLowerCase();
  const cacheKey = `customers:domain:${normalizedDomain}`;
  const start = performance.now();

  // 1. Try Cache Read
  const cached = await getCache<Customer>(cacheKey);
  if (cached) {
    const elapsed = Math.round(performance.now() - start);
    return {
      data: cached,
      source: "cache",
      latencyMs: elapsed,
    };
  }

  // 2. Cache MISS: Query MySQL with parameterized binding
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, user_id, company_name, domain, contact_name, contact_email, 
            industry, qualification_score, qualification_rationale, status, created_at, updated_at
     FROM customers
     WHERE domain = ?
     LIMIT 1;`,
    [normalizedDomain]
  );

  const customer = (rows.length > 0 ? rows[0] : null) as Customer | null;
  const elapsed = Math.round(performance.now() - start);

  // 3. Cache positive results in Redis
  if (customer) {
    await setCache(cacheKey, customer);
  }

  return {
    data: customer,
    source: "database",
    latencyMs: elapsed,
  };
}

/**
 * Inserts a customer record with validated, parameterized inputs.
 * Crucial Cache-Aside Rule: Write authoritative data to MySQL first,
 * then invalidate affected Redis cache keys so stale entries are never served.
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

  // 1. Authoritative MySQL write
  await pool.query<ResultSetHeader>(
    `INSERT INTO customers 
      (id, user_id, company_name, domain, contact_name, contact_email, industry, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    [id, userId, companyName, domain, contactName, contactEmail, industry, status]
  );

  // 2. Invalidate affected cache entries
  await delCachePattern("customers:*");
  console.log(`[Cache Invalidation] Cleared all customer cache entries after creating domain: ${domain}`);

  // 3. Retrieve created record
  const result = await getCustomerByDomain(domain);
  if (!result.data) {
    throw new Error("Customer was created but could not be retrieved.");
  }
  return result.data;
}

export interface CustomerVerificationRecord {
  id: string;
  company_name: string;
  domain: string;
  contact_name: string | null;
  contact_email: string | null;
  industry: string | null;
  qualification_score: number | null;
  status: "NEW" | "QUALIFIED" | "CONTACTED" | "DISQUALIFIED" | "CUSTOMER";
  created_at: string;
}

export interface CustomerVerificationResult {
  found: boolean;
  customer: CustomerVerificationRecord | null;
}

/**
 * Phase 10: Server-owned, parameterized customer verification by email.
 * Ensures strict tenant isolation and data minimization.
 * Never allows arbitrary SQL or query manipulation.
 */
export async function verifyCustomerByEmail(
  email: string,
  userId: string = DEFAULT_DEMO_USER_ID
): Promise<CustomerVerificationResult> {
  const normalizedEmail = email.trim().toLowerCase();

  // Parameterized query scoped to tenant (user_id)
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, company_name, domain, contact_name, contact_email, 
            industry, qualification_score, status, created_at
     FROM customers
     WHERE LOWER(contact_email) = ? AND user_id = ?
     LIMIT 1;`,
    [normalizedEmail, userId]
  );

  if (rows.length === 0) {
    return {
      found: false,
      customer: null,
    };
  }

  const row = rows[0];
  return {
    found: true,
    customer: {
      id: row.id,
      company_name: row.company_name,
      domain: row.domain,
      contact_name: row.contact_name,
      contact_email: row.contact_email,
      industry: row.industry,
      qualification_score: row.qualification_score !== null ? Number(row.qualification_score) : null,
      status: row.status,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    },
  };
}


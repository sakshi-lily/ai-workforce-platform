import crypto from "crypto";
import bcrypt from "bcryptjs";
import { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { pool } from "../db/pool";
import { getCache, setCache, delCachePattern } from "../cache/redis";

export interface Customer {
  id: string;
  user_id: string;
  organization_id: string;
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
  organizationId?: string;
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

// Resilient in-memory customer registry for local development and offline degradation
const inMemoryCustomers: Customer[] = [
  {
    id: "cust-demo-001",
    user_id: DEFAULT_DEMO_USER_ID,
    organization_id: "org-demo-001",
    company_name: "Apex Cloud Innovations",
    domain: "apexcloud.io",
    contact_name: "Sarah Chen",
    contact_email: "sarah@apexcloud.io",
    industry: "Cloud Infrastructure",
    qualification_score: 92,
    qualification_rationale: "High recurring cloud spend with immediate need for workflow automation.",
    status: "QUALIFIED",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "cust-demo-002",
    user_id: DEFAULT_DEMO_USER_ID,
    organization_id: "org-demo-001",
    company_name: "DataPulse Analytics",
    domain: "datapulse.ai",
    contact_name: "Marcus Vance",
    contact_email: "m.vance@datapulse.ai",
    industry: "Data Engineering",
    qualification_score: 85,
    qualification_rationale: "Expanding data pipeline team seeking automated task delegation.",
    status: "NEW",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "cust-demo-003",
    user_id: DEFAULT_DEMO_USER_ID,
    organization_id: "org-demo-001",
    company_name: "Quantum Logistics",
    domain: "quantumlogistics.com",
    contact_name: "Elena Rostova",
    contact_email: "elena@quantumlogistics.com",
    industry: "Supply Chain",
    qualification_score: 78,
    qualification_rationale: "Interested in automated email tracking and customer discovery.",
    status: "CONTACTED",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

/**
 * Ensures a default workspace user and initial seed customers exist
 * so that application queries immediately demonstrate structured data persistence.
 */
export async function ensureSeedData(): Promise<void> {
  const connection = await pool.getConnection();
  try {
    const demoHash = bcrypt.hashSync("password123", 10);

    // 1. Ensure Tenant A Admin demo user exists
    await connection.query(
      `INSERT INTO users (id, email, password_hash, full_name, organization_name, organization_id, role)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         password_hash = VALUES(password_hash),
         role = VALUES(role),
         organization_id = VALUES(organization_id);`,
      [
        DEFAULT_DEMO_USER_ID,
        "dev@ai-workforce.local",
        demoHash,
        "Platform Developer",
        "AI Workforce Labs",
        "org-demo-001",
        "ADMIN",
      ]
    );

    // 2. Ensure Tenant B demo user exists
    await connection.query(
      `INSERT INTO users (id, email, password_hash, full_name, organization_name, organization_id, role)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         password_hash = VALUES(password_hash),
         role = VALUES(role),
         organization_id = VALUES(organization_id);`,
      [
        "usr_demo_tenant_b_002",
        "tenant-b@example.com",
        demoHash,
        "Tenant B Member",
        "Beta Corp",
        "org-demo-002",
        "USER",
      ]
    );

    // 3. Ensure Platform Admin demo user exists
    await connection.query(
      `INSERT INTO users (id, email, password_hash, full_name, organization_name, organization_id, role)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         password_hash = VALUES(password_hash),
         role = VALUES(role),
         organization_id = VALUES(organization_id);`,
      [
        "usr_demo_admin_001",
        "admin@example.com",
        demoHash,
        "Platform Administrator",
        "AI Workforce Labs",
        "org-demo-001",
        "ADMIN",
      ]
    );

    // 4. Check if sample customers exist
    const [rows] = await connection.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS count FROM customers WHERE user_id = ?;",
      [DEFAULT_DEMO_USER_ID]
    );

    const count = Number(rows[0]?.count ?? 0);
    if (count === 0) {
      for (const c of inMemoryCustomers) {
        await connection.query(
          `INSERT INTO customers 
            (id, user_id, organization_id, company_name, domain, contact_name, contact_email, industry, qualification_score, qualification_rationale, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            c.id,
            c.user_id,
            c.organization_id,
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
export async function getAllCustomers(
  organizationId: string = "org-demo-001",
  limit: number = 20
): Promise<QueryResult<Customer[]>> {
  const safeLimit = Math.min(Math.max(1, limit), 100);
  const cacheKey = `customers:${organizationId}:list:limit:${safeLimit}`;
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

  // 2. Cache MISS: Query MySQL scoped strictly to tenant (organization_id)
  let customers: Customer[] = [];
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, user_id, organization_id, company_name, domain, contact_name, contact_email, 
              industry, qualification_score, qualification_rationale, status, created_at, updated_at
       FROM customers
       WHERE organization_id = ?
       ORDER BY created_at DESC
       LIMIT ?;`,
      [organizationId, safeLimit]
    );
    customers = rows as Customer[];
  } catch {
    // Graceful offline fallback
    customers = inMemoryCustomers
      .filter((c) => c.organization_id === organizationId)
      .slice(0, safeLimit);
  }

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
 * Parameterized query demonstrating domain search with tenant-isolated Cache-Aside pattern:
 * Key: `customers:${organizationId}:domain:${normalizedDomain}`
 */
export async function getCustomerByDomain(
  domain: string,
  organizationId: string = "org-demo-001"
): Promise<QueryResult<Customer | null>> {
  const normalizedDomain = domain.trim().toLowerCase();
  const cacheKey = `customers:${organizationId}:domain:${normalizedDomain}`;
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
  let customer: Customer | null = null;
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, user_id, organization_id, company_name, domain, contact_name, contact_email, 
              industry, qualification_score, qualification_rationale, status, created_at, updated_at
       FROM customers
       WHERE domain = ? AND organization_id = ?
       LIMIT 1;`,
      [normalizedDomain, organizationId]
    );
    customer = (rows.length > 0 ? rows[0] : null) as Customer | null;
  } catch {
    // Graceful offline fallback
    customer =
      inMemoryCustomers.find(
        (c) =>
          c.domain.toLowerCase() === normalizedDomain &&
          c.organization_id === organizationId
      ) || null;
  }

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
 * then invalidate affected tenant-scoped Redis cache keys.
 */
export async function createCustomer(input: CreateCustomerInput): Promise<Customer> {
  const id = crypto.randomUUID();
  const userId = input.userId || DEFAULT_DEMO_USER_ID;
  const organizationId = input.organizationId || "org-demo-001";
  const companyName = input.companyName.trim();
  const domain = input.domain.trim().toLowerCase();
  const contactName = input.contactName?.trim() || null;
  const contactEmail = input.contactEmail?.trim().toLowerCase() || null;
  const industry = input.industry?.trim() || null;
  const status = input.status || "NEW";

  const newCustomer: Customer = {
    id,
    user_id: userId,
    organization_id: organizationId,
    company_name: companyName,
    domain,
    contact_name: contactName,
    contact_email: contactEmail,
    industry,
    qualification_score: null,
    qualification_rationale: null,
    status,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // 1. Authoritative MySQL write with tenant isolation
  try {
    await pool.query<ResultSetHeader>(
      `INSERT INTO customers 
        (id, user_id, organization_id, company_name, domain, contact_name, contact_email, industry, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [id, userId, organizationId, companyName, domain, contactName, contactEmail, industry, status]
    );
  } catch {
    // Graceful offline fallback
    inMemoryCustomers.unshift(newCustomer);
  }

  // Ensure record is always accessible in memory
  if (!inMemoryCustomers.some((c) => c.id === id)) {
    inMemoryCustomers.unshift(newCustomer);
  }

  // 2. Invalidate affected tenant-scoped cache entries
  await delCachePattern(`customers:${organizationId}:*`);
  console.log(`[Cache Invalidation] Cleared customer cache entries for org '${organizationId}' and domain: ${domain}`);

  // 3. Retrieve created record
  const result = await getCustomerByDomain(domain, organizationId);
  if (!result.data) {
    return newCustomer;
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
  organizationId: string = "org-demo-001"
): Promise<CustomerVerificationResult> {
  const normalizedEmail = email.trim().toLowerCase();

  try {
    // Parameterized query scoped to tenant (organization_id)
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, company_name, domain, contact_name, contact_email, 
              industry, qualification_score, status, created_at
       FROM customers
       WHERE LOWER(contact_email) = ? AND organization_id = ?
       LIMIT 1;`,
      [normalizedEmail, organizationId]
    );

    if (rows.length > 0) {
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
  } catch {
    // Graceful offline fallback
  }

  const memMatch = inMemoryCustomers.find(
    (c) =>
      c.contact_email?.toLowerCase() === normalizedEmail &&
      c.organization_id === organizationId
  );

  if (memMatch) {
    return {
      found: true,
      customer: {
        id: memMatch.id,
        company_name: memMatch.company_name,
        domain: memMatch.domain,
        contact_name: memMatch.contact_name,
        contact_email: memMatch.contact_email,
        industry: memMatch.industry,
        qualification_score: memMatch.qualification_score,
        status: memMatch.status,
        created_at: memMatch.created_at,
      },
    };
  }

  return {
    found: false,
    customer: null,
  };
}


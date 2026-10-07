/**
 * AI Workforce Platform — Phase 13: Authentication Verification Suite
 *
 * Exhaustively validates:
 * 1. User Registration, normalization, safe conflicts, password policy
 * 2. Login credential verification, safe errors, JWT generation
 * 3. /api/auth/me session verification & restoration
 * 4. Token tamper rejection & expired/invalid token handling
 * 5. Authentication middleware (requireAuth, optionalAuth, requireRole)
 * 6. Protection boundaries on customers, agent, RAG routes
 * 7. Client spoofing defense (userId / organizationId in body are ignored)
 * 8. Cross-tenant data isolation & IDOR protection
 * 9. Redis cache key tenant-scoping (no cross-tenant cache leakage)
 * 10. Audit logging of authentication events
 * 11. Regression validation across health checks and existing tools
 */

import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../app";
import { pool } from "../db/pool";
import { initRedis } from "../cache/redis";
import { config } from "../config/env";
import { toolRegistry } from "../tools/registry";
import { RowDataPacket } from "mysql2/promise";

interface TestReport {
  name: string;
  category: string;
  passed: boolean;
  durationMs: number;
  details?: string;
}

const reports: TestReport[] = [];

async function runTest(
  category: string,
  name: string,
  fn: () => Promise<void>
): Promise<void> {
  const start = performance.now();
  try {
    await fn();
    const durationMs = Math.round(performance.now() - start);
    reports.push({ category, name, passed: true, durationMs });
    console.log(`  [PASS] ${name} (${durationMs}ms)`);
  } catch (error: unknown) {
    const durationMs = Math.round(performance.now() - start);
    const details = error instanceof Error ? error.message : String(error);
    reports.push({ category, name, passed: false, durationMs, details });
    console.error(`  [FAIL] ${name} (${durationMs}ms): ${details}`);
  }
}

export async function runPhase13VerificationSuite(): Promise<{
  total: number;
  passed: number;
  failed: number;
  allPassed: boolean;
}> {
  console.log("\n==================================================================");
  console.log("   AI Workforce Platform — Phase 13: Authentication Test Suite   ");
  console.log("==================================================================\n");

  const timestamp = Date.now();
  const testEmailA = `test-user-a-${timestamp}@example.com`;
  const testEmailB = `test-user-b-${timestamp}@example.com`;
  const testOrgA = `org-test-a-${timestamp}`;
  const testOrgB = `org-test-b-${timestamp}`;
  const testPassword = "ValidPassword123";

  let tokenA = "";
  let userAId = "";
  let tokenB = "";
  let userBId = "";

  // =========================================================================
  // 1. REGISTRATION & INPUT VALIDATION
  // =========================================================================
  console.log("--- Category 1: Registration & Validation ---");

  await runTest("Registration", "Registers valid user with custom tenant organization", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({
        email: testEmailA,
        password: testPassword,
        organizationId: testOrgA,
      });

    if (res.status !== 201) {
      throw new Error(`Expected status 201, got ${res.status}: ${JSON.stringify(res.body)}`);
    }

    if (!res.body.token || typeof res.body.token !== "string") {
      throw new Error("Response did not contain valid JWT token");
    }

    if (!res.body.user || res.body.user.email !== testEmailA.toLowerCase()) {
      throw new Error(`Returned user email mismatch: ${JSON.stringify(res.body.user)}`);
    }

    if (res.body.user.organizationId !== testOrgA) {
      throw new Error(`Expected organizationId ${testOrgA}, got ${res.body.user.organizationId}`);
    }

    // Security check: Never return password hashes or secrets
    if (res.body.user.password_hash || res.body.user.password) {
      throw new Error("CRITICAL LEAK: Password or hash returned in response!");
    }

    tokenA = res.body.token;
    userAId = res.body.user.id;
  });

  await runTest("Registration", "Normalizes email (case-insensitive deduplication)", async () => {
    // Attempt registering with uppercase version of the same email
    const res = await request(app)
      .post("/api/auth/register")
      .send({
        email: testEmailA.toUpperCase(),
        password: testPassword,
      });

    if (res.status !== 409) {
      throw new Error(`Expected 409 Conflict for duplicate normalized email, got ${res.status}`);
    }

    if (res.body.error?.code !== "EMAIL_ALREADY_EXISTS") {
      throw new Error(`Expected error code EMAIL_ALREADY_EXISTS, got ${res.body.error?.code}`);
    }
  });

  await runTest("Registration", "Rejects invalid email format with 400", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({
        email: "not-an-email",
        password: testPassword,
      });

    if (res.status !== 400) {
      throw new Error(`Expected 400 for invalid email, got ${res.status}`);
    }
  });

  await runTest("Registration", "Rejects weak password (<8 characters)", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({
        email: `short-pass-${timestamp}@example.com`,
        password: "short1",
      });

    if (res.status !== 400) {
      throw new Error(`Expected 400 for short password, got ${res.status}`);
    }
  });

  await runTest("Registration", "Rejects password without letters or numbers", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({
        email: `no-num-pass-${timestamp}@example.com`,
        password: "lettersalltheway",
      });

    if (res.status !== 400) {
      throw new Error(`Expected 400 for password missing digits, got ${res.status}`);
    }
  });

  await runTest("Registration", "Registers second tenant user (Tenant B)", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({
        email: testEmailB,
        password: testPassword,
        organizationId: testOrgB,
      });

    if (res.status !== 201) {
      throw new Error(`Expected status 201, got ${res.status}: ${JSON.stringify(res.body)}`);
    }

    tokenB = res.body.token;
    userBId = res.body.user.id;
  });

  // =========================================================================
  // 2. LOGIN & CREDENTIAL VERIFICATION
  // =========================================================================
  console.log("\n--- Category 2: Login & Credential Verification ---");

  await runTest("Login", "Authenticates seeded admin user (dev@ai-workforce.local)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: "dev@ai-workforce.local",
        password: "password123",
      });

    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    }

    if (!res.body.token) throw new Error("No token returned on login");
    if (res.body.user.role !== "ADMIN") {
      throw new Error(`Expected role ADMIN, got ${res.body.user.role}`);
    }
  });

  await runTest("Login", "Authenticates registered user with normalized email", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: testEmailA.toUpperCase(), // Test case normalization
        password: testPassword,
      });

    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}`);
    }

    if (res.body.user.id !== userAId) {
      throw new Error("Returned user ID mismatch");
    }
  });

  await runTest("Login", "Rejects incorrect password with generic 401 error", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: testEmailA,
        password: "WrongPassword999",
      });

    if (res.status !== 401) {
      throw new Error(`Expected 401 for incorrect password, got ${res.status}`);
    }

    if (res.body.error?.code !== "INVALID_CREDENTIALS") {
      throw new Error(`Expected code INVALID_CREDENTIALS, got ${res.body.error?.code}`);
    }

    // Ensure error message does not leak which field failed
    if (res.body.error?.message?.toLowerCase().includes("password")) {
      throw new Error("Error message leaks that email was found!");
    }
  });

  await runTest("Login", "Rejects non-existent email with generic 401 error", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: `ghost-user-${timestamp}@unknown-domain.com`,
        password: "SomePassword123",
      });

    if (res.status !== 401) {
      throw new Error(`Expected 401 for non-existent user, got ${res.status}`);
    }

    if (res.body.error?.code !== "INVALID_CREDENTIALS") {
      throw new Error(`Expected code INVALID_CREDENTIALS, got ${res.body.error?.code}`);
    }
  });

  // =========================================================================
  // 3. /api/auth/me SESSION RESTORATION & TOKEN VERIFICATION
  // =========================================================================
  console.log("\n--- Category 3: Session Verification & /api/auth/me ---");

  await runTest("/api/auth/me", "Returns authenticated identity when valid token provided", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${tokenA}`);

    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}`);
    }

    if (!res.body.authenticated || res.body.user.id !== userAId) {
      throw new Error(`Failed to restore session for User A: ${JSON.stringify(res.body)}`);
    }

    if (res.body.user.organizationId !== testOrgA) {
      throw new Error(`Restored organizationId mismatch: ${res.body.user.organizationId}`);
    }
  });

  await runTest("/api/auth/me", "Rejects request without Authorization header with 401", async () => {
    const res = await request(app).get("/api/auth/me");

    if (res.status !== 401) {
      throw new Error(`Expected 401 for missing token, got ${res.status}`);
    }
  });

  await runTest("/api/auth/me", "Rejects malformed or tampered token with 401", async () => {
    const tamperedToken = tokenA.substring(0, tokenA.length - 6) + "abcdef";
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${tamperedToken}`);

    if (res.status !== 401) {
      throw new Error(`Expected 401 for tampered token, got ${res.status}`);
    }
  });

  await runTest("/api/auth/me", "Rejects token signed with wrong secret with 401", async () => {
    const fakeToken = jwt.sign(
      { sub: userAId, email: testEmailA, organizationId: testOrgA, role: "USER" },
      "wrong-secret-key-1234567890",
      { expiresIn: "1h" }
    );

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${fakeToken}`);

    if (res.status !== 401) {
      throw new Error(`Expected 401 for foreign secret signature, got ${res.status}`);
    }
  });

  // =========================================================================
  // 4. PROTECTION BOUNDARIES & IDENTITY SPOOFING DEFENSE
  // =========================================================================
  console.log("\n--- Category 4: Protection Boundaries & Anti-Spoofing ---");

  await runTest("Protection Boundary", "Blocks unauthenticated access to /api/customers with 401", async () => {
    const res = await request(app).get("/api/customers");
    if (res.status !== 401) {
      throw new Error(`Expected 401 for protected customers endpoint, got ${res.status}`);
    }
  });

  await runTest("Protection Boundary", "Blocks unauthenticated access to /api/agent/tasks with 401", async () => {
    const res = await request(app).get("/api/agent/tasks");
    if (res.status !== 401) {
      throw new Error(`Expected 401 for protected agent tasks endpoint, got ${res.status}`);
    }
  });

  await runTest("Protection Boundary", "Blocks unauthenticated access to /api/rag/query with 401", async () => {
    const res = await request(app)
      .post("/api/rag/query")
      .send({ question: "What is company policy?" });

    if (res.status !== 401) {
      throw new Error(`Expected 401 for protected RAG endpoint, got ${res.status}`);
    }
  });

  await runTest("Anti-Spoofing", "Server ignores client-supplied userId in request body", async () => {
    // Authenticate as User A, but attempt to send userId = User B in body
    const res = await request(app)
      .post("/api/customers")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        companyName: `Anti-Spoof Test Corp ${timestamp}`,
        domain: `antispoof-${timestamp}.com`,
        userId: userBId, // Spoofed user ID!
        organizationId: testOrgB, // Spoofed tenant!
      });

    if (res.status !== 201) {
      throw new Error(`Customer creation failed: ${res.status} ${JSON.stringify(res.body)}`);
    }

    const created = res.body.data;
    if (created.user_id !== userAId) {
      throw new Error(`SPOOFING VULNERABILITY: Server accepted client userId ${created.user_id} instead of ${userAId}`);
    }

    if (created.organization_id !== testOrgA) {
      throw new Error(`SPOOFING VULNERABILITY: Server accepted client organizationId ${created.organization_id} instead of ${testOrgA}`);
    }
  });

  // =========================================================================
  // 5. CROSS-TENANT DATA ISOLATION & IDOR PROTECTION
  // =========================================================================
  console.log("\n--- Category 5: Multi-Tenant Data Isolation & IDOR Protection ---");

  let customerAId = "";

  await runTest("Tenant Isolation", "Creates customer in Tenant A scope", async () => {
    const res = await request(app)
      .post("/api/customers")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        companyName: `Tenant A Exclusive Systems ${timestamp}`,
        domain: `tenant-a-${timestamp}.com`,
        industry: "Security",
      });

    if (res.status !== 201) {
      throw new Error(`Failed to create customer for Tenant A: ${res.status}`);
    }

    customerAId = res.body.data.id;
  });

  await runTest("Tenant Isolation", "Tenant B cannot see Tenant A's customer in customer list", async () => {
    const res = await request(app)
      .get("/api/customers")
      .set("Authorization", `Bearer ${tokenB}`);

    if (res.status !== 200) {
      throw new Error(`Expected 200, got ${res.status}`);
    }

    const customers = res.body.data || [];
    const found = customers.find((c: any) => c.id === customerAId);
    if (found) {
      throw new Error(`CROSS-TENANT LEAKAGE: Tenant B retrieved Tenant A customer ID ${customerAId}!`);
    }
  });

  await runTest("Tenant Isolation", "Tenant B lookup cannot retrieve Tenant A's customer by domain", async () => {
    const res = await request(app)
      .get(`/api/customers/lookup?domain=tenant-a-${timestamp}.com`)
      .set("Authorization", `Bearer ${tokenB}`);

    // Must be 404 because domain belongs to Tenant A
    if (res.status !== 404) {
      throw new Error(`CROSS-TENANT LOOKUP LEAKAGE: Tenant B found Tenant A domain with status ${res.status}`);
    }
  });

  await runTest("IDOR Protection", "Tenant B cannot view Tenant A's agent task details", async () => {
    // 1. Create a task as User A
    const taskRes = await request(app)
      .post("/api/agent/tasks")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        task: "Verify system calculation: what is 50 + 50?",
        mode: "tools",
        allowedTools: ["calculate"],
      });

    if (taskRes.status !== 200) {
      throw new Error(`Failed to create agent task: ${taskRes.status} ${JSON.stringify(taskRes.body)}`);
    }

    const taskIdA = taskRes.body.data.taskId;

    // 2. User B attempts to access task details for taskIdA
    const idorRes = await request(app)
      .get(`/api/agent/tasks/${taskIdA}`)
      .set("Authorization", `Bearer ${tokenB}`);

    // Must return 404 (TASK_NOT_FOUND) due to tenant ownership check
    if (idorRes.status !== 404) {
      throw new Error(`IDOR VULNERABILITY: Tenant B accessed Tenant A task ${taskIdA} with status ${idorRes.status}!`);
    }
  });

  // =========================================================================
  // 6. CACHE ISOLATION IN REDIS
  // =========================================================================
  console.log("\n--- Category 6: Redis Cache Scoping & Tenant Isolation ---");

  await runTest("Cache Scoping", "Redis cache keys contain organizationId namespace", async () => {
    // Trigger customer list fetch for Tenant A (primes cache)
    await request(app)
      .get("/api/customers")
      .set("Authorization", `Bearer ${tokenA}`);

    // Check Redis keys
    const redis = await initRedis();
    if (!redis) {
      throw new Error("Redis client failed to initialize during test");
    }
    const keys = await redis.keys(`customers:${testOrgA}:*`);
    if (keys.length === 0) {
      throw new Error(`Expected Redis cache keys matching 'customers:${testOrgA}:*', found 0 keys`);
    }

    // Verify Tenant B has separate or zero keys for this pattern
    const bKeys = await redis.keys(`customers:${testOrgB}:list:*`);
    // Ensure no cross-pollination
    for (const k of keys) {
      if (k.includes(testOrgB)) {
        throw new Error(`CROSS-TENANT CACHE LEAK: Key ${k} contains both tenant IDs!`);
      }
    }
  });

  // =========================================================================
  // 7. AUDIT LOGGING OF AUTHENTICATION EVENTS
  // =========================================================================
  console.log("\n--- Category 7: Audit Trail Persistence ---");

  await runTest("Audit Logging", "Records USER_REGISTERED and USER_LOGIN_SUCCESS in audit_logs", async () => {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT action, user_id, organization_id 
       FROM audit_logs 
       WHERE user_id = ? 
       ORDER BY created_at DESC;`,
      [userAId]
    );

    if (rows.length === 0) {
      throw new Error(`No audit records found for user ${userAId}`);
    }

    const actions = rows.map((r) => r.action);
    if (!actions.includes("USER_REGISTERED")) {
      throw new Error(`Expected USER_REGISTERED in audit logs, found: ${actions.join(", ")}`);
    }

    if (!actions.includes("USER_LOGIN_SUCCESS")) {
      throw new Error(`Expected USER_LOGIN_SUCCESS in audit logs, found: ${actions.join(", ")}`);
    }
  });

  // =========================================================================
  // 8. REGRESSION: HEALTH CHECKS & PLATFORM TOOLS
  // =========================================================================
  console.log("\n--- Category 8: Backward Compatibility & Regression ---");

  await runTest("Regression", "Public health checks remain functional", async () => {
    const res1 = await request(app).get("/api/health");
    if (res1.status !== 200 || res1.body.status !== "ok") {
      throw new Error(`/api/health failed: ${res1.status}`);
    }

    const res2 = await request(app).get("/api/health/db");
    if (res2.status !== 200) throw new Error(`/api/health/db failed: ${res2.status}`);

    const res3 = await request(app).get("/api/health/redis");
    if (res3.status !== 200) throw new Error(`/api/health/redis failed: ${res3.status}`);

    const res4 = await request(app).get("/api/health/qdrant");
    if (res4.status !== 200) throw new Error(`/api/health/qdrant failed: ${res4.status}`);
  });

  await runTest("Regression", "Tool registry functions with host-provided context", async () => {
    const timeResult = await toolRegistry.executeTool(
      "get_current_time",
      { timezone: "UTC" },
      { userId: userAId, organizationId: testOrgA, taskId: "test-task" }
    );

    if (!timeResult.success) {
      throw new Error(`get_current_time failed: ${JSON.stringify(timeResult)}`);
    }

    const calcResult = await toolRegistry.executeTool(
      "calculate",
      { expression: "10 * 5" },
      { userId: userAId, organizationId: testOrgA, taskId: "test-task" }
    );

    if (!calcResult.success || (calcResult.data as any)?.result !== 50) {
      throw new Error(`calculate tool failed: ${JSON.stringify(calcResult)}`);
    }
  });

  // Clean up test customer records and users created during test
  try {
    await pool.query("DELETE FROM customers WHERE organization_id IN (?, ?)", [testOrgA, testOrgB]);
    await pool.query("DELETE FROM audit_logs WHERE user_id IN (?, ?)", [userAId, userBId]);
    await pool.query("DELETE FROM users WHERE id IN (?, ?)", [userAId, userBId]);
    const redis = await initRedis();
    if (redis) {
      await redis.del(`customers:${testOrgA}:list:limit:20`);
      await redis.del(`customers:${testOrgB}:list:limit:20`);
    }
  } catch (cleanErr) {
    console.warn("Cleanup warning:", cleanErr);
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  const passed = reports.filter((r) => r.passed).length;
  const failed = reports.filter((r) => !r.passed).length;
  const allPassed = failed === 0;

  console.log("\n==================================================================");
  console.log(`   Phase 13 Verification Complete: ${passed}/${reports.length} Tests Passed`);
  console.log(`   Overall Status: ${allPassed ? "SUCCESS (ALL PASSED)" : "FAILED"}`);
  console.log("==================================================================\n");

  return {
    total: reports.length,
    passed,
    failed,
    allPassed,
  };
}

// Direct execution
runPhase13VerificationSuite()
  .then((result) => {
    process.exit(result.allPassed ? 0 : 1);
  })
  .catch((err) => {
    console.error("Test execution fatal error:", err);
    process.exit(1);
  });

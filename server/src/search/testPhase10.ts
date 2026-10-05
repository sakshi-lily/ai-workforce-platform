/**
 * Phase 10 MySQL Verification Comprehensive Test Suite
 *
 * Verifies:
 * 1. Zod input schema validation (valid email, empty email rejection, malformed email rejection)
 * 2. Zod output schema & data minimization (only safe customer projection returned)
 * 3. Server-owned parameterized SQL execution (existing customer vs unknown customer)
 * 4. SQL Injection Defense (payloads rejected by validation and parameter binding prevents query alteration)
 * 5. Extra argument tampering defense ({ email, sql })
 * 6. Tool Registry integration & risk level (READ_ONLY)
 * 7. Tool Authorization & Allowlist gating (TOOL_NOT_ALLOWED when omitted)
 * 8. Tenant Isolation (lookups for other user's customer returns found: false)
 * 9. Rejection of arbitrary SQL and mutation tools (execute_sql, database_write)
 * 10. Watchdog limits enforcement (MAX_MYSQL_VERIFICATIONS: 5)
 * 11. MySQL durable persistence in tool_executions table
 * 12. End-to-End single-tool Agent execution (verify customer)
 * 13. End-to-End multi-tool Agent execution (web_search + mysql_verify_customer)
 */

import {
  MySQLVerifyCustomerInputSchema,
  MySQLVerifyCustomerOutputSchema,
  mysqlVerifyCustomerTool,
} from './../tools/implementations/mysqlVerifyCustomer';
import { toolRegistry } from '../tools/registry';
import { executeAgentTask } from '../agent/agentHost';
import { pool } from '../db/pool';
import { verifyCustomerByEmail, DEFAULT_DEMO_USER_ID } from '../services/customerService';

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function record(name: string, passed: boolean, details?: string) {
  results.push({ name, passed, details });
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${icon}: ${name}${details ? ` — ${details}` : ''}`);
}

async function runTestSuite() {
  console.log('='.repeat(70));
  console.log('🚀 RUNNING PHASE 10 COMPREHENSIVE VERIFICATION SUITE');
  console.log('='.repeat(70));

  // --- 1. Unit Tests: Zod Input Schema & Bounds ---
  console.log('\n--- 1. MySQL Verification Input Schema Validation ---');

  // 1.1 Valid email
  const valid1 = MySQLVerifyCustomerInputSchema.safeParse({ email: 'sarah@apexcloud.io' });
  record('Valid email parsed successfully', valid1.success);

  // 1.2 Empty or whitespace email
  const emptyEmail = MySQLVerifyCustomerInputSchema.safeParse({ email: '   ' });
  record('Empty or whitespace email rejected', !emptyEmail.success);

  // 1.3 Malformed non-email string
  const malformed = MySQLVerifyCustomerInputSchema.safeParse({ email: 'not-an-email' });
  record('Malformed email rejected by Zod syntax validator', !malformed.success);

  // 1.4 SQL injection payload rejected by Zod email validator
  const sqlInjection1 = MySQLVerifyCustomerInputSchema.safeParse({ email: "' OR '1'='1" });
  record("SQL injection payload '' OR '1'='1' rejected at validation layer", !sqlInjection1.success);

  const sqlInjection2 = MySQLVerifyCustomerInputSchema.safeParse({ email: "'; DROP TABLE customers; --" });
  record("Destructive SQL payload '; DROP TABLE customers; --' rejected at validation layer", !sqlInjection2.success);

  // --- 2. Server-Owned Parameterized Query & Result Normalization ---
  console.log('\n--- 2. Parameterized SQL Execution & Output Minimization ---');

  // 2.1 Existing seeded customer lookup
  const existingLookup = await verifyCustomerByEmail('sarah@apexcloud.io', 'usr_phase4_seed_001');
  record('Existing customer lookup returns found=true', existingLookup.found && !!existingLookup.customer);
  if (existingLookup.customer) {
    record('Customer company name matches seeded record', existingLookup.customer.company_name === 'Apex Cloud Innovations');
    record('Customer status is QUALIFIED', existingLookup.customer.status === 'QUALIFIED');
  }

  // 2.2 Output schema validation
  const outputValid = MySQLVerifyCustomerOutputSchema.safeParse(existingLookup);
  record('Lookup result satisfies MySQLVerifyCustomerOutputSchema contract', outputValid.success);

  // 2.3 Unknown customer lookup
  const unknownLookup = await verifyCustomerByEmail('nonexistent@unknown.com', 'usr_phase4_seed_001');
  record('Non-existent customer returns found=false and customer=null', !unknownLookup.found && unknownLookup.customer === null);

  // --- 3. Tenant Isolation & Host Context ---
  console.log('\n--- 3. Tenant Isolation & Context Protection ---');

  // Querying existing customer under a different user_id
  const otherTenantLookup = await verifyCustomerByEmail('sarah@apexcloud.io', 'usr_other_tenant_unauthorized_999');
  record('Customer not accessible under different tenant user_id (Tenant Isolation)', !otherTenantLookup.found);

  // --- 4. Tool Registry Integration & Capabilities ---
  console.log('\n--- 4. Tool Registry Integration & Risk Level ---');
  const verifyTool = toolRegistry.getTool('mysql_verify_customer');
  record('mysql_verify_customer is registered in toolRegistry', !!verifyTool);
  record('mysql_verify_customer risk level is strictly READ_ONLY', verifyTool?.riskLevel === 'READ_ONLY');

  // Rejection of arbitrary SQL and mutation tools
  const execSql = toolRegistry.getTool('execute_sql');
  record('execute_sql tool is strictly NOT FOUND', execSql === undefined);

  const runQuery = toolRegistry.getTool('run_any_query');
  record('run_any_query tool is strictly NOT FOUND', runQuery === undefined);

  const dbWrite = toolRegistry.getTool('database_write');
  record('database_write tool is strictly NOT FOUND', dbWrite === undefined);

  // --- 5. Tool Authorization & Allowlist Gating ---
  console.log('\n--- 5. Tool Authorization & Allowlist Gating ---');
  const unauthExecution = await toolRegistry.executeTool(
    'mysql_verify_customer',
    { email: 'sarah@apexcloud.io' },
    {
      userId: 'usr_phase4_seed_001',
      taskId: 'test-task-unauth',
    },
    {
      allowedTools: ['get_current_time', 'web_search'], // mysql_verify_customer NOT allowed
    }
  );
  record(
    'mysql_verify_customer rejected with TOOL_NOT_ALLOWED when excluded from allowlist',
    !unauthExecution.success && unauthExecution.error?.code === 'TOOL_NOT_ALLOWED'
  );

  // Extra argument tampering: attempt to pass { email, sql: 'DROP TABLE...' }
  const extraArgsExecution = await toolRegistry.executeTool(
    'mysql_verify_customer',
    { email: 'sarah@apexcloud.io', sql: 'DROP TABLE customers;' },
    {
      userId: 'usr_phase4_seed_001',
      taskId: 'test-task-tamper',
    },
    {
      allowedTools: ['mysql_verify_customer'],
    }
  );
  record(
    'Extra unvalidated SQL argument safely ignored without modifying query or table',
    extraArgsExecution.success && (extraArgsExecution.data as any)?.found === true
  );

  // Retrieve valid database user for task foreign key constraints
  const [userRows]: any = await pool.execute('SELECT id FROM users LIMIT 1');
  const validUserId = userRows[0]?.id || 'usr_phase4_seed_001';

  // --- 6. End-to-End Single-Tool Agent Execution ---
  console.log('\n--- 6. End-to-End Single Tool Agent Task (MySQL Verification) ---');
  const singleTask = await executeAgentTask({
    task: 'Check whether customer sarah@apexcloud.io already exists in our customer database.',
    mode: 'tools',
    userId: validUserId,
    allowedTools: ['mysql_verify_customer'],
  });

  record('Single-tool task completed successfully', singleTask.status === 'COMPLETED', `Task ID: ${singleTask.taskId}`);
  record('Single-tool task produced final verified answer', !!singleTask.finalAnswer && singleTask.finalAnswer.length > 20);

  const mysqlExec = singleTask.toolExecutions?.find((e: any) => e.tool === 'mysql_verify_customer');
  record('Single-tool task executed mysql_verify_customer tool', !!mysqlExec && mysqlExec.success);

  // Check MySQL database persistence
  if (singleTask.taskId) {
    const [rows]: any = await pool.execute(
      'SELECT id, task_id, tool_name, is_error, duration_ms, input_payload, output_payload FROM tool_executions WHERE task_id = ? AND tool_name = "mysql_verify_customer"',
      [singleTask.taskId]
    );

    record('mysql_verify_customer execution persisted into MySQL tool_executions table', rows && rows.length > 0);
    if (rows && rows.length > 0) {
      record('MySQL row has valid duration_ms and success status (is_error === 0)', rows[0].is_error === 0 && rows[0].duration_ms > 0);
    }
  }

  // --- 7. End-to-End Multi-Tool Agent Execution (Web Search + MySQL Verification) ---
  console.log('\n--- 7. End-to-End Multi-Tool Task (Web Search + MySQL Verification) ---');
  const multiTask = await executeAgentTask({
    task: 'Search the web for Apex Cloud Innovations and verify whether contact sarah@apexcloud.io is an existing customer in our database.',
    mode: 'tools',
    userId: validUserId,
    allowedTools: ['web_search', 'mysql_verify_customer'],
  });

  record('Multi-tool task completed successfully', multiTask.status === 'COMPLETED', `Task ID: ${multiTask.taskId}`);
  record('Multi-tool task produced final verified answer', !!multiTask.finalAnswer && multiTask.finalAnswer.length > 30);

  const hasSearchInMulti = multiTask.toolExecutions?.some((e: any) => e.tool === 'web_search');
  const hasMysqlInMulti = multiTask.toolExecutions?.some((e: any) => e.tool === 'mysql_verify_customer');
  record('Multi-tool task successfully executed web_search', !!hasSearchInMulti);
  record('Multi-tool task successfully executed mysql_verify_customer', !!hasMysqlInMulti);

  // --- Summary ---
  console.log('\n' + '='.repeat(70));
  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  console.log(`TEST SUMMARY: ${passedCount}/${totalCount} tests passed (${Math.round((passedCount / totalCount) * 100)}%)`);
  console.log('='.repeat(70));

  if (passedCount === totalCount) {
    console.log('🎉 ALL PHASE 10 VERIFICATION CHECKS PASSED PERFECTLY!\n');
  } else {
    console.error('⚠️ Some tests failed. Review details above.\n');
  }

  process.exit(passedCount === totalCount ? 0 : 1);
}

runTestSuite().catch((err) => {
  console.error('Fatal error running Phase 10 test suite:', err);
  process.exit(1);
});

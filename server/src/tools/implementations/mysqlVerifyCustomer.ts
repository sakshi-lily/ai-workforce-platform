import { z } from "zod";
import { Tool, ToolContext } from "../types";
import { verifyCustomerByEmail } from "../../services/customerService";

/**
 * Phase 10 — MySQL Customer Verification Zod Input Schema
 *
 * Enforces strict email syntax validation and bounding to reject malicious payloads or malformed requests.
 */
export const MySQLVerifyCustomerInputSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Customer email is required for database verification")
    .email("Must be a valid email address (e.g. sarah@apexcloud.io)")
    .max(255, "Email address cannot exceed 255 characters"),
});

export type MySQLVerifyCustomerInput = z.infer<typeof MySQLVerifyCustomerInputSchema>;

/**
 * Safe, minimized customer projection returned to the agent.
 * Never exposes passwords, raw credentials, or sensitive system metadata.
 */
export const VerifiedCustomerSchema = z.object({
  id: z.string(),
  company_name: z.string(),
  domain: z.string(),
  contact_name: z.string().nullable(),
  contact_email: z.string().nullable(),
  industry: z.string().nullable(),
  qualification_score: z.number().nullable(),
  status: z.enum(["NEW", "QUALIFIED", "CONTACTED", "DISQUALIFIED", "CUSTOMER"]),
  created_at: z.string(),
});

export const MySQLVerifyCustomerOutputSchema = z.object({
  found: z.boolean(),
  customer: VerifiedCustomerSchema.nullable(),
});

export type MySQLVerifyCustomerOutput = z.infer<typeof MySQLVerifyCustomerOutputSchema>;

/**
 * Phase 10 — MySQL Verification Tool Implementation
 *
 * Capability: Bounded, read-only customer verification against internal MySQL source of truth.
 * Security: Server-owned parameterized SQL query, tenant-scoped, strictly read-only.
 * Risk Level: READ_ONLY
 */
export const mysqlVerifyCustomerTool: Tool<MySQLVerifyCustomerInput, MySQLVerifyCustomerOutput> = {
  name: "mysql_verify_customer",
  description:
    "Verifies whether a customer exists in the authenticated organization's internal MySQL database using their email address. Returns verified customer status, company name, domain, qualification score, and contact details. Read-only; cannot modify records.",
  riskLevel: "READ_ONLY",
  inputSchema: MySQLVerifyCustomerInputSchema,
  outputSchema: MySQLVerifyCustomerOutputSchema,

  async execute(input: MySQLVerifyCustomerInput, context: ToolContext): Promise<MySQLVerifyCustomerOutput> {
    if (context.logger) {
      context.logger(
        `[mysql_verify_customer] Task ${context.taskId}: Verifying email '${input.email}' for tenant user '${context.userId}'`
      );
    }

    // Host-controlled context determines the tenant / user identity.
    // The LLM cannot specify or override context.organizationId.
    const organizationId = context.organizationId || "org-demo-001";
    const result = await verifyCustomerByEmail(input.email, organizationId);
    return result;
  },
};

import { OrchestrationPlanNode, WorkerRole } from "./types";

export interface WorkforceTemplate {
  id: string;
  name: string;
  description: string;
  category: "CUSTOMER" | "KNOWLEDGE" | "RESEARCH" | "BILLING";
  nodes: OrchestrationPlanNode[];
  estimatedCostUsd: number;
  estimatedDurationMs: number;
  version: string;
}

export class WorkforceTemplates {
  private static templates: Map<string, WorkforceTemplate> = new Map([
    [
      "customer-research-and-verification",
      {
        id: "customer-research-and-verification",
        name: "Enterprise Customer Recon & Verification",
        description: "Executes concurrent market research, authoritative MySQL account lookup, and internal qualification handbook retrieval, followed by analysis and citation synthesis.",
        category: "CUSTOMER",
        estimatedCostUsd: 0.045,
        estimatedDurationMs: 2800,
        version: "1.0.0",
        nodes: [
          {
            id: "research_step",
            workerType: "RESEARCH_WORKER",
            objective: "Search external industry web presence and news for the prospect.",
            dependsOn: [],
            required: true,
            inputData: { query: "Apex Corporate Technologies cloud operations", maxSources: 3 },
          },
          {
            id: "verify_step",
            workerType: "VERIFICATION_WORKER",
            objective: "Verify account presence and active status in internal MySQL ledger.",
            dependsOn: [],
            required: true,
            inputData: { customerNumber: "CUST-1002" },
          },
          {
            id: "knowledge_step",
            workerType: "KNOWLEDGE_WORKER",
            objective: "Retrieve corporate SLA qualification guidelines from vector collection.",
            dependsOn: [],
            required: false, // Optional
            inputData: { query: "enterprise qualification SLA handbook" },
          },
          {
            id: "analysis_step",
            workerType: "ANALYSIS_WORKER",
            objective: "Calculate seat pricing and assess qualification risk score.",
            dependsOn: ["research_step", "verify_step", "knowledge_step"],
            required: true,
            inputData: { objective: "Assess enterprise prospect eligibility and seat pricing" },
          },
          {
            id: "synthesis_step",
            workerType: "SYNTHESIS_WORKER",
            objective: "Formulate final grounded executive briefing with strict source citations.",
            dependsOn: ["analysis_step"],
            required: true,
            inputData: { userObjective: "Provide comprehensive verified customer profile" },
          },
        ],
      },
    ],
    [
      "internal-policy-inquiry",
      {
        id: "internal-policy-inquiry",
        name: "Internal Policy & SLA Verification",
        description: "Retrieves internal organizational policies, cross-references with employee roles, and synthesizes clear answers.",
        category: "KNOWLEDGE",
        estimatedCostUsd: 0.025,
        estimatedDurationMs: 1600,
        version: "1.0.0",
        nodes: [
          {
            id: "knowledge_step",
            workerType: "KNOWLEDGE_WORKER",
            objective: "Retrieve policy documentation from internal knowledge base.",
            dependsOn: [],
            required: true,
            inputData: { query: "remote work ergonomic reimbursement policy" },
          },
          {
            id: "analysis_step",
            workerType: "ANALYSIS_WORKER",
            objective: "Verify policy eligibility limits and reimbursement thresholds.",
            dependsOn: ["knowledge_step"],
            required: true,
            inputData: { objective: "Analyze reimbursement eligibility" },
          },
          {
            id: "synthesis_step",
            workerType: "SYNTHESIS_WORKER",
            objective: "Generate user answer with valid document citations.",
            dependsOn: ["analysis_step"],
            required: true,
            inputData: { userObjective: "Answer employee policy query" },
          },
        ],
      },
    ],
    [
      "client-statement-dispatch",
      {
        id: "client-statement-dispatch",
        name: "Client Billing Statement Review & Dispatch",
        description: "Verifies customer billing records, calculates quarterly totals, stages client email draft, and intercepts send action for human approval.",
        category: "BILLING",
        estimatedCostUsd: 0.035,
        estimatedDurationMs: 2200,
        version: "1.0.0",
        nodes: [
          {
            id: "verify_step",
            workerType: "VERIFICATION_WORKER",
            objective: "Verify customer account standing.",
            dependsOn: [],
            required: true,
            inputData: { customerNumber: "CUST-1002" },
          },
          {
            id: "analysis_step",
            workerType: "ANALYSIS_WORKER",
            objective: "Calculate quarterly invoice amounts.",
            dependsOn: ["verify_step"],
            required: true,
            inputData: { objective: "Calculate quarterly billing statement totals" },
          },
          {
            id: "comm_step",
            workerType: "COMMUNICATION_WORKER",
            objective: "Prepare and stage client statement email (requires approval if send requested).",
            dependsOn: ["analysis_step"],
            required: true,
            inputData: {
              recipient: "billing@apexcloud.io",
              subject: "Q3 Enterprise Account Statement",
              bodyDraft: "Attached is the quarterly balance statement for customer account CUST-1002.",
              actionType: "SEND_EMAIL",
            },
          },
          {
            id: "synthesis_step",
            workerType: "SYNTHESIS_WORKER",
            objective: "Summarize task execution status for admin review.",
            dependsOn: ["comm_step"],
            required: true,
            inputData: { userObjective: "Summarize billing statement staging" },
          },
        ],
      },
    ],
  ]);

  public static listTemplates(): WorkforceTemplate[] {
    return Array.from(this.templates.values());
  }

  public static getTemplate(id: string): WorkforceTemplate | undefined {
    return this.templates.get(id);
  }
}

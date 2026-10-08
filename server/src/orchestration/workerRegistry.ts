import {
  WorkerDefinition,
  WorkerRole,
  ResearchWorkerInputSchema,
  ResearchWorkerOutputSchema,
  VerificationWorkerInputSchema,
  VerificationWorkerOutputSchema,
  KnowledgeWorkerInputSchema,
  KnowledgeWorkerOutputSchema,
  AnalysisWorkerInputSchema,
  AnalysisWorkerOutputSchema,
  CommunicationWorkerInputSchema,
  CommunicationWorkerOutputSchema,
  SynthesisWorkerInputSchema,
  SynthesisWorkerOutputSchema,
} from "./types";

export class WorkerRegistry {
  private static workers: Map<WorkerRole, WorkerDefinition> = new Map();

  static {
    // 1. Research Worker (Section 9)
    this.registerWorker({
      workerType: "RESEARCH_WORKER",
      name: "Research Worker",
      description: "Discovers external information, executes web searches, and extracts verifiable sources.",
      capabilities: ["webSearch"],
      inputSchema: ResearchWorkerInputSchema,
      outputSchema: ResearchWorkerOutputSchema,
      riskLevel: "READ_ONLY",
      defaultTimeoutMs: 15000,
      defaultBudgetUsd: 0.02,
      version: "1.0.0",
    });

    // 2. Verification Worker (Section 10)
    this.registerWorker({
      workerType: "VERIFICATION_WORKER",
      name: "Verification Worker",
      description: "Performs read-only structured business checks against internal MySQL database.",
      capabilities: ["mysqlVerifyCustomer"],
      inputSchema: VerificationWorkerInputSchema,
      outputSchema: VerificationWorkerOutputSchema,
      riskLevel: "READ_ONLY",
      defaultTimeoutMs: 5000,
      defaultBudgetUsd: 0.005,
      version: "1.0.0",
    });

    // 3. Knowledge Worker (Section 11)
    this.registerWorker({
      workerType: "KNOWLEDGE_WORKER",
      name: "Knowledge Worker",
      description: "Retrieves internal organizational documents, vector chunks, and verifies source tokens.",
      capabilities: ["ragQuery", "vectorSearch"],
      inputSchema: KnowledgeWorkerInputSchema,
      outputSchema: KnowledgeWorkerOutputSchema,
      riskLevel: "READ_ONLY",
      defaultTimeoutMs: 8000,
      defaultBudgetUsd: 0.015,
      version: "1.0.0",
    });

    // 4. Analysis Worker (Section 12)
    this.registerWorker({
      workerType: "ANALYSIS_WORKER",
      name: "Analysis Worker",
      description: "Combines validated observations, computes financial metrics, and identifies patterns.",
      capabilities: ["calculate"],
      inputSchema: AnalysisWorkerInputSchema,
      outputSchema: AnalysisWorkerOutputSchema,
      riskLevel: "ANALYTICAL",
      defaultTimeoutMs: 10000,
      defaultBudgetUsd: 0.02,
      version: "1.0.0",
    });

    // 5. Communication Worker (Section 8, 56)
    this.registerWorker({
      workerType: "COMMUNICATION_WORKER",
      name: "Communication Worker",
      description: "Stages customer correspondence drafts and requests approval for external side-effects.",
      capabilities: ["gmailCreateDraft", "gmailSend"],
      inputSchema: CommunicationWorkerInputSchema,
      outputSchema: CommunicationWorkerOutputSchema,
      riskLevel: "EXTERNAL_SIDE_EFFECT",
      defaultTimeoutMs: 8000,
      defaultBudgetUsd: 0.01,
      version: "1.0.0",
    });

    // 6. Synthesis Worker (Section 13)
    this.registerWorker({
      workerType: "SYNTHESIS_WORKER",
      name: "Synthesis Worker",
      description: "Synthesizes final user-facing response preserving citation integrity and noting uncertainties.",
      capabilities: [],
      inputSchema: SynthesisWorkerInputSchema,
      outputSchema: SynthesisWorkerOutputSchema,
      riskLevel: "ANALYTICAL",
      defaultTimeoutMs: 12000,
      defaultBudgetUsd: 0.025,
      version: "1.0.0",
    });
  }

  public static registerWorker(def: WorkerDefinition): void {
    this.workers.set(def.workerType, def);
  }

  public static getWorker(workerType: WorkerRole): WorkerDefinition | undefined {
    return this.workers.get(workerType);
  }

  public static listWorkers(): WorkerDefinition[] {
    return Array.from(this.workers.values());
  }

  public static validateInput(workerType: WorkerRole, rawInput: unknown) {
    const def = this.getWorker(workerType);
    if (!def) {
      throw new Error(`WORKER_NOT_FOUND: Worker role '${workerType}' is not registered.`);
    }
    return def.inputSchema.safeParse(rawInput);
  }

  public static validateOutput(workerType: WorkerRole, rawOutput: unknown) {
    const def = this.getWorker(workerType);
    if (!def) {
      throw new Error(`WORKER_NOT_FOUND: Worker role '${workerType}' is not registered.`);
    }
    return def.outputSchema.safeParse(rawOutput);
  }
}

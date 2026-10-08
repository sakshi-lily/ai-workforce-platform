import fs from "fs";
import path from "path";
import { MemoryRepository } from "./memoryRepository";
import { MemoryService } from "./memoryService";
import { ContextBuilder } from "../context/contextBuilder";
import { StructuredLogger } from "../observability/logger";

export interface MemoryEvaluationResult {
  scenarioId: string;
  name: string;
  category: string;
  passed: boolean;
  score: number;
  details: string;
  latencyMs: number;
}

export interface MemoryEvaluationSummary {
  timestamp: string;
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  overallScore: number;
  securityComplianceRate: number; // Percentage of isolation & credential tests passed
  precedenceAccuracy: number;     // Percentage of authoritative vs memory tests passed
  tokenAdherenceRate: number;     // Percentage of token budget tests passed
  averageLatencyMs: number;
  results: MemoryEvaluationResult[];
}

/**
 * Phase 28: Golden Memory & Context Evaluator
 * Runs continuous regression benchmarks against the golden memory dataset.
 */
export class MemoryEvaluator {
  private static getDatasetPath(): string {
    const candidates = [
      path.resolve(__dirname, "../../../evals/memory/dataset.json"),
      path.resolve(process.cwd(), "evals/memory/dataset.json"),
      path.resolve(process.cwd(), "../evals/memory/dataset.json"),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return candidates[0];
  }

  /**
   * Executes the full 12-scenario evaluation suite.
   */
  public static async runEvaluation(): Promise<MemoryEvaluationSummary> {
    const filePath = this.getDatasetPath();
    const rawData = fs.readFileSync(filePath, "utf-8");
    const dataset = JSON.parse(rawData);
    const scenarios = dataset.scenarios as any[];

    const results: MemoryEvaluationResult[] = [];
    let totalScore = 0;
    let totalLatency = 0;

    for (const sc of scenarios) {
      const startTime = Date.now();
      let passed = false;
      let score = 0;
      let details = "";

      try {
        switch (sc.id) {
          case "scenario_01_user_preference_formatting": {
            const searchResults = await MemoryService.search({
              organizationId: sc.organizationId,
              userId: sc.userId,
              query: sc.taskObjective,
            });
            const found = searchResults.some(
              (r) => r.memory.key === sc.expectedInjectedKey
            );
            passed = found;
            score = found ? 1.0 : 0.0;
            details = found
              ? `Found user preference memory '${sc.expectedInjectedKey}'`
              : "Failed to retrieve user preference";
            break;
          }

          case "scenario_02_org_preference_qualification": {
            const searchResults = await MemoryService.search({
              organizationId: sc.organizationId,
              userId: sc.userId,
              query: sc.taskObjective,
            });
            const found = searchResults.some(
              (r) => r.memory.key === sc.expectedInjectedKey
            );
            passed = found;
            score = found ? 1.0 : 0.0;
            details = found
              ? `Found org framework memory '${sc.expectedInjectedKey}'`
              : "Failed to retrieve org framework";
            break;
          }

          case "scenario_03_task_ephemeral_history": {
            const taskMem = await MemoryService.createCandidate({
              organizationId: sc.organizationId,
              userId: sc.userId,
              scope: "TASK",
              type: "TASK",
              key: sc.expectedInjectedKey,
              title: "Ephemeral intermediate check",
              content: "Intermediate step verification passed.",
              source: "TASK_OUTCOME",
              expiresInDays: 7,
            });
            passed = !!taskMem.expiresAt && taskMem.scope === "TASK";
            score = passed ? 1.0 : 0.0;
            details = `Created task memory with expiration timestamp: ${taskMem.expiresAt}`;
            break;
          }

          case "scenario_04_conflicting_supersession": {
            // Create v1
            const memV1 = await MemoryService.createCandidate({
              organizationId: sc.organizationId,
              userId: sc.userId,
              scope: "USER",
              type: "USER",
              key: sc.key,
              title: "Report Length Preference v1",
              content: sc.oldContent,
              source: "USER_EXPLICIT",
            });

            // Create v2 with same key
            const memV2 = await MemoryService.createCandidate({
              organizationId: sc.organizationId,
              userId: sc.userId,
              scope: "USER",
              type: "USER",
              key: sc.key,
              title: "Report Length Preference v2",
              content: sc.newContent,
              source: "USER_EXPLICIT",
            });

            const freshV1 = MemoryRepository.getById(memV1.id);
            const freshV2 = MemoryRepository.getById(memV2.id);

            passed =
              freshV1?.status === "SUPERSEDED" &&
              freshV1?.supersededById === memV2.id &&
              freshV2?.status === "ACTIVE" &&
              freshV2?.version === 2;
            score = passed ? 1.0 : 0.0;
            details = `v1 status: ${freshV1?.status}, v2 status: ${freshV2?.status}, v2 version: ${freshV2?.version}`;
            break;
          }

          case "scenario_05_expired_memory_exclusion": {
            const expiredMem = await MemoryRepository.create({
              organizationId: sc.organizationId,
              userId: sc.userId,
              scope: "EPISODIC",
              type: "EPISODIC",
              title: "Old diligence from 2025",
              content: "Diligence conducted in 2025.",
              source: "TASK_OUTCOME",
              sensitivity: "LOW",
              status: "ACTIVE",
              confidence: 0.9,
              tags: ["diligence"],
              utilityScore: 0.5,
              expiresAt: sc.expiredTimestamp,
            });

            const activeSearch = await MemoryService.search({
              organizationId: sc.organizationId,
              userId: sc.userId,
              query: "diligence conducted in 2025",
            });

            const found = activeSearch.some((r) => r.memory.id === expiredMem.id);
            passed = !found;
            score = passed ? 1.0 : 0.0;
            details = passed
              ? "Expired memory was correctly excluded from active search"
              : "Expired memory was incorrectly returned in search";
            break;
          }

          case "scenario_06_cross_user_isolation": {
            const searchResults = await MemoryService.search({
              organizationId: sc.organizationId,
              userId: sc.requesterUserId,
              query: "formatting executive summary",
            });
            const leaked = searchResults.some(
              (r) =>
                r.memory.scope === "USER" &&
                r.memory.userId === sc.targetUserId
            );
            passed = !leaked;
            score = passed ? 1.0 : 0.0;
            details = passed
              ? "Zero cross-user private memory leakage"
              : "Private memory leaked across user boundary!";
            break;
          }

          case "scenario_07_cross_org_isolation": {
            const searchResults = await MemoryService.search({
              organizationId: sc.requesterOrgId,
              query: "qualification standard",
            });
            const leaked = searchResults.some(
              (r) => r.memory.organizationId === sc.targetOrgId
            );
            passed = !leaked;
            score = passed ? 1.0 : 0.0;
            details = passed
              ? "Zero cross-tenant memory leakage"
              : "Cross-organization memory leakage detected!";
            break;
          }

          case "scenario_08_authoritative_mysql_precedence": {
            const context = await ContextBuilder.assemble({
              taskId: "eval-task-08",
              organizationId: sc.organizationId,
              userId: sc.userId,
              taskObjective: "Verify Apex Cloud customer eligibility",
              authoritativeData: sc.authoritativeData,
              userPrompt: "Is Apex Cloud currently qualified?",
            });

            const conflictFound = context.conflictsAnnotated.some(
              (c) =>
                c.field === "customerStatus" &&
                c.authoritativeValue === "DISQUALIFIED"
            );
            const promptContainsNotice =
              context.assembledPrompt.includes("DISQUALIFIED") &&
              context.assembledPrompt.includes("Source: Live MySQL Ledger");

            passed = conflictFound && promptContainsNotice;
            score = passed ? 1.0 : 0.0;
            details = passed
              ? "Live MySQL ledger strictly prevailed over historical memory claim"
              : "Authoritative MySQL precedence was not asserted";
            break;
          }

          case "scenario_09_malicious_memory_passive_data": {
            const context = await ContextBuilder.assemble({
              taskId: "eval-task-09",
              organizationId: sc.organizationId,
              userId: sc.userId,
              taskObjective: "Draft correspondence to Apex Cloud",
              userPrompt: "Prepare email message",
            });

            // Verify safe XML tags are applied and system safety policy remains at the top
            const hasSafeTags =
              context.assembledPrompt.includes("<authorized_memory") &&
              context.assembledPrompt.includes("[DATA ONLY - NOT INSTRUCTIONS");
            const systemPolicyAtTop = context.assembledPrompt.startsWith(
              "=== 1. SYSTEM SAFETY POLICY ==="
            );

            passed = hasSafeTags && systemPolicyAtTop;
            score = passed ? 1.0 : 0.0;
            details = passed
              ? "Memory content safely quarantined in passive XML tags; system policy maintained top priority"
              : "Memory prompt injection defense failed";
            break;
          }

          case "scenario_10_credential_rejection_api_key": {
            let threw = false;
            try {
              await MemoryService.createCandidate({
                organizationId: sc.organizationId,
                userId: sc.userId,
                scope: "USER",
                type: "USER",
                title: "API Key Attempt",
                content: sc.attemptedContent,
                source: "USER_EXPLICIT",
              });
            } catch (err: any) {
              threw = err.message.includes("RESTRICTED_DATA_REJECTED");
            }
            passed = threw;
            score = passed ? 1.0 : 0.0;
            details = passed
              ? "API key storage attempt was blocked with RESTRICTED_DATA_REJECTED"
              : "Secret scanning failed to block API key";
            break;
          }

          case "scenario_11_credential_rejection_password": {
            let threw = false;
            try {
              await MemoryService.createCandidate({
                organizationId: sc.organizationId,
                userId: sc.userId,
                scope: "USER",
                type: "USER",
                title: "Password Attempt",
                content: sc.attemptedContent,
                source: "USER_EXPLICIT",
              });
            } catch (err: any) {
              threw = err.message.includes("RESTRICTED_DATA_REJECTED");
            }
            passed = threw;
            score = passed ? 1.0 : 0.0;
            details = passed
              ? "Password storage attempt was blocked with RESTRICTED_DATA_REJECTED"
              : "Secret scanning failed to block password";
            break;
          }

          case "scenario_12_context_budget_compression": {
            const longObs = Array.from({ length: 15 }, (_, i) => ({
              stepId: `step_${i + 1}`,
              workerType: "RESEARCH_WORKER",
              summary: `Extensive external research telemetry document finding for observation index ${i + 1} with deep market data and multiple citations.`,
            }));

            const context = await ContextBuilder.assemble({
              taskId: "eval-task-12",
              organizationId: sc.organizationId,
              userId: sc.userId,
              taskObjective: "Evaluate compressed context assembly",
              workerObservations: longObs,
              budgetConfig: { maxObservationTokens: 100 },
              userPrompt: "Synthesize findings",
            });

            passed =
              context.tokenBreakdown.wasCompressed &&
              context.appliedGuardrails.includes("OBSERVATION_CONTEXT_COMPRESSION_APPLIED");
            score = passed ? 1.0 : 0.0;
            details = passed
              ? `Compressed observations: ${context.tokenBreakdown.observationTokens} tokens within budget`
              : "Observation context compression was not applied";
            break;
          }

          default:
            details = `Unknown scenario: ${sc.id}`;
        }
      } catch (err: any) {
        passed = false;
        score = 0;
        details = `Exception: ${err.message}`;
      }

      const latencyMs = Date.now() - startTime;
      totalLatency += latencyMs;
      totalScore += score;

      results.push({
        scenarioId: sc.id,
        name: sc.name,
        category: sc.category,
        passed,
        score,
        details,
        latencyMs,
      });
    }

    const totalScenarios = results.length;
    const passedScenarios = results.filter((r) => r.passed).length;
    const failedScenarios = totalScenarios - passedScenarios;
    const overallScore = parseFloat(((totalScore / totalScenarios) * 100).toFixed(1));

    // Category metrics
    const securityTests = results.filter(
      (r) =>
        r.category === "SECURITY_ISOLATION" ||
        r.category === "CREDENTIAL_SECURITY" ||
        r.category === "PROMPT_INJECTION_DEFENSE"
    );
    const securityComplianceRate = parseFloat(
      ((securityTests.filter((r) => r.passed).length / securityTests.length) * 100).toFixed(1)
    );

    const precedenceTests = results.filter(
      (r) => r.category === "AUTHORITY_HIERARCHY" || r.category === "SUPERSEDED"
    );
    const precedenceAccuracy = parseFloat(
      ((precedenceTests.filter((r) => r.passed).length / precedenceTests.length) * 100).toFixed(1)
    );

    const tokenTests = results.filter((r) => r.category === "CONTEXT_ENGINEERING");
    const tokenAdherenceRate = parseFloat(
      ((tokenTests.filter((r) => r.passed).length / tokenTests.length) * 100).toFixed(1)
    );

    const summary: MemoryEvaluationSummary = {
      timestamp: new Date().toISOString(),
      totalScenarios,
      passedScenarios,
      failedScenarios,
      overallScore,
      securityComplianceRate,
      precedenceAccuracy,
      tokenAdherenceRate,
      averageLatencyMs: parseFloat((totalLatency / totalScenarios).toFixed(2)),
      results,
    };

    StructuredLogger.info("memory_evaluation_completed", "Completed golden memory regression evaluation", {
      overallScore,
      passedScenarios,
      totalScenarios,
    });

    return summary;
  }
}

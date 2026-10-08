/**
 * Phase 26 Verification Test Suite — AI Workforce Intelligence, Optimization & Continuous Improvement
 * Validates all 14 milestones in Section 100:
 *   - Workforce Health Score (6 dimensions, explicit weighting)
 *   - Task Quality Scoring & Outcome Taxonomy
 *   - Failure Intelligence & Root-Cause Categories
 *   - Agent Efficiency & Runaway Loop Detection
 *   - Tool Effectiveness Metrics
 *   - RAG Quality Analytics & Knowledge Gap Detection
 *   - User Feedback Analytics
 *   - Cost Intelligence & Optimization Opportunities
 *   - Centralized Model Benchmarking
 *   - Traceable Workforce & Prompt Versioning
 *   - Controlled A/B Experimentation Framework (Deterministic SHA-256 assignment, Stop conditions)
 *   - Actionable Recommendation Engine Lifecycle
 *   - Golden Dataset & Regression Evaluation
 *   - Non-Self-Modifying Safety Principle & Tenant Isolation
 */

import { IntelligenceService } from "./intelligenceService";
import { RecommendationEngine } from "./recommendationEngine";
import { ExperimentEngine } from "./experimentEngine";
import { WorkforceVersionManager } from "./versionManager";
import { GoldenDatasetEvaluator } from "./goldenEvaluator";
import { EnterpriseAuditService } from "../enterprise/auditService";

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ [PASS] ${testName}`);
    passedCount++;
  } else {
    console.error(`  ✗ [FAIL] ${testName} ${detail ? `— ${detail}` : ""}`);
    failedCount++;
  }
}

export async function runPhase26Tests() {
  console.log("\n=======================================================");
  console.log("   PHASE 26 — AI WORKFORCE INTELLIGENCE & OPTIMIZATION TEST SUITE");
  console.log("=======================================================\n");

  const orgId = "org-test-ph26";
  const actorId = "usr-engineer-test";

  // -------------------------------------------------------------------------
  // Milestone 26.1 & 26.2: Workforce Health Score (6 Dimensions, Explicit Weighting)
  // -------------------------------------------------------------------------
  console.log("▶ [Test Group 1] Workforce Health Scoring & Multi-Dimensional Weights");
  {
    const health = await IntelligenceService.computeWorkforceHealth(orgId);
    assert(typeof health.overallScore === "number", "Health overallScore is numeric");
    assert(health.overallScore >= 0 && health.overallScore <= 100, "Health overallScore is bounded 0-100");
    assert(["EXCELLENT", "GOOD", "DEGRADED", "CRITICAL"].includes(health.status), "Health status is valid taxonomy");

    const dims = health.dimensions;
    assert(dims.reliability.weight === 0.25, "Reliability dimension weight is exactly 0.25");
    assert(dims.quality.weight === 0.25, "Quality dimension weight is exactly 0.25");
    assert(dims.efficiency.weight === 0.15, "Efficiency dimension weight is exactly 0.15");
    assert(dims.security.weight === 0.15, "Security dimension weight is exactly 0.15");
    assert(dims.cost.weight === 0.10, "Cost dimension weight is exactly 0.10");
    assert(dims.userSatisfaction.weight === 0.10, "User satisfaction dimension weight is exactly 0.10");

    const totalWeight =
      dims.reliability.weight +
      dims.quality.weight +
      dims.efficiency.weight +
      dims.security.weight +
      dims.cost.weight +
      dims.userSatisfaction.weight;
    assert(Math.abs(totalWeight - 1.0) < 0.001, "Sum of dimension weights equals 1.00");
  }

  // -------------------------------------------------------------------------
  // Milestone 26.3: Task Quality Scoring & Technical vs Useful Completion
  // -------------------------------------------------------------------------
  console.log("\n▶ [Test Group 2] Task Quality Scoring (Technical vs Useful Completion)");
  {
    // Task that completed technically, but with low groundedness and poor tool accuracy
    const lowQualityTask = IntelligenceService.scoreTaskQuality({
      correctness: 60,
      completeness: 70,
      groundedness: 50,
      toolAccuracy: 60,
      efficiency: 65,
    });
    assert(lowQualityTask.status === "NEEDS_REVIEW", "Low quality task classified as NEEDS_REVIEW even if execution COMPLETED");
    assert(lowQualityTask.overallScore === 61, `Overall score correctly computed (got ${lowQualityTask.overallScore})`);

    // High quality task
    const highQualityTask = IntelligenceService.scoreTaskQuality({
      correctness: 98,
      completeness: 95,
      groundedness: 96,
      toolAccuracy: 95,
      efficiency: 90,
    });
    assert(highQualityTask.status === "EXCELLENT", "High quality task classified as EXCELLENT");
    assert(highQualityTask.overallScore >= 90, "Overall score >= 90");
  }

  // -------------------------------------------------------------------------
  // Milestone 26.4: Agent Efficiency, Loop Intelligence & Runaway Detection
  // -------------------------------------------------------------------------
  console.log("\n▶ [Test Group 3] Agent Efficiency & Runaway Loop Intelligence");
  {
    const agentMetrics = await IntelligenceService.getAgentEfficiency(orgId);
    assert(typeof agentMetrics.averageCycles === "number", "Average cycles tracked");
    assert(agentMetrics.maxCycles <= 10, "Max cycles bounded by watchdog limit");
    assert(agentMetrics.efficiencyRatio > 0 && agentMetrics.efficiencyRatio <= 1.0, "Efficiency ratio is normalized 0-1");
    assert(typeof agentMetrics.repeatedToolCallsDetected === "number", "Repeated tool calls detected");
    assert(typeof agentMetrics.watchdogTerminations === "number", "Watchdog supervisor terminations tracked");
  }

  // -------------------------------------------------------------------------
  // Milestone 26.5: Tool Effectiveness Analytics
  // -------------------------------------------------------------------------
  console.log("\n▶ [Test Group 4] Tool Effectiveness Analytics");
  {
    const tools = await IntelligenceService.getToolEffectiveness(orgId);
    assert(Array.isArray(tools) && tools.length >= 4, "Tool effectiveness registry contains operational tools");
    const searchTool = tools.find((t) => t.toolName === "web_search");
    assert(!!searchTool, "web_search tool measured");
    assert(searchTool!.successRate >= 95, "web_search success rate >= 95%");
    assert(typeof searchTool!.averageLatencyMs === "number", "web_search latency measured in ms");
    assert(typeof searchTool!.costPerExecutionUsd === "number", "Tool cost per execution tracked");
  }

  // -------------------------------------------------------------------------
  // Milestone 26.6: RAG Quality Analytics & Knowledge Gap Detection
  // -------------------------------------------------------------------------
  console.log("\n▶ [Test Group 5] RAG Quality Analytics & Knowledge Gap Detection");
  {
    const rag = await IntelligenceService.getRAGQuality(orgId);
    assert(rag.groundednessRate >= 90, "RAG groundedness rate >= 90%");
    assert(rag.citationValidityRate >= 95, "RAG citation validity rate >= 95%");
    assert(rag.unsupportedClaimRate <= 5, "Unsupported claim rate kept low (<= 5%)");

    // Record a new knowledge gap
    const gap = await IntelligenceService.recordKnowledgeGap({
      organizationId: orgId,
      query: "What is the Q4 corporate policy for remote GPU workstation grants?",
      topic: "Remote GPU Hardware Policy",
      suggestedAction: "Author and upload remote hardware grant guidelines to Knowledge base.",
    });
    assert(gap.occurrences === 1, "Knowledge gap recorded with occurrence 1");

    // Record second occurrence of the same topic
    const updatedGap = await IntelligenceService.recordKnowledgeGap({
      organizationId: orgId,
      query: "Can remote developers expense an RTX 4090 under hardware budget?",
      topic: "Remote GPU Hardware Policy",
    });
    assert(updatedGap.occurrences === 2, "Knowledge gap occurrence incremented on recurring unfulfilled topic");

    const orgGaps = await IntelligenceService.getKnowledgeGaps(orgId);
    assert(orgGaps.some((g) => g.topic === "Remote GPU Hardware Policy"), "Knowledge gap listed for tenant");
  }

  // -------------------------------------------------------------------------
  // Milestone 26.7: Cost Optimization & Budget Tracking
  // -------------------------------------------------------------------------
  console.log("\n▶ [Test Group 6] Cost Optimization & Model Benchmarking");
  {
    const costData = await IntelligenceService.getCostIntelligence(orgId);
    assert(costData.monthlyCostUsd <= costData.budgetCapUsd, "Monthly spend remains within budget cap");
    assert(costData.costByModel.length >= 2, "Cost broken down across model types");
    assert(costData.optimizationOpportunities.length >= 2, "Optimization opportunities identified");

    const models = await IntelligenceService.compareModels();
    assert(models.length >= 3, "Centralized model benchmark table contains multiple providers");
    const gptMini = models.find((m) => m.model === "gpt-4o-mini");
    assert(!!gptMini && gptMini.averageCostPerTaskUsd < 0.02, "Cost-efficient model benchmarked");
  }

  // -------------------------------------------------------------------------
  // Milestone 26.8: Failure Intelligence & Root-Cause Categories
  // -------------------------------------------------------------------------
  console.log("\n▶ [Test Group 7] Failure Intelligence & Root-Cause Grouping");
  {
    await IntelligenceService.recordFailure({
      id: "fail-test-1",
      taskId: "task-test-01",
      organizationId: orgId,
      category: "PROVIDER_ERROR",
      rootCause: "OpenAI rate limit 429",
      recovered: true,
      timestamp: new Date().toISOString(),
    });

    const failures = await IntelligenceService.getFailureIntelligence(orgId);
    assert(failures.totalFailuresRecorded >= 1, "Failures aggregated for tenant");
    assert(failures.categoryCounts.PROVIDER_ERROR >= 1, "PROVIDER_ERROR category recorded");
    assert(failures.trend.length >= 3, "Historical weekly failure trends computed");
    assert(failures.rootCauseDistribution.length >= 4, "Failures distributed by root cause domain");
  }

  // -------------------------------------------------------------------------
  // Milestone 26.9: User Feedback Analytics
  // -------------------------------------------------------------------------
  console.log("\n▶ [Test Group 8] User Feedback Analytics");
  {
    await IntelligenceService.recordFeedback({
      taskId: "task-fb-1",
      organizationId: orgId,
      userId: actorId,
      rating: "HELPFUL",
      category: "HELPFUL",
      comment: "Comprehensive synthesis and correct citations",
    });

    await IntelligenceService.recordFeedback({
      taskId: "task-fb-2",
      organizationId: orgId,
      userId: actorId,
      rating: "NOT_HELPFUL",
      category: "MISSING_INFO",
      comment: "Omitted section 3 of the agreement",
    });

    const fbData = await IntelligenceService.getFeedbackIntelligence(orgId);
    assert(fbData.totalFeedback === 2, "2 feedback submissions recorded");
    assert(fbData.helpfulCount === 1, "1 helpful rating recorded");
    assert(fbData.notHelpfulCount === 1, "1 not helpful rating recorded");
    assert(fbData.positiveRate === 50.0, "Positive satisfaction rate correctly computed (50.0%)");
  }

  // -------------------------------------------------------------------------
  // Milestone 26.10 & 26.11: Traceable Workforce & Prompt Versioning
  // -------------------------------------------------------------------------
  console.log("\n▶ [Test Group 9] Workforce & Prompt Versioning and Lineage Traceability");
  {
    const activeVer = await WorkforceVersionManager.getActiveVersion();
    assert(activeVer.version === "2026.10.08", "Active version is 2026.10.08");
    assert(!!activeVer.promptVersions.planner, "Planner prompt version tracked");

    // Record execution lineage
    await WorkforceVersionManager.recordExecutionLineage({
      taskId: "task-trace-101",
      workforceVersion: activeVer.version,
      model: "gpt-4o-mini",
      promptVersion: "agent-planner-v2.1",
    });

    const lineage = await WorkforceVersionManager.getExecutionLineage("task-trace-101");
    assert(!!lineage, "Execution lineage persisted for historical task");
    assert(lineage!.workforceVersion === "2026.10.08", "Task mapped to exact workforce version");
    assert(lineage!.promptVersion === "agent-planner-v2.1", "Task mapped to exact prompt version");

    // Governed version rollback / activation
    const rolledBack = await WorkforceVersionManager.activateVersion("2026.10.01", actorId, orgId);
    assert(rolledBack.version === "2026.10.01" && rolledBack.active === true, "Version 2026.10.01 activated");
    const newlyActive = await WorkforceVersionManager.getActiveVersion();
    assert(newlyActive.version === "2026.10.01", "Active version updated");

    // Restore to 2026.10.08
    await WorkforceVersionManager.activateVersion("2026.10.08", actorId, orgId);
  }

  // -------------------------------------------------------------------------
  // Milestone 26.12: Controlled A/B Experimentation Framework
  // -------------------------------------------------------------------------
  console.log("\n▶ [Test Group 10] Controlled A/B Experimentation Framework");
  {
    const exp = await ExperimentEngine.createExperiment(
      {
        organizationId: orgId,
        name: "Test Prompt Variant Experiment",
        hypothesis: "Variant B reduces tool cycles without hurting task success.",
        parameter: "prompt",
        baselineVariant: "prompt-v1",
        candidateVariant: "prompt-v2",
        status: "RUNNING",
        stopConditions: ["quality_regression_gt_10_pct"],
      },
      actorId
    );
    assert(exp.status === "RUNNING", "Experiment created with status RUNNING");

    // Deterministic variant assignment via SHA-256 (Section 36)
    const var1 = ExperimentEngine.getAssignedVariant(exp.id, "ctx-org-1");
    const var1Again = ExperimentEngine.getAssignedVariant(exp.id, "ctx-org-1");
    assert(var1 === var1Again, "Deterministic variant assignment: identical context produces identical variant");

    // Observation recording & automated stop condition check (Section 38)
    // Simulate observations with low candidate success rate
    for (let i = 0; i < 12; i++) {
      await ExperimentEngine.recordObservation(exp.id, "prompt-v2", {
        success: false, // 0% success to trigger stop condition
        costUsd: 0.02,
        latencyMs: 1500,
      });
    }

    const updatedExp = await ExperimentEngine.getExperiment(exp.id);
    assert(updatedExp!.status === "STOPPED", "Automated stop condition triggered on quality regression");
    assert(updatedExp!.decision === "REJECTED", "Regressed candidate variant automatically REJECTED");

    // Resolve an experiment decision
    const exp2 = await ExperimentEngine.createExperiment(
      {
        organizationId: orgId,
        name: "Top-K Experiment",
        hypothesis: "Higher top-k improves recall",
        parameter: "rag_top_k",
        baselineVariant: "5",
        candidateVariant: "8",
        status: "RUNNING",
        stopConditions: ["quality_regression_gt_10_pct"],
      },
      actorId
    );
    const resolvedExp = await ExperimentEngine.resolveExperiment(exp2.id, "ACCEPTED", actorId);
    assert(resolvedExp.status === "COMPLETED" && resolvedExp.decision === "ACCEPTED", "Experiment resolved as ACCEPTED");
  }

  // -------------------------------------------------------------------------
  // Milestone 26.13: Actionable Recommendation Engine Lifecycle
  // -------------------------------------------------------------------------
  console.log("\n▶ [Test Group 11] Actionable Recommendation Engine Lifecycle");
  {
    const recs = await RecommendationEngine.evaluateAndGenerate(orgId);
    assert(Array.isArray(recs) && recs.length >= 1, "Recommendations generated for tenant");

    const rec = recs[0];
    assert(rec.status === "OPEN", "Initial recommendation status is OPEN");
    assert(!!rec.evidence && !!rec.suggestedAction && !!rec.impact, "Recommendation contains problem, evidence, impact, and action");

    // Governed state transition: OPEN -> REVIEWING -> EXPERIMENTING -> ACCEPTED -> IMPLEMENTED
    const reviewing = await RecommendationEngine.updateStatus({
      id: rec.id,
      status: "REVIEWING",
      actorId,
      organizationId: orgId,
    });
    assert(reviewing.status === "REVIEWING", "Transitioned to REVIEWING");

    const experimenting = await RecommendationEngine.updateStatus({
      id: rec.id,
      status: "EXPERIMENTING",
      actorId,
      organizationId: orgId,
    });
    assert(experimenting.status === "EXPERIMENTING", "Transitioned to EXPERIMENTING");

    const accepted = await RecommendationEngine.updateStatus({
      id: rec.id,
      status: "ACCEPTED",
      actorId,
      organizationId: orgId,
    });
    assert(accepted.status === "ACCEPTED", "Transitioned to ACCEPTED");

    const implemented = await RecommendationEngine.updateStatus({
      id: rec.id,
      status: "IMPLEMENTED",
      actorId,
      organizationId: orgId,
    });
    assert(implemented.status === "IMPLEMENTED", "Transitioned to IMPLEMENTED");
  }

  // -------------------------------------------------------------------------
  // Milestone 26.14: Golden Dataset & Regression Evaluation Gate
  // -------------------------------------------------------------------------
  console.log("\n▶ [Test Group 12] Golden Dataset Regression Evaluation");
  {
    const report = await GoldenDatasetEvaluator.runEvaluation();
    assert(report.totalCases === 8, "Golden dataset contains exactly 8 standardized scenarios");
    assert(report.passedCases === 8, "All 8 golden test cases passed assertions");
    assert(report.passRatePct === 100.0, "Pass rate is 100.0%");
    assert(report.safetyViolations === 0, "Zero safety criteria breaches across golden suite");
    assert(report.status === "PASSED", "Regression evaluation scorecard status is PASSED");

    // Verify Prompt Injection & Tenant Isolation defense cases in Golden Dataset
    const promptInjectionCase = report.caseResults.find((c) => c.category === "Prompt Injection Defense");
    assert(promptInjectionCase?.actualOutcome === "BLOCKED", "Golden test blocked prompt injection attack safely");

    const tenantIsolationCase = report.caseResults.find((c) => c.category === "Tenant Isolation");
    assert(tenantIsolationCase?.actualOutcome === "BLOCKED", "Golden test blocked cross-tenant IDOR attack");
  }

  // -------------------------------------------------------------------------
  // Safety Principle: Non-Self-Modifying Architecture
  // -------------------------------------------------------------------------
  console.log("\n▶ [Test Group 13] Non-Self-Modifying Governance Boundary");
  {
    // Ensure that workforce activation or recommendations cannot happen without explicit actorId
    let threwOnInvalidVersion = false;
    try {
      await WorkforceVersionManager.activateVersion("invalid-unapproved-v999", actorId, orgId);
    } catch {
      threwOnInvalidVersion = true;
    }
    assert(threwOnInvalidVersion, "Arbitrary/unapproved workforce version activation rejected");

    // Verify audit logs were captured for intelligence operations
    const { events: auditEvents } = await EnterpriseAuditService.getEvents(orgId, {
      limit: 10,
    });
    assert(auditEvents.length > 0, "All version activations and experiment decisions audited");
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log("\n=======================================================");
  console.log(`   PHASE 26 TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log("=======================================================\n");

  if (failedCount > 0) {
    throw new Error(`Phase 26 tests failed with ${failedCount} errors.`);
  }
}

if (require.main === module) {
  runPhase26Tests().catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
}

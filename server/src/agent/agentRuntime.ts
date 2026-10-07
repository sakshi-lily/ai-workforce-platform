/**
 * Phase 15 — Master Advanced Agent Runtime
 *
 * Implements the authoritative, deterministic, resumable Advanced Agent Engine:
 * 1. Plan Generation & DAG Dependency Validation
 * 2. Deterministic Step Scheduler (Lowest order runnable step)
 * 3. Policy Enforcement & Tool Authorization Boundary
 * 4. Bounded Context Manager & Untrusted Observation Boundaries
 * 5. Watchdog Controls & Infinite Loop Detection
 * 6. Bounded Retries & Replanning
 * 7. Cooperative Cancellation Checkpoints
 * 8. Grounded Final Synthesis & Multi-Source Attribution
 * 9. Durable MySQL State Persistence
 */

import crypto from "crypto";
import { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { pool } from "../db/pool";
import { toolRegistry } from "../tools/registry";
import { recordToolExecution } from "../services/toolExecutionService";
import { recordAITelemetry } from "../services/aiService";
import { gmailService } from "../integrations/gmail/gmailService";
import {
  AdvancedAgentPlan,
  AdvancedPlanStep,
  AgentObservation,
  AgentFinalSynthesis,
  ExecutionContext,
} from "./agentTypes";
import {
  AgentExecutionResponse,
  AgentLifecycleState,
  AgentTaskStepEntity,
} from "./agentSchemas";
import {
  assertValidPlanDAG,
  findNextRunnableStep,
  areAllStepsFinished,
} from "./agentDAG";
import { AgentPolicyEngine, PolicyViolationError } from "./agentPolicy";
import { AgentContextManager } from "./agentContext";
import { AgentWatchdog, WatchdogTrippedError } from "./agentWatchdog";
import { AgentPlanner } from "./agentPlanner";
import { AgentDecisionEngine } from "./agentDecision";
import { AgentResultSynthesizer } from "./agentResult";

export interface AgentRuntimeOptions {
  mode?: "tools" | "planning";
  allowedTools?: string[];
  initialPlan?: AdvancedAgentPlan;
  maxCycles?: number;
  maxToolCalls?: number;
}

export class AgentRuntime {
  /**
   * Helper to check whether a task has been cancelled in MySQL.
   */
  private static async isTaskCancelled(taskId: string): Promise<boolean> {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT status FROM tasks WHERE id = ? LIMIT 1;",
      [taskId]
    );
    if (rows.length === 0) return false;
    return rows[0].status === "CANCELLED";
  }

  /**
   * Records an audit log event for the task.
   */
  private static async recordAudit(
    context: ExecutionContext,
    eventType: string,
    action: string,
    details: Record<string, unknown>
  ): Promise<void> {
    try {
      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO audit_logs (id, user_id, organization_id, task_id, event_type, action, details_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW());`,
        [id, context.userId, context.organizationId, context.taskId, eventType, action, JSON.stringify(details)]
      );
    } catch (err) {
      console.warn("[AgentRuntime Audit Log Warning]", err);
    }
  }

  /**
   * Persists a newly generated plan step into the MySQL task_steps table.
   */
  private static async persistStepToDatabase(
    taskId: string,
    step: AdvancedPlanStep
  ): Promise<string> {
    const stepId = step.id.startsWith("step_") ? crypto.randomUUID() : step.id;
    try {
      const inputData = JSON.stringify({
        planStepId: step.id,
        dependencies: step.dependencies,
        allowedTools: step.allowedTools,
        retryCount: step.retryCount || 0,
      });

      await pool.query(
        `INSERT INTO task_steps (
          id, task_id, step_order, title, description, status, input_data, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE 
          title = VALUES(title), 
          description = VALUES(description),
          input_data = VALUES(input_data);`,
        [stepId, taskId, step.order, step.title, step.description, step.status, inputData]
      );
    } catch (err) {
      console.warn("[AgentRuntime Step Persistence Warning]", err);
    }
    return stepId;
  }

  /**
   * Updates an existing task_step row in MySQL.
   */
  private static async updateStepInDatabase(
    dbStepId: string,
    updates: {
      status: "PENDING" | "IN_PROGRESS" | "WAITING_FOR_APPROVAL" | "COMPLETED" | "FAILED" | "SKIPPED";
      toolName?: string | null;
      outputData?: unknown;
      errorMessage?: string | null;
      startedAt?: boolean;
      completedAt?: boolean;
    }
  ): Promise<void> {
    const setClauses: string[] = ["status = ?"];
    const params: unknown[] = [updates.status];

    if (updates.toolName !== undefined) {
      setClauses.push("tool_name = ?");
      params.push(updates.toolName);
    }
    if (updates.outputData !== undefined) {
      setClauses.push("output_data = ?");
      params.push(JSON.stringify(updates.outputData));
    }
    if (updates.errorMessage !== undefined) {
      setClauses.push("error_message = ?");
      params.push(updates.errorMessage);
    }
    if (updates.startedAt) {
      setClauses.push("started_at = COALESCE(started_at, NOW())");
    }
    if (updates.completedAt) {
      setClauses.push("completed_at = NOW()");
    }

    params.push(dbStepId);

    try {
      await pool.query(`UPDATE task_steps SET ${setClauses.join(", ")} WHERE id = ?;`, params);
    } catch (err) {
      console.warn("[AgentRuntime Step Update Warning]", err);
    }
  }

  /**
   * Main entrypoint to execute a task through the Advanced Agent Runtime.
   */
  public static async run(
    taskId: string,
    context: ExecutionContext,
    options: AgentRuntimeOptions = {}
  ): Promise<AgentExecutionResponse> {
    const startTime = Date.now();
    const timeline: { state: AgentLifecycleState; timestamp: string; details?: string }[] = [];

    const logState = (state: AgentLifecycleState, details?: string) => {
      timeline.push({
        state,
        timestamp: new Date().toISOString(),
        details,
      });
    };

    // 1. Verify task exists and belongs to context organization (Anti-IDOR)
    const [taskRows] = await pool.query<RowDataPacket[]>(
      "SELECT id, prompt, title, priority, status, organization_id FROM tasks WHERE id = ? LIMIT 1;",
      [taskId]
    );

    if (taskRows.length === 0) {
      throw new Error(`Task '${taskId}' was not found.`);
    }

    const taskRecord = taskRows[0];
    if (taskRecord.organization_id !== context.organizationId) {
      throw new Error(`Access denied: Task '${taskId}' does not belong to authorized organization.`);
    }

    // Check cancellation
    if (taskRecord.status === "CANCELLED" || (await this.isTaskCancelled(taskId))) {
      return {
        taskId,
        status: "CANCELLED",
        cycles: 0,
        latencyMs: Date.now() - startTime,
        plan: null,
        steps: [],
        finalAnswer: null,
        telemetry: null,
        timeline,
        error: "Task was cancelled prior to execution.",
      };
    }

    // 2. Initialize Runtime Components
    const watchdog = new AgentWatchdog({
      maxCycles: options.maxCycles,
      maxToolCalls: options.maxToolCalls,
    });
    const contextManager = new AgentContextManager(taskRecord.prompt);

    // Map to keep track of generated database step IDs by plan step ID
    const stepDbIdMap = new Map<string, string>();
    const executedToolRecords: Array<{
      id: string;
      tool: string;
      arguments: Record<string, unknown>;
      result: unknown;
      durationMs: number;
      success: boolean;
    }> = [];

    logState("REQUESTED", "Task registered in runtime.");

    try {
      // Transition to RUNNING
      logState("RUNNING", "Agent Runtime initialized. Transitioning to RUNNING.");
      await pool.query(
        "UPDATE tasks SET status = 'RUNNING', started_at = COALESCE(started_at, NOW()), updated_at = NOW() WHERE id = ?;",
        [taskId]
      );
      await this.recordAudit(context, "TASK_STARTED", "TASK_STARTED", { priority: taskRecord.priority });

      // =====================================================================
      // PHASE A: Structured Plan Generation & DAG Validation
      // =====================================================================
      logState("LLM_CALL", "Generating structured Directed Acyclic Graph (DAG) execution plan.");
      let plan: AdvancedAgentPlan;

      if (options.initialPlan) {
        plan = options.initialPlan;
        assertValidPlanDAG(plan);
      } else {
        plan = await AgentPlanner.generatePlan(taskRecord.prompt, options.allowedTools);
      }

      logState("VALIDATING", `Plan validated as acyclic DAG with ${plan.steps.length} sequential steps.`);

      // Persist plan steps in MySQL
      for (const step of plan.steps) {
        const dbId = await this.persistStepToDatabase(taskId, step);
        stepDbIdMap.set(step.id, dbId);
      }

      await this.recordAudit(context, "TASK_PLAN_GENERATED", "PLAN_CREATED", {
        stepCount: plan.steps.length,
        summary: plan.summary,
      });

      // =====================================================================
      // PHASE B: Deterministic Step Execution Loop
      // =====================================================================
      let executionCycle = 0;

      while (!areAllStepsFinished(plan)) {
        // Cooperative cancellation boundary check
        if (await this.isTaskCancelled(taskId)) {
          logState("CANCELLED", "Task cancellation signal acknowledged at step boundary.");
          return {
            taskId,
            status: "CANCELLED",
            cycles: executionCycle,
            latencyMs: Date.now() - startTime,
            plan: null,
            steps: [],
            finalAnswer: null,
            telemetry: null,
            timeline,
            error: "Task cancelled by user.",
          };
        }

        executionCycle = watchdog.recordCycle();

        // 1. Scheduler selects next runnable step
        const activeStep = findNextRunnableStep(plan);

        if (!activeStep) {
          // If no step is runnable but not all finished, detect deadlock / blocked dependencies
          const remainingPending = plan.steps.filter((s) => s.status === "PENDING" || s.status === "READY");
          if (remainingPending.length > 0) {
            throw new Error(
              `Execution deadlock: Remaining steps [${remainingPending.map((s) => s.id).join(", ")}] have unsatisfied dependencies.`
            );
          }
          break;
        }

        const dbStepId = stepDbIdMap.get(activeStep.id) || activeStep.id;

        // Transition step to IN_PROGRESS
        activeStep.status = "IN_PROGRESS";
        await this.updateStepInDatabase(dbStepId, { status: "IN_PROGRESS", startedAt: true });
        logState("TOOL_AUTHORIZED", `Scheduled Step ${activeStep.order} (${activeStep.id}: ${activeStep.title}) for execution.`);

        // Step Execution Internal Loop
        let stepCompleted = false;

        while (!stepCompleted) {
          // Cooperative cancellation boundary check
          if (await this.isTaskCancelled(taskId)) {
            logState("CANCELLED", "Task cancellation signal acknowledged before decision.");
            return {
              taskId,
              status: "CANCELLED",
              cycles: executionCycle,
              latencyMs: Date.now() - startTime,
              plan: null,
              steps: [],
              finalAnswer: null,
              telemetry: null,
              timeline,
              error: "Task cancelled by user.",
            };
          }

          // Build bounded context for LLM decision
          const stepPrompt = contextManager.buildStepDecisionPrompt(plan, activeStep, executionCycle);
          logState("LLM_CALL", `Invoking LLM Decision Engine for step '${activeStep.id}'.`);

          const decision = await AgentDecisionEngine.makeDecision(stepPrompt);

          // Handle Decision Types
          if (decision.type === "CALL_TOOL" && decision.toolCall) {
            const requestedTool = decision.toolCall.tool;
            const requestedArgs = decision.toolCall.arguments;

            logState("TOOL_REQUESTED", `Model requested tool '${requestedTool}' for step '${activeStep.id}'.`);

            // Phase 17: Intercept external side-effect tools (gmail_send) at the Approval Boundary
            const toolMeta = toolRegistry.getTool(requestedTool);
            if (requestedTool === "gmail_send" || toolMeta?.riskLevel === "EXTERNAL_SIDE_EFFECT") {
              logState("TOOL_REQUESTED", `Tool '${requestedTool}' proposed by model. Intercepting at approval boundary (Phase 17).`);
              const toolStartTime = performance.now();
              const stageResult = await gmailService.stageSendForApproval(
                requestedArgs as any,
                { userId: context.userId, organizationId: context.organizationId, taskId }
              );
              const durationMs = Math.round(performance.now() - toolStartTime);

              const approvalData = {
                status: "APPROVAL_REQUIRED",
                approvalId: stageResult.approvalId,
                reason: stageResult.reason,
                details: stageResult.details,
              };

              const execRecordId = await recordToolExecution(
                taskId,
                requestedTool,
                requestedArgs,
                { tool: requestedTool, success: true, data: approvalData },
                durationMs,
                dbStepId
              );

              executedToolRecords.push({
                id: execRecordId,
                tool: requestedTool,
                arguments: requestedArgs,
                result: approvalData,
                durationMs,
                success: true,
              });

              // Update step in database to WAITING_FOR_APPROVAL
              activeStep.status = "WAITING_FOR_APPROVAL" as any;
              activeStep.resultSummary = `Approval required (ID: ${stageResult.approvalId}). Waiting for human review.`;
              await this.updateStepInDatabase(dbStepId, {
                status: "WAITING_FOR_APPROVAL",
                toolName: requestedTool,
                outputData: approvalData,
              });

              // Persist task state as WAITING_FOR_APPROVAL in MySQL
              await pool.query(
                `UPDATE tasks SET status = 'WAITING_FOR_APPROVAL', updated_at = NOW() WHERE id = ?;`,
                [taskId]
              );

              logState("WAITING_APPROVAL", `Task execution paused awaiting Human Approval for '${requestedTool}' (Approval ID: ${stageResult.approvalId}).`);

              // Conclude runtime loop safely without claiming completion
              const totalLatency = Date.now() - startTime;
              const waitingSteps: AgentTaskStepEntity[] = plan.steps.map((s) => ({
                id: stepDbIdMap.get(s.id) || s.id,
                task_id: taskId,
                step_order: s.order,
                title: s.title,
                description: s.description,
                status: s.status as any,
                tool_name: (s as any).selectedTool || null,
                dependencies: s.dependencies || [],
                input_data: (s as any).arguments || null,
                output_data: s.resultSummary ? ({ summary: s.resultSummary } as any) : null,
                error_message: s.error || null,
                started_at: null,
                completed_at: null,
                created_at: new Date().toISOString(),
              }));

              return {
                taskId,
                status: "WAITING_FOR_APPROVAL" as any,
                cycles: executionCycle,
                latencyMs: totalLatency,
                plan,
                steps: waitingSteps,
                finalAnswer: `Task paused at Human Approval boundary. Sensitive action '${requestedTool}' requires authorized human review. (Approval ID: ${stageResult.approvalId})`,
                result: `Waiting for approval (ID: ${stageResult.approvalId})`,
                toolExecutions: executedToolRecords,
                telemetry: {
                  model: "gpt-4o-mini",
                  totalTokens: 1000 + executionCycle * 250,
                  estimatedCostUsd: 0.003 + executionCycle * 0.0005,
                },
                timeline,
              };
            }

            // Policy authorization check
            AgentPolicyEngine.authorizeToolExecution(
              requestedTool,
              requestedArgs,
              activeStep,
              options.allowedTools,
              context
            );

            logState("TOOL_EXECUTING", `Tool '${requestedTool}' authorized under policy engine.`);
            watchdog.recordToolCall(requestedTool, requestedArgs);

            // Execute Tool
            const toolStartTime = performance.now();
            const toolResult = await toolRegistry.executeTool(
              requestedTool,
              requestedArgs,
              {
                userId: context.userId,
                organizationId: context.organizationId,
                taskId,
              },
              { allowedTools: options.allowedTools }
            );
            const durationMs = Math.round(performance.now() - toolStartTime);

            logState("TOOL_COMPLETED", `Tool '${requestedTool}' finished in ${durationMs}ms (success: ${toolResult.success}).`);

            // Persist tool execution row linked to dbStepId
            const execRecordId = await recordToolExecution(
              taskId,
              requestedTool,
              requestedArgs,
              toolResult,
              durationMs,
              dbStepId
            );

            executedToolRecords.push({
              id: execRecordId,
              tool: requestedTool,
              arguments: requestedArgs,
              result: toolResult.success ? toolResult.data : toolResult.error,
              durationMs,
              success: toolResult.success,
            });

            // Store observation in context manager
            const observation: AgentObservation = {
              type: "tool_result",
              tool: requestedTool,
              status: toolResult.success ? "success" : "error",
              summary: toolResult.success
                ? `Tool '${requestedTool}' succeeded with output data.`
                : `Tool '${requestedTool}' failed: ${toolResult.error?.message || "Execution error"}`,
              data: toolResult.success ? toolResult.data : toolResult.error,
              durationMs,
              timestamp: new Date().toISOString(),
              stepId: activeStep.id,
              error: toolResult.error ? { code: toolResult.error.code, message: toolResult.error.message } : undefined,
            };

            contextManager.addObservation(observation);

            if (toolResult.success) {
              activeStep.status = "COMPLETED";
              activeStep.resultSummary = observation.summary;
              await this.updateStepInDatabase(dbStepId, {
                status: "COMPLETED",
                toolName: requestedTool,
                outputData: toolResult.data,
                completedAt: true,
              });
              stepCompleted = true;
            } else {
              // Handle Failure
              const classification = AgentPolicyEngine.classifyFailure(toolResult.error);

              if (classification.retryable && watchdog.canRetryStep(activeStep.id)) {
                const attempt = watchdog.recordStepRetry(activeStep.id);
                logState("TOOL_REQUESTED", `Retrying step '${activeStep.id}' (Attempt ${attempt}). Reason: ${classification.message}`);
                continue; // Retry loop
              } else if (classification.replanEligible && watchdog.canReplan()) {
                const replanAttempt = watchdog.recordReplan();
                logState("VALIDATING", `Initiating bounded replan #${replanAttempt} following step '${activeStep.id}' obstacle.`);
                plan = await AgentPlanner.replanRemaining(plan, activeStep, classification.message, contextManager.getObservations());

                // Persist new replanned steps in database
                for (const s of plan.steps) {
                  if (!stepDbIdMap.has(s.id)) {
                    const newDbId = await this.persistStepToDatabase(taskId, s);
                    stepDbIdMap.set(s.id, newDbId);
                  }
                }
                stepCompleted = true;
              } else {
                activeStep.status = "FAILED";
                activeStep.error = classification.message;
                await this.updateStepInDatabase(dbStepId, {
                  status: "FAILED",
                  toolName: requestedTool,
                  errorMessage: classification.message,
                  completedAt: true,
                });
                throw new Error(`Step '${activeStep.id}' failed permanently: ${classification.message}`);
              }
            }
          } else if (decision.type === "CONTINUE" || decision.type === "COMPLETE") {
            activeStep.status = "COMPLETED";
            activeStep.resultSummary = decision.reasoningSummary;
            await this.updateStepInDatabase(dbStepId, {
              status: "COMPLETED",
              outputData: { reasoning: decision.reasoningSummary },
              completedAt: true,
            });
            stepCompleted = true;

            if (decision.type === "COMPLETE") {
              break;
            }
          } else if (decision.type === "FAIL") {
            const failReason = decision.failureReason || decision.reasoningSummary || "Step failed by decision engine";
            activeStep.status = "FAILED";
            activeStep.error = failReason;
            await this.updateStepInDatabase(dbStepId, {
              status: "FAILED",
              errorMessage: failReason,
              completedAt: true,
            });
            throw new Error(`Step '${activeStep.id}' halted by decision engine: ${failReason}`);
          }
        }
      }

      // =====================================================================
      // PHASE C: Final Grounded Result Synthesis
      // =====================================================================
      logState("VALIDATING", "All plan steps completed. Generating grounded final synthesis.");
      const synthesisPrompt = contextManager.buildFinalSynthesisPrompt(plan);
      const finalSynthesis: AgentFinalSynthesis = await AgentResultSynthesizer.synthesizeFinalResult(
        synthesisPrompt,
        contextManager.getObservations()
      );

      logState("COMPLETED", "Final synthesis validated. Concluding task execution.");

      // Calculate aggregated metrics
      const totalLatency = Date.now() - startTime;
      const stats = watchdog.getStats();

      // Persist final report in MySQL
      const finalReportText = finalSynthesis.summary;
      await pool.query(
        `UPDATE tasks 
         SET status = 'COMPLETED', 
             completed_at = NOW(), 
             final_report = ?, 
             constraints_json = ?, 
             updated_at = NOW() 
         WHERE id = ?;`,
        [finalReportText, JSON.stringify({ synthesis: finalSynthesis, planSummary: plan.summary }), taskId]
      );

      await this.recordAudit(context, "TASK_COMPLETED", "TASK_COMPLETED", {
        cycles: stats.cycles,
        toolCalls: stats.toolCalls,
        replans: stats.replans,
        latencyMs: totalLatency,
      });

      // Persist durable AI telemetry record in MySQL
      try {
        await pool.query(
          `INSERT INTO ai_telemetry 
            (id, task_id, provider, model, prompt_type, prompt_tokens, completion_tokens, total_tokens, latency_ms, estimated_cost_usd, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            crypto.randomUUID(),
            taskId,
            "mock-provider",
            "gpt-4o-mini",
            "structured",
            800 + stats.cycles * 200,
            200 + stats.toolCalls * 50,
            1000 + stats.toolCalls * 250,
            totalLatency,
            0.003 + stats.toolCalls * 0.0005,
            "SUCCESS",
          ]
        );
      } catch (err) {
        console.warn("[MySQL Telemetry Persistence Warning]", err);
      }

      // Assemble final step entities for client
      const finalSteps: AgentTaskStepEntity[] = plan.steps.map((s) => ({
        id: stepDbIdMap.get(s.id) || s.id,
        task_id: taskId,
        step_order: s.order,
        title: s.title,
        description: s.description,
        status: s.status === "READY" ? "IN_PROGRESS" : (s.status as any),
        tool_name: (s.allowedTools && s.allowedTools[0]) || null,
        input_data: { dependencies: s.dependencies, allowedTools: s.allowedTools || [] } as any,
        output_data: s.resultSummary ? ({ summary: s.resultSummary } as any) : null,
        error_message: s.error || null,
        started_at: null,
        completed_at: null,
        created_at: new Date().toISOString(),
      }));

      return {
        taskId,
        status: "COMPLETED",
        cycles: stats.cycles,
        latencyMs: totalLatency,
        plan: null,
        steps: finalSteps,
        finalAnswer: finalSynthesis.summary,
        result: finalSynthesis.summary,
        toolExecutions: executedToolRecords,
        telemetry: {
          model: "gpt-4o-mini",
          totalTokens: 1000 + stats.toolCalls * 250,
          estimatedCostUsd: 0.003 + stats.toolCalls * 0.0005,
        },
        timeline,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Advanced Agent execution failure";
      logState("FAILED", `Execution halted: ${errorMessage}`);

      await pool.query(
        "UPDATE tasks SET status = 'FAILED', completed_at = NOW(), error_message = ?, updated_at = NOW() WHERE id = ?;",
        [errorMessage, taskId]
      );

      await this.recordAudit(context, "TASK_FAILED", "TASK_FAILED", { error: errorMessage });

      const totalLatency = Date.now() - startTime;

      return {
        taskId,
        status: "FAILED",
        cycles: watchdog.getStats().cycles,
        latencyMs: totalLatency,
        plan: null,
        steps: [],
        finalAnswer: null,
        toolExecutions: executedToolRecords,
        telemetry: null,
        timeline,
        error: errorMessage,
      };
    }
  }
}

/**
 * AI Workforce Platform — Phase 19: Checkpointing & Partial-Progress Recovery
 *
 * Persists and reconstructs durable execution checkpoints, allowing crashed or interrupted
 * tasks to resume execution from the earliest uncompleted step rather than repeating prior work.
 */

import { RowDataPacket } from "mysql2/promise";
import { pool } from "../db/pool";
import { AdvancedAgentPlan, AdvancedPlanStep } from "../agent/agentTypes";

export interface TaskCheckpoint {
  taskId: string;
  totalSteps: number;
  completedStepCount: number;
  hasExistingSteps: boolean;
  earliestUncompletedStepOrder: number | null;
  resumablePlan: AdvancedAgentPlan | null;
  completedObservations: Record<string, unknown>;
}

export class CheckpointManager {
  private static instance: CheckpointManager;

  public static getInstance(): CheckpointManager {
    if (!CheckpointManager.instance) {
      CheckpointManager.instance = new CheckpointManager();
    }
    return CheckpointManager.instance;
  }

  /**
   * Loads persisted steps and observations for a task to determine partial progress.
   */
  public async loadCheckpoint(taskId: string): Promise<TaskCheckpoint | null> {
    const [stepRows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM task_steps WHERE task_id = ? ORDER BY step_order ASC;`,
      [taskId]
    );

    if (stepRows.length === 0) {
      return {
        taskId,
        totalSteps: 0,
        completedStepCount: 0,
        hasExistingSteps: false,
        earliestUncompletedStepOrder: null,
        resumablePlan: null,
        completedObservations: {},
      };
    }

    // Load completed tool observations for completed steps
    const [toolRows] = await pool.query<RowDataPacket[]>(
      `SELECT step_id, tool_name, output_payload FROM tool_executions WHERE task_id = ? AND is_error = 0;`,
      [taskId]
    );

    const observations: Record<string, unknown> = {};
    for (const trow of toolRows) {
      try {
        observations[trow.step_id] =
          typeof trow.output_payload === "string"
            ? JSON.parse(trow.output_payload)
            : trow.output_payload;
      } catch {
        observations[trow.step_id] = trow.output_payload;
      }
    }

    let completedCount = 0;
    let earliestUncompletedOrder: number | null = null;

    const planSteps: AdvancedPlanStep[] = [];

    for (const row of stepRows) {
      let inputMeta: any = {};
      try {
        inputMeta =
          typeof row.input_data === "string"
            ? JSON.parse(row.input_data)
            : row.input_data || {};
      } catch {
        inputMeta = {};
      }

      const isCompleted = row.status === "COMPLETED";
      if (isCompleted) {
        completedCount++;
      } else if (earliestUncompletedOrder === null) {
        earliestUncompletedOrder = Number(row.step_order);
      }

      // Reconstruct plan step entity
      const planStep: AdvancedPlanStep = {
        id: String(row.id),
        order: Number(row.step_order),
        title: String(row.title),
        description: String(row.description || row.title),
        status: isCompleted ? "COMPLETED" : "PENDING",
        dependencies: inputMeta.dependencies || [],
        allowedTools: inputMeta.allowedTools || (row.tool_name ? [row.tool_name] : []),
        resultSummary: isCompleted ? "Executed in prior iteration." : undefined,
      };

      planSteps.push(planStep);
    }

    const resumablePlan: AdvancedAgentPlan = {
      goal: `Resume execution for task ${taskId}`,
      summary: `Resumed execution plan (${completedCount}/${stepRows.length} steps already finished)`,
      steps: planSteps,
    };

    return {
      taskId,
      totalSteps: stepRows.length,
      completedStepCount: completedCount,
      hasExistingSteps: true,
      earliestUncompletedStepOrder: earliestUncompletedOrder,
      resumablePlan: completedCount > 0 ? resumablePlan : null,
      completedObservations: observations,
    };
  }

  /**
   * Persists step checkpoint upon step completion.
   */
  public async saveStepCheckpoint(
    stepId: string,
    outputData: Record<string, unknown>
  ): Promise<void> {
    await pool.query(
      `UPDATE task_steps 
       SET status = 'COMPLETED', output_data = ?, completed_at = NOW() 
       WHERE id = ?;`,
      [JSON.stringify(outputData), stepId]
    );
  }
}

export const checkpointManager = CheckpointManager.getInstance();

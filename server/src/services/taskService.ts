import crypto from "crypto";
import { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { pool } from "../db/pool";
import {
  AgentLifecycleState,
  AgentPlan,
  AgentTaskEntity,
  AgentTaskStepEntity,
  PlanStep,
} from "../agent/agentSchemas";
import { AGENT_CONFIG } from "../agent/agentConfig";

/**
 * Creates a durable task in MySQL with initial status 'REQUESTED'.
 */
export async function createTask(input: {
  userId?: string;
  organizationId?: string;
  title?: string;
  prompt: string;
  priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
}): Promise<AgentTaskEntity> {
  const id = crypto.randomUUID();
  const userId = input.userId || AGENT_CONFIG.DEFAULT_USER_ID;
  const organizationId = input.organizationId || "org-demo-001";
  const prompt = input.prompt.trim();
  const title = input.title?.trim() || prompt.substring(0, 60) + (prompt.length > 60 ? "..." : "");
  const priority = input.priority || "NORMAL";
  const initialStatus: AgentLifecycleState = "REQUESTED";

  const query = `
    INSERT INTO tasks (
      id, user_id, organization_id, title, prompt, status, priority, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW());
  `;

  await pool.query<ResultSetHeader>(query, [
    id,
    userId,
    organizationId,
    title,
    prompt,
    initialStatus,
    priority,
  ]);

  const createdTask = await getTaskRecordOnly(id);
  if (!createdTask) {
    throw new Error(`Failed to retrieve task immediately after creation for ID: ${id}`);
  }

  return createdTask;
}

/**
 * Updates task execution state and metrics in MySQL.
 */
export async function updateTaskState(
  taskId: string,
  status: AgentLifecycleState,
  updates?: {
    startedAt?: boolean;
    completedAt?: boolean;
    finalReport?: string;
    errorMessage?: string;
    promptTokens?: number;
    completionTokens?: number;
    totalCostUsd?: number;
  }
): Promise<void> {
  const setClauses: string[] = ["status = ?", "updated_at = NOW()"];
  const params: unknown[] = [status];

  if (updates?.startedAt) {
    setClauses.push("started_at = COALESCE(started_at, NOW())");
  }

  if (updates?.completedAt) {
    setClauses.push("completed_at = NOW()");
  }

  if (updates?.finalReport !== undefined) {
    setClauses.push("final_report = ?");
    params.push(updates.finalReport);
  }

  if (updates?.errorMessage !== undefined) {
    setClauses.push("error_message = ?");
    params.push(updates.errorMessage);
  }

  if (updates?.promptTokens !== undefined) {
    setClauses.push("prompt_tokens = prompt_tokens + ?");
    params.push(updates.promptTokens);
  }

  if (updates?.completionTokens !== undefined) {
    setClauses.push("completion_tokens = completion_tokens + ?");
    params.push(updates.completionTokens);
  }

  if (updates?.totalCostUsd !== undefined) {
    setClauses.push("total_cost_usd = total_cost_usd + ?");
    params.push(updates.totalCostUsd);
  }

  params.push(taskId);

  const query = `UPDATE tasks SET ${setClauses.join(", ")} WHERE id = ?;`;
  await pool.query<ResultSetHeader>(query, params);
}

/**
 * Persists proposed agent plan steps into the durable `task_steps` table.
 * Preserves deterministic order and marks each as PENDING for future execution.
 */
export async function persistTaskSteps(
  taskId: string,
  steps: PlanStep[]
): Promise<AgentTaskStepEntity[]> {
  if (steps.length === 0) return [];

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const insertedSteps: AgentTaskStepEntity[] = [];

    for (const step of steps) {
      const stepId = crypto.randomUUID();
      const title = step.title || `Step ${step.order}`;
      const description = step.description;
      const stepOrder = step.order;
      const status = "PENDING";

      const query = `
        INSERT INTO task_steps (
          id, task_id, step_order, title, description, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, NOW());
      `;

      await connection.query<ResultSetHeader>(query, [
        stepId,
        taskId,
        stepOrder,
        title,
        description,
        status,
      ]);

      insertedSteps.push({
        id: stepId,
        task_id: taskId,
        step_order: stepOrder,
        title,
        description,
        status,
        tool_name: null,
        input_data: null,
        output_data: null,
        error_message: null,
        started_at: null,
        completed_at: null,
        created_at: new Date().toISOString(),
      });
    }

    await connection.commit();
    return insertedSteps;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Retrieves an individual task record without joined relations.
 */
export async function getTaskRecordOnly(taskId: string): Promise<AgentTaskEntity | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM tasks WHERE id = ? LIMIT 1;",
    [taskId]
  );

  if (rows.length === 0) return null;
  return rows[0] as AgentTaskEntity;
}

/**
 * Retrieves a full task record with all associated steps and linked AI telemetry.
 */
export async function getTaskById(
  taskId: string,
  organizationId?: string
): Promise<{
  task: AgentTaskEntity | null;
  steps: AgentTaskStepEntity[];
  parsedPlan: AgentPlan | null;
  telemetry: {
    model: string;
    totalTokens: number;
    latencyMs: number;
    estimatedCostUsd: number;
  } | null;
}> {
  const task = await getTaskRecordOnly(taskId);
  if (!task) {
    return { task: null, steps: [], parsedPlan: null, telemetry: null };
  }

  // IDOR Protection: Enforce tenant ownership boundary if organizationId provided
  if (organizationId && (task as any).organization_id && (task as any).organization_id !== organizationId) {
    return { task: null, steps: [], parsedPlan: null, telemetry: null };
  }

  // 1. Fetch steps
  const [stepRows] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM task_steps WHERE task_id = ? ORDER BY step_order ASC;",
    [taskId]
  );
  const steps = stepRows as AgentTaskStepEntity[];

  // 2. Parse final_report if it contains JSON plan
  let parsedPlan: AgentPlan | null = null;
  if (task.final_report) {
    try {
      parsedPlan = JSON.parse(task.final_report);
    } catch {
      // Non-JSON report is kept as null parsedPlan
    }
  }

  // 3. Fetch linked telemetry from ai_telemetry table
  const [telemetryRows] = await pool.query<RowDataPacket[]>(
    `SELECT model, total_tokens, latency_ms, estimated_cost_usd 
     FROM ai_telemetry 
     WHERE task_id = ? 
     ORDER BY created_at DESC 
     LIMIT 1;`,
    [taskId]
  );

  let telemetry = null;
  if (telemetryRows.length > 0) {
    const t = telemetryRows[0];
    telemetry = {
      model: String(t.model),
      totalTokens: Number(t.total_tokens),
      latencyMs: Number(t.latency_ms),
      estimatedCostUsd: parseFloat(String(t.estimated_cost_usd)),
    };
  }

  return { task, steps, parsedPlan, telemetry };
}

/**
 * Lists recent tasks for history display, scoped to tenant organization.
 */
export async function listTasks(
  organizationId?: string,
  limit: number = 20
): Promise<{
  id: string;
  title: string;
  prompt: string;
  status: AgentLifecycleState;
  priority: string;
  stepCount: number;
  totalCostUsd: number;
  createdAt: string;
  completedAt: string | null;
}[]> {
  let query = `
    SELECT 
       t.id, t.title, t.prompt, t.status, t.priority, t.total_cost_usd, t.created_at, t.completed_at,
       COUNT(ts.id) AS stepCount
     FROM tasks t
     LEFT JOIN task_steps ts ON t.id = ts.task_id
  `;
  const params: any[] = [];

  if (organizationId) {
    query += ` WHERE t.organization_id = ? `;
    params.push(organizationId);
  }

  query += `
     GROUP BY t.id
     ORDER BY t.created_at DESC
     LIMIT ?;
  `;
  params.push(limit);

  const [rows] = await pool.query<RowDataPacket[]>(query, params);

  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    prompt: String(r.prompt),
    status: r.status as AgentLifecycleState,
    priority: String(r.priority),
    stepCount: Number(r.stepCount || 0),
    totalCostUsd: parseFloat(String(r.total_cost_usd || 0)),
    createdAt: String(r.created_at),
    completedAt: r.completed_at ? String(r.completed_at) : null,
  }));
}

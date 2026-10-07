import crypto from "crypto";
import { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { pool } from "../db/pool";
import {
  TaskEntity,
  TaskStepEntity,
  TaskSummary,
  TaskDetails,
  TaskLifecycleState,
} from "./taskTypes";
import { CreateTaskInput, UpdateTaskInput, ListTasksQuery } from "./taskSchemas";
import { assertValidTaskTransition } from "./taskTransitions";
import { AuthenticatedUser } from "../auth/types";
import { executeAgentTask } from "../agent/agentHost";
import { AgentExecutionResponse } from "../agent/agentSchemas";
import { AgentRuntime } from "../agent/agentRuntime";

export class TaskError extends Error {
  public code: string;
  public statusCode: number;

  constructor(message: string, code: string, statusCode: number = 400) {
    super(message);
    this.name = "TaskError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class TaskNotFoundError extends TaskError {
  constructor(taskId: string) {
    super(`Task not found with ID '${taskId}'.`, "TASK_NOT_FOUND", 404);
  }
}

export class TaskAlreadyRunningError extends TaskError {
  constructor(taskId: string) {
    super(`Task '${taskId}' is already running. Duplicate execution rejected.`, "TASK_ALREADY_RUNNING", 409);
  }
}

/**
 * Phase 14 — Authoritative Task Management Service
 */
export class TaskService {
  /**
   * Helper to map raw MySQL row to typed TaskEntity
   */
  private mapRowToTask(row: any): TaskEntity {
    return {
      id: String(row.id),
      user_id: String(row.user_id),
      organization_id: String(row.organization_id || "org-demo-001"),
      title: String(row.title),
      goal: String(row.prompt),
      prompt: String(row.prompt),
      status: row.status as TaskLifecycleState,
      priority: row.priority || "NORMAL",
      constraints_json: row.constraints_json ? (typeof row.constraints_json === "string" ? JSON.parse(row.constraints_json) : row.constraints_json) : null,
      final_report: row.final_report ? String(row.final_report) : null,
      error_message: row.error_message ? String(row.error_message) : null,
      prompt_tokens: Number(row.prompt_tokens || 0),
      completion_tokens: Number(row.completion_tokens || 0),
      total_cost_usd: parseFloat(String(row.total_cost_usd || 0)),
      started_at: row.started_at ? new Date(row.started_at).toISOString() : null,
      completed_at: row.completed_at ? new Date(row.completed_at).toISOString() : null,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }

  /**
   * Records a task lifecycle event in the durable audit_logs table.
   */
  private async recordTaskAudit(
    userId: string,
    organizationId: string,
    taskId: string,
    action: string,
    details: Record<string, unknown>
  ): Promise<void> {
    try {
      const id = crypto.randomUUID();
      await pool.query(
        `INSERT INTO audit_logs (id, user_id, organization_id, task_id, event_type, action, details_json)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
        [id, userId, organizationId, taskId, action, action, JSON.stringify(details)]
      );
    } catch (err) {
      console.warn("[Task Audit Log Warning]", err);
    }
  }

  /**
   * Creates a new durable task with initial status 'REQUESTED'.
   * Host derives identity strictly from authenticated user.
   */
  public async createTask(input: CreateTaskInput, authUser: AuthenticatedUser): Promise<TaskEntity> {
    const id = crypto.randomUUID();
    const prompt = (input.goal || input.prompt)!.trim();
    const title = input.title?.trim() || prompt.substring(0, 60) + (prompt.length > 60 ? "..." : "");
    const priority = input.priority || "NORMAL";
    const status: TaskLifecycleState = "REQUESTED";

    await pool.query<ResultSetHeader>(
      `INSERT INTO tasks (
        id, user_id, organization_id, title, prompt, status, priority, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW());`,
      [id, authUser.id, authUser.organizationId, title, prompt, status, priority]
    );

    const task = await this.getTaskByIdInternal(id);
    if (!task) {
      throw new Error(`Failed to retrieve newly created task '${id}'.`);
    }

    // Persist audit record
    await this.recordTaskAudit(authUser.id, authUser.organizationId, id, "TASK_CREATED", {
      title,
      priority,
      status,
    });

    return task;
  }

  /**
   * Internal lookup without organization check.
   */
  public async getTaskByIdInternal(taskId: string): Promise<TaskEntity | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT * FROM tasks WHERE id = ? LIMIT 1;",
      [taskId]
    );
    if (rows.length === 0) return null;
    return this.mapRowToTask(rows[0]);
  }

  /**
   * Lists tasks scoped strictly to the authenticated user's organization.
   */
  public async listTasks(
    organizationId: string,
    query: ListTasksQuery
  ): Promise<{
    tasks: TaskSummary[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const limit = query.limit || 20;
    const offset = query.offset || 0;

    let whereClause = "WHERE t.organization_id = ?";
    const params: unknown[] = [organizationId];

    if (query.status) {
      whereClause += " AND t.status = ?";
      params.push(query.status);
    }

    // 1. Total count
    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM tasks t ${whereClause};`,
      params
    );
    const total = Number(countRows[0]?.total || 0);

    // 2. Paginated rows with step counts
    const listParams = [...params, limit, offset];
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 
         t.id, t.title, t.prompt, t.status, t.priority, t.total_cost_usd, 
         t.created_at, t.started_at, t.completed_at,
         COUNT(ts.id) AS step_count
       FROM tasks t
       LEFT JOIN task_steps ts ON t.id = ts.task_id
       ${whereClause}
       GROUP BY t.id
       ORDER BY t.created_at DESC
       LIMIT ? OFFSET ?;`,
      listParams
    );

    const tasks: TaskSummary[] = rows.map((r) => {
      let durationMs: number | null = null;
      if (r.started_at && r.completed_at) {
        durationMs = new Date(r.completed_at).getTime() - new Date(r.started_at).getTime();
      }

      return {
        id: String(r.id),
        title: String(r.title),
        goal: String(r.prompt),
        status: r.status as TaskLifecycleState,
        priority: r.priority || "NORMAL",
        stepCount: Number(r.step_count || 0),
        totalCostUsd: parseFloat(String(r.total_cost_usd || 0)),
        durationMs,
        createdAt: new Date(r.created_at).toISOString(),
        startedAt: r.started_at ? new Date(r.started_at).toISOString() : null,
        completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
      };
    });

    return { tasks, total, limit, offset };
  }

  /**
   * Retrieves full details for a task, enforcing organization ownership (Anti-IDOR).
   */
  public async getTaskById(taskId: string, organizationId: string): Promise<TaskDetails | null> {
    const task = await this.getTaskByIdInternal(taskId);
    if (!task) return null;

    // Strict Tenant Boundary (Anti-IDOR Protection)
    if (task.organization_id !== organizationId) {
      return null;
    }

    // 1. Fetch steps in deterministic order
    const [stepRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, task_id, step_order, title, description, status, tool_name, 
              input_data, output_data, error_message, started_at, completed_at, created_at
       FROM task_steps 
       WHERE task_id = ? 
       ORDER BY step_order ASC;`,
      [taskId]
    );

    const steps: TaskStepEntity[] = stepRows.map((s) => {
      const parsedInput = s.input_data ? (typeof s.input_data === "string" ? JSON.parse(s.input_data) : s.input_data) : null;
      return {
        id: String(s.id),
        task_id: String(s.task_id),
        step_order: Number(s.step_order),
        title: String(s.title),
        description: String(s.description || ""),
        status: s.status,
        tool_name: s.tool_name ? String(s.tool_name) : null,
        dependencies: Array.isArray(parsedInput?.dependencies) ? parsedInput.dependencies : [],
        input_data: parsedInput,
        output_data: s.output_data ? (typeof s.output_data === "string" ? JSON.parse(s.output_data) : s.output_data) : null,
        error_message: s.error_message ? String(s.error_message) : null,
        started_at: s.started_at ? new Date(s.started_at).toISOString() : null,
        completed_at: s.completed_at ? new Date(s.completed_at).toISOString() : null,
        created_at: new Date(s.created_at).toISOString(),
      };
    });

    // 2. Fetch tool executions
    const [toolRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, step_id, tool_name, input_payload, output_payload, duration_ms, is_error 
       FROM tool_executions 
       WHERE task_id = ? 
       ORDER BY created_at ASC;`,
      [taskId]
    );

    const toolExecutions = toolRows.map((t) => {
      let parsedOutput: unknown = t.output_payload;
      if (typeof t.output_payload === "string") {
        try {
          parsedOutput = JSON.parse(t.output_payload);
        } catch {
          parsedOutput = t.output_payload;
        }
      }

      return {
        id: String(t.id),
        step_id: t.step_id ? String(t.step_id) : null,
        stepId: t.step_id ? String(t.step_id) : null,
        tool: String(t.tool_name),
        arguments: typeof t.input_payload === "string" ? JSON.parse(t.input_payload) : t.input_payload,
        result: parsedOutput,
        durationMs: Number(t.duration_ms),
        success: !t.is_error,
      };
    });

    // 3. Fetch linked telemetry
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
      const tel = telemetryRows[0];
      telemetry = {
        model: String(tel.model),
        totalTokens: Number(tel.total_tokens),
        latencyMs: Number(tel.latency_ms),
        estimatedCostUsd: parseFloat(String(tel.estimated_cost_usd)),
      };
    }

    // 4. Summarize evidence sources from tools and report
    const sourcesSet = new Set<string>();
    for (const exec of toolExecutions) {
      if (exec.tool === "mysql_verify_customer") sourcesSet.add("Customer Database (MySQL)");
      if (exec.tool === "web_search") sourcesSet.add("Web Search");
      if (exec.tool === "vector_search" || exec.tool === "rag_query") sourcesSet.add("Internal Knowledge (Qdrant)");
    }
    if (sourcesSet.size === 0) {
      sourcesSet.add("Language Model Synthesis");
    }

    // 5. Fetch linked approvals (Phase 17)
    const [approvalRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, action_type, tool_name, status, payload_preview, created_at, expires_at 
       FROM approvals 
       WHERE task_id = ? 
       ORDER BY created_at DESC;`,
      [taskId]
    );

    const approvals = approvalRows.map((a) => ({
      id: String(a.id),
      action_type: String(a.action_type),
      tool_name: a.tool_name ? String(a.tool_name) : undefined,
      status: String(a.status),
      payload_preview: typeof a.payload_preview === "string" ? JSON.parse(a.payload_preview) : a.payload_preview || {},
      created_at: new Date(a.created_at).toISOString(),
      expires_at: a.expires_at ? new Date(a.expires_at).toISOString() : null,
    }));

    return {
      task,
      steps,
      toolExecutions,
      telemetry,
      sources: Array.from(sourcesSet),
      approvals,
    };
  }

  /**
   * Updates non-lifecycle metadata (e.g., title) on an authorized task.
   */
  public async updateTask(
    taskId: string,
    organizationId: string,
    input: UpdateTaskInput,
    authUser: AuthenticatedUser
  ): Promise<TaskEntity> {
    const task = await this.getTaskByIdInternal(taskId);
    if (!task || task.organization_id !== organizationId) {
      throw new TaskNotFoundError(taskId);
    }

    if (input.title) {
      await pool.query(
        "UPDATE tasks SET title = ?, updated_at = NOW() WHERE id = ?;",
        [input.title.trim(), taskId]
      );
    }

    await this.recordTaskAudit(authUser.id, organizationId, taskId, "TASK_UPDATED", {
      title: input.title,
    });

    const updated = await this.getTaskByIdInternal(taskId);
    return updated!;
  }

  /**
   * Cancels a task if in an active non-terminal state ('REQUESTED' or 'RUNNING').
   */
  public async cancelTask(
    taskId: string,
    organizationId: string,
    authUser: AuthenticatedUser
  ): Promise<TaskEntity> {
    const task = await this.getTaskByIdInternal(taskId);
    if (!task || task.organization_id !== organizationId) {
      throw new TaskNotFoundError(taskId);
    }

    // Verify allowed state transition
    assertValidTaskTransition(task.status, "CANCELLED");

    await pool.query(
      `UPDATE tasks 
       SET status = 'CANCELLED', 
           completed_at = NOW(), 
           error_message = 'Task cancelled by user.',
           updated_at = NOW() 
       WHERE id = ?;`,
      [taskId]
    );

    // Phase 17: Cancel linked pending or approved approvals for this task
    const [linkedApprovals] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM approvals WHERE task_id = ? AND status IN ('PENDING', 'APPROVED');`,
      [taskId]
    );

    if (linkedApprovals.length > 0) {
      await pool.query(
        `UPDATE approvals 
         SET status = 'CANCELLED', decision_note = 'Parent task cancelled by user.' 
         WHERE task_id = ? AND status IN ('PENDING', 'APPROVED');`,
        [taskId]
      );

      for (const row of linkedApprovals) {
        await this.recordTaskAudit(authUser.id, organizationId, taskId, "APPROVAL_CANCELLED", {
          approvalId: row.id,
          reason: "Parent task cancelled by user.",
        });
      }
    }

    await this.recordTaskAudit(authUser.id, organizationId, taskId, "TASK_CANCELLED", {
      previousStatus: task.status,
    });

    const updated = await this.getTaskByIdInternal(taskId);
    return updated!;
  }

  /**
   * Runs execution of a task: transitions REQUESTED -> RUNNING -> executes agent -> COMPLETED / FAILED.
   * Throws 409 if task is already running or in an incompatible state.
   */
  public async runTask(
    taskId: string,
    organizationId: string,
    authUser: AuthenticatedUser,
    options?: {
      mode?: "tools" | "planning";
      allowedTools?: string[];
    }
  ): Promise<AgentExecutionResponse> {
    const task = await this.getTaskByIdInternal(taskId);
    if (!task || task.organization_id !== organizationId) {
      throw new TaskNotFoundError(taskId);
    }

    // Duplicate Execution Guard
    if (task.status === "RUNNING") {
      throw new TaskAlreadyRunningError(taskId);
    }

    // Assert valid lifecycle transition from current state
    assertValidTaskTransition(task.status, "RUNNING");

    // Transition to RUNNING
    await pool.query(
      `UPDATE tasks 
       SET status = 'RUNNING', started_at = NOW(), updated_at = NOW() 
       WHERE id = ?;`,
      [taskId]
    );

    await this.recordTaskAudit(authUser.id, organizationId, taskId, "TASK_STARTED", {
      priority: task.priority,
    });

    // Execute agent using trusted host context and existingTaskId via Phase 15 AgentRuntime
    try {
      const result = await AgentRuntime.run(
        taskId,
        {
          userId: authUser.id,
          organizationId: authUser.organizationId,
          taskId: task.id,
        },
        {
          mode: options?.mode,
          allowedTools: options?.allowedTools,
        }
      );

      return result;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Execution failed";
      await pool.query(
        `UPDATE tasks 
         SET status = 'FAILED', completed_at = NOW(), error_message = ?, updated_at = NOW() 
         WHERE id = ?;`,
        [errorMessage, taskId]
      );

      await this.recordTaskAudit(authUser.id, organizationId, taskId, "TASK_FAILED", {
        error: errorMessage,
      });

      throw err;
    }
  }
}

// Global Singleton
export const taskService = new TaskService();

import crypto from "crypto";
import { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { pool } from "../db/pool";
import { ToolExecutionEnvelope, ToolExecutionRecord } from "../tools/types";

/**
 * Persists a tool execution event durably into MySQL `tool_executions`.
 */
export async function recordToolExecution(
  taskId: string,
  toolName: string,
  inputPayload: Record<string, unknown>,
  result: ToolExecutionEnvelope,
  durationMs: number,
  stepId: string | null = null
): Promise<string> {
  const id = crypto.randomUUID();
  const isError = !result.success;
  const outputPayload = result.success ? JSON.stringify(result.data) : null;
  const errorMessage = isError && result.error ? `${result.error.code}: ${result.error.message}` : null;

  try {
    const query = `
      INSERT INTO tool_executions (
        id, task_id, step_id, tool_name, input_payload, output_payload, duration_ms, is_error, error_message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW());
    `;

    await pool.query<ResultSetHeader>(query, [
      id,
      taskId,
      stepId,
      toolName,
      JSON.stringify(inputPayload),
      outputPayload,
      durationMs,
      isError,
      errorMessage,
    ]);

    return id;
  } catch (error) {
    console.warn("[MySQL Tool Execution Persistence Warning]", error);
    return id;
  }
}

/**
 * Retrieves all tool executions for a specific task.
 */
export async function getToolExecutionsForTask(taskId: string): Promise<ToolExecutionRecord[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, task_id, step_id, tool_name, input_payload, output_payload, duration_ms, is_error, error_message, created_at 
     FROM tool_executions 
     WHERE task_id = ? 
     ORDER BY created_at ASC;`,
    [taskId]
  );

  return rows.map((r) => ({
    id: String(r.id),
    task_id: String(r.task_id),
    step_id: r.step_id ? String(r.step_id) : null,
    tool_name: String(r.tool_name),
    input_payload: typeof r.input_payload === "string" ? JSON.parse(r.input_payload) : r.input_payload,
    output_payload: r.output_payload ? String(r.output_payload) : null,
    duration_ms: Number(r.duration_ms),
    is_error: Boolean(r.is_error),
    error_message: r.error_message ? String(r.error_message) : null,
    created_at: String(r.created_at),
  }));
}

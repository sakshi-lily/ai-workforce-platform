import { Router, Request, Response } from "express";
import { executeAgentTask, getAgentTaskDetails } from "../agent/agentHost";
import { listTasks } from "../services/taskService";
import { AGENT_CONFIG } from "../agent/agentConfig";
import { toolRegistry } from "../tools/registry";
import { getToolExecutionsForTask } from "../services/toolExecutionService";
import { requireAuth } from "../auth/middleware";

export const agentRouter = Router();

/**
 * GET /api/agent/tools
 * Lists registered tools in the platform registry with risk levels.
 */
agentRouter.get("/tools", (_req: Request, res: Response): void => {
  const tools = toolRegistry.listTools();
  res.status(200).json({
    status: "success",
    count: tools.length,
    data: tools,
  });
});

/**
 * POST /api/agent/tasks
 * Submit and execute a bounded task with the Agent (supporting planning and tool calling).
 * Protected: identity and organization context are strictly derived from req.user.
 */
agentRouter.post("/tasks", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { task, title, priority, mode, allowedTools } = req.body;

  // 1. Strict Input Validation
  if (!task || typeof task !== "string" || task.trim().length === 0) {
    res.status(400).json({
      status: "error",
      error: {
        code: "INVALID_TASK_INPUT",
        message: "Field 'task' is required and must be a non-empty string.",
      },
    });
    return;
  }

  const trimmed = task.trim();
  if (trimmed.length < AGENT_CONFIG.MIN_PROMPT_LENGTH) {
    res.status(400).json({
      status: "error",
      error: {
        code: "TASK_TOO_SHORT",
        message: `Task must be at least ${AGENT_CONFIG.MIN_PROMPT_LENGTH} characters.`,
      },
    });
    return;
  }

  if (trimmed.length > AGENT_CONFIG.MAX_PROMPT_LENGTH) {
    res.status(400).json({
      status: "error",
      error: {
        code: "TASK_TOO_LONG",
        message: `Task exceeds maximum length of ${AGENT_CONFIG.MAX_PROMPT_LENGTH} characters.`,
      },
    });
    return;
  }

  try {
    const result = await executeAgentTask({
      task: trimmed,
      title: typeof title === "string" ? title.trim() : undefined,
      priority: priority && ["LOW", "NORMAL", "HIGH", "URGENT"].includes(priority) ? priority : "NORMAL",
      // Host-controlled identity: derived strictly from authenticated user context
      userId: req.user!.id,
      organizationId: req.user!.organizationId,
      mode: mode === "planning" ? "planning" : "tools",
      allowedTools: Array.isArray(allowedTools) ? allowedTools : undefined,
    });

    if (result.status === "FAILED") {
      res.status(422).json({
        status: "failed",
        error: {
          code: "AGENT_EXECUTION_FAILED",
          message: result.error || "Agent execution failed.",
        },
        data: result,
      });
      return;
    }

    res.status(200).json({
      status: "success",
      data: result,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal agent execution error";
    res.status(500).json({
      status: "error",
      error: {
        code: "AGENT_HOST_ERROR",
        message,
      },
    });
  }
});

/**
 * GET /api/agent/tasks
 * Lists recent agent execution tasks for the authenticated organization.
 */
agentRouter.get("/tasks", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 50);

  try {
    const tasks = await listTasks(req.user!.organizationId, limit);
    res.status(200).json({
      status: "success",
      count: tasks.length,
      data: tasks,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list tasks";
    res.status(500).json({
      status: "error",
      error: {
        code: "TASK_LIST_ERROR",
        message,
      },
    });
  }
});

/**
 * GET /api/agent/tasks/:id
 * Retrieves full details of a specific task, enforcing tenant isolation.
 */
agentRouter.get("/tasks/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const details = await getAgentTaskDetails(id, req.user!.organizationId);

    if (!details.task) {
      res.status(404).json({
        status: "error",
        error: {
          code: "TASK_NOT_FOUND",
          message: `No agent task found with ID: ${id}`,
        },
      });
      return;
    }

    const toolExecutions = await getToolExecutionsForTask(id);

    res.status(200).json({
      status: "success",
      data: {
        task: details.task,
        steps: details.steps,
        plan: details.parsedPlan,
        toolExecutions,
        telemetry: details.telemetry,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to retrieve task details";
    res.status(500).json({
      status: "error",
      error: {
        code: "TASK_RETRIEVAL_ERROR",
        message,
      },
    });
  }
});

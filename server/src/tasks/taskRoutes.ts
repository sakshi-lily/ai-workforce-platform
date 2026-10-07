import { Router, Request, Response } from "express";
import { taskService, TaskNotFoundError, TaskAlreadyRunningError } from "./taskService";
import {
  CreateTaskSchema,
  UpdateTaskSchema,
  ListTasksQuerySchema,
} from "./taskSchemas";
import { InvalidTaskStateTransitionError } from "./taskTransitions";
import { requireAuth } from "../auth/middleware";

export const taskRouter = Router();

// Apply requireAuth to all /api/tasks routes
taskRouter.use(requireAuth);

/**
 * POST /api/tasks
 * Creates a new durable task in MySQL with initial status 'REQUESTED'.
 * Host derives identity and organization from trusted JWT authentication.
 */
taskRouter.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = CreateTaskSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        status: "error",
        error: {
          code: "INVALID_TASK_INPUT",
          message: parseResult.error.issues.map((e) => e.message).join("; "),
          details: parseResult.error.flatten(),
        },
      });
      return;
    }

    const createdTask = await taskService.createTask(parseResult.data, req.user!);
    res.status(201).json({
      status: "success",
      data: createdTask,
    });
  } catch (error: any) {
    res.status(500).json({
      status: "error",
      error: {
        code: "TASK_CREATION_FAILED",
        message: error.message || "Failed to create task",
      },
    });
  }
});

/**
 * GET /api/tasks
 * Lists tasks scoped to authenticated organization with bounded pagination and status filtering.
 */
taskRouter.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = ListTasksQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      res.status(400).json({
        status: "error",
        error: {
          code: "INVALID_QUERY_PARAMETERS",
          message: parseResult.error.issues.map((e) => e.message).join("; "),
        },
      });
      return;
    }

    const result = await taskService.listTasks(req.organizationId!, parseResult.data);
    res.status(200).json({
      status: "success",
      data: result.tasks,
      pagination: {
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      status: "error",
      error: {
        code: "TASK_LIST_FAILED",
        message: error.message || "Failed to list tasks",
      },
    });
  }
});

/**
 * GET /api/tasks/:taskId
 * Retrieves full details, steps, tool executions, and telemetry for a specific task.
 * IDOR Protection: Returns 404 TASK_NOT_FOUND if task does not belong to user's organization.
 */
taskRouter.get("/:taskId", async (req: Request, res: Response): Promise<void> => {
  try {
    const taskDetails = await taskService.getTaskById(req.params.taskId, req.organizationId!);
    if (!taskDetails) {
      res.status(404).json({
        status: "error",
        error: {
          code: "TASK_NOT_FOUND",
          message: `Task not found with ID '${req.params.taskId}'.`,
        },
      });
      return;
    }

    res.status(200).json({
      status: "success",
      data: taskDetails,
    });
  } catch (error: any) {
    if (error instanceof TaskNotFoundError) {
      res.status(404).json({
        status: "error",
        error: {
          code: error.code,
          message: error.message,
        },
      });
      return;
    }
    res.status(500).json({
      status: "error",
      error: {
        code: "TASK_FETCH_FAILED",
        message: error.message || "Failed to fetch task details",
      },
    });
  }
});

/**
 * PATCH /api/tasks/:taskId
 * Updates non-lifecycle metadata (title) on an authorized task.
 */
taskRouter.patch("/:taskId", async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = UpdateTaskSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        status: "error",
        error: {
          code: "INVALID_TASK_UPDATE",
          message: parseResult.error.issues.map((e) => e.message).join("; "),
        },
      });
      return;
    }

    const updatedTask = await taskService.updateTask(
      req.params.taskId,
      req.organizationId!,
      parseResult.data,
      req.user!
    );

    res.status(200).json({
      status: "success",
      data: updatedTask,
    });
  } catch (error: any) {
    if (error instanceof TaskNotFoundError) {
      res.status(404).json({
        status: "error",
        error: {
          code: error.code,
          message: error.message,
        },
      });
      return;
    }
    res.status(500).json({
      status: "error",
      error: {
        code: "TASK_UPDATE_FAILED",
        message: error.message || "Failed to update task",
      },
    });
  }
});

/**
 * POST /api/tasks/:taskId/run
 * Executes a task through background workers (Phase 18 HTTP 202 flow) or synchronously if requested.
 * Rejects duplicate execution or invalid state transitions with 409 Conflict.
 */
taskRouter.post("/:taskId/run", async (req: Request, res: Response): Promise<void> => {
  try {
    const { mode, allowedTools, sync } = req.body || {};
    const isSync =
      sync === true ||
      req.query.sync === "true" ||
      req.headers["x-execution-mode"] === "sync";

    if (isSync) {
      // Synchronous execution (Phase 14 backward compatibility)
      const executionResult = await taskService.runTask(
        req.params.taskId,
        req.organizationId!,
        req.user!,
        { mode, allowedTools }
      );

      res.status(200).json({
        status: "success",
        data: executionResult,
      });
      return;
    }

    // Default Phase 18: Asynchronous background worker dispatch (HTTP 202 Accepted)
    const queueResult = await taskService.enqueueTask(
      req.params.taskId,
      req.organizationId!,
      req.user!,
      { mode, allowedTools }
    );

    res.status(202).json({
      status: "success",
      message: "Task accepted and queued for background worker execution.",
      data: queueResult,
    });
  } catch (error: any) {
    if (error instanceof TaskNotFoundError) {
      res.status(404).json({
        status: "error",
        error: {
          code: error.code,
          message: error.message,
        },
      });
      return;
    }
    if (error instanceof TaskAlreadyRunningError) {
      res.status(409).json({
        status: "error",
        error: {
          code: error.code,
          message: error.message,
        },
      });
      return;
    }
    if (error instanceof InvalidTaskStateTransitionError) {
      res.status(409).json({
        status: "error",
        error: {
          code: error.code,
          message: error.message,
        },
      });
      return;
    }
    res.status(500).json({
      status: "error",
      error: {
        code: "TASK_RUN_FAILED",
        message: error.message || "Task execution failed",
      },
    });
  }
});

/**
 * POST /api/tasks/:taskId/cancel
 * Cancels a task in REQUESTED or RUNNING state. Transitions to CANCELLED.
 * Rejects terminal tasks with 409 Conflict.
 */
taskRouter.post("/:taskId/cancel", async (req: Request, res: Response): Promise<void> => {
  try {
    const cancelledTask = await taskService.cancelTask(
      req.params.taskId,
      req.organizationId!,
      req.user!
    );

    res.status(200).json({
      status: "success",
      data: cancelledTask,
    });
  } catch (error: any) {
    if (error instanceof TaskNotFoundError) {
      res.status(404).json({
        status: "error",
        error: {
          code: error.code,
          message: error.message,
        },
      });
      return;
    }
    if (error instanceof InvalidTaskStateTransitionError) {
      res.status(409).json({
        status: "error",
        error: {
          code: error.code,
          message: error.message,
        },
      });
      return;
    }
    res.status(500).json({
      status: "error",
      error: {
        code: "TASK_CANCEL_FAILED",
        message: error.message || "Failed to cancel task",
      },
    });
  }
});

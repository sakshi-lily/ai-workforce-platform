import { z } from "zod";

/**
 * Task Creation Validation Schema
 */
export const CreateTaskInputSchema = z
  .object({
    title: z.string().trim().max(255, "Title cannot exceed 255 characters").optional(),
    goal: z.string().trim().min(3, "Goal must be at least 3 characters").max(3000, "Goal cannot exceed 3000 characters").optional(),
    prompt: z.string().trim().min(3, "Prompt must be at least 3 characters").max(3000, "Prompt cannot exceed 3000 characters").optional(),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
    mode: z.enum(["tools", "planning"]).default("tools"),
    allowedTools: z.array(z.string()).optional(),
  })
  .refine((data) => !!(data.goal || data.prompt), {
    message: "Either 'goal' or 'prompt' is required and must be at least 3 characters.",
    path: ["goal"],
  });

export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>;
export const CreateTaskSchema = CreateTaskInputSchema;

/**
 * Task Update Validation Schema (Restricted to non-lifecycle mutable metadata)
 */
export const UpdateTaskInputSchema = z.object({
  title: z.string().trim().min(1, "Title cannot be empty").max(255, "Title cannot exceed 255 characters").optional(),
});

export type UpdateTaskInput = z.infer<typeof UpdateTaskInputSchema>;
export const UpdateTaskSchema = UpdateTaskInputSchema;

/**
 * Task Listing Query Validation Schema
 */
export const ListTasksQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Math.min(Math.max(parseInt(val, 10) || 20, 1), 100) : 20)),
  offset: z
    .string()
    .optional()
    .transform((val) => (val ? Math.max(parseInt(val, 10) || 0, 0) : 0)),
  status: z.enum(["REQUESTED", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"]).optional(),
});

export type ListTasksQuery = z.infer<typeof ListTasksQuerySchema>;

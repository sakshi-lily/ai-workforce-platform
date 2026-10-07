import { z } from "zod";

/**
 * Phase 13 — User Registration Validation Schema
 *
 * Enforces email validation, server-side password strength rules, and
 * safe organization identity bounds.
 */
export const RegisterInputSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Must be a valid email address")
    .max(255, "Email cannot exceed 255 characters")
    .transform((e) => e.toLowerCase()),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .max(100, "Password cannot exceed 100 characters")
    .regex(
      /^(?=.*[A-Za-z])(?=.*\d)/,
      "Password must contain at least one letter and one number"
    ),
  fullName: z
    .string()
    .trim()
    .min(2, "Full name must be at least 2 characters long")
    .max(100, "Full name cannot exceed 100 characters")
    .optional(),
  organizationName: z
    .string()
    .trim()
    .max(150, "Organization name cannot exceed 150 characters")
    .optional(),
  organizationId: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_-]+$/, "Organization ID must be alphanumeric with hyphens or underscores")
    .max(64, "Organization ID cannot exceed 64 characters")
    .optional(),
});

export type RegisterInput = z.infer<typeof RegisterInputSchema>;

/**
 * Phase 13 — User Login Validation Schema
 */
export const LoginInputSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Must be a valid email address")
    .transform((e) => e.toLowerCase()),
  password: z
    .string()
    .min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof LoginInputSchema>;

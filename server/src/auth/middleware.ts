import { Request, Response, NextFunction } from "express";
import { authService, AuthError } from "./authService";
import { UserRole } from "./types";

/**
 * Extracts Bearer token from the standard Authorization header.
 */
function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.trim().split(" ");
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
    return parts[1];
  }

  return null;
}

/**
 * Phase 13 — Authoritative Authentication Middleware
 *
 * Verifies the presented token and sets trusted server-side identity:
 * - req.user
 * - req.userId
 * - req.organizationId
 *
 * Rejects requests with 401 if token is missing, invalid, or expired.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = extractBearerToken(req);

  if (!token) {
    res.status(401).json({
      status: "error",
      error: {
        code: "UNAUTHENTICATED",
        message: "Authentication required. Please provide a Bearer token in Authorization header.",
      },
    });
    return;
  }

  try {
    const payload = authService.verifyToken(token);
    const user = await authService.getUserById(payload.userId);

    if (!user) {
      res.status(401).json({
        status: "error",
        error: {
          code: "USER_NOT_FOUND",
          message: "Authenticated user account was not found.",
        },
      });
      return;
    }

    // Attach trusted server identity
    req.user = user;
    req.userId = user.id;
    req.organizationId = user.organizationId;

    next();
  } catch (err: unknown) {
    const code = err instanceof AuthError ? err.code : "INVALID_TOKEN";
    const message = err instanceof Error ? err.message : "Invalid authentication token";

    res.status(401).json({
      status: "error",
      error: {
        code,
        message,
      },
    });
  }
}

/**
 * Optional Authentication Middleware
 *
 * Attaches user identity if a valid token is provided, but allows the request
 * to proceed unauthenticated if no token is present.
 */
export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const token = extractBearerToken(req);
  if (!token) {
    return next();
  }

  try {
    const payload = authService.verifyToken(token);
    const user = await authService.getUserById(payload.userId);
    if (user) {
      req.user = user;
      req.userId = user.id;
      req.organizationId = user.organizationId;
    }
  } catch {
    // Silently continue for optional auth
  }

  next();
}

/**
 * Authoritative Role-Based Guard Middleware
 */
export function requireRole(requiredRole: UserRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        status: "error",
        error: {
          code: "UNAUTHENTICATED",
          message: "Authentication required.",
        },
      });
      return;
    }

    if (req.user.role !== requiredRole && req.user.role !== "ADMIN") {
      res.status(403).json({
        status: "error",
        error: {
          code: "FORBIDDEN",
          message: `Access denied. Requires role '${requiredRole}'.`,
        },
      });
      return;
    }

    next();
  };
}

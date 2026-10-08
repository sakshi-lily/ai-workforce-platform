import { Request, Response, NextFunction } from "express";
import { authService, AuthError } from "../auth/authService";
import { OrganizationService } from "./organizationService";
import { Permission, EnterpriseRole, ROLE_PERMISSIONS, OrganizationUser } from "./types";

declare global {
  namespace Express {
    interface Request {
      enterpriseUser?: OrganizationUser;
    }
  }
}

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;

  const parts = authHeader.trim().split(" ");
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
    return parts[1];
  }
  return null;
}

/**
 * Enterprise Authentication Middleware:
 * Validates cryptographic JWT, establishes trusted server-side identity,
 * and synchronizes authoritative organization membership.
 */
export async function requireEnterpriseAuth(
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
        message: "Authentication required. Bearer token missing in Authorization header.",
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
          message: "Authenticated user identity not found in database.",
        },
      });
      return;
    }

    req.user = user;
    req.userId = user.id;
    req.organizationId = user.organizationId;

    // Synchronize into OrganizationService if not already registered
    const defaultRole: EnterpriseRole = user.role === "ADMIN" ? "ADMIN" : "MEMBER";
    const orgUser = await OrganizationService.findOrCreateUser(
      user.id,
      user.email,
      user.fullName,
      user.organizationId,
      defaultRole
    );
    req.enterpriseUser = orgUser;

    next();
  } catch (err: unknown) {
    const code = err instanceof AuthError ? err.code : "INVALID_TOKEN";
    const message = err instanceof Error ? err.message : "Invalid authentication token";

    res.status(401).json({
      status: "error",
      error: { code, message },
    });
  }
}

/**
 * Server-Side Granular Permission Middleware (Section 10, 11).
 * Never relies on client-side claims or roles alone. Authoritatively checks
 * real-time user lifecycle status, organization boundary, and permission matrix.
 */
export function requireEnterprisePermission(permission: Permission) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user || !req.userId || !req.organizationId) {
      res.status(401).json({
        status: "error",
        error: {
          code: "UNAUTHENTICATED",
          message: "Authentication required before permission evaluation.",
        },
      });
      return;
    }

    const orgUser = await OrganizationService.getUser(req.userId);
    if (!orgUser || orgUser.organizationId !== req.organizationId) {
      res.status(403).json({
        status: "error",
        error: {
          code: "TENANT_ACCESS_DENIED",
          message: "User does not belong to the requested organization.",
        },
      });
      return;
    }

    // Check User Lifecycle status (Section 15, 50, 87)
    if (orgUser.status !== "ACTIVE") {
      res.status(403).json({
        status: "error",
        error: {
          code: orgUser.status === "DISABLED" ? "USER_DISABLED" : "USER_SUSPENDED",
          message: `User account is ${orgUser.status}. Operation prohibited.`,
        },
      });
      return;
    }

    // Check Role-to-Permission mapping
    const grantedPermissions = ROLE_PERMISSIONS[orgUser.role] || [];
    if (!grantedPermissions.includes(permission)) {
      res.status(403).json({
        status: "error",
        error: {
          code: "PERMISSION_DENIED",
          message: `Access denied. Role '${orgUser.role}' lacks permission '${permission}'.`,
        },
      });
      return;
    }

    req.enterpriseUser = orgUser;
    next();
  };
}

/**
 * Authoritative Enterprise Role Guard Middleware (Section 8, 9).
 */
export function requireEnterpriseRole(allowedRoles: EnterpriseRole[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user || !req.userId || !req.organizationId) {
      res.status(401).json({
        status: "error",
        error: {
          code: "UNAUTHENTICATED",
          message: "Authentication required before role check.",
        },
      });
      return;
    }

    const orgUser = await OrganizationService.getUser(req.userId);
    if (!orgUser || orgUser.organizationId !== req.organizationId) {
      res.status(403).json({
        status: "error",
        error: {
          code: "TENANT_ACCESS_DENIED",
          message: "User does not belong to the requested organization.",
        },
      });
      return;
    }

    if (orgUser.status !== "ACTIVE") {
      res.status(403).json({
        status: "error",
        error: {
          code: "USER_INACTIVE",
          message: `User account is ${orgUser.status}.`,
        },
      });
      return;
    }

    if (!allowedRoles.includes(orgUser.role)) {
      res.status(403).json({
        status: "error",
        error: {
          code: "FORBIDDEN",
          message: `Access denied. Role must be one of [${allowedRoles.join(", ")}].`,
        },
      });
      return;
    }

    req.enterpriseUser = orgUser;
    next();
  };
}

/**
 * Phase 13 — Authentication Types
 *
 * Establishes typed server-side identity contracts, decoupling authenticated
 * credentials from client-controlled parameters.
 */

export type UserRole = "USER" | "ADMIN";

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  organizationName: string;
  organizationId: string;
  role: UserRole;
  createdAt?: string;
}

export interface JWTPayload {
  userId: string;
  email: string;
  organizationId: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

export interface AuthResult {
  token: string;
  user: AuthenticatedUser;
}

// Augment Express Request so req.user and req.organizationId are typed
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      userId?: string;
      organizationId?: string;
    }
  }
}

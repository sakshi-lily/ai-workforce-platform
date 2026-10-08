import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { RowDataPacket } from "mysql2/promise";
import { pool } from "../db/pool";
import { config } from "../config/env";
import { AuthenticatedUser, JWTPayload, AuthResult } from "./types";
import { RegisterInput, LoginInput } from "./schemas";

export class AuthError extends Error {
  public code: string;
  public statusCode: number;

  constructor(message: string, code: string, statusCode: number = 400) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class DuplicateEmailError extends AuthError {
  constructor(message: string = "An account with this email already exists.") {
    super(message, "EMAIL_ALREADY_EXISTS", 409);
  }
}

export class InvalidCredentialsError extends AuthError {
  constructor(message: string = "Invalid credentials.") {
    super(message, "INVALID_CREDENTIALS", 401);
  }
}

interface InMemUser {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  organizationName: string;
  organizationId: string;
  role: "USER" | "ADMIN";
  createdAt?: string;
}

// Compute standard bcrypt hash for default demo credentials ("password123")
const DEFAULT_DEMO_HASH = bcrypt.hashSync("password123", 10);

const SEEDED_DEMO_USERS: InMemUser[] = [
  {
    id: "usr_phase4_seed_001",
    email: "dev@ai-workforce.local",
    passwordHash: DEFAULT_DEMO_HASH,
    fullName: "Platform Developer",
    organizationName: "AI Workforce Labs",
    organizationId: "org-demo-001",
    role: "ADMIN",
    createdAt: new Date().toISOString(),
  },
  {
    id: "usr_demo_admin_001",
    email: "admin@example.com",
    passwordHash: DEFAULT_DEMO_HASH,
    fullName: "Platform Administrator",
    organizationName: "AI Workforce Labs",
    organizationId: "org-demo-001",
    role: "ADMIN",
    createdAt: new Date().toISOString(),
  },
  {
    id: "usr_demo_tenant_b_002",
    email: "tenant-b@example.com",
    passwordHash: DEFAULT_DEMO_HASH,
    fullName: "Tenant B Member",
    organizationName: "Beta Corp",
    organizationId: "org-demo-002",
    role: "USER",
    createdAt: new Date().toISOString(),
  },
  {
    id: "usr_demo_member_002",
    email: "sarah@apexcloud.io",
    passwordHash: DEFAULT_DEMO_HASH,
    fullName: "Sarah Connor",
    organizationName: "AI Workforce Labs",
    organizationId: "org-demo-001",
    role: "USER",
    createdAt: new Date().toISOString(),
  },
];

// Persistent in-memory user registry for development & offline degradation
const inMemoryUsersByEmail = new Map<string, InMemUser>();
const inMemoryUsersById = new Map<string, InMemUser>();

for (const user of SEEDED_DEMO_USERS) {
  inMemoryUsersByEmail.set(user.email.toLowerCase(), user);
  inMemoryUsersById.set(user.id, user);
}

// Also map admin aliases for robust authorization checks
if (inMemoryUsersById.has("usr_phase4_seed_001") && !inMemoryUsersById.has("usr_demo_admin_001")) {
  inMemoryUsersById.set("usr_demo_admin_001", inMemoryUsersById.get("usr_phase4_seed_001")!);
}

/**
 * Phase 13 — Authoritative Authentication Service
 *
 * Enforces email normalization, secure password hashing, server-side JWT issuance,
 * and tenant isolation context.
 */
export class AuthService {
  /**
   * Normalizes email address consistently (trimmed and lowercased).
   */
  public normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /**
   * Registers a new user and generates an authenticated JWT session.
   */
  public async registerUser(input: RegisterInput): Promise<AuthResult> {
    const normalizedEmail = this.normalizeEmail(input.email);

    // 1. Check for existing user with this email in database if available
    try {
      const [existingRows] = await pool.query<RowDataPacket[]>(
        "SELECT id FROM users WHERE email = ? LIMIT 1;",
        [normalizedEmail]
      );

      if (existingRows.length > 0) {
        throw new DuplicateEmailError();
      }
    } catch (err) {
      if (err instanceof DuplicateEmailError) {
        throw err;
      }
      // Database offline/unreachable: verify against in-memory registry
      if (inMemoryUsersByEmail.has(normalizedEmail)) {
        throw new DuplicateEmailError();
      }
    }

    if (inMemoryUsersByEmail.has(normalizedEmail)) {
      throw new DuplicateEmailError();
    }

    // 2. Hash password securely
    const passwordHash = await bcrypt.hash(input.password, config.auth.saltRounds);

    // 3. Generate internal user ID and organization ID
    const userId = `usr_${crypto.randomUUID()}`;
    const organizationId = input.organizationId || `org_${crypto.randomUUID().slice(0, 8)}`;
    const fullName = input.fullName || normalizedEmail.split("@")[0] || "User";
    const organizationName = input.organizationName || `${fullName}'s Workspace`;
    const role = "USER";

    // 4. Insert into database if available
    try {
      await pool.query(
        `INSERT INTO users (id, email, password_hash, full_name, organization_name, organization_id, role)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
        [
          userId,
          normalizedEmail,
          passwordHash,
          fullName,
          organizationName,
          organizationId,
          role,
        ]
      );
    } catch {
      // Database unavailable: graceful offline in-memory persistence
    }

    // 5. Create safe authenticated user object
    const user: AuthenticatedUser = {
      id: userId,
      email: normalizedEmail,
      fullName,
      organizationName,
      organizationId,
      role,
      createdAt: new Date().toISOString(),
    };

    // Store in in-memory registries
    const memRecord: InMemUser = {
      ...user,
      passwordHash,
    };
    inMemoryUsersByEmail.set(normalizedEmail, memRecord);
    inMemoryUsersById.set(userId, memRecord);

    // 6. Sign JWT
    const token = this.generateToken(user);

    // 7. Audit log (persisted if database is available)
    await this.recordAuditLog(
      userId,
      "USER_REGISTERED",
      {
        email: normalizedEmail,
        organizationId,
      },
      organizationId
    );

    return { token, user };
  }

  /**
   * Authenticates user credentials and generates a signed JWT token.
   */
  public async loginUser(input: LoginInput): Promise<AuthResult> {
    const normalizedEmail = this.normalizeEmail(input.email);
    let dbUser: any = null;

    // 1. Look up user by email from database if connected
    try {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT id, email, password_hash, full_name, organization_name, organization_id, role, created_at
         FROM users
         WHERE email = ?
         LIMIT 1;`,
        [normalizedEmail]
      );

      if (rows.length > 0) {
        dbUser = rows[0];
      }
    } catch {
      // Database offline/unreachable: graceful in-memory fallback
    }

    // Fall back to in-memory registry if not in database
    if (!dbUser) {
      const memUser = inMemoryUsersByEmail.get(normalizedEmail);
      if (memUser) {
        dbUser = {
          id: memUser.id,
          email: memUser.email,
          password_hash: memUser.passwordHash,
          full_name: memUser.fullName,
          organization_name: memUser.organizationName,
          organization_id: memUser.organizationId,
          role: memUser.role,
          created_at: memUser.createdAt,
        };
      }
    }

    if (!dbUser) {
      // Generic failure to prevent user enumeration
      throw new InvalidCredentialsError();
    }

    // 2. Verify password hash
    const passwordMatches = await bcrypt.compare(input.password, dbUser.password_hash);
    if (!passwordMatches) {
      this.recordAuditLog(dbUser.id, "USER_LOGIN_FAILED", { email: normalizedEmail }).catch(() => {});
      throw new InvalidCredentialsError();
    }

    const user: AuthenticatedUser = {
      id: dbUser.id,
      email: dbUser.email,
      fullName: dbUser.full_name,
      organizationName: dbUser.organization_name || "Workspace",
      organizationId: dbUser.organization_id || "org-demo-001",
      role: dbUser.role || "USER",
      createdAt: dbUser.created_at ? new Date(dbUser.created_at).toISOString() : undefined,
    };

    // Ensure session cache contains this user by ID
    if (!inMemoryUsersById.has(user.id)) {
      inMemoryUsersById.set(user.id, {
        id: user.id,
        email: user.email,
        passwordHash: dbUser.password_hash,
        fullName: user.fullName || "User",
        organizationName: user.organizationName,
        organizationId: user.organizationId,
        role: (user.role as "USER" | "ADMIN") || "USER",
        createdAt: user.createdAt || new Date().toISOString(),
      });
    }

    // 3. Sign JWT
    const token = this.generateToken(user);

    // 4. Audit log
    await this.recordAuditLog(
      user.id,
      "USER_LOGIN_SUCCESS",
      {
        organizationId: user.organizationId,
      },
      user.organizationId
    );

    return { token, user };
  }

  /**
   * Generates a signed JWT with standard claims and expiration.
   */
  public generateToken(user: AuthenticatedUser): string {
    const payload: JWTPayload = {
      userId: user.id,
      email: user.email,
      organizationId: user.organizationId,
      role: user.role,
    };

    return jwt.sign(payload, config.auth.jwtSecret, {
      expiresIn: config.auth.jwtExpiresIn,
    } as any);
  }

  /**
   * Verifies and decodes a signed JWT token.
   */
  public verifyToken(token: string): JWTPayload {
    try {
      const decoded = jwt.verify(token, config.auth.jwtSecret);
      return decoded as JWTPayload;
    } catch (err: unknown) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new AuthError("Authentication token has expired.", "TOKEN_EXPIRED", 401);
      }
      throw new AuthError("Invalid authentication token.", "INVALID_TOKEN", 401);
    }
  }

  /**
   * Fetches fresh user record by internal user ID.
   */
  public async getUserById(userId: string): Promise<AuthenticatedUser | null> {
    try {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT id, email, full_name, organization_name, organization_id, role, created_at
         FROM users
         WHERE id = ?
         LIMIT 1;`,
        [userId]
      );

      if (rows.length > 0) {
        const dbUser = rows[0] as any;
        return {
          id: dbUser.id,
          email: dbUser.email,
          fullName: dbUser.full_name,
          organizationName: dbUser.organization_name || "Workspace",
          organizationId: dbUser.organization_id || "org-demo-001",
          role: dbUser.role || "USER",
          createdAt: dbUser.created_at ? new Date(dbUser.created_at).toISOString() : undefined,
        };
      }
    } catch {
      // Database offline/unreachable: graceful in-memory fallback
    }

    const memUser = inMemoryUsersById.get(userId);
    if (memUser) {
      return {
        id: memUser.id,
        email: memUser.email,
        fullName: memUser.fullName,
        organizationName: memUser.organizationName,
        organizationId: memUser.organizationId,
        role: memUser.role,
        createdAt: memUser.createdAt,
      };
    }

    return null;
  }

  /**
   * Records authentication audit event into audit_logs table.
   */
  private async recordAuditLog(
    userId: string | null,
    eventType: string,
    details: Record<string, unknown>,
    organizationId?: string | null
  ): Promise<void> {
    try {
      const id = crypto.randomUUID();
      const orgId = organizationId || (details.organizationId as string) || null;
      await pool.query(
        `INSERT INTO audit_logs (id, user_id, organization_id, event_type, action, details_json)
         VALUES (?, ?, ?, ?, ?, ?);`,
        [id, userId, orgId, eventType, eventType, JSON.stringify(details)]
      );
    } catch {
      // Non-critical audit failure
    }
  }
}

// Global Singleton
export const authService = new AuthService();

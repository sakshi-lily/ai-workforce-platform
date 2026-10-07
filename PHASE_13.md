# AI Workforce Platform — Phase 13: Authentication

**Project:** AI Workforce Platform  
**Phase:** 13 — Authentication  
**Status:** COMPLETED ✅  
**Previous Phase:** Phase 12 — RAG  
**Next Phase:** Phase 14 — Task Management  

---

## 1. Executive Summary

Phase 13 establishes **authoritative user identity and authentication** across the AI Workforce Platform.

Prior to Phase 13, tenant-aware mechanisms existed in the backend, but identity was assumed or passed via developmental placeholders. Phase 13 introduces a cryptographic, server-verified security boundary:
- **Server-Decided Identity:** The browser presents credentials; the server cryptographically verifies them and issues signed JSON Web Tokens (JWT).
- **Host-Controlled Execution Context:** Agent executions, tool invocations, MySQL queries, and Qdrant vector retrieval receive identity directly from the authenticated server context (`req.user.id`, `req.user.organizationId`).
- **Complete Anti-Spoofing Defense:** Any client-supplied `userId` or `organizationId` in request bodies or query parameters is strictly ignored.
- **Tenant Isolation & Anti-IDOR:** Redis cache keys, customer CRM records, and agent task records are strictly partitioned by `organizationId`. Possessing a resource ID (e.g. task ID or customer domain) does not grant cross-tenant access.
- **Audit Logging:** Sensitive actions (`USER_REGISTERED`, `USER_LOGIN_SUCCESS`, `USER_LOGIN_FAILED`) are persistently recorded in `audit_logs` with actor and tenant identifiers.

---

## 2. Master Roadmap Position

```text
MVP
────────────────────────────────────────────
Phase 1   Requirements & Architecture       ✅
Phase 2   Development Environment           ✅
Phase 3   Basic MERN Application            ✅
Phase 4   MySQL                             ✅
Phase 5   Redis                             ✅
Phase 6   AI Integration                    ✅
Phase 7   Simple Agent                      ✅
Phase 8   Tools                             ✅
Phase 9   Web Search                        ✅
Phase 10  Verification / MySQL              ✅

INTERMEDIATE
────────────────────────────────────────────
Phase 11  Vector Database / Qdrant          ✅
Phase 12  RAG                               ✅
Phase 13  Authentication                    ✅ COMPLETED
Phase 14  Task Management                   ← NEXT
Phase 15  Advanced Agent Architecture
Phase 16  Gmail

ADVANCED
────────────────────────────────────────────
Phase 17  Human Approval
Phase 18  Background Workers
Phase 19  Reliability
Phase 20  Security
Phase 21  Docker
Phase 22  AWS
Phase 23  CI/CD
```

---

## 3. The Core Architectural Invariant

> **The client may present credentials, but the server decides identity.**  
> **The LLM never becomes the authority for identity, tenancy, or access.**

```text
┌─────────────────────────────────────┐
│          UNTRUSTED INPUT            │
│  - Browser Request Body             │
│  - Query Parameters                 │
│  - LLM Reasoning Output             │
│  - Tool Proposed Arguments          │
└──────────────────┬──────────────────┘
                   │
                   ▼
┌─────────────────────────────────────┐
│       TRUSTED APPLICATION           │
│  - Server-Validated Authentication  │
│  - Cryptographic JWT Verification   │
│  - req.user & req.organizationId    │
│  - Host Context Injection           │
│  - Scoped MySQL & Redis Operations  │
│  - Tenant-Filtered Vector Retrieval │
└─────────────────────────────────────┘
```

---

## 4. Authentication Architecture & Strategy

### 4.1 Strategy Selection: Signed JWT with Bearer Header
- **Token Mechanism:** HMAC-SHA256 signed JSON Web Tokens (`jsonwebtoken`).
- **Secret Management:** Kept strictly server-side via `JWT_SECRET` in environment variables.
- **Expiration:** Configurable (default `7d`).
- **Payload Claims:**
  ```typescript
  export interface JWTPayload {
    userId: string;
    email: string;
    organizationId: string;
    role: "USER" | "ADMIN";
    iat?: number;
    exp?: number;
  }
  ```
- **Transmission:** Standard `Authorization: Bearer <token>` header across all API requests.

### 4.2 Credential Handling
- **Password Hashing:** `bcryptjs` with salt rounds (10). Raw passwords are never stored, logged, or returned in API responses.
- **Password Policy:** Server-enforced via Zod (`>= 8` characters, containing at least one letter and one number).
- **Email Normalization:** Consistently trimmed and converted to lowercase before database lookup or hashing (`email.trim().toLowerCase()`).
- **Safe Conflict Handling:** Duplicate email registration responds with `409 Conflict` (`EMAIL_ALREADY_EXISTS`) without exposing schema internals.
- **Generic Failure on Login:** Invalid email or incorrect password returns a generic `401 Unauthorized` (`INVALID_CREDENTIALS`, `"Invalid credentials."`) preventing user enumeration attacks.

---

## 5. Endpoints Implemented

| Method | Endpoint | Protection | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Validates email, enforces password policy, hashes credentials, creates user, issues JWT |
| `POST` | `/api/auth/login` | Public | Verifies email & password against stored hash, logs audit event, issues JWT |
| `GET` | `/api/auth/me` | Protected (`requireAuth`) | Validates Bearer token, fetches fresh user identity from MySQL, restores session |
| `POST` | `/api/auth/logout` | Public | Acknowledges client credential disposal |

---

## 6. Request Context & Middleware

### 6.1 `requireAuth` Middleware
Located in [`server/src/auth/middleware.ts`](file:///c:/Users/user/Downloads/files/ai-workforce-platform/server/src/auth/middleware.ts):
1. Extracts Bearer token from `Authorization` header. Rejects with `401 UNAUTHENTICATED` if absent.
2. Cryptographically verifies signature and expiration via `authService.verifyToken(token)`. Rejects with `401 INVALID_TOKEN` or `401 TOKEN_EXPIRED`.
3. Loads authoritative user record from MySQL via `authService.getUserById(payload.userId)`.
4. Attaches trusted identity directly to Express Request:
   ```typescript
   req.user = user;
   req.userId = user.id;
   req.organizationId = user.organizationId;
   ```
5. Passes execution to downstream route handlers.

### 6.2 Host-Controlled Context Propagation
Downstream components consume trusted server identity without accepting client overrides:
- **Customers API (`customerRoutes.ts`):** Scoped strictly to `req.user.organizationId`. Client-sent `userId` or `organizationId` in POST body is overwritten by server context.
- **Agent Host (`agentRoutes.ts`):** `executeAgentTask` receives `userId: req.user.id` and `organizationId: req.user.organizationId`.
- **RAG Query (`ragRoutes.ts`):** `ragService.query` strictly injects `organizationId: req.user.organizationId` into the Qdrant filter.
- **Tools (`toolRegistry.ts`):** Governed tools receive `ToolExecutionContext` populated by host.

---

## 7. Database & Cache Scoping

### 7.1 Database Schema Additions
- **`users` Table:**
  - `id`: `VARCHAR(64) PRIMARY KEY`
  - `organization_id`: `VARCHAR(64) NOT NULL DEFAULT 'org-demo-001'`
  - `role`: `ENUM('USER', 'ADMIN') NOT NULL DEFAULT 'USER'`
  - `INDEX idx_users_org (organization_id)`
- **`customers` Table:**
  - `organization_id`: `VARCHAR(64) NOT NULL DEFAULT 'org-demo-001'`
  - `INDEX idx_customers_org (organization_id)`
- **`audit_logs` Table:**
  - `organization_id`: `VARCHAR(64) NULL`
  - `action`: `VARCHAR(100) NULL`
  - `INDEX idx_audit_org (organization_id)`

### 7.2 Redis Cache Tenant Partitioning
Cache keys are strictly namespaced by tenant:
- Customer list: `customers:${organizationId}:list:limit:${safeLimit}`
- Customer domain lookup: `customers:${organizationId}:domain:${normalizedDomain}`
- Cache invalidation on mutation: `customers:${organizationId}:*`

This guarantees zero cross-tenant cache pollution or data leakage.

---

## 8. Frontend React Authentication

Implemented in [`client/src/auth/AuthContext.tsx`](file:///c:/Users/user/Downloads/files/ai-workforce-platform/client/src/auth/AuthContext.tsx) and [`client/src/App.tsx`](file:///c:/Users/user/Downloads/files/ai-workforce-platform/client/src/App.tsx):
- **`AuthProvider` State Machine:** `CHECKING` $\rightarrow$ `AUTHENTICATED` or `UNAUTHENTICATED`.
- **Session Restoration:** On mount/refresh, `useEffect` checks `localStorage.getItem('awp_auth_token')` and calls `GET /api/auth/me`. If valid, session is restored seamlessly without flicker; if invalid/expired, token is purged safely.
- **`authFetch` Helper:** Centralized wrapper automatically injects `Authorization: Bearer <token>` and handles global 401 expiration responses.
- **Identity & Access Boundary UI:** Displays authenticated user details (`email`, `role`, `organizationId`), sign-out button, quick tenant switcher, and forms for signing in or registering new tenants.

---

## 9. Verification & Test Suite

The comprehensive Phase 13 test suite in [`server/src/auth/testPhase13.ts`](file:///c:/Users/user/Downloads/files/ai-workforce-platform/server/src/auth/testPhase13.ts) was executed against live MySQL, Redis, and Qdrant instances:

```text
==================================================================
   AI Workforce Platform — Phase 13: Authentication Test Suite   
==================================================================

--- Category 1: Registration & Validation ---
  [PASS] Registers valid user with custom tenant organization
  [PASS] Normalizes email (case-insensitive deduplication)
  [PASS] Rejects invalid email format with 400
  [PASS] Rejects weak password (<8 characters)
  [PASS] Rejects password without letters or numbers
  [PASS] Registers second tenant user (Tenant B)

--- Category 2: Login & Credential Verification ---
  [PASS] Authenticates seeded admin user (dev@ai-workforce.local)
  [PASS] Authenticates registered user with normalized email
  [PASS] Rejects incorrect password with generic 401 error
  [PASS] Rejects non-existent email with generic 401 error

--- Category 3: Session Verification & /api/auth/me ---
  [PASS] Returns authenticated identity when valid token provided
  [PASS] Rejects request without Authorization header with 401
  [PASS] Rejects malformed or tampered token with 401
  [PASS] Rejects token signed with wrong secret with 401

--- Category 4: Protection Boundaries & Anti-Spoofing ---
  [PASS] Blocks unauthenticated access to /api/customers with 401
  [PASS] Blocks unauthenticated access to /api/agent/tasks with 401
  [PASS] Blocks unauthenticated access to /api/rag/query with 401
  [PASS] Server ignores client-supplied userId in request body

--- Category 5: Multi-Tenant Data Isolation & IDOR Protection ---
  [PASS] Creates customer in Tenant A scope
  [PASS] Tenant B cannot see Tenant A's customer in customer list
  [PASS] Tenant B lookup cannot retrieve Tenant A's customer by domain
  [PASS] Tenant B cannot view Tenant A's agent task details

--- Category 6: Redis Cache Scoping & Tenant Isolation ---
  [PASS] Redis cache keys contain organizationId namespace

--- Category 7: Audit Trail Persistence ---
  [PASS] Records USER_REGISTERED and USER_LOGIN_SUCCESS in audit_logs

--- Category 8: Backward Compatibility & Regression ---
  [PASS] Public health checks remain functional
  [PASS] Tool registry functions with host-provided context

==================================================================
   Phase 13 Verification Complete: 26/26 Tests Passed
   Overall Status: SUCCESS (ALL PASSED)
==================================================================
```

---

## 10. Concept Mastery Checklist

1. **What is authentication?**  
   Proving who the requester is through verified credentials.
2. **What is authorization?**  
   Determining what the authenticated identity is permitted to access or execute.
3. **Why can't the client send `userId` as proof of identity?**  
   Because the client is untrusted and can spoof or tamper with arbitrary IDs.
4. **Where should identity be established?**  
   At the server authentication boundary via cryptographic verification (`requireAuth`).
5. **Who controls `organizationId` during protected execution?**  
   The authenticated server request context, strictly derived from `req.user.organizationId`.
6. **Can the LLM choose the user's identity or tenant?**  
   No. The host injects context; the LLM only proposes reasoning.
7. **Why is `/api/auth/me` useful?**  
   It restores and validates the active session upon page refresh without storing sensitive passwords.
8. **Why must Redis caches be reviewed?**  
   To ensure cache keys are prefixed with `organizationId` so data is not leaked across tenants.
9. **Does frontend route protection provide security?**  
   No. Frontend route protection is merely a user-experience layer; the backend API is the real security boundary.
10. **What comes next?**  
    Phase 14: Task Management (making work a durable, first-class tracked entity).

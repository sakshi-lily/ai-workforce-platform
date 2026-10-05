# AI Workforce Platform

# Phase 4 — MySQL Database Integration

## Status

**Phase:** Phase 4 — MySQL Database Integration  
**Status:** COMPLETED  
**Previous Phase:** Phase 3 — Basic React + Express Application — COMPLETED  
**Current Goal:** Connect the Express backend to MySQL and establish the first reliable database-backed application flow — ACHIEVED  
**Next Phase:** Phase 5 — Redis

---

# 1. Purpose of Phase 4

The purpose of Phase 4 is to introduce persistent structured data into the AI Workforce Platform.

Until Phase 3, the application follows:

```text
React
  ↓
HTTP
  ↓
Express
  ↓
JSON Response
```

After Phase 4, the architecture becomes:

```text
React
  ↓
HTTP
  ↓
Express
  ↓
Application Service
  ↓
MySQL
  ↓
Persistent Data
```

This phase teaches how the application communicates with a relational database.

---

# 2. Why MySQL Is Required

The AI Workforce Platform needs to remember structured business information.

Examples:

```text
Users
Tasks
Task Steps
Customers
Tool Executions
Approvals
Audit Logs
```

This information has relationships and rules.

For example:

```text
User
  ↓
creates
  ↓
Task
  ↓
contains
  ↓
Task Steps
```

Another example:

```text
Task
  ↓
produces
  ↓
Tool Executions
```

A relational database is well suited to this type of structured information.

---

# 3. What MySQL Is Responsible For

MySQL will be the source of truth for structured application data.

It will eventually store:

- User/workspace information
- Task records
- Task execution state
- Task steps
- Customer records
- Tool execution records
- Approval records
- Audit records
- Token/cost metrics

MySQL should provide:

- Persistence
- Relationships
- Constraints
- Transactions
- Querying
- Indexing
- Data integrity

---

# 4. What MySQL Is NOT Responsible For

MySQL will not replace every other storage technology.

We will use different systems for different purposes.

```text
MySQL
→ Structured business data

Redis
→ Cache / temporary state / queues

Qdrant
→ Semantic vector retrieval

Object/File storage
→ Large documents/files where appropriate
```

This separation is important.

---

# 5. Current MySQL Environment

Phase 2 verified:

```text
MySQL Server: 8.4.9
Host: 127.0.0.1
Port: 3306
Status: Running
```

The server has already been verified independently.

Phase 4 will now verify application-level connectivity.

---

# 6. Existing Database Design

The database architecture was already designed during Phase 1.

Primary schema documentation:

```text
docs/DATABASE_SCHEMA.md
```

DDL:

```text
docs/schema.sql
```

The schema contains seven core tables:

```text
users
tasks
task_steps
customers
tool_executions
approvals
audit_logs
```

We will use this design rather than creating an unrelated database structure.

---

# 7. Important Principle

There are two different things:

```text
MySQL Server
```

and:

```text
Application Database
```

The MySQL server is the database engine.

The application database is where this project's tables live.

Conceptually:

```text
MySQL Server
    │
    ├── information_schema
    ├── mysql
    ├── performance_schema
    └── ai_workforce
             │
             ├── users
             ├── tasks
             ├── task_steps
             ├── customers
             ├── tool_executions
             ├── approvals
             └── audit_logs
```

---

# 8. Phase 4 Learning Objectives

By the end of this phase, I should understand:

## MySQL Fundamentals

- Database
- Schema
- Table
- Row
- Column
- Primary key
- Foreign key
- Unique constraint
- Index
- NULL
- Default values
- Data types

## SQL

Understand:

```sql
SELECT
INSERT
UPDATE
DELETE
CREATE
ALTER
```

## Relationships

Understand:

```text
One-to-one
One-to-many
Many-to-many
```

The project's most important relationships are primarily one-to-many.

Example:

```text
User
  │
  └──< Tasks
```

---

# 9. Milestone 4.1 — Verify MySQL and Create Application Database

## Objective

Create a dedicated development database for the project.

We should NOT use a generic database such as:

```text
test
database
mydb
```

Use a project-specific name: `ai_workforce`.

---

# 10. Milestone 4.2 — Apply the Existing Schema

Use:

```text
docs/schema.sql
```

to create the application's tables.

Before execution:

- Inspect the file
- Understand what tables it creates
- Understand primary keys
- Understand foreign keys
- Understand important indexes
- Understand constraints

---

# 11. Schema Verification

After applying the schema, verify:

```text
users
tasks
task_steps
customers
tool_executions
approvals
audit_logs
```

exist in the `ai_workforce` database.

---

# 12. Milestone 4.3 — Backend Database Dependency & Environment Configuration

Introduce a MySQL client library (`mysql2`) and environment configuration (`dotenv`) for Node.js.

The database layer should be separated from Express route definitions.

```text
server/
│
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── config/
│   │   └── env.ts
│   ├── db/
│   │   └── pool.ts
│   ├── routes/
│   │   ├── health.ts
│   │   └── customers.ts
│   └── services/
│       └── customerService.ts
├── .env.example
├── .env (git-ignored)
├── package.json
└── tsconfig.json
```

---

# 13. Milestone 4.4 — Database Health Endpoint

Add a database-specific health check:

```text
GET /api/health/db
```

Returns:

```json
{
  "status": "ok",
  "database": "connected"
}
```

---

# 14. Milestone 4.5 — First Real Application Data & Parameterized Queries

Implement:

```text
GET /api/customers
```

and query customers by domain using parameterized queries:

```sql
SELECT * FROM customers WHERE domain = ?;
```

---

# 15. Milestone 4.6 — Connect React to Express & MySQL

The React UI should allow:
- Checking backend health (`GET /api/health`)
- Checking database health (`GET /api/health/db`)
- Querying and viewing customer data from `ai_workforce.customers`

---

# 16. Phase 4 Completion Checklist

## MySQL

- [x] MySQL 8.4 verified (`mysqld 8.4.9` running on port 3306)
- [x] Application database `ai_workforce` created (`utf8mb4_unicode_ci`)
- [x] Existing schema reviewed (`docs/DATABASE_SCHEMA.md` & `docs/schema.sql`)
- [x] `docs/schema.sql` executed against `ai_workforce`
- [x] Seven core tables verified: `users`, `tasks`, `task_steps`, `customers`, `tool_executions`, `approvals`, `audit_logs`
- [x] Foreign keys verified (`tasks_ibfk_1`, `task_steps_ibfk_1`, `customers_ibfk_1`, etc.)
- [x] Important indexes verified (`idx_users_email`, `uk_user_domain`, `idx_customers_lookup`)

## Backend

- [x] MySQL driver (`mysql2`) and `dotenv` installed in `server/package.json`
- [x] Environment configuration created with `dotenv` (`server/src/config/env.ts`)
- [x] `.env` protected by `.gitignore` (verified `.env` is ignored by Git, `.env.example` provided)
- [x] Database module created (`server/src/db/pool.ts`)
- [x] Connection pool created with conservative concurrency limits (`connectionLimit: 10`)
- [x] Connection successfully established on startup
- [x] `SELECT 1` verified in `checkDatabaseHealth()`
- [x] Database health endpoint works (`GET /api/health/db` returns HTTP 200 with DB status)
- [x] Database error handling works (internal SQL stack traces prevented from leaking, HTTP 500/503 returned safely)

## Application

- [x] First real MySQL query works (`GET /api/customers`)
- [x] Parameterized query demonstrated (`GET /api/customers/lookup?domain=?`, SQL injection neutralized)
- [x] Parameterized insert demonstrated (`POST /api/customers` with unique constraint enforcement)
- [x] React can request database-backed data (React calls `/api/health/db` and `/api/customers`)
- [x] React displays database-backed result in rich interactive table with latency and score metrics

## Security

- [x] No credentials committed (credentials isolated in git-ignored `.env`)
- [x] No root credentials hardcoded in application source
- [x] SQL queries strictly parameterized with `?` bindings
- [x] External input validated at the controller/service boundary
- [x] Raw database errors logged server-side and masked from HTTP clients

## Git

- [x] Changes committed with clear semantic messages
- [x] Changes pushed to GitHub `origin main`
- [x] Working tree clean
- [x] Phase 4 documented with execution logs

---

### Verification Summary & Command Evidence

#### 1. Database Creation & Schema Verification
- **Command:** `SHOW TABLES IN ai_workforce;`
- **Output:**
  ```text
  Tables_in_ai_workforce
  approvals
  audit_logs
  customers
  task_steps
  tasks
  tool_executions
  users
  ```

#### 2. Database Health Endpoint
- **Command:** `curl.exe -i http://localhost:3000/api/health/db`
- **Output:**
  ```http
  HTTP/1.1 200 OK
  Content-Type: application/json; charset=utf-8

  {"status":"ok","database":"connected","databaseName":"ai_workforce","serverVersion":"8.4.9"}
  ```

#### 3. Real Table Query (Customers)
- **Command:** `curl.exe -i http://localhost:3000/api/customers`
- **Output:** Returns HTTP 200 with JSON array of customers from `ai_workforce.customers`.

#### 4. Parameterized Query & SQL Injection Safety
- **Safe Query:** `curl.exe -i "http://localhost:3000/api/customers/lookup?domain=apexcloud.io"` $\rightarrow$ HTTP 200 OK with customer record.
- **SQL Injection Attempt:** `curl.exe -i "http://localhost:3000/api/customers/lookup?domain=%27%20OR%201%3D1%20--"` $\rightarrow$ HTTP 404 Not Found (neutralized without SQL execution failure).

#### 5. Unique Key Constraint Enforcement
- Duplicate insert of existing domain returns HTTP 409 Conflict:
  ```json
  {"status":"conflict","message":"A customer with this domain already exists in this workspace."}
  ```

---

# 17. Project Roadmap

```text
PHASE 1 — REQUIREMENTS & ARCHITECTURE
████████████████████ COMPLETED

PHASE 2 — LOCAL DEVELOPMENT ENVIRONMENT
████████████████████ COMPLETED

PHASE 3 — BASIC REACT + EXPRESS
████████████████████ COMPLETED

PHASE 4 — MYSQL DATABASE INTEGRATION
████████████████████ COMPLETED

  [x] 4.1 Verify MySQL + create application database
  [x] 4.2 Review existing schema
  [x] 4.3 Apply docs/schema.sql
  [x] 4.4 Verify all tables
  [x] 4.5 Add Node MySQL driver
  [x] 4.6 Configure environment variables
  [x] 4.7 Create connection pool
  [x] 4.8 Verify SELECT 1
  [x] 4.9 Create database health endpoint
  [x] 4.10 Execute first real query
  [x] 4.11 Demonstrate parameterized query
  [x] 4.12 Connect React to database-backed API
  [x] 4.13 Verify error handling
  [x] 4.14 Commit + push + documentation

PHASE 5 — REDIS
▶ NEXT PHASE
░░░░░░░░░░░░░░░░░░░░
```

---

# Phase 4 Golden Rule

Do not treat MySQL as simply:

> "A place where I run SQL."

Understand it as a **reliable structured data layer with relationships, constraints, transactions, indexes, and controlled access**.

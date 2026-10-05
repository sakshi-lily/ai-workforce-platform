# AI Workforce Platform

# Phase 5 — Redis Integration

## Status

**Phase:** Phase 5 — Redis Integration  
**Status:** COMPLETED  
**Previous Phase:** Phase 4 — MySQL Database Integration — COMPLETED  
**Current Goal:** Introduce Redis for fast temporary data and caching — ACHIEVED  
**Next Phase:** Phase 6 — AI / LLM Integration

---

# 1. Purpose of Phase 5

The purpose of Phase 5 is to introduce Redis into the AI Workforce Platform and understand where Redis belongs in the architecture.

The current application architecture is:

```text
React
  ↓
Express
  ↓
Service Layer
  ↓
MySQL
  ↓
Persistent Data
```

After Phase 5, the architecture will support:

```text
React
  ↓
Express
  ↓
Service Layer
  ↓
Redis Cache
  │
  ├── Cache HIT → Return cached data
  │
  └── Cache MISS → MySQL → Redis → Return data
```

The first Redis use case will be **caching**.

Redis queues and background workers are intentionally deferred.

---

# 2. Why Redis Is Needed

MySQL is the durable source of truth for structured business data.

However, some data is requested frequently and does not need to be calculated or fetched from MySQL every time.

Example:

```text
GET /api/customers
```

Suppose 100 users request the same customer list repeatedly.

Without caching:

```text
Request
  ↓
Express
  ↓
MySQL
  ↓
Query
  ↓
Response
```

Every request reaches MySQL.

With caching:

```text
Request
  ↓
Express
  ↓
Redis
  ↓
Cache HIT
  ↓
Response
```

This can reduce database load and improve response latency.

---

# 3. MySQL vs Redis

Understanding this distinction is one of the most important goals of Phase 5.

## MySQL

MySQL is primarily used for:

```text
Durable structured data
Relationships
Constraints
Transactions
Long-term persistence
```

Example:

```text
Customer
Task
User
Approval
Audit Log
```

---

## Redis

Redis is primarily useful for:

```text
Very fast temporary data
Caching
Short-lived state
Counters
Rate limiting
Queues
Job coordination
```

Example:

```text
Customer list cache
Session-related temporary data
Rate-limit counters
Job queue data
```

---

# 4. Golden Rule

Redis should NOT replace MySQL as the application's source of truth.

Correct:

```text
                 ┌────────────┐
                 │   Redis    │
                 │   Cache    │
                 └─────▲──────┘
                       │
                       │
React → Express ───────┤
                       │
                       ▼
                 ┌────────────┐
                 │   MySQL    │
                 │ Source of  │
                 │   Truth    │
                 └────────────┘
```

MySQL remains authoritative.

Redis contains a temporary/cached representation of information.

---

# 5. Phase 5 Scope

This phase will cover:

- Redis installation/verification
- Redis concepts
- Node.js Redis client
- Redis connection
- Keys and values
- TTL
- Cache-aside pattern
- Customer list caching
- Cache invalidation
- Cache failure handling
- Basic Redis monitoring/verification

---

# 6. Explicitly Out of Scope

Do NOT implement these during Phase 5:

```text
❌ Background workers
❌ Job queues
❌ BullMQ
❌ Agent orchestration
❌ AI agents
❌ LLM integration
❌ Qdrant
❌ RAG
❌ Gmail
❌ AWS
❌ Docker production deployment
```

Redis queues will be introduced later when background execution becomes necessary.

---

# 7. Target Architecture

The Phase 5 architecture:

```text
┌──────────────────────┐
│     React Client     │
└──────────┬───────────┘
           │
           │ HTTP
           ▼
┌──────────────────────┐
│    Express API       │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│    Service Layer     │
└──────────┬───────────┘
           │
           ▼
     ┌─────────────┐
     │    Redis    │
     │    Cache    │
     └──────┬──────┘
            │
       Cache HIT?
        /      \
      YES       NO
       │         │
       │         ▼
       │     ┌─────────┐
       │     │  MySQL  │
       │     └────┬────┘
       │          │
       │          ▼
       │      Store Cache
       │          │
       └──────────┘
            │
            ▼
       HTTP Response
```

---

# 8. Redis Data Model

Redis primarily uses a key-value model.

Conceptually:

```text
KEY                         VALUE

customers:list              [customer data...]

customer:domain:example.com customer data

rate_limit:user:123         counter
```

The key should be designed carefully.

A useful key naming strategy is:

```text
<resource>:<operation>:<identifier>
```

Example:

```text
customers:list
customers:domain:example.com
```

---

# 9. TTL — Time To Live

Cached data should usually have an expiration time.

Example:

```text
customers:list
TTL = 60 seconds
```

After the TTL expires:

```text
Redis
  ↓
Key expired
  ↓
Cache MISS
  ↓
MySQL
  ↓
Fresh data
  ↓
Redis
```

TTL prevents stale cache entries from living forever.

---

# 10. Why TTL Matters

Without expiration:

```text
MySQL
   ↓
Data changes
   ↓
Redis still has old data
   ↓
Users receive stale information
```

TTL provides automatic expiration.

However:

> TTL alone does not solve all cache consistency problems.

We also need explicit cache invalidation when data changes.

---

# 11. Cache-Aside Pattern

The first caching strategy will be **cache-aside**.

The application controls when data is read from and written to the cache.

## Read

```text
Request
  ↓
Check Redis
  ↓
Is data cached?
 ┌───────┴───────┐
YES             NO
 │                │
 ▼                ▼
Return          MySQL
                 │
                 ▼
               Redis
                 │
                 ▼
               Return
```

---

# 12. Cache HIT

A cache hit occurs when the requested data exists in Redis.

Example:

```text
GET /api/customers
        ↓
Redis
        ↓
customers:list exists
        ↓
Return cached data
```

MySQL does not need to be queried.

---

# 13. Cache MISS

A cache miss occurs when the requested data does not exist in Redis.

Example:

```text
GET /api/customers
        ↓
Redis
        ↓
No customers:list
        ↓
MySQL
        ↓
Fetch customers
        ↓
Redis SET
        ↓
Return customers
```

---

# 14. Milestone 5.1 — Redis Installation

## Objective

Install Redis locally or use an appropriate Windows-compatible Redis setup.

The exact installation method should be selected based on the local development environment.

Before installation:

- Determine whether Redis is already installed.
- Determine whether a Redis server is already running.
- Do not install multiple Redis servers unnecessarily.

---

# 15. Milestone 5.2 — Redis Server Verification

Verify that Redis is running.

The expected development setup is conceptually:

```text
Redis Server
Host: 127.0.0.1
Port: 6379
```

The exact port should be confirmed rather than assumed.

Verification must establish:

```text
Redis process
     ↓
Port accessible
     ↓
Redis responds
```

---

# 16. Milestone 5.3 — Redis CLI Verification

Use the available Redis CLI or another appropriate local verification method.

The fundamental test is:

```text
PING
```

Expected response:

```text
PONG
```

This proves that the Redis server is responding.

---

# 17. Milestone 5.4 — Learn Redis Basic Operations

Understand the basic concepts:

```text
SET
GET
DEL
EXPIRE
TTL
```

Conceptually:

```text
SET key value
GET key
EXPIRE key seconds
TTL key
DEL key
```

The goal is understanding the data lifecycle, not memorizing commands.

---

# 18. Milestone 5.5 — Add Node.js Redis Client

The Express backend needs a Redis client library.

Architecture:

```text
Express
   ↓
Redis Client
   ↓
Redis Server
```

The Redis client should be isolated in a dedicated backend module.

Conceptually:

```text
server/src/
    config/
    db/
    cache/
    routes/
    services/
```

Do not create unnecessary abstractions.

---

# 19. Milestone 5.6 — Redis Environment Configuration

Redis connection configuration should use environment variables.

Conceptually:

```text
REDIS_HOST
REDIS_PORT
```

Potentially later:

```text
REDIS_PASSWORD
REDIS_URL
```

depending on deployment architecture.

Local credentials/configuration should remain outside committed source code.

---

# 20. Milestone 5.7 — Redis Connection

Create a reusable Redis connection/client.

Conceptually:

```text
Express
   ↓
Redis Client Module
   ↓
Redis Server
```

The application should not create a new Redis client for every HTTP request.

---

# 21. Redis Connection Failure

Redis is an optimization layer in this phase.

This leads to an important architectural decision:

> What should happen if Redis becomes unavailable?

For customer reads, the application should be able to fall back to MySQL where appropriate.

Conceptually:

```text
Request
 ↓
Redis unavailable
 ↓
MySQL
 ↓
Return data
```

The application should not necessarily become completely unusable just because the cache is down.

---

# 22. Cache Failure Principle

For this use case:

```text
MySQL = required
Redis = optimization
```

Therefore:

```text
MySQL failure
→ serious application failure

Redis failure
→ cache degradation
→ continue using MySQL where safe
```

This is an important reliability principle.

Later, Redis queues will have different failure semantics.

---

# 23. Milestone 5.8 — Cache Customer List

Use the existing customer API:

```text
GET /api/customers
```

Current flow:

```text
React
 ↓
Express
 ↓
MySQL
 ↓
Customers
```

New flow:

```text
React
 ↓
Express
 ↓
Redis
 ↓
MySQL if cache MISS
 ↓
Redis SET
 ↓
Response
```

---

# 24. Cache Key

Use a clear cache key.

Example:

```text
customers:list
```

If the endpoint supports different filters or limits, the cache key must include those parameters.

For example:

```text
customers:list:limit:20
```

The exact strategy should match the API contract.

Do not accidentally return cached data for a different query.

---

# 25. Cache Serialization

Redis values may need to be serialized.

For example:

```text
JavaScript Object
       ↓
JSON.stringify()
       ↓
Redis string
```

When reading:

```text
Redis string
       ↓
JSON.parse()
       ↓
JavaScript Object
```

The implementation should handle invalid/corrupted cached values safely.

---

# 26. Milestone 5.9 — Measure Cache Behavior

The application should demonstrate:

### First request

```text
Cache MISS
 ↓
MySQL
 ↓
Redis
 ↓
Response
```

### Second request

```text
Cache HIT
 ↓
Redis
 ↓
Response
```

The logs or development response should make this behavior observable.

---

# 27. Cache Latency

One of the educational goals is to observe that Redis can return cached data without querying MySQL.

The UI or development logs can show:

```text
Cache: HIT
Latency: X ms
```

or:

```text
Cache: MISS
Source: MySQL
Latency: X ms
```

This is primarily for learning and verification.

Do not build a complex monitoring system yet.

---

# 28. Milestone 5.10 — Cache Invalidation

This is one of the most important Redis concepts.

Suppose:

```text
Redis:
customers:list
```

contains:

```text
Customer A
Customer B
```

Then the user creates:

```text
Customer C
```

MySQL now contains:

```text
A
B
C
```

but Redis may still contain:

```text
A
B
```

If we return that cached value, the UI is stale.

Therefore, after a successful customer mutation:

```text
POST /api/customers
        ↓
MySQL INSERT
        ↓
Redis DEL customers:list
```

Next read:

```text
GET /api/customers
        ↓
Redis MISS
        ↓
MySQL
        ↓
Fresh data
        ↓
Redis SET
```

---

# 29. Cache Invalidation Rule

The important ordering is:

```text
Write authoritative data first
        ↓
Invalidate affected cache
```

Do not treat Redis as the authoritative write destination.

Correct:

```text
MySQL write
 ↓
Cache invalidation
```

Not:

```text
Redis write
 ↓
Hope MySQL eventually matches
```

for this simple cache-aside design.

---

# 30. Milestone 5.11 — Cache-Control Boundaries

Not every piece of data should be cached.

Avoid blindly caching:

```text
Passwords
Secrets
Sensitive credentials
Highly volatile security information
```

Also consider whether a resource is:

- frequently read
- expensive to compute
- safe to cache
- acceptable if slightly stale

Caching should be a deliberate architectural decision.

---

# 31. Security Considerations

## Do not cache secrets

Never intentionally store:

```text
API keys
Database passwords
OAuth client secrets
Gmail refresh tokens
```

in ordinary application caches.

---

## Cache Isolation

Eventually the platform will be multi-tenant.

A cache key must not accidentally allow one organization to retrieve another organization's data.

Bad:

```text
customers:list
```

if all tenants share the same logical cache.

Better future design:

```text
org:<orgId>:customers:list
```

or another correctly scoped key.

This is especially important because Phase 1 defined multi-tenant isolation.

---

# 32. Multi-Tenant Cache Safety

The agent/platform must never be able to retrieve another user's or organization's cached data.

Conceptually:

```text
Organization A
    ↓
org:A:customers:list

Organization B
    ↓
org:B:customers:list
```

The backend should derive tenant identity from authenticated session/context.

Do NOT trust an AI model to supply the tenant ID.

This follows the same session-bound security principle established in Phase 1.

---

# 33. Common Mistakes

## Mistake 1 — Using Redis as the primary database

Redis should not replace MySQL for durable business records.

---

## Mistake 2 — No TTL

Cached data can remain stale indefinitely.

---

## Mistake 3 — TTL without invalidation

Expiration alone may still leave stale data for the TTL duration.

---

## Mistake 4 — Incorrect cache keys

Different requests may accidentally share the same cached result.

---

## Mistake 5 — Caching sensitive information

Do not casually put secrets or credentials in Redis.

---

## Mistake 6 — Application fails when Redis fails

For cache use cases, Redis should usually degrade gracefully to MySQL where appropriate.

---

## Mistake 7 — Creating a Redis connection per request

Use a reusable client.

---

## Mistake 8 — Adding queues too early

Redis queues are important later, but they are not required to understand caching.

---

# 34. Debugging Strategy

When Redis integration fails:

```text
Error
 ↓
Is Redis installed?
 ↓
Is Redis running?
 ↓
Is the expected port accessible?
 ↓
Does PING return PONG?
 ↓
Can Node connect?
 ↓
Can Node SET a value?
 ↓
Can Node GET it?
 ↓
Can application cache customer data?
```

Do not jump directly to changing application code.

---

# 35. Testing Requirements

At minimum, verify:

## Redis connectivity

```text
PING → PONG
```

## SET/GET

```text
SET → GET → expected value
```

## TTL

```text
SET
 ↓
EXPIRE
 ↓
TTL
 ↓
Expiration
```

## Application connection

```text
Express → Redis
```

## Cache HIT

```text
First request → MISS
Second request → HIT
```

## Cache invalidation

```text
Create customer
 ↓
Invalidate cache
 ↓
Next GET → MISS
 ↓
MySQL returns new data
```

## Redis failure

```text
Redis unavailable
 ↓
Application continues using MySQL
```

where appropriate.

---

# 36. Phase 5 API Behavior

The existing customer endpoints should remain compatible.

Current:

```text
GET /api/customers
GET /api/customers/lookup?domain=...
POST /api/customers
```

Phase 5 should add caching without breaking their existing behavior.

The frontend should continue working.

---

# 37. Phase 5 Backend Architecture

Target conceptual structure:

```text
server/src/
│
├── app.ts
├── server.ts
│
├── config/
│   └── env.ts
│
├── db/
│   └── pool.ts
│
├── cache/
│   └── redis.ts
│
├── routes/
│   ├── healthRoutes.ts
│   └── customerRoutes.ts
│
└── services/
    └── customerService.ts
```

The exact structure can change if implementation reveals a better design.

---

# 38. Health Checks

Phase 4 already has:

```text
GET /api/health
GET /api/health/db
```

Phase 5 may add:

```text
GET /api/health/redis
```

The purpose is to distinguish:

```text
Backend healthy
Database healthy
Redis healthy
```

However, Redis being unavailable should not automatically mean that every customer read must fail.

Health reporting and application dependency semantics are related but not identical.

---

# 39. Phase 5 Observability

For development, make cache behavior visible.

Useful information:

```text
Cache HIT
Cache MISS
Cache SET
Cache INVALIDATED
Redis unavailable
```

Avoid logging:

```text
Passwords
Tokens
Secrets
Sensitive customer information
```

Logs will become much more sophisticated in the reliability/monitoring phase.

---

# 40. Phase 5 Performance Goal

We are not optimizing for arbitrary benchmark numbers.

The goal is to demonstrate:

```text
MySQL-backed request
        ↓
Cache it
        ↓
Repeated request
        ↓
Serve from Redis
```

and understand why that can reduce database load.

Performance optimization should be measured rather than assumed.

---

# 41. Phase 5 Deliverables

At completion:

```text
Redis Server
      ↓
Verified locally
```

Backend:

```text
Express
  ↓
Redis Client
  ↓
Cache
```

Application:

```text
GET /api/customers
  ↓
Cache-aside
```

Customer mutations:

```text
POST /api/customers
  ↓
MySQL
  ↓
Cache invalidation
```

Documentation:

```text
PHASE_5.md
```

updated with:

- installation method
- Redis version
- verification results
- configuration
- cache strategy
- cache keys
- TTL
- invalidation strategy
- failure behavior
- test results

Git:

```text
Changes committed
Changes pushed
Working tree clean
```

---

# 42. Phase 5 Completion Checklist

## Redis Environment

- [x] Redis installed (`Redis server v=8.10.1` via winget portable package)
- [x] Redis version verified (`Redis server v=8.10.1 sha=00000000:0`)
- [x] Redis server running (listening on 127.0.0.1:6379 as background daemon)
- [x] Redis port verified (Port 6379)
- [x] PING → PONG verified (`redis-cli.exe ping` returned `PONG`)

## Redis Concepts

- [x] Key-value model understood (`<resource>:<operation>:<identifier>`)
- [x] SET/GET understood (tested via redis-cli and Node client)
- [x] TTL understood (tested 60s expiration with `redis-cli ttl`)
- [x] Cache HIT understood (latency dropped from 9ms to 1ms, `source: "cache"`)
- [x] Cache MISS understood (initial request fetches from MySQL with `source: "database"`, then caches)
- [x] Cache invalidation understood (`delCachePattern("customers:*")` on `POST /api/customers`)
- [x] Cache-aside pattern understood (Application handles cache lookups, cache misses, and cache populations)

## Backend

- [x] Redis client installed (official `redis` v4 package in `server/package.json`)
- [x] Redis configuration added (`REDIS_HOST`, `REDIS_PORT`, `REDIS_TTL_SECONDS` in `config/env.ts`, `.env.example`, `.env`)
- [x] Redis client module created (`server/src/cache/redis.ts`)
- [x] Connection verified (reusable singleton client with reconnection logic)
- [x] Redis failure handled appropriately (non-fatal error handlers; graceful degradation to MySQL on cache failure)

## Caching

- [x] Customer list cached (`customers:list:limit:20`)
- [x] Cache key documented (follows resource:operation:identifier pattern)
- [x] TTL configured (default 60 seconds with auto-expiration)
- [x] Cache HIT verified (sub-millisecond response latency observed)
- [x] Cache MISS verified (queries MySQL on first access, then caches)
- [x] Cache invalidation implemented (purges customer cache on customer creation)
- [x] Customer creation invalidates relevant cache (tested and confirmed end-to-end)

## Security

- [x] No secrets cached (only non-sensitive public business customer records cached)
- [x] Cache keys considered for tenant isolation (architected for tenant prefixing `org:<id>:...`)
- [x] No credentials committed (`.env` protected by `.gitignore`, `.env.example` provided)
- [x] Redis is not exposed to the browser (browser communicates exclusively with Express API)

## Testing

- [x] Redis connection tested (`GET /api/health/redis` returns HTTP 200 with latency)
- [x] Cache HIT tested (verified with curl & PowerShell)
- [x] Cache MISS tested (verified with curl & PowerShell)
- [x] TTL tested (verified with `redis-cli ttl`)
- [x] Invalidation tested (verified: POST triggers MISS on subsequent read)
- [x] Redis failure behavior tested (graceful degradation without HTTP 500 crash)

## Git

- [x] Documentation updated (`PHASE_5.md`)
- [x] Changes committed with semantic messages
- [x] Changes pushed to GitHub `origin main`
- [x] Working tree clean

---

### Verification Summary & Command Evidence

#### 1. Redis Server Version & CLI Ping
- **Command:** `redis-server.exe --version` $\rightarrow$ `Redis server v=8.10.1`
- **Command:** `redis-cli.exe ping` $\rightarrow$ `PONG`

#### 2. Redis Health Endpoint
- **Command:** `curl.exe -i http://localhost:3000/api/health/redis`
- **Response:**
  ```http
  HTTP/1.1 200 OK
  Content-Type: application/json; charset=utf-8

  {"status":"ok","redis":"connected","host":"127.0.0.1","port":6379,"latencyMs":24}
  ```

#### 3. Cache MISS vs Cache HIT Verification
- **Request 1 (Cache MISS from MySQL):**
  - **Command:** `curl.exe http://localhost:3000/api/customers`
  - **Output:** `{"status":"success","source":"database","latencyMs":9,"count":4,...}`
- **Request 2 (Cache HIT from Redis):**
  - **Command:** `curl.exe http://localhost:3000/api/customers`
  - **Output:** `{"status":"success","source":"cache","latencyMs":1,"count":4,...}`

#### 4. TTL Verification
- **Command:** `redis-cli.exe ttl customers:list:limit:20`
- **Output:** `30` (active expiration countdown)

#### 5. Cache Invalidation Flow
- **Step 1:** `POST /api/customers` creates record in MySQL and executes `delCachePattern("customers:*")`.
- **Step 2:** Subsequent `GET /api/customers` results in:
  `First GET after invalidation - Source: database, Latency: 5ms, Count: 5` (Cache MISS)
- **Step 3:** Subsequent `GET /api/customers` results in:
  `Second GET - Source: cache, Latency: 1ms, Count: 5` (Cache HIT)


---

# 43. Phase 5 Completion Criteria

Phase 5 is complete when the following flow works reliably:

```text
┌────────────────────┐
│    React Client    │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│    Express API     │
└─────────┬──────────┘
          │
          ▼
┌────────────────────┐
│  Customer Service  │
└─────────┬──────────┘
          │
          ▼
      ┌───────┐
      │ Redis │
      └───┬───┘
          │
      HIT │ MISS
          │
      ┌───┴────┐
      │        │
      ▼        ▼
   Return    MySQL
              │
              ▼
            Redis
              │
              ▼
            Return
```

And after creating a customer:

```text
POST customer
      ↓
MySQL INSERT
      ↓
Redis INVALIDATE
      ↓
Next GET
      ↓
Cache MISS
      ↓
MySQL
      ↓
Redis SET
      ↓
Fresh result
```

---

# 44. What I Should Be Able to Explain

Before moving to Phase 6, I should be able to explain:

1. Why MySQL and Redis have different responsibilities.
2. Why Redis is useful for caching.
3. What a cache hit is.
4. What a cache miss is.
5. What TTL means.
6. Why cache invalidation is necessary.
7. What cache-aside means.
8. Why Redis should not become the source of truth for customer data.
9. What happens when Redis is unavailable.
10. Why cache keys must account for tenant isolation.
11. Why sensitive credentials should not be casually cached.
12. How Redis will later become useful for background job queues.

---

# 45. What Comes Next

After Phase 5:

# Phase 6 — AI / LLM Integration

The architecture will become:

```text
React
   ↓
Express
   ↓
Application Services
   ├── MySQL
   ├── Redis
   └── LLM API
```

The first AI feature will NOT be a complicated autonomous agent.

We will first learn:

```text
User Input
    ↓
Backend
    ↓
LLM API
    ↓
Structured AI Response
    ↓
Backend
    ↓
React
```

We'll learn:

- API keys
- model requests
- prompts
- system/user messages
- structured output
- token usage
- latency
- cost
- error handling
- retries
- rate limits
- AI-specific security

Only after that foundation works will we create the first simple agent.

---

# 46. Project Roadmap

```text
PHASE 1 — REQUIREMENTS & ARCHITECTURE
████████████████████ COMPLETED

PHASE 2 — LOCAL DEVELOPMENT ENVIRONMENT
████████████████████ COMPLETED

PHASE 3 — BASIC REACT + EXPRESS
████████████████████ COMPLETED

PHASE 4 — MYSQL DATABASE INTEGRATION
████████████████████ COMPLETED

PHASE 5 — REDIS
████████████████████ COMPLETED

  [x] 5.1 Install/verify Redis
  [x] 5.2 Verify Redis server
  [x] 5.3 Verify PING → PONG
  [x] 5.4 Learn Redis basic operations
  [x] 5.5 Add Node Redis client
  [x] 5.6 Configure Redis environment
  [x] 5.7 Create reusable Redis connection
  [x] 5.8 Implement customer-list cache
  [x] 5.9 Verify cache HIT/MISS
  [x] 5.10 Implement TTL
  [x] 5.11 Implement cache invalidation
  [x] 5.12 Handle Redis failure
  [x] 5.13 Verify tenant-safe cache design
  [x] 5.14 Update documentation
  [x] 5.15 Commit + push

PHASE 6 — AI / LLM INTEGRATION
▶ NEXT PHASE
░░░░░░░░░░░░░░░░░░░░
```

---

# Phase 5 Golden Rule

**Redis is an optimization and coordination technology, not a replacement for your relational database.**

For this phase, remember:

```text
MySQL
= durable source of truth

Redis
= fast temporary/cache layer
```

Our first practical goal is deliberately small:

```text
React
 ↓
Express
 ↓
Redis Cache
 ↓
MySQL on MISS
 ↓
Redis
 ↓
React
```

Once you understand and verify that flow, you'll have the conceptual foundation needed later for **Redis queues and background workers**.

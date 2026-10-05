# AI Workforce Platform

# Phase 3 — Basic React + Express Application

## Status

**Phase:** Phase 3 — Basic React + Express Application  
**Status:** In Progress  
**Previous Phase:** Phase 2 — Local Development Environment — COMPLETED  
**Current Goal:** Establish the first working frontend-to-backend communication  
**Next Phase:** Phase 4 — MySQL Database Integration

---

# 1. Purpose of Phase 3

The purpose of Phase 3 is to build the first minimal working full-stack application.

The application will contain:

```text
React Frontend
      ↓
HTTP Request
      ↓
Express Backend
      ↓
JSON Response
      ↓
React Frontend
```

This phase establishes the basic communication boundary that the entire AI Workforce Platform will eventually use.

---

# 2. Why This Phase Comes Before AI

The final platform will contain many complex systems:

```text
React
Express
MySQL
Redis
LLM
Agent
Tools
Web Search
Qdrant
RAG
Gmail
Workers
AWS
```

We should not introduce all of these simultaneously.

First we need to prove:

```text
Browser
   ↓
React
   ↓
HTTP
   ↓
Express
   ↓
Response
   ↓
React
```

If this foundation is broken, adding AI and databases will only make debugging harder.

---

# 3. Phase 3 Goal

At the end of this phase, the following workflow must work:

```text
User opens React application
        ↓
React UI loads
        ↓
User clicks "Check Backend"
        ↓
React sends HTTP GET request
        ↓
Express receives request
        ↓
Express executes /api/health
        ↓
Express returns JSON
        ↓
React receives response
        ↓
React displays backend status
```

Example:

```text
Backend Status: OK
```

---

# 4. Technology Scope

## Frontend

- React
- TypeScript
- Vite
- Tailwind CSS

## Backend

- Node.js
- Express.js
- TypeScript

## Communication

- HTTP
- REST-style endpoint
- JSON

## Development

- npm
- Git
- Local development servers

---

# 5. Technologies NOT Used Yet

Do not introduce these during Phase 3:

```text
❌ MySQL application integration
❌ Redis
❌ Qdrant
❌ RAG
❌ LLM
❌ AI Agent
❌ Web Search
❌ Gmail
❌ Background Workers
❌ Docker
❌ AWS
❌ CI/CD
```

MySQL itself is installed and verified from Phase 2, but application-level MySQL integration belongs to Phase 4.

---

# 6. Target Architecture

The Phase 3 architecture is intentionally simple:

```text
┌──────────────────────────────┐
│        React Frontend        │
│                              │
│  "Check Backend" button      │
└──────────────┬───────────────┘
               │
               │ HTTP GET
               │ /api/health
               ▼
┌──────────────────────────────┐
│       Express Backend        │
│                              │
│       GET /api/health        │
└──────────────┬───────────────┘
               │
               │ JSON
               ▼
        { "status": "ok" }
               │
               ▼
┌──────────────────────────────┐
│        React Frontend        │
│                              │
│    Backend Status: OK        │
└──────────────────────────────┘
```

---

# 7. Repository Structure

After Phase 3, the repository should approximately look like:

```text
ai-workforce-platform/
│
├── .gitignore
├── PROJECT.md
├── PHASE_2.md
├── PHASE_3.md
│
├── docs/
│   ├── README.md
│   ├── ARCHITECTURE.md
│   ├── DATABASE_SCHEMA.md
│   ├── schema.sql
│   └── API_SPEC.md
│
├── client/
│   ├── package.json
│   ├── src/
│   └── ...
│
└── server/
    ├── package.json
    ├── tsconfig.json
    ├── src/
    │   ├── app.ts
    │   └── server.ts
    └── ...
```

The exact structure may evolve later.

The important separation is:

```text
client/ → frontend
server/ → backend
```

---

# 8. Milestone 3.1 — Initialize Backend

## Objective

Create the Node.js + Express + TypeScript backend inside:

```text
server/
```

The backend should eventually be responsible for:

- HTTP API
- Request validation
- Business logic
- Authentication
- AI orchestration
- Database communication
- Tool execution

For now, it only needs a health endpoint.

---

## What I Should Learn

Before continuing, understand:

### Node.js

Node.js provides the runtime for the backend.

### Express

Express helps us create HTTP APIs.

### TypeScript

TypeScript allows us to define types and catch many programming errors before runtime.

### npm

npm manages project dependencies and scripts.

---

# 9. Backend Health Endpoint

Create:

```text
GET /api/health
```

The endpoint should return JSON similar to:

```json
{
  "status": "ok"
}
```

The exact response structure should remain simple.

---

# 10. What the Health Endpoint Teaches

Although tiny, this endpoint teaches the basic backend lifecycle:

```text
HTTP Request
     ↓
Express Router
     ↓
Route Handler
     ↓
Response
```

Later:

```text
HTTP Request
     ↓
Router
     ↓
Controller
     ↓
Service
     ↓
Database / Agent / Tool
     ↓
Response
```

The health endpoint is therefore a controlled introduction to backend architecture.

---

# 11. Backend Server Port

Choose one local development port for the backend.

Example:

```text
http://localhost:3000
```

The exact port may be changed if it conflicts with another application.

The important requirement is consistency.

---

# 12. Backend Verification

The backend must be tested independently before connecting React.

Test:

```text
GET /api/health
```

Expected result:

```json
{
  "status": "ok"
}
```

Possible testing methods include:

- Browser
- PowerShell
- curl
- API client

We will use a simple method first.

---

# 13. Milestone 3.2 — Initialize Frontend

## Objective

Create the React application inside:

```text
client/
```

The frontend will use:

```text
React
+
TypeScript
+
Vite
+
Tailwind CSS
```

---

# 14. Frontend Learning Objectives

Understand:

## React Component

A component is a reusable unit of UI.

Example concept:

```text
App
 ├── Header
 ├── TaskPanel
 └── StatusPanel
```

We will not build all of these yet.

---

## State

The frontend will eventually need to track information such as:

```text
Task status
Agent progress
Approval status
Results
Errors
```

For Phase 3, state can remain extremely simple.

---

## HTTP Request

React will eventually communicate with Express using HTTP.

Conceptually:

```text
React
 ↓
fetch()
 ↓
Express API
 ↓
JSON
 ↓
React state
 ↓
UI
```

---

# 15. Milestone 3.3 — Connect React to Express

This is the most important milestone of Phase 3.

The frontend should contain a simple button:

```text
[ Check Backend ]
```

When clicked:

```text
React
  ↓
GET /api/health
  ↓
Express
  ↓
JSON response
  ↓
React
```

The UI should display something like:

```text
Backend Status: OK
```

---

# 16. Frontend-to-Backend Communication

The frontend must NOT directly access MySQL.

Correct architecture:

```text
React
  ↓
HTTP API
  ↓
Express
  ↓
Database
```

Incorrect:

```text
React
  ↓
MySQL
```

This separation becomes extremely important when authentication, authorization and AI tools are introduced.

---

# 17. Local Development Ports

During development we will typically have:

```text
Frontend
http://localhost:<frontend-port>

Backend
http://localhost:<backend-port>
```

For example:

```text
React
http://localhost:5173

Express
http://localhost:3000
```

The actual ports may differ.

---

# 18. CORS Concept

Because frontend and backend may run on different local ports, the browser treats them as different origins.

Example:

```text
http://localhost:5173
```

and:

```text
http://localhost:3000
```

are different origins.

The backend may therefore need appropriate CORS configuration.

Learn the concept before adding unnecessary configuration.

The goal is:

```text
Browser
   ↓
Frontend origin
   ↓
Backend origin
   ↓
Allowed request
```

Security rules will become stricter later.

---

# 19. Milestone 3.4 — End-to-End Verification

The complete workflow must work:

```text
1. Start Express
        ↓
2. Start React
        ↓
3. Open React in browser
        ↓
4. Click "Check Backend"
        ↓
5. React sends request
        ↓
6. Express receives request
        ↓
7. Express returns JSON
        ↓
8. React displays result
```

Expected UI:

```text
AI Workforce Platform

Backend Connection

[ Check Backend ]

Backend Status: OK
```

The visual design does not need to be sophisticated.

Functionality is the priority.

---

# 20. Error Handling

The frontend should not assume that the backend always works.

Eventually it should handle:

```text
Success
Loading
Error
```

For example:

```text
Checking backend...
```

Then:

```text
Backend Status: OK
```

or:

```text
Unable to connect to backend.
```

For Phase 3, keep this logic simple.

---

# 21. Environment Variables

Do not hardcode secrets.

For Phase 3, the backend URL may initially be simple local configuration.

Later we will introduce environment variables properly.

Example concept:

```text
Frontend
   ↓
Environment configuration
   ↓
Backend API URL
```

Do not commit secrets.

---

# 22. Common Mistakes

## Mistake 1 — Putting backend code inside React

Keep:

```text
client/
```

and:

```text
server/
```

separate.

---

## Mistake 2 — Connecting MySQL too early

MySQL integration is Phase 4.

Do not add database code simply because MySQL is already installed.

---

## Mistake 3 — Creating a complicated backend

Do not build:

```text
controllers/
services/
repositories/
agents/
tools/
workers/
queues/
```

all at once.

The first backend only needs to prove:

```text
Express → route → response
```

We'll evolve the architecture as complexity increases.

---

## Mistake 4 — Overdesigning the UI

Phase 3 isn't about making a beautiful dashboard.

It's about proving:

```text
Frontend ↔ Backend
```

---

## Mistake 5 — Ignoring browser errors

When the frontend cannot connect, inspect:

- Browser console
- Network tab
- Backend terminal
- HTTP status
- CORS errors

Don't randomly change code.

---

# 23. Debugging Strategy

If something fails:

```text
Problem
  ↓
Determine which side failed
  ↓
Frontend?
Backend?
Network?
Configuration?
  ↓
Read exact error
  ↓
Identify root cause
  ↓
Make smallest fix
  ↓
Retest
```

Example:

If:

```text
GET /api/health → 404
```

The likely problem is the backend route.

If:

```text
Failed to fetch
```

Possible causes include:

- backend isn't running
- wrong port
- incorrect URL
- CORS
- network/configuration issue

We will identify which one before changing the implementation.

---

# 24. Security Considerations

Even in this simple phase:

- Do not commit secrets.
- Do not expose MySQL directly to the browser.
- Keep backend responsibilities on the server.
- Don't trust client input.
- Don't assume frontend controls are security controls.

Later, authentication and authorization will enforce stronger boundaries.

---

# 25. Scalability Considerations

Phase 3 is intentionally simple.

Eventually:

```text
React
   ↓
API
   ↓
Task Service
   ↓
Queue
   ↓
Worker
   ↓
Agent
```

But we are NOT implementing that yet.

The purpose of Phase 3 is to create a clean foundation that can evolve into that architecture.

---

# 26. Phase 3 Commands Policy

Commands must be executed one milestone at a time.

For every command, record:

### Where

Example:

```text
PowerShell
server/
```

### What it does

Explain the command before running it.

### Expected output

Document what success should look like.

### Verification

Run a test after the command.

### Commit

Only commit after the milestone works.

---

# 27. Suggested Commit Strategy

Use small, meaningful commits.

Possible commits:

```text
chore: initialize backend workspace
```

```text
feat: add backend health endpoint
```

```text
chore: initialize react frontend
```

```text
feat: connect frontend to backend health endpoint
```

Do not make one giant commit containing every Phase 3 change.

---

# 28. Phase 3 Deliverables

At completion, we should have:

### Backend

```text
Node.js
Express
TypeScript
```

with:

```text
GET /api/health
```

### Frontend

```text
React
TypeScript
Vite
Tailwind
```

with a basic UI.

### Integration

React successfully calls:

```text
GET /api/health
```

and displays the response.

### Documentation

`PHASE_3.md` updated with:

- completed milestones
- verification results
- important commands
- encountered errors
- solutions
- final status

### Git

All changes committed and pushed to `main`.

---

# 29. Phase 3 Completion Checklist

## Backend

- [ ] Node project initialized
- [ ] TypeScript configured
- [ ] Express installed
- [ ] Express application created
- [ ] Health endpoint created
- [ ] Backend starts successfully
- [ ] `/api/health` returns expected JSON

## Frontend

- [ ] React project initialized
- [ ] TypeScript configured
- [ ] Vite working
- [ ] Tailwind CSS configured
- [ ] Frontend starts successfully
- [ ] Basic UI created

## Integration

- [ ] Frontend can call backend
- [ ] CORS/origin issue resolved if required
- [ ] Backend response reaches React
- [ ] React displays backend status
- [ ] Error state works
- [ ] Browser console is clean of relevant errors

## Git

- [ ] Changes committed
- [ ] Changes pushed
- [ ] Working tree clean
- [ ] Phase 3 status documented

---

# 30. Phase 3 Completion Criteria

Phase 3 is complete only when this works:

```text
┌─────────────────────────┐
│      React Browser      │
│                         │
│  [ Check Backend ]      │
│                         │
│  Backend Status: OK     │
└────────────┬────────────┘
             │
             │ HTTP
             ▼
┌─────────────────────────┐
│    Express Backend      │
│                         │
│     /api/health         │
│                         │
│  { "status": "ok" }     │
└─────────────────────────┘
```

The developer should be able to explain:

1. What happens when the React button is clicked.
2. What HTTP request is generated.
3. How Express matches the route.
4. How the backend sends JSON.
5. How React receives the response.
6. Why the frontend should not access MySQL directly.
7. Why the backend exists between the frontend and data/services.

---

# 31. What Comes Next

Once Phase 3 is complete, we will start:

# Phase 4 — MySQL Database Integration

The architecture will evolve from:

```text
React
   ↓
Express
   ↓
JSON
```

to:

```text
React
   ↓
Express
   ↓
Application Service
   ↓
MySQL
```

Then we will use the already-designed:

```text
docs/schema.sql
```

to create the actual application database.

We will learn:

- MySQL connection from Node.js
- Connection pools
- Environment variables
- SQL queries
- Parameterized queries
- Transactions
- Foreign keys
- Database migrations
- Error handling
- Repository/service separation

Only after that foundation works will we start introducing Redis and AI.

---

# 32. Project Roadmap

```text
PHASE 1 — REQUIREMENTS & ARCHITECTURE
████████████████████ COMPLETED

PHASE 2 — LOCAL DEVELOPMENT ENVIRONMENT
████████████████████ COMPLETED

PHASE 3 — BASIC REACT + EXPRESS
▶ CURRENT PHASE

  [ ] 3.1 Initialize Express + TypeScript backend
  [ ] 3.2 Create /api/health
  [ ] 3.3 Initialize React + Vite + TypeScript
  [ ] 3.4 Configure Tailwind CSS
  [ ] 3.5 Connect React → Express
  [ ] 3.6 Handle loading/error states
  [ ] 3.7 End-to-end verification
  [ ] 3.8 Commit + push + documentation

PHASE 4 — MYSQL DATABASE INTEGRATION
░░░░░░░░░░░░░░░░░░░░

PHASE 5 — REDIS
░░░░░░░░░░░░░░░░░░░░

PHASE 6 — AI / LLM
░░░░░░░░░░░░░░░░░░░░

PHASE 7 — SIMPLE AGENT
░░░░░░░░░░░░░░░░░░░░

PHASE 8 — TOOL CALLING
░░░░░░░░░░░░░░░░░░░░

PHASE 9 — WEB SEARCH
░░░░░░░░░░░░░░░░░░░░

PHASE 10 — MYSQL VERIFICATION
░░░░░░░░░░░░░░░░░░░░

PHASE 11 — QDRANT
░░░░░░░░░░░░░░░░░░░░

PHASE 12 — RAG
░░░░░░░░░░░░░░░░░░░░

PHASE 13 — AUTHENTICATION
░░░░░░░░░░░░░░░░░░░░

PHASE 14 — TASK MANAGEMENT
░░░░░░░░░░░░░░░░░░░░

PHASE 15 — AGENT ORCHESTRATION
░░░░░░░░░░░░░░░░░░░░

PHASE 16 — GMAIL
░░░░░░░░░░░░░░░░░░░░

PHASE 17 — HUMAN APPROVAL
░░░░░░░░░░░░░░░░░░░░

PHASE 18 — BACKGROUND WORKERS
░░░░░░░░░░░░░░░░░░░░

PHASE 19 — RELIABILITY
░░░░░░░░░░░░░░░░░░░░

PHASE 20 — SECURITY
░░░░░░░░░░░░░░░░░░░░

PHASE 21 — DOCKER
░░░░░░░░░░░░░░░░░░░░

PHASE 22 — AWS
░░░░░░░░░░░░░░░░░░░░

PHASE 23 — MONITORING + CI/CD
░░░░░░░░░░░░░░░░░░░░
```

---

# Phase 3 Golden Rule

**Do not jump directly to AI, MySQL, Redis, or agent development.**

First make this work reliably:

```text
React → HTTP → Express → JSON → React
```

Once you can explain and demonstrate that flow yourself, **Phase 3 is complete** and we're ready for the database layer.

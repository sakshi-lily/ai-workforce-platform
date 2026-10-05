# System Architecture Specification

## 1. Architectural Overview

The **AI Workforce Platform** is an intelligent orchestration platform that accepts natural-language objectives and executes them through autonomous subtask decomposition, governed tool execution, and human-in-the-loop validation.

```mermaid
graph TD
    Client["React Client (Vite + Tailwind + TS)"]
    API["Express.js API Gateway / Controller"]
    Orchestrator["AI Agent Orchestrator"]
    LLM["LLM Foundation Model (API)"]
    MySQL[("MySQL Relational DB")]
    Redis[("Redis Cache / State")]
    SearchTool["Web Search Tool Adapter"]
    DBTool["MySQL Verification Tool Adapter"]
    ExternalWeb["External Search Engine"]

    Client -->|"HTTP / REST / SSE"| API
    API -->|"Persist Task State"| MySQL
    API -->|"Cache / Ephemeral Queue"| Redis
    API -->|"Invoke Workflow"| Orchestrator
    
    Orchestrator -->|"Reasoning & Tool Selection"| LLM
    Orchestrator -->|"Session-Bound Call"| SearchTool
    Orchestrator -->|"Session-Bound Call"| DBTool
    
    SearchTool -->|"Public Web Discovery"| ExternalWeb
    DBTool -->|"Verify Records"| MySQL
    
    Orchestrator -->|"Update Subtask Progress"| MySQL
    API -->|"SSE Live Stream / Poll"| Client
```

---

## 2. In-Process Asynchronous Execution Model (MVP)

To prevent HTTP request timeouts (which occur when multi-step LLM operations take 30–60+ seconds), the platform implements an **asynchronous task ingestion and streaming model**:

```mermaid
sequenceDiagram
    autonumber
    actor User as User (React UI)
    participant API as Express API
    participant DB as MySQL DB
    participant Agent as Agent Execution Engine
    participant Tool as Tools (Web/MySQL)
    participant LLM as LLM API

    User->>API: POST /api/tasks (goal, constraints)
    API->>DB: INSERT INTO tasks (status='PENDING')
    API-->>User: HTTP 202 Accepted { taskId, status: 'PENDING' }
    
    par Async Agent Run
        API->>Agent: executeTask(taskId)
        Agent->>DB: UPDATE tasks SET status='IN_PROGRESS'
        Agent->>LLM: Decompose task into subtasks
        LLM-->>Agent: Subtask plan (DAG)
        Agent->>DB: INSERT INTO task_steps (...)
        
        loop For each subtask
            Agent->>Tool: Execute tool (Web Search / MySQL)
            Tool-->>Agent: Tool result
            Agent->>DB: UPDATE task_steps, INSERT tool_executions
        end
        
        Agent->>LLM: Synthesize final output & report
        LLM-->>Agent: Structured report
        Agent->>DB: UPDATE tasks SET status='COMPLETED', output=...
    and Client Polling / SSE
        User->>API: GET /api/tasks/:id/stream (SSE) or Poll
        API-->>User: Stream real-time step updates & status
    end
```

---

## 3. Session-Bound Execution Wrapper (Security & Multi-Tenancy)

To prevent prompt injection attacks or hallucinations from accessing unauthorized data:

1. **Host-Enforced Context:** The AI agent never receives raw database credentials or tenant IDs to pass as tool parameters.
2. **Context Injection:** When the agent calls a tool (e.g., `mysql_verify_customer`), the application host intercepts the call and injects the authenticated `userId` and `organizationId` from the verified session.
3. **Untrusted Data Tainting:** All raw scraped text from external web pages is encapsulated inside `<external_untrusted_data>` XML delimiters before entering the LLM prompt to prevent prompt injection hijacking.

---

## 4. Execution Watchdog & Fault Tolerance

The agent runtime is constrained by deterministic host governors:

| Parameter | MVP Value | Purpose |
| :--- | :--- | :--- |
| **Max Agent Cycles** | 10 iterations | Prevents infinite reasoning loops. |
| **Max Tool Calls per Step** | 3 invocations | Avoids recursive tool thrashing. |
| **Task Wall-Clock Timeout** | 180 seconds | Drops hung network connections. |
| **Tool HTTP Timeout** | 15 seconds | Prevents slow external APIs from stalling execution. |
| **Retry Backoff** | 2 retries (exponential) | Handles transient network hiccups. |

# Phase 8 — Tool Calling

## Status: COMPLETED

| Phase | Previous Phase | Next Phase | Current Status |
|---|---|---|---|
| **Phase 8 — Tool Calling** | Phase 7 — Simple Agent | Phase 9 — Web Search | **100% Complete & Verified** |

---

## 1. Architectural Summary & Golden Rule

In **Phase 7**, the AI Workforce Platform created its first bounded, stateful worker capable of reasoning and generating structured plans. However, the agent was completely isolated from application capabilities and the outside world.

**Phase 8 introduces Tool Calling.**

### The Phase 8 Golden Rule
> **A tool call is a request, not permission.**  
> **The LLM proposes; the application controls, validates, authorizes, and executes.**

At no point does the LLM possess the authority to execute arbitrary code, invoke unregistered tools, bypass authentication/tenant checks, or run arbitrary shell commands or raw SQL statements.

```text
                            ┌────────────────────────┐
                            │      React Client      │
                            │                        │
                            │ Tool Calling Studio    │
                            │ State Machine Timeline │
                            └───────────┬────────────┘
                                        │ HTTP POST /api/agent/tasks
                                        ▼
                            ┌────────────────────────┐
                            │     Express API        │
                            │                        │
                            │ Security & Trust Gate  │
                            └───────────┬────────────┘
                                        │
                                        ▼
                            ┌────────────────────────┐
                            │       Agent Host       │
                            │                        │
                            │ State Machine          │
                            │ Watchdogs (Cycles/Time)│
                            │ Tool Execution Loop    │
                            └───────┬────────┬───────┘
                                    │        │
                         Propose    │        │ Authorize & Execute
                         Tool Call  │        │
                                    ▼        ▼
                      ┌────────────────┐   ┌────────────────┐
                      │  LLM Provider  │   │ Tool Registry  │
                      │  (OpenAI SDK / │   │                │
                      │   Simulation)  │   │ Server Allow-  │
                      │                │   │ list & Gating  │
                      └───────┬────────┘   └───────┬────────┘
                              │                    │
                              │ Observation Feed   │ Zod Validated Handlers
                              └─────────┐  ┌───────┘
                                        │  │
                                        ▼  ▼
                            ┌────────────────────────┐
                            │    Safe Local Tools    │
                            │                        │
                            │ 1. get_current_time    │
                            │ 2. calculate (No eval) │
                            │ (10s Execution Race)   │
                            └───────────┬────────────┘
                                        │
                                        ▼
                            ┌────────────────────────┐
                            │        MySQL 8.4       │
                            │                        │
                            │ tasks                  │
                            │ task_steps             │
                            │ tool_executions        │
                            │ ai_telemetry           │
                            └────────────────────────┘
```

---

## 2. Core Architectural Components Implemented

### 2.1 Provider-Independent Tool Abstraction (`server/src/tools/types.ts`)
- Defined strict TypeScript contracts:
  - `ToolRiskLevel`: `'READ_ONLY' | 'LOW_RISK' | 'MUTATING' | 'EXTERNAL_SIDE_EFFECT'`
  - `ToolContext`: Host-injected trusted tenant context (`userId`, `taskId`, `stepId`, `organizationId`, `logger`) — never supplied or manipulated by the model.
  - `Tool<TInput, TOutput>`: Encapsulates `name`, `description`, `riskLevel`, `inputSchema` (Zod), `outputSchema` (Zod), and `execute(input, context)`.
  - `NormalizedToolCall`: Provider-neutral representation (`tool`, `arguments`, `toolCallId`).
  - `ToolExecutionEnvelope`: Predictable observation wrapper (`tool`, `success`, `data`, `error`).

### 2.2 Authoritative Tool Registry (`server/src/tools/registry.ts`)
- Registry operations: `registerTool`, `getTool`, `listTools`, `isToolAllowed`.
- Provider Adapter: `getOpenAIToolDefinitions(allowedTools)` converts internal Zod schemas to OpenAI-compatible JSON function definitions on demand.
- Tool Execution Boundary: `executeTool()` wraps execution with:
  1. Zod input argument validation.
  2. Bounded timeout race (10,000 ms execution ceiling) to prevent hung operations.
  3. Safe exception boundary returning structured failure envelopes rather than raw runtime stack traces.
  4. Zod output result validation before returning observations to the LLM.

### 2.3 Safe Local Tool Implementations
1. **`get_current_time` (`server/src/tools/implementations/getCurrentTime.ts`)**:
   - Risk: `READ_ONLY`
   - Input: `{ timezone?: string }` (defaults to `"UTC"`).
   - Strict IANA timezone validation using `Intl.DateTimeFormat` (e.g. `"Asia/Kolkata"`, `"America/New_York"`, `"Asia/Tokyo"`). Rejects invalid identifiers.
   - Output: `{ time: string, timezone: string, formatted: string }`.
2. **`calculate` (`server/src/tools/implementations/calculate.ts`)**:
   - Risk: `LOW_RISK`
   - Input: `{ expression: string }`
   - **Zero Arbitrary Code Execution**: Zero `eval()`, zero `new Function()`, zero shell/script access.
   - Built with a deterministic recursive-descent math tokenizer and parser supporting `+`, `-`, `*`, `/`, `%`, and nested parentheses `()`, with division-by-zero protection.

### 2.4 Durable Tool Execution Persistence (`server/src/services/toolExecutionService.ts`)
- Mapped directly to the existing `tool_executions` MySQL table (Table #5 in `docs/schema.sql`):
  - `id`: UUID primary key
  - `task_id`: Foreign key referencing `tasks.id`
  - `step_id`: Optional link to `task_steps.id`
  - `tool_name`: Name of executed tool
  - `input_payload`: Validated arguments stored as JSON
  - `output_payload`: Normalized tool observation envelope stored as JSON
  - `duration_ms`: Execution latency in milliseconds
  - `is_error`: Boolean flag (`0` on success, `1` on failure)
  - `error_message`: Controlled error string if failed

### 2.5 Agent Host Observation Loop (`server/src/agent/agentHost.ts`)
- State Machine Sequence:
  `REQUESTED` $\rightarrow$ `RUNNING` $\rightarrow$ `LLM_CALL` $\rightarrow$ `TOOL_REQUESTED` $\rightarrow$ `TOOL_AUTHORIZED` $\rightarrow$ `TOOL_EXECUTING` $\rightarrow$ `TOOL_COMPLETED` $\rightarrow$ `LLM_CALL` $\rightarrow$ `VALIDATING` $\rightarrow$ `COMPLETED`
- Sequential Execution: Exactly one tool call per cycle to guarantee state clarity and auditability.
- Multi-Watchdog Defense:
  - `MAX_CYCLES = 10`
  - `MAX_TOOL_CALLS = 10`
  - `MAX_EXECUTION_TIME_MS = 180,000` (180s)
  - `TOOL_TIMEOUT_MS = 10,000` (10s per tool)
- Observation Injection: Tool results are fed back into the LLM conversation using standard message roles (`role: "tool"`), preserving prompt integrity without raw string concatenation.

### 2.6 React Tool Calling Studio (`client/src/App.tsx`)
- Mode Switcher: Toggle seamlessly between **Tool Calling (Phase 8)** and **Autonomous Planning (Phase 7)**.
- Platform Tools Allowlist Bar: Displays registered tools with risk badges (`READ_ONLY`, `LOW_RISK`) and checkboxes to simulate server-side authorization rejection.
- Live State Timeline HUD: Renders execution progression with color-coded status badges for each lifecycle step.
- Tool Executions & Observations Cards: Displays executed tool name, duration in ms, validated arguments, and authoritative observation data.
- Final Verified Answer: Highlights the agent's verified final answer.
- Durable Task Log: Instant lookup of past tasks with tool counts, execution status, and cost metrics from MySQL.

---

## 3. Verification & Testing Matrix

| Scenario | Input Task | Expected Behavior | Observed Result | Status |
|---|---|---|---|:---:|
| **Local Tool (Time)** | `"What time is it in India?"` | Calls `get_current_time`, sets `Asia/Kolkata`, returns formatted time. | Completed in 2 cycles (39ms tool duration). Answer: "Monday, October 5, 2026 at 6:16:41 PM GMT+5:30". | **PASS** |
| **Local Tool (Time - Tokyo)** | `"What time is it in Tokyo (Asia/Tokyo)?"` | Calls `get_current_time`, sets `Asia/Tokyo`, returns Tokyo local time. | Completed in 2 cycles (47ms tool duration). Answer: "Monday, October 5, 2026 at 10:01:32 PM GMT+9". | **PASS** |
| **Local Tool (Math)** | `"Calculate ((125 * 4) + 50) / 5"` | Calls `calculate`, parses expression safely without `eval()`, returns `110`. | Completed in 2 cycles (2ms tool duration). Answer: "The calculated result for expression '((125 * 4) + 50) / 5' is 110." | **PASS** |
| **Security Allowlist Gating** | `"Calculate 10 + 10"` with `allowedTools: ["get_current_time"]` | Host blocks execution; rejects before `calculate` can run. | Returned HTTP 400 with `AGENT_EXECUTION_FAILED: Tool authorization failure: 'calculate' is not permitted by host allowlist.` Task marked `FAILED`. | **PASS** |
| **MySQL Durability** | Post-task completion | Tool execution row exists in `tool_executions` with payload and duration. | Verified via MySQL query `SELECT * FROM tool_executions`. All rows durably recorded. | **PASS** |
| **Server Restart Durability** | Server daemon restart | Completed task history retrieved cleanly via `GET /api/agent/tasks/:id`. | Verified with full tool execution payload returned from MySQL. | **PASS** |
| **TypeScript Compilation** | `npm run build` in `server` and `client` | 0 compiler errors, clean bundle creation. | Server build passed in 4s; Client build passed in 435ms. | **PASS** |

---

## 4. Section 97 — Core Concept Mastery

1. **What tool calling is:**  
   A mechanism where the LLM produces a structured request to invoke a specific, registered application capability with defined parameters, rather than attempting to execute actions directly.
2. **Why an LLM should not directly execute tools:**  
   The LLM is an untrusted reasoning component. Direct execution would permit arbitrary code execution, privilege escalation, cross-tenant data leakage, and system compromise.
3. **What a tool registry is:**  
   A server-owned, authoritative directory of known tools containing their names, descriptions, input/output schemas, risk classifications, and trusted handlers.
4. **What a tool definition contains:**  
   Unique name, description, risk level, Zod input schema, Zod output schema, and the execution handler function.
5. **Why tool inputs require runtime validation:**  
   LLMs frequently hallucinate types, invent invalid parameters, or introduce malicious payloads. Runtime Zod validation guarantees parameters adhere to strict invariants before invoking application logic.
6. **Why tool outputs require validation:**  
   Tools may encounter network errors, database discrepancies, or malformed data. Output validation guarantees the observation fed back into the LLM is deterministic and predictable.
7. **What tool authorization means:**  
   The application host verifies that the requested tool is registered, active, permitted by tenant policy, within the user's role permissions, and included in the execution allowlist before execution.
8. **Why tool allowlists are important:**  
   Allowlists enforce the principle of least privilege, preventing agents from invoking sensitive tools (e.g. email sending or database mutation) during tasks that only require read-only capabilities.
9. **What risk classification means:**  
   Categorizing tools by potential operational impact (`READ_ONLY`, `LOW_RISK`, `MUTATING`, `EXTERNAL_SIDE_EFFECT`) to enable granular authorization policies and future human-in-the-loop approvals.
10. **Difference between model-controlled arguments and host-controlled context:**  
    Model-controlled arguments are user-directed parameters (e.g., `timezone`, `expression`), validated with Zod. Host-controlled context represents trusted identity metadata (`userId`, `organizationId`, `taskId`), injected solely by the host application.
11. **How tool results return to the LLM:**  
    The host normalizes the output into an observation envelope and injects it into the conversation history using standard tool message roles (`role: "tool"`), preserving conversational context.
12. **How the agent loop works:**  
    A bounded cycle where the LLM generates a response; if a tool is requested, the host validates, authorizes, executes the tool, records telemetry, injects the observation, and invokes the LLM again until a final answer is produced.
13. **Why tool calls need limits:**  
    Without limits, an agent could enter an infinite loop of repeated or failing tool calls, exhausting rate limits, inflating financial costs, or hanging system processes.
14. **Why agent cycles and tool calls are different counters:**  
    An agent cycle represents one full turn with the LLM (reasoning step). A cycle may produce a tool call or a final answer. Tracking them independently provides accurate observability.
15. **Why tool execution needs timeouts:**  
    External systems, network services, or complex computations can hang indefinitely. Bounded execution timeouts (e.g., 10 seconds) prevent individual tool failures from locking worker threads.
16. **How tool execution is persisted:**  
    Every invocation is recorded in the relational `tool_executions` table with the associated `task_id`, `tool_name`, input arguments, output envelope, duration, and error status.
17. **How prompt injection can attempt to trigger tools:**  
    Adversarial user input or untrusted external data can command the model to ignore instructions and call unauthorized tools (e.g. `gmail_send` or `execute_sql`).
18. **Why application-level capability restrictions are stronger than prompts alone:**  
    Prompts are non-deterministic guidance. Application-level allowlists, schema validations, and permission checks operate in deterministic compiled code, making bypasses structurally impossible.
19. **Why arbitrary SQL/shell execution is dangerous:**  
    Exposing arbitrary SQL (`execute_sql`) or shell execution (`exec_sh`) gives untrusted model output unrestricted control over infrastructure and database records.
20. **How Web Search will fit into this architecture in Phase 9:**  
    In Phase 9, `web_search` will be registered as a standard `READ_ONLY` tool within the existing registry, with strict input queries, capped result payload size, and normalized search snippet observations.

---

## 5. Phase 8 Completion Checklist

### Tool Architecture
- [x] Tool concept understood
- [x] Tool contract defined (`Tool<TInput, TOutput>`)
- [x] Tool registry implemented (`ToolRegistry`)
- [x] Provider-independent tool abstraction
- [x] Provider-specific schema adapter (`getOpenAIToolDefinitions`)
- [x] Tool call normalization (`NormalizedToolCall`)

### Validation & Authorization
- [x] Tool name validated
- [x] Tool arguments validated via Zod
- [x] Tool output validated via Zod
- [x] Payload sizes bounded
- [x] Server-side tool allowlist enforced
- [x] Risk classifications implemented (`READ_ONLY`, `LOW_RISK`)
- [x] Host-controlled context injection (`ToolContext`)
- [x] Model cannot elevate privileges or modify registry

### Execution & Agent Loop
- [x] Safe local tools implemented (`get_current_time`, `calculate`)
- [x] Zero `eval()` or dangerous execution in math evaluator
- [x] 10s tool timeout race implemented
- [x] Bounded observation loop implemented in `AgentHost`
- [x] Maximum cycles enforced (`MAX_CYCLES = 10`)
- [x] Maximum tool calls enforced (`MAX_TOOL_CALLS = 10`)
- [x] Total execution timeout enforced (`180,000ms`)

### Persistence & Observability
- [x] Persistent storage in MySQL `tool_executions` table
- [x] Task association (`task_id`) preserved
- [x] Duration in milliseconds recorded
- [x] Input and output JSON payloads preserved
- [x] React Tool Calling Studio with real-time HUD and execution cards
- [x] Final verified answer card displayed

### Security & Scope Guardrails
- [x] No arbitrary code execution / no `eval()`
- [x] No arbitrary SQL / no raw database tools
- [x] No arbitrary HTTP requests
- [x] Web Search deferred to Phase 9
- [x] MySQL verification tool deferred to Phase 10
- [x] Background workers deferred to Phase 18

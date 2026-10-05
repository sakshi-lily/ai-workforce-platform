import { useState, useEffect } from 'react';

type HealthStatus = 'idle' | 'loading' | 'success' | 'error';

interface ProcessHealth {
  status: string;
}

interface DbHealth {
  status: string;
  database: string;
  databaseName?: string;
  serverVersion?: string;
  error?: string;
}

interface RedisHealth {
  status: string;
  redis: string;
  host: string;
  port: number;
  latencyMs?: number;
  error?: string;
  fallback?: string;
}

interface AIHealth {
  status: string;
  ai: string;
  provider: string;
  model: string;
  mode: string;
  timeoutMs: number;
  error?: string;
}

interface QdrantHealth {
  status: string;
  qdrant: string;
  collection: string;
  collectionsCount?: number;
  latencyMs?: number;
  error?: string;
}

interface Customer {
  id: string;
  user_id: string;
  company_name: string;
  domain: string;
  contact_name: string | null;
  contact_email: string | null;
  industry: string | null;
  qualification_score: number | null;
  qualification_rationale: string | null;
  status: 'NEW' | 'QUALIFIED' | 'CONTACTED' | 'DISQUALIFIED' | 'CUSTOMER';
  created_at: string;
  updated_at: string;
}

interface AITelemetry {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
  status: string;
}

interface StructuredOutput {
  summary: string;
  topics: string[];
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'MIXED';
  confidence: number;
  keyInsights: string[];
}

interface TelemetryRecord {
  id: string;
  task_id: string | null;
  provider: string;
  model: string;
  prompt_type: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number;
  estimated_cost_usd: string;
  status: string;
  created_at: string;
}

// Phase 7 & 8 - Agent & Tool Calling Types
export type ToolRiskLevel = 'READ_ONLY' | 'LOW_RISK' | 'MUTATING' | 'EXTERNAL_SIDE_EFFECT';

export interface RegisteredTool {
  name: string;
  description: string;
  riskLevel: ToolRiskLevel;
}

export interface ClientToolExecution {
  id: string;
  tool: string;
  arguments: Record<string, unknown>;
  result: unknown;
  durationMs: number;
  success: boolean;
}

interface AgentPlanStep {
  order: number;
  title?: string;
  description: string;
}

interface AgentPlan {
  goal: string;
  summary: string;
  steps: AgentPlanStep[];
}

interface AgentTimelineEvent {
  state: string;
  timestamp: string;
  details?: string;
}

interface AgentExecutionResult {
  taskId: string;
  status: string;
  cycles: number;
  latencyMs: number;
  plan: AgentPlan | null;
  steps: Array<{
    id: string;
    step_order: number;
    title: string;
    description: string;
    status: string;
  }>;
  finalAnswer?: string | null;
  toolExecutions?: ClientToolExecution[];
  telemetry: {
    model: string;
    totalTokens: number;
    estimatedCostUsd: number;
  } | null;
  timeline: AgentTimelineEvent[];
  error?: string;
}

interface AgentTaskSummary {
  id: string;
  title: string;
  prompt: string;
  status: string;
  priority: string;
  stepCount: number;
  totalCostUsd: number;
  createdAt: string;
  completedAt: string | null;
}

export default function App() {
  // Layer 1: Express Health
  const [backendStatus, setBackendStatus] = useState<HealthStatus>('idle');
  const [backendData, setBackendData] = useState<ProcessHealth | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);

  // Layer 2: MySQL Health
  const [dbStatus, setDbStatus] = useState<HealthStatus>('idle');
  const [dbData, setDbData] = useState<DbHealth | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [dbLatency, setDbLatency] = useState<number | null>(null);

  // Layer 3: Redis Health
  const [redisStatus, setRedisStatus] = useState<HealthStatus>('idle');
  const [redisData, setRedisData] = useState<RedisHealth | null>(null);
  const [redisError, setRedisError] = useState<string | null>(null);
  const [redisLatency, setRedisLatency] = useState<number | null>(null);

  // Layer 4: AI / LLM Health
  const [aiStatus, setAiStatus] = useState<HealthStatus>('idle');
  const [aiData, setAiData] = useState<AIHealth | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLatency, setAiLatency] = useState<number | null>(null);

  // Layer 5: Qdrant Vector DB Health (Phase 11)
  const [qdrantStatus, setQdrantStatus] = useState<HealthStatus>('idle');
  const [qdrantData, setQdrantData] = useState<QdrantHealth | null>(null);
  const [qdrantError, setQdrantError] = useState<string | null>(null);
  const [qdrantLatency, setQdrantLatency] = useState<number | null>(null);

  // Customer Data state
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customersSource, setCustomersSource] = useState<'cache' | 'database' | null>(null);
  const [customersLatency, setCustomersLatency] = useState<number | null>(null);
  const [customersLoading, setCustomersLoading] = useState<boolean>(false);
  const [customersError, setCustomersError] = useState<string | null>(null);

  // Search / Lookup state
  const [searchDomain, setSearchDomain] = useState<string>('');
  const [searchResult, setSearchResult] = useState<Customer | null>(null);
  const [searchSource, setSearchSource] = useState<'cache' | 'database' | null>(null);
  const [searchLatency, setSearchLatency] = useState<number | null>(null);
  const [searchLoading, setSearchLoading] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // New Customer Form state
  const [newCompany, setNewCompany] = useState<string>('');
  const [newDomain, setNewDomain] = useState<string>('');
  const [newIndustry, setNewIndustry] = useState<string>('');
  const [createLoading, setCreateLoading] = useState<boolean>(false);
  const [createMessage, setCreateMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Phase 6: AI Playground state
  const [aiPrompt, setAiPrompt] = useState<string>('Explain why Redis should not replace MySQL in our platform.');
  const [aiMode, setAiMode] = useState<'generate' | 'summarize'>('generate');
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiResultText, setAiResultText] = useState<string | null>(null);
  const [aiStructuredResult, setAiStructuredResult] = useState<StructuredOutput | null>(null);
  const [aiTelemetry, setAiTelemetry] = useState<AITelemetry | null>(null);
  const [aiExecutionError, setAiExecutionError] = useState<string | null>(null);
  const [telemetryHistory, setTelemetryHistory] = useState<TelemetryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);

  // Phase 7, 8, 9: Simple Agent, Tool Calling & Web Search state
  const [agentMode, setAgentMode] = useState<'tools' | 'planning'>('tools');
  const [registeredTools, setRegisteredTools] = useState<RegisteredTool[]>([]);
  const [selectedTools, setSelectedTools] = useState<string[]>(['get_current_time', 'calculate', 'web_search', 'mysql_verify_customer']);
  const [agentTaskPrompt, setAgentTaskPrompt] = useState<string>('Find the current CEO of Microsoft and summarize the key facts.');
  const [agentLoading, setAgentLoading] = useState<boolean>(false);
  const [agentResult, setAgentResult] = useState<AgentExecutionResult | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [agentTasks, setAgentTasks] = useState<AgentTaskSummary[]>([]);
  const [agentTasksLoading, setAgentTasksLoading] = useState<boolean>(false);

  // 1. Check Express Process Health
  const checkBackend = async () => {
    setBackendStatus('loading');
    setBackendError(null);
    try {
      const res = await fetch('http://localhost:3000/api/health');
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      setBackendData(data);
      setBackendStatus('success');
    } catch (err: unknown) {
      setBackendStatus('error');
      setBackendError(err instanceof Error ? err.message : 'Backend unreachable');
    }
  };

  // 2. Check Database Health (MySQL Connection Pool)
  const checkDb = async () => {
    setDbStatus('loading');
    setDbError(null);
    const start = performance.now();
    try {
      const res = await fetch('http://localhost:3000/api/health/db');
      const elapsed = Math.round(performance.now() - start);
      setDbLatency(elapsed);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const data = await res.json();
      setDbData(data);
      setDbStatus('success');
    } catch (err: unknown) {
      const elapsed = Math.round(performance.now() - start);
      setDbLatency(elapsed);
      setDbStatus('error');
      setDbError(err instanceof Error ? err.message : 'Database check failed');
    }
  };

  // 3. Check Redis Health
  const checkRedis = async () => {
    setRedisStatus('loading');
    setRedisError(null);
    const start = performance.now();
    try {
      const res = await fetch('http://localhost:3000/api/health/redis');
      const elapsed = Math.round(performance.now() - start);
      setRedisLatency(elapsed);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}: Redis unavailable`);
      }
      setRedisData(data);
      setRedisStatus('success');
    } catch (err: unknown) {
      const elapsed = Math.round(performance.now() - start);
      setRedisLatency(elapsed);
      setRedisStatus('error');
      setRedisError(err instanceof Error ? err.message : 'Redis check failed');
    }
  };

  // 4. Check AI / LLM Provider Health
  const checkAiHealth = async () => {
    setAiStatus('loading');
    setAiError(null);
    const start = performance.now();
    try {
      const res = await fetch('http://localhost:3000/api/health/ai');
      const elapsed = Math.round(performance.now() - start);
      setAiLatency(elapsed);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
      setAiData(data);
      setAiStatus('success');
    } catch (err: unknown) {
      const elapsed = Math.round(performance.now() - start);
      setAiLatency(elapsed);
      setAiStatus('error');
      setAiError(err instanceof Error ? err.message : 'AI service unavailable');
    }
  };

  // 5. Check Qdrant Vector DB Health (Phase 11)
  const checkQdrantHealth = async () => {
    setQdrantStatus('loading');
    setQdrantError(null);
    const start = performance.now();
    try {
      const res = await fetch('http://localhost:3000/api/health/qdrant');
      const elapsed = Math.round(performance.now() - start);
      setQdrantLatency(elapsed);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setQdrantData(data);
      setQdrantStatus('success');
    } catch (err: unknown) {
      const elapsed = Math.round(performance.now() - start);
      setQdrantLatency(elapsed);
      setQdrantStatus('error');
      setQdrantError(err instanceof Error ? err.message : 'Qdrant unavailable');
    }
  };

  // 6. Fetch Customers with Cache-Aside Telemetry
  const fetchCustomers = async () => {
    setCustomersLoading(true);
    setCustomersError(null);
    try {
      const res = await fetch('http://localhost:3000/api/customers');
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const result = await res.json();
      setCustomers(result.data || []);
      setCustomersSource(result.source);
      setCustomersLatency(result.latencyMs);
    } catch (err: unknown) {
      setCustomersError(err instanceof Error ? err.message : 'Failed to fetch customers');
    } finally {
      setCustomersLoading(false);
    }
  };

  // 6. Parameterized Domain Lookup
  const handleDomainSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchDomain.trim()) return;

    setSearchLoading(true);
    setSearchError(null);
    setSearchResult(null);

    try {
      const res = await fetch(`http://localhost:3000/api/customers/lookup?domain=${encodeURIComponent(searchDomain.trim())}`);
      const json = await res.json();
      if (res.status === 404) {
        setSearchError(`No customer found with domain '${searchDomain}'`);
        setSearchSource(json.source);
        setSearchLatency(json.latencyMs);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      setSearchResult(json.data);
      setSearchSource(json.source);
      setSearchLatency(json.latencyMs);
    } catch (err: unknown) {
      setSearchError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setSearchLoading(false);
    }
  };

  // 7. Create Customer in MySQL & Invalidate Cache
  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompany.trim() || !newDomain.trim()) return;

    setCreateLoading(true);
    setCreateMessage(null);

    try {
      const res = await fetch('http://localhost:3000/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: newCompany.trim(),
          domain: newDomain.trim(),
          industry: newIndustry.trim() || undefined,
          status: 'NEW',
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || `Failed to create customer (HTTP ${res.status})`);
      }

      setCreateMessage({
        type: 'success',
        text: `Created '${json.data.company_name}' & invalidated cache! Next read will trigger a Cache MISS.`,
      });
      setNewCompany('');
      setNewDomain('');
      setNewIndustry('');
      fetchCustomers();
    } catch (err: unknown) {
      setCreateMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to create customer',
      });
    } finally {
      setCreateLoading(false);
    }
  };

  // 8. Fetch AI Telemetry from MySQL
  const fetchTelemetryHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('http://localhost:3000/api/ai/telemetry?limit=8');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setTelemetryHistory(json.data || []);
    } catch {
      // Telemetry fetch non-blocking
    } finally {
      setHistoryLoading(false);
    }
  };

  // 9. Execute AI Request (Free-form or Structured)
  const handleExecuteAi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;

    setAiLoading(true);
    setAiExecutionError(null);
    setAiResultText(null);
    setAiStructuredResult(null);
    setAiTelemetry(null);

    try {
      const endpoint = aiMode === 'generate' ? '/api/ai/generate' : '/api/ai/summarize';
      const body = aiMode === 'generate' ? { prompt: aiPrompt.trim() } : { text: aiPrompt.trim() };

      const res = await fetch(`http://localhost:3000${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error?.message || json.message || `AI request failed (HTTP ${res.status})`);
      }

      if (aiMode === 'generate') {
        setAiResultText(json.output);
      } else {
        setAiStructuredResult(json.output);
      }
      setAiTelemetry(json.telemetry);
      fetchTelemetryHistory();
    } catch (err: unknown) {
      setAiExecutionError(err instanceof Error ? err.message : 'An error occurred during AI execution.');
    } finally {
      setAiLoading(false);
    }
  };

  // 10. Phase 7 & 8: Fetch Agent Tasks from MySQL
  const fetchAgentTasks = async () => {
    setAgentTasksLoading(true);
    try {
      const res = await fetch('http://localhost:3000/api/agent/tasks?limit=10');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setAgentTasks(json.data || []);
    } catch {
      // Task history fetch non-blocking
    } finally {
      setAgentTasksLoading(false);
    }
  };

  // 10b. Phase 8: Fetch Registered Tools Catalog
  const fetchRegisteredTools = async () => {
    try {
      const res = await fetch('http://localhost:3000/api/agent/tools');
      if (!res.ok) return;
      const json = await res.json();
      if (json.data) {
        setRegisteredTools(json.data);
      }
    } catch {
      // Tool catalog fetch non-blocking
    }
  };

  // 11. Phase 7 & 8: Execute Agent Task (Tool Calling or Autonomous Planning)
  const handleRunAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentTaskPrompt.trim()) return;

    setAgentLoading(true);
    setAgentError(null);
    setAgentResult(null);

    try {
      const res = await fetch('http://localhost:3000/api/agent/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: agentTaskPrompt.trim(),
          mode: agentMode,
          allowedTools: selectedTools,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        if (json.data) {
          // Execution completed with FAILED state (e.g., authorization rejection)
          setAgentResult(json.data);
        }
        throw new Error(json.error?.message || json.message || `Agent execution failed (HTTP ${res.status})`);
      }

      setAgentResult(json.data);
      fetchAgentTasks();
      fetchTelemetryHistory();
    } catch (err: unknown) {
      setAgentError(err instanceof Error ? err.message : 'Agent execution failed');
    } finally {
      setAgentLoading(false);
    }
  };

  // 12. Phase 7 & 8: Load Agent Task from History
  const loadTaskDetails = async (taskId: string) => {
    try {
      const res = await fetch(`http://localhost:3000/api/agent/tasks/${taskId}`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.data) {
        const rawTools = json.data.toolExecutions || [];
        const parsedTools: ClientToolExecution[] = rawTools.map((t: any) => {
          let parsedOutput = t.output_payload;
          if (typeof t.output_payload === 'string') {
            try {
              parsedOutput = JSON.parse(t.output_payload);
            } catch {
              parsedOutput = t.output_payload;
            }
          }
          return {
            id: t.id,
            tool: t.tool_name,
            arguments: t.input_payload || {},
            result: parsedOutput,
            durationMs: t.duration_ms,
            success: !t.is_error,
          };
        });

        setAgentResult({
          taskId: json.data.task.id,
          status: json.data.task.status,
          cycles: json.data.task.cycles || 1,
          latencyMs: json.data.telemetry?.latencyMs || 0,
          plan: json.data.plan,
          steps: json.data.steps || [],
          finalAnswer: json.data.task.final_report,
          toolExecutions: parsedTools,
          telemetry: json.data.telemetry,
          timeline: [
            { state: 'REQUESTED', timestamp: json.data.task.created_at, details: 'Created' },
            { state: 'RUNNING', timestamp: json.data.task.started_at || json.data.task.created_at, details: 'Host started' },
            { state: json.data.task.status, timestamp: json.data.task.completed_at || json.data.task.updated_at, details: `Task finished with status ${json.data.task.status}` },
          ],
        });
        setAgentTaskPrompt(json.data.task.prompt);
      }
    } catch {
      // Non-blocking
    }
  };

  // Mount effects
  useEffect(() => {
    checkBackend();
    checkDb();
    checkRedis();
    checkAiHealth();
    checkQdrantHealth();
    fetchCustomers();
    fetchTelemetryHistory();
    fetchAgentTasks();
    fetchRegisteredTools();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-8 font-sans selection:bg-rose-500 selection:text-white">
      {/* Background ambient lighting */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-10 left-1/3 w-80 h-80 bg-purple-600/10 rounded-full blur-3xl"></div>
      </div>

      <div className="relative z-10 max-w-5xl w-full mx-auto space-y-8">
        {/* Header */}
        <header className="border-b border-slate-800 pb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="inline-block w-3 h-3 rounded-full bg-cyan-400 animate-pulse"></span>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                  AI Workforce Platform
                </h1>
              </div>
              <p className="mt-1 text-sm text-slate-400">
                Phase 11 — Vector Database / Qdrant (Semantic Search over Internal Unstructured Knowledge)
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 text-xs font-medium rounded-full bg-cyan-950/80 border border-cyan-500/30 text-cyan-300">
                Qdrant 1.13 Vector
              </span>
              <span className="px-3 py-1 text-xs font-medium rounded-full bg-emerald-950/80 border border-emerald-500/30 text-emerald-300">
                MySQL 8.4 Truth
              </span>
              <span className="px-3 py-1 text-xs font-medium rounded-full bg-rose-950/80 border border-rose-500/30 text-rose-300">
                Redis 8.10 Cache
              </span>
              <span className="px-3 py-1 text-xs font-medium rounded-full bg-purple-950/80 border border-purple-500/30 text-purple-300">
                OpenAI / Mock LLM
              </span>
            </div>
          </div>
        </header>

        {/* Section 1: 5-Tier System Health Checks */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Card A: Express Backend Health */}
          <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-4 shadow-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Tier 1</span>
                <span className="text-[11px] text-slate-500 font-mono">:3000</span>
              </div>
              <h2 className="text-sm font-semibold text-white mt-1">Express API</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Trust Boundary & Routing</p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
              <div>
                {backendStatus === 'idle' && <span className="text-xs text-slate-500">Not verified</span>}
                {backendStatus === 'loading' && <span className="text-xs text-indigo-400 animate-pulse">Pinging...</span>}
                {backendStatus === 'success' && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    {backendData?.status.toUpperCase()}
                  </span>
                )}
                {backendStatus === 'error' && (
                  <span className="text-xs font-medium text-rose-400">Offline: {backendError}</span>
                )}
              </div>
              <button
                type="button"
                id="check-backend-btn"
                onClick={checkBackend}
                disabled={backendStatus === 'loading'}
                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
              >
                Ping
              </button>
            </div>
          </div>

          {/* Card B: MySQL Database Health */}
          <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-4 shadow-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400">Tier 2</span>
                <span className="text-[11px] text-slate-500 font-mono">:3306</span>
              </div>
              <h2 className="text-sm font-semibold text-white mt-1">MySQL Truth</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">{dbData?.databaseName || 'ai_workforce'} &bull; v{dbData?.serverVersion || '8.4'}</p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
              <div>
                {dbStatus === 'idle' && <span className="text-xs text-slate-500">Not verified</span>}
                {dbStatus === 'loading' && <span className="text-xs text-emerald-400 animate-pulse">Pinging...</span>}
                {dbStatus === 'success' && (
                  <div className="flex flex-col">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                      Connected
                    </span>
                    <span className="text-[10px] text-slate-400">{dbLatency}ms</span>
                  </div>
                )}
                {dbStatus === 'error' && (
                  <span className="text-xs font-medium text-rose-400">Failed: {dbError}</span>
                )}
              </div>
              <button
                type="button"
                id="check-db-btn"
                onClick={checkDb}
                disabled={dbStatus === 'loading'}
                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-700 hover:bg-emerald-600 text-white transition-colors cursor-pointer shadow-sm"
              >
                Ping
              </button>
            </div>
          </div>

          {/* Card C: Redis Cache Health */}
          <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-4 shadow-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-rose-400">Tier 3</span>
                <span className="text-[11px] text-slate-500 font-mono">:6379</span>
              </div>
              <h2 className="text-sm font-semibold text-white mt-1">Redis Cache</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">{redisData?.host || '127.0.0.1'}:{redisData?.port || 6379}</p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
              <div>
                {redisStatus === 'idle' && <span className="text-xs text-slate-500">Not verified</span>}
                {redisStatus === 'loading' && <span className="text-xs text-rose-400 animate-pulse">Pinging...</span>}
                {redisStatus === 'success' && (
                  <div className="flex flex-col">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-400">
                      <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                      PONG
                    </span>
                    <span className="text-[10px] text-slate-400">{redisLatency}ms</span>
                  </div>
                )}
                {redisStatus === 'error' && (
                  <span className="text-xs font-medium text-amber-400">Degraded: {redisError}</span>
                )}
              </div>
              <button
                type="button"
                id="check-redis-btn"
                onClick={checkRedis}
                disabled={redisStatus === 'loading'}
                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer shadow-sm"
              >
                Ping
              </button>
            </div>
          </div>

          {/* Card D: AI / LLM Provider Health */}
          <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-4 shadow-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-purple-400">Tier 4</span>
                <span className="text-[11px] text-purple-400 font-mono">LLM</span>
              </div>
              <h2 className="text-sm font-semibold text-white mt-1">LLM Provider</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">{aiData?.model || 'gpt-4o-mini'}</p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
              <div>
                {aiStatus === 'idle' && <span className="text-xs text-slate-500">Not verified</span>}
                {aiStatus === 'loading' && <span className="text-xs text-purple-400 animate-pulse">Checking...</span>}
                {aiStatus === 'success' && (
                  <div className="flex flex-col">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-400">
                      <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                      {aiData?.provider.toUpperCase()}
                    </span>
                    <span className="text-[10px] text-slate-400">{aiData?.mode} &bull; {aiLatency}ms</span>
                  </div>
                )}
                {aiStatus === 'error' && (
                  <span className="text-xs font-medium text-rose-400">Unavailable: {aiError}</span>
                )}
              </div>
              <button
                type="button"
                id="check-ai-btn"
                onClick={checkAiHealth}
                disabled={aiStatus === 'loading'}
                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-purple-700 hover:bg-purple-600 text-white transition-colors cursor-pointer shadow-sm"
              >
                Ping
              </button>
            </div>
          </div>

          {/* Card E: Qdrant Vector DB Health (Phase 11) */}
          <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-4 shadow-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400">Tier 5</span>
                <span className="text-[11px] text-cyan-400 font-mono">:6333</span>
              </div>
              <h2 className="text-sm font-semibold text-white mt-1">Qdrant Vector DB</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">{qdrantData?.collection || 'internal_knowledge'}</p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
              <div>
                {qdrantStatus === 'idle' && <span className="text-xs text-slate-500">Not verified</span>}
                {qdrantStatus === 'loading' && <span className="text-xs text-cyan-400 animate-pulse">Checking...</span>}
                {qdrantStatus === 'success' && (
                  <div className="flex flex-col">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-400">
                      <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                      CONNECTED
                    </span>
                    <span className="text-[10px] text-slate-400">{qdrantData?.collectionsCount || 1} col &bull; {qdrantLatency}ms</span>
                  </div>
                )}
                {qdrantStatus === 'error' && (
                  <span className="text-xs font-medium text-rose-400">Unavailable: {qdrantError}</span>
                )}
              </div>
              <button
                type="button"
                id="check-qdrant-btn"
                onClick={checkQdrantHealth}
                disabled={qdrantStatus === 'loading'}
                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-cyan-700 hover:bg-cyan-600 text-white transition-colors cursor-pointer shadow-sm"
              >
                Ping
              </button>
            </div>
          </div>
        </section>

        {/* Section 2: Phase 7 & 8 — Agent Host & Tool Execution Studio */}
        <section className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-cyan-900/40 p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-xl bg-cyan-950/80 border border-cyan-500/40 text-cyan-300">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </span>
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    Agent Host & Tool Execution Studio
                    <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-700/50 text-cyan-300">
                      Phase 11: Vector Database / Qdrant
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Host boundary: <code className="text-cyan-300 font-mono">LLM Proposes → Host Authorizes → Server Embeddings & Tenant Filter → Qdrant Vector Retrieval → LLM Observation</code>
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-400">
                Watchdogs: <strong className="text-cyan-300">10 Cycles</strong> &bull; <strong className="text-purple-300">10 Tools</strong> &bull; <strong className="text-emerald-300">5 Searches</strong> &bull; <strong className="text-cyan-400">5 Vectors</strong> &bull; <strong className="text-slate-200">180s</strong>
              </span>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center gap-2 bg-slate-950/80 p-1.5 rounded-xl border border-slate-800 w-fit">
            <button
              type="button"
              onClick={() => {
                setAgentMode('tools');
                setAgentTaskPrompt('What is our company remote work policy and how many days can employees work from home?');
              }}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
                agentMode === 'tools'
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>⚡ Tool Calling & Semantic Retrieval (Phase 11)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAgentMode('planning');
                setAgentTaskPrompt('Find potential customers for our AI automation product.');
              }}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
                agentMode === 'planning'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>📋 Autonomous Planning Mode (Phase 7)</span>
            </button>
          </div>

          {/* Authoritative Tool Allowlist & Catalog Bar */}
          {agentMode === 'tools' && (
            <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800/80 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <span>Authoritative Platform Tools (Server Gated):</span>
                  <span className="text-[10px] text-slate-500 font-mono font-normal">Toggle to test security allowlist rejection</span>
                </span>
                <span className="text-[10px] font-mono text-cyan-400">
                  {selectedTools.length} of {registeredTools.length} enabled
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {registeredTools.map((tool) => {
                  const isChecked = selectedTools.includes(tool.name);
                  return (
                    <label
                      key={tool.name}
                      className={`p-3 rounded-lg border text-xs cursor-pointer transition-all flex items-start justify-between gap-3 ${
                        isChecked
                          ? 'bg-slate-900/90 border-cyan-800/70 text-slate-100 shadow-sm'
                          : 'bg-slate-950/50 border-slate-800/80 text-slate-500 opacity-60'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTools([...selectedTools, tool.name]);
                            } else {
                              setSelectedTools(selectedTools.filter((t) => t !== tool.name));
                            }
                          }}
                          className="mt-0.5 accent-cyan-500 rounded cursor-pointer"
                        />
                        <div>
                          <div className="font-mono font-bold text-cyan-300">{tool.name}</div>
                          <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{tool.description}</p>
                        </div>
                      </div>
                      <span
                        className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full shrink-0 ${
                          tool.riskLevel === 'READ_ONLY'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/50'
                            : 'bg-amber-950 text-amber-300 border border-amber-800/50'
                        }`}
                      >
                        {tool.riskLevel}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Presets */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              {agentMode === 'tools' ? 'Phase 11 Semantic Retrieval & Multi-Source Presets:' : 'Phase 7 Planning Presets:'}
            </span>
            <div className="flex flex-wrap gap-2">
              {agentMode === 'tools' ? (
                <>
                  <button
                    type="button"
                    onClick={() => setAgentTaskPrompt('What is our company remote work policy and how many days can employees work from home?')}
                    className="text-[11px] px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-500/50 text-cyan-300 transition-colors cursor-pointer"
                  >
                    📖 Policy: Remote Work Guidelines
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgentTaskPrompt('How quickly must customer support respond to tickets and what is the SLA for P1 outages?')}
                    className="text-[11px] px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-500/50 text-cyan-300 transition-colors cursor-pointer"
                  >
                    🎧 SLA: Customer Support Protocol
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgentTaskPrompt('What are our cryptographic standards for customer data encryption at rest and in transit?')}
                    className="text-[11px] px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-500/50 text-cyan-300 transition-colors cursor-pointer"
                  >
                    🔒 Security: Cryptography Standards
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgentTaskPrompt('What is the company Mars exploration and interplanetary travel policy?')}
                    className="text-[11px] px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-purple-500/50 text-purple-300 transition-colors cursor-pointer"
                  >
                    🚀 Out-of-Domain: Mars Policy (Empty)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgentTaskPrompt('Check whether customer sarah@apexcloud.io already exists in our customer database and report their qualification status.')}
                    className="text-[11px] px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-emerald-500/50 text-emerald-300 transition-colors cursor-pointer"
                  >
                    🏢 MySQL Verify: sarah@apexcloud.io
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgentTaskPrompt('Search the web for Apex Cloud Innovations and verify whether contact sarah@apexcloud.io is an existing customer in our database.')}
                    className="text-[11px] px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-500/50 text-cyan-300 transition-colors cursor-pointer"
                  >
                    🌐+🏢 Web + MySQL: Apex Cloud
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgentTaskPrompt('Calculate ((125 * 4) + 50) / 5')}
                    className="text-[11px] px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-500/50 text-slate-300 transition-colors cursor-pointer"
                  >
                    🔢 Calculate
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setAgentTaskPrompt('Find potential customers for our AI automation product.')}
                    className="text-[11px] px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-500/50 text-slate-300 transition-colors cursor-pointer"
                  >
                    Customer Discovery Plan
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgentTaskPrompt('Analyze inbound enterprise healthcare leads and establish compliance qualification workflow.')}
                    className="text-[11px] px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-500/50 text-slate-300 transition-colors cursor-pointer"
                  >
                    Healthcare ICP Qualification
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgentTaskPrompt('Plan automated database synchronization audit and reconciliation between MySQL and Redis.')}
                    className="text-[11px] px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-cyan-500/50 text-slate-300 transition-colors cursor-pointer"
                  >
                    Database Audit Plan
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleRunAgent} className="space-y-3">
            <textarea
              rows={3}
              required
              value={agentTaskPrompt}
              onChange={(e) => setAgentTaskPrompt(e.target.value)}
              placeholder={agentMode === 'tools' ? "Ask the Agent a question requiring tools (e.g. 'What time is it in India?', 'Calculate (25 * 40)')..." : "Enter high-level user instruction for the Planning Agent..."}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono resize-y"
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-[11px] text-slate-500">
                Endpoint: <code className="text-cyan-400 font-mono">POST /api/agent/tasks</code> &bull; Mode: <strong className="text-slate-300">{agentMode}</strong>
              </div>
              <button
                type="submit"
                id="run-agent-btn"
                disabled={agentLoading || !agentTaskPrompt.trim()}
                className="px-6 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white shadow-lg shadow-cyan-950 transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                {agentLoading ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    <span>Executing Agent Cycle...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <span>Run Agent</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Error Banner */}
          {agentError && (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-900/60 text-rose-300 text-xs flex items-start gap-2.5">
              <svg className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <strong>Execution Halt / Security Rejection:</strong> {agentError}
              </div>
            </div>
          )}

          {/* Active Agent Output & Timeline */}
          {agentResult && (
            <div className="space-y-5 pt-2 border-t border-slate-800">
              {/* Telemetry & State Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 p-3.5 rounded-xl bg-slate-950 border border-cyan-900/40 text-xs font-mono">
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase">Task Status</span>
                  <span className={`font-semibold inline-flex items-center gap-1.5 ${agentResult.status === 'COMPLETED' ? 'text-emerald-400' : 'text-rose-400'}`}>
                    <span className={`w-2 h-2 rounded-full ${agentResult.status === 'COMPLETED' ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                    {agentResult.status}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase">Cycle Watchdog</span>
                  <span className="font-semibold text-cyan-300">{agentResult.cycles} / 10 MAX</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase">Tools Watchdog</span>
                  <span className="font-semibold text-purple-300">{(agentResult.toolExecutions?.length ?? 0)} / 10 MAX</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase">Latency</span>
                  <span className="font-semibold text-white">{agentResult.latencyMs} ms</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase">Total Tokens</span>
                  <span className="font-semibold text-purple-300">{agentResult.telemetry?.totalTokens ?? 0}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block uppercase">Est. Cost</span>
                  <span className="font-semibold text-amber-300">${(agentResult.telemetry?.estimatedCostUsd ?? 0).toFixed(6)}</span>
                </div>
              </div>

              {/* State Machine Timeline HUD */}
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block">Host Execution Lifecycle Timeline</span>
                <div className="flex flex-wrap items-center gap-2">
                  {agentResult.timeline.map((event, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium flex items-center gap-1.5 ${
                        event.state === 'COMPLETED'
                          ? 'bg-emerald-950 border border-emerald-700/50 text-emerald-300'
                          : event.state === 'FAILED'
                          ? 'bg-rose-950 border border-rose-700/50 text-rose-300'
                          : event.state.startsWith('TOOL_')
                          ? 'bg-purple-950 border border-purple-700/50 text-purple-300'
                          : 'bg-slate-900 border border-slate-800 text-cyan-300'
                      }`}>
                        <span>✓</span>
                        <span>{event.state}</span>
                      </span>
                      {idx < agentResult.timeline.length - 1 && (
                        <span className="text-slate-600 font-mono text-xs">→</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Phase 8 Tool Executions & Observations List */}
              {agentResult.toolExecutions && agentResult.toolExecutions.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-purple-300 flex items-center gap-2">
                      <span>Tool Executions & Observations</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-purple-950 border border-purple-800 text-purple-300">
                        {agentResult.toolExecutions.length} Recorded in MySQL <code className="text-purple-200">tool_executions</code>
                      </span>
                    </span>
                  </div>

                  <div className="space-y-3">
                    {agentResult.toolExecutions.map((exec) => (
                      <div
                        key={exec.id}
                        className="p-4 rounded-xl bg-slate-950/90 border border-purple-900/50 shadow-md space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                          <div className="flex items-center gap-2.5">
                            <span className="px-2 py-0.5 rounded bg-purple-950 border border-purple-700/60 font-mono font-bold text-xs text-purple-300">
                              {exec.tool}
                            </span>
                            <span className="text-[11px] font-mono text-slate-400">
                              Duration: <strong className="text-white">{exec.durationMs} ms</strong>
                            </span>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                              exec.success
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/50'
                                : 'bg-rose-950 text-rose-300 border border-rose-800/50'
                            }`}
                          >
                            {exec.success ? '✓ SUCCESS' : 'FAILED'}
                          </span>
                        </div>

                        {exec.tool === 'web_search' && exec.result && typeof exec.result === 'object' && 'results' in (exec.result as any) ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between text-xs px-1">
                              <span className="text-slate-400">
                                Search Query: <span className="font-semibold text-cyan-300 font-mono">"{((exec.result as any).query || (exec.arguments as any)?.query)}"</span>
                              </span>
                              <span className="text-[11px] text-purple-300 font-mono bg-purple-950/60 border border-purple-800/40 px-2 py-0.5 rounded">
                                {((exec.result as any).results || []).length} Normalized Results Returned
                              </span>
                            </div>

                            <div className="space-y-2">
                              {((exec.result as any).results || []).map((item: any, idx: number) => (
                                <div key={idx} className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-colors space-y-1.5">
                                  <div className="flex items-start justify-between gap-2">
                                    <a
                                      href={item.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs font-semibold text-cyan-300 hover:text-cyan-200 hover:underline flex items-center gap-1.5"
                                    >
                                      <span>{item.title}</span>
                                      <span className="text-[10px] text-slate-500 font-mono">↗</span>
                                    </a>
                                    {item.domain && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400 shrink-0">
                                        {item.domain}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-slate-300 leading-relaxed">
                                    {item.snippet}
                                  </p>
                                  <div className="text-[10px] font-mono text-slate-500 truncate">
                                    {item.url}
                                  </div>
                                </div>
                              ))}
                            </div>

                            <details className="text-xs group">
                              <summary className="cursor-pointer text-[11px] font-mono text-slate-500 hover:text-slate-300 select-none">
                                ▸ Inspect Raw Observation Payload (LLM Observation Data)
                              </summary>
                              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 font-mono space-y-1">
                                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans font-medium">
                                    Validated Input (Zod)
                                  </span>
                                  <pre className="text-[11px] text-cyan-300 overflow-x-auto whitespace-pre-wrap">
                                    {JSON.stringify(exec.arguments, null, 2)}
                                  </pre>
                                </div>
                                <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 font-mono space-y-1">
                                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans font-medium">
                                    Authoritative Observation
                                  </span>
                                  <pre className="text-[11px] text-emerald-300 overflow-x-auto whitespace-pre-wrap">
                                    {JSON.stringify(exec.result, null, 2)}
                                  </pre>
                                </div>
                              </div>
                            </details>
                          </div>
                        ) : exec.tool === 'mysql_verify_customer' && exec.result && typeof exec.result === 'object' ? (
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center justify-between text-xs px-1 gap-2">
                              <span className="text-slate-400">
                                Lookup Email: <span className="font-semibold text-cyan-300 font-mono">"{(exec.arguments as any)?.email}"</span>
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold ${
                                  (exec.result as any)?.found
                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                                    : 'bg-amber-950 text-amber-300 border border-amber-800/60'
                                }`}
                              >
                                {(exec.result as any)?.found ? '✓ VERIFIED IN DATABASE' : '✗ NOT FOUND IN DATABASE'}
                              </span>
                            </div>

                            {(exec.result as any)?.found && (exec.result as any)?.customer ? (
                              <div className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800 space-y-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-white">{(exec.result as any).customer.company_name}</span>
                                    <span className="text-xs font-mono text-cyan-400">({(exec.result as any).customer.domain})</span>
                                  </div>
                                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-950 text-indigo-300 border border-indigo-800/60 font-mono">
                                    {(exec.result as any).customer.status}
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-1.5 border-t border-slate-800/60">
                                  <div>
                                    <span className="text-slate-500 block">Contact:</span>
                                    <span className="text-slate-200">{(exec.result as any).customer.contact_name || 'N/A'}</span>
                                  </div>
                                  <div>
                                    <span className="text-slate-500 block">Email:</span>
                                    <span className="text-slate-200 font-mono truncate">{(exec.result as any).customer.contact_email || 'N/A'}</span>
                                  </div>
                                  <div>
                                    <span className="text-slate-500 block">Industry:</span>
                                    <span className="text-slate-200">{(exec.result as any).customer.industry || 'N/A'}</span>
                                  </div>
                                  <div>
                                    <span className="text-slate-500 block">Qualification:</span>
                                    <span className="text-emerald-400 font-semibold">{(exec.result as any).customer.qualification_score ?? 'N/A'}/100</span>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 text-xs text-slate-400">
                                No record matching <code className="text-slate-300 font-mono">{(exec.arguments as any)?.email}</code> was found in MySQL <code className="text-slate-300 font-mono">customers</code> table.
                              </div>
                            )}

                            <details className="text-xs group">
                              <summary className="cursor-pointer text-[11px] font-mono text-slate-500 hover:text-slate-300 select-none">
                                ▸ Inspect Full Normalized Observation Payload (MySQL Result)
                              </summary>
                              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 font-mono space-y-1">
                                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans font-medium">
                                    Validated Input (Zod)
                                  </span>
                                  <pre className="text-[11px] text-cyan-300 overflow-x-auto whitespace-pre-wrap">
                                    {JSON.stringify(exec.arguments, null, 2)}
                                  </pre>
                                </div>
                                <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 font-mono space-y-1">
                                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans font-medium">
                                    Authoritative Observation
                                  </span>
                                  <pre className="text-[11px] text-emerald-300 overflow-x-auto whitespace-pre-wrap">
                                    {JSON.stringify(exec.result, null, 2)}
                                  </pre>
                                </div>
                              </div>
                            </details>
                          </div>
                        ) : exec.tool === 'vector_search' && exec.result && typeof exec.result === 'object' ? (
                          <div className="space-y-3">
                            <div className="flex flex-wrap items-center justify-between text-xs px-1 gap-2">
                              <span className="text-slate-400">
                                Semantic Query: <span className="font-semibold text-cyan-300 font-mono">"{(exec.arguments as any)?.query}"</span>
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-400 font-mono">
                                  top_k: {(exec.arguments as any)?.top_k ?? 5}
                                </span>
                                <span className="text-[11px] text-cyan-300 font-mono bg-cyan-950/80 border border-cyan-800/60 px-2.5 py-0.5 rounded-full font-semibold">
                                  {((exec.result as any).results || []).length} Relevant Chunks Retrieved
                                </span>
                              </div>
                            </div>

                            {((exec.result as any).results || []).length > 0 ? (
                              <div className="space-y-2.5">
                                {((exec.result as any).results || []).map((item: any, idx: number) => (
                                  <div
                                    key={idx}
                                    className="p-3.5 rounded-lg bg-slate-900/90 border border-slate-800 hover:border-cyan-800/60 transition-colors space-y-2"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60 pb-2">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                                          <span className="text-cyan-400 font-mono">#{idx + 1}</span>
                                          <span>{item.title}</span>
                                        </span>
                                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                                          {item.source}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800/50">
                                          Cosine: {item.score}
                                        </span>
                                        <span className="text-[10px] font-mono text-slate-500">
                                          {item.chunk_id}
                                        </span>
                                      </div>
                                    </div>
                                    <p className="text-[11px] text-slate-200 leading-relaxed font-sans bg-slate-950/60 p-2.5 rounded border border-slate-800/50 whitespace-pre-wrap">
                                      {item.text}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800/80 text-xs text-slate-400">
                                No internal knowledge chunks found matching query threshold in Qdrant collection <code className="text-cyan-300 font-mono">internal_knowledge</code>.
                              </div>
                            )}

                            <details className="text-xs group">
                              <summary className="cursor-pointer text-[11px] font-mono text-slate-500 hover:text-slate-300 select-none">
                                ▸ Inspect Full Normalized Observation Payload (Qdrant Vector Chunks)
                              </summary>
                              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 font-mono space-y-1">
                                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans font-medium">
                                    Validated Input (Zod)
                                  </span>
                                  <pre className="text-[11px] text-cyan-300 overflow-x-auto whitespace-pre-wrap">
                                    {JSON.stringify(exec.arguments, null, 2)}
                                  </pre>
                                </div>
                                <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 font-mono space-y-1">
                                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans font-medium">
                                    Authoritative Observation
                                  </span>
                                  <pre className="text-[11px] text-emerald-300 overflow-x-auto whitespace-pre-wrap">
                                    {JSON.stringify(exec.result, null, 2)}
                                  </pre>
                                </div>
                              </div>
                            </details>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                            {/* Validated Input Arguments */}
                            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 font-mono space-y-1">
                              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans font-medium">
                                Validated Arguments (Zod Verified)
                              </span>
                              <pre className="text-[11px] text-cyan-300 overflow-x-auto whitespace-pre-wrap">
                                {JSON.stringify(exec.arguments, null, 2)}
                              </pre>
                            </div>

                            {/* Normalized Tool Observation */}
                            <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 font-mono space-y-1">
                              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-sans font-medium">
                                Authoritative Observation (Fed to LLM)
                              </span>
                              <pre className="text-[11px] text-emerald-300 overflow-x-auto whitespace-pre-wrap">
                                {JSON.stringify(exec.result, null, 2)}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Phase 8 Final Answer Display */}
              {agentResult.finalAnswer && (
                <div className="p-5 rounded-xl bg-gradient-to-br from-slate-950 via-slate-900/80 to-slate-950 border border-emerald-500/30 shadow-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-mono text-emerald-400 font-bold tracking-wider flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      Agent Final Verified Answer
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">Task: {agentResult.taskId.substring(0, 8)}...</span>
                  </div>
                  <div className="text-sm font-medium text-slate-100 leading-relaxed pt-1 whitespace-pre-wrap">
                    {agentResult.finalAnswer}
                  </div>
                </div>
              )}

              {/* Generated Plan & Steps Display (Phase 7 Planning Mode) */}
              {agentResult.plan && (
                <div className="space-y-4">
                  {/* Goal & Summary */}
                  <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-mono text-cyan-400 font-semibold">Planned Goal</span>
                      <span className="text-[10px] font-mono text-slate-500">Task ID: {agentResult.taskId.substring(0, 8)}...</span>
                    </div>
                    <h3 className="text-sm font-semibold text-white">{agentResult.plan.goal}</h3>
                    <p className="text-xs text-slate-300 leading-relaxed">{agentResult.plan.summary}</p>
                  </div>

                  {/* Planned Steps List */}
                  <div className="space-y-2">
                    <span className="text-xs font-semibold text-slate-200">
                      Planned Steps ({agentResult.steps.length} durably persisted in MySQL <code className="text-cyan-300 font-mono text-[11px]">task_steps</code>)
                    </span>
                    <div className="space-y-2">
                      {agentResult.steps.map((s) => (
                        <div key={s.id} className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-start justify-between gap-4 hover:border-cyan-900/50 transition-colors">
                          <div className="flex items-start gap-3">
                            <span className="px-2 py-0.5 rounded-md bg-cyan-950 border border-cyan-700/40 text-cyan-300 font-mono font-bold text-xs shrink-0">
                              #{s.step_order}
                            </span>
                            <div>
                              <h4 className="text-xs font-semibold text-white">{s.title}</h4>
                              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{s.description}</p>
                            </div>
                          </div>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-900 text-amber-300 border border-slate-800 shrink-0">
                            {s.status} (Phase 8 Tool-Ready)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Recent Agent Tasks Log */}
          <div className="space-y-3 pt-3 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">Durable Agent Task Log (MySQL tasks)</span>
              <button
                type="button"
                onClick={fetchAgentTasks}
                disabled={agentTasksLoading}
                className="text-[11px] px-2.5 py-1 rounded bg-slate-950 border border-slate-800 hover:bg-slate-900 text-slate-300 transition-colors cursor-pointer"
              >
                {agentTasksLoading ? 'Refreshing...' : 'Refresh History'}
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/80">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-mono text-[11px]">
                    <th className="p-3">Task ID</th>
                    <th className="p-3">Task Prompt</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Steps</th>
                    <th className="p-3">Cost (USD)</th>
                    <th className="p-3">Timestamp</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                  {agentTasks.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="p-3 text-slate-400">{t.id.substring(0, 8)}...</td>
                      <td className="p-3 font-sans text-slate-200 max-w-xs truncate">{t.prompt}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          t.status === 'COMPLETED'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/50'
                            : 'bg-rose-950 text-rose-300 border border-rose-800/50'
                        }`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="p-3 text-cyan-300">{t.stepCount}</td>
                      <td className="p-3 text-amber-300">${t.totalCostUsd.toFixed(4)}</td>
                      <td className="p-3 font-sans text-slate-500 text-[11px]">{new Date(t.createdAt).toLocaleTimeString()}</td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => loadTaskDetails(t.id)}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-sans transition-colors cursor-pointer"
                        >
                          View Plan
                        </button>
                      </td>
                    </tr>
                  ))}
                  {agentTasks.length === 0 && !agentTasksLoading && (
                    <tr>
                      <td colSpan={7} className="p-4 text-center text-slate-500 font-sans">
                        No agent tasks executed yet. Run a prompt above!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Section 3: AI Playground & Execution Pipeline (Preserved from Phase 6) */}
        <section className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-6 sm:p-8 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="p-1.5 rounded-lg bg-purple-950 border border-purple-500/40 text-purple-300">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </span>
                <h2 className="text-lg font-semibold text-white">AI Playground & Single-Step Pipeline (Phase 6)</h2>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Direct single-step LLM invocation with strict input validation, system message boundaries, and runtime Zod validation.
              </p>
            </div>

            <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setAiMode('generate')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  aiMode === 'generate' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Free-form Text
              </button>
              <button
                type="button"
                onClick={() => setAiMode('summarize')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  aiMode === 'summarize' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Structured Analysis
              </button>
            </div>
          </div>

          <form onSubmit={handleExecuteAi} className="space-y-3">
            <textarea
              rows={2}
              required
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Enter prompt for direct LLM generation..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 font-mono resize-y"
            />
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500">Endpoint: POST /api/ai/{aiMode}</span>
              <button
                type="submit"
                disabled={aiLoading || !aiPrompt.trim()}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-purple-700 hover:bg-purple-600 text-white transition-all cursor-pointer disabled:opacity-50"
              >
                {aiLoading ? 'Generating...' : `Run ${aiMode === 'generate' ? 'Generation' : 'Structured Analysis'}`}
              </button>
            </div>
          </form>

          {aiExecutionError && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-900/60 text-rose-300 text-xs">
              {aiExecutionError}
            </div>
          )}

          {(aiResultText || aiStructuredResult) && (
            <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 text-xs space-y-2">
              <div className="text-[10px] uppercase font-mono text-purple-400 font-semibold">LLM Output</div>
              {aiResultText && <p className="text-slate-200 leading-relaxed whitespace-pre-wrap">{aiResultText}</p>}
              {aiStructuredResult && (
                <div className="space-y-2">
                  <p className="text-slate-200 font-medium">{aiStructuredResult.summary}</p>
                  <div className="flex flex-wrap gap-1">
                    {aiStructuredResult.topics.map((t, idx) => (
                      <span key={idx} className="px-2 py-0.5 rounded bg-slate-900 text-purple-300 text-[10px] font-mono">#{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* AI Telemetry HUD */}
          {aiTelemetry && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-lg bg-slate-950 border border-purple-900/40 text-[11px] font-mono">
              <div><span className="text-slate-500 block uppercase">Model</span><span className="text-purple-300 font-semibold">{aiTelemetry.model}</span></div>
              <div><span className="text-slate-500 block uppercase">Tokens</span><span className="text-cyan-300 font-semibold">{aiTelemetry.totalTokens}</span></div>
              <div><span className="text-slate-500 block uppercase">Latency</span><span className="text-white font-semibold">{aiTelemetry.latencyMs}ms</span></div>
              <div><span className="text-slate-500 block uppercase">Est. Cost</span><span className="text-amber-300 font-semibold">${aiTelemetry.estimatedCostUsd.toFixed(6)}</span></div>
            </div>
          )}

          {/* Telemetry Log */}
          {telemetryHistory.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-slate-800/80">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Persisted Telemetry Logs ({telemetryHistory.length})</span>
                <button type="button" onClick={fetchTelemetryHistory} disabled={historyLoading} className="text-[10px] text-purple-400 hover:text-purple-300 cursor-pointer">Refresh</button>
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/60">
                <table className="w-full text-left text-[11px] font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500">
                      <th className="p-2">ID</th>
                      <th className="p-2">Model</th>
                      <th className="p-2">Tokens</th>
                      <th className="p-2">Latency</th>
                      <th className="p-2">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {telemetryHistory.slice(0, 3).map((t) => (
                      <tr key={t.id} className="hover:bg-slate-900/40">
                        <td className="p-2 text-slate-400">{t.id.substring(0, 8)}...</td>
                        <td className="p-2 text-slate-300">{t.model}</td>
                        <td className="p-2 text-cyan-300">{t.total_tokens}</td>
                        <td className="p-2 text-white">{t.latency_ms}ms</td>
                        <td className="p-2 text-amber-300">${parseFloat(t.estimated_cost_usd).toFixed(6)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* Section 4: Cache-Aside Customer Explorer (Phase 5) */}
        <section className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-6 sm:p-8 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold text-white">Cache-Aside Customer Explorer (Phase 5)</h2>
                {customersSource && (
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-medium flex items-center gap-1.5 ${
                      customersSource === 'cache'
                        ? 'bg-rose-950/80 text-rose-300 border border-rose-500/40 shadow-sm shadow-rose-950'
                        : 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        customersSource === 'cache' ? 'bg-rose-400 animate-pulse' : 'bg-emerald-400'
                      }`}
                    ></span>
                    {customersSource === 'cache' ? '⚡ CACHE HIT (Redis)' : '💾 CACHE MISS (MySQL)'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Reads check Redis first; on MISS, loads from MySQL and populates cache with 60s TTL.
              </p>
            </div>

            <div className="flex items-center gap-3">
              {customersLatency !== null && (
                <span className="text-xs font-mono text-slate-400 bg-slate-950/80 px-2.5 py-1 rounded-lg border border-slate-800">
                  Latency: <strong className="text-white">{customersLatency} ms</strong>
                </span>
              )}
              <button
                type="button"
                id="fetch-customers-btn"
                onClick={fetchCustomers}
                disabled={customersLoading}
                className="px-4 py-2 rounded-xl text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-all cursor-pointer flex items-center gap-2"
              >
                {customersLoading ? 'Reading...' : 'Refresh Customers'}
              </button>
            </div>
          </div>

          {/* Sub-tools: Parameterized Lookup & Insert */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Tool 1: Parameterized Lookup Form */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-3">
              <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>Cached Domain Lookup</span>
                <code className="text-[10px] text-rose-400 font-mono">customers:domain:&lt;name&gt;</code>
              </div>
              <form onSubmit={handleDomainSearch} className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. apexcloud.io"
                  value={searchDomain}
                  onChange={(e) => setSearchDomain(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
                <button
                  type="submit"
                  disabled={searchLoading || !searchDomain.trim()}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {searchLoading ? 'Searching...' : 'Search'}
                </button>
              </form>

              {searchError && (
                <div className="p-2.5 rounded bg-rose-950/30 border border-rose-900/50 text-rose-300 text-xs">
                  {searchError}
                </div>
              )}

              {searchResult && (
                <div className="p-3 rounded-lg bg-slate-900/70 border border-slate-800 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-100">{searchResult.company_name}</span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                        searchSource === 'cache'
                          ? 'bg-rose-950 text-rose-300 border border-rose-800/50'
                          : 'bg-emerald-950 text-emerald-300 border border-emerald-800/50'
                      }`}
                    >
                      {searchSource === 'cache' ? '⚡ CACHE HIT' : '💾 CACHE MISS'} &bull; {searchLatency}ms
                    </span>
                  </div>
                  <div className="text-slate-400 text-[11px]">Domain: <span className="font-mono text-indigo-300">{searchResult.domain}</span> &bull; Industry: {searchResult.industry || 'N/A'}</div>
                </div>
              )}
            </div>

            {/* Tool 2: Add Customer & Invalidate Cache Form */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-3">
              <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>Add Customer (Triggers Invalidation)</span>
                <code className="text-[10px] text-amber-400 font-mono">DEL customers:*</code>
              </div>
              <form onSubmit={handleCreateCustomer} className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Company Name *"
                    required
                    value={newCompany}
                    onChange={(e) => setNewCompany(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  <input
                    type="text"
                    placeholder="domain.com *"
                    required
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Industry (e.g. AI Security)"
                    value={newIndustry}
                    onChange={(e) => setNewIndustry(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={createLoading || !newCompany.trim() || !newDomain.trim()}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {createLoading ? 'Writing...' : 'Save & Invalidate'}
                  </button>
                </div>
              </form>

              {createMessage && (
                <div
                  className={`p-2.5 rounded text-xs border ${
                    createMessage.type === 'success'
                      ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300'
                      : 'bg-rose-950/30 border-rose-800/40 text-rose-300'
                  }`}
                >
                  {createMessage.text}
                </div>
              )}
            </div>
          </div>

          {/* Customers Table Display */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Records in View: <strong className="text-slate-200">{customers.length}</strong></span>
              {customersError && <span className="text-rose-400">{customersError}</span>}
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/80">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-mono text-[11px]">
                    <th className="p-3">Company</th>
                    <th className="p-3">Domain</th>
                    <th className="p-3">Industry</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Qual. Score</th>
                    <th className="p-3">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {customers.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="p-3 font-medium text-white">{c.company_name}</td>
                      <td className="p-3 font-mono text-indigo-300">{c.domain}</td>
                      <td className="p-3 text-slate-400">{c.industry || '—'}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-300">
                          {c.status}
                        </span>
                      </td>
                      <td className="p-3">{c.qualification_score ?? '—'}</td>
                      <td className="p-3 text-slate-500 text-[11px]">{new Date(c.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {customers.length === 0 && !customersLoading && (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-slate-500">No records found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Section 5: Architecture Diagram */}
        <section className="bg-slate-900/40 rounded-2xl border border-slate-800/80 p-6 sm:p-8">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4">
            Phase 10 Multi-Source Verification & Agent Host Architecture Pipeline
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-center">
            <div className="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800 flex flex-col items-center">
              <span className="text-[10px] font-mono text-cyan-400 mb-1">CLIENT UI</span>
              <span className="font-semibold text-xs text-slate-200">React + Vite</span>
              <span className="text-[11px] text-slate-500 mt-1">Port 5173</span>
              <div className="mt-2 text-[10px] text-cyan-300 bg-cyan-950/50 border border-cyan-800/50 px-2 py-0.5 rounded">
                Multi-Tool Calling Studio & Verification
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800 flex flex-col items-center">
              <span className="text-[10px] font-mono text-indigo-400 mb-1">GATEWAY</span>
              <span className="font-semibold text-xs text-slate-200">Express API</span>
              <span className="text-[11px] text-slate-500 mt-1">Port 3000</span>
              <div className="mt-2 text-[10px] text-indigo-300 bg-indigo-950/50 border border-indigo-800/50 px-2 py-0.5 rounded font-mono">
                /api/agent/tasks & tools
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800 flex flex-col items-center">
              <span className="text-[10px] font-mono text-purple-400 mb-1">AGENT HOST</span>
              <span className="font-semibold text-xs text-slate-200">State & Loop</span>
              <span className="text-[11px] text-slate-500 mt-1">Watchdogs & Allowlist</span>
              <div className="mt-2 text-[10px] text-purple-300 bg-purple-950/50 border border-purple-800/50 px-2 py-0.5 rounded font-mono">
                Multi-Source Reasoner
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800 flex flex-col items-center">
              <span className="text-[10px] font-mono text-rose-400 mb-1">TOOL REGISTRY</span>
              <span className="font-semibold text-xs text-slate-200">Web & DB Tools</span>
              <span className="text-[11px] text-slate-500 mt-1">Server-Owned SQL</span>
              <div className="mt-2 text-[10px] text-rose-300 bg-rose-950/50 border border-rose-800/50 px-2 py-0.5 rounded font-mono">
                mysql_verify_customer, web_search
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800 flex flex-col items-center">
              <span className="text-[10px] font-mono text-emerald-400 mb-1">DURABLE TRUTH</span>
              <span className="font-semibold text-xs text-slate-200">MySQL 8.4</span>
              <span className="text-[11px] text-slate-500 mt-1">customers & executions</span>
              <div className="mt-2 text-[10px] text-emerald-300 bg-emerald-950/50 border border-emerald-800/50 px-2 py-0.5 rounded font-mono">
                Parameterized Query
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center text-xs text-slate-500 pt-4 border-t border-slate-800/80">
          AI Workforce Platform &bull; Phase 10: MySQL Verification Complete &bull; Ready for Phase 11: Qdrant / Vector Database
        </footer>
      </div>
    </div>
  );
}

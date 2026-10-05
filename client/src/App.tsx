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

  // Telemetry History state (from MySQL)
  const [telemetryHistory, setTelemetryHistory] = useState<TelemetryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);

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

  // 4. Check AI / LLM Provider Health (Lightweight config verification)
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

  // 5. Fetch Customers with Cache-Aside Telemetry
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
      // Telemetry fetch error non-blocking
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

      // Refresh persisted telemetry table
      fetchTelemetryHistory();
    } catch (err: unknown) {
      setAiExecutionError(err instanceof Error ? err.message : 'An error occurred during AI execution.');
    } finally {
      setAiLoading(false);
    }
  };

  // Run all health checks & initial fetch on mount
  useEffect(() => {
    checkBackend();
    checkDb();
    checkRedis();
    checkAiHealth();
    fetchCustomers();
    fetchTelemetryHistory();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-8 font-sans selection:bg-rose-500 selection:text-white">
      {/* Background ambient lighting */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-10 left-1/3 w-80 h-80 bg-rose-600/10 rounded-full blur-3xl"></div>
      </div>

      <div className="relative z-10 max-w-5xl w-full mx-auto space-y-8">
        {/* Header */}
        <header className="border-b border-slate-800 pb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="inline-block w-3 h-3 rounded-full bg-purple-500 animate-pulse"></span>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                  AI Workforce Platform
                </h1>
              </div>
              <p className="mt-1 text-sm text-slate-400">
                Phase 6 — AI / LLM Integration (Controlled LLM Layer, Runtime Validation & Durably Persisted Telemetry)
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 text-xs font-medium rounded-full bg-purple-950/80 border border-purple-500/30 text-purple-300">
                OpenAI Adapter
              </span>
              <span className="px-3 py-1 text-xs font-medium rounded-full bg-rose-950/80 border border-rose-500/30 text-rose-300">
                Redis 8.10 Cache
              </span>
              <span className="px-3 py-1 text-xs font-medium rounded-full bg-emerald-950/80 border border-emerald-500/30 text-emerald-300">
                MySQL 8.4 Telemetry
              </span>
            </div>
          </div>
        </header>

        {/* Section 1: 4-Tier System Health Checks */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
        </section>

        {/* Section 2: AI Playground (The Milestone 6.11 / Scenario 60 Vertical Slice) */}
        <section className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-6 sm:p-8 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="p-1.5 rounded-lg bg-purple-950 border border-purple-500/40 text-purple-300">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </span>
                <h2 className="text-lg font-semibold text-white">AI Playground & Execution Pipeline</h2>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Backend-controlled LLM invocation with strict input validation, system message boundaries, runtime Zod validation, and durable MySQL telemetry.
              </p>
            </div>

            {/* Mode Selector */}
            <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setAiMode('generate')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  aiMode === 'generate'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Free-form Text
              </button>
              <button
                type="button"
                onClick={() => setAiMode('summarize')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  aiMode === 'summarize'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Structured Analysis
              </button>
            </div>
          </div>

          {/* Quick Preset Prompts */}
          <div className="space-y-2">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Quick Presets:</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setAiMode('generate');
                  setAiPrompt('Explain why Redis should not replace MySQL in our platform.');
                }}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-purple-500/50 text-slate-300 transition-colors cursor-pointer"
              >
                Redis vs MySQL Architecture
              </button>
              <button
                type="button"
                onClick={() => {
                  setAiMode('summarize');
                  setAiPrompt('Acme Health Systems is a 1,200-employee regional hospital network evaluating automated customer outreach and patient intake reconciliation.');
                }}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-purple-500/50 text-slate-300 transition-colors cursor-pointer"
              >
                Structured Healthcare Lead
              </button>
              <button
                type="button"
                onClick={() => {
                  setAiMode('generate');
                  setAiPrompt('Explain what an AI agent is in one concise sentence.');
                }}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-purple-500/50 text-slate-300 transition-colors cursor-pointer"
              >
                AI Agent Definition
              </button>
            </div>
          </div>

          {/* Input Form */}
          <form onSubmit={handleExecuteAi} className="space-y-3">
            <div className="relative">
              <textarea
                rows={3}
                required
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder={aiMode === 'generate' ? 'Enter a prompt for the LLM...' : 'Enter customer or business text for structured Zod analysis...'}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-500 font-mono resize-y"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-[11px] text-slate-500">
                Target endpoint: <code className="text-purple-400 font-mono">POST /api/ai/{aiMode}</code>
              </div>
              <button
                type="submit"
                id="execute-ai-btn"
                disabled={aiLoading || !aiPrompt.trim()}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-950 transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                {aiLoading ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    <span>Executing via LLM...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                    <span>Run {aiMode === 'generate' ? 'Generation' : 'Structured Analysis'}</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Error Banner */}
          {aiExecutionError && (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-900/60 text-rose-300 text-xs flex items-start gap-2.5">
              <svg className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <strong>Execution Error:</strong> {aiExecutionError}
              </div>
            </div>
          )}

          {/* AI Telemetry HUD */}
          {aiTelemetry && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-3.5 rounded-xl bg-slate-950 border border-purple-900/40 text-xs font-mono">
              <div>
                <span className="text-[10px] text-slate-500 block uppercase">Provider/Model</span>
                <span className="font-semibold text-purple-300">{aiTelemetry.model}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block uppercase">Status</span>
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  {aiTelemetry.status}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block uppercase">Latency</span>
                <span className="font-semibold text-white">{aiTelemetry.latencyMs} ms</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block uppercase">Tokens (In / Out / Tot)</span>
                <span className="font-semibold text-cyan-300">
                  {aiTelemetry.inputTokens} / {aiTelemetry.outputTokens} / {aiTelemetry.totalTokens}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block uppercase">Est. Cost</span>
                <span className="font-semibold text-amber-300">${aiTelemetry.estimatedCostUsd.toFixed(6)}</span>
              </div>
            </div>
          )}

          {/* AI Output Display Area */}
          {(aiResultText || aiStructuredResult) && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-medium text-slate-300">
                  {aiMode === 'generate' ? 'Free-form Output' : 'Validated Structured Intelligence (Zod Schema Verified)'}
                </span>
                <span className="text-[10px] text-emerald-400 font-mono">Status: COMPLETED</span>
              </div>

              {aiResultText && (
                <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 text-xs text-slate-200 leading-relaxed font-sans shadow-inner whitespace-pre-wrap">
                  {aiResultText}
                </div>
              )}

              {aiStructuredResult && (
                <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-4 shadow-inner">
                  {/* Summary & Sentiment */}
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-800/80 pb-3">
                    <p className="text-xs text-slate-200 flex-1 leading-relaxed font-medium">
                      {aiStructuredResult.summary}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-700/50 text-emerald-300 font-semibold">
                        {aiStructuredResult.sentiment}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-950 border border-indigo-700/50 text-indigo-300">
                        Confidence: {(aiStructuredResult.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  {/* Topics Tags */}
                  <div>
                    <span className="text-[10px] uppercase font-mono text-slate-500 block mb-1.5">Classified Topics</span>
                    <div className="flex flex-wrap gap-1.5">
                      {aiStructuredResult.topics.map((t, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-purple-300 text-[11px] font-mono">
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Key Insights */}
                  <div>
                    <span className="text-[10px] uppercase font-mono text-slate-500 block mb-1.5">Key Insights</span>
                    <ul className="list-disc list-inside text-xs text-slate-300 space-y-1">
                      {aiStructuredResult.keyInsights.map((insight, idx) => (
                        <li key={idx} className="leading-relaxed">
                          {insight}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Section 3: Durable AI Telemetry History (MySQL ai_telemetry Table) */}
        <section className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-6 sm:p-8 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-semibold text-white">Durable AI Telemetry Log</h2>
              <p className="text-xs text-slate-400">Persisted in MySQL <code className="text-emerald-400 font-mono">ai_telemetry</code> table for cost audit and usage governance.</p>
            </div>
            <button
              type="button"
              onClick={fetchTelemetryHistory}
              disabled={historyLoading}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
            >
              {historyLoading ? 'Refreshing...' : 'Refresh Logs'}
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/80">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-mono text-[11px]">
                  <th className="p-3">Execution ID</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Model</th>
                  <th className="p-3">Tokens</th>
                  <th className="p-3">Latency</th>
                  <th className="p-3">Cost (USD)</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                {telemetryHistory.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="p-3 text-slate-400">{row.id.substring(0, 8)}...</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-purple-300">
                        {row.prompt_type}
                      </span>
                    </td>
                    <td className="p-3 text-slate-300">{row.model}</td>
                    <td className="p-3 text-cyan-300">{row.total_tokens}</td>
                    <td className="p-3 text-white">{row.latency_ms} ms</td>
                    <td className="p-3 text-amber-300">${parseFloat(row.estimated_cost_usd).toFixed(6)}</td>
                    <td className="p-3">
                      <span className="text-emerald-400 font-semibold">{row.status}</span>
                    </td>
                    <td className="p-3 text-slate-500 font-sans text-[11px]">
                      {new Date(row.created_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
                {telemetryHistory.length === 0 && !historyLoading && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-slate-500 font-sans">
                      No AI telemetry executions recorded yet. Run a prompt in the AI Playground above!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 4: Cache-Aside Customer Explorer (Preserved from Phase 5) */}
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
                  <div className="text-slate-400 text-[11px]">Status: <span className="text-emerald-400 font-medium">{searchResult.status}</span> &bull; Score: {searchResult.qualification_score ?? 'N/A'}</div>
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
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            c.status === 'QUALIFIED'
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-600/30'
                              : c.status === 'CONTACTED'
                              ? 'bg-amber-950/80 text-amber-300 border border-amber-600/30'
                              : 'bg-slate-800 text-slate-300 border border-slate-700'
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="p-3">
                        {c.qualification_score !== null ? (
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-200">{c.qualification_score}</span>
                            <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 rounded-full"
                                style={{ width: `${Math.min(c.qualification_score, 100)}%` }}
                              ></div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="p-3 text-slate-500 text-[11px]">
                        {new Date(c.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                  {customers.length === 0 && !customersLoading && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-500">
                        No customer records found. Click "Refresh Customers" or add one using the form above.
                      </td>
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
            Phase 6 AI Workforce Architecture Pipeline
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-center">
            <div className="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800 flex flex-col items-center">
              <span className="text-[10px] font-mono text-indigo-400 mb-1">CLIENT UI</span>
              <span className="font-semibold text-xs text-slate-200">React + Vite</span>
              <span className="text-[11px] text-slate-500 mt-1">Port 5173</span>
              <div className="mt-2 text-[10px] text-indigo-300 bg-indigo-950/50 border border-indigo-800/50 px-2 py-0.5 rounded">
                AI Playground
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800 flex flex-col items-center">
              <span className="text-[10px] font-mono text-cyan-400 mb-1">ROUTER / GATEWAY</span>
              <span className="font-semibold text-xs text-slate-200">Express API</span>
              <span className="text-[11px] text-slate-500 mt-1">Port 3000</span>
              <div className="mt-2 text-[10px] text-cyan-300 bg-cyan-950/50 border border-cyan-800/50 px-2 py-0.5 rounded">
                POST /api/ai/*
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800 flex flex-col items-center">
              <span className="text-[10px] font-mono text-purple-400 mb-1">AI SERVICE</span>
              <span className="font-semibold text-xs text-slate-200">LLM Service</span>
              <span className="text-[11px] text-slate-500 mt-1">Zod Validation</span>
              <div className="mt-2 text-[10px] text-purple-300 bg-purple-950/50 border border-purple-800/50 px-2 py-0.5 rounded font-mono">
                Untrusted Output Filter
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800 flex flex-col items-center">
              <span className="text-[10px] font-mono text-rose-400 mb-1">CACHE LAYER</span>
              <span className="font-semibold text-xs text-slate-200">Redis 8.10</span>
              <span className="text-[11px] text-slate-500 mt-1">Port 6379</span>
              <div className="mt-2 text-[10px] text-rose-300 bg-rose-950/50 border border-rose-800/50 px-2 py-0.5 rounded font-mono">
                Speed Optimization
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800 flex flex-col items-center">
              <span className="text-[10px] font-mono text-emerald-400 mb-1">DURABLE TRUTH</span>
              <span className="font-semibold text-xs text-slate-200">MySQL 8.4</span>
              <span className="text-[11px] text-slate-500 mt-1">Port 3306</span>
              <div className="mt-2 text-[10px] text-emerald-300 bg-emerald-950/50 border border-emerald-800/50 px-2 py-0.5 rounded font-mono">
                ai_telemetry Table
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center text-xs text-slate-500 pt-4 border-t border-slate-800/80">
          AI Workforce Platform &bull; Phase 6: AI / LLM Integration Complete &bull; Ready for Phase 7: Simple Agent
        </footer>
      </div>
    </div>
  );
}

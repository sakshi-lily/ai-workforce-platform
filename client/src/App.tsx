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

  // 4. Fetch Customers with Cache-Aside Telemetry
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

  // 5. Parameterized Domain Lookup
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

  // 6. Create Customer in MySQL & Invalidate Cache
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
      // Refresh list to demonstrate invalidation
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

  // Run all health checks & initial fetch on mount
  useEffect(() => {
    checkBackend();
    checkDb();
    checkRedis();
    fetchCustomers();
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-8 font-sans selection:bg-rose-500 selection:text-white">
      {/* Background ambient lighting */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-rose-600/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-10 left-1/3 w-80 h-80 bg-emerald-600/10 rounded-full blur-3xl"></div>
      </div>

      <div className="relative z-10 max-w-5xl w-full mx-auto space-y-8">
        {/* Header */}
        <header className="border-b border-slate-800 pb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="inline-block w-3 h-3 rounded-full bg-rose-500 animate-pulse"></span>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                  AI Workforce Platform
                </h1>
              </div>
              <p className="mt-1 text-sm text-slate-400">
                Phase 5 — Redis Integration (Fast In-Memory Caching & Temporary State)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 text-xs font-medium rounded-full bg-rose-950/80 border border-rose-500/30 text-rose-300">
                Redis 8.10 Cache
              </span>
              <span className="px-3 py-1 text-xs font-medium rounded-full bg-emerald-950/80 border border-emerald-500/30 text-emerald-300">
                MySQL 8.4 Source of Truth
              </span>
            </div>
          </div>
        </header>

        {/* Section 1: 3-Tier System Health Checks */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card A: Express Backend Health */}
          <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-5 shadow-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Tier 1</span>
                <span className="text-[11px] text-slate-500 font-mono">:3000</span>
              </div>
              <h2 className="text-sm font-semibold text-white mt-1">Express HTTP Server</h2>
              <p className="text-[11px] text-slate-400 mt-1">Node.js process and routing gateway.</p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
              <div>
                {backendStatus === 'idle' && <span className="text-xs text-slate-500">Not verified</span>}
                {backendStatus === 'loading' && <span className="text-xs text-indigo-400 animate-pulse">Pinging...</span>}
                {backendStatus === 'success' && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    Status: {backendData?.status.toUpperCase()}
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
          <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-5 shadow-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400">Tier 2</span>
                <span className="text-[11px] text-slate-500 font-mono">:3306</span>
              </div>
              <h2 className="text-sm font-semibold text-white mt-1">MySQL Source of Truth</h2>
              <p className="text-[11px] text-slate-400 mt-1">Durable relational store with 7 tables.</p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
              <div>
                {dbStatus === 'idle' && <span className="text-xs text-slate-500">Not verified</span>}
                {dbStatus === 'loading' && <span className="text-xs text-emerald-400 animate-pulse">Connecting...</span>}
                {dbStatus === 'success' && (
                  <div className="flex flex-col">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                      Connected ({dbData?.databaseName})
                    </span>
                    <span className="text-[10px] text-slate-400">
                      v{dbData?.serverVersion} &bull; {dbLatency}ms
                    </span>
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
          <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-5 shadow-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-rose-400">Tier 3</span>
                <span className="text-[11px] text-slate-500 font-mono">:6379</span>
              </div>
              <h2 className="text-sm font-semibold text-white mt-1">Redis In-Memory Cache</h2>
              <p className="text-[11px] text-slate-400 mt-1">Sub-millisecond key-value storage with TTL.</p>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
              <div>
                {redisStatus === 'idle' && <span className="text-xs text-slate-500">Not verified</span>}
                {redisStatus === 'loading' && <span className="text-xs text-rose-400 animate-pulse">Connecting...</span>}
                {redisStatus === 'success' && (
                  <div className="flex flex-col">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-400">
                      <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                      Connected (PONG)
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {redisData?.host}:{redisData?.port} &bull; {redisLatency}ms
                    </span>
                  </div>
                )}
                {redisStatus === 'error' && (
                  <div className="flex flex-col">
                    <span className="text-xs font-medium text-amber-400">Degraded to MySQL</span>
                    <span className="text-[10px] text-slate-500">{redisError}</span>
                  </div>
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
        </section>

        {/* Section 2: Cache-Aside Telemetry & Data Explorer */}
        <section className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-6 sm:p-8 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-white">Cache-Aside Data Explorer</h2>
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
                {customersLoading ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    <span>Reading...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Refresh Customers</span>
                  </>
                )}
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

        {/* Section 3: Architecture Diagram */}
        <section className="bg-slate-900/40 rounded-2xl border border-slate-800/80 p-6 sm:p-8">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4">
            Phase 5 Cache-Aside Flow Architecture
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-center">
            <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 flex flex-col items-center">
              <span className="text-[10px] font-mono text-indigo-400 mb-1">CLIENT UI</span>
              <span className="font-semibold text-xs text-slate-200">React + Vite</span>
              <span className="text-[11px] text-slate-500 mt-1">Port 5173</span>
              <div className="mt-3 text-[10px] text-indigo-300 bg-indigo-950/50 border border-indigo-800/50 px-2 py-0.5 rounded">
                GET /api/customers
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 flex flex-col items-center">
              <span className="text-[10px] font-mono text-cyan-400 mb-1">ROUTER / CONTROLLER</span>
              <span className="font-semibold text-xs text-slate-200">Express API</span>
              <span className="text-[11px] text-slate-500 mt-1">Port 3000</span>
              <div className="mt-3 text-[10px] text-cyan-300 bg-cyan-950/50 border border-cyan-800/50 px-2 py-0.5 rounded">
                customerRoutes.ts
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 flex flex-col items-center">
              <span className="text-[10px] font-mono text-rose-400 mb-1">TEMPORARY CACHE</span>
              <span className="font-semibold text-xs text-slate-200">Redis 8.10 Cache</span>
              <span className="text-[11px] text-slate-500 mt-1">Port 6379 (TTL: 60s)</span>
              <div className="mt-3 text-[10px] text-rose-300 bg-rose-950/50 border border-rose-800/50 px-2 py-0.5 rounded font-mono">
                HIT (1ms) / MISS
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 flex flex-col items-center">
              <span className="text-[10px] font-mono text-emerald-400 mb-1">DURABLE TRUTH</span>
              <span className="font-semibold text-xs text-slate-200">MySQL 8.4 Engine</span>
              <span className="text-[11px] text-slate-500 mt-1">ai_workforce DB</span>
              <div className="mt-3 text-[10px] text-emerald-300 bg-emerald-950/50 border border-emerald-800/50 px-2 py-0.5 rounded font-mono">
                Authoritative Write
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center text-xs text-slate-500 pt-4 border-t border-slate-800/80">
          AI Workforce Platform &bull; Phase 5: Redis Integration Complete &bull; Ready for Phase 6: AI / LLM Integration
        </footer>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';

interface MemoryRecord {
  id: string;
  organizationId: string;
  userId?: string;
  scope: string;
  type: string;
  key?: string;
  title: string;
  content: string;
  source: string;
  sensitivity: string;
  status: string;
  confidence: number;
  tags: string[];
  version: number;
  accessCount: number;
  utilityScore: number;
  createdAt: string;
  expiresAt?: string;
}

interface ContextResult {
  taskId: string;
  workerRole?: string;
  assembledPrompt: string;
  tokenBreakdown: {
    systemPolicyTokens: number;
    orgPolicyTokens: number;
    taskObjectiveTokens: number;
    authoritativeDataTokens: number;
    memoryTokens: number;
    knowledgeTokens: number;
    observationTokens: number;
    userPromptTokens: number;
    totalTokens: number;
    budgetUtilizationPct: number;
    wasCompressed: boolean;
  };
  injectedMemories: Array<{
    id: string;
    title: string;
    scope: string;
    type: string;
    confidence: number;
  }>;
  conflictsAnnotated: Array<{
    field: string;
    authoritativeValue: string;
    historicalMemoryValue: string;
    sourceOfTruth: string;
    resolutionNote: string;
  }>;
  appliedGuardrails: string[];
}

interface EvalSummary {
  timestamp: string;
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  overallScore: number;
  securityComplianceRate: number;
  precedenceAccuracy: number;
  tokenAdherenceRate: number;
  averageLatencyMs: number;
  results: Array<{
    scenarioId: string;
    name: string;
    category: string;
    passed: boolean;
    score: number;
    details: string;
    latencyMs: number;
  }>;
}

export const MemoryStudioPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'explorer' | 'simulator' | 'precedence' | 'eval'>('explorer');

  // Explorer State
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // New Memory Form
  const [newTitle, setNewTitle] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newScope, setNewScope] = useState('USER');
  const [newType, setNewType] = useState('USER');
  const [newSource, setNewSource] = useState('USER_EXPLICIT');
  const [newSensitivity, setNewSensitivity] = useState('LOW');
  const [createError, setCreateError] = useState<string | null>(null);

  // Simulator State
  const [simObjective, setSimObjective] = useState('Evaluate credit qualification and diligence report for Apex Cloud');
  const [simPrompt, setSimPrompt] = useState('Is Apex Cloud eligible for our enterprise tier contract?');
  const [simStatus, setSimStatus] = useState('DISQUALIFIED');
  const [simCredit, setSimCredit] = useState(540);
  const [simRole, setSimRole] = useState('SYNTHESIS_WORKER');
  const [simResult, setSimResult] = useState<ContextResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);

  // Evaluation State
  const [evalSummary, setEvalSummary] = useState<EvalSummary | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);

  const fetchMemories = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (scopeFilter !== 'ALL') params.append('scope', scopeFilter);
      if (searchQuery.trim()) params.append('query', searchQuery.trim());
      params.append('allUsers', 'true');

      const res = await fetch(`http://localhost:3000/api/memory?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.status === 'success') {
        setMemories(data.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMemories();
  }, [scopeFilter]);

  const handleCreateMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('http://localhost:3000/api/memory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: newTitle,
          key: newKey || undefined,
          content: newContent,
          scope: newScope,
          type: newType,
          source: newSource,
          sensitivity: newSensitivity,
          tags: [newScope.toLowerCase(), newType.toLowerCase()],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to save memory candidate');
      }
      setCreateModalOpen(false);
      setNewTitle('');
      setNewKey('');
      setNewContent('');
      fetchMemories();
    } catch (err: any) {
      setCreateError(err.message);
    }
  };

  const handleAssembleContext = async () => {
    setSimLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('http://localhost:3000/api/context/assemble', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          taskId: `sim-${Date.now()}`,
          workerRole: simRole,
          taskObjective: simObjective,
          userPrompt: simPrompt,
          authoritativeData: {
            customerId: 'cust-apex-001',
            companyName: 'Apex Cloud',
            customerStatus: simStatus,
            creditScore: simCredit,
          },
          workerObservations: [
            {
              stepId: 'step_research_1',
              workerType: 'RESEARCH_WORKER',
              summary: 'Apex Cloud is a Delaware C-Corp founded in 2021 with 120 employees.',
            },
            {
              stepId: 'step_verify_1',
              workerType: 'VERIFICATION_WORKER',
              summary: 'MySQL ledger query shows account status DISQUALIFIED due to credit score 540.',
            },
          ],
        }),
      });
      const data = await res.json();
      if (data.status === 'success') {
        setSimResult(data.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSimLoading(false);
    }
  };

  const handleRunEvaluation = async () => {
    setEvalLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('http://localhost:3000/api/memory/eval', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.status === 'success') {
        setEvalSummary(data.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setEvalLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">💾</span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Workforce Memory & Context Studio
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800">
                  Phase 28 Active
                </span>
              </h1>
              <p className="text-sm text-slate-400 mt-0.5">
                Governed organizational memory, multi-tenant isolation & authoritative precedence context engine
              </p>
            </div>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-1 self-start sm:self-center">
          <button
            type="button"
            onClick={() => setActiveTab('explorer')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
              activeTab === 'explorer'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            🗄️ Memory Explorer
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('simulator');
              if (!simResult) handleAssembleContext();
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
              activeTab === 'simulator'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            ⚡ Context Engine
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('precedence')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
              activeTab === 'precedence'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            ⚖️ Precedence Matrix
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('eval');
              if (!evalSummary) handleRunEvaluation();
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
              activeTab === 'eval'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            📊 Regression & Evals
          </button>
        </div>
      </div>

      {/* TAB 1: MEMORY EXPLORER */}
      {activeTab === 'explorer' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-slate-900/60 border border-slate-800 p-4 rounded-xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">Scope:</span>
              {['ALL', 'USER', 'ORGANIZATION', 'WORKFLOW', 'EPISODIC', 'TASK'].map((sc) => (
                <button
                  type="button"
                  key={sc}
                  onClick={() => setScopeFilter(sc)}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition ${
                    scopeFilter === sc
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {sc}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search memories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchMemories()}
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 w-48 sm:w-64"
              />
              <button
                type="button"
                onClick={fetchMemories}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg transition"
              >
                Search
              </button>
              <button
                type="button"
                onClick={() => setCreateModalOpen(true)}
                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium rounded-lg shadow-sm transition flex items-center gap-1"
              >
                + Candidate
              </button>
            </div>
          </div>

          {/* Memory Grid */}
          {loading ? (
            <div className="text-center py-12 text-slate-500 text-sm">Loading memories...</div>
          ) : memories.length === 0 ? (
            <div className="text-center py-12 bg-slate-900/30 border border-dashed border-slate-800 rounded-xl">
              <p className="text-slate-400 text-sm">No memories found for this filter.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {memories.map((m) => (
                <div
                  key={m.id}
                  className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-xl p-4 flex flex-col justify-between transition group shadow-sm hover:shadow-md"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                            m.scope === 'ORGANIZATION'
                              ? 'bg-purple-950 text-purple-400 border border-purple-800'
                              : m.scope === 'USER'
                              ? 'bg-blue-950 text-blue-400 border border-blue-800'
                              : m.scope === 'WORKFLOW'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : 'bg-amber-950 text-amber-400 border border-amber-800'
                          }`}
                        >
                          {m.scope}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                          v{m.version}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            m.status === 'ACTIVE'
                              ? 'bg-emerald-900/50 text-emerald-300'
                              : m.status === 'SUPERSEDED'
                              ? 'bg-slate-800 text-slate-400 line-through'
                              : 'bg-rose-900/50 text-rose-300'
                          }`}
                        >
                          {m.status}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {(m.utilityScore * 100).toFixed(0)}% Util
                      </span>
                    </div>

                    <h3 className="font-semibold text-slate-100 text-sm line-clamp-1">{m.title}</h3>
                    {m.key && (
                      <p className="text-[11px] font-mono text-cyan-400 bg-slate-950/60 px-2 py-0.5 rounded border border-slate-800/80 inline-block">
                        key: {m.key}
                      </p>
                    )}
                    <p className="text-xs text-slate-300 leading-relaxed line-clamp-3 bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/40 font-sans">
                      {m.content}
                    </p>
                  </div>

                  <div className="pt-3 mt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                    <span>Source: {m.source.replace('USER_', '')}</span>
                    <span>Hits: {m.accessCount}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: CONTEXT ENGINE SIMULATOR */}
      {activeTab === 'simulator' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Controls Column */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <span>⚙️</span> Task & State Inputs
              </h3>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Worker Role Envelope</label>
                <select
                  value={simRole}
                  onChange={(e) => setSimRole(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200"
                >
                  <option value="SYNTHESIS_WORKER">SYNTHESIS_WORKER (Formatting & Citations)</option>
                  <option value="RESEARCH_WORKER">RESEARCH_WORKER (External Discovery)</option>
                  <option value="VERIFICATION_WORKER">VERIFICATION_WORKER (Internal Ledger)</option>
                  <option value="ANALYSIS_WORKER">ANALYSIS_WORKER (Comparative Reasoning)</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Task Objective</label>
                <textarea
                  rows={2}
                  value={simObjective}
                  onChange={(e) => setSimObjective(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">User Prompt</label>
                <input
                  type="text"
                  value={simPrompt}
                  onChange={(e) => setSimPrompt(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-3">
                <span className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                  <span>🏛️</span> Live Authoritative MySQL State (Simulated)
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">customerStatus</label>
                    <select
                      value={simStatus}
                      onChange={(e) => setSimStatus(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs text-white"
                    >
                      <option value="DISQUALIFIED">DISQUALIFIED</option>
                      <option value="QUALIFIED">QUALIFIED</option>
                      <option value="PENDING_REVIEW">PENDING_REVIEW</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400 block mb-1">creditScore</label>
                    <input
                      type="number"
                      value={simCredit}
                      onChange={(e) => setSimCredit(parseInt(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs text-white"
                    />
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAssembleContext}
                disabled={simLoading}
                className="w-full py-2.5 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-lg shadow-sm transition flex items-center justify-center gap-2"
              >
                {simLoading ? 'Assembling...' : '⚡ Assemble Governed Context'}
              </button>
            </div>
          </div>

          {/* Results Column */}
          <div className="lg:col-span-7 space-y-4">
            {simResult ? (
              <div className="space-y-4">
                {/* Token Meter */}
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white">Context Token Budget</span>
                    <span className="font-mono text-cyan-400">
                      {simResult.tokenBreakdown.totalTokens} / 4,000 tokens ({simResult.tokenBreakdown.budgetUtilizationPct}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
                    <div
                      className="bg-cyan-500 h-2.5 rounded-full transition-all"
                      style={{ width: `${Math.min(100, simResult.tokenBreakdown.budgetUtilizationPct)}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-[10px] text-slate-400 font-mono text-center pt-1">
                    <div className="bg-slate-950 p-1.5 rounded">
                      Policy: {simResult.tokenBreakdown.systemPolicyTokens + simResult.tokenBreakdown.orgPolicyTokens}t
                    </div>
                    <div className="bg-slate-950 p-1.5 rounded">
                      Live Data: {simResult.tokenBreakdown.authoritativeDataTokens}t
                    </div>
                    <div className="bg-slate-950 p-1.5 rounded">
                      Memory: {simResult.tokenBreakdown.memoryTokens}t
                    </div>
                    <div className="bg-slate-950 p-1.5 rounded">
                      Observations: {simResult.tokenBreakdown.observationTokens}t
                    </div>
                  </div>
                </div>

                {/* Precedence Notice Alert */}
                {simResult.conflictsAnnotated.length > 0 && (
                  <div className="bg-amber-950/40 border border-amber-800 p-4 rounded-xl space-y-2 text-xs">
                    <div className="flex items-center gap-2 font-semibold text-amber-300">
                      <span>⚠️</span> Precedence Conflict Annotated
                    </div>
                    {simResult.conflictsAnnotated.map((c, i) => (
                      <div key={i} className="text-amber-200/90 leading-relaxed font-sans">
                        <strong>Field:</strong> {c.field} | <strong>Live MySQL:</strong> {c.authoritativeValue} |{' '}
                        <strong>Memory:</strong> {c.historicalMemoryValue}
                        <p className="mt-1 text-[11px] text-amber-300/80 italic">{c.resolutionNote}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Assembled Prompt Inspector */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                  <div className="bg-slate-950 px-4 py-2 border-b border-slate-800 flex items-center justify-between text-xs font-mono text-slate-400">
                    <span>Governed Context Prompt</span>
                    <span>Role: {simResult.workerRole}</span>
                  </div>
                  <pre className="p-4 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-96 leading-relaxed selection:bg-cyan-900 whitespace-pre-wrap">
                    {simResult.assembledPrompt}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="text-center py-20 text-slate-500 text-sm bg-slate-900/40 rounded-xl border border-slate-800">
                Configure inputs and click "Assemble Governed Context" to simulate.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: PRECEDENCE MATRIX */}
      {activeTab === 'precedence' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>🏛️</span> Strict Authority & Precedence Architecture
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Workforce memory provides historical context and stylistic alignment. It is strictly non-authoritative
              and cannot override platform safety, tenant policies, or current business ledger state.
            </p>

            <div className="space-y-3 pt-2">
              {[
                {
                  rank: 1,
                  level: 'Platform Safety Policy',
                  authority: 'ABSOLUTE (Immutable)',
                  source: 'Platform Runtime',
                  desc: 'Zero credential leakage, no unauthorized external side-effects, strict prompt injection containment.',
                  badge: 'bg-rose-950 text-rose-300 border-rose-800',
                },
                {
                  rank: 2,
                  level: 'Organization Policy',
                  authority: 'TENANT-WIDE MANDATORY',
                  source: 'Admin Policy Engine',
                  desc: 'Citation requirements, mandatory approval thresholds, tenant-specific compliance standards.',
                  badge: 'bg-purple-950 text-purple-300 border-purple-800',
                },
                {
                  rank: 3,
                  level: 'Current User Instruction',
                  authority: 'TASK SPECIFIC',
                  source: 'Immediate User Prompt',
                  desc: 'Overrides historical user preferences (e.g. detailed request overrides concise preference).',
                  badge: 'bg-indigo-950 text-indigo-300 border-indigo-800',
                },
                {
                  rank: 4,
                  level: 'Current Authoritative Business Data',
                  authority: 'SOURCE OF TRUTH',
                  source: 'Live MySQL Ledger',
                  desc: 'Overrides historical memory. If memory says "Qualified" but MySQL says "Disqualified", MySQL strictly wins.',
                  badge: 'bg-amber-950 text-amber-300 border-amber-800',
                },
                {
                  rank: 5,
                  level: 'Approved Knowledge',
                  authority: 'OFFICIAL KNOWLEDGE',
                  source: 'Qdrant / RAG',
                  desc: 'Official organizational documentation, standards, and published handbooks.',
                  badge: 'bg-emerald-950 text-emerald-300 border-emerald-800',
                },
                {
                  rank: 6,
                  level: 'Validated Workforce Memory',
                  authority: 'CONTEXT ENHANCEMENT',
                  source: 'Memory Store',
                  desc: 'Useful historical context, tone preferences, and past workflow observations. Marked passive.',
                  badge: 'bg-cyan-950 text-cyan-300 border-cyan-800',
                },
                {
                  rank: 7,
                  level: 'Untrusted External Content',
                  authority: 'DATA ONLY',
                  source: 'Web Search / Submissions',
                  desc: 'Quarantined data records. Instructions inside external content are neutralized.',
                  badge: 'bg-slate-800 text-slate-400 border-slate-700',
                },
              ].map((item) => (
                <div
                  key={item.rank}
                  className="bg-slate-950 border border-slate-800/80 p-3.5 rounded-lg flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-xs font-mono font-bold text-slate-300">
                      {item.rank}
                    </span>
                    <div>
                      <h4 className="text-xs font-bold text-white">{item.level}</h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${item.badge}`}>
                      {item.authority}
                    </span>
                    <span className="block text-[10px] text-slate-500 font-mono mt-1">{item.source}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: REGRESSION & EVALUATIONS */}
      {activeTab === 'eval' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-4 rounded-xl">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>📊</span> Golden Memory & Context Regression Suite
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Automated continuous evaluation across 12 golden scenarios (zero leaks, credential rejection, authoritative precedence).
              </p>
            </div>
            <button
              type="button"
              onClick={handleRunEvaluation}
              disabled={evalLoading}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg shadow-sm transition flex items-center gap-2"
            >
              {evalLoading ? 'Running Suite...' : '▶ Re-run 12 Scenarios'}
            </button>
          </div>

          {evalSummary && (
            <div className="space-y-6">
              {/* Scorecard Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                  <span className="text-xs text-slate-400 block">Overall Score</span>
                  <span className="text-2xl font-bold font-mono text-cyan-400 mt-1 block">
                    {evalSummary.overallScore}%
                  </span>
                  <span className="text-[11px] text-slate-500">{evalSummary.passedScenarios}/12 passed</span>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                  <span className="text-xs text-slate-400 block">Security Compliance</span>
                  <span className="text-2xl font-bold font-mono text-emerald-400 mt-1 block">
                    {evalSummary.securityComplianceRate}%
                  </span>
                  <span className="text-[11px] text-slate-500">Zero cross-tenant leaks</span>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                  <span className="text-xs text-slate-400 block">Precedence Accuracy</span>
                  <span className="text-2xl font-bold font-mono text-indigo-400 mt-1 block">
                    {evalSummary.precedenceAccuracy}%
                  </span>
                  <span className="text-[11px] text-slate-500">MySQL strictly prevails</span>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                  <span className="text-xs text-slate-400 block">Average Latency</span>
                  <span className="text-2xl font-bold font-mono text-amber-400 mt-1 block">
                    {evalSummary.averageLatencyMs} ms
                  </span>
                  <span className="text-[11px] text-slate-500">Retrieval & ranking</span>
                </div>
              </div>

              {/* Scenario Results Table */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-slate-800 font-semibold text-xs text-white">
                  Scenario Execution Results
                </div>
                <div className="divide-y divide-slate-800/80">
                  {evalSummary.results.map((r) => (
                    <div key={r.scenarioId} className="p-3.5 flex items-center justify-between text-xs hover:bg-slate-800/30 transition">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${r.passed ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                          <span className="font-semibold text-slate-200">{r.name}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                            {r.category}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 pl-4">{r.details}</p>
                      </div>
                      <div className="text-right font-mono text-slate-500 text-[11px]">
                        <span>{r.latencyMs} ms</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CREATE CANDIDATE MODAL */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base">Create Memory Candidate</h3>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {createError && (
              <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-lg text-rose-300 text-xs">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateMemory} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Executive Summary Format"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Scope</label>
                  <select
                    value={newScope}
                    onChange={(e) => {
                      setNewScope(e.target.value);
                      setNewType(e.target.value);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white"
                  >
                    <option value="USER">USER (Personal)</option>
                    <option value="ORGANIZATION">ORGANIZATION (Shared)</option>
                    <option value="WORKFLOW">WORKFLOW (Template)</option>
                    <option value="EPISODIC">EPISODIC (Historical)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Key (Optional)</label>
                  <input
                    type="text"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder="e.g. format_pref"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Provenance Source</label>
                  <select
                    value={newSource}
                    onChange={(e) => setNewSource(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white"
                  >
                    <option value="USER_EXPLICIT">USER_EXPLICIT (High Trust)</option>
                    <option value="TASK_OUTCOME">TASK_OUTCOME (Validated)</option>
                    <option value="ORGANIZATION_POLICY">ORGANIZATION_POLICY (Admin)</option>
                    <option value="USER_BEHAVIOR">USER_BEHAVIOR (Inferred)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Sensitivity</label>
                  <select
                    value={newSensitivity}
                    onChange={(e) => setNewSensitivity(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white"
                  >
                    <option value="LOW">LOW (General)</option>
                    <option value="MEDIUM">MEDIUM (Internal)</option>
                    <option value="HIGH">HIGH (Confidential)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Content</label>
                <textarea
                  rows={4}
                  required
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Enter memory content (secrets, passwords, and API keys are blocked)..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg shadow-sm"
                >
                  Save Candidate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

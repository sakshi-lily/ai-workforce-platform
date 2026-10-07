import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';

export interface RegisteredTool {
  name: string;
  description: string;
  riskLevel: 'READ_ONLY' | 'LOW_RISK' | 'MUTATING' | 'EXTERNAL_SIDE_EFFECT';
}

export const AgentPage: React.FC = () => {
  const { authFetch } = useAuth();

  const [registeredTools, setRegisteredTools] = useState<RegisteredTool[]>([]);
  const [selectedTools, setSelectedTools] = useState<string[]>([
    'web_search',
    'mysql_verify_customer',
    'rag_query',
    'calculate',
    'get_current_time',
  ]);

  const [prompt, setPrompt] = useState<string>(
    'Research Apex Cloud and verify whether they are an existing customer in our database.'
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch registered tools
  useEffect(() => {
    const fetchTools = async () => {
      try {
        const res = await fetch('http://localhost:3000/api/agent/tools');
        if (res.ok) {
          const json = await res.json();
          setRegisteredTools(json.tools || []);
        }
      } catch {
        // Non-blocking
      }
    };
    fetchTools();
  }, []);

  const handleToolToggle = (name: string) => {
    setSelectedTools((prev) =>
      prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]
    );
  };

  const handleRunAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    setErrorMessage(null);
    setResult(null);

    try {
      // Create task first
      const createRes = await authFetch('http://localhost:3000/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: prompt.slice(0, 60),
          goal: prompt.trim(),
          priority: 'HIGH',
        }),
      });

      const createJson = await createRes.json();
      if (!createRes.ok) {
        throw new Error(createJson.error?.message || 'Failed to initialize agent task.');
      }

      const taskId = createJson.data.id;

      // Run task through Agent Runtime
      const runRes = await authFetch(`http://localhost:3000/api/tasks/${taskId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allowedTools: selectedTools,
        }),
      });

      const runJson = await runRes.json();
      if (!runRes.ok) {
        throw new Error(runJson.error?.message || 'Agent execution failed.');
      }

      setResult(runJson.data);
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred during agent execution.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="pb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
          <span className="text-xs font-mono font-medium text-cyan-300 uppercase tracking-widest">
            Phase 15 Runtime
          </span>
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-medium tracking-tight text-white">
          Autonomous Agent Studio
        </h1>
        <p className="mt-1 text-sm text-slate-400 font-sans">
          Deterministic multi-step planning, DAG cycle detection, and policy-governed tool execution.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Form & Tool Selection */}
        <div className="lg:col-span-1 space-y-6">
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-sm shadow-xl space-y-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-sans">
              Execution Directives
            </h2>

            <form onSubmit={handleRunAgent} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1 font-sans">
                  Task Objective:
                </label>
                <textarea
                  rows={4}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={loading}
                  placeholder="Describe the objective for the agent..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-sans resize-none"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-2 font-sans">
                  Authorized Governed Tools ({selectedTools.length} selected):
                </label>
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {registeredTools.map((t) => {
                    const isSelected = selectedTools.includes(t.name);
                    return (
                      <label
                        key={t.name}
                        className={`flex items-start gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition ${
                          isSelected
                            ? 'bg-cyan-950/40 border-cyan-800/80 text-cyan-200'
                            : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToolToggle(t.name)}
                          className="mt-0.5 accent-cyan-500"
                        />
                        <div className="flex-1 truncate">
                          <div className="font-semibold text-slate-200 truncate">{t.name}</div>
                          <div className="text-[10px] text-slate-500 truncate">{t.description}</div>
                        </div>
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                          {t.riskLevel}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || selectedTools.length === 0}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-cyan-950 transition disabled:opacity-50 disabled:cursor-not-allowed font-sans flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Executing Runtime Plan...</span>
                  </>
                ) : (
                  'Launch Autonomous Run'
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Execution Output & Observations */}
        <div className="lg:col-span-2 space-y-4">
          {errorMessage && (
            <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs font-sans">
              <span className="font-semibold">Execution Error:</span> {errorMessage}
            </div>
          )}

          {!result && !loading && !errorMessage && (
            <div className="p-12 rounded-2xl bg-slate-900/40 border border-slate-800 text-center space-y-2">
              <span className="text-3xl">🤖</span>
              <h3 className="font-display text-lg font-medium text-white">Agent Standby</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto font-sans">
                Configure your task objective on the left and click "Launch Autonomous Run" to watch the Phase 15 runtime decompose, schedule, and synthesize.
              </p>
            </div>
          )}

          {loading && (
            <div className="p-12 rounded-2xl bg-slate-900/60 border border-cyan-800/50 text-center space-y-3 animate-pulse">
              <span className="text-3xl">⚡</span>
              <h3 className="font-display text-lg font-medium text-cyan-200">Executing Multi-Step DAG</h3>
              <p className="text-xs text-slate-400 font-sans">
                Resolving step dependencies, evaluating policy gateway, executing governed tools, and verifying observations...
              </p>
            </div>
          )}

          {result && (
            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400 text-lg">✓</span>
                  <span className="font-display text-lg font-semibold text-white">
                    Task Completed: {result.task?.title || 'Execution Outcome'}
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                  {result.task?.status || 'COMPLETED'}
                </span>
              </div>

              {/* Synthesized Output */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 font-sans">
                  Grounded Final Synthesis:
                </h4>
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 text-sm text-slate-200 leading-relaxed font-sans">
                  {result.task?.final_report || result.finalAnswer || 'No final report recorded.'}
                </div>
              </div>

              {/* Verified Sources */}
              {result.sources && result.sources.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 font-sans">
                    Attributed Sources:
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {result.sources.map((s: string, idx: number) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-md text-xs font-medium bg-cyan-950 text-cyan-300 border border-cyan-800 font-sans"
                      >
                        🔗 {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

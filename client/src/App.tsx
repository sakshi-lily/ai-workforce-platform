import { useState } from 'react';

type ConnectionStatus = 'idle' | 'loading' | 'success' | 'error';

interface HealthResponse {
  status: string;
  [key: string]: unknown;
}

export default function App() {
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [responseData, setResponseData] = useState<HealthResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const checkBackend = async () => {
    setStatus('loading');
    setErrorMessage(null);
    const startTime = performance.now();

    try {
      const response = await fetch('http://localhost:3000/api/health', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      const elapsed = Math.round(performance.now() - startTime);
      setLatencyMs(elapsed);
      setCheckedAt(new Date().toLocaleTimeString());

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} (${response.statusText})`);
      }

      const data: HealthResponse = await response.json();
      setResponseData(data);
      setStatus('success');
    } catch (err: unknown) {
      const elapsed = Math.round(performance.now() - startTime);
      setLatencyMs(elapsed);
      setCheckedAt(new Date().toLocaleTimeString());
      setStatus('error');
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Unable to connect to backend.');
      }
    }
  };

  const resetState = () => {
    setStatus('idle');
    setResponseData(null);
    setErrorMessage(null);
    setLatencyMs(null);
    setCheckedAt(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-8 font-sans selection:bg-indigo-500 selection:text-white">
      {/* Background ambient glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl"></div>
      </div>

      <div className="relative z-10 max-w-4xl w-full mx-auto space-y-8">
        {/* Header */}
        <header className="border-b border-slate-800 pb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="inline-block w-3 h-3 rounded-full bg-indigo-500 animate-pulse"></span>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                  AI Workforce Platform
                </h1>
              </div>
              <p className="mt-1 text-sm text-slate-400">
                Phase 3 — Basic React + Express Application
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 text-xs font-medium rounded-full bg-indigo-950/80 border border-indigo-500/30 text-indigo-300">
                Milestone 3.3
              </span>
              <span className="px-3 py-1 text-xs font-medium rounded-full bg-slate-800/80 border border-slate-700 text-slate-300">
                Port 5173 ↔ 3000
              </span>
            </div>
          </div>
        </header>

        {/* Main interactive panel */}
        <main className="space-y-6">
          <section className="bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 p-6 sm:p-8 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
              <div>
                <h2 className="text-lg font-semibold text-white">Backend Connection</h2>
                <p className="text-sm text-slate-400 mt-0.5">
                  Verify HTTP communication between Vite/React client and Express server
                </p>
              </div>

              <div className="flex items-center gap-3">
                {status !== 'idle' && (
                  <button
                    type="button"
                    onClick={resetState}
                    className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                  >
                    Reset
                  </button>
                )}
                <button
                  id="check-backend-btn"
                  type="button"
                  onClick={checkBackend}
                  disabled={status === 'loading'}
                  className="px-6 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 shadow-md cursor-pointer disabled:cursor-not-allowed bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white disabled:opacity-60 flex items-center gap-2"
                >
                  {status === 'loading' ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                      </svg>
                      <span>Checking backend...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span>Check Backend</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Status Display Area */}
            <div className="mt-6 pt-2">
              <div className="text-xs uppercase tracking-wider font-semibold text-slate-500 mb-3">
                Connection Status
              </div>

              {status === 'idle' && (
                <div className="p-5 rounded-xl border border-slate-800 bg-slate-950/40 text-slate-400 text-sm flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-600"></span>
                    <span>Ready to check backend health status. Click <strong>Check Backend</strong> to begin.</span>
                  </div>
                  <code className="hidden sm:inline-block text-xs bg-slate-900 border border-slate-800 px-2 py-1 rounded text-slate-400">
                    GET http://localhost:3000/api/health
                  </code>
                </div>
              )}

              {status === 'loading' && (
                <div className="p-5 rounded-xl border border-indigo-900/50 bg-indigo-950/20 text-indigo-300 text-sm flex items-center gap-3 animate-pulse">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-ping"></span>
                  <span>Sending HTTP GET request to backend...</span>
                </div>
              )}

              {status === 'success' && (
                <div className="space-y-4">
                  <div className="p-5 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400"></span>
                      <span id="backend-status" className="font-semibold text-base text-emerald-300">
                        Backend Status: {responseData?.status?.toUpperCase() || 'OK'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-emerald-400/80">
                      {latencyMs !== null && <span>Latency: {latencyMs} ms</span>}
                      {checkedAt && <span>Checked at: {checkedAt}</span>}
                      <span className="px-2 py-0.5 rounded bg-emerald-900/50 border border-emerald-700/50 text-emerald-300 font-mono">
                        200 OK
                      </span>
                    </div>
                  </div>

                  {/* Raw response payload card */}
                  <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
                    <div className="text-xs font-mono text-slate-400 mb-2 flex items-center justify-between">
                      <span>Response Payload:</span>
                      <span className="text-slate-500">application/json</span>
                    </div>
                    <pre className="text-xs font-mono text-indigo-300 overflow-x-auto p-2 bg-slate-900/50 rounded-lg">
                      {JSON.stringify(responseData, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {status === 'error' && (
                <div className="space-y-4">
                  <div className="p-5 rounded-xl border border-rose-500/30 bg-rose-950/20 text-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-full bg-rose-500 shadow-sm shadow-rose-500"></span>
                      <span id="backend-status" className="font-semibold text-base text-rose-300">
                        Unable to connect to backend.
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-rose-400/80">
                      {checkedAt && <span>Failed at: {checkedAt}</span>}
                      <span className="px-2 py-0.5 rounded bg-rose-900/50 border border-rose-700/50 text-rose-300 font-mono">
                        Connection Failed
                      </span>
                    </div>
                  </div>

                  {errorMessage && (
                    <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 text-xs text-slate-400 space-y-2">
                      <div className="font-mono text-rose-400">Error: {errorMessage}</div>
                      <p className="text-slate-400">
                        Troubleshooting checklist:
                      </p>
                      <ul className="list-disc list-inside space-y-1 text-slate-500">
                        <li>Is the Express server running on port 3000? (<code className="text-slate-400">node dist/server.js</code>)</li>
                        <li>Does the server permit CORS requests from origin <code className="text-slate-400">http://localhost:5173</code>?</li>
                        <li>Check your terminal logs in <code className="text-slate-400">server/</code> for any thrown exceptions.</li>
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Architecture flow diagram */}
          <section className="bg-slate-900/40 rounded-2xl border border-slate-800/80 p-6 sm:p-8">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4">
              Phase 3 Architecture Flow
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
              <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 flex flex-col items-center">
                <span className="text-xs font-mono text-indigo-400 mb-1">FRONTEND</span>
                <span className="font-semibold text-sm text-slate-200">React + TypeScript</span>
                <span className="text-xs text-slate-500 mt-1">Vite Dev Server (:5173)</span>
                <div className="mt-3 text-xs text-indigo-300 bg-indigo-950/50 border border-indigo-800/50 px-2 py-1 rounded">
                  fetch('/api/health')
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 flex flex-col items-center justify-center">
                <span className="text-xs font-mono text-cyan-400 mb-1">COMMUNICATION</span>
                <span className="font-semibold text-sm text-slate-200">HTTP REST / JSON</span>
                <span className="text-xs text-slate-500 mt-1">CORS Allowed</span>
                <div className="mt-3 text-xs text-cyan-300 bg-cyan-950/50 border border-cyan-800/50 px-2 py-1 rounded font-mono">
                  GET ↔ JSON
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/50 border border-slate-800 flex flex-col items-center">
                <span className="text-xs font-mono text-emerald-400 mb-1">BACKEND</span>
                <span className="font-semibold text-sm text-slate-200">Express + TypeScript</span>
                <span className="text-xs text-slate-500 mt-1">Node.js Server (:3000)</span>
                <div className="mt-3 text-xs text-emerald-300 bg-emerald-950/50 border border-emerald-800/50 px-2 py-1 rounded font-mono">
                  {`{ "status": "ok" }`}
                </div>
              </div>
            </div>
          </section>
        </main>

        {/* Footer */}
        <footer className="text-center text-xs text-slate-500 pt-4 border-t border-slate-800/80">
          AI Workforce Platform &bull; Built with React, Vite, Express, TypeScript &bull; Ready for Phase 4 (MySQL Database Integration)
        </footer>
      </div>
    </div>
  );
}

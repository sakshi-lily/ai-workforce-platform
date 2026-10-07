import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext';

export const KnowledgePage: React.FC = () => {
  const { authFetch } = useAuth();

  const [question, setQuestion] = useState('What is our remote work policy?');
  const [topK, setTopK] = useState(5);
  const [loading, setLoading] = useState(false);
  const [ragResult, setRagResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    setLoading(true);
    setErrorMessage(null);
    setRagResult(null);

    try {
      const res = await authFetch('http://localhost:3000/api/rag/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question.trim(),
          top_k: topK,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || json.message || 'RAG query failed.');
      }

      setRagResult(json.data);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to retrieve grounded answer.');
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
            Phase 12 Vector RAG
          </span>
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-medium tracking-tight text-white">
          Grounded Knowledge Base
        </h1>
        <p className="mt-1 text-sm text-slate-400 font-sans">
          Semantic vector retrieval over internal enterprise documents with strict source verification.
        </p>
      </div>

      {/* Query Form */}
      <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-sm shadow-xl space-y-4">
        <form onSubmit={handleQuery} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-slate-300 mb-1 font-sans">
                Knowledge Query:
              </label>
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask about company policies, documentation, architecture..."
                disabled={loading}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-sans"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1 font-sans">
                Top Chunks (k):
              </label>
              <select
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value))}
                disabled={loading}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 font-sans"
              >
                <option value={3}>3 Chunks</option>
                <option value={5}>5 Chunks</option>
                <option value={8}>8 Chunks</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-cyan-950 transition font-sans flex items-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Retrieving Knowledge...</span>
                </>
              ) : (
                'Query Knowledge Base'
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Error display */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs font-sans">
          <span className="font-semibold">Retrieval Error:</span> {errorMessage}
        </div>
      )}

      {/* RAG Results */}
      {ragResult && (
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-emerald-400 text-lg">🧠</span>
              <span className="font-display text-lg font-semibold text-white">
                Grounded Answer
              </span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
              {ragResult.grounded ? 'Grounded & Verified' : 'Standard Response'}
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-200 leading-relaxed font-sans">
            {ragResult.answer}
          </div>

          {/* Sources List */}
          {ragResult.sources && ragResult.sources.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-sans">
                Cited Documents & Excerpts:
              </h3>
              <div className="space-y-2">
                {ragResult.sources.map((s: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs space-y-1 font-sans"
                  >
                    <div className="flex items-center justify-between text-cyan-300 font-semibold">
                      <span>
                        [{s.sourceId}] {s.title} ({s.source})
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">
                        Score: {Math.round(s.score * 100)}%
                      </span>
                    </div>
                    <div className="text-slate-300 text-xs italic bg-slate-900/40 p-2 rounded border border-slate-800/60">
                      "{s.text}"
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

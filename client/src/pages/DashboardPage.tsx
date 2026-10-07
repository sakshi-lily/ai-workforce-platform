import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Link } from '../router/Router';
import { getApiUrl } from '../config/api';

interface HealthStatus {
  service: string;
  status: 'ONLINE' | 'LOADING' | 'OFFLINE';
  latencyMs?: number;
  details?: string;
  icon: string;
}

export const DashboardPage: React.FC = () => {
  const { user, authFetch } = useAuth();

  const [healthList, setHealthList] = useState<HealthStatus[]>([
    { service: 'Express Gateway', status: 'LOADING', icon: '⚡' },
    { service: 'MySQL 8.4 Database', status: 'LOADING', icon: '🗄️' },
    { service: 'Redis 8.10 Cache', status: 'LOADING', icon: '⚡' },
    { service: 'Qdrant 1.13 Vector', status: 'LOADING', icon: '🧠' },
    { service: 'AI Foundation Model', status: 'LOADING', icon: '🤖' },
  ]);

  const [taskStats, setTaskStats] = useState({ total: 0, completed: 0, running: 0 });

  useEffect(() => {
    const checkAllHealth = async () => {
      // 1. Backend Express
      try {
        const start = performance.now();
        const res = await fetch(getApiUrl('/api/health'));
        const lat = Math.round(performance.now() - start);
        updateHealth('Express Gateway', res.ok ? 'ONLINE' : 'OFFLINE', lat, 'Port 3000');
      } catch {
        updateHealth('Express Gateway', 'OFFLINE', undefined, 'Unreachable');
      }

      // 2. MySQL
      try {
        const start = performance.now();
        const res = await fetch(getApiUrl('/api/health/db'));
        const lat = Math.round(performance.now() - start);
        const data = await res.json();
        updateHealth('MySQL 8.4 Database', res.ok ? 'ONLINE' : 'OFFLINE', lat, data.databaseName || 'ai_workforce');
      } catch {
        updateHealth('MySQL 8.4 Database', 'OFFLINE', undefined, 'Connection failed');
      }

      // 3. Redis
      try {
        const start = performance.now();
        const res = await fetch(getApiUrl('/api/health/redis'));
        const lat = Math.round(performance.now() - start);
        updateHealth('Redis 8.10 Cache', res.ok ? 'ONLINE' : 'OFFLINE', lat, 'Port 6379');
      } catch {
        updateHealth('Redis 8.10 Cache', 'OFFLINE', undefined, 'Unavailable');
      }

      // 4. Qdrant
      try {
        const start = performance.now();
        const res = await fetch(getApiUrl('/api/health/qdrant'));
        const lat = Math.round(performance.now() - start);
        const data = await res.json();
        updateHealth('Qdrant 1.13 Vector', res.ok ? 'ONLINE' : 'OFFLINE', lat, data.collection || 'Default');
      } catch {
        updateHealth('Qdrant 1.13 Vector', 'OFFLINE', undefined, 'Unavailable');
      }

      // 5. AI LLM
      try {
        const start = performance.now();
        const res = await fetch(getApiUrl('/api/ai/health'));
        const lat = Math.round(performance.now() - start);
        const data = await res.json();
        updateHealth('AI Foundation Model', res.ok ? 'ONLINE' : 'OFFLINE', lat, data.model || 'OpenAI / Simulation');
      } catch {
        updateHealth('AI Foundation Model', 'OFFLINE', undefined, 'Unavailable');
      }
    };

    const fetchTaskMetrics = async () => {
      try {
        const res = await authFetch('http://localhost:3000/api/tasks?limit=50');
        if (res.ok) {
          const json = await res.json();
          const items = json.data || [];
          const completed = items.filter((t: any) => t.status === 'COMPLETED').length;
          const running = items.filter((t: any) => t.status === 'RUNNING' || t.status === 'REQUESTED').length;
          setTaskStats({ total: items.length, completed, running });
        }
      } catch {
        // Non-blocking
      }
    };

    checkAllHealth();
    fetchTaskMetrics();
  }, [authFetch]);

  const updateHealth = (
    service: string,
    status: 'ONLINE' | 'LOADING' | 'OFFLINE',
    latencyMs?: number,
    details?: string
  ) => {
    setHealthList((prev) =>
      prev.map((item) => (item.service === service ? { ...item, status, latencyMs, details } : item))
    );
  };

  return (
    <div className="space-y-8 font-sans">
      {/* Hero Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
            <span className="text-xs font-mono font-medium text-cyan-300 uppercase tracking-widest">
              Executive Overview
            </span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-medium tracking-tight text-white">
            Enterprise AI Workforce
          </h1>
          <p className="mt-1 text-sm text-slate-400 max-w-2xl font-sans">
            Authoritative, deterministic execution runtime for multi-step autonomous workforce orchestration.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/app/tasks"
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-lg shadow-cyan-950 transition font-sans flex items-center gap-2"
          >
            <span>+</span> New Task
          </Link>
          <Link
            href="/app/agent"
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-semibold transition font-sans"
          >
            Agent Studio
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm shadow-md">
          <div className="flex items-center justify-between text-xs text-slate-400 font-sans">
            <span>Durable Tasks</span>
            <span className="text-cyan-400 text-base">📋</span>
          </div>
          <div className="mt-3 font-sans text-2xl font-bold text-white">
            {taskStats.total}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 font-sans">
            Scoped to {user?.organizationId}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm shadow-md">
          <div className="flex items-center justify-between text-xs text-slate-400 font-sans">
            <span>Completed Work</span>
            <span className="text-emerald-400 text-base">✓</span>
          </div>
          <div className="mt-3 font-sans text-2xl font-bold text-emerald-400">
            {taskStats.completed}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 font-sans">
            Verified with multi-source attribution
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm shadow-md">
          <div className="flex items-center justify-between text-xs text-slate-400 font-sans">
            <span>Active Runs</span>
            <span className="text-amber-400 text-base">●</span>
          </div>
          <div className="mt-3 font-sans text-2xl font-bold text-amber-400">
            {taskStats.running}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 font-sans">
            Bounded execution watchdogs
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm shadow-md">
          <div className="flex items-center justify-between text-xs text-slate-400 font-sans">
            <span>Governance Policy</span>
            <span className="text-indigo-400 text-base">🛡️</span>
          </div>
          <div className="mt-3 font-sans text-lg font-bold text-indigo-300">
            Phase 15 Strict
          </div>
          <div className="mt-1 text-[11px] text-slate-500 font-sans">
            LLM Proposes • Host Decides
          </div>
        </div>
      </div>

      {/* Platform Infrastructure Health */}
      <div className="rounded-2xl bg-slate-900/70 border border-slate-800/80 p-6 backdrop-blur-sm shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">📡</span>
            <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-slate-200">
              Infrastructure & Service Gateway Status
            </h2>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-800 text-emerald-300">
            5 Services Monitored
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {healthList.map((item) => (
            <div
              key={item.service}
              className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/90 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-lg">{item.icon}</span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    item.status === 'ONLINE'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/80'
                      : item.status === 'LOADING'
                      ? 'bg-indigo-950 text-indigo-300 border border-indigo-800/80 animate-pulse'
                      : 'bg-rose-950 text-rose-300 border border-rose-800/80'
                  }`}
                >
                  {item.status}
                </span>
              </div>
              <div className="mt-3">
                <div className="text-xs font-semibold text-slate-200 truncate">{item.service}</div>
                <div className="text-[11px] text-slate-500 truncate mt-0.5">
                  {item.details || 'Operational'}
                </div>
              </div>
              {item.latencyMs !== undefined && (
                <div className="mt-2 text-[10px] font-mono text-cyan-400/90 text-right">
                  {item.latencyMs} ms
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Link
          href="/app/tasks"
          className="p-6 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-950 border border-slate-800 hover:border-cyan-500/50 transition-all group shadow-lg"
        >
          <div className="flex items-center justify-between">
            <span className="text-2xl">📋</span>
            <span className="text-cyan-400 group-hover:translate-x-1 transition-transform">→</span>
          </div>
          <h3 className="font-display text-lg font-medium text-white mt-4 group-hover:text-cyan-300 transition-colors">
            Task Management Studio
          </h3>
          <p className="text-xs text-slate-400 mt-1.5 font-sans leading-relaxed">
            Create and track durable tasks, view DAG step execution progress, inspect tool telemetry, and examine verified source citations.
          </p>
        </Link>

        <Link
          href="/app/agent"
          className="p-6 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-950 border border-slate-800 hover:border-indigo-500/50 transition-all group shadow-lg"
        >
          <div className="flex items-center justify-between">
            <span className="text-2xl">🤖</span>
            <span className="text-indigo-400 group-hover:translate-x-1 transition-transform">→</span>
          </div>
          <h3 className="font-display text-lg font-medium text-white mt-4 group-hover:text-indigo-300 transition-colors">
            Autonomous Agent Studio
          </h3>
          <p className="text-xs text-slate-400 mt-1.5 font-sans leading-relaxed">
            Execute tasks through the Advanced Agent Runtime with policy allowlists, SHA-256 loop protection, and bounded replanning.
          </p>
        </Link>

        <Link
          href="/app/knowledge"
          className="p-6 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-950 border border-slate-800 hover:border-purple-500/50 transition-all group shadow-lg"
        >
          <div className="flex items-center justify-between">
            <span className="text-2xl">🧠</span>
            <span className="text-purple-400 group-hover:translate-x-1 transition-transform">→</span>
          </div>
          <h3 className="font-display text-lg font-medium text-white mt-4 group-hover:text-purple-300 transition-colors">
            Grounded Knowledge & RAG
          </h3>
          <p className="text-xs text-slate-400 mt-1.5 font-sans leading-relaxed">
            Query internal policies and documentation via semantic search with tenant-isolated Qdrant vector retrieval.
          </p>
        </Link>
      </div>
    </div>
  );
};

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../auth/AuthContext';

export type TaskStatus = 'REQUESTED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type TaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface TaskSummary {
  id: string;
  title: string;
  goal: string;
  status: TaskStatus;
  priority: TaskPriority;
  stepCount: number;
  totalCostUsd: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface TaskStep {
  id: string;
  task_id: string;
  step_order: number;
  title: string;
  description: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  tool_name: string | null;
  input_data: Record<string, unknown> | null;
  output_data: Record<string, unknown> | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface ToolExecutionRecord {
  id: string;
  tool: string;
  arguments: Record<string, unknown>;
  result: unknown;
  durationMs: number;
  success: boolean;
  step_id?: string | null;
  stepId?: string | null;
}

export interface TaskDetails {
  task: {
    id: string;
    user_id: string;
    organization_id: string;
    title: string;
    goal: string;
    prompt: string;
    status: TaskStatus;
    priority: TaskPriority;
    final_report: string | null;
    error_message: string | null;
    prompt_tokens: number;
    completion_tokens: number;
    total_cost_usd: number;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
  };
  steps: TaskStep[];
  toolExecutions: ToolExecutionRecord[];
  telemetry: {
    model: string;
    totalTokens: number;
    latencyMs: number;
    estimatedCostUsd: number;
  } | null;
  sources: string[];
}

export const TaskManagementStudio: React.FC = () => {
  const { authState, authFetch } = useAuth();

  // Task list state
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [offset, setOffset] = useState<number>(0);
  const limit = 10;
  const [loadingTasks, setLoadingTasks] = useState<boolean>(false);
  const [tasksError, setTasksError] = useState<string | null>(null);

  // Task creation state
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>('');
  const [newGoal, setNewGoal] = useState<string>('');
  const [newPriority, setNewPriority] = useState<TaskPriority>('NORMAL');
  const [newMode, setNewMode] = useState<'tools' | 'planning'>('tools');
  const [createLoading, setCreateLoading] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Selected task detail state
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskDetails, setTaskDetails] = useState<TaskDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Inline editing state
  const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false);
  const [editedTitle, setEditedTitle] = useState<string>('');
  const [updatingTitle, setUpdatingTitle] = useState<boolean>(false);

  // Action states
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [cancellingTaskId, setCancellingTaskId] = useState<string | null>(null);

  // Polling ref to clear timeouts
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch task list
  const fetchTasks = useCallback(async () => {
    if (authState !== 'AUTHENTICATED') return;
    setLoadingTasks(true);
    setTasksError(null);

    try {
      let url = `http://localhost:3000/api/tasks?limit=${limit}&offset=${offset}`;
      if (statusFilter !== 'ALL') {
        url += `&status=${statusFilter}`;
      }

      const res = await authFetch(url);
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error?.message || json.message || 'Failed to fetch tasks');
      }

      setTasks(json.data || []);
      setTotalCount(json.pagination?.total || 0);
    } catch (err: unknown) {
      setTasksError(err instanceof Error ? err.message : 'Error fetching tasks');
    } finally {
      setLoadingTasks(false);
    }
  }, [authState, authFetch, limit, offset, statusFilter]);

  // Fetch task details
  const fetchTaskDetails = useCallback(async (taskId: string) => {
    if (authState !== 'AUTHENTICATED') return;
    setLoadingDetails(true);
    setDetailsError(null);

    try {
      const res = await authFetch(`http://localhost:3000/api/tasks/${taskId}`);
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error?.message || json.message || 'Failed to fetch task details');
      }

      setTaskDetails(json.data);
      setEditedTitle(json.data?.task?.title || '');
    } catch (err: unknown) {
      setDetailsError(err instanceof Error ? err.message : 'Error fetching task details');
    } finally {
      setLoadingDetails(false);
    }
  }, [authState, authFetch]);

  // Initial load & dependency effect
  useEffect(() => {
    if (authState === 'AUTHENTICATED') {
      fetchTasks();
    }
  }, [authState, fetchTasks]);

  // Effect to load details when a task is selected
  useEffect(() => {
    if (selectedTaskId) {
      fetchTaskDetails(selectedTaskId);
    } else {
      setTaskDetails(null);
    }
  }, [selectedTaskId, fetchTaskDetails]);

  // Polling effect: if selected task or any listed task is RUNNING, poll every 2.5s
  useEffect(() => {
    const isRunning = taskDetails?.task?.status === 'RUNNING' || tasks.some(t => t.status === 'RUNNING');

    if (isRunning) {
      pollTimerRef.current = setTimeout(() => {
        fetchTasks();
        if (selectedTaskId) {
          fetchTaskDetails(selectedTaskId);
        }
      }, 2500);
    }

    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
    };
  }, [taskDetails?.task?.status, tasks, selectedTaskId, fetchTasks, fetchTaskDetails]);

  // Handle Task Creation
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoal.trim()) return;

    setCreateLoading(true);
    setCreateError(null);

    try {
      const res = await authFetch('http://localhost:3000/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim() || undefined,
          goal: newGoal.trim(),
          priority: newPriority,
          mode: newMode,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || json.message || 'Failed to create task');
      }

      const created = json.data;
      setNewTitle('');
      setNewGoal('');
      setIsCreating(false);
      await fetchTasks();
      setSelectedTaskId(created.id);
      setActionMessage({ type: 'success', text: `Task created successfully with ID: ${created.id.substring(0, 8)}...` });
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setCreateLoading(false);
    }
  };

  // Handle Run Task
  const handleRunTask = async (taskId: string) => {
    setRunningTaskId(taskId);
    setActionMessage(null);

    try {
      const res = await authFetch(`http://localhost:3000/api/tasks/${taskId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || json.message || 'Task execution failed');
      }

      setActionMessage({ type: 'success', text: `Task completed with status: ${json.data?.status || 'COMPLETED'}` });
      await fetchTaskDetails(taskId);
      await fetchTasks();
    } catch (err: unknown) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Execution error' });
      await fetchTaskDetails(taskId);
      await fetchTasks();
    } finally {
      setRunningTaskId(null);
    }
  };

  // Handle Cancel Task
  const handleCancelTask = async (taskId: string) => {
    setCancellingTaskId(taskId);
    setActionMessage(null);

    try {
      const res = await authFetch(`http://localhost:3000/api/tasks/${taskId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || json.message || 'Failed to cancel task');
      }

      setActionMessage({ type: 'success', text: 'Task cancelled successfully.' });
      await fetchTaskDetails(taskId);
      await fetchTasks();
    } catch (err: unknown) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Cancellation error' });
    } finally {
      setCancellingTaskId(null);
    }
  };

  // Handle Update Title
  const handleSaveTitle = async (taskId: string) => {
    if (!editedTitle.trim()) return;
    setUpdatingTitle(true);

    try {
      const res = await authFetch(`http://localhost:3000/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editedTitle.trim() }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || json.message || 'Failed to update title');
      }

      setIsEditingTitle(false);
      await fetchTaskDetails(taskId);
      await fetchTasks();
    } catch (err: unknown) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update title' });
    } finally {
      setUpdatingTitle(false);
    }
  };

  // Quick preset helper
  const applyPreset = (presetTitle: string, presetGoal: string) => {
    setNewTitle(presetTitle);
    setNewGoal(presetGoal);
    setIsCreating(true);
  };

  // Helper for Status Badge styling
  const renderStatusBadge = (status: TaskStatus) => {
    switch (status) {
      case 'REQUESTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-amber-950/80 text-amber-300 border border-amber-700/60">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            REQUESTED
          </span>
        );
      case 'RUNNING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-indigo-950/90 text-indigo-300 border border-indigo-600 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
            RUNNING
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-700/60">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            COMPLETED
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-rose-950/80 text-rose-300 border border-rose-700/60">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
            FAILED
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
            CANCELLED
          </span>
        );
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300">{status}</span>;
    }
  };

  const renderPriorityBadge = (priority: TaskPriority) => {
    switch (priority) {
      case 'URGENT':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800">URGENT</span>;
      case 'HIGH':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800">HIGH</span>;
      case 'NORMAL':
        return <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700">NORMAL</span>;
      case 'LOW':
        return <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-900 text-slate-400 border border-slate-800">LOW</span>;
    }
  };

  if (authState !== 'AUTHENTICATED') {
    return (
      <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80 text-center space-y-3">
        <span className="text-3xl">🔒</span>
        <h3 className="text-sm font-semibold text-white">Authentication Required for Task Management</h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Phase 14 ties work execution to durable user identity and organization tenancy. Please sign in above to create, inspect, execute, and govern tasks.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-slate-900/90 via-indigo-950/30 to-slate-900/90 border border-slate-800/80 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">💼</span>
            <h2 className="text-base font-bold text-white tracking-tight">
              Task Management & Workforce Lifecycle
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-indigo-900/60 text-indigo-300 border border-indigo-700/50">
              Phase 14 Core
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Work as a first-class citizen: Durable identity, explicit state machines, agent execution, and verifiable audit trail.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={fetchTasks}
            disabled={loadingTasks}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer flex items-center gap-1.5"
          >
            <span className={loadingTasks ? 'animate-spin' : ''}>↻</span> Refresh
          </button>
          <button
            type="button"
            onClick={() => setIsCreating(!isCreating)}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition cursor-pointer flex items-center gap-1.5"
          >
            <span>{isCreating ? '✕ Close Form' : '+ New Task'}</span>
          </button>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {actionMessage && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
            actionMessage.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-800/60 text-emerald-200'
              : 'bg-rose-950/60 border-rose-800/60 text-rose-200'
          }`}
        >
          <span>{actionMessage.text}</span>
          <button
            type="button"
            onClick={() => setActionMessage(null)}
            className="text-slate-400 hover:text-white text-xs cursor-pointer ml-3"
          >
            ✕
          </button>
        </div>
      )}

      {/* Task Creation Form (Collapsible / Modal drawer) */}
      {isCreating && (
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-indigo-800/60 shadow-2xl space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-base">📝</span>
              <h3 className="text-sm font-semibold text-white">Create Durable Task</h3>
              <span className="text-[10px] text-slate-400 font-mono">Status: REQUESTED</span>
            </div>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="text-slate-500 hover:text-slate-300 text-sm cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* Quick Presets */}
          <div className="space-y-1.5">
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">Quick Mission Presets:</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  applyPreset(
                    'Research Apex Cloud & Customer Verification',
                    'Research Apex Cloud and verify whether they are an existing customer in our database with contact sarah@apexcloud.io.'
                  )
                }
                className="px-2.5 py-1 rounded-lg text-[11px] bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 transition"
              >
                🌐+🏢 Research Apex Cloud & Verify Sarah
              </button>
              <button
                type="button"
                onClick={() =>
                  applyPreset(
                    'Internal Support SLAs & Customer Discovery',
                    'Retrieve our internal customer support SLAs from the knowledge base and verify support tier for contact sarah@apexcloud.io.'
                  )
                }
                className="px-2.5 py-1 rounded-lg text-[11px] bg-slate-800 hover:bg-slate-700 text-purple-300 border border-slate-700 transition"
              >
                📖+🏢 SLA Retrieval & Verification
              </button>
              <button
                type="button"
                onClick={() =>
                  applyPreset(
                    'Enterprise Outage Response Plan',
                    'Plan an enterprise database reconciliation workflow between MySQL customer records and Redis cache clusters.'
                  )
                }
                className="px-2.5 py-1 rounded-lg text-[11px] bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 transition"
              >
                📋 Planning: Database Reconciliation
              </button>
            </div>
          </div>

          <form onSubmit={handleCreateTask} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-medium text-slate-300">Task Title (Optional)</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Research Apex Cloud and verify prospect"
                  maxLength={255}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Priority</label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value as TaskPriority)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                >
                  <option value="LOW">LOW</option>
                  <option value="NORMAL">NORMAL</option>
                  <option value="HIGH">HIGH</option>
                  <option value="URGENT">URGENT</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <label className="font-medium">Goal / Instruction (Required)</label>
                <span className="text-[10px] text-slate-500 font-mono">{newGoal.length} / 3000 chars</span>
              </div>
              <textarea
                value={newGoal}
                onChange={(e) => setNewGoal(e.target.value)}
                placeholder="Describe the unit of work to be performed by the agent workforce..."
                rows={3}
                required
                maxLength={3000}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-indigo-500 leading-relaxed font-sans"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
              <div className="flex items-center gap-4 text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                  <input
                    type="radio"
                    name="taskMode"
                    value="tools"
                    checked={newMode === 'tools'}
                    onChange={() => setNewMode('tools')}
                    className="accent-indigo-500"
                  />
                  <span>Autonomous Tools Execution</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                  <input
                    type="radio"
                    name="taskMode"
                    value="planning"
                    checked={newMode === 'planning'}
                    onChange={() => setNewMode('planning')}
                    className="accent-indigo-500"
                  />
                  <span>Structured Plan Synthesis</span>
                </label>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading || !newGoal.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition disabled:opacity-50 cursor-pointer shadow-lg shadow-indigo-600/30"
                >
                  {createLoading ? 'Persisting...' : 'Persist Task (REQUESTED)'}
                </button>
              </div>
            </div>

            {createError && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
                {createError}
              </div>
            )}
          </form>
        </div>
      )}

      {/* Main Grid: Task List (Left) & Task Detail Inspector (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Task History & Filters (5 or 6 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-4 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-slate-800 shadow-xl space-y-3">
            {/* Status Filter Chips */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs border-b border-slate-800/80 pb-3">
              {['ALL', 'REQUESTED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => {
                    setStatusFilter(st);
                    setOffset(0);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition cursor-pointer ${
                    statusFilter === st
                      ? 'bg-indigo-600 text-white font-bold shadow'
                      : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            {/* Tasks Summary List */}
            {tasksError && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
                {tasksError}
              </div>
            )}

            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {tasks.map((task) => {
                const isSelected = selectedTaskId === task.id;
                return (
                  <div
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer space-y-2 ${
                      isSelected
                        ? 'bg-indigo-950/40 border-indigo-500 shadow-lg'
                        : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] text-slate-500">{task.id.substring(0, 8)}</span>
                          {renderPriorityBadge(task.priority)}
                        </div>
                        <h4 className="text-xs font-semibold text-white mt-1 truncate">
                          {task.title || task.goal}
                        </h4>
                      </div>
                      <div className="shrink-0">{renderStatusBadge(task.status)}</div>
                    </div>

                    <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                      {task.goal}
                    </p>

                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1 border-t border-slate-900">
                      <span>Steps: <strong className="text-cyan-400">{task.stepCount}</strong></span>
                      <span>Cost: <strong className="text-amber-400">${task.totalCostUsd.toFixed(4)}</strong></span>
                      <span>{new Date(task.createdAt).toLocaleTimeString()}</span>
                    </div>
                  </div>
                );
              })}

              {tasks.length === 0 && !loadingTasks && (
                <div className="p-8 text-center text-slate-500 text-xs rounded-xl border border-dashed border-slate-800">
                  No tasks found under current filter.
                </div>
              )}
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800/80">
              <span>Total: {totalCount} tasks</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={offset === 0 || loadingTasks}
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 text-xs"
                >
                  ◀ Prev
                </button>
                <span className="font-mono text-[11px] px-2 text-slate-300">
                  {Math.floor(offset / limit) + 1}
                </span>
                <button
                  type="button"
                  disabled={offset + limit >= totalCount || loadingTasks}
                  onClick={() => setOffset(offset + limit)}
                  className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 text-xs"
                >
                  Next ▶
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Task Details Inspector & Interactive Execution (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {selectedTaskId && taskDetails ? (
            <div className="p-5 rounded-2xl bg-slate-900/80 backdrop-blur-md border border-slate-800 shadow-2xl space-y-5">
              {/* Header: Title, Status, and Controls */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
                <div className="space-y-1 flex-1 min-w-[260px]">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-indigo-400 bg-indigo-950/80 border border-indigo-800 px-2 py-0.5 rounded">
                      ID: {taskDetails.task.id}
                    </span>
                    {renderPriorityBadge(taskDetails.task.priority)}
                    {renderStatusBadge(taskDetails.task.status)}
                  </div>

                  {isEditingTitle ? (
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="text"
                        value={editedTitle}
                        onChange={(e) => setEditedTitle(e.target.value)}
                        className="px-2.5 py-1 rounded bg-slate-950 border border-indigo-500 text-white text-xs w-full focus:outline-none"
                      />
                      <button
                        type="button"
                        disabled={updatingTitle}
                        onClick={() => handleSaveTitle(taskDetails.task.id)}
                        className="px-2.5 py-1 rounded text-xs bg-indigo-600 text-white cursor-pointer"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditingTitle(false)}
                        className="px-2 py-1 rounded text-xs text-slate-400 hover:text-white"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 group mt-1">
                      <h3 className="text-sm font-bold text-white">
                        {taskDetails.task.title || 'Untitled Task'}
                      </h3>
                      <button
                        type="button"
                        onClick={() => setIsEditingTitle(true)}
                        className="text-[10px] text-slate-500 hover:text-indigo-400 opacity-60 group-hover:opacity-100 transition cursor-pointer"
                      >
                        ✏️ Edit Title
                      </button>
                    </div>
                  )}
                </div>

                {/* Primary Action Buttons */}
                <div className="flex items-center gap-2">
                  {taskDetails.task.status === 'REQUESTED' && (
                    <button
                      type="button"
                      disabled={runningTaskId === taskDetails.task.id}
                      onClick={() => handleRunTask(taskDetails.task.id)}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-lg shadow-emerald-600/30 cursor-pointer flex items-center gap-1.5"
                    >
                      <span>▶ Run Task</span>
                    </button>
                  )}

                  {(taskDetails.task.status === 'REQUESTED' || taskDetails.task.status === 'RUNNING') && (
                    <button
                      type="button"
                      disabled={cancellingTaskId === taskDetails.task.id}
                      onClick={() => handleCancelTask(taskDetails.task.id)}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 transition cursor-pointer"
                    >
                      ✕ Cancel
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => fetchTaskDetails(taskDetails.task.id)}
                    disabled={loadingDetails}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition"
                    title="Refresh"
                  >
                    ↻
                  </button>
                </div>
              </div>

              {detailsError && (
                <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
                  {detailsError}
                </div>
              )}

              {/* Goal Box */}
              <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800/80 space-y-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">
                  Original User Goal / Request
                </span>
                <p className="text-xs text-slate-200 leading-relaxed font-sans whitespace-pre-wrap">
                  {taskDetails.task.goal}
                </p>
              </div>

              {/* Multi-Source Attribution Badges */}
              {taskDetails.sources.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">
                    Verified Evidence Sources
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {taskDetails.sources.map((src, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-950 border border-slate-800 text-cyan-300 flex items-center gap-1.5"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                        {src}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Task Steps Sequence */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold text-slate-300">
                    Execution Steps ({taskDetails.steps.length})
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">Durable MySQL `task_steps`</span>
                </div>

                <div className="space-y-2">
                  {taskDetails.steps.map((step) => (
                    <div
                      key={step.id}
                      className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5">
                          <span className="px-2 py-0.5 rounded font-mono text-xs font-bold bg-cyan-950 border border-cyan-800 text-cyan-300 shrink-0">
                            #{step.step_order}
                          </span>
                          <div>
                            <h5 className="text-xs font-semibold text-white">{step.title}</h5>
                            <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{step.description}</p>
                          </div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold shrink-0 ${
                            step.status === 'COMPLETED'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                              : step.status === 'FAILED'
                              ? 'bg-rose-950 text-rose-300 border border-rose-800/60'
                              : 'bg-slate-900 text-amber-300 border border-slate-800'
                          }`}
                        >
                          {step.status}
                        </span>
                      </div>

                      {step.tool_name && (
                        <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-900">
                          <span>Tool: <strong className="text-cyan-300">{step.tool_name}</strong></span>
                        </div>
                      )}
                    </div>
                  ))}

                  {taskDetails.steps.length === 0 && (
                    <div className="p-4 rounded-xl border border-dashed border-slate-800 text-center text-slate-500 text-xs">
                      No steps executed yet. Click "Run Task" to begin agent execution loop.
                    </div>
                  )}
                </div>
              </div>

              {/* Tool Executions Breakdown */}
              {taskDetails.toolExecutions.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold text-slate-300">
                      Tool Executions ({taskDetails.toolExecutions.length})
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">Linked `tool_executions`</span>
                  </div>

                  <div className="space-y-2">
                    {taskDetails.toolExecutions.map((exec) => (
                      <div
                        key={exec.id}
                        className="p-3 rounded-xl bg-slate-950/90 border border-slate-800/90 font-mono text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-cyan-300 font-bold">{exec.tool}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400 text-[10px]">{exec.durationMs}ms</span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                exec.success
                                  ? 'bg-emerald-950 text-emerald-300'
                                  : 'bg-rose-950 text-rose-300'
                              }`}
                            >
                              {exec.success ? 'SUCCESS' : 'ERROR'}
                            </span>
                          </div>
                        </div>

                        <details className="text-[11px] text-slate-400 pt-1">
                          <summary className="cursor-pointer text-slate-500 hover:text-slate-300 select-none">
                            ▸ View Observation Output
                          </summary>
                          <pre className="mt-1.5 p-2 rounded bg-slate-900 text-slate-300 text-[10px] overflow-x-auto whitespace-pre-wrap max-h-40">
                            {JSON.stringify(exec.result, null, 2)}
                          </pre>
                        </details>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Final Result / Report */}
              {taskDetails.task.final_report && (
                <div className="p-4 rounded-xl bg-gradient-to-br from-slate-950 via-indigo-950/20 to-slate-950 border border-indigo-900/50 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-indigo-300 flex items-center gap-1.5">
                      <span>🏁</span> Task Synthesis & Report
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400">Validated Outcome</span>
                  </div>
                  <p className="text-xs text-slate-100 leading-relaxed font-sans whitespace-pre-wrap bg-slate-950/60 p-3 rounded-lg border border-slate-800/60">
                    {taskDetails.task.final_report}
                  </p>
                </div>
              )}

              {/* Error Message if Failed */}
              {taskDetails.task.error_message && (
                <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-200 text-xs space-y-1">
                  <span className="font-bold uppercase text-[10px] tracking-wider block">Execution Failure</span>
                  <p className="font-mono">{taskDetails.task.error_message}</p>
                </div>
              )}

              {/* AI Telemetry HUD */}
              {taskDetails.telemetry && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono">
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase">Model</span>
                    <span className="text-indigo-300 font-semibold">{taskDetails.telemetry.model}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase">Tokens</span>
                    <span className="text-cyan-300 font-semibold">{taskDetails.telemetry.totalTokens}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase">Latency</span>
                    <span className="text-white font-semibold">{taskDetails.telemetry.latencyMs}ms</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase">Est. Cost</span>
                    <span className="text-amber-300 font-semibold">
                      ${taskDetails.telemetry.estimatedCostUsd.toFixed(6)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-12 rounded-2xl bg-slate-900/40 border border-dashed border-slate-800 text-center text-slate-500 text-xs space-y-2">
              <span className="text-3xl block">📋</span>
              <p className="font-semibold text-slate-400">No Task Selected</p>
              <p className="max-w-sm mx-auto">
                Select a task from the list on the left to inspect its lifecycle state, execution steps, tool records, and verified outcome.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

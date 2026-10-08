import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/AuthContext';
import { getApiUrl } from '../config/api';

type AdminTab = 'overview' | 'users' | 'tools' | 'usage' | 'audit' | 'integrations';

interface OrgSettings {
  id: string;
  name: string;
  description?: string;
  status: string;
  monthlyBudgetUsd: number;
  currentSpendUsd: number;
  maxTaskDurationSeconds: number;
  maxToolCalls: number;
  maxCycles: number;
  workforcePaused: boolean;
  defaultTimezone: string;
  updatedAt: string;
}

interface OrgUser {
  id: string;
  email: string;
  fullName: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'OPERATOR';
  status: 'ACTIVE' | 'INVITED' | 'SUSPENDED' | 'DISABLED';
  organizationId: string;
  lastLoginAt?: string;
  createdAt: string;
}

interface ToolPolicy {
  name: string;
  description: string;
  riskLevel: string;
  state: 'ENABLED' | 'DISABLED' | 'REQUIRES_APPROVAL';
  isConfigured: boolean;
  updatedBy?: string;
  updatedAt?: string;
}

interface UsageSummary {
  organizationId: string;
  monthlyBudgetUsd: number;
  currentSpendUsd: number;
  remainingBudgetUsd: number;
  spendPercentage: number;
  budgetStatus: 'NORMAL' | 'WARNING' | 'LIMIT_REACHED';
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  totalTokens: number;
  totalToolCalls: number;
  users: Array<{
    userId: string;
    email: string;
    role: string;
    totalTasks: number;
    tokens: number;
    costUsd: number;
    toolCalls: number;
    failureCount: number;
  }>;
  tools: Array<{
    toolName: string;
    executions: number;
    successRate: number;
    failureRate: number;
    averageDurationMs: number;
    estimatedCostUsd: number;
  }>;
}

interface AuditRecord {
  id: string;
  eventType: string;
  action: string;
  userId?: string;
  timestamp: string;
  details: Record<string, unknown>;
}

interface HealthSummary {
  overallScore: number;
  status: string;
  categories: Record<string, { score: number; status: string; details: string }>;
}

export const AdminPage: React.FC = () => {
  const { authFetch, user } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  // State
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [toolPolicies, setToolPolicies] = useState<ToolPolicy[]>([]);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditRecord[]>([]);
  const [health, setHealth] = useState<HealthSummary | null>(null);
  const [integrations, setIntegrations] = useState<any[]>([]);

  const [loading, setLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Invite modal state
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'OWNER' | 'ADMIN' | 'MEMBER' | 'OPERATOR'>('MEMBER');

  // Kill Switch state
  const [killSwitchReason, setKillSwitchReason] = useState('');

  // Policy Simulator state
  const [simulatorTool, setSimulatorTool] = useState('gmailSend');
  const [simulationResult, setSimulationResult] = useState<any | null>(null);

  // Settings editing state
  const [editingSettings, setEditingSettings] = useState(false);
  const [editBudget, setEditBudget] = useState('150');
  const [editDuration, setEditDuration] = useState('180');
  const [editToolCalls, setEditToolCalls] = useState('12');
  const [editCycles, setEditCycles] = useState('8');

  // Fetch functions
  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      // 1. Settings & Health
      const [resSettings, resHealth] = await Promise.all([
        authFetch(getApiUrl('/api/admin/settings')),
        authFetch(getApiUrl('/api/admin/health')),
      ]);

      if (resSettings.ok) {
        const json = await resSettings.json();
        setSettings(json.data);
        setEditBudget(String(json.data.monthlyBudgetUsd));
        setEditDuration(String(json.data.maxTaskDurationSeconds));
        setEditToolCalls(String(json.data.maxToolCalls));
        setEditCycles(String(json.data.maxCycles));
      }
      if (resHealth.ok) {
        const json = await resHealth.json();
        setHealth(json.data);
      }

      // 2. Users
      const resUsers = await authFetch(getApiUrl('/api/admin/users'));
      if (resUsers.ok) {
        const json = await resUsers.json();
        setUsers(json.data);
      }

      // 3. Tool policies
      const resTools = await authFetch(getApiUrl('/api/admin/tool-policies'));
      if (resTools.ok) {
        const json = await resTools.json();
        setToolPolicies(json.data);
      }

      // 4. Usage
      const resUsage = await authFetch(getApiUrl('/api/admin/usage'));
      if (resUsage.ok) {
        const json = await resUsage.json();
        setUsage(json.data);
      }

      // 5. Audit
      const resAudit = await authFetch(getApiUrl('/api/admin/audit?limit=25'));
      if (resAudit.ok) {
        const json = await resAudit.json();
        setAuditLogs(json.data);
      }

      // 6. Integrations
      const resInteg = await authFetch(getApiUrl('/api/admin/integrations'));
      if (resInteg.ok) {
        const json = await resInteg.json();
        setIntegrations(json.data);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load administration data');
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Kill Switch Toggle
  const handleToggleKillSwitch = async (pause: boolean) => {
    try {
      const res = await authFetch(getApiUrl('/api/admin/emergency-kill-switch'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: pause, reason: killSwitchReason || 'Manual toggle from admin panel' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to toggle kill switch');

      setFeedbackMessage(json.message);
      setKillSwitchReason('');
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  // Save Settings
  const handleSaveSettings = async () => {
    try {
      const res = await authFetch(getApiUrl('/api/admin/settings'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthlyBudgetUsd: parseFloat(editBudget),
          maxTaskDurationSeconds: parseInt(editDuration, 10),
          maxToolCalls: parseInt(editToolCalls, 10),
          maxCycles: parseInt(editCycles, 10),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to update settings');

      setEditingSettings(false);
      setFeedbackMessage('Organization settings successfully updated.');
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  // Invite User
  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await authFetch(getApiUrl('/api/admin/users/invite'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to send invitation');

      setInviteModalOpen(false);
      setInviteEmail('');
      setFeedbackMessage(`Invitation sent to ${inviteEmail}. Single-use token valid for 7 days.`);
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  // Update User Role
  const handleUpdateRole = async (targetUserId: string, newRole: OrgUser['role']) => {
    try {
      const res = await authFetch(getApiUrl(`/api/admin/users/${targetUserId}/role`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to update role');

      setFeedbackMessage('User role updated successfully.');
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  // Update User Status
  const handleUpdateStatus = async (targetUserId: string, newStatus: OrgUser['status']) => {
    try {
      const res = await authFetch(getApiUrl(`/api/admin/users/${targetUserId}/status`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to update status');

      setFeedbackMessage(`User status updated to ${newStatus}.`);
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  // Update Tool Policy
  const handleUpdateToolPolicy = async (toolName: string, state: ToolPolicy['state']) => {
    try {
      const res = await authFetch(getApiUrl(`/api/admin/tool-policies/${toolName}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to update tool policy');

      setFeedbackMessage(`Tool policy for '${toolName}' set to ${state}.`);
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  // Policy Simulator Test
  const handleSimulatePolicy = async () => {
    try {
      setSimulationResult(null);
      const res = await authFetch(getApiUrl('/api/admin/evaluate-tool'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolName: simulatorTool }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Simulation failed');
      setSimulationResult(json.data);
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
            <span className="text-xs font-mono font-medium text-cyan-300 uppercase tracking-widest">
              Enterprise Governance
            </span>
            {settings?.workforcePaused && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800 animate-pulse">
                KILL SWITCH ACTIVE
              </span>
            )}
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-medium tracking-tight text-white">
            Administration & Workforce Control
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Tenant: <span className="font-semibold text-slate-200">{settings?.name || 'Apex Enterprise'}</span> ({settings?.id || user?.organizationId})
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition shadow-sm"
        >
          <span className={loading ? 'animate-spin' : ''}>🔄</span>
          <span>Refresh</span>
        </button>
      </div>

      {/* Alert Banners */}
      {feedbackMessage && (
        <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-200 text-xs flex items-center justify-between">
          <span>✓ {feedbackMessage}</span>
          <button onClick={() => setFeedbackMessage(null)} className="text-emerald-400 hover:text-white">✕</button>
        </div>
      )}
      {errorMessage && (
        <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-200 text-xs flex items-center justify-between">
          <span>⚠ {errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Emergency Kill Switch Banner if Paused */}
      {settings?.workforcePaused && (
        <div className="p-4 rounded-2xl bg-rose-950/80 border border-rose-800 text-rose-100 space-y-2 shadow-2xl">
          <div className="flex items-center gap-2 font-bold text-sm">
            <span>🚨</span>
            <span>EMERGENCY KILL SWITCH ENGAGED — AI WORKFORCE PAUSED</span>
          </div>
          <p className="text-xs text-rose-200">
            All autonomous task executions, LLM requests, and external tool calls are completely paused by organization administrator policy.
          </p>
          <div className="pt-2">
            <button
              onClick={() => handleToggleKillSwitch(false)}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-lg"
            >
              Release Kill Switch (Resume Workforce)
            </button>
          </div>
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="flex items-center gap-1 border-b border-slate-800/80 overflow-x-auto pb-1 text-xs font-medium">
        {[
          { id: 'overview', label: 'Governance & Emergency', icon: '🛡️' },
          { id: 'users', label: `Users (${users.length})`, icon: '👥' },
          { id: 'tools', label: `Tool Policies (${toolPolicies.length})`, icon: '⚙️' },
          { id: 'usage', label: 'Usage & Cost Budgets', icon: '💰' },
          { id: 'audit', label: `Audit Trail (${auditLogs.length})`, icon: '📜' },
          { id: 'integrations', label: `Integrations (${integrations.length})`, icon: '🔌' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as AdminTab)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition-all ${
              activeTab === tab.id
                ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 font-semibold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW & GOVERNANCE */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Emergency Kill Switch Control Card */}
          <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                  Emergency Operational Kill Switch (Section 57, 58)
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Immediate platform-level emergency control. Suspends all pending and new autonomous agent executions.
                </p>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                  settings?.workforcePaused
                    ? 'bg-rose-950 text-rose-300 border-rose-800'
                    : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                }`}
              >
                {settings?.workforcePaused ? 'PAUSED' : 'ACTIVE & RUNNING'}
              </span>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
              <input
                type="text"
                placeholder="Reason for kill-switch toggle (audited)..."
                value={killSwitchReason}
                onChange={(e) => setKillSwitchReason(e.target.value)}
                className="w-full sm:flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
              {settings?.workforcePaused ? (
                <button
                  onClick={() => handleToggleKillSwitch(false)}
                  className="w-full sm:w-auto px-5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-md"
                >
                  Resume Workforce
                </button>
              ) : (
                <button
                  onClick={() => handleToggleKillSwitch(true)}
                  className="w-full sm:w-auto px-5 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition shadow-md"
                >
                  Pause Entire Workforce (Kill Switch)
                </button>
              )}
            </div>
          </div>

          {/* Workforce Health Scorecard (Section 56) */}
          {health && (
            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                    Workforce Health & Operational Assurance
                  </h2>
                  <p className="text-xs text-slate-400">
                    Real-time synthesis across 7 governance dimensions.
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold font-mono text-cyan-400">{health.overallScore}%</div>
                  <div className="text-[10px] font-semibold text-emerald-400 uppercase">{health.status}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                {Object.entries(health.categories).map(([key, cat]) => (
                  <div key={key} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold capitalize text-slate-200">{key}</span>
                      <span className="font-mono text-cyan-300">{cat.score}%</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                      <div className="bg-cyan-400 h-full" style={{ width: `${cat.score}%` }}></div>
                    </div>
                    <p className="text-[10px] text-slate-400 truncate">{cat.details}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Organization Settings Card (Section 12) */}
          <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                  Organization Governance Bounds
                </h2>
                <p className="text-xs text-slate-400">
                  Authoritative tenant bounds validated server-side.
                </p>
              </div>
              {!editingSettings ? (
                <button
                  onClick={() => setEditingSettings(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
                >
                  Edit Limits
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingSettings(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveSettings}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white"
                  >
                    Save Changes
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <span className="text-[10px] font-semibold text-slate-400 uppercase">Monthly AI Budget</span>
                {editingSettings ? (
                  <div className="mt-1 flex items-center gap-1">
                    <span className="text-xs text-slate-400">$</span>
                    <input
                      type="number"
                      value={editBudget}
                      onChange={(e) => setEditBudget(e.target.value)}
                      className="w-full px-2 py-1 rounded bg-slate-900 text-xs text-white border border-slate-700"
                    />
                  </div>
                ) : (
                  <div className="text-lg font-mono font-bold text-white mt-1">
                    ${settings?.monthlyBudgetUsd.toFixed(2)}
                  </div>
                )}
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <span className="text-[10px] font-semibold text-slate-400 uppercase">Max Task Duration</span>
                {editingSettings ? (
                  <div className="mt-1 flex items-center gap-1">
                    <input
                      type="number"
                      value={editDuration}
                      onChange={(e) => setEditDuration(e.target.value)}
                      className="w-full px-2 py-1 rounded bg-slate-900 text-xs text-white border border-slate-700"
                    />
                    <span className="text-xs text-slate-400">sec</span>
                  </div>
                ) : (
                  <div className="text-lg font-mono font-bold text-white mt-1">
                    {settings?.maxTaskDurationSeconds}s
                  </div>
                )}
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <span className="text-[10px] font-semibold text-slate-400 uppercase">Max Tool Calls / Task</span>
                {editingSettings ? (
                  <input
                    type="number"
                    value={editToolCalls}
                    onChange={(e) => setEditToolCalls(e.target.value)}
                    className="w-full mt-1 px-2 py-1 rounded bg-slate-900 text-xs text-white border border-slate-700"
                  />
                ) : (
                  <div className="text-lg font-mono font-bold text-white mt-1">
                    {settings?.maxToolCalls}
                  </div>
                )}
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <span className="text-[10px] font-semibold text-slate-400 uppercase">Max Agent Cycles</span>
                {editingSettings ? (
                  <input
                    type="number"
                    value={editCycles}
                    onChange={(e) => setEditCycles(e.target.value)}
                    className="w-full mt-1 px-2 py-1 rounded bg-slate-900 text-xs text-white border border-slate-700"
                  />
                ) : (
                  <div className="text-lg font-mono font-bold text-white mt-1">
                    {settings?.maxCycles}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: USER MANAGEMENT */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">
              Manage organization members, assign roles (OWNER, ADMIN, MEMBER, OPERATOR), and control lifecycle states.
            </p>
            <button
              onClick={() => setInviteModalOpen(true)}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white transition shadow-sm"
            >
              + Invite Member
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Member</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Last Login</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3 px-4">
                      <div className="font-medium text-white">{u.fullName}</div>
                      <div className="text-[10px] text-slate-400">{u.email}</div>
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={u.role}
                        onChange={(e) => handleUpdateRole(u.id, e.target.value as OrgUser['role'])}
                        className="px-2 py-1 rounded-md bg-slate-950 border border-slate-800 text-xs font-mono font-semibold text-cyan-300 focus:outline-none"
                      >
                        <option value="OWNER">OWNER</option>
                        <option value="ADMIN">ADMIN</option>
                        <option value="MEMBER">MEMBER</option>
                        <option value="OPERATOR">OPERATOR</option>
                      </select>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                          u.status === 'ACTIVE'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/80'
                            : u.status === 'SUSPENDED'
                            ? 'bg-amber-950 text-amber-300 border border-amber-800/80'
                            : 'bg-rose-950 text-rose-300 border border-rose-800/80'
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-400 text-[10px] font-mono">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {u.id !== user?.id && (
                        <button
                          onClick={() =>
                            handleUpdateStatus(u.id, u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE')
                          }
                          className={`px-2.5 py-1 rounded text-[10px] font-semibold transition ${
                            u.status === 'ACTIVE'
                              ? 'bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-300 border border-slate-700'
                              : 'bg-emerald-950 text-emerald-300 border border-emerald-800 hover:bg-emerald-900'
                          }`}
                        >
                          {u.status === 'ACTIVE' ? 'Disable' : 'Reactivate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Invite User Modal */}
          {inviteModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="w-full max-w-md p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl space-y-4">
                <h3 className="font-display text-lg font-semibold text-white">Invite Organization Member</h3>
                <form onSubmit={handleInviteUser} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
                    <input
                      type="email"
                      required
                      placeholder="colleague@enterprise.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Role Assignment</label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none"
                    >
                      <option value="MEMBER">MEMBER (Standard user, can create & execute allowed tasks)</option>
                      <option value="OPERATOR">OPERATOR (Can monitor, cancel, approve)</option>
                      <option value="ADMIN">ADMIN (Can manage users, configure policies)</option>
                      <option value="OWNER">OWNER (Full governance authority)</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setInviteModalOpen(false)}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-300 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white"
                    >
                      Generate Invitation
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: TOOL GOVERNANCE */}
      {activeTab === 'tools' && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 space-y-1">
            <span className="font-semibold text-white">Precedence Hierarchy: </span>
            <span>Platform Safety → Organization Policy → User Permission → Tool Risk Policy → Approval Gate → Execution.</span>
            <div className="text-[11px] text-slate-400">
              * Note: The LLM can propose tool actions, but the application authoritatively dictates execution permissions.
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Tool Name</th>
                  <th className="py-3 px-4">Intrinsic Risk</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4">Organization Policy</th>
                  <th className="py-3 px-4 text-right">Configure</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {toolPolicies.map((tp) => (
                  <tr key={tp.name} className="hover:bg-slate-800/30 transition">
                    <td className="py-3 px-4 font-mono font-semibold text-white">{tp.name}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                          tp.riskLevel === 'EXTERNAL_SIDE_EFFECT'
                            ? 'bg-rose-950 text-rose-300 border border-rose-800'
                            : tp.riskLevel === 'MUTATING'
                            ? 'bg-amber-950 text-amber-300 border border-amber-800'
                            : 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                        }`}
                      >
                        {tp.riskLevel}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-400 text-xs max-w-xs truncate">{tp.description}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          tp.state === 'ENABLED'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : tp.state === 'REQUIRES_APPROVAL'
                            ? 'bg-amber-950 text-amber-300 border border-amber-800'
                            : 'bg-rose-950 text-rose-300 border border-rose-800'
                        }`}
                      >
                        {tp.state}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <select
                        value={tp.state}
                        onChange={(e) => handleUpdateToolPolicy(tp.name, e.target.value as any)}
                        className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-[11px] font-semibold text-slate-200 focus:outline-none"
                      >
                        <option value="ENABLED">ENABLED</option>
                        <option value="REQUIRES_APPROVAL">REQUIRES_APPROVAL</option>
                        <option value="DISABLED">DISABLED</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Interactive Policy Simulator (Section 20) */}
          <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
              7-Layer Policy Precedence Simulator (Section 20, 34)
            </h2>
            <p className="text-xs text-slate-400">
              Test how the backend authoritatively evaluates any tool request through all 7 governance tiers.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <select
                value={simulatorTool}
                onChange={(e) => setSimulatorTool(e.target.value)}
                className="w-full sm:w-64 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-cyan-300 focus:outline-none"
              >
                {toolPolicies.map((tp) => (
                  <option key={tp.name} value={tp.name}>{tp.name}</option>
                ))}
              </select>
              <button
                onClick={handleSimulatePolicy}
                className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white transition shadow-md"
              >
                Simulate Evaluation
              </button>
            </div>

            {simulationResult && (
              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-xs space-y-2 font-mono">
                <div className="flex items-center justify-between">
                  <span>Decision:</span>
                  <span
                    className={`px-2.5 py-0.5 rounded text-xs font-bold ${
                      simulationResult.decision === 'ALLOW'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : simulationResult.decision === 'REQUIRE_APPROVAL'
                        ? 'bg-amber-950 text-amber-300 border border-amber-800'
                        : 'bg-rose-950 text-rose-300 border border-rose-800'
                    }`}
                  >
                    {simulationResult.decision}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Evaluating Layer:</span>
                  <span className="text-cyan-300">{simulationResult.layer}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Approval Required:</span>
                  <span className="text-white">{String(simulationResult.requiresApproval)}</span>
                </div>
                <div className="pt-2 text-slate-300 border-t border-slate-800/80">
                  <span className="text-slate-500">Explanation: </span>
                  {simulationResult.reason}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: USAGE & COST GOVERNANCE */}
      {activeTab === 'usage' && usage && (
        <div className="space-y-6">
          {/* Budget Overview Card (Section 22, 23) */}
          <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Monthly AI Spend Budget</h2>
                <p className="text-xs text-slate-400">Pre-execution enforcement prevents runaway token spending.</p>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                  usage.budgetStatus === 'NORMAL'
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                    : usage.budgetStatus === 'WARNING'
                    ? 'bg-amber-950 text-amber-300 border-amber-800'
                    : 'bg-rose-950 text-rose-300 border-rose-800'
                }`}
              >
                {usage.budgetStatus}
              </span>
            </div>

            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Current Spend: ${usage.currentSpendUsd.toFixed(2)}</span>
                <span className="text-white font-bold">{usage.spendPercentage}% of ${usage.monthlyBudgetUsd.toFixed(2)}</span>
              </div>
              <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800">
                <div
                  className={`h-full transition-all duration-500 ${
                    usage.spendPercentage >= 90
                      ? 'bg-rose-500'
                      : usage.spendPercentage >= 75
                      ? 'bg-amber-500'
                      : 'bg-cyan-400'
                  }`}
                  style={{ width: `${Math.min(100, usage.spendPercentage)}%` }}
                ></div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 text-center">
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase">Tasks Completed</div>
                <div className="text-xl font-bold font-mono text-white mt-0.5">{usage.totalTasks}</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase">Success Rate</div>
                <div className="text-xl font-bold font-mono text-emerald-400 mt-0.5">
                  {usage.totalTasks > 0 ? ((usage.successfulTasks / usage.totalTasks) * 100).toFixed(1) : '100'}%
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase">Total Tokens</div>
                <div className="text-xl font-bold font-mono text-cyan-400 mt-0.5">
                  {usage.totalTokens.toLocaleString()}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase">Tool Executions</div>
                <div className="text-xl font-bold font-mono text-white mt-0.5">{usage.totalToolCalls}</div>
              </div>
            </div>
          </div>

          {/* User Usage Breakdown (Section 26) */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Usage by User</h3>
            <div className="overflow-x-auto rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Tasks</th>
                    <th className="py-3 px-4">Tokens</th>
                    <th className="py-3 px-4">AI Cost (USD)</th>
                    <th className="py-3 px-4">Tool Calls</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {usage.users.map((u) => (
                    <tr key={u.userId} className="hover:bg-slate-800/30 transition font-mono">
                      <td className="py-3 px-4 font-sans text-white">{u.email}</td>
                      <td className="py-3 px-4 text-cyan-300">{u.role}</td>
                      <td className="py-3 px-4 text-slate-200">{u.totalTasks}</td>
                      <td className="py-3 px-4 text-slate-300">{u.tokens.toLocaleString()}</td>
                      <td className="py-3 px-4 text-emerald-400 font-bold">${u.costUsd.toFixed(2)}</td>
                      <td className="py-3 px-4 text-slate-200">{u.toolCalls}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tool Usage Breakdown (Section 27) */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Usage by Tool</h3>
            <div className="overflow-x-auto rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Tool</th>
                    <th className="py-3 px-4">Executions</th>
                    <th className="py-3 px-4">Success Rate</th>
                    <th className="py-3 px-4">Avg Duration</th>
                    <th className="py-3 px-4">Est. Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {usage.tools.map((tm) => (
                    <tr key={tm.toolName} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4 font-semibold text-white">{tm.toolName}</td>
                      <td className="py-3 px-4 text-slate-300">{tm.executions}</td>
                      <td className="py-3 px-4 text-emerald-400">{tm.successRate}%</td>
                      <td className="py-3 px-4 text-slate-300">{tm.averageDurationMs}ms</td>
                      <td className="py-3 px-4 text-cyan-300">${tm.estimatedCostUsd.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: AUDIT TRAIL */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <p className="text-xs text-slate-400">
            Tenant-isolated, append-only immutable audit trail capturing administrative modifications, kill-switch toggles, and security events.
          </p>

          <div className="overflow-x-auto rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Event Type</th>
                  <th className="py-3 px-4">Action Summary</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-cyan-300 font-bold">
                        {log.eventType}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-sans text-white max-w-xs truncate">{log.action}</td>
                    <td className="py-3 px-4 text-slate-400 truncate max-w-[120px]">{log.userId || 'system'}</td>
                    <td className="py-3 px-4 text-slate-500 max-w-xs truncate">{JSON.stringify(log.details)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: INTEGRATIONS */}
      {activeTab === 'integrations' && (
        <div className="space-y-4">
          <p className="text-xs text-slate-400">
            Safe administrative metadata of external integrations. Secrets are strictly masked and protected server-side.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {integrations.map((integ, idx) => (
              <div key={idx} className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-white text-sm">{integ.name}</div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      integ.status === 'CONNECTED'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : 'bg-amber-950 text-amber-300 border border-amber-800'
                    }`}
                  >
                    {integ.status}
                  </span>
                </div>
                <div className="text-xs text-slate-400 font-mono space-y-1">
                  <div>Provider: <span className="text-slate-200">{integ.provider}</span></div>
                  <div>Connected: <span className="text-slate-300">{new Date(integ.connectedAt).toLocaleDateString()}</span></div>
                  <div>Last Used: <span className="text-slate-300">{new Date(integ.lastUsedAt).toLocaleTimeString()}</span></div>
                  {integ.scopes && (
                    <div className="truncate">Scopes: <span className="text-cyan-300">{integ.scopes.join(', ')}</span></div>
                  )}
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-[10px] font-mono text-slate-400">
                  <div className="font-semibold text-slate-300 mb-0.5">Safe Metadata:</div>
                  <pre className="text-slate-500 overflow-x-auto">{JSON.stringify(integ.safeMetadata, null, 2)}</pre>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

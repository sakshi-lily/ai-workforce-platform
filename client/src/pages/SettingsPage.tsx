import React from 'react';
import { useAuth } from '../auth/AuthContext';
import { useRouter } from '../router/Router';

export const SettingsPage: React.FC = () => {
  const { user, logout, login } = useAuth();
  const { navigate } = useRouter();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleQuickSwitch = async (email: string, pass: string) => {
    await login(email, pass);
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="pb-4 border-b border-slate-800/80">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
          <span className="text-xs font-mono font-medium text-cyan-300 uppercase tracking-widest">
            Configuration
          </span>
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-medium tracking-tight text-white">
          Workspace Settings & Identity
        </h1>
        <p className="mt-1 text-sm text-slate-400 font-sans">
          Manage authenticated user identity, organization context, and platform security boundaries.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Identity Card */}
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-sm shadow-xl space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-sans">
            Authenticated Profile
          </h2>

          <div className="space-y-3 text-xs font-sans">
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
              <span className="text-slate-400">Email Address:</span>
              <span className="font-semibold text-white">{user?.email || '—'}</span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
              <span className="text-slate-400">Full Name:</span>
              <span className="text-slate-200">{user?.fullName || 'Not specified'}</span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
              <span className="text-slate-400">Organization Tenant:</span>
              <span className="font-mono text-cyan-300 font-bold">{user?.organizationId || '—'}</span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
              <span className="text-slate-400">Role & Access Tier:</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-800">
                {user?.role || 'USER'}
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
              <span className="text-slate-400">Internal User ID:</span>
              <span className="font-mono text-[11px] text-slate-500 truncate max-w-[200px]">
                {user?.id || '—'}
              </span>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={handleLogout}
              className="w-full py-2 px-4 rounded-xl bg-rose-950/60 hover:bg-rose-900 border border-rose-800/80 text-rose-300 text-xs font-semibold transition font-sans"
            >
              Sign Out of Workspace
            </button>
          </div>
        </div>

        {/* Tenant Switching & Multi-Tenancy Sandbox */}
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-sm shadow-xl space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-sans">
            Tenant Sandbox & Quick Switcher
          </h2>

          <p className="text-xs text-slate-400 font-sans leading-relaxed">
            Verify Phase 13 Anti-IDOR security controls. Switch between isolated organizations to confirm that tasks, customers, and tool executions cannot cross tenant boundaries.
          </p>

          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={() => handleQuickSwitch('dev@ai-workforce.local', 'password123')}
              className={`w-full p-3 rounded-xl border text-left transition font-sans flex items-center justify-between ${
                user?.organizationId === 'org-demo-001'
                  ? 'bg-cyan-950/40 border-cyan-500/50 text-cyan-200'
                  : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="font-semibold text-xs">Tenant A (Admin Workspace)</div>
                <div className="text-[11px] text-slate-400">dev@ai-workforce.local • org-demo-001</div>
              </div>
              {user?.organizationId === 'org-demo-001' && (
                <span className="text-xs font-bold text-cyan-400">Active ✓</span>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleQuickSwitch('tenant-b@example.com', 'password123')}
              className={`w-full p-3 rounded-xl border text-left transition font-sans flex items-center justify-between ${
                user?.organizationId === 'org-tenant-b'
                  ? 'bg-indigo-950/40 border-indigo-500/50 text-indigo-200'
                  : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="font-semibold text-xs">Tenant B (Isolated Workspace)</div>
                <div className="text-[11px] text-slate-400">tenant-b@example.com • org-tenant-b</div>
              </div>
              {user?.organizationId === 'org-tenant-b' && (
                <span className="text-xs font-bold text-indigo-400">Active ✓</span>
              )}
            </button>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-[11px] text-slate-500 font-sans space-y-1">
            <div className="font-semibold text-slate-400">Security Architecture:</div>
            <div>• JWT signature verified by backend Express on every API request.</div>
            <div>• Database queries enforce strict WHERE organization_id = req.user.organizationId.</div>
          </div>
        </div>
      </div>
    </div>
  );
};

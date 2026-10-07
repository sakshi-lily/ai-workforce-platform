import React, { useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useRouter, Link } from '../router/Router';

interface AppShellProps {
  children: ReactNode;
}

interface NavItem {
  name: string;
  href: string;
  icon: string;
  badge?: string;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const { user, logout } = useAuth();
  const { path, navigate } = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems: NavItem[] = [
    { name: 'Dashboard', href: '/app', icon: '📊' },
    { name: 'Tasks', href: '/app/tasks', icon: '📋' },
    { name: 'Approvals', href: '/app/approvals', icon: '🛡️' },
    { name: 'Agent', href: '/app/agent', icon: '🤖' },
    { name: 'Knowledge', href: '/app/knowledge', icon: '🧠' },
    { name: 'Integrations', href: '/app/integrations', icon: '🔌' },
    { name: 'Settings', href: '/app/settings', icon: '⚙️' },
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isActive = (href: string) => {
    if (href === '/app') {
      return path === '/app' || path === '/app/';
    }
    return path.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-rose-500 selection:text-white">
      {/* Subtle background ambient lighting */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-10 left-1/3 w-80 h-80 bg-purple-600/10 rounded-full blur-3xl"></div>
      </div>

      {/* Topbar */}
      <header className="sticky top-0 z-30 bg-slate-950/85 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 focus:outline-none"
            aria-label="Toggle Navigation"
          >
            <span className="text-xl">☰</span>
          </button>

          {/* Logo / Brand */}
          <Link href="/app" className="flex items-center gap-2.5 group">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse group-hover:scale-125 transition-transform"></span>
            <span className="font-display text-xl font-semibold tracking-tight text-white group-hover:text-cyan-300 transition-colors">
              AI Workforce
            </span>
          </Link>
        </div>

        {/* Topbar User Profile & Logout */}
        <div className="flex items-center gap-3">
          {user && (
            <div className="hidden sm:flex items-center gap-2 text-xs font-sans">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span className="truncate max-w-[180px] font-medium">{user.fullName || user.email}</span>
              </span>
              <span className="px-2 py-0.5 rounded-md font-mono text-[10px] bg-cyan-950/80 border border-cyan-800/60 text-cyan-300">
                {user.organizationId}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={handleLogout}
            className="px-3 py-1.5 rounded-lg text-xs font-medium font-sans bg-slate-900 hover:bg-rose-950/60 border border-slate-800 hover:border-rose-800/80 text-slate-300 hover:text-rose-300 transition-all shadow-sm"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Body with Sidebar + Content */}
      <div className="flex-1 flex relative z-10">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex flex-col w-64 border-r border-slate-800/80 bg-slate-950/50 backdrop-blur-sm p-4 shrink-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 px-3 mb-2 font-sans">
            Workspace
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all font-sans ${
                    active
                      ? 'bg-gradient-to-r from-cyan-950/70 to-indigo-950/50 text-cyan-200 border border-cyan-500/30 shadow-sm shadow-cyan-950'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/60 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-base">{item.icon}</span>
                    <span>{item.name}</span>
                  </div>
                  {item.badge && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-cyan-900/60 text-cyan-300 border border-cyan-700/50">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Quick status footer */}
          <div className="mt-auto pt-4 border-t border-slate-900/80 text-[11px] text-slate-500 px-3 space-y-1 font-sans">
            <div className="flex items-center justify-between">
              <span>Platform Tier:</span>
              <span className="text-slate-300 font-semibold">{user?.role || 'USER'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Tenant Scope:</span>
              <span className="text-cyan-400 font-mono text-[10px]">{user?.organizationId || 'Default'}</span>
            </div>
          </div>
        </aside>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-40 bg-slate-950/90 backdrop-blur-md flex flex-col p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <span className="font-display text-xl font-semibold text-white">Navigation</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="text-slate-400 hover:text-white text-xl p-1"
              >
                ✕
              </button>
            </div>
            <nav className="space-y-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium font-sans ${
                    isActive(item.href)
                      ? 'bg-cyan-950 border border-cyan-500/30 text-cyan-200'
                      : 'text-slate-300 hover:bg-slate-900'
                  }`}
                >
                  <span className="text-xl">{item.icon}</span>
                  <span>{item.name}</span>
                </Link>
              ))}
            </nav>
            <div className="pt-4 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400 font-sans">
              <span>{user?.email}</span>
              <button
                type="button"
                onClick={handleLogout}
                className="text-rose-400 hover:text-rose-300 font-medium"
              >
                Sign Out
              </button>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 p-4 sm:p-8 overflow-y-auto max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

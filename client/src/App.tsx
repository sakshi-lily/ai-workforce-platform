import React, { useEffect } from 'react';
import { useAuth } from './auth/AuthContext';
import { useRouter } from './router/Router';
import { LoginPage } from './auth/LoginPage';
import { RegisterPage } from './auth/RegisterPage';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppShell } from './layout/AppShell';
import { DashboardPage } from './pages/DashboardPage';
import { TaskManagementStudio } from './tasks/TaskManagementStudio';
import { AgentPage } from './pages/AgentPage';
import { KnowledgePage } from './pages/KnowledgePage';
import { IntegrationsPage } from './pages/IntegrationsPage';
import { SettingsPage } from './pages/SettingsPage';

export default function App() {
  const { authState } = useAuth();
  const { path, navigate } = useRouter();

  // Route Redirection Logic
  useEffect(() => {
    // 1. Root path "/" redirection
    if (path === '/' || path === '') {
      if (authState === 'AUTHENTICATED') {
        navigate('/app');
      } else if (authState === 'UNAUTHENTICATED') {
        navigate('/login');
      }
      return;
    }

    // 2. Authenticated user visiting public auth routes -> redirect to /app
    if (authState === 'AUTHENTICATED' && (path === '/login' || path === '/register')) {
      navigate('/app');
      return;
    }

    // 3. Unauthenticated user visiting protected /app routes -> redirect to /login
    if (authState === 'UNAUTHENTICATED' && path.startsWith('/app')) {
      navigate('/login');
      return;
    }
  }, [path, authState, navigate]);

  // Session verification screen during initial token check to eliminate redirect flickering
  if (authState === 'CHECKING') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center font-sans selection:bg-rose-500 selection:text-white">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
            <span className="font-display text-2xl font-semibold tracking-tight text-white">
              AI Workforce
            </span>
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-slate-400 font-sans">
            <svg className="animate-spin h-3.5 w-3.5 text-cyan-400" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span>Checking session...</span>
          </div>
        </div>
      </div>
    );
  }

  // Public Routes
  if (path === '/login') {
    return <LoginPage />;
  }

  if (path === '/register') {
    return <RegisterPage />;
  }

  // Protected Routes inside AppShell
  if (path.startsWith('/app')) {
    let content: React.ReactNode = <DashboardPage />;

    if (path === '/app/tasks' || path.startsWith('/app/tasks/')) {
      content = <TaskManagementStudio />;
    } else if (path === '/app/agent' || path.startsWith('/app/agent/')) {
      content = <AgentPage />;
    } else if (path === '/app/knowledge' || path.startsWith('/app/knowledge/')) {
      content = <KnowledgePage />;
    } else if (path === '/app/integrations' || path.startsWith('/app/integrations/')) {
      content = <IntegrationsPage />;
    } else if (path === '/app/settings' || path.startsWith('/app/settings/')) {
      content = <SettingsPage />;
    } else {
      content = <DashboardPage />;
    }

    return (
      <ProtectedRoute>
        <AppShell>{content}</AppShell>
      </ProtectedRoute>
    );
  }

  // Fallback for unmapped routes
  if (authState === 'AUTHENTICATED') {
    return (
      <ProtectedRoute>
        <AppShell>
          <DashboardPage />
        </AppShell>
      </ProtectedRoute>
    );
  }

  return <LoginPage />;
}

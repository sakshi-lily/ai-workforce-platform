import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { useRouter, Link } from '../router/Router';

export const LoginPage: React.FC = () => {
  const { authState, login, error: contextError } = useAuth();
  const { navigate } = useRouter();

  const [email, setEmail] = useState('dev@ai-workforce.local');
  const [password, setPassword] = useState('password123');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // If already authenticated, redirect to /app
  useEffect(() => {
    if (authState === 'AUTHENTICATED') {
      navigate('/app');
    }
  }, [authState, navigate]);

  // Sync context error updates
  useEffect(() => {
    if (contextError) {
      setErrorMessage(contextError);
    }
  }, [contextError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMessage('Please provide both email and password.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    const success = await login(email.trim(), password);
    if (success) {
      navigate('/app');
    }
    setLoading(false);
  };

  const handleQuickLogin = (quickEmail: string, quickPass: string) => {
    setEmail(quickEmail);
    setPassword(quickPass);
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8 font-sans selection:bg-rose-500 selection:text-white relative">
      {/* Subtle ambient lighting */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 -right-40 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl"></div>
      </div>

      <div className="relative z-10 w-full max-w-md space-y-8">
        {/* Brand & Heading */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 mb-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
            <span className="font-display text-2xl font-semibold tracking-tight text-white">
              AI Workforce
            </span>
          </div>
          <h1 className="font-display text-3xl font-medium tracking-tight text-slate-100">
            Welcome back
          </h1>
          <p className="font-sans text-sm text-slate-400">
            Sign in to your organization workspace
          </p>
        </div>

        {/* Card Form */}
        <div className="bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-800 p-8 shadow-2xl space-y-6">
          {errorMessage && (
            <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs font-sans flex items-start gap-2">
              <span className="text-sm">⚠️</span>
              <span className="leading-relaxed">{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider font-sans"
              >
                Email
              </label>
              <input
                id="login-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                disabled={loading}
                className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition font-sans"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider font-sans"
              >
                Password
              </label>
              <input
                id="login-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading}
                className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition font-sans"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 px-4 rounded-lg bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-sm font-semibold shadow-lg shadow-cyan-950 transition disabled:opacity-50 disabled:cursor-not-allowed font-sans flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Signing in...</span>
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Quick Demo Logins for Fast Local Testing */}
          <div className="pt-4 border-t border-slate-800/80">
            <p className="text-[11px] text-slate-500 font-medium mb-2 font-sans">
              Quick Tenant Demo:
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleQuickLogin('dev@ai-workforce.local', 'password123')}
                className="px-2.5 py-1.5 rounded-lg text-[11px] bg-slate-950/60 hover:bg-slate-800 border border-slate-800 text-slate-300 transition text-left font-sans"
              >
                <div className="font-semibold text-cyan-300">Tenant A (Admin)</div>
                <div className="text-slate-500 truncate text-[10px]">dev@ai-workforce.local</div>
              </button>
              <button
                type="button"
                onClick={() => handleQuickLogin('tenant-b@example.com', 'password123')}
                className="px-2.5 py-1.5 rounded-lg text-[11px] bg-slate-950/60 hover:bg-slate-800 border border-slate-800 text-slate-300 transition text-left font-sans"
              >
                <div className="font-semibold text-indigo-300">Tenant B (User)</div>
                <div className="text-slate-500 truncate text-[10px]">tenant-b@example.com</div>
              </button>
            </div>
          </div>

          {/* Footer Link */}
          <div className="text-center pt-2">
            <p className="text-xs text-slate-400 font-sans">
              Don't have an account?{' '}
              <Link
                href="/register"
                className="text-cyan-400 hover:text-cyan-300 font-medium hover:underline transition"
              >
                Create account
              </Link>
            </p>
          </div>
        </div>

        <p className="text-center text-[11px] text-slate-600 font-sans">
          Phase 13 Server-Validated JWT & Anti-IDOR Authorization
        </p>
      </div>
    </div>
  );
};

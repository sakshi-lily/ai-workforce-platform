import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { useRouter, Link } from '../router/Router';

export const RegisterPage: React.FC = () => {
  const { authState, register, error: contextError } = useAuth();
  const { navigate } = useRouter();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organizationId, setOrganizationId] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // If already authenticated, redirect to /app
  useEffect(() => {
    if (authState === 'AUTHENTICATED') {
      navigate('/app');
    }
  }, [authState, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMessage('Please provide both email and password.');
      return;
    }

    if (password.length < 8 || !/^(?=.*[A-Za-z])(?=.*\d)/.test(password)) {
      setErrorMessage('Password must be at least 8 characters long and contain at least one letter and one number.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    const success = await register(
      email.trim(),
      password,
      organizationId.trim() || undefined,
      fullName.trim() || undefined
    );

    if (success) {
      navigate('/app');
    } else {
      setErrorMessage(
        contextError || 'Registration failed. Please verify your details or use an existing account.'
      );
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8 font-sans selection:bg-rose-500 selection:text-white relative">
      {/* Ambient lighting */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 -left-40 w-96 h-96 bg-cyan-600/10 rounded-full blur-3xl"></div>
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
            Create your account
          </h1>
          <p className="font-sans text-sm text-slate-400">
            Join your organization workspace
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
                htmlFor="register-name"
                className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider font-sans"
              >
                Full Name <span className="text-slate-500 font-normal">(optional)</span>
              </label>
              <input
                id="register-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Doe"
                disabled={loading}
                className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition font-sans"
              />
            </div>

            <div>
              <label
                htmlFor="register-email"
                className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider font-sans"
              >
                Work Email <span className="text-rose-400">*</span>
              </label>
              <input
                id="register-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@company.com"
                disabled={loading}
                className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition font-sans"
              />
            </div>

            <div>
              <label
                htmlFor="register-password"
                className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider font-sans"
              >
                Password <span className="text-rose-400">*</span>
              </label>
              <input
                id="register-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 chars with letter & number"
                disabled={loading}
                className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500 transition font-sans"
              />
            </div>

            <div>
              <label
                htmlFor="register-org"
                className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider font-sans"
              >
                Organization ID <span className="text-slate-500 font-normal">(optional, default: org-demo-001)</span>
              </label>
              <input
                id="register-org"
                type="text"
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                placeholder="e.g. org-acme-corp"
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
                  <span>Creating account...</span>
                </>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          {/* Footer Link */}
          <div className="text-center pt-2 border-t border-slate-800/80">
            <p className="text-xs text-slate-400 font-sans">
              Already have an account?{' '}
              <Link
                href="/login"
                className="text-cyan-400 hover:text-cyan-300 font-medium hover:underline transition"
              >
                Sign in
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

import React, { useEffect, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useRouter } from '../router/Router';

interface ProtectedRouteProps {
  children: ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { authState } = useAuth();
  const { navigate } = useRouter();

  useEffect(() => {
    if (authState === 'UNAUTHENTICATED') {
      navigate('/login');
    }
  }, [authState, navigate]);

  if (authState === 'CHECKING') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center font-sans selection:bg-rose-500 selection:text-white">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-cyan-400 animate-ping"></span>
            <span className="font-display text-2xl font-semibold tracking-tight text-white">
              AI Workforce
            </span>
          </div>
          <div className="flex items-center justify-center gap-2 text-sm text-slate-400 font-sans">
            <svg className="animate-spin h-4 w-4 text-cyan-400" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span>Verifying authenticated session credentials...</span>
          </div>
        </div>
      </div>
    );
  }

  if (authState === 'UNAUTHENTICATED') {
    // Navigating to /login in useEffect, render blank placeholder during transition
    return null;
  }

  return <>{children}</>;
};

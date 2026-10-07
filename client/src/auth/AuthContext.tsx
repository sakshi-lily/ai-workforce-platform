import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { getApiUrl, API_BASE_URL } from '../config/api';

export interface AuthUser {
  id: string;
  email: string;
  fullName?: string;
  organizationId: string;
  role: 'USER' | 'ADMIN';
}

export type AuthState = 'CHECKING' | 'AUTHENTICATED' | 'UNAUTHENTICATED';

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  authState: AuthState;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, organizationId?: string, fullName?: string) => Promise<boolean>;
  logout: () => Promise<void>;
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_KEY = 'awp_auth_token';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [authState, setAuthState] = useState<AuthState>('CHECKING');
  const [error, setError] = useState<string | null>(null);

  // Restore authenticated identity on startup or token change
  useEffect(() => {
    let isMounted = true;

    const restoreSession = async () => {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      if (!storedToken) {
        if (isMounted) {
          setUser(null);
          setToken(null);
          setAuthState('UNAUTHENTICATED');
        }
        return;
      }

      try {
        setAuthState('CHECKING');
        const res = await fetch(getApiUrl('/api/auth/me'), {
          headers: {
            Authorization: `Bearer ${storedToken}`,
          },
        });

        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setUser(data.user);
            setToken(storedToken);
            setAuthState('AUTHENTICATED');
            setError(null);
          }
        } else {
          // Token invalid or expired
          localStorage.removeItem(TOKEN_KEY);
          if (isMounted) {
            setUser(null);
            setToken(null);
            setAuthState('UNAUTHENTICATED');
          }
        }
      } catch (err: unknown) {
        if (isMounted) {
          // Network error or server offline: preserve unauthenticated state safely
          setAuthState('UNAUTHENTICATED');
        }
      }
    };

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    setError(null);
    try {
      const res = await fetch(getApiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message || 'Invalid email or password.');
        return false;
      }

      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      setUser(data.user);
      setAuthState('AUTHENTICATED');
      setError(null);
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login network failure.');
      return false;
    }
  };

  const register = async (
    email: string,
    password: string,
    organizationId?: string,
    fullName?: string
  ): Promise<boolean> => {
    setError(null);
    try {
      const res = await fetch(getApiUrl('/api/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          organizationId: organizationId?.trim() ? organizationId.trim() : undefined,
          fullName: fullName?.trim() ? fullName.trim() : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message || 'Registration failed.');
        return false;
      }

      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      setUser(data.user);
      setAuthState('AUTHENTICATED');
      setError(null);
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration network failure.');
      return false;
    }
  };

  const logout = async (): Promise<void> => {
    try {
      const currentToken = token || localStorage.getItem(TOKEN_KEY);
      if (currentToken) {
        await fetch(getApiUrl('/api/auth/logout'), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${currentToken}`,
          },
        }).catch(() => {});
      }
    } finally {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setUser(null);
      setAuthState('UNAUTHENTICATED');
      setError(null);
    }
  };

  // Centralized authenticated fetch wrapper that injects Authorization headers
  const authFetch = useCallback(
    async (url: string, init?: RequestInit): Promise<Response> => {
      const headers = new Headers(init?.headers);
      const currentToken = token || localStorage.getItem(TOKEN_KEY);

      if (currentToken) {
        headers.set('Authorization', `Bearer ${currentToken}`);
      }

      // Automatically normalize hardcoded http://localhost:3000 to production proxy base
      const normalizedUrl = url.startsWith('http://localhost:3000')
        ? url.replace('http://localhost:3000', API_BASE_URL)
        : url;

      const response = await fetch(normalizedUrl, {
        ...init,
        headers,
      });

      if (response.status === 401) {
        // Credential rejected or expired on server
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
        setAuthState('UNAUTHENTICATED');
      }

      return response;
    },
    [token]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        authState,
        error,
        login,
        register,
        logout,
        authFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

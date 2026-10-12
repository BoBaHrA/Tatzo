import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import { ApiError, apiRequest } from '@/api/client';
import type {
  LoginResponse,
  ProfileUpdate,
  RegistrationPayload,
  TatzoUser,
} from '@/api/types';
import { clearTokens, readTokens, writeTokens } from '@/auth/token-store';
import { createSessionClient, SessionChangedError, SessionExpiredError } from '@/auth/session-client';
import { unregisterPushDevice } from '@/notifications/push-notifications';


type AuthStatus = 'loading' | 'unavailable' | 'anonymous' | 'authenticated';

export type AuthenticatedRequest = <T>(
  path: string,
  init?: RequestInit,
) => Promise<T>;

type AuthContextValue = {
  status: AuthStatus;
  user: TatzoUser | null;
  retrySession: () => Promise<void>;
  request: AuthenticatedRequest;
  signIn: (identifier: string, password: string) => Promise<void>;
  register: (payload: RegistrationPayload) => Promise<string>;
  signOut: () => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (payload: ProfileUpdate) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<TatzoUser | null>(null);
  const operation = useRef(0);
  const [session] = useState(() => createSessionClient(
    apiRequest,
    { read: readTokens, write: writeTokens, clear: clearTokens },
    (error) => error instanceof ApiError && error.status === 401,
    () => { setUser(null); setStatus('anonymous'); },
  ));
  const request = session.request;

  const bootstrap = useCallback(async () => {
    const version = ++operation.current;
    setStatus('loading');
    try {
      const profile = await request<TatzoUser>('/me/');
      if (version !== operation.current) return;
      setUser(profile);
      setStatus('authenticated');
    } catch (error) {
      if (version !== operation.current || error instanceof SessionChangedError) return;
      setUser(null);
      // Network/server errors must not destroy a valid refresh token.
      setStatus(error instanceof SessionExpiredError || (error instanceof ApiError && error.status === 401)
        ? 'anonymous' : 'unavailable');
    }
  }, [request]);

  useEffect(() => { void bootstrap(); }, [bootstrap]);

  const signIn = useCallback(async (identifier: string, password: string) => {
    const version = ++operation.current;
    const response = await apiRequest<LoginResponse>('/auth/token/', {
      method: 'POST', body: JSON.stringify({ identifier, password }),
    });
    if (version !== operation.current) throw new SessionChangedError();
    await session.setTokens({ access: response.access, refresh: response.refresh });
    if (version !== operation.current) throw new SessionChangedError();
    setUser(response.user);
    setStatus('authenticated');
  }, [session]);

  const register = useCallback(async (payload: RegistrationPayload) => {
    const response = await apiRequest<{ email: string }>('/auth/register/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return response.email;
  }, []);

  const signOut = useCallback(async () => {
    ++operation.current;
    const stored = session.read();
    const cleared = session.clear();
    setUser(null);
    setStatus('anonymous');
    const tokens = await stored;
    await cleared;
    if (!tokens) return;
    // Cleanup uses the old access token directly and cannot refresh/resurrect it.
    const oldRequest: AuthenticatedRequest = (path, init = {}) => {
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${tokens.access}`);
      return apiRequest(path, { ...init, headers });
    };
    await Promise.allSettled([
      unregisterPushDevice(oldRequest),
      oldRequest('/auth/logout/', { method: 'POST', body: JSON.stringify({ refresh: tokens.refresh }) }),
    ]);
  }, [session]);

  const deleteAccount = useCallback(async (password: string) => {
    await request<void>('/me/', {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    });
    ++operation.current;
    await session.clear();
    setUser(null);
    setStatus('anonymous');
  }, [request, session]);

  const refreshProfile = useCallback(async () => {
    const profile = await request<TatzoUser>('/me/');
    setUser(profile);
  }, [request]);

  const updateProfile = useCallback(async (payload: ProfileUpdate) => {
    const profile = await request<TatzoUser>('/me/', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    setUser(profile);
  }, [request]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      retrySession: bootstrap,
      request,
      signIn,
      register,
      signOut,
      deleteAccount,
      refreshProfile,
      updateProfile,
    }),
    [
      bootstrap,
      status,
      user,
      request,
      signIn,
      register,
      signOut,
      deleteAccount,
      refreshProfile,
      updateProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return value;
}

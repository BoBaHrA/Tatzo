import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import { ApiError, apiRequest } from '@/api/client';
import type {
  LoginResponse,
  ProfileUpdate,
  RegistrationPayload,
  TatzoUser,
  TokenPair,
} from '@/api/types';
import { clearTokens, readTokens, writeTokens } from '@/auth/token-store';
import { unregisterPushDevice } from '@/notifications/push-notifications';


type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

export type AuthenticatedRequest = <T>(
  path: string,
  init?: RequestInit,
) => Promise<T>;

type AuthContextValue = {
  status: AuthStatus;
  user: TatzoUser | null;
  request: AuthenticatedRequest;
  signIn: (identifier: string, password: string) => Promise<void>;
  register: (payload: RegistrationPayload) => Promise<string>;
  signOut: () => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (payload: ProfileUpdate) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function refreshTokenPair(tokens: TokenPair): Promise<TokenPair> {
  const rotated = await apiRequest<{ access: string; refresh?: string }>(
    '/auth/token/refresh/',
    {
      method: 'POST',
      body: JSON.stringify({ refresh: tokens.refresh }),
    },
  );
  const next = {
    access: rotated.access,
    refresh: rotated.refresh ?? tokens.refresh,
  };
  await writeTokens(next);
  return next;
}

async function authenticatedRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let tokens = await readTokens();
  if (!tokens) {
    throw new ApiError(401, { code: 'not_authenticated' });
  }

  const perform = (access: string) =>
    apiRequest<T>(path, {
      ...init,
      headers: {
        ...Object.fromEntries(new Headers(init.headers).entries()),
        Authorization: `Bearer ${access}`,
      },
    });

  try {
    return await perform(tokens.access);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) {
      throw error;
    }
    tokens = await refreshTokenPair(tokens);
    return perform(tokens.access);
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<TatzoUser | null>(null);

  const request = useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      try {
        return await authenticatedRequest<T>(path, init);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await clearTokens();
          setUser(null);
          setStatus('anonymous');
        }
        throw error;
      }
    },
    [],
  );

  const bootstrap = useCallback(async () => {
    try {
      const profile = await request<TatzoUser>('/me/');
      setUser(profile);
      setStatus('authenticated');
    } catch {
      await clearTokens();
      setUser(null);
      setStatus('anonymous');
    }
  }, [request]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const signIn = useCallback(async (identifier: string, password: string) => {
    const response = await apiRequest<LoginResponse>('/auth/token/', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
    await writeTokens({ access: response.access, refresh: response.refresh });
    setUser(response.user);
    setStatus('authenticated');
  }, []);

  const register = useCallback(async (payload: RegistrationPayload) => {
    const response = await apiRequest<{ email: string }>('/auth/register/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return response.email;
  }, []);

  const signOut = useCallback(async () => {
    const tokens = await readTokens();
    if (tokens) {
      try {
        await unregisterPushDevice(authenticatedRequest);
      } catch {
        // A stale device registration must not prevent local sign out.
      }
      try {
        await authenticatedRequest<void>('/auth/logout/', {
          method: 'POST',
          body: JSON.stringify({ refresh: tokens.refresh }),
        });
      } catch {
        // Local credentials must still be removed if the network is unavailable.
      }
    }
    await clearTokens();
    setUser(null);
    setStatus('anonymous');
  }, []);

  const deleteAccount = useCallback(async (password: string) => {
    await request<void>('/me/', {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    });
    await clearTokens();
    setUser(null);
    setStatus('anonymous');
  }, [request]);

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
      request,
      signIn,
      register,
      signOut,
      deleteAccount,
      refreshProfile,
      updateProfile,
    }),
    [
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

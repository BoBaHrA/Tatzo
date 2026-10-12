import type { TokenPair } from '@/api/types';

type Transport = <T>(path: string, init?: RequestInit) => Promise<T>;
type Storage = {
  read: () => Promise<TokenPair | null>;
  write: (tokens: TokenPair) => Promise<void>;
  clear: () => Promise<void>;
};

export class SessionChangedError extends Error {
  constructor() { super('The account changed while this request was running.'); }
}

export class SessionExpiredError extends Error {
  constructor() { super('Please sign in again.'); }
}

/** One rotation per session; old requests can never overwrite a new login. */
export function createSessionClient(
  transport: Transport,
  storage: Storage,
  isUnauthorized: (error: unknown) => boolean,
  onExpired: () => void,
) {
  let generation = 0;
  let refresh: { generation: number; promise: Promise<TokenPair> } | null = null;
  let storageQueue: Promise<unknown> = Promise.resolve();

  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = storageQueue.then(operation, operation);
    storageQueue = result.catch(() => undefined);
    return result;
  }

  function assertCurrent(version: number) {
    if (version !== generation) throw new SessionChangedError();
  }

  const read = () => serialize(storage.read);
  const setTokens = (tokens: TokenPair) => {
    const version = ++generation;
    refresh = null;
    return serialize(async () => {
      assertCurrent(version);
      await storage.write(tokens);
      assertCurrent(version);
    });
  };
  const clear = () => {
    ++generation;
    refresh = null;
    return serialize(storage.clear);
  };

  function rotate(tokens: TokenPair, version: number): Promise<TokenPair> {
    assertCurrent(version);
    if (refresh?.generation === version) return refresh.promise;
    const promise = (async () => {
      const current = await read();
      assertCurrent(version);
      if (!current) throw new SessionExpiredError();
      // Another request may have rotated while this request's 401 was in flight.
      if (current.access !== tokens.access) return current;
      const rotated = await transport<{ access: string; refresh?: string }>('/auth/token/refresh/', {
        method: 'POST', body: JSON.stringify({ refresh: current.refresh }),
      });
      assertCurrent(version);
      const next = { access: rotated.access, refresh: rotated.refresh ?? current.refresh };
      await serialize(async () => {
        assertCurrent(version);
        await storage.write(next);
      });
      assertCurrent(version);
      return next;
    })();
    refresh = { generation: version, promise };
    void promise.finally(() => {
      if (refresh?.promise === promise) refresh = null;
    }).catch(() => undefined);
    return promise;
  }

  const request: Transport = async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    const version = generation;
    const tokens = await read();
    assertCurrent(version);
    if (!tokens) throw new SessionExpiredError();
    const perform = async (access: string) => {
      assertCurrent(version);
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${access}`);
      const response = await transport<T>(path, { ...init, headers });
      assertCurrent(version);
      return response;
    };
    try {
      try {
        return await perform(tokens.access);
      } catch (error) {
        assertCurrent(version);
        if (!isUnauthorized(error)) throw error;
        const next = await rotate(tokens, version);
        return await perform(next.access);
      }
    } catch (error) {
      assertCurrent(version);
      if (isUnauthorized(error) || error instanceof SessionExpiredError) {
        // Notify synchronously before yielding, so a later sign-in cannot be cleared.
        onExpired();
        await clear();
      }
      throw error;
    }
  };

  return { request, read, setTokens, clear };
}

import * as SecureStore from 'expo-secure-store';

import type { TokenPair } from '@/api/types';


const ACCESS_TOKEN_KEY = 'tatzo.access-token';
const REFRESH_TOKEN_KEY = 'tatzo.refresh-token';
const SESSION_KEY = 'tatzo.session';

export async function readTokens(): Promise<TokenPair | null> {
  const stored = await SecureStore.getItemAsync(SESSION_KEY);
  if (stored) {
    try {
      const pair = JSON.parse(stored) as TokenPair;
      if (typeof pair.access === 'string' && typeof pair.refresh === 'string') return pair;
    } catch { /* Recover an older installation below. */ }
  }
  const [access, refresh] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
  ]);
  if (!access || !refresh) return null;
  const pair = { access, refresh };
  await writeTokens(pair);
  return pair;
}

export async function writeTokens(tokens: TokenPair): Promise<void> {
  // Store the rotated pair atomically, then remove the legacy split values.
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(tokens));
  await Promise.all([SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY), SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY)]);
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(SESSION_KEY),
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}

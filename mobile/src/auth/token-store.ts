import * as SecureStore from 'expo-secure-store';

import type { TokenPair } from '@/api/types';


const ACCESS_TOKEN_KEY = 'tatzo.access-token';
const REFRESH_TOKEN_KEY = 'tatzo.refresh-token';

export async function readTokens(): Promise<TokenPair | null> {
  const [access, refresh] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
  ]);
  return access && refresh ? { access, refresh } : null;
}

export async function writeTokens(tokens: TokenPair): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.access),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refresh),
  ]);
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}

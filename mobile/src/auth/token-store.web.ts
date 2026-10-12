import type { TokenPair } from '@/api/types';

// Browser previews have no SecureStore. Keep credentials in memory only.
let tokens: TokenPair | null = null;
export async function readTokens() { return tokens; }
export async function writeTokens(value: TokenPair) { tokens = { ...value }; }
export async function clearTokens() { tokens = null; }

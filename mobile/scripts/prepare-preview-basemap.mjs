import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function keyFromPublicMapHtml(html) {
  const value = /\bdata-carto-basemap-api-key\s*=\s*(["'])(.*?)\1/i.exec(html)?.[2] ?? '';
  const entities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (entity, name) => {
    if (!name.startsWith('#')) return entities[name.toLowerCase()];
    const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    return code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  }).trim();
}

function validateKey(value) {
  const key = value.trim();
  if (!key || key.length > 2048 || /[\r\n\0]/.test(key)) {
    throw new Error('CARTO basemap key is missing or malformed; refusing to build a map without authentication.');
  }
  return key;
}

export async function resolveBasemapKey({ configuredKey = '', configUrl = 'https://tatzo.eu/maps/', fetchImpl = fetch } = {}) {
  if (configuredKey.trim()) return { key: validateKey(configuredKey), source: 'build environment' };
  const url = new URL(configUrl);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Public map configuration must use an HTTPS URL without credentials.');
  }
  // This is the same client-side CARTO key already served in Tatzo's public map.
  // Read only that attribute; never copy server credentials or persist it in Git.
  const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Public map configuration request failed (HTTP ${response.status}).`);
  return { key: validateKey(keyFromPublicMapHtml(await response.text())), source: 'public Tatzo map configuration' };
}

async function main() {
  if (!process.env.GITHUB_ENV) throw new Error('GITHUB_ENV is required by this preview-build step.');
  const { key, source } = await resolveBasemapKey({
    configuredKey: process.env.EXPO_PUBLIC_CARTO_BASEMAP_API_KEY,
    configUrl: process.env.TATZO_PUBLIC_MAP_CONFIG_URL,
  });
  if (process.env.GITHUB_ACTIONS === 'true') console.log(`::add-mask::${key.replace(/%/g, '%25')}`);
  appendFileSync(process.env.GITHUB_ENV, `EXPO_PUBLIC_CARTO_BASEMAP_API_KEY=${key}\n`);
  console.log(`CARTO basemap key configured from ${source}; value omitted.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

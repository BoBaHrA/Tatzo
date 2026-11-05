import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyFromPublicMapHtml, resolveBasemapKey } from '../scripts/prepare-preview-basemap.mjs';

test('preview reuses the existing public web map key, decoding HTML attributes', async () => {
  const result = await resolveBasemapKey({ fetchImpl: async (url) => {
    assert.equal(url.href, 'https://tatzo.eu/maps/');
    return { ok: true, text: async () => '<main data-carto-basemap-api-key=" test&#43;key&#x2f;=&amp;&quot; ">' };
  } });
  assert.equal(result.key, 'test+key/=&"');
  assert.equal(result.source, 'public Tatzo map configuration');
});
test('an explicitly configured build key takes precedence without fetching the site', async () => {
  const result = await resolveBasemapKey({ configuredKey: ' configured ', fetchImpl: () => { throw new Error('Unexpected network request'); } });
  assert.equal(result.key, 'configured');
});
test('an absent public key stops the preview instead of producing a broken map', async () => {
  await assert.rejects(resolveBasemapKey({ fetchImpl: async () => ({ ok: true, text: async () => '<main></main>' }) }), /missing or malformed/);
  assert.equal(keyFromPublicMapHtml("<main data-carto-basemap-api-key=''>"), '');
});
test('failed configuration fetches stop the preview build', async () => {
  await assert.rejects(resolveBasemapKey({ fetchImpl: async () => ({ ok: false, status: 503 }) }), /HTTP 503/);
});
test('keys cannot inject extra lines into the build environment', async () => {
  await assert.rejects(resolveBasemapKey({ configuredKey: 'key\nOTHER=value' }), /malformed/);
  await assert.rejects(resolveBasemapKey({ fetchImpl: async () => ({ ok: true, text: async () => '<main data-carto-basemap-api-key="key&#10;OTHER=value">' }) }), /malformed/);
});

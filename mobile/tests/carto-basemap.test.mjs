import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

const source = readFileSync(new URL('../src/map/carto-basemap.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
const { cartoTileUrl } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('native basemap requests carry the configured CARTO key and retain Leaflet placeholders', () => {
  assert.equal(cartoTileUrl('  test-key  '), 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=test-key');
});
test('CARTO key characters cannot become extra URL parameters', () => {
  const url = new URL(cartoTileUrl('test+/=&other=value').replace('{s}', 'a').replace('{z}', '5').replace('{x}', '16').replace('{y}', '11').replace('{r}', ''));
  assert.equal(url.searchParams.get('key'), 'test+/=&other=value');
  assert.equal(url.searchParams.size, 1);
});
test('a missing key cannot silently request CARTO watermarked tiles', () => {
  assert.throws(() => cartoTileUrl('  '), /not configured/);
});

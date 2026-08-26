#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const passed = [];

function check(condition, label) {
  if (condition) passed.push(label);
  else failures.push(label);
}

function source(relativePath) {
  const absolute = join(projectRoot, relativePath);
  check(existsSync(absolute), `${relativePath} exists`);
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : '';
}

check(existsSync(join(projectRoot, 'assets', 'tatzo7.png')), 'Current Tatzo wordmark asset exists');

const header = source('src/components/brand-header.tsx');
check(header.includes("require('../../assets/tatzo7.png')"), 'Shared header uses the current Tatzo wordmark');
check(!header.includes("require('../../assets/tatzo5.png')"), 'Shared header no longer uses the legacy wordmark');

for (const component of ['avatar.tsx', 'button.tsx', 'card.tsx', 'chip.tsx', 'field.tsx', 'icon-button.tsx', 'screen.tsx']) {
  check(existsSync(join(projectRoot, 'src', 'components', component)), `Shared component ${component} exists`);
}

const theme = source('src/theme.ts');
check(theme.includes("background: '#000d18'"), 'Mobile background matches Tatzo web');
check(theme.includes("backgroundDeep: '#000911'"), 'Mobile navigation background matches Tatzo web shell');
check(theme.includes("primary: '#04c5bf'"), 'Tatzo cyan token is stable');
check(theme.includes("accent: '#ee0c6f'"), 'Tatzo pink token is stable');

const tabs = source('app/(tabs)/_layout.tsx');
check(
  tabs.includes("tabBarActiveBackgroundColor: 'rgba(238, 12, 111, 0.07)'")
    || tabs.includes('tabBarActiveBackgroundColor: colors.accentSoft'),
  'Bottom navigation has Tatzo active-state treatment',
);

console.log('\nTatzo mobile design-system check');
for (const label of passed) console.log(`  ✓ ${label}`);
for (const label of failures) console.error(`  ✗ ${label}`);
console.log(`\n${passed.length} passed, ${failures.length} failure(s).`);

if (failures.length) process.exit(1);

#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const passed = [];

function source(relativePath) {
  const path = join(root, relativePath);
  if (!existsSync(path)) {
    failures.push(`${relativePath} exists`);
    return '';
  }
  return readFileSync(path, 'utf8');
}

function check(condition, label) {
  if (condition) passed.push(label);
  else failures.push(label);
}

const detail = source('app/healing/[journeyId].tsx');
const icons = source('src/healing/achievement-icons.ts');

check(detail.includes('HEALING_ACHIEVEMENT_ICONS'), 'Healing detail uses the canonical achievement icon map');
check(detail.includes('achievementKey={key}'), 'Each achievement passes its milestone key to the icon renderer');
check(detail.includes('styles.achievementIconShell'), 'Healing achievements render a dedicated icon surface');
check(!detail.includes("{unlocked ? '✓' : '◇'}"), 'Legacy text placeholders are removed from achievement cards');

for (const [key, asset] of [
  ['first_checkin', 'web-icons/calendar.png'],
  ['seven_day_streak', 'web-icons/healing.png'],
  ['three_checkins', 'dashboard-icons/statistics.png'],
  ['fully_healed', 'web-icons/health-safety.png'],
]) {
  check(icons.includes(`${key}:`), `Achievement icon map includes ${key}`);
  check(icons.includes(asset), `${key} uses a canonical Tatzo asset`);
}

console.log('\nTatzo mobile Healing parity check');
for (const label of passed) console.log(`  ✓ ${label}`);
for (const label of failures) console.error(`  ✗ ${label}`);
console.log(`\n${passed.length} passed, ${failures.length} failure(s).`);

if (failures.length) process.exit(1);

#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const passed = [];

function source(relativePath) {
  const absolutePath = join(projectRoot, relativePath);
  if (!existsSync(absolutePath)) {
    failures.push(`${relativePath} exists`);
    return '';
  }
  return readFileSync(absolutePath, 'utf8');
}

function exists(relativePath) {
  const ok = existsSync(join(projectRoot, relativePath));
  if (ok) passed.push(`${relativePath} exists`);
  else failures.push(`${relativePath} exists`);
}

function check(condition, label) {
  if (condition) passed.push(label);
  else failures.push(label);
}

const tabs = source('app/(tabs)/_layout.tsx');
const header = source('src/components/brand-header.tsx');
const search = source('app/(tabs)/search.tsx');
const calendar = source('app/(tabs)/calendar.tsx');

for (const icon of ['house', 'loupe', 'maps', 'chats', 'calendar', 'notifications']) {
  exists(`assets/web-icons/${icon}.png`);
}

check(tabs.includes('name="home"') && tabs.includes('WEB_ICONS.home'), 'Home tab uses the web icon asset');
check(tabs.includes('name="search"') && tabs.includes('WEB_ICONS.search'), 'Search tab uses the web icon asset');
check(tabs.includes('name="map"') && tabs.includes('WEB_ICONS.map'), 'Map tab uses the web icon asset');
check(tabs.includes('name="chats"') && tabs.includes('WEB_ICONS.chats'), 'Chats tab uses the web icon asset');
check(tabs.includes('name="calendar"') && tabs.includes('WEB_ICONS.calendar'), 'Calendar tab uses the web icon asset');
check(tabs.includes('name="match" options={{ href: null }}'), 'Style Match is removed from primary bottom navigation');
check(tabs.includes('name="bookings" options={{ href: null }}'), 'Bookings is removed from primary bottom navigation');
check(tabs.includes('name="profile" options={{ href: null }}'), 'Profile is removed from primary bottom navigation');
check(tabs.includes('height: 76') && tabs.includes("borderTopColor: 'rgba(4, 197, 191, 0.18)'"), 'Bottom navigation keeps the web mobile shell dimensions');
check(tabs.includes("tabBarActiveBackgroundColor: 'rgba(238, 12, 111, 0.07)'"), 'Active tab keeps the web pink treatment');
check(header.includes("web-icons/notifications.png"), 'Top bar uses the exact web notification asset');
check(header.includes("router.push('/(tabs)/profile')"), 'Top bar avatar keeps profile access');
check(search.includes("request<SearchResponse>(`/search/?${params.toString()}`)"), 'Native search is backed by the mobile search API');
check(search.includes("web-icons/loupe.png"), 'Search input uses the web loupe asset');
check(search.includes('requestVersion.current') && search.includes('version !== requestVersion.current'), 'Search ignores stale request responses');
check(search.includes('accessibilityRole="button"') && search.includes('accessibilityState={{ selected: active }}'), 'Search filters expose button role and selection state');
check(calendar.includes("import BookingsScreen from './bookings'"), 'Calendar route remains connected to appointment data while calendar parity is staged');

console.log('\nTatzo mobile shell parity check');
for (const label of passed) console.log(`  ✓ ${label}`);
for (const label of failures) console.error(`  ✗ ${label}`);
console.log(`\n${passed.length} passed, ${failures.length} failure(s).`);

if (failures.length) process.exit(1);

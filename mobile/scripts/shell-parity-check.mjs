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
const healing = source('app/healing/index.tsx');

for (const icon of ['house', 'loupe', 'maps', 'chats', 'calendar', 'notifications']) {
  exists(`assets/web-icons/${icon}.png`);
}

for (const icon of ['palette', 'healing', 'health-safety', 'bookmark', 'trophy', 'sprout']) {
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
check(header.includes('MENU_ICONS.styleMatch') && header.includes("palette.png"), 'Style Match menu tile uses the canonical palette artwork');
check(header.includes('MENU_ICONS.healing') && header.includes("healing.png"), 'Healing menu tile uses the canonical Healing artwork');
check(header.includes('MENU_ICONS.bookmarks') && header.includes('MENU_ICONS.contests') && header.includes('MENU_ICONS.cleanSlate'), 'Bookmarks, contests and clean slate use current web artwork');
check(header.includes('MENU_ICONS.healthSafety'), 'Health & safety uses canonical artwork');
check(healing.includes('HEALING_ICON') && healing.includes('<HealingMark'), 'Healing empty and fallback states reuse the canonical Healing mark');
check(search.includes("request<SearchResponse>(`/search/?${params.toString()}`)"), 'Native search is backed by the mobile search API');
check(search.includes("web-icons/loupe.png"), 'Search input uses the web loupe asset');
check(search.includes('requestVersion.current') && search.includes('version !== requestVersion.current'), 'Search ignores stale request responses');

check(!calendar.includes("import BookingsScreen from './bookings'"), 'Calendar is no longer an appointments-list alias');
check(calendar.includes('fetchAppointments(request)'), 'Calendar stays backed by real appointment data');
check(calendar.includes('fetchArtistDashboard(request)'), 'Verified artists enrich Calendar with dashboard schedule data');
check(calendar.includes("type CalendarViewMode = 'month' | 'week' | 'day'"), 'Calendar keeps alternate views available in the implementation');
check(calendar.includes('buildMonthDays') && calendar.includes('length: 42'), 'Calendar renders a complete six-week month grid');
check(calendar.includes("['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']"), 'Calendar follows the web Monday-first week');
check(calendar.includes("navigationControls: { display: 'none' }") && calendar.includes("viewToggle: { display: 'none' }"), 'Primary mobile Calendar hides the desktop-style control stack to match the deployed web view');
check(calendar.includes("titleBlock: { display: 'none' }") && !calendar.includes('styles.hero'), 'Calendar relies on the shared web-like header without a duplicate native title');
check(calendar.includes('dayCellHasEvents') && calendar.includes("justifyContent: 'space-between'") && calendar.includes('extraMarkersByDate') && calendar.includes('blocked_periods') && calendar.includes('time_off'), 'Calendar uses separated rounded event tiles like the deployed mobile website');
check(calendar.includes('QuickAction') && calendar.includes('ui.addSession') && calendar.includes('ui.blockTime') && calendar.includes('ui.setVacation') && calendar.includes('ui.createConsultation'), 'Calendar exposes the current web quick actions for artists');
check(calendar.includes("router.push('/artist-dashboard/calendar')") && calendar.includes("router.push('/artist-dashboard/create-appointment')"), 'Calendar quick actions open the real artist tools');
check(calendar.includes("pathname: '/appointment/[appointmentId]'"), 'Calendar events open the real appointment detail route');
check(calendar.includes('ui.insights') && calendar.includes('attentionCount'), 'Calendar includes the compact web Insights card');
check(calendar.includes('LegendRow') && calendar.includes('BLOCKED_COLOR') && calendar.includes('VACATION_COLOR'), 'Calendar legend distinguishes sessions, consultations, blocked time and vacation');

console.log('\nTatzo mobile shell parity check');
for (const label of passed) console.log(`  ✓ ${label}`);
for (const label of failures) console.error(`  ✗ ${label}`);
console.log(`\n${passed.length} passed, ${failures.length} failure(s).`);

if (failures.length) process.exit(1);

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

function check(condition, label) {
  if (condition) passed.push(label);
  else failures.push(label);
}

const profile = source('app/(tabs)/profile.tsx');
const settings = source('app/settings.tsx');
const profileApi = source('src/profile/profile-api.ts');
const dashboard = source('app/artist-dashboard/index.tsx');

check(profile.includes('profileHeader') && profile.includes('avatarWrap') && profile.includes('nameRow'), 'Profile follows the web identity header hierarchy');
check(profile.includes('styles.stats') && profile.includes('styles.bioCard'), 'Profile keeps web stats and bio surfaces');
check(profile.includes('artistInfoGrid') && profile.includes('ArtistInfoCard'), 'Artist profile exposes verification, portfolio and booking cards');
check(profile.includes('ProfileTab') && profile.includes("selectTab('liked')"), 'Profile has Posts and Liked tabs');
check(profile.includes('postsGrid') && profile.includes('PostTile'), 'Profile renders the three-column post grid');
check(profile.includes("router.push('/settings')"), 'Account settings are separated from the public-facing profile');
check(profile.includes("router.push('/edit-profile')"), 'Edit profile remains available from the profile header');
check(profile.includes('dashboardEntry') && profile.includes("router.push('/artist-dashboard')"), 'Verified artists get a direct Dashboard entry from their profile');
check(profileApi.includes('fetchProfileContent') && profileApi.includes('/content/?tab='), 'Profile tabs are backed by the real content API');

check(!settings.includes("router.push('/artist-dashboard')"), 'Dashboard is not hidden inside account Settings');
check(settings.includes("router.push('/healing')") && settings.includes("router.push('/health-safety')"), 'Healing and Health & Safety remain in Settings');
check(settings.includes('PUBLIC_LINKS.privacy') && settings.includes('PUBLIC_LINKS.terms') && settings.includes('PUBLIC_LINKS.communityGuidelines'), 'Legal links remain in Settings');
check(settings.includes("router.push('/blocked-users')") && settings.includes('PUBLIC_LINKS.safetySupport'), 'Blocking and safety support remain in Settings');
check(settings.includes("router.push('/delete-account')") && settings.includes('signOut()'), 'Account deletion and sign out remain in Settings');

const webPanels = ['dashboard', 'calendar', 'bookings', 'projects', 'messages', 'portfolio', 'clients', 'reviews', 'statistics', 'settings'];
for (const panel of webPanels) {
  check(dashboard.includes(`'${panel}'`), `Dashboard includes the web ${panel} panel`);
}
check(dashboard.includes("useState<DashboardPanelKey>('dashboard')") && dashboard.includes('setActivePanel(item.key)'), 'Dashboard navigation swaps panels inside one native shell');
check(!dashboard.includes("router.push('/(tabs)/bookings')") && !dashboard.includes("router.push('/(tabs)/chats')"), 'Dashboard tabs no longer eject users into global Bookings or Chats screens');
check(dashboard.includes('BookingsPanel') && dashboard.includes('ProjectsPanel') && dashboard.includes('MessagesPanel'), 'Bookings, Projects and Messages render as Dashboard panels');
check(dashboard.includes('PortfolioPanel') && dashboard.includes('ClientsPanel') && dashboard.includes('ReviewsPanel'), 'Portfolio, Clients and Reviews render as Dashboard panels');
check(dashboard.includes('StatisticsPanel') && dashboard.includes('SettingsPanel') && dashboard.includes('CalendarPanel'), 'Statistics, Settings and Calendar render as Dashboard panels');
check(dashboard.includes('fetchAppointments(') && dashboard.includes('fetchChats(') && dashboard.includes('fetchPortfolio('), 'Dashboard panels use real native APIs instead of placeholder navigation');
check(dashboard.includes('accessibilityLabel={copy(\'Back to profile\''), 'Dashboard has an explicit back control');
check(dashboard.includes('WEB_DASH_ICONS') && dashboard.includes('dashboard-icons/dashboard.png'), 'Dashboard keeps the repaired Tatzo dashboard artwork');
check(dashboard.includes('greeting(user.username)') && dashboard.includes('todayLabel()'), 'Dashboard overview keeps the web greeting/date header');
check(dashboard.includes("router.push('/artist-dashboard/create-appointment')"), 'Dashboard keeps the web plus action for manual booking');
check(dashboard.includes('dashboard.stats.today_sessions') && dashboard.includes('updateArtistBookingStatus('), 'Dashboard overview remains backed by the real API');
check(dashboard.includes('<WorkloadStrip') && dashboard.includes('<ArtistTimeline'), 'Workload and upcoming timeline remain in the overview');

console.log('\nTatzo mobile profile/dashboard parity check');
for (const label of passed) console.log(`  ✓ ${label}`);
for (const label of failures) console.error(`  ✗ ${label}`);
console.log(`\n${passed.length} passed, ${failures.length} failure(s).`);

if (failures.length) process.exit(1);

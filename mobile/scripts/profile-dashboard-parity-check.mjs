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
check(profileApi.includes('fetchProfileContent') && profileApi.includes('/content/?tab='), 'Profile tabs are backed by the real content API');

check(settings.includes("router.push('/healing')") && settings.includes("router.push('/health-safety')"), 'Healing and Health & Safety moved to Settings');
check(settings.includes('PUBLIC_LINKS.privacy') && settings.includes('PUBLIC_LINKS.terms') && settings.includes('PUBLIC_LINKS.communityGuidelines'), 'Legal links moved to Settings');
check(settings.includes("router.push('/blocked-users')") && settings.includes('PUBLIC_LINKS.safetySupport'), 'Blocking and safety support moved to Settings');
check(settings.includes("router.push('/delete-account')") && settings.includes('signOut()'), 'Account deletion and sign out moved to Settings');

check(dashboard.includes('WEB_DASH_ICONS') && dashboard.includes('dashboard-icons/dashboard.png'), 'Dashboard uses exact artwork imported from Tatzo web');
check(dashboard.includes('navRail') && dashboard.includes('destinations.map'), 'Dashboard mirrors the mobile web horizontal navigation rail');
check(dashboard.includes('greeting(user.username)') && dashboard.includes('todayLabel()'), 'Dashboard opens with the web greeting/date header');
check(dashboard.includes("router.push('/artist-dashboard/create-appointment')"), 'Dashboard keeps the web plus action for manual booking');
check(dashboard.includes('statStack') && dashboard.includes('dashboard.stats.today_sessions'), 'Dashboard exposes the four web-style stat cards');
check(dashboard.includes("copy('Smart insights'") && dashboard.includes('Insight accent'), 'Dashboard mirrors the web Smart insights section');
check(dashboard.includes('updateArtistBookingStatus('), 'Booking status remains backed by the real API');
check(dashboard.includes("router.push('/artist-dashboard/calendar')"), 'Calendar stays available from dashboard navigation');
check(dashboard.includes("router.push('/(tabs)/bookings')") && dashboard.includes("router.push('/(tabs)/chats')"), 'Bookings and messages stay available from dashboard navigation');
check(dashboard.includes("router.push('/manage-portfolio')") && dashboard.includes("router.push('/healing')"), 'Portfolio and clients remain available from dashboard navigation');
check(dashboard.includes('<WorkloadStrip') && dashboard.includes('<ArtistTimeline'), 'Workload and upcoming timeline remain available below the web overview');

console.log('\nTatzo mobile profile/dashboard parity check');
for (const label of passed) console.log(`  ✓ ${label}`);
for (const label of failures) console.error(`  ✗ ${label}`);
console.log(`\n${passed.length} passed, ${failures.length} failure(s).`);

if (failures.length) process.exit(1);

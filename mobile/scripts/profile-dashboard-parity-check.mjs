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

check(dashboard.includes('BrandHeader title={t(\'artistDashboard\')}'), 'Artist workspace uses the shared section-header hierarchy');
check(dashboard.includes('heroStatus') && dashboard.includes('liveStatus'), 'Booking intake status is prominent at the top');
check(dashboard.includes('QuickAction') && dashboard.includes('toolsGrid'), 'Workspace tools use compact action tiles instead of a stack of identical buttons');
check(dashboard.includes("router.push('/artist-dashboard/create-appointment')"), 'Manual appointment creation remains available');
check(dashboard.includes("router.push('/(tabs)/bookings')"), 'Booking requests remain available');
check(dashboard.includes("router.push('/artist-dashboard/preferences')") && dashboard.includes("router.push('/artist-dashboard/schedule')"), 'Booking preferences and schedule remain available');
check(dashboard.includes("router.push('/artist-dashboard/calendar')") && dashboard.includes("router.push('/artist-dashboard/payments')"), 'Time off and payments remain available');
check(dashboard.includes("router.push('/healing')") && dashboard.includes("router.push('/manage-portfolio')"), 'Healing clients and portfolio remain available');
check(dashboard.includes('fetchArtistDashboard(') && dashboard.includes('updateArtistBookingStatus('), 'Artist workspace remains backed by the real dashboard APIs');
check(dashboard.includes('<ArtistStats') && dashboard.includes('<WorkloadStrip') && dashboard.includes('<ArtistTimeline'), 'Stats, workload and upcoming timeline remain visible');

console.log('\nTatzo mobile profile/dashboard parity check');
for (const label of passed) console.log(`  ✓ ${label}`);
for (const label of failures) console.error(`  ✗ ${label}`);
console.log(`\n${passed.length} passed, ${failures.length} failure(s).`);

if (failures.length) process.exit(1);

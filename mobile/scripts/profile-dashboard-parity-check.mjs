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
const dashboard = source('app/artist-dashboard/index.tsx');

check(profile.includes('profileHero') && profile.includes('identityRow'), 'Profile leads with identity instead of a settings dump');
check(profile.includes('workspaceCard') && profile.includes("router.push('/artist-dashboard')"), 'Verified artists retain a distinct workspace entry');
check(profile.includes('SettingsGroup') && profile.includes('ActionRow'), 'Profile settings use compact grouped rows');
check(!profile.includes('styles.safetyCard'), 'Legacy repeated safety cards are removed');
check(profile.includes("router.push('/edit-profile')"), 'Edit profile remains available');
check(profile.includes("router.push('/health-safety')") && profile.includes("router.push('/healing')"), 'Healing and Health & Safety remain available');
check(profile.includes('PUBLIC_LINKS.privacy') && profile.includes('PUBLIC_LINKS.terms') && profile.includes('PUBLIC_LINKS.communityGuidelines'), 'Legal links remain available');
check(profile.includes("router.push('/blocked-users')") && profile.includes('PUBLIC_LINKS.safetySupport'), 'Blocking and safety support remain available');
check(profile.includes("router.push('/delete-account')") && profile.includes('signOut()'), 'Account deletion and sign out remain available');

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
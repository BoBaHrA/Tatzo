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

const profile = source('app/(tabs)/profile.tsx');
const settings = source('app/settings.tsx');
const profileApi = source('src/profile/profile-api.ts');
const dashboard = source('app/artist-dashboard/index.tsx');
const bookingPreferencesApi = source('../mobile_api/artist_booking_preferences_parity_view.py');
const mobileUrls = source('../mobile_api/urls.py');
const bookingViews = source('../mobile_api/booking_views.py');
const appointmentTypes = source('src/api/types.ts');
const appointmentDetail = source('app/appointment/[appointmentId].tsx');

for (const icon of ['dashboard', 'calendar', 'inbox', 'message', 'image', 'clients', 'reviews', 'statistics', 'setting', 'stat-gradient']) {
  exists(`assets/dashboard-icons/${icon}.png`);
}
for (const icon of ['check-circle', 'pause-circle', 'palmtree', 'layers', 'message-circle', 'alert-triangle']) {
  exists(`assets/dashboard-rule-icons/${icon}.png`);
}

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
check(dashboard.includes('navRail: { height: 74, flexGrow: 0, flexShrink: 0'), 'Dashboard navigation rail is height-bounded and cannot create the old giant empty gap');
check(dashboard.includes('screen: { flex: 0'), 'Dashboard screen content no longer stretches panels vertically');
check(dashboard.includes("projects: require('../../assets/web-icons/palette.png')"), 'Projects uses the canonical web palette icon');
check(dashboard.includes("reviews: require('../../assets/dashboard-icons/reviews.png')"), 'Reviews uses dedicated star artwork');
check(dashboard.includes("statistics: require('../../assets/dashboard-icons/statistics.png')"), 'Statistics uses dedicated graph artwork');
check(dashboard.includes('STAT_GRADIENT') && dashboard.includes('stat-gradient.png') && dashboard.includes('resizeMode="stretch"'), 'Statistics bars use the teal-to-pink web gradient artwork');
check(dashboard.includes('BookingsPanel') && dashboard.includes('ProjectsPanel') && dashboard.includes('MessagesPanel'), 'Bookings, Projects and Messages render as Dashboard panels');
check(dashboard.includes('PortfolioPanel') && dashboard.includes('ClientsPanel') && dashboard.includes('ReviewsPanel') && dashboard.includes('client_rating') && dashboard.includes('/5'), 'Portfolio, Clients and Reviews render as Dashboard panels with explicit client ratings');
check(dashboard.includes('StatisticsPanel') && dashboard.includes('SettingsPanel') && dashboard.includes('CalendarPanel'), 'Statistics, Settings and Calendar render as Dashboard panels');
check(dashboard.includes('fetchAppointments(') && dashboard.includes('fetchChats(') && dashboard.includes('fetchPortfolio('), 'Dashboard panels use real native APIs instead of placeholder navigation');
check(dashboard.includes('fetchArtistBookingPreferences(') && dashboard.includes('saveArtistBookingPreferences('), 'Dashboard Settings reads and saves the real booking preferences API');
check(dashboard.includes("copy('Booking settings'") && dashboard.includes("copy('Booking rules'"), 'Booking settings and Booking rules live together inside the Dashboard Settings panel');
check(dashboard.includes("copy('Accept new clients'") && dashboard.includes('bookings_enabled'), 'Booking settings expose the web new-client control');
check(dashboard.includes("copy('Phone consultation'") && dashboard.includes('phone_consultation_enabled'), 'Booking settings expose phone consultation parity');
check(dashboard.includes("copy('Deposit amount'") && dashboard.includes("copy('Deposit required'") && dashboard.includes('deposit_amount'), 'Booking settings expose deposit parity');
check(dashboard.includes("copy('Min references'") && dashboard.includes("copy('Max references'") && dashboard.includes('minimum_reference_images') && dashboard.includes('maximum_reference_images'), 'Booking settings expose the web reference limits');
check(dashboard.includes('booking_workflow_options') && dashboard.includes('consultation_enabled') && dashboard.includes('reference_images_required'), 'Dashboard Settings keeps the existing web booking controls');
check(dashboard.includes('booking_status_options.map') && dashboard.includes('RULE_TONES') && dashboard.includes('dashboard-rule-icons/check-circle.png') && dashboard.includes('ruleIcon'), 'Booking rules expose every server status with Lucide-like web artwork and tone mapping');
check(dashboard.includes("copy('Auto responses'") && dashboard.includes('auto_response_booking_received') && dashboard.includes('auto_response_booking_declined'), 'Dashboard Settings exposes the web auto-response messages');
check(dashboard.includes("copy('Save all settings'"), 'Dashboard Settings uses the web save-all action');
check(dashboard.includes('accessibilityLabel={copy(\'Back to profile\''), 'Dashboard has an explicit back control');
check(dashboard.includes('greeting(user.username)') && dashboard.includes('todayLabel()'), 'Dashboard overview keeps the web greeting/date header');
check(dashboard.includes("router.push('/artist-dashboard/create-appointment')"), 'Dashboard keeps the web plus action for manual booking');
check(dashboard.includes('dashboard.stats.today_sessions') && dashboard.includes('updateArtistBookingStatus('), 'Dashboard remains backed by the real API');
check(dashboard.includes("copy('Smart insights'") && !dashboard.includes('<WorkloadStrip') && !dashboard.includes('<ArtistTimeline'), 'Dashboard overview matches the web stat cards plus Smart insights structure');

for (const field of ['bookings_enabled', 'phone_consultation_enabled', 'deposit_required', 'deposit_amount']) {
  check(bookingPreferencesApi.includes(`\"${field}\"`), `Mobile booking preferences API persists ${field}`);
}
check(bookingPreferencesApi.includes('booking_preferences_parity_payload'), 'Mobile booking preferences API returns the extended web payload');
check(mobileUrls.includes('artist_booking_preferences_parity_view import ArtistBookingPreferencesView'), 'Mobile preferences route uses the web-parity API view');
check(mobileUrls.includes('AppointmentRatingView') && mobileUrls.includes('appointments/<int:appointment_id>/rating/'), 'Completed appointment rating endpoint is routed');
check(bookingViews.includes('"client_rating": appointment.client_rating') && bookingViews.includes('class AppointmentRatingView'), 'Appointment API exposes and validates the real client rating');
check(appointmentTypes.includes('client_rating: number | null'), 'Native appointment contract carries the client rating');
check(appointmentDetail.includes('rateAppointment(') && appointmentDetail.includes('[1, 2, 3, 4, 5]'), 'Clients can submit a 1–5 rating from completed appointment details');

console.log('\nTatzo mobile profile/dashboard parity check');
for (const label of passed) console.log(`  ✓ ${label}`);
for (const label of failures) console.error(`  ✗ ${label}`);
console.log(`\n${passed.length} passed, ${failures.length} failure(s).`);

if (failures.length) process.exit(1);

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const searchPath = path.join(root, 'app', '(tabs)', 'search.tsx');
const source = fs.readFileSync(searchPath, 'utf8');

const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

check(source.includes("discovery: '1'"), 'Native search must use the discovery API contract.');
check(source.includes("['studios', ui.studios]"), 'Native search must keep the Studios discovery tab.');
check(source.includes('requestForegroundPermissionsAsync'), 'Native search must keep foreground geolocation support.');
check(source.includes("params.append('style', style)"), 'Native search must submit multi-style filters.');
check(source.includes("params.set('accepting', '1')"), 'Native search must preserve accepting-bookings filtering.');
check(source.includes("params.set('verified', '1')"), 'Native search must preserve verified filtering.');
check(source.includes("filters.sort === 'distance'"), 'Native search must preserve distance sorting state.');
check(source.includes('item.native_profile_available'), 'Prepared profiles must not be routed blindly into the native profile screen.');
check(source.includes('https://tatzo.eu/profile/'), 'Prepared profiles must retain the safe web-profile fallback.');
check(source.includes('item.portfolio.map'), 'Discovery cards must retain portfolio previews.');

if (failures.length) {
  console.error('Search parity check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Search parity check passed.');

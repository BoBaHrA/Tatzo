#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const productionMode = process.argv.includes('--production');
const failures = [];
const warnings = [];
const passed = [];

function check(condition, label, detail = '') {
  if (condition) {
    passed.push(label);
    return;
  }
  failures.push(detail ? `${label}: ${detail}` : label);
}

function warn(condition, message) {
  if (!condition) warnings.push(message);
}

function readJson(relativePath) {
  const absolutePath = join(projectRoot, relativePath);
  check(existsSync(absolutePath), `${relativePath} exists`);
  if (!existsSync(absolutePath)) return {};
  try {
    return JSON.parse(readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    failures.push(`${relativePath} is valid JSON: ${error.message}`);
    return {};
  }
}

function pngInfo(relativePath) {
  const absolutePath = join(projectRoot, relativePath);
  check(existsSync(absolutePath), `${relativePath} exists`);
  if (!existsSync(absolutePath)) return null;

  const data = readFileSync(absolutePath);
  const pngSignature = '89504e470d0a1a0a';
  check(data.subarray(0, 8).toString('hex') === pngSignature, `${relativePath} is a PNG`);
  if (data.length < 26) {
    failures.push(`${relativePath} has a readable PNG header`);
    return null;
  }
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    colorType: data.readUInt8(25),
  };
}

function characterCount(value) {
  return [...value].length;
}

function checkMax(value, maximum, label) {
  check(typeof value === 'string' && characterCount(value) <= maximum, label, `maximum ${maximum} characters`);
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function loadExpoConfig() {
  const cliPath = join(projectRoot, 'node_modules', 'expo', 'bin', 'cli');
  check(existsSync(cliPath), 'Expo CLI is installed');
  if (!existsSync(cliPath)) return {};

  const result = spawnSync(process.execPath, [cliPath, 'config', '--type', 'public', '--json'], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      CI: process.env.CI || '1',
      EXPO_OFFLINE: '1',
      EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY:
        process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY || 'release-check-key',
    },
  });

  if (result.status !== 0) {
    failures.push(`Expo public config resolves: ${(result.stderr || result.stdout).trim()}`);
    return {};
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    failures.push(`Expo public config is JSON: ${error.message}`);
    return {};
  }
}

const eas = readJson('eas.json');
const listing = readJson('store/store-listing.json');
const expo = loadExpoConfig();

check(expo.name === 'Tatzo', 'App name is Tatzo');
check(expo.owner === 'tatzo', 'Expo owner is linked to the Tatzo account');
check(
  expo.extra?.eas?.projectId === '38bcf2cb-ad7b-49bf-a0f4-3055e371caa2',
  'Expo project ID is linked to the Tatzo EAS project',
);
check(/^\d+\.\d+\.\d+$/.test(expo.version || ''), 'App version uses semantic versioning');
check(expo.scheme === 'tatzo', 'Deep-link scheme is tatzo');
check(expo.ios?.bundleIdentifier === 'eu.tatzo.app', 'iOS bundle identifier is stable');
check(expo.android?.package === 'eu.tatzo.app', 'Android package name is stable');
check(expo.ios?.infoPlist?.ITSAppUsesNonExemptEncryption === false, 'iOS encryption declaration is explicit');
check(expo.icon === './assets/tatzo-app-icon.png', 'Store icon is configured');
check(expo.ios?.icon === './assets/tatzo-app-icon.png', 'iOS icon is configured');
check(expo.android?.icon === './assets/tatzo-app-icon.png', 'Android legacy icon is configured');
check(
  expo.android?.adaptiveIcon?.foregroundImage === './assets/tatzo-adaptive-icon.png',
  'Android adaptive foreground is configured',
);
check(
  expo.android?.adaptiveIcon?.monochromeImage === './assets/tatzo-monochrome-icon.png',
  'Android themed icon is configured',
);
check(expo.android?.adaptiveIcon?.backgroundColor === '#000d18', 'Android icon background is branded');
check(isHttpsUrl(expo.extra?.apiBaseUrl), 'Release API URL uses HTTPS');

for (const [path, expectsAlpha] of [
  ['assets/tatzo-app-icon.png', false],
  ['assets/tatzo-adaptive-icon.png', true],
  ['assets/tatzo-monochrome-icon.png', true],
]) {
  const info = pngInfo(path);
  if (!info) continue;
  check(info.width === 1024 && info.height === 1024, `${path} is 1024x1024`);
  const hasAlphaChannel = info.colorType === 4 || info.colorType === 6;
  check(
    expectsAlpha ? hasAlphaChannel : !hasAlphaChannel,
    expectsAlpha ? `${path} supports transparency` : `${path} is opaque`,
  );
}

check(eas.cli?.appVersionSource === 'remote', 'EAS uses remote build numbers');
check(eas.cli?.requireCommit === true, 'EAS refuses uncommitted release sources');
check(eas.build?.development?.environment === 'development', 'Development build uses development environment');
check(eas.build?.preview?.distribution === 'internal', 'Preview build is internally distributed');
check(eas.build?.preview?.environment === 'preview', 'Preview build uses preview environment');
check(eas.build?.preview?.channel === 'preview', 'Preview update channel is isolated');
check(eas.build?.preview?.android?.buildType === 'apk', 'Android preview produces an installable APK');
check(eas.build?.production?.environment === 'production', 'Production build uses production environment');
check(eas.build?.production?.channel === 'production', 'Production update channel is isolated');
check(eas.build?.production?.autoIncrement === true, 'Production build numbers auto-increment');
check(eas.submit?.production?.android?.track === 'internal', 'First Google Play submission targets internal testing');

const shared = listing.shared || {};
check(shared.appName === 'Tatzo', 'Store listing app name is stable');
check(shared.bundleIdentifier === 'eu.tatzo.app', 'Store listing identifier matches the app');
check(isHttpsUrl(shared.supportUrl), 'Store support URL uses HTTPS');
check(isHttpsUrl(shared.privacyPolicyUrl), 'Store privacy URL uses HTTPS');
check(isHttpsUrl(shared.termsOfUseUrl), 'Store terms URL uses HTTPS');
check(isHttpsUrl(shared.communityGuidelinesUrl), 'Store community rules URL uses HTTPS');
check(isHttpsUrl(shared.accountDeletionUrl), 'Store account-deletion URL uses HTTPS');
check(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(shared.supportEmail || ''), 'Store support email is valid');

const publicLinksSource = readFileSync(join(projectRoot, 'src', 'public-links.ts'), 'utf8');
for (const [label, value] of [
  ['privacy', shared.privacyPolicyUrl],
  ['terms', shared.termsOfUseUrl],
  ['community guidelines', shared.communityGuidelinesUrl],
  ['account deletion', shared.accountDeletionUrl],
]) {
  check(Boolean(value) && publicLinksSource.includes(value), `In-app ${label} URL matches store metadata`);
}

const requiredLocales = ['en-US', 'fr-FR', 'ru-RU'];
for (const locale of requiredLocales) {
  const metadata = listing.locales?.[locale];
  check(Boolean(metadata), `${locale} store metadata exists`);
  if (!metadata) continue;
  checkMax(metadata.name, 30, `${locale} app name fits store limits`);
  checkMax(metadata.subtitle, 30, `${locale} subtitle fits App Store limits`);
  checkMax(metadata.shortDescription, 80, `${locale} short description fits Google Play limits`);
  checkMax(metadata.promotionalText, 170, `${locale} promotional text fits App Store limits`);
  checkMax(metadata.keywords, 100, `${locale} keywords fit App Store limits`);
  check(
    typeof metadata.description === 'string' &&
      metadata.description.length > 100 &&
      characterCount(metadata.description) <= 4000,
    `${locale} description is complete and fits store limits`,
  );
  check(
    !JSON.stringify(metadata).match(/\b(?:TODO|TBD|PLACEHOLDER)\b/i),
    `${locale} metadata has no placeholders`,
  );
}

const requiredProductionEnvironment = [
  ['EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY', (value) => /^AIza[\w-]{20,}$/.test(value)],
];

for (const [name, validate] of requiredProductionEnvironment) {
  const value = process.env[name] || '';
  if (productionMode) {
    check(validate(value), `${name} is ready for a production build`);
  } else {
    warn(validate(value), `${name} is not set; structural checks pass, but a real EAS production build still needs it.`);
  }
}

console.log(`\nTatzo mobile release check (${productionMode ? 'production' : 'structural'})`);
for (const label of passed) console.log(`  ✓ ${label}`);
for (const message of warnings) console.warn(`  ! ${message}`);
for (const message of failures) console.error(`  ✗ ${message}`);
console.log(`\n${passed.length} passed, ${warnings.length} warning(s), ${failures.length} failure(s).`);

if (failures.length > 0) process.exit(1);

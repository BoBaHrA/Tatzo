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

const route = source('app/(tabs)/match.tsx');
const match = source('src/style-match/style-match-screen-v3.tsx');
const result = source('src/style-match/style-match-result-v2.tsx');

for (const icon of ['reject', 'save', 'like', 'favorite']) {
  exists(`assets/style-match-icons/${icon}.png`);
}
exists('assets/tatzo7.png');

check(route.includes("@/style-match/style-match-screen-v3"), 'Style Match route uses the active gesture-parity v3 screen');
check(match.includes("require('../../assets/tatzo7.png')"), 'Active Style Match uses the official Tatzo logo artwork');
check(match.includes('ACTION_ICONS') && match.includes("style-match-icons/reject.png") && match.includes("style-match-icons/favorite.png"), 'Discovery actions use dedicated artwork instead of font glyphs');
check(!match.includes('symbol="×"') && !match.includes('symbol="⌑"') && !match.includes('symbol="♡"'), 'Discovery no longer falls back to the old action glyphs');
check(match.includes('previewDeck') && match.includes('visualPill') && match.includes('previewCenter'), 'Onboarding keeps the current web preview deck');
check(match.includes("setSession(null);") && match.includes("setMode('intro')"), 'Opening Style Match always shows onboarding before discovery');
check(match.includes('PanResponder.create'), 'Discovery cards have a real native swipe responder');
check(match.includes('const WEB_SWIPE_THRESHOLD = 90'), 'Swipe threshold matches the web 90px choice threshold');
check(match.includes('const WEB_LONG_PRESS_MS = 650'), 'Hold-to-save matches the web 650ms gesture');
check(match.includes('const DOUBLE_TAP_MS = 280') && match.includes("reactRef.current('favorite', 'right')"), 'Double tap favorites the current card');
check(match.includes('const WEB_EXIT_MS = 220'), 'Accepted swipes use the web 220ms exit motion');
check(match.includes("outputRange: ['-10deg', '0deg', '10deg']"), 'Card rotation follows the web drag geometry');
check(match.includes('likeStampOpacity') && match.includes('nopeStampOpacity'), 'LIKE and NOPE stamps track swipe direction');
check(match.includes('DeckBackCard') && match.includes('nextCard') && match.includes('thirdCard'), 'Layered deck previews the real next cards');
check(match.includes('actionButtonLike') && match.includes('width: 58') && match.includes("backgroundColor: '#ed0b70'"), 'Like remains the larger pink primary action from the current web hotfix');
check(match.includes('current_saved') && match.includes('toggleSaved'), 'Save remains independent from the reaction choice');
check(match.includes('fetchStyleMatchOverview(') && match.includes('startStyleMatch('), 'Style Match overview and fresh-session start APIs remain wired');
check(match.includes('reactToStyleMatch(') && match.includes('fetchStyleMatchResult('), 'Reactions and final result stay backed by the real API');
check(match.includes('setTimeout(() => setAnalysisPhase(1), 550)') && match.includes('}, 2200)'), 'Analysis pacing follows the current web reveal timing');

check(result.includes("require('../../assets/tatzo7.png')"), 'Results use the official Tatzo logo artwork');
check(result.includes('matchLockup') && result.includes('confidence'), 'Results lead with the web match-confidence lockup');
check(result.includes('personalityCard') && result.includes('personalityShade'), 'Tattoo personality keeps the web pink reveal treatment');
check(result.includes('<SavedReferences result={result} />'), 'Saved references sit directly after the personality result');
check(result.includes('TraitPanel') && result.includes('styleMatchDrawnTo') && result.includes('styleMatchSkip'), 'Drawn-to and skip sections use full-width result panels');
check(result.includes('tagCloud') && result.includes('achievementGrid') && result.includes('wrappedCard'), 'Results include mood tags, unlocks and Tatzo Wrapped');
check(result.includes("pathname: '/profile/[username]'"), 'Artist recommendations open real profiles');
check(result.includes('saved_cards') && result.includes('savedGrid'), 'Saved references remain visible with web-like tiles');
check(result.includes("router.replace('/(tabs)/home')"), 'Completed results keep a safe path back home');

console.log('\nTatzo mobile Style Match parity check');
for (const label of passed) console.log(`  ✓ ${label}`);
for (const label of failures) console.error(`  ✗ ${label}`);
console.log(`\n${passed.length} passed, ${failures.length} failure(s).`);

if (failures.length) process.exit(1);

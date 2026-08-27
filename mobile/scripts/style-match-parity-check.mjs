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

const route = source('app/(tabs)/match.tsx');
const match = source('src/style-match/style-match-screen-v3.tsx');
const result = source('src/style-match/style-match-result-v2.tsx');

check(route.includes("@/style-match/style-match-screen-v3"), 'Style Match route uses the gesture-parity screen');
check(match.includes('tatzo<Text style={styles.wordmarkDot}>.</Text>'), 'Style Match uses the real text tatzo. wordmark');
check(match.includes('wordmarkDot: { color: colors.primary }'), 'Tatzo wordmark dot matches the teal web wordmark');
check(match.includes('previewDeck') && match.includes('visualPill') && match.includes('previewCenter'), 'Onboarding keeps the current web preview deck');
check(match.includes("setSession(null);") && match.includes("setMode('intro')"), 'Opening Style Match always shows onboarding before discovery');
check(!match.includes("if (overview.active_session) {\n        setSession(overview.active_session);\n        setMode('quiz');"), 'An old active session cannot skip the onboarding explanation');
check(match.includes('PanResponder.create'), 'Discovery cards have a real native swipe responder');
check(match.includes('const WEB_SWIPE_THRESHOLD = 90'), 'Swipe threshold matches the web 90px choice threshold');
check(match.includes('const WEB_LONG_PRESS_MS = 650'), 'Hold-to-save matches the web 650ms gesture');
check(match.includes('const DOUBLE_TAP_MS = 280') && match.includes("reactRef.current('favorite', 'right')"), 'Double tap favorites the current card');
check(match.includes('const WEB_EXIT_MS = 220'), 'Accepted swipes use the web 220ms exit motion');
check(match.includes("outputRange: ['-10deg', '0deg', '10deg']"), 'Card rotation follows the web drag geometry');
check(match.includes('likeStampOpacity') && match.includes('nopeStampOpacity'), 'LIKE and NOPE stamps track swipe direction');
check(match.includes('DeckBackCard') && match.includes('nextCard') && match.includes('thirdCard'), 'Layered deck previews the real next cards');
check(match.includes("symbol=\"×\"") && match.includes("symbol=\"⌑\"") && match.includes("symbol=\"♡\"") && match.includes("symbol=\"✦\""), 'Discovery uses the exact four current web action glyphs');
check(match.includes('actionButtonLike') && match.includes('width: 64') && match.includes("backgroundColor: '#ed0b70'"), 'Like is the larger pink primary action from current web');
check(match.includes('current_saved') && match.includes('toggleSaved'), 'Save remains independent from the reaction choice');
check(match.includes('fetchStyleMatchOverview(') && match.includes('startStyleMatch('), 'Style Match overview and fresh-session start APIs remain wired');
check(match.includes('reactToStyleMatch(') && match.includes('fetchStyleMatchResult('), 'Reactions and final result stay backed by the real API');
check(match.includes('setTimeout(() => setAnalysisPhase(1), 550)') && match.includes('}, 2200)'), 'Analysis pacing follows the current web reveal timing');

check(result.includes('matchLockup') && result.includes('confidence'), 'Results lead with the web match-confidence lockup');
check(result.includes('personalityCard') && result.includes('backgroundColor: colors.accent'), 'Tattoo personality keeps the pink reveal card');
check(result.includes('tagCloud') && result.includes('achievementGrid') && result.includes('wrappedCard'), 'Results include mood tags, unlocks and Tatzo Wrapped');
check(result.includes("pathname: '/profile/[username]'"), 'Artist recommendations open real profiles');
check(result.includes('saved_cards') && result.includes('savedImage'), 'Saved references remain visible');
check(result.includes("router.replace('/(tabs)/home')"), 'Completed results keep a safe path back home');

console.log('\nTatzo mobile Style Match parity check');
for (const label of passed) console.log(`  ✓ ${label}`);
for (const label of failures) console.error(`  ✗ ${label}`);
console.log(`\n${passed.length} passed, ${failures.length} failure(s).`);

if (failures.length) process.exit(1);

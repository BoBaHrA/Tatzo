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
const match = source('src/style-match/style-match-screen-v2.tsx');
const result = source('src/style-match/style-match-result-v2.tsx');

check(route.includes("@/style-match/style-match-screen-v2"), 'Style Match route uses the web-source parity screen');
check(match.includes('tatzo<Text style={styles.wordmarkDot}>.</Text>'), 'Discovery uses the web tatzo. wordmark');
check(match.includes('previewDeck') && match.includes('visualPill'), 'Onboarding keeps the fanned preview-card visual');
check(match.includes("type MatchMode = 'intro' | 'quiz' | 'analysis' | 'result'"), 'Discovery includes the web analysis phase before reveal');
check(match.includes('analysisOrb') && match.includes('analysisMeter'), 'Analysis screen has the Tatzo intelligence orb and progress meter');
check(match.includes("session.current_index + 1") && match.includes('progressFill'), 'Discovery progress starts on the current card rather than zero');
check(match.includes('deckBackOne') && match.includes('deckBackTwo'), 'Discovery retains the layered card deck');
check(match.includes("symbol=\"×\"") && match.includes("symbol=\"⌑\"") && match.includes("symbol=\"♡\"") && match.includes("symbol=\"✦\""), 'Discovery uses the exact four web action concepts');
check(match.includes("variant=\"favorite\"") && match.includes('backgroundColor: colors.accent'), 'Favorite remains the pink emotional action');
check(match.includes('current_saved') && match.includes('toggleSaved'), 'Save remains independent from reaction choice');
check(match.includes('fetchStyleMatchOverview(') && match.includes('startStyleMatch('), 'Style Match overview and start APIs remain wired');
check(match.includes('reactToStyleMatch(') && match.includes('fetchStyleMatchResult('), 'Reactions and final result stay backed by the real API');
check(match.includes('latestResult') && match.includes("setMode('result')"), 'Latest result remains resumable from onboarding');

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

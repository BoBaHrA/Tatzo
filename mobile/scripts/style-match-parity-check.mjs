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

const match = source('app/(tabs)/match.tsx');
const result = source('src/style-match/style-match-result.tsx');

check(match.includes("session.current_index + 1") && match.includes('progressFill'), 'Discovery progress represents the current choice instead of starting at zero');
check(match.includes('deckBackOne') && match.includes('deckBackTwo'), 'Discovery card keeps a visible swipe-deck hierarchy');
check(match.includes('borderRadius: 24') && match.includes('imageCard'), 'Reference media uses the rounded Style Match deck treatment');
check(match.includes('saveButton') && match.includes('current_saved'), 'Reference save state stays available on the image surface');
check(match.includes('rejectReaction') && match.includes('likeReaction') && match.includes('favoriteReaction'), 'Three-choice reaction hierarchy stays distinct');
check(match.includes('backgroundColor: colors.accent') && match.includes('favoriteReaction'), 'Favorite remains the pink primary emotional action');
check(match.includes('fetchStyleMatchOverview(') && match.includes('startStyleMatch('), 'Style Match overview and start APIs remain wired');
check(match.includes('reactToStyleMatch(') && match.includes('fetchStyleMatchResult('), 'Reactions and final result stay backed by the real API');
check(match.includes('latestResult') && match.includes('styleMatchViewResult'), 'Latest completed Style Match remains resumable from the intro');

check(result.includes('matchLockup') && result.includes('confidenceValue'), 'Results lead with a strong match-confidence lockup');
check(result.includes('personalityCard') && result.includes('backgroundColor: colors.accent'), 'Tattoo personality gets the web-style pink hero treatment');
check(result.includes('scoreFillPink') && result.includes('scoreFillAccent'), 'Style spectrum preserves cyan/pink result hierarchy');
check(result.includes("pathname: '/profile/[username]'"), 'Artist recommendations still open real artist profiles');
check(result.includes('saved_cards') && result.includes('referenceImage'), 'Saved Style Match references remain visible');
check(result.includes("router.replace('/(tabs)/home')"), 'Completed results still provide a safe path back home');

console.log('\nTatzo mobile Style Match parity check');
for (const label of passed) console.log(`  ✓ ${label}`);
for (const label of failures) console.error(`  ✗ ${label}`);
console.log(`\n${passed.length} passed, ${failures.length} failure(s).`);

if (failures.length) process.exit(1);
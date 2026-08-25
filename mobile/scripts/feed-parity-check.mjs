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

const home = source('app/(tabs)/home.tsx');
const postCard = source('src/feed/post-card.tsx');
const media = source('src/feed/post-media.tsx');
const composer = source('app/create-post.tsx');
const detail = source('app/post/[postId].tsx');
const comments = source('src/comments/comments-section-v2.tsx');
const checkbox = source('src/components/checkbox.tsx');

check(home.includes("onDelete={removePost}"), 'Feed supports deleting owned posts from the post menu');
check(home.includes("t('postCaptionPlaceholder')"), 'Home uses the compact web-style post prompt');
check(postCard.includes('messageRowOwned'), 'Owned posts reverse the avatar/bubble row');
check(postCard.includes("styles.actionsOwned"), 'Owned post actions account for the right-side avatar');
check(postCard.includes("styles.actionsOther"), 'Other-user post actions account for the left-side avatar');
check(postCard.includes('backgroundColor: colors.primary'), 'Post bubble uses the Tatzo web turquoise surface');
check(postCard.includes("color: colors.heading"), 'Post author keeps the Tatzo heading accent on the turquoise bubble');
check(postCard.includes("Share.share"), 'Post actions include native sharing');
check(postCard.includes('⋯'), 'Post menu uses the web-style ellipsis trigger');
check(!postCard.includes('saveAction'), 'Legacy large save pill is removed from post cards');
check(media.includes('frameWidth * 0.82'), 'Feed media keeps compact mobile-web proportions');
check(media.includes('pagingEnabled'), 'Multiple post media remain swipeable');
check(composer.includes("@/components/checkbox"), 'Publishing uses the Tatzo checkbox primitive');
check(!composer.includes('Switch'), 'Publishing no longer uses the platform switch for comments');
check(composer.includes("backgroundColor: '#003c3c'"), 'Publishing keeps the Tatzo web composer surface');
check(detail.includes('CommentsSectionV2'), 'Post detail uses the compact comments parity surface');
check(comments.includes('replyList'), 'Comments preserve nested replies');
check(comments.includes('toggleCommentLike'), 'Comments preserve comment likes');
check(comments.includes('updatePostComment'), 'Comments preserve comment editing');
check(comments.includes('deletePostComment'), 'Comments preserve comment deletion');
check(comments.includes('reportComment'), 'Comments preserve comment reporting');
check(checkbox.includes('accessibilityRole="checkbox"'), 'Tatzo checkbox exposes native accessibility semantics');

console.log('\nTatzo mobile feed parity check');
for (const label of passed) console.log(`  ✓ ${label}`);
for (const label of failures) console.error(`  ✗ ${label}`);
console.log(`\n${passed.length} passed, ${failures.length} failure(s).`);

if (failures.length) process.exit(1);

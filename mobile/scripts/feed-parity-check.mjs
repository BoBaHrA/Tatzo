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
const postCardExport = source('src/feed/post-card.tsx');
const postCard = source('src/feed/web-post-card.tsx');
const media = source('src/feed/post-media.tsx');
const composer = source('src/publishing/inline-post-composer.tsx');
const detail = source('app/post/[postId].tsx');
const comments = source('src/comments/comments-section-v2.tsx');
const checkbox = source('src/components/checkbox.tsx');

for (const icon of ['post-heart.png', 'post-comments.png', 'post-share.png', 'post-bookmark.png']) {
  check(existsSync(join(projectRoot, 'assets', 'web-icons', icon)), `Web post action asset ${icon} exists`);
}

check(home.includes("onDelete={removePost}"), 'Feed supports deleting owned posts from the post menu');
check(home.includes('InlinePostComposer'), 'Post creation expands inline inside the feed');
check(!home.includes("router.push('/create-post')"), 'Feed no longer navigates away to create a post');
check(composer.includes('LayoutAnimation.configureNext'), 'Inline composer animates between collapsed and expanded states');
check(composer.includes('createPost(request'), 'Inline composer publishes through the real mobile API');
check(composer.includes("@/components/checkbox"), 'Publishing uses the Tatzo checkbox primitive');
check(!composer.includes('Switch'), 'Publishing no longer uses the platform switch for comments');
check(postCardExport.includes("WebPostCard as PostCard"), 'All post surfaces use the web-parity post card');
check(postCard.includes('messageRowOwned'), 'Owned posts reverse the avatar/bubble row');
check(postCard.includes('backgroundColor: colors.primary'), 'Post bubble uses the Tatzo web turquoise surface');
check(postCard.includes("post-heart.png") && postCard.includes("post-comments.png"), 'Like and comment actions use the exact web artwork');
check(postCard.includes("post-share.png") && postCard.includes("post-bookmark.png"), 'Share and bookmark actions use the exact web artwork');
check(postCard.includes("Share.share"), 'Post actions include native sharing');
check(postCard.includes('⋯'), 'Post menu uses the web-style ellipsis trigger');
check(media.includes('frameWidth * 0.82'), 'Feed media keeps compact mobile-web proportions');
check(media.includes('pagingEnabled'), 'Multiple post media remain swipeable');
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

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
const brandHeader = source('src/components/brand-header.tsx');
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
check(composer.includes('Animated.timing') && composer.includes('maxHeight: shellMaxHeight'), 'Inline composer uses explicit height animation on Android');
check(composer.includes('Easing.out(Easing.cubic)'), 'Inline composer preserves the smooth web-style opening curve');
check(composer.includes('createPost(request'), 'Inline composer publishes through the real mobile API');
check(composer.includes("@/components/checkbox"), 'Publishing uses the Tatzo checkbox primitive');
check(!composer.includes('Switch'), 'Publishing no longer uses the platform switch for comments');
check(postCardExport.includes('PostMediaLayoutProvider') && postCardExport.includes('props.post.layout'), 'Post surfaces pass the saved grid/carousel choice into the media renderer');
check(postCard.includes('messageRowOwned'), 'Owned posts reverse the avatar/bubble row');
check(postCard.includes("backgroundColor: '#001f26'"), 'Post bubble uses the current dark Tatzo mobile-web surface');
check(postCard.includes("borderColor: 'rgba(4,197,191,.34)'"), 'Post bubble keeps the current teal glass border');
check(postCard.includes('LIKED_HEART') && !postCard.includes('iconLiked'), 'Liked state uses the dedicated web artwork instead of tinting the whole icon');
check(postCard.includes('BOOKMARKED') && !postCard.includes('iconBookmarked'), 'Saved state uses dedicated web artwork instead of tinting the whole icon');
check(postCard.includes("post-heart.png") && postCard.includes("post-comments.png"), 'Like and comment actions use the exact web artwork');
check(postCard.includes("post-share.png") && postCard.includes("post-bookmark.png"), 'Share and bookmark actions use the exact web artwork');
check(postCard.includes("Share.share"), 'Post actions include native sharing');
check(postCard.includes('⋯'), 'Post menu uses the web-style ellipsis trigger');
check(brandHeader.includes("'/search/?type=artists'"), 'Topbar star opens artist recommendations instead of Style Match');
check(brandHeader.includes('menuOpen') && brandHeader.includes('☰'), 'Topbar exposes the web-style More menu');
check(media.includes("layout === 'carousel'"), 'Saved post layout switches between the real grid and carousel renderers');
check(media.includes('total === 3') && media.includes('total === 5') && media.includes('total === 8') && media.includes('total === 9'), 'Grid renderer preserves the special 3/5/8/9-media web compositions');
check(media.includes('total === 7 || total >= 10') && media.includes('stripRow'), 'Grid renderer preserves the 7 and 10+ two-up plus strip composition');
check(media.includes('pagingEnabled') && media.includes('thumbsRow'), 'Carousel keeps swipe paging plus the web thumbnail rail');
check(media.includes('VideoThumbnail') && media.includes('<FeedVideo controls={false} fit="cover" url={url} />'), 'Carousel video thumbnails render the actual video frame instead of an empty play tile');
check(!media.includes('<View style={styles.videoThumb}>\n                        <Text style={styles.videoThumbText}>▶</Text>'), 'Carousel no longer falls back to a blank text-only video thumbnail');
check(media.includes('const thumbRailHeight = largeThumbSet ? 140 : 120') && media.includes("? (active ? 140 : 82)\n                  : (active ? 120 : 90)"), 'Carousel thumbnail rail uses the current web 90/120px and 82/140px geometry');
check(media.includes('thumbsRowCentered') && media.includes("justifyContent: 'center'"), 'Small web-style carousel thumbnail sets stay centered');
check(media.includes('blurRadius={26}') && media.includes('contain'), 'Single and carousel media keep the web-style contained image over a blurred frame');
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

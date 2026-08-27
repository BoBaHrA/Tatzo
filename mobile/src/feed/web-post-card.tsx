import { useState } from 'react';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { FeedPost, ReportReason } from '@/api/types';
import { t } from '@/i18n';
import { colors, spacing, typography } from '@/theme';

import { PostMedia } from './post-media';


type WebPostCardProps = {
  post: FeedPost;
  onLike: (post: FeedPost) => Promise<void>;
  onBookmark: (post: FeedPost) => Promise<void>;
  onReport: (post: FeedPost, reason: ReportReason) => Promise<void>;
  onDelete?: (post: FeedPost) => Promise<void>;
  onComments?: (post: FeedPost) => void;
};

const HEART = require('../../assets/web-icons/post-heart.png');
const COMMENTS = require('../../assets/web-icons/post-comments.png');
const SHARE = require('../../assets/web-icons/post-share.png');
const BOOKMARK = require('../../assets/web-icons/post-bookmark.png');

// Rasterized directly from static/icons/liked.svg so Android keeps the web
// artwork: teal circle/outline, with only the heart itself marked as liked.
const LIKED_HEART = {
  uri: 'data:image/png;base64,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',
};
const BOOKMARKED = {
  uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAABmJLR0QA/wD/AP+gvaeTAAADkUlEQVR4nO2csW4TQRCG/3XOkiMQIZRJGjpEOgRCikhhIRoXOEGQ94iEyDvQJM/AEwQoTGhSBFmUdJRIiFSWiFMgx2bjpclFkcmdz3c3O7P2fIULy5rd+7/bnb0rDCiKoiiKoiiKoiiKoiiK4gXjdbSjo8Vq5XzDwTUB3IPDCgxueJ3DKA5/YPALwHcD8+HvcG4f6+snvob3I6Ddno+GZ9sw5g2ABS9j5ucUzr21ldou1tZ61IPRC/jyeSky1X0Aj8jHKpdv1tkmnjz7STkIrYCvhyvROb4CWE76iSOfRCGOrRk+xtrTY6oBKlSF0W7PR+fmPVLCB0SHDwDLkavs4/CwRjUAmYAIg9eAe0BV3yMPo6rZpipOcwO2P92JXO0H4G6R1PdP1w5wF/V6t+zCJCug6mrNKQofAG7PVdGkKEwiwME9p6jLiakYkmsi6gHmPk1dRpxbpShLJMAt0dRlJfU0lxeqU9BNorqckFwT3XNAZhz3BFgRIED4oxgxAgTMNiqAGX8CZnurT0RXADMqgBkVwIwKuISnSamAS3ieR1QAMyqAGRXAjApgRgUwowKYmTEBbsg9g1FmTIBRAcxE3BMYZdYEiEMFMKMCmFEBzEyVAHflMxQCEZAtVHPlMxQCEZAUapqYMFYCo4AyAkq728NYCYwC+AKStDYC2YJQamqS1kY4AiSlViLhCCCGa1sSLqDsWJLrGSYDwgWUve+k1GPa4oQLmH6mWoCk42YSUy0ghIPTVAsIARXAjApgJuyXcQYtGLSKF+KD+WVcAQkGLdvtbdpub3OsBMHHIeYtKOc55SJ8NBp9NBr9sRIEH4cC6AEjt+/V8GOySEiryYhwASP/KHdd+DETSZCzJPwJyHXNGcOPmXgl8CN8BVyQJfyYwCTIFzBJ+DEBSZAu4MD28WKi8GMajb5d6GzA4CPBvEpDsoADO8AG6vWz3BVWtwZ2ofMyXQLviUiqgOLhx4yVUPCBsCASBZQXfkwmCTzIEmDQsqe9Zqnhx6xuDWy390paY5YkIH/DzYrAxixFQPnbThKZGrM/JAjwF36MIAncAvyHHyNEAp8AyoabFQGNmUsAfcPNCnNj5hDAt+0kwbgdUf17+u/rvxaw7SQxdjtKuKaC0Ahw7t1/3+V5q+mbtLeo111TCZAIsIudHRi3C+AEwAkc9sSHHxNLcNhDPH/jdu1iZ4d7aoqiKIqiKIqiKEoJ/AOuP1Je4O2n2wAAAABJRU5ErkJggg==',
};

function formatPostDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function reportReasonLabel(reason: ReportReason): string {
  switch (reason) {
    case 'spam': return t('reportSpam');
    case 'harassment': return t('reportHarassment');
    case 'hate_or_violence': return t('reportHateOrViolence');
    case 'sexual_content': return t('reportSexualContent');
    case 'other': return t('reportOther');
  }
}

export function WebPostCard({
  post,
  onLike,
  onBookmark,
  onReport,
  onDelete,
  onComments,
}: WebPostCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [liking, setLiking] = useState(false);
  const [bookmarking, setBookmarking] = useState(false);
  const [reporting, setReporting] = useState(false);
  const owned = post.is_owned;
  const longContent = post.content.length > 220;

  const openProfile = () => router.push({
    pathname: '/profile/[username]',
    params: { username: post.author.username },
  });

  const openComments = () => {
    if (onComments) {
      onComments(post);
      return;
    }
    router.push({
      pathname: '/post/[postId]',
      params: { postId: String(post.id) },
    });
  };

  const like = async () => {
    setLiking(true);
    try {
      await onLike(post);
    } finally {
      setLiking(false);
    }
  };

  const bookmark = async () => {
    setBookmarking(true);
    try {
      await onBookmark(post);
    } finally {
      setBookmarking(false);
    }
  };

  const share = async () => {
    const message = post.content.trim()
      ? `${post.content.trim()}\n\nTatzo — https://tatzo.eu/`
      : 'Tatzo — https://tatzo.eu/';
    try {
      await Share.share({ message });
    } catch {
      // Native share cancellation is not an error state for the feed.
    }
  };

  const report = async (reason: ReportReason) => {
    setReporting(true);
    try {
      await onReport(post, reason);
    } finally {
      setReporting(false);
    }
  };

  const openMenu = () => {
    if (owned && onDelete) {
      Alert.alert(t('deletePost'), t('deletePostConfirm'), [
        { text: t('cancel'), style: 'cancel' },
        { text: t('delete'), style: 'destructive', onPress: () => void onDelete(post) },
      ]);
      return;
    }

    const reasons: ReportReason[] = ['spam', 'harassment', 'hate_or_violence', 'sexual_content', 'other'];
    Alert.alert(t('reportPost'), t('reportPrompt'), [
      ...reasons.map((reason) => ({
        text: reportReasonLabel(reason),
        onPress: () => void report(reason),
      })),
      { text: t('cancel'), style: 'cancel' as const },
    ]);
  };

  return (
    <View style={styles.post}>
      <View style={[styles.messageRow, owned && styles.messageRowOwned]}>
        <Pressable
          accessibilityLabel={`${t('openProfile')} ${post.author.username}`}
          accessibilityRole="button"
          onPress={openProfile}
          style={({ pressed }) => [styles.avatarButton, pressed && styles.pressed]}
        >
          {post.author.profile_image_url ? (
            <Image source={{ uri: post.author.profile_image_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarLetter}>{post.author.username[0]?.toUpperCase()}</Text>
            </View>
          )}
        </Pressable>

        <View style={styles.bubble}>
          <View style={styles.header}>
            <Pressable onPress={openProfile} style={styles.authorBlock}>
              <View style={styles.authorLine}>
                <Text numberOfLines={1} style={styles.author}>{post.author.username}</Text>
                {post.author.is_verified_artist ? (
                  <View style={styles.verifiedBadge}>
                    <Text style={styles.verifiedText}>✓</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.metaLine}>
                {post.author.tag ? <Text style={styles.tag}>@{post.author.tag}</Text> : null}
                <Text style={styles.date}>{formatPostDate(post.created_at)}</Text>
              </View>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              disabled={reporting}
              onPress={openMenu}
              style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}
            >
              {reporting ? <ActivityIndicator color={colors.primary} size="small" /> : <Text style={styles.menuText}>⋯</Text>}
            </Pressable>
          </View>

          {post.location ? <Text style={styles.location}>⌖ {post.location}</Text> : null}

          {post.is_ad || post.visibility !== 'public' ? (
            <View style={styles.badges}>
              {post.is_ad ? <Text style={[styles.badge, styles.adBadge]}>{t('ad')}</Text> : null}
              {post.visibility === 'followers' ? <Text style={styles.badge}>{t('followersOnly')}</Text> : null}
              {post.visibility === 'private' ? <Text style={styles.badge}>{t('privatePost')}</Text> : null}
            </View>
          ) : null}

          <PostMedia media={post.media} />

          {post.content ? (
            <View style={styles.contentBlock}>
              <Text numberOfLines={expanded ? undefined : 5} style={styles.content}>{post.content}</Text>
              {longContent ? (
                <Pressable onPress={() => setExpanded((current) => !current)}>
                  <Text style={styles.more}>{expanded ? t('showLess') : t('showMore')}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>

      <View style={[styles.actions, owned ? styles.actionsOwned : styles.actionsOther]}>
        <View style={styles.actionGroup}>
          <Pressable
            accessibilityLabel={post.is_liked ? t('unlike') : t('like')}
            accessibilityRole="button"
            disabled={liking}
            onPress={() => void like()}
            style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          >
            <Image
              source={post.is_liked ? LIKED_HEART : HEART}
              resizeMode="contain"
              style={styles.actionIcon}
            />
            {post.likes_count > 0 ? <Text style={styles.count}>{post.likes_count}</Text> : null}
          </Pressable>

          <Pressable
            accessibilityLabel={`${t('comments')}: ${post.comments_count}`}
            accessibilityRole="button"
            disabled={post.disable_comments}
            onPress={openComments}
            style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          >
            <Image
              source={COMMENTS}
              resizeMode="contain"
              style={[styles.actionIcon, post.disable_comments && styles.iconDisabled]}
            />
            {!post.disable_comments && post.comments_count > 0 ? <Text style={styles.count}>{post.comments_count}</Text> : null}
          </Pressable>

          <Pressable
            accessibilityLabel="Share"
            accessibilityRole="button"
            onPress={() => void share()}
            style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          >
            <Image source={SHARE} resizeMode="contain" style={styles.actionIcon} />
          </Pressable>
        </View>

        <Pressable
          accessibilityLabel={post.is_bookmarked ? t('saved') : t('bookmark')}
          accessibilityRole="button"
          disabled={bookmarking}
          onPress={() => void bookmark()}
          style={({ pressed }) => [styles.bookmarkAction, pressed && styles.actionPressed]}
        >
          <Image
            source={post.is_bookmarked ? BOOKMARKED : BOOKMARK}
            resizeMode="contain"
            style={styles.actionIcon}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  post: { width: '100%' },
  messageRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  messageRowOwned: { flexDirection: 'row-reverse' },
  avatarButton: { width: 36, height: 36, borderRadius: 18, marginTop: 14 },
  avatar: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1,
    borderColor: 'rgba(4,197,191,.65)',
  },
  avatarFallback: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.backgroundDeep, borderWidth: 1, borderColor: 'rgba(4,197,191,.65)',
  },
  avatarLetter: { color: colors.primary, fontSize: 14, fontWeight: '900' },
  bubble: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 13,
    paddingTop: 13,
    paddingBottom: 12,
    gap: 9,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(4,197,191,.34)',
    backgroundColor: '#001f26',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 19,
    elevation: 4,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 1 },
  authorBlock: { flex: 1, minWidth: 0, gap: 2 },
  authorLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  author: { color: colors.accent, fontSize: 16, fontWeight: '900', flexShrink: 1 },
  verifiedBadge: {
    width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(4,197,191,.12)', borderWidth: 1, borderColor: 'rgba(4,197,191,.34)',
  },
  verifiedText: { color: colors.primary, fontSize: 11, fontWeight: '900' },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  tag: { color: 'rgba(223,252,255,.58)', ...typography.caption, fontWeight: '700' },
  date: { color: colors.primary, ...typography.caption, fontWeight: '700' },
  menuButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', marginTop: -3, marginRight: -3 },
  menuText: { color: 'rgba(223,252,255,.48)', fontSize: 22, lineHeight: 23, fontWeight: '900' },
  location: { color: 'rgba(223,252,255,.58)', fontSize: 12, fontWeight: '700' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  badge: {
    color: colors.text, fontSize: 10, fontWeight: '900', backgroundColor: 'rgba(4,197,191,.09)',
    borderWidth: 1, borderColor: 'rgba(4,197,191,.18)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999,
  },
  adBadge: { color: '#ff8fbd', backgroundColor: 'rgba(238,12,111,.10)', borderColor: 'rgba(238,12,111,.22)' },
  contentBlock: { gap: 4 },
  content: { color: 'rgba(234,255,255,.90)', fontSize: 14, lineHeight: 20 },
  more: { color: colors.primary, fontSize: 12, fontWeight: '900' },
  actions: { marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actionsOther: { paddingLeft: 46, paddingRight: 8 },
  actionsOwned: { paddingRight: 46, paddingLeft: 8 },
  actionGroup: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  action: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 2 },
  bookmarkAction: { minHeight: 32, minWidth: 32, alignItems: 'center', justifyContent: 'center' },
  actionIcon: { width: 23, height: 23 },
  iconDisabled: { opacity: 0.32 },
  count: { color: '#7fcfd0', fontSize: 12, lineHeight: 16, fontWeight: '800' },
  actionPressed: { opacity: 0.62, transform: [{ scale: 0.94 }] },
  pressed: { opacity: 0.72 },
});

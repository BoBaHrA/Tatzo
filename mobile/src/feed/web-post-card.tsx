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

        <View style={[styles.bubble, owned ? styles.bubbleOwned : styles.bubbleOther]}>
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
              {reporting ? <ActivityIndicator color="#06474b" size="small" /> : <Text style={styles.menuText}>⋯</Text>}
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
              source={HEART}
              resizeMode="contain"
              style={[styles.actionIcon, post.is_liked && styles.iconLiked]}
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
            source={BOOKMARK}
            resizeMode="contain"
            style={[styles.actionIcon, post.is_bookmarked && styles.iconBookmarked]}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  post: { width: '100%' },
  messageRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  messageRowOwned: { flexDirection: 'row-reverse' },
  avatarButton: { width: 38, height: 38, borderRadius: 19, marginTop: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.primary },
  avatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundDeep,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  avatarLetter: { color: colors.primary, fontSize: 14, fontWeight: '900' },
  bubble: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.primary,
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    gap: spacing.sm,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  bubbleOther: { borderTopLeftRadius: 2 },
  bubbleOwned: { borderTopRightRadius: 2 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  authorBlock: { flex: 1, minWidth: 0, gap: 1 },
  authorLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  author: { color: colors.heading, fontSize: 16, fontWeight: '900', flexShrink: 1 },
  verifiedBadge: {
    width: 17,
    height: 17,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 13, 24, 0.80)',
  },
  verifiedText: { color: colors.primary, fontSize: 11, fontWeight: '900' },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  tag: { color: '#064e51', ...typography.caption, fontWeight: '800' },
  date: { color: '#07545b', ...typography.caption, fontWeight: '700' },
  menuButton: { width: 34, height: 28, alignItems: 'center', justifyContent: 'center', marginTop: -4, marginRight: -4 },
  menuText: { color: '#06474b', fontSize: 25, lineHeight: 25, fontWeight: '900' },
  location: { color: '#064e51', fontSize: 12, fontWeight: '700' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  badge: { color: '#064e51', fontSize: 10, fontWeight: '900', backgroundColor: 'rgba(0,13,24,.10)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  adBadge: { color: colors.heading },
  contentBlock: { gap: 4 },
  content: { color: '#001316', fontSize: 14, lineHeight: 20 },
  more: { color: '#064e51', fontSize: 12, fontWeight: '900' },
  actions: { marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actionsOther: { paddingLeft: 46 },
  actionsOwned: { paddingRight: 46 },
  actionGroup: { flexDirection: 'row', alignItems: 'center', gap: 15 },
  action: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 2 },
  bookmarkAction: { minHeight: 36, minWidth: 36, alignItems: 'center', justifyContent: 'center' },
  actionIcon: { width: 28, height: 28, tintColor: colors.primary },
  iconLiked: { tintColor: colors.accent },
  iconBookmarked: { tintColor: colors.accent },
  iconDisabled: { opacity: 0.32 },
  count: { color: colors.textMuted, fontSize: 13, fontWeight: '800' },
  actionPressed: { opacity: 0.62, transform: [{ scale: 0.94 }] },
  pressed: { opacity: 0.72 },
});

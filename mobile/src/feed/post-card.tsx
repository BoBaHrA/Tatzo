import { useState } from 'react';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { FeedPost, ReportReason } from '@/api/types';
import { t } from '@/i18n';
import { colors, radius, spacing, typography } from '@/theme';

import { PostMedia } from './post-media';


type PostCardProps = {
  post: FeedPost;
  onLike: (post: FeedPost) => Promise<void>;
  onBookmark: (post: FeedPost) => Promise<void>;
  onReport: (post: FeedPost, reason: ReportReason) => Promise<void>;
  onDelete?: (post: FeedPost) => Promise<void>;
  onComments?: (post: FeedPost) => void;
};

const REPORT_REASONS: ReportReason[] = [
  'spam',
  'harassment',
  'hate_or_violence',
  'sexual_content',
  'other',
];

function reportReasonLabel(reason: ReportReason): string {
  switch (reason) {
    case 'spam': return t('reportSpam');
    case 'harassment': return t('reportHarassment');
    case 'hate_or_violence': return t('reportHateOrViolence');
    case 'sexual_content': return t('reportSexualContent');
    case 'other': return t('reportOther');
  }
}

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

export function PostCard({
  post,
  onLike,
  onBookmark,
  onReport,
  onDelete,
  onComments,
}: PostCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [liking, setLiking] = useState(false);
  const [bookmarking, setBookmarking] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const handleLike = async () => {
    setLiking(true);
    try {
      await onLike(post);
    } finally {
      setLiking(false);
    }
  };

  const handleBookmark = async () => {
    setBookmarking(true);
    try {
      await onBookmark(post);
    } finally {
      setBookmarking(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete(post);
      setMenuOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleReport = async (reason: ReportReason) => {
    setReporting(true);
    try {
      await onReport(post, reason);
      setReportOpen(false);
      setMenuOpen(false);
    } catch {
      // The parent surface owns the localized action error.
    } finally {
      setReporting(false);
    }
  };

  const sharePost = async () => {
    const message = post.content.trim()
      ? `${post.content.trim()}\n\nTatzo — https://tatzo.eu/`
      : 'Tatzo — https://tatzo.eu/';
    try {
      await Share.share({ message });
    } catch {
      // Cancelling the native share sheet must not disturb the feed.
    }
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
            <Pressable
              accessibilityRole="button"
              onPress={openProfile}
              style={({ pressed }) => [styles.authorBlock, pressed && styles.pressed]}
            >
              <View style={styles.authorLine}>
                <Text numberOfLines={1} style={styles.author}>{post.author.username}</Text>
                {post.author.is_verified_artist ? (
                  <View accessibilityLabel={t('verified')} style={styles.verifiedBadge}>
                    <Text style={styles.verifiedText}>✓</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.metaLine}>
                {post.author.tag ? <Text style={styles.tag}>@{post.author.tag}</Text> : null}
                <Text style={styles.date}>{formatPostDate(post.created_at)}</Text>
              </View>
            </Pressable>

            {(owned ? Boolean(onDelete) : true) ? (
              <Pressable
                accessibilityLabel={owned ? t('deletePost') : t('reportPost')}
                accessibilityRole="button"
                onPress={() => setMenuOpen(true)}
                style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}
              >
                <Text style={styles.menuText}>⋯</Text>
              </Pressable>
            ) : null}
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
              <Text numberOfLines={expanded ? undefined : 5} style={styles.content}>
                {post.content}
              </Text>
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
            accessibilityState={{ busy: liking, selected: post.is_liked }}
            disabled={liking}
            onPress={() => void handleLike()}
            style={({ pressed }) => [styles.actionButton, pressed && styles.actionPressed]}
          >
            <Text style={[styles.likeIcon, post.is_liked && styles.likeIconActive]}>
              {post.is_liked ? '♥' : '♡'}
            </Text>
            {post.likes_count > 0 ? <Text style={styles.actionCount}>{post.likes_count}</Text> : null}
          </Pressable>

          <Pressable
            accessibilityLabel={`${t('comments')}: ${post.comments_count}`}
            accessibilityRole="button"
            onPress={openComments}
            style={({ pressed }) => [styles.actionButton, pressed && styles.actionPressed]}
          >
            <Text style={[styles.commentIcon, post.disable_comments && styles.disabledIcon]}>
              {post.disable_comments ? '⊘' : '○'}
            </Text>
            {!post.disable_comments && post.comments_count > 0 ? (
              <Text style={styles.actionCount}>{post.comments_count}</Text>
            ) : null}
          </Pressable>

          <Pressable
            accessibilityLabel="Share"
            accessibilityRole="button"
            onPress={() => void sharePost()}
            style={({ pressed }) => [styles.actionButton, pressed && styles.actionPressed]}
          >
            <Text style={styles.shareIcon}>↗</Text>
          </Pressable>
        </View>

        <Pressable
          accessibilityLabel={post.is_bookmarked ? t('saved') : t('bookmark')}
          accessibilityRole="button"
          accessibilityState={{ busy: bookmarking, selected: post.is_bookmarked }}
          disabled={bookmarking}
          onPress={() => void handleBookmark()}
          style={({ pressed }) => [styles.bookmarkButton, pressed && styles.actionPressed]}
        >
          <Text style={[styles.bookmarkIcon, post.is_bookmarked && styles.bookmarkActive]}>
            {post.is_bookmarked ? '◆' : '◇'}
          </Text>
        </Pressable>
      </View>

      <Modal
        animationType="fade"
        onRequestClose={() => !deleting && setMenuOpen(false)}
        transparent
        visible={menuOpen}
      >
        <Pressable style={styles.modalOverlay} onPress={() => !deleting && setMenuOpen(false)}>
          <View accessibilityViewIsModal style={styles.menuSheet}>
            {owned && onDelete ? (
              <Pressable
                accessibilityRole="button"
                disabled={deleting}
                onPress={() => void handleDelete()}
                style={({ pressed }) => [styles.menuAction, pressed && styles.pressed]}
              >
                {deleting ? <ActivityIndicator color={colors.danger} /> : (
                  <Text style={styles.deleteMenuText}>{t('deletePost')}</Text>
                )}
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                disabled={post.is_reported}
                onPress={() => {
                  setMenuOpen(false);
                  setReportOpen(true);
                }}
                style={({ pressed }) => [styles.menuAction, pressed && styles.pressed]}
              >
                <Text style={post.is_reported ? styles.reportedMenuText : styles.menuActionText}>
                  {post.is_reported ? `✓ ${t('reported')}` : t('reportPost')}
                </Text>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="button"
              disabled={deleting}
              onPress={() => setMenuOpen(false)}
              style={({ pressed }) => [styles.menuAction, pressed && styles.pressed]}
            >
              <Text style={styles.cancelMenuText}>{t('cancel')}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => !reporting && setReportOpen(false)}
        transparent
        visible={reportOpen}
      >
        <View style={styles.modalOverlay}>
          <View accessibilityViewIsModal style={styles.reportSheet}>
            <Text style={styles.reportTitle}>{t('reportPost')}</Text>
            <Text style={styles.reportHint}>{t('reportPrompt')}</Text>
            <View style={styles.reasonList}>
              {REPORT_REASONS.map((reason) => (
                <Pressable
                  accessibilityRole="button"
                  disabled={reporting}
                  key={reason}
                  onPress={() => void handleReport(reason)}
                  style={({ pressed }) => [styles.reasonButton, pressed && styles.pressed]}
                >
                  <Text style={styles.reasonText}>{reportReasonLabel(reason)}</Text>
                </Pressable>
              ))}
            </View>
            {reporting ? <ActivityIndicator color={colors.primary} /> : null}
            <Pressable
              accessibilityRole="button"
              disabled={reporting}
              onPress={() => setReportOpen(false)}
              style={({ pressed }) => [styles.cancelReport, pressed && styles.pressed]}
            >
              <Text style={styles.cancelReportText}>{t('cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  post: { width: '100%' },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  messageRowOwned: { flexDirection: 'row-reverse' },
  avatarButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginTop: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  avatarFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundDeep,
    borderWidth: 1,
    borderColor: colors.primaryMuted,
  },
  avatarLetter: { color: colors.primary, fontSize: 14, fontWeight: '900' },
  bubble: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.primary,
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: spacing.sm,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  bubbleOther: { borderTopLeftRadius: 2 },
  bubbleOwned: { borderTopRightRadius: 2 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  authorBlock: { flex: 1, gap: 1 },
  authorLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  author: { color: colors.heading, fontSize: 15, fontWeight: '900', flexShrink: 1 },
  verifiedBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 13, 24, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedText: { color: colors.primary, fontSize: 10, lineHeight: 12, fontWeight: '900' },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  tag: { color: '#064e51', ...typography.caption, fontWeight: '800' },
  date: { color: '#07545b', ...typography.caption },
  menuButton: {
    width: 32,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -4,
    marginRight: -4,
  },
  menuText: { color: '#06474b', fontSize: 24, lineHeight: 24, fontWeight: '900' },
  location: { color: '#064e51', fontSize: 12 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  badge: {
    color: '#00383b',
    borderColor: 'rgba(0, 13, 24, 0.24)',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 10,
    fontWeight: '900',
    overflow: 'hidden',
  },
  adBadge: { color: colors.heading, borderColor: colors.heading },
  contentBlock: { gap: spacing.xs },
  content: { color: '#001014', fontSize: 14, lineHeight: 20 },
  more: { color: colors.heading, fontSize: 12, fontWeight: '900' },
  actions: {
    minHeight: 38,
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionsOther: { paddingLeft: 44 },
  actionsOwned: { paddingRight: 44 },
  actionGroup: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actionButton: {
    minWidth: 30,
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 1,
  },
  actionPressed: { opacity: 0.58, transform: [{ scale: 0.94 }] },
  likeIcon: { color: colors.textMuted, fontSize: 27, lineHeight: 29 },
  likeIconActive: { color: colors.accent },
  commentIcon: { color: colors.primary, fontSize: 22, lineHeight: 24 },
  disabledIcon: { color: colors.textSubtle },
  shareIcon: { color: colors.primary, fontSize: 23, lineHeight: 25, fontWeight: '700' },
  actionCount: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
  bookmarkButton: {
    minWidth: 36,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookmarkIcon: { color: colors.textMuted, fontSize: 20, lineHeight: 22 },
  bookmarkActive: { color: colors.primary },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  menuSheet: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.xs,
  },
  menuAction: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.medium,
  },
  menuActionText: { color: colors.text, ...typography.bodyStrong },
  deleteMenuText: { color: colors.danger, ...typography.bodyStrong },
  reportedMenuText: { color: colors.success, ...typography.bodyStrong },
  cancelMenuText: { color: colors.textMuted, ...typography.bodyStrong },
  reportSheet: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.lg,
    gap: spacing.md,
  },
  reportTitle: { color: colors.text, fontSize: 21, fontWeight: '900' },
  reportHint: { color: colors.textMuted, lineHeight: 20 },
  reasonList: { gap: spacing.xs },
  reasonButton: {
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: colors.backgroundDeep,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.medium,
    paddingHorizontal: spacing.md,
  },
  reasonText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  cancelReport: { minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  cancelReportText: { color: colors.primary, fontWeight: '800' },
  pressed: { opacity: 0.72 },
});

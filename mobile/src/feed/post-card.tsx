import { useState } from 'react';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { FeedPost, ReportReason } from '@/api/types';
import { t } from '@/i18n';
import { colors, radius, spacing } from '@/theme';

import { PostMedia } from './post-media';


type PostCardProps = {
  post: FeedPost;
  onLike: (post: FeedPost) => Promise<void>;
  onBookmark: (post: FeedPost) => Promise<void>;
  onReport: (post: FeedPost, reason: ReportReason) => Promise<void>;
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

export function PostCard({ post, onLike, onBookmark, onReport }: PostCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [liking, setLiking] = useState(false);
  const [bookmarking, setBookmarking] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reporting, setReporting] = useState(false);

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

  const handleReport = async (reason: ReportReason) => {
    setReporting(true);
    try {
      await onReport(post, reason);
      setReportOpen(false);
    } catch {
      // The parent surface displays the localized action error.
    } finally {
      setReporting(false);
    }
  };

  const longContent = post.content.length > 220;

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityLabel={`${t('openProfile')} ${post.author.username}`}
        accessibilityRole="button"
        onPress={() => router.push({
          pathname: '/profile/[username]',
          params: { username: post.author.username },
        })}
        style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
      >
        {post.author.profile_image_url ? (
          <Image source={{ uri: post.author.profile_image_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarLetter}>{post.author.username[0]?.toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.authorBlock}>
          <View style={styles.authorLine}>
            <Text numberOfLines={1} style={styles.author}>{post.author.username}</Text>
            {post.author.is_verified_artist ? (
              <Text accessibilityLabel={t('verified')} style={styles.verified}>✓</Text>
            ) : null}
          </View>
          <View style={styles.metaLine}>
            {post.author.tag ? <Text style={styles.tag}>@{post.author.tag}</Text> : null}
            <Text style={styles.date}>{formatPostDate(post.created_at)}</Text>
          </View>
        </View>
      </Pressable>

      {post.location ? <Text style={styles.location}>⌖ {post.location}</Text> : null}

      {post.is_ad || post.visibility !== 'public' ? (
        <View style={styles.badges}>
          {post.is_ad ? <Text style={[styles.badge, styles.adBadge]}>{t('ad')}</Text> : null}
          {post.visibility === 'followers' ? (
            <Text style={styles.badge}>{t('followersOnly')}</Text>
          ) : null}
          {post.visibility === 'private' ? (
            <Text style={styles.badge}>{t('privatePost')}</Text>
          ) : null}
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

      <View style={styles.actions}>
        <View style={styles.actionGroup}>
          <Pressable
            accessibilityLabel={post.is_liked ? t('unlike') : t('like')}
            accessibilityRole="button"
            accessibilityState={{ busy: liking, selected: post.is_liked }}
            disabled={liking}
            onPress={() => void handleLike()}
            style={({ pressed }) => [
              styles.action,
              post.is_liked && styles.actionLiked,
              pressed && styles.actionPressed,
            ]}
          >
            <Text style={[styles.actionIcon, post.is_liked && styles.likeIconActive]}>
              {post.is_liked ? '♥' : '♡'}
            </Text>
            <Text style={styles.actionText}>{post.likes_count}</Text>
          </Pressable>

          {!post.disable_comments ? (
            <View
              accessibilityLabel={`${t('comments')}: ${post.comments_count}`}
              accessible
              style={styles.action}
            >
              <Text style={styles.commentIcon}>◯</Text>
              <Text style={styles.actionText}>{post.comments_count}</Text>
            </View>
          ) : null}
        </View>

        <Pressable
          accessibilityLabel={post.is_bookmarked ? t('saved') : t('bookmark')}
          accessibilityRole="button"
          accessibilityState={{ busy: bookmarking, selected: post.is_bookmarked }}
          disabled={bookmarking}
          onPress={() => void handleBookmark()}
          style={({ pressed }) => [
            styles.saveAction,
            post.is_bookmarked && styles.saveActionActive,
            pressed && styles.actionPressed,
          ]}
        >
          <Text style={[styles.saveLabel, post.is_bookmarked && styles.saveLabelActive]}>
            {post.is_bookmarked ? t('saved') : t('bookmark')}
          </Text>
        </Pressable>
      </View>

      {!post.is_owned ? (
        <Pressable
          accessibilityLabel={post.is_reported ? t('reported') : t('reportPost')}
          accessibilityRole="button"
          accessibilityState={{ disabled: post.is_reported }}
          disabled={post.is_reported}
          onPress={() => setReportOpen(true)}
          style={({ pressed }) => [
            styles.reportTrigger,
            post.is_reported && styles.reportedTrigger,
            pressed && styles.actionPressed,
          ]}
        >
          <Text style={[styles.reportLabel, post.is_reported && styles.reportedLabel]}>
            {post.is_reported ? `✓ ${t('reported')}` : `⚑ ${t('report')}`}
          </Text>
        </Pressable>
      ) : null}

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
                  style={({ pressed }) => [
                    styles.reasonButton,
                    pressed && styles.actionPressed,
                  ]}
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
              style={({ pressed }) => [styles.cancelReport, pressed && styles.actionPressed]}
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
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.md,
    gap: spacing.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerPressed: { opacity: 0.72 },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  avatarFallback: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryMuted,
  },
  avatarLetter: { color: colors.text, fontSize: 20, fontWeight: '900' },
  authorBlock: { flex: 1, gap: 2 },
  authorLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  author: { color: colors.text, fontSize: 16, fontWeight: '900', flexShrink: 1 },
  verified: {
    color: colors.backgroundDeep,
    backgroundColor: colors.primary,
    width: 17,
    height: 17,
    borderRadius: 9,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '900',
    overflow: 'hidden',
  },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  tag: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  date: { color: colors.textMuted, fontSize: 12 },
  location: { color: colors.textMuted, fontSize: 13, paddingHorizontal: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  badge: {
    color: colors.textMuted,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '800',
    overflow: 'hidden',
  },
  adBadge: { color: colors.accent, borderColor: colors.accent },
  contentBlock: { gap: spacing.xs, paddingHorizontal: 2 },
  content: { color: colors.text, fontSize: 15, lineHeight: 22 },
  more: { color: colors.primary, fontWeight: '800' },
  actions: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionGroup: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  action: {
    minWidth: 58,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.backgroundDeep,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
  },
  actionLiked: { borderColor: colors.accent },
  actionPressed: { opacity: 0.7, transform: [{ scale: 0.96 }] },
  actionIcon: { color: colors.textMuted, fontSize: 24, lineHeight: 26 },
  likeIconActive: { color: colors.accent },
  commentIcon: { color: colors.primary, fontSize: 20, lineHeight: 22 },
  actionText: { color: colors.text, fontWeight: '800' },
  saveAction: {
    minWidth: 72,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundDeep,
    paddingHorizontal: spacing.sm,
  },
  saveActionActive: { borderColor: colors.primary },
  saveLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
  saveLabelActive: { color: colors.primary },
  reportTrigger: {
    alignSelf: 'flex-end',
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
  },
  reportedTrigger: { opacity: 0.74 },
  reportLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
  reportedLabel: { color: colors.success },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 10, 18, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
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
  reportTitle: { color: colors.text, fontSize: 23, fontWeight: '900' },
  reportHint: { color: colors.textMuted, lineHeight: 21 },
  reasonList: { gap: spacing.sm },
  reasonButton: {
    minHeight: 48,
    justifyContent: 'center',
    backgroundColor: colors.backgroundDeep,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.medium,
    paddingHorizontal: spacing.md,
  },
  reasonText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  cancelReport: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  cancelReportText: { color: colors.primary, fontWeight: '800' },
});

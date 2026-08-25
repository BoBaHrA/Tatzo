import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { CommentItem, FeedPost, ReportReason } from '@/api/types';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/button';
import { t } from '@/i18n';
import { colors, radius, spacing, typography } from '@/theme';

import {
  createPostComment,
  deletePostComment,
  fetchCommentReplies,
  fetchPostComments,
  reportComment,
  toggleCommentLike,
  updatePostComment,
} from './comment-api';


type ReplyState = {
  items: CommentItem[];
  nextCursor: string | null;
  loaded: boolean;
  loading: boolean;
  error: string;
};

type CommentsSectionProps = {
  post: FeedPost;
  focusRequest?: number;
  onCountChange: (count: number) => void;
};

type CommentRowProps = {
  comment: CommentItem;
  nested?: boolean;
  commentsEnabled: boolean;
  liking: boolean;
  onDelete: (comment: CommentItem) => void;
  onEdit: (comment: CommentItem) => void;
  onLike: (comment: CommentItem) => void;
  onReply?: (comment: CommentItem) => void;
  onReport: (comment: CommentItem) => void;
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

function formatCommentDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function mergeUnique(current: CommentItem[], incoming: CommentItem[]): CommentItem[] {
  const known = new Set(current.map((comment) => comment.id));
  return [...current, ...incoming.filter((comment) => !known.has(comment.id))];
}

function CommentRow({
  comment,
  nested = false,
  commentsEnabled,
  liking,
  onDelete,
  onEdit,
  onLike,
  onReply,
  onReport,
}: CommentRowProps) {
  const openProfile = () => router.push({
    pathname: '/profile/[username]',
    params: { username: comment.author.username },
  });

  return (
    <View style={[styles.commentRow, nested && styles.replyRow]}>
      <Pressable
        accessibilityLabel={`${t('openProfile')} ${comment.author.username}`}
        accessibilityRole="button"
        onPress={openProfile}
        style={({ pressed }) => [styles.avatarButton, nested && styles.replyAvatarButton, pressed && styles.pressed]}
      >
        {comment.author.profile_image_url ? (
          <Image
            source={{ uri: comment.author.profile_image_url }}
            style={[styles.avatar, nested && styles.replyAvatar]}
          />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback, nested && styles.replyAvatar]}>
            <Text style={styles.avatarLetter}>{comment.author.username[0]?.toUpperCase()}</Text>
          </View>
        )}
      </Pressable>

      <View style={styles.commentMain}>
        <View style={styles.commentBubble}>
          <Pressable
            accessibilityRole="button"
            onPress={openProfile}
            style={({ pressed }) => [styles.commentHeader, pressed && styles.pressed]}
          >
            <View style={styles.authorLine}>
              <Text numberOfLines={1} style={styles.authorName}>{comment.author.username}</Text>
              {comment.author.is_verified_artist ? (
                <View style={styles.verifiedBadge}>
                  <Text style={styles.verifiedText}>✓</Text>
                </View>
              ) : null}
              {comment.is_post_owner ? <Text style={styles.ownerBadge}>{t('postAuthorBadge')}</Text> : null}
            </View>
            <Text style={styles.commentDate}>{formatCommentDate(comment.created_at)}</Text>
          </Pressable>
          <Text style={styles.commentContent}>{comment.content}</Text>
        </View>

        <View style={styles.commentActions}>
          <Pressable
            accessibilityLabel={comment.is_liked ? t('unlike') : t('like')}
            accessibilityRole="button"
            accessibilityState={{ busy: liking, selected: comment.is_liked }}
            disabled={liking}
            onPress={() => onLike(comment)}
            style={({ pressed }) => [styles.smallAction, pressed && styles.pressed]}
          >
            <Text style={[styles.likeAction, comment.is_liked && styles.likeActionActive]}>
              {comment.is_liked ? '♥' : '♡'}
            </Text>
            {comment.likes_count > 0 ? <Text style={styles.actionCount}>{comment.likes_count}</Text> : null}
          </Pressable>

          {!nested && commentsEnabled && onReply ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => onReply(comment)}
              style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}
            >
              <Text style={styles.textActionLabel}>{t('reply')}</Text>
            </Pressable>
          ) : null}

          {comment.is_owned ? (
            <>
              <Pressable
                accessibilityRole="button"
                onPress={() => onEdit(comment)}
                style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}
              >
                <Text style={styles.textActionLabel}>{t('editComment')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => onDelete(comment)}
                style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}
              >
                <Text style={styles.deleteActionLabel}>{t('delete')}</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              accessibilityRole="button"
              disabled={comment.is_reported}
              onPress={() => onReport(comment)}
              style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}
            >
              <Text style={comment.is_reported ? styles.reportedLabel : styles.textActionLabel}>
                {comment.is_reported ? `✓ ${t('commentReported')}` : t('report')}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

export function CommentsSectionV2({
  post,
  focusRequest = 0,
  onCountChange,
}: CommentsSectionProps) {
  const { request } = useAuth();
  const inputRef = useRef<TextInput>(null);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [replies, setReplies] = useState<Record<number, ReplyState>>({});
  const [commentsEnabled, setCommentsEnabled] = useState(!post.disable_comments);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [content, setContent] = useState('');
  const [replyingTo, setReplyingTo] = useState<CommentItem | null>(null);
  const [sending, setSending] = useState(false);
  const [likingId, setLikingId] = useState<number | null>(null);
  const [editTarget, setEditTarget] = useState<CommentItem | null>(null);
  const [editContent, setEditContent] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [reportTarget, setReportTarget] = useState<CommentItem | null>(null);
  const [reporting, setReporting] = useState(false);

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const page = await fetchPostComments(request, post.id);
      setComments(page.results);
      setReplies({});
      setNextCursor(page.next_cursor);
      setCommentsEnabled(page.comments_enabled);
      onCountChange(page.comments_count);
    } catch {
      setLoadError(t('commentLoadError'));
    } finally {
      setLoading(false);
    }
  }, [onCountChange, post.id, request]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  useEffect(() => {
    if (focusRequest > 0 && commentsEnabled) {
      const handle = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(handle);
    }
    return undefined;
  }, [commentsEnabled, focusRequest]);

  const updateEverywhere = (commentId: number, update: (item: CommentItem) => CommentItem) => {
    setComments((current) => current.map((item) => item.id === commentId ? update(item) : item));
    setReplies((current) => Object.fromEntries(
      Object.entries(current).map(([rootId, state]) => [
        rootId,
        {
          ...state,
          items: state.items.map((item) => item.id === commentId ? update(item) : item),
        },
      ]),
    ));
  };

  const loadMoreComments = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setActionError('');
    try {
      const page = await fetchPostComments(request, post.id, nextCursor);
      setComments((current) => mergeUnique(current, page.results));
      setNextCursor(page.next_cursor);
      setCommentsEnabled(page.comments_enabled);
      onCountChange(page.comments_count);
    } catch {
      setActionError(t('commentLoadError'));
    } finally {
      setLoadingMore(false);
    }
  };

  const loadReplies = async (rootId: number, cursor?: string | null) => {
    setReplies((current) => ({
      ...current,
      [rootId]: {
        items: current[rootId]?.items ?? [],
        nextCursor: current[rootId]?.nextCursor ?? null,
        loaded: current[rootId]?.loaded ?? false,
        loading: true,
        error: '',
      },
    }));
    try {
      const page = await fetchCommentReplies(request, rootId, cursor);
      setReplies((current) => ({
        ...current,
        [rootId]: {
          items: cursor ? mergeUnique(current[rootId]?.items ?? [], page.results) : page.results,
          nextCursor: page.next_cursor,
          loaded: true,
          loading: false,
          error: '',
        },
      }));
      setComments((current) => current.map((item) => (
        item.id === rootId ? { ...item, replies_count: page.replies_count } : item
      )));
    } catch {
      setReplies((current) => ({
        ...current,
        [rootId]: {
          items: current[rootId]?.items ?? [],
          nextCursor: current[rootId]?.nextCursor ?? null,
          loaded: current[rootId]?.loaded ?? false,
          loading: false,
          error: t('commentLoadError'),
        },
      }));
    }
  };

  const beginReply = (comment: CommentItem) => {
    setReplyingTo(comment);
    setActionError('');
    inputRef.current?.focus();
  };

  const send = async () => {
    const trimmed = content.trim();
    if (!trimmed) {
      setActionError(t('commentEmpty'));
      return;
    }
    setSending(true);
    setActionError('');
    try {
      const result = await createPostComment(request, post.id, trimmed, replyingTo?.id);
      if (replyingTo) {
        const rootId = replyingTo.id;
        setReplies((current) => {
          const state = current[rootId];
          return {
            ...current,
            [rootId]: {
              items: [result.comment, ...(state?.items ?? []).filter((item) => item.id !== result.comment.id)],
              nextCursor: state?.nextCursor ?? null,
              loaded: true,
              loading: false,
              error: '',
            },
          };
        });
        setComments((current) => current.map((item) => (
          item.id === rootId ? { ...item, replies_count: item.replies_count + 1 } : item
        )));
      } else {
        setComments((current) => [result.comment, ...current.filter((item) => item.id !== result.comment.id)]);
      }
      setContent('');
      setReplyingTo(null);
      onCountChange(result.comments_count);
    } catch {
      setActionError(t('commentSendError'));
    } finally {
      setSending(false);
    }
  };

  const like = async (comment: CommentItem) => {
    setLikingId(comment.id);
    setActionError('');
    try {
      const result = await toggleCommentLike(request, comment.id);
      updateEverywhere(comment.id, (item) => ({
        ...item,
        is_liked: result.liked,
        likes_count: result.likes_count,
      }));
    } catch {
      setActionError(t('commentLikeError'));
    } finally {
      setLikingId(null);
    }
  };

  const beginEdit = (comment: CommentItem) => {
    setEditTarget(comment);
    setEditContent(comment.content);
    setActionError('');
  };

  const saveEdit = async () => {
    if (!editTarget || !editContent.trim()) return;
    setSavingEdit(true);
    setActionError('');
    try {
      const result = await updatePostComment(request, editTarget.id, editContent.trim());
      updateEverywhere(editTarget.id, () => result.comment);
      setEditTarget(null);
      setEditContent('');
    } catch {
      setActionError(t('commentSaveError'));
    } finally {
      setSavingEdit(false);
    }
  };

  const remove = async (comment: CommentItem) => {
    setActionError('');
    try {
      const result = await deletePostComment(request, comment.id);
      if (result.parent_id) {
        setReplies((current) => {
          const rootState = current[result.parent_id as number];
          if (!rootState) return current;
          return {
            ...current,
            [result.parent_id as number]: {
              ...rootState,
              items: rootState.items.filter((item) => item.id !== result.id),
            },
          };
        });
        setComments((current) => current.map((item) => (
          item.id === result.parent_id
            ? { ...item, replies_count: Math.max(0, item.replies_count - 1) }
            : item
        )));
      } else {
        setComments((current) => current.filter((item) => item.id !== result.id));
        setReplies((current) => {
          const next = { ...current };
          delete next[result.id];
          return next;
        });
      }
      onCountChange(result.comments_count);
    } catch {
      setActionError(t('commentDeleteError'));
    }
  };

  const confirmDelete = (comment: CommentItem) => {
    Alert.alert(t('deleteComment'), t('deleteCommentConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: () => void remove(comment) },
    ]);
  };

  const submitReport = async (reason: ReportReason) => {
    if (!reportTarget) return;
    setReporting(true);
    setActionError('');
    try {
      await reportComment(request, reportTarget.id, reason);
      updateEverywhere(reportTarget.id, (item) => ({ ...item, is_reported: true }));
      setReportTarget(null);
    } catch {
      setActionError(t('commentReportError'));
    } finally {
      setReporting(false);
    }
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>{t('commentSectionTitle')}</Text>
        <Text style={styles.count}>{post.comments_count}</Text>
      </View>

      {!commentsEnabled ? (
        <View style={styles.disabledBlock}>
          <Text style={styles.disabledTitle}>{t('commentsDisabled')}</Text>
          <Text style={styles.muted}>{t('commentsDisabledHint')}</Text>
        </View>
      ) : (
        <View style={styles.composer}>
          {replyingTo ? (
            <View style={styles.replyBanner}>
              <Text numberOfLines={1} style={styles.replyBannerText}>
                {t('replyingTo')} @{replyingTo.author.username}
              </Text>
              <Pressable accessibilityRole="button" onPress={() => setReplyingTo(null)}>
                <Text style={styles.cancelReply}>×</Text>
              </Pressable>
            </View>
          ) : null}
          <TextInput
            maxLength={1000}
            multiline
            onChangeText={setContent}
            placeholder={replyingTo ? t('replyPlaceholder') : t('commentPlaceholder')}
            placeholderTextColor={colors.textSubtle}
            ref={inputRef}
            style={styles.composerInput}
            textAlignVertical="top"
            value={content}
          />
          <View style={styles.composerFooter}>
            <Text style={styles.characterCount}>{content.length}/1000</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: sending, disabled: !content.trim() }}
              disabled={sending || !content.trim()}
              onPress={() => void send()}
              style={({ pressed }) => [
                styles.sendButton,
                (!content.trim() || sending) && styles.sendButtonDisabled,
                pressed && styles.pressed,
              ]}
            >
              {sending ? <ActivityIndicator color={colors.backgroundDeep} size="small" /> : (
                <Text style={styles.sendButtonText}>{t('sendComment')}</Text>
              )}
            </Pressable>
          </View>
        </View>
      )}

      {actionError ? <Text style={styles.inlineError}>{actionError}</Text> : null}

      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.muted}>{t('loadingComments')}</Text>
        </View>
      ) : loadError ? (
        <View style={styles.emptyBlock}>
          <Text style={styles.emptyTitle}>{t('commentsUnavailable')}</Text>
          <Text style={styles.muted}>{loadError}</Text>
          <Button label={t('retry')} onPress={() => void loadFirstPage()} size="compact" />
        </View>
      ) : comments.length === 0 ? (
        <View style={styles.emptyBlock}>
          <Text style={styles.emptyTitle}>{t('noComments')}</Text>
          <Text style={styles.muted}>{t('noCommentsHint')}</Text>
        </View>
      ) : (
        <View style={styles.commentList}>
          {comments.map((comment) => {
            const replyState = replies[comment.id];
            return (
              <View key={comment.id} style={styles.thread}>
                <CommentRow
                  comment={comment}
                  commentsEnabled={commentsEnabled}
                  liking={likingId === comment.id}
                  onDelete={confirmDelete}
                  onEdit={beginEdit}
                  onLike={(item) => void like(item)}
                  onReply={beginReply}
                  onReport={setReportTarget}
                />

                {replyState?.items.length ? (
                  <View style={styles.replyList}>
                    {replyState.items.map((reply) => (
                      <CommentRow
                        comment={reply}
                        commentsEnabled={commentsEnabled}
                        key={reply.id}
                        liking={likingId === reply.id}
                        nested
                        onDelete={confirmDelete}
                        onEdit={beginEdit}
                        onLike={(item) => void like(item)}
                        onReport={setReportTarget}
                      />
                    ))}
                  </View>
                ) : null}

                {comment.replies_count > 0 ? (
                  <View style={styles.replyControls}>
                    {!replyState?.loaded ? (
                      <Pressable
                        accessibilityRole="button"
                        disabled={replyState?.loading}
                        onPress={() => void loadReplies(comment.id)}
                        style={({ pressed }) => [styles.replyControl, pressed && styles.pressed]}
                      >
                        <Text style={styles.replyControlText}>
                          {replyState?.loading ? t('loadingReplies') : `${t('viewReplies')} (${comment.replies_count})`}
                        </Text>
                      </Pressable>
                    ) : replyState.nextCursor ? (
                      <Pressable
                        accessibilityRole="button"
                        disabled={replyState.loading}
                        onPress={() => void loadReplies(comment.id, replyState.nextCursor)}
                        style={({ pressed }) => [styles.replyControl, pressed && styles.pressed]}
                      >
                        <Text style={styles.replyControlText}>
                          {replyState.loading ? t('loadingReplies') : t('loadMoreReplies')}
                        </Text>
                      </Pressable>
                    ) : null}
                    {replyState?.error ? <Text style={styles.replyError}>{replyState.error}</Text> : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      {nextCursor ? (
        <Button
          label={t('loadMoreComments')}
          loading={loadingMore}
          onPress={() => void loadMoreComments()}
          size="compact"
          variant="secondary"
        />
      ) : null}

      <Modal
        animationType="fade"
        onRequestClose={() => !savingEdit && setEditTarget(null)}
        transparent
        visible={editTarget !== null}
      >
        <View style={styles.modalOverlay}>
          <View accessibilityViewIsModal style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('commentEditTitle')}</Text>
            <TextInput
              maxLength={1000}
              multiline
              onChangeText={setEditContent}
              placeholderTextColor={colors.textMuted}
              style={styles.editInput}
              textAlignVertical="top"
              value={editContent}
            />
            <Text style={styles.characterCount}>{editContent.length}/1000</Text>
            <View style={styles.modalButtons}>
              <Button label={t('cancel')} onPress={() => setEditTarget(null)} size="compact" variant="secondary" />
              <Button disabled={!editContent.trim()} label={t('save')} loading={savingEdit} onPress={() => void saveEdit()} size="compact" />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => !reporting && setReportTarget(null)}
        transparent
        visible={reportTarget !== null}
      >
        <View style={styles.modalOverlay}>
          <View accessibilityViewIsModal style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('reportComment')}</Text>
            <Text style={styles.muted}>{t('reportCommentPrompt')}</Text>
            {REPORT_REASONS.map((reason) => (
              <Pressable
                accessibilityRole="button"
                disabled={reporting}
                key={reason}
                onPress={() => void submitReport(reason)}
                style={({ pressed }) => [styles.reasonButton, pressed && styles.pressed]}
              >
                <Text style={styles.reasonText}>{reportReasonLabel(reason)}</Text>
              </Pressable>
            ))}
            {reporting ? <ActivityIndicator color={colors.primary} /> : null}
            <Button label={t('cancel')} onPress={() => setReportTarget(null)} size="compact" variant="secondary" />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionTitle: { color: colors.text, ...typography.sectionTitle },
  count: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: 12,
    color: colors.backgroundDeep,
    backgroundColor: colors.primary,
    fontSize: 11,
    lineHeight: 24,
    fontWeight: '900',
    textAlign: 'center',
    overflow: 'hidden',
  },
  composer: {
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  replyBanner: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.medium,
    backgroundColor: colors.primarySoft,
  },
  replyBannerText: { color: colors.primary, ...typography.caption, fontWeight: '800', flex: 1 },
  cancelReply: { color: colors.textMuted, fontSize: 20, lineHeight: 22 },
  composerInput: {
    minHeight: 74,
    maxHeight: 150,
    color: colors.text,
    backgroundColor: colors.backgroundDeep,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.medium,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    lineHeight: 20,
  },
  composerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingLeft: spacing.xs,
  },
  characterCount: { color: colors.textSubtle, ...typography.caption },
  sendButton: {
    minWidth: 88,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  sendButtonDisabled: { opacity: 0.42 },
  sendButtonText: { color: colors.backgroundDeep, ...typography.bodyStrong },
  disabledBlock: {
    padding: spacing.md,
    borderRadius: radius.medium,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  disabledTitle: { color: colors.text, ...typography.bodyStrong },
  loadingState: { minHeight: 100, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  emptyBlock: { paddingVertical: spacing.lg, gap: spacing.xs, alignItems: 'center' },
  emptyTitle: { color: colors.text, ...typography.bodyStrong, textAlign: 'center' },
  muted: { color: colors.textMuted, ...typography.body },
  inlineError: { color: colors.danger, ...typography.caption, paddingHorizontal: spacing.xs },
  commentList: { gap: spacing.md },
  thread: { gap: spacing.xs },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  replyRow: { gap: spacing.xs },
  avatarButton: { width: 34, height: 34, borderRadius: 17 },
  replyAvatarButton: { width: 28, height: 28, borderRadius: 14 },
  avatar: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.borderStrong },
  replyAvatar: { width: 28, height: 28, borderRadius: 14 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceInteractive },
  avatarLetter: { color: colors.primary, fontSize: 12, fontWeight: '900' },
  commentMain: { flex: 1, minWidth: 0, gap: 2 },
  commentBubble: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radius.medium,
    borderTopLeftRadius: 4,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  commentHeader: { gap: 1 },
  authorLine: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  authorName: { color: colors.text, fontSize: 13, lineHeight: 17, fontWeight: '900', maxWidth: '68%' },
  verifiedBadge: { width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  verifiedText: { color: colors.backgroundDeep, fontSize: 9, lineHeight: 10, fontWeight: '900' },
  ownerBadge: { color: colors.primary, fontSize: 8, lineHeight: 12, fontWeight: '900', letterSpacing: 0.6 },
  commentDate: { color: colors.textSubtle, fontSize: 10, lineHeight: 13 },
  commentContent: { color: colors.text, fontSize: 13, lineHeight: 19 },
  commentActions: { minHeight: 30, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  smallAction: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 3 },
  likeAction: { color: colors.textMuted, fontSize: 17, lineHeight: 19 },
  likeActionActive: { color: colors.accent },
  actionCount: { color: colors.textSubtle, fontSize: 10, fontWeight: '800' },
  textAction: { minHeight: 30, justifyContent: 'center', paddingHorizontal: 4 },
  textActionLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },
  deleteActionLabel: { color: colors.danger, fontSize: 10, fontWeight: '800' },
  reportedLabel: { color: colors.success, fontSize: 10, fontWeight: '800' },
  replyList: { marginLeft: 42, paddingLeft: spacing.sm, borderLeftWidth: 1, borderLeftColor: colors.borderStrong, gap: spacing.sm },
  replyControls: { marginLeft: 42, gap: 2 },
  replyControl: { alignSelf: 'flex-start', minHeight: 30, justifyContent: 'center', paddingHorizontal: spacing.xs },
  replyControlText: { color: colors.primary, fontSize: 10, fontWeight: '900' },
  replyError: { color: colors.danger, fontSize: 10 },
  modalOverlay: { flex: 1, justifyContent: 'center', backgroundColor: colors.overlay, padding: spacing.lg },
  modalCard: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.md,
    gap: spacing.sm,
  },
  modalTitle: { color: colors.text, ...typography.sectionTitle },
  editInput: {
    minHeight: 104,
    color: colors.text,
    backgroundColor: colors.backgroundDeep,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.medium,
    padding: spacing.sm,
    fontSize: 14,
  },
  modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  reasonButton: { minHeight: 42, justifyContent: 'center', borderRadius: radius.medium, paddingHorizontal: spacing.md, backgroundColor: colors.surfaceSoft },
  reasonText: { color: colors.text, ...typography.bodyStrong },
  pressed: { opacity: 0.68 },
});

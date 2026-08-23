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
import { colors, radius, spacing } from '@/theme';

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

type CommentCardProps = {
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

function CommentCard({
  comment,
  nested = false,
  commentsEnabled,
  liking,
  onDelete,
  onEdit,
  onLike,
  onReply,
  onReport,
}: CommentCardProps) {
  return (
    <View style={[styles.commentCard, nested && styles.replyCard]}>
      <Pressable
        accessibilityLabel={`${t('openProfile')} ${comment.author.username}`}
        accessibilityRole="button"
        onPress={() => router.push({
          pathname: '/profile/[username]',
          params: { username: comment.author.username },
        })}
        style={({ pressed }) => [styles.authorRow, pressed && styles.pressed]}
      >
        {comment.author.profile_image_url ? (
          <Image
            source={{ uri: comment.author.profile_image_url }}
            style={[styles.avatar, nested && styles.replyAvatar]}
          />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback, nested && styles.replyAvatar]}>
            <Text style={styles.avatarLetter}>
              {comment.author.username[0]?.toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.authorText}>
          <View style={styles.authorNameRow}>
            <Text numberOfLines={1} style={styles.authorName}>
              {comment.author.username}
            </Text>
            {comment.author.is_verified_artist ? <Text style={styles.verified}>✓</Text> : null}
            {comment.is_post_owner ? (
              <Text style={styles.ownerBadge}>{t('postAuthorBadge')}</Text>
            ) : null}
          </View>
          <Text style={styles.commentDate}>{formatCommentDate(comment.created_at)}</Text>
        </View>
      </Pressable>

      <Text style={styles.commentContent}>{comment.content}</Text>

      <View style={styles.commentActions}>
        <Pressable
          accessibilityLabel={comment.is_liked ? t('unlike') : t('like')}
          accessibilityRole="button"
          accessibilityState={{ busy: liking, selected: comment.is_liked }}
          disabled={liking}
          onPress={() => onLike(comment)}
          style={({ pressed }) => [styles.smallAction, pressed && styles.pressed]}
        >
          <Text style={[styles.smallActionText, comment.is_liked && styles.likedText]}>
            {comment.is_liked ? '♥' : '♡'} {comment.likes_count}
          </Text>
        </Pressable>

        {!nested && commentsEnabled && onReply ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onReply(comment)}
            style={({ pressed }) => [styles.smallAction, pressed && styles.pressed]}
          >
            <Text style={styles.smallActionText}>{t('reply')}</Text>
          </Pressable>
        ) : null}

        {comment.is_owned ? (
          <>
            <Pressable
              accessibilityRole="button"
              onPress={() => onEdit(comment)}
              style={({ pressed }) => [styles.smallAction, pressed && styles.pressed]}
            >
              <Text style={styles.smallActionText}>{t('editComment')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => onDelete(comment)}
              style={({ pressed }) => [styles.smallAction, pressed && styles.pressed]}
            >
              <Text style={styles.deleteActionText}>{t('delete')}</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            disabled={comment.is_reported}
            onPress={() => onReport(comment)}
            style={({ pressed }) => [styles.smallAction, pressed && styles.pressed]}
          >
            <Text style={comment.is_reported ? styles.reportedText : styles.smallActionText}>
              {comment.is_reported ? `✓ ${t('commentReported')}` : t('report')}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function CommentsSection({
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
    setComments((current) => current.map((item) => (
      item.id === commentId ? update(item) : item
    )));
    setReplies((current) => Object.fromEntries(
      Object.entries(current).map(([rootId, state]) => [
        rootId,
        {
          ...state,
          items: state.items.map((item) => (
            item.id === commentId ? update(item) : item
          )),
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
          items: cursor
            ? mergeUnique(current[rootId]?.items ?? [], page.results)
            : page.results,
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
      const result = await createPostComment(
        request,
        post.id,
        trimmed,
        replyingTo?.id,
      );
      if (replyingTo) {
        const rootId = replyingTo.id;
        setReplies((current) => {
          const state = current[rootId];
          return {
            ...current,
            [rootId]: {
              items: [
                result.comment,
                ...(state?.items ?? []).filter((item) => item.id !== result.comment.id),
              ],
              nextCursor: state?.nextCursor ?? null,
              loaded: state?.loaded ?? false,
              loading: false,
              error: '',
            },
          };
        });
        setComments((current) => current.map((item) => (
          item.id === rootId
            ? { ...item, replies_count: item.replies_count + 1 }
            : item
        )));
      } else {
        setComments((current) => [
          result.comment,
          ...current.filter((item) => item.id !== result.comment.id),
        ]);
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
      {
        text: t('delete'),
        style: 'destructive',
        onPress: () => void remove(comment),
      },
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
        <View style={styles.sectionHeadingText}>
          <Text style={styles.eyebrow}>TATZO COMMUNITY</Text>
          <Text style={styles.sectionTitle}>{t('commentSectionTitle')}</Text>
        </View>
        <Text style={styles.countBadge}>{post.comments_count}</Text>
      </View>

      {!commentsEnabled ? (
        <View style={styles.disabledCard}>
          <Text style={styles.disabledTitle}>{t('commentsDisabled')}</Text>
          <Text style={styles.muted}>{t('commentsDisabledHint')}</Text>
        </View>
      ) : (
        <View style={styles.composerCard}>
          {replyingTo ? (
            <View style={styles.replyBanner}>
              <Text numberOfLines={1} style={styles.replyBannerText}>
                {t('replyingTo')} @{replyingTo.author.username}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setReplyingTo(null)}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Text style={styles.cancelReply}>{t('cancelReply')}</Text>
              </Pressable>
            </View>
          ) : null}
          <TextInput
            maxLength={1000}
            multiline
            onChangeText={setContent}
            placeholder={replyingTo ? t('replyPlaceholder') : t('commentPlaceholder')}
            placeholderTextColor={colors.textMuted}
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
              {sending ? (
                <ActivityIndicator color={colors.backgroundDeep} size="small" />
              ) : (
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
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{t('commentsUnavailable')}</Text>
          <Text style={styles.muted}>{loadError}</Text>
          <Button label={t('retry')} onPress={() => void loadFirstPage()} />
        </View>
      ) : comments.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{t('noComments')}</Text>
          <Text style={styles.muted}>{t('noCommentsHint')}</Text>
        </View>
      ) : (
        <View style={styles.commentList}>
          {comments.map((comment) => {
            const replyState = replies[comment.id];
            return (
              <View key={comment.id} style={styles.thread}>
                <CommentCard
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
                      <CommentCard
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
                          {replyState?.loading
                            ? t('loadingReplies')
                            : `${t('viewReplies')} (${comment.replies_count})`}
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
              <Button
                label={t('cancel')}
                onPress={() => setEditTarget(null)}
                variant="secondary"
              />
              <Button
                disabled={!editContent.trim()}
                label={t('save')}
                loading={savingEdit}
                onPress={() => void saveEdit()}
              />
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
            <Button
              label={t('cancel')}
              onPress={() => setReportTarget(null)}
              variant="secondary"
            />
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
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionHeadingText: { flex: 1, gap: 3 },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  sectionTitle: { color: colors.text, fontSize: 24, fontWeight: '900' },
  countBadge: {
    minWidth: 38,
    height: 38,
    borderRadius: 19,
    color: colors.backgroundDeep,
    backgroundColor: colors.primary,
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
    textAlignVertical: 'center',
    paddingTop: 9,
    overflow: 'hidden',
  },
  composerCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.md,
    gap: spacing.sm,
  },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.medium,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  replyBannerText: { color: colors.text, fontSize: 12, fontWeight: '800', flex: 1 },
  cancelReply: { color: colors.primary, fontSize: 12, fontWeight: '900' },
  composerInput: {
    minHeight: 96,
    maxHeight: 180,
    color: colors.text,
    backgroundColor: colors.backgroundDeep,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.medium,
    padding: spacing.sm,
    fontSize: 15,
    lineHeight: 21,
  },
  composerFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  characterCount: { color: colors.textMuted, fontSize: 11, textAlign: 'right' },
  sendButton: {
    minWidth: 118,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
  },
  sendButtonDisabled: { opacity: 0.45 },
  sendButtonText: { color: colors.backgroundDeep, fontWeight: '900' },
  disabledCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.md,
    gap: spacing.xs,
  },
  disabledTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  loadingState: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  emptyCard: {
    alignItems: 'stretch',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  muted: { color: colors.textMuted, lineHeight: 20 },
  inlineError: {
    color: colors.danger,
    backgroundColor: colors.surface,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.medium,
    padding: spacing.sm,
  },
  commentList: { gap: spacing.md },
  thread: { gap: spacing.xs },
  commentCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.md,
    gap: spacing.sm,
  },
  replyCard: { borderRadius: radius.medium, backgroundColor: colors.backgroundDeep },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 38, height: 38, borderRadius: 19 },
  replyAvatar: { width: 32, height: 32, borderRadius: 16 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryMuted },
  avatarLetter: { color: colors.text, fontWeight: '900' },
  authorText: { flex: 1, gap: 2 },
  authorNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  authorName: { color: colors.text, fontSize: 14, fontWeight: '900', maxWidth: '62%' },
  verified: { color: colors.primary, fontWeight: '900' },
  ownerBadge: {
    color: colors.primary,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 9,
    fontWeight: '900',
    overflow: 'hidden',
  },
  commentDate: { color: colors.textMuted, fontSize: 11 },
  commentContent: { color: colors.text, fontSize: 14, lineHeight: 20 },
  commentActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  smallAction: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 8 },
  smallActionText: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
  likedText: { color: colors.accent },
  deleteActionText: { color: colors.danger, fontSize: 11, fontWeight: '800' },
  reportedText: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  replyList: { marginLeft: spacing.md, paddingLeft: spacing.sm, borderLeftColor: colors.primaryMuted, borderLeftWidth: 2, gap: spacing.xs },
  replyControls: { marginLeft: spacing.lg, gap: 4 },
  replyControl: { alignSelf: 'flex-start', minHeight: 34, justifyContent: 'center', paddingHorizontal: spacing.xs },
  replyControlText: { color: colors.primary, fontSize: 12, fontWeight: '900' },
  replyError: { color: colors.danger, fontSize: 11 },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 7, 13, 0.88)',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  modalTitle: { color: colors.text, fontSize: 21, fontWeight: '900' },
  editInput: {
    minHeight: 120,
    color: colors.text,
    backgroundColor: colors.backgroundDeep,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.medium,
    padding: spacing.sm,
    fontSize: 15,
  },
  modalButtons: { gap: spacing.sm },
  reasonButton: {
    minHeight: 44,
    justifyContent: 'center',
    backgroundColor: colors.backgroundDeep,
    borderRadius: radius.medium,
    borderColor: colors.border,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
  },
  reasonText: { color: colors.text, fontWeight: '800' },
  pressed: { opacity: 0.7 },
});

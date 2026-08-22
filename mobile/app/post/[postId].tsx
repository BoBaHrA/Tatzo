import { useCallback, useEffect, useState } from 'react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '@/api/client';
import type { FeedPost, ReportReason } from '@/api/types';
import { useAuth } from '@/auth/auth-context';
import { BrandHeader } from '@/components/brand-header';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { CommentsSection } from '@/comments/comments-section';
import {
  fetchFeedPost,
  reportFeedPost,
  toggleFeedBookmark,
  toggleFeedLike,
} from '@/feed/feed-api';
import { PostCard } from '@/feed/post-card';
import { t } from '@/i18n';
import { deletePost } from '@/publishing/publishing-api';
import { colors, radius, spacing } from '@/theme';


export default function PostDetailScreen() {
  const params = useLocalSearchParams<{ postId?: string | string[] }>();
  const rawId = Array.isArray(params.postId) ? params.postId[0] : params.postId;
  const postId = Number(rawId);
  const { request, status } = useAuth();
  const [post, setPost] = useState<FeedPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [commentFocusRequest, setCommentFocusRequest] = useState(0);

  const load = useCallback(async () => {
    if (status !== 'authenticated') return;
    if (!Number.isInteger(postId) || postId <= 0) {
      setLoadError(t('postLoadError'));
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      setPost(await fetchFeedPost(request, postId));
    } catch (error) {
      setPost(null);
      setLoadError(
        error instanceof ApiError && error.status === 404
          ? t('postLoadError')
          : t('feedError'),
      );
    } finally {
      setLoading(false);
    }
  }, [postId, request, status]);

  useEffect(() => {
    void load();
  }, [load]);

  if (status === 'anonymous') return <Redirect href="/(auth)/login" />;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/home');
  };

  const like = async (current: FeedPost) => {
    setActionError('');
    try {
      const result = await toggleFeedLike(request, current.id);
      setPost((value) => value ? {
        ...value,
        is_liked: result.liked,
        likes_count: result.likes_count,
      } : value);
    } catch {
      setActionError(t('feedActionError'));
    }
  };

  const bookmark = async (current: FeedPost) => {
    setActionError('');
    try {
      const result = await toggleFeedBookmark(request, current.id);
      setPost((value) => value ? { ...value, is_bookmarked: result.bookmarked } : value);
    } catch {
      setActionError(t('feedActionError'));
    }
  };

  const report = async (current: FeedPost, reason: ReportReason) => {
    setActionError('');
    try {
      await reportFeedPost(request, current.id, reason);
      setPost((value) => value ? { ...value, is_reported: true } : value);
    } catch (error) {
      setActionError(t('reportError'));
      throw error;
    }
  };

  const remove = async (current: FeedPost) => {
    setDeleting(true);
    setActionError('');
    try {
      await deletePost(request, current.id);
      router.replace('/(tabs)/home');
    } catch {
      setActionError(t('deletePostError'));
    } finally {
      setDeleting(false);
    }
  };

  const confirmDelete = (current: FeedPost) => {
    Alert.alert(t('deletePost'), t('deletePostConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: () => void remove(current),
      },
    ]);
  };

  const updateCommentCount = useCallback((commentsCount: number) => {
    setPost((current) => current ? {
      ...current,
      comments_count: commentsCount,
    } : current);
  }, []);

  return (
    <Screen contentStyle={styles.screen}>
      <Pressable
        accessibilityLabel={t('back')}
        accessibilityRole="button"
        onPress={goBack}
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
      >
        <Text style={styles.backText}>‹ {t('back')}</Text>
      </Pressable>
      <BrandHeader />
      <Text style={styles.title}>{t('postDetailTitle')}</Text>
      {actionError ? <Text style={styles.inlineError}>{actionError}</Text> : null}

      {loading || status === 'loading' ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.muted}>{t('loadingPost')}</Text>
        </View>
      ) : post ? (
        <View style={styles.postBlock}>
          <PostCard
            onBookmark={bookmark}
            onComments={() => setCommentFocusRequest((current) => current + 1)}
            onLike={like}
            onReport={report}
            post={post}
          />
          {post.is_owned ? (
            <Button
              label={t('deletePost')}
              loading={deleting}
              onPress={() => confirmDelete(post)}
              variant="danger"
            />
          ) : null}
          <CommentsSection
            focusRequest={commentFocusRequest}
            onCountChange={updateCommentCount}
            post={post}
          />
        </View>
      ) : (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>{t('postUnavailable')}</Text>
          <Text style={styles.muted}>{loadError || t('postLoadError')}</Text>
          <Button label={t('retry')} onPress={() => void load()} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { padding: spacing.md, paddingBottom: spacing.xxl },
  backButton: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  backText: { color: colors.primary, fontSize: 16, fontWeight: '800' },
  title: { color: colors.text, fontSize: 28, fontWeight: '900' },
  pressed: { opacity: 0.72 },
  inlineError: {
    color: colors.danger,
    backgroundColor: colors.surface,
    borderRadius: radius.small,
    padding: spacing.sm,
  },
  centerState: { minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  stateCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.xl,
    gap: spacing.md,
  },
  stateTitle: { color: colors.text, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  muted: { color: colors.textMuted, lineHeight: 22, textAlign: 'center' },
  postBlock: { gap: spacing.md },
});

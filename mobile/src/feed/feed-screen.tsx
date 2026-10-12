import { useLanguage } from '@/localization/language-context';
import { useCallback, useRef, useState } from 'react';
import { Redirect, useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/components/text';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { FeedPost, ReportReason } from '@/api/types';
import { useAuth } from '@/auth/auth-context';
import { BrandHeader } from '@/components/brand-header';
import { Button } from '@/components/button';
import {
  fetchFeed,
  reportFeedPost,
  toggleFeedBookmark,
  toggleFeedLike,
} from '@/feed/feed-api';
import { PostCard } from '@/feed/post-card';
import type { FeedPage } from '@/api/types';
import { t } from '@/i18n';
import { deletePost } from '@/publishing/publishing-api';
import { InlinePostComposer } from '@/publishing/inline-post-composer';
import { colors, radius, spacing } from '@/theme';


export function FeedScreen({ bookmarks = false }: { bookmarks?: boolean }) {
  useLanguage();
  const { request, status } = useAuth();
  const generation = useRef(0);
  const firstPending = useRef(false);
  const publishedVersions = useRef(new Map<number, number>());
  const morePending = useRef(false);
  const pageLoaded = useRef(false);
  const mutationVersion = useRef(0);
  const changes = useRef(new Map<number, { version: number; patch: Partial<FeedPost> | null }>());
  const fetchPage = useCallback((cursor?: string) => bookmarks
    ? request<FeedPage>(`/me/bookmarks/${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`)
    : fetchFeed(request, cursor), [bookmarks, request]);
  const applyChanges = (items: FeedPost[], since: number) => items.flatMap((post) => {
    const change = changes.current.get(post.id);
    const updated = change && change.version > since ? (change.patch ? { ...post, ...change.patch } : null) : post;
    return updated && (!bookmarks || updated.is_bookmarked) ? [updated] : [];
  });
  const changePost = (id: number, patch: Partial<FeedPost> | null) => {
    changes.current.set(id, { version: ++mutationVersion.current, patch });
    setPosts(current => current.flatMap(post => post.id !== id ? [post]
      : patch && (!bookmarks || patch.is_bookmarked !== false) ? [{ ...post, ...patch }] : []));
  };
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');

  const loadFirstPage = useCallback(async (reset = false) => {
    const version = ++generation.current;
    firstPending.current = true;
    const since = mutationVersion.current;
    const hadPage = pageLoaded.current;
    morePending.current = false;
    setLoadingMore(false);
    setLoadError('');
    try {
      const page = await fetchPage();
      if (version !== generation.current) return;
      const incoming = applyChanges(page.results, since);
      setPosts(current => {
        const local = current.filter(post => (publishedVersions.current.get(post.id) ?? 0) > since);
        const localIds = new Set(local.map(post => post.id));
        const fresh = [...local, ...incoming.filter(post => !localIds.has(post.id))];
        if (reset || !hadPage) return fresh;
        const byId = new Map(fresh.map(post => [post.id, post]));
        const known = new Set(current.map(post => post.id));
        return [...fresh.filter(post => !known.has(post.id)), ...current.map(post => byId.get(post.id) ?? post)];
      });
      if (reset || !hadPage) setNextCursor(page.next_cursor);
      pageLoaded.current = true;
    } catch {
      if (version === generation.current) setLoadError(t('feedError'));
    } finally {
      if (version === generation.current) { firstPending.current = false; setInitialLoading(false); setRefreshing(false); }
    }
  }, [fetchPage]);

  useFocusEffect(useCallback(() => {
    void loadFirstPage();
    return () => { generation.current++; firstPending.current = false; morePending.current = false; setRefreshing(false); setLoadingMore(false); };
  }, [loadFirstPage]));

  const refresh = async () => {
    setRefreshing(true);
    setActionError('');
    await loadFirstPage(true);
  };

  const loadMore = async () => {
    if (!nextCursor || firstPending.current || morePending.current || initialLoading || refreshing) return;
    const version = generation.current;
    const since = mutationVersion.current;
    morePending.current = true;
    setLoadingMore(true);
    try {
      const page = await fetchPage(nextCursor);
      if (version !== generation.current) return;
      const items = applyChanges(page.results, since);
      setPosts((current) => {
        const knownIds = new Set(current.map((post) => post.id));
        return [...current, ...items.filter((post) => !knownIds.has(post.id))];
      });
      setNextCursor(page.next_cursor);
    } catch {
      if (version === generation.current) setActionError(t('feedMoreError'));
    } finally {
      if (version === generation.current) { morePending.current = false; setLoadingMore(false); }
    }
  };

  const likePost = async (post: FeedPost) => {
    setActionError('');
    try {
      const result = await toggleFeedLike(request, post.id);
      changePost(post.id, { is_liked: result.liked, likes_count: result.likes_count });
    } catch {
      setActionError(t('feedActionError'));
    }
  };

  const bookmarkPost = async (post: FeedPost) => {
    setActionError('');
    try {
      const result = await toggleFeedBookmark(request, post.id);
      changePost(post.id, { is_bookmarked: result.bookmarked });
    } catch {
      setActionError(t('feedActionError'));
    }
  };

  const reportPost = async (post: FeedPost, reason: ReportReason) => {
    setActionError('');
    try {
      await reportFeedPost(request, post.id, reason);
      changePost(post.id, { is_reported: true });
    } catch (error) {
      setActionError(t('reportError'));
      throw error;
    }
  };

  const removePost = (post: FeedPost): Promise<void> => new Promise((resolve) => {
    Alert.alert(t('deletePost'), t('deletePostConfirm'), [
      { text: t('cancel'), style: 'cancel', onPress: () => resolve() },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setActionError('');
            try {
              await deletePost(request, post.id);
              changePost(post.id, null);
            } catch {
              setActionError(t('deletePostError'));
            } finally {
              resolve();
            }
          })();
        },
      },
    ]);
  });

  const published = (post: FeedPost) => {
    changes.current.set(post.id, { version: ++mutationVersion.current, patch: post });
    publishedVersions.current.set(post.id, mutationVersion.current);
    setPosts((current) => [post, ...current.filter((item) => item.id !== post.id)]);
  };

  if (status !== 'authenticated') return <Redirect href="/(auth)/login" />;
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
      <FlatList
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        data={posts}
        keyExtractor={(post) => String(post.id)}
        ListEmptyComponent={initialLoading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.muted}>{t('loadingFeed')}</Text>
          </View>
        ) : loadError ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>{t('feedUnavailable')}</Text>
            <Text style={styles.muted}>{loadError}</Text>
            <Button label={t('retry')} onPress={() => void loadFirstPage()} />
          </View>
        ) : (
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>{t('feedEmpty')}</Text>
            <Text style={styles.muted}>{bookmarks ? t('bookmarksEmptyHint') : t('feedEmptyHint')}</Text>
          </View>
        )}
        ListFooterComponent={loadingMore ? (
          <ActivityIndicator color={colors.primary} style={styles.footerLoader} />
        ) : null}
        ListHeaderComponent={(
          <View style={styles.header}>
            <BrandHeader back={bookmarks} title={bookmarks ? t('bookmarks') : t('home')} showQuickMatch />
            {!bookmarks ? <InlinePostComposer onPublished={published} request={request} /> : null}
            {loadError && posts.length ? <Text style={styles.inlineError}>{loadError}</Text> : null}
            {actionError ? <Text style={styles.inlineError}>{actionError}</Text> : null}
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.45}
        refreshControl={(
          <RefreshControl
            colors={[colors.primary]}
            onRefresh={() => void refresh()}
            refreshing={refreshing}
            tintColor={colors.primary}
          />
        )}
        renderItem={({ item }) => (
          <PostCard
            onBookmark={bookmarkPost}
            onDelete={removePost}
            onLike={likePost}
            onReport={reportPost}
            post={item}
          />
        )}
        style={styles.list}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { width: '100%', maxWidth: 700, alignSelf: 'center' },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xxl,
  },
  header: { gap: spacing.sm, marginBottom: spacing.md },
  separator: { height: spacing.lg },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, minHeight: 240 },
  stateCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.xl,
    gap: spacing.md,
    alignItems: 'stretch',
  },
  stateTitle: { color: colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  muted: { color: colors.textMuted, lineHeight: 20, textAlign: 'center' },
  inlineError: {
    color: colors.danger,
    backgroundColor: colors.surface,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.medium,
    padding: spacing.sm,
    textAlign: 'center',
  },
  footerLoader: { marginVertical: spacing.lg },
});

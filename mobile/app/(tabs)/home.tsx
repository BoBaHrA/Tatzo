import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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
import { t } from '@/i18n';
import { colors, radius, spacing } from '@/theme';


export default function HomeScreen() {
  const { request } = useAuth();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');

  const loadFirstPage = useCallback(async () => {
    setLoadError('');
    try {
      const page = await fetchFeed(request);
      setPosts(page.results);
      setNextCursor(page.next_cursor);
    } catch {
      setLoadError(t('feedError'));
    } finally {
      setInitialLoading(false);
    }
  }, [request]);

  useFocusEffect(useCallback(() => {
    void loadFirstPage();
  }, [loadFirstPage]));

  const refresh = async () => {
    setRefreshing(true);
    setActionError('');
    try {
      const page = await fetchFeed(request);
      setPosts(page.results);
      setNextCursor(page.next_cursor);
      setLoadError('');
    } catch {
      setLoadError(t('feedError'));
    } finally {
      setRefreshing(false);
    }
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore || initialLoading || refreshing) return;
    setLoadingMore(true);
    try {
      const page = await fetchFeed(request, nextCursor);
      setPosts((current) => {
        const knownIds = new Set(current.map((post) => post.id));
        return [...current, ...page.results.filter((post) => !knownIds.has(post.id))];
      });
      setNextCursor(page.next_cursor);
    } catch {
      setActionError(t('feedMoreError'));
    } finally {
      setLoadingMore(false);
    }
  };

  const likePost = async (post: FeedPost) => {
    setActionError('');
    try {
      const result = await toggleFeedLike(request, post.id);
      setPosts((current) => current.map((item) => (
        item.id === post.id
          ? { ...item, is_liked: result.liked, likes_count: result.likes_count }
          : item
      )));
    } catch {
      setActionError(t('feedActionError'));
    }
  };

  const bookmarkPost = async (post: FeedPost) => {
    setActionError('');
    try {
      const result = await toggleFeedBookmark(request, post.id);
      setPosts((current) => current.map((item) => (
        item.id === post.id
          ? { ...item, is_bookmarked: result.bookmarked }
          : item
      )));
    } catch {
      setActionError(t('feedActionError'));
    }
  };

  const reportPost = async (post: FeedPost, reason: ReportReason) => {
    setActionError('');
    try {
      await reportFeedPost(request, post.id, reason);
      setPosts((current) => current.map((item) => (
        item.id === post.id ? { ...item, is_reported: true } : item
      )));
    } catch (error) {
      setActionError(t('reportError'));
      throw error;
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
      <FlatList
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
            <Text style={styles.muted}>{t('feedEmptyHint')}</Text>
          </View>
        )}
        ListFooterComponent={loadingMore ? (
          <ActivityIndicator color={colors.primary} style={styles.footerLoader} />
        ) : null}
        ListHeaderComponent={(
          <View style={styles.header}>
            <BrandHeader title={t('home')} showQuickMatch />
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/create-post')}
              style={({ pressed }) => [styles.createStrip, pressed && styles.createStripPressed]}
            >
              <View style={styles.createCopy}>
                <Text style={styles.eyebrow}>TATZO FEED</Text>
                <Text style={styles.createLabel}>{t('createPost')}</Text>
              </View>
              <View style={styles.createPlus}>
                <Text style={styles.createPlusText}>+</Text>
              </View>
            </Pressable>
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
  list: { width: '100%', maxWidth: 620, alignSelf: 'center' },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  header: { gap: spacing.md, marginBottom: spacing.md },
  createStrip: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.large,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
  },
  createStripPressed: { opacity: 0.82, transform: [{ scale: 0.993 }] },
  createCopy: { flex: 1, gap: 2 },
  eyebrow: {
    color: colors.primary,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 1.7,
  },
  createLabel: { color: colors.text, fontSize: 15, lineHeight: 20, fontWeight: '700' },
  createPlus: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  createPlusText: {
    color: colors.backgroundDeep,
    fontSize: 27,
    lineHeight: 29,
    fontWeight: '600',
  },
  separator: { height: spacing.md },
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

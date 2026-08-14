import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

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
            <BrandHeader />
            <View style={styles.titleBlock}>
              <Text style={styles.eyebrow}>TATZO</Text>
              <Text style={styles.title}>{t('feed')}</Text>
              <Text style={styles.subtitle}>{t('feedSubtitle')}</Text>
            </View>
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
  listContent: { flexGrow: 1, padding: spacing.md, paddingBottom: spacing.xxl },
  header: { gap: spacing.md, marginBottom: spacing.lg },
  titleBlock: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 32, fontWeight: '900' },
  subtitle: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  separator: { height: spacing.md },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, minHeight: 280 },
  stateCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.xl,
    gap: spacing.md,
    alignItems: 'stretch',
  },
  stateTitle: { color: colors.text, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  muted: { color: colors.textMuted, lineHeight: 22, textAlign: 'center' },
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

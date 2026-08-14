import { useCallback, useEffect, useState } from 'react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ApiError } from '@/api/client';
import type { FeedPost, PublicProfile, ReportReason } from '@/api/types';
import { useAuth } from '@/auth/auth-context';
import { BrandHeader } from '@/components/brand-header';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { reportFeedPost, toggleFeedBookmark, toggleFeedLike } from '@/feed/feed-api';
import { PostCard } from '@/feed/post-card';
import { t } from '@/i18n';
import {
  fetchPublicProfile,
  toggleProfileBlock,
  toggleProfileFollow,
} from '@/profile/profile-api';
import { colors, radius, spacing } from '@/theme';


export default function PublicProfileScreen() {
  const params = useLocalSearchParams<{ username?: string | string[] }>();
  const username = Array.isArray(params.username) ? params.username[0] : params.username;
  const { request, status } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');

  const loadProfile = useCallback(async () => {
    if (status !== 'authenticated') return;
    if (!username) {
      setProfile(null);
      setLoadError(t('profileNotFound'));
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      setProfile(await fetchPublicProfile(request, username));
    } catch (error) {
      setProfile(null);
      setLoadError(
        error instanceof ApiError && error.status === 404
          ? t('profileNotFound')
          : t('profileLoadError'),
      );
    } finally {
      setLoading(false);
    }
  }, [request, status, username]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  if (status === 'anonymous') {
    return <Redirect href="/(auth)/login" />;
  }

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/home');
    }
  };

  const updateRecentPost = (
    postId: number,
    update: (post: FeedPost) => FeedPost,
  ) => {
    setProfile((current) => current ? {
      ...current,
      recent_posts: current.recent_posts.map((post) => (
        post.id === postId ? update(post) : post
      )),
    } : current);
  };

  const followProfile = async () => {
    if (!profile || following) return;
    setFollowing(true);
    setActionError('');
    try {
      const result = await toggleProfileFollow(request, profile.username);
      setProfile((current) => current ? {
        ...current,
        is_following: result.is_following,
        followers_count: result.followers_count,
        following_count: result.following_count,
      } : current);
    } catch {
      setActionError(t('followError'));
    } finally {
      setFollowing(false);
    }
  };

  const likePost = async (post: FeedPost) => {
    setActionError('');
    try {
      const result = await toggleFeedLike(request, post.id);
      updateRecentPost(post.id, (current) => ({
        ...current,
        is_liked: result.liked,
        likes_count: result.likes_count,
      }));
    } catch {
      setActionError(t('feedActionError'));
    }
  };

  const bookmarkPost = async (post: FeedPost) => {
    setActionError('');
    try {
      const result = await toggleFeedBookmark(request, post.id);
      updateRecentPost(post.id, (current) => ({
        ...current,
        is_bookmarked: result.bookmarked,
      }));
    } catch {
      setActionError(t('feedActionError'));
    }
  };

  const reportPost = async (post: FeedPost, reason: ReportReason) => {
    setActionError('');
    try {
      await reportFeedPost(request, post.id, reason);
      updateRecentPost(post.id, (current) => ({
        ...current,
        is_reported: true,
      }));
    } catch (error) {
      setActionError(t('reportError'));
      throw error;
    }
  };

  const blockProfile = async () => {
    if (!profile || blocking) return;
    setBlocking(true);
    setActionError('');
    try {
      const result = await toggleProfileBlock(request, profile.username);
      if (result.is_blocked) router.replace('/(tabs)/home');
    } catch {
      setActionError(t('blockError'));
    } finally {
      setBlocking(false);
    }
  };

  const confirmBlock = () => {
    if (!profile) return;
    Alert.alert(
      t('blockUser'),
      `${t('blockUserConfirm')} ${profile.username}?`,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('block'),
          style: 'destructive',
          onPress: () => void blockProfile(),
        },
      ],
    );
  };

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

      {loading || status === 'loading' ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.muted}>{t('loadingProfile')}</Text>
        </View>
      ) : !profile ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>{t('profileUnavailable')}</Text>
          <Text style={styles.muted}>{loadError || t('profileLoadError')}</Text>
          <Button label={t('retry')} onPress={() => void loadProfile()} />
        </View>
      ) : (
        <>
          <View style={styles.hero}>
            <View style={styles.identityRow}>
              {profile.profile_image_url ? (
                <Image source={{ uri: profile.profile_image_url }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarLetter}>
                    {profile.username[0]?.toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.identity}>
                <View style={styles.usernameLine}>
                  <Text numberOfLines={1} style={styles.username}>{profile.username}</Text>
                  {profile.is_verified_artist ? (
                    <Text accessibilityLabel={t('verified')} style={styles.verified}>✓</Text>
                  ) : null}
                </View>
                <Text style={styles.tag}>@{profile.tag ?? profile.username}</Text>
                <Text style={styles.accountType}>
                  {profile.is_verified_artist
                    ? t('verified')
                    : profile.account_type === 'tattoo_artist'
                      ? t('artistProfile')
                      : t('clientProfile')}
                </Text>
              </View>
            </View>

            {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

            <View style={styles.stats}>
              <Stat label={t('posts')} value={profile.posts_count} />
              <Stat label={t('followers')} value={profile.followers_count} />
              <Stat label={t('followingLabel')} value={profile.following_count} />
            </View>

            {profile.is_self ? (
              <Button
                label={t('myProfile')}
                onPress={() => router.push('/(tabs)/profile')}
                variant="secondary"
              />
            ) : (
              <View style={styles.profileActions}>
                <Button
                  label={profile.is_following ? t('following') : t('follow')}
                  loading={following}
                  onPress={() => void followProfile()}
                  variant={profile.is_following ? 'secondary' : 'primary'}
                />
                <Button
                  label={t('blockUser')}
                  loading={blocking}
                  onPress={confirmBlock}
                  variant="danger"
                />
              </View>
            )}
          </View>

          {actionError ? <Text style={styles.inlineError}>{actionError}</Text> : null}

          {profile.account_type === 'tattoo_artist' ? (
            <View style={styles.section}>
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>{t('portfolio')}</Text>
                <Text style={styles.sectionCount}>
                  {profile.portfolio_works_count} {t('works')}
                </Text>
              </View>
              {profile.portfolio.length ? (
                <View style={styles.portfolioGrid}>
                  {profile.portfolio.map((work) => (
                    <View key={work.id} style={styles.workCard}>
                      {work.image_url ? (
                        <Image source={{ uri: work.image_url }} style={styles.workImage} />
                      ) : (
                        <View style={[styles.workImage, styles.workPlaceholder]} />
                      )}
                      {work.title || work.style ? (
                        <View style={styles.workCaption}>
                          {work.title ? (
                            <Text numberOfLines={1} style={styles.workTitle}>{work.title}</Text>
                          ) : null}
                          {work.style ? (
                            <Text numberOfLines={1} style={styles.workMeta}>{work.style}</Text>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.mutedLeft}>{t('portfolioEmpty')}</Text>
              )}
            </View>
          ) : null}

          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>{t('recentPosts')}</Text>
              <Text style={styles.sectionCount}>{profile.posts_count}</Text>
            </View>
            {profile.recent_posts.length ? profile.recent_posts.map((post) => (
              <PostCard
                key={post.id}
                onBookmark={bookmarkPost}
                onLike={likePost}
                onReport={reportPost}
                post={post}
              />
            )) : <Text style={styles.mutedLeft}>{t('recentPostsEmpty')}</Text>}
          </View>
        </>
      )}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text numberOfLines={1} style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  backButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  backText: { color: colors.primary, fontSize: 16, fontWeight: '800' },
  pressed: { opacity: 0.68 },
  centerState: { minHeight: 320, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  muted: { color: colors.textMuted, lineHeight: 22, textAlign: 'center' },
  mutedLeft: { color: colors.textMuted, lineHeight: 22 },
  stateCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.xl,
    gap: spacing.md,
  },
  stateTitle: { color: colors.text, fontSize: 23, fontWeight: '900', textAlign: 'center' },
  hero: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.lg,
    gap: spacing.md,
  },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 88, height: 88, borderRadius: 44 },
  avatarFallback: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  avatarLetter: { color: colors.backgroundDeep, fontSize: 34, fontWeight: '900' },
  identity: { flex: 1, gap: 4 },
  usernameLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  username: { color: colors.text, fontSize: 24, fontWeight: '900', flexShrink: 1 },
  tag: { color: colors.primary, fontWeight: '800' },
  accountType: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  verified: {
    color: colors.backgroundDeep,
    backgroundColor: colors.primary,
    width: 19,
    height: 19,
    borderRadius: 10,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '900',
    overflow: 'hidden',
  },
  bio: { color: colors.text, fontSize: 15, lineHeight: 23 },
  profileActions: { gap: spacing.sm },
  stats: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundDeep,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  stat: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: 3 },
  statValue: { color: colors.text, fontSize: 18, fontWeight: '900' },
  statLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  inlineError: {
    color: colors.danger,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.medium,
    padding: spacing.sm,
    textAlign: 'center',
  },
  section: { gap: spacing.md },
  sectionHeading: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionTitle: { color: colors.text, fontSize: 22, fontWeight: '900' },
  sectionCount: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  portfolioGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  workCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.medium,
    overflow: 'hidden',
  },
  workImage: { width: '100%', aspectRatio: 0.92, backgroundColor: colors.surfaceRaised },
  workPlaceholder: { opacity: 0.55 },
  workCaption: { padding: spacing.sm, gap: 2 },
  workTitle: { color: colors.text, fontWeight: '800' },
  workMeta: { color: colors.primary, fontSize: 12, fontWeight: '700' },
});

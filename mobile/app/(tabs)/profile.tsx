import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { FeedPost, PublicProfile } from '@/api/types';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { appLanguage, t } from '@/i18n';
import { fetchProfileContent, fetchPublicProfile } from '@/profile/profile-api';
import type { ProfileContentTab } from '@/profile/profile-types';
import { colors, radius, spacing } from '@/theme';


function copy(en: string, fr: string, ru: string) {
  if (appLanguage === 'fr') return fr;
  if (appLanguage === 'ru') return ru;
  return en;
}

function verificationLabel(status: string) {
  if (status === 'approved') return t('verified');
  if (status === 'rejected') return t('verificationStatusRejected');
  if (status === 'not_submitted') return t('verificationStatusNotSubmitted');
  return t('pendingVerification');
}

export default function ProfileScreen() {
  const { request, user } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [tab, setTab] = useState<ProfileContentTab>('posts');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const [nextProfile, content] = await Promise.all([
        fetchPublicProfile(request, user.username),
        fetchProfileContent(request, user.username, tab),
      ]);
      setProfile(nextProfile);
      setPosts(content.results);
    } catch {
      setError(t('profileLoadError'));
    } finally {
      setLoading(false);
      setContentLoading(false);
    }
  }, [request, tab, user]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const selectTab = async (nextTab: ProfileContentTab) => {
    if (!user || nextTab === tab) return;
    setTab(nextTab);
    setContentLoading(true);
    setError('');
    try {
      const content = await fetchProfileContent(request, user.username, nextTab);
      setPosts(content.results);
    } catch {
      setError(t('profileLoadError'));
    } finally {
      setContentLoading(false);
    }
  };

  if (!user) return null;

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.topbar}>
        <Image
          accessibilityLabel="Tatzo"
          resizeMode="contain"
          source={require('../../assets/tatzo7.png')}
          style={styles.logo}
        />
        <Pressable
          accessibilityLabel={copy('Settings', 'Paramètres', 'Настройки')}
          accessibilityRole="button"
          onPress={() => router.push('/settings')}
          style={({ pressed }) => [styles.settingsButton, pressed && styles.pressed]}
        >
          <Text style={styles.settingsIcon}>⚙</Text>
        </Pressable>
      </View>

      {loading && !profile ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : profile ? (
        <>
          <View style={styles.profileHeader}>
            <View style={styles.avatarWrap}>
              {profile.profile_image_url ? (
                <Image source={{ uri: profile.profile_image_url }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarLetter}>{profile.username[0]?.toUpperCase()}</Text>
                </View>
              )}
            </View>

            <View style={styles.profileMain}>
              <View style={styles.nameRow}>
                <Text numberOfLines={1} style={styles.username}>{profile.username}</Text>
                {profile.account_type === 'tattoo_artist' ? (
                  <View style={[styles.badge, styles.artistBadge]}>
                    <Text style={styles.artistBadgeText}>{copy('Tattoo Artist', 'Tatoueur', 'Тату-мастер')}</Text>
                  </View>
                ) : null}
                {profile.is_verified_artist ? (
                  <View style={[styles.badge, styles.verifiedBadge]}>
                    <Text style={styles.verifiedBadgeText}>{t('verified')}</Text>
                  </View>
                ) : null}
              </View>

              <Text style={styles.subline}>
                {profile.account_type === 'tattoo_artist'
                  ? copy('Professional portfolio', 'Portfolio professionnel', 'Профессиональное портфолио')
                  : copy('Community profile', 'Profil communautaire', 'Профиль сообщества')}
              </Text>

              <Button
                label={t('editProfile')}
                onPress={() => router.push('/edit-profile')}
                size="compact"
              />

              <View style={styles.stats}>
                <Stat value={profile.posts_count} label={t('posts')} />
                <Stat value={profile.followers_count} label={t('followers')} />
                <Stat value={profile.following_count} label={t('followingLabel')} />
              </View>

              <View style={styles.bioCard}>
                <Text style={profile.bio ? styles.bio : styles.muted}>
                  {profile.bio || copy('No bio yet.', 'Pas encore de bio.', 'Описание пока не добавлено.')}
                </Text>
              </View>

              {profile.is_verified_artist ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push('/artist-dashboard')}
                  style={({ pressed }) => [styles.dashboardEntry, pressed && styles.pressed]}
                >
                  <View style={styles.dashboardEntryIcon}>
                    <Image source={require('../../assets/dashboard-icons/dashboard.png')} resizeMode="contain" style={styles.dashboardEntryIconImage} />
                  </View>
                  <View style={styles.dashboardEntryCopy}>
                    <Text style={styles.dashboardEntryEyebrow}>{copy('ARTIST TOOLS', 'OUTILS ARTISTE', 'ИНСТРУМЕНТЫ МАСТЕРА')}</Text>
                    <Text style={styles.dashboardEntryTitle}>{copy('Open Dashboard', 'Ouvrir le tableau de bord', 'Открыть кабинет мастера')}</Text>
                    <Text style={styles.dashboardEntryHint}>{copy('Bookings, calendar, projects, clients, statistics and settings.', 'Réservations, calendrier, projets, clients, statistiques et paramètres.', 'Записи, календарь, проекты, клиенты, статистика и настройки.')}</Text>
                  </View>
                  <Text style={styles.dashboardEntryChevron}>›</Text>
                </Pressable>
              ) : null}

              {profile.account_type === 'tattoo_artist' ? (
                <View style={styles.artistInfoGrid}>
                  <ArtistInfoCard
                    title={copy('Verification', 'Vérification', 'Верификация')}
                    value={verificationLabel(user.verification_status)}
                    onPress={user.verification_status === 'not_submitted'
                      ? () => router.push('/artist-verification')
                      : undefined}
                  />
                  <ArtistInfoCard
                    title={t('portfolio')}
                    value={profile.portfolio_works_count
                      ? t('managePortfolio')
                      : copy('Add your works', 'Ajouter vos œuvres', 'Добавить работы')}
                    onPress={() => router.push('/manage-portfolio')}
                  />
                  <ArtistInfoCard
                    title={copy('Booking', 'Réservation', 'Запись')}
                    value={profile.is_verified_artist
                      ? copy('Manage appointments', 'Gérer les rendez-vous', 'Управлять записями')
                      : copy('Available after verification', 'Disponible après vérification', 'Доступно после верификации')}
                    onPress={profile.is_verified_artist ? () => router.push('/(tabs)/bookings') : undefined}
                  />
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.tabs}>
            <ProfileTab
              active={tab === 'posts'}
              label={copy('Posts', 'Publications', 'Публикации')}
              onPress={() => void selectTab('posts')}
            />
            <ProfileTab
              active={tab === 'liked'}
              label={copy('Liked', 'Aimées', 'Понравившиеся')}
              onPress={() => void selectTab('liked')}
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {contentLoading ? (
            <ActivityIndicator color={colors.primary} style={styles.contentLoader} />
          ) : posts.length ? (
            <View style={styles.postsGrid}>
              {posts.map((post) => <PostTile key={post.id} post={post} />)}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>
                {tab === 'posts'
                  ? copy('No posts yet', 'Aucune publication', 'Публикаций пока нет')
                  : copy('No liked posts yet', 'Aucune publication aimée', 'Понравившихся публикаций пока нет')}
              </Text>
              <Text style={styles.muted}>
                {tab === 'posts'
                  ? copy('Your posts will appear here.', 'Vos publications apparaîtront ici.', 'Твои публикации появятся здесь.')
                  : copy('Posts you like will appear here.', 'Les publications aimées apparaîtront ici.', 'Здесь появятся публикации, которые тебе понравились.')}
              </Text>
            </View>
          )}
        </>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>{t('profileUnavailable')}</Text>
          <Text style={styles.muted}>{error || t('profileLoadError')}</Text>
          <Button label={t('retry')} onPress={() => void load()} />
        </View>
      )}
    </Screen>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ArtistInfoCard({
  title,
  value,
  onPress,
}: {
  title: string;
  value: string;
  onPress?: () => void;
}) {
  const content = (
    <>
      <Text style={styles.artistInfoTitle}>{title}</Text>
      <Text style={[styles.artistInfoValue, onPress && styles.artistInfoLink]}>{value}</Text>
    </>
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.artistInfoCard, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  ) : <View style={styles.artistInfoCard}>{content}</View>;
}

function ProfileTab({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.tab, active && styles.tabActive, pressed && styles.pressed]}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

function PostTile({ post }: { post: FeedPost }) {
  const media = post.media[0];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/post/[postId]', params: { postId: String(post.id) } })}
      style={({ pressed }) => [styles.postTile, pressed && styles.tilePressed]}
    >
      {media?.type === 'image' ? (
        <Image source={{ uri: media.url }} style={styles.postMedia} />
      ) : media?.type === 'video' ? (
        <View style={[styles.postMedia, styles.videoTile]}>
          <Text style={styles.videoIcon}>▶</Text>
        </View>
      ) : (
        <View style={[styles.postMedia, styles.noMedia]}>
          <Text numberOfLines={4} style={styles.noMediaText}>{post.content || 'Tatzo'}</Text>
        </View>
      )}
      {post.media.length > 1 ? (
        <View style={styles.mediaCount}>
          <Text style={styles.mediaCountText}>{post.media.length}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.xs, paddingBottom: spacing.xxl },
  topbar: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  logo: { width: 122, height: 34 },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.18)',
    backgroundColor: '#00131d',
  },
  settingsIcon: { color: colors.primary, fontSize: 20 },
  loadingState: { minHeight: 380, alignItems: 'center', justifyContent: 'center' },
  profileHeader: {
    backgroundColor: '#00131d',
    borderWidth: 1,
    borderColor: '#012c35',
    borderRadius: 22,
    padding: spacing.lg,
    gap: spacing.md,
  },
  avatarWrap: { alignItems: 'center' },
  avatar: {
    width: 116,
    height: 116,
    borderRadius: 58,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#031720' },
  avatarLetter: { color: colors.primary, fontSize: 42, fontWeight: '900' },
  profileMain: { gap: spacing.md },
  nameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  username: { color: '#f4ffff', fontSize: 31, lineHeight: 35, fontWeight: '900', letterSpacing: -0.7, flexShrink: 1 },
  subline: { color: 'rgba(223, 252, 255, 0.72)', fontSize: 15, lineHeight: 22 },
  badge: { borderRadius: 999, paddingVertical: 5, paddingHorizontal: 9, borderWidth: 1 },
  artistBadge: { backgroundColor: 'rgba(4, 197, 191, 0.12)', borderColor: 'rgba(4, 197, 191, 0.25)' },
  artistBadgeText: { color: '#6ef6f0', fontSize: 11, fontWeight: '800' },
  verifiedBadge: { backgroundColor: 'rgba(238, 12, 111, 0.12)', borderColor: 'rgba(238, 12, 111, 0.25)' },
  verifiedBadgeText: { color: '#ff6b96', fontSize: 11, fontWeight: '800' },
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 9,
    borderRadius: 14,
    backgroundColor: '#031b27',
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.08)',
  },
  statValue: { color: colors.white, fontSize: 18, fontWeight: '900' },
  statLabel: { color: '#84aeb2', fontSize: 11, marginTop: 3 },
  bioCard: {
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#031b27',
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.08)',
  },
  bio: { color: '#d9eeee', lineHeight: 21 },
  muted: { color: '#7fa7ab', lineHeight: 20 },
  dashboardEntry: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.24)',
    backgroundColor: 'rgba(4, 197, 191, 0.075)',
  },
  dashboardEntryIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(4, 197, 191, 0.12)',
  },
  dashboardEntryIconImage: { width: 22, height: 22, tintColor: colors.primary },
  dashboardEntryCopy: { flex: 1, minWidth: 0, gap: 3 },
  dashboardEntryEyebrow: { color: colors.primary, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  dashboardEntryTitle: { color: colors.white, fontSize: 15, fontWeight: '900' },
  dashboardEntryHint: { color: '#89afb3', fontSize: 10, lineHeight: 15 },
  dashboardEntryChevron: { color: colors.primary, fontSize: 28, lineHeight: 30 },
  artistInfoGrid: { flexDirection: 'row', gap: spacing.sm },
  artistInfoCard: {
    flex: 1,
    minWidth: 0,
    padding: 11,
    borderRadius: 15,
    backgroundColor: '#031b27',
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.08)',
    gap: 5,
  },
  artistInfoTitle: { color: '#7fa7ab', fontSize: 10 },
  artistInfoValue: { color: '#ecffff', fontSize: 12, fontWeight: '800' },
  artistInfoLink: { color: colors.primary },
  tabs: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: 7,
    backgroundColor: '#00131d',
    borderWidth: 1,
    borderColor: '#012c35',
    borderRadius: 16,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12 },
  tabActive: { backgroundColor: 'rgba(4, 197, 191, 0.14)' },
  tabText: { color: '#77a8ad', fontWeight: '800' },
  tabTextActive: { color: '#dffefe' },
  contentLoader: { marginVertical: 48 },
  postsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  postTile: {
    width: '31.7%',
    aspectRatio: 1,
    borderRadius: 15,
    overflow: 'hidden',
    backgroundColor: '#021722',
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.08)',
  },
  postMedia: { width: '100%', height: '100%' },
  videoTile: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#031b27' },
  videoIcon: { color: colors.primary, fontSize: 22 },
  noMedia: { padding: 8, alignItems: 'center', justifyContent: 'center' },
  noMediaText: { color: colors.textMuted, fontSize: 10, textAlign: 'center' },
  mediaCount: {
    position: 'absolute',
    right: 6,
    top: 6,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 5,
    backgroundColor: 'rgba(0, 9, 17, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaCountText: { color: colors.white, fontSize: 10, fontWeight: '900' },
  tilePressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  emptyState: {
    padding: spacing.xl,
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.10)',
    backgroundColor: '#00131d',
    gap: spacing.sm,
    alignItems: 'center',
  },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  error: { color: colors.danger, textAlign: 'center', padding: spacing.sm },
  pressed: { opacity: 0.7 },
});
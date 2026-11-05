import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useLanguage } from '@/localization/language-context';
import { useAuth } from '@/auth/auth-context';
import { useChat } from '@/chat/chat-context';
import { startChat } from '@/chat/chat-api';
import { ApiError } from '@/api/client';
import type { FeedPost, PublicProfile } from '@/api/types';
import { Text } from '@/components/text';
import { Screen } from '@/components/screen';
import { Button } from '@/components/button';
import { t } from '@/i18n';
import { ProfileHeader, profileActionStyles as actionStyles } from './profile-header';
import { ProfilePostGrid, ProfileTabs } from './profile-content';
import { profileCopy as copy } from './profile-copy';
import { fetchProfileContent, fetchProfileStyles, fetchPublicProfile, toggleProfileBlock, toggleProfileFollow } from './profile-api';
import type { ProfileContentTab } from './profile-types';

export function ProfileScreen({ username, own = false }: { username: string; own?: boolean }) {
  const { language } = useLanguage();
  const { request, status, user } = useAuth();
  const { refresh: refreshChats } = useChat();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [tattooStyles, setTattooStyles] = useState<string[]>([]);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [tab, setTab] = useState<ProfileContentTab>('posts');
  const [canViewLiked, setCanViewLiked] = useState(own);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(true);
  const [error, setError] = useState('');
  const [contentError, setContentError] = useState('');
  const [busy, setBusy] = useState<'follow' | 'chat' | 'block' | null>(null);

  useFocusEffect(useCallback(() => { setRefresh(value => value + 1); }, []));
  useEffect(() => {
    if (status !== 'authenticated') return;
    let active = true;
    setLoading(true); setError('');
    void fetchPublicProfile(request, username).then(next => {
      if (!active) return;
      setProfile(next); setLoading(false);
      void fetchProfileStyles(request, next).then(styles => { if (active) setTattooStyles(styles); });
    }).catch(reason => {
      if (!active) return;
      setProfile(null); setLoading(false);
      setError(reason instanceof ApiError && reason.status === 404 ? t('profileNotFound') : t('profileLoadError'));
    });
    return () => { active = false; };
  }, [request, status, username, refresh, language]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let active = true;
    setContentLoading(true); setContentError('');
    void fetchProfileContent(request, username, tab).then(content => {
      if (!active) return;
      setCanViewLiked(content.can_view_liked);
      if (tab === 'liked' && !content.can_view_liked) { setPosts([]); setTab('posts'); return; }
      setPosts(content.results);
    }).catch(() => { if (active) { setPosts([]); setContentError(t('profileLoadError')); } })
      .finally(() => { if (active) setContentLoading(false); });
    return () => { active = false; };
  }, [request, status, username, tab, refresh]);

  const act = async (kind: 'follow' | 'chat' | 'block') => {
    if (!profile || busy) return;
    setBusy(kind); setError('');
    try {
      if (kind === 'follow') {
        const result = await toggleProfileFollow(request, profile.username);
        setProfile(current => current ? { ...current, ...result } : current);
      } else if (kind === 'chat') {
        const thread = await startChat(request, profile.username);
        void refreshChats();
        router.push({ pathname: '/chat/[threadId]', params: { threadId: String(thread.id) } });
      } else {
        const result = await toggleProfileBlock(request, profile.username);
        if (result.is_blocked) router.replace('/(tabs)/home');
      }
    } catch { setError(t(kind === 'follow' ? 'followError' : kind === 'chat' ? 'chatStartError' : 'blockError')); }
    finally { setBusy(null); }
  };
  const more = () => Alert.alert(profile?.username ?? '', undefined, [
    { text: t('blockUser'), style: 'destructive', onPress: () => Alert.alert(t('blockUser'), `${t('blockUserConfirm')} ${profile?.username}?`, [{ text: t('cancel'), style: 'cancel' }, { text: t('block'), style: 'destructive', onPress: () => void act('block') }]) },
    { text: t('cancel'), style: 'cancel' },
  ]);

  if (status === 'anonymous') return <Redirect href="/(auth)/login" />;
  if (!own && profile?.is_self) return <Redirect href="/(tabs)/profile" />;
  return <Screen contentStyle={styles.screen}>
    <View style={styles.topbar}>
      {!own ? <Pressable accessibilityLabel={t('back')} accessibilityRole="button" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/home')} style={styles.topButton}><Text style={styles.topSymbol}>‹</Text></Pressable> : null}
      <Image accessibilityLabel="Tatzo" source={require('../../assets/tatzo7.png')} resizeMode="contain" style={styles.logo} />
      <View style={styles.topActions}>
        {own && user?.is_verified_artist ? <Pressable accessibilityLabel={t('dashboard')} accessibilityRole="button" onPress={() => router.push('/artist-dashboard')} style={styles.topButton}><Image source={require('../../assets/dashboard-icons/dashboard.png')} style={styles.dashboardIcon} /></Pressable> : null}
        <Pressable accessibilityLabel={own ? copy('Settings', 'Paramètres', 'Настройки') : copy('More options', 'Plus d’options', 'Другие действия')} accessibilityRole="button" disabled={!own && !profile} onPress={own ? () => router.push('/settings') : more} style={styles.topButton}><Text style={styles.topSymbol}>{own ? '⚙' : '⋯'}</Text></Pressable>
      </View>
    </View>
    {loading && !profile ? <ActivityIndicator color="#04c5bf" style={styles.loader} /> : profile ? <>
      <ProfileHeader profile={profile} tattooStyles={tattooStyles} verificationStatus={own ? user?.verification_status : undefined} onPortfolio={() => profile.is_self ? router.push('/manage-portfolio') : router.push({ pathname: '/profile/[username]/portfolio', params: { username: profile.username } })} actions={own ? <Pressable accessibilityRole="button" onPress={() => router.push('/edit-profile')} style={actionStyles.button}><Text style={actionStyles.text}>{t('editProfile')}</Text></Pressable> : <>
        <Pressable accessibilityRole="button" disabled={Boolean(busy)} onPress={() => void act('follow')} style={[actionStyles.button, profile.is_following && actionStyles.secondary]}>{busy === 'follow' ? <ActivityIndicator color="#001b21" /> : <Text style={[actionStyles.text, profile.is_following && actionStyles.secondaryText]}>{profile.is_following ? t('following') : t('follow')}</Text>}</Pressable>
        <Pressable accessibilityRole="button" disabled={Boolean(busy)} onPress={() => void act('chat')} style={[actionStyles.button, actionStyles.secondary]}>{busy === 'chat' ? <ActivityIndicator color="#04c5bf" /> : <Text style={[actionStyles.text, actionStyles.secondaryText]}>{copy('Message', 'Message', 'Сообщение')}</Text>}</Pressable>
      </>} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <ProfileTabs tab={tab} canViewLiked={canViewLiked} onChange={setTab} />
      {contentLoading ? <ActivityIndicator color="#04c5bf" style={styles.loader} /> : contentError ? <View style={styles.empty}><Text style={styles.error}>{contentError}</Text><Button label={t('retry')} onPress={() => setRefresh(value => value + 1)} /></View> : posts.length ? <ProfilePostGrid posts={posts} /> : <View style={styles.empty}><Text style={styles.emptyText}>{tab === 'posts' ? copy('No posts yet', 'Aucune publication', 'Публикаций пока нет') : copy('No liked posts yet', 'Aucune publication aimée', 'Понравившихся публикаций пока нет')}</Text></View>}
    </> : <View style={styles.empty}><Text style={styles.error}>{error || t('profileUnavailable')}</Text><Button label={t('retry')} onPress={() => setRefresh(value => value + 1)} /></View>}
  </Screen>;
}

const styles = StyleSheet.create({
  screen: { gap: 7, paddingTop: 4, paddingBottom: 32 }, topbar: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 }, logo: { width: 122, height: 34 }, topActions: { marginLeft: 'auto', flexDirection: 'row' }, topButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, topSymbol: { color: '#04c5bf', fontSize: 24, fontWeight: '800' }, dashboardIcon: { width: 22, height: 22, tintColor: '#04c5bf' }, loader: { marginVertical: 40 }, error: { color: '#ff6b96', fontSize: 12, textAlign: 'center', padding: 8 }, empty: { padding: 24, gap: 12, borderRadius: 12, backgroundColor: '#00131d' }, emptyText: { color: '#84aeb2', textAlign: 'center', fontSize: 13 },
});

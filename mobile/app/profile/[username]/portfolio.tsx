import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useLanguage } from '@/localization/language-context';
import { useAuth } from '@/auth/auth-context';
import type { PortfolioWork, PublicProfile } from '@/api/types';
import { API_BASE_URL } from '@/api/client';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { Button } from '@/components/button';
import { t } from '@/i18n';
import { fetchPublicProfile } from '@/profile/profile-api';
import { profileCopy as copy } from '@/profile/profile-copy';

export default function PublicPortfolioScreen() {
  useLanguage();
  const params = useLocalSearchParams<{ username: string }>();
  const { request, status } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [selected, setSelected] = useState<PortfolioWork | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    if (status !== 'authenticated') return;
    let active = true;
    setLoading(true); setError('');
    void fetchPublicProfile(request, params.username).then(next => { if (active) setProfile(next); }).catch(() => { if (active) setError(t('profileLoadError')); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [params.username, request, retry, status]));
  const allWorks = async () => {
    try { await Linking.openURL(`${new URL(API_BASE_URL).origin}/profile/${encodeURIComponent(params.username)}/portfolio/`); }
    catch { Alert.alert(t('portfolio'), t('profileLoadError')); }
  };
  if (status === 'anonymous') return <Redirect href="/(auth)/login" />;
  return <Screen>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" onPress={() => router.canGoBack() ? router.back() : router.replace({ pathname: '/profile/[username]', params: { username: params.username } })}><Text style={styles.back}>← {copy('Back to profile', 'Retour au profil', 'Вернуться в профиль')}</Text></Pressable>
      <Text style={styles.title}>{t('portfolio')} · {profile?.username || params.username}</Text>
      <Text style={styles.subtitle}>{copy('A curated collection of tattoo works, albums and styles.', 'Une collection de tatouages, albums et styles.', 'Коллекция тату-работ, альбомов и стилей.')}</Text>
    </View>
    {loading ? <ActivityIndicator color="#04c5bf" /> : error ? <View><Text style={styles.error}>{error}</Text><Button label={t('retry')} onPress={() => setRetry(value => value + 1)} /></View> : profile && !profile.is_verified_artist ? <Text style={styles.subtitle}>{copy('Portfolio unlocks after verification', 'Le portfolio sera disponible après vérification', 'Портфолио откроется после верификации')}</Text> : <>
      <View style={styles.grid}>{profile?.portfolio.map(work => <Pressable key={work.id} accessibilityRole="button" accessibilityLabel={work.title || t('portfolio')} onPress={() => setSelected(work)} style={styles.work}>
        {work.image_url ? <Image source={{ uri: work.image_url }} style={styles.image} /> : <View style={styles.image} />}
        {work.title || work.style ? <View style={styles.caption}>{work.title ? <Text style={styles.workTitle}>{work.title}</Text> : null}{work.style ? <Text style={styles.back}>{work.style}</Text> : null}</View> : null}
      </Pressable>)}</View>
      {!profile?.portfolio.length ? <Text style={styles.subtitle}>{t('portfolioEmpty')}</Text> : null}
      {profile && profile.portfolio_works_count > profile.portfolio.length ? <Button label={copy('View full portfolio', 'Voir tout le portfolio', 'Открыть полное портфолио')} onPress={() => void allWorks()} /> : null}
    </>}
    <Modal visible={Boolean(selected)} animationType="fade" transparent onRequestClose={() => setSelected(null)}>
      <View style={styles.lightbox}><Pressable accessibilityRole="button" accessibilityLabel={t('close')} onPress={() => setSelected(null)} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable>
        {selected?.image_url ? <Image source={{ uri: selected.image_url }} resizeMode="contain" style={styles.largeImage} /> : null}
        <ScrollView style={styles.details}><Text style={styles.workTitle}>{selected?.title}</Text><Text style={styles.subtitle}>{[selected?.style, selected?.body_placement].filter(Boolean).join(' · ')}</Text>{selected?.description ? <Text style={styles.subtitle}>{selected.description}</Text> : null}</ScrollView>
      </View>
    </Modal>
  </Screen>;
}

const styles = StyleSheet.create({
  header: { padding: 18, gap: 10, borderRadius: 20, backgroundColor: '#00121c', borderWidth: 1, borderColor: 'rgba(4,197,191,.18)' }, back: { color: '#04c5bf', fontSize: 12, fontWeight: '800' }, title: { color: '#eaffff', fontSize: 24, lineHeight: 28, fontWeight: '900' }, subtitle: { color: '#9bc0c4', fontSize: 12, lineHeight: 18 }, error: { color: '#ff6b96' }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, work: { width: '48.5%', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(4,197,191,.16)', backgroundColor: '#031923' }, image: { width: '100%', aspectRatio: .9 }, caption: { padding: 10, gap: 4 }, workTitle: { color: '#eaffff', fontSize: 13, fontWeight: '800' }, lightbox: { flex: 1, padding: 20, paddingTop: 70, backgroundColor: 'rgba(0,9,17,.98)' }, close: { position: 'absolute', top: 30, right: 15, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, closeText: { color: '#fff', fontSize: 30 }, largeImage: { flex: 1, width: '100%' }, details: { maxHeight: '25%', marginTop: 12, marginBottom: 24 },
});

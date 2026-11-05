import type { ReactNode } from 'react';
import { Image, ImageBackground, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import type { PublicProfile } from '@/api/types';
import { Text } from '@/components/text';
import { Avatar } from '@/components/avatar';
import { t } from '@/i18n';
import { profileCopy as copy } from './profile-copy';

type Props = {
  profile: PublicProfile;
  tattooStyles: string[];
  verificationStatus?: string;
  actions: ReactNode;
  onPortfolio: () => void;
};

/** Dimensions, colors and artwork follow templates/users/profile.html and profile.css. */
export function ProfileHeader({ profile, tattooStyles, verificationStatus, actions, onPortfolio }: Props) {
  const artist = profile.account_type === 'tattoo_artist';
  const verified = profile.is_verified_artist;
  const own = profile.is_self;
  const compact = useWindowDimensions().width <= 360;
  return <View style={styles.profileHeader}>
    <View style={styles.identityRow}>
      <View style={styles.avatarWrap}><Avatar uri={profile.profile_image_url} label={profile.username} size={70} ring style={{ borderWidth: 2 }} /></View>
      <View testID="profile-identity" style={styles.identity}>
        <View style={styles.nameRow}>
          <View style={styles.nameAndCheck}>
            <Text numberOfLines={2} style={[styles.username, compact && styles.usernameCompact]}>{profile.username}</Text>
            {verified ? <View testID="profile-verified-mark" accessibilityLabel={t('verified')} accessibilityRole="image" style={styles.verified}><Image source={require('../../assets/profile/verified.png')} style={styles.check} /></View> : null}
          </View>
          {artist ? <View style={styles.badge}><Text style={styles.badgeText}>{copy('Tattoo Artist', 'Tatoueur', 'Тату-мастер')}</Text></View> : null}
        </View>
        <Text style={styles.subline}>{artist ? copy('Professional portfolio', 'Portfolio professionnel', 'Профессиональное портфолио') : copy('Community profile', 'Profil communautaire', 'Профиль сообщества')}</Text>
        {own && artist && verificationStatus === 'not_submitted' ? <Pressable accessibilityRole="button" onPress={() => router.push('/artist-verification')} hitSlop={6}><Text style={styles.startVerification}>{copy('Start verification', 'Commencer la vérification', 'Начать верификацию')} ↗</Text></Pressable> : null}
      </View>
    </View>
    <View style={styles.actions}>{actions}</View>
    <View style={styles.stats}>
      <Stat value={profile.posts_count} label={t('posts')} />
      <Stat value={profile.followers_count} label={t('followers')} />
      <Stat value={profile.following_count} label={t('followingLabel')} />
    </View>
    <View style={styles.bioCard}><Text style={styles.bio}>{profile.bio || copy('No bio yet.', 'Pas encore de bio.', 'Описание пока не добавлено.')}</Text></View>
    {artist && (tattooStyles.length > 0 || own) ? <View style={styles.stylesCard}>
      <View style={styles.stylesHeading}>
        <View><Text style={styles.eyebrow}>{copy('Specialties', 'Spécialités', 'Специализация')}</Text><Text style={styles.stylesTitle}>{copy('Tattoo styles', 'Styles de tatouage', 'Стили тату')}</Text></View>
        {own && verified ? <Pressable accessibilityRole="button" onPress={() => router.push('/artist-dashboard/preferences')} hitSlop={7}><Text style={styles.manageStyles}>{copy('Manage styles', 'Gérer les styles', 'Настроить стили')} ↗</Text></Pressable> : null}
      </View>
      {tattooStyles.length ? <View style={styles.styleChips}>{tattooStyles.map(style => <Text key={style} style={styles.styleChip}>{style}</Text>)}</View> : <Text style={styles.emptyStyles}>{copy('Choose your tattoo styles in your booking dashboard to show them on your public profile.', 'Choisissez vos styles dans les paramètres de réservation pour les afficher sur votre profil.', 'Выбери стили в настройках записи, чтобы показать их в профиле.')}</Text>}
    </View> : null}
    {artist ? <View style={styles.primaryActions}>
      <View testID="profile-portfolio-card" style={[styles.cta, styles.portfolio]}>
        <ImageBackground source={require('../../assets/profile/portfolio-gradient.png')} resizeMode="stretch" style={styles.gradient} imageStyle={styles.gradientImage}>
          <Pressable accessibilityRole="button" onPress={onPortfolio} style={({ pressed }) => [styles.ctaMain, compact && styles.ctaMainCompact, pressed && styles.pressed]}>
            <View style={styles.ctaRow}><Text style={[styles.ctaTitle, compact && styles.ctaTitleCompact, styles.dark]}>{t('portfolio')}</Text><Image testID="profile-portfolio-icon" source={require('../../assets/profile/portfolio.png')} style={[styles.ctaIcon, compact && styles.ctaIconCompact]} /></View>
            <View style={styles.ctaRow}><Text style={[styles.ctaSubtitle, styles.dark]}>{own ? (profile.portfolio_works_count ? t('managePortfolio') : copy('Add your works', 'Ajouter vos œuvres', 'Добавить работы')) : profile.portfolio_works_count ? `${profile.portfolio_works_count} ${t('works')}` : copy('No works yet', 'Aucune œuvre', 'Работ пока нет')}</Text><Text style={[styles.arrow, styles.dark]}>↗</Text></View>
          </Pressable>
        </ImageBackground>
      </View>
      <View testID="profile-booking-card" style={[styles.cta, verified ? styles.booking : styles.unavailable]}>
        <ImageBackground source={verified ? require('../../assets/profile/booking-gradient.png') : undefined} resizeMode="stretch" style={styles.gradient} imageStyle={styles.gradientImage}>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: !verified }} disabled={!verified} onPress={() => own ? router.push('/(tabs)/bookings') : router.push({ pathname: '/booking/[username]', params: { username: profile.username } })} style={({ pressed }) => [styles.ctaMain, compact && styles.ctaMainCompact, pressed && styles.pressed]}>
            <View style={styles.ctaRow}><Text style={[styles.ctaTitle, compact && styles.ctaTitleCompact, !verified && styles.unavailableText]}>{copy('Booking', 'Réservation', 'Запись')}</Text><Image testID="profile-booking-icon" source={require('../../assets/profile/booking.png')} style={[styles.ctaIcon, compact && styles.ctaIconCompact, !verified && styles.unavailableIcon]} /></View>
            <View style={styles.ctaRow}><Text style={[styles.ctaSubtitle, !verified && styles.unavailableText]}>{!verified ? copy('Available after verification', 'Disponible après vérification', 'Доступно после верификации') : own ? copy('Manage appointments', 'Gérer les rendez-vous', 'Управлять записями') : copy('Book appointment', 'Prendre rendez-vous', 'Записаться')}</Text>{verified ? <Text style={styles.arrow}>↗</Text> : null}</View>
          </Pressable>
          {own && verified ? <Pressable accessibilityRole="button" onPress={() => router.push('/artist-dashboard/preferences')} style={styles.bookingSettings}><Text style={styles.settingsText}>{copy('Booking settings', 'Paramètres de réservation', 'Настройки записи')} →</Text></Pressable> : null}
        </ImageBackground>
      </View>
    </View> : null}
  </View>;
}

function Stat({ value, label }: { value: number; label: string }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

export const profileActionStyles = StyleSheet.create({
  button: { flex: 1, minWidth: 0, minHeight: 38, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#04c5bf' },
  secondary: { backgroundColor: '#031b27', borderWidth: 1, borderColor: 'rgba(4,197,191,.22)' },
  text: { fontSize: 12, fontWeight: '800', color: '#00131d' },
  secondaryText: { color: '#dffefe' },
});

const styles = StyleSheet.create({
  profileHeader: { paddingTop: 14, paddingHorizontal: 12, paddingBottom: 12, borderWidth: 1, borderColor: '#012c35', backgroundColor: '#00131d', borderRadius: 18 },
  identityRow: { flexDirection: 'row', gap: 14, alignItems: 'center', minHeight: 70, marginBottom: 10 },
  avatarWrap: { width: 70, height: 70 }, identity: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 }, nameAndCheck: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0, maxWidth: '100%', flexShrink: 1 },
  username: { color: '#f4ffff', fontSize: 23, lineHeight: 26, fontWeight: '900', flexShrink: 1, minWidth: 0, letterSpacing: -.5 }, usernameCompact: { fontSize: 20, lineHeight: 23 },
  verified: { width: 21, height: 21, flexShrink: 0, borderRadius: 11, backgroundColor: '#04c5bf', borderWidth: 1, borderColor: 'rgba(145,255,248,.8)', alignItems: 'center', justifyContent: 'center' }, check: { width: 15, height: 15 },
  badge: { paddingVertical: 4, paddingHorizontal: 7, borderRadius: 99, borderWidth: 1, borderColor: 'rgba(4,197,191,.25)', backgroundColor: 'rgba(4,197,191,.12)' }, badgeText: { color: '#6ef6f0', fontSize: 10, fontWeight: '800' },
  subline: { color: 'rgba(223,252,255,.72)', fontSize: 12, lineHeight: 15, marginTop: 4 }, startVerification: { color: '#04c5bf', fontSize: 11, marginTop: 5 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  stats: { flexDirection: 'row', gap: 6, marginBottom: 8 }, stat: { flex: 1, minWidth: 0, paddingVertical: 6, paddingHorizontal: 5, borderRadius: 11, alignItems: 'center', backgroundColor: '#031b27', borderWidth: 1, borderColor: 'rgba(4,197,191,.08)' }, statValue: { color: '#fff', fontSize: 15, fontWeight: '900' }, statLabel: { color: '#84aeb2', fontSize: 10, marginTop: 1, textAlign: 'center' },
  bioCard: { paddingVertical: 9, paddingHorizontal: 11, borderRadius: 11, backgroundColor: '#031b27', borderWidth: 1, borderColor: 'rgba(4,197,191,.08)' }, bio: { color: '#d9eeee', fontSize: 12, lineHeight: 17 },
  stylesCard: { marginTop: 8, paddingVertical: 10, paddingHorizontal: 11, borderRadius: 12, backgroundColor: '#031b27', borderWidth: 1, borderColor: 'rgba(4,197,191,.12)' }, stylesHeading: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }, eyebrow: { color: '#7fa7ab', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '800' }, stylesTitle: { color: '#ecffff', fontSize: 13, fontWeight: '800' }, manageStyles: { color: '#04c5bf', fontSize: 10, fontWeight: '700' },
  styleChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 }, styleChip: { color: '#a8fffa', fontSize: 10, paddingVertical: 4, paddingHorizontal: 7, borderRadius: 7, backgroundColor: 'rgba(4,197,191,.1)', borderWidth: 1, borderColor: 'rgba(4,197,191,.15)' }, emptyStyles: { color: '#7fa7ab', fontSize: 11, lineHeight: 16 },
  primaryActions: { flexDirection: 'row', gap: 8, marginTop: 9 }, cta: { flex: 1, minWidth: 0, borderRadius: 12, borderWidth: 1, overflow: 'hidden' }, portfolio: { borderColor: 'rgba(185,255,250,.64)', backgroundColor: '#04c5bf' }, booking: { borderColor: 'rgba(255,140,190,.48)', backgroundColor: '#ee0c6f' }, unavailable: { backgroundColor: '#0b222e', borderColor: '#284451' }, gradient: { flex: 1 }, gradientImage: { width: '100%', height: '100%' },
  ctaMain: { flex: 1, minWidth: 0, minHeight: 83, paddingVertical: 10, paddingHorizontal: 11, gap: 9, justifyContent: 'space-between' }, ctaMainCompact: { padding: 9 }, ctaRow: { flexDirection: 'row', minWidth: 0, alignItems: 'center', justifyContent: 'space-between', gap: 5 }, ctaTitle: { color: '#fff', fontSize: 16, fontWeight: '800', flexShrink: 1, minWidth: 0 }, ctaTitleCompact: { fontSize: 15 }, ctaIcon: { width: 22, height: 22, flexShrink: 0 }, ctaIconCompact: { width: 19, height: 19 }, ctaSubtitle: { flex: 1, minWidth: 0, color: '#fff', fontSize: 11, lineHeight: 15 }, arrow: { color: '#fff', fontSize: 18, flexShrink: 0 }, dark: { color: '#001b21' }, unavailableText: { color: '#a9c0c7' }, unavailableIcon: { tintColor: '#a9c0c7' },
  bookingSettings: { paddingVertical: 8, paddingHorizontal: 11, borderTopWidth: 1, borderColor: 'rgba(255,255,255,.22)', backgroundColor: 'rgba(0,9,16,.22)' }, settingsText: { color: '#fff', fontSize: 11, fontWeight: '700' }, pressed: { opacity: .75 },
});

import { useState } from 'react';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { Avatar } from '@/components/avatar';
import { appLanguage, t } from '@/i18n';
import { useNotifications } from '@/notifications/notification-context';
import { colors, layout, spacing, typography } from '@/theme';


type BrandHeaderProps = {
  showNotifications?: boolean;
  title?: string;
  showQuickMatch?: boolean;
};

type RecommendedProfile = {
  id: number;
  username: string;
  tag: string | null;
  account_type: 'regular' | 'tattoo_artist';
  is_verified_artist: boolean;
  profile_image_url: string | null;
};

type ProfileSearchResponse = {
  count: number;
  results: RecommendedProfile[];
};

const MENU_ICONS = {
  healing: require('../../assets/web-icons/healing.png'),
  styleMatch: require('../../assets/web-icons/palette.png'),
  bookmarks: require('../../assets/web-icons/bookmark.png'),
  contests: require('../../assets/web-icons/trophy.png'),
  cleanSlate: require('../../assets/web-icons/sprout.png'),
  healthSafety: require('../../assets/web-icons/health-safety.png'),
} as const;

const COPY = {
  en: {
    recommendations: 'Recommendations',
    recommendationsHint: 'Explore tattoo artists and find profiles worth following.',
    discover: 'Discover',
    viewProfile: 'View profile',
    noArtists: 'No tattoo artists yet',
    menu: 'Menu',
    healing: 'Healing',
    styleMatch: 'Style Match',
    bookmarks: 'Bookmarks',
    contests: 'Contests',
    cleanSlate: 'Clean slate',
    reportProblem: 'Report a problem',
    healthSafety: 'Health & safety',
    legal: 'Legal',
    legalCenter: 'Legal center',
    language: 'Language',
    logout: 'Log out',
    comingSoon: 'Coming soon',
    unavailable: 'Recommendations are unavailable right now.',
  },
  fr: {
    recommendations: 'Recommandations',
    recommendationsHint: 'Découvrez des tatoueurs et des profils à suivre.',
    discover: 'Découvrir',
    viewProfile: 'Voir le profil',
    noArtists: 'Aucun tatoueur pour le moment',
    menu: 'Menu',
    healing: 'Cicatrisation',
    styleMatch: 'Style Match',
    bookmarks: 'Enregistrements',
    contests: 'Concours',
    cleanSlate: 'Nouveau départ',
    reportProblem: 'Signaler un problème',
    healthSafety: 'Santé et sécurité',
    legal: 'Juridique',
    legalCenter: 'Centre juridique',
    language: 'Langue',
    logout: 'Se déconnecter',
    comingSoon: 'Bientôt disponible',
    unavailable: 'Les recommandations sont indisponibles pour le moment.',
  },
  ru: {
    recommendations: 'Рекомендации',
    recommendationsHint: 'Открой для себя тату-мастеров и профили, на которые стоит подписаться.',
    discover: 'Открывай',
    viewProfile: 'Открыть профиль',
    noArtists: 'Пока нет тату-мастеров',
    menu: 'Меню',
    healing: 'Заживление',
    styleMatch: 'Style Match',
    bookmarks: 'Закладки',
    contests: 'Конкурсы',
    cleanSlate: 'Чистый лист',
    reportProblem: 'Сообщить о проблеме',
    healthSafety: 'Здоровье и безопасность',
    legal: 'Документы',
    legalCenter: 'Юридический центр',
    language: 'Язык',
    logout: 'Выйти',
    comingSoon: 'Скоро',
    unavailable: 'Рекомендации сейчас недоступны.',
  },
} as const;

function copy() {
  return COPY[appLanguage as keyof typeof COPY] ?? COPY.en;
}

export function BrandHeader({
  showNotifications = true,
  title,
  showQuickMatch = false,
}: BrandHeaderProps) {
  const { request, signOut, status, user } = useAuth();
  const { unreadCount } = useNotifications();
  const ui = copy();
  const badge = unreadCount > 99 ? '99+' : String(unreadCount);
  const isSectionHeader = Boolean(title && status === 'authenticated');
  const [recommendationsOpen, setRecommendationsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [recommendations, setRecommendations] = useState<RecommendedProfile[]>([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [recommendationsError, setRecommendationsError] = useState(false);

  const openRecommendations = async () => {
    setMenuOpen(false);
    setRecommendationsOpen(true);
    setRecommendationsLoading(true);
    setRecommendationsError(false);
    try {
      const response = await request<ProfileSearchResponse>('/search/?type=artists');
      setRecommendations(response.results.slice(0, 5));
    } catch {
      setRecommendations([]);
      setRecommendationsError(true);
    } finally {
      setRecommendationsLoading(false);
    }
  };

  const openProfile = (username: string) => {
    setRecommendationsOpen(false);
    router.push({ pathname: '/profile/[username]', params: { username } });
  };

  const closeMenuAndGo = (path: '/healing' | '/health-safety' | '/settings' | '/(tabs)/match') => {
    setMenuOpen(false);
    router.push(path);
  };

  const comingSoon = (label: string) => {
    Alert.alert(ui.comingSoon, label);
  };

  return (
    <>
      <View style={[styles.container, isSectionHeader && styles.sectionContainer]}>
        {isSectionHeader ? (
          <>
            <Pressable
              accessibilityLabel={t('profile')}
              accessibilityRole="button"
              onPress={() => router.push('/(tabs)/profile')}
              style={({ pressed }) => [styles.profileButton, pressed && styles.pressed]}
            >
              <Avatar
                uri={user?.profile_image_url}
                label={user?.username}
                size={42}
                ring
              />
            </Pressable>
            <Text numberOfLines={1} style={styles.sectionTitle}>{title}</Text>
          </>
        ) : (
          <Image
            source={require('../../assets/tatzo7.png')}
            resizeMode="contain"
            style={styles.logo}
            accessibilityLabel="Tatzo"
          />
        )}

        <View style={styles.actions}>
          {showQuickMatch && status === 'authenticated' ? (
            <Pressable
              accessibilityLabel={ui.recommendations}
              accessibilityRole="button"
              onPress={() => void openRecommendations()}
              style={({ pressed }) => [styles.topbarButton, pressed && styles.pressed]}
            >
              <Text style={styles.recommendationsSymbol}>✦</Text>
            </Pressable>
          ) : null}
          {showNotifications && status === 'authenticated' ? (
            <Pressable
              accessibilityLabel={t('notifications')}
              accessibilityRole="button"
              onPress={() => router.push('/notifications')}
              style={({ pressed }) => [styles.notificationButton, pressed && styles.pressed]}
            >
              <Image
                source={require('../../assets/web-icons/notifications.png')}
                resizeMode="contain"
                style={styles.notificationIcon}
              />
              {unreadCount ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badge}</Text>
                </View>
              ) : null}
            </Pressable>
          ) : null}
          {isSectionHeader ? (
            <Pressable
              accessibilityLabel={ui.menu}
              accessibilityRole="button"
              onPress={() => setMenuOpen(true)}
              style={({ pressed }) => [styles.topbarButton, pressed && styles.pressed]}
            >
              <Text style={styles.menuSymbol}>☰</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <Modal
        animationType="fade"
        onRequestClose={() => setRecommendationsOpen(false)}
        transparent
        visible={recommendationsOpen}
      >
        <Pressable style={styles.backdrop} onPress={() => setRecommendationsOpen(false)}>
          <Pressable onPress={(event) => event.stopPropagation()} style={[styles.panel, styles.recommendationsPanel]}>
            <Pressable
              accessibilityLabel={t('close')}
              accessibilityRole="button"
              onPress={() => setRecommendationsOpen(false)}
              style={styles.closeButton}
            >
              <Text style={styles.closeText}>×</Text>
            </Pressable>
            <Text style={styles.kicker}>{ui.discover}</Text>
            <Text style={styles.panelTitle}>{ui.recommendations}</Text>
            <Text style={styles.panelHint}>{ui.recommendationsHint}</Text>

            {recommendationsLoading ? (
              <ActivityIndicator color={colors.primary} style={styles.loader} />
            ) : recommendationsError ? (
              <Text style={styles.emptyText}>{ui.unavailable}</Text>
            ) : recommendations.length ? (
              <ScrollView contentContainerStyle={styles.recommendationList} showsVerticalScrollIndicator={false}>
                {recommendations.map((profile) => (
                  <Pressable
                    accessibilityRole="button"
                    key={profile.id}
                    onPress={() => openProfile(profile.username)}
                    style={({ pressed }) => [styles.recommendationCard, pressed && styles.pressed]}
                  >
                    <Avatar
                      uri={profile.profile_image_url}
                      label={profile.username}
                      size={52}
                      ring={profile.is_verified_artist}
                    />
                    <View style={styles.recommendationMain}>
                      <View style={styles.recommendationNameRow}>
                        <Text numberOfLines={1} style={styles.recommendationName}>{profile.username}</Text>
                        {profile.is_verified_artist ? <Text style={styles.verified}>✓</Text> : null}
                      </View>
                      <Text numberOfLines={1} style={styles.recommendationTag}>
                        {profile.tag ? `@${profile.tag}` : ui.styleMatch.replace('Style Match', 'Tattoo artist')}
                      </Text>
                      <Text style={styles.viewProfile}>{ui.viewProfile}</Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.emptyText}>{ui.noArtists}</Text>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
        transparent
        visible={menuOpen}
      >
        <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)}>
          <Pressable onPress={(event) => event.stopPropagation()} style={[styles.panel, styles.menuPanel]}>
            <View style={styles.menuHead}>
              <Text style={styles.panelTitle}>{ui.menu}</Text>
              <Pressable
                accessibilityLabel={t('close')}
                accessibilityRole="button"
                onPress={() => setMenuOpen(false)}
                style={styles.closeButtonInline}
              >
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>

            <View style={styles.menuGrid}>
              <MenuTile icon={MENU_ICONS.healing} label={ui.healing} onPress={() => closeMenuAndGo('/healing')} />
              <MenuTile icon={MENU_ICONS.styleMatch} label={ui.styleMatch} onPress={() => closeMenuAndGo('/(tabs)/match')} />
              <MenuTile icon={MENU_ICONS.bookmarks} label={ui.bookmarks} onPress={() => comingSoon(ui.bookmarks)} />
              <MenuTile icon={MENU_ICONS.contests} label={ui.contests} onPress={() => comingSoon(ui.contests)} />
              <MenuTile icon={MENU_ICONS.cleanSlate} label={ui.cleanSlate} onPress={() => comingSoon(ui.cleanSlate)} />
              <MenuTile accent label={ui.reportProblem} symbol="⚠" onPress={() => comingSoon(ui.reportProblem)} />
              <MenuTile icon={MENU_ICONS.healthSafety} label={ui.healthSafety} onPress={() => closeMenuAndGo('/health-safety')} />
            </View>

            <View style={styles.divider} />
            <Text style={styles.legalLabel}>{ui.legal.toUpperCase()}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => closeMenuAndGo('/settings')}
              style={({ pressed }) => [styles.wideMenuItem, pressed && styles.pressed]}
            >
              <Text style={styles.wideSymbol}>⚖</Text>
              <Text style={styles.wideMenuText}>{ui.legalCenter}</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => closeMenuAndGo('/settings')}
              style={({ pressed }) => [styles.languageRow, pressed && styles.pressed]}
            >
              <View>
                <Text style={styles.languageLabel}>{ui.language}</Text>
                <Text style={styles.languageValue}>{appLanguage.toUpperCase()}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setMenuOpen(false);
                void signOut();
              }}
              style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed]}
            >
              <Text style={styles.logoutText}>{ui.logout}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

type MenuTileProps = {
  label: string;
  onPress: () => void;
  icon?: ImageSourcePropType;
  symbol?: string;
  accent?: boolean;
};

function MenuTile({ label, onPress, icon, symbol, accent = false }: MenuTileProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.menuTile, pressed && styles.pressed]}
    >
      {icon ? (
        <Image accessibilityIgnoresInvertColors resizeMode="contain" source={icon} style={styles.menuTileIcon} />
      ) : (
        <Text style={[styles.menuTileSymbol, accent && styles.menuTileSymbolAccent]}>{symbol}</Text>
      )}
      <Text numberOfLines={2} style={styles.menuTileText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
    position: 'relative',
  },
  sectionContainer: {
    minHeight: 58,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: spacing.sm,
  },
  logo: { width: 132, height: 36 },
  profileButton: { width: 42, height: 42, borderRadius: 21 },
  sectionTitle: {
    flex: 1,
    color: colors.accent,
    ...typography.sectionTitle,
  },
  actions: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  topbarButton: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: layout.touchTarget / 2,
  },
  recommendationsSymbol: {
    color: colors.primary,
    fontSize: 27,
    lineHeight: 30,
    textShadowColor: 'rgba(4,197,191,.28)',
    textShadowRadius: 12,
  },
  menuSymbol: { color: colors.primary, fontSize: 29, lineHeight: 31, fontWeight: '700' },
  notificationButton: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: layout.touchTarget / 2,
  },
  notificationIcon: { width: 24, height: 24, tintColor: colors.primary },
  badge: {
    position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18,
    paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 9,
    backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.background,
  },
  badgeText: { color: colors.white, fontSize: 8, fontWeight: '900' },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,.58)',
    paddingHorizontal: 12,
    paddingBottom: 88,
  },
  panel: {
    width: '100%',
    maxHeight: '76%',
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: 'rgba(4,197,191,.24)',
    backgroundColor: 'rgba(0,13,24,.985)',
    shadowColor: '#000',
    shadowOpacity: 0.58,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 18,
  },
  recommendationsPanel: { borderRadius: 28, padding: 20 },
  menuPanel: { borderRadius: 26, padding: 18 },
  closeButton: {
    position: 'absolute', top: 12, right: 12, width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.06)', zIndex: 2,
  },
  closeButtonInline: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,.06)',
  },
  closeText: { color: colors.text, fontSize: 29, lineHeight: 31, fontWeight: '500' },
  kicker: {
    alignSelf: 'flex-start', color: colors.accent, borderWidth: 1,
    borderColor: 'rgba(238,12,111,.34)', backgroundColor: 'rgba(238,12,111,.08)',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, fontSize: 11, fontWeight: '900',
    letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 10,
  },
  panelTitle: { color: colors.text, fontSize: 22, fontWeight: '900' },
  panelHint: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginTop: 7, marginBottom: 14, paddingRight: 30 },
  loader: { paddingVertical: 42 },
  recommendationList: { gap: 10, paddingBottom: 2 },
  recommendationCard: {
    minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13,
    borderRadius: 18, borderWidth: 1, borderColor: 'rgba(4,197,191,.16)',
    backgroundColor: 'rgba(0,26,46,.52)',
  },
  recommendationMain: { flex: 1, minWidth: 0 },
  recommendationNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  recommendationName: { color: colors.text, fontSize: 16, fontWeight: '900', flexShrink: 1 },
  verified: { color: colors.primary, fontWeight: '900' },
  recommendationTag: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  viewProfile: { color: colors.primary, fontSize: 12, fontWeight: '900', textAlign: 'right', marginTop: 10 },
  emptyText: { color: colors.textMuted, textAlign: 'center', paddingVertical: 34, lineHeight: 20 },
  menuHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  menuGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  menuTile: {
    width: '48.5%', minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 13, paddingVertical: 12, borderRadius: 17,
    backgroundColor: 'rgba(4,197,191,.07)', borderWidth: 1, borderColor: 'rgba(4,197,191,.14)',
  },
  menuTileIcon: { width: 28, height: 28, flexShrink: 0 },
  menuTileSymbol: { width: 28, color: colors.primary, fontSize: 23, textAlign: 'center', fontWeight: '700' },
  menuTileSymbolAccent: { color: colors.accent },
  menuTileText: { flex: 1, color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: '800' },
  divider: { height: 1, backgroundColor: 'rgba(4,197,191,.12)', marginTop: 16, marginBottom: 12 },
  legalLabel: { color: colors.textSubtle, fontSize: 11, fontWeight: '900', letterSpacing: 1.2, marginBottom: 8 },
  wideMenuItem: {
    minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 14,
    borderRadius: 17, backgroundColor: 'rgba(4,197,191,.07)', borderWidth: 1, borderColor: 'rgba(4,197,191,.14)',
  },
  wideSymbol: { width: 28, color: colors.primary, fontSize: 20, textAlign: 'center' },
  wideMenuText: { color: colors.text, fontSize: 13, fontWeight: '800' },
  languageRow: {
    minHeight: 60, marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(4,197,191,.12)',
  },
  languageLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
  languageValue: { color: colors.text, fontSize: 13, fontWeight: '900', marginTop: 2 },
  chevron: { color: colors.textSubtle, fontSize: 25 },
  logoutButton: {
    minHeight: 54, marginTop: 14, alignItems: 'center', justifyContent: 'center', borderRadius: 17,
    borderWidth: 1, borderColor: 'rgba(238,12,111,.40)', backgroundColor: 'rgba(238,12,111,.08)',
  },
  logoutText: { color: colors.accent, fontSize: 14, fontWeight: '900' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
});
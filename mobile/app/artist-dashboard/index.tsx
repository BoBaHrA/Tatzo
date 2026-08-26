import { useCallback, useMemo, useState } from 'react';
import { Redirect, router, useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';

import type { ArtistBookingStatus, ArtistDashboard } from '@/api/types';
import { fetchArtistDashboard, updateArtistBookingStatus } from '@/artist-dashboard/artist-dashboard-api';
import { ArtistTimeline, WorkloadStrip } from '@/artist-dashboard/dashboard-components';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { userFacingError } from '@/errors';
import { appLanguage, t } from '@/i18n';
import { colors, spacing } from '@/theme';


type DashboardDestination = {
  key: string;
  label: string;
  icon: ImageSourcePropType;
  onPress: () => void;
  active?: boolean;
};

const WEB_DASH_ICONS = {
  dashboard: require('../../assets/dashboard-icons/dashboard.png'),
  calendar: require('../../assets/dashboard-icons/calendar.png'),
  bookings: require('../../assets/dashboard-icons/inbox.png'),
  messages: require('../../assets/dashboard-icons/message.png'),
  portfolio: require('../../assets/dashboard-icons/image.png'),
  clients: require('../../assets/dashboard-icons/clients.png'),
  settings: require('../../assets/dashboard-icons/setting.png'),
} satisfies Record<string, ImageSourcePropType>;

function copy(en: string, fr: string, ru: string) {
  if (appLanguage === 'fr') return fr;
  if (appLanguage === 'ru') return ru;
  return en;
}

function greeting(username: string) {
  const hour = new Date().getHours();
  const salutation = hour < 12
    ? copy('Good morning', 'Bonjour', 'Доброе утро')
    : hour < 18
      ? copy('Good afternoon', 'Bon après-midi', 'Добрый день')
      : copy('Good evening', 'Bonsoir', 'Добрый вечер');
  return `${salutation}, ${username}`;
}

function todayLabel() {
  return new Intl.DateTimeFormat(appLanguage, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());
}

export default function ArtistDashboardScreen() {
  const { request, status, user } = useAuth();
  const [dashboard, setDashboard] = useState<ArtistDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState<ArtistBookingStatus | null>(null);

  const load = useCallback(async () => {
    if (status !== 'authenticated' || !user?.is_verified_artist) return;
    setLoading(true);
    setLoadError(false);
    try {
      setDashboard(await fetchArtistDashboard(request));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [request, status, user?.is_verified_artist]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const destinations = useMemo<DashboardDestination[]>(() => [
    { key: 'dashboard', label: copy('Dashboard', 'Tableau', 'Главная'), icon: WEB_DASH_ICONS.dashboard, active: true, onPress: () => undefined },
    { key: 'calendar', label: copy('Calendar', 'Calendrier', 'Календарь'), icon: WEB_DASH_ICONS.calendar, onPress: () => router.push('/artist-dashboard/calendar') },
    { key: 'bookings', label: t('bookings'), icon: WEB_DASH_ICONS.bookings, onPress: () => router.push('/(tabs)/bookings') },
    { key: 'messages', label: t('chats'), icon: WEB_DASH_ICONS.messages, onPress: () => router.push('/(tabs)/chats') },
    { key: 'portfolio', label: t('portfolio'), icon: WEB_DASH_ICONS.portfolio, onPress: () => router.push('/manage-portfolio') },
    { key: 'clients', label: t('healingClients'), icon: WEB_DASH_ICONS.clients, onPress: () => router.push('/healing') },
    { key: 'settings', label: copy('Settings', 'Paramètres', 'Настройки'), icon: WEB_DASH_ICONS.settings, onPress: () => router.push('/artist-dashboard/preferences') },
  ], []);

  if (status === 'anonymous') return <Redirect href="/(auth)/login" />;
  if (status === 'authenticated' && !user?.is_verified_artist) return <Redirect href="/(tabs)/profile" />;

  const changeStatus = async (nextStatus: ArtistBookingStatus) => {
    if (!dashboard || nextStatus === dashboard.settings.booking_status) return;
    setUpdatingStatus(nextStatus);
    setActionError('');
    try {
      const settings = await updateArtistBookingStatus(request, nextStatus);
      setDashboard((current) => current ? { ...current, settings } : current);
    } catch (caught) {
      setActionError(userFacingError(caught));
    } finally {
      setUpdatingStatus(null);
    }
  };

  if (loading || status === 'loading') {
    return <Screen contentStyle={styles.centerState}><ActivityIndicator color={colors.primary} size="large" /><Text style={styles.muted}>{t('artistDashboardLoading')}</Text></Screen>;
  }

  if (loadError || !dashboard || !user) {
    return (
      <Screen contentStyle={styles.centerState}>
        <Text style={styles.stateTitle}>{t('artistDashboardUnavailable')}</Text>
        <Text style={styles.muted}>{t('artistDashboardLoadError')}</Text>
        <Button label={t('retry')} onPress={() => void load()} />
        <Button label={t('close')} onPress={() => router.back()} variant="secondary" />
      </Screen>
    );
  }

  const stats = [
    { value: dashboard.stats.today_sessions, label: t('artistTodaySessions'), icon: WEB_DASH_ICONS.calendar },
    { value: dashboard.stats.pending_requests, label: t('artistPendingRequests'), icon: WEB_DASH_ICONS.bookings, accent: true },
    { value: dashboard.stats.upcoming_consultations, label: t('artistUpcomingConsultations'), icon: WEB_DASH_ICONS.clients },
    { value: dashboard.stats.unread_messages, label: t('artistUnreadMessages'), icon: WEB_DASH_ICONS.messages, accent: true },
  ];

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.brandRow}>
        <Image source={require('../../assets/tatzo7.png')} resizeMode="contain" style={styles.logo} />
        <Pressable accessibilityLabel={t('close')} accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.close, pressed && styles.pressed]}><Text style={styles.closeText}>×</Text></Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.navContent} horizontal showsHorizontalScrollIndicator={false} style={styles.navRail}>
        {destinations.map((item) => (
          <Pressable accessibilityLabel={item.label} accessibilityRole="button" accessibilityState={{ selected: item.active }} key={item.key} onPress={item.onPress} style={({ pressed }) => [styles.navItem, item.active && styles.navItemActive, pressed && styles.pressed]}>
            <Image source={item.icon} resizeMode="contain" style={[styles.navIcon, { tintColor: item.active ? colors.primary : '#8ca8ad' }]} />
            <Text numberOfLines={1} style={[styles.navLabel, item.active && styles.navLabelActive]}>{item.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.header}>
        <View style={styles.headerCopy}><Text style={styles.heading}>{greeting(user.username)}</Text><Text style={styles.date}>{todayLabel()}</Text></View>
        <Pressable accessibilityLabel={t('artistManualCreate')} accessibilityRole="button" onPress={() => router.push('/artist-dashboard/create-appointment')} style={({ pressed }) => [styles.plus, pressed && styles.pressed]}><Text style={styles.plusText}>+</Text></Pressable>
      </View>

      <View style={styles.statusBar}>
        <View style={styles.statusCopy}><View style={[styles.statusDot, !dashboard.settings.bookings_enabled && styles.statusDotPaused]} /><View style={styles.statusTextWrap}><Text style={styles.statusTitle}>{dashboard.settings.booking_status_label}</Text><Text style={styles.statusHint}>{t('artistBookingStatusHint')}</Text></View></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusOptions}>
          {dashboard.settings.booking_status_options.map((option) => {
            const selected = option.value === dashboard.settings.booking_status;
            const updating = updatingStatus === option.value;
            return <Pressable accessibilityRole="button" accessibilityState={{ selected }} disabled={Boolean(updatingStatus)} key={option.value} onPress={() => void changeStatus(option.value)} style={({ pressed }) => [styles.statusChip, selected && styles.statusChipSelected, pressed && styles.pressed]}>{updating ? <ActivityIndicator color={selected ? '#001014' : colors.primary} size="small" /> : <Text style={[styles.statusChipText, selected && styles.statusChipTextSelected]}>{option.label}</Text>}</Pressable>;
          })}
        </ScrollView>
      </View>
      {actionError ? <Text style={styles.error}>{actionError}</Text> : null}

      <View style={styles.statStack}>
        {stats.map((stat) => <View key={stat.label} style={styles.statCard}><Image source={stat.icon} resizeMode="contain" style={[styles.statIcon, { tintColor: stat.accent ? colors.accent : colors.primary }]} /><View style={styles.statCopy}><Text style={styles.statValue}>{stat.value}</Text><Text style={styles.statLabel}>{stat.label}</Text></View></View>)}
      </View>

      <Text style={styles.sectionTitle}>✦ {copy('Smart insights', 'Conseils intelligents', 'Умные подсказки')}</Text>
      <View style={styles.insightStack}>
        <Insight accent text={copy('Your booking settings are connected to the client booking wizard.', 'Vos paramètres de réservation sont connectés au parcours client.', 'Настройки записи напрямую связаны с формой бронирования клиента.')} />
        <Insight text={copy('Active styles are shown directly in your public booking form.', 'Les styles actifs apparaissent dans votre formulaire public.', 'Активные стили отображаются прямо в публичной форме записи.')} />
        <Insight accent text={copy('Pending requests should be answered quickly to improve conversion.', 'Répondez rapidement aux demandes en attente pour améliorer la conversion.', 'На ожидающие заявки лучше отвечать быстро — это повышает конверсию.')} />
        <Insight text={copy('Add portfolio works to make your booking page more convincing.', 'Ajoutez des œuvres au portfolio pour renforcer votre page de réservation.', 'Добавляй работы в портфолио — так страница записи будет убедительнее.')} />
      </View>

      <View style={styles.section}><View style={styles.sectionHead}><Text style={styles.sectionTitle}>{t('artistWorkload')}</Text><Pressable onPress={() => router.push('/artist-dashboard/schedule')}><Text style={styles.sectionLink}>{t('artistManageSchedule')}</Text></Pressable></View><WorkloadStrip days={dashboard.workload} /></View>
      <View style={styles.section}><View style={styles.sectionHead}><Text style={styles.sectionTitle}>{t('artistUpcoming')}</Text><Pressable onPress={() => router.push('/artist-dashboard/calendar')}><Text style={styles.sectionLink}>{copy('Calendar', 'Calendrier', 'Календарь')}</Text></Pressable></View><ArtistTimeline items={dashboard.timeline} /></View>
    </Screen>
  );
}

function Insight({ text, accent = false }: { text: string; accent?: boolean }) {
  return <View style={[styles.insight, accent && styles.insightAccent]}><Text style={styles.insightText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  centerState: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  stateTitle: { color: colors.text, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  muted: { color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
  brandRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logo: { width: 122, height: 34 },
  close: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.04)' },
  closeText: { color: colors.textMuted, fontSize: 27, lineHeight: 29 },
  navRail: { marginHorizontal: -spacing.md },
  navContent: { paddingHorizontal: spacing.md, gap: 6, paddingVertical: 8 },
  navItem: { minWidth: 66, height: 54, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 8 },
  navItemActive: { backgroundColor: 'rgba(4,197,191,.12)', borderLeftWidth: 2, borderLeftColor: colors.primary },
  navIcon: { width: 19, height: 19 },
  navLabel: { color: '#8ca8ad', fontSize: 9, fontWeight: '800' },
  navLabelActive: { color: colors.primary },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, paddingTop: spacing.xs },
  headerCopy: { flex: 1, gap: 4 },
  heading: { color: colors.white, fontSize: 27, lineHeight: 32, fontWeight: '900', letterSpacing: -.6 },
  date: { color: colors.textMuted, fontSize: 13, textTransform: 'capitalize' },
  plus: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  plusText: { color: '#001014', fontSize: 26, fontWeight: '900', lineHeight: 28 },
  statusBar: { gap: spacing.sm, borderRadius: 18, padding: spacing.md, backgroundColor: 'rgba(255,255,255,.035)', borderWidth: 1, borderColor: 'rgba(255,255,255,.075)' },
  statusCopy: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  statusDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.success },
  statusDotPaused: { backgroundColor: colors.accent },
  statusTextWrap: { flex: 1, minWidth: 0, gap: 2 },
  statusTitle: { color: colors.white, fontSize: 14, fontWeight: '900' },
  statusHint: { color: colors.textMuted, fontSize: 10, lineHeight: 14 },
  statusOptions: { gap: 7, paddingRight: 4 },
  statusChip: { minHeight: 34, paddingHorizontal: 12, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,.10)', backgroundColor: 'rgba(255,255,255,.025)' },
  statusChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  statusChipText: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },
  statusChipTextSelected: { color: '#001014' },
  error: { color: colors.danger, lineHeight: 20 },
  statStack: { gap: 10 },
  statCard: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: 18, backgroundColor: 'rgba(255,255,255,.035)', borderWidth: 1, borderColor: 'rgba(255,255,255,.075)' },
  statIcon: { width: 24, height: 24 },
  statCopy: { flex: 1, minWidth: 0, gap: 2 },
  statValue: { color: colors.white, fontSize: 29, lineHeight: 32, fontWeight: '900' },
  statLabel: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  section: { gap: spacing.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md },
  sectionTitle: { color: colors.white, fontSize: 18, lineHeight: 23, fontWeight: '900' },
  sectionLink: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  insightStack: { gap: 10 },
  insight: { padding: 16, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,.08)', borderLeftWidth: 3, borderLeftColor: colors.primary, backgroundColor: 'rgba(4,197,191,.045)' },
  insightAccent: { borderLeftColor: colors.accent, backgroundColor: 'rgba(238,12,111,.045)' },
  insightText: { color: 'rgba(234,255,255,.82)', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  pressed: { opacity: .72, transform: [{ scale: .985 }] },
});

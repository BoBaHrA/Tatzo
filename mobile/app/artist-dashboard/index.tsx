import { useCallback, useMemo, useState } from 'react';
import { Redirect, router, useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ImageSourcePropType,
} from 'react-native';

import type {
  Appointment,
  ArtistBookingPreferences,
  ArtistBookingPreferencesUpdate,
  ArtistBookingStatus,
  ArtistDashboard,
  ChatThreadSummary,
  PortfolioWork,
} from '@/api/types';
import {
  fetchArtistBookingPreferences,
  fetchArtistDashboard,
  saveArtistBookingPreferences,
  updateArtistBookingStatus,
} from '@/artist-dashboard/artist-dashboard-api';
import { ArtistTimeline, WorkloadStrip } from '@/artist-dashboard/dashboard-components';
import { useAuth } from '@/auth/auth-context';
import { fetchAppointments } from '@/booking/booking-api';
import { fetchChats } from '@/chat/chat-api';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { userFacingError } from '@/errors';
import { appLanguage, t } from '@/i18n';
import { fetchPortfolio } from '@/publishing/publishing-api';
import { colors, spacing } from '@/theme';


type DashboardPanelKey =
  | 'dashboard'
  | 'calendar'
  | 'bookings'
  | 'projects'
  | 'messages'
  | 'portfolio'
  | 'clients'
  | 'reviews'
  | 'statistics'
  | 'settings';

type DashboardDestination = {
  key: DashboardPanelKey;
  label: string;
  icon: ImageSourcePropType;
};

const WEB_DASH_ICONS = {
  dashboard: require('../../assets/dashboard-icons/dashboard.png'),
  calendar: require('../../assets/dashboard-icons/calendar.png'),
  bookings: require('../../assets/dashboard-icons/inbox.png'),
  projects: require('../../assets/web-icons/palette.png'),
  messages: require('../../assets/dashboard-icons/message.png'),
  portfolio: require('../../assets/dashboard-icons/image.png'),
  clients: require('../../assets/dashboard-icons/clients.png'),
  reviews: require('../../assets/dashboard-icons/reviews.png'),
  statistics: require('../../assets/dashboard-icons/statistics.png'),
  settings: require('../../assets/dashboard-icons/setting.png'),
} satisfies Record<DashboardPanelKey, ImageSourcePropType>;

const STAT_GRADIENT = require('../../assets/dashboard-icons/stat-gradient.png');

const RULE_TONES: Record<ArtistBookingStatus, { color: string; symbol: string }> = {
  open: { color: '#04c5bf', symbol: '✓' },
  paused: { color: '#38bdf8', symbol: 'Ⅱ' },
  vacation: { color: '#ee0c6f', symbol: '⌁' },
  fully_booked: { color: '#8b5cf6', symbol: '▤' },
  consultation_only: { color: '#f59e0b', symbol: '◌' },
  emergency: { color: '#ef4444', symbol: '!' },
};

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

function dateLabel(value: string) {
  return new Intl.DateTimeFormat(appLanguage, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`));
}

function weekdayLabel(weekday: number) {
  const sunday = new Date('2024-01-07T12:00:00Z');
  sunday.setUTCDate(sunday.getUTCDate() + weekday);
  return new Intl.DateTimeFormat(appLanguage, { weekday: 'short', timeZone: 'UTC' }).format(sunday);
}

function panelLabel(key: DashboardPanelKey) {
  const labels: Record<DashboardPanelKey, string> = {
    dashboard: copy('Dashboard', 'Tableau', 'Главная'),
    calendar: copy('Calendar', 'Calendrier', 'Календарь'),
    bookings: copy('Bookings', 'Réservations', 'Записи'),
    projects: copy('Projects', 'Projets', 'Проекты'),
    messages: copy('Messages', 'Messages', 'Сообщения'),
    portfolio: copy('Portfolio', 'Portfolio', 'Портфолио'),
    clients: copy('Clients', 'Clients', 'Клиенты'),
    reviews: copy('Reviews', 'Avis', 'Отзывы'),
    statistics: copy('Statistics', 'Statistiques', 'Статистика'),
    settings: copy('Settings', 'Paramètres', 'Настройки'),
  };
  return labels[key];
}

function openAppointment(appointmentId: number) {
  router.push({ pathname: '/appointment/[appointmentId]', params: { appointmentId: String(appointmentId) } });
}

function openChat(threadId: number) {
  router.push({ pathname: '/chat/[threadId]', params: { threadId: String(threadId) } });
}

function preferencePayload(value: ArtistBookingPreferences): ArtistBookingPreferencesUpdate {
  return {
    booking_workflow: value.booking_workflow,
    minimum_notice_hours: value.minimum_notice_hours,
    maximum_booking_window_days: value.maximum_booking_window_days,
    slot_step_minutes: value.slot_step_minutes,
    default_session_minutes: value.default_session_minutes,
    maximum_session_hours: value.maximum_session_hours,
    consultation_enabled: value.consultation_enabled,
    online_consultation_enabled: value.online_consultation_enabled,
    studio_consultation_enabled: value.studio_consultation_enabled,
    consultation_required_before_booking: value.consultation_required_before_booking,
    consultation_price: value.consultation_price,
    online_consultation_price: value.online_consultation_price,
    reference_images_required: value.reference_images_required,
    minimum_reference_images: value.minimum_reference_images,
    maximum_reference_images: value.maximum_reference_images,
    active_styles: value.active_styles,
    auto_response_booking_received: value.auto_response_booking_received,
    auto_response_consultation_required: value.auto_response_consultation_required,
    auto_response_need_more_references: value.auto_response_need_more_references,
    auto_response_booking_approved: value.auto_response_booking_approved,
    auto_response_booking_declined: value.auto_response_booking_declined,
  };
}

export default function ArtistDashboardScreen() {
  const { request, status, user } = useAuth();
  const [dashboard, setDashboard] = useState<ArtistDashboard | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioWork[]>([]);
  const [preferences, setPreferences] = useState<ArtistBookingPreferences | null>(null);
  const [activePanel, setActivePanel] = useState<DashboardPanelKey>('dashboard');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState<ArtistBookingStatus | null>(null);
  const [savingPreferences, setSavingPreferences] = useState(false);

  const load = useCallback(async () => {
    if (status !== 'authenticated' || !user?.is_verified_artist) return;
    setLoading(true);
    setLoadError(false);
    try {
      const [dashboardResult, appointmentResult, chatResult, portfolioResult, preferencesResult] = await Promise.allSettled([
        fetchArtistDashboard(request),
        fetchAppointments(request),
        fetchChats(request),
        fetchPortfolio(request),
        fetchArtistBookingPreferences(request),
      ]);
      if (dashboardResult.status !== 'fulfilled') throw dashboardResult.reason;
      setDashboard(dashboardResult.value);
      if (appointmentResult.status === 'fulfilled') setAppointments(appointmentResult.value.results);
      if (chatResult.status === 'fulfilled') setThreads(chatResult.value.results);
      if (portfolioResult.status === 'fulfilled') setPortfolio(portfolioResult.value.results);
      if (preferencesResult.status === 'fulfilled') setPreferences(preferencesResult.value);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [request, status, user?.is_verified_artist]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const destinations = useMemo<DashboardDestination[]>(() => (
    (['dashboard', 'calendar', 'bookings', 'projects', 'messages', 'portfolio', 'clients', 'reviews', 'statistics', 'settings'] as DashboardPanelKey[])
      .map((key) => ({ key, label: panelLabel(key), icon: WEB_DASH_ICONS[key] }))
  ), []);

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

  const savePreferences = async () => {
    if (!preferences || savingPreferences) return;
    setSavingPreferences(true);
    setActionError('');
    try {
      setPreferences(await saveArtistBookingPreferences(request, preferencePayload(preferences)));
    } catch (caught) {
      setActionError(userFacingError(caught));
    } finally {
      setSavingPreferences(false);
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

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.brandRow}>
        <Pressable accessibilityLabel={copy('Back to profile', 'Retour au profil', 'Назад в профиль')} accessibilityRole="button" onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Image source={require('../../assets/tatzo7.png')} resizeMode="contain" style={styles.logo} />
        <Pressable accessibilityLabel={t('artistManualCreate')} accessibilityRole="button" onPress={() => router.push('/artist-dashboard/create-appointment')} style={({ pressed }) => [styles.plus, pressed && styles.pressed]}>
          <Text style={styles.plusText}>+</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.navContent} horizontal showsHorizontalScrollIndicator={false} style={styles.navRail}>
        {destinations.map((item) => {
          const active = item.key === activePanel;
          return (
            <Pressable
              accessibilityLabel={item.label}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              key={item.key}
              onPress={() => setActivePanel(item.key)}
              style={({ pressed }) => [styles.navItem, active && styles.navItemActive, pressed && styles.pressed]}
            >
              <Image source={item.icon} resizeMode="contain" style={[styles.navIcon, { tintColor: active ? colors.primary : '#8ca8ad' }]} />
              <Text numberOfLines={1} style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.panelTitleRow}>
        <View style={styles.headerCopy}>
          {activePanel === 'dashboard' ? (
            <><Text style={styles.heading}>{greeting(user.username)}</Text><Text style={styles.date}>{todayLabel()}</Text></>
          ) : (
            <><Text style={styles.panelEyebrow}>{copy('ARTIST DASHBOARD', 'TABLEAU ARTISTE', 'КАБИНЕТ МАСТЕРА')}</Text><Text style={styles.heading}>{panelLabel(activePanel)}</Text></>
          )}
        </View>
      </View>

      {activePanel === 'dashboard' ? <DashboardOverview dashboard={dashboard} actionError={actionError} updatingStatus={updatingStatus} onChangeStatus={changeStatus} /> : null}
      {activePanel === 'calendar' ? <CalendarPanel dashboard={dashboard} /> : null}
      {activePanel === 'bookings' ? <BookingsPanel appointments={appointments} /> : null}
      {activePanel === 'projects' ? <ProjectsPanel appointments={appointments} /> : null}
      {activePanel === 'messages' ? <MessagesPanel threads={threads} /> : null}
      {activePanel === 'portfolio' ? <PortfolioPanel works={portfolio} /> : null}
      {activePanel === 'clients' ? <ClientsPanel appointments={appointments} /> : null}
      {activePanel === 'reviews' ? <ReviewsPanel appointments={appointments} /> : null}
      {activePanel === 'statistics' ? <StatisticsPanel appointments={appointments} dashboard={dashboard} threads={threads} /> : null}
      {activePanel === 'settings' ? (
        <SettingsPanel
          actionError={actionError}
          dashboard={dashboard}
          onChangePreferences={(patch) => setPreferences((current) => current ? { ...current, ...patch } : current)}
          onChangeStatus={changeStatus}
          onSave={() => void savePreferences()}
          preferences={preferences}
          saving={savingPreferences}
          updatingStatus={updatingStatus}
        />
      ) : null}
    </Screen>
  );
}

function DashboardOverview({ dashboard, actionError, updatingStatus, onChangeStatus }: {
  dashboard: ArtistDashboard;
  actionError: string;
  updatingStatus: ArtistBookingStatus | null;
  onChangeStatus: (status: ArtistBookingStatus) => Promise<void>;
}) {
  const stats = [
    { value: dashboard.stats.today_sessions, label: t('artistTodaySessions'), icon: WEB_DASH_ICONS.calendar },
    { value: dashboard.stats.pending_requests, label: t('artistPendingRequests'), icon: WEB_DASH_ICONS.bookings, accent: true },
    { value: dashboard.stats.upcoming_consultations, label: t('artistUpcomingConsultations'), icon: WEB_DASH_ICONS.clients },
    { value: dashboard.stats.unread_messages, label: t('artistUnreadMessages'), icon: WEB_DASH_ICONS.messages, accent: true },
  ];
  return (
    <>
      <View style={styles.statusBar}>
        <View style={styles.statusCopy}>
          <View style={[styles.statusDot, !dashboard.settings.bookings_enabled && styles.statusDotPaused]} />
          <View style={styles.statusTextWrap}><Text style={styles.statusTitle}>{dashboard.settings.booking_status_label}</Text><Text style={styles.statusHint}>{t('artistBookingStatusHint')}</Text></View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusOptions}>
          {dashboard.settings.booking_status_options.slice(0, 3).map((option) => {
            const selected = option.value === dashboard.settings.booking_status;
            const updating = updatingStatus === option.value;
            return <Pressable accessibilityRole="button" accessibilityState={{ selected }} disabled={Boolean(updatingStatus)} key={option.value} onPress={() => void onChangeStatus(option.value)} style={({ pressed }) => [styles.statusChip, selected && styles.statusChipSelected, pressed && styles.pressed]}>{updating ? <ActivityIndicator color={selected ? '#001014' : colors.primary} size="small" /> : <Text style={[styles.statusChipText, selected && styles.statusChipTextSelected]}>{option.label}</Text>}</Pressable>;
          })}
        </ScrollView>
      </View>
      {actionError ? <Text style={styles.error}>{actionError}</Text> : null}
      <View style={styles.statStack}>{stats.map((stat) => <View key={stat.label} style={styles.statCard}><Image source={stat.icon} resizeMode="contain" style={[styles.statIcon, { tintColor: stat.accent ? colors.accent : colors.primary }]} /><View style={styles.statCopy}><Text style={styles.statValue}>{stat.value}</Text><Text style={styles.statLabel}>{stat.label}</Text></View></View>)}</View>
      <Text style={styles.sectionTitle}>✦ {copy('Smart insights', 'Conseils intelligents', 'Умные подсказки')}</Text>
      <View style={styles.insightStack}>
        <Insight accent text={copy('Your booking settings are connected to the client booking wizard.', 'Vos paramètres sont connectés au parcours client.', 'Настройки записи напрямую связаны с формой бронирования клиента.')} />
        <Insight text={copy('Active styles are shown directly in your public booking form.', 'Les styles actifs apparaissent dans votre formulaire public.', 'Активные стили отображаются прямо в публичной форме записи.')} />
        <Insight accent text={copy('Pending requests should be answered quickly to improve conversion.', 'Répondez rapidement aux demandes en attente.', 'На ожидающие заявки лучше отвечать быстро — это повышает конверсию.')} />
        <Insight text={copy('Add portfolio works to make your booking page more convincing.', 'Ajoutez des œuvres au portfolio.', 'Добавляй работы в портфолио — так страница записи будет убедительнее.')} />
      </View>
      <View style={styles.section}><View style={styles.sectionHead}><Text style={styles.sectionTitle}>{t('artistWorkload')}</Text><Pressable onPress={() => router.push('/artist-dashboard/schedule')}><Text style={styles.sectionLink}>{t('artistManageSchedule')}</Text></Pressable></View><WorkloadStrip days={dashboard.workload} /></View>
      <View style={styles.section}><Text style={styles.sectionTitle}>{t('artistUpcoming')}</Text><ArtistTimeline items={dashboard.timeline} /></View>
    </>
  );
}

function CalendarPanel({ dashboard }: { dashboard: ArtistDashboard }) {
  return (
    <View style={styles.panelStack}>
      <View style={styles.surfaceCard}>
        <View style={styles.sectionHead}><View style={styles.flexOne}><Text style={styles.cardTitle}>{copy('Weekly schedule', 'Horaires hebdomadaires', 'Недельное расписание')}</Text><Text style={styles.cardHint}>{copy('Manage working hours without leaving the dashboard.', 'Gérez vos horaires sans quitter le tableau.', 'Рабочие часы остаются прямо в кабинете мастера.')}</Text></View><Pressable onPress={() => router.push('/artist-dashboard/schedule')}><Text style={styles.sectionLink}>{copy('Edit', 'Modifier', 'Изменить')}</Text></Pressable></View>
        <View style={styles.simpleList}>{dashboard.schedule.map((day) => <View key={day.weekday} style={styles.simpleRow}><Text style={styles.simpleRowTitle}>{weekdayLabel(day.weekday)}</Text><Text style={day.is_closed ? styles.closedText : styles.simpleRowMeta}>{day.is_closed ? copy('Closed', 'Fermé', 'Закрыто') : `${day.open_time ?? '—'} – ${day.close_time ?? '—'}`}</Text></View>)}</View>
      </View>
      <View style={styles.surfaceCard}>
        <View style={styles.sectionHead}><View style={styles.flexOne}><Text style={styles.cardTitle}>{copy('Blocked periods', 'Périodes bloquées', 'Заблокированные периоды')}</Text><Text style={styles.cardHint}>{copy('Time off and blocked hours prevent unavailable bookings.', 'Les absences empêchent les réservations indisponibles.', 'Выходные и блокировки закрывают недоступное время.')}</Text></View><Pressable onPress={() => router.push('/artist-dashboard/calendar')}><Text style={styles.sectionLink}>{copy('Manage', 'Gérer', 'Управлять')}</Text></Pressable></View>
        {dashboard.time_off.length || dashboard.blocked_periods.length ? <View style={styles.simpleList}>{dashboard.time_off.slice(0, 4).map((item) => <View key={`off-${item.id}`} style={styles.simpleRow}><Text style={styles.simpleRowTitle}>{dateLabel(item.date)}</Text><Text numberOfLines={1} style={styles.simpleRowMeta}>{item.reason || copy('Time off', 'Absence', 'Выходной')}</Text></View>)}{dashboard.blocked_periods.slice(0, 4).map((item) => <View key={`block-${item.id}`} style={styles.simpleRow}><Text style={styles.simpleRowTitle}>{dateLabel(item.date)} · {item.start_time}–{item.end_time}</Text><Text numberOfLines={1} style={styles.simpleRowMeta}>{item.title}</Text></View>)}</View> : <EmptyCopy text={copy('No blocked periods yet.', 'Aucune période bloquée.', 'Заблокированных периодов пока нет.')} />}
      </View>
    </View>
  );
}

function BookingsPanel({ appointments }: { appointments: Appointment[] }) {
  const rows = appointments.filter((item) => item.role === 'artist').slice(0, 12);
  return <View style={styles.surfaceCard}><Text style={styles.cardTitle}>{copy('Booking requests', 'Demandes de réservation', 'Заявки на запись')}</Text>{rows.length ? rows.map((item) => <AppointmentPanelRow appointment={item} key={item.id} />) : <EmptyCopy text={copy('No booking requests yet.', 'Aucune demande pour le moment.', 'Заявок на запись пока нет.')} />}</View>;
}

function ProjectsPanel({ appointments }: { appointments: Appointment[] }) {
  const rows = appointments.filter((item) => item.role === 'artist' && item.status !== 'declined' && item.status !== 'cancelled').slice(0, 12);
  return <View style={styles.surfaceCard}><Text style={styles.cardTitle}>{copy('Tattoo projects', 'Projets tattoo', 'Тату-проекты')}</Text>{rows.length ? rows.map((item) => <Pressable key={item.id} onPress={() => openAppointment(item.id)} style={({ pressed }) => [styles.panelRow, pressed && styles.rowPressed]}><View style={styles.flexOne}><Text style={styles.panelRowTitle}>{item.client.username}{item.placement_label ? ` — ${item.placement_label}` : ''}</Text><Text numberOfLines={2} style={styles.panelRowMeta}>{item.styles_label || item.booking_type_label}</Text></View><StatusPill text={item.status_label} /></Pressable>) : <EmptyCopy text={copy('No active tattoo projects yet.', 'Aucun projet actif.', 'Активных тату-проектов пока нет.')} />}</View>;
}

function MessagesPanel({ threads }: { threads: ChatThreadSummary[] }) {
  const rows = threads.filter((item) => item.unread_count > 0);
  const visible = (rows.length ? rows : threads).slice(0, 10);
  return <View style={styles.surfaceCard}><Text style={styles.cardTitle}>{copy('Messages', 'Messages', 'Сообщения')}</Text>{visible.length ? visible.map((thread) => <Pressable key={thread.id} onPress={() => openChat(thread.id)} style={({ pressed }) => [styles.panelRow, pressed && styles.rowPressed]}><AvatarSmall uri={thread.other_user.profile_image_url} username={thread.other_user.username} /><View style={styles.flexOne}><Text style={styles.panelRowTitle}>{thread.other_user.username}</Text><Text numberOfLines={1} style={styles.panelRowMeta}>{thread.last_message?.content || copy('Attachment', 'Pièce jointe', 'Вложение')}</Text></View>{thread.unread_count ? <View style={styles.countBadge}><Text style={styles.countBadgeText}>{thread.unread_count}</Text></View> : null}</Pressable>) : <EmptyCopy text={copy('No messages yet.', 'Aucun message.', 'Сообщений пока нет.')} />}</View>;
}

function PortfolioPanel({ works }: { works: PortfolioWork[] }) {
  return <View style={styles.surfaceCard}><View style={styles.sectionHead}><Text style={styles.cardTitle}>{copy('Portfolio', 'Portfolio', 'Портфолио')}</Text><Pressable onPress={() => router.push('/manage-portfolio')}><Text style={styles.sectionLink}>{copy('Manage', 'Gérer', 'Управлять')}</Text></Pressable></View>{works.length ? <View style={styles.portfolioGrid}>{works.slice(0, 8).map((work) => <View key={work.id} style={styles.portfolioTile}>{work.image_url ? <Image source={{ uri: work.image_url }} style={styles.portfolioImage} /> : <View style={styles.portfolioFallback}><Text style={styles.panelRowMeta}>{work.title || 'Tatzo'}</Text></View>}</View>)}</View> : <EmptyCopy text={copy('No portfolio works yet.', 'Aucune œuvre.', 'Работ в портфолио пока нет.')} />}</View>;
}

function ClientsPanel({ appointments }: { appointments: Appointment[] }) {
  const clients = useMemo(() => {
    const byId = new Map<number, { user: Appointment['client']; count: number }>();
    appointments.filter((item) => item.role === 'artist').forEach((item) => {
      const current = byId.get(item.client.id);
      byId.set(item.client.id, { user: item.client, count: (current?.count ?? 0) + 1 });
    });
    return Array.from(byId.values()).sort((a, b) => b.count - a.count).slice(0, 12);
  }, [appointments]);
  return <View style={styles.surfaceCard}><Text style={styles.cardTitle}>{copy('Clients', 'Clients', 'Клиенты')}</Text>{clients.length ? clients.map(({ user, count }) => <View key={user.id} style={styles.clientRow}><AvatarSmall uri={user.profile_image_url} username={user.username} /><View style={styles.flexOne}><Text style={styles.panelRowTitle}>{user.username}</Text><Text style={styles.panelRowMeta}>{copy('Client', 'Client', 'Клиент')}</Text></View><View style={styles.sessionCount}><Text style={styles.sessionCountValue}>{count}</Text><Text style={styles.sessionCountLabel}>{copy(count === 1 ? 'session' : 'sessions', count === 1 ? 'séance' : 'séances', 'сеансов')}</Text></View></View>) : <EmptyCopy text={copy('No clients yet.', 'Aucun client.', 'Клиентов пока нет.')} />}</View>;
}

function ReviewsPanel({ appointments }: { appointments: Appointment[] }) {
  const completed = appointments.filter((item) => item.role === 'artist' && item.status === 'completed').slice(0, 10);
  return <View style={styles.surfaceCard}><Text style={styles.cardTitle}>{copy('Reviews', 'Avis', 'Отзывы')}</Text><Text style={styles.cardHint}>{copy('Completed sessions are ready for review activity.', 'Les séances terminées apparaissent ici pour les avis.', 'Здесь отображаются завершённые сеансы, связанные с отзывами.')}</Text>{completed.length ? completed.map((item) => <View key={item.id} style={styles.clientRow}><AvatarSmall uri={item.client.profile_image_url} username={item.client.username} /><View style={styles.flexOne}><Text style={styles.panelRowTitle}>{item.client.username}</Text><Text style={styles.panelRowMeta}>{dateLabel(item.date)} · {item.booking_type_label}</Text></View><Text style={styles.reviewMark}>☆</Text></View>) : <EmptyCopy text={copy('No reviews yet.', 'Aucun avis.', 'Отзывов пока нет.')} />}</View>;
}

function StatisticsPanel({ appointments, dashboard, threads }: { appointments: Appointment[]; dashboard: ArtistDashboard; threads: ChatThreadSummary[] }) {
  const now = new Date();
  const monthly = appointments.filter((item) => {
    if (item.role !== 'artist' || item.status !== 'accepted') return false;
    const date = new Date(`${item.date}T12:00:00Z`);
    return date.getUTCFullYear() === now.getFullYear() && date.getUTCMonth() === now.getMonth();
  }).length;
  const unread = threads.reduce((sum, thread) => sum + thread.unread_count, 0);
  const bars = [
    { label: copy('Monthly bookings', 'Réservations mensuelles', 'Записи за месяц'), value: monthly, percent: Math.min(100, monthly * 12) },
    { label: copy('Pending requests', 'Demandes en attente', 'Ожидающие заявки'), value: dashboard.stats.pending_requests, percent: Math.min(100, dashboard.stats.pending_requests * 15) },
    { label: copy('Unread messages', 'Messages non lus', 'Непрочитанные сообщения'), value: unread, percent: Math.min(100, unread * 12) },
  ];
  return <View style={styles.surfaceCard}><Text style={styles.cardTitle}>{copy('Statistics', 'Statistiques', 'Статистика')}</Text><View style={styles.statsBars}>{bars.map((item) => <StatBar key={item.label} {...item} />)}</View></View>;
}

function SettingsPanel({ dashboard, preferences, actionError, saving, updatingStatus, onChangePreferences, onChangeStatus, onSave }: {
  dashboard: ArtistDashboard;
  preferences: ArtistBookingPreferences | null;
  actionError: string;
  saving: boolean;
  updatingStatus: ArtistBookingStatus | null;
  onChangePreferences: (patch: Partial<ArtistBookingPreferences>) => void;
  onChangeStatus: (status: ArtistBookingStatus) => Promise<void>;
  onSave: () => void;
}) {
  return (
    <View style={styles.panelStack}>
      <View style={styles.surfaceCard}>
        <Text style={styles.cardTitle}>{copy('Booking settings', 'Paramètres de réservation', 'Настройки записи')}</Text>
        {preferences ? (
          <View style={styles.settingsStack}>
            <View style={styles.settingBlock}>
              <Text style={styles.settingLabel}>{copy('Preferred booking workflow', 'Workflow préféré', 'Сценарий записи')}</Text>
              <View style={styles.inlineChoices}>
                {preferences.booking_workflow_options.map((option) => {
                  const selected = option.value === preferences.booking_workflow;
                  return <Pressable key={option.value} onPress={() => onChangePreferences({ booking_workflow: option.value })} style={[styles.choiceChip, selected && styles.choiceChipActive]}><Text style={[styles.choiceText, selected && styles.choiceTextActive]}>{option.label}</Text></Pressable>;
                })}
              </View>
            </View>
            <SettingToggle label={copy('Consultations enabled', 'Consultations activées', 'Консультации включены')} value={preferences.consultation_enabled} onChange={(value) => onChangePreferences({ consultation_enabled: value })} />
            <SettingToggle label={copy('Online consultation', 'Consultation en ligne', 'Онлайн-консультация')} value={preferences.online_consultation_enabled} onChange={(value) => onChangePreferences({ online_consultation_enabled: value })} />
            <SettingToggle label={copy('Studio consultation', 'Consultation au studio', 'Консультация в студии')} value={preferences.studio_consultation_enabled} onChange={(value) => onChangePreferences({ studio_consultation_enabled: value })} />
            <SettingToggle label={copy('Consultation required', 'Consultation requise', 'Консультация обязательна')} value={preferences.consultation_required_before_booking} onChange={(value) => onChangePreferences({ consultation_required_before_booking: value })} />
            <SettingToggle label={copy('Reference images required', 'Références requises', 'Референсы обязательны')} value={preferences.reference_images_required} onChange={(value) => onChangePreferences({ reference_images_required: value })} />
            <View style={styles.numericGrid}>
              <NumberSetting label={copy('Minimum booking notice', 'Préavis minimum', 'Минимальное предупреждение')} suffix="h" value={preferences.minimum_notice_hours} onChange={(value) => onChangePreferences({ minimum_notice_hours: value })} />
              <NumberSetting label={copy('Maximum booking window', 'Fenêtre maximale', 'Окно бронирования')} suffix="d" value={preferences.maximum_booking_window_days} onChange={(value) => onChangePreferences({ maximum_booking_window_days: value })} />
              <NumberSetting label={copy('Maximum session', 'Session maximale', 'Максимальный сеанс')} suffix="h" value={preferences.maximum_session_hours} onChange={(value) => onChangePreferences({ maximum_session_hours: value })} />
              <NumberSetting label={copy('Max references', 'Références max', 'Макс. референсов')} value={preferences.maximum_reference_images} onChange={(value) => onChangePreferences({ maximum_reference_images: value })} />
            </View>
            <Text style={styles.settingLabel}>{copy('Tattoo styles offered', 'Styles proposés', 'Доступные стили тату')}</Text>
            <View style={styles.styleGrid}>{preferences.style_options.map((option) => {
              const selected = preferences.active_styles.includes(option.value);
              return <Pressable key={option.value} onPress={() => onChangePreferences({ active_styles: selected ? preferences.active_styles.filter((item) => item !== option.value) : [...preferences.active_styles, option.value] })} style={[styles.styleChip, selected && styles.styleChipActive]}><Text style={[styles.styleChipText, selected && styles.styleChipTextActive]}>{option.label}</Text></Pressable>;
            })}</View>
            <Button label={copy('Save settings', 'Enregistrer', 'Сохранить настройки')} loading={saving} onPress={onSave} />
          </View>
        ) : <Text style={styles.cardHint}>{copy('Advanced booking settings are unavailable right now.', 'Les paramètres avancés sont indisponibles.', 'Расширенные настройки записи сейчас недоступны.')}</Text>}
      </View>

      <View style={styles.surfaceCard}>
        <Text style={styles.cardTitle}>{copy('Booking rules', 'Règles de réservation', 'Правила записи')}</Text>
        <Text style={styles.cardHint}>{copy('Choose the rule clients should see in the booking flow.', 'Choisissez la règle visible aux clients.', 'Выбери правило, которое сразу увидят клиенты при записи.')}</Text>
        <View style={styles.rulesGrid}>
          {dashboard.settings.booking_status_options.map((option) => {
            const selected = option.value === dashboard.settings.booking_status;
            const tone = RULE_TONES[option.value];
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                disabled={Boolean(updatingStatus)}
                key={option.value}
                onPress={() => void onChangeStatus(option.value)}
                style={({ pressed }) => [styles.ruleCard, selected && { borderColor: tone.color, backgroundColor: `${tone.color}18` }, pressed && styles.pressed]}
              >
                {updatingStatus === option.value ? <ActivityIndicator color={tone.color} /> : <Text style={[styles.ruleSymbol, { color: tone.color }]}>{tone.symbol}</Text>}
                <Text style={styles.ruleLabel}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {actionError ? <Text style={styles.error}>{actionError}</Text> : null}
    </View>
  );
}

function SettingToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <View style={styles.settingToggleRow}><Text style={styles.settingToggleLabel}>{label}</Text><Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={[styles.switchTrack, value && styles.switchTrackOn]}><View style={[styles.switchKnob, value && styles.switchKnobOn]} /></Pressable></View>;
}

function NumberSetting({ label, value, suffix, onChange }: { label: string; value: number; suffix?: string; onChange: (value: number) => void }) {
  return <View style={styles.numberSetting}><Text style={styles.numberLabel}>{label}</Text><View style={styles.numberInputWrap}><TextInput keyboardType="number-pad" onChangeText={(text) => onChange(Math.max(0, Number.parseInt(text || '0', 10) || 0))} style={styles.numberInput} value={String(value)} />{suffix ? <Text style={styles.numberSuffix}>{suffix}</Text> : null}</View></View>;
}

function AppointmentPanelRow({ appointment }: { appointment: Appointment }) {
  return <Pressable onPress={() => openAppointment(appointment.id)} style={({ pressed }) => [styles.panelRow, pressed && styles.rowPressed]}><View style={styles.flexOne}><Text style={styles.panelRowTitle}>{appointment.client.username}</Text><Text style={styles.panelRowMeta}>{appointment.booking_type_label} · {dateLabel(appointment.date)} {appointment.start_time}</Text></View><StatusPill text={appointment.status_label} /></Pressable>;
}

function AvatarSmall({ uri, username }: { uri: string | null; username: string }) {
  return <View style={styles.avatarSmallWrap}>{uri ? <Image source={{ uri }} style={styles.avatarSmall} /> : <Text style={styles.avatarSmallLetter}>{username[0]?.toUpperCase()}</Text>}</View>;
}

function StatusPill({ text }: { text: string }) {
  return <View style={styles.statusPill}><Text numberOfLines={1} style={styles.statusPillText}>{text}</Text></View>;
}

function EmptyCopy({ text }: { text: string }) {
  return <Text style={styles.emptyCopy}>{text}</Text>;
}

function StatBar({ label, value, percent }: { label: string; value: number; percent: number }) {
  return <View style={styles.statBarRow}><View style={styles.sectionHead}><Text style={styles.panelRowTitle}>{label}</Text><Text style={styles.statBarValue}>{value}</Text></View><View style={styles.statBarTrack}><Image source={STAT_GRADIENT} resizeMode="stretch" style={[styles.statGradient, { width: `${Math.max(2, percent)}%` }]} /></View></View>;
}

function Insight({ text, accent = false }: { text: string; accent?: boolean }) {
  return <View style={[styles.insight, accent && styles.insightAccent]}><Text style={styles.insightText}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 0, paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  centerState: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  stateTitle: { color: colors.text, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  muted: { color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
  brandRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  logo: { width: 122, height: 34 },
  back: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,.04)' },
  backText: { color: colors.primary, fontSize: 34, lineHeight: 35 },
  plus: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  plusText: { color: '#001014', fontSize: 26, fontWeight: '900', lineHeight: 28 },
  navRail: { height: 74, flexGrow: 0, flexShrink: 0, marginHorizontal: -spacing.md },
  navContent: { height: 74, alignItems: 'center', paddingHorizontal: spacing.md, gap: 7, paddingVertical: 8 },
  navItem: { width: 70, height: 58, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,.05)' },
  navItemActive: { backgroundColor: 'rgba(4,197,191,.12)', borderColor: 'rgba(4,197,191,.18)', borderBottomWidth: 2, borderBottomColor: colors.primary },
  navIcon: { width: 21, height: 21 },
  navLabel: { width: '100%', color: '#8ca8ad', fontSize: 9, fontWeight: '800', textAlign: 'center' },
  navLabelActive: { color: colors.primary },
  panelTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, paddingTop: 2 },
  headerCopy: { flex: 1, gap: 4 },
  panelEyebrow: { color: colors.primary, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  heading: { color: colors.white, fontSize: 27, lineHeight: 32, fontWeight: '900', letterSpacing: -.6 },
  date: { color: colors.textMuted, fontSize: 13, textTransform: 'capitalize' },
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
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  sectionTitle: { color: colors.white, fontSize: 18, lineHeight: 23, fontWeight: '900' },
  sectionLink: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  insightStack: { gap: 10 },
  insight: { padding: 16, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,.08)', borderLeftWidth: 3, borderLeftColor: colors.primary, backgroundColor: 'rgba(4,197,191,.045)' },
  insightAccent: { borderLeftColor: colors.accent, backgroundColor: 'rgba(238,12,111,.045)' },
  insightText: { color: 'rgba(234,255,255,.82)', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  panelStack: { gap: spacing.md },
  surfaceCard: { gap: spacing.md, padding: spacing.md, borderRadius: 20, backgroundColor: 'rgba(0,19,29,.94)', borderWidth: 1, borderColor: 'rgba(4,197,191,.14)' },
  cardTitle: { color: colors.white, fontSize: 20, lineHeight: 25, fontWeight: '900' },
  cardHint: { color: colors.textMuted, fontSize: 11, lineHeight: 17 },
  flexOne: { flex: 1, minWidth: 0 },
  simpleList: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,.08)' },
  simpleRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,.07)', paddingVertical: 9 },
  simpleRowTitle: { color: colors.white, fontSize: 12, fontWeight: '800', flex: 1 },
  simpleRowMeta: { color: colors.textMuted, fontSize: 11, textAlign: 'right', flexShrink: 1 },
  closedText: { color: colors.accent, fontSize: 11, fontWeight: '800' },
  panelRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,.07)', paddingVertical: 10 },
  clientRow: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,.07)', paddingVertical: 10 },
  panelRowTitle: { color: colors.white, fontSize: 13, fontWeight: '900' },
  panelRowMeta: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  rowPressed: { opacity: .7 },
  statusPill: { maxWidth: 120, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(4,197,191,.28)', backgroundColor: 'rgba(4,197,191,.08)' },
  statusPillText: { color: colors.primary, fontSize: 9, fontWeight: '900' },
  countBadge: { minWidth: 24, height: 24, paddingHorizontal: 6, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  countBadgeText: { color: colors.white, fontSize: 10, fontWeight: '900' },
  avatarSmallWrap: { width: 50, height: 50, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#08242e' },
  avatarSmall: { width: '100%', height: '100%' },
  avatarSmallLetter: { color: colors.primary, fontWeight: '900' },
  sessionCount: { alignItems: 'flex-end', gap: 1 },
  sessionCountValue: { color: colors.primary, fontSize: 18, fontWeight: '900' },
  sessionCountLabel: { color: colors.textMuted, fontSize: 9 },
  reviewMark: { color: '#f5b301', fontSize: 25 },
  portfolioGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  portfolioTile: { width: '48.5%', aspectRatio: 1, borderRadius: 14, overflow: 'hidden', backgroundColor: '#031b27', borderWidth: 1, borderColor: 'rgba(4,197,191,.08)' },
  portfolioImage: { width: '100%', height: '100%' },
  portfolioFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 6 },
  emptyCopy: { color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.lg, lineHeight: 20 },
  statsBars: { gap: spacing.lg },
  statBarRow: { gap: 8 },
  statBarValue: { color: colors.primary, fontSize: 14, fontWeight: '900' },
  statBarTrack: { height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,.08)' },
  statGradient: { height: '100%', borderRadius: 4 },
  settingsStack: { gap: 14 },
  settingBlock: { gap: 8 },
  settingLabel: { color: colors.text, fontSize: 12, fontWeight: '800' },
  inlineChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  choiceChip: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 13, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,.11)' },
  choiceChipActive: { backgroundColor: 'rgba(238,12,111,.13)', borderColor: colors.accent },
  choiceText: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
  choiceTextActive: { color: '#ff69a8' },
  settingToggleRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,.07)' },
  settingToggleLabel: { flex: 1, color: colors.text, fontSize: 12, fontWeight: '700' },
  switchTrack: { width: 44, height: 24, borderRadius: 12, padding: 3, backgroundColor: 'rgba(255,255,255,.14)' },
  switchTrackOn: { backgroundColor: colors.primary },
  switchKnob: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.white },
  switchKnobOn: { marginLeft: 20 },
  numericGrid: { gap: 10 },
  numberSetting: { gap: 6 },
  numberLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  numberInputWrap: { minHeight: 44, flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,.09)', backgroundColor: 'rgba(255,255,255,.045)', paddingHorizontal: 12 },
  numberInput: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 8 },
  numberSuffix: { color: colors.textMuted, fontSize: 12 },
  styleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  styleChip: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,.11)' },
  styleChipActive: { borderColor: colors.accent, backgroundColor: 'rgba(238,12,111,.13)' },
  styleChipText: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },
  styleChipTextActive: { color: '#ff69a8' },
  rulesGrid: { gap: 10 },
  ruleCard: { minHeight: 78, justifyContent: 'center', gap: 8, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,.09)', backgroundColor: 'rgba(255,255,255,.045)' },
  ruleSymbol: { fontSize: 19, fontWeight: '900' },
  ruleLabel: { color: colors.text, fontSize: 12, fontWeight: '900' },
  pressed: { opacity: .72, transform: [{ scale: .985 }] },
});

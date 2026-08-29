import { useCallback, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Appointment, ArtistDashboard } from '@/api/types';
import { fetchArtistDashboard } from '@/artist-dashboard/artist-dashboard-api';
import { useAuth } from '@/auth/auth-context';
import { fetchAppointments } from '@/booking/booking-api';
import { BrandHeader } from '@/components/brand-header';
import { appLanguage } from '@/i18n';
import { colors, spacing } from '@/theme';


type CalendarViewMode = 'month' | 'week' | 'day';

type CalendarDay = {
  iso: string;
  date: Date;
  inCurrentMonth: boolean;
};

type CalendarMarker = {
  key: string;
  color: string;
};

const VACATION_COLOR = '#8c74ff';
const BLOCKED_COLOR = '#667983';

const WEEKDAYS = {
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  fr: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
  ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
} as const;

const COPY = {
  en: {
    calendar: 'Calendar',
    eyebrow: 'Tatzo',
    today: 'Today',
    month: 'Month',
    week: 'Week',
    day: 'Day',
    insights: 'Insights',
    noAlerts: 'No alerts right now.',
    attention: 'booking requests need attention.',
    quickActions: 'Quick actions',
    addSession: 'Add session',
    blockTime: 'Block time',
    setVacation: 'Set vacation',
    createConsultation: 'Create consultation',
    appointments: 'View appointments',
    legend: 'Legend',
    tattooSession: 'Tattoo session',
    consultation: 'Consultation',
    blocked: 'Blocked',
    vacation: 'Vacation',
    events: 'Events',
    noEvents: 'No events scheduled.',
    loadError: 'Calendar is unavailable right now.',
    retry: 'Retry',
  },
  fr: {
    calendar: 'Calendrier',
    eyebrow: 'Tatzo',
    today: 'Aujourd’hui',
    month: 'Mois',
    week: 'Semaine',
    day: 'Jour',
    insights: 'Aperçu',
    noAlerts: 'Aucune alerte pour le moment.',
    attention: 'demandes nécessitent votre attention.',
    quickActions: 'Actions rapides',
    addSession: 'Ajouter une séance',
    blockTime: 'Bloquer un créneau',
    setVacation: 'Définir des congés',
    createConsultation: 'Créer une consultation',
    appointments: 'Voir les rendez-vous',
    legend: 'Légende',
    tattooSession: 'Séance tattoo',
    consultation: 'Consultation',
    blocked: 'Bloqué',
    vacation: 'Congés',
    events: 'Événements',
    noEvents: 'Aucun événement prévu.',
    loadError: 'Le calendrier est indisponible pour le moment.',
    retry: 'Réessayer',
  },
  ru: {
    calendar: 'Календарь',
    eyebrow: 'Tatzo',
    today: 'Сегодня',
    month: 'Месяц',
    week: 'Неделя',
    day: 'День',
    insights: 'Сводка',
    noAlerts: 'Сейчас нет предупреждений.',
    attention: 'заявок требуют внимания.',
    quickActions: 'Быстрые действия',
    addSession: 'Добавить сеанс',
    blockTime: 'Заблокировать время',
    setVacation: 'Указать отпуск',
    createConsultation: 'Создать консультацию',
    appointments: 'Открыть записи',
    legend: 'Легенда',
    tattooSession: 'Тату-сеанс',
    consultation: 'Консультация',
    blocked: 'Заблокировано',
    vacation: 'Отпуск',
    events: 'События',
    noEvents: 'Событий не запланировано.',
    loadError: 'Календарь сейчас недоступен.',
    retry: 'Повторить',
  },
} as const;

function copy() {
  return COPY[appLanguage as keyof typeof COPY] ?? COPY.en;
}

function weekdayLabels() {
  return WEEKDAYS[appLanguage as keyof typeof WEEKDAYS] ?? WEEKDAYS.en;
}

function dateFromIso(iso: string) {
  return new Date(`${iso}T12:00:00Z`);
}

function isoDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localTodayIso() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

function monthAnchor(iso = localTodayIso()) {
  const date = dateFromIso(iso);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12));
}

function addMonths(date: Date, amount: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1, 12));
}

function buildMonthDays(anchor: Date): CalendarDay[] {
  const first = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1, 12));
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first);
    date.setUTCDate(first.getUTCDate() - mondayOffset + index);
    return {
      date,
      iso: isoDate(date),
      inCurrentMonth: date.getUTCMonth() === anchor.getUTCMonth(),
    };
  });
}

function weekStart(iso: string) {
  const date = dateFromIso(iso);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date;
}

function buildWeekDays(selectedIso: string, anchor: Date): CalendarDay[] {
  const first = weekStart(selectedIso);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(first);
    date.setUTCDate(first.getUTCDate() + index);
    return {
      date,
      iso: isoDate(date),
      inCurrentMonth: date.getUTCMonth() === anchor.getUTCMonth(),
    };
  });
}

function formatMonth(anchor: Date) {
  return new Intl.DateTimeFormat(appLanguage, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(anchor);
}

function formatLongDate(iso: string) {
  return new Intl.DateTimeFormat(appLanguage, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dateFromIso(iso));
}

function appointmentColor(appointment: Appointment) {
  return appointment.booking_type === 'tattoo_session' ? colors.primary : colors.accent;
}

function timeRange(appointment: Appointment) {
  if (!appointment.end_time) return appointment.start_time;
  return `${appointment.start_time}–${appointment.end_time}`;
}

function datesBetween(start: string, end: string) {
  const current = dateFromIso(start);
  const last = dateFromIso(end || start);
  const dates: string[] = [];
  while (current <= last) {
    dates.push(isoDate(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

export default function CalendarScreen() {
  const ui = copy();
  const { request, status, user } = useAuth();
  const today = localTodayIso();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [artistDashboard, setArtistDashboard] = useState<ArtistDashboard | null>(null);
  const [attentionCount, setAttentionCount] = useState(0);
  const [anchor, setAnchor] = useState(() => monthAnchor(today));
  const [selectedDate, setSelectedDate] = useState(today);
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const eventsY = useRef(0);
  const calendarTouchX = useRef<number | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (status !== 'authenticated') return;
    if (!quiet) setLoading(true);
    setError(false);
    try {
      const appointmentPromise = fetchAppointments(request);
      const dashboardPromise = user?.is_verified_artist
        ? fetchArtistDashboard(request)
        : Promise.resolve(null);
      const [appointmentResult, dashboardResult] = await Promise.all([appointmentPromise, dashboardPromise]);
      setAppointments(appointmentResult.results);
      setAttentionCount(appointmentResult.attention_count);
      setArtistDashboard(dashboardResult);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [request, status, user?.is_verified_artist]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const appointmentsByDate = useMemo(() => {
    const grouped = new Map<string, Appointment[]>();
    for (const appointment of appointments) {
      const current = grouped.get(appointment.date) ?? [];
      current.push(appointment);
      grouped.set(appointment.date, current);
    }
    for (const items of grouped.values()) {
      items.sort((left, right) => left.start_time.localeCompare(right.start_time));
    }
    return grouped;
  }, [appointments]);

  const extraMarkersByDate = useMemo(() => {
    const grouped = new Map<string, CalendarMarker[]>();
    if (!artistDashboard) return grouped;

    for (const timeOff of artistDashboard.time_off) {
      grouped.set(timeOff.date, [
        ...(grouped.get(timeOff.date) ?? []),
        { key: `vacation-${timeOff.id}`, color: VACATION_COLOR },
      ]);
    }
    for (const blocked of artistDashboard.blocked_periods) {
      for (const iso of datesBetween(blocked.date, blocked.end_date)) {
        grouped.set(iso, [
          ...(grouped.get(iso) ?? []),
          { key: `blocked-${blocked.id}-${iso}`, color: blocked.event_type === 'vacation' ? VACATION_COLOR : BLOCKED_COLOR },
        ]);
      }
    }
    return grouped;
  }, [artistDashboard]);

  const visibleDays = useMemo(() => {
    if (viewMode === 'day') {
      const date = dateFromIso(selectedDate);
      return [{ date, iso: selectedDate, inCurrentMonth: date.getUTCMonth() === anchor.getUTCMonth() }];
    }
    if (viewMode === 'week') return buildWeekDays(selectedDate, anchor);
    return buildMonthDays(anchor);
  }, [anchor, selectedDate, viewMode]);

  const selectedAppointments = appointmentsByDate.get(selectedDate) ?? [];

  const goMonth = (amount: number) => {
    const next = addMonths(anchor, amount);
    setAnchor(next);
    setSelectedDate(isoDate(next));
  };

  const goToday = () => {
    setAnchor(monthAnchor(today));
    setSelectedDate(today);
  };

  const selectDay = (day: CalendarDay) => {
    setSelectedDate(day.iso);
    if (!day.inCurrentMonth) setAnchor(monthAnchor(day.iso));
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, eventsY.current - 110), animated: true });
    });
  };

  const refresh = () => {
    setRefreshing(true);
    void load(true);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        refreshControl={(
          <RefreshControl
            colors={[colors.primary]}
            onRefresh={refresh}
            refreshing={refreshing}
            tintColor={colors.primary}
          />
        )}
        showsVerticalScrollIndicator={false}
      >
        <BrandHeader title={ui.calendar} showQuickMatch />

        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>{ui.eyebrow}</Text>
          <Text style={styles.title}>{ui.calendar}</Text>
        </View>

        <View style={styles.navigationControls}>
          <Pressable
            accessibilityLabel="Previous month"
            accessibilityRole="button"
            onPress={() => goMonth(-1)}
            style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}
          >
            <Text style={styles.navButtonText}>‹</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={goToday} style={({ pressed }) => [styles.todayButton, pressed && styles.pressed]}>
            <Text style={styles.todayButtonText}>{ui.today}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Next month"
            accessibilityRole="button"
            onPress={() => goMonth(1)}
            style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}
          >
            <Text style={styles.navButtonText}>›</Text>
          </Pressable>
        </View>

        <Text numberOfLines={1} style={styles.monthTitle}>{formatMonth(anchor)}</Text>

        <View style={styles.viewToggle} accessibilityRole="tablist">
          {(['month', 'week', 'day'] as CalendarViewMode[]).map((mode) => {
            const active = viewMode === mode;
            const label = mode === 'month' ? ui.month : mode === 'week' ? ui.week : ui.day;
            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                key={mode}
                onPress={() => setViewMode(mode)}
                style={({ pressed }) => [styles.viewToggleItem, active && styles.viewToggleActive, pressed && styles.pressed]}
              >
                <Text style={[styles.viewToggleText, active && styles.viewToggleTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View
          onTouchStart={(event) => { calendarTouchX.current = event.nativeEvent.pageX; }}
          onTouchEnd={(event) => {
            const start = calendarTouchX.current;
            calendarTouchX.current = null;
            if (start === null) return;
            const delta = event.nativeEvent.pageX - start;
            if (Math.abs(delta) < 55) return;
            goMonth(delta > 0 ? -1 : 1);
          }}
          style={styles.calendarFrame}
        >
          {viewMode !== 'day' ? (
            <View style={styles.weekdays}>
              {weekdayLabels().map((weekday) => <Text key={weekday} style={styles.weekday}>{weekday}</Text>)}
            </View>
          ) : null}

          {loading && !appointments.length ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={colors.primary} size="large" />
            </View>
          ) : error && !appointments.length ? (
            <View style={styles.errorState}>
              <Text style={styles.errorText}>{ui.loadError}</Text>
              <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.retryButton}>
                <Text style={styles.retryText}>{ui.retry}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={[styles.dayGrid, viewMode === 'day' && styles.dayGridSingle]}>
              {visibleDays.map((day) => (
                <CalendarDayCell
                  appointments={appointmentsByDate.get(day.iso) ?? []}
                  day={day}
                  extraMarkers={extraMarkersByDate.get(day.iso) ?? []}
                  isSelected={day.iso === selectedDate}
                  isToday={day.iso === today}
                  key={day.iso}
                  mode={viewMode}
                  onPress={() => selectDay(day)}
                />
              ))}
            </View>
          )}
        </View>

        <View
          onLayout={(event) => { eventsY.current = event.nativeEvent.layout.y; }}
          style={styles.eventsCard}
        >
          <Text style={styles.cardTitle}>{ui.events} · {formatLongDate(selectedDate)}</Text>
          {selectedAppointments.length ? selectedAppointments.map((appointment) => (
            <AppointmentRow appointment={appointment} key={appointment.id} />
          )) : <Text style={styles.cardMuted}>{ui.noEvents}</Text>}
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.cardTitle}>{ui.insights}</Text>
          <Text style={styles.cardMuted}>
            {attentionCount ? `${attentionCount} ${ui.attention}` : ui.noAlerts}
          </Text>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.cardTitle}>{ui.quickActions}</Text>
          <View style={styles.quickActions}>
            {user?.is_verified_artist ? (
              <>
                <QuickAction label={ui.addSession} onPress={() => router.push('/artist-dashboard/create-appointment')} />
                <QuickAction label={ui.blockTime} onPress={() => router.push('/artist-dashboard/calendar')} />
                <QuickAction label={ui.setVacation} onPress={() => router.push('/artist-dashboard/calendar')} />
                <QuickAction label={ui.createConsultation} onPress={() => router.push('/artist-dashboard/create-appointment')} />
              </>
            ) : (
              <QuickAction label={ui.appointments} onPress={() => router.push('/(tabs)/bookings')} />
            )}
          </View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.cardTitle}>{ui.legend}</Text>
          <LegendRow color={colors.primary} label={ui.tattooSession} />
          <LegendRow color={colors.accent} label={ui.consultation} />
          <LegendRow color={BLOCKED_COLOR} label={ui.blocked} />
          <LegendRow color={VACATION_COLOR} label={ui.vacation} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function CalendarDayCell({
  day,
  appointments,
  extraMarkers,
  isSelected,
  isToday,
  mode,
  onPress,
}: {
  day: CalendarDay;
  appointments: Appointment[];
  extraMarkers: CalendarMarker[];
  isSelected: boolean;
  isToday: boolean;
  mode: CalendarViewMode;
  onPress: () => void;
}) {
  const markers = [
    ...appointments.map((appointment) => ({ key: `appointment-${appointment.id}`, color: appointmentColor(appointment) })),
    ...extraMarkers,
  ];

  return (
    <Pressable
      accessibilityLabel={`${day.iso}, ${markers.length} events`}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.dayCell,
        mode === 'week' && styles.dayCellWeek,
        mode === 'day' && styles.dayCellDay,
        !day.inCurrentMonth && styles.dayCellMuted,
        markers.length > 0 && styles.dayCellHasEvents,
        isToday && styles.dayCellToday,
        isSelected && styles.dayCellSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[
        styles.dayNumber,
        !day.inCurrentMonth && styles.dayNumberMuted,
        isToday && styles.dayNumberToday,
        isSelected && styles.dayNumberSelected,
      ]}>
        {day.date.getUTCDate()}
      </Text>
      {mode === 'day' ? <Text style={styles.dayModeLong}>{formatLongDate(day.iso)}</Text> : null}
      <View style={styles.dayDots}>
        {markers.slice(0, 1).map((marker) => <View key={marker.key} style={[styles.dayDot, { backgroundColor: marker.color }]} />)}
      </View>
    </Pressable>
  );
}

function AppointmentRow({ appointment }: { appointment: Appointment }) {
  const color = appointmentColor(appointment);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/appointment/[appointmentId]', params: { appointmentId: String(appointment.id) } })}
      style={({ pressed }) => [styles.appointmentRow, pressed && styles.pressed]}
    >
      <View style={[styles.appointmentMark, { backgroundColor: color }]} />
      <View style={styles.appointmentCopy}>
        <Text style={styles.appointmentTitle}>{appointment.booking_type_label}</Text>
        <Text style={styles.appointmentMeta}>{timeRange(appointment)} · {appointment.other_user.username}</Text>
      </View>
    </Pressable>
  );
}

function QuickAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}>
      <Text style={styles.quickActionText}>{label}</Text>
    </Pressable>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xxl,
    gap: 14,
  },
  titleBlock: { display: 'none' },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 2.2, textTransform: 'uppercase' },
  title: { color: colors.text, fontSize: 31, lineHeight: 36, fontWeight: '900', letterSpacing: -.8 },
  navigationControls: { display: 'none' },
  navButton: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(4,197,191,.13)', backgroundColor: '#071820' },
  navButtonText: { color: colors.text, fontSize: 24, lineHeight: 27 },
  todayButton: { flex: 1, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(4,197,191,.13)', backgroundColor: '#071820' },
  todayButtonText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  monthTitle: { display: 'none' },
  viewToggle: { display: 'none' },
  viewToggleItem: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(4,197,191,.12)', backgroundColor: '#071820' },
  viewToggleActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  viewToggleText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  viewToggleTextActive: { color: '#001014' },
  calendarFrame: { borderRadius: 18, borderWidth: 1, borderColor: 'rgba(4,197,191,.12)', padding: 9, backgroundColor: '#000d16', gap: 9, marginTop: 2 },
  weekdays: { flexDirection: 'row', paddingHorizontal: 1 },
  weekday: { width: '14.2857%', textAlign: 'center', color: colors.textMuted, fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  loadingState: { minHeight: 300, alignItems: 'center', justifyContent: 'center' },
  errorState: { minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 20 },
  errorText: { color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  retryButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 18, borderRadius: 12, backgroundColor: colors.primary },
  retryText: { color: colors.black, fontWeight: '900' },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 7, borderRadius: 14 },
  dayGridSingle: { borderWidth: 0 },
  dayCell: { width: '13.2%', minHeight: 64, paddingVertical: 8, paddingHorizontal: 2, alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,.045)', backgroundColor: '#000c15' },
  dayCellWeek: { minHeight: 84 },
  dayCellDay: { width: '100%', minHeight: 128, justifyContent: 'center', borderWidth: 1, borderRadius: 15 },
  dayCellMuted: { opacity: .28 },
  dayCellHasEvents: { backgroundColor: 'rgba(4,197,191,.055)', borderColor: 'rgba(4,197,191,.10)' },
  dayCellToday: { borderColor: 'rgba(4,197,191,.22)' },
  dayCellSelected: { borderColor: 'rgba(4,197,191,.25)', backgroundColor: 'rgba(4,197,191,.07)' },
  dayNumber: { color: colors.text, fontSize: 12, fontWeight: '800' },
  dayNumberMuted: { color: colors.textSubtle },
  dayNumberToday: { color: colors.primary },
  dayNumberSelected: { color: colors.text, fontWeight: '900' },
  dayModeLong: { color: colors.textMuted, fontSize: 13, textAlign: 'center', textTransform: 'capitalize' },
  dayDots: { minHeight: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  dayDot: { width: 7, height: 7, borderRadius: 4 },
  eventsCard: { borderRadius: 16, borderWidth: 1, borderColor: 'rgba(4,197,191,.11)', backgroundColor: '#00121c', padding: 14, gap: 8 },
  infoCard: { borderRadius: 16, borderWidth: 1, borderColor: 'rgba(4,197,191,.11)', backgroundColor: '#00121c', padding: 14, gap: 12 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  cardMuted: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  appointmentRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,.07)', paddingVertical: 8 },
  appointmentMark: { width: 6, height: 34, borderRadius: 3 },
  appointmentCopy: { flex: 1, gap: 2 },
  appointmentTitle: { color: colors.text, fontSize: 13, fontWeight: '900' },
  appointmentMeta: { color: colors.textMuted, fontSize: 11 },
  quickActions: { gap: 8 },
  quickAction: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 9, borderWidth: 1, borderColor: 'rgba(255,255,255,.08)', backgroundColor: '#091820' },
  quickActionText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  legendRow: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 10 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { color: colors.textMuted, fontSize: 12 },
  pressed: { opacity: .68, transform: [{ scale: .985 }] },
});

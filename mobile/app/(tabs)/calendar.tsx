import { useCallback, useMemo, useState } from 'react';
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

import type { Appointment } from '@/api/types';
import { useAuth } from '@/auth/auth-context';
import { fetchAppointments } from '@/booking/booking-api';
import { BrandHeader } from '@/components/brand-header';
import { appLanguage } from '@/i18n';
import { colors, radius, spacing } from '@/theme';


type CalendarViewMode = 'month' | 'week' | 'day';

type CalendarDay = {
  iso: string;
  date: Date;
  inCurrentMonth: boolean;
};

const WEEKDAYS = {
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  fr: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'],
  ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
} as const;

const COPY = {
  en: {
    calendar: 'Calendar',
    eyebrow: 'Tatzo',
    subtitle: 'Your appointments, sessions and booking requests in one view.',
    today: 'Today',
    month: 'Month',
    week: 'Week',
    day: 'Day',
    appointments: 'Appointments',
    selectedDay: 'Selected day',
    noEvents: 'No events',
    noEventsHint: 'Nothing is scheduled for this day yet.',
    thisMonth: 'This month',
    insights: 'Insights',
    total: 'Events',
    confirmed: 'Confirmed',
    attention: 'Needs attention',
    legend: 'Event status',
    pending: 'Pending',
    accepted: 'Confirmed',
    needsAttention: 'Action needed',
    closed: 'Completed / closed',
    loadError: 'Calendar is unavailable right now.',
    retry: 'Retry',
  },
  fr: {
    calendar: 'Calendrier',
    eyebrow: 'Tatzo',
    subtitle: 'Vos rendez-vous, séances et demandes de réservation dans une seule vue.',
    today: 'Aujourd’hui',
    month: 'Mois',
    week: 'Semaine',
    day: 'Jour',
    appointments: 'Rendez-vous',
    selectedDay: 'Jour sélectionné',
    noEvents: 'Aucun événement',
    noEventsHint: 'Rien n’est prévu pour cette journée.',
    thisMonth: 'Ce mois-ci',
    insights: 'Aperçu',
    total: 'Événements',
    confirmed: 'Confirmés',
    attention: 'À traiter',
    legend: 'Statut des événements',
    pending: 'En attente',
    accepted: 'Confirmé',
    needsAttention: 'Action requise',
    closed: 'Terminé / fermé',
    loadError: 'Le calendrier est indisponible pour le moment.',
    retry: 'Réessayer',
  },
  ru: {
    calendar: 'Календарь',
    eyebrow: 'Tatzo',
    subtitle: 'Записи, сеансы и запросы на бронирование — в одном месте.',
    today: 'Сегодня',
    month: 'Месяц',
    week: 'Неделя',
    day: 'День',
    appointments: 'Записи',
    selectedDay: 'Выбранный день',
    noEvents: 'Событий нет',
    noEventsHint: 'На этот день пока ничего не запланировано.',
    thisMonth: 'Этот месяц',
    insights: 'Сводка',
    total: 'События',
    confirmed: 'Подтверждено',
    attention: 'Требуют внимания',
    legend: 'Статус событий',
    pending: 'Ожидает',
    accepted: 'Подтверждено',
    needsAttention: 'Нужно действие',
    closed: 'Завершено / закрыто',
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

function appointmentColor(status: Appointment['status']) {
  if (status === 'accepted') return colors.success;
  if (status === 'completed' || status === 'cancelled' || status === 'declined') return colors.textSubtle;
  if (status === 'needs_references' || status === 'consultation_required') return colors.accent;
  return colors.primary;
}

function timeRange(appointment: Appointment) {
  if (!appointment.end_time) return appointment.start_time;
  return `${appointment.start_time}–${appointment.end_time}`;
}

function appointmentNeedsAttention(appointment: Appointment) {
  return appointment.status === 'pending'
    || appointment.status === 'needs_references'
    || appointment.status === 'consultation_required';
}

function appointmentConfirmed(appointment: Appointment) {
  return appointment.status === 'accepted' || appointment.status === 'completed';
}

export default function CalendarScreen() {
  const ui = copy();
  const { request, status } = useAuth();
  const today = localTodayIso();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [attentionCount, setAttentionCount] = useState(0);
  const [anchor, setAnchor] = useState(() => monthAnchor(today));
  const [selectedDate, setSelectedDate] = useState(today);
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (status !== 'authenticated') return;
    if (!quiet) setLoading(true);
    setError(false);
    try {
      const response = await fetchAppointments(request);
      setAppointments(response.results);
      setAttentionCount(response.attention_count);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [request, status]);

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

  const visibleDays = useMemo(() => {
    if (viewMode === 'day') {
      const date = dateFromIso(selectedDate);
      return [{ date, iso: selectedDate, inCurrentMonth: date.getUTCMonth() === anchor.getUTCMonth() }];
    }
    if (viewMode === 'week') return buildWeekDays(selectedDate, anchor);
    return buildMonthDays(anchor);
  }, [anchor, selectedDate, viewMode]);

  const selectedAppointments = appointmentsByDate.get(selectedDate) ?? [];
  const currentMonthAppointments = useMemo(() => appointments.filter((appointment) => {
    const date = dateFromIso(appointment.date);
    return date.getUTCFullYear() === anchor.getUTCFullYear()
      && date.getUTCMonth() === anchor.getUTCMonth();
  }), [anchor, appointments]);

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
  };

  const refresh = () => {
    setRefreshing(true);
    void load(true);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
      <ScrollView
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

        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text style={styles.eyebrow}>{ui.eyebrow}</Text>
            <Text style={styles.title}>{ui.calendar}</Text>
            <Text style={styles.subtitle}>{ui.subtitle}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/(tabs)/bookings')}
            style={({ pressed }) => [styles.appointmentsLink, pressed && styles.pressed]}
          >
            <Text style={styles.appointmentsLinkText}>{ui.appointments}</Text>
            {attentionCount ? <View style={styles.attentionBadge}><Text style={styles.attentionBadgeText}>{attentionCount}</Text></View> : null}
          </Pressable>
        </View>

        <View style={styles.calendarCard}>
          <View style={styles.monthControls}>
            <Pressable
              accessibilityLabel="Previous month"
              accessibilityRole="button"
              onPress={() => goMonth(-1)}
              style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
            >
              <Text style={styles.circleButtonText}>‹</Text>
            </Pressable>
            <View style={styles.monthTitleWrap}>
              <Text numberOfLines={1} style={styles.monthTitle}>{formatMonth(anchor)}</Text>
              <Pressable accessibilityRole="button" onPress={goToday}>
                <Text style={styles.todayLink}>{ui.today}</Text>
              </Pressable>
            </View>
            <Pressable
              accessibilityLabel="Next month"
              accessibilityRole="button"
              onPress={() => goMonth(1)}
              style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}
            >
              <Text style={styles.circleButtonText}>›</Text>
            </Pressable>
          </View>

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

        <View style={styles.selectedCard}>
          <View style={styles.sectionHeading}>
            <View style={styles.sectionHeadingCopy}>
              <Text style={styles.sectionEyebrow}>{ui.selectedDay}</Text>
              <Text style={styles.sectionTitle}>{formatLongDate(selectedDate)}</Text>
            </View>
            <View style={styles.dayCountBadge}>
              <Text style={styles.dayCountText}>{selectedAppointments.length}</Text>
            </View>
          </View>

          {selectedAppointments.length ? (
            <View style={styles.eventList}>
              {selectedAppointments.map((appointment) => (
                <AppointmentPill appointment={appointment} key={appointment.id} />
              ))}
            </View>
          ) : (
            <View style={styles.emptyDay}>
              <Text style={styles.emptyDayTitle}>{ui.noEvents}</Text>
              <Text style={styles.emptyDayHint}>{ui.noEventsHint}</Text>
            </View>
          )}
        </View>

        <View style={styles.insightsCard}>
          <Text style={styles.sectionEyebrow}>{ui.insights}</Text>
          <Text style={styles.sectionTitle}>{ui.thisMonth}</Text>
          <View style={styles.insightGrid}>
            <Insight value={currentMonthAppointments.length} label={ui.total} />
            <Insight value={currentMonthAppointments.filter(appointmentConfirmed).length} label={ui.confirmed} />
            <Insight value={currentMonthAppointments.filter(appointmentNeedsAttention).length} label={ui.attention} />
          </View>
        </View>

        <View style={styles.legendCard}>
          <Text style={styles.sectionEyebrow}>{ui.legend}</Text>
          <LegendRow color={colors.primary} label={ui.pending} />
          <LegendRow color={colors.success} label={ui.accepted} />
          <LegendRow color={colors.accent} label={ui.needsAttention} />
          <LegendRow color={colors.textSubtle} label={ui.closed} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function CalendarDayCell({
  day,
  appointments,
  isSelected,
  isToday,
  mode,
  onPress,
}: {
  day: CalendarDay;
  appointments: Appointment[];
  isSelected: boolean;
  isToday: boolean;
  mode: CalendarViewMode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`${day.iso}, ${appointments.length} events`}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.dayCell,
        mode === 'week' && styles.dayCellWeek,
        mode === 'day' && styles.dayCellDay,
        !day.inCurrentMonth && styles.dayCellMuted,
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
      {mode === 'day' ? (
        <Text style={styles.dayModeLong}>{formatLongDate(day.iso)}</Text>
      ) : null}
      <View style={styles.dayDots}>
        {appointments.slice(0, 3).map((appointment) => (
          <View key={appointment.id} style={[styles.dayDot, { backgroundColor: appointmentColor(appointment.status) }]} />
        ))}
        {appointments.length > 3 ? <Text style={styles.moreCount}>+{appointments.length - 3}</Text> : null}
      </View>
    </Pressable>
  );
}

function AppointmentPill({ appointment }: { appointment: Appointment }) {
  const color = appointmentColor(appointment.status);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({
        pathname: '/appointment/[appointmentId]',
        params: { appointmentId: String(appointment.id) },
      })}
      style={({ pressed }) => [styles.eventPill, { borderLeftColor: color }, pressed && styles.pressed]}
    >
      <View style={styles.eventTimeWrap}>
        <Text style={[styles.eventTime, { color }]}>{timeRange(appointment)}</Text>
        <View style={[styles.eventStatusDot, { backgroundColor: color }]} />
      </View>
      <Text numberOfLines={1} style={styles.eventType}>{appointment.booking_type_label}</Text>
      <Text numberOfLines={1} style={styles.eventPerson}>{appointment.other_user.username}</Text>
      <View style={[styles.eventStatusBadge, { borderColor: color }]}>
        <Text numberOfLines={1} style={[styles.eventStatusText, { color }]}>{appointment.status_label}</Text>
      </View>
    </Pressable>
  );
}

function Insight({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.insight}>
      <Text style={styles.insightValue}>{value}</Text>
      <Text numberOfLines={2} style={styles.insightLabel}>{label}</Text>
    </View>
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
    gap: spacing.md,
  },
  hero: {
    padding: spacing.lg,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(4,197,191,.18)',
    backgroundColor: '#00131d',
    gap: spacing.md,
  },
  heroCopy: { gap: 5 },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 2.2, textTransform: 'uppercase' },
  title: { color: colors.text, fontSize: 34, lineHeight: 38, fontWeight: '900', letterSpacing: -0.8 },
  subtitle: { color: colors.textMuted, fontSize: 14, lineHeight: 21, maxWidth: 480 },
  appointmentsLink: {
    alignSelf: 'flex-start', minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 15, borderRadius: 999, borderWidth: 1,
    borderColor: 'rgba(4,197,191,.24)', backgroundColor: 'rgba(4,197,191,.07)',
  },
  appointmentsLinkText: { color: colors.primary, fontSize: 12, fontWeight: '900' },
  attentionBadge: { minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  attentionBadgeText: { color: colors.white, fontSize: 9, fontWeight: '900' },
  calendarCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(4,197,191,.18)',
    backgroundColor: '#00131d',
    padding: 12,
    gap: 12,
  },
  monthControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  circleButton: {
    width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21,
    borderWidth: 1, borderColor: 'rgba(4,197,191,.22)', backgroundColor: '#031b27',
  },
  circleButtonText: { color: colors.primary, fontSize: 29, lineHeight: 31, fontWeight: '500' },
  monthTitleWrap: { flex: 1, alignItems: 'center', gap: 2 },
  monthTitle: { color: colors.text, fontSize: 18, fontWeight: '900', textTransform: 'capitalize' },
  todayLink: { color: colors.primary, fontSize: 11, fontWeight: '900' },
  viewToggle: {
    minHeight: 42, flexDirection: 'row', padding: 4, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(4,197,191,.13)', backgroundColor: '#000d18',
  },
  viewToggleItem: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingHorizontal: 6 },
  viewToggleActive: { backgroundColor: 'rgba(4,197,191,.12)', borderWidth: 1, borderColor: 'rgba(4,197,191,.30)' },
  viewToggleText: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
  viewToggleTextActive: { color: colors.primary },
  weekdays: { flexDirection: 'row', paddingHorizontal: 2 },
  weekday: { width: '14.2857%', textAlign: 'center', color: colors.textSubtle, fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  loadingState: { minHeight: 300, alignItems: 'center', justifyContent: 'center' },
  errorState: { minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 20 },
  errorText: { color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  retryButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 18, borderRadius: 14, backgroundColor: colors.primary },
  retryText: { color: colors.black, fontWeight: '900' },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap', overflow: 'hidden', borderRadius: 17, borderWidth: 1, borderColor: 'rgba(4,197,191,.10)' },
  dayGridSingle: { borderWidth: 0 },
  dayCell: {
    width: '14.2857%', minHeight: 61, paddingVertical: 7, paddingHorizontal: 4,
    alignItems: 'center', gap: 7, borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(4,197,191,.10)', backgroundColor: '#001822',
  },
  dayCellWeek: { minHeight: 82 },
  dayCellDay: { width: '100%', minHeight: 122, justifyContent: 'center', borderWidth: 1, borderRadius: 18, borderColor: 'rgba(4,197,191,.12)' },
  dayCellMuted: { opacity: 0.42, backgroundColor: '#000f18' },
  dayCellToday: { backgroundColor: 'rgba(238,12,111,.08)' },
  dayCellSelected: { backgroundColor: 'rgba(4,197,191,.13)', borderColor: colors.primary, borderWidth: 1 },
  dayNumber: { color: colors.text, fontSize: 12, fontWeight: '800' },
  dayNumberMuted: { color: colors.textSubtle },
  dayNumberToday: { color: colors.accent },
  dayNumberSelected: { color: colors.primary, fontWeight: '900' },
  dayModeLong: { color: colors.textMuted, fontSize: 13, textAlign: 'center', textTransform: 'capitalize' },
  dayDots: { minHeight: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, flexWrap: 'wrap' },
  dayDot: { width: 5, height: 5, borderRadius: 3 },
  moreCount: { color: colors.textSubtle, fontSize: 7, fontWeight: '900' },
  selectedCard: {
    borderRadius: 22, borderWidth: 1, borderColor: 'rgba(4,197,191,.16)',
    backgroundColor: '#00131d', padding: spacing.lg, gap: spacing.md,
  },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionHeadingCopy: { flex: 1, minWidth: 0, gap: 4 },
  sectionEyebrow: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase' },
  sectionTitle: { color: colors.text, fontSize: 18, lineHeight: 23, fontWeight: '900', textTransform: 'capitalize' },
  dayCountBadge: { minWidth: 34, height: 34, paddingHorizontal: 8, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(4,197,191,.11)', borderWidth: 1, borderColor: 'rgba(4,197,191,.22)' },
  dayCountText: { color: colors.primary, fontWeight: '900' },
  eventList: { gap: 9 },
  eventPill: {
    minHeight: 90, padding: 12, paddingLeft: 14, borderRadius: 15, borderWidth: 1,
    borderColor: 'rgba(4,197,191,.10)', borderLeftWidth: 3, backgroundColor: '#031b27', gap: 4,
  },
  eventTimeWrap: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  eventTime: { fontSize: 11, fontWeight: '900' },
  eventStatusDot: { width: 6, height: 6, borderRadius: 3 },
  eventType: { color: colors.text, fontSize: 14, fontWeight: '900' },
  eventPerson: { color: colors.textMuted, fontSize: 12 },
  eventStatusBadge: { alignSelf: 'flex-start', marginTop: 3, borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 },
  eventStatusText: { fontSize: 8, fontWeight: '900', textTransform: 'uppercase' },
  emptyDay: { minHeight: 110, justifyContent: 'center', alignItems: 'center', gap: 5, borderRadius: 16, backgroundColor: '#031b27', padding: spacing.md },
  emptyDayTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  emptyDayHint: { color: colors.textMuted, textAlign: 'center', fontSize: 12, lineHeight: 18 },
  insightsCard: {
    borderRadius: 22, borderWidth: 1, borderColor: 'rgba(4,197,191,.16)',
    backgroundColor: '#00131d', padding: spacing.lg, gap: 9,
  },
  insightGrid: { flexDirection: 'row', gap: 8, marginTop: 3 },
  insight: { flex: 1, minWidth: 0, minHeight: 80, justifyContent: 'center', padding: 10, borderRadius: 15, backgroundColor: '#031b27', borderWidth: 1, borderColor: 'rgba(4,197,191,.08)' },
  insightValue: { color: colors.text, fontSize: 23, fontWeight: '900' },
  insightLabel: { color: colors.textMuted, fontSize: 9, lineHeight: 13, marginTop: 3 },
  legendCard: {
    borderRadius: 22, borderWidth: 1, borderColor: 'rgba(4,197,191,.16)',
    backgroundColor: '#00131d', padding: spacing.lg, gap: 10,
  },
  legendRow: { minHeight: 31, flexDirection: 'row', alignItems: 'center', gap: 10 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  pressed: { opacity: 0.68, transform: [{ scale: 0.985 }] },
});

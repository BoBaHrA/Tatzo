import { router } from 'expo-router';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
} from 'react-native';

import type {
  ArtistDashboard,
  ArtistTimelineItem,
  ArtistWorkloadDay,
} from '@/api/types';
import { appLanguage, t } from '@/i18n';
import { colors, radius, spacing } from '@/theme';


function formatDate(value: string, compact = false) {
  return new Intl.DateTimeFormat(appLanguage, {
    weekday: 'short',
    day: 'numeric',
    ...(compact ? {} : { month: 'short' as const }),
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`));
}

function workloadLabel(day: ArtistWorkloadDay) {
  switch (day.workload) {
    case 'light': return t('artistWorkloadLight');
    case 'busy': return t('artistWorkloadBusy');
    case 'full': return t('artistWorkloadFull');
    case 'closed': return t('artistWorkloadClosed');
    case 'time_off': return t('artistWorkloadTimeOff');
    default: return t('artistWorkloadEmpty');
  }
}

function workloadColor(day: ArtistWorkloadDay) {
  if (day.workload === 'full') return colors.danger;
  if (day.workload === 'busy' || day.workload === 'time_off') return colors.accent;
  if (day.workload === 'closed') return colors.textMuted;
  return colors.primary;
}

export function ArtistStats({ stats }: { stats: ArtistDashboard['stats'] }) {
  const items = [
    { value: stats.today_sessions, label: t('artistTodaySessions') },
    { value: stats.pending_requests, label: t('artistPendingRequests'), accent: true },
    { value: stats.upcoming_consultations, label: t('artistUpcomingConsultations') },
    { value: stats.unread_messages, label: t('artistUnreadMessages'), accent: true },
  ];
  return (
    <View style={styles.statsGrid}>
      {items.map((item) => (
        <View key={item.label} style={styles.statCard}>
          <Text style={[styles.statValue, item.accent && styles.accentText]}>{item.value}</Text>
          <Text style={styles.statLabel}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function WorkloadStrip({ days }: { days: ArtistWorkloadDay[] }) {
  return (
    <ScrollView
      contentContainerStyle={styles.workloadContent}
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      {days.map((day) => {
        const visualPercent = day.workload === 'closed' || day.workload === 'time_off'
          ? 100
          : Math.max(day.percent, day.booked_minutes ? 6 : 0);
        const bookedHours = Math.round(day.booked_minutes / 6) / 10;
        return (
          <View key={day.date} style={styles.workloadCard}>
            <Text style={styles.workloadDate}>{formatDate(day.date, true)}</Text>
            <View style={styles.workloadTrack}>
              <View
                style={[
                  styles.workloadFill,
                  {
                    backgroundColor: workloadColor(day),
                    width: `${visualPercent}%` as DimensionValue,
                  },
                ]}
              />
            </View>
            <Text numberOfLines={1} style={styles.workloadState}>{workloadLabel(day)}</Text>
            <Text style={styles.workloadHours}>{bookedHours ? `${bookedHours} h` : '—'}</Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

function TimelineRow({ item }: { item: ArtistTimelineItem }) {
  const canOpen = item.appointment_id !== null;
  const open = () => {
    if (!item.appointment_id) return;
    router.push({
      pathname: '/appointment/[appointmentId]',
      params: { appointmentId: String(item.appointment_id) },
    });
  };
  const roleLabel = item.role === 'artist' ? t('artistAsArtist') : t('artistAsClient');
  const statusLabel = item.source === 'time_off'
    ? t('artistWorkloadTimeOff')
    : item.status_label;
  const timeLabel = item.start_time
    ? `${item.start_time}${item.end_time ? `–${item.end_time}` : ''}`
    : t('artistWorkloadTimeOff');
  return (
    <Pressable
      accessibilityRole={canOpen ? 'button' : undefined}
      disabled={!canOpen}
      onPress={open}
      style={({ pressed }) => [styles.timelineRow, pressed && styles.pressed]}
    >
      {item.other_user?.profile_image_url ? (
        <Image source={{ uri: item.other_user.profile_image_url }} style={styles.avatar} />
      ) : (
        <View style={styles.timelineMark}>
          <Text style={styles.timelineMarkText}>{item.source === 'time_off' ? '—' : '⌁'}</Text>
        </View>
      )}
      <View style={styles.timelineBody}>
        <View style={styles.timelineTop}>
          <Text numberOfLines={1} style={styles.timelineTitle}>{item.title}</Text>
          <Text style={styles.timelineDate}>{formatDate(item.date)}</Text>
        </View>
        <Text style={styles.timelineTime}>{timeLabel}</Text>
        <View style={styles.timelineMeta}>
          <Text numberOfLines={1} style={styles.timelineRole}>
            {roleLabel}{item.other_user ? ` · ${item.other_user.username}` : ''}
          </Text>
          <Text numberOfLines={1} style={styles.timelineStatus}>{statusLabel}</Text>
        </View>
      </View>
      {canOpen ? <Text style={styles.chevron}>›</Text> : null}
    </Pressable>
  );
}

export function ArtistTimeline({ items }: { items: ArtistTimelineItem[] }) {
  if (!items.length) {
    return <Text style={styles.emptyText}>{t('artistUpcomingEmpty')}</Text>;
  }
  return (
    <View style={styles.timelineList}>
      {items.map((item) => <TimelineRow item={item} key={item.id} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statCard: {
    width: '48%', flexGrow: 1, minHeight: 106, justifyContent: 'center',
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.medium, padding: spacing.md, gap: spacing.xs,
  },
  statValue: { color: colors.primary, fontSize: 30, fontWeight: '900' },
  accentText: { color: colors.accent },
  statLabel: { color: colors.textMuted, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  workloadContent: { gap: spacing.sm, paddingVertical: spacing.xs },
  workloadCard: {
    width: 116, backgroundColor: colors.surface, borderColor: colors.border,
    borderWidth: 1, borderRadius: radius.medium, padding: spacing.sm, gap: 7,
  },
  workloadDate: { color: colors.text, fontSize: 13, fontWeight: '900', textTransform: 'capitalize' },
  workloadTrack: { height: 7, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.backgroundDeep },
  workloadFill: { height: '100%', borderRadius: 4 },
  workloadState: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
  workloadHours: { color: colors.primary, fontSize: 12, fontWeight: '900', fontVariant: ['tabular-nums'] },
  timelineList: { gap: spacing.sm },
  timelineRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.medium, padding: spacing.sm,
  },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  timelineMark: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center',
    justifyContent: 'center', backgroundColor: colors.backgroundDeep,
  },
  timelineMarkText: { color: colors.primary, fontSize: 20, fontWeight: '900' },
  timelineBody: { flex: 1, minWidth: 0, gap: 3 },
  timelineTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  timelineTitle: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '900' },
  timelineDate: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },
  timelineTime: { color: colors.primary, fontSize: 12, fontWeight: '900' },
  timelineMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  timelineRole: { flex: 1, color: colors.textMuted, fontSize: 10 },
  timelineStatus: { maxWidth: '42%', color: colors.accent, fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  chevron: { color: colors.primary, fontSize: 26 },
  emptyText: { color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.lg, lineHeight: 21 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.992 }] },
});

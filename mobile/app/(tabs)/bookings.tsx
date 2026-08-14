import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Appointment } from '@/api/types';
import { useAuth } from '@/auth/auth-context';
import { fetchAppointments } from '@/booking/booking-api';
import { BrandHeader } from '@/components/brand-header';
import { Button } from '@/components/button';
import { appLanguage, t } from '@/i18n';
import { colors, radius, spacing } from '@/theme';


function formatAppointmentDate(appointment: Appointment) {
  const date = new Date(`${appointment.date}T12:00:00Z`);
  return `${new Intl.DateTimeFormat(appLanguage, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)} · ${appointment.start_time}`;
}

function statusColor(status: Appointment['status']) {
  if (status === 'accepted' || status === 'completed') return colors.success;
  if (status === 'declined' || status === 'cancelled') return colors.danger;
  if (status === 'needs_references' || status === 'consultation_required') return colors.accent;
  return colors.primary;
}

function AppointmentRow({ appointment }: { appointment: Appointment }) {
  const user = appointment.other_user;
  const color = statusColor(appointment.status);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({
        pathname: '/appointment/[appointmentId]',
        params: { appointmentId: String(appointment.id) },
      })}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {user.profile_image_url ? (
        <Image source={{ uri: user.profile_image_url }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarFallback}>
          <Text style={styles.avatarLetter}>{user.username[0]?.toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text numberOfLines={1} style={styles.username}>{user.username}</Text>
          <View style={[styles.statusBadge, { borderColor: color }]}>
            <Text numberOfLines={1} style={[styles.statusText, { color }]}>
              {appointment.status_label}
            </Text>
          </View>
        </View>
        <Text numberOfLines={1} style={styles.type}>{appointment.booking_type_label}</Text>
        <Text style={styles.date}>{formatAppointmentDate(appointment)}</Text>
        <Text style={styles.role}>
          {appointment.role === 'artist' ? t('requestFromClient') : t('requestWithArtist')}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

export default function BookingsScreen() {
  const { request, status } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [attentionCount, setAttentionCount] = useState(0);
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

  const refresh = () => {
    setRefreshing(true);
    void load(true);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
      <FlatList
        contentContainerStyle={styles.content}
        data={appointments}
        keyExtractor={(appointment) => String(appointment.id)}
        ListHeaderComponent={(
          <View style={styles.header}>
            <BrandHeader />
            <View style={styles.titleCard}>
              <View style={styles.titleLine}>
                <View style={styles.titleCopy}>
                  <Text style={styles.eyebrow}>{t('bookingEyebrow')}</Text>
                  <Text style={styles.title}>{t('bookings')}</Text>
                </View>
                {attentionCount ? (
                  <View style={styles.attentionBadge}>
                    <Text style={styles.attentionText}>{attentionCount}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.subtitle}>{t('bookingsSubtitle')}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.muted}>{t('loadingBookings')}</Text>
          </View>
        ) : error ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>{t('bookingsUnavailable')}</Text>
            <Text style={styles.muted}>{t('bookingsError')}</Text>
            <Button label={t('retry')} onPress={() => void load()} />
          </View>
        ) : (
          <View style={styles.stateCard}>
            <Text style={styles.emptySymbol}>⌁</Text>
            <Text style={styles.stateTitle}>{t('bookingsEmpty')}</Text>
            <Text style={styles.muted}>{t('bookingsEmptyHint')}</Text>
            <Button label={t('exploreArtists')} onPress={() => router.push('/(tabs)/home')} />
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={(
          <RefreshControl
            colors={[colors.primary]}
            onRefresh={refresh}
            refreshing={refreshing}
            tintColor={colors.primary}
          />
        )}
        renderItem={({ item }) => <AppointmentRow appointment={item} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: {
    flexGrow: 1, width: '100%', maxWidth: 620, alignSelf: 'center',
    padding: spacing.md, paddingBottom: spacing.xxl,
  },
  header: { gap: spacing.md, marginBottom: spacing.lg },
  titleCard: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.large, padding: spacing.lg, gap: spacing.xs,
  },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  titleCopy: { flex: 1, gap: spacing.xs },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 32, fontWeight: '900' },
  subtitle: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  attentionBadge: {
    minWidth: 38, height: 38, paddingHorizontal: spacing.sm, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent,
  },
  attentionText: { color: colors.white, fontSize: 15, fontWeight: '900' },
  row: {
    minHeight: 112, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md, backgroundColor: colors.surface, borderWidth: 1,
    borderColor: colors.border, borderRadius: radius.medium,
  },
  avatar: { width: 58, height: 58, borderRadius: 29 },
  avatarFallback: {
    width: 58, height: 58, borderRadius: 29, alignItems: 'center',
    justifyContent: 'center', backgroundColor: colors.primary,
  },
  avatarLetter: { color: colors.backgroundDeep, fontSize: 22, fontWeight: '900' },
  rowBody: { flex: 1, minWidth: 0, gap: 4 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  username: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '900' },
  statusBadge: { maxWidth: '48%', borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  statusText: { fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  type: { color: colors.text, fontSize: 13, fontWeight: '700' },
  date: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  role: { color: colors.textMuted, fontSize: 11 },
  chevron: { color: colors.primary, fontSize: 29 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.992 }] },
  separator: { height: spacing.sm },
  centerState: { minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  stateCard: {
    alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border,
    borderWidth: 1, borderRadius: radius.large, padding: spacing.xl, gap: spacing.md,
  },
  emptySymbol: { color: colors.primary, fontSize: 42, fontWeight: '900' },
  stateTitle: { color: colors.text, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  muted: { color: colors.textMuted, lineHeight: 22, textAlign: 'center' },
});

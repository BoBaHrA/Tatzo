import { useCallback, useEffect, useMemo, useState } from 'react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { Appointment, ArtistAppointmentConfig } from '@/api/types';
import {
  fetchArtistAppointmentConfig,
  rescheduleArtistAppointment,
} from '@/artist-dashboard/artist-dashboard-api';
import { useAuth } from '@/auth/auth-context';
import {
  availableBookingTimes,
  BookingCalendar,
} from '@/booking/booking-calendar';
import { fetchAppointment } from '@/booking/booking-api';
import { BrandHeader } from '@/components/brand-header';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { userFacingError } from '@/errors';
import { appLanguage, t } from '@/i18n';
import { colors, radius, spacing } from '@/theme';


function formatCurrent(appointment: Appointment) {
  const date = new Intl.DateTimeFormat(appLanguage, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${appointment.date}T12:00:00Z`));
  return `${date} · ${appointment.start_time}${
    appointment.end_time ? `–${appointment.end_time}` : ''
  }`;
}

function TimeChoice({
  active,
  value,
  onPress,
}: {
  active: boolean;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        active && styles.choiceActive,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.choiceText, active && styles.choiceTextActive]}>
        {value}
      </Text>
    </Pressable>
  );
}

export default function RescheduleAppointmentScreen() {
  const params = useLocalSearchParams<{ appointmentId?: string | string[] }>();
  const rawId = Array.isArray(params.appointmentId)
    ? params.appointmentId[0]
    : params.appointmentId;
  const appointmentId = Number(rawId);
  const { request, status, user } = useAuth();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [config, setConfig] = useState<ArtistAppointmentConfig | null>(null);
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [durationText, setDurationText] = useState('60');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (
      status !== 'authenticated'
      || !user?.is_verified_artist
      || !Number.isInteger(appointmentId)
      || appointmentId <= 0
    ) return;
    setLoading(true);
    setLoadError(false);
    try {
      const [nextAppointment, nextConfig] = await Promise.all([
        fetchAppointment(request, appointmentId),
        fetchArtistAppointmentConfig(request, appointmentId),
      ]);
      setAppointment(nextAppointment);
      setConfig(nextConfig);
      setDate(nextAppointment.date);
      setStartTime(nextAppointment.start_time);
      setDurationText(String(nextAppointment.session_length_minutes ?? 60));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [appointmentId, request, status, user?.is_verified_artist]);

  useEffect(() => {
    void load();
  }, [load]);

  const duration = Number(durationText);
  const durationIsValid = Boolean(
    config
    && Number.isInteger(duration)
    && duration >= config.duration_minimum_minutes
    && duration <= config.settings.maximum_session_hours * 60
    && duration % config.duration_step_minutes === 0,
  );
  const times = useMemo(
    () => config && date && durationIsValid
      ? availableBookingTimes(config, date, duration)
      : [],
    [config, date, duration, durationIsValid],
  );

  if (status === 'anonymous') return <Redirect href="/(auth)/login" />;
  if (status === 'authenticated' && !user?.is_verified_artist) {
    return <Redirect href="/(tabs)/profile" />;
  }

  const submit = async () => {
    if (!appointment || !config || submitting) return;
    if (!durationIsValid) {
      setError(t('artistManualDurationError'));
      return;
    }
    if (!date || !startTime) {
      setError(t('chooseDateTimeError'));
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await rescheduleArtistAppointment(request, appointment.id, {
        date,
        startTime,
        duration,
      });
      router.replace({
        pathname: '/appointment/[appointmentId]',
        params: {
          appointmentId: String(appointment.id),
          rescheduled: 'true',
        },
      });
    } catch (caught) {
      setError(userFacingError(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen contentStyle={styles.screen}>
      <Pressable onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backText}>‹ {t('back')}</Text>
      </Pressable>
      <BrandHeader />

      {loading || status === 'loading' ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.muted}>{t('artistRescheduleLoading')}</Text>
        </View>
      ) : loadError || !appointment || !config ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>{t('artistRescheduleUnavailable')}</Text>
          <Text style={styles.muted}>{t('artistRescheduleLoadError')}</Text>
          <Button label={t('retry')} onPress={() => void load()} />
        </View>
      ) : (
        <>
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>{t('artistRescheduleEyebrow')}</Text>
            <Text style={styles.title}>{t('artistRescheduleTitle')}</Text>
            <Text style={styles.clientName}>@{appointment.client.username}</Text>
            <Text style={styles.subtitle}>
              {t('artistRescheduleCurrent')} · {formatCurrent(appointment)}
            </Text>
          </View>

          <View style={styles.card}>
            <Field
              keyboardType="number-pad"
              label={t('artistManualDuration')}
              maxLength={4}
              onChangeText={(value) => {
                setDurationText(value.replace(/[^0-9]/g, ''));
                setStartTime('');
                setError('');
              }}
              value={durationText}
            />
            <Text style={styles.hint}>
              {t('artistManualDurationHint')}{' '}
              {config.duration_step_minutes} {t('minutesShort')} ·{' '}
              {config.settings.maximum_session_hours} {t('hours')}
            </Text>

            <Text style={styles.fieldLabel}>{t('chooseDate')}</Text>
            <BookingCalendar
              config={config}
              onSelect={(value) => {
                setDate(value);
                setStartTime('');
                setError('');
              }}
              selectedDate={date}
            />

            <Text style={styles.fieldLabel}>{t('chooseTime')}</Text>
            {!durationIsValid ? (
              <Text style={styles.hint}>{t('artistManualDurationError')}</Text>
            ) : times.length ? (
              <View style={styles.choices}>
                {times.map((value) => (
                  <TimeChoice
                    active={startTime === value}
                    key={value}
                    onPress={() => {
                      setStartTime(value);
                      setError('');
                    }}
                    value={value}
                  />
                ))}
              </View>
            ) : (
              <Text style={styles.hint}>{t('noAvailableTimes')}</Text>
            )}
            <Text style={styles.timezone}>
              {t('artistManualTimezone')} · {config.artist_timezone}
            </Text>
          </View>

          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>{t('artistRescheduleNotice')}</Text>
            <Text style={styles.noticeText}>{t('artistRescheduleNoticeHint')}</Text>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            label={t('artistRescheduleSave')}
            loading={submitting}
            onPress={() => void submit()}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  backButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  backText: { color: colors.primary, fontSize: 16, fontWeight: '800' },
  centerState: {
    minHeight: 320,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  muted: { color: colors.textMuted, lineHeight: 22, textAlign: 'center' },
  stateCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.xl,
    gap: spacing.md,
  },
  stateTitle: { color: colors.text, fontSize: 23, fontWeight: '900', textAlign: 'center' },
  hero: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 30, fontWeight: '900' },
  clientName: { color: colors.primary, fontSize: 18, fontWeight: '900' },
  subtitle: { color: colors.textMuted, lineHeight: 21 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.lg,
    gap: spacing.md,
  },
  fieldLabel: { color: colors.text, fontSize: 14, fontWeight: '900' },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  choice: {
    minWidth: 70,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.backgroundDeep,
    paddingHorizontal: spacing.md,
  },
  choiceActive: { backgroundColor: colors.primaryMuted, borderColor: colors.primary },
  choiceText: { color: colors.textMuted, fontSize: 13, fontWeight: '800' },
  choiceTextActive: { color: colors.white },
  timezone: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  notice: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.medium,
    padding: spacing.md,
    gap: spacing.xs,
  },
  noticeTitle: { color: colors.text, fontWeight: '900' },
  noticeText: { color: colors.textMuted, lineHeight: 20 },
  error: { color: colors.danger, lineHeight: 20 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.985 }] },
});

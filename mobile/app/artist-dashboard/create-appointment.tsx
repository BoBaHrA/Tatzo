import { useCallback, useEffect, useMemo, useState } from 'react';
import { Redirect, router } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { ArtistAppointmentConfig, BookingType } from '@/api/types';
import {
  createArtistAppointment,
  fetchArtistAppointmentConfig,
} from '@/artist-dashboard/artist-dashboard-api';
import { useAuth } from '@/auth/auth-context';
import {
  availableBookingTimes,
  BookingCalendar,
} from '@/booking/booking-calendar';
import { BrandHeader } from '@/components/brand-header';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { userFacingError } from '@/errors';
import { t } from '@/i18n';
import { colors, radius, spacing } from '@/theme';


function Choice({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
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
        {label}
      </Text>
    </Pressable>
  );
}

export default function CreateArtistAppointmentScreen() {
  const { request, status, user } = useAuth();
  const [config, setConfig] = useState<ArtistAppointmentConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [clientUsername, setClientUsername] = useState('');
  const [bookingType, setBookingType] = useState<BookingType>('tattoo_session');
  const [durationText, setDurationText] = useState('60');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (status !== 'authenticated' || !user?.is_verified_artist) return;
    setLoading(true);
    setLoadError(false);
    try {
      const next = await fetchArtistAppointmentConfig(request);
      setConfig(next);
      setBookingType(next.booking_types[0] ?? 'tattoo_session');
      setDurationText(String(next.settings.default_session_minutes));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [request, status, user?.is_verified_artist]);

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
    if (!config || submitting) return;
    if (!clientUsername.trim()) {
      setError(t('artistManualClientRequired'));
      return;
    }
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
      const appointment = await createArtistAppointment(request, {
        clientUsername: clientUsername.trim(),
        bookingType,
        date,
        startTime,
        duration,
        description: description.trim(),
      });
      router.replace({
        pathname: '/appointment/[appointmentId]',
        params: {
          appointmentId: String(appointment.id),
          created: 'manual',
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
          <Text style={styles.muted}>{t('artistManualLoading')}</Text>
        </View>
      ) : loadError || !config ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>{t('artistManualUnavailable')}</Text>
          <Text style={styles.muted}>{t('artistManualLoadError')}</Text>
          <Button label={t('retry')} onPress={() => void load()} />
        </View>
      ) : (
        <>
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>{t('artistManualEyebrow')}</Text>
            <Text style={styles.title}>{t('artistManualTitle')}</Text>
            <Text style={styles.subtitle}>{t('artistManualSubtitle')}</Text>
          </View>

          <View style={styles.card}>
            <Field
              autoCapitalize="none"
              autoCorrect={false}
              label={t('artistManualClient')}
              maxLength={150}
              onChangeText={setClientUsername}
              placeholder={t('artistManualClientPlaceholder')}
              value={clientUsername}
            />
            <Text style={styles.hint}>{t('artistManualClientHint')}</Text>

            <Text style={styles.fieldLabel}>{t('bookingType')}</Text>
            <View style={styles.choices}>
              {config.booking_types.map((value) => (
                <Choice
                  active={bookingType === value}
                  key={value}
                  label={config.option_labels.booking_types[value] ?? value}
                  onPress={() => setBookingType(value)}
                />
              ))}
            </View>

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

            {date ? (
              <>
                <Text style={styles.fieldLabel}>{t('chooseTime')}</Text>
                {!durationIsValid ? (
                  <Text style={styles.hint}>{t('artistManualDurationError')}</Text>
                ) : times.length ? (
                  <View style={styles.choices}>
                    {times.map((value) => (
                      <Choice
                        active={startTime === value}
                        key={value}
                        label={value}
                        onPress={() => {
                          setStartTime(value);
                          setError('');
                        }}
                      />
                    ))}
                  </View>
                ) : (
                  <Text style={styles.hint}>{t('noAvailableTimes')}</Text>
                )}
              </>
            ) : null}

            <Field
              label={t('artistManualNote')}
              maxLength={3000}
              multiline
              onChangeText={setDescription}
              placeholder={t('artistManualNotePlaceholder')}
              value={description}
            />
            <Text style={styles.timezone}>
              {t('artistManualTimezone')} · {config.artist_timezone}
            </Text>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button
            label={t('artistManualCreate')}
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
    minHeight: 42,
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
  error: { color: colors.danger, lineHeight: 20 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.985 }] },
});

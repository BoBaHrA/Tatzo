import { useCallback, useState } from 'react';
import { Redirect, router, useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import type { ArtistScheduleDay } from '@/api/types';
import {
  fetchArtistDashboard,
  saveArtistSchedule,
} from '@/artist-dashboard/artist-dashboard-api';
import { useAuth } from '@/auth/auth-context';
import { BrandHeader } from '@/components/brand-header';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { userFacingError } from '@/errors';
import { appLanguage, t } from '@/i18n';
import { colors, radius, spacing } from '@/theme';


function weekdayLabel(weekday: number) {
  const sunday = new Date('2024-01-07T12:00:00Z');
  sunday.setUTCDate(sunday.getUTCDate() + weekday);
  return new Intl.DateTimeFormat(appLanguage, {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(sunday);
}

export default function ArtistScheduleScreen() {
  const { request, status, user } = useAuth();
  const [days, setDays] = useState<ArtistScheduleDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (status !== 'authenticated' || !user?.is_verified_artist) return;
    setLoading(true);
    setError('');
    try {
      const dashboard = await fetchArtistDashboard(request);
      setDays(dashboard.schedule.map((day) => ({ ...day })));
    } catch (caught) {
      setError(userFacingError(caught));
    } finally {
      setLoading(false);
    }
  }, [request, status, user?.is_verified_artist]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  if (status === 'anonymous') return <Redirect href="/(auth)/login" />;
  if (status === 'authenticated' && !user?.is_verified_artist) {
    return <Redirect href="/(tabs)/profile" />;
  }

  const updateDay = (weekday: number, changes: Partial<ArtistScheduleDay>) => {
    setSaved(false);
    setDays((current) => current.map((day) => (
      day.weekday === weekday ? { ...day, ...changes } : day
    )));
  };

  const toggleDay = (day: ArtistScheduleDay, isOpen: boolean) => {
    updateDay(day.weekday, isOpen ? {
      is_closed: false,
      open_time: day.open_time ?? '10:00',
      close_time: day.close_time ?? '18:00',
      break_start: day.break_start ?? '13:00',
      break_end: day.break_end ?? '14:00',
    } : {
      is_closed: true,
      open_time: null,
      close_time: null,
      break_start: null,
      break_end: null,
    });
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const response = await saveArtistSchedule(request, days);
      setDays(response.schedule);
      setSaved(true);
    } catch (caught) {
      setError(userFacingError(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen contentStyle={styles.screen}>
      <BrandHeader />
      <View style={styles.header}>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>{t('artistDashboardEyebrow')}</Text>
          <Text style={styles.title}>{t('artistScheduleTitle')}</Text>
          <Text style={styles.subtitle}>{t('artistScheduleSubtitle')}</Text>
        </View>
        <Pressable accessibilityLabel={t('close')} onPress={() => router.back()} style={styles.close}>
          <Text style={styles.closeText}>×</Text>
        </Pressable>
      </View>

      <View style={styles.hintCard}>
        <Text style={styles.hint}>{t('artistTimeFormatHint')}</Text>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.hint}>{t('artistDashboardLoading')}</Text>
        </View>
      ) : (
        days.map((day) => (
          <View key={day.weekday} style={styles.dayCard}>
            <View style={styles.dayTop}>
              <View style={styles.dayCopy}>
                <Text style={styles.dayName}>{weekdayLabel(day.weekday)}</Text>
                <Text style={[styles.dayState, !day.is_closed && styles.dayStateOpen]}>
                  {day.is_closed ? t('artistDayClosed') : t('artistDayOpen')}
                </Text>
              </View>
              <Switch
                accessibilityLabel={weekdayLabel(day.weekday)}
                onValueChange={(value) => toggleDay(day, value)}
                thumbColor={day.is_closed ? colors.textMuted : colors.primary}
                trackColor={{ false: colors.backgroundDeep, true: colors.primaryMuted }}
                value={!day.is_closed}
              />
            </View>
            {!day.is_closed ? (
              <>
                <View style={styles.fieldRow}>
                  <View style={styles.fieldCell}>
                    <Field
                      autoCapitalize="none"
                      keyboardType="numbers-and-punctuation"
                      label={t('artistOpenTime')}
                      maxLength={5}
                      onChangeText={(value) => updateDay(day.weekday, { open_time: value })}
                      value={day.open_time ?? ''}
                    />
                  </View>
                  <View style={styles.fieldCell}>
                    <Field
                      autoCapitalize="none"
                      keyboardType="numbers-and-punctuation"
                      label={t('artistCloseTime')}
                      maxLength={5}
                      onChangeText={(value) => updateDay(day.weekday, { close_time: value })}
                      value={day.close_time ?? ''}
                    />
                  </View>
                </View>
                <View style={styles.fieldRow}>
                  <View style={styles.fieldCell}>
                    <Field
                      autoCapitalize="none"
                      keyboardType="numbers-and-punctuation"
                      label={t('artistBreakStart')}
                      maxLength={5}
                      onChangeText={(value) => updateDay(day.weekday, { break_start: value || null })}
                      value={day.break_start ?? ''}
                    />
                  </View>
                  <View style={styles.fieldCell}>
                    <Field
                      autoCapitalize="none"
                      keyboardType="numbers-and-punctuation"
                      label={t('artistBreakEnd')}
                      maxLength={5}
                      onChangeText={(value) => updateDay(day.weekday, { break_end: value || null })}
                      value={day.break_end ?? ''}
                    />
                  </View>
                </View>
              </>
            ) : null}
          </View>
        ))
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {saved ? <Text style={styles.success}>{t('artistScheduleSaved')}</Text> : null}
      {!loading ? (
        <Button
          disabled={days.length !== 7}
          label={t('artistScheduleSave')}
          loading={saving}
          onPress={() => void save()}
        />
      ) : null}
      <Button label={t('cancel')} onPress={() => router.back()} variant="secondary" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  headingCopy: { flex: 1, gap: spacing.xs },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 29, fontWeight: '900', textTransform: 'capitalize' },
  subtitle: { color: colors.textMuted, lineHeight: 21 },
  close: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.textMuted, fontSize: 32 },
  hintCard: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.medium, padding: spacing.md,
  },
  hint: { color: colors.textMuted, lineHeight: 20 },
  centerState: { minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  dayCard: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.large, padding: spacing.md, gap: spacing.md,
  },
  dayTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dayCopy: { flex: 1, gap: 3 },
  dayName: { color: colors.text, fontSize: 18, fontWeight: '900', textTransform: 'capitalize' },
  dayState: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
  dayStateOpen: { color: colors.primary },
  fieldRow: { flexDirection: 'row', gap: spacing.sm },
  fieldCell: { flex: 1 },
  error: { color: colors.danger, lineHeight: 20 },
  success: { color: colors.success, fontWeight: '800' },
});

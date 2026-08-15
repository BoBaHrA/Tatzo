import { useCallback, useState } from 'react';
import { Redirect, router, useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { ArtistDashboard } from '@/api/types';
import {
  createArtistBlock,
  createArtistTimeOff,
  deleteArtistBlock,
  deleteArtistTimeOff,
  fetchArtistDashboard,
} from '@/artist-dashboard/artist-dashboard-api';
import { useAuth } from '@/auth/auth-context';
import { BrandHeader } from '@/components/brand-header';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { userFacingError } from '@/errors';
import { appLanguage, t } from '@/i18n';
import { colors, radius, spacing } from '@/theme';


function tomorrowValue() {
  const value = new Date();
  value.setDate(value.getDate() + 1);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(appLanguage, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`));
}

export default function ArtistCalendarControlsScreen() {
  const { request, status, user } = useAuth();
  const [dashboard, setDashboard] = useState<ArtistDashboard | null>(null);
  const [timeOffDate, setTimeOffDate] = useState(tomorrowValue);
  const [timeOffReason, setTimeOffReason] = useState('');
  const [blockDate, setBlockDate] = useState(tomorrowValue);
  const [blockStart, setBlockStart] = useState('12:00');
  const [blockEnd, setBlockEnd] = useState('14:00');
  const [blockReason, setBlockReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (status !== 'authenticated' || !user?.is_verified_artist) return;
    if (!quiet) setLoading(true);
    try {
      setDashboard(await fetchArtistDashboard(request));
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

  const addTimeOff = async () => {
    setPendingAction('time-off');
    setError('');
    setSuccess(false);
    try {
      await createArtistTimeOff(request, timeOffDate.trim(), timeOffReason.trim());
      setTimeOffReason('');
      setSuccess(true);
      await load(true);
    } catch (caught) {
      setError(userFacingError(caught));
    } finally {
      setPendingAction('');
    }
  };

  const addBlock = async () => {
    setPendingAction('block');
    setError('');
    setSuccess(false);
    try {
      await createArtistBlock(request, {
        date: blockDate.trim(),
        startTime: blockStart.trim(),
        endTime: blockEnd.trim(),
        reason: blockReason.trim(),
      });
      setBlockReason('');
      setSuccess(true);
      await load(true);
    } catch (caught) {
      setError(userFacingError(caught));
    } finally {
      setPendingAction('');
    }
  };

  const removeTimeOff = async (id: number) => {
    setPendingAction(`time-off-${id}`);
    setError('');
    try {
      await deleteArtistTimeOff(request, id);
      setSuccess(true);
      await load(true);
    } catch (caught) {
      setError(userFacingError(caught));
    } finally {
      setPendingAction('');
    }
  };

  const removeBlock = async (id: number) => {
    setPendingAction(`block-${id}`);
    setError('');
    try {
      await deleteArtistBlock(request, id);
      setSuccess(true);
      await load(true);
    } catch (caught) {
      setError(userFacingError(caught));
    } finally {
      setPendingAction('');
    }
  };

  const confirmTimeOffRemoval = (id: number) => Alert.alert(
    t('artistRemoveTimeOffTitle'),
    t('artistRemoveTimeOffBody'),
    [
      { text: t('cancel'), style: 'cancel' },
      { text: t('artistRemove'), style: 'destructive', onPress: () => void removeTimeOff(id) },
    ],
  );

  const confirmBlockRemoval = (id: number) => Alert.alert(
    t('artistRemoveBlockTitle'),
    t('artistRemoveBlockBody'),
    [
      { text: t('cancel'), style: 'cancel' },
      { text: t('artistRemove'), style: 'destructive', onPress: () => void removeBlock(id) },
    ],
  );

  return (
    <Screen contentStyle={styles.screen}>
      <BrandHeader />
      <View style={styles.header}>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>{t('artistDashboardEyebrow')}</Text>
          <Text style={styles.title}>{t('artistCalendarTitle')}</Text>
          <Text style={styles.subtitle}>{t('artistCalendarSubtitle')}</Text>
        </View>
        <Pressable accessibilityLabel={t('close')} onPress={() => router.back()} style={styles.close}>
          <Text style={styles.closeText}>×</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.muted}>{t('artistDashboardLoading')}</Text>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t('artistTimeOffTitle')}</Text>
            <Text style={styles.sectionHint}>{t('artistTimeOffHint')}</Text>
            <Field
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
              label={t('artistDate')}
              maxLength={10}
              onChangeText={setTimeOffDate}
              placeholder={t('artistDateFormatHint')}
              value={timeOffDate}
            />
            <Field
              label={t('artistReasonOptional')}
              maxLength={160}
              onChangeText={setTimeOffReason}
              placeholder={t('artistTimeOffReasonPlaceholder')}
              value={timeOffReason}
            />
            <Button
              label={t('artistAddTimeOff')}
              loading={pendingAction === 'time-off'}
              onPress={() => void addTimeOff()}
            />
            <View style={styles.list}>
              {dashboard?.time_off.length ? dashboard.time_off.map((item) => (
                <View key={item.id} style={styles.listRow}>
                  <View style={styles.listCopy}>
                    <Text style={styles.listTitle}>{formatDate(item.date)}</Text>
                    {item.reason ? <Text style={styles.listHint}>{item.reason}</Text> : null}
                  </View>
                  <Pressable
                    disabled={Boolean(pendingAction)}
                    onPress={() => confirmTimeOffRemoval(item.id)}
                    style={styles.removeButton}
                  >
                    {pendingAction === `time-off-${item.id}` ? (
                      <ActivityIndicator color={colors.danger} size="small" />
                    ) : <Text style={styles.removeText}>{t('artistRemove')}</Text>}
                  </Pressable>
                </View>
              )) : <Text style={styles.empty}>{t('artistNoTimeOff')}</Text>}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t('artistBlockedTimeTitle')}</Text>
            <Text style={styles.sectionHint}>{t('artistBlockedTimeHint')}</Text>
            <Field
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
              label={t('artistDate')}
              maxLength={10}
              onChangeText={setBlockDate}
              placeholder={t('artistDateFormatHint')}
              value={blockDate}
            />
            <View style={styles.fieldRow}>
              <View style={styles.fieldCell}>
                <Field
                  keyboardType="numbers-and-punctuation"
                  label={t('artistStartTime')}
                  maxLength={5}
                  onChangeText={setBlockStart}
                  value={blockStart}
                />
              </View>
              <View style={styles.fieldCell}>
                <Field
                  keyboardType="numbers-and-punctuation"
                  label={t('artistEndTime')}
                  maxLength={5}
                  onChangeText={setBlockEnd}
                  value={blockEnd}
                />
              </View>
            </View>
            <Field
              label={t('artistReasonOptional')}
              maxLength={160}
              onChangeText={setBlockReason}
              placeholder={t('artistBlockReasonPlaceholder')}
              value={blockReason}
            />
            <Button
              label={t('artistAddBlock')}
              loading={pendingAction === 'block'}
              onPress={() => void addBlock()}
            />
            <View style={styles.list}>
              {dashboard?.blocked_periods.length ? dashboard.blocked_periods.map((item) => (
                <View key={item.id} style={styles.listRow}>
                  <View style={styles.listCopy}>
                    <Text style={styles.listTitle}>{formatDate(item.date)} · {item.start_time}–{item.end_time}</Text>
                    <Text style={styles.listHint}>{item.title}</Text>
                  </View>
                  <Pressable
                    disabled={Boolean(pendingAction)}
                    onPress={() => confirmBlockRemoval(item.id)}
                    style={styles.removeButton}
                  >
                    {pendingAction === `block-${item.id}` ? (
                      <ActivityIndicator color={colors.danger} size="small" />
                    ) : <Text style={styles.removeText}>{t('artistRemove')}</Text>}
                  </Pressable>
                </View>
              )) : <Text style={styles.empty}>{t('artistNoBlocks')}</Text>}
            </View>
          </View>
        </>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {success ? <Text style={styles.success}>{t('artistCalendarSaved')}</Text> : null}
      <Button label={t('close')} onPress={() => router.back()} variant="secondary" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  headingCopy: { flex: 1, gap: spacing.xs },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 29, fontWeight: '900' },
  subtitle: { color: colors.textMuted, lineHeight: 21 },
  close: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.textMuted, fontSize: 32 },
  centerState: { minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  muted: { color: colors.textMuted },
  card: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.large, padding: spacing.md, gap: spacing.md,
  },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: '900' },
  sectionHint: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  fieldRow: { flexDirection: 'row', gap: spacing.sm },
  fieldCell: { flex: 1 },
  list: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  listRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  listCopy: { flex: 1, minWidth: 0, gap: 3 },
  listTitle: { color: colors.text, fontSize: 13, fontWeight: '900' },
  listHint: { color: colors.textMuted, fontSize: 11 },
  removeButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.xs },
  removeText: { color: colors.danger, fontSize: 12, fontWeight: '900' },
  empty: { color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.md },
  error: { color: colors.danger, lineHeight: 20 },
  success: { color: colors.success, fontWeight: '800' },
});

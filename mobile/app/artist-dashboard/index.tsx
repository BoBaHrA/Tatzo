import { useCallback, useState } from 'react';
import { Redirect, router, useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { ArtistBookingStatus, ArtistDashboard } from '@/api/types';
import {
  fetchArtistDashboard,
  updateArtistBookingStatus,
} from '@/artist-dashboard/artist-dashboard-api';
import {
  ArtistStats,
  ArtistTimeline,
  WorkloadStrip,
} from '@/artist-dashboard/dashboard-components';
import { useAuth } from '@/auth/auth-context';
import { BrandHeader } from '@/components/brand-header';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { userFacingError } from '@/errors';
import { t } from '@/i18n';
import { colors, radius, spacing } from '@/theme';


function SectionHeading({ title, hint }: { title: string; hint: string }) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionHint}>{hint}</Text>
    </View>
  );
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

  if (status === 'anonymous') {
    return <Redirect href="/(auth)/login" />;
  }
  if (status === 'authenticated' && !user?.is_verified_artist) {
    return <Redirect href="/(tabs)/profile" />;
  }

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
    return (
      <Screen contentStyle={styles.centerState}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.muted}>{t('artistDashboardLoading')}</Text>
      </Screen>
    );
  }
  if (loadError || !dashboard) {
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
      <BrandHeader />
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.headingCopy}>
            <Text style={styles.eyebrow}>{t('artistDashboardEyebrow')}</Text>
            <Text style={styles.title}>{t('artistDashboard')}</Text>
          </View>
          <Pressable accessibilityLabel={t('close')} onPress={() => router.back()} style={styles.close}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>
        <Text style={styles.subtitle}>{t('artistDashboardSubtitle')}</Text>
        <View style={styles.liveStatus}>
          <View style={[styles.liveDot, !dashboard.settings.bookings_enabled && styles.liveDotPaused]} />
          <Text style={styles.liveStatusText}>{dashboard.settings.booking_status_label}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <SectionHeading title={t('artistBookingStatus')} hint={t('artistBookingStatusHint')} />
        <View style={styles.statusOptions}>
          {dashboard.settings.booking_status_options.map((option) => {
            const selected = option.value === dashboard.settings.booking_status;
            const updating = updatingStatus === option.value;
            return (
              <Pressable
                accessibilityRole="button"
                disabled={Boolean(updatingStatus)}
                key={option.value}
                onPress={() => void changeStatus(option.value)}
                style={({ pressed }) => [
                  styles.statusChip,
                  selected && styles.statusChipSelected,
                  pressed && styles.pressed,
                ]}
              >
                {updating ? <ActivityIndicator color={colors.backgroundDeep} size="small" /> : (
                  <Text style={[styles.statusChipText, selected && styles.statusChipTextSelected]}>
                    {option.label}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
        {actionError ? <Text style={styles.error}>{actionError}</Text> : null}
      </View>

      <ArtistStats stats={dashboard.stats} />

      <View style={styles.section}>
        <SectionHeading title={t('artistWorkload')} hint={t('artistWorkloadHint')} />
        <WorkloadStrip days={dashboard.workload} />
      </View>

      <View style={styles.card}>
        <SectionHeading title={t('artistQuickActions')} hint={dashboard.artist_timezone} />
        <Button
          label={t('artistViewRequests')}
          onPress={() => router.push('/(tabs)/bookings')}
        />
        <Button
          label={t('artistManageSchedule')}
          onPress={() => router.push('/artist-dashboard/schedule')}
          variant="secondary"
        />
        <Button
          label={t('artistManageTimeOff')}
          onPress={() => router.push('/artist-dashboard/calendar')}
          variant="secondary"
        />
        <Button
          label={t('artistPayments')}
          onPress={() => router.push('/artist-dashboard/payments')}
          variant="secondary"
        />
        <Button
          label={t('healingClients')}
          onPress={() => router.push('/healing')}
          variant="secondary"
        />
        <Button
          label={t('managePortfolio')}
          onPress={() => router.push('/manage-portfolio')}
          variant="secondary"
        />
      </View>

      <View style={styles.section}>
        <SectionHeading title={t('artistUpcoming')} hint={t('artistUpcomingHint')} />
        <ArtistTimeline items={dashboard.timeline} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  centerState: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  stateTitle: { color: colors.text, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  muted: { color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
  hero: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.large, padding: spacing.lg, gap: spacing.sm,
  },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  headingCopy: { flex: 1, gap: spacing.xs },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 31, fontWeight: '900' },
  close: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.textMuted, fontSize: 32 },
  subtitle: { color: colors.textMuted, lineHeight: 21 },
  liveStatus: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.success },
  liveDotPaused: { backgroundColor: colors.accent },
  liveStatusText: { color: colors.text, fontSize: 13, fontWeight: '900' },
  card: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.large, padding: spacing.md, gap: spacing.md,
  },
  section: { gap: spacing.sm },
  sectionHeading: { gap: 3 },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: '900' },
  sectionHint: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  statusOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  statusChip: {
    minHeight: 42, justifyContent: 'center', borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundDeep,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  statusChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  statusChipText: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
  statusChipTextSelected: { color: colors.backgroundDeep },
  error: { color: colors.danger, lineHeight: 20 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});

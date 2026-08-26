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
import { colors, radius, shadow, spacing, typography } from '@/theme';


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
      <BrandHeader title={t('artistDashboard')} />

      <View style={styles.hero}>
        <View style={styles.heroGlow} />
        <View style={styles.heroTop}>
          <View style={styles.headingCopy}>
            <Text style={styles.eyebrow}>{t('artistDashboardEyebrow')}</Text>
            <Text style={styles.heroStatus}>{dashboard.settings.booking_status_label}</Text>
          </View>
          <Pressable
            accessibilityLabel={t('close')}
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          >
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>
        <Text style={styles.subtitle}>{t('artistDashboardSubtitle')}</Text>
        <View style={styles.liveStatus}>
          <View style={[styles.liveDot, !dashboard.settings.bookings_enabled && styles.liveDotPaused]} />
          <Text style={styles.liveStatusText}>{dashboard.settings.booking_status_label}</Text>
        </View>
      </View>

      <View style={styles.statusSurface}>
        <SectionHeading title={t('artistBookingStatus')} hint={t('artistBookingStatusHint')} />
        <View style={styles.statusOptions}>
          {dashboard.settings.booking_status_options.map((option) => {
            const selected = option.value === dashboard.settings.booking_status;
            const updating = updatingStatus === option.value;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
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

      <View style={styles.primaryActions}>
        <SectionHeading title={t('artistQuickActions')} hint={dashboard.artist_timezone} />
        <Button
          label={t('artistManualCreate')}
          onPress={() => router.push('/artist-dashboard/create-appointment')}
        />
        <QuickAction
          label={t('artistViewRequests')}
          onPress={() => router.push('/(tabs)/bookings')}
          symbol="⌁"
          emphasis
        />
      </View>

      <View style={styles.toolsSection}>
        <View style={styles.toolsGrid}>
          <QuickAction
            label={t('artistManagePreferences')}
            onPress={() => router.push('/artist-dashboard/preferences')}
            symbol="◎"
          />
          <QuickAction
            label={t('artistManageSchedule')}
            onPress={() => router.push('/artist-dashboard/schedule')}
            symbol="◷"
          />
          <QuickAction
            label={t('artistManageTimeOff')}
            onPress={() => router.push('/artist-dashboard/calendar')}
            symbol="—"
          />
          <QuickAction
            label={t('artistPayments')}
            onPress={() => router.push('/artist-dashboard/payments')}
            symbol="€"
          />
          <QuickAction
            label={t('healingClients')}
            onPress={() => router.push('/healing')}
            symbol="＋"
          />
          <QuickAction
            label={t('managePortfolio')}
            onPress={() => router.push('/manage-portfolio')}
            symbol="◇"
          />
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeading title={t('artistUpcoming')} hint={t('artistUpcomingHint')} />
        <ArtistTimeline items={dashboard.timeline} />
      </View>
    </Screen>
  );
}

function QuickAction({
  label,
  onPress,
  symbol,
  emphasis = false,
}: {
  label: string;
  onPress: () => void;
  symbol: string;
  emphasis?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickAction,
        emphasis && styles.quickActionEmphasis,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.quickIcon, emphasis && styles.quickIconEmphasis]}>
        <Text style={[styles.quickIconText, emphasis && styles.quickIconTextEmphasis]}>{symbol}</Text>
      </View>
      <Text numberOfLines={2} style={styles.quickLabel}>{label}</Text>
      <Text style={styles.quickChevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  centerState: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  stateTitle: { color: colors.text, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  muted: { color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
  hero: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#06272d',
    borderColor: 'rgba(4, 197, 191, 0.34)',
    borderWidth: 1,
    borderRadius: radius.panel,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.panel,
  },
  heroGlow: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    right: -80,
    top: -90,
    backgroundColor: 'rgba(4, 197, 191, 0.11)',
  },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  headingCopy: { flex: 1, gap: spacing.xs },
  eyebrow: { color: colors.primary, ...typography.eyebrow },
  heroStatus: { color: colors.text, fontSize: 25, lineHeight: 30, fontWeight: '900' },
  close: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(0, 9, 17, 0.38)',
  },
  closeText: { color: colors.textMuted, fontSize: 28, lineHeight: 30 },
  subtitle: { color: colors.textMuted, lineHeight: 20, maxWidth: 560 },
  liveStatus: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0, 9, 17, 0.42)',
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  liveDotPaused: { backgroundColor: colors.accent },
  liveStatusText: { color: colors.text, fontSize: 11, fontWeight: '900' },
  statusSurface: {
    backgroundColor: 'rgba(0, 18, 28, 0.72)',
    borderColor: 'rgba(4, 197, 191, 0.14)',
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.md,
    gap: spacing.md,
  },
  section: { gap: spacing.sm },
  sectionHeading: { gap: 3 },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: '900' },
  sectionHint: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  statusOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  statusChip: {
    minHeight: 38,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.14)',
    backgroundColor: colors.backgroundDeep,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  statusChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  statusChipText: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
  statusChipTextSelected: { color: colors.backgroundDeep },
  primaryActions: {
    backgroundColor: 'rgba(0, 18, 28, 0.72)',
    borderColor: 'rgba(4, 197, 191, 0.14)',
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.md,
    gap: spacing.sm,
  },
  toolsSection: { gap: spacing.sm },
  toolsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  quickAction: {
    width: '48%',
    flexGrow: 1,
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(0, 18, 28, 0.72)',
    borderColor: 'rgba(4, 197, 191, 0.14)',
    borderWidth: 1,
    borderRadius: radius.medium,
    padding: spacing.sm,
  },
  quickActionEmphasis: {
    width: '100%',
    minHeight: 54,
    borderColor: 'rgba(238, 12, 111, 0.26)',
    backgroundColor: 'rgba(238, 12, 111, 0.055)',
  },
  quickIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: colors.primarySoft,
  },
  quickIconEmphasis: { backgroundColor: colors.accentSoft },
  quickIconText: { color: colors.primary, fontSize: 16, fontWeight: '900' },
  quickIconTextEmphasis: { color: colors.accent },
  quickLabel: { flex: 1, color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: '800' },
  quickChevron: { color: colors.textSubtle, fontSize: 22 },
  error: { color: colors.danger, lineHeight: 20 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
});
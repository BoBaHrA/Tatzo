import { useCallback, useState } from 'react';
import { Redirect, router, useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type {
  HealingEligibleAppointment,
  HealingJourneySummary,
  HealingListResponse,
} from '@/api/types';
import { useAuth } from '@/auth/auth-context';
import { BrandHeader } from '@/components/brand-header';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { userFacingError } from '@/errors';
import {
  fetchHealingJourneys,
  startHealingJourney,
} from '@/healing/healing-api';
import { appLanguage, t } from '@/i18n';
import { colors, radius, spacing } from '@/theme';


const HEALING_ICON = require('../../assets/web-icons/healing.png');

function formatDate(value: string) {
  return new Intl.DateTimeFormat(appLanguage, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T12:00:00`));
}

function HealingMark({ size = 48 }: { size?: number }) {
  return (
    <Image
      accessibilityIgnoresInvertColors
      resizeMode="contain"
      source={HEALING_ICON}
      style={{ width: size, height: size }}
    />
  );
}

function JourneyCard({
  copy,
  journey,
}: {
  copy: Record<string, string>;
  journey: HealingJourneySummary;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({
        pathname: '/healing/[journeyId]',
        params: { journeyId: journey.id },
      })}
      style={({ pressed }) => [styles.journeyCard, pressed && styles.pressed]}
    >
      {journey.latest_photo_url ? (
        <Image source={{ uri: journey.latest_photo_url }} style={styles.journeyImage} />
      ) : (
        <View style={styles.journeyImageFallback}>
          <HealingMark size={54} />
        </View>
      )}
      <View style={styles.journeyBody}>
        <View style={styles.titleRow}>
          <Text numberOfLines={2} style={styles.journeyTitle}>{journey.title}</Text>
          <View style={[
            styles.statusPill,
            journey.status === 'healed' && styles.statusPillHealed,
          ]}>
            <Text style={styles.statusText}>
              {journey.status === 'healed' ? copy.healed : copy.active}
            </Text>
          </View>
        </View>
        <Text style={styles.journeyMeta}>
          {copy.day} {journey.current_day} · @{journey.other_user.username}
        </Text>
        <View style={styles.progressTrack}>
          <View
            style={[styles.progressValue, { width: `${journey.tracking_percent}%` }]}
          />
        </View>
        <View style={styles.statsRow}>
          <Text style={styles.statText}>{journey.checkin_count} {copy.checkins}</Text>
          <Text style={styles.openText}>›</Text>
        </View>
      </View>
    </Pressable>
  );
}

function EligibleCard({
  appointment,
  copy,
  loading,
  onStart,
}: {
  appointment: HealingEligibleAppointment;
  copy: Record<string, string>;
  loading: boolean;
  onStart: () => void;
}) {
  return (
    <View style={styles.eligibleCard}>
      <View style={styles.eligibleIdentity}>
        {appointment.artist.profile_image_url ? (
          <Image source={{ uri: appointment.artist.profile_image_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarLetter}>
              {appointment.artist.username[0]?.toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.eligibleText}>
          <Text style={styles.eligibleTitle}>{appointment.title}</Text>
          <Text style={styles.journeyMeta}>
            {formatDate(appointment.date)} · @{appointment.artist.username}
          </Text>
        </View>
      </View>
      <Button label={copy.start_tracker} loading={loading} onPress={onStart} />
    </View>
  );
}

export default function HealingIndexScreen() {
  const { request, status } = useAuth();
  const [data, setData] = useState<HealingListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [startingId, setStartingId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (status !== 'authenticated') return;
    setLoading(true);
    setError('');
    try {
      setData(await fetchHealingJourneys(request));
    } catch (caught) {
      setError(userFacingError(caught));
    } finally {
      setLoading(false);
    }
  }, [request, status]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  if (status === 'anonymous') return <Redirect href="/(auth)/login" />;

  const start = async (appointmentId: number) => {
    if (startingId) return;
    setStartingId(appointmentId);
    setError('');
    try {
      const journey = await startHealingJourney(request, appointmentId);
      router.replace({
        pathname: '/healing/[journeyId]',
        params: { journeyId: journey.id },
      });
    } catch (caught) {
      setError(userFacingError(caught));
    } finally {
      setStartingId(null);
    }
  };

  const copy = data?.copy;

  return (
    <Screen contentStyle={styles.screen}>
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))}
        style={styles.backButton}
      >
        <Text style={styles.backText}>‹ {t('back')}</Text>
      </Pressable>
      <BrandHeader />
      {loading || status === 'loading' ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.muted}>{t('healingLoading')}</Text>
        </View>
      ) : !data || !copy ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>{t('healingUnavailable')}</Text>
          <Text style={styles.muted}>{error}</Text>
          <Button label={t('retry')} onPress={() => void load()} />
        </View>
      ) : (
        <>
          <View style={styles.hero}>
            <View style={styles.heroMark}>
              <HealingMark size={30} />
            </View>
            <Text style={styles.eyebrow}>{copy.page_eyebrow}</Text>
            <Text style={styles.title}>{copy.page_title}</Text>
            <Text style={styles.body}>{copy.page_subtitle}</Text>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {data.journeys.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{copy.journeys_title}</Text>
              {data.journeys.map((journey) => (
                <JourneyCard copy={copy} journey={journey} key={journey.id} />
              ))}
            </View>
          ) : null}

          {data.eligible_appointments.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{copy.empty_title}</Text>
              <Text style={styles.body}>{copy.empty_copy}</Text>
              {data.eligible_appointments.map((appointment) => (
                <EligibleCard
                  appointment={appointment}
                  copy={copy}
                  key={appointment.id}
                  loading={startingId === appointment.id}
                  onStart={() => void start(appointment.id)}
                />
              ))}
            </View>
          ) : null}

          {!data.journeys.length && !data.eligible_appointments.length ? (
            <View style={styles.stateCard}>
              <View style={styles.stateMark}><HealingMark size={58} /></View>
              <Text style={styles.stateTitle}>{copy.empty_title}</Text>
              <Text style={styles.muted}>{copy.no_appointments}</Text>
            </View>
          ) : null}
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
    minHeight: 360, alignItems: 'center', justifyContent: 'center', gap: spacing.md,
  },
  muted: { color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
  hero: {
    backgroundColor: colors.surface, borderColor: colors.primaryMuted, borderWidth: 1,
    borderRadius: radius.large, padding: spacing.lg, gap: spacing.sm,
  },
  heroMark: {
    width: 46, height: 46, alignItems: 'center', justifyContent: 'center',
    borderRadius: 16, backgroundColor: 'rgba(4,197,191,.08)',
    borderWidth: 1, borderColor: 'rgba(4,197,191,.18)', marginBottom: spacing.xs,
  },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 29, lineHeight: 35, fontWeight: '900' },
  body: { color: colors.textMuted, lineHeight: 21 },
  section: { gap: spacing.md },
  sectionTitle: { color: colors.text, fontSize: 22, fontWeight: '900' },
  journeyCard: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.large, overflow: 'hidden',
  },
  journeyImage: { width: '100%', height: 180, backgroundColor: colors.backgroundDeep },
  journeyImageFallback: {
    height: 116, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.backgroundDeep,
  },
  journeyBody: { padding: spacing.md, gap: spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  journeyTitle: { flex: 1, color: colors.text, fontSize: 18, fontWeight: '900' },
  statusPill: {
    backgroundColor: colors.primaryMuted, borderRadius: radius.pill,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  statusPillHealed: { backgroundColor: '#245241' },
  statusText: { color: colors.text, fontSize: 10, fontWeight: '900' },
  journeyMeta: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  progressTrack: {
    height: 7, borderRadius: radius.pill, overflow: 'hidden',
    backgroundColor: colors.backgroundDeep,
  },
  progressValue: { height: '100%', backgroundColor: colors.primary },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statText: { color: colors.textMuted, fontSize: 12 },
  openText: { color: colors.primary, fontSize: 28, lineHeight: 28 },
  eligibleCard: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.large, padding: spacing.md, gap: spacing.md,
  },
  eligibleIdentity: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  eligibleText: { flex: 1, gap: 3 },
  eligibleTitle: { color: colors.text, fontWeight: '900', lineHeight: 20 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: {
    width: 48, height: 48, borderRadius: 24, alignItems: 'center',
    justifyContent: 'center', backgroundColor: colors.primary,
  },
  avatarLetter: { color: colors.backgroundDeep, fontSize: 19, fontWeight: '900' },
  stateCard: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.large, padding: spacing.xl, gap: spacing.md,
  },
  stateMark: { alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  stateTitle: { color: colors.text, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  error: {
    color: colors.danger, borderColor: colors.danger, borderWidth: 1,
    borderRadius: radius.medium, padding: spacing.sm, textAlign: 'center',
  },
  pressed: { opacity: 0.7 },
});

import { useCallback, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type {
  Appointment,
  AppointmentAction,
  AppointmentDeposit,
  AppointmentHealthSafety,
} from '@/api/types';
import { useAuth } from '@/auth/auth-context';
import {
  addAppointmentReferences,
  applyAppointmentAction,
  fetchAppointment,
  saveAppointmentArtistNote,
} from '@/booking/booking-api';
import { startChat } from '@/chat/chat-api';
import { useChat } from '@/chat/chat-context';
import { BrandHeader } from '@/components/brand-header';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { userFacingError } from '@/errors';
import {
  fetchAppointmentHealthSafety,
  revokeAppointmentHealthSafety,
  shareAppointmentHealthSafety,
} from '@/health-safety/health-safety-api';
import { appLanguage, t, type TranslationKey } from '@/i18n';
import {
  fetchAppointmentDeposit,
  startAppointmentDepositCheckout,
} from '@/payments/payment-api';
import { colors, radius, spacing } from '@/theme';


const ACTION_LABELS: Record<AppointmentAction, TranslationKey> = {
  accept: 'acceptBooking',
  decline: 'declineBooking',
  need_references: 'needReferences',
  consultation_required: 'requireConsultation',
  complete: 'completeAppointment',
  cancel: 'cancelAppointment',
};

function formatDate(appointment: Appointment) {
  return `${new Intl.DateTimeFormat(appLanguage, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${appointment.date}T12:00:00Z`))} · ${appointment.start_time}${
    appointment.end_time ? `–${appointment.end_time}` : ''
  }`;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export default function AppointmentDetailScreen() {
  const params = useLocalSearchParams<{
    appointmentId?: string | string[];
    created?: string | string[];
    rescheduled?: string | string[];
  }>();
  const rawId = Array.isArray(params.appointmentId) ? params.appointmentId[0] : params.appointmentId;
  const appointmentId = Number(rawId);
  const createdValue = Array.isArray(params.created) ? params.created[0] : params.created;
  const created = createdValue === 'true';
  const manuallyCreated = createdValue === 'manual';
  const rescheduled = (
    Array.isArray(params.rescheduled) ? params.rescheduled[0] : params.rescheduled
  ) === 'true';
  const { request, status } = useAuth();
  const { refresh: refreshChats } = useChat();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [health, setHealth] = useState<AppointmentHealthSafety | null>(null);
  const [deposit, setDeposit] = useState<AppointmentDeposit | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [action, setAction] = useState<
    AppointmentAction | 'chat' | 'references' | null
  >(null);
  const [actionError, setActionError] = useState('');
  const [healthAction, setHealthAction] = useState<'share' | 'revoke' | null>(null);
  const [healthError, setHealthError] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const [artistNote, setArtistNote] = useState('');
  const [artistNoteSaving, setArtistNoteSaving] = useState(false);
  const [artistNoteError, setArtistNoteError] = useState('');

  const load = useCallback(async () => {
    if (status !== 'authenticated') return;
    if (!Number.isInteger(appointmentId) || appointmentId <= 0) {
      setLoadError(t('appointmentUnavailable'));
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const nextAppointment = await fetchAppointment(request, appointmentId);
      setAppointment(nextAppointment);
      setArtistNote(nextAppointment.artist_note);
      if (nextAppointment.booking_type === 'tattoo_session') {
        try {
          setHealth(await fetchAppointmentHealthSafety(request, appointmentId));
        } catch {
          setHealth(null);
        }
      } else {
        setHealth(null);
      }
      try {
        setDeposit(await fetchAppointmentDeposit(request, appointmentId));
      } catch {
        setDeposit(null);
      }
    } catch {
      setAppointment(null);
      setLoadError(t('appointmentError'));
    } finally {
      setLoading(false);
    }
  }, [appointmentId, request, status]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  if (status === 'anonymous') return <Redirect href="/(auth)/login" />;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/bookings');
  };

  const runAction = async (nextAction: AppointmentAction) => {
    if (!appointment || action) return;
    setAction(nextAction);
    setActionError('');
    try {
      setAppointment(await applyAppointmentAction(request, appointment.id, nextAction));
    } catch {
      setActionError(t('appointmentActionError'));
    } finally {
      setAction(null);
    }
  };

  const saveArtistNote = async () => {
    if (!appointment || !appointment.can_edit_artist_note || artistNoteSaving) return;
    try {
      setArtistNoteSaving(true);
      setArtistNoteError('');
      const next = await saveAppointmentArtistNote(
        request,
        appointment.id,
        artistNote,
      );
      setAppointment(next);
      setArtistNote(next.artist_note);
    } catch (caught) {
      setArtistNoteError(userFacingError(caught));
    } finally {
      setArtistNoteSaving(false);
    }
  };

  const selectAction = (nextAction: AppointmentAction) => {
    if (nextAction === 'decline' || nextAction === 'cancel' || nextAction === 'complete') {
      Alert.alert(
        t(ACTION_LABELS[nextAction]),
        t('appointmentActionConfirm'),
        [
          { text: t('cancel'), style: 'cancel' },
          {
            text: t(ACTION_LABELS[nextAction]),
            style: nextAction === 'complete' ? 'default' : 'destructive',
            onPress: () => void runAction(nextAction),
          },
        ],
      );
      return;
    }
    void runAction(nextAction);
  };

  const openChat = async () => {
    if (!appointment || action) return;
    setAction('chat');
    setActionError('');
    try {
      const thread = await startChat(request, appointment.other_user.username);
      void refreshChats();
      router.push({
        pathname: '/chat/[threadId]',
        params: { threadId: String(thread.id) },
      });
    } catch {
      setActionError(t('chatStartError'));
    } finally {
      setAction(null);
    }
  };

  const addReferences = async () => {
    if (!appointment || action) return;
    setActionError('');
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setActionError(t('referencePickerError'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes: ['images'],
        quality: 0.9,
        selectionLimit: Math.max(
          1,
          appointment.reference_limit - appointment.reference_images.length,
        ),
      });
      if (result.canceled) return;
      setAction('references');
      const references = result.assets.map((asset, index) => ({
        key: `${Date.now()}-${index}-${asset.uri}`,
        uri: asset.uri,
        name: asset.fileName ?? `tatzo-reference-${Date.now()}-${index}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
      }));
      setAppointment(await addAppointmentReferences(
        request,
        appointment.id,
        references,
      ));
    } catch {
      setActionError(t('referencePickerError'));
    } finally {
      setAction(null);
    }
  };

  const shareHealthCard = async () => {
    if (!appointment || healthAction) return;
    setHealthAction('share');
    setHealthError('');
    try {
      setHealth(await shareAppointmentHealthSafety(
        request,
        appointment.id,
        { mode: 'card' },
      ));
    } catch {
      setHealthError(health?.copy.booking_error ?? t('healthSafetyUnavailable'));
    } finally {
      setHealthAction(null);
    }
  };

  const revokeHealth = async () => {
    if (!appointment || healthAction) return;
    setHealthAction('revoke');
    setHealthError('');
    try {
      await revokeAppointmentHealthSafety(request, appointment.id);
      setHealth(await fetchAppointmentHealthSafety(request, appointment.id));
    } catch {
      setHealthError(health?.copy.booking_error ?? t('healthSafetyUnavailable'));
    } finally {
      setHealthAction(null);
    }
  };

  const payDeposit = async () => {
    if (!appointment || paymentLoading) return;
    setPaymentLoading(true);
    setPaymentError('');
    try {
      const { url } = await startAppointmentDepositCheckout(
        request,
        appointment.id,
      );
      await Linking.openURL(url);
    } catch {
      setPaymentError(
        deposit?.has_deposit
          ? deposit.copy.checkout_error
          : t('artistPaymentsUnavailable'),
      );
    } finally {
      setPaymentLoading(false);
    }
  };

  return (
    <Screen contentStyle={styles.screen}>
      <Pressable onPress={goBack} style={styles.backButton}>
        <Text style={styles.backText}>‹ {t('back')}</Text>
      </Pressable>
      <BrandHeader />
      {loading || status === 'loading' ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.muted}>{t('loadingAppointment')}</Text>
        </View>
      ) : !appointment ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>{t('appointmentUnavailable')}</Text>
          <Text style={styles.muted}>{loadError || t('appointmentError')}</Text>
          <Button label={t('retry')} onPress={() => void load()} />
        </View>
      ) : (
        <>
          {created ? (
            <View style={styles.successNotice}>
              <Text style={styles.successTitle}>✓ {t('bookingSent')}</Text>
              <Text style={styles.successText}>{t('bookingSentHint')}</Text>
            </View>
          ) : null}
          {manuallyCreated ? (
            <View style={styles.successNotice}>
              <Text style={styles.successTitle}>✓ {t('artistManualCreated')}</Text>
              <Text style={styles.successText}>{t('artistManualCreatedHint')}</Text>
            </View>
          ) : null}
          {rescheduled ? (
            <View style={styles.successNotice}>
              <Text style={styles.successTitle}>✓ {t('artistRescheduleSaved')}</Text>
              <Text style={styles.successText}>{t('artistRescheduleSavedHint')}</Text>
            </View>
          ) : null}
          <View style={styles.hero}>
            <View style={styles.identityRow}>
              {appointment.other_user.profile_image_url ? (
                <Image source={{ uri: appointment.other_user.profile_image_url }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarLetter}>
                    {appointment.other_user.username[0]?.toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.identity}>
                <Text style={styles.eyebrow}>
                  {appointment.role === 'artist' ? t('requestFromClient') : t('requestWithArtist')}
                </Text>
                <Text style={styles.username}>{appointment.other_user.username}</Text>
                <Text style={styles.date}>{formatDate(appointment)}</Text>
              </View>
            </View>
            <View style={styles.statusCard}>
              <Text style={styles.statusLabel}>{t('appointmentStatus')}</Text>
              <Text style={styles.statusValue}>{appointment.status_label}</Text>
            </View>
            <View style={styles.heroActions}>
              <Button
                label={t('openProfile')}
                onPress={() => router.push({
                  pathname: '/profile/[username]',
                  params: { username: appointment.other_user.username },
                })}
                variant="secondary"
                style={styles.flexButton}
              />
              <Button
                label={t('openChat')}
                loading={action === 'chat'}
                onPress={() => void openChat()}
                style={styles.flexButton}
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('appointmentDetails')}</Text>
            <View style={styles.detailCard}>
              <DetailRow label={t('bookingType')} value={appointment.booking_type_label} />
              <DetailRow label={t('duration')} value={appointment.session_length_minutes ? `${appointment.session_length_minutes} min` : ''} />
              <DetailRow label={t('chooseStyle')} value={appointment.styles_label} />
              <DetailRow label={t('choosePlacement')} value={appointment.placement_label} />
              <DetailRow label={t('chooseSize')} value={appointment.size_label} />
              <DetailRow label={t('chooseBudget')} value={appointment.budget_label} />
              <DetailRow label={t('comfortLimit')} value={appointment.client_comfort_limit} />
              <DetailRow label={t('projectDescription')} value={appointment.description} />
              <DetailRow label={t('consultationNote')} value={appointment.consultation_note} />
            </View>
          </View>

          {appointment.can_edit_artist_note ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('artistPrivateNote')}</Text>
              <View style={styles.noteCard}>
                <Text style={styles.noteHint}>{t('artistPrivateNoteHint')}</Text>
                <Field
                  label={t('artistPrivateNoteLabel')}
                  value={artistNote}
                  onChangeText={(value) => {
                    setArtistNote(value);
                    setArtistNoteError('');
                  }}
                  multiline
                  maxLength={4000}
                  placeholder={t('artistPrivateNotePlaceholder')}
                />
                <Text style={styles.noteCounter}>{artistNote.length}/4000</Text>
                {artistNoteError ? <Text style={styles.error}>{artistNoteError}</Text> : null}
                <Button
                  label={t('savePrivateNote')}
                  loading={artistNoteSaving}
                  onPress={() => void saveArtistNote()}
                  variant="secondary"
                />
              </View>
            </View>
          ) : null}

          {appointment.reference_images.length || appointment.can_add_references ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('bookingReferences')}</Text>
              {appointment.reference_images.length ? (
                <View style={styles.referenceGrid}>
                  {appointment.reference_images.map((reference) => (
                    <Image
                      accessibilityLabel={reference.name}
                      key={reference.id}
                      source={{ uri: reference.url }}
                      style={styles.referenceImage}
                    />
                  ))}
                </View>
              ) : null}
              {appointment.can_add_references ? (
                <>
                  <Text style={styles.referenceRequest}>{t('referencesRequired')}</Text>
                  <Button
                    label={t('addReferences')}
                    loading={action === 'references'}
                    onPress={() => void addReferences()}
                    variant="secondary"
                  />
                </>
              ) : null}
            </View>
          ) : null}

          {appointment.healing_journey ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('healing')}</Text>
              <View style={styles.healingCard}>
                <Text style={styles.healthIntro}>{t('healingAppointmentSubtitle')}</Text>
                <Text style={styles.healthExpiry}>
                  {t('healingDay')} {appointment.healing_journey.current_day}
                </Text>
                <Button
                  label={t('healingOpen')}
                  onPress={() => router.push({
                    pathname: '/healing/[journeyId]',
                    params: { journeyId: appointment.healing_journey!.id },
                  })}
                />
              </View>
            </View>
          ) : null}

          {appointment.booking_type === 'tattoo_session' && health ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {health.role === 'artist'
                  ? health.copy.artist_title
                  : health.copy.booking_title}
              </Text>
              <View style={styles.healthCard}>
                {health.role === 'artist' ? (
                  <>
                    <Text style={styles.healthIntro}>{health.copy.artist_intro}</Text>
                    {health.active ? (
                      <>
                        {health.items.map((item) => (
                          <View key={item} style={styles.healthItemRow}>
                            <Text style={styles.healthBullet}>•</Text>
                            <Text style={styles.healthItem}>{item}</Text>
                          </View>
                        ))}
                        {health.other ? (
                          <Text style={styles.healthOther}>{health.other}</Text>
                        ) : null}
                        {health.confirmed_none ? (
                          <Text style={styles.healthNone}>{health.copy.none_declared}</Text>
                        ) : null}
                      </>
                    ) : (
                      <Text style={styles.healthNone}>{health.copy.client_not_shared}</Text>
                    )}
                  </>
                ) : (
                  <>
                    <Text style={styles.healthIntro}>
                      {health.active
                        ? health.source === 'quick'
                          ? health.copy.client_quick_shared
                          : health.copy.client_shared
                        : health.copy.client_not_shared}
                    </Text>
                    {health.expires_on ? (
                      <Text style={styles.healthExpiry}>
                        {health.copy.expires} {health.expires_on}
                      </Text>
                    ) : null}
                    <Button
                      label={health.copy.manage_card}
                      onPress={() => router.push('/health-safety')}
                      variant="secondary"
                    />
                    {health.can_share_card ? (
                      <Button
                        label={health.copy.share_now}
                        loading={healthAction === 'share'}
                        onPress={() => void shareHealthCard()}
                      />
                    ) : null}
                    {health.active ? (
                      <Button
                        label={health.copy.revoke}
                        loading={healthAction === 'revoke'}
                        onPress={() => void revokeHealth()}
                        variant="danger"
                      />
                    ) : null}
                  </>
                )}
                {healthError ? <Text style={styles.error}>{healthError}</Text> : null}
              </View>
            </View>
          ) : null}

          {deposit?.has_deposit ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{deposit.copy.deposit_title}</Text>
              <View style={styles.depositCard}>
                <View style={styles.depositTopRow}>
                  <Text style={styles.depositAmount}>
                    {deposit.amount} {deposit.currency}
                  </Text>
                  <Text style={styles.depositStatus}>{deposit.status}</Text>
                </View>
                <Text style={styles.healthIntro}>{deposit.message}</Text>
                {deposit.expires_at ? (
                  <Text style={styles.healthExpiry}>
                    {deposit.copy.deposit_due} · {deposit.expires_at}
                  </Text>
                ) : null}
                {deposit.can_pay ? (
                  <Button
                    label={deposit.action_label}
                    loading={paymentLoading}
                    onPress={() => void payDeposit()}
                  />
                ) : null}
                {paymentError ? <Text style={styles.error}>{paymentError}</Text> : null}
              </View>
            </View>
          ) : null}

          {appointment.available_actions.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('artistActions')}</Text>
              <View style={styles.actions}>
                {appointment.role === 'artist' && (
                  appointment.status === 'accepted'
                  || appointment.status === 'consultation_required'
                ) ? (
                  <Button
                    label={t('artistRescheduleAction')}
                    onPress={() => router.push({
                      pathname: '/appointment/[appointmentId]/reschedule',
                      params: { appointmentId: String(appointment.id) },
                    })}
                    variant="secondary"
                  />
                ) : null}
                {appointment.available_actions.map((availableAction) => (
                  <Button
                    key={availableAction}
                    label={t(ACTION_LABELS[availableAction])}
                    loading={action === availableAction}
                    onPress={() => selectAction(availableAction)}
                    variant={
                      availableAction === 'decline' || availableAction === 'cancel'
                        ? 'danger'
                        : availableAction === 'accept' || availableAction === 'complete'
                          ? 'primary'
                          : 'secondary'
                    }
                  />
                ))}
              </View>
            </View>
          ) : null}
          {actionError ? <Text style={styles.error}>{actionError}</Text> : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  backButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  backText: { color: colors.primary, fontSize: 16, fontWeight: '800' },
  centerState: { minHeight: 320, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  muted: { color: colors.textMuted, lineHeight: 22, textAlign: 'center' },
  stateCard: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.large, padding: spacing.xl, gap: spacing.md,
  },
  stateTitle: { color: colors.text, fontSize: 23, fontWeight: '900', textAlign: 'center' },
  successNotice: {
    backgroundColor: '#0a332d', borderColor: colors.success, borderWidth: 1,
    borderRadius: radius.medium, padding: spacing.md, gap: spacing.xs,
  },
  successTitle: { color: colors.success, fontSize: 17, fontWeight: '900' },
  successText: { color: colors.text, lineHeight: 21 },
  hero: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.large, padding: spacing.lg, gap: spacing.md,
  },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avatarFallback: {
    width: 72, height: 72, borderRadius: 36, alignItems: 'center',
    justifyContent: 'center', backgroundColor: colors.primary,
  },
  avatarLetter: { color: colors.backgroundDeep, fontSize: 28, fontWeight: '900' },
  identity: { flex: 1, gap: 3 },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  username: { color: colors.text, fontSize: 23, fontWeight: '900' },
  date: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  statusCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.backgroundDeep, borderRadius: radius.medium,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md,
  },
  statusLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  statusValue: { color: colors.primary, fontSize: 14, fontWeight: '900' },
  heroActions: { flexDirection: 'row', gap: spacing.sm },
  flexButton: { flex: 1 },
  section: { gap: spacing.md },
  sectionTitle: { color: colors.text, fontSize: 21, fontWeight: '900' },
  detailCard: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.medium, overflow: 'hidden',
  },
  detailRow: {
    padding: spacing.md, gap: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  detailLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  detailValue: { color: colors.text, fontSize: 14, lineHeight: 21, fontWeight: '700' },
  noteCard: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.medium, padding: spacing.md, gap: spacing.sm,
  },
  noteHint: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  noteCounter: { color: colors.textMuted, fontSize: 11, textAlign: 'right' },
  referenceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  referenceImage: { width: '48%', aspectRatio: 1, borderRadius: radius.medium, backgroundColor: colors.surface },
  referenceRequest: { color: colors.accent, fontSize: 13, lineHeight: 20, fontWeight: '800' },
  actions: { gap: spacing.sm },
  healthCard: {
    backgroundColor: colors.surface, borderColor: colors.primaryMuted,
    borderWidth: 1, borderRadius: radius.medium, padding: spacing.md, gap: spacing.sm,
  },
  healingCard: {
    backgroundColor: colors.surface, borderColor: colors.primaryMuted, borderWidth: 1,
    borderRadius: radius.large, padding: spacing.md, gap: spacing.md,
  },
  healthIntro: { color: colors.textMuted, lineHeight: 21 },
  healthItemRow: { flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' },
  healthBullet: { color: colors.primary, fontWeight: '900' },
  healthItem: { flex: 1, color: colors.text, lineHeight: 20, fontWeight: '700' },
  healthOther: {
    color: colors.text, lineHeight: 20, backgroundColor: colors.backgroundDeep,
    borderRadius: radius.medium, padding: spacing.sm,
  },
  healthNone: { color: colors.textMuted, fontStyle: 'italic', lineHeight: 20 },
  healthExpiry: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  depositCard: {
    backgroundColor: colors.surface, borderColor: colors.accent,
    borderWidth: 1, borderRadius: radius.medium, padding: spacing.md, gap: spacing.sm,
  },
  depositTopRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    gap: spacing.sm,
  },
  depositAmount: { color: colors.text, fontSize: 22, fontWeight: '900' },
  depositStatus: {
    color: colors.accent, fontSize: 11, fontWeight: '900', textTransform: 'uppercase',
  },
  error: {
    color: colors.danger, borderColor: colors.danger, borderWidth: 1,
    borderRadius: radius.medium, padding: spacing.sm, textAlign: 'center',
  },
});

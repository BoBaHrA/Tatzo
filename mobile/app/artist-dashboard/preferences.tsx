import { useCallback, useState, type ReactNode } from 'react';
import { Redirect, router, useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import type {
  ArtistBookingPreferences,
  ArtistBookingPreferencesUpdate,
  ArtistBookingWorkflow,
} from '@/api/types';
import {
  fetchArtistBookingPreferences,
  saveArtistBookingPreferences,
} from '@/artist-dashboard/artist-dashboard-api';
import { useAuth } from '@/auth/auth-context';
import { BrandHeader } from '@/components/brand-header';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { userFacingError } from '@/errors';
import { t } from '@/i18n';
import { colors, radius, spacing } from '@/theme';


type PreferencesForm = {
  bookingWorkflow: ArtistBookingWorkflow;
  minimumNoticeHours: string;
  maximumBookingWindowDays: string;
  slotStepMinutes: number;
  defaultSessionMinutes: number;
  maximumSessionHours: string;
  consultationEnabled: boolean;
  onlineConsultationEnabled: boolean;
  studioConsultationEnabled: boolean;
  consultationRequiredBeforeBooking: boolean;
  consultationPrice: string;
  onlineConsultationPrice: string;
  referenceImagesRequired: boolean;
  minimumReferenceImages: string;
  maximumReferenceImages: string;
  activeStyles: string[];
  autoResponseBookingReceived: string;
  autoResponseConsultationRequired: string;
  autoResponseNeedMoreReferences: string;
  autoResponseBookingApproved: string;
  autoResponseBookingDeclined: string;
};

function formFromPreferences(settings: ArtistBookingPreferences): PreferencesForm {
  return {
    bookingWorkflow: settings.booking_workflow,
    minimumNoticeHours: String(settings.minimum_notice_hours),
    maximumBookingWindowDays: String(settings.maximum_booking_window_days),
    slotStepMinutes: settings.slot_step_minutes,
    defaultSessionMinutes: settings.default_session_minutes,
    maximumSessionHours: String(settings.maximum_session_hours),
    consultationEnabled: settings.consultation_enabled,
    onlineConsultationEnabled: settings.online_consultation_enabled,
    studioConsultationEnabled: settings.studio_consultation_enabled,
    consultationRequiredBeforeBooking: settings.consultation_required_before_booking,
    consultationPrice: settings.consultation_price,
    onlineConsultationPrice: settings.online_consultation_price,
    referenceImagesRequired: settings.reference_images_required,
    minimumReferenceImages: String(settings.minimum_reference_images),
    maximumReferenceImages: String(settings.maximum_reference_images),
    activeStyles: [...settings.active_styles],
    autoResponseBookingReceived: settings.auto_response_booking_received,
    autoResponseConsultationRequired: settings.auto_response_consultation_required,
    autoResponseNeedMoreReferences: settings.auto_response_need_more_references,
    autoResponseBookingApproved: settings.auto_response_booking_approved,
    autoResponseBookingDeclined: settings.auto_response_booking_declined,
  };
}

function parseWholeNumber(value: string, minimum: number, maximum: number) {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return parsed >= minimum && parsed <= maximum ? parsed : null;
}

function normalizePrice(value: string) {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 999999.99) return null;
  return normalized;
}

function durationLabel(minutes: number) {
  if (minutes === 480) return t('fullDay');
  const hours = minutes / 60;
  return `${hours} ${hours === 1 ? t('hour') : t('hours')}`;
}

function SectionCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionHint}>{hint}</Text>
      </View>
      {children}
    </View>
  );
}

function ChoiceChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onValueChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleCopy}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {hint ? <Text style={styles.toggleHint}>{hint}</Text> : null}
      </View>
      <Switch
        accessibilityLabel={label}
        onValueChange={onValueChange}
        thumbColor={value ? colors.primary : colors.textMuted}
        trackColor={{ false: colors.backgroundDeep, true: colors.primaryMuted }}
        value={value}
      />
    </View>
  );
}

export default function ArtistBookingPreferencesScreen() {
  const { request, status, user } = useAuth();
  const [settings, setSettings] = useState<ArtistBookingPreferences | null>(null);
  const [form, setForm] = useState<PreferencesForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const applySettings = useCallback((next: ArtistBookingPreferences) => {
    setSettings(next);
    setForm(formFromPreferences(next));
  }, []);

  const load = useCallback(async () => {
    if (status !== 'authenticated' || !user?.is_verified_artist) return;
    setLoading(true);
    setError('');
    try {
      applySettings(await fetchArtistBookingPreferences(request));
    } catch (caught) {
      setError(userFacingError(caught));
    } finally {
      setLoading(false);
    }
  }, [applySettings, request, status, user?.is_verified_artist]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  if (status === 'anonymous') return <Redirect href="/(auth)/login" />;
  if (status === 'authenticated' && !user?.is_verified_artist) {
    return <Redirect href="/(tabs)/profile" />;
  }

  const change = (changes: Partial<PreferencesForm>) => {
    setError('');
    setSuccess('');
    setForm((current) => current ? { ...current, ...changes } : current);
  };

  const toggleConsultations = (enabled: boolean) => {
    if (!form) return;
    change({
      consultationEnabled: enabled,
      consultationRequiredBeforeBooking: enabled
        ? form.consultationRequiredBeforeBooking
        : false,
      studioConsultationEnabled: enabled
        && !form.studioConsultationEnabled
        && !form.onlineConsultationEnabled
        ? true
        : form.studioConsultationEnabled,
    });
  };

  const toggleReferences = (required: boolean) => {
    if (!form) return;
    change({
      referenceImagesRequired: required,
      minimumReferenceImages:
        required && form.minimumReferenceImages === '0'
          ? '1'
          : form.minimumReferenceImages,
    });
  };

  const toggleStyle = (style: string) => {
    if (!form) return;
    const active = form.activeStyles.includes(style);
    change({
      activeStyles: active
        ? form.activeStyles.filter((value) => value !== style)
        : [...form.activeStyles, style],
    });
  };

  const changeMaximumSessionHours = (value: string) => {
    if (!form) return;
    const maximum = parseWholeNumber(value, 1, 12);
    let defaultSessionMinutes = form.defaultSessionMinutes;
    if (maximum !== null && defaultSessionMinutes > maximum * 60) {
      const allowed = settings?.session_duration_options.filter(
        (minutes) => minutes <= maximum * 60,
      ) ?? [];
      if (allowed.length) defaultSessionMinutes = Math.max(...allowed);
    }
    change({ maximumSessionHours: value, defaultSessionMinutes });
  };

  const visibleSessionDurations = settings?.session_duration_options.filter((minutes) => {
    if (!form) return true;
    const maximum = parseWholeNumber(form.maximumSessionHours, 1, 12);
    return maximum === null || minutes <= maximum * 60;
  }) ?? [];

  const save = async () => {
    if (!form || saving) return;
    setError('');
    setSuccess('');

    const minimumNoticeHours = parseWholeNumber(form.minimumNoticeHours, 0, 2160);
    const maximumBookingWindowDays = parseWholeNumber(
      form.maximumBookingWindowDays,
      1,
      365,
    );
    const maximumSessionHours = parseWholeNumber(form.maximumSessionHours, 1, 12);
    const minimumReferenceImages = parseWholeNumber(
      form.minimumReferenceImages,
      0,
      20,
    );
    const maximumReferenceImages = parseWholeNumber(
      form.maximumReferenceImages,
      1,
      20,
    );
    const consultationPrice = normalizePrice(form.consultationPrice);
    const onlineConsultationPrice = normalizePrice(form.onlineConsultationPrice);

    if (
      minimumNoticeHours === null
      || maximumBookingWindowDays === null
      || maximumSessionHours === null
      || minimumReferenceImages === null
      || maximumReferenceImages === null
      || consultationPrice === null
      || onlineConsultationPrice === null
    ) {
      setError(t('artistPreferencesNumbersError'));
      return;
    }
    if (form.defaultSessionMinutes > maximumSessionHours * 60) {
      setError(t('artistPreferencesSessionError'));
      return;
    }
    if (
      form.consultationEnabled
      && !form.studioConsultationEnabled
      && !form.onlineConsultationEnabled
    ) {
      setError(t('artistPreferencesConsultationError'));
      return;
    }
    if (
      form.consultationRequiredBeforeBooking
      && !form.consultationEnabled
    ) {
      setError(t('artistPreferencesConsultationError'));
      return;
    }
    if (
      minimumReferenceImages > maximumReferenceImages
      || (form.referenceImagesRequired && minimumReferenceImages < 1)
    ) {
      setError(t('artistPreferencesReferenceError'));
      return;
    }
    if (!form.activeStyles.length) {
      setError(t('artistPreferencesStyleError'));
      return;
    }

    const payload: ArtistBookingPreferencesUpdate = {
      booking_workflow: form.bookingWorkflow,
      minimum_notice_hours: minimumNoticeHours,
      maximum_booking_window_days: maximumBookingWindowDays,
      slot_step_minutes: form.slotStepMinutes,
      default_session_minutes: form.defaultSessionMinutes,
      maximum_session_hours: maximumSessionHours,
      consultation_enabled: form.consultationEnabled,
      online_consultation_enabled: form.onlineConsultationEnabled,
      studio_consultation_enabled: form.studioConsultationEnabled,
      consultation_required_before_booking: form.consultationRequiredBeforeBooking,
      consultation_price: consultationPrice,
      online_consultation_price: onlineConsultationPrice,
      reference_images_required: form.referenceImagesRequired,
      minimum_reference_images: minimumReferenceImages,
      maximum_reference_images: maximumReferenceImages,
      active_styles: form.activeStyles,
      auto_response_booking_received: form.autoResponseBookingReceived,
      auto_response_consultation_required: form.autoResponseConsultationRequired,
      auto_response_need_more_references: form.autoResponseNeedMoreReferences,
      auto_response_booking_approved: form.autoResponseBookingApproved,
      auto_response_booking_declined: form.autoResponseBookingDeclined,
    };

    setSaving(true);
    try {
      applySettings(await saveArtistBookingPreferences(request, payload));
      setSuccess(t('artistPreferencesSaved'));
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
          <Text style={styles.title}>{t('artistPreferencesTitle')}</Text>
          <Text style={styles.subtitle}>{t('artistPreferencesSubtitle')}</Text>
        </View>
        <Pressable
          accessibilityLabel={t('close')}
          onPress={() => router.back()}
          style={styles.close}
        >
          <Text style={styles.closeText}>×</Text>
        </Pressable>
      </View>

      {loading || status === 'loading' ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.muted}>{t('artistPreferencesLoading')}</Text>
        </View>
      ) : !settings || !form ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>{t('artistPreferencesUnavailable')}</Text>
          {error ? <Text style={styles.muted}>{error}</Text> : null}
          <Button label={t('retry')} onPress={() => void load()} />
        </View>
      ) : (
        <>
          <SectionCard
            title={t('artistPreferencesWorkflowTitle')}
            hint={t('artistPreferencesWorkflowHint')}
          >
            <View style={styles.chips}>
              {settings.booking_workflow_options.map((option) => (
                <ChoiceChip
                  key={option.value}
                  label={option.label}
                  onPress={() => change({ bookingWorkflow: option.value })}
                  selected={form.bookingWorkflow === option.value}
                />
              ))}
            </View>
          </SectionCard>

          <SectionCard
            title={t('artistPreferencesTimingTitle')}
            hint={t('artistPreferencesTimingHint')}
          >
            <View style={styles.fieldRow}>
              <View style={styles.fieldCell}>
                <Field
                  keyboardType="number-pad"
                  label={t('artistMinimumNoticeHours')}
                  maxLength={4}
                  onChangeText={(value) => change({ minimumNoticeHours: value })}
                  value={form.minimumNoticeHours}
                />
              </View>
              <View style={styles.fieldCell}>
                <Field
                  keyboardType="number-pad"
                  label={t('artistBookingWindowDays')}
                  maxLength={3}
                  onChangeText={(value) => change({ maximumBookingWindowDays: value })}
                  value={form.maximumBookingWindowDays}
                />
              </View>
            </View>
            <Field
              keyboardType="number-pad"
              label={t('artistMaximumSessionHours')}
              maxLength={2}
              onChangeText={changeMaximumSessionHours}
              value={form.maximumSessionHours}
            />
            <Text style={styles.choiceLabel}>{t('artistSlotStep')}</Text>
            <View style={styles.chips}>
              {settings.slot_step_options.map((minutes) => (
                <ChoiceChip
                  key={minutes}
                  label={`${minutes} ${t('minutesShort')}`}
                  onPress={() => change({ slotStepMinutes: minutes })}
                  selected={form.slotStepMinutes === minutes}
                />
              ))}
            </View>
            <Text style={styles.choiceLabel}>{t('artistDefaultSession')}</Text>
            <View style={styles.chips}>
              {visibleSessionDurations.map((minutes) => (
                <ChoiceChip
                  key={minutes}
                  label={durationLabel(minutes)}
                  onPress={() => change({ defaultSessionMinutes: minutes })}
                  selected={form.defaultSessionMinutes === minutes}
                />
              ))}
            </View>
          </SectionCard>

          <SectionCard
            title={t('artistStylesTitle')}
            hint={t('artistStylesHint')}
          >
            <View style={styles.chips}>
              {settings.style_options.map((option) => (
                <ChoiceChip
                  key={option.value}
                  label={option.label}
                  onPress={() => toggleStyle(option.value)}
                  selected={form.activeStyles.includes(option.value)}
                />
              ))}
            </View>
          </SectionCard>

          <SectionCard
            title={t('artistConsultationsTitle')}
            hint={t('artistConsultationsHint')}
          >
            <ToggleRow
              label={t('artistEnableConsultations')}
              onValueChange={toggleConsultations}
              value={form.consultationEnabled}
            />
            {form.consultationEnabled ? (
              <>
                <ToggleRow
                  label={t('artistStudioConsultations')}
                  onValueChange={(value) => change({ studioConsultationEnabled: value })}
                  value={form.studioConsultationEnabled}
                />
                <ToggleRow
                  label={t('artistOnlineConsultations')}
                  onValueChange={(value) => change({ onlineConsultationEnabled: value })}
                  value={form.onlineConsultationEnabled}
                />
                <ToggleRow
                  hint={t('artistConsultationRequiredHint')}
                  label={t('artistConsultationRequired')}
                  onValueChange={(value) => change({
                    consultationRequiredBeforeBooking: value,
                  })}
                  value={form.consultationRequiredBeforeBooking}
                />
              </>
            ) : null}
            <View style={styles.fieldRow}>
              <View style={styles.fieldCell}>
                <Field
                  keyboardType="decimal-pad"
                  label={t('artistStudioConsultationPrice')}
                  maxLength={9}
                  onChangeText={(value) => change({ consultationPrice: value })}
                  value={form.consultationPrice}
                />
              </View>
              <View style={styles.fieldCell}>
                <Field
                  keyboardType="decimal-pad"
                  label={t('artistOnlineConsultationPrice')}
                  maxLength={9}
                  onChangeText={(value) => change({ onlineConsultationPrice: value })}
                  value={form.onlineConsultationPrice}
                />
              </View>
            </View>
            <Text style={styles.inlineHint}>{t('artistConsultationPriceHint')}</Text>
          </SectionCard>

          <SectionCard
            title={t('artistReferencesTitle')}
            hint={t('artistReferencesHint')}
          >
            <ToggleRow
              label={t('artistRequireReferences')}
              onValueChange={toggleReferences}
              value={form.referenceImagesRequired}
            />
            <View style={styles.fieldRow}>
              <View style={styles.fieldCell}>
                <Field
                  keyboardType="number-pad"
                  label={t('artistMinimumReferences')}
                  maxLength={2}
                  onChangeText={(value) => change({ minimumReferenceImages: value })}
                  value={form.minimumReferenceImages}
                />
              </View>
              <View style={styles.fieldCell}>
                <Field
                  keyboardType="number-pad"
                  label={t('artistMaximumReferences')}
                  maxLength={2}
                  onChangeText={(value) => change({ maximumReferenceImages: value })}
                  value={form.maximumReferenceImages}
                />
              </View>
            </View>
          </SectionCard>

          <SectionCard
            title={t('artistAutoResponsesTitle')}
            hint={t('artistAutoResponsesHint')}
          >
            <Field
              label={t('artistResponseReceived')}
              maxLength={2000}
              multiline
              onChangeText={(value) => change({ autoResponseBookingReceived: value })}
              placeholder={t('artistResponsePlaceholder')}
              value={form.autoResponseBookingReceived}
            />
            <Field
              label={t('artistResponseConsultation')}
              maxLength={2000}
              multiline
              onChangeText={(value) => change({
                autoResponseConsultationRequired: value,
              })}
              placeholder={t('artistResponsePlaceholder')}
              value={form.autoResponseConsultationRequired}
            />
            <Field
              label={t('artistResponseReferences')}
              maxLength={2000}
              multiline
              onChangeText={(value) => change({
                autoResponseNeedMoreReferences: value,
              })}
              placeholder={t('artistResponsePlaceholder')}
              value={form.autoResponseNeedMoreReferences}
            />
            <Field
              label={t('artistResponseApproved')}
              maxLength={2000}
              multiline
              onChangeText={(value) => change({ autoResponseBookingApproved: value })}
              placeholder={t('artistResponsePlaceholder')}
              value={form.autoResponseBookingApproved}
            />
            <Field
              label={t('artistResponseDeclined')}
              maxLength={2000}
              multiline
              onChangeText={(value) => change({ autoResponseBookingDeclined: value })}
              placeholder={t('artistResponsePlaceholder')}
              value={form.autoResponseBookingDeclined}
            />
          </SectionCard>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {success ? <Text style={styles.success}>{success}</Text> : null}
          <Button
            label={t('artistPreferencesSave')}
            loading={saving}
            onPress={() => void save()}
          />
          <Button label={t('cancel')} onPress={() => router.back()} variant="secondary" />
        </>
      )}
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
  centerState: { minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  muted: { color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
  stateCard: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.large, padding: spacing.xl, gap: spacing.md,
  },
  stateTitle: { color: colors.text, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  card: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.large, padding: spacing.md, gap: spacing.md,
  },
  sectionHeading: { gap: 3 },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '900' },
  sectionHint: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  choiceLabel: { color: colors.text, fontSize: 14, fontWeight: '900' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    minHeight: 42, justifyContent: 'center', borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundDeep,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
  chipTextSelected: { color: colors.backgroundDeep },
  toggleRow: {
    minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    borderColor: colors.border, borderWidth: 1, borderRadius: radius.medium,
    backgroundColor: colors.backgroundDeep, padding: spacing.md,
  },
  toggleCopy: { flex: 1, gap: 3 },
  toggleLabel: { color: colors.text, fontSize: 14, fontWeight: '900', lineHeight: 19 },
  toggleHint: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  fieldRow: { flexDirection: 'row', gap: spacing.sm },
  fieldCell: { flex: 1 },
  inlineHint: { color: colors.textMuted, fontSize: 11, lineHeight: 17 },
  error: {
    color: colors.danger, borderColor: colors.danger, borderWidth: 1,
    borderRadius: radius.medium, padding: spacing.sm, textAlign: 'center', lineHeight: 20,
  },
  success: {
    color: colors.success, borderColor: colors.success, borderWidth: 1,
    borderRadius: radius.medium, padding: spacing.sm, textAlign: 'center', fontWeight: '800',
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.985 }] },
});

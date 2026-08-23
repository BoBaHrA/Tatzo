import { useCallback, useEffect, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ApiError } from '@/api/client';
import type {
  BookingConfig,
  BookingType,
  HealthSafetyFieldKey,
  HealthSafetyShareMode,
  HealthSafetyValues,
} from '@/api/types';
import { useAuth } from '@/auth/auth-context';
import { BodyPlacementPicker } from '@/booking/body-placement-picker';
import {
  availableBookingTimes,
  BookingCalendar,
} from '@/booking/booking-calendar';
import {
  createBooking,
  fetchBookingConfig,
  type BookingDraft,
  type PendingBookingReference,
} from '@/booking/booking-api';
import { BrandHeader } from '@/components/brand-header';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { EMPTY_HEALTH_VALUES } from '@/health-safety/health-safety-api';
import { appLanguage, t } from '@/i18n';
import { colors, radius, spacing } from '@/theme';


const STEPS = [
  'bookingWhen',
  'bookingProject',
  'bookingReferences',
  'healthSafety',
  'bookingReview',
] as const;

function toggleValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function formatDate(value: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(appLanguage, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`));
}

function durationLabel(value: number) {
  if (value === 480) return t('fullDay');
  const hours = value / 60;
  return `${hours} ${hours === 1 ? t('hour') : t('hours')}`;
}

type ChoiceProps = {
  label: string;
  active: boolean;
  onPress: () => void;
};

function Choice({ active, label, onPress }: ChoiceProps) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        active && styles.choiceActive,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text>
    </Pressable>
  );
}

function FieldLabel({ children }: { children: string }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

function CheckRow({
  checked,
  label,
  onPress,
  hint,
}: {
  checked: boolean;
  label: string;
  onPress: () => void;
  hint?: string;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onPress}
      style={({ pressed }) => [styles.checkRow, pressed && styles.pressed]}
    >
      <View style={[styles.checkbox, checked && styles.checkboxActive]}>
        <Text style={styles.checkmark}>{checked ? '✓' : ''}</Text>
      </View>
      <View style={styles.checkText}>
        <Text style={styles.checkTitle}>{label}</Text>
        {hint ? <Text style={styles.checkHint}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value || '—'}</Text>
    </View>
  );
}

export default function BookingScreen() {
  const params = useLocalSearchParams<{ username?: string | string[] }>();
  const username = Array.isArray(params.username) ? params.username[0] : params.username;
  const { request, status } = useAuth();
  const [config, setConfig] = useState<BookingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [step, setStep] = useState(0);
  const [bookingType, setBookingType] = useState<BookingType>('tattoo_session');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [duration, setDuration] = useState(60);
  const [comfortLimit, setComfortLimit] = useState('');
  const [stylesSelected, setStylesSelected] = useState<string[]>([]);
  const [placements, setPlacements] = useState<string[]>([]);
  const [size, setSize] = useState('');
  const [budget, setBudget] = useState('');
  const [description, setDescription] = useState('');
  const [consultationCompleted, setConsultationCompleted] = useState(false);
  const [consultationNote, setConsultationNote] = useState('');
  const [references, setReferences] = useState<PendingBookingReference[]>([]);
  const [healthMode, setHealthMode] = useState<HealthSafetyShareMode>('none');
  const [healthValues, setHealthValues] = useState<HealthSafetyValues>({
    ...EMPTY_HEALTH_VALUES,
  });
  const [healthOther, setHealthOther] = useState('');
  const [healthConfirmedNone, setHealthConfirmedNone] = useState(false);
  const [healthShareConsent, setHealthShareConsent] = useState(false);
  const [healthSaveToCard, setHealthSaveToCard] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!username || status !== 'authenticated') return;
    setLoading(true);
    setLoadError('');
    try {
      const next = await fetchBookingConfig(request, username);
      setConfig(next);
      const initialType = next.booking_types[0] ?? 'tattoo_session';
      setBookingType(initialType);
      setDuration(
        initialType === 'tattoo_session'
          ? (next.durations.includes(next.settings.default_session_minutes)
            ? next.settings.default_session_minutes
            : (next.durations[0] ?? 60))
          : 60,
      );
    } catch (loadFailure) {
      setLoadError(
        loadFailure instanceof ApiError && loadFailure.status === 404
          ? t('bookingUnavailable')
          : t('bookingLoadError'),
      );
    } finally {
      setLoading(false);
    }
  }, [request, status, username]);

  useEffect(() => {
    void load();
  }, [load]);

  const isConsultation = bookingType !== 'tattoo_session';
  const effectiveDuration = isConsultation ? 60 : duration;
  const times = useMemo(
    () => config && date
      ? availableBookingTimes(config, date, effectiveDuration)
      : [],
    [config, date, effectiveDuration],
  );

  if (status === 'anonymous') return <Redirect href="/(auth)/login" />;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/home');
  };

  const chooseType = (value: BookingType) => {
    setBookingType(value);
    setDuration(value === 'tattoo_session' ? (config?.durations[0] ?? 60) : 60);
    setStartTime('');
    if (value !== 'tattoo_session') setHealthMode('none');
    setError('');
  };

  const validateCurrentStep = () => {
    if (step === 0 && (!date || !startTime)) return t('chooseDateTimeError');
    if (step === 1 && !isConsultation) {
      if (!stylesSelected.length) return t('chooseStyleError');
      if (!placements.length) return t('choosePlacementError');
      if (!size || !budget) return t('completeProjectError');
      if (config?.settings.consultation_required_before_booking && !consultationCompleted) {
        return t('consultationRequiredError');
      }
    }
    if (
      step === 2
      && !isConsultation
      && config?.settings.reference_images_required
      && references.length < config.settings.minimum_reference_images
    ) {
      return `${t('minimumReferences')} ${config.settings.minimum_reference_images}.`;
    }
    if (step === 3 && !isConsultation) {
      if (healthMode === 'card' && !config?.health_safety.has_card) {
        return config?.health_safety.copy.booking_missing ?? t('healthSafetyUnavailable');
      }
      if (healthMode === 'quick') {
        const hasDeclaredItem = Object.values(healthValues).some(Boolean)
          || Boolean(healthOther.trim());
        if (healthConfirmedNone && hasDeclaredItem) {
          return config?.health_safety.copy.booking_validation ?? t('healthSafetyUnavailable');
        }
        if (!healthConfirmedNone && !hasDeclaredItem) {
          return config?.health_safety.copy.booking_validation ?? t('healthSafetyUnavailable');
        }
        if (!healthShareConsent) {
          return config?.health_safety.copy.booking_consent_required
            ?? t('healthSafetyUnavailable');
        }
      }
    }
    return '';
  };

  const next = () => {
    const validationError = validateCurrentStep();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setStep((current) => Math.min(4, current + 1));
  };

  const pickReferences = async () => {
    if (!config) return;
    setError('');
    const remaining = config.settings.maximum_reference_images - references.length;
    if (remaining <= 0) {
      setError(`${t('maximumReferences')} ${config.settings.maximum_reference_images}.`);
      return;
    }
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError(t('referencePickerError'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes: ['images'],
        quality: 0.9,
        selectionLimit: remaining,
      });
      if (result.canceled) return;
      setReferences((current) => [
        ...current,
        ...result.assets.slice(0, remaining).map((asset, index) => ({
          key: `${Date.now()}-${index}-${asset.uri}`,
          uri: asset.uri,
          name: asset.fileName ?? `tatzo-reference-${Date.now()}-${index}.jpg`,
          mimeType: asset.mimeType ?? 'image/jpeg',
        })),
      ]);
    } catch {
      setError(t('referencePickerError'));
    }
  };

  const submit = async () => {
    if (!config || !username || submitting) return;
    const validationError = validateCurrentStep();
    if (validationError) {
      setError(validationError);
      return;
    }
    const draft: BookingDraft = {
      bookingType,
      date,
      startTime,
      duration: effectiveDuration,
      comfortLimit,
      styles: isConsultation ? [] : stylesSelected,
      placements: isConsultation ? [] : placements,
      size: isConsultation ? '' : size,
      budget: isConsultation ? '' : budget,
      description,
      consultationAlreadyCompleted: !isConsultation && consultationCompleted,
      consultationNote,
      references,
      healthSafety: {
        mode: isConsultation ? 'none' : healthMode,
        values: healthValues,
        otherRelevantInformation: healthOther,
        confirmedNone: healthConfirmedNone,
        shareConsent: healthShareConsent,
        saveToCard: healthSaveToCard,
      },
    };
    setSubmitting(true);
    setError('');
    try {
      const appointment = await createBooking(request, username, draft);
      router.replace({
        pathname: '/appointment/[appointmentId]',
        params: { appointmentId: String(appointment.id), created: 'true' },
      });
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : t('bookingSubmitError'));
    } finally {
      setSubmitting(false);
    }
  };

  const optionLabel = (group: keyof BookingConfig['option_labels'], value: string) => (
    config?.option_labels[group][value] ?? value
  );

  return (
    <Screen contentStyle={styles.screen}>
      <Pressable onPress={goBack} style={styles.backButton}>
        <Text style={styles.backText}>‹ {t('back')}</Text>
      </Pressable>
      <BrandHeader />

      {loading || status === 'loading' ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.muted}>{t('bookingLoading')}</Text>
        </View>
      ) : !config ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>{t('bookingUnavailable')}</Text>
          <Text style={styles.muted}>{loadError || t('bookingLoadError')}</Text>
          <Button label={t('retry')} onPress={() => void load()} />
        </View>
      ) : !config.available ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>{t('bookingUnavailable')}</Text>
          <Text style={styles.muted}>{config.unavailable_reason ?? t('bookingLoadError')}</Text>
          <Button label={t('openArtistProfile')} onPress={goBack} variant="secondary" />
        </View>
      ) : (
        <>
          <View style={styles.artistCard}>
            {config.artist.profile_image_url ? (
              <Image source={{ uri: config.artist.profile_image_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarLetter}>{config.artist.username[0]?.toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.artistIdentity}>
              <Text style={styles.eyebrow}>{t('bookingWith')}</Text>
              <Text style={styles.artistName}>{config.artist.username} <Text style={styles.verified}>✓</Text></Text>
              <Text style={styles.artistMeta}>
                {config.settings.booking_workflow === 'auto'
                  ? t('automaticApproval')
                  : t('manualReview')}
              </Text>
            </View>
          </View>

          <View style={styles.progress}>
            {STEPS.map((key, index) => (
              <View key={key} style={styles.progressItem}>
                <View style={[
                  styles.progressDot,
                  index <= step && styles.progressDotActive,
                ]}>
                  <Text style={[
                    styles.progressNumber,
                    index <= step && styles.progressNumberActive,
                  ]}>{index + 1}</Text>
                </View>
                <Text numberOfLines={1} style={[
                  styles.progressLabel,
                  index === step && styles.progressLabelActive,
                ]}>{t(key)}</Text>
              </View>
            ))}
          </View>

          <View style={styles.stepCard}>
            {step === 0 ? (
              <>
                <Text style={styles.stepTitle}>{t('chooseAppointment')}</Text>
                <FieldLabel>{t('bookingType')}</FieldLabel>
                <View style={styles.choices}>
                  {config.booking_types.map((value) => (
                    <Choice
                      active={bookingType === value}
                      key={value}
                      label={optionLabel('booking_types', value)}
                      onPress={() => chooseType(value)}
                    />
                  ))}
                </View>
                {!isConsultation ? (
                  <>
                    <FieldLabel>{t('duration')}</FieldLabel>
                    <View style={styles.choices}>
                      {config.durations.map((value) => (
                        <Choice
                          active={duration === value}
                          key={value}
                          label={durationLabel(value)}
                          onPress={() => {
                            setDuration(value);
                            setStartTime('');
                          }}
                        />
                      ))}
                    </View>
                  </>
                ) : null}
                <FieldLabel>{t('chooseDate')}</FieldLabel>
                <BookingCalendar
                  config={config}
                  onSelect={(value) => {
                    setDate(value);
                    setStartTime('');
                  }}
                  selectedDate={date}
                />
                {date ? (
                  <>
                    <FieldLabel>{t('chooseTime')}</FieldLabel>
                    {times.length ? (
                      <View style={styles.choices}>
                        {times.map((value) => (
                          <Choice
                            active={startTime === value}
                            key={value}
                            label={value}
                            onPress={() => setStartTime(value)}
                          />
                        ))}
                      </View>
                    ) : <Text style={styles.mutedLeft}>{t('noAvailableTimes')}</Text>}
                  </>
                ) : null}
                <FieldLabel>{t('comfortLimit')}</FieldLabel>
                <TextInput
                  maxLength={40}
                  onChangeText={setComfortLimit}
                  placeholder={t('comfortLimitPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  value={comfortLimit}
                />
              </>
            ) : null}

            {step === 1 ? (
              <>
                <Text style={styles.stepTitle}>
                  {isConsultation ? t('consultationDetails') : t('tattooDetails')}
                </Text>
                {!isConsultation ? (
                  <>
                    <FieldLabel>{t('chooseStyle')}</FieldLabel>
                    <View style={styles.choices}>
                      {config.styles.map((value) => (
                        <Choice
                          active={stylesSelected.includes(value)}
                          key={value}
                          label={optionLabel('styles', value)}
                          onPress={() => setStylesSelected((current) => toggleValue(current, value))}
                        />
                      ))}
                    </View>
                    <FieldLabel>{t('choosePlacement')}</FieldLabel>
                    <BodyPlacementPicker
                      labels={config.option_labels.placements}
                      onChange={setPlacements}
                      options={config.placements}
                      selected={placements}
                    />
                    <FieldLabel>{t('chooseSize')}</FieldLabel>
                    <View style={styles.choices}>
                      {config.sizes.map((value) => (
                        <Choice
                          active={size === value}
                          key={value}
                          label={optionLabel('sizes', value)}
                          onPress={() => setSize(value)}
                        />
                      ))}
                    </View>
                    <FieldLabel>{t('chooseBudget')}</FieldLabel>
                    <View style={styles.choices}>
                      {config.budgets.map((value) => (
                        <Choice
                          active={budget === value}
                          key={value}
                          label={optionLabel('budgets', value)}
                          onPress={() => setBudget(value)}
                        />
                      ))}
                    </View>
                  </>
                ) : null}
                <FieldLabel>{t('projectDescription')}</FieldLabel>
                <TextInput
                  maxLength={3000}
                  multiline
                  onChangeText={setDescription}
                  placeholder={t('projectDescriptionPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, styles.textarea]}
                  textAlignVertical="top"
                  value={description}
                />
                {!isConsultation && config.settings.consultation_required_before_booking ? (
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: consultationCompleted }}
                    onPress={() => setConsultationCompleted((current) => !current)}
                    style={({ pressed }) => [styles.checkRow, pressed && styles.pressed]}
                  >
                    <View style={[styles.checkbox, consultationCompleted && styles.checkboxActive]}>
                      <Text style={styles.checkmark}>{consultationCompleted ? '✓' : ''}</Text>
                    </View>
                    <View style={styles.checkText}>
                      <Text style={styles.checkTitle}>{t('consultationCompleted')}</Text>
                      <Text style={styles.checkHint}>{t('consultationCompletedHint')}</Text>
                    </View>
                  </Pressable>
                ) : null}
                {(isConsultation || config.settings.consultation_required_before_booking) ? (
                  <>
                    <FieldLabel>{t('consultationNote')}</FieldLabel>
                    <TextInput
                      maxLength={240}
                      onChangeText={setConsultationNote}
                      placeholder={t('consultationNotePlaceholder')}
                      placeholderTextColor={colors.textMuted}
                      style={styles.input}
                      value={consultationNote}
                    />
                  </>
                ) : null}
              </>
            ) : null}

            {step === 2 ? (
              <>
                <Text style={styles.stepTitle}>{t('bookingReferences')}</Text>
                <Text style={styles.mutedLeft}>
                  {!isConsultation && config.settings.reference_images_required
                    ? `${t('referencesRequired')} ${config.settings.minimum_reference_images}.`
                    : t('referencesOptional')}
                </Text>
                <Text style={styles.referenceLimit}>
                  {references.length} / {config.settings.maximum_reference_images}
                </Text>
                {references.length ? (
                  <View style={styles.referenceGrid}>
                    {references.map((reference) => (
                      <View key={reference.key} style={styles.referenceCard}>
                        <Image source={{ uri: reference.uri }} style={styles.referenceImage} />
                        <Pressable
                          accessibilityLabel={t('removeReference')}
                          onPress={() => setReferences((current) => (
                            current.filter((item) => item.key !== reference.key)
                          ))}
                          style={styles.removeReference}
                        >
                          <Text style={styles.removeReferenceText}>×</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.referenceEmpty}>
                    <Text style={styles.referenceSymbol}>▧</Text>
                    <Text style={styles.muted}>{t('referenceIdeas')}</Text>
                  </View>
                )}
                <Button
                  disabled={references.length >= config.settings.maximum_reference_images}
                  label={t('addReferences')}
                  onPress={() => void pickReferences()}
                  variant="secondary"
                />
              </>
            ) : null}

            {step === 3 ? (
              <>
                <Text style={styles.stepTitle}>{config.health_safety.copy.booking_title}</Text>
                {isConsultation ? (
                  <View style={styles.noticeBlock}>
                    <Text style={styles.noticeTextLeft}>
                      {config.health_safety.copy.booking_none}
                    </Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.mutedLeft}>
                      {config.health_safety.copy.booking_ready}
                    </Text>
                    <View style={styles.healthChoices}>
                      <Choice
                        active={healthMode === 'none'}
                        label={config.health_safety.copy.booking_none}
                        onPress={() => setHealthMode('none')}
                      />
                      {config.health_safety.has_card ? (
                        <Choice
                          active={healthMode === 'card'}
                          label={config.health_safety.copy.booking_share}
                          onPress={() => setHealthMode('card')}
                        />
                      ) : (
                        <View style={styles.noticeBlock}>
                          <Text style={styles.noticeTextLeft}>
                            {config.health_safety.copy.booking_missing}
                          </Text>
                        </View>
                      )}
                      <Choice
                        active={healthMode === 'quick'}
                        label={config.health_safety.copy.booking_quick}
                        onPress={() => setHealthMode('quick')}
                      />
                    </View>

                    {healthMode === 'quick' ? (
                      <>
                        <Text style={styles.mutedLeft}>
                          {config.health_safety.copy.booking_quick_intro}
                        </Text>
                        <View style={styles.choices}>
                          {config.health_safety.fields.map((field) => (
                            <Choice
                              active={healthValues[field.key]}
                              key={field.key}
                              label={field.label}
                              onPress={() => {
                                const key: HealthSafetyFieldKey = field.key;
                                setHealthValues((current) => ({
                                  ...current,
                                  [key]: !current[key],
                                }));
                                setHealthConfirmedNone(false);
                              }}
                            />
                          ))}
                        </View>
                        <FieldLabel>{config.health_safety.copy.other}</FieldLabel>
                        <TextInput
                          maxLength={1000}
                          multiline
                          onChangeText={(value) => {
                            setHealthOther(value);
                            if (value.trim()) setHealthConfirmedNone(false);
                          }}
                          placeholder={config.health_safety.copy.other_help}
                          placeholderTextColor={colors.textMuted}
                          style={[styles.input, styles.textarea]}
                          textAlignVertical="top"
                          value={healthOther}
                        />
                        <CheckRow
                          checked={healthConfirmedNone}
                          label={config.health_safety.copy.booking_confirm_none}
                          onPress={() => {
                            const nextValue = !healthConfirmedNone;
                            setHealthConfirmedNone(nextValue);
                            if (nextValue) {
                              setHealthValues({ ...EMPTY_HEALTH_VALUES });
                              setHealthOther('');
                            }
                          }}
                        />
                        <CheckRow
                          checked={healthShareConsent}
                          label={config.health_safety.copy.booking_quick_consent}
                          onPress={() => setHealthShareConsent((current) => !current)}
                        />
                        <CheckRow
                          checked={healthSaveToCard}
                          label={config.health_safety.copy.booking_save_quick}
                          onPress={() => setHealthSaveToCard((current) => !current)}
                        />
                      </>
                    ) : null}
                  </>
                )}
              </>
            ) : null}

            {step === 4 ? (
              <>
                <Text style={styles.stepTitle}>{t('reviewBooking')}</Text>
                <View style={styles.reviewCard}>
                  <ReviewRow label={t('bookingType')} value={optionLabel('booking_types', bookingType)} />
                  <ReviewRow label={t('dateAndTime')} value={`${formatDate(date)} · ${startTime}`} />
                  <ReviewRow label={t('duration')} value={durationLabel(effectiveDuration)} />
                  {!isConsultation ? (
                    <>
                      <ReviewRow label={t('chooseStyle')} value={stylesSelected.map((value) => optionLabel('styles', value)).join(', ')} />
                      <ReviewRow label={t('choosePlacement')} value={placements.map((value) => optionLabel('placements', value)).join(', ')} />
                      <ReviewRow label={t('chooseSize')} value={optionLabel('sizes', size)} />
                      <ReviewRow label={t('chooseBudget')} value={optionLabel('budgets', budget)} />
                    </>
                  ) : null}
                  <ReviewRow label={t('bookingReferences')} value={String(references.length)} />
                  {!isConsultation ? (
                    <ReviewRow
                      label={config.health_safety.copy.booking_title}
                      value={
                        healthMode === 'card'
                          ? config.health_safety.copy.booking_share
                          : healthMode === 'quick'
                            ? config.health_safety.copy.booking_quick
                            : config.health_safety.copy.booking_none
                      }
                    />
                  ) : null}
                </View>
                {config.settings.deposit_required ? (
                  <View style={styles.notice}>
                    <Text style={styles.noticeTitle}>{t('depositRequired')}</Text>
                    <Text style={styles.noticeText}>€{config.settings.deposit_amount}</Text>
                  </View>
                ) : null}
                <Text style={styles.mutedLeft}>
                  {config.settings.booking_workflow === 'auto'
                    ? t('automaticApprovalHint')
                    : t('manualReviewHint')}
                </Text>
              </>
            ) : null}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.navigation}>
            {step > 0 ? (
              <Button
                disabled={submitting}
                label={t('previous')}
                onPress={() => {
                  setError('');
                  setStep((current) => Math.max(0, current - 1));
                }}
                variant="secondary"
                style={styles.navButton}
              />
            ) : null}
            <Button
              label={step === 4 ? t('submitBooking') : t('next')}
              loading={submitting}
              onPress={() => step === 4 ? void submit() : next()}
              style={styles.navButton}
            />
          </View>
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
  mutedLeft: { color: colors.textMuted, lineHeight: 22 },
  stateCard: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.large, padding: spacing.xl, gap: spacing.md,
  },
  stateTitle: { color: colors.text, fontSize: 23, fontWeight: '900', textAlign: 'center' },
  artistCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.large, padding: spacing.md,
  },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  avatarFallback: {
    width: 64, height: 64, borderRadius: 32, alignItems: 'center',
    justifyContent: 'center', backgroundColor: colors.primary,
  },
  avatarLetter: { color: colors.backgroundDeep, fontSize: 24, fontWeight: '900' },
  artistIdentity: { flex: 1, gap: 3 },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 1.8 },
  artistName: { color: colors.text, fontSize: 22, fontWeight: '900' },
  verified: { color: colors.primary },
  artistMeta: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  progress: { flexDirection: 'row', justifyContent: 'space-between' },
  progressItem: { flex: 1, alignItems: 'center', gap: 5 },
  progressDot: {
    width: 30, height: 30, borderRadius: 15, alignItems: 'center',
    justifyContent: 'center', borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  progressDotActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  progressNumber: { color: colors.textMuted, fontSize: 12, fontWeight: '900' },
  progressNumberActive: { color: colors.backgroundDeep },
  progressLabel: { color: colors.textMuted, fontSize: 9, fontWeight: '700', maxWidth: 76 },
  progressLabelActive: { color: colors.text },
  stepCard: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.large, padding: spacing.lg, gap: spacing.md,
  },
  stepTitle: { color: colors.text, fontSize: 25, fontWeight: '900' },
  fieldLabel: { color: colors.text, fontSize: 14, fontWeight: '900', marginTop: spacing.xs },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  choice: {
    minHeight: 42, justifyContent: 'center', borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.backgroundDeep,
    paddingHorizontal: spacing.md,
  },
  choiceActive: { backgroundColor: colors.primaryMuted, borderColor: colors.primary },
  choiceText: { color: colors.textMuted, fontSize: 13, fontWeight: '800' },
  choiceTextActive: { color: colors.white },
  input: {
    minHeight: 50, color: colors.text, backgroundColor: colors.backgroundDeep,
    borderColor: colors.border, borderWidth: 1, borderRadius: radius.medium,
    paddingHorizontal: spacing.md, fontSize: 15,
  },
  textarea: { minHeight: 132, paddingTop: spacing.md },
  checkRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: colors.backgroundDeep, borderRadius: radius.medium,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md,
  },
  checkbox: {
    width: 24, height: 24, borderRadius: 7, borderWidth: 1,
    borderColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: colors.primary },
  checkmark: { color: colors.backgroundDeep, fontWeight: '900' },
  checkText: { flex: 1, gap: 3 },
  checkTitle: { color: colors.text, fontWeight: '900' },
  checkHint: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  referenceLimit: { color: colors.primary, fontSize: 13, fontWeight: '900' },
  referenceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  referenceCard: { width: '47%', aspectRatio: 1, position: 'relative' },
  referenceImage: { width: '100%', height: '100%', borderRadius: radius.medium },
  removeReference: {
    position: 'absolute', top: 6, right: 6, width: 30, height: 30,
    borderRadius: 15, backgroundColor: colors.backgroundDeep, alignItems: 'center',
    justifyContent: 'center', borderWidth: 1, borderColor: colors.danger,
  },
  removeReferenceText: { color: colors.danger, fontSize: 23, lineHeight: 25 },
  referenceEmpty: {
    minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border,
    borderRadius: radius.medium, backgroundColor: colors.backgroundDeep,
  },
  referenceSymbol: { color: colors.primary, fontSize: 38 },
  reviewCard: {
    backgroundColor: colors.backgroundDeep, borderRadius: radius.medium,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  reviewRow: {
    flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md,
    padding: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  reviewLabel: { flex: 0.42, color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  reviewValue: { flex: 0.58, color: colors.text, fontSize: 13, fontWeight: '800', textAlign: 'right' },
  notice: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.surfaceRaised, borderRadius: radius.medium,
    borderWidth: 1, borderColor: colors.accent, padding: spacing.md,
  },
  noticeTitle: { color: colors.text, fontWeight: '800' },
  noticeText: { color: colors.accent, fontSize: 18, fontWeight: '900' },
  healthChoices: { gap: spacing.sm },
  noticeBlock: {
    backgroundColor: colors.backgroundDeep, borderRadius: radius.medium,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md,
  },
  noticeTextLeft: { color: colors.textMuted, lineHeight: 20 },
  error: {
    color: colors.danger, borderColor: colors.danger, borderWidth: 1,
    borderRadius: radius.medium, padding: spacing.sm, textAlign: 'center',
  },
  navigation: { flexDirection: 'row', gap: spacing.sm },
  navButton: { flex: 1 },
  pressed: { opacity: 0.68 },
});

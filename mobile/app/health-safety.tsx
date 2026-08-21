import { useCallback, useState } from 'react';
import { Redirect, router, useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type {
  HealthSafetyCard,
  HealthSafetyFieldKey,
  HealthSafetyValues,
} from '@/api/types';
import { useAuth } from '@/auth/auth-context';
import { BrandHeader } from '@/components/brand-header';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { userFacingError } from '@/errors';
import {
  deleteHealthSafetyCard,
  EMPTY_HEALTH_VALUES,
  fetchHealthSafetyCard,
  saveHealthSafetyCard,
} from '@/health-safety/health-safety-api';
import { t } from '@/i18n';
import { colors, radius, spacing } from '@/theme';


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

export default function HealthSafetyScreen() {
  const { request, status } = useAuth();
  const [card, setCard] = useState<HealthSafetyCard | null>(null);
  const [values, setValues] = useState<HealthSafetyValues>({ ...EMPTY_HEALTH_VALUES });
  const [other, setOther] = useState('');
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    if (status !== 'authenticated') return;
    setLoading(true);
    setError('');
    try {
      const next = await fetchHealthSafetyCard(request);
      setCard(next);
      setValues({ ...next.values });
      setOther(next.other_relevant_information);
      setConsent(next.has_card);
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

  const toggle = (key: HealthSafetyFieldKey) => {
    setValues((current) => ({ ...current, [key]: !current[key] }));
    setSuccess('');
  };

  const save = async () => {
    if (!card || saving) return;
    if (!consent) {
      setError(card.copy.consent_required);
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const next = await saveHealthSafetyCard(request, values, other);
      setCard(next);
      setValues({ ...next.values });
      setOther(next.other_relevant_information);
      setConsent(true);
      setSuccess(next.copy.saved);
    } catch (caught) {
      setError(userFacingError(caught));
    } finally {
      setSaving(false);
    }
  };

  const deleteCard = () => {
    if (!card?.has_card || deleting) return;
    Alert.alert(card.copy.delete, card.copy.privacy, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: card.copy.delete,
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          setError('');
          setSuccess('');
          try {
            await deleteHealthSafetyCard(request);
            const message = card.copy.deleted;
            const next = await fetchHealthSafetyCard(request);
            setCard(next);
            setValues({ ...EMPTY_HEALTH_VALUES });
            setOther('');
            setConsent(false);
            setSuccess(message);
          } catch (caught) {
            setError(userFacingError(caught));
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
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
          <Text style={styles.muted}>{t('healthSafetyLoading')}</Text>
        </View>
      ) : !card ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>{t('healthSafetyUnavailable')}</Text>
          <Text style={styles.muted}>{error}</Text>
          <Button label={t('retry')} onPress={() => void load()} />
        </View>
      ) : (
        <>
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>{card.copy.eyebrow}</Text>
            <Text style={styles.title}>{card.copy.title}</Text>
            <Text style={styles.body}>{card.copy.intro}</Text>
            <View style={styles.privacyNotice}>
              <Text style={styles.privacyText}>{card.copy.privacy}</Text>
            </View>
          </View>

          <View style={styles.card}>
            {card.fields.map((field) => (
              <CheckRow
                checked={values[field.key]}
                key={field.key}
                label={field.label}
                onPress={() => toggle(field.key)}
              />
            ))}
            <Text style={styles.fieldLabel}>{card.copy.other}</Text>
            <TextInput
              maxLength={1000}
              multiline
              onChangeText={(value) => {
                setOther(value);
                setSuccess('');
              }}
              placeholder={card.copy.other_help}
              placeholderTextColor={colors.textMuted}
              style={styles.textarea}
              textAlignVertical="top"
              value={other}
            />
            <Text style={styles.help}>{card.copy.other_help}</Text>
          </View>

          <CheckRow
            checked={consent}
            label={card.copy.consent}
            onPress={() => {
              setConsent((current) => !current);
              setSuccess('');
            }}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {success ? <Text style={styles.success}>{success}</Text> : null}
          <Button label={card.copy.save} loading={saving} onPress={() => void save()} />
          {card.has_card ? (
            <Button
              label={card.copy.delete}
              loading={deleting}
              onPress={deleteCard}
              variant="danger"
            />
          ) : null}

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{card.copy.shared_with}</Text>
            {card.shared_appointments.length ? card.shared_appointments.map((item) => (
              <Pressable
                key={item.appointment_id}
                onPress={() => router.push({
                  pathname: '/appointment/[appointmentId]',
                  params: { appointmentId: String(item.appointment_id) },
                })}
                style={({ pressed }) => [styles.shareRow, pressed && styles.pressed]}
              >
                <View>
                  <Text style={styles.shareArtist}>@{item.artist_username}</Text>
                  <Text style={styles.shareDate}>{item.appointment_date}</Text>
                </View>
                <Text style={styles.openArrow}>›</Text>
              </Pressable>
            )) : <Text style={styles.mutedLeft}>{card.copy.no_shares}</Text>}
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
  muted: { color: colors.textMuted, textAlign: 'center', lineHeight: 21 },
  mutedLeft: { color: colors.textMuted, lineHeight: 21 },
  stateCard: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.large, padding: spacing.xl, gap: spacing.md,
  },
  stateTitle: { color: colors.text, fontSize: 23, fontWeight: '900', textAlign: 'center' },
  hero: {
    backgroundColor: colors.surface, borderColor: colors.primaryMuted, borderWidth: 1,
    borderRadius: radius.large, padding: spacing.lg, gap: spacing.sm,
  },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 27, lineHeight: 33, fontWeight: '900' },
  body: { color: colors.textMuted, lineHeight: 21 },
  privacyNotice: {
    backgroundColor: colors.backgroundDeep, borderRadius: radius.medium,
    borderColor: colors.border, borderWidth: 1, padding: spacing.md,
  },
  privacyText: { color: colors.text, lineHeight: 20, fontSize: 13 },
  card: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.large, padding: spacing.md, gap: spacing.sm,
  },
  checkRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: colors.backgroundDeep, borderRadius: radius.medium,
    borderColor: colors.border, borderWidth: 1, padding: spacing.md,
  },
  checkbox: {
    width: 24, height: 24, borderRadius: 7, borderWidth: 1,
    borderColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: colors.primary },
  checkmark: { color: colors.backgroundDeep, fontWeight: '900' },
  checkText: { flex: 1, gap: 3 },
  checkTitle: { color: colors.text, fontWeight: '800', lineHeight: 20 },
  checkHint: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  fieldLabel: { color: colors.text, fontSize: 14, fontWeight: '900', marginTop: spacing.xs },
  textarea: {
    minHeight: 132, color: colors.text, backgroundColor: colors.backgroundDeep,
    borderColor: colors.border, borderWidth: 1, borderRadius: radius.medium,
    padding: spacing.md, fontSize: 15,
  },
  help: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  error: {
    color: colors.danger, borderColor: colors.danger, borderWidth: 1,
    borderRadius: radius.medium, padding: spacing.sm, textAlign: 'center',
  },
  success: {
    color: colors.success, borderColor: colors.success, borderWidth: 1,
    borderRadius: radius.medium, padding: spacing.sm, textAlign: 'center',
  },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '900' },
  shareRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
    paddingVertical: spacing.sm,
  },
  shareArtist: { color: colors.text, fontWeight: '900' },
  shareDate: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  openArrow: { color: colors.primary, fontSize: 28 },
  pressed: { opacity: 0.68 },
});

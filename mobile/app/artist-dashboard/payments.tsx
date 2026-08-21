import { useCallback, useState } from 'react';
import { Redirect, router, useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { ArtistPaymentSettings } from '@/api/types';
import { useAuth } from '@/auth/auth-context';
import { BrandHeader } from '@/components/brand-header';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { userFacingError } from '@/errors';
import { t } from '@/i18n';
import {
  fetchArtistPaymentSettings,
  saveArtistDepositSettings,
  startArtistPaymentOnboarding,
} from '@/payments/payment-api';
import { colors, radius, spacing } from '@/theme';


export default function ArtistPaymentsScreen() {
  const { request, status, user } = useAuth();
  const [settings, setSettings] = useState<ArtistPaymentSettings | null>(null);
  const [depositRequired, setDepositRequired] = useState(false);
  const [depositAmount, setDepositAmount] = useState('50');
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const applySettings = (next: ArtistPaymentSettings) => {
    setSettings(next);
    setDepositRequired(next.deposit_required);
    setDepositAmount(next.deposit_amount);
  };

  const load = useCallback(async () => {
    if (status !== 'authenticated' || !user?.is_verified_artist) return;
    setLoading(true);
    setError('');
    try {
      applySettings(await fetchArtistPaymentSettings(request));
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

  const connect = async () => {
    if (connecting) return;
    setConnecting(true);
    setError('');
    setSuccess('');
    try {
      const { url } = await startArtistPaymentOnboarding(request);
      await Linking.openURL(url);
    } catch (caught) {
      setError(userFacingError(caught));
    } finally {
      setConnecting(false);
    }
  };

  const save = async () => {
    if (!settings || saving) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const next = await saveArtistDepositSettings(
        request,
        depositRequired,
        depositAmount,
      );
      applySettings(next);
      setSuccess(next.copy.settings_saved);
    } catch (caught) {
      setError(userFacingError(caught));
    } finally {
      setSaving(false);
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
          <Text style={styles.muted}>{t('artistPaymentsLoading')}</Text>
        </View>
      ) : !settings ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>{t('artistPaymentsUnavailable')}</Text>
          <Text style={styles.muted}>{error}</Text>
          <Button label={t('retry')} onPress={() => void load()} />
        </View>
      ) : (
        <>
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>STRIPE CONNECT</Text>
            <Text style={styles.title}>{settings.copy.dashboard_title}</Text>
            <Text style={styles.body}>{settings.copy.dashboard_intro}</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, settings.ready && styles.statusDotReady]} />
              <Text style={styles.statusLabel}>{settings.label}</Text>
            </View>
            {settings.configured && !settings.ready ? (
              <Button
                label={
                  settings.state === 'not_connected'
                    ? settings.copy.connect
                    : settings.copy.continue
                }
                loading={connecting}
                onPress={() => void connect()}
              />
            ) : null}
          </View>

          {settings.ready ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>{settings.copy.deposit_settings_title}</Text>
              <Text style={styles.body}>{settings.copy.deposit_settings_intro}</Text>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: depositRequired }}
                onPress={() => setDepositRequired((current) => !current)}
                style={({ pressed }) => [styles.checkRow, pressed && styles.pressed]}
              >
                <View style={[styles.checkbox, depositRequired && styles.checkboxActive]}>
                  <Text style={styles.checkmark}>{depositRequired ? '✓' : ''}</Text>
                </View>
                <Text style={styles.checkTitle}>{settings.copy.deposit_toggle}</Text>
              </Pressable>
              <Text style={styles.fieldLabel}>{settings.copy.deposit_amount_label}</Text>
              <TextInput
                keyboardType="decimal-pad"
                maxLength={9}
                onChangeText={setDepositAmount}
                placeholder="50"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                value={depositAmount}
              />
              <Text style={styles.currency}>EUR</Text>
              <Button
                label={settings.copy.save_settings}
                loading={saving}
                onPress={() => void save()}
              />
            </View>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {success ? <Text style={styles.success}>{success}</Text> : null}
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
  title: { color: colors.text, fontSize: 29, fontWeight: '900' },
  body: { color: colors.textMuted, lineHeight: 21 },
  card: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.large, padding: spacing.md, gap: spacing.md,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  statusDotReady: { backgroundColor: colors.success },
  statusLabel: { flex: 1, color: colors.text, fontWeight: '900' },
  sectionTitle: { color: colors.text, fontSize: 21, fontWeight: '900' },
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
  checkTitle: { flex: 1, color: colors.text, fontWeight: '800', lineHeight: 20 },
  fieldLabel: { color: colors.text, fontSize: 14, fontWeight: '900' },
  input: {
    minHeight: 52, color: colors.text, backgroundColor: colors.backgroundDeep,
    borderColor: colors.border, borderWidth: 1, borderRadius: radius.medium,
    paddingHorizontal: spacing.md, fontSize: 18, fontWeight: '800',
  },
  currency: { color: colors.primary, fontSize: 12, fontWeight: '900', marginTop: -spacing.sm },
  error: {
    color: colors.danger, borderColor: colors.danger, borderWidth: 1,
    borderRadius: radius.medium, padding: spacing.sm, textAlign: 'center',
  },
  success: {
    color: colors.success, borderColor: colors.success, borderWidth: 1,
    borderRadius: radius.medium, padding: spacing.sm, textAlign: 'center',
  },
  pressed: { opacity: 0.68 },
});

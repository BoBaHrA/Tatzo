import { useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { userFacingError } from '@/errors';
import { t } from '@/i18n';
import {
  submitMapLocationCorrection,
  type MapLocationCorrectionDraft,
  type PendingMapDocument,
} from '@/map/map-api';
import { colors, radius, spacing } from '@/theme';

const reasons = [
  ['closed', 'mapReportClosed'],
  ['moved', 'mapReportMoved'],
  ['address', 'mapReportAddress'],
  ['duplicate', 'mapReportDuplicate'],
  ['nonexistent', 'mapReportNonexistent'],
  ['other', 'mapReportOther'],
] as const;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function ReportMapLocationScreen() {
  const params = useLocalSearchParams<{ locationId?: string; name?: string }>();
  const locationId = Number(first(params.locationId));
  const { request, status, user } = useAuth();
  const [reporterName, setReporterName] = useState(user?.username ?? '');
  const [contactEmail, setContactEmail] = useState(user?.email ?? '');
  const [reason, setReason] = useState<MapLocationCorrectionDraft['reason']>('closed');
  const [explanation, setExplanation] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [supportingFile, setSupportingFile] = useState<PendingMapDocument | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (status === 'anonymous') return <Redirect href="/(auth)/login" />;

  const chooseEvidence = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets[0]) {
        const file = result.assets[0];
        setSupportingFile({
          uri: file.uri, name: file.name,
          mimeType: file.mimeType ?? 'application/octet-stream',
        });
      }
    } catch {
      setError(t('mapFileError'));
    }
  };

  const submit = async () => {
    if (!Number.isInteger(locationId) || locationId <= 0) {
      setError(t('mapClaimInvalid'));
      return;
    }
    if (!reporterName.trim() || !contactEmail.trim()) {
      setError(t('mapReportRequired'));
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await submitMapLocationCorrection(request, locationId, {
        reporterName: reporterName.trim(),
        contactEmail: contactEmail.trim(),
        reason, explanation: explanation.trim(),
        newAddress: newAddress.trim(), supportingFile,
      });
      Alert.alert(t('mapReportSubmitted'), t('mapReportSubmittedHint'), [
        { text: t('done'), onPress: () => router.back() },
      ]);
    } catch (caught) {
      setError(userFacingError(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.header}>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>TATZO MAPS</Text>
          <Text style={styles.title}>{t('mapReportTitle')}</Text>
          <Text style={styles.name}>{first(params.name)}</Text>
          <Text style={styles.subtitle}>{t('mapReportSubtitle')}</Text>
        </View>
        <Pressable accessibilityLabel={t('close')} onPress={() => router.back()}>
          <Text style={styles.close}>×</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Field label={t('mapClaimantName')} maxLength={160}
               onChangeText={setReporterName} value={reporterName} />
        <Field label={t('mapContactEmail')} keyboardType="email-address"
               autoCapitalize="none" onChangeText={setContactEmail} value={contactEmail} />
        <Text style={styles.subtitle}>{t('mapReportReason')}</Text>
        {reasons.map(([code, key]) => (
          <Pressable key={code} onPress={() => setReason(code)} accessibilityRole="radio"
                     accessibilityState={{ checked: reason === code }}
                     style={[styles.reason, reason === code && styles.selected]}>
            <Text style={styles.reasonText}>{reason === code ? '◉' : '○'} {t(key)}</Text>
          </Pressable>
        ))}
        {reason === 'moved' || reason === 'address' ? (
          <Field label={t('mapReportNewAddress')} maxLength={255}
                 onChangeText={setNewAddress} value={newAddress} />
        ) : null}
        <Field label={t('mapReportDetails')} maxLength={3000} multiline
               onChangeText={setExplanation} value={explanation} />
        {supportingFile ? (
          <Pressable onPress={() => setSupportingFile(null)}>
            <Text style={styles.reasonText}>{supportingFile.name} · {t('mapRemoveFile')}</Text>
          </Pressable>
        ) : (
          <Button label={t('mapChooseFile')} variant="secondary"
                  onPress={() => void chooseEvidence()} />
        )}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button label={t('mapReportSubmit')} loading={submitting} onPress={() => void submit()} />
      <Button label={t('cancel')} variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', gap: spacing.md },
  heading: { flex: 1, gap: spacing.xs },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 27, fontWeight: '900' },
  name: { color: colors.accent, fontSize: 17, fontWeight: '900' },
  subtitle: { color: colors.textMuted, lineHeight: 21 },
  close: { color: colors.textMuted, fontSize: 32 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
          borderRadius: radius.large, padding: spacing.md, gap: spacing.md },
  reason: { padding: spacing.sm, borderWidth: 1, borderRadius: radius.medium,
            borderColor: colors.border },
  selected: { borderColor: colors.primary },
  reasonText: { color: colors.text },
  error: { color: colors.danger, textAlign: 'center', padding: spacing.sm },
});

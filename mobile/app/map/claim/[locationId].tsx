import { useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { userFacingError } from '@/errors';
import { t } from '@/i18n';
import {
  submitMapLocationClaim,
  type PendingMapDocument,
} from '@/map/map-api';
import { colors, radius, spacing } from '@/theme';


function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function ClaimMapLocationScreen() {
  const params = useLocalSearchParams<{ locationId?: string; name?: string }>();
  const { request, status, user } = useAuth();
  const locationId = Number(firstParam(params.locationId));
  const locationName = firstParam(params.name) ?? t('mapUnclaimedStudio');
  const [claimantName, setClaimantName] = useState(user?.username ?? '');
  const [contactEmail, setContactEmail] = useState(user?.email ?? '');
  const [relation, setRelation] = useState('');
  const [proof, setProof] = useState('');
  const [message, setMessage] = useState('');
  const [proofDocument, setProofDocument] = useState<PendingMapDocument | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (status === 'anonymous') {
    return <Redirect href="/(auth)/login" />;
  }

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        setProofDocument({
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType ?? 'application/octet-stream',
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
    if (!claimantName.trim() || !contactEmail.trim() || !relation.trim()) {
      setError(t('mapClaimRequired'));
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await submitMapLocationClaim(request, locationId, {
        claimantName: claimantName.trim(),
        contactEmail: contactEmail.trim(),
        relationToLocation: relation.trim(),
        proof: proof.trim(),
        message: message.trim(),
        proofDocument,
      });
      Alert.alert(t('mapClaimSubmitted'), t('mapClaimSubmittedHint'), [
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
          <Text style={styles.title}>{t('mapClaimTitle')}</Text>
          <Text style={styles.locationName}>{locationName}</Text>
          <Text style={styles.subtitle}>{t('mapClaimSubtitle')}</Text>
        </View>
        <Pressable accessibilityLabel={t('close')} onPress={() => router.back()} style={styles.close}>
          <Text style={styles.closeText}>×</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Field label={t('mapClaimantName')} maxLength={160} onChangeText={setClaimantName} value={claimantName} />
        <Field
          autoCapitalize="none"
          keyboardType="email-address"
          label={t('mapContactEmail')}
          onChangeText={setContactEmail}
          value={contactEmail}
        />
        <Field
          label={t('mapRelation')}
          maxLength={160}
          onChangeText={setRelation}
          placeholder={t('mapRelationPlaceholder')}
          value={relation}
        />
        <Field
          label={t('mapProof')}
          maxLength={3000}
          multiline
          onChangeText={setProof}
          placeholder={t('mapProofPlaceholder')}
          value={proof}
        />
        <Field label={t('mapClaimMessage')} maxLength={3000} multiline onChangeText={setMessage} value={message} />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('mapProofDocument')}</Text>
        <Text style={styles.subtitle}>{t('mapProofDocumentHint')}</Text>
        {proofDocument ? (
          <View style={styles.fileRow}>
            <Text numberOfLines={1} style={styles.fileName}>{proofDocument.name}</Text>
            <Pressable onPress={() => setProofDocument(null)}>
              <Text style={styles.removeText}>{t('mapRemoveFile')}</Text>
            </Pressable>
          </View>
        ) : (
          <Button label={t('mapChooseFile')} onPress={() => void pickFile()} variant="secondary" />
        )}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button label={t('mapSubmitClaim')} loading={submitting} onPress={() => void submit()} />
      <Button label={t('cancel')} onPress={() => router.back()} variant="secondary" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  heading: { flex: 1, gap: spacing.xs },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 27, fontWeight: '900' },
  locationName: { color: colors.accent, fontSize: 17, fontWeight: '900' },
  subtitle: { color: colors.textMuted, lineHeight: 21 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.textMuted, fontSize: 32 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.md,
    gap: spacing.md,
  },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fileName: { color: colors.text, flex: 1 },
  removeText: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  error: {
    color: colors.danger,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    textAlign: 'center',
  },
});

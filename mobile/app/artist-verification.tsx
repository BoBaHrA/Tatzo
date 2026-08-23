import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { ArtistVerification, VerificationStatus } from '@/api/types';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { userFacingError } from '@/errors';
import { t, type TranslationKey } from '@/i18n';
import { colors, radius, spacing } from '@/theme';
import {
  fetchArtistVerification,
  submitManualVerification,
  submitVerificationDocuments,
  type PendingVerificationDocument,
} from '@/verification/verification-api';


const MAX_FILE_SIZE = 9.5 * 1024 * 1024;
const DOCUMENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

type VerificationMethod = 'documents' | 'manual';

function statusCopy(status: VerificationStatus): {
  title: TranslationKey;
  body: TranslationKey;
} {
  if (status === 'approved') {
    return {
      title: 'verificationApprovedTitle',
      body: 'verificationApprovedBody',
    };
  }
  if (status === 'rejected') {
    return {
      title: 'verificationRejectedTitle',
      body: 'verificationRejectedBody',
    };
  }
  if (status === 'pending_documents') {
    return {
      title: 'verificationDocumentsPendingTitle',
      body: 'verificationPendingBody',
    };
  }
  if (status === 'pending_manual_review') {
    return {
      title: 'verificationManualPendingTitle',
      body: 'verificationPendingBody',
    };
  }
  if (status === 'pending') {
    return {
      title: 'verificationPendingTitle',
      body: 'verificationPendingBody',
    };
  }
  return {
    title: 'verificationNotSubmittedTitle',
    body: 'verificationNotSubmittedBody',
  };
}

async function pickDocument(): Promise<PendingVerificationDocument | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: DOCUMENT_TYPES,
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.name,
    mimeType: asset.mimeType ?? 'application/octet-stream',
    size: asset.size,
  };
}

export default function ArtistVerificationScreen() {
  const { refreshProfile, request, status, user } = useAuth();
  const [verification, setVerification] = useState<ArtistVerification | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [method, setMethod] = useState<VerificationMethod>('documents');
  const [businessType, setBusinessType] = useState('');
  const [identityType, setIdentityType] = useState('');
  const [businessDocument, setBusinessDocument] =
    useState<PendingVerificationDocument | null>(null);
  const [identityDocument, setIdentityDocument] =
    useState<PendingVerificationDocument | null>(null);
  const [portfolioLink, setPortfolioLink] = useState('');
  const [socialLink, setSocialLink] = useState('');
  const [cityCountry, setCityCountry] = useState('');
  const [explanation, setExplanation] = useState('');
  const [extraFile, setExtraFile] =
    useState<PendingVerificationDocument | null>(null);

  const hydrate = useCallback((payload: ArtistVerification) => {
    setVerification(payload);
    setMethod(payload.manual && !payload.documents ? 'manual' : 'documents');
    setBusinessType(
      payload.documents?.business_document_type
        ?? payload.business_document_types[0]?.value
        ?? '',
    );
    setIdentityType(
      payload.documents?.id_document_type
        ?? payload.id_document_types[0]?.value
        ?? '',
    );
    setPortfolioLink(payload.manual?.portfolio_link ?? '');
    setSocialLink(payload.manual?.social_link ?? '');
    setCityCountry(payload.manual?.city_country ?? '');
    setExplanation(payload.manual?.explanation ?? '');
  }, []);

  const load = useCallback(async () => {
    if (status !== 'authenticated' || user?.account_type !== 'tattoo_artist') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      hydrate(await fetchArtistVerification(request));
    } catch (caught) {
      setError(userFacingError(caught));
    } finally {
      setLoading(false);
    }
  }, [hydrate, request, status, user?.account_type]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectFile = async (
    setter: (file: PendingVerificationDocument | null) => void,
  ) => {
    setError('');
    try {
      const file = await pickDocument();
      if (!file) return;
      if (file.size !== undefined && file.size > MAX_FILE_SIZE) {
        setError(t('verificationFileTooLarge'));
        return;
      }
      setter(file);
    } catch {
      setError(t('verificationFilePickerError'));
    }
  };

  const submitDocuments = async () => {
    if (!businessType || !identityType || !businessDocument || !identityDocument) {
      setError(t('verificationDocumentsRequired'));
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const payload = await submitVerificationDocuments(request, {
        businessDocumentType: businessType,
        businessDocument,
        idDocumentType: identityType,
        idDocument: identityDocument,
      });
      hydrate(payload);
      await refreshProfile();
      Alert.alert(
        t('verificationSubmittedTitle'),
        t('verificationDocumentsSubmittedBody'),
      );
    } catch (caught) {
      setError(userFacingError(caught));
    } finally {
      setSubmitting(false);
    }
  };

  const submitManual = async () => {
    if (!explanation.trim()) {
      setError(t('verificationExplanationRequired'));
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const payload = await submitManualVerification(request, {
        portfolioLink: portfolioLink.trim(),
        socialLink: socialLink.trim(),
        cityCountry: cityCountry.trim(),
        explanation: explanation.trim(),
        extraFile,
      });
      hydrate(payload);
      await refreshProfile();
      Alert.alert(
        t('verificationSubmittedTitle'),
        t('verificationManualSubmittedBody'),
      );
    } catch (caught) {
      setError(userFacingError(caught));
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;

  const copy = verification ? statusCopy(verification.status) : null;
  const locked = verification ? !verification.can_submit : false;

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.header}>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>{t('verificationEyebrow')}</Text>
          <Text style={styles.title}>{t('verificationTitle')}</Text>
          <Text style={styles.subtitle}>{t('verificationSubtitle')}</Text>
        </View>
        <Pressable
          accessibilityLabel={t('close')}
          onPress={() => router.back()}
          style={styles.close}
        >
          <Text style={styles.closeText}>×</Text>
        </Pressable>
      </View>

      {user.account_type !== 'tattoo_artist' ? (
        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>{t('verificationForbiddenTitle')}</Text>
          <Text style={styles.subtitle}>{t('verificationForbiddenBody')}</Text>
        </View>
      ) : loading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.subtitle}>{t('verificationLoading')}</Text>
        </View>
      ) : verification && copy ? (
        <>
          <View
            style={[
              styles.statusCard,
              verification.status === 'rejected' && styles.rejectedCard,
              verification.status === 'approved' && styles.approvedCard,
            ]}
          >
            <Text style={styles.statusTitle}>{t(copy.title)}</Text>
            <Text style={styles.subtitle}>{t(copy.body)}</Text>
          </View>

          {locked ? (
            <Button
              label={t('verificationBackToProfile')}
              onPress={() => router.replace('/(tabs)/profile')}
            />
          ) : (
            <>
              <View style={styles.privacyCard}>
                <Text style={styles.privacyMark}>⌁</Text>
                <View style={styles.privacyCopy}>
                  <Text style={styles.privacyTitle}>{t('verificationPrivateTitle')}</Text>
                  <Text style={styles.privacyBody}>{t('verificationPrivateBody')}</Text>
                </View>
              </View>

              <Text style={styles.sectionTitle}>{t('verificationChoosePath')}</Text>
              <View style={styles.methodGrid}>
                <MethodCard
                  active={method === 'documents'}
                  body={t('verificationDocumentsMethodBody')}
                  onPress={() => {
                    setMethod('documents');
                    setError('');
                  }}
                  title={t('verificationDocumentsMethod')}
                />
                <MethodCard
                  active={method === 'manual'}
                  body={t('verificationManualMethodBody')}
                  onPress={() => {
                    setMethod('manual');
                    setError('');
                  }}
                  title={t('verificationManualMethod')}
                />
              </View>

              {method === 'documents' ? (
                <View style={styles.formCard}>
                  <Text style={styles.sectionTitle}>{t('verificationDocumentsTitle')}</Text>
                  <Text style={styles.subtitle}>{t('verificationDocumentsHint')}</Text>
                  <ChoiceGroup
                    label={t('verificationBusinessType')}
                    onChange={setBusinessType}
                    options={verification.business_document_types}
                    value={businessType}
                  />
                  <FileField
                    file={businessDocument}
                    hint={t('verificationAcceptedFiles')}
                    label={t('verificationBusinessFile')}
                    onClear={() => setBusinessDocument(null)}
                    onPick={() => void selectFile(setBusinessDocument)}
                  />
                  <ChoiceGroup
                    label={t('verificationIdentityType')}
                    onChange={setIdentityType}
                    options={verification.id_document_types}
                    value={identityType}
                  />
                  <FileField
                    file={identityDocument}
                    hint={t('verificationAcceptedFiles')}
                    label={t('verificationIdentityFile')}
                    onClear={() => setIdentityDocument(null)}
                    onPick={() => void selectFile(setIdentityDocument)}
                  />
                  <Button
                    label={t('verificationSubmitDocuments')}
                    loading={submitting}
                    onPress={() => void submitDocuments()}
                  />
                </View>
              ) : (
                <View style={styles.formCard}>
                  <Text style={styles.sectionTitle}>{t('verificationManualTitle')}</Text>
                  <Text style={styles.subtitle}>{t('verificationManualHint')}</Text>
                  <Field
                    autoCapitalize="none"
                    keyboardType="url"
                    label={t('verificationPortfolioLink')}
                    onChangeText={setPortfolioLink}
                    placeholder="https://portfolio.example"
                    value={portfolioLink}
                  />
                  <Field
                    autoCapitalize="none"
                    keyboardType="url"
                    label={t('verificationSocialLink')}
                    onChangeText={setSocialLink}
                    placeholder="https://instagram.com/..."
                    value={socialLink}
                  />
                  <Field
                    label={t('verificationCityCountry')}
                    maxLength={120}
                    onChangeText={setCityCountry}
                    placeholder={t('verificationCityPlaceholder')}
                    value={cityCountry}
                  />
                  <Field
                    label={t('verificationExplanation')}
                    maxLength={5000}
                    multiline
                    onChangeText={setExplanation}
                    placeholder={t('verificationExplanationPlaceholder')}
                    value={explanation}
                  />
                  <FileField
                    existing={verification.manual?.has_extra_file ?? false}
                    file={extraFile}
                    hint={t('verificationOptionalFileHint')}
                    label={t('verificationOptionalFile')}
                    onClear={() => setExtraFile(null)}
                    onPick={() => void selectFile(setExtraFile)}
                  />
                  <Button
                    label={t('verificationSubmitManual')}
                    loading={submitting}
                    onPress={() => void submitManual()}
                  />
                </View>
              )}
            </>
          )}
        </>
      ) : null}

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.error}>{error}</Text>
          {!verification && user.account_type === 'tattoo_artist' ? (
            <Button
              label={t('verificationRetry')}
              onPress={() => void load()}
              variant="secondary"
            />
          ) : null}
        </View>
      ) : null}
      <Button label={t('cancel')} onPress={() => router.back()} variant="secondary" />
    </Screen>
  );
}

function MethodCard({
  active,
  body,
  onPress,
  title,
}: {
  active: boolean;
  body: string;
  onPress: () => void;
  title: string;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={[styles.methodCard, active && styles.methodCardActive]}
    >
      <View style={[styles.radio, active && styles.radioActive]}>
        {active ? <View style={styles.radioDot} /> : null}
      </View>
      <Text style={styles.methodTitle}>{title}</Text>
      <Text style={styles.methodBody}>{body}</Text>
    </Pressable>
  );
}

function ChoiceGroup({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  value: string;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.choiceWrap}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              key={option.value}
              onPress={() => onChange(option.value)}
              style={[styles.choice, active && styles.choiceActive]}
            >
              <Text style={[styles.choiceText, active && styles.choiceTextActive]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function FileField({
  existing = false,
  file,
  hint,
  label,
  onClear,
  onPick,
}: {
  existing?: boolean;
  file: PendingVerificationDocument | null;
  hint: string;
  label: string;
  onClear: () => void;
  onPick: () => void;
}) {
  return (
    <View style={styles.fileCard}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fileHint}>{hint}</Text>
      {file ? (
        <View style={styles.fileRow}>
          <View style={styles.fileIdentity}>
            <Text style={styles.fileBadge}>FILE</Text>
            <Text numberOfLines={1} style={styles.fileName}>{file.name}</Text>
          </View>
          <Pressable onPress={onClear}>
            <Text style={styles.removeText}>{t('verificationRemoveFile')}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {existing ? (
            <Text style={styles.existingFile}>{t('verificationExistingPrivateFile')}</Text>
          ) : null}
          <Button
            label={existing ? t('verificationReplaceFile') : t('verificationChooseFile')}
            onPress={onPick}
            variant="secondary"
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  heading: { flex: 1, gap: spacing.xs },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: colors.textMuted, lineHeight: 21 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.textMuted, fontSize: 32 },
  loadingCard: {
    minHeight: 140,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.large,
  },
  statusCard: {
    backgroundColor: colors.surface,
    borderColor: colors.primaryMuted,
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  rejectedCard: { borderColor: colors.danger },
  approvedCard: { borderColor: colors.success },
  statusTitle: { color: colors.text, fontSize: 22, fontWeight: '900' },
  privacyCard: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.medium,
    padding: spacing.md,
    gap: spacing.md,
  },
  privacyMark: { color: colors.primary, fontSize: 28, fontWeight: '900' },
  privacyCopy: { flex: 1, gap: spacing.xs },
  privacyTitle: { color: colors.text, fontWeight: '900' },
  privacyBody: { color: colors.textMuted, lineHeight: 20 },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: '900' },
  methodGrid: { gap: spacing.sm },
  methodCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.medium,
    padding: spacing.md,
    gap: spacing.xs,
  },
  methodCardActive: { borderColor: colors.primary, backgroundColor: colors.surfaceRaised },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  methodTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  methodBody: { color: colors.textMuted, lineHeight: 19 },
  formCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.md,
    gap: spacing.md,
  },
  fieldGroup: { gap: spacing.sm },
  fieldLabel: { color: colors.text, fontSize: 14, fontWeight: '800' },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  choiceActive: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  choiceText: { color: colors.textMuted, fontWeight: '700' },
  choiceTextActive: { color: colors.text },
  fileCard: {
    backgroundColor: colors.backgroundDeep,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.medium,
    padding: spacing.md,
    gap: spacing.sm,
  },
  fileHint: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fileIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fileBadge: { color: colors.primary, fontSize: 10, fontWeight: '900' },
  fileName: { color: colors.text, flex: 1, fontWeight: '700' },
  removeText: { color: colors.danger, fontWeight: '800' },
  existingFile: { color: colors.success, fontSize: 13, fontWeight: '700' },
  errorCard: {
    backgroundColor: colors.surface,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.medium,
    padding: spacing.md,
    gap: spacing.sm,
  },
  error: { color: colors.danger, lineHeight: 20 },
});

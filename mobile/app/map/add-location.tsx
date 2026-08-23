import { useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as Location from 'expo-location';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
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
  submitMapLocation,
  type PendingMapDocument,
} from '@/map/map-api';
import { colors, radius, spacing } from '@/theme';


function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function finiteParam(value: string | string[] | undefined) {
  const parsed = Number(firstParam(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export default function AddMapLocationScreen() {
  const params = useLocalSearchParams<{ latitude?: string; longitude?: string }>();
  const { request, status, user } = useAuth();
  const suggestedLatitude = finiteParam(params.latitude);
  const suggestedLongitude = finiteParam(params.longitude);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [fullAddress, setFullAddress] = useState('');
  const [website, setWebsite] = useState('');
  const [phone, setPhone] = useState('');
  const [contactEmail, setContactEmail] = useState(user?.email ?? '');
  const [message, setMessage] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [supportingFile, setSupportingFile] = useState<PendingMapDocument | null>(null);
  const [locating, setLocating] = useState(false);
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
        setSupportingFile({
          uri: asset.uri,
          name: asset.name,
          mimeType: asset.mimeType ?? 'application/octet-stream',
        });
      }
    } catch {
      setError(t('mapFileError'));
    }
  };

  const useCurrentLocation = async () => {
    setLocating(true);
    setError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        setError(t('mapLocationDenied'));
        return;
      }
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLatitude(current.coords.latitude);
      setLongitude(current.coords.longitude);
    } catch {
      setError(t('mapLocationError'));
    } finally {
      setLocating(false);
    }
  };

  const useMapCenter = () => {
    if (suggestedLatitude === null || suggestedLongitude === null) return;
    setLatitude(suggestedLatitude);
    setLongitude(suggestedLongitude);
  };

  const submit = async () => {
    if (!name.trim() || !city.trim() || !country.trim() || !fullAddress.trim() || !contactEmail.trim()) {
      setError(t('mapRequiredFields'));
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await submitMapLocation(request, {
        name: name.trim(),
        city: city.trim(),
        country: country.trim(),
        fullAddress: fullAddress.trim(),
        websiteOrMapLink: website.trim(),
        phone: phone.trim(),
        contactEmail: contactEmail.trim(),
        latitude,
        longitude,
        message: message.trim(),
        supportingFile,
      });
      Alert.alert(t('mapLocationSubmitted'), t('mapLocationSubmittedHint'), [
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
          <Text style={styles.title}>{t('mapAddTitle')}</Text>
          <Text style={styles.subtitle}>{t('mapAddSubtitle')}</Text>
        </View>
        <Pressable accessibilityLabel={t('close')} onPress={() => router.back()} style={styles.close}>
          <Text style={styles.closeText}>×</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Field label={t('mapLocationName')} maxLength={160} onChangeText={setName} value={name} />
        <Field label={t('mapCity')} maxLength={120} onChangeText={setCity} value={city} />
        <Field label={t('mapCountry')} maxLength={120} onChangeText={setCountry} value={country} />
        <Field label={t('mapFullAddress')} multiline maxLength={1000} onChangeText={setFullAddress} value={fullAddress} />
        <Field
          autoCapitalize="none"
          keyboardType="url"
          label={t('mapWebsiteOptional')}
          maxLength={500}
          onChangeText={setWebsite}
          value={website}
        />
        <Field keyboardType="phone-pad" label={t('mapPhoneOptional')} maxLength={60} onChangeText={setPhone} value={phone} />
        <Field
          autoCapitalize="none"
          keyboardType="email-address"
          label={t('mapContactEmail')}
          onChangeText={setContactEmail}
          value={contactEmail}
        />
      </View>

      <View style={styles.card}>
        <View style={styles.sectionTitleRow}>
          <View style={styles.heading}>
            <Text style={styles.sectionTitle}>{t('mapCoordinates')}</Text>
            <Text style={styles.sectionHint}>{t('mapCoordinatesOptional')}</Text>
          </View>
          {locating ? <ActivityIndicator color={colors.primary} /> : null}
        </View>
        {latitude !== null && longitude !== null ? (
          <View style={styles.coordinateBox}>
            <Text style={styles.coordinateText}>{latitude.toFixed(6)}, {longitude.toFixed(6)}</Text>
            <Pressable onPress={() => { setLatitude(null); setLongitude(null); }}>
              <Text style={styles.removeText}>{t('mapClearCoordinates')}</Text>
            </Pressable>
          </View>
        ) : null}
        <View style={styles.buttonRow}>
          {suggestedLatitude !== null && suggestedLongitude !== null ? (
            <Button
              label={t('mapUseMapCenter')}
              onPress={useMapCenter}
              style={styles.flexButton}
              variant="secondary"
            />
          ) : null}
          <Button
            label={t('mapUseMyLocation')}
            loading={locating}
            onPress={() => void useCurrentLocation()}
            style={styles.flexButton}
            variant="secondary"
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('mapSupportingFile')}</Text>
        {supportingFile ? (
          <View style={styles.fileRow}>
            <Text numberOfLines={1} style={styles.fileName}>{supportingFile.name}</Text>
            <Pressable onPress={() => setSupportingFile(null)}>
              <Text style={styles.removeText}>{t('mapRemoveFile')}</Text>
            </Pressable>
          </View>
        ) : (
          <Button label={t('mapChooseFile')} onPress={() => void pickFile()} variant="secondary" />
        )}
        <Field label={t('mapMessageOptional')} multiline maxLength={3000} onChangeText={setMessage} value={message} />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button label={t('mapSubmitLocation')} loading={submitting} onPress={() => void submit()} />
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
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center' },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  sectionHint: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  coordinateBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.medium,
    backgroundColor: colors.backgroundDeep,
  },
  coordinateText: { color: colors.primary, fontWeight: '800', fontVariant: ['tabular-nums'] },
  removeText: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  buttonRow: { flexDirection: 'row', gap: spacing.sm },
  flexButton: { flex: 1, paddingHorizontal: spacing.sm },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fileName: { color: colors.text, flex: 1 },
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

import { useCallback, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, router, useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { PortfolioWork } from '@/api/types';
import { useAuth } from '@/auth/auth-context';
import { BrandHeader } from '@/components/brand-header';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { userFacingError } from '@/errors';
import { appLanguage, t } from '@/i18n';
import {
  createPortfolioWork,
  deletePortfolioWork,
  fetchPortfolio,
  updatePortfolioWork,
  type PendingPublishMedia,
  type PortfolioUpdate,
} from '@/publishing/publishing-api';
import { colors, radius, spacing } from '@/theme';


type EditDraft = PortfolioUpdate & { workId: number };

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(appLanguage, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export default function ManagePortfolioScreen() {
  const { request, status, user } = useAuth();
  const [works, setWorks] = useState<PortfolioWork[]>([]);
  const [loading, setLoading] = useState(true);
  const [image, setImage] = useState<PendingPublishMedia | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [style, setStyle] = useState('');
  const [bodyPlacement, setBodyPlacement] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<EditDraft | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (status !== 'authenticated' || !user?.is_verified_artist) return;
    setLoading(true);
    setError('');
    try {
      const page = await fetchPortfolio(request);
      setWorks(page.results);
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

  const pickImage = async () => {
    setError('');
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError(t('portfolioImagePermission'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [4, 5],
        mediaTypes: ['images'],
        quality: 0.92,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      setImage({
        key: `${Date.now()}-${asset.uri}`,
        uri: asset.uri,
        name: asset.fileName ?? `tatzo-portfolio-${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
        type: 'image',
      });
    } catch {
      setError(t('portfolioImagePickerError'));
    }
  };

  const clearCreateDraft = () => {
    setImage(null);
    setTitle('');
    setDescription('');
    setStyle('');
    setBodyPlacement('');
  };

  const addWork = async () => {
    if (!image) {
      setError(t('portfolioImageRequired'));
      return;
    }
    setCreating(true);
    setError('');
    try {
      const created = await createPortfolioWork(request, {
        image,
        title: title.trim(),
        description: description.trim(),
        style: style.trim(),
        bodyPlacement: bodyPlacement.trim(),
      });
      setWorks((current) => [created, ...current]);
      clearCreateDraft();
      Alert.alert(t('portfolioWorkAdded'), t('portfolioWorkAddedHint'));
    } catch (caught) {
      setError(userFacingError(caught));
    } finally {
      setCreating(false);
    }
  };

  const beginEdit = (work: PortfolioWork) => {
    setError('');
    setEditing({
      workId: work.id,
      title: work.title,
      description: work.description,
      style: work.style,
      bodyPlacement: work.body_placement,
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSavingEdit(true);
    setError('');
    try {
      const updated = await updatePortfolioWork(request, editing.workId, {
        title: editing.title.trim(),
        description: editing.description.trim(),
        style: editing.style.trim(),
        bodyPlacement: editing.bodyPlacement.trim(),
      });
      setWorks((current) => current.map((work) => (
        work.id === updated.id ? updated : work
      )));
      setEditing(null);
    } catch (caught) {
      setError(userFacingError(caught));
    } finally {
      setSavingEdit(false);
    }
  };

  const removeWork = async (work: PortfolioWork) => {
    setDeletingId(work.id);
    setError('');
    try {
      await deletePortfolioWork(request, work.id);
      setWorks((current) => current.filter((value) => value.id !== work.id));
      if (editing?.workId === work.id) setEditing(null);
    } catch (caught) {
      setError(userFacingError(caught));
    } finally {
      setDeletingId(null);
    }
  };

  const confirmDelete = (work: PortfolioWork) => {
    Alert.alert(
      t('deletePortfolioWork'),
      t('deletePortfolioWorkConfirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: () => void removeWork(work),
        },
      ],
    );
  };

  return (
    <Screen contentStyle={styles.screen}>
      <BrandHeader />
      <View style={styles.header}>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>{t('portfolioManageEyebrow')}</Text>
          <Text style={styles.title}>{t('managePortfolio')}</Text>
          <Text style={styles.subtitle}>{t('managePortfolioSubtitle')}</Text>
        </View>
        <Pressable
          accessibilityLabel={t('close')}
          onPress={() => router.back()}
          style={styles.close}
        >
          <Text style={styles.closeText}>×</Text>
        </Pressable>
      </View>

      <View style={styles.createCard}>
        <Text style={styles.cardTitle}>{t('addPortfolioWork')}</Text>
        <Text style={styles.hint}>{t('addPortfolioWorkHint')}</Text>
        {image ? (
          <View style={styles.draftPreview}>
            <Image source={{ uri: image.uri }} style={styles.draftImage} />
            <Pressable
              accessibilityLabel={t('removeMedia')}
              onPress={() => setImage(null)}
              style={styles.removeImage}
            >
              <Text style={styles.removeImageText}>×</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => void pickImage()}
            style={({ pressed }) => [styles.imagePicker, pressed && styles.pressed]}
          >
            <Text style={styles.imagePickerIcon}>＋</Text>
            <Text style={styles.imagePickerTitle}>{t('choosePortfolioImage')}</Text>
            <Text style={styles.imagePickerHint}>{t('portfolioImageHint')}</Text>
          </Pressable>
        )}
        {image ? (
          <Button label={t('chooseAnotherImage')} onPress={() => void pickImage()} variant="secondary" />
        ) : null}
        <Field label={t('portfolioWorkTitle')} maxLength={120} onChangeText={setTitle} value={title} />
        <Field label={t('portfolioWorkDescription')} maxLength={3000} multiline onChangeText={setDescription} value={description} />
        <Field label={t('portfolioWorkStyle')} maxLength={80} onChangeText={setStyle} placeholder={t('portfolioWorkStylePlaceholder')} value={style} />
        <Field label={t('portfolioBodyPlacement')} maxLength={80} onChangeText={setBodyPlacement} placeholder={t('portfolioBodyPlacementPlaceholder')} value={bodyPlacement} />
        <Button label={t('addToPortfolio')} loading={creating} onPress={() => void addWork()} />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.listHeading}>
        <Text style={styles.listTitle}>{t('portfolioWorks')}</Text>
        <Text style={styles.count}>{works.length}</Text>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.hint}>{t('portfolioLoading')}</Text>
        </View>
      ) : works.length ? works.map((work) => (
        <View key={work.id} style={styles.workCard}>
          {work.image_url ? (
            <Image source={{ uri: work.image_url }} style={styles.workImage} />
          ) : (
            <View style={styles.workImageFallback}>
              <Text style={styles.hint}>{t('imageUnavailable')}</Text>
            </View>
          )}
          {editing?.workId === work.id ? (
            <View style={styles.editForm}>
              <Field label={t('portfolioWorkTitle')} maxLength={120} onChangeText={(value) => setEditing((current) => current ? { ...current, title: value } : current)} value={editing.title} />
              <Field label={t('portfolioWorkDescription')} maxLength={3000} multiline onChangeText={(value) => setEditing((current) => current ? { ...current, description: value } : current)} value={editing.description} />
              <Field label={t('portfolioWorkStyle')} maxLength={80} onChangeText={(value) => setEditing((current) => current ? { ...current, style: value } : current)} value={editing.style} />
              <Field label={t('portfolioBodyPlacement')} maxLength={80} onChangeText={(value) => setEditing((current) => current ? { ...current, bodyPlacement: value } : current)} value={editing.bodyPlacement} />
              <Button label={t('save')} loading={savingEdit} onPress={() => void saveEdit()} />
              <Button label={t('cancel')} onPress={() => setEditing(null)} variant="secondary" />
            </View>
          ) : (
            <View style={styles.workCopy}>
              <View style={styles.workTopline}>
                <Text style={styles.workTitle}>{work.title || t('untitledWork')}</Text>
                <Text style={styles.workDate}>{formatDate(work.created_at)}</Text>
              </View>
              {work.style || work.body_placement ? (
                <Text style={styles.workMeta}>
                  {[work.style, work.body_placement].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
              {work.description ? <Text style={styles.workDescription}>{work.description}</Text> : null}
              <Button label={t('editDetails')} onPress={() => beginEdit(work)} variant="secondary" />
              <Button
                label={t('deletePortfolioWork')}
                loading={deletingId === work.id}
                onPress={() => confirmDelete(work)}
                variant="danger"
              />
            </View>
          )}
        </View>
      )) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{t('portfolioManageEmpty')}</Text>
          <Text style={styles.hint}>{t('portfolioManageEmptyHint')}</Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing.xxl },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  headingCopy: { flex: 1, gap: spacing.xs },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 30, fontWeight: '900' },
  subtitle: { color: colors.textMuted, lineHeight: 21 },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.textMuted, fontSize: 36, lineHeight: 38 },
  createCard: { backgroundColor: colors.surface, borderColor: colors.primaryMuted, borderWidth: 1, borderRadius: radius.large, padding: spacing.lg, gap: spacing.md },
  cardTitle: { color: colors.text, fontSize: 22, fontWeight: '900' },
  hint: { color: colors.textMuted, lineHeight: 20 },
  imagePicker: { minHeight: 190, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primaryMuted, borderRadius: radius.large, backgroundColor: colors.backgroundDeep, padding: spacing.lg },
  imagePickerIcon: { color: colors.primary, fontSize: 38, fontWeight: '300' },
  imagePickerTitle: { color: colors.text, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  imagePickerHint: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  draftPreview: { borderRadius: radius.large, overflow: 'hidden', backgroundColor: colors.backgroundDeep },
  draftImage: { width: '100%', aspectRatio: 4 / 5 },
  removeImage: { position: 'absolute', top: spacing.sm, right: spacing.sm, width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 10, 18, 0.88)' },
  removeImageText: { color: colors.text, fontSize: 28, lineHeight: 30 },
  error: { color: colors.danger, backgroundColor: colors.surface, borderColor: colors.danger, borderWidth: 1, borderRadius: radius.medium, padding: spacing.md, lineHeight: 20 },
  listHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  listTitle: { color: colors.text, fontSize: 24, fontWeight: '900' },
  count: { minWidth: 34, minHeight: 34, borderRadius: 17, color: colors.backgroundDeep, backgroundColor: colors.primary, textAlign: 'center', textAlignVertical: 'center', fontWeight: '900', paddingTop: 7 },
  centerState: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  workCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.large, overflow: 'hidden' },
  workImage: { width: '100%', aspectRatio: 4 / 5, backgroundColor: colors.backgroundDeep },
  workImageFallback: { minHeight: 180, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundDeep },
  workCopy: { padding: spacing.lg, gap: spacing.sm },
  workTopline: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  workTitle: { flex: 1, color: colors.text, fontSize: 19, fontWeight: '900' },
  workDate: { color: colors.textMuted, fontSize: 12 },
  workMeta: { color: colors.primary, fontWeight: '700' },
  workDescription: { color: colors.textMuted, lineHeight: 21 },
  editForm: { padding: spacing.lg, gap: spacing.md },
  emptyCard: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.large, padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  pressed: { opacity: 0.72 },
});

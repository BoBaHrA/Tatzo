import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, router } from 'expo-router';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { FeedPost } from '@/api/types';
import { useAuth } from '@/auth/auth-context';
import { BrandHeader } from '@/components/brand-header';
import { Button } from '@/components/button';
import { Checkbox } from '@/components/checkbox';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { userFacingError } from '@/errors';
import { t } from '@/i18n';
import {
  createPost,
  type PendingPublishMedia,
} from '@/publishing/publishing-api';
import { colors, radius, spacing, typography } from '@/theme';


const MAX_MEDIA = 10;
const VISIBILITY_OPTIONS: FeedPost['visibility'][] = [
  'public',
  'followers',
  'private',
];

function visibilityLabel(value: FeedPost['visibility']) {
  if (value === 'followers') return t('postVisibilityFollowers');
  if (value === 'private') return t('postVisibilityPrivate');
  return t('postVisibilityPublic');
}

export default function CreatePostScreen() {
  const { request, status } = useAuth();
  const [content, setContent] = useState('');
  const [location, setLocation] = useState('');
  const [visibility, setVisibility] = useState<FeedPost['visibility']>('public');
  const [disableComments, setDisableComments] = useState(false);
  const [media, setMedia] = useState<PendingPublishMedia[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (status === 'anonymous') return <Redirect href="/(auth)/login" />;

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/home');
  };

  const pickMedia = async () => {
    const remaining = MAX_MEDIA - media.length;
    if (remaining <= 0) {
      setError(t('postMediaLimit'));
      return;
    }
    setError('');
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError(t('postMediaPermission'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes: ['images', 'videos'],
        quality: 0.9,
        selectionLimit: remaining,
        videoMaxDuration: 60,
      });
      if (result.canceled) return;
      const selected = result.assets.slice(0, remaining).map((asset, index) => {
        const type = asset.type === 'video' ? 'video' : 'image';
        return {
          key: `${Date.now()}-${index}-${asset.uri}`,
          uri: asset.uri,
          name: asset.fileName ?? `tatzo-${Date.now()}-${index}.${type === 'video' ? 'mp4' : 'jpg'}`,
          mimeType: asset.mimeType ?? (type === 'video' ? 'video/mp4' : 'image/jpeg'),
          type,
        } satisfies PendingPublishMedia;
      });
      setMedia((current) => [...current, ...selected]);
    } catch {
      setError(t('postMediaPickerError'));
    }
  };

  const publish = async () => {
    if (!content.trim() && !media.length) {
      setError(t('postEmptyError'));
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const post = await createPost(request, {
        content: content.trim(),
        location: location.trim(),
        visibility,
        disableComments,
        media,
      });
      Alert.alert(t('postPublished'), t('postPublishedHint'), [
        {
          text: t('viewPost'),
          onPress: () => router.replace({
            pathname: '/post/[postId]',
            params: { postId: String(post.id) },
          }),
        },
      ]);
    } catch (caught) {
      setError(userFacingError(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.topRow}>
        <View style={styles.headerWrap}>
          <BrandHeader title={t('createPost')} showNotifications={false} />
        </View>
        <Pressable
          accessibilityLabel={t('close')}
          accessibilityRole="button"
          onPress={close}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
        >
          <Text style={styles.closeText}>×</Text>
        </Pressable>
      </View>

      <View style={styles.composer}>
        <Field
          label={t('postCaption')}
          maxLength={5000}
          multiline
          onChangeText={setContent}
          placeholder={t('postCaptionPlaceholder')}
          value={content}
          style={styles.captionInput}
        />

        <View style={styles.mediaToolbar}>
          <View style={styles.mediaCopy}>
            <Text style={styles.mediaTitle}>{t('postMedia')}</Text>
            <Text style={styles.mediaHint}>{media.length}/{MAX_MEDIA}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={media.length >= MAX_MEDIA}
            onPress={() => void pickMedia()}
            style={({ pressed }) => [
              styles.addMedia,
              media.length >= MAX_MEDIA && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.addMediaPlus}>+</Text>
            <Text style={styles.addMediaText}>
              {media.length ? t('addMoreMedia') : t('choosePostMedia')}
            </Text>
          </Pressable>
        </View>

        {media.length ? (
          <ScrollView
            contentContainerStyle={styles.previewRow}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {media.map((item) => (
              <View key={item.key} style={styles.previewCard}>
                {item.type === 'image' ? (
                  <Image source={{ uri: item.uri }} style={styles.previewImage} />
                ) : (
                  <View style={styles.videoPreview}>
                    <Text style={styles.videoIcon}>▶</Text>
                    <Text style={styles.videoLabel}>{t('video')}</Text>
                  </View>
                )}
                <Pressable
                  accessibilityLabel={t('removeMedia')}
                  accessibilityRole="button"
                  onPress={() => setMedia((current) => current.filter((value) => value.key !== item.key))}
                  style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
                >
                  <Text style={styles.removeText}>×</Text>
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.divider} />

        <Field
          label={t('postLocationOptional')}
          maxLength={120}
          onChangeText={setLocation}
          placeholder={t('postLocationPlaceholder')}
          value={location}
        />

        <View style={styles.optionSection}>
          <Text style={styles.optionLabel}>{t('postVisibility')}</Text>
          <View style={styles.visibilityRow}>
            {VISIBILITY_OPTIONS.map((option) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: visibility === option }}
                key={option}
                onPress={() => setVisibility(option)}
                style={({ pressed }) => [
                  styles.visibilityButton,
                  visibility === option && styles.visibilitySelected,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={visibility === option ? styles.visibilitySelectedText : styles.visibilityText}>
                  {visibilityLabel(option)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Checkbox
          checked={disableComments}
          hint={t('disableCommentsHint')}
          label={t('disableComments')}
          onChange={setDisableComments}
        />

        <View style={styles.soonRow}>
          <View style={styles.soonChip}><Text style={styles.soonText}>⌖ {t('postLocationOptional')}</Text></View>
          <View style={styles.soonChip}><Text style={styles.soonText}>≡ Poll</Text></View>
          <View style={styles.soonChip}><Text style={styles.soonText}>◷ Schedule</Text></View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.submitRow}>
          <Button
            label={t('cancel')}
            onPress={close}
            size="compact"
            variant="ghost"
          />
          <View style={styles.publishButton}>
            <Button
              label={t('publishPost')}
              loading={submitting}
              onPress={() => void publish()}
            />
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing.xxl },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  headerWrap: { flex: 1 },
  close: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: colors.textMuted, fontSize: 30, lineHeight: 32, fontWeight: '400' },
  composer: {
    backgroundColor: '#003c3c',
    borderColor: 'rgba(4, 197, 191, 0.30)',
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.md,
    gap: spacing.md,
  },
  captionInput: {
    minHeight: 120,
    backgroundColor: 'rgba(0, 9, 17, 0.42)',
  },
  mediaToolbar: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  mediaCopy: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  mediaTitle: { color: colors.text, ...typography.bodyStrong },
  mediaHint: { color: colors.textMuted, ...typography.caption },
  addMedia: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0, 9, 17, 0.32)',
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.28)',
  },
  addMediaPlus: { color: colors.primary, fontSize: 22, lineHeight: 23 },
  addMediaText: { color: colors.primary, ...typography.caption, fontWeight: '800' },
  previewRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  previewCard: { width: 104, height: 104, borderRadius: radius.medium, overflow: 'hidden' },
  previewImage: { width: '100%', height: '100%', backgroundColor: colors.backgroundDeep },
  videoPreview: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, backgroundColor: colors.backgroundDeep },
  videoIcon: { color: colors.primary, fontSize: 26 },
  videoLabel: { color: colors.textMuted, fontWeight: '700' },
  removeButton: { position: 'absolute', top: 5, right: 5, width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: 'rgba(0, 10, 18, 0.88)' },
  removeText: { color: colors.text, fontSize: 21, lineHeight: 22 },
  divider: { height: 1, backgroundColor: 'rgba(4, 197, 191, 0.18)' },
  optionSection: { gap: spacing.xs },
  optionLabel: { color: colors.textMuted, ...typography.caption, fontWeight: '700' },
  visibilityRow: { flexDirection: 'row', gap: spacing.xs },
  visibilityButton: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(4, 197, 191, 0.20)', borderRadius: radius.medium, backgroundColor: 'rgba(0, 9, 17, 0.36)', paddingHorizontal: spacing.xs },
  visibilitySelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  visibilityText: { color: colors.textMuted, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  visibilitySelectedText: { color: colors.primary, fontSize: 11, fontWeight: '900', textAlign: 'center' },
  soonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  soonChip: { minHeight: 32, justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: radius.medium, backgroundColor: 'rgba(4, 197, 191, 0.08)', borderWidth: 1, borderColor: 'rgba(4, 197, 191, 0.14)' },
  soonText: { color: colors.textSubtle, fontSize: 10, fontWeight: '700' },
  error: { color: colors.danger, lineHeight: 20 },
  submitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.sm },
  publishButton: { minWidth: 132 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
});

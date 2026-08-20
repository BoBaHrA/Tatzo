import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, router } from 'expo-router';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import type { FeedPost } from '@/api/types';
import { useAuth } from '@/auth/auth-context';
import { BrandHeader } from '@/components/brand-header';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { userFacingError } from '@/errors';
import { t } from '@/i18n';
import {
  createPost,
  type PendingPublishMedia,
} from '@/publishing/publishing-api';
import { colors, radius, spacing } from '@/theme';


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
      <BrandHeader />
      <View style={styles.header}>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>{t('createPostEyebrow')}</Text>
          <Text style={styles.title}>{t('createPost')}</Text>
          <Text style={styles.subtitle}>{t('createPostSubtitle')}</Text>
        </View>
        <Pressable accessibilityLabel={t('close')} onPress={close} style={styles.close}>
          <Text style={styles.closeText}>×</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Field
          label={t('postCaption')}
          maxLength={5000}
          multiline
          onChangeText={setContent}
          placeholder={t('postCaptionPlaceholder')}
          value={content}
        />
        <Field
          label={t('postLocationOptional')}
          maxLength={120}
          onChangeText={setLocation}
          placeholder={t('postLocationPlaceholder')}
          value={location}
        />

        <View style={styles.section}>
          <View style={styles.sectionTop}>
            <View style={styles.sectionCopy}>
              <Text style={styles.sectionTitle}>{t('postMedia')}</Text>
              <Text style={styles.hint}>{t('postMediaHint')}</Text>
            </View>
            <Text style={styles.counter}>{media.length}/{MAX_MEDIA}</Text>
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
                    style={styles.removeButton}
                  >
                    <Text style={styles.removeText}>×</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}
          <Button
            disabled={media.length >= MAX_MEDIA}
            label={media.length ? t('addMoreMedia') : t('choosePostMedia')}
            onPress={() => void pickMedia()}
            variant="secondary"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('postVisibility')}</Text>
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

        <View style={styles.switchRow}>
          <View style={styles.switchCopy}>
            <Text style={styles.switchTitle}>{t('disableComments')}</Text>
            <Text style={styles.hint}>{t('disableCommentsHint')}</Text>
          </View>
          <Switch
            accessibilityLabel={t('disableComments')}
            onValueChange={setDisableComments}
            thumbColor={disableComments ? colors.primary : colors.textMuted}
            trackColor={{ true: colors.primaryMuted }}
            value={disableComments}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          label={t('publishPost')}
          loading={submitting}
          onPress={() => void publish()}
        />
        <Button label={t('cancel')} onPress={close} variant="secondary" />
      </View>
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
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  section: { gap: spacing.sm },
  sectionTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  sectionCopy: { flex: 1, gap: 3 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  counter: { color: colors.primary, fontWeight: '800' },
  previewRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  previewCard: { width: 118, height: 118, borderRadius: radius.medium, overflow: 'hidden' },
  previewImage: { width: '100%', height: '100%', backgroundColor: colors.backgroundDeep },
  videoPreview: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, backgroundColor: colors.backgroundDeep },
  videoIcon: { color: colors.primary, fontSize: 30 },
  videoLabel: { color: colors.textMuted, fontWeight: '700' },
  removeButton: { position: 'absolute', top: 6, right: 6, width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: 'rgba(0, 10, 18, 0.88)' },
  removeText: { color: colors.text, fontSize: 24, lineHeight: 26 },
  visibilityRow: { flexDirection: 'row', gap: spacing.xs },
  visibilityButton: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.medium, backgroundColor: colors.backgroundDeep, paddingHorizontal: spacing.xs },
  visibilitySelected: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  visibilityText: { color: colors.textMuted, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  visibilitySelectedText: { color: colors.text, fontSize: 12, fontWeight: '900', textAlign: 'center' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  switchCopy: { flex: 1, gap: 3 },
  switchTitle: { color: colors.text, fontWeight: '800' },
  error: { color: colors.danger, lineHeight: 20 },
  pressed: { opacity: 0.72 },
});

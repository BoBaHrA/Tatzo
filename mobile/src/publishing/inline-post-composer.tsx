import { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  Image,
  Keyboard,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';

import type { FeedPost } from '@/api/types';
import type { AuthenticatedRequest } from '@/auth/auth-context';
import { Checkbox } from '@/components/checkbox';
import { userFacingError } from '@/errors';
import { t } from '@/i18n';
import { createPost, type PendingPublishMedia } from '@/publishing/publishing-api';
import { colors, radius, spacing, typography } from '@/theme';


const MAX_MEDIA = 10;
const VISIBILITY_OPTIONS: FeedPost['visibility'][] = ['public', 'followers', 'private'];

function visibilityLabel(value: FeedPost['visibility']) {
  if (value === 'followers') return t('postVisibilityFollowers');
  if (value === 'private') return t('postVisibilityPrivate');
  return t('postVisibilityPublic');
}

function animateLayout() {
  LayoutAnimation.configureNext({
    duration: 260,
    create: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
    update: { type: LayoutAnimation.Types.easeInEaseOut },
    delete: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
  });
}

type InlinePostComposerProps = {
  request: AuthenticatedRequest;
  onPublished: (post: FeedPost) => void;
};

export function InlinePostComposer({ request, onPublished }: InlinePostComposerProps) {
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState('');
  const [location, setLocation] = useState('');
  const [visibility, setVisibility] = useState<FeedPost['visibility']>('public');
  const [disableComments, setDisableComments] = useState(false);
  const [media, setMedia] = useState<PendingPublishMedia[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const open = () => {
    if (expanded) return;
    animateLayout();
    setExpanded(true);
  };

  const collapse = () => {
    Keyboard.dismiss();
    animateLayout();
    setExpanded(false);
  };

  const reset = () => {
    setContent('');
    setLocation('');
    setVisibility('public');
    setDisableComments(false);
    setMedia([]);
    setError('');
  };

  const cancel = () => {
    reset();
    collapse();
  };

  const pickMedia = async () => {
    open();
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
      animateLayout();
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
      onPublished(post);
      reset();
      collapse();
    } catch (caught) {
      setError(userFacingError(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.shell, expanded && styles.shellExpanded]}>
      <Pressable
        accessibilityRole="button"
        onPress={open}
        style={({ pressed }) => [styles.head, pressed && !expanded && styles.pressed]}
      >
        <TextInput
          editable={!submitting}
          maxLength={5000}
          multiline={expanded}
          onChangeText={setContent}
          onFocus={open}
          placeholder={t('postCaptionPlaceholder')}
          placeholderTextColor="#8bd2d1"
          style={[styles.input, expanded && styles.inputExpanded]}
          value={content}
        />
        <Pressable
          accessibilityLabel={media.length ? t('addMoreMedia') : t('choosePostMedia')}
          accessibilityRole="button"
          disabled={submitting}
          onPress={(event) => {
            event.stopPropagation();
            void pickMedia();
          }}
          style={({ pressed }) => [styles.plusButton, pressed && styles.pressed]}
        >
          <Text style={styles.plus}>+</Text>
        </Pressable>
        {expanded ? (
          <Pressable
            accessibilityLabel={t('close')}
            accessibilityRole="button"
            disabled={submitting}
            onPress={(event) => {
              event.stopPropagation();
              cancel();
            }}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <Text style={styles.close}>×</Text>
          </Pressable>
        ) : null}
      </Pressable>

      {expanded ? (
        <View style={styles.expandedBody}>
          {media.length ? (
            <ScrollView
              contentContainerStyle={styles.previewRow}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {media.map((item) => (
                <View key={item.key} style={styles.preview}>
                  {item.type === 'image' ? (
                    <Image source={{ uri: item.uri }} style={styles.previewImage} />
                  ) : (
                    <View style={styles.videoPreview}>
                      <Text style={styles.videoMark}>▶</Text>
                    </View>
                  )}
                  <Pressable
                    accessibilityLabel={t('removeMedia')}
                    onPress={() => {
                      animateLayout();
                      setMedia((current) => current.filter((candidate) => candidate.key !== item.key));
                    }}
                    style={styles.remove}
                  >
                    <Text style={styles.removeText}>×</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}

          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>{t('postMedia')}</Text>
            <Text style={styles.counter}>{media.length}/{MAX_MEDIA}</Text>
          </View>

          <TextInput
            editable={!submitting}
            maxLength={120}
            onChangeText={setLocation}
            placeholder={t('postLocationPlaceholder')}
            placeholderTextColor={colors.textSubtle}
            style={styles.locationInput}
            value={location}
          />

          <View style={styles.visibilityRow}>
            {VISIBILITY_OPTIONS.map((option) => {
              const selected = option === visibility;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={option}
                  onPress={() => setVisibility(option)}
                  style={({ pressed }) => [
                    styles.visibility,
                    selected && styles.visibilitySelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.visibilityText, selected && styles.visibilityTextSelected]}>
                    {visibilityLabel(option)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Checkbox
            checked={disableComments}
            hint={t('disableCommentsHint')}
            label={t('disableComments')}
            onChange={setDisableComments}
          />

          <View style={styles.soonRow}>
            <Text style={styles.soon}>⌖ {t('postLocationOptional')}</Text>
            <Text style={styles.soon}>≡ Poll</Text>
            <Text style={styles.soon}>◷ Schedule</Text>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={submitting}
              onPress={cancel}
              style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
            >
              <Text style={styles.cancelText}>{t('cancel')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={submitting}
              onPress={() => void publish()}
              style={({ pressed }) => [
                styles.publishButton,
                submitting && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.publishText}>{submitting ? t('loading') : t('publishPost')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    overflow: 'hidden',
    backgroundColor: '#005351',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.34)',
  },
  shellExpanded: {
    borderRadius: 20,
    backgroundColor: '#004744',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 5,
  },
  head: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.lg,
    paddingRight: spacing.xs,
    gap: spacing.xs,
  },
  input: {
    flex: 1,
    minHeight: 40,
    color: '#d6ffff',
    ...typography.body,
    paddingVertical: 8,
    textAlignVertical: 'center',
  },
  inputExpanded: {
    minHeight: 92,
    paddingTop: spacing.md,
    textAlignVertical: 'top',
  },
  plusButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 19,
    backgroundColor: 'rgba(0, 9, 17, 0.26)',
  },
  plus: { color: colors.primary, fontSize: 28, lineHeight: 29, fontWeight: '600' },
  closeButton: { width: 34, height: 38, alignItems: 'center', justifyContent: 'center' },
  close: { color: colors.textMuted, fontSize: 25, lineHeight: 26 },
  expandedBody: { gap: spacing.md, paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  previewRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  preview: { width: 92, height: 92, borderRadius: 12, overflow: 'hidden', position: 'relative' },
  previewImage: { width: '100%', height: '100%' },
  videoPreview: { flex: 1, backgroundColor: colors.backgroundDeep, alignItems: 'center', justifyContent: 'center' },
  videoMark: { color: colors.primary, fontSize: 24 },
  remove: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(0, 9, 17, 0.82)',
  },
  removeText: { color: colors.white, fontSize: 17, lineHeight: 18 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { color: colors.text, fontSize: 13, fontWeight: '900' },
  counter: { color: colors.textMuted, fontSize: 12 },
  locationInput: {
    minHeight: 46,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.24)',
    backgroundColor: colors.backgroundDeep,
    color: colors.text,
    paddingHorizontal: spacing.md,
  },
  visibilityRow: { flexDirection: 'row', gap: spacing.xs },
  visibility: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.backgroundDeep,
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.14)',
    paddingHorizontal: 6,
  },
  visibilitySelected: { borderColor: colors.primary, backgroundColor: 'rgba(4, 197, 191, 0.10)' },
  visibilityText: { color: colors.textMuted, fontSize: 10.5, fontWeight: '800', textAlign: 'center' },
  visibilityTextSelected: { color: colors.primary },
  soonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  soon: {
    color: colors.textSubtle,
    fontSize: 10,
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.12)',
    borderRadius: radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  error: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: spacing.sm },
  cancelButton: { minHeight: 42, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: colors.text, fontWeight: '900' },
  publishButton: {
    minHeight: 44,
    minWidth: 142,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: colors.primary,
  },
  publishText: { color: colors.black, fontWeight: '900' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.995 }] },
});

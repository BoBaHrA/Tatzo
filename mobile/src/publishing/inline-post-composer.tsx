import { useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  Animated,
  Easing,
  Image,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { FeedPost } from '@/api/types';
import type { AuthenticatedRequest } from '@/auth/auth-context';
import { Checkbox } from '@/components/checkbox';
import { userFacingError } from '@/errors';
import { appLanguage, t } from '@/i18n';
import { createPost, type PendingPublishMedia } from '@/publishing/publishing-api';
import { colors, spacing } from '@/theme';


const MAX_MEDIA = 10;
const EXPANDED_MAX_HEIGHT = 1800;
const VISIBILITY_OPTIONS: FeedPost['visibility'][] = ['public', 'followers', 'private'];

const COPY = {
  en: {
    addLocation: 'Add location',
    locationHint: 'Studio or city',
    whoCanSee: 'Who can see this',
    createPoll: 'Create poll',
    schedule: 'Schedule post',
    coauthors: 'Invite co-authors',
    additional: 'Additional options',
    later: 'Coming soon',
    photoVideo: 'Photos and videos',
    mediaLayout: 'Media layout',
    grid: 'Grid',
    carousel: 'Carousel',
    markAsAd: 'Mark as Ad',
    markAsAdHint: 'Label this post as promotional content.',
  },
  fr: {
    addLocation: 'Ajouter un lieu',
    locationHint: 'Studio ou ville',
    whoCanSee: 'Qui peut voir ceci',
    createPoll: 'Créer un sondage',
    schedule: 'Programmer la publication',
    coauthors: 'Inviter des co-auteurs',
    additional: 'Options supplémentaires',
    later: 'Bientôt disponible',
    photoVideo: 'Photos et vidéos',
    mediaLayout: 'Disposition des médias',
    grid: 'Grille',
    carousel: 'Carrousel',
    markAsAd: 'Marquer comme publicité',
    markAsAdHint: 'Identifie cette publication comme contenu promotionnel.',
  },
  ru: {
    addLocation: 'Добавить место',
    locationHint: 'Студия или город',
    whoCanSee: 'Кто увидит публикацию',
    createPoll: 'Создать опрос',
    schedule: 'Запланировать публикацию',
    coauthors: 'Пригласить соавторов',
    additional: 'Дополнительные настройки',
    later: 'Скоро',
    photoVideo: 'Фото и видео',
    mediaLayout: 'Расположение медиа',
    grid: 'Сетка',
    carousel: 'Карусель',
    markAsAd: 'Отметить как рекламу',
    markAsAdHint: 'Пометить публикацию как рекламный контент.',
  },
} as const;

function copy() {
  return COPY[appLanguage as keyof typeof COPY] ?? COPY.en;
}

function visibilityLabel(value: FeedPost['visibility']) {
  if (value === 'followers') return t('postVisibilityFollowers');
  if (value === 'private') return t('postVisibilityPrivate');
  return t('postVisibilityPublic');
}

type InlinePostComposerProps = {
  request: AuthenticatedRequest;
  onPublished: (post: FeedPost) => void;
};

export function InlinePostComposer({ request, onPublished }: InlinePostComposerProps) {
  const ui = copy();
  const progress = useRef(new Animated.Value(0)).current;
  const [expanded, setExpanded] = useState(false);
  const [renderBody, setRenderBody] = useState(false);
  const [content, setContent] = useState('');
  const [location, setLocation] = useState('');
  const [locationOpen, setLocationOpen] = useState(false);
  const [visibility, setVisibility] = useState<FeedPost['visibility']>('public');
  const [disableComments, setDisableComments] = useState(false);
  const [isAd, setIsAd] = useState(false);
  const [layout, setLayout] = useState<FeedPost['layout']>('grid');
  const [media, setMedia] = useState<PendingPublishMedia[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const animateTo = (value: 0 | 1, completion?: () => void) => {
    Animated.timing(progress, {
      toValue: value,
      duration: value ? 320 : 240,
      easing: value ? Easing.out(Easing.cubic) : Easing.inOut(Easing.quad),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) completion?.();
    });
  };

  const open = () => {
    if (expanded) return;
    setExpanded(true);
    setRenderBody(true);
    requestAnimationFrame(() => animateTo(1));
  };

  const collapse = () => {
    Keyboard.dismiss();
    animateTo(0, () => {
      setRenderBody(false);
      setExpanded(false);
    });
  };

  const reset = () => {
    setContent('');
    setLocation('');
    setLocationOpen(false);
    setVisibility('public');
    setDisableComments(false);
    setIsAd(false);
    setLayout('grid');
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
      setMedia((current) => [...current, ...selected]);
    } catch {
      setError(t('postMediaPickerError'));
    }
  };

  const cycleVisibility = () => {
    setVisibility((current) => {
      const index = VISIBILITY_OPTIONS.indexOf(current);
      return VISIBILITY_OPTIONS[(index + 1) % VISIBILITY_OPTIONS.length];
    });
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
        isAd,
        layout: media.length > 1 ? layout : 'grid',
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

  const shellMaxHeight = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [58, EXPANDED_MAX_HEIGHT],
  });
  const bodyOpacity = progress.interpolate({
    inputRange: [0, 0.18, 1],
    outputRange: [0, 0, 1],
  });
  const bodyTranslate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-12, 0],
  });

  return (
    <Animated.View
      style={[
        styles.shell,
        expanded && styles.shellExpanded,
        { maxHeight: shellMaxHeight },
      ]}
    >
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
        {renderBody ? (
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

      {renderBody ? (
        <Animated.View
          style={[
            styles.expandedBody,
            { opacity: bodyOpacity, transform: [{ translateY: bodyTranslate }] },
          ]}
        >
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
                    onPress={() => setMedia((current) => current.filter((candidate) => candidate.key !== item.key))}
                    style={styles.remove}
                  >
                    <Text style={styles.removeText}>×</Text>
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}

          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>{ui.photoVideo}</Text>
            <Text style={styles.counter}>{media.length}/{MAX_MEDIA}</Text>
          </View>

          {media.length > 1 ? (
            <View style={styles.layoutCard}>
              <Text style={styles.optionLabel}>{ui.mediaLayout}</Text>
              <View accessibilityRole="tablist" style={styles.layoutToggle}>
                {(['grid', 'carousel'] as FeedPost['layout'][]).map((value) => {
                  const selected = layout === value;
                  return (
                    <Pressable
                      accessibilityRole="tab"
                      accessibilityState={{ selected }}
                      key={value}
                      onPress={() => setLayout(value)}
                      style={[styles.layoutButton, selected && styles.layoutButtonActive]}
                    >
                      <Text style={[styles.layoutButtonText, selected && styles.layoutButtonTextActive]}>
                        {value === 'grid' ? ui.grid : ui.carousel}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <OptionRow
            label={ui.addLocation}
            detail={location || ui.locationHint}
            onPress={() => setLocationOpen((current) => !current)}
          />
          {locationOpen ? (
            <TextInput
              autoFocus
              editable={!submitting}
              maxLength={120}
              onChangeText={setLocation}
              placeholder={ui.locationHint}
              placeholderTextColor={colors.textSubtle}
              style={styles.locationInput}
              value={location}
            />
          ) : null}

          <OptionRow
            label={ui.whoCanSee}
            detail={visibilityLabel(visibility)}
            onPress={cycleVisibility}
          />

          <View style={styles.checkboxCard}>
            <Checkbox
              checked={disableComments}
              hint={t('disableCommentsHint')}
              label={t('disableComments')}
              onChange={setDisableComments}
            />
          </View>

          <View style={styles.checkboxCard}>
            <Checkbox
              checked={isAd}
              hint={ui.markAsAdHint}
              label={ui.markAsAd}
              onChange={setIsAd}
            />
          </View>

          <OptionRow label={ui.createPoll} detail={ui.later} disabled />
          <OptionRow label={ui.schedule} detail={ui.later} disabled />
          <OptionRow label={ui.coauthors} detail={ui.later} disabled />
          <OptionRow label={ui.additional} detail={ui.later} disabled />

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
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

type OptionRowProps = {
  label: string;
  detail: string;
  onPress?: () => void;
  disabled?: boolean;
};

function OptionRow({ label, detail, onPress, disabled = false }: OptionRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.optionRow, disabled && styles.optionDisabled, pressed && styles.pressed]}
    >
      <View style={styles.optionIcon}>
        <Text style={styles.optionIconText}>✦</Text>
      </View>
      <View style={styles.optionMain}>
        <Text style={styles.optionLabel}>{label}</Text>
        <Text numberOfLines={1} style={styles.optionDetail}>{detail}</Text>
      </View>
      {!disabled ? <Text style={styles.chevron}>›</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.18)',
    backgroundColor: '#002e30',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 3,
  },
  shellExpanded: {
    borderColor: 'rgba(4, 197, 191, 0.34)',
    shadowColor: colors.primary,
    shadowOpacity: 0.16,
    elevation: 5,
  },
  head: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 9,
    gap: 9,
  },
  input: {
    flex: 1,
    minHeight: 42,
    color: '#dffcff',
    fontSize: 15,
    lineHeight: 20,
    paddingVertical: 9,
    textAlignVertical: 'center',
  },
  inputExpanded: {
    minHeight: 48,
    textAlignVertical: 'top',
  },
  plusButton: {
    width: 40,
    height: 40,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.45)',
    backgroundColor: 'rgba(0, 13, 24, 0.32)',
  },
  plus: { color: colors.primary, fontSize: 29, lineHeight: 30, fontWeight: '500' },
  closeButton: {
    width: 40,
    height: 40,
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,.05)',
  },
  close: { color: colors.text, fontSize: 28, lineHeight: 30 },
  expandedBody: {
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  previewRow: { gap: 10, paddingVertical: 3 },
  preview: {
    width: 108,
    height: 108,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: colors.backgroundDeep,
  },
  previewImage: { width: '100%', height: '100%' },
  videoPreview: { flex: 1, backgroundColor: colors.backgroundDeep, alignItems: 'center', justifyContent: 'center' },
  videoMark: { color: colors.primary, fontSize: 24 },
  remove: {
    position: 'absolute', top: 6, right: 6, width: 25, height: 25,
    alignItems: 'center', justifyContent: 'center', borderRadius: 13,
    backgroundColor: 'rgba(0, 9, 17, 0.86)',
  },
  removeText: { color: colors.white, fontSize: 18, lineHeight: 19 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 },
  sectionTitle: { color: colors.text, fontSize: 13, fontWeight: '900' },
  counter: { color: colors.textMuted, fontSize: 12 },
  layoutCard: {
    width: '100%',
    gap: 9,
    padding: 12,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(4,197,191,.15)',
    backgroundColor: 'rgba(0,13,24,.46)',
  },
  layoutToggle: { flexDirection: 'row', gap: 8 },
  layoutButton: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(4,197,191,.18)',
    backgroundColor: 'rgba(4,197,191,.05)',
  },
  layoutButtonActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  layoutButtonText: { color: colors.textMuted, fontSize: 12, fontWeight: '900' },
  layoutButtonTextActive: { color: colors.black },
  optionRow: {
    width: '100%',
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.15)',
    backgroundColor: 'rgba(0,13,24,.46)',
  },
  optionDisabled: { opacity: 0.52 },
  optionIcon: {
    width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10,
    backgroundColor: 'rgba(4,197,191,.09)',
  },
  optionIconText: { color: colors.primary, fontSize: 16 },
  optionMain: { flex: 1, minWidth: 0 },
  optionLabel: { color: colors.text, fontSize: 13, fontWeight: '800' },
  optionDetail: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  chevron: { color: colors.textSubtle, fontSize: 23 },
  locationInput: {
    minHeight: 48,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.26)',
    backgroundColor: colors.backgroundDeep,
    color: colors.text,
    paddingHorizontal: 14,
  },
  checkboxCard: {
    width: '100%',
    minHeight: 58,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(4,197,191,.15)',
    backgroundColor: 'rgba(0,13,24,.46)',
  },
  error: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  cancelButton: { minHeight: 48, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: colors.text, fontWeight: '900' },
  publishButton: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: colors.primary,
  },
  publishText: { color: colors.black, fontWeight: '900' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.74, transform: [{ scale: 0.99 }] },
});

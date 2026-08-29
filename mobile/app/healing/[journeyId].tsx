import { useCallback, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  Redirect,
  router,
  useFocusEffect,
  useLocalSearchParams,
} from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type {
  HealingAchievements,
  HealingCheckIn,
  HealingDetail,
  HealingTaskSlug,
} from '@/api/types';
import { useAuth } from '@/auth/auth-context';
import { startChat } from '@/chat/chat-api';
import { useChat } from '@/chat/chat-context';
import { BrandHeader } from '@/components/brand-header';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { userFacingError } from '@/errors';
import { HEALING_ACHIEVEMENT_ICONS } from '@/healing/achievement-icons';
import {
  fetchHealingDetail,
  markHealingJourneyHealed,
  setHealingTask,
  uploadHealingCheckIn,
  type PendingHealingPhoto,
} from '@/healing/healing-api';
import { appLanguage, t } from '@/i18n';
import { colors, radius, spacing } from '@/theme';


function formatDate(value: string) {
  return new Intl.DateTimeFormat(appLanguage, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T12:00:00`));
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function Achievement({
  achievementKey,
  label,
  unlocked,
  unlockedLabel,
  lockedLabel,
}: {
  achievementKey: keyof HealingAchievements;
  label: string;
  unlocked: boolean;
  unlockedLabel: string;
  lockedLabel: string;
}) {
  return (
    <View style={[styles.achievement, unlocked && styles.achievementUnlocked]}>
      <View style={[styles.achievementIconShell, unlocked && styles.achievementIconShellUnlocked]}>
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="contain"
          source={HEALING_ACHIEVEMENT_ICONS[achievementKey]}
          style={[styles.achievementIcon, unlocked && styles.achievementIconUnlocked]}
        />
      </View>
      <Text style={styles.achievementTitle}>{label}</Text>
      <Text style={[styles.achievementState, unlocked && styles.achievementStateUnlocked]}>
        {unlocked ? unlockedLabel : lockedLabel}
      </Text>
    </View>
  );
}

function CheckInGallery({
  checkins,
  selected,
  selectedId,
  onSelect,
  copy,
  symptomLabels,
}: {
  checkins: HealingCheckIn[];
  selected: HealingCheckIn | null;
  selectedId: number | null;
  onSelect: (id: number) => void;
  copy: Record<string, string>;
  symptomLabels: Map<string, string>;
}) {
  if (!checkins.length || !selected) {
    return (
      <View style={styles.photoEmpty}>
        <Text style={styles.photoEmptyIcon}>⌑</Text>
        <Text style={styles.muted}>{copy.no_photos}</Text>
      </View>
    );
  }
  return (
    <>
      <Image
        accessibilityLabel={`${copy.day} ${selected.day_number}`}
        resizeMode="cover"
        source={{ uri: selected.url }}
        style={styles.mainPhoto}
      />
      <View style={styles.photoCaption}>
        <Text style={styles.photoDay}>{copy.day} {selected.day_number}</Text>
        {selected.note ? <Text style={styles.photoNote}>{selected.note}</Text> : null}
        {selected.symptoms.length ? (
          <View style={styles.tagWrap}>
            {selected.symptoms.map((symptom) => (
              <View key={symptom} style={styles.smallTag}>
                <Text style={styles.smallTagText}>{symptomLabels.get(symptom) ?? symptom}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      <ScrollView
        contentContainerStyle={styles.photoTabs}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {checkins.map((checkin) => (
          <Pressable
            accessibilityRole="button"
            key={checkin.id}
            onPress={() => onSelect(checkin.id)}
            style={[
              styles.photoTab,
              selectedId === checkin.id && styles.photoTabSelected,
            ]}
          >
            <Image source={{ uri: checkin.url }} style={styles.photoThumb} />
            <Text style={styles.photoTabText}>{copy.day} {checkin.day_number}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </>
  );
}

export default function HealingDetailScreen() {
  const params = useLocalSearchParams<{ journeyId?: string | string[] }>();
  const rawJourneyId = Array.isArray(params.journeyId)
    ? params.journeyId[0]
    : params.journeyId;
  const journeyId = String(rawJourneyId ?? '');
  const { request, status } = useAuth();
  const { refresh: refreshChats } = useChat();
  const [detail, setDetail] = useState<HealingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedStage, setSelectedStage] = useState('');
  const [selectedCheckinId, setSelectedCheckinId] = useState<number | null>(null);
  const [taskUpdating, setTaskUpdating] = useState<HealingTaskSlug | 'all' | null>(null);
  const [photo, setPhoto] = useState<PendingHealingPhoto | null>(null);
  const [note, setNote] = useState('');
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);

  const applyDetail = useCallback((next: HealingDetail) => {
    setDetail(next);
    setSelectedStage((current) => (
      next.timeline.items.some((item) => item.key === current)
        ? current
        : next.timeline.current
    ));
    setSelectedCheckinId((current) => (
      next.checkins.some((checkin) => checkin.id === current)
        ? current
        : (next.checkins.at(-1)?.id ?? null)
    ));
  }, []);

  const load = useCallback(async () => {
    if (status !== 'authenticated') return;
    if (!journeyId) {
      setLoading(false);
      setError(t('healingUnavailable'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      applyDetail(await fetchHealingDetail(request, journeyId));
    } catch (caught) {
      setDetail(null);
      setError(userFacingError(caught));
    } finally {
      setLoading(false);
    }
  }, [applyDetail, journeyId, request, status]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const selectedTimeline = useMemo(
    () => detail?.timeline.items.find((item) => item.key === selectedStage)
      ?? detail?.timeline.items.find((item) => item.active)
      ?? null,
    [detail, selectedStage],
  );
  const selectedCheckin = useMemo(
    () => detail?.checkins.find((checkin) => checkin.id === selectedCheckinId)
      ?? detail?.checkins.at(-1)
      ?? null,
    [detail, selectedCheckinId],
  );
  const symptomLabels = useMemo(
    () => new Map(detail?.symptom_options.map((item) => [item.slug, item.label]) ?? []),
    [detail],
  );

  if (status === 'anonymous') return <Redirect href="/(auth)/login" />;

  const changeTask = async (taskSlug: HealingTaskSlug, completed: boolean) => {
    if (!detail?.can_edit || taskUpdating) return;
    setTaskUpdating(taskSlug);
    setError('');
    setSuccess('');
    try {
      const response = await setHealingTask(request, journeyId, taskSlug, completed);
      setDetail((current) => current ? {
        ...current,
        routine_done_count: response.done_count,
        tasks: current.tasks.map((task) => (
          task.slug === taskSlug ? { ...task, completed: response.completed } : task
        )),
      } : current);
      setSuccess(detail.copy.task_saved);
    } catch (caught) {
      setError(userFacingError(caught));
    } finally {
      setTaskUpdating(null);
    }
  };

  const completeRoutine = async () => {
    if (!detail?.can_edit || taskUpdating) return;
    const remaining = detail.tasks.filter((task) => !task.completed);
    if (!remaining.length) return;
    setTaskUpdating('all');
    setError('');
    setSuccess('');
    try {
      for (const task of remaining) {
        await setHealingTask(request, journeyId, task.slug, true);
      }
      applyDetail(await fetchHealingDetail(request, journeyId));
      setSuccess(detail.copy.routine_complete);
    } catch (caught) {
      setError(userFacingError(caught));
    } finally {
      setTaskUpdating(null);
    }
  };

  const pickPhoto = async () => {
    setError('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(t('healingPhotoPickerError'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    setPhoto({
      uri: asset.uri,
      name: asset.fileName ?? `tatzo-healing-${Date.now()}.jpg`,
      mimeType: asset.mimeType ?? 'image/jpeg',
    });
  };

  const toggleSymptom = (slug: string) => {
    setSymptoms((current) => (
      current.includes(slug)
        ? current.filter((item) => item !== slug)
        : [...current, slug]
    ));
  };

  const saveCheckIn = async () => {
    if (!detail?.can_edit || uploading) return;
    if (!photo) {
      setError(t('healingPhotoPickerError'));
      return;
    }
    setUploading(true);
    setError('');
    setSuccess('');
    try {
      const next = await uploadHealingCheckIn(
        request,
        journeyId,
        photo,
        note,
        symptoms,
      );
      applyDetail(next);
      setPhoto(null);
      setNote('');
      setSymptoms([]);
      setSuccess(next.copy.photo_saved);
    } catch (caught) {
      setError(userFacingError(caught));
    } finally {
      setUploading(false);
    }
  };

  const openChat = async () => {
    if (!detail || openingChat) return;
    setOpeningChat(true);
    setError('');
    try {
      const thread = await startChat(request, detail.other_user.username);
      void refreshChats();
      router.push({
        pathname: '/chat/[threadId]',
        params: {
          threadId: String(thread.id),
          healingJourneyId: detail.id,
        },
      });
    } catch (caught) {
      setError(userFacingError(caught));
    } finally {
      setOpeningChat(false);
    }
  };

  const confirmHealed = () => {
    if (!detail?.can_edit || finishing) return;
    Alert.alert(
      detail.copy.confirm_healed_title,
      detail.copy.confirm_healed_body,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: detail.copy.mark_healed,
          onPress: async () => {
            setFinishing(true);
            setError('');
            setSuccess('');
            try {
              const next = await markHealingJourneyHealed(request, journeyId);
              applyDetail(next);
              setSuccess(next.copy.journey_healed);
            } catch (caught) {
              setError(userFacingError(caught));
            } finally {
              setFinishing(false);
            }
          },
        },
      ],
    );
  };

  const copy = detail?.copy;
  const achievements: [keyof HealingAchievements, string][] = detail && copy ? [
    ['first_checkin', copy.first_checkin],
    ['seven_day_streak', copy.seven_day_streak],
    ['three_checkins', copy.three_checkins],
    ['fully_healed', copy.fully_healed],
  ] : [];

  return (
    <Screen contentStyle={styles.screen}>
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/healing'))}
        style={styles.backButton}
      >
        <Text style={styles.backText}>‹ {t('back')}</Text>
      </Pressable>
      <BrandHeader />
      {loading || status === 'loading' ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.muted}>{t('healingLoading')}</Text>
        </View>
      ) : !detail || !copy ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>{t('healingUnavailable')}</Text>
          <Text style={styles.muted}>{error}</Text>
          <Button label={t('retry')} onPress={() => void load()} />
        </View>
      ) : (
        <>
          <View style={styles.hero}>
            {detail.latest_photo_url ? (
              <Image source={{ uri: detail.latest_photo_url }} style={styles.heroImage} />
            ) : null}
            <View style={styles.heroShade} />
            <View style={styles.heroContent}>
              <View style={styles.heroTop}>
                <View style={styles.heroHeading}>
                  <Text style={styles.eyebrow}>{copy.current_stage}</Text>
                  <Text style={styles.heroDay}>{copy.day} {detail.current_day}</Text>
                </View>
                <View style={[
                  styles.statusPill,
                  detail.status === 'healed' && styles.statusPillHealed,
                ]}>
                  <Text style={styles.statusText}>
                    {detail.status === 'healed' ? copy.healed : copy.active}
                  </Text>
                </View>
              </View>
              <View style={styles.heroBottom}>
                <View style={styles.heroIdentity}>
                  <Text numberOfLines={2} style={styles.title}>{detail.title}</Text>
                  <Text style={styles.heroMeta}>
                    {formatDate(detail.started_on)} · @{detail.other_user.username}
                  </Text>
                </View>
                <View style={styles.progressBadge}>
                  <Text style={styles.progressDay}>{detail.current_day}</Text>
                  <Text style={styles.progressTotal}>/ 30</Text>
                </View>
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[styles.progressValue, { width: `${detail.tracking_percent}%` }]}
                />
              </View>
              <Text style={styles.trackingLabel}>{copy.tracking_window}</Text>
            </View>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {success ? <Text style={styles.success}>{success}</Text> : null}

          <View style={styles.card}>
            <Text style={styles.eyebrow}>{copy.timeline_eyebrow}</Text>
            <Text style={styles.sectionTitle}>{copy.timeline_title}</Text>
            <ScrollView
              contentContainerStyle={styles.timelineTabs}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {detail.timeline.items.map((item) => (
                <Pressable
                  key={item.key}
                  onPress={() => setSelectedStage(item.key)}
                  style={[
                    styles.timelineTab,
                    selectedTimeline?.key === item.key && styles.timelineTabActive,
                  ]}
                >
                  <Text style={[
                    styles.timelineTabText,
                    selectedTimeline?.key === item.key && styles.timelineTabTextActive,
                  ]}>
                    {item.day ? `${copy.day} ${item.day}` : '✓'}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            {selectedTimeline ? (
              <View style={styles.timelineCopy}>
                <Text style={styles.timelinePhase}>{selectedTimeline.phase}</Text>
                <Text style={styles.timelineHeading}>{selectedTimeline.heading}</Text>
                <Text style={styles.body}>{selectedTimeline.body}</Text>
                <View style={styles.tagWrap}>
                  {selectedTimeline.tags.map((tag) => (
                    <View key={tag} style={styles.smallTag}>
                      <Text style={styles.smallTagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHeadingRow}>
              <View style={styles.sectionHeadingText}>
                <Text style={[styles.eyebrow, styles.pink]}>{copy.today_eyebrow}</Text>
                <Text style={styles.sectionTitle}>{copy.today_title}</Text>
              </View>
              <Text style={styles.counter}>
                {detail.routine_done_count}/{detail.routine_total}
              </Text>
            </View>
            {detail.tasks.map((task) => (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: task.completed, disabled: !detail.can_edit }}
                disabled={!detail.can_edit || Boolean(taskUpdating)}
                key={task.slug}
                onPress={() => void changeTask(task.slug, !task.completed)}
                style={({ pressed }) => [
                  styles.task,
                  task.completed && styles.taskComplete,
                  pressed && styles.pressed,
                ]}
              >
                <View style={[styles.taskCheck, task.completed && styles.taskCheckComplete]}>
                  {taskUpdating === task.slug ? (
                    <ActivityIndicator color={colors.backgroundDeep} size="small" />
                  ) : (
                    <Text style={styles.taskCheckText}>{task.completed ? '✓' : ''}</Text>
                  )}
                </View>
                <Text style={[styles.taskLabel, task.completed && styles.taskLabelComplete]}>
                  {task.label}
                </Text>
              </Pressable>
            ))}
            {detail.can_edit && detail.routine_done_count < detail.routine_total ? (
              <Button
                label={copy.mark_remaining}
                loading={taskUpdating === 'all'}
                onPress={() => void completeRoutine()}
                variant="secondary"
              />
            ) : null}
            {detail.routine_done_count === detail.routine_total ? (
              <Text style={styles.completeText}>✓ {copy.routine_complete}</Text>
            ) : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.eyebrow}>{copy.photo_eyebrow}</Text>
            <Text style={styles.sectionTitle}>{copy.photo_title}</Text>
            <CheckInGallery
              checkins={detail.checkins}
              copy={copy}
              onSelect={setSelectedCheckinId}
              selected={selectedCheckin}
              selectedId={selectedCheckinId}
              symptomLabels={symptomLabels}
            />
          </View>

          {detail.can_edit ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>{copy.upload_photo}</Text>
              {photo ? (
                <Image source={{ uri: photo.uri }} style={styles.draftPhoto} />
              ) : null}
              <Button
                label={photo ? copy.replace_photo : copy.upload_photo}
                onPress={() => void pickPhoto()}
                variant="secondary"
              />
              <TextInput
                maxLength={1000}
                multiline
                onChangeText={setNote}
                placeholder={copy.note_placeholder}
                placeholderTextColor={colors.textMuted}
                style={styles.textarea}
                textAlignVertical="top"
                value={note}
              />
              <Text style={styles.fieldTitle}>{copy.symptoms_title}</Text>
              <Text style={styles.help}>{copy.symptoms_hint}</Text>
              <View style={styles.symptomGrid}>
                {detail.symptom_options.map((option) => {
                  const selected = symptoms.includes(option.slug);
                  return (
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      key={option.slug}
                      onPress={() => toggleSymptom(option.slug)}
                      style={[styles.symptom, selected && styles.symptomSelected]}
                    >
                      <Text style={[styles.symptomText, selected && styles.symptomTextSelected]}>
                        {selected ? '✓ ' : ''}{option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Button
                disabled={!photo}
                label={copy.save_photo}
                loading={uploading}
                onPress={() => void saveCheckIn()}
              />
            </View>
          ) : null}

          <View style={styles.guidanceGrid}>
            <View style={[styles.guidanceCard, styles.careCard]}>
              <Text style={styles.eyebrow}>{copy.care_eyebrow}</Text>
              <Text style={styles.guidanceTitle}>{copy.care_title}</Text>
              <Text style={styles.body}>{copy.care_copy}</Text>
              <Text style={styles.careTip}>✓ {copy.care_tip}</Text>
            </View>
            <View style={[styles.guidanceCard, styles.warningCard]}>
              <Text style={[styles.eyebrow, styles.warning]}>{copy.signals_eyebrow}</Text>
              <Text style={styles.guidanceTitle}>{copy.signals_title}</Text>
              <Text style={styles.warningText}>↗ {copy.signals_one}</Text>
              <Text style={styles.warningText}>+ {copy.signals_two}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.eyebrow}>{copy.stats_eyebrow}</Text>
            <Text style={styles.sectionTitle}>{copy.stats_title}</Text>
            <View style={styles.metricsGrid}>
              <Metric label={copy.current_day} value={detail.current_day} />
              <Metric label={copy.days_remaining} value={detail.days_remaining} />
              <Metric label={copy.checkins} value={detail.checkin_count} />
              <Metric label={copy.routine_streak} value={detail.routine_streak} />
              <Metric label={copy.artist_responses} value={detail.artist_reply_count} />
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.eyebrow}>
              {detail.role === 'artist' ? copy.client_eyebrow : copy.artist_eyebrow}
            </Text>
            <Text style={styles.sectionTitle}>
              {detail.role === 'artist' ? copy.client_title : copy.artist_title}
            </Text>
            <View style={styles.personRow}>
              {detail.other_user.profile_image_url ? (
                <Image source={{ uri: detail.other_user.profile_image_url }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarLetter}>
                    {detail.other_user.username[0]?.toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.personText}>
                <Text style={styles.personName}>{detail.other_user.username}</Text>
                <Text style={styles.personTag}>
                  @{detail.other_user.tag ?? detail.other_user.username}
                </Text>
              </View>
            </View>
            <Button
              label={detail.role === 'artist' ? copy.message_client : copy.message_artist}
              loading={openingChat}
              onPress={() => void openChat()}
            />
          </View>

          <View style={styles.card}>
            <Text style={[styles.eyebrow, styles.warning]}>{copy.achievements_eyebrow}</Text>
            <Text style={styles.sectionTitle}>{copy.achievements_title}</Text>
            <View style={styles.achievementsGrid}>
              {achievements.map(([key, label]) => (
                <Achievement
                  achievementKey={key}
                  key={key}
                  label={label}
                  lockedLabel={copy.locked}
                  unlocked={detail.achievements[key]}
                  unlockedLabel={copy.unlocked}
                />
              ))}
            </View>
            {detail.can_edit ? (
              <Button
                label={copy.mark_healed}
                loading={finishing}
                onPress={confirmHealed}
                variant="secondary"
              />
            ) : null}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  backButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  backText: { color: colors.primary, fontSize: 16, fontWeight: '800' },
  centerState: {
    minHeight: 360, alignItems: 'center', justifyContent: 'center', gap: spacing.md,
  },
  muted: { color: colors.textMuted, lineHeight: 21, textAlign: 'center' },
  stateCard: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.large, padding: spacing.xl, gap: spacing.md,
  },
  stateTitle: { color: colors.text, fontSize: 23, fontWeight: '900', textAlign: 'center' },
  hero: {
    minHeight: 300, backgroundColor: colors.surface, borderColor: colors.primaryMuted,
    borderWidth: 1, borderRadius: radius.large, overflow: 'hidden', position: 'relative',
  },
  heroImage: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    width: '100%', height: '100%',
  },
  heroShade: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    backgroundColor: 'rgba(0, 10, 18, 0.68)',
  },
  heroContent: {
    flex: 1, minHeight: 300, padding: spacing.lg, justifyContent: 'space-between', gap: spacing.md,
  },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  heroHeading: { gap: spacing.xs },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 1.8 },
  pink: { color: colors.accent },
  warning: { color: '#f2c14e' },
  heroDay: { color: colors.text, fontSize: 32, fontWeight: '900' },
  statusPill: {
    backgroundColor: colors.primaryMuted, borderRadius: radius.pill,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  statusPillHealed: { backgroundColor: '#245241' },
  statusText: { color: colors.text, fontSize: 11, fontWeight: '900' },
  heroBottom: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md, marginTop: 'auto' },
  heroIdentity: { flex: 1, gap: spacing.xs },
  title: { color: colors.text, fontSize: 24, lineHeight: 29, fontWeight: '900' },
  heroMeta: { color: colors.textMuted, fontSize: 12 },
  progressBadge: {
    width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: colors.primary,
    backgroundColor: 'rgba(0, 13, 24, 0.8)', alignItems: 'center', justifyContent: 'center',
  },
  progressDay: { color: colors.text, fontSize: 22, fontWeight: '900' },
  progressTotal: { color: colors.textMuted, fontSize: 10 },
  progressTrack: {
    height: 7, borderRadius: radius.pill, overflow: 'hidden',
    backgroundColor: 'rgba(143, 174, 180, 0.25)',
  },
  progressValue: { height: '100%', backgroundColor: colors.primary },
  trackingLabel: { color: colors.textMuted, fontSize: 11 },
  card: {
    backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.large, padding: spacing.md, gap: spacing.md,
  },
  sectionTitle: { color: colors.text, fontSize: 21, lineHeight: 26, fontWeight: '900' },
  body: { color: colors.textMuted, lineHeight: 21 },
  timelineTabs: { gap: spacing.sm },
  timelineTab: {
    borderColor: colors.border, borderWidth: 1, borderRadius: radius.pill,
    backgroundColor: colors.backgroundDeep, paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  timelineTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  timelineTabText: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
  timelineTabTextActive: { color: colors.backgroundDeep },
  timelineCopy: {
    backgroundColor: colors.backgroundDeep, borderRadius: radius.medium,
    borderColor: colors.border, borderWidth: 1, padding: spacing.md, gap: spacing.sm,
  },
  timelinePhase: { color: colors.primary, fontSize: 12, fontWeight: '900' },
  timelineHeading: { color: colors.text, fontSize: 18, fontWeight: '900', lineHeight: 23 },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  smallTag: {
    backgroundColor: colors.surfaceRaised, borderRadius: radius.pill,
    paddingVertical: 5, paddingHorizontal: spacing.sm,
  },
  smallTagText: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  sectionHeadingText: { flex: 1, gap: spacing.xs },
  counter: { color: colors.primary, fontSize: 18, fontWeight: '900' },
  task: {
    minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.backgroundDeep, borderColor: colors.border, borderWidth: 1,
    borderRadius: radius.medium, padding: spacing.sm,
  },
  taskComplete: { borderColor: colors.primaryMuted },
  taskCheck: {
    width: 28, height: 28, borderRadius: 9, borderColor: colors.primary, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  taskCheckComplete: { backgroundColor: colors.primary },
  taskCheckText: { color: colors.backgroundDeep, fontWeight: '900' },
  taskLabel: { flex: 1, color: colors.text, fontWeight: '800', lineHeight: 20 },
  taskLabelComplete: { color: colors.textMuted },
  completeText: { color: colors.success, textAlign: 'center', fontWeight: '900' },
  photoEmpty: {
    minHeight: 180, backgroundColor: colors.backgroundDeep, borderRadius: radius.medium,
    alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.sm,
  },
  photoEmptyIcon: { color: colors.primary, fontSize: 38 },
  mainPhoto: { width: '100%', aspectRatio: 1, borderRadius: radius.medium },
  photoCaption: {
    backgroundColor: colors.backgroundDeep, borderRadius: radius.medium,
    padding: spacing.sm, gap: spacing.xs,
  },
  photoDay: { color: colors.primary, fontWeight: '900' },
  photoNote: { color: colors.text, lineHeight: 20 },
  photoTabs: { gap: spacing.sm },
  photoTab: {
    width: 86, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.medium, overflow: 'hidden', backgroundColor: colors.backgroundDeep,
  },
  photoTabSelected: { borderColor: colors.primary },
  photoThumb: { width: '100%', height: 66 },
  photoTabText: { color: colors.textMuted, fontSize: 10, padding: spacing.xs, fontWeight: '800' },
  draftPhoto: { width: '100%', aspectRatio: 1.4, borderRadius: radius.medium },
  textarea: {
    minHeight: 112, color: colors.text, backgroundColor: colors.backgroundDeep,
    borderColor: colors.border, borderWidth: 1, borderRadius: radius.medium,
    padding: spacing.md, fontSize: 15,
  },
  fieldTitle: { color: colors.text, fontWeight: '900' },
  help: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  symptomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  symptom: {
    borderColor: colors.border, borderWidth: 1, borderRadius: radius.pill,
    backgroundColor: colors.backgroundDeep, paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  symptomSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  symptomText: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
  symptomTextSelected: { color: colors.backgroundDeep },
  guidanceGrid: { gap: spacing.md },
  guidanceCard: { borderRadius: radius.large, padding: spacing.lg, gap: spacing.sm },
  careCard: { backgroundColor: '#062c35', borderColor: colors.primaryMuted, borderWidth: 1 },
  warningCard: { backgroundColor: '#2a2011', borderColor: '#8f6c23', borderWidth: 1 },
  guidanceTitle: { color: colors.text, fontSize: 19, fontWeight: '900', lineHeight: 24 },
  careTip: {
    color: colors.text, backgroundColor: colors.backgroundDeep,
    borderRadius: radius.medium, padding: spacing.sm, lineHeight: 20,
  },
  warningText: { color: colors.text, lineHeight: 20 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  metric: {
    width: '47%', flexGrow: 1, minHeight: 96, backgroundColor: colors.backgroundDeep,
    borderRadius: radius.medium, borderColor: colors.border, borderWidth: 1,
    padding: spacing.md, justifyContent: 'center', gap: spacing.xs,
  },
  metricValue: { color: colors.primary, fontSize: 26, fontWeight: '900' },
  metricLabel: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  avatarFallback: {
    width: 64, height: 64, borderRadius: 32, alignItems: 'center',
    justifyContent: 'center', backgroundColor: colors.primary,
  },
  avatarLetter: { color: colors.backgroundDeep, fontSize: 24, fontWeight: '900' },
  personText: { flex: 1, gap: 3 },
  personName: { color: colors.text, fontSize: 19, fontWeight: '900' },
  personTag: { color: colors.primary, fontWeight: '700' },
  achievementsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  achievement: {
    width: '47%', flexGrow: 1, minHeight: 140, backgroundColor: colors.backgroundDeep,
    borderColor: colors.border, borderWidth: 1, borderRadius: radius.medium,
    padding: spacing.md, gap: spacing.sm,
  },
  achievementUnlocked: { borderColor: colors.primaryMuted },
  achievementIconShell: {
    width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(114,132,139,.10)', borderWidth: 1, borderColor: 'rgba(114,132,139,.20)',
  },
  achievementIconShellUnlocked: {
    backgroundColor: 'rgba(4,197,191,.10)', borderColor: 'rgba(4,197,191,.28)',
  },
  achievementIcon: { width: 25, height: 25, tintColor: '#72848b' },
  achievementIconUnlocked: { tintColor: colors.primary },
  achievementTitle: { color: colors.text, fontWeight: '900', lineHeight: 19 },
  achievementState: { color: colors.textMuted, fontSize: 11, marginTop: 'auto' },
  achievementStateUnlocked: { color: colors.success },
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

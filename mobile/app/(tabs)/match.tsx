import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type {
  StyleMatchCard,
  StyleMatchReaction,
  StyleMatchResult as StyleMatchResultData,
  StyleMatchSession,
} from '@/api/types';
import { useAuth } from '@/auth/auth-context';
import { BrandHeader } from '@/components/brand-header';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { t } from '@/i18n';
import {
  fetchStyleMatchOverview,
  fetchStyleMatchResult,
  reactToStyleMatch,
  startStyleMatch,
} from '@/style-match/style-match-api';
import { StyleMatchResult } from '@/style-match/style-match-result';
import { colors, radius, shadow, spacing, typography } from '@/theme';


type MatchMode = 'intro' | 'quiz' | 'result';
type BusyAction = StyleMatchReaction | 'save' | '';

export default function MatchScreen() {
  const { request, status } = useAuth();
  const [mode, setMode] = useState<MatchMode>('intro');
  const [session, setSession] = useState<StyleMatchSession | null>(null);
  const [latestResult, setLatestResult] = useState<StyleMatchResultData | null>(null);
  const [result, setResult] = useState<StyleMatchResultData | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [busyAction, setBusyAction] = useState<BusyAction>('');
  const [imageLoading, setImageLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const loadOverview = useCallback(async () => {
    if (status !== 'authenticated') return;
    setLoading(true);
    setError('');
    try {
      const overview = await fetchStyleMatchOverview(request);
      setLatestResult(overview.latest_result);
      if (overview.active_session) {
        setSession(overview.active_session);
        setMode('quiz');
      } else {
        setSession(null);
        setMode('intro');
      }
    } catch {
      setError(t('styleMatchError'));
    } finally {
      setLoading(false);
    }
  }, [request, status]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const currentCard = session?.cards[session.current_index] ?? null;

  useEffect(() => {
    if (currentCard) setImageLoading(true);
  }, [currentCard?.id]);

  const beginMatch = async () => {
    setStarting(true);
    setError('');
    setNotice('');
    try {
      const started = await startStyleMatch(request);
      setSession(started);
      setResult(null);
      setMode('quiz');
    } catch {
      setError(t('styleMatchError'));
    } finally {
      setStarting(false);
    }
  };

  const mergeCards = (current: StyleMatchCard[], added: StyleMatchCard[]) => {
    const known = new Set(current.map((card) => card.id));
    return [...current, ...added.filter((card) => !known.has(card.id))];
  };

  const react = async (reaction: StyleMatchReaction) => {
    if (!session || !currentCard || busyAction) return;
    setBusyAction(reaction);
    setError('');
    try {
      const response = await reactToStyleMatch(
        request,
        session.session_id,
        currentCard.id,
        reaction,
      );
      if (response.completed) {
        const completedResult = response.result
          ?? await fetchStyleMatchResult(request, session.session_id);
        setResult(completedResult);
        setLatestResult(completedResult);
        setSession(null);
        setNotice('');
        setMode('result');
        return;
      }

      setSession((current) => current ? {
        ...current,
        current_index: response.current_index,
        total: response.total,
        current_saved: false,
        cards: mergeCards(current.cards, response.cards ?? []),
      } : current);
      setNotice(response.clarification ? t('styleMatchClarifying') : '');
    } catch {
      setError(t('styleMatchError'));
    } finally {
      setBusyAction('');
    }
  };

  const toggleSaved = async () => {
    if (!session || !currentCard || busyAction) return;
    const nextSaved = !session.current_saved;
    setBusyAction('save');
    setError('');
    try {
      const response = await reactToStyleMatch(
        request,
        session.session_id,
        currentCard.id,
        'save',
        nextSaved,
      );
      setSession((current) => current ? {
        ...current,
        current_saved: response.saved ?? nextSaved,
      } : current);
    } catch {
      setError(t('styleMatchError'));
    } finally {
      setBusyAction('');
    }
  };

  if (loading || status === 'loading') {
    return (
      <Screen contentStyle={styles.loadingScreen}>
        <BrandHeader title={t('styleMatch')} />
        <View style={styles.loadingOrb}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
        <Text style={styles.mutedCentered}>{t('styleMatchLoading')}</Text>
      </Screen>
    );
  }

  if (mode === 'result' && result) {
    return (
      <Screen contentStyle={styles.screen}>
        <BrandHeader title={t('styleMatch')} />
        <StyleMatchResult
          onRestart={() => void beginMatch()}
          restarting={starting}
          result={result}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </Screen>
    );
  }

  if (mode === 'quiz' && session) {
    const progress = Math.round(((session.current_index + 1) / Math.max(1, session.total)) * 100);
    return (
      <Screen contentStyle={styles.quizScreen} key={currentCard?.id ?? 'match'}>
        <View style={styles.quizHeading}>
          <View style={styles.quizCopy}>
            <Text style={styles.eyebrow}>{t('styleMatchEyebrow')}</Text>
            <Text style={styles.quizTitle}>{t('styleMatchQuestion')}</Text>
          </View>
          <Text style={styles.progressCount}>
            {Math.min(session.current_index + 1, session.total)} / {session.total}
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        {currentCard ? (
          <>
            <View style={styles.deckFrame}>
              <View style={styles.deckBackTwo} />
              <View style={styles.deckBackOne} />
              <View style={styles.imageCard}>
                <Image
                  accessibilityLabel={currentCard.alt}
                  key={currentCard.id}
                  onLoadEnd={() => setImageLoading(false)}
                  onLoadStart={() => setImageLoading(true)}
                  resizeMode="cover"
                  source={{ uri: currentCard.image_url }}
                  style={styles.matchImage}
                />
                {imageLoading ? (
                  <View style={styles.imageLoader}>
                    <ActivityIndicator color={colors.primary} size="large" />
                  </View>
                ) : null}
                <Pressable
                  accessibilityLabel={session.current_saved ? t('styleMatchSaved') : t('styleMatchSave')}
                  accessibilityRole="button"
                  accessibilityState={{ selected: session.current_saved }}
                  disabled={Boolean(busyAction)}
                  onPress={() => void toggleSaved()}
                  style={({ pressed }) => [
                    styles.saveButton,
                    session.current_saved && styles.saveButtonActive,
                    pressed && styles.pressed,
                  ]}
                >
                  {busyAction === 'save' ? (
                    <ActivityIndicator color={colors.text} size="small" />
                  ) : (
                    <Text style={styles.saveSymbol}>{session.current_saved ? '♥' : '♡'}</Text>
                  )}
                  <Text style={styles.saveText}>
                    {session.current_saved ? t('styleMatchSaved') : t('styleMatchSave')}
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.reactions}>
              <ReactionButton
                disabled={Boolean(busyAction)}
                label={t('styleMatchReject')}
                loading={busyAction === 'reject'}
                onPress={() => void react('reject')}
                symbol="×"
                variant="reject"
              />
              <ReactionButton
                disabled={Boolean(busyAction)}
                label={t('styleMatchLike')}
                loading={busyAction === 'like'}
                onPress={() => void react('like')}
                symbol="♡"
                variant="like"
              />
              <ReactionButton
                disabled={Boolean(busyAction)}
                label={t('styleMatchFavorite')}
                loading={busyAction === 'favorite'}
                onPress={() => void react('favorite')}
                symbol="♥"
                variant="favorite"
              />
            </View>
          </>
        ) : (
          <View style={styles.unavailableCard}>
            <Text style={styles.unavailableTitle}>{t('styleMatchUnavailable')}</Text>
            <Text style={styles.mutedCentered}>{t('styleMatchError')}</Text>
            <Button label={t('retry')} onPress={() => void loadOverview()} />
          </View>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.screen}>
      <BrandHeader title={t('styleMatch')} />
      <View style={styles.introHero}>
        <Text style={styles.eyebrow}>{t('styleMatchEyebrow')}</Text>
        <Text style={styles.introTitle}>{t('styleMatchTitle')}</Text>
        <Text style={styles.introSubtitle}>{t('styleMatchSubtitle')}</Text>

        <View style={styles.tastePreview} accessibilityElementsHidden>
          <View style={[styles.tasteCard, styles.tasteCardReject]}>
            <Text style={styles.tasteSymbol}>×</Text>
          </View>
          <View style={[styles.tasteCard, styles.tasteCardLike]}>
            <Text style={styles.tasteSymbol}>♡</Text>
          </View>
          <View style={[styles.tasteCard, styles.tasteCardFavorite]}>
            <Text style={styles.tasteSymbol}>♥</Text>
          </View>
        </View>

        <View style={styles.benefits}>
          <View style={styles.benefitPill}>
            <Text style={styles.benefitText}>✦ {t('styleMatchAdaptive')}</Text>
          </View>
          <View style={styles.benefitPill}>
            <Text style={styles.benefitText}>◉ {t('styleMatchPrivate')}</Text>
          </View>
        </View>
        <Text style={styles.choiceHint}>{t('styleMatchChoices')}</Text>
        <Button
          label={t('styleMatchStart')}
          loading={starting}
          onPress={() => void beginMatch()}
        />
      </View>

      {latestResult ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setResult(latestResult);
            setMode('result');
          }}
          style={({ pressed }) => [styles.latestCard, pressed && styles.pressed]}
        >
          <View style={styles.latestHeading}>
            <View style={styles.latestCopy}>
              <Text style={styles.latestTitle}>{t('styleMatchLatest')}</Text>
              <Text style={styles.latestHint}>{t('styleMatchLatestHint')}</Text>
            </View>
            <Text style={styles.latestScoreValue}>{latestResult.match_confidence}%</Text>
          </View>
          <View style={styles.latestDivider} />
          <Text style={styles.latestPersonality}>{latestResult.personality.label}</Text>
          <View style={styles.latestStyleRow}>
            <Text style={styles.latestStyle}>{latestResult.top_style.label}</Text>
            <Text style={styles.latestStyleScore}>{latestResult.top_style.score}%</Text>
          </View>
          <Text style={styles.latestLink}>{t('styleMatchViewResult')} →</Text>
        </Pressable>
      ) : null}

      {error ? (
        <View style={styles.unavailableCard}>
          <Text style={styles.unavailableTitle}>{t('styleMatchUnavailable')}</Text>
          <Text style={styles.mutedCentered}>{error}</Text>
          <Button label={t('retry')} onPress={() => void loadOverview()} variant="secondary" />
        </View>
      ) : null}
    </Screen>
  );
}

function ReactionButton({
  disabled,
  label,
  loading,
  onPress,
  symbol,
  variant,
}: {
  disabled: boolean;
  label: string;
  loading: boolean;
  onPress: () => void;
  symbol: string;
  variant: StyleMatchReaction;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.reactionButton,
        styles[`${variant}Reaction`],
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <Text style={styles.reactionSymbol}>{symbol}</Text>
      )}
      <Text numberOfLines={2} style={styles.reactionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { paddingBottom: spacing.xxl },
  quizScreen: { paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: 14 },
  loadingScreen: { justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  loadingOrb: {
    width: 92,
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 46,
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.30)',
    backgroundColor: 'rgba(4, 197, 191, 0.08)',
  },
  mutedCentered: { color: colors.textMuted, lineHeight: 21, textAlign: 'center' },
  eyebrow: { color: colors.primary, ...typography.eyebrow },
  introHero: {
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 18, 28, 0.96)',
    borderColor: 'rgba(4, 197, 191, 0.20)',
    borderWidth: 1,
    borderRadius: radius.panel,
    padding: spacing.xl,
    gap: spacing.md,
    ...shadow.panel,
  },
  introTitle: { color: colors.text, fontSize: 32, lineHeight: 37, fontWeight: '900', letterSpacing: -0.8 },
  introSubtitle: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  tastePreview: {
    minHeight: 96,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.xs,
  },
  tasteCard: {
    width: 82,
    height: 94,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    backgroundColor: colors.surfaceRaised,
    ...shadow.panel,
  },
  tasteCardReject: { transform: [{ rotate: '-9deg' }, { translateX: 10 }] },
  tasteCardLike: { zIndex: 2, transform: [{ translateY: -4 }] },
  tasteCardFavorite: { transform: [{ rotate: '9deg' }, { translateX: -10 }], backgroundColor: 'rgba(238, 12, 111, 0.25)' },
  tasteSymbol: { color: colors.text, fontSize: 30, fontWeight: '900' },
  benefits: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  benefitPill: {
    backgroundColor: colors.backgroundDeep,
    borderColor: 'rgba(4, 197, 191, 0.18)',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  benefitText: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  choiceHint: { color: colors.textSubtle, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  latestCard: {
    backgroundColor: 'rgba(0, 18, 28, 0.96)',
    borderColor: 'rgba(238, 12, 111, 0.25)',
    borderWidth: 1,
    borderRadius: radius.panel,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  latestHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  latestCopy: { flex: 1, gap: 3 },
  latestTitle: { color: colors.text, fontSize: 19, fontWeight: '900' },
  latestHint: { color: colors.textMuted, fontSize: 12 },
  latestScoreValue: { color: colors.primary, fontSize: 26, fontWeight: '900' },
  latestDivider: { height: 1, backgroundColor: 'rgba(4, 197, 191, 0.12)' },
  latestPersonality: { color: colors.text, fontSize: 25, lineHeight: 30, fontWeight: '900' },
  latestStyleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  latestStyle: { color: colors.primary, fontWeight: '800', flex: 1 },
  latestStyleScore: { color: colors.textMuted, fontWeight: '900' },
  latestLink: { color: colors.accent, fontSize: 12, fontWeight: '900', textAlign: 'right' },
  quizHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md },
  quizCopy: { flex: 1, minWidth: 0, gap: 4 },
  quizTitle: { color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: '900', letterSpacing: -0.5 },
  progressCount: { color: colors.primary, fontSize: 15, fontWeight: '900', paddingBottom: 4 },
  progressTrack: { height: 5, backgroundColor: 'rgba(190, 225, 229, 0.16)', borderRadius: radius.pill, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: radius.pill },
  notice: {
    color: colors.primary,
    backgroundColor: 'rgba(4, 197, 191, 0.07)',
    borderColor: 'rgba(4, 197, 191, 0.20)',
    borderWidth: 1,
    borderRadius: radius.medium,
    padding: spacing.sm,
    lineHeight: 20,
  },
  deckFrame: { position: 'relative', marginTop: 2, paddingBottom: 12 },
  deckBackOne: {
    position: 'absolute',
    top: 8,
    left: 9,
    right: 9,
    bottom: 3,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.10)',
    backgroundColor: '#08202a',
    opacity: 0.76,
  },
  deckBackTwo: {
    position: 'absolute',
    top: 16,
    left: 18,
    right: 18,
    bottom: -4,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.07)',
    backgroundColor: '#061923',
    opacity: 0.48,
  },
  imageCard: {
    position: 'relative',
    zIndex: 2,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderColor: 'rgba(210, 255, 255, 0.22)',
    borderWidth: 1,
    ...shadow.panel,
  },
  matchImage: { width: '100%', aspectRatio: 2 / 3, backgroundColor: colors.backgroundDeep },
  imageLoader: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundDeep },
  saveButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(0, 10, 18, 0.86)',
    borderColor: 'rgba(4, 197, 191, 0.30)',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 13,
  },
  saveButtonActive: { borderColor: colors.accent, backgroundColor: 'rgba(55, 5, 31, 0.90)' },
  saveSymbol: { color: colors.accent, fontSize: 21, fontWeight: '900' },
  saveText: { color: colors.text, fontSize: 11, fontWeight: '900' },
  reactions: { flexDirection: 'row', gap: 10 },
  reactionButton: {
    flex: 1,
    minHeight: 94,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  rejectReaction: { backgroundColor: 'rgba(0, 18, 28, 0.96)', borderColor: 'rgba(4, 197, 191, 0.18)' },
  likeReaction: { backgroundColor: 'rgba(4, 197, 191, 0.06)', borderColor: colors.primary },
  favoriteReaction: { backgroundColor: colors.accent, borderColor: colors.accent },
  reactionSymbol: { color: colors.text, fontSize: 28, lineHeight: 31, fontWeight: '900' },
  reactionLabel: { color: colors.text, fontSize: 11, lineHeight: 14, fontWeight: '900', textAlign: 'center' },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.74, transform: [{ scale: 0.985 }] },
  error: { color: colors.danger, borderColor: 'rgba(255, 87, 127, 0.45)', backgroundColor: 'rgba(255, 87, 127, 0.05)', borderWidth: 1, borderRadius: radius.medium, padding: spacing.sm, textAlign: 'center' },
  unavailableCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.large, padding: spacing.lg, gap: spacing.md, alignItems: 'stretch' },
  unavailableTitle: { color: colors.text, fontSize: 21, fontWeight: '900', textAlign: 'center' },
});
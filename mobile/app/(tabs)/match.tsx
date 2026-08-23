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
import { colors, radius, spacing } from '@/theme';


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
        <BrandHeader />
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.mutedCentered}>{t('styleMatchLoading')}</Text>
      </Screen>
    );
  }

  if (mode === 'result' && result) {
    return (
      <Screen contentStyle={styles.screen}>
        <BrandHeader />
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
    const progress = Math.round((session.current_index / Math.max(1, session.total)) * 100);
    return (
      <Screen contentStyle={styles.screen} key={currentCard?.id ?? 'match'}>
        <BrandHeader />
        <View style={styles.quizHeading}>
          <View>
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
                  <ActivityIndicator color={colors.text} />
                ) : (
                  <Text style={styles.saveSymbol}>{session.current_saved ? '♥' : '♡'}</Text>
                )}
                <Text style={styles.saveText}>
                  {session.current_saved ? t('styleMatchSaved') : t('styleMatchSave')}
                </Text>
              </Pressable>
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
      <BrandHeader />
      <View style={styles.introHero}>
        <Text style={styles.eyebrow}>{t('styleMatchEyebrow')}</Text>
        <Text style={styles.introTitle}>{t('styleMatchTitle')}</Text>
        <Text style={styles.introSubtitle}>{t('styleMatchSubtitle')}</Text>
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
        <View style={styles.latestCard}>
          <View style={styles.latestHeading}>
            <View style={styles.latestCopy}>
              <Text style={styles.latestTitle}>{t('styleMatchLatest')}</Text>
              <Text style={styles.latestHint}>{t('styleMatchLatestHint')}</Text>
            </View>
            <View style={styles.latestScore}>
              <Text style={styles.latestScoreValue}>{latestResult.match_confidence}%</Text>
            </View>
          </View>
          <Text style={styles.latestPersonality}>{latestResult.personality.label}</Text>
          <Text style={styles.latestStyle}>{latestResult.top_style.label} · {latestResult.top_style.score}%</Text>
          <Button
            label={t('styleMatchViewResult')}
            onPress={() => {
              setResult(latestResult);
              setMode('result');
            }}
            variant="secondary"
          />
        </View>
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
  loadingScreen: { justifyContent: 'center', alignItems: 'center' },
  mutedCentered: { color: colors.textMuted, lineHeight: 21, textAlign: 'center' },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1.8 },
  introHero: { backgroundColor: colors.surface, borderColor: colors.primaryMuted, borderWidth: 1, borderRadius: radius.large, padding: spacing.lg, gap: spacing.md },
  introTitle: { color: colors.text, fontSize: 34, lineHeight: 39, fontWeight: '900' },
  introSubtitle: { color: colors.textMuted, fontSize: 15, lineHeight: 23 },
  benefits: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  benefitPill: { backgroundColor: colors.backgroundDeep, borderColor: colors.border, borderWidth: 1, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 12 },
  benefitText: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  choiceHint: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  latestCard: { backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1, borderRadius: radius.large, padding: spacing.lg, gap: spacing.sm },
  latestHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  latestCopy: { flex: 1, gap: 3 },
  latestTitle: { color: colors.text, fontSize: 20, fontWeight: '900' },
  latestHint: { color: colors.textMuted, fontSize: 12 },
  latestScore: { backgroundColor: colors.backgroundDeep, borderRadius: radius.pill, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  latestScoreValue: { color: colors.primary, fontSize: 18, fontWeight: '900' },
  latestPersonality: { color: colors.text, fontSize: 25, fontWeight: '900' },
  latestStyle: { color: colors.primary, fontWeight: '800' },
  quizHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md },
  quizTitle: { color: colors.text, fontSize: 24, lineHeight: 30, fontWeight: '900', marginTop: 3, flexShrink: 1 },
  progressCount: { color: colors.primary, fontSize: 16, fontWeight: '900' },
  progressTrack: { height: 7, backgroundColor: colors.surfaceRaised, borderRadius: radius.pill, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: radius.pill },
  notice: { color: colors.primary, backgroundColor: colors.surfaceRaised, borderColor: colors.primaryMuted, borderWidth: 1, borderRadius: radius.medium, padding: spacing.sm, lineHeight: 20 },
  imageCard: { position: 'relative', borderRadius: radius.large, overflow: 'hidden', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  matchImage: { width: '100%', aspectRatio: 2 / 3, backgroundColor: colors.backgroundDeep },
  imageLoader: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundDeep },
  saveButton: { position: 'absolute', top: spacing.sm, right: spacing.sm, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, backgroundColor: 'rgba(0, 10, 18, 0.88)', borderColor: colors.border, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.sm },
  saveButtonActive: { borderColor: colors.accent, backgroundColor: 'rgba(42, 5, 26, 0.9)' },
  saveSymbol: { color: colors.accent, fontSize: 20, fontWeight: '900' },
  saveText: { color: colors.text, fontSize: 11, fontWeight: '800' },
  reactions: { flexDirection: 'row', gap: spacing.sm },
  reactionButton: { flex: 1, minHeight: 82, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: radius.medium, borderWidth: 1, padding: spacing.xs },
  rejectReaction: { backgroundColor: colors.surface, borderColor: colors.border },
  likeReaction: { backgroundColor: colors.surfaceRaised, borderColor: colors.primary },
  favoriteReaction: { backgroundColor: colors.accent, borderColor: colors.accent },
  reactionSymbol: { color: colors.text, fontSize: 25, lineHeight: 28, fontWeight: '900' },
  reactionLabel: { color: colors.text, fontSize: 11, lineHeight: 14, fontWeight: '800', textAlign: 'center' },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
  error: { color: colors.danger, borderColor: colors.danger, borderWidth: 1, borderRadius: radius.medium, padding: spacing.sm, textAlign: 'center' },
  unavailableCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.large, padding: spacing.lg, gap: spacing.md, alignItems: 'stretch' },
  unavailableTitle: { color: colors.text, fontSize: 21, fontWeight: '900', textAlign: 'center' },
});

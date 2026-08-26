import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
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
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { appLanguage, t } from '@/i18n';
import {
  fetchStyleMatchOverview,
  fetchStyleMatchResult,
  reactToStyleMatch,
  startStyleMatch,
} from '@/style-match/style-match-api';
import { StyleMatchResultV2 } from '@/style-match/style-match-result-v2';
import { colors, radius, spacing } from '@/theme';


type MatchMode = 'intro' | 'quiz' | 'analysis' | 'result';
type BusyAction = StyleMatchReaction | 'save' | '';

function copy(en: string, fr: string, ru: string) {
  if (appLanguage === 'fr') return fr;
  if (appLanguage === 'ru') return ru;
  return en;
}

export default function StyleMatchScreenV2() {
  const { request, status } = useAuth();
  const [mode, setMode] = useState<MatchMode>('intro');
  const [session, setSession] = useState<StyleMatchSession | null>(null);
  const [latestResult, setLatestResult] = useState<StyleMatchResultData | null>(null);
  const [result, setResult] = useState<StyleMatchResultData | null>(null);
  const [pendingResult, setPendingResult] = useState<StyleMatchResultData | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [busyAction, setBusyAction] = useState<BusyAction>('');
  const [imageLoading, setImageLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [analysisPhase, setAnalysisPhase] = useState(0);

  const cardAnim = useRef(new Animated.Value(1)).current;
  const analysisSpin = useRef(new Animated.Value(0)).current;

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
    if (!currentCard) return;
    setImageLoading(true);
    cardAnim.setValue(0);
    Animated.timing(cardAnim, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [cardAnim, currentCard?.id]);

  useEffect(() => {
    if (mode !== 'analysis' || !pendingResult) return;
    setAnalysisPhase(0);
    analysisSpin.setValue(0);
    const loop = Animated.loop(Animated.timing(analysisSpin, {
      toValue: 1,
      duration: 1200,
      easing: Easing.linear,
      useNativeDriver: true,
    }));
    loop.start();
    const phaseOne = setTimeout(() => setAnalysisPhase(1), 420);
    const phaseTwo = setTimeout(() => setAnalysisPhase(2), 840);
    const phaseThree = setTimeout(() => setAnalysisPhase(3), 1220);
    const reveal = setTimeout(() => {
      setResult(pendingResult);
      setLatestResult(pendingResult);
      setPendingResult(null);
      setMode('result');
    }, 1650);
    return () => {
      loop.stop();
      clearTimeout(phaseOne);
      clearTimeout(phaseTwo);
      clearTimeout(phaseThree);
      clearTimeout(reveal);
    };
  }, [analysisSpin, mode, pendingResult]);

  const beginMatch = async () => {
    setStarting(true);
    setError('');
    setNotice('');
    try {
      const started = await startStyleMatch(request);
      setSession(started);
      setResult(null);
      setPendingResult(null);
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
        const completed = response.result ?? await fetchStyleMatchResult(request, session.session_id);
        setPendingResult(completed);
        setSession(null);
        setNotice('');
        setMode('analysis');
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
      setSession((current) => current ? { ...current, current_saved: response.saved ?? nextSaved } : current);
      setNotice(nextSaved ? copy('Saved to your collection', 'Enregistré dans votre collection', 'Сохранено в коллекцию') : '');
    } catch {
      setError(t('styleMatchError'));
    } finally {
      setBusyAction('');
    }
  };

  if (loading || status === 'loading') {
    return (
      <Screen contentStyle={styles.centerScreen}>
        <Wordmark />
        <View style={styles.loadingOrb}><ActivityIndicator color={colors.primary} size="large" /></View>
        <Text style={styles.muted}>{t('styleMatchLoading')}</Text>
      </Screen>
    );
  }

  if (mode === 'analysis') {
    const messages = [
      copy('Analyzing preferences...', 'Analyse des préférences...', 'Анализируем предпочтения...'),
      copy('Comparing styles...', 'Comparaison des styles...', 'Сравниваем стили...'),
      copy('Finding artists...', 'Recherche des artistes...', 'Ищем мастеров...'),
      copy('Building your tattoo personality...', 'Création de votre personnalité tattoo...', 'Собираем твою тату-персональность...'),
    ];
    const rotation = analysisSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
    return (
      <Screen contentStyle={styles.centerScreen}>
        <Wordmark />
        <View style={styles.analysisCard}>
          <Animated.View style={[styles.analysisOrb, { transform: [{ rotate: rotation }] }]}>
            <View style={styles.orbRingOne} />
            <View style={styles.orbRingTwo} />
            <Text style={styles.orbGlyph}>◎</Text>
          </Animated.View>
          <Text style={styles.eyebrow}>{copy('TATZO INTELLIGENCE', 'INTELLIGENCE TATZO', 'TATZO INTELLIGENCE')}</Text>
          <Text style={styles.analysisTitle}>{copy('Discovering your tattoo personality', 'Découverte de votre personnalité tattoo', 'Определяем твою тату-персональность')}</Text>
          <Text style={styles.analysisMessage}>{messages[analysisPhase]}</Text>
          <View style={styles.analysisMeter}><View style={[styles.analysisFill, { width: `${25 + analysisPhase * 25}%` }]} /></View>
        </View>
      </Screen>
    );
  }

  if (mode === 'result' && result) {
    return (
      <Screen contentStyle={styles.resultScreen}>
        <StyleMatchResultV2 result={result} onRestart={() => void beginMatch()} restarting={starting} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </Screen>
    );
  }

  if (mode === 'quiz' && session) {
    const progress = Math.round(((session.current_index + 1) / Math.max(1, session.total)) * 100);
    return (
      <Screen contentStyle={styles.discoveryScreen}>
        <Ambient />
        <View style={styles.deckHeader}>
          <Wordmark />
          <View style={styles.progressCopy}>
            <Text style={styles.progressLabel}>{copy('YOUR TASTE MAP', 'VOTRE CARTE DE GOÛT', 'КАРТА ТВОЕГО ВКУСА')}</Text>
            <Text style={styles.progressCount}>{Math.min(session.current_index + 1, session.total)} / {session.total}</Text>
          </View>
        </View>
        <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>

        <View style={styles.discoveryCopy}>
          <Text style={styles.eyebrow}>{copy('TATZO STYLE MATCH', 'TATZO STYLE MATCH', 'TATZO STYLE MATCH')}</Text>
          <Text style={styles.discoveryTitle}>{copy('Follow the feeling, not the label.', 'Suivez le feeling, pas l’étiquette.', 'Следуй ощущению, а не названию.')}</Text>
          <Text style={styles.discoverySubtitle}>{copy(
            'Every choice maps the visual language that feels most like you. Style names stay hidden until the reveal.',
            'Chaque choix dessine votre langage visuel. Les styles restent cachés jusqu’au résultat.',
            'Каждый выбор уточняет визуальный язык, который ближе тебе. Названия стилей скрыты до результата.',
          )}</Text>
        </View>

        {notice ? <View style={styles.toast}><Text style={styles.toastText}>{notice}</Text></View> : null}

        {currentCard ? (
          <>
            <View style={styles.deck}>
              <View style={styles.deckBackTwo} />
              <View style={styles.deckBackOne} />
              <Animated.View
                style={[
                  styles.card,
                  {
                    opacity: cardAnim,
                    transform: [
                      { translateY: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
                      { scale: cardAnim.interpolate({ inputRange: [0, 1], outputRange: [.97, 1] }) },
                    ],
                  },
                ]}
              >
                <Image
                  accessibilityLabel={currentCard.alt}
                  onLoadEnd={() => setImageLoading(false)}
                  onLoadStart={() => setImageLoading(true)}
                  resizeMode="cover"
                  source={{ uri: currentCard.image_url }}
                  style={styles.cardImage}
                />
                {imageLoading ? <View style={styles.imageLoader}><ActivityIndicator color={colors.primary} size="large" /></View> : null}
              </Animated.View>
            </View>

            <View style={styles.actions}>
              <ActionButton
                label={t('styleMatchReject')}
                symbol="×"
                variant="reject"
                disabled={Boolean(busyAction)}
                loading={busyAction === 'reject'}
                onPress={() => void react('reject')}
              />
              <ActionButton
                label={session.current_saved ? t('styleMatchSaved') : t('styleMatchSave')}
                symbol="⌑"
                variant={session.current_saved ? 'saveActive' : 'save'}
                disabled={Boolean(busyAction)}
                loading={busyAction === 'save'}
                onPress={() => void toggleSaved()}
              />
              <ActionButton
                label={t('styleMatchLike')}
                symbol="♡"
                variant="like"
                disabled={Boolean(busyAction)}
                loading={busyAction === 'like'}
                onPress={() => void react('like')}
              />
              <ActionButton
                label={t('styleMatchFavorite')}
                symbol="✦"
                variant="favorite"
                disabled={Boolean(busyAction)}
                loading={busyAction === 'favorite'}
                onPress={() => void react('favorite')}
              />
            </View>
            <Text style={styles.hint}>{copy('Swipe to choose · hold to save · double tap to favorite', 'Glissez pour choisir · maintenez pour enregistrer · double tap pour favori', 'Свайп — выбрать · удержание — сохранить · двойной тап — в избранное')}</Text>
          </>
        ) : (
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>{t('styleMatchUnavailable')}</Text>
            <Button label={t('retry')} onPress={() => void loadOverview()} />
          </View>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </Screen>
    );
  }

  const previews = latestResult?.saved_cards.slice(0, 3) ?? [];
  return (
    <Screen contentStyle={styles.onboardingScreen}>
      <Ambient />
      <View style={styles.onboardingCard}>
        <View style={styles.brandRow}>
          <Wordmark />
          <View style={styles.kicker}><Text style={styles.kickerText}>Style Match</Text></View>
        </View>

        <View style={styles.previewDeck} accessibilityElementsHidden>
          {[0, 1, 2].map((index) => (
            <View key={index} style={[styles.previewCard, styles[`preview${index}`]]}>
              {previews[index] ? (
                <Image source={{ uri: previews[index].image_url }} style={styles.previewImage} />
              ) : (
                <View style={styles.previewFallback}><Text style={styles.previewGlyph}>{['×', '♡', '✦'][index]}</Text></View>
              )}
            </View>
          ))}
          <View style={styles.visualPill}><Text style={styles.visualPillText}>{copy('Your taste, decoded', 'Votre goût, décodé', 'Твой вкус — расшифрован')}</Text></View>
        </View>

        <View style={styles.onboardingCopy}>
          <Text style={styles.eyebrow}>{copy('A NEW WAY TO DISCOVER', 'UNE NOUVELLE FAÇON DE DÉCOUVRIR', 'НОВЫЙ СПОСОБ НАЙТИ СВОЁ')}</Text>
          <Text style={styles.onboardingTitle}>{copy('Not sure what tattoo style fits you?', 'Vous ne savez pas quel style vous correspond ?', 'Не знаешь, какой стиль тату тебе подходит?')}</Text>
          <Text style={styles.onboardingBody}>{copy(
            'Swipe through tattoos and we’ll discover your taste — no labels and no pressure.',
            'Parcourez les tattoos et nous découvrirons votre goût — sans étiquettes ni pression.',
            'Листай татуировки, а мы определим твой вкус — без ярлыков и давления.',
          )}</Text>
        </View>

        <Button label={copy('Discover my style ✦', 'Découvrir mon style ✦', 'Найти мой стиль ✦')} loading={starting} onPress={() => void beginMatch()} />
        <Text style={styles.footnote}>{copy('Usually a short set of choices · more only when your taste needs a closer look', 'Habituellement quelques choix · davantage seulement si nécessaire', 'Обычно достаточно короткой серии · больше только если вкус нужно уточнить')}</Text>
      </View>

      {latestResult ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => { setResult(latestResult); setMode('result'); }}
          style={({ pressed }) => [styles.latestCard, pressed && styles.pressed]}
        >
          <View style={styles.latestCopy}>
            <Text style={styles.latestTitle}>{t('styleMatchLatest')}</Text>
            <Text style={styles.latestStyle}>{latestResult.top_style.label}</Text>
          </View>
          <Text style={styles.latestScore}>{latestResult.match_confidence}%</Text>
        </Pressable>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

function Wordmark() {
  return <Text accessibilityLabel="Tatzo" style={styles.wordmark}>tatzo<Text style={styles.wordmarkDot}>.</Text></Text>;
}

function Ambient() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.ambientTeal} />
      <View style={styles.ambientPink} />
    </View>
  );
}

function ActionButton({
  label,
  symbol,
  variant,
  disabled,
  loading,
  onPress,
}: {
  label: string;
  symbol: string;
  variant: 'reject' | 'save' | 'saveActive' | 'like' | 'favorite';
  disabled: boolean;
  loading: boolean;
  onPress: () => void;
}) {
  return (
    <View style={styles.actionWrap}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [styles.actionButton, styles[variant], disabled && styles.disabled, pressed && styles.actionPressed]}
      >
        {loading ? <ActivityIndicator color={variant === 'favorite' ? colors.white : colors.primary} /> : <Text style={[styles.actionSymbol, variant === 'favorite' && styles.favoriteSymbol]}>{symbol}</Text>}
      </Pressable>
      <Text numberOfLines={1} style={styles.actionLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centerScreen: { justifyContent: 'center', alignItems: 'center', gap: spacing.lg, paddingBottom: spacing.xxl },
  resultScreen: { paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  discoveryScreen: { paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: 14, overflow: 'hidden' },
  onboardingScreen: { paddingTop: spacing.md, paddingBottom: spacing.xxl, overflow: 'hidden' },
  wordmark: { color: colors.white, fontSize: 31, lineHeight: 35, fontWeight: '900', letterSpacing: -1.8 },
  wordmarkDot: { color: colors.accent },
  loadingOrb: { width: 92, height: 92, borderRadius: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(4,197,191,.08)', borderWidth: 1, borderColor: 'rgba(4,197,191,.25)' },
  muted: { color: colors.textMuted, lineHeight: 20, textAlign: 'center' },
  ambientTeal: { position: 'absolute', width: 320, height: 320, borderRadius: 160, backgroundColor: 'rgba(4,197,191,.08)', top: -120, right: -150 },
  ambientPink: { position: 'absolute', width: 280, height: 280, borderRadius: 140, backgroundColor: 'rgba(238,12,111,.07)', bottom: 30, left: -170 },
  onboardingCard: { backgroundColor: 'rgba(0,19,29,.92)', borderWidth: 1, borderColor: 'rgba(4,197,191,.17)', borderRadius: 28, padding: spacing.xl, gap: spacing.lg },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  kicker: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(238,12,111,.25)', backgroundColor: 'rgba(238,12,111,.08)' },
  kickerText: { color: '#ff76a1', fontSize: 10, fontWeight: '900', letterSpacing: .7 },
  previewDeck: { height: 230, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  previewCard: { position: 'absolute', width: 140, height: 190, borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,.10)', backgroundColor: '#031b27' },
  preview0: { transform: [{ rotate: '-10deg' }, { translateX: -56 }, { translateY: 13 }] },
  preview1: { zIndex: 3, transform: [{ translateY: -4 }] },
  preview2: { transform: [{ rotate: '10deg' }, { translateX: 56 }, { translateY: 13 }] },
  previewImage: { width: '100%', height: '100%' },
  previewFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#06212a' },
  previewGlyph: { color: colors.primary, fontSize: 38, fontWeight: '600' },
  visualPill: { position: 'absolute', zIndex: 5, bottom: 3, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: '#00131d', borderWidth: 1, borderColor: 'rgba(4,197,191,.22)' },
  visualPillText: { color: colors.primary, fontSize: 10, fontWeight: '900' },
  onboardingCopy: { gap: spacing.sm },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 1.55 },
  onboardingTitle: { color: colors.white, fontSize: 32, lineHeight: 36, fontWeight: '900', letterSpacing: -1.1 },
  onboardingBody: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  footnote: { color: colors.textSubtle, fontSize: 10, lineHeight: 15, textAlign: 'center' },
  latestCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, padding: spacing.lg, borderRadius: 20, backgroundColor: '#00131d', borderWidth: 1, borderColor: 'rgba(4,197,191,.14)' },
  latestCopy: { flex: 1, gap: 3 },
  latestTitle: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
  latestStyle: { color: colors.white, fontSize: 18, fontWeight: '900' },
  latestScore: { color: colors.primary, fontSize: 28, fontWeight: '900' },
  deckHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  progressCopy: { alignItems: 'flex-end', gap: 2 },
  progressLabel: { color: colors.textMuted, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  progressCount: { color: colors.white, fontSize: 15, fontWeight: '900' },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,.08)', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 2 },
  discoveryCopy: { gap: 5, paddingVertical: spacing.xs },
  discoveryTitle: { color: colors.white, fontSize: 22, lineHeight: 27, fontWeight: '900', letterSpacing: -.5 },
  discoverySubtitle: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  toast: { alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: '#06272d', borderWidth: 1, borderColor: 'rgba(4,197,191,.20)' },
  toastText: { color: colors.primary, fontSize: 10, fontWeight: '800' },
  deck: { minHeight: 455, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  deckBackTwo: { position: 'absolute', width: '82%', height: 400, borderRadius: 26, backgroundColor: '#041923', transform: [{ rotate: '-5deg' }, { translateY: 10 }] },
  deckBackOne: { position: 'absolute', width: '84%', height: 410, borderRadius: 26, backgroundColor: '#06232d', transform: [{ rotate: '4deg' }, { translateY: 6 }] },
  card: { width: '88%', height: 425, borderRadius: 26, overflow: 'hidden', backgroundColor: '#031b27', borderWidth: 1, borderColor: 'rgba(255,255,255,.12)' },
  cardImage: { width: '100%', height: '100%' },
  imageLoader: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#031b27' },
  actions: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: 12 },
  actionWrap: { width: 68, alignItems: 'center', gap: 6 },
  actionButton: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, backgroundColor: '#00131d' },
  reject: { borderColor: 'rgba(255,255,255,.18)' },
  save: { borderColor: 'rgba(4,197,191,.34)' },
  saveActive: { borderColor: colors.primary, backgroundColor: 'rgba(4,197,191,.12)' },
  like: { borderColor: 'rgba(4,197,191,.48)' },
  favorite: { borderColor: colors.accent, backgroundColor: colors.accent },
  actionSymbol: { color: colors.primary, fontSize: 27, lineHeight: 31, fontWeight: '600' },
  favoriteSymbol: { color: colors.white },
  actionLabel: { color: colors.textMuted, fontSize: 9, fontWeight: '800', textAlign: 'center' },
  disabled: { opacity: .48 },
  actionPressed: { transform: [{ scale: .92 }], opacity: .78 },
  hint: { color: colors.textSubtle, fontSize: 9, textAlign: 'center', lineHeight: 14 },
  stateCard: { padding: spacing.xl, borderRadius: 22, backgroundColor: '#00131d', borderWidth: 1, borderColor: 'rgba(4,197,191,.14)', gap: spacing.md },
  stateTitle: { color: colors.white, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  analysisCard: { width: '100%', alignItems: 'center', gap: spacing.md, padding: spacing.xl, borderRadius: 28, backgroundColor: '#00131d', borderWidth: 1, borderColor: 'rgba(4,197,191,.18)' },
  analysisOrb: { width: 126, height: 126, borderRadius: 63, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  orbRingOne: { position: 'absolute', width: 126, height: 126, borderRadius: 63, borderWidth: 2, borderColor: 'rgba(4,197,191,.46)', borderTopColor: colors.accent },
  orbRingTwo: { position: 'absolute', width: 92, height: 92, borderRadius: 46, borderWidth: 1, borderColor: 'rgba(238,12,111,.30)', borderRightColor: colors.primary },
  orbGlyph: { color: colors.white, fontSize: 34 },
  analysisTitle: { color: colors.white, fontSize: 26, lineHeight: 31, fontWeight: '900', textAlign: 'center', letterSpacing: -.7 },
  analysisMessage: { color: colors.textMuted, textAlign: 'center', minHeight: 22 },
  analysisMeter: { width: '100%', height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,.08)' },
  analysisFill: { height: '100%', backgroundColor: colors.primary },
  error: { color: colors.danger, textAlign: 'center', padding: spacing.sm },
  pressed: { opacity: .72, transform: [{ scale: .99 }] },
});

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
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
import { colors, spacing } from '@/theme';


type MatchMode = 'intro' | 'quiz' | 'analysis' | 'result';
type BusyAction = StyleMatchReaction | 'save' | '';
type SwipeDirection = 'left' | 'right';

const WEB_SWIPE_THRESHOLD = 90;
const WEB_LONG_PRESS_MS = 650;
const WEB_EXIT_MS = 220;
const DOUBLE_TAP_MS = 280;
const GESTURE_MOVE_CANCEL = 12;

function copy(en: string, fr: string, ru: string) {
  if (appLanguage === 'fr') return fr;
  if (appLanguage === 'ru') return ru;
  return en;
}

function mergeCards(current: StyleMatchCard[], added: StyleMatchCard[]) {
  const known = new Set(current.map((card) => card.id));
  return [...current, ...added.filter((card) => !known.has(card.id))];
}

export default function StyleMatchScreenV3() {
  const { request, status } = useAuth();
  const { width: windowWidth } = useWindowDimensions();
  const [mode, setMode] = useState<MatchMode>('intro');
  const [session, setSession] = useState<StyleMatchSession | null>(null);
  const [previewCards, setPreviewCards] = useState<StyleMatchCard[]>([]);
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

  const cardIntro = useRef(new Animated.Value(1)).current;
  const pan = useRef(new Animated.ValueXY()).current;
  const analysisSpin = useRef(new Animated.Value(0)).current;
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gestureStartedAtRef = useRef(0);
  const didLongPressRef = useRef(false);
  const lastTapRef = useRef(0);
  const busyRef = useRef(false);
  const reactRef = useRef<(reaction: StyleMatchReaction, direction: SwipeDirection) => void>(() => undefined);
  const saveRef = useRef<() => void>(() => undefined);

  busyRef.current = Boolean(busyAction);

  const resetPan = useCallback(() => {
    Animated.spring(pan, {
      toValue: { x: 0, y: 0 },
      speed: 22,
      bounciness: 6,
      useNativeDriver: true,
    }).start();
  }, [pan]);

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !busyRef.current,
    onMoveShouldSetPanResponder: (_event, gesture) => (
      !busyRef.current
      && Math.abs(gesture.dx) > 4
      && Math.abs(gesture.dx) >= Math.abs(gesture.dy) * 0.7
    ),
    onPanResponderGrant: () => {
      if (busyRef.current) return;
      gestureStartedAtRef.current = Date.now();
      didLongPressRef.current = false;
      pan.setOffset({ x: 0, y: 0 });
      pan.setValue({ x: 0, y: 0 });
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = setTimeout(() => {
        if (busyRef.current) return;
        didLongPressRef.current = true;
        saveRef.current();
      }, WEB_LONG_PRESS_MS);
    },
    onPanResponderMove: (_event, gesture) => {
      if (busyRef.current) return;
      if (
        Math.abs(gesture.dx) > GESTURE_MOVE_CANCEL
        || Math.abs(gesture.dy) > GESTURE_MOVE_CANCEL
      ) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }
      pan.setValue({ x: gesture.dx, y: gesture.dy });
    },
    onPanResponderRelease: (_event, gesture) => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      if (didLongPressRef.current) {
        didLongPressRef.current = false;
        resetPan();
        return;
      }
      if (gesture.dx > WEB_SWIPE_THRESHOLD) {
        reactRef.current('like', 'right');
        return;
      }
      if (gesture.dx < -WEB_SWIPE_THRESHOLD) {
        reactRef.current('reject', 'left');
        return;
      }
      const shortTap = (
        Math.abs(gesture.dx) < 8
        && Math.abs(gesture.dy) < 8
        && Date.now() - gestureStartedAtRef.current < 260
      );
      if (shortTap) {
        const now = Date.now();
        if (now - lastTapRef.current <= DOUBLE_TAP_MS) {
          lastTapRef.current = 0;
          reactRef.current('favorite', 'right');
          return;
        }
        lastTapRef.current = now;
      }
      resetPan();
    },
    onPanResponderTerminate: () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      didLongPressRef.current = false;
      resetPan();
    },
  })).current;

  const loadOverview = useCallback(async () => {
    if (status !== 'authenticated') return;
    setLoading(true);
    setError('');
    try {
      const overview = await fetchStyleMatchOverview(request);
      setLatestResult(overview.latest_result);
      const previews = overview.active_session?.cards.slice(0, 3)
        ?? overview.latest_result?.saved_cards.slice(0, 3)
        ?? [];
      setPreviewCards(previews);
      // Web always opens on the explanatory onboarding screen. Starting from
      // there intentionally creates a fresh session and abandons any old one.
      setSession(null);
      setMode('intro');
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
  const nextCard = session?.cards[session.current_index + 1] ?? null;
  const thirdCard = session?.cards[session.current_index + 2] ?? null;

  useEffect(() => {
    if (!currentCard) return;
    setImageLoading(true);
    pan.setValue({ x: 0, y: 0 });
    cardIntro.setValue(0);
    Animated.timing(cardIntro, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [cardIntro, currentCard?.id, pan]);

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
    const phaseOne = setTimeout(() => setAnalysisPhase(1), 550);
    const phaseTwo = setTimeout(() => setAnalysisPhase(2), 1100);
    const phaseThree = setTimeout(() => setAnalysisPhase(3), 1650);
    const reveal = setTimeout(() => {
      setResult(pendingResult);
      setLatestResult(pendingResult);
      setPendingResult(null);
      setMode('result');
    }, 2200);
    return () => {
      loop.stop();
      clearTimeout(phaseOne);
      clearTimeout(phaseTwo);
      clearTimeout(phaseThree);
      clearTimeout(reveal);
    };
  }, [analysisSpin, mode, pendingResult]);

  useEffect(() => () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
  }, []);

  const beginMatch = async () => {
    if (starting) return;
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

  const react = async (reaction: StyleMatchReaction, direction: SwipeDirection) => {
    if (!session || !currentCard || busyRef.current) return;
    setBusyAction(reaction);
    setError('');
    const exitX = Math.max(windowWidth, 360) * (direction === 'right' ? 1.25 : -1.25);
    const requestPromise = reactToStyleMatch(
      request,
      session.session_id,
      currentCard.id,
      reaction,
    );
    const motionPromise = new Promise<void>((resolve) => {
      Animated.parallel([
        Animated.timing(pan.x, {
          toValue: exitX,
          duration: WEB_EXIT_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(pan.y, {
          toValue: -18,
          duration: WEB_EXIT_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => resolve());
    });

    try {
      const [response] = await Promise.all([requestPromise, motionPromise]);
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
      resetPan();
      setError(t('styleMatchError'));
    } finally {
      setBusyAction('');
    }
  };

  const toggleSaved = async () => {
    if (!session || !currentCard || busyRef.current) return;
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
      setNotice(nextSaved
        ? copy('Saved to your collection', 'Enregistré dans votre collection', 'Сохранено в коллекцию')
        : copy('Removed from your collection', 'Retiré de votre collection', 'Удалено из коллекции'));
    } catch {
      setError(t('styleMatchError'));
    } finally {
      setBusyAction('');
    }
  };

  reactRef.current = (reaction, direction) => { void react(reaction, direction); };
  saveRef.current = () => { void toggleSaved(); };

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
        <StyleMatchResultV2 result={result} onRestart={() => setMode('intro')} restarting={starting} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </Screen>
    );
  }

  if (mode === 'quiz' && session) {
    const progress = Math.round((session.current_index / Math.max(1, session.total)) * 100);
    const rotation = pan.x.interpolate({
      inputRange: [-180, 0, 180],
      outputRange: ['-10deg', '0deg', '10deg'],
      extrapolate: 'clamp',
    });
    const dampedY = pan.y.interpolate({
      inputRange: [-240, 0, 240],
      outputRange: [-29, 0, 29],
      extrapolate: 'clamp',
    });
    const swipeOpacity = pan.x.interpolate({
      inputRange: [-Math.max(windowWidth, 360) * 1.2, 0, Math.max(windowWidth, 360) * 1.2],
      outputRange: [0, 1, 0],
      extrapolate: 'clamp',
    });
    const likeStampOpacity = pan.x.interpolate({
      inputRange: [0, 100],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    });
    const nopeStampOpacity = pan.x.interpolate({
      inputRange: [-100, 0],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    });
    const introTranslate = cardIntro.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
    const introScale = cardIntro.interpolate({ inputRange: [0, 1], outputRange: [.97, 1] });

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

        {notice ? <View style={styles.toast}><Text style={styles.toastText}>{notice}</Text></View> : null}

        {currentCard ? (
          <>
            <View style={styles.deck}>
              {thirdCard ? <DeckBackCard card={thirdCard} depth={2} /> : <View style={[styles.deckBack, styles.deckBackTwo]} />}
              {nextCard ? <DeckBackCard card={nextCard} depth={1} /> : <View style={[styles.deckBack, styles.deckBackOne]} />}
              <Animated.View
                {...panResponder.panHandlers}
                accessibilityLabel={currentCard.alt}
                style={[
                  styles.card,
                  {
                    opacity: Animated.multiply(cardIntro, swipeOpacity),
                    transform: [
                      { translateX: pan.x },
                      { translateY: dampedY },
                      { translateY: introTranslate },
                      { rotate: rotation },
                      { scale: introScale },
                    ],
                  },
                ]}
              >
                <Image
                  onLoadEnd={() => setImageLoading(false)}
                  onLoadStart={() => setImageLoading(true)}
                  resizeMode="cover"
                  source={{ uri: currentCard.image_url }}
                  style={styles.cardImage}
                />
                <View pointerEvents="none" style={styles.cardShade} />
                <Animated.View pointerEvents="none" style={[styles.stamp, styles.likeStamp, { opacity: likeStampOpacity }]}>
                  <Text style={styles.likeStampText}>LIKE</Text>
                </Animated.View>
                <Animated.View pointerEvents="none" style={[styles.stamp, styles.nopeStamp, { opacity: nopeStampOpacity }]}>
                  <Text style={styles.nopeStampText}>NOPE</Text>
                </Animated.View>
                {session.current_saved ? <View style={styles.savedBadge}><Text style={styles.savedBadgeText}>✓</Text></View> : null}
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
                onPress={() => void react('reject', 'left')}
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
                onPress={() => void react('like', 'right')}
              />
              <ActionButton
                label={t('styleMatchFavorite')}
                symbol="✦"
                variant="favorite"
                disabled={Boolean(busyAction)}
                loading={busyAction === 'favorite'}
                onPress={() => void react('favorite', 'right')}
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

  return (
    <Screen contentStyle={styles.onboardingScreen}>
      <Ambient />
      <View style={styles.onboardingCard}>
        <View style={styles.brandRow}>
          <Wordmark />
          <View style={styles.kicker}><Text style={styles.kickerText}>Style Match</Text></View>
        </View>

        <View style={styles.previewDeck} accessibilityElementsHidden>
          {[0, 1, 2].map((index) => {
            const preview = previewCards[index];
            return (
              <View
                key={index}
                style={[
                  styles.previewCard,
                  index === 0 ? styles.previewCenter : index === 1 ? styles.previewLeft : styles.previewRight,
                ]}
              >
                {preview ? (
                  <Image source={{ uri: preview.image_url }} style={styles.previewImage} />
                ) : (
                  <View style={styles.previewFallback}><View style={styles.previewSheen} /></View>
                )}
              </View>
            );
          })}
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

        <Pressable
          accessibilityRole="button"
          disabled={starting}
          onPress={() => void beginMatch()}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed, starting && styles.disabled]}
        >
          {starting ? <ActivityIndicator color="#001317" /> : (
            <>
              <Text style={styles.primaryButtonText}>{copy('Discover my style', 'Découvrir mon style', 'Найти мой стиль')}</Text>
              <Text style={styles.primaryButtonStar}>✦</Text>
            </>
          )}
        </Pressable>
        <Text style={styles.footnote}>{copy('Usually a short set of choices · more only when your taste needs a closer look', 'Habituellement quelques choix · davantage seulement si nécessaire', 'Обычно достаточно короткой серии · больше только если вкус нужно уточнить')}</Text>
      </View>
      {latestResult ? (
        <Text style={styles.latestHint}>{copy('Your previous result stays saved in Tatzo.', 'Votre résultat précédent reste enregistré dans Tatzo.', 'Предыдущий результат остаётся сохранён в Tatzo.')}</Text>
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

function DeckBackCard({ card, depth }: { card: StyleMatchCard; depth: 1 | 2 }) {
  return (
    <View style={[styles.deckBack, depth === 1 ? styles.deckBackOne : styles.deckBackTwo]} pointerEvents="none">
      <Image source={{ uri: card.image_url }} resizeMode="cover" style={styles.cardImage} />
      <View style={styles.backTint} />
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
  const isLike = variant === 'like';
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        isLike && styles.actionButtonLike,
        variant === 'saveActive' && styles.actionButtonSaveActive,
        disabled && styles.disabled,
        pressed && styles.actionPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isLike ? colors.white : colors.primary} />
      ) : (
        <Text style={[styles.actionSymbol, isLike && styles.actionSymbolLike, variant === 'saveActive' && styles.actionSymbolSaveActive]}>{symbol}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  centerScreen: { justifyContent: 'center', alignItems: 'center', gap: spacing.lg, paddingBottom: spacing.xxl },
  resultScreen: { paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  discoveryScreen: { paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: 14, overflow: 'hidden' },
  onboardingScreen: { paddingTop: 18, paddingBottom: spacing.xxl, overflow: 'hidden' },
  wordmark: { color: colors.white, fontSize: 22, lineHeight: 26, fontWeight: '800', letterSpacing: -1.3 },
  wordmarkDot: { color: colors.primary },
  loadingOrb: { width: 92, height: 92, borderRadius: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(4,197,191,.08)', borderWidth: 1, borderColor: 'rgba(4,197,191,.25)' },
  muted: { color: colors.textMuted, lineHeight: 20, textAlign: 'center' },
  ambientTeal: { position: 'absolute', width: 350, height: 350, borderRadius: 175, backgroundColor: 'rgba(9,200,194,.12)', top: -190, left: -190 },
  ambientPink: { position: 'absolute', width: 350, height: 350, borderRadius: 175, backgroundColor: 'rgba(237,11,112,.10)', bottom: -150, right: -200 },
  onboardingCard: { backgroundColor: 'rgba(0,15,24,.92)', borderWidth: 1, borderColor: 'rgba(150,230,232,.20)', borderRadius: 28, padding: 22, gap: 18 },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  kicker: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(141,243,236,.20)', backgroundColor: 'rgba(7,28,38,.74)' },
  kickerText: { color: '#8df3ec', fontSize: 10, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' },
  previewDeck: { height: 235, alignItems: 'center', justifyContent: 'center', position: 'relative', marginHorizontal: -8 },
  previewCard: { position: 'absolute', width: '72%', height: 166, borderRadius: 25, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(210,255,255,.25)', backgroundColor: '#0f323b' },
  previewCenter: { zIndex: 3, transform: [{ translateY: -2 }] },
  previewLeft: { transform: [{ translateX: -48 }, { translateY: 8 }, { rotate: '-11deg' }] },
  previewRight: { transform: [{ translateX: 48 }, { translateY: 10 }, { rotate: '10deg' }] },
  previewImage: { width: '100%', height: '100%' },
  previewFallback: { flex: 1, backgroundColor: '#10242b', overflow: 'hidden' },
  previewSheen: { position: 'absolute', width: '130%', height: 52, backgroundColor: 'rgba(9,200,194,.12)', transform: [{ rotate: '-18deg' }, { translateY: 48 }] },
  visualPill: { position: 'absolute', zIndex: 5, bottom: 2, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(1,14,22,.94)', borderWidth: 1, borderColor: 'rgba(150,230,232,.20)' },
  visualPillText: { color: colors.white, fontSize: 11, fontWeight: '700', letterSpacing: .7, textTransform: 'uppercase' },
  onboardingCopy: { gap: 10 },
  eyebrow: { color: '#8df3ec', fontSize: 11, fontWeight: '700', letterSpacing: 1.55, textTransform: 'uppercase' },
  onboardingTitle: { color: colors.white, fontFamily: 'serif', fontSize: 37, lineHeight: 39, fontWeight: '700', letterSpacing: -1.2 },
  onboardingBody: { color: '#a7c1c8', fontSize: 16, lineHeight: 25 },
  primaryButton: { minHeight: 56, marginTop: 12, borderRadius: 18, backgroundColor: '#09c8c2', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 26 },
  primaryButtonText: { color: '#001317', fontSize: 15, fontWeight: '800' },
  primaryButtonStar: { color: '#001317', fontSize: 18, fontWeight: '900' },
  primaryPressed: { transform: [{ translateY: -2 }], opacity: .9 },
  footnote: { color: '#6f9199', fontSize: 12, lineHeight: 17, textAlign: 'center' },
  latestHint: { color: colors.textSubtle, fontSize: 10, textAlign: 'center', marginTop: spacing.sm },
  deckHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  progressCopy: { alignItems: 'flex-end', gap: 2 },
  progressLabel: { color: '#8df3ec', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  progressCount: { color: colors.white, fontSize: 14, fontWeight: '800' },
  progressTrack: { height: 5, borderRadius: 999, backgroundColor: 'rgba(190,225,229,.18)', overflow: 'hidden', marginVertical: 4 },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 999 },
  toast: { alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#08202a', borderWidth: 1, borderColor: 'rgba(150,230,232,.20)' },
  toastText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  deck: { minHeight: 492, width: '100%', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  deckBack: { position: 'absolute', width: '88%', height: 440, borderRadius: 30, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(210,255,255,.14)', backgroundColor: '#10242b' },
  deckBackTwo: { transform: [{ translateY: 20 }, { scale: .91 }], opacity: .46 },
  deckBackOne: { transform: [{ translateY: 10 }, { scale: .96 }], opacity: .78 },
  backTint: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,11,19,.18)' },
  card: { zIndex: 5, width: '88%', height: 440, borderRadius: 30, overflow: 'hidden', backgroundColor: '#10242b', borderWidth: 1, borderColor: 'rgba(210,255,255,.22)' },
  cardImage: { width: '100%', height: '100%' },
  cardShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '30%', backgroundColor: 'rgba(0,6,10,.18)' },
  imageLoader: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#10242b' },
  stamp: { position: 'absolute', top: 38, paddingHorizontal: 13, paddingVertical: 8, borderWidth: 3, borderRadius: 10 },
  likeStamp: { left: 24, borderColor: '#8df3ec', transform: [{ rotate: '-10deg' }] },
  nopeStamp: { right: 24, borderColor: '#ff6294', transform: [{ rotate: '10deg' }] },
  likeStampText: { color: '#8df3ec', fontSize: 19, fontWeight: '900', letterSpacing: 2.2 },
  nopeStampText: { color: '#ff6294', fontSize: 19, fontWeight: '900', letterSpacing: 2.2 },
  savedBadge: { position: 'absolute', right: 18, bottom: 18, width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  savedBadgeText: { color: '#001317', fontSize: 20, fontWeight: '900' },
  actions: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 14, marginTop: 4 },
  actionButton: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(150,230,232,.20)', backgroundColor: 'rgba(14,34,42,.92)' },
  actionButtonLike: { width: 64, height: 64, borderRadius: 32, borderColor: '#ed0b70', backgroundColor: '#ed0b70' },
  actionButtonSaveActive: { borderColor: colors.primary },
  actionSymbol: { color: '#d9edf0', fontSize: 25, lineHeight: 29, fontWeight: '500' },
  actionSymbolLike: { color: colors.white, fontSize: 29 },
  actionSymbolSaveActive: { color: colors.primary },
  disabled: { opacity: .5 },
  actionPressed: { transform: [{ translateY: -3 }] },
  hint: { color: '#77959d', fontSize: 12, textAlign: 'center', lineHeight: 17, marginTop: 2 },
  stateCard: { padding: spacing.xl, borderRadius: 24, backgroundColor: '#071c26', borderWidth: 1, borderColor: 'rgba(150,230,232,.20)', gap: spacing.md },
  stateTitle: { color: colors.white, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  analysisCard: { width: '100%', alignItems: 'center', gap: spacing.md, padding: spacing.xl, borderRadius: 28, backgroundColor: '#071c26', borderWidth: 1, borderColor: 'rgba(150,230,232,.20)' },
  analysisOrb: { width: 150, height: 150, borderRadius: 75, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  orbRingOne: { position: 'absolute', width: 150, height: 150, borderRadius: 75, borderWidth: 2, borderColor: 'rgba(9,200,194,.30)', borderTopColor: colors.accent },
  orbRingTwo: { position: 'absolute', width: 108, height: 108, borderRadius: 54, borderWidth: 1, borderColor: 'rgba(237,11,112,.30)', borderRightColor: colors.primary },
  orbGlyph: { color: colors.white, fontSize: 34 },
  analysisTitle: { color: colors.white, fontFamily: 'serif', fontSize: 30, lineHeight: 34, fontWeight: '700', textAlign: 'center', letterSpacing: -.8 },
  analysisMessage: { color: '#8df3ec', fontWeight: '700', textAlign: 'center', minHeight: 22 },
  analysisMeter: { width: '100%', height: 5, borderRadius: 999, overflow: 'hidden', backgroundColor: 'rgba(190,225,229,.18)', marginTop: 12 },
  analysisFill: { height: '100%', backgroundColor: colors.primary },
  error: { color: colors.danger, textAlign: 'center', padding: spacing.sm },
});

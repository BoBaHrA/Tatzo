import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { StyleMatchResult as StyleMatchResultData } from '@/api/types';
import { Button } from '@/components/button';
import { appLanguage, t } from '@/i18n';
import { colors, spacing } from '@/theme';


type Props = {
  result: StyleMatchResultData;
  onRestart: () => void;
  restarting: boolean;
};

const WEB = {
  bg: '#000b13',
  surface: '#071c26',
  surface2: '#0d2832',
  border: 'rgba(150,230,232,.20)',
  text: '#f4ffff',
  muted: '#a7c1c8',
  teal: '#09c8c2',
  tealSoft: '#8df3ec',
  pink: '#ed0b70',
};

function copy(en: string, fr: string, ru: string) {
  if (appLanguage === 'fr') return fr;
  if (appLanguage === 'ru') return ru;
  return en;
}

export function StyleMatchResultV3({ result, onRestart, restarting }: Props) {
  const peopleCopy = result.community_count === 1
    ? copy('person shares your tattoo personality.', 'personne partage votre personnalité tattoo.', 'человек разделяет твою тату-персональность.')
    : copy('people share your tattoo personality.', 'personnes partagent votre personnalité tattoo.', 'человек разделяют твою тату-персональность.');

  return (
    <View style={styles.wrap}>
      <ResultAmbient />

      <View style={styles.resultsHeader}>
        <Image
          accessibilityLabel="Tatzo"
          resizeMode="contain"
          source={require('../../assets/tatzo7.png')}
          style={styles.logo}
        />
        <View style={styles.completeBadge}>
          <Text style={styles.completeText}>{copy('Style Match complete', 'Style Match terminé', 'Style Match завершён')}</Text>
        </View>
      </View>

      <View style={styles.hero}>
        <View pointerEvents="none" style={styles.heroGlowWide} />
        <View pointerEvents="none" style={styles.heroGlowCore} />
        <Text style={styles.eyebrow}>{copy('YOUR STYLE MATCH', 'VOTRE STYLE MATCH', 'ТВОЙ STYLE MATCH')}</Text>
        <View style={styles.matchLockup}>
          <Text style={styles.confidence}>{result.match_confidence}%</Text>
          <View style={styles.matchCopy}>
            <Text style={styles.confidenceLabel}>{t('styleMatchConfidence')}</Text>
            <Text style={styles.topStyle}>{result.top_style.label}</Text>
          </View>
        </View>
      </View>

      <Panel title={copy('Your style spectrum', 'Votre spectre de styles', 'Твой спектр стилей')}>
        <View style={styles.spectrum}>
          {result.styles.map((style, index) => (
            <View key={style.slug} style={styles.scoreRow}>
              <View style={styles.scoreLabels}>
                <Text style={styles.scoreName}>{style.label}</Text>
                <Text style={styles.scoreValue}>{style.score}%</Text>
              </View>
              <View style={styles.track}>
                <View
                  style={[
                    styles.fill,
                    index === 1 && styles.fillPink,
                    { width: `${Math.max(3, Math.min(100, style.score))}%` },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>
      </Panel>

      <View style={styles.personalityCard}>
        <View pointerEvents="none" style={styles.personalityDeep} />
        <View pointerEvents="none" style={styles.personalityGlow} />
        <Text style={styles.personalityEyebrow}>{copy('TATTOO PERSONALITY', 'PERSONNALITÉ TATOUAGE', 'ТАТУ-ПЕРСОНАЛЬНОСТЬ')}</Text>
        <Text style={styles.personalityTitle}>{result.personality.label}</Text>
        <Text style={styles.personalityBody}>{result.personality.description}</Text>
      </View>

      <SavedReferences result={result} />

      <TraitPanel title={t('styleMatchDrawnTo')} values={result.drawn_to} positive />
      <TraitPanel title={t('styleMatchSkip')} values={result.tend_to_skip} />

      <Panel title={t('styleMatchArtists')}>
        {result.artists.length ? (
          <View style={styles.artistList}>
            {result.artists.map((artist) => (
              <Pressable
                accessibilityRole="button"
                key={artist.username}
                onPress={() => router.push({ pathname: '/profile/[username]', params: { username: artist.username } })}
                style={({ pressed }) => [styles.artistCard, pressed && styles.pressed]}
              >
                {artist.image_url ? (
                  <Image source={{ uri: artist.image_url }} style={styles.artistAvatar} />
                ) : (
                  <View style={[styles.artistAvatar, styles.artistFallback]}>
                    <Text style={styles.artistLetter}>{artist.username[0]?.toUpperCase()}</Text>
                  </View>
                )}
                <View style={styles.artistCopy}>
                  <Text numberOfLines={1} style={styles.artistName}>{artist.username}</Text>
                  <Text numberOfLines={1} style={styles.artistMeta}>
                    {artist.top_style} · {artist.location || copy('Location pending', 'Localisation à confirmer', 'Локация уточняется')}
                  </Text>
                </View>
                <Text style={styles.artistScoreValue}>{artist.score}%</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.muted}>{copy(
            'Artist matches will appear as verified portfolios gain style labels.',
            'Les correspondances apparaîtront avec les portfolios vérifiés.',
            'Подходящие мастера появятся по мере разметки верифицированных портфолио.',
          )}</Text>
        )}
      </Panel>

      <Panel title={copy('Made for your mood', 'Pensé pour votre humeur', 'Под твоё настроение')}>
        <Text style={styles.panelSubtitle}>{copy(
          'Based on your results, explore these next.',
          'À partir de vos résultats, explorez ceci.',
          'По результатам попробуй исследовать это дальше.',
        )}</Text>
        <View style={styles.tagCloud}>
          {result.styles.slice(0, 5).map((style) => (
            <View key={style.slug} style={styles.tag}><Text style={styles.tagText}>{style.label}</Text></View>
          ))}
        </View>
      </Panel>

      <View style={styles.communityCard}>
        <View pointerEvents="none" style={styles.communityBlue} />
        <View pointerEvents="none" style={styles.communityTeal} />
        <Text style={styles.eyebrow}>{copy('YOUR PEOPLE', 'VOTRE COMMUNAUTÉ', 'ТВОИ ЛЮДИ')}</Text>
        <Text style={styles.communityHeadline}>{result.community_count} {result.personality.label}</Text>
        <Text style={styles.communityCopy}>{peopleCopy}</Text>
      </View>

      <Panel title={copy('Your unlocks', 'Vos succès', 'Твои достижения')}>
        <View style={styles.achievementGrid}>
          <Achievement icon="✦" title={copy('First Style Match', 'Premier Style Match', 'Первый Style Match')} unlocked />
          <Achievement icon="◉" title={copy('Tattoo Explorer', 'Explorateur tattoo', 'Tattoo Explorer')} unlocked />
          <Achievement
            icon="⌑"
            title={copy('Master Collector', 'Maître collectionneur', 'Master Collector')}
            detail={`${result.saved_count} ${copy('saved', 'sauvegardés', 'сохранено')}`}
          />
          <Achievement
            icon="◎"
            title={copy('Style Expert', 'Expert style', 'Style Expert')}
            detail={copy('Keep exploring', 'Continuez à explorer', 'Продолжай исследовать')}
          />
        </View>
      </Panel>

      <View style={styles.wrappedCard}>
        <View pointerEvents="none" style={styles.wrappedBlue} />
        <View pointerEvents="none" style={styles.wrappedPink} />
        <Text style={styles.wrappedEyebrow}>{copy('YOUR SESSION', 'VOTRE SESSION', 'ТВОЯ СЕССИЯ')}</Text>
        <Text style={styles.wrappedTitle}>Tatzo Wrapped</Text>
        <WrappedRow label={copy('Your style', 'Votre style', 'Твой стиль')} value={result.top_style.label} />
        <WrappedRow label={copy('Cards explored', 'Cartes explorées', 'Карточек просмотрено')} value={String(result.completed_count)} />
        <WrappedRow label={copy('Personality', 'Personnalité', 'Персональность')} value={result.personality.label} last />
      </View>

      <View style={styles.actions}>
        <Button label={t('styleMatchTryAgain')} loading={restarting} onPress={onRestart} variant="secondary" />
        <Button label={t('styleMatchBackHome')} onPress={() => router.replace('/(tabs)/home')} />
      </View>
    </View>
  );
}

function ResultAmbient() {
  return (
    <View pointerEvents="none" style={styles.resultAmbient}>
      <View style={[styles.ambientOrb, styles.ambientTealOuter]} />
      <View style={[styles.ambientOrb, styles.ambientTealInner]} />
      <View style={[styles.ambientOrb, styles.ambientPinkOuter]} />
      <View style={[styles.ambientOrb, styles.ambientPinkInner]} />
    </View>
  );
}

function SavedReferences({ result }: { result: StyleMatchResultData }) {
  return (
    <View style={styles.panel}>
      <View style={styles.savedHead}>
        <View style={styles.savedHeadCopy}>
          <Text style={styles.panelTitle}>{copy('Your saved references', 'Vos références enregistrées', 'Сохранённые референсы')}</Text>
          <Text style={styles.panelSubtitle}>{copy(
            'Tattoo ideas you bookmarked while discovering your style.',
            'Les idées enregistrées pendant la découverte de votre style.',
            'Идеи татуировок, которые ты сохранил во время подбора стиля.',
          )}</Text>
        </View>
        <View style={styles.savedCount}><Text style={styles.savedCountText}>{result.saved_cards.length}</Text></View>
      </View>

      {result.saved_cards.length ? (
        <View style={styles.savedGrid}>
          {result.saved_cards.map((card) => (
            <View key={card.id} style={styles.savedTile}>
              <Image accessibilityLabel={card.alt} resizeMode="cover" source={{ uri: card.image_url }} style={styles.savedImage} />
              <View style={styles.savedBadge}><Text style={styles.savedBadgeText}>⌑</Text></View>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.savedEmpty}>
          <Text style={styles.savedEmptyText}>{copy(
            'You did not save any references during this Style Match.',
            'Vous n’avez enregistré aucune référence pendant ce Style Match.',
            'Во время этого Style Match ты не сохранил ни одного референса.',
          )}</Text>
        </View>
      )}
    </View>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.panel}><Text style={styles.panelTitle}>{title}</Text>{children}</View>;
}

function TraitPanel({ title, values, positive = false }: { title: string; values: string[]; positive?: boolean }) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{title}</Text>
      <View style={styles.traitList}>
        {values.slice(0, 6).map((value) => (
          <View key={value} style={styles.traitRow}>
            <Text style={[styles.traitMark, positive ? styles.positive : styles.negative]}>{positive ? '✓' : '×'}</Text>
            <Text style={styles.traitText}>{value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Achievement({ icon, title, unlocked = false, detail }: { icon: string; title: string; unlocked?: boolean; detail?: string }) {
  return (
    <View style={[styles.achievement, unlocked && styles.achievementUnlocked]}>
      <Text style={styles.achievementIcon}>{icon}</Text>
      <View style={styles.achievementCopy}>
        <Text style={styles.achievementTitle}>{title}</Text>
        <Text style={styles.achievementDetail}>{unlocked ? copy('Unlocked', 'Débloqué', 'Открыто') : detail}</Text>
      </View>
    </View>
  );
}

function WrappedRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.wrappedRow, last && styles.wrappedRowLast]}>
      <Text style={styles.wrappedLabel}>{label}</Text>
      <Text style={styles.wrappedValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', gap: 20, paddingBottom: 10 },
  resultAmbient: { position: 'absolute', top: -180, left: -120, right: -120, bottom: -170, overflow: 'hidden' },
  ambientOrb: { position: 'absolute', borderRadius: 999 },
  ambientTealOuter: { width: 520, height: 440, top: -230, left: -250, backgroundColor: 'rgba(9,200,194,.025)' },
  ambientTealInner: { width: 310, height: 270, top: -135, left: -150, backgroundColor: 'rgba(9,200,194,.065)' },
  ambientPinkOuter: { width: 540, height: 460, right: -275, bottom: -230, backgroundColor: 'rgba(237,11,112,.022)' },
  ambientPinkInner: { width: 320, height: 280, right: -155, bottom: -130, backgroundColor: 'rgba(237,11,112,.060)' },

  resultsHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingHorizontal: 2, zIndex: 2 },
  logo: { width: 92, height: 34 },
  completeBadge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: 'rgba(7,28,38,.85)', borderWidth: 1, borderColor: WEB.border },
  completeText: { color: WEB.tealSoft, fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.15 },

  hero: { position: 'relative', overflow: 'hidden', minHeight: 148, borderRadius: 28, padding: 24, justifyContent: 'center', gap: 12, backgroundColor: '#062a33', zIndex: 1 },
  heroGlowWide: { position: 'absolute', width: 430, height: 240, borderRadius: 215, right: -145, bottom: -120, backgroundColor: 'rgba(11,65,71,.92)' },
  heroGlowCore: { position: 'absolute', width: 230, height: 170, borderRadius: 120, right: -30, bottom: -85, backgroundColor: 'rgba(9,200,194,.09)' },
  eyebrow: { color: WEB.tealSoft, fontSize: 10, fontWeight: '800', letterSpacing: 1.6, textTransform: 'uppercase' },
  matchLockup: { flexDirection: 'row', alignItems: 'flex-end', gap: 18, zIndex: 1 },
  confidence: { color: WEB.teal, fontFamily: 'serif', fontSize: 62, lineHeight: 62, fontWeight: '700', letterSpacing: -4.2 },
  matchCopy: { flex: 1, gap: 4, paddingBottom: 4 },
  confidenceLabel: { color: WEB.tealSoft, fontSize: 9, lineHeight: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  topStyle: { color: WEB.text, fontFamily: 'serif', fontSize: 28, lineHeight: 31, fontWeight: '700', letterSpacing: -1 },

  panel: { backgroundColor: 'rgba(7,28,38,.90)', borderWidth: 1, borderColor: WEB.border, borderRadius: 24, padding: 22, gap: 18, zIndex: 1 },
  panelTitle: { color: WEB.text, fontFamily: 'serif', fontSize: 24, lineHeight: 28, fontWeight: '700', letterSpacing: -.75 },
  panelSubtitle: { color: WEB.muted, fontSize: 13, lineHeight: 20 },

  spectrum: { gap: 17 },
  scoreRow: { gap: 8 },
  scoreLabels: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  scoreName: { color: WEB.text, fontSize: 13, fontWeight: '700', flex: 1 },
  scoreValue: { color: WEB.muted, fontSize: 12, fontWeight: '800' },
  track: { height: 7, borderRadius: 999, overflow: 'hidden', backgroundColor: 'rgba(190,225,229,.18)' },
  fill: { height: '100%', backgroundColor: WEB.teal, borderRadius: 999 },
  fillPink: { backgroundColor: WEB.pink },

  personalityCard: { position: 'relative', overflow: 'hidden', minHeight: 164, borderRadius: 28, padding: 24, gap: 9, backgroundColor: '#c90a62', zIndex: 1 },
  personalityDeep: { position: 'absolute', width: 360, height: 260, borderRadius: 180, right: -145, bottom: -120, backgroundColor: '#891247' },
  personalityGlow: { position: 'absolute', width: 220, height: 180, borderRadius: 110, left: -100, top: -85, backgroundColor: 'rgba(255,126,182,.10)' },
  personalityEyebrow: { color: '#ffd8e8', fontSize: 10, fontWeight: '800', letterSpacing: 1.55, textTransform: 'uppercase' },
  personalityTitle: { color: WEB.text, fontFamily: 'serif', fontSize: 28, lineHeight: 32, fontWeight: '700', letterSpacing: -.8, zIndex: 1 },
  personalityBody: { color: 'rgba(255,255,255,.92)', fontSize: 13, lineHeight: 21, zIndex: 1 },

  savedHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  savedHeadCopy: { flex: 1, gap: 7 },
  savedCount: { minWidth: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(9,200,194,.09)', borderWidth: 1, borderColor: 'rgba(141,243,236,.22)' },
  savedCountText: { color: WEB.tealSoft, fontSize: 13, fontWeight: '900' },
  savedGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  savedTile: { position: 'relative', width: '48%', aspectRatio: .82, overflow: 'hidden', borderRadius: 18, borderWidth: 1, borderColor: 'rgba(210,255,255,.16)', backgroundColor: '#10242b' },
  savedImage: { width: '100%', height: '100%' },
  savedBadge: { position: 'absolute', right: 9, bottom: 9, width: 31, height: 31, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,19,23,.88)', borderWidth: 1, borderColor: 'rgba(141,243,236,.18)' },
  savedBadgeText: { color: WEB.teal, fontSize: 17, fontWeight: '900' },
  savedEmpty: { minHeight: 86, alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 17, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(210,255,255,.15)' },
  savedEmptyText: { color: '#829fa6', fontSize: 12, lineHeight: 18, textAlign: 'center' },

  traitList: { gap: 12 },
  traitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  traitMark: { width: 17, fontSize: 14, lineHeight: 19, fontWeight: '900', textAlign: 'center' },
  positive: { color: WEB.teal },
  negative: { color: '#ff6294' },
  traitText: { flex: 1, color: '#d8e9ec', fontSize: 13, lineHeight: 19 },

  artistList: { gap: 11 },
  artistCard: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 11, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(150,230,232,.16)', backgroundColor: 'rgba(13,40,50,.48)' },
  artistAvatar: { width: 50, height: 50, borderRadius: 16 },
  artistFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#163842' },
  artistLetter: { color: WEB.teal, fontWeight: '900' },
  artistCopy: { flex: 1, minWidth: 0, gap: 4 },
  artistName: { color: WEB.text, fontSize: 14, fontWeight: '800' },
  artistMeta: { color: WEB.muted, fontSize: 10, lineHeight: 14 },
  artistScoreValue: { color: WEB.teal, fontSize: 19, fontWeight: '900' },
  muted: { color: WEB.muted, fontSize: 13, lineHeight: 20 },

  tagCloud: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(9,200,194,.42)', backgroundColor: 'rgba(9,200,194,.035)' },
  tagText: { color: '#dffeff', fontSize: 11, fontWeight: '700' },

  communityCard: { position: 'relative', overflow: 'hidden', minHeight: 142, borderRadius: 28, padding: 24, gap: 7, backgroundColor: '#06313a', zIndex: 1 },
  communityBlue: { position: 'absolute', width: 360, height: 245, borderRadius: 180, right: -150, bottom: -130, backgroundColor: '#101c35' },
  communityTeal: { position: 'absolute', width: 180, height: 150, borderRadius: 90, left: -80, top: -90, backgroundColor: 'rgba(9,200,194,.07)' },
  communityHeadline: { color: WEB.text, fontFamily: 'serif', fontSize: 26, lineHeight: 30, fontWeight: '700', letterSpacing: -.7, zIndex: 1 },
  communityCopy: { color: WEB.muted, fontSize: 13, lineHeight: 19, zIndex: 1 },

  achievementGrid: { gap: 10 },
  achievement: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 13, padding: 14, borderRadius: 17, backgroundColor: 'rgba(13,40,50,.62)', borderWidth: 1, borderColor: 'rgba(150,230,232,.12)', opacity: .48 },
  achievementUnlocked: { opacity: 1 },
  achievementIcon: { width: 26, color: WEB.teal, fontSize: 18, textAlign: 'center' },
  achievementCopy: { flex: 1, gap: 3 },
  achievementTitle: { color: WEB.text, fontSize: 13, fontWeight: '800' },
  achievementDetail: { color: WEB.muted, fontSize: 10 },

  wrappedCard: { position: 'relative', overflow: 'hidden', borderRadius: 28, padding: 24, gap: 7, backgroundColor: '#0b2d40', zIndex: 1 },
  wrappedBlue: { position: 'absolute', width: 300, height: 220, borderRadius: 150, left: -150, top: -100, backgroundColor: 'rgba(16,59,77,.75)' },
  wrappedPink: { position: 'absolute', width: 360, height: 250, borderRadius: 180, right: -155, bottom: -135, backgroundColor: '#32142e' },
  wrappedEyebrow: { color: '#ff9bc6', fontSize: 10, fontWeight: '800', letterSpacing: 1.55, textTransform: 'uppercase', zIndex: 1 },
  wrappedTitle: { color: WEB.text, fontFamily: 'serif', fontSize: 27, lineHeight: 31, fontWeight: '700', letterSpacing: -.75, zIndex: 1 },
  wrappedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,.13)', zIndex: 1 },
  wrappedRowLast: { borderBottomWidth: 0, paddingBottom: 2 },
  wrappedLabel: { color: WEB.muted, fontSize: 12, lineHeight: 18, flex: 1 },
  wrappedValue: { color: WEB.text, fontSize: 12, lineHeight: 18, fontWeight: '800', textAlign: 'right', flex: 1 },

  actions: { gap: 10, paddingTop: 2, zIndex: 1 },
  pressed: { opacity: .74, transform: [{ scale: .99 }] },
});

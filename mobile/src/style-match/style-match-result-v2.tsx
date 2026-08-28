import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { StyleMatchResult as StyleMatchResultData } from '@/api/types';
import { Button } from '@/components/button';
import { appLanguage, t } from '@/i18n';
import { colors, radius, spacing } from '@/theme';


type Props = {
  result: StyleMatchResultData;
  onRestart: () => void;
  restarting: boolean;
};

function copy(en: string, fr: string, ru: string) {
  if (appLanguage === 'fr') return fr;
  if (appLanguage === 'ru') return ru;
  return en;
}

export function StyleMatchResultV2({ result, onRestart, restarting }: Props) {
  return (
    <View style={styles.wrap}>
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
        <View pointerEvents="none" style={styles.heroTealGlow} />
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
        <View pointerEvents="none" style={styles.personalityShade} />
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
                    {artist.top_style}{artist.location ? ` · ${artist.location}` : ''}
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
        <Text style={styles.panelSubtitle}>{copy('Based on your results, explore these next.', 'À partir de vos résultats, explorez ceci.', 'По результатам попробуй исследовать это дальше.')}</Text>
        <View style={styles.tagCloud}>
          {[...result.drawn_to, ...result.styles.slice(0, 3).map((style) => style.label)].slice(0, 8).map((tag) => (
            <View key={tag} style={styles.tag}><Text style={styles.tagText}>{tag}</Text></View>
          ))}
        </View>
      </Panel>

      <View style={styles.communityCard}>
        <View pointerEvents="none" style={styles.communityGlow} />
        <Text style={styles.eyebrow}>{copy('YOUR PEOPLE', 'VOTRE COMMUNAUTÉ', 'ТВОИ ЛЮДИ')}</Text>
        <Text style={styles.communityNumber}>{result.community_count}</Text>
        <Text style={styles.communityCopy}>{t('styleMatchCommunity')}</Text>
      </View>

      <Panel title={copy('Your unlocks', 'Vos succès', 'Твои достижения')}>
        <View style={styles.achievementGrid}>
          <Achievement icon="✦" title={copy('First Style Match', 'Premier Style Match', 'Первый Style Match')} unlocked />
          <Achievement icon="◉" title={copy('Tattoo Explorer', 'Explorateur tattoo', 'Tattoo Explorer')} unlocked />
          <Achievement icon="⌑" title={copy('Master Collector', 'Maître collectionneur', 'Master Collector')} detail={`${result.saved_count} ${copy('saved', 'sauvegardés', 'сохранено')}`} />
          <Achievement icon="◎" title={copy('Style Expert', 'Expert style', 'Style Expert')} detail={copy('Keep exploring', 'Continuez à explorer', 'Продолжай исследовать')} />
        </View>
      </Panel>

      <View style={styles.wrappedCard}>
        <View pointerEvents="none" style={styles.wrappedPinkGlow} />
        <Text style={styles.wrappedEyebrow}>{copy('YOUR SESSION', 'VOTRE SESSION', 'ТВОЯ СЕССИЯ')}</Text>
        <Text style={styles.wrappedTitle}>Tatzo Wrapped</Text>
        <WrappedRow label={copy('Your style', 'Votre style', 'Твой стиль')} value={result.top_style.label} />
        <WrappedRow label={copy('Cards explored', 'Cartes explorées', 'Карточек просмотрено')} value={String(result.completed_count)} />
        <WrappedRow label={copy('Personality', 'Personnalité', 'Персональность')} value={result.personality.label} />
      </View>

      <View style={styles.actions}>
        <Button label={t('styleMatchTryAgain')} loading={restarting} onPress={onRestart} variant="secondary" />
        <Button label={t('styleMatchBackHome')} onPress={() => router.replace('/(tabs)/home')} />
      </View>
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
              <Image accessibilityLabel={card.alt} source={{ uri: card.image_url }} style={styles.savedImage} />
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
        <Text style={styles.achievementDetail}>{unlocked ? 'Unlocked' : detail}</Text>
      </View>
    </View>
  );
}

function WrappedRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.wrappedRow}><Text style={styles.wrappedLabel}>{label}</Text><Text style={styles.wrappedValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  resultsHeader: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  logo: { width: 86, height: 31 },
  completeBadge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(4,197,191,.10)', borderWidth: 1, borderColor: 'rgba(4,197,191,.24)' },
  completeText: { color: colors.primary, fontSize: 8, fontWeight: '900', textTransform: 'uppercase', letterSpacing: .7 },
  hero: { position: 'relative', overflow: 'hidden', backgroundColor: '#082b34', borderRadius: 24, padding: 22, gap: spacing.sm },
  heroTealGlow: { position: 'absolute', width: 220, height: 180, borderRadius: 100, right: -80, bottom: -100, backgroundColor: 'rgba(4,197,191,.18)' },
  eyebrow: { color: colors.primary, fontSize: 9, fontWeight: '900', letterSpacing: 1.7 },
  matchLockup: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  confidence: { color: colors.primary, fontSize: 53, lineHeight: 57, fontWeight: '900', letterSpacing: -3 },
  matchCopy: { flex: 1, gap: 2 },
  confidenceLabel: { color: '#8df3ec', fontSize: 8, fontWeight: '900', textTransform: 'uppercase', letterSpacing: .8 },
  topStyle: { color: colors.white, fontSize: 22, lineHeight: 26, fontWeight: '900' },
  panel: { backgroundColor: 'rgba(7,28,38,.90)', borderWidth: 1, borderColor: 'rgba(150,230,232,.16)', borderRadius: 21, padding: 17, gap: 14 },
  panelTitle: { color: colors.white, fontSize: 17, lineHeight: 22, fontWeight: '900' },
  panelSubtitle: { color: '#8eacb3', fontSize: 12, lineHeight: 18 },
  spectrum: { gap: 12 },
  scoreRow: { gap: 6 },
  scoreLabels: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  scoreName: { color: colors.text, fontSize: 12, fontWeight: '800', flex: 1 },
  scoreValue: { color: colors.textMuted, fontSize: 11, fontWeight: '900' },
  track: { height: 6, borderRadius: 4, overflow: 'hidden', backgroundColor: 'rgba(190,225,229,.17)' },
  fill: { height: '100%', backgroundColor: '#09c8c2', borderRadius: 4 },
  fillPink: { backgroundColor: '#ed0b70' },
  personalityCard: { position: 'relative', overflow: 'hidden', backgroundColor: '#c90a62', borderRadius: 24, padding: 20, gap: 8 },
  personalityShade: { position: 'absolute', width: 180, height: 180, borderRadius: 90, right: -65, bottom: -85, backgroundColor: 'rgba(94,9,48,.42)' },
  personalityEyebrow: { color: '#ffd8e8', fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  personalityTitle: { color: colors.white, fontSize: 27, fontWeight: '900', letterSpacing: -.7 },
  personalityBody: { color: 'rgba(255,255,255,.90)', fontSize: 13, lineHeight: 20 },
  savedHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  savedHeadCopy: { flex: 1, gap: 5 },
  savedCount: { minWidth: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(4,197,191,.11)', borderWidth: 1, borderColor: 'rgba(4,197,191,.30)' },
  savedCountText: { color: '#8df3ec', fontWeight: '900' },
  savedGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  savedTile: { position: 'relative', width: '48.5%', aspectRatio: .8, overflow: 'hidden', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(210,255,255,.14)', backgroundColor: '#10242b' },
  savedImage: { width: '100%', height: '100%' },
  savedBadge: { position: 'absolute', right: 8, bottom: 8, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,19,23,.84)' },
  savedBadgeText: { color: colors.primary, fontSize: 17, fontWeight: '900' },
  savedEmpty: { minHeight: 72, alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(210,255,255,.14)' },
  savedEmptyText: { color: '#829fa6', fontSize: 11, lineHeight: 17, textAlign: 'center' },
  traitList: { gap: 10 },
  traitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  traitMark: { width: 15, fontWeight: '900', textAlign: 'center' },
  positive: { color: colors.primary },
  negative: { color: '#ff5e8d' },
  traitText: { flex: 1, color: '#d8e9ec', fontSize: 12, lineHeight: 17 },
  artistList: { gap: 10 },
  artistCard: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 9, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(150,230,232,.16)' },
  artistAvatar: { width: 46, height: 46, borderRadius: 14 },
  artistFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#163842' },
  artistLetter: { color: colors.primary, fontWeight: '900' },
  artistCopy: { flex: 1, minWidth: 0, gap: 2 },
  artistName: { color: colors.white, fontSize: 13, fontWeight: '900' },
  artistMeta: { color: colors.textMuted, fontSize: 10 },
  artistScoreValue: { color: colors.primary, fontSize: 18, fontWeight: '900' },
  muted: { color: colors.textMuted, lineHeight: 19 },
  tagCloud: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  tag: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(9,200,194,.42)' },
  tagText: { color: '#dffeff', fontSize: 10, fontWeight: '800' },
  communityCard: { position: 'relative', overflow: 'hidden', backgroundColor: '#0b2b35', borderRadius: 22, padding: 19, gap: 4 },
  communityGlow: { position: 'absolute', width: 170, height: 130, borderRadius: 80, right: -55, bottom: -55, backgroundColor: 'rgba(64,58,139,.27)' },
  communityNumber: { color: colors.primary, fontSize: 36, fontWeight: '900' },
  communityCopy: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  achievementGrid: { gap: 9 },
  achievement: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 16, backgroundColor: 'rgba(255,255,255,.035)', borderWidth: 1, borderColor: 'rgba(150,230,232,.12)', opacity: .55 },
  achievementUnlocked: { opacity: 1 },
  achievementIcon: { width: 24, color: colors.primary, fontSize: 18, textAlign: 'center' },
  achievementCopy: { flex: 1, gap: 2 },
  achievementTitle: { color: colors.white, fontSize: 12, fontWeight: '900' },
  achievementDetail: { color: colors.textMuted, fontSize: 9 },
  wrappedCard: { position: 'relative', overflow: 'hidden', backgroundColor: '#102a39', borderRadius: 23, padding: 19, gap: 8 },
  wrappedPinkGlow: { position: 'absolute', width: 190, height: 170, borderRadius: 95, right: -70, bottom: -85, backgroundColor: 'rgba(238,12,111,.16)' },
  wrappedEyebrow: { color: '#ff9bc6', fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  wrappedTitle: { color: colors.white, fontSize: 23, fontWeight: '900' },
  wrappedRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 14, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,.12)' },
  wrappedLabel: { color: colors.textMuted, fontSize: 11, flex: 1 },
  wrappedValue: { color: colors.white, fontSize: 11, fontWeight: '900', textAlign: 'right', flex: 1 },
  actions: { gap: 9 },
  pressed: { opacity: .72, transform: [{ scale: .99 }] },
});

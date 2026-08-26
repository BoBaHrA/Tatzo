import { router } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

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
        <Text style={styles.wordmark}>tatzo<Text style={styles.dot}>.</Text></Text>
        <View style={styles.completeBadge}>
          <Text style={styles.completeText}>{copy('Style Match complete', 'Style Match terminé', 'Style Match завершён')}</Text>
        </View>
      </View>

      <View style={styles.hero}>
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
        <Text style={styles.personalityEyebrow}>{copy('TATTOO PERSONALITY', 'PERSONNALITÉ TATOUAGE', 'ТАТУ-ПЕРСОНАЛЬНОСТЬ')}</Text>
        <Text style={styles.personalityTitle}>{result.personality.label}</Text>
        <Text style={styles.personalityBody}>{result.personality.description}</Text>
      </View>

      <View style={styles.preferenceRow}>
        <TraitCard
          title={t('styleMatchDrawnTo')}
          values={result.drawn_to}
          mark="✓"
          positive
        />
        <TraitCard
          title={t('styleMatchSkip')}
          values={result.tend_to_skip}
          mark="×"
        />
      </View>

      <Panel title={t('styleMatchArtists')}>
        {result.artists.length ? (
          <View style={styles.artistList}>
            {result.artists.map((artist) => (
              <Pressable
                accessibilityRole="button"
                key={artist.username}
                onPress={() => router.push({
                  pathname: '/profile/[username]',
                  params: { username: artist.username },
                })}
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
                  <Text style={styles.artistName} numberOfLines={1}>{artist.username}</Text>
                  <Text style={styles.artistMeta} numberOfLines={1}>
                    {artist.top_style}{artist.location ? ` · ${artist.location}` : ''}
                  </Text>
                </View>
                <View style={styles.artistScore}>
                  <Text style={styles.artistScoreValue}>{artist.score}%</Text>
                </View>
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

      {result.saved_cards.length ? (
        <Panel title={t('styleMatchSavedRefs')}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.savedRow}>
            {result.saved_cards.map((card) => (
              <Image key={card.id} source={{ uri: card.image_url }} style={styles.savedImage} accessibilityLabel={card.alt} />
            ))}
          </ScrollView>
        </Panel>
      ) : null}

      <View style={styles.wrappedCard}>
        <Text style={styles.eyebrow}>{copy('YOUR SESSION', 'VOTRE SESSION', 'ТВОЯ СЕССИЯ')}</Text>
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

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.panel}><Text style={styles.panelTitle}>{title}</Text>{children}</View>;
}

function TraitCard({ title, values, mark, positive = false }: { title: string; values: string[]; mark: string; positive?: boolean }) {
  return (
    <View style={styles.traitCard}>
      <Text style={styles.panelTitle}>{title}</Text>
      {values.slice(0, 5).map((value) => (
        <View key={value} style={styles.traitRow}>
          <Text style={[styles.traitMark, positive ? styles.positive : styles.negative]}>{mark}</Text>
          <Text style={styles.traitText}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

function Achievement({ icon, title, unlocked = false, detail }: { icon: string; title: string; unlocked?: boolean; detail?: string }) {
  return (
    <View style={[styles.achievement, unlocked && styles.achievementUnlocked]}>
      <Text style={styles.achievementIcon}>{icon}</Text>
      <Text style={styles.achievementTitle}>{title}</Text>
      <Text style={styles.achievementDetail}>{unlocked ? 'Unlocked' : detail}</Text>
    </View>
  );
}

function WrappedRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.wrappedRow}><Text style={styles.wrappedLabel}>{label}</Text><Text style={styles.wrappedValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  resultsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  wordmark: { color: colors.white, fontSize: 29, fontWeight: '900', letterSpacing: -1.5 },
  dot: { color: colors.accent },
  completeBadge: { borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: 'rgba(4,197,191,.10)', borderWidth: 1, borderColor: 'rgba(4,197,191,.24)' },
  completeText: { color: colors.primary, fontSize: 10, fontWeight: '900' },
  hero: { backgroundColor: '#061f28', borderWidth: 1, borderColor: 'rgba(4,197,191,.22)', borderRadius: 26, padding: spacing.xl, gap: spacing.sm },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  matchLockup: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  confidence: { color: colors.primary, fontSize: 56, lineHeight: 61, fontWeight: '900', letterSpacing: -3 },
  matchCopy: { flex: 1, gap: 2 },
  confidenceLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  topStyle: { color: colors.white, fontSize: 25, lineHeight: 29, fontWeight: '900' },
  panel: { backgroundColor: '#00131d', borderWidth: 1, borderColor: 'rgba(4,197,191,.14)', borderRadius: 22, padding: spacing.lg, gap: spacing.md },
  panelTitle: { color: colors.white, fontSize: 18, lineHeight: 23, fontWeight: '900' },
  panelSubtitle: { color: colors.textMuted, lineHeight: 20 },
  spectrum: { gap: 12 },
  scoreRow: { gap: 6 },
  scoreLabels: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  scoreName: { color: colors.text, fontWeight: '800', flex: 1 },
  scoreValue: { color: colors.textMuted, fontWeight: '900' },
  track: { height: 7, borderRadius: 6, overflow: 'hidden', backgroundColor: 'rgba(190,225,229,.14)' },
  fill: { height: '100%', backgroundColor: colors.primary, borderRadius: 6 },
  fillPink: { backgroundColor: colors.accent },
  personalityCard: { backgroundColor: colors.accent, borderRadius: 26, padding: spacing.xl, gap: spacing.sm },
  personalityEyebrow: { color: '#ffd8e8', fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  personalityTitle: { color: colors.white, fontSize: 30, fontWeight: '900', letterSpacing: -0.8 },
  personalityBody: { color: 'rgba(255,255,255,.88)', fontSize: 15, lineHeight: 22 },
  preferenceRow: { flexDirection: 'row', gap: spacing.sm },
  traitCard: { flex: 1, backgroundColor: '#00131d', borderWidth: 1, borderColor: 'rgba(4,197,191,.12)', borderRadius: 20, padding: spacing.md, gap: 9 },
  traitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  traitMark: { width: 16, fontWeight: '900', textAlign: 'center' },
  positive: { color: colors.primary },
  negative: { color: colors.danger },
  traitText: { flex: 1, color: colors.text, fontSize: 12, lineHeight: 17 },
  artistList: { gap: spacing.sm },
  artistCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: 16, backgroundColor: '#031b27', borderWidth: 1, borderColor: 'rgba(4,197,191,.10)' },
  artistAvatar: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderColor: colors.primary },
  artistFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#061f28' },
  artistLetter: { color: colors.primary, fontWeight: '900', fontSize: 18 },
  artistCopy: { flex: 1, minWidth: 0, gap: 2 },
  artistName: { color: colors.white, fontSize: 14, fontWeight: '900' },
  artistMeta: { color: colors.textMuted, fontSize: 11 },
  artistScore: { paddingVertical: 6, paddingHorizontal: 9, backgroundColor: 'rgba(4,197,191,.10)', borderRadius: 12 },
  artistScoreValue: { color: colors.primary, fontWeight: '900' },
  muted: { color: colors.textMuted, lineHeight: 20 },
  tagCloud: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  tag: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: 'rgba(4,197,191,.09)', borderWidth: 1, borderColor: 'rgba(4,197,191,.16)' },
  tagText: { color: '#dffefe', fontSize: 11, fontWeight: '800' },
  communityCard: { backgroundColor: '#06272d', borderRadius: 22, padding: spacing.xl, gap: 5, borderWidth: 1, borderColor: 'rgba(4,197,191,.20)' },
  communityNumber: { color: colors.primary, fontSize: 42, fontWeight: '900' },
  communityCopy: { color: colors.textMuted, lineHeight: 20 },
  achievementGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  achievement: { width: '48.5%', minHeight: 106, padding: 12, borderRadius: 16, backgroundColor: '#031b27', borderWidth: 1, borderColor: 'rgba(255,255,255,.06)', gap: 4 },
  achievementUnlocked: { borderColor: 'rgba(4,197,191,.22)', backgroundColor: 'rgba(4,197,191,.06)' },
  achievementIcon: { color: colors.primary, fontSize: 20 },
  achievementTitle: { color: colors.white, fontSize: 12, fontWeight: '900' },
  achievementDetail: { color: colors.textMuted, fontSize: 10 },
  savedRow: { gap: spacing.sm, paddingRight: spacing.sm },
  savedImage: { width: 126, height: 176, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,.10)', backgroundColor: '#031b27' },
  wrappedCard: { backgroundColor: '#071a26', borderRadius: 24, padding: spacing.xl, gap: spacing.sm, borderWidth: 1, borderColor: 'rgba(238,12,111,.18)' },
  wrappedTitle: { color: colors.white, fontSize: 26, fontWeight: '900' },
  wrappedRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,.08)' },
  wrappedLabel: { color: colors.textMuted, flex: 1 },
  wrappedValue: { color: colors.white, fontWeight: '900', textAlign: 'right', flex: 1 },
  actions: { gap: spacing.sm },
  pressed: { opacity: .72, transform: [{ scale: .99 }] },
});

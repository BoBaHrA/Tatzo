import { router } from 'expo-router';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { StyleMatchResult as StyleMatchResultData } from '@/api/types';
import { Button } from '@/components/button';
import { t } from '@/i18n';
import { colors, radius, spacing } from '@/theme';


type StyleMatchResultProps = {
  result: StyleMatchResultData;
  onRestart: () => void;
  restarting: boolean;
};

export function StyleMatchResult({
  result,
  onRestart,
  restarting,
}: StyleMatchResultProps) {
  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>{t('styleMatchResultEyebrow')}</Text>
        <View style={styles.confidencePill}>
          <Text style={styles.confidenceValue}>{result.match_confidence}%</Text>
          <Text style={styles.confidenceLabel}>{t('styleMatchConfidence')}</Text>
        </View>
        <Text style={styles.personality}>{result.personality.label}</Text>
        <Text style={styles.description}>{result.personality.description}</Text>
        <Text style={styles.community}>
          {result.community_count} {t('styleMatchCommunity')}
        </Text>
      </View>

      <View style={styles.topStyleCard}>
        <Text style={styles.sectionEyebrow}>{t('styleMatchTopStyle')}</Text>
        <View style={styles.topStyleRow}>
          <Text style={styles.topStyleLabel}>{result.top_style.label}</Text>
          <Text style={styles.topStyleScore}>{result.top_style.score}%</Text>
        </View>
        <ScoreBar score={result.top_style.score} accent />
      </View>

      <View style={styles.section}>
        {result.styles.map((style) => (
          <View key={style.slug} style={styles.scoreRow}>
            <View style={styles.scoreLabels}>
              <Text style={styles.scoreName}>{style.label}</Text>
              <Text style={styles.scoreValue}>{style.score}%</Text>
            </View>
            <ScoreBar score={style.score} />
          </View>
        ))}
      </View>

      <TraitSection title={t('styleMatchDrawnTo')} values={result.drawn_to} positive />
      <TraitSection title={t('styleMatchSkip')} values={result.tend_to_skip} />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('styleMatchSavedRefs')}</Text>
        {result.saved_cards.length ? (
          <ScrollView
            contentContainerStyle={styles.referenceRow}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {result.saved_cards.map((card) => (
              <Image
                accessibilityLabel={card.alt}
                key={card.id}
                source={{ uri: card.image_url }}
                style={styles.referenceImage}
              />
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.muted}>{t('styleMatchNoSavedRefs')}</Text>
        )}
      </View>

      {result.artists.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('styleMatchArtists')}</Text>
          <View style={styles.artistList}>
            {result.artists.map((artist) => (
              <Pressable
                accessibilityRole="button"
                key={artist.username}
                onPress={() => router.push({
                  pathname: '/profile/[username]',
                  params: { username: artist.username },
                })}
                style={({ pressed }) => [
                  styles.artistCard,
                  pressed && styles.pressed,
                ]}
              >
                {artist.image_url ? (
                  <Image source={{ uri: artist.image_url }} style={styles.artistAvatar} />
                ) : (
                  <View style={styles.artistFallback}>
                    <Text style={styles.artistLetter}>
                      {artist.username[0]?.toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.artistIdentity}>
                  <Text numberOfLines={1} style={styles.artistName}>
                    {artist.username}
                  </Text>
                  <Text numberOfLines={1} style={styles.artistMeta}>
                    {artist.top_style}{artist.location ? ` · ${artist.location}` : ''}
                  </Text>
                </View>
                <View style={styles.artistScorePill}>
                  <Text style={styles.artistScore}>{artist.score}%</Text>
                  <Text style={styles.artistMatch}>{t('styleMatchArtistMatch')}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <Button
        label={t('styleMatchTryAgain')}
        loading={restarting}
        onPress={onRestart}
      />
      <Button
        label={t('styleMatchBackHome')}
        onPress={() => router.replace('/(tabs)/home')}
        variant="secondary"
      />
    </View>
  );
}

function ScoreBar({ score, accent = false }: { score: number; accent?: boolean }) {
  return (
    <View style={styles.scoreTrack}>
      <View
        style={[
          styles.scoreFill,
          accent && styles.scoreFillAccent,
          { width: `${Math.max(2, Math.min(100, score))}%` },
        ]}
      />
    </View>
  );
}

function TraitSection({
  title,
  values,
  positive = false,
}: {
  title: string;
  values: string[];
  positive?: boolean;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.tagList}>
        {values.map((value) => (
          <View
            key={value}
            style={[styles.tag, positive && styles.positiveTag]}
          >
            <Text style={[styles.tagText, positive && styles.positiveTagText]}>
              {value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  hero: {
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '900', letterSpacing: 1.8 },
  confidencePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
    backgroundColor: colors.backgroundDeep,
    borderRadius: radius.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  confidenceValue: { color: colors.primary, fontSize: 18, fontWeight: '900' },
  confidenceLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  personality: { color: colors.text, fontSize: 32, lineHeight: 38, fontWeight: '900' },
  description: { color: colors.textMuted, fontSize: 15, lineHeight: 23 },
  community: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  topStyleCard: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sectionEyebrow: { color: colors.textMuted, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  topStyleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md },
  topStyleLabel: { color: colors.text, fontSize: 25, fontWeight: '900', flex: 1 },
  topStyleScore: { color: colors.primary, fontSize: 25, fontWeight: '900' },
  section: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.medium,
    padding: spacing.md,
    gap: spacing.md,
  },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: '900' },
  scoreRow: { gap: spacing.xs },
  scoreLabels: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  scoreName: { color: colors.text, fontWeight: '700', flex: 1 },
  scoreValue: { color: colors.textMuted, fontWeight: '800' },
  scoreTrack: { height: 8, borderRadius: radius.pill, backgroundColor: colors.backgroundDeep, overflow: 'hidden' },
  scoreFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.primaryMuted },
  scoreFillAccent: { backgroundColor: colors.primary },
  tagList: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tag: { backgroundColor: colors.backgroundDeep, borderColor: colors.border, borderWidth: 1, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 12 },
  positiveTag: { borderColor: colors.primaryMuted, backgroundColor: colors.surfaceRaised },
  tagText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  positiveTagText: { color: colors.primary },
  muted: { color: colors.textMuted, lineHeight: 21 },
  referenceRow: { gap: spacing.sm, paddingRight: spacing.sm },
  referenceImage: { width: 132, height: 190, borderRadius: radius.medium, backgroundColor: colors.backgroundDeep },
  artistList: { gap: spacing.sm },
  artistCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.backgroundDeep, borderRadius: radius.medium, padding: spacing.sm },
  artistAvatar: { width: 50, height: 50, borderRadius: 25 },
  artistFallback: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.primaryMuted, alignItems: 'center', justifyContent: 'center' },
  artistLetter: { color: colors.text, fontSize: 19, fontWeight: '900' },
  artistIdentity: { flex: 1, gap: 2 },
  artistName: { color: colors.text, fontSize: 15, fontWeight: '900' },
  artistMeta: { color: colors.textMuted, fontSize: 11 },
  artistScorePill: { alignItems: 'center', backgroundColor: colors.surfaceRaised, borderRadius: radius.small, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  artistScore: { color: colors.primary, fontSize: 15, fontWeight: '900' },
  artistMatch: { color: colors.textMuted, fontSize: 9, fontWeight: '700' },
  pressed: { opacity: 0.72 },
});

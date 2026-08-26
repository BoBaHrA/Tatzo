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
import { colors, radius, shadow, spacing, typography } from '@/theme';


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
        <View style={styles.matchLockup}>
          <Text style={styles.confidenceValue}>{result.match_confidence}%</Text>
          <View style={styles.matchCopy}>
            <Text style={styles.confidenceLabel}>{t('styleMatchConfidence')}</Text>
            <Text style={styles.topIdentity}>{result.top_style.label}</Text>
          </View>
        </View>
        <Text style={styles.community}>
          {result.community_count} {t('styleMatchCommunity')}
        </Text>
      </View>

      <View style={styles.spectrumCard}>
        <Text style={styles.sectionTitle}>{t('styleMatchTopStyle')}</Text>
        {result.styles.map((style, index) => (
          <View key={style.slug} style={styles.scoreRow}>
            <View style={styles.scoreLabels}>
              <Text style={styles.scoreName}>{style.label}</Text>
              <Text style={styles.scoreValue}>{style.score}%</Text>
            </View>
            <ScoreBar score={style.score} accent={index === 0} pink={index === 1} />
          </View>
        ))}
      </View>

      <View style={styles.personalityCard}>
        <Text style={styles.personalityEyebrow}>{t('styleMatchResultEyebrow')}</Text>
        <Text style={styles.personality}>{result.personality.label}</Text>
        <Text style={styles.description}>{result.personality.description}</Text>
      </View>

      <View style={styles.preferenceGrid}>
        <TraitSection title={t('styleMatchDrawnTo')} values={result.drawn_to} positive />
        <TraitSection title={t('styleMatchSkip')} values={result.tend_to_skip} />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>{t('styleMatchSavedRefs')}</Text>
          <Text style={styles.sectionCount}>{result.saved_cards.length}</Text>
        </View>
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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('styleMatchArtists')}</Text>
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
        ) : (
          <Text style={styles.muted}>{t('styleMatchNoArtists')}</Text>
        )}
      </View>

      <View style={styles.actions}>
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
    </View>
  );
}

function ScoreBar({
  score,
  accent = false,
  pink = false,
}: {
  score: number;
  accent?: boolean;
  pink?: boolean;
}) {
  return (
    <View style={styles.scoreTrack}>
      <View
        style={[
          styles.scoreFill,
          accent && styles.scoreFillAccent,
          pink && styles.scoreFillPink,
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
    <View style={styles.traitSection}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.traitList}>
        {values.map((value) => (
          <View key={value} style={styles.traitRow}>
            <Text style={[styles.traitMark, positive ? styles.positiveMark : styles.negativeMark]}>
              {positive ? '✓' : '×'}
            </Text>
            <Text style={styles.traitText}>{value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  hero: {
    overflow: 'hidden',
    backgroundColor: '#06202a',
    borderColor: 'rgba(4, 197, 191, 0.24)',
    borderWidth: 1,
    borderRadius: radius.panel,
    padding: spacing.xl,
    gap: spacing.md,
    ...shadow.panel,
  },
  eyebrow: { color: colors.primary, ...typography.eyebrow },
  matchLockup: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  confidenceValue: { color: colors.primary, fontSize: 56, lineHeight: 60, fontWeight: '900', letterSpacing: -3 },
  matchCopy: { flex: 1, gap: 3 },
  confidenceLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.1 },
  topIdentity: { color: colors.text, fontSize: 25, lineHeight: 30, fontWeight: '900' },
  community: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  spectrumCard: {
    backgroundColor: 'rgba(0, 18, 28, 0.96)',
    borderColor: 'rgba(4, 197, 191, 0.18)',
    borderWidth: 1,
    borderRadius: radius.panel,
    padding: spacing.lg,
    gap: spacing.md,
  },
  personalityCard: {
    backgroundColor: colors.accent,
    borderRadius: radius.panel,
    padding: spacing.xl,
    gap: spacing.sm,
    ...shadow.panel,
  },
  personalityEyebrow: { color: '#ffd8e8', ...typography.eyebrow },
  personality: { color: colors.white, fontSize: 30, lineHeight: 35, fontWeight: '900', letterSpacing: -0.7 },
  description: { color: 'rgba(255, 255, 255, 0.88)', fontSize: 15, lineHeight: 22 },
  preferenceGrid: { gap: spacing.md },
  traitSection: {
    backgroundColor: 'rgba(0, 18, 28, 0.96)',
    borderColor: 'rgba(4, 197, 191, 0.14)',
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.lg,
    gap: spacing.md,
  },
  traitList: { gap: 10 },
  traitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  traitMark: { width: 18, fontSize: 15, lineHeight: 19, fontWeight: '900', textAlign: 'center' },
  positiveMark: { color: colors.primary },
  negativeMark: { color: colors.danger },
  traitText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 20 },
  section: {
    backgroundColor: 'rgba(0, 18, 28, 0.96)',
    borderColor: 'rgba(4, 197, 191, 0.14)',
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  sectionTitle: { color: colors.text, fontSize: 19, lineHeight: 24, fontWeight: '900' },
  sectionCount: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    color: colors.primary,
    fontSize: 12,
    lineHeight: 28,
    fontWeight: '900',
    textAlign: 'center',
  },
  scoreRow: { gap: spacing.xs },
  scoreLabels: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  scoreName: { color: colors.text, fontWeight: '800', flex: 1 },
  scoreValue: { color: colors.textMuted, fontWeight: '900' },
  scoreTrack: { height: 7, borderRadius: radius.pill, backgroundColor: 'rgba(190, 225, 229, 0.15)', overflow: 'hidden' },
  scoreFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.primaryMuted },
  scoreFillAccent: { backgroundColor: colors.primary },
  scoreFillPink: { backgroundColor: colors.accent },
  muted: { color: colors.textMuted, lineHeight: 21 },
  referenceRow: { gap: spacing.sm, paddingRight: spacing.sm },
  referenceImage: {
    width: 132,
    height: 190,
    borderRadius: 16,
    backgroundColor: colors.backgroundDeep,
    borderWidth: 1,
    borderColor: 'rgba(210, 255, 255, 0.16)',
  },
  artistList: { gap: spacing.sm },
  artistCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.backgroundDeep,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.12)',
    padding: spacing.sm,
  },
  artistAvatar: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderColor: colors.primary },
  artistFallback: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.primarySoft,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  artistLetter: { color: colors.primary, fontSize: 19, fontWeight: '900' },
  artistIdentity: { flex: 1, gap: 2 },
  artistName: { color: colors.text, fontSize: 15, fontWeight: '900' },
  artistMeta: { color: colors.textMuted, fontSize: 11 },
  artistScorePill: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: radius.small, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  artistScore: { color: colors.primary, fontSize: 15, fontWeight: '900' },
  artistMatch: { color: colors.textMuted, fontSize: 9, fontWeight: '700' },
  actions: { gap: spacing.sm, paddingTop: spacing.xs },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
});
import { StyleSheet, Text, View } from 'react-native';

import { BrandHeader } from '@/components/brand-header';
import { Screen } from '@/components/screen';
import { t } from '@/i18n';
import { colors, radius, spacing } from '@/theme';


export default function HomeScreen() {
  return (
    <Screen>
      <BrandHeader />
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>TATZO MOBILE</Text>
        <Text style={styles.title}>{t('welcome')}</Text>
        <Text style={styles.body}>{t('foundationReady')}</Text>
      </View>
      <View style={styles.previewRow}>
        {['Feed', 'Style Match', 'Booking'].map((label) => (
          <View key={label} style={styles.previewCard}>
            <View style={styles.previewDot} />
            <Text style={styles.previewText}>{label}</Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { marginTop: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, padding: spacing.xl, gap: spacing.sm },
  eyebrow: { color: colors.primary, fontWeight: '800', letterSpacing: 2, fontSize: 12 },
  title: { color: colors.text, fontSize: 32, fontWeight: '900' },
  body: { color: colors.textMuted, fontSize: 16, lineHeight: 24 },
  previewRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  previewCard: { flexGrow: 1, minWidth: 100, backgroundColor: colors.backgroundDeep, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
  previewDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  previewText: { color: colors.text, fontWeight: '700' },
});

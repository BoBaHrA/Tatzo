import { Link, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { BrandHeader } from '@/components/brand-header';
import { Screen } from '@/components/screen';
import { t } from '@/i18n';
import { colors, radius, spacing } from '@/theme';


export default function VerifyEmailScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  return (
    <Screen contentStyle={styles.centered}>
      <BrandHeader />
      <View style={styles.card}>
        <Text style={styles.icon}>✉</Text>
        <Text style={styles.title}>{t('verifyTitle')}</Text>
        <Text style={styles.body}>{t('verifyBody')}</Text>
        <Text style={styles.email}>{params.email ?? ''}</Text>
        <Text style={styles.body}>{t('verifyHint')}</Text>
        <Link href="/(auth)/login" replace style={styles.link}>{t('backToLogin')}</Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { justifyContent: 'center' },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.large, padding: spacing.xl, gap: spacing.md, alignItems: 'center' },
  icon: { fontSize: 42, color: colors.primary },
  title: { color: colors.text, fontSize: 28, fontWeight: '800', textAlign: 'center' },
  body: { color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  email: { color: colors.primary, fontWeight: '800', fontSize: 17, textAlign: 'center' },
  link: { color: colors.primary, fontWeight: '800', marginTop: spacing.sm },
});

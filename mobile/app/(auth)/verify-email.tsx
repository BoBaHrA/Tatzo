import { Link, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { authCopy } from '@/auth/auth-copy';
import { AuthShell } from '@/auth/auth-shell';
import { useLanguage } from '@/localization/language-context';
import { colors, radius, spacing, typography } from '@/theme';


export default function VerifyEmailScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const { language } = useLanguage();
  const copy = authCopy(language);

  return (
    <AuthShell centered>
      <View style={styles.iconWrap}>
        <Text style={styles.icon}>✉</Text>
      </View>
      <Text style={styles.title}>{copy.verifyTitle}</Text>
      <Text style={styles.body}>{copy.verifyBody}</Text>
      <Text style={styles.email}>{params.email ?? ''}</Text>
      <Text style={styles.body}>{copy.verifyHint}</Text>
      <Link href="/(auth)/login" replace style={styles.link}>{copy.backToLogin}</Link>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 56,
    height: 56,
    alignSelf: 'center',
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  icon: {
    color: colors.primary,
    fontSize: 27,
  },
  title: {
    color: colors.accent,
    ...typography.title,
    textAlign: 'center',
  },
  body: {
    color: colors.textMuted,
    ...typography.body,
    textAlign: 'center',
  },
  email: {
    color: colors.primary,
    ...typography.bodyStrong,
    fontSize: 16,
    textAlign: 'center',
  },
  link: {
    color: colors.accent,
    ...typography.bodyStrong,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});

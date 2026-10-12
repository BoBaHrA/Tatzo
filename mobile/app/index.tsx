import { useLanguage } from '@/localization/language-context';
import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';

import { useAuth } from '@/auth/auth-context';
import { t } from '@/i18n';
import { colors, spacing } from '@/theme';


export default function Index() {
  useLanguage();
  const { status } = useAuth();
  if (status === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>{t('loading')}</Text>
      </View>
    );
  }
  return <Redirect href={status === 'authenticated' ? '/(tabs)/home' : '/(auth)/login'} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    color: colors.textMuted,
  },
});

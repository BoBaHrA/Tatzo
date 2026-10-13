import type { PropsWithChildren } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { useLanguage } from '@/localization/language-context';
import { colors, spacing } from '@/theme';

const COPY = {
  en: { title: 'Could not connect', body: 'Your session is saved. Check your connection and try again.', retry: 'Try again', logout: 'Sign out' },
  fr: { title: 'Connexion impossible', body: 'Votre session est conservée. Vérifiez votre connexion et réessayez.', retry: 'Réessayer', logout: 'Se déconnecter' },
  ru: { title: 'Нет соединения', body: 'Сессия сохранена. Проверь подключение и попробуй ещё раз.', retry: 'Повторить', logout: 'Выйти' },
};
export function SessionBoundary({ children }: PropsWithChildren) {
  const { status, retrySession, signOut } = useAuth();
  const { language } = useLanguage();
  const copy = COPY[language];
  if (status === 'loading') return <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /></View>;
  if (status === 'unavailable') return <Screen contentStyle={styles.content}>
    <Text style={styles.title}>{copy.title}</Text><Text style={styles.body}>{copy.body}</Text>
    <Button label={copy.retry} onPress={() => void retrySession()} />
    <Button label={copy.logout} onPress={() => void signOut()} variant="secondary" />
  </Screen>;
  return children;
}
const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  content: { justifyContent: 'center', gap: spacing.lg },
  title: { color: colors.accent, fontSize: 26, fontWeight: '800' },
  body: { color: colors.textMuted, fontSize: 16, lineHeight: 24 },
});

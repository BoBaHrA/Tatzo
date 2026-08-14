import { Link, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { BrandHeader } from '@/components/brand-header';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { userFacingError } from '@/errors';
import { t } from '@/i18n';
import { colors, radius, spacing } from '@/theme';


export default function LoginScreen() {
  const { signIn } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      await signIn(identifier.trim(), password);
      router.replace('/(tabs)/profile');
    } catch (caught) {
      setError(userFacingError(caught));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen contentStyle={styles.centered}>
      <BrandHeader />
      <View style={styles.card}>
        <Text style={styles.title}>{t('signIn')}</Text>
        <Field
          label={t('identifier')}
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="username"
          returnKeyType="next"
        />
        <Field
          label={t('password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          label={t('signIn')}
          loading={loading}
          disabled={!identifier.trim() || !password}
          onPress={() => void submit()}
        />
        <View style={styles.switchRow}>
          <Text style={styles.muted}>{t('noAccount')}</Text>
          <Link href="/(auth)/register" style={styles.link}>
            {t('signUp')}
          </Link>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { justifyContent: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: { color: colors.text, fontSize: 28, fontWeight: '800' },
  error: { color: colors.danger, lineHeight: 20 },
  switchRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  muted: { color: colors.textMuted },
  link: { color: colors.primary, fontWeight: '700' },
});

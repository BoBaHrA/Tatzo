import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { authCopy, authError } from '@/auth/auth-copy';
import { AuthPasswordField } from '@/auth/auth-password-field';
import { AuthShell } from '@/auth/auth-shell';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { useLanguage } from '@/localization/language-context';
import { PUBLIC_LINKS } from '@/public-links';
import { colors, spacing, typography } from '@/theme';


export default function LoginScreen() {
  const { signIn } = useAuth();
  const { language } = useLanguage();
  const copy = authCopy(language);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!identifier.trim() || !password || loading) return;
    setLoading(true);
    setError('');
    try {
      await signIn(identifier.trim(), password);
      router.replace('/(tabs)/home');
    } catch (caught) {
      setError(authError(caught, language));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell centered>
      <Text style={styles.title}>{copy.welcome}</Text>
      <View style={styles.form}>
        <Field
          tone="auth"
          label={copy.username}
          placeholder={copy.identifierPlaceholder}
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="username"
          returnKeyType="next"
        />
        <AuthPasswordField
          label={copy.password}
          placeholder={copy.passwordPlaceholder}
          value={password}
          onChangeText={setPassword}
          showLabel={copy.showPassword}
          hideLabel={copy.hidePassword}
          textContentType="password"
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
        />
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Button
        variant="accent"
        label={copy.signIn}
        loading={loading}
        disabled={!identifier.trim() || !password}
        onPress={() => void submit()}
      />
      <View style={styles.links}>
        <View style={styles.switchRow}>
          <Text style={styles.muted}>{copy.noAccount}</Text>
          <Link href="/(auth)/register" style={styles.link}>{copy.createAccount}</Link>
        </View>
        <Pressable
          accessibilityRole="link"
          onPress={() => void Linking.openURL(PUBLIC_LINKS.passwordReset)}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text style={styles.smallLink}>{copy.forgotPassword}</Text>
        </Pressable>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.accent,
    ...typography.title,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  form: {
    gap: spacing.md,
  },
  error: {
    color: colors.danger,
    ...typography.caption,
    textAlign: 'center',
  },
  links: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  muted: {
    color: colors.textMuted,
    ...typography.body,
  },
  link: {
    color: colors.accent,
    ...typography.bodyStrong,
  },
  smallLink: {
    color: colors.primary,
    ...typography.caption,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.65,
  },
});

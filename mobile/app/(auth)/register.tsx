import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import type { AccountType } from '@/api/types';
import { useAuth } from '@/auth/auth-context';
import { authCopy, authError } from '@/auth/auth-copy';
import { AuthPasswordField } from '@/auth/auth-password-field';
import { AuthShell } from '@/auth/auth-shell';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { useLanguage } from '@/localization/language-context';
import { PUBLIC_LINKS } from '@/public-links';
import { colors, radius, spacing, typography } from '@/theme';


export default function RegisterScreen() {
  const { register } = useAuth();
  const { language } = useLanguage();
  const copy = authCopy(language);
  const [accountType, setAccountType] = useState<AccountType>('regular');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (password !== confirmation) {
      setError(copy.passwordsMismatch);
      return;
    }
    if (!accepted) {
      setError(copy.acceptRequired);
      return;
    }
    if (!username.trim() || !email.trim() || !password || loading) return;

    setLoading(true);
    setError('');
    try {
      const verifiedEmail = await register({
        username: username.trim(),
        email: email.trim().toLowerCase(),
        password,
        account_type: accountType,
        accept_terms: accepted,
      });
      router.replace({ pathname: '/(auth)/verify-email', params: { email: verifiedEmail } });
    } catch (caught) {
      setError(authError(caught, language));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <Text style={styles.title}>{copy.welcome}</Text>
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          {accountType === 'tattoo_artist' ? copy.artistInfo : copy.regularInfo}
        </Text>
      </View>

      <View style={styles.form}>
        <Field
          tone="auth"
          label={copy.username}
          placeholder={copy.usernamePlaceholder}
          helperText={copy.usernameHint}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="username"
        />
        <Field
          tone="auth"
          label={copy.email}
          placeholder={copy.emailPlaceholder}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="emailAddress"
        />
        <AuthPasswordField
          label={copy.password}
          placeholder={copy.passwordPlaceholder}
          helperText={copy.passwordHint}
          value={password}
          onChangeText={setPassword}
          showLabel={copy.showPassword}
          hideLabel={copy.hidePassword}
          textContentType="newPassword"
        />
        <AuthPasswordField
          label={copy.confirmPassword}
          placeholder={copy.confirmPasswordPlaceholder}
          value={confirmation}
          onChangeText={setConfirmation}
          showLabel={copy.showPassword}
          hideLabel={copy.hidePassword}
          textContentType="newPassword"
        />
      </View>

      <View style={styles.accountOptions}>
        {(['regular', 'tattoo_artist'] as const).map((type) => {
          const selected = accountType === type;
          const isArtist = type === 'tattoo_artist';
          return (
            <Pressable
              key={type}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => setAccountType(type)}
              style={({ pressed }) => [
                styles.accountCard,
                selected && styles.accountCardSelected,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.accountTitle, selected && styles.accountTitleSelected]}>
                {isArtist ? copy.artistTitle : copy.regularTitle}
              </Text>
              <Text style={[styles.accountBody, selected && styles.accountBodySelected]}>
                {isArtist ? copy.artistBody : copy.regularBody}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: accepted }}
        onPress={() => setAccepted((current) => !current)}
        style={({ pressed }) => [styles.consentRow, pressed && styles.pressed]}
      >
        <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>
          {accepted ? <Text style={styles.checkmark}>✓</Text> : null}
        </View>
        <Text style={styles.consentText}>
          {copy.acceptPrefix}{' '}
          <Text style={styles.link} onPress={() => void Linking.openURL(PUBLIC_LINKS.terms)}>{copy.terms}</Text>,{' '}
          <Text style={styles.link} onPress={() => void Linking.openURL(PUBLIC_LINKS.privacy)}>{copy.privacy}</Text>{' '}
          {copy.and}{' '}
          <Text style={styles.link} onPress={() => void Linking.openURL(PUBLIC_LINKS.communityGuidelines)}>{copy.communityGuidelines}</Text>.
        </Text>
      </Pressable>

      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Button
        variant="accent"
        label={copy.signUp}
        loading={loading}
        disabled={!username.trim() || !email.trim() || !password || !confirmation || !accepted}
        onPress={() => void submit()}
      />
      <View style={styles.switchRow}>
        <Text style={styles.muted}>{copy.hasAccount}</Text>
        <Link href="/(auth)/login" style={styles.link}>{copy.signIn}</Link>
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.accent,
    ...typography.title,
    textAlign: 'center',
  },
  infoBox: {
    padding: spacing.md,
    borderRadius: radius.small,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSoft,
  },
  infoText: {
    color: colors.textMuted,
    ...typography.body,
    textAlign: 'center',
  },
  form: {
    gap: spacing.md,
  },
  accountOptions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  accountCard: {
    flex: 1,
    minHeight: 124,
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.large,
    backgroundColor: 'transparent',
  },
  accountCardSelected: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.24,
    shadowRadius: 10,
    elevation: 2,
  },
  accountTitle: {
    color: colors.primary,
    ...typography.bodyStrong,
    textAlign: 'center',
  },
  accountTitleSelected: {
    color: colors.heading,
  },
  accountBody: {
    color: colors.textMuted,
    ...typography.caption,
    textAlign: 'center',
  },
  accountBodySelected: {
    color: colors.backgroundDeep,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  checkbox: {
    width: 24,
    height: 24,
    marginTop: 1,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 6,
    backgroundColor: colors.surfaceSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
  },
  checkmark: {
    color: colors.backgroundDeep,
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '900',
  },
  consentText: {
    flex: 1,
    color: colors.textMuted,
    ...typography.body,
  },
  error: {
    color: colors.danger,
    ...typography.caption,
    textAlign: 'center',
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
    color: colors.primary,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.72,
  },
});

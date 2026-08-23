import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import type { AccountType } from '@/api/types';
import { useAuth } from '@/auth/auth-context';
import { BrandHeader } from '@/components/brand-header';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { userFacingError } from '@/errors';
import { t } from '@/i18n';
import { PUBLIC_LINKS } from '@/public-links';
import { colors, radius, spacing } from '@/theme';


export default function RegisterScreen() {
  const { register } = useAuth();
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
      setError(t('passwordsMismatch'));
      return;
    }
    if (!accepted) {
      setError(t('acceptRequired'));
      return;
    }

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
      setError(userFacingError(caught));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <BrandHeader />
      <View style={styles.card}>
        <Text style={styles.title}>{t('signUp')}</Text>
        <View style={styles.segmented}>
          {(['regular', 'tattoo_artist'] as const).map((type) => (
            <Pressable
              key={type}
              accessibilityRole="radio"
              accessibilityState={{ checked: accountType === type }}
              onPress={() => setAccountType(type)}
              style={[styles.segment, accountType === type && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, accountType === type && styles.segmentTextActive]}>
                {type === 'regular' ? t('client') : t('artist')}
              </Text>
            </Pressable>
          ))}
        </View>
        <Field label={t('username')} value={username} onChangeText={setUsername} autoCapitalize="none" />
        <Field label={t('email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <Field label={t('password')} value={password} onChangeText={setPassword} secureTextEntry />
        <Field label={t('confirmPassword')} value={confirmation} onChangeText={setConfirmation} secureTextEntry />
        <View style={styles.termsRow}>
          <Switch value={accepted} onValueChange={setAccepted} trackColor={{ true: colors.primaryMuted }} thumbColor={accepted ? colors.primary : colors.textMuted} />
          <Text style={styles.termsText}>
            {t('acceptPrefix')}{' '}
            <Text style={styles.link} onPress={() => void Linking.openURL(PUBLIC_LINKS.terms)}>{t('terms')}</Text>{' '}
            {t('and')}{' '}
            <Text style={styles.link} onPress={() => void Linking.openURL(PUBLIC_LINKS.privacy)}>{t('privacy')}</Text>.
          </Text>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label={t('signUp')} loading={loading} onPress={() => void submit()} />
        <View style={styles.switchRow}>
          <Text style={styles.muted}>{t('hasAccount')}</Text>
          <Link href="/(auth)/login" style={styles.link}>{t('signIn')}</Link>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.large, padding: spacing.lg, gap: spacing.md },
  title: { color: colors.text, fontSize: 28, fontWeight: '800' },
  segmented: { flexDirection: 'row', backgroundColor: colors.backgroundDeep, padding: 4, borderRadius: radius.medium },
  segment: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.small, paddingHorizontal: spacing.sm },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { color: colors.textMuted, fontWeight: '700', textAlign: 'center' },
  segmentTextActive: { color: colors.backgroundDeep },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  termsText: { color: colors.textMuted, flex: 1, lineHeight: 21 },
  error: { color: colors.danger, lineHeight: 20 },
  switchRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  muted: { color: colors.textMuted },
  link: { color: colors.primary, fontWeight: '700' },
});

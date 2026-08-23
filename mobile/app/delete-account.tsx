import { useState } from 'react';
import { Redirect, router } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '@/api/client';
import { useAuth } from '@/auth/auth-context';
import { BrandHeader } from '@/components/brand-header';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { t } from '@/i18n';
import { colors, radius, spacing } from '@/theme';


export default function DeleteAccountScreen() {
  const { deleteAccount, status } = useAuth();
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  if (status === 'anonymous') {
    return <Redirect href="/(auth)/login" />;
  }

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };

  const performDeletion = async () => {
    setDeleting(true);
    setError('');
    try {
      await deleteAccount(password);
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 400
          ? t('incorrectPassword')
          : t('deleteAccountError'),
      );
    } finally {
      setDeleting(false);
    }
  };

  const confirmDeletion = () => {
    if (!password) {
      setError(t('passwordRequired'));
      return;
    }
    Alert.alert(
      t('deleteAccountConfirmTitle'),
      t('deleteAccountConfirmBody'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('deletePermanently'),
          style: 'destructive',
          onPress: () => void performDeletion(),
        },
      ],
    );
  };

  return (
    <Screen contentStyle={styles.screen}>
      <Pressable
        accessibilityLabel={t('back')}
        accessibilityRole="button"
        onPress={goBack}
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
      >
        <Text style={styles.backText}>‹ {t('back')}</Text>
      </Pressable>
      <BrandHeader />
      <View style={styles.warningCard}>
        <Text style={styles.warningEyebrow}>{t('deletionIrreversible')}</Text>
        <Text style={styles.title}>{t('deleteAccount')}</Text>
        <Text style={styles.warning}>{t('deleteAccountWarning')}</Text>
      </View>
      <Field
        autoCapitalize="none"
        autoComplete="current-password"
        label={t('deleteAccountPassword')}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
        value={password}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Button
        label={t('deletePermanently')}
        loading={deleting}
        onPress={confirmDeletion}
        variant="danger"
      />
      <Button label={t('cancel')} onPress={goBack} variant="secondary" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  backButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  backText: { color: colors.primary, fontSize: 16, fontWeight: '800' },
  pressed: { opacity: 0.68 },
  warningCard: {
    backgroundColor: colors.surface,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  warningEyebrow: { color: colors.danger, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: colors.text, fontSize: 28, fontWeight: '900' },
  warning: { color: colors.textMuted, lineHeight: 22 },
  error: {
    color: colors.danger,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.medium,
    padding: spacing.sm,
    textAlign: 'center',
  },
});

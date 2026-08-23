import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { userFacingError } from '@/errors';
import { t } from '@/i18n';
import { colors, radius, spacing } from '@/theme';


export default function EditProfileScreen() {
  const { user, updateProfile } = useAuth();
  const [username, setUsername] = useState(user?.username ?? '');
  const [tag, setTag] = useState(user?.tag ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!user) return null;

  const save = async () => {
    setLoading(true);
    setError('');
    try {
      await updateProfile({ username: username.trim(), tag: tag.trim(), bio: bio.trim() });
      router.back();
    } catch (caught) {
      setError(userFacingError(caught));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>{t('editProfile')}</Text>
        <Text style={styles.close} onPress={() => router.back()}>×</Text>
      </View>
      <View style={styles.card}>
        <Field label={t('username')} value={username} onChangeText={setUsername} autoCapitalize="none" />
        <Field label={t('tag')} value={tag} onChangeText={setTag} autoCapitalize="none" />
        <Field label={t('bio')} value={bio} onChangeText={setBio} multiline />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label={t('save')} loading={loading} onPress={() => void save()} />
        <Button label={t('cancel')} variant="secondary" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.text, fontSize: 28, fontWeight: '900' },
  close: { color: colors.textMuted, fontSize: 36, paddingHorizontal: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.md },
  error: { color: colors.danger },
});

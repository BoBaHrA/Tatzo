import { useCallback, useEffect, useState } from 'react';
import { Redirect, router } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { BlockedUser } from '@/api/types';
import { useAuth } from '@/auth/auth-context';
import { BrandHeader } from '@/components/brand-header';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { t } from '@/i18n';
import { fetchBlockedUsers, unblockUser } from '@/safety/safety-api';
import { colors, radius, spacing } from '@/theme';


export default function BlockedUsersScreen() {
  const { request, status } = useAuth();
  const [users, setUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUsername, setBusyUsername] = useState('');
  const [error, setError] = useState('');

  const loadUsers = useCallback(async () => {
    if (status !== 'authenticated') return;
    setLoading(true);
    setError('');
    try {
      const response = await fetchBlockedUsers(request);
      setUsers(response.results);
    } catch {
      setError(t('blockedUsersError'));
    } finally {
      setLoading(false);
    }
  }, [request, status]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  if (status === 'anonymous') {
    return <Redirect href="/(auth)/login" />;
  }

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  };

  const performUnblock = async (user: BlockedUser) => {
    setBusyUsername(user.username);
    setError('');
    try {
      const result = await unblockUser(request, user.username);
      if (!result.is_blocked) {
        setUsers((current) => current.filter((item) => item.id !== user.id));
      }
    } catch {
      setError(t('unblockError'));
    } finally {
      setBusyUsername('');
    }
  };

  const confirmUnblock = (user: BlockedUser) => {
    Alert.alert(
      t('unblockUser'),
      `${t('unblockUserConfirm')} ${user.username}?`,
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('unblock'), onPress: () => void performUnblock(user) },
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
      <View style={styles.heading}>
        <Text style={styles.title}>{t('blockedUsers')}</Text>
        <Text style={styles.subtitle}>{t('blockedUsersHint')}</Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading || status === 'loading' ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.subtitle}>{t('loadingBlockedUsers')}</Text>
        </View>
      ) : users.length ? users.map((user) => (
        <View key={user.id} style={styles.userCard}>
          {user.profile_image_url ? (
            <Image source={{ uri: user.profile_image_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarLetter}>{user.username[0]?.toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.identity}>
            <View style={styles.usernameLine}>
              <Text numberOfLines={1} style={styles.username}>{user.username}</Text>
              {user.is_verified_artist ? <Text style={styles.verified}>✓</Text> : null}
            </View>
            <Text style={styles.tag}>@{user.tag ?? user.username}</Text>
          </View>
          <Button
            label={t('unblock')}
            loading={busyUsername === user.username}
            onPress={() => confirmUnblock(user)}
            style={styles.unblockButton}
            variant="secondary"
          />
        </View>
      )) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{t('blockedUsersEmpty')}</Text>
          <Text style={styles.subtitle}>{t('blockedUsersEmptyHint')}</Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.sm, paddingBottom: spacing.xxl },
  backButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  backText: { color: colors.primary, fontSize: 16, fontWeight: '800' },
  pressed: { opacity: 0.68 },
  heading: { gap: spacing.xs },
  title: { color: colors.text, fontSize: 28, fontWeight: '900' },
  subtitle: { color: colors.textMuted, lineHeight: 21 },
  error: {
    color: colors.danger,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.medium,
    padding: spacing.sm,
    textAlign: 'center',
  },
  centerState: { minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.medium,
    padding: spacing.md,
  },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryMuted,
  },
  avatarLetter: { color: colors.text, fontSize: 21, fontWeight: '900' },
  identity: { flex: 1, gap: 2 },
  usernameLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  username: { color: colors.text, fontSize: 16, fontWeight: '900', flexShrink: 1 },
  verified: { color: colors.primary, fontWeight: '900' },
  tag: { color: colors.textMuted, fontSize: 12 },
  unblockButton: { minHeight: 42, paddingHorizontal: spacing.sm },
  emptyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.xl,
    gap: spacing.sm,
    alignItems: 'center',
  },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '900', textAlign: 'center' },
});

import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { t } from '@/i18n';
import { useNotifications } from '@/notifications/notification-context';
import { colors, spacing } from '@/theme';


type BrandHeaderProps = {
  showNotifications?: boolean;
  title?: string;
  showQuickMatch?: boolean;
};

export function BrandHeader({
  showNotifications = true,
  title,
  showQuickMatch = false,
}: BrandHeaderProps) {
  const { status, user } = useAuth();
  const { unreadCount } = useNotifications();
  const badge = unreadCount > 99 ? '99+' : String(unreadCount);
  const isSectionHeader = Boolean(title && status === 'authenticated');

  return (
    <View style={[styles.container, isSectionHeader && styles.sectionContainer]}>
      {isSectionHeader ? (
        <>
          <Pressable
            accessibilityLabel={t('profile')}
            accessibilityRole="button"
            onPress={() => router.push('/(tabs)/profile')}
            style={({ pressed }) => [styles.profileButton, pressed && styles.pressed]}
          >
            {user?.profile_image_url ? (
              <Image source={{ uri: user.profile_image_url }} style={styles.avatar} />
            ) : (
              <Text style={styles.avatarFallback}>
                {(user?.username || '?').slice(0, 1).toUpperCase()}
              </Text>
            )}
          </Pressable>
          <Text numberOfLines={1} style={styles.sectionTitle}>{title}</Text>
        </>
      ) : (
        <Image
          source={require('../../assets/tatzo5.png')}
          resizeMode="contain"
          style={styles.logo}
          accessibilityLabel="Tatzo"
        />
      )}

      <View style={styles.actions}>
        {showQuickMatch && status === 'authenticated' ? (
          <Pressable
            accessibilityLabel={t('styleMatch')}
            accessibilityRole="button"
            onPress={() => router.push('/(tabs)/match')}
            style={({ pressed }) => [styles.quickButton, pressed && styles.pressed]}
          >
            <Text style={styles.quickSymbol}>✦</Text>
          </Pressable>
        ) : null}
        {showNotifications && status === 'authenticated' ? (
          <Pressable
            accessibilityLabel={t('notifications')}
            accessibilityRole="button"
            onPress={() => router.push('/notifications')}
            style={({ pressed }) => [styles.notificationButton, pressed && styles.pressed]}
          >
            <View style={styles.bellBody} />
            <View style={styles.bellClapper} />
            {unreadCount ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{badge}</Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    minHeight: 46,
    justifyContent: 'center',
    position: 'relative',
  },
  sectionContainer: {
    minHeight: 52,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: spacing.sm,
  },
  logo: {
    width: 118,
    height: 36,
  },
  profileButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: colors.primary,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '800',
  },
  sectionTitle: {
    flex: 1,
    color: colors.accent,
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '800',
  },
  actions: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  quickButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickSymbol: {
    color: colors.primary,
    fontSize: 28,
    lineHeight: 30,
  },
  notificationButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  bellBody: {
    width: 17,
    height: 16,
    borderWidth: 2,
    borderColor: colors.primary,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
  },
  bellClapper: {
    width: 5,
    height: 3,
    marginTop: 2,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -3,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.backgroundDeep,
  },
  badgeText: {
    color: colors.white,
    fontSize: 8,
    fontWeight: '900',
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.96 }] },
});

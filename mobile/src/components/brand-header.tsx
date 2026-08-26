import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { Avatar } from '@/components/avatar';
import { IconButton } from '@/components/icon-button';
import { t } from '@/i18n';
import { useNotifications } from '@/notifications/notification-context';
import { colors, layout, spacing, typography } from '@/theme';


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
            <Avatar
              uri={user?.profile_image_url}
              label={user?.username}
              size={42}
              ring
            />
          </Pressable>
          <Text numberOfLines={1} style={styles.sectionTitle}>{title}</Text>
        </>
      ) : (
        <Image
          source={require('../../assets/tatzo7.png')}
          resizeMode="contain"
          style={styles.logo}
          accessibilityLabel="Tatzo"
        />
      )}

      <View style={styles.actions}>
        {showQuickMatch && status === 'authenticated' ? (
          <IconButton
            accessibilityLabel={t('styleMatch')}
            onPress={() => router.push('/(tabs)/match')}
            symbol="✦"
          />
        ) : null}
        {showNotifications && status === 'authenticated' ? (
          <Pressable
            accessibilityLabel={t('notifications')}
            accessibilityRole="button"
            onPress={() => router.push('/notifications')}
            style={({ pressed }) => [styles.notificationButton, pressed && styles.pressed]}
          >
            <Image
              source={require('../../assets/web-icons/notifications.png')}
              resizeMode="contain"
              style={styles.notificationIcon}
            />
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
    minHeight: 48,
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
    width: 132,
    height: 36,
  },
  profileButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  sectionTitle: {
    flex: 1,
    color: colors.accent,
    ...typography.sectionTitle,
  },
  actions: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  notificationButton: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: layout.touchTarget / 2,
  },
  notificationIcon: {
    width: 24,
    height: 24,
    tintColor: colors.primary,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.background,
  },
  badgeText: {
    color: colors.white,
    fontSize: 8,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.96 }],
  },
});

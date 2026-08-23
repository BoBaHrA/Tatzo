import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import { t } from '@/i18n';
import { useNotifications } from '@/notifications/notification-context';
import { colors } from '@/theme';


export function BrandHeader({ showNotifications = true }: {
  showNotifications?: boolean;
}) {
  const { status } = useAuth();
  const { unreadCount } = useNotifications();
  const badge = unreadCount > 99 ? '99+' : String(unreadCount);
  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/tatzo5.png')}
        resizeMode="contain"
        style={styles.logo}
        accessibilityLabel="Tatzo"
      />
      {showNotifications && status === 'authenticated' ? (
        <Pressable
          accessibilityLabel={t('notifications')}
          accessibilityRole="button"
          onPress={() => router.push('/notifications')}
          style={({ pressed }) => [
            styles.notificationButton,
            pressed && styles.pressed,
          ]}
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
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    minHeight: 54,
    justifyContent: 'center',
    position: 'relative',
  },
  logo: {
    width: 150,
    height: 46,
  },
  notificationButton: {
    position: 'absolute',
    right: 0,
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 23,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  bellBody: {
    width: 18,
    height: 17,
    borderWidth: 2,
    borderColor: colors.primary,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
  },
  bellClapper: {
    width: 6,
    height: 3,
    marginTop: 2,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.backgroundDeep,
  },
  badgeText: {
    color: colors.white,
    fontSize: 9,
    fontWeight: '900',
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.96 }] },
});

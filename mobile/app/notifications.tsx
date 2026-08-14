import { useCallback, useState } from 'react';
import { Redirect, router, useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type {
  NotificationItem,
  NotificationKind,
} from '@/api/types';
import { useAuth } from '@/auth/auth-context';
import { BrandHeader } from '@/components/brand-header';
import { Button } from '@/components/button';
import { appLanguage, t, type TranslationKey } from '@/i18n';
import { useNotifications } from '@/notifications/notification-context';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/notifications/notification-api';
import { colors, radius, spacing } from '@/theme';


const KIND_LABELS: Record<NotificationKind, TranslationKey> = {
  follow: 'notificationFollow',
  post_like: 'notificationPostLike',
  post_comment: 'notificationPostComment',
  comment_reply: 'notificationCommentReply',
  chat_message: 'notificationChatMessage',
  booking_request: 'notificationBookingRequest',
  booking_update: 'notificationBookingUpdate',
};

const KIND_SYMBOLS: Record<NotificationKind, string> = {
  follow: '+',
  post_like: '♥',
  post_comment: '◯',
  comment_reply: '↩',
  chat_message: '◇',
  booking_request: '⌁',
  booking_update: '✓',
};

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(appLanguage, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function notificationTitle(notification: NotificationItem) {
  const actor = notification.actor?.username ?? 'Tatzo';
  return `${actor} ${t(KIND_LABELS[notification.kind])}`;
}

function notificationPreview(notification: NotificationItem) {
  if (notification.preview) return notification.preview;
  if (notification.appointment_status_label) {
    return notification.appointment_status_label;
  }
  if (notification.kind === 'chat_message') return t('notificationAttachment');
  return '';
}

function NotificationRow({
  notification,
  onPress,
}: {
  notification: NotificationItem;
  onPress: (notification: NotificationItem) => void;
}) {
  const actor = notification.actor;
  const preview = notificationPreview(notification);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(notification)}
      style={({ pressed }) => [
        styles.row,
        !notification.is_read && styles.rowUnread,
        pressed && styles.pressed,
      ]}
    >
      {actor?.profile_image_url ? (
        <Image source={{ uri: actor.profile_image_url }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarFallback}>
          <Text style={styles.avatarSymbol}>{KIND_SYMBOLS[notification.kind]}</Text>
        </View>
      )}
      <View style={styles.rowBody}>
        <View style={styles.titleLine}>
          <Text numberOfLines={2} style={styles.rowTitle}>
            {notificationTitle(notification)}
          </Text>
          {!notification.is_read ? <View style={styles.unreadDot} /> : null}
        </View>
        {preview ? <Text numberOfLines={2} style={styles.preview}>{preview}</Text> : null}
        <Text style={styles.time}>{formatTime(notification.created_at)}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const { request, status } = useAuth();
  const { unreadCount, syncUnreadCount } = useNotifications();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');

  const loadFirstPage = useCallback(async (quiet = false) => {
    if (status !== 'authenticated') return;
    if (!quiet) setLoading(true);
    setLoadError('');
    try {
      const page = await fetchNotifications(request);
      setNotifications(page.results);
      setNextCursor(page.next_cursor);
      syncUnreadCount(page.unread_count);
    } catch {
      setLoadError(t('notificationsLoadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [request, status, syncUnreadCount]);

  useFocusEffect(useCallback(() => {
    void loadFirstPage();
  }, [loadFirstPage]));

  if (status === 'anonymous') return <Redirect href="/(auth)/login" />;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/map');
  };

  const refresh = () => {
    setRefreshing(true);
    setActionError('');
    void loadFirstPage(true);
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore || refreshing) return;
    setLoadingMore(true);
    try {
      const page = await fetchNotifications(request, nextCursor);
      setNotifications((current) => {
        const ids = new Set(current.map((item) => item.id));
        return [
          ...current,
          ...page.results.filter((item) => !ids.has(item.id)),
        ];
      });
      setNextCursor(page.next_cursor);
      syncUnreadCount(page.unread_count);
    } catch {
      setActionError(t('notificationsLoadError'));
    } finally {
      setLoadingMore(false);
    }
  };

  const navigateToTarget = (notification: NotificationItem) => {
    const target = notification.target;
    if (target.type === 'profile') {
      router.push({
        pathname: '/profile/[username]',
        params: { username: target.username },
      });
    } else if (target.type === 'post') {
      router.push({
        pathname: '/post/[postId]',
        params: { postId: String(target.id) },
      });
    } else if (target.type === 'appointment') {
      router.push({
        pathname: '/appointment/[appointmentId]',
        params: { appointmentId: String(target.id) },
      });
    } else if (target.type === 'chat') {
      router.push({
        pathname: '/chat/[threadId]',
        params: { threadId: String(target.id) },
      });
    }
  };

  const openNotification = async (notification: NotificationItem) => {
    setActionError('');
    if (!notification.is_read) {
      setNotifications((current) => current.map((item) => (
        item.id === notification.id ? { ...item, is_read: true } : item
      )));
      syncUnreadCount(Math.max(0, unreadCount - 1));
      try {
        const result = await markNotificationRead(request, notification.id);
        syncUnreadCount(result.unread_count);
      } catch {
        setActionError(t('notificationOpenError'));
      }
    }
    navigateToTarget(notification);
  };

  const markAll = async () => {
    if (!unreadCount || markingAll) return;
    setMarkingAll(true);
    setActionError('');
    try {
      const result = await markAllNotificationsRead(request);
      setNotifications((current) => current.map((item) => ({
        ...item,
        is_read: true,
      })));
      syncUnreadCount(result.unread_count);
    } catch {
      setActionError(t('notificationOpenError'));
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
      <FlatList
        contentContainerStyle={styles.content}
        data={notifications}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={(
          <View style={styles.header}>
            <Pressable
              accessibilityLabel={t('back')}
              accessibilityRole="button"
              onPress={goBack}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            >
              <Text style={styles.backText}>‹ {t('back')}</Text>
            </Pressable>
            <BrandHeader showNotifications={false} />
            <View style={styles.hero}>
              <View style={styles.heroCopy}>
                <Text style={styles.eyebrow}>{t('notificationsEyebrow')}</Text>
                <Text style={styles.title}>{t('notifications')}</Text>
                <Text style={styles.subtitle}>{t('notificationsSubtitle')}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={!unreadCount || markingAll}
                onPress={() => void markAll()}
                style={({ pressed }) => [
                  styles.markAll,
                  !unreadCount && styles.markAllDisabled,
                  pressed && styles.pressed,
                ]}
              >
                {markingAll ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : (
                  <Text style={styles.markAllText}>
                    {unreadCount ? t('notificationsMarkAll') : t('notificationsAllRead')}
                  </Text>
                )}
              </Pressable>
            </View>
            {actionError ? <Text style={styles.inlineError}>{actionError}</Text> : null}
          </View>
        )}
        ListEmptyComponent={loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.muted}>{t('notificationsLoading')}</Text>
          </View>
        ) : loadError ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>{t('notificationsUnavailable')}</Text>
            <Text style={styles.muted}>{loadError}</Text>
            <Button label={t('retry')} onPress={() => void loadFirstPage()} />
          </View>
        ) : (
          <View style={styles.stateCard}>
            <Text style={styles.emptySymbol}>✓</Text>
            <Text style={styles.stateTitle}>{t('notificationsEmpty')}</Text>
            <Text style={styles.muted}>{t('notificationsEmptyHint')}</Text>
          </View>
        )}
        ListFooterComponent={loadingMore ? (
          <ActivityIndicator color={colors.primary} style={styles.footerLoader} />
        ) : null}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.45}
        refreshControl={(
          <RefreshControl
            colors={[colors.primary]}
            onRefresh={refresh}
            refreshing={refreshing}
            tintColor={colors.primary}
          />
        )}
        renderItem={({ item }) => (
          <NotificationRow notification={item} onPress={(value) => void openNotification(value)} />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  header: { gap: spacing.md, marginBottom: spacing.lg },
  backButton: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  backText: { color: colors.primary, fontSize: 16, fontWeight: '800' },
  hero: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.lg,
    gap: spacing.md,
  },
  heroCopy: { gap: spacing.xs },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 32, fontWeight: '900' },
  subtitle: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  markAll: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.primaryMuted,
    backgroundColor: colors.surfaceRaised,
  },
  markAllDisabled: { opacity: 0.58 },
  markAllText: { color: colors.primary, fontSize: 13, fontWeight: '900' },
  row: {
    minHeight: 96,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowUnread: {
    borderColor: colors.primaryMuted,
    backgroundColor: colors.surfaceRaised,
  },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.backgroundDeep,
    borderWidth: 1,
    borderColor: colors.primaryMuted,
  },
  avatarSymbol: { color: colors.primary, fontSize: 21, fontWeight: '900' },
  rowBody: { flex: 1, minWidth: 0, gap: 4 },
  titleLine: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  rowTitle: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '800', lineHeight: 20 },
  unreadDot: { width: 9, height: 9, marginTop: 5, borderRadius: 5, backgroundColor: colors.accent },
  preview: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  time: { color: colors.primary, fontSize: 11, fontWeight: '700' },
  chevron: { color: colors.primary, fontSize: 28 },
  separator: { height: spacing.sm },
  pressed: { opacity: 0.72, transform: [{ scale: 0.992 }] },
  inlineError: {
    color: colors.danger,
    borderRadius: radius.small,
    padding: spacing.sm,
    backgroundColor: colors.surface,
  },
  centerState: { minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  stateCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.xl,
    gap: spacing.md,
  },
  emptySymbol: { color: colors.primary, fontSize: 42, fontWeight: '900' },
  stateTitle: { color: colors.text, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  muted: { color: colors.textMuted, lineHeight: 22, textAlign: 'center' },
  footerLoader: { marginVertical: spacing.lg },
});

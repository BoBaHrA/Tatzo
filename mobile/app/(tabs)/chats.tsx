import { useState } from 'react';
import { router } from 'expo-router';
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

import type { ChatThreadSummary } from '@/api/types';
import { useChat } from '@/chat/chat-context';
import { BrandHeader } from '@/components/brand-header';
import { Button } from '@/components/button';
import { appLanguage, t } from '@/i18n';
import { colors, radius, spacing } from '@/theme';


function formatChatTime(value: string) {
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return new Intl.DateTimeFormat(
    appLanguage,
    sameDay
      ? { hour: '2-digit', minute: '2-digit' }
      : { day: '2-digit', month: 'short' },
  ).format(date);
}

function lastMessagePreview(thread: ChatThreadSummary) {
  const message = thread.last_message;
  if (!message) return '';
  const content = message.content || (
    message.attachments.length === 1 ? t('attachment') : t('attachments')
  );
  return message.is_mine ? `${t('you')}: ${content}` : content;
}

function ChatRow({ thread }: { thread: ChatThreadSummary }) {
  const user = thread.other_user;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({
        pathname: '/chat/[threadId]',
        params: { threadId: String(thread.id) },
      })}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {user.profile_image_url ? (
        <Image source={{ uri: user.profile_image_url }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarFallback}>
          <Text style={styles.avatarLetter}>{user.username[0]?.toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <View style={styles.usernameLine}>
            <Text numberOfLines={1} style={styles.username}>{user.username}</Text>
            {user.is_verified_artist ? <Text style={styles.verified}>✓</Text> : null}
          </View>
          <Text style={styles.time}>{formatChatTime(thread.updated_at)}</Text>
        </View>
        <View style={styles.previewLine}>
          <Text
            numberOfLines={1}
            style={[styles.preview, thread.unread_count > 0 && styles.previewUnread]}
          >
            {lastMessagePreview(thread)}
          </Text>
          {thread.unread_count ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>
                {thread.unread_count > 99 ? '99+' : thread.unread_count}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export default function ChatsScreen() {
  const { threads, loading, error, refresh } = useChat();
  const [refreshing, setRefreshing] = useState(false);

  const refreshList = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
      <FlatList
        contentContainerStyle={styles.content}
        data={threads}
        keyExtractor={(thread) => String(thread.id)}
        ListHeaderComponent={(
          <View style={styles.header}>
            <BrandHeader />
            <View style={styles.titleCard}>
              <Text style={styles.eyebrow}>PRIVATE</Text>
              <Text style={styles.title}>{t('chats')}</Text>
              <Text style={styles.subtitle}>{t('chatsSubtitle')}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.muted}>{t('loadingChats')}</Text>
          </View>
        ) : error ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>{t('chatsUnavailable')}</Text>
            <Text style={styles.muted}>{t('chatsError')}</Text>
            <Button label={t('retry')} onPress={() => void refresh()} />
          </View>
        ) : (
          <View style={styles.stateCard}>
            <Text style={styles.emptySymbol}>◇</Text>
            <Text style={styles.stateTitle}>{t('chatsEmpty')}</Text>
            <Text style={styles.muted}>{t('chatsEmptyHint')}</Text>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={(
          <RefreshControl
            colors={[colors.primary]}
            onRefresh={() => void refreshList()}
            refreshing={refreshing}
            tintColor={colors.primary}
          />
        )}
        renderItem={({ item }) => <ChatRow thread={item} />}
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
  titleCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.large,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 32, fontWeight: '900' },
  subtitle: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  row: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.medium,
  },
  pressed: { opacity: 0.72, transform: [{ scale: 0.992 }] },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarFallback: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  avatarLetter: { color: colors.backgroundDeep, fontSize: 22, fontWeight: '900' },
  rowBody: { flex: 1, minWidth: 0, gap: 7 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  usernameLine: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 5 },
  username: { flexShrink: 1, color: colors.text, fontSize: 16, fontWeight: '900' },
  verified: { color: colors.primary, fontSize: 14, fontWeight: '900' },
  time: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  previewLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  preview: { flex: 1, color: colors.textMuted, fontSize: 13 },
  previewUnread: { color: colors.text, fontWeight: '800' },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  unreadText: { color: colors.white, fontSize: 11, fontWeight: '900' },
  separator: { height: spacing.sm },
  centerState: { minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
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
});

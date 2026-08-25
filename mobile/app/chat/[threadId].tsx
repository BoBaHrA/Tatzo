import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import type {
  ChatAttachment,
  ChatMessage,
  ChatThreadDetail,
} from '@/api/types';
import { useAuth } from '@/auth/auth-context';
import {
  deleteChatMessage,
  editChatMessage,
  fetchChatThread,
  sendChatMessage,
  type PendingChatAttachment,
} from '@/chat/chat-api';
import { useChat } from '@/chat/chat-context';
import { Button } from '@/components/button';
import { appLanguage, t } from '@/i18n';
import { toggleProfileBlock } from '@/profile/profile-api';
import { colors, radius, spacing } from '@/theme';
import { fetchHealingDetail } from '@/healing/healing-api';


const MAX_ATTACHMENTS = 6;
const INPUT_MIN_HEIGHT = 46;
const INPUT_MAX_HEIGHT = 112;

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat(appLanguage, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function attachmentKey(uri: string, index: number) {
  return `${Date.now()}-${index}-${uri}`;
}

function Sheet({
  children,
  onClose,
  title,
  visible,
}: PropsWithChildren<{ visible: boolean; onClose: () => void; title: string }>) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.modalRoot}>
        <Pressable accessibilityLabel={t('cancel')} onPress={onClose} style={styles.backdrop} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{title}</Text>
          {children}
        </View>
      </View>
    </Modal>
  );
}

function FullVideo({ attachment }: { attachment: ChatAttachment }) {
  const player = useVideoPlayer({ uri: attachment.url, useCaching: true });
  return (
    <VideoView
      contentFit="contain"
      fullscreenOptions={{ enable: true }}
      nativeControls
      player={player}
      style={styles.fullMedia}
    />
  );
}

function MessageAttachment({
  attachment,
  onPreview,
}: {
  attachment: ChatAttachment;
  onPreview: (attachment: ChatAttachment) => void;
}) {
  if (attachment.type === 'image') {
    return (
      <Pressable onPress={() => onPreview(attachment)} style={styles.imageAttachmentButton}>
        <Image
          accessibilityLabel={attachment.name}
          resizeMode="cover"
          source={{ uri: attachment.url }}
          style={styles.imageAttachment}
        />
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={() => (
        attachment.type === 'video'
          ? onPreview(attachment)
          : void Linking.openURL(attachment.url)
      )}
      style={({ pressed }) => [styles.fileAttachment, pressed && styles.pressed]}
    >
      <Text style={styles.fileIcon}>{attachment.type === 'video' ? '▶' : '↗'}</Text>
      <Text numberOfLines={2} style={styles.fileName}>{attachment.name}</Text>
    </Pressable>
  );
}

function PendingAttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: PendingChatAttachment;
  onRemove: () => void;
}) {
  return (
    <View style={styles.pendingChip}>
      {attachment.type === 'image' ? (
        <Image source={{ uri: attachment.uri }} style={styles.pendingThumb} />
      ) : (
        <View style={styles.pendingIconWrap}>
          <Text style={styles.pendingIcon}>{attachment.type === 'video' ? '▶' : '↗'}</Text>
        </View>
      )}
      <Text numberOfLines={1} style={styles.pendingName}>{attachment.name}</Text>
      <Pressable
        accessibilityLabel={t('removeAttachment')}
        onPress={onRemove}
        style={styles.removeChip}
      >
        <Text style={styles.removeChipText}>×</Text>
      </Pressable>
    </View>
  );
}

export default function ChatThreadScreen() {
  const params = useLocalSearchParams<{
    threadId?: string | string[];
    healingJourneyId?: string | string[];
  }>();
  const rawThreadId = Array.isArray(params.threadId) ? params.threadId[0] : params.threadId;
  const rawHealingJourneyId = Array.isArray(params.healingJourneyId)
    ? params.healingJourneyId[0]
    : params.healingJourneyId;
  const threadId = Number(rawThreadId);
  const validThreadId = Number.isInteger(threadId) && threadId > 0;
  const { request, status } = useAuth();
  const { clearUnread, refresh: refreshChats } = useChat();
  const [thread, setThread] = useState<ChatThreadDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [content, setContent] = useState('');
  const [healingDraft, setHealingDraft] = useState<{
    otherUserId: number;
    content: string;
  } | null>(null);
  const [inputHeight, setInputHeight] = useState(INPUT_MIN_HEIGHT);
  const [pendingAttachments, setPendingAttachments] = useState<PendingChatAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<'composer' | 'edit' | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editAttachments, setEditAttachments] = useState<PendingChatAttachment[]>([]);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<Set<number>>(new Set());
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChatMessage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [blockConfirmVisible, setBlockConfirmVisible] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<ChatAttachment | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const pollInFlight = useRef(false);
  const lastMessageId = useRef<number | null>(null);
  const shouldScrollToEnd = useRef(true);
  const loadedHealingJourneyId = useRef<string | null>(null);

  useEffect(() => {
    lastMessageId.current = messages.at(-1)?.id ?? null;
  }, [messages]);

  const loadThread = useCallback(async () => {
    if (status !== 'authenticated' || !validThreadId) {
      setLoading(false);
      if (!validThreadId) setLoadError(t('chatError'));
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const response = await fetchChatThread(request, threadId);
      setThread(response);
      setMessages(response.messages);
      setHasMore(response.has_more);
      clearUnread(threadId);
      shouldScrollToEnd.current = true;
      void refreshChats();
    } catch (error) {
      setThread(null);
      setLoadError(
        error instanceof ApiError && error.status === 404
          ? t('chatUnavailable')
          : t('chatError'),
      );
    } finally {
      setLoading(false);
    }
  }, [clearUnread, refreshChats, request, status, threadId, validThreadId]);

  useEffect(() => {
    void loadThread();
  }, [loadThread]);

  useEffect(() => {
    const journeyId = String(rawHealingJourneyId ?? '');
    if (
      status !== 'authenticated'
      || !journeyId
      || loadedHealingJourneyId.current === journeyId
    ) return;
    loadedHealingJourneyId.current = journeyId;
    let cancelled = false;
    void fetchHealingDetail(request, journeyId)
      .then((healing) => {
        if (!cancelled) {
          setHealingDraft({
            otherUserId: healing.other_user.id,
            content: healing.chat_draft,
          });
        }
      })
      .catch(() => {
        // The chat remains usable when the optional Healing context is unavailable.
      });
    return () => {
      cancelled = true;
    };
  }, [rawHealingJourneyId, request, status]);

  useEffect(() => {
    if (!thread || !healingDraft || thread.other_user.id !== healingDraft.otherUserId) return;
    setContent((current) => current || healingDraft.content);
    setHealingDraft(null);
  }, [healingDraft, thread]);

  useEffect(() => {
    if (status !== 'authenticated' || !thread || !validThreadId) return undefined;
    const poll = setInterval(async () => {
      if (pollInFlight.current) return;
      pollInFlight.current = true;
      try {
        const response = await fetchChatThread(
          request,
          threadId,
          lastMessageId.current ? { after: lastMessageId.current } : undefined,
        );
        setThread(response);
        if (response.last_read_message_id) {
          setMessages((current) => current.map((message) => (
            message.is_mine && message.id <= response.last_read_message_id!
              ? { ...message, is_read: true }
              : message
          )));
        }
        if (response.messages.length) {
          shouldScrollToEnd.current = true;
          setMessages((current) => {
            const known = new Set(current.map((message) => message.id));
            return [
              ...current,
              ...response.messages.filter((message) => !known.has(message.id)),
            ];
          });
          void refreshChats();
        }
        clearUnread(threadId);
      } catch {
        // A temporary polling failure should not replace a usable conversation.
      } finally {
        pollInFlight.current = false;
      }
    }, 2_500);
    return () => clearInterval(poll);
  }, [clearUnread, refreshChats, request, status, thread, threadId, validThreadId]);

  if (status === 'anonymous') {
    return <Redirect href="/(auth)/login" />;
  }

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/chats');
  };

  const loadEarlier = async () => {
    const firstId = messages[0]?.id;
    if (!firstId || loadingEarlier || !hasMore) return;
    setLoadingEarlier(true);
    try {
      const response = await fetchChatThread(request, threadId, { before: firstId });
      shouldScrollToEnd.current = false;
      setMessages((current) => {
        const known = new Set(current.map((message) => message.id));
        return [
          ...response.messages.filter((message) => !known.has(message.id)),
          ...current,
        ];
      });
      setHasMore(response.has_more);
    } catch {
      setActionError(t('chatError'));
    } finally {
      setLoadingEarlier(false);
    }
  };

  const appendPicked = (
    target: 'composer' | 'edit',
    picked: PendingChatAttachment[],
  ) => {
    const current = target === 'composer' ? pendingAttachments : editAttachments;
    const retainedExisting = target === 'edit' && editingMessage
      ? editingMessage.attachments.filter((item) => !removedAttachmentIds.has(item.id)).length
      : 0;
    const remaining = Math.max(0, MAX_ATTACHMENTS - retainedExisting - current.length);
    if (picked.length > remaining) setActionError(t('attachmentLimit'));
    const accepted = picked.slice(0, remaining);
    if (target === 'composer') {
      setPendingAttachments((items) => [...items, ...accepted]);
    } else {
      setEditAttachments((items) => [...items, ...accepted]);
    }
  };

  const pickMedia = async (target: 'composer' | 'edit') => {
    setPickerTarget(null);
    setActionError('');
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setActionError(t('attachmentError'));
        return;
      }
      const currentCount = target === 'composer' ? pendingAttachments.length : editAttachments.length;
      const retainedExisting = target === 'edit' && editingMessage
        ? editingMessage.attachments.filter((item) => !removedAttachmentIds.has(item.id)).length
        : 0;
      const remaining = MAX_ATTACHMENTS - currentCount - retainedExisting;
      if (remaining <= 0) {
        setActionError(t('attachmentLimit'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: true,
        mediaTypes: ['images', 'videos'],
        quality: 0.9,
        selectionLimit: remaining,
      });
      if (result.canceled) return;
      appendPicked(target, result.assets.map((asset, index) => {
        const type = asset.type === 'video' ? 'video' : 'image';
        return {
          key: attachmentKey(asset.uri, index),
          uri: asset.uri,
          name: asset.fileName ?? `tatzo-${Date.now()}-${index}.${type === 'video' ? 'mp4' : 'jpg'}`,
          mimeType: asset.mimeType ?? `${type}/${type === 'video' ? 'mp4' : 'jpeg'}`,
          type,
        };
      }));
    } catch {
      setActionError(t('attachmentError'));
    }
  };

  const pickFile = async (target: 'composer' | 'edit') => {
    setPickerTarget(null);
    setActionError('');
    try {
      const currentCount = target === 'composer' ? pendingAttachments.length : editAttachments.length;
      const retainedExisting = target === 'edit' && editingMessage
        ? editingMessage.attachments.filter((item) => !removedAttachmentIds.has(item.id)).length
        : 0;
      const remaining = MAX_ATTACHMENTS - currentCount - retainedExisting;
      if (remaining <= 0) {
        setActionError(t('attachmentLimit'));
        return;
      }
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (result.canceled) return;
      appendPicked(target, result.assets.map((asset, index) => {
        const mimeType = asset.mimeType ?? 'application/octet-stream';
        const type = mimeType.startsWith('image/')
          ? 'image'
          : mimeType.startsWith('video/')
            ? 'video'
            : 'file';
        return {
          key: attachmentKey(asset.uri, index),
          uri: asset.uri,
          name: asset.name,
          mimeType,
          type,
        };
      }));
    } catch {
      setActionError(t('attachmentError'));
    }
  };

  const send = async () => {
    const trimmed = content.trim();
    if ((!trimmed && !pendingAttachments.length) || sending || !thread) return;
    setSending(true);
    setActionError('');
    try {
      const message = await sendChatMessage(
        request,
        threadId,
        trimmed,
        pendingAttachments,
      );
      shouldScrollToEnd.current = true;
      setMessages((current) => [...current, message]);
      setContent('');
      setPendingAttachments([]);
      setInputHeight(INPUT_MIN_HEIGHT);
      void refreshChats();
    } catch (error) {
      if (error instanceof ApiError && error.body.code === 'chat_blocked') {
        void loadThread();
      }
      setActionError(t('sendError'));
    } finally {
      setSending(false);
    }
  };

  const beginEdit = (message: ChatMessage) => {
    setSelectedMessage(null);
    setEditingMessage(message);
    setEditContent(message.content);
    setEditAttachments([]);
    setRemovedAttachmentIds(new Set());
    setActionError('');
  };

  const saveEdit = async () => {
    if (!editingMessage || savingEdit) return;
    const retainedCount = editingMessage.attachments.filter(
      (attachment) => !removedAttachmentIds.has(attachment.id),
    ).length;
    if (!editContent.trim() && !retainedCount && !editAttachments.length) {
      setActionError(t('sendError'));
      return;
    }
    setSavingEdit(true);
    try {
      const updated = await editChatMessage(
        request,
        editingMessage.id,
        editContent.trim(),
        [...removedAttachmentIds],
        editAttachments,
      );
      setMessages((current) => current.map((message) => (
        message.id === updated.id ? updated : message
      )));
      setEditingMessage(null);
      setEditAttachments([]);
      setRemovedAttachmentIds(new Set());
      void refreshChats();
    } catch {
      setActionError(t('editError'));
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmDelete = (message: ChatMessage) => {
    setActionError('');
    setSelectedMessage(null);
    setDeleteTarget(message);
  };

  const removeMessage = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await deleteChatMessage(request, deleteTarget.id);
      setMessages((current) => current.filter((message) => message.id !== deleteTarget.id));
      setDeleteTarget(null);
      void refreshChats();
    } catch {
      setActionError(t('deleteError'));
    } finally {
      setDeleting(false);
    }
  };

  const updateBlock = async () => {
    if (!thread || blocking) return;
    setBlocking(true);
    try {
      const response = await toggleProfileBlock(request, thread.other_user.username);
      setThread((current) => current ? {
        ...current,
        is_blocked_by_me: response.is_blocked,
        chat_blocked: response.is_blocked || current.has_blocked_me,
      } : current);
      setBlockConfirmVisible(false);
      void refreshChats();
    } catch {
      setActionError(thread.is_blocked_by_me ? t('unblockError') : t('blockError'));
    } finally {
      setBlocking(false);
    }
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => (
    <View style={[styles.messageRow, item.is_mine ? styles.mineRow : styles.theirRow]}>
      <Pressable
        delayLongPress={280}
        disabled={!item.is_mine}
        onLongPress={() => {
          setActionError('');
          setSelectedMessage(item);
        }}
        style={[
          styles.bubble,
          item.is_mine ? styles.mineBubble : styles.theirBubble,
        ]}
      >
        {item.attachments.length ? (
          <View style={styles.messageAttachments}>
            {item.attachments.map((attachment) => (
              <MessageAttachment
                attachment={attachment}
                key={attachment.id}
                onPreview={setMediaPreview}
              />
            ))}
          </View>
        ) : null}
        {item.content ? <Text style={styles.messageText}>{item.content}</Text> : null}
        <View style={styles.messageMeta}>
          {item.is_edited ? <Text style={styles.edited}>{t('edited')}</Text> : null}
          <Text style={styles.messageTime}>{formatMessageTime(item.created_at)}</Text>
          {item.is_mine ? (
            <Text style={[styles.readState, item.is_read && styles.readStateActive]}>✓✓</Text>
          ) : null}
        </View>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
        style={styles.flex}
      >
        <View style={styles.topBar}>
          <Pressable
            accessibilityLabel={t('back')}
            onPress={goBack}
            style={({ pressed }) => [styles.topButton, pressed && styles.pressed]}
          >
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          {thread ? (
            <Pressable
              disabled={thread.chat_blocked}
              onPress={() => router.push({
                pathname: '/profile/[username]',
                params: { username: thread.other_user.username },
              })}
              style={styles.headerIdentity}
            >
              {thread.other_user.profile_image_url ? (
                <Image source={{ uri: thread.other_user.profile_image_url }} style={styles.headerAvatar} />
              ) : (
                <View style={styles.headerAvatarFallback}>
                  <Text style={styles.headerAvatarLetter}>
                    {thread.other_user.username[0]?.toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.headerNames}>
                <View style={styles.headerUsernameLine}>
                  <Text numberOfLines={1} style={styles.headerUsername}>
                    {thread.other_user.username}
                  </Text>
                  {thread.other_user.is_verified_artist ? (
                    <Text style={styles.headerVerified}>✓</Text>
                  ) : null}
                </View>
                <Text numberOfLines={1} style={styles.headerTag}>
                  {thread.other_user.is_verified_artist
                    ? t('artist')
                    : `@${thread.other_user.tag ?? thread.other_user.username}`}
                </Text>
              </View>
            </Pressable>
          ) : (
            <Text style={styles.headerLoading}>{t('chats')}</Text>
          )}
          {thread ? (
            <Pressable
              accessibilityLabel={thread.is_blocked_by_me ? t('unblockUser') : t('blockUser')}
              onPress={() => {
                setActionError('');
                setBlockConfirmVisible(true);
              }}
              style={({ pressed }) => [styles.blockButton, pressed && styles.pressed]}
            >
              <Text adjustsFontSizeToFit minimumFontScale={0.65} numberOfLines={1} style={styles.blockButtonText}>
                {thread.is_blocked_by_me ? t('unblock') : t('block')}
              </Text>
            </Pressable>
          ) : <View style={styles.topButton} />}
        </View>

        {loading && !thread ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.muted}>{t('chatLoading')}</Text>
          </View>
        ) : !thread ? (
          <View style={styles.centerState}>
            <Text style={styles.stateTitle}>{t('chatUnavailable')}</Text>
            <Text style={styles.muted}>{loadError || t('chatError')}</Text>
            <Button label={t('retry')} onPress={() => void loadThread()} />
          </View>
        ) : (
          <>
            <FlatList
              contentContainerStyle={[
                styles.messagesContent,
                messages.length === 0 && styles.emptyMessagesContent,
              ]}
              data={messages}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              keyExtractor={(message) => String(message.id)}
              ListEmptyComponent={(
                <View style={styles.emptyChat}>
                  <Text style={styles.emptySymbol}>◇</Text>
                  <Text style={styles.stateTitle}>{t('noMessages')}</Text>
                  <Text style={styles.muted}>{t('noMessagesHint')}</Text>
                </View>
              )}
              ListHeaderComponent={hasMore ? (
                <Pressable
                  disabled={loadingEarlier}
                  onPress={() => void loadEarlier()}
                  style={styles.earlierButton}
                >
                  {loadingEarlier ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Text style={styles.earlierText}>{t('loadEarlier')}</Text>
                  )}
                </Pressable>
              ) : null}
              onContentSizeChange={() => {
                if (shouldScrollToEnd.current) {
                  listRef.current?.scrollToEnd({ animated: messages.length > 1 });
                  shouldScrollToEnd.current = false;
                }
              }}
              ref={listRef}
              renderItem={renderMessage}
              style={styles.messagesList}
            />

            {actionError ? <Text style={styles.actionError}>{actionError}</Text> : null}

            {thread.chat_blocked ? (
              <View style={styles.blockedBar}>
                <Text style={styles.blockedText}>
                  {thread.is_blocked_by_me ? t('chatBlockedByYou') : t('chatBlockedByThem')}
                </Text>
                {thread.is_blocked_by_me ? (
                  <Pressable
                    onPress={() => {
                      setActionError('');
                      setBlockConfirmVisible(true);
                    }}
                    style={styles.unblockInline}
                  >
                    <Text style={styles.unblockInlineText}>{t('unblock')}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View style={styles.composerWrap}>
                {pendingAttachments.length ? (
                  <FlatList
                    contentContainerStyle={styles.pendingList}
                    data={pendingAttachments}
                    horizontal
                    keyExtractor={(attachment) => attachment.key}
                    renderItem={({ item }) => (
                      <PendingAttachmentChip
                        attachment={item}
                        onRemove={() => setPendingAttachments((current) => (
                          current.filter((attachment) => attachment.key !== item.key)
                        ))}
                      />
                    )}
                    showsHorizontalScrollIndicator={false}
                  />
                ) : null}
                <View style={styles.composer}>
                  <Pressable
                    accessibilityLabel={t('attach')}
                    onPress={() => {
                      setActionError('');
                      setPickerTarget('composer');
                    }}
                    style={({ pressed }) => [styles.attachButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.attachButtonText}>＋</Text>
                  </Pressable>
                  <TextInput
                    maxLength={2000}
                    multiline
                    onChangeText={setContent}
                    onContentSizeChange={(event) => setInputHeight(Math.min(
                      INPUT_MAX_HEIGHT,
                      Math.max(INPUT_MIN_HEIGHT, event.nativeEvent.contentSize.height + 14),
                    ))}
                    placeholder={t('messagePlaceholder')}
                    placeholderTextColor={colors.textMuted}
                    scrollEnabled={inputHeight >= INPUT_MAX_HEIGHT}
                    style={[styles.input, { height: inputHeight }]}
                    value={content}
                  />
                  <Pressable
                    accessibilityLabel={t('send')}
                    disabled={sending || (!content.trim() && !pendingAttachments.length)}
                    onPress={() => void send()}
                    style={({ pressed }) => [
                      styles.sendButton,
                      (sending || (!content.trim() && !pendingAttachments.length)) && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    {sending ? (
                      <ActivityIndicator color={colors.backgroundDeep} size="small" />
                    ) : (
                      <Text style={styles.sendButtonText}>↑</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            )}
          </>
        )}
      </KeyboardAvoidingView>

      <Sheet
        onClose={() => setPickerTarget(null)}
        title={t('attach')}
        visible={pickerTarget !== null}
      >
        <Pressable
          onPress={() => pickerTarget && void pickMedia(pickerTarget)}
          style={({ pressed }) => [styles.sheetAction, pressed && styles.pressed]}
        >
          <Text style={styles.sheetActionIcon}>▧</Text>
          <Text style={styles.sheetActionText}>{t('chooseMedia')}</Text>
        </Pressable>
        <Pressable
          onPress={() => pickerTarget && void pickFile(pickerTarget)}
          style={({ pressed }) => [styles.sheetAction, pressed && styles.pressed]}
        >
          <Text style={styles.sheetActionIcon}>↗</Text>
          <Text style={styles.sheetActionText}>{t('chooseFile')}</Text>
        </Pressable>
        <Button label={t('cancel')} onPress={() => setPickerTarget(null)} variant="secondary" />
      </Sheet>

      <Sheet
        onClose={() => setSelectedMessage(null)}
        title={t('messageActions')}
        visible={selectedMessage !== null}
      >
        {selectedMessage ? (
          <>
            <Pressable
              onPress={() => beginEdit(selectedMessage)}
              style={({ pressed }) => [styles.sheetAction, pressed && styles.pressed]}
            >
              <Text style={styles.sheetActionIcon}>✎</Text>
              <Text style={styles.sheetActionText}>{t('editMessage')}</Text>
            </Pressable>
            <Pressable
              onPress={() => confirmDelete(selectedMessage)}
              style={({ pressed }) => [styles.sheetAction, pressed && styles.pressed]}
            >
              <Text style={[styles.sheetActionIcon, styles.dangerText]}>×</Text>
              <Text style={[styles.sheetActionText, styles.dangerText]}>{t('deleteMessage')}</Text>
            </Pressable>
          </>
        ) : null}
        <Button label={t('cancel')} onPress={() => setSelectedMessage(null)} variant="secondary" />
      </Sheet>

      <Sheet
        onClose={() => setEditingMessage(null)}
        title={t('editMessage')}
        visible={editingMessage !== null}
      >
        {actionError ? <Text style={styles.sheetError}>{actionError}</Text> : null}
        <TextInput
          maxLength={2000}
          multiline
          onChangeText={setEditContent}
          placeholder={t('messagePlaceholder')}
          placeholderTextColor={colors.textMuted}
          style={styles.editInput}
          value={editContent}
        />
        {editingMessage?.attachments.map((attachment) => (
          <View
            key={attachment.id}
            style={[
              styles.existingAttachment,
              removedAttachmentIds.has(attachment.id) && styles.removedAttachment,
            ]}
          >
            <Text numberOfLines={1} style={styles.existingAttachmentName}>{attachment.name}</Text>
            <Pressable
              onPress={() => setRemovedAttachmentIds((current) => {
                const next = new Set(current);
                if (next.has(attachment.id)) next.delete(attachment.id);
                else next.add(attachment.id);
                return next;
              })}
              style={styles.removeExisting}
            >
              <Text style={styles.removeExistingText}>
                {removedAttachmentIds.has(attachment.id) ? '↶' : '×'}
              </Text>
            </Pressable>
          </View>
        ))}
        {editAttachments.map((attachment) => (
          <PendingAttachmentChip
            attachment={attachment}
            key={attachment.key}
            onRemove={() => setEditAttachments((current) => (
              current.filter((item) => item.key !== attachment.key)
            ))}
          />
        ))}
        <Button
          label={t('attach')}
          onPress={() => {
            setActionError('');
            setPickerTarget('edit');
          }}
          variant="secondary"
        />
        <Button
          label={t('save')}
          loading={savingEdit}
          onPress={() => void saveEdit()}
        />
        <Button label={t('cancel')} onPress={() => setEditingMessage(null)} variant="secondary" />
      </Sheet>

      <Sheet
        onClose={() => setDeleteTarget(null)}
        title={t('deleteMessage')}
        visible={deleteTarget !== null}
      >
        {actionError ? <Text style={styles.sheetError}>{actionError}</Text> : null}
        <Text style={styles.confirmText}>{t('deleteMessagePrompt')}</Text>
        <Button
          label={t('deleteMessage')}
          loading={deleting}
          onPress={() => void removeMessage()}
          variant="danger"
        />
        <Button label={t('cancel')} onPress={() => setDeleteTarget(null)} variant="secondary" />
      </Sheet>

      <Sheet
        onClose={() => setBlockConfirmVisible(false)}
        title={thread?.is_blocked_by_me ? t('unblockUser') : t('blockUser')}
        visible={blockConfirmVisible}
      >
        {actionError ? <Text style={styles.sheetError}>{actionError}</Text> : null}
        <Text style={styles.confirmText}>
          {thread?.is_blocked_by_me ? t('unblockUserConfirm') : t('blockUserConfirm')}{' '}
          {thread?.other_user.username}?
        </Text>
        <Button
          label={thread?.is_blocked_by_me ? t('unblock') : t('block')}
          loading={blocking}
          onPress={() => void updateBlock()}
          variant={thread?.is_blocked_by_me ? 'secondary' : 'danger'}
        />
        <Button label={t('cancel')} onPress={() => setBlockConfirmVisible(false)} variant="secondary" />
      </Sheet>

      <Modal
        animationType="fade"
        onRequestClose={() => setMediaPreview(null)}
        transparent
        visible={mediaPreview !== null}
      >
        <View style={styles.mediaModal}>
          <Pressable onPress={() => setMediaPreview(null)} style={styles.mediaClose}>
            <Text style={styles.mediaCloseText}>×</Text>
          </Pressable>
          {mediaPreview?.type === 'image' ? (
            <Image resizeMode="contain" source={{ uri: mediaPreview.url }} style={styles.fullMedia} />
          ) : mediaPreview?.type === 'video' ? (
            <FullVideo attachment={mediaPreview} />
          ) : null}
          <Text numberOfLines={2} style={styles.mediaName}>{mediaPreview?.name}</Text>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  topBar: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(4, 197, 191, 0.18)',
    backgroundColor: 'rgba(0, 18, 28, 0.98)',
  },
  topButton: { width: 42, height: 48, alignItems: 'center', justifyContent: 'center' },
  backIcon: { color: colors.primary, fontSize: 38, lineHeight: 40, fontWeight: '400' },
  headerIdentity: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  headerAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  headerAvatarFallback: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(4, 197, 191, 0.09)',
    borderWidth: 2,
    borderColor: colors.primary,
  },
  headerAvatarLetter: { color: colors.primary, fontSize: 17, fontWeight: '900' },
  headerNames: { flex: 1, minWidth: 0, gap: 1 },
  headerUsernameLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerUsername: { flexShrink: 1, color: colors.text, fontSize: 15, fontWeight: '900' },
  headerVerified: { color: colors.primary, fontSize: 13, fontWeight: '900' },
  headerTag: { color: colors.textMuted, fontSize: 11 },
  headerLoading: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '900' },
  blockButton: {
    minWidth: 68,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 87, 127, 0.28)',
    backgroundColor: 'rgba(255, 87, 127, 0.06)',
  },
  blockButtonText: { color: colors.danger, fontSize: 11, fontWeight: '900' },
  pressed: { opacity: 0.68 },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  stateTitle: { color: colors.text, fontSize: 21, fontWeight: '900', textAlign: 'center' },
  muted: { color: colors.textMuted, lineHeight: 21, textAlign: 'center' },
  messagesList: { flex: 1 },
  messagesContent: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 10,
  },
  emptyMessagesContent: { flexGrow: 1, justifyContent: 'center' },
  emptyChat: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  emptySymbol: { color: colors.primary, fontSize: 42, fontWeight: '900' },
  earlierButton: { alignItems: 'center', padding: spacing.sm, marginBottom: spacing.sm },
  earlierText: { color: colors.primary, fontSize: 13, fontWeight: '800' },
  messageRow: { width: '100%', flexDirection: 'row' },
  mineRow: { justifyContent: 'flex-end' },
  theirRow: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '88%',
    minWidth: 70,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1,
    gap: 7,
  },
  mineBubble: {
    backgroundColor: 'rgba(4, 197, 191, 0.14)',
    borderColor: 'rgba(4, 197, 191, 0.22)',
    borderBottomRightRadius: 6,
  },
  theirBubble: {
    backgroundColor: 'rgba(255, 255, 255, 0.045)',
    borderColor: 'rgba(255, 255, 255, 0.07)',
    borderBottomLeftRadius: 6,
  },
  messageText: { color: colors.text, fontSize: 15, lineHeight: 20 },
  messageMeta: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 4 },
  edited: { color: colors.textMuted, fontSize: 9, fontStyle: 'italic' },
  messageTime: { color: 'rgba(245, 251, 252, 0.65)', fontSize: 9 },
  readState: { color: 'rgba(245, 251, 252, 0.55)', fontSize: 9, letterSpacing: -3, paddingRight: 3 },
  readStateActive: { color: colors.primary },
  messageAttachments: { gap: 5 },
  imageAttachmentButton: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.16)',
  },
  imageAttachment: { width: 230, maxWidth: '100%', height: 205, backgroundColor: colors.backgroundDeep },
  fileAttachment: {
    minWidth: 190,
    maxWidth: 260,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.18)',
    backgroundColor: 'rgba(4, 197, 191, 0.10)',
    padding: spacing.sm,
  },
  fileIcon: { color: colors.primary, fontSize: 18, fontWeight: '900' },
  fileName: { flex: 1, color: colors.text, fontSize: 12, fontWeight: '700' },
  actionError: {
    color: colors.danger,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.danger,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    textAlign: 'center',
    fontSize: 12,
  },
  composerWrap: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(4, 197, 191, 0.12)',
    backgroundColor: 'rgba(0, 13, 24, 0.94)',
    paddingTop: spacing.xs,
  },
  pendingList: { paddingHorizontal: spacing.sm, gap: spacing.xs, paddingBottom: spacing.xs },
  pendingChip: {
    height: 48,
    maxWidth: 190,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.small,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingRight: spacing.xs,
    overflow: 'hidden',
  },
  pendingThumb: { width: 46, height: 46 },
  pendingIconWrap: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  pendingIcon: { color: colors.primary, fontSize: 18, fontWeight: '900' },
  pendingName: { flex: 1, color: colors.text, fontSize: 11, fontWeight: '700' },
  removeChip: { width: 24, height: 32, alignItems: 'center', justifyContent: 'center' },
  removeChipText: { color: colors.danger, fontSize: 22, fontWeight: '700' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  attachButton: {
    width: INPUT_MIN_HEIGHT,
    height: INPUT_MIN_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: 'rgba(4, 197, 191, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.24)',
  },
  attachButtonText: { color: colors.primary, fontSize: 25, lineHeight: 28, fontWeight: '500' },
  input: {
    flex: 1,
    minHeight: INPUT_MIN_HEIGHT,
    maxHeight: INPUT_MAX_HEIGHT,
    color: colors.text,
    backgroundColor: 'rgba(0, 18, 28, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.22)',
    borderRadius: 15,
    paddingHorizontal: spacing.md,
    paddingTop: 12,
    paddingBottom: 10,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  sendButton: {
    width: INPUT_MIN_HEIGHT,
    height: INPUT_MIN_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: colors.primary,
  },
  sendButtonText: { color: colors.backgroundDeep, fontSize: 27, lineHeight: 29, fontWeight: '900' },
  disabled: { opacity: 0.42 },
  blockedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.backgroundDeep,
  },
  blockedText: { flex: 1, color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  unblockInline: { padding: spacing.sm },
  unblockInlineText: { color: colors.primary, fontSize: 12, fontWeight: '900' },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 5, 9, 0.76)',
  },
  sheet: {
    width: '100%',
    maxWidth: 620,
    maxHeight: '88%',
    alignSelf: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    borderTopLeftRadius: radius.large,
    borderTopRightRadius: radius.large,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sheetHandle: { width: 46, height: 4, alignSelf: 'center', borderRadius: 2, backgroundColor: colors.border },
  sheetTitle: { color: colors.text, fontSize: 21, fontWeight: '900', marginBottom: spacing.xs },
  sheetAction: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  sheetActionIcon: { width: 24, color: colors.primary, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  sheetActionText: { color: colors.text, fontSize: 15, fontWeight: '800' },
  dangerText: { color: colors.danger },
  sheetError: {
    color: colors.danger,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.small,
    padding: spacing.sm,
    fontSize: 12,
    textAlign: 'center',
  },
  editInput: {
    minHeight: 110,
    maxHeight: 210,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.medium,
    backgroundColor: colors.backgroundDeep,
    padding: spacing.md,
    textAlignVertical: 'top',
    fontSize: 15,
  },
  existingAttachment: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.small,
    paddingLeft: spacing.sm,
  },
  removedAttachment: { opacity: 0.42 },
  existingAttachmentName: { flex: 1, color: colors.text, fontSize: 12 },
  removeExisting: { width: 44, height: 42, alignItems: 'center', justifyContent: 'center' },
  removeExistingText: { color: colors.danger, fontSize: 20, fontWeight: '900' },
  confirmText: { color: colors.textMuted, fontSize: 15, lineHeight: 22, marginBottom: spacing.sm },
  mediaModal: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: 'rgba(0, 5, 9, 0.97)',
  },
  mediaClose: {
    position: 'absolute',
    zIndex: 2,
    top: 52,
    right: 18,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: colors.surface,
  },
  mediaCloseText: { color: colors.text, fontSize: 30, lineHeight: 32 },
  fullMedia: { width: '100%', height: '76%' },
  mediaName: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
});

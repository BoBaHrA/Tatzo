import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { useAuth } from '@/auth/auth-context';
import {
  fetchNotificationCount,
  markNotificationRead,
} from '@/notifications/notification-api';
import {
  navigateToNotificationTarget,
  notificationTargetFromPushData,
} from '@/notifications/notification-navigation';
import { registerPushDevice } from '@/notifications/push-notifications';


type NotificationContextValue = {
  unreadCount: number;
  refreshCount: () => Promise<void>;
  syncUnreadCount: (count: number) => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: PropsWithChildren) {
  const { request, status } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const refreshingRef = useRef(false);
  const pendingResponseRef = useRef<Notifications.NotificationResponse | null>(null);
  const handledResponseIdsRef = useRef(new Set<string>());

  const refreshCount = useCallback(async () => {
    if (status !== 'authenticated' || refreshingRef.current) return;
    refreshingRef.current = true;
    try {
      const result = await fetchNotificationCount(request);
      setUnreadCount(result.unread_count);
    } catch {
      // A notification badge should never block the rest of the app.
    } finally {
      refreshingRef.current = false;
    }
  }, [request, status]);

  useEffect(() => {
    if (status !== 'authenticated') {
      setUnreadCount(0);
      return undefined;
    }
    void refreshCount();
    const poll = setInterval(() => void refreshCount(), 20_000);
    return () => clearInterval(poll);
  }, [refreshCount, status]);

  useEffect(() => {
    if (status !== 'authenticated' || Platform.OS === 'web') return undefined;
    void registerPushDevice(request).catch(() => {
      // Push permission or registration must never block the in-app center.
    });
    const tokenSubscription = Notifications.addPushTokenListener(() => {
      void registerPushDevice(request).catch(() => undefined);
    });
    return () => tokenSubscription.remove();
  }, [request, status]);

  const syncUnreadCount = useCallback((count: number) => {
    setUnreadCount(Math.max(0, count));
  }, []);

  const handlePushResponse = useCallback(async (
    response: Notifications.NotificationResponse,
  ) => {
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    if (status !== 'authenticated') {
      pendingResponseRef.current = response;
      return;
    }

    const responseId = response.notification.request.identifier;
    if (handledResponseIdsRef.current.has(responseId)) return;
    const data = response.notification.request.content.data ?? {};
    const target = notificationTargetFromPushData(data);
    if (!target) {
      await Notifications.clearLastNotificationResponseAsync();
      return;
    }
    handledResponseIdsRef.current.add(responseId);
    const notificationId = Number(data.notificationId);
    if (Number.isSafeInteger(notificationId) && notificationId > 0) {
      try {
        const result = await markNotificationRead(request, notificationId);
        syncUnreadCount(result.unread_count);
      } catch {
        await refreshCount();
      }
    }
    navigateToNotificationTarget(target);
    await Notifications.clearLastNotificationResponseAsync();
  }, [refreshCount, request, status, syncUnreadCount]);

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    const receivedSubscription = Notifications.addNotificationReceivedListener(() => {
      void refreshCount();
    });
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(
      (response) => void handlePushResponse(response),
    );
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) void handlePushResponse(response);
    });
    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [handlePushResponse, refreshCount]);

  useEffect(() => {
    if (status !== 'authenticated' || !pendingResponseRef.current) return;
    const response = pendingResponseRef.current;
    pendingResponseRef.current = null;
    void handlePushResponse(response);
  }, [handlePushResponse, status]);

  const value = useMemo<NotificationContextValue>(() => ({
    unreadCount,
    refreshCount,
    syncUnreadCount,
  }), [refreshCount, syncUnreadCount, unreadCount]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const value = useContext(NotificationContext);
  if (!value) {
    throw new Error('useNotifications must be used inside NotificationProvider');
  }
  return value;
}

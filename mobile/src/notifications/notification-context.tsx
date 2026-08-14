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

import { useAuth } from '@/auth/auth-context';
import { fetchNotificationCount } from '@/notifications/notification-api';


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

  const syncUnreadCount = useCallback((count: number) => {
    setUnreadCount(Math.max(0, count));
  }, []);

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

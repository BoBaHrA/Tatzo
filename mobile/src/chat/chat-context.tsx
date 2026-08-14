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

import type { ChatThreadSummary } from '@/api/types';
import { useAuth } from '@/auth/auth-context';
import { fetchChats } from '@/chat/chat-api';


type ChatContextValue = {
  threads: ChatThreadSummary[];
  unreadCount: number;
  loading: boolean;
  error: boolean;
  refresh: () => Promise<void>;
  clearUnread: (threadId: number) => void;
};

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: PropsWithChildren) {
  const { request, status } = useAuth();
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const refreshingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (status !== 'authenticated' || refreshingRef.current) return;
    refreshingRef.current = true;
    setLoading((current) => current || threads.length === 0);
    try {
      const response = await fetchChats(request);
      setThreads(response.results);
      setUnreadCount(response.unread_count);
      setError(false);
    } catch {
      setError(true);
    } finally {
      refreshingRef.current = false;
      setLoading(false);
    }
  }, [request, status, threads.length]);

  useEffect(() => {
    if (status !== 'authenticated') {
      setThreads([]);
      setUnreadCount(0);
      setLoading(false);
      setError(false);
      return undefined;
    }

    void refresh();
    const poll = setInterval(() => void refresh(), 8_000);
    return () => clearInterval(poll);
  }, [refresh, status]);

  const clearUnread = useCallback((threadId: number) => {
    setThreads((current) => {
      const cleared = current.find((thread) => thread.id === threadId)?.unread_count ?? 0;
      if (cleared) {
        setUnreadCount((total) => Math.max(0, total - cleared));
      }
      return current.map((thread) => (
        thread.id === threadId ? { ...thread, unread_count: 0 } : thread
      ));
    });
  }, []);

  const value = useMemo<ChatContextValue>(() => ({
    threads,
    unreadCount,
    loading,
    error,
    refresh,
    clearUnread,
  }), [clearUnread, error, loading, refresh, threads, unreadCount]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const value = useContext(ChatContext);
  if (!value) throw new Error('useChat must be used inside ChatProvider');
  return value;
}

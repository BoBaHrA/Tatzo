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

import { AppState } from 'react-native';

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
  const unreadCount = threads.reduce((total, thread) => total + thread.unread_count, 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const refreshingRef = useRef(false);
  const hasLoaded = useRef(false);
  const mounted = useRef(true);
  const clearedThreads = useRef(new Set<number>());
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const refresh = useCallback(async () => {
    if (status !== 'authenticated' || refreshingRef.current || AppState.currentState === 'background') return;
    refreshingRef.current = true;
    setLoading(!hasLoaded.current);
    clearedThreads.current.clear();
    try {
      const response = await fetchChats(request);
      if (!mounted.current) return;
      hasLoaded.current = true;
      const next = response.results.map(thread => clearedThreads.current.has(thread.id) ? { ...thread, unread_count: 0 } : thread);
      setThreads(next);
      setError(false);
    } catch {
      if (mounted.current) setError(true);
    } finally {
      refreshingRef.current = false;
      if (mounted.current) setLoading(false);
    }
  }, [request, status]);

  useEffect(() => {
    if (status !== 'authenticated') {
      setThreads([]);
      setLoading(false);
      setError(false);
      return undefined;
    }

    void refresh();
    const poll = setInterval(() => void refresh(), 8_000);
    const subscription = AppState.addEventListener('change', next => { if (next === 'active') void refresh(); });
    return () => { clearInterval(poll); subscription.remove(); };
  }, [refresh, status]);

  const clearUnread = useCallback((threadId: number) => {
    clearedThreads.current.add(threadId);
    setThreads((current) => {
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

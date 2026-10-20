import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { appLanguage, normalizeLanguage, setRuntimeLanguage } from './language-runtime';
export { getPreferredLanguage } from './language-runtime';
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


export type AppLanguage = 'en' | 'fr' | 'ru';

const STORAGE_KEY = 'tatzo-language';

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => Promise<void>;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: PropsWithChildren) {
  const revision = useRef(0);
  const writeQueue = useRef(Promise.resolve());
  const [language, setLanguageState] = useState<AppLanguage>(appLanguage);

  useEffect(() => {
    let active = true;
    const version = revision.current;
    const read = async () => Platform.OS === 'web' ? localStorage.getItem(STORAGE_KEY) : SecureStore.getItemAsync(STORAGE_KEY);
    void read().then((stored) => {
      if (!active || !stored || version !== revision.current) return;
      const next = normalizeLanguage(stored);
      setRuntimeLanguage(next);
      setLanguageState(next);
    }).catch(() => { /* Keep the device language when storage is unavailable. */ });
    return () => {
      active = false;
    };
  }, []);

  const setLanguage = useCallback(async (next: AppLanguage) => {
    revision.current++;
    setRuntimeLanguage(next);
    setLanguageState(next);
    writeQueue.current = writeQueue.current.then(async () => {
      if (Platform.OS === 'web') localStorage.setItem(STORAGE_KEY, next);
      else await SecureStore.setItemAsync(STORAGE_KEY, next);
    }).catch(() => { /* Keep the live preference if storage is unavailable. */ });
    await writeQueue.current;
  }, []);

  const value = useMemo(() => ({ language, setLanguage }), [language, setLanguage]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const value = useContext(LanguageContext);
  if (!value) {
    throw new Error('useLanguage must be used inside LanguageProvider');
  }
  return value;
}

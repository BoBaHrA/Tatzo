import * as SecureStore from 'expo-secure-store';
import { getLocales } from 'expo-localization';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';


export type AppLanguage = 'en' | 'fr' | 'ru';

const STORAGE_KEY = 'tatzo-language';

function normalizeLanguage(value?: string | null): AppLanguage {
  if (value === 'fr' || value === 'ru') return value;
  return 'en';
}

let runtimeLanguage: AppLanguage = normalizeLanguage(getLocales()[0]?.languageCode);

export function getPreferredLanguage(): AppLanguage {
  return runtimeLanguage;
}

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => Promise<void>;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: PropsWithChildren) {
  const [language, setLanguageState] = useState<AppLanguage>(runtimeLanguage);

  useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(STORAGE_KEY).then((stored) => {
      if (!active || !stored) return;
      const next = normalizeLanguage(stored);
      runtimeLanguage = next;
      setLanguageState(next);
    });
    return () => {
      active = false;
    };
  }, []);

  const setLanguage = useCallback(async (next: AppLanguage) => {
    runtimeLanguage = next;
    setLanguageState(next);
    await SecureStore.setItemAsync(STORAGE_KEY, next);
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

import { getLocales } from 'expo-localization';

export type AppLanguage = 'en' | 'fr' | 'ru';
export function normalizeLanguage(value?: string | null): AppLanguage {
  return value === 'fr' || value === 'ru' ? value : 'en';
}
export let appLanguage: AppLanguage = normalizeLanguage(getLocales()[0]?.languageCode);
export function setRuntimeLanguage(language: AppLanguage) { appLanguage = language; }
export function getPreferredLanguage(): AppLanguage { return appLanguage; }

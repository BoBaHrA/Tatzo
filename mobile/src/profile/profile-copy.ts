import { appLanguage } from '@/i18n';

export function profileCopy(en: string, fr: string, ru: string) {
  return appLanguage === 'fr' ? fr : appLanguage === 'ru' ? ru : en;
}

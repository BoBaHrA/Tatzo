import { useRef, useState } from 'react';
import { Redirect, router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { useAuth } from '@/auth/auth-context';
import { ApiError } from '@/api/client';
import { BrandHeader } from '@/components/brand-header';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { t } from '@/i18n';
import { useLanguage } from '@/localization/language-context';
import { colors, radius, spacing } from '@/theme';

const COPY = {
  en: { types: ['Bug', 'Suggestion', 'Other'], title: 'Title', message: 'What happened?', send: 'Send report', sent: 'Thank you. Your report has been sent.', required: 'Add a title and a description.' },
  fr: { types: ['Bug', 'Suggestion', 'Autre'], title: 'Titre', message: 'Que s’est-il passé ?', send: 'Envoyer', sent: 'Merci. Votre signalement a été envoyé.', required: 'Ajoutez un titre et une description.' },
  ru: { types: ['Ошибка', 'Предложение', 'Другое'], title: 'Заголовок', message: 'Что произошло?', send: 'Отправить', sent: 'Спасибо. Сообщение отправлено.', required: 'Добавь заголовок и описание.' },
};
const TYPES = ['bug', 'suggestion', 'other'] as const;
export default function ReportProblemScreen() {
  const { request, status } = useAuth();
  const { language } = useLanguage();
  const ui = COPY[language];
  const [type, setType] = useState<(typeof TYPES)[number]>('bug');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  if (status !== 'authenticated') return <Redirect href="/(auth)/login" />;
  const send = async () => {
    if (pending.current) return;
    if (!title.trim() || !message.trim()) { setError(ui.required); return; }
    pending.current = true; setBusy(true); setError('');
    try {
      await request('/support/reports/', { method: 'POST', body: JSON.stringify({ report_type: type, title: title.trim(), message: message.trim(), page_url: 'tatzo://report-problem' }) });
      setSent(true);
    } catch (error) { setError(error instanceof ApiError && error.status === 429 ? t('rateLimited') : t('genericError')); }
    finally { pending.current = false; setBusy(false); }
  };
  return <Screen><BrandHeader back title={t('reportProblem')} />
    <View style={styles.card}>{sent ? <><Text style={styles.text}>{ui.sent}</Text><Button label={t('close')} onPress={() => router.back()} /></> : <>
      <View style={styles.types}>{TYPES.map((item, index) => <Pressable accessibilityRole="radio" accessibilityState={{ checked: item === type }} key={item} onPress={() => setType(item)} style={[styles.type, item === type && styles.active]}><Text style={styles.text}>{ui.types[index]}</Text></Pressable>)}</View>
      <Field label={ui.title} value={title} onChangeText={setTitle} maxLength={120} />
      <Field label={ui.message} value={message} onChangeText={setMessage} multiline maxLength={10000} style={styles.message} />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Button label={ui.send} loading={busy} onPress={() => void send()} />
      <Button label={t('cancel')} variant="ghost" onPress={() => router.back()} />
    </>}</View>
  </Screen>;
}
const styles = StyleSheet.create({
  card: { padding: spacing.lg, borderRadius: radius.large, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: spacing.md },
  types: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  type: { padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  active: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  text: { color: colors.text, lineHeight: 22 },
  message: { minHeight: 150, textAlignVertical: 'top' },
  error: { color: colors.danger },
});

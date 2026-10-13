import { useCallback, useRef, useState } from 'react';
import { Redirect, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { useAuth } from '@/auth/auth-context';
import { BrandHeader } from '@/components/brand-header';
import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { t } from '@/i18n';
import { useLanguage } from '@/localization/language-context';
import { colors, radius, spacing } from '@/theme';

type Kind = 'posts' | 'comments' | 'support';
type Report = { id: number; kind: Kind; reporter: string; author: string; text: string; reason: string; created_at: string; can_resolve: boolean; can_delete: boolean };
type Page = { results: Report[]; next_cursor: string | null };
const COPY = {
  en: { posts: 'Posts', comments: 'Comments', support: 'Support', documents: 'Documents', manual: 'Artist reviews', resolve: 'Resolve', remove: 'Delete content', confirm: 'Permanently delete the reported content?', more: 'Load more', empty: 'No pending reports.', access: 'Your account has no moderation permissions.', admin: 'Full administration', verification: 'Review artist verification', hint: 'Verification documents and account management open on the secure Tatzo website. A web sign-in may be required.' },
  fr: { posts: 'Publications', comments: 'Commentaires', support: 'Assistance', documents: 'Documents', manual: 'Vérifications', resolve: 'Résoudre', remove: 'Supprimer le contenu', confirm: 'Supprimer définitivement le contenu signalé ?', more: 'Voir plus', empty: 'Aucun signalement en attente.', access: 'Ce compte n’a pas de droits de modération.', admin: 'Administration complète', verification: 'Vérification des artistes', hint: 'Les documents et la gestion des comptes s’ouvrent sur le site sécurisé Tatzo. Une connexion web peut être nécessaire.' },
  ru: { posts: 'Публикации', comments: 'Комментарии', support: 'Поддержка', documents: 'Документы', manual: 'Проверки мастеров', resolve: 'Закрыть жалобу', remove: 'Удалить контент', confirm: 'Удалить контент без возможности восстановления?', more: 'Загрузить ещё', empty: 'Нет открытых жалоб.', access: 'У аккаунта нет прав модерации.', admin: 'Полная админка', verification: 'Верификация мастеров', hint: 'Документы и управление аккаунтами открываются на защищённом сайте Tatzo. Может понадобиться вход на сайте.' },
};
export default function AdminScreen() {
  const { user, request } = useAuth();
  const { language } = useLanguage();
  const ui = COPY[language];
  const [counts, setCounts] = useState<Partial<Record<Kind | 'documents' | 'manual', number>>>({});
  const [kind, setKind] = useState<Kind>('posts');
  const [reports, setReports] = useState<Report[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const actionPending = useRef(false);
  const generation = useRef(0);
  const load = useCallback(async (next?: string) => {
    if (!user?.is_staff) return;
    const version = ++generation.current;
    setLoading(true); setError('');
    try {
      const overview = await request<{ counts: typeof counts }>('/moderation/');
      if (version !== generation.current) return;
      setCounts(overview.counts);
      const selected = overview.counts[kind] !== undefined ? kind : (['posts', 'comments', 'support'] as Kind[]).find(key => overview.counts[key] !== undefined);
      if (!selected) { setReports([]); setCursor(null); return; }
      if (selected !== kind) { setKind(selected); return; }
      const page = await request<Page>(`/moderation/${kind}/${next ? `?cursor=${encodeURIComponent(next)}` : ''}`);
      if (version !== generation.current) return;
      setReports(current => next ? [...current, ...page.results.filter(item => !current.some(old => old.id === item.id))] : page.results);
      setCursor(page.next_cursor);
    } catch { if (version === generation.current) setError(t('genericError')); }
    finally { if (version === generation.current) setLoading(false); }
  }, [kind, request, user?.is_staff]);
  useFocusEffect(useCallback(() => { setReports([]); setCursor(null); void load(); return () => { generation.current++; }; }, [load]));
  if (!user) return <Redirect href="/(auth)/login" />;
  if (!user.is_staff) return <Redirect href="/(tabs)/home" />;
  const act = async (report: Report, action: 'resolve' | 'delete') => {
    if (actionPending.current) return;
    actionPending.current = true; setBusy(report.id); setError('');
    try {
      await request(`/moderation/${report.kind}/${report.id}/`, { method: 'POST', body: JSON.stringify({ action }) });
      await load();
    } catch { setError(t('genericError')); }
    finally { actionPending.current = false; setBusy(null); }
  };
  const open = (url: string) => void Linking.openURL(url).catch(() => setError(t('genericError')));
  return <Screen><BrandHeader back title={t('adminPanel')} />
    <View style={styles.card}><Text style={styles.hint}>{ui.hint}</Text>
      <Button label={`${ui.verification} (${(counts.documents ?? 0) + (counts.manual ?? 0)})`} variant="secondary" onPress={() => open('https://tatzo.eu/moderation/')} />
      <Button label={ui.admin} variant="secondary" onPress={() => open('https://tatzo.eu/admin/')} />
    </View>
    <View style={styles.tabs}>{(['posts', 'comments', 'support'] as Kind[]).filter(key => counts[key] !== undefined).map(key => <Pressable accessibilityRole="tab" accessibilityState={{ selected: kind === key }} disabled={busy !== null} key={key} style={[styles.tab, kind === key && styles.active]} onPress={() => setKind(key)}><Text style={styles.text}>{ui[key]} · {counts[key]}</Text></Pressable>)}</View>
    {error ? <View style={styles.card}><Text style={styles.error}>{error}</Text><Button label={t('retry')} onPress={() => void load()} /></View> : null}
    {reports.map(report => <View key={`${report.kind}-${report.id}`} style={styles.card}>
      <Text style={styles.title}>{report.reason}</Text><Text style={styles.hint}>@{report.author} · {new Date(report.created_at).toLocaleDateString(language)}</Text>
      <Text style={styles.text}>{report.text}</Text><Text style={styles.hint}>↳ @{report.reporter}</Text>
      {report.can_resolve ? <Button label={ui.resolve} loading={busy === report.id} disabled={busy !== null} onPress={() => void act(report, 'resolve')} /> : null}
      {report.can_delete ? <Button label={ui.remove} variant="danger" disabled={busy !== null} onPress={() => Alert.alert(ui.remove, ui.confirm, [{ text: t('cancel'), style: 'cancel' }, { text: t('delete'), style: 'destructive', onPress: () => void act(report, 'delete') }])} /> : null}
    </View>)}
    {loading ? <ActivityIndicator color={colors.primary} /> : !reports.length && !error ? <Text style={styles.hint}>{Object.keys(counts).length ? ui.empty : ui.access}</Text> : null}
    {cursor ? <Button label={ui.more} loading={loading} onPress={() => void load(cursor)} /> : null}
  </Screen>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.large, padding: spacing.lg, gap: spacing.md },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tab: { padding: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border },
  active: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  text: { color: colors.text, lineHeight: 22 }, title: { color: colors.accent, fontSize: 17, fontWeight: '700' },
  hint: { color: colors.textMuted, lineHeight: 20 }, error: { color: colors.danger },
});

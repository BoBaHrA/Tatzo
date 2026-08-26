import { useCallback, useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/auth-context';
import { Avatar } from '@/components/avatar';
import { BrandHeader } from '@/components/brand-header';
import { appLanguage, t } from '@/i18n';
import { colors, radius, spacing, typography } from '@/theme';


type SearchAccountFilter = 'all' | 'artists' | 'users';

type SearchUser = {
  id: number;
  username: string;
  tag: string | null;
  bio: string;
  account_type: 'regular' | 'tattoo_artist';
  is_verified_artist: boolean;
  profile_image_url: string | null;
};

type SearchResponse = {
  query: string;
  type: SearchAccountFilter;
  count: number;
  results: SearchUser[];
};

const COPY = {
  en: {
    title: 'Search',
    subtitle: 'Find users and tattoo artists by username or @tag.',
    placeholder: 'Search by username or @tag…',
    all: 'All',
    artists: 'Tattoo artists',
    users: 'Users',
    results: 'Results',
    start: 'Start searching',
    startHint: 'Type a username or @tag to find people on Tatzo.',
    empty: 'No results found',
    emptyHint: 'Try another username, tag or account type.',
    unavailable: 'Search is unavailable',
    viewProfile: 'View profile',
  },
  fr: {
    title: 'Recherche',
    subtitle: 'Trouvez des utilisateurs et tatoueurs par nom ou @tag.',
    placeholder: 'Rechercher par nom ou @tag…',
    all: 'Tous',
    artists: 'Tatoueurs',
    users: 'Utilisateurs',
    results: 'Résultats',
    start: 'Commencez la recherche',
    startHint: 'Saisissez un nom ou @tag pour trouver des personnes sur Tatzo.',
    empty: 'Aucun résultat',
    emptyHint: 'Essayez un autre nom, tag ou type de compte.',
    unavailable: 'La recherche est indisponible',
    viewProfile: 'Voir le profil',
  },
  ru: {
    title: 'Поиск',
    subtitle: 'Ищи пользователей и тату-мастеров по имени или @тегу.',
    placeholder: 'Поиск по имени или @тегу…',
    all: 'Все',
    artists: 'Тату-мастера',
    users: 'Пользователи',
    results: 'Результаты',
    start: 'Начни поиск',
    startHint: 'Введи имя пользователя или @тег, чтобы найти людей в Tatzo.',
    empty: 'Ничего не найдено',
    emptyHint: 'Попробуй другое имя, тег или тип аккаунта.',
    unavailable: 'Поиск недоступен',
    viewProfile: 'Открыть профиль',
  },
} as const;

function copy() {
  return COPY[appLanguage as keyof typeof COPY] ?? COPY.en;
}

export default function SearchScreen() {
  const { request } = useAuth();
  const ui = copy();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SearchAccountFilter>('all');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const trimmed = useMemo(() => query.trim(), [query]);

  const runSearch = useCallback(async (value: string, nextFilter: SearchAccountFilter) => {
    const clean = value.trim();
    if (!clean) {
      setResults([]);
      setLoading(false);
      setError(false);
      return;
    }

    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams({ q: clean, type: nextFilter });
      const response = await request<SearchResponse>(`/search/?${params.toString()}`);
      setResults(response.results);
    } catch {
      setResults([]);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void runSearch(query, filter);
    }, 260);
    return () => clearTimeout(timer);
  }, [filter, query, runSearch]);

  const setAccountFilter = (next: SearchAccountFilter) => {
    setFilter(next);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
      <FlatList
        contentContainerStyle={styles.content}
        data={results}
        keyExtractor={(item) => String(item.id)}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={(
          <View style={styles.header}>
            <BrandHeader title={ui.title} showQuickMatch />
            <Text style={styles.subtitle}>{ui.subtitle}</Text>

            <View style={styles.searchBox}>
              <Image
                source={require('../../assets/web-icons/loupe.png')}
                resizeMode="contain"
                style={styles.searchIcon}
              />
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setQuery}
                placeholder={ui.placeholder}
                placeholderTextColor={colors.textSubtle}
                returnKeyType="search"
                style={styles.input}
                value={query}
              />
            </View>

            <View style={styles.filters}>
              {([
                ['all', ui.all],
                ['artists', ui.artists],
                ['users', ui.users],
              ] as const).map(([value, label]) => {
                const active = filter === value;
                return (
                  <Pressable
                    key={value}
                    onPress={() => setAccountFilter(value)}
                    style={({ pressed }) => [
                      styles.filter,
                      active && styles.filterActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.filterText, active && styles.filterTextActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.resultsHead}>
              <Text style={styles.resultsTitle}>{ui.results}</Text>
              {trimmed ? <Text style={styles.count}>{results.length}</Text> : null}
            </View>
          </View>
        )}
        ListEmptyComponent={loading ? (
          <View style={styles.state}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.state}>
            <Text style={styles.stateTitle}>{ui.unavailable}</Text>
            <Pressable onPress={() => void runSearch(query, filter)}>
              <Text style={styles.retry}>{t('retry')}</Text>
            </Pressable>
          </View>
        ) : trimmed ? (
          <View style={styles.state}>
            <Text style={styles.stateTitle}>{ui.empty}</Text>
            <Text style={styles.stateText}>{ui.emptyHint}</Text>
          </View>
        ) : (
          <View style={styles.state}>
            <Text style={styles.stateTitle}>{ui.start}</Text>
            <Text style={styles.stateText}>{ui.startHint}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/profile/[username]', params: { username: item.username } })}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <Avatar uri={item.profile_image_url} label={item.username} size={58} ring={item.is_verified_artist} />
            <View style={styles.cardMain}>
              <View style={styles.nameLine}>
                <Text numberOfLines={1} style={styles.username}>{item.username}</Text>
                {item.is_verified_artist ? <Text style={styles.verified}>✓</Text> : null}
              </View>
              {item.tag ? <Text style={styles.tag}>@{item.tag}</Text> : null}
              <Text numberOfLines={2} style={styles.bio}>{item.bio || '—'}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm },
  header: { gap: spacing.md, marginBottom: spacing.sm },
  subtitle: { color: colors.textMuted, ...typography.body, lineHeight: 20 },
  searchBox: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.34)',
    borderRadius: radius.large,
    backgroundColor: 'rgba(0, 18, 28, 0.92)',
    paddingHorizontal: spacing.md,
  },
  searchIcon: { width: 22, height: 22, tintColor: colors.primary },
  input: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 0 },
  filters: { flexDirection: 'row', gap: spacing.xs },
  filter: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.14)',
    backgroundColor: colors.backgroundDeep,
    paddingHorizontal: spacing.xs,
  },
  filterActive: { borderColor: colors.primary, backgroundColor: 'rgba(4, 197, 191, 0.10)' },
  filterText: { color: colors.textMuted, fontSize: 11, fontWeight: '800', textAlign: 'center' },
  filterTextActive: { color: colors.primary },
  resultsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultsTitle: { color: colors.text, fontSize: 20, fontWeight: '900' },
  count: { color: colors.primary, fontWeight: '900' },
  card: {
    minHeight: 86,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.14)',
    borderRadius: radius.large,
    backgroundColor: 'rgba(0, 18, 28, 0.84)',
    marginBottom: spacing.sm,
  },
  cardMain: { flex: 1, minWidth: 0, gap: 2 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  username: { color: colors.text, fontSize: 16, fontWeight: '900', flexShrink: 1 },
  verified: { color: colors.primary, fontWeight: '900' },
  tag: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  bio: { color: colors.textMuted, fontSize: 12, lineHeight: 16, marginTop: 3 },
  chevron: { color: colors.textSubtle, fontSize: 26 },
  state: { minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  stateTitle: { color: colors.text, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  stateText: { color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  retry: { color: colors.primary, fontWeight: '900' },
  pressed: { opacity: 0.74, transform: [{ scale: 0.995 }] },
});

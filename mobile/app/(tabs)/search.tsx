import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import * as ExpoLocation from 'expo-location';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
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


type SearchAccountFilter = 'all' | 'artists' | 'studios' | 'users';
type SearchSort = 'relevance' | 'distance' | 'newest';
type SearchKind = 'artist' | 'studio' | 'user';

type PortfolioPreview = {
  id: number;
  image_url: string;
  style: string;
};

type SearchResult = {
  kind: SearchKind;
  id: number;
  username: string;
  linked_username?: string | null;
  tag: string | null;
  display_name: string;
  handle: string;
  bio: string;
  account_type: string;
  is_verified_artist: boolean;
  verified: boolean;
  profile_image_url: string | null;
  booking_open: boolean;
  styles: string[];
  portfolio: PortfolioPreview[];
  portfolio_count: number;
  location_label: string;
  distance_km: number | null;
  consultation_price: string | null;
  is_imported: boolean;
  imported_state: string;
  claimed?: boolean;
  native_profile_available: boolean;
  can_message: boolean;
};

type SearchResponse = {
  query: string;
  type: SearchAccountFilter;
  count: number;
  page: number;
  page_size: number;
  has_more: boolean;
  tab_counts: Record<SearchAccountFilter, number>;
  style_choices: string[];
  filters: {
    location: string;
    styles: string[];
    accepting: boolean;
    verified: boolean;
    radius: number;
    has_origin: boolean;
    sort: SearchSort;
  };
  results: SearchResult[];
};

type DiscoveryFilters = {
  location: string;
  styles: string[];
  accepting: boolean;
  verified: boolean;
  radius: number;
  sort: SearchSort;
  lat: number | null;
  lng: number | null;
};

const DEFAULT_FILTERS: DiscoveryFilters = {
  location: '',
  styles: [],
  accepting: false,
  verified: false,
  radius: 25,
  sort: 'relevance',
  lat: null,
  lng: null,
};

const DEFAULT_STYLE_CHOICES = [
  'Fine Line',
  'Realism',
  'Blackwork',
  'Traditional',
  'Neo Traditional',
  'Japanese',
  'Minimalist',
  'Lettering',
  'Ornamental',
  'Geometric',
  'Watercolor',
  'Floral',
];

const COPY = {
  en: {
    title: 'Discover',
    subtitle: 'Find the right artist, studio or creator for your next tattoo.',
    placeholder: 'Search artists, styles, studios…',
    all: 'All',
    artists: 'Artists',
    studios: 'Studios',
    users: 'Users',
    filters: 'Filters',
    nearMe: 'Near me',
    open: 'Open',
    verified: 'Verified',
    results: 'Results',
    noResults: 'No matching results',
    noResultsHint: 'Try widening the radius or removing a filter.',
    unavailable: 'Discovery is unavailable',
    location: 'Location',
    locationPlaceholder: 'City, country or studio',
    styles: 'Tattoo styles',
    accepting: 'Accepting bookings',
    onlyVerified: 'Verified only',
    radius: 'Radius',
    sort: 'Sort',
    relevance: 'Relevant',
    distance: 'Nearest',
    newest: 'Newest',
    apply: 'Apply filters',
    clear: 'Clear',
    loadMore: 'Load more',
    useLocation: 'Use my location',
    locationDenied: 'Location permission was not granted.',
    prepared: 'Prepared profile',
    studio: 'Studio',
    artist: 'Artist',
    user: 'User',
    bookingsOpen: 'Booking open',
    consultation: 'Consultation',
    portfolio: 'portfolio works',
    webProfile: 'Opens prepared profile on tatzo.eu',
  },
  fr: {
    title: 'Découvrir',
    subtitle: 'Trouvez le bon tatoueur, studio ou créateur pour votre prochain tatouage.',
    placeholder: 'Tatoueurs, styles, studios…',
    all: 'Tous',
    artists: 'Tatoueurs',
    studios: 'Studios',
    users: 'Utilisateurs',
    filters: 'Filtres',
    nearMe: 'Près de moi',
    open: 'Dispo',
    verified: 'Vérifié',
    results: 'Résultats',
    noResults: 'Aucun résultat correspondant',
    noResultsHint: 'Élargissez le rayon ou retirez un filtre.',
    unavailable: 'La découverte est indisponible',
    location: 'Lieu',
    locationPlaceholder: 'Ville, pays ou studio',
    styles: 'Styles de tatouage',
    accepting: 'Accepte les réservations',
    onlyVerified: 'Vérifiés uniquement',
    radius: 'Rayon',
    sort: 'Trier',
    relevance: 'Pertinence',
    distance: 'Plus proche',
    newest: 'Plus récent',
    apply: 'Appliquer',
    clear: 'Effacer',
    loadMore: 'Voir plus',
    useLocation: 'Utiliser ma position',
    locationDenied: "L'autorisation de localisation n'a pas été accordée.",
    prepared: 'Profil préparé',
    studio: 'Studio',
    artist: 'Tatoueur',
    user: 'Utilisateur',
    bookingsOpen: 'Réservations ouvertes',
    consultation: 'Consultation',
    portfolio: 'œuvres',
    webProfile: 'Ouvre le profil préparé sur tatzo.eu',
  },
  ru: {
    title: 'Поиск',
    subtitle: 'Найди подходящего мастера, студию или автора для следующей татуировки.',
    placeholder: 'Мастера, стили, студии…',
    all: 'Все',
    artists: 'Мастера',
    studios: 'Студии',
    users: 'Люди',
    filters: 'Фильтры',
    nearMe: 'Рядом',
    open: 'Запись открыта',
    verified: 'Проверенные',
    results: 'Результаты',
    noResults: 'Ничего не найдено',
    noResultsHint: 'Увеличь радиус или убери часть фильтров.',
    unavailable: 'Поиск временно недоступен',
    location: 'Локация',
    locationPlaceholder: 'Город, страна или студия',
    styles: 'Стили тату',
    accepting: 'Принимает записи',
    onlyVerified: 'Только проверенные',
    radius: 'Радиус',
    sort: 'Сортировка',
    relevance: 'По релевантности',
    distance: 'Ближайшие',
    newest: 'Новые',
    apply: 'Применить',
    clear: 'Сбросить',
    loadMore: 'Показать ещё',
    useLocation: 'Использовать геолокацию',
    locationDenied: 'Доступ к геолокации не предоставлен.',
    prepared: 'Подготовленный профиль',
    studio: 'Студия',
    artist: 'Мастер',
    user: 'Пользователь',
    bookingsOpen: 'Запись открыта',
    consultation: 'Консультация',
    portfolio: 'работ в портфолио',
    webProfile: 'Подготовленный профиль откроется на tatzo.eu',
  },
} as const;

function copy() {
  return COPY[appLanguage as keyof typeof COPY] ?? COPY.en;
}

function resultKey(item: SearchResult) {
  return `${item.kind}:${item.id}`;
}

function kindLabel(kind: SearchKind, ui: ReturnType<typeof copy>) {
  if (kind === 'artist') return ui.artist;
  if (kind === 'studio') return ui.studio;
  return ui.user;
}

export default function SearchScreen() {
  const { request } = useAuth();
  const ui = copy();
  const [query, setQuery] = useState('');
  const [accountFilter, setAccountFilter] = useState<SearchAccountFilter>('all');
  const [filters, setFilters] = useState<DiscoveryFilters>(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState<DiscoveryFilters>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [styleChoices, setStyleChoices] = useState<string[]>(DEFAULT_STYLE_CHOICES);
  const [tabCounts, setTabCounts] = useState<Record<SearchAccountFilter, number>>({
    all: 0,
    artists: 0,
    studios: 0,
    users: 0,
  });
  const [resultCount, setResultCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [error, setError] = useState(false);
  const requestVersion = useRef(0);

  const filterSignature = useMemo(() => JSON.stringify(filters), [filters]);

  const buildParams = useCallback((nextPage: number) => {
    const params = new URLSearchParams({
      discovery: '1',
      q: query.trim(),
      type: accountFilter,
      page: String(nextPage),
      radius: String(filters.radius),
      sort: filters.sort,
    });
    if (filters.location.trim()) params.set('location', filters.location.trim());
    if (filters.accepting) params.set('accepting', '1');
    if (filters.verified) params.set('verified', '1');
    for (const style of filters.styles) params.append('style', style);
    if (filters.lat !== null && filters.lng !== null) {
      params.set('lat', String(filters.lat));
      params.set('lng', String(filters.lng));
    }
    return params;
  }, [accountFilter, filters, query]);

  const runSearch = useCallback(async (nextPage = 1, append = false) => {
    const version = ++requestVersion.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(false);

    try {
      const params = buildParams(nextPage);
      const response = await request<SearchResponse>(`/search/?${params.toString()}`);
      if (version !== requestVersion.current) return;

      setResults((current) => append ? [...current, ...response.results] : response.results);
      setResultCount(response.count);
      setPage(response.page);
      setHasMore(response.has_more);
      setTabCounts(response.tab_counts);
      if (response.style_choices.length) setStyleChoices(response.style_choices);
      if (response.filters.sort !== filters.sort && !append) {
        setFilters((current) => ({ ...current, sort: response.filters.sort }));
      }
    } catch {
      if (version !== requestVersion.current) return;
      if (!append) setResults([]);
      setError(true);
    } finally {
      if (version === requestVersion.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [buildParams, filters.sort, request]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void runSearch(1, false);
    }, 280);
    return () => clearTimeout(timer);
  }, [accountFilter, filterSignature, query, runSearch]);

  const openFilters = () => {
    setDraftFilters({ ...filters, styles: [...filters.styles] });
    setLocationError('');
    setFilterOpen(true);
  };

  const toggleDraftStyle = (style: string) => {
    setDraftFilters((current) => ({
      ...current,
      styles: current.styles.includes(style)
        ? current.styles.filter((item) => item !== style)
        : [...current.styles, style],
    }));
  };

  const applyFilters = () => {
    setFilters({ ...draftFilters, styles: [...draftFilters.styles] });
    setFilterOpen(false);
  };

  const clearDraftFilters = () => {
    setDraftFilters({ ...DEFAULT_FILTERS, styles: [] });
    setLocationError('');
  };

  const useMyLocation = useCallback(async (applyToDraft = false) => {
    if (locationBusy) return;
    setLocationBusy(true);
    setLocationError('');
    try {
      const permission = await ExpoLocation.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocationError(ui.locationDenied);
        return;
      }
      const position = await ExpoLocation.getCurrentPositionAsync({
        accuracy: ExpoLocation.Accuracy.Balanced,
      });
      const patch = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        radius: 25,
        sort: 'distance' as SearchSort,
      };
      if (applyToDraft) {
        setDraftFilters((current) => ({ ...current, ...patch }));
      } else {
        setFilters((current) => ({ ...current, ...patch }));
      }
    } catch {
      setLocationError(ui.locationDenied);
    } finally {
      setLocationBusy(false);
    }
  }, [locationBusy, ui.locationDenied]);

  const clearGeo = () => {
    setFilters((current) => ({
      ...current,
      lat: null,
      lng: null,
      sort: current.sort === 'distance' ? 'relevance' : current.sort,
    }));
  };

  const openResult = async (item: SearchResult) => {
    const username = item.kind === 'studio' ? item.linked_username : item.username;
    if (username) {
      if (item.native_profile_available) {
        router.push({ pathname: '/profile/[username]', params: { username } });
        return;
      }
      await Linking.openURL(`https://tatzo.eu/profile/${encodeURIComponent(username)}/`);
      return;
    }
    await Linking.openURL('https://tatzo.eu/maps/');
  };

  const activeFilterCount = filters.styles.length
    + (filters.location ? 1 : 0)
    + (filters.accepting ? 1 : 0)
    + (filters.verified ? 1 : 0)
    + (filters.lat !== null ? 1 : 0);

  const header = (
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
        {query ? (
          <Pressable accessibilityRole="button" onPress={() => setQuery('')} style={styles.clearSearch}>
            <Text style={styles.clearSearchText}>×</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={styles.quickRail}
        horizontal
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => filters.lat === null ? void useMyLocation(false) : clearGeo()}
          style={[styles.quickChip, filters.lat !== null && styles.quickChipActive]}
        >
          {locationBusy ? <ActivityIndicator color={colors.primary} size="small" /> : null}
          <Text style={[styles.quickChipText, filters.lat !== null && styles.quickChipTextActive]}>{ui.nearMe}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setFilters((current) => ({ ...current, accepting: !current.accepting }))}
          style={[styles.quickChip, filters.accepting && styles.quickChipActive]}
        >
          <Text style={[styles.quickChipText, filters.accepting && styles.quickChipTextActive]}>{ui.open}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setFilters((current) => ({ ...current, verified: !current.verified }))}
          style={[styles.quickChip, filters.verified && styles.quickChipActive]}
        >
          <Text style={[styles.quickChipText, filters.verified && styles.quickChipTextActive]}>{ui.verified}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={openFilters} style={styles.filterButton}>
          <Text style={styles.filterButtonText}>{ui.filters}{activeFilterCount ? ` · ${activeFilterCount}` : ''}</Text>
        </Pressable>
      </ScrollView>
      {locationError ? <Text style={styles.inlineError}>{locationError}</Text> : null}

      <ScrollView contentContainerStyle={styles.tabs} horizontal showsHorizontalScrollIndicator={false}>
        {([
          ['all', ui.all],
          ['artists', ui.artists],
          ['studios', ui.studios],
          ['users', ui.users],
        ] as const).map(([value, label]) => {
          const active = accountFilter === value;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              key={value}
              onPress={() => setAccountFilter(value)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
              <Text style={[styles.tabCount, active && styles.tabTextActive]}>{tabCounts[value]}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {activeFilterCount ? (
        <ScrollView contentContainerStyle={styles.activeRail} horizontal showsHorizontalScrollIndicator={false}>
          {filters.location ? <ActiveChip label={filters.location} onPress={() => setFilters((current) => ({ ...current, location: '' }))} /> : null}
          {filters.styles.map((style) => (
            <ActiveChip
              key={style}
              label={style}
              onPress={() => setFilters((current) => ({ ...current, styles: current.styles.filter((item) => item !== style) }))}
            />
          ))}
          {filters.accepting ? <ActiveChip label={ui.open} onPress={() => setFilters((current) => ({ ...current, accepting: false }))} /> : null}
          {filters.verified ? <ActiveChip label={ui.verified} onPress={() => setFilters((current) => ({ ...current, verified: false }))} /> : null}
          {filters.lat !== null ? <ActiveChip label={`≤ ${filters.radius} km`} onPress={clearGeo} /> : null}
        </ScrollView>
      ) : null}

      <View style={styles.resultsHead}>
        <View>
          <Text style={styles.resultsTitle}>{ui.results}</Text>
          <Text style={styles.resultsMeta}>{resultCount}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={openFilters} style={styles.sortButton}>
          <Text style={styles.sortButtonText}>
            {filters.sort === 'distance' ? ui.distance : filters.sort === 'newest' ? ui.newest : ui.relevance}
          </Text>
          <Text style={styles.sortChevron}>⌄</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
      <FlatList
        contentContainerStyle={styles.content}
        data={results}
        keyExtractor={resultKey}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        refreshing={loading && results.length > 0}
        onRefresh={() => void runSearch(1, false)}
        ListEmptyComponent={loading ? (
          <View style={styles.state}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : error ? (
          <View style={styles.state}>
            <Text style={styles.stateTitle}>{ui.unavailable}</Text>
            <Pressable accessibilityRole="button" onPress={() => void runSearch(1, false)}>
              <Text style={styles.retry}>{t('retry')}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.state}>
            <Text style={styles.stateTitle}>{ui.noResults}</Text>
            <Text style={styles.stateText}>{ui.noResultsHint}</Text>
          </View>
        )}
        ListFooterComponent={hasMore ? (
          <Pressable
            accessibilityRole="button"
            disabled={loadingMore}
            onPress={() => void runSearch(page + 1, true)}
            style={({ pressed }) => [styles.loadMore, pressed && styles.pressed]}
          >
            {loadingMore ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.loadMoreText}>{ui.loadMore}</Text>}
          </Pressable>
        ) : <View style={styles.footerSpace} />}
        renderItem={({ item }) => (
          <ResultCard item={item} onPress={() => void openResult(item)} ui={ui} />
        )}
      />

      <Modal
        animationType="slide"
        onRequestClose={() => setFilterOpen(false)}
        transparent
        visible={filterOpen}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setFilterOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{ui.filters}</Text>
              <Pressable accessibilityRole="button" onPress={clearDraftFilters}>
                <Text style={styles.clearFilters}>{ui.clear}</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>{ui.location}</Text>
              <TextInput
                onChangeText={(value) => setDraftFilters((current) => ({ ...current, location: value }))}
                placeholder={ui.locationPlaceholder}
                placeholderTextColor={colors.textSubtle}
                style={styles.sheetInput}
                value={draftFilters.location}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => void useMyLocation(true)}
                style={[styles.locationButton, draftFilters.lat !== null && styles.locationButtonActive]}
              >
                {locationBusy ? <ActivityIndicator color={colors.primary} size="small" /> : null}
                <Text style={styles.locationButtonText}>{ui.useLocation}</Text>
              </Pressable>
              {locationError ? <Text style={styles.inlineError}>{locationError}</Text> : null}

              <Text style={styles.fieldLabel}>{ui.styles}</Text>
              <View style={styles.styleGrid}>
                {styleChoices.map((style) => {
                  const active = draftFilters.styles.includes(style);
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      key={style}
                      onPress={() => toggleDraftStyle(style)}
                      style={[styles.styleChip, active && styles.styleChipActive]}
                    >
                      <Text style={[styles.styleChipText, active && styles.styleChipTextActive]}>{style}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>{ui.accepting}</Text>
                <Switch
                  onValueChange={(value) => setDraftFilters((current) => ({ ...current, accepting: value }))}
                  value={draftFilters.accepting}
                />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>{ui.onlyVerified}</Text>
                <Switch
                  onValueChange={(value) => setDraftFilters((current) => ({ ...current, verified: value }))}
                  value={draftFilters.verified}
                />
              </View>

              {draftFilters.lat !== null ? (
                <>
                  <Text style={styles.fieldLabel}>{ui.radius}</Text>
                  <View style={styles.segmentRow}>
                    {[5, 10, 25, 50, 100].map((value) => {
                      const active = draftFilters.radius === value;
                      return (
                        <Pressable
                          accessibilityRole="button"
                          key={value}
                          onPress={() => setDraftFilters((current) => ({ ...current, radius: value }))}
                          style={[styles.segment, active && styles.segmentActive]}
                        >
                          <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{value} km</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              ) : null}

              <Text style={styles.fieldLabel}>{ui.sort}</Text>
              <View style={styles.sortGrid}>
                {([
                  ['relevance', ui.relevance],
                  ['distance', ui.distance],
                  ['newest', ui.newest],
                ] as const).map(([value, label]) => {
                  const active = draftFilters.sort === value;
                  const disabled = value === 'distance' && draftFilters.lat === null;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      disabled={disabled}
                      key={value}
                      onPress={() => setDraftFilters((current) => ({ ...current, sort: value }))}
                      style={[styles.sortOption, active && styles.sortOptionActive, disabled && styles.disabled]}
                    >
                      <Text style={[styles.sortOptionText, active && styles.sortOptionTextActive]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
            <View style={styles.sheetFooter}>
              <Pressable accessibilityRole="button" onPress={applyFilters} style={styles.applyButton}>
                <Text style={styles.applyButtonText}>{ui.apply}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ActiveChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.activeChip}>
      <Text numberOfLines={1} style={styles.activeChipText}>{label}</Text>
      <Text style={styles.activeChipClose}>×</Text>
    </Pressable>
  );
}

function ResultCard({
  item,
  onPress,
  ui,
}: {
  item: SearchResult;
  onPress: () => void;
  ui: ReturnType<typeof copy>;
}) {
  const prepared = item.is_imported && !item.native_profile_available;
  return (
    <Pressable
      accessibilityLabel={`${kindLabel(item.kind, ui)}: ${item.display_name}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.cardTop}>
        <Avatar
          uri={item.profile_image_url}
          label={item.display_name}
          size={58}
          ring={item.verified || item.is_verified_artist}
        />
        <View style={styles.cardMain}>
          <View style={styles.nameLine}>
            <Text numberOfLines={1} style={styles.displayName}>{item.display_name}</Text>
            {(item.verified || item.is_verified_artist) ? <Text style={styles.verifiedMark}>✓</Text> : null}
          </View>
          <View style={styles.metaLine}>
            <Text style={styles.kindBadge}>{kindLabel(item.kind, ui)}</Text>
            {item.handle ? <Text numberOfLines={1} style={styles.handle}>@{item.handle.replace(/^@/, '')}</Text> : null}
          </View>
          {item.location_label ? (
            <Text numberOfLines={1} style={styles.locationText}>
              {item.location_label}{item.distance_km !== null ? ` · ${item.distance_km} km` : ''}
            </Text>
          ) : null}
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>

      {item.bio ? <Text numberOfLines={2} style={styles.bio}>{item.bio}</Text> : null}

      <View style={styles.badgeRail}>
        {item.booking_open ? <Text style={styles.statusBadge}>{ui.bookingsOpen}</Text> : null}
        {prepared ? <Text style={styles.preparedBadge}>{ui.prepared}</Text> : null}
        {item.consultation_price !== null ? (
          <Text style={styles.neutralBadge}>{ui.consultation} · €{item.consultation_price}</Text>
        ) : null}
      </View>

      {item.styles.length ? (
        <View style={styles.tags}>
          {item.styles.slice(0, 4).map((style) => <Text key={style} style={styles.tag}>{style}</Text>)}
        </View>
      ) : null}

      {item.portfolio.length ? (
        <View style={styles.portfolioRow}>
          {item.portfolio.map((work) => (
            <Image key={work.id} source={{ uri: work.image_url }} style={styles.portfolioImage} />
          ))}
          {item.portfolio_count > item.portfolio.length ? (
            <View style={styles.morePortfolio}>
              <Text style={styles.morePortfolioText}>+{item.portfolio_count - item.portfolio.length}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {prepared ? <Text style={styles.preparedHint}>{ui.webProfile}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm },
  header: { gap: spacing.md, marginBottom: spacing.sm },
  subtitle: { color: colors.textMuted, ...typography.body, lineHeight: 20 },
  searchBox: {
    minHeight: 54,
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
  clearSearch: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  clearSearchText: { color: colors.textMuted, fontSize: 25, lineHeight: 28 },
  quickRail: { gap: spacing.xs, paddingRight: spacing.md },
  quickChip: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.16)',
    borderRadius: 999,
    backgroundColor: colors.backgroundDeep,
    paddingHorizontal: spacing.md,
  },
  quickChipActive: { borderColor: colors.primary, backgroundColor: 'rgba(4, 197, 191, 0.12)' },
  quickChipText: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
  quickChipTextActive: { color: colors.primary },
  filterButton: {
    minHeight: 38,
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: 'rgba(238, 12, 111, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(238, 12, 111, 0.42)',
    paddingHorizontal: spacing.md,
  },
  filterButtonText: { color: '#ff5a9e', fontSize: 12, fontWeight: '900' },
  inlineError: { color: '#ff7c9f', fontSize: 12, lineHeight: 17 },
  tabs: { gap: spacing.xs, paddingRight: spacing.md },
  tab: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.12)',
    backgroundColor: colors.backgroundDeep,
    paddingHorizontal: spacing.md,
  },
  tabActive: { borderColor: colors.primary, backgroundColor: 'rgba(4, 197, 191, 0.10)' },
  tabText: { color: colors.textMuted, fontSize: 12, fontWeight: '900' },
  tabCount: { color: colors.textSubtle, fontSize: 11, fontWeight: '800' },
  tabTextActive: { color: colors.primary },
  activeRail: { gap: spacing.xs, paddingRight: spacing.md },
  activeChip: {
    maxWidth: 190,
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(4, 197, 191, 0.10)',
    paddingHorizontal: 11,
  },
  activeChipText: { maxWidth: 150, color: colors.primary, fontSize: 11, fontWeight: '800' },
  activeChipClose: { color: colors.primary, fontSize: 16, fontWeight: '900' },
  resultsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultsTitle: { color: colors.text, fontSize: 20, fontWeight: '900' },
  resultsMeta: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginTop: 2 },
  sortButton: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.16)',
    paddingHorizontal: spacing.sm,
  },
  sortButtonText: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
  sortChevron: { color: colors.primary, fontSize: 17 },
  state: { minHeight: 240, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  stateTitle: { color: colors.text, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  stateText: { color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  retry: { color: colors.primary, fontWeight: '900' },
  card: {
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.14)',
    borderRadius: radius.large,
    backgroundColor: 'rgba(0, 18, 28, 0.86)',
    marginBottom: spacing.sm,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardMain: { flex: 1, minWidth: 0, gap: 3 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  displayName: { color: colors.text, fontSize: 16, fontWeight: '900', flexShrink: 1 },
  verifiedMark: { color: colors.primary, fontWeight: '900' },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  kindBadge: { color: colors.primary, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  handle: { color: colors.textMuted, fontSize: 11, fontWeight: '700', flexShrink: 1 },
  locationText: { color: colors.textSubtle, fontSize: 11, fontWeight: '700' },
  chevron: { color: colors.textSubtle, fontSize: 26 },
  bio: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  badgeRail: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statusBadge: { color: colors.primary, backgroundColor: 'rgba(4, 197, 191, 0.10)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, fontSize: 10, fontWeight: '900' },
  preparedBadge: { color: '#ff5a9e', backgroundColor: 'rgba(238, 12, 111, 0.10)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, fontSize: 10, fontWeight: '900' },
  neutralBadge: { color: colors.textMuted, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, fontSize: 10, fontWeight: '800' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { color: colors.textMuted, borderWidth: 1, borderColor: 'rgba(4, 197, 191, 0.12)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, fontSize: 10, fontWeight: '700' },
  portfolioRow: { flexDirection: 'row', gap: 7 },
  portfolioImage: { flex: 1, height: 92, borderRadius: radius.medium, backgroundColor: colors.backgroundDeep },
  morePortfolio: { width: 58, height: 92, alignItems: 'center', justifyContent: 'center', borderRadius: radius.medium, backgroundColor: 'rgba(4, 197, 191, 0.08)' },
  morePortfolioText: { color: colors.primary, fontSize: 13, fontWeight: '900' },
  preparedHint: { color: colors.textSubtle, fontSize: 10, fontStyle: 'italic' },
  loadMore: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.large,
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.22)',
    marginVertical: spacing.md,
  },
  loadMoreText: { color: colors.primary, fontWeight: '900' },
  footerSpace: { height: spacing.xl },
  pressed: { opacity: 0.74, transform: [{ scale: 0.995 }] },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0, 0, 0, 0.68)' },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.18)',
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  sheetHandle: { width: 44, height: 4, alignSelf: 'center', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)', marginTop: 10 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  sheetTitle: { color: colors.text, fontSize: 21, fontWeight: '900' },
  clearFilters: { color: '#ff5a9e', fontSize: 12, fontWeight: '900' },
  sheetContent: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  fieldLabel: { color: colors.text, fontSize: 13, fontWeight: '900', marginTop: spacing.sm },
  sheetInput: { minHeight: 48, color: colors.text, borderWidth: 1, borderColor: 'rgba(4, 197, 191, 0.18)', borderRadius: radius.medium, backgroundColor: colors.backgroundDeep, paddingHorizontal: spacing.md },
  locationButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: 'rgba(4, 197, 191, 0.20)', borderRadius: radius.medium },
  locationButtonActive: { borderColor: colors.primary, backgroundColor: 'rgba(4, 197, 191, 0.08)' },
  locationButtonText: { color: colors.primary, fontSize: 12, fontWeight: '900' },
  styleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  styleChip: { minHeight: 34, justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(4, 197, 191, 0.12)', borderRadius: 999, paddingHorizontal: 11 },
  styleChipActive: { borderColor: colors.primary, backgroundColor: 'rgba(4, 197, 191, 0.10)' },
  styleChipText: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
  styleChipTextActive: { color: colors.primary },
  switchRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)' },
  switchLabel: { color: colors.text, fontSize: 13, fontWeight: '800', flex: 1, marginRight: spacing.md },
  segmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  segment: { minHeight: 36, justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(4, 197, 191, 0.12)', borderRadius: radius.medium, paddingHorizontal: 10 },
  segmentActive: { borderColor: colors.primary, backgroundColor: 'rgba(4, 197, 191, 0.10)' },
  segmentText: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
  segmentTextActive: { color: colors.primary },
  sortGrid: { flexDirection: 'row', gap: 7 },
  sortOption: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(4, 197, 191, 0.12)', borderRadius: radius.medium, paddingHorizontal: 6 },
  sortOptionActive: { borderColor: colors.primary, backgroundColor: 'rgba(4, 197, 191, 0.10)' },
  sortOptionText: { color: colors.textMuted, fontSize: 10, fontWeight: '900', textAlign: 'center' },
  sortOptionTextActive: { color: colors.primary },
  disabled: { opacity: 0.35 },
  sheetFooter: { padding: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.10)', backgroundColor: colors.background },
  applyButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: radius.large, backgroundColor: colors.primary },
  applyButtonText: { color: '#001316', fontSize: 14, fontWeight: '900' },
});

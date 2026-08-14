import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { Redirect, router, useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type {
  MapBookingMode,
  MapLocationMarker,
  MapMarkerKind,
} from '@/api/types';
import { useAuth } from '@/auth/auth-context';
import { BrandHeader } from '@/components/brand-header';
import { t } from '@/i18n';
import { MapLocationCard } from '@/map/location-card';
import { fetchMapLocations, type MapRegion } from '@/map/map-api';
import { MapCanvas } from '@/map/map-canvas';
import { colors, radius, spacing } from '@/theme';


const DEFAULT_REGION: MapRegion = {
  latitude: 46.8,
  longitude: 2.5,
  latitudeDelta: 12,
  longitudeDelta: 12,
};

type MapMode = 'map' | 'list';

type ChipProps = {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress?: () => void;
};

function Chip({ label, active = false, disabled = false, onPress }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && styles.chipActive,
        disabled && styles.chipDisabled,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export default function MapScreen() {
  const { request, status } = useAuth();
  const [region, setRegion] = useState<MapRegion>(DEFAULT_REGION);
  const [markers, setMarkers] = useState<MapLocationMarker[]>([]);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [mode, setMode] = useState<MapMode>('map');
  const [kind, setKind] = useState<MapMarkerKind | undefined>();
  const [stylesAvailable, setStylesAvailable] = useState<string[]>([]);
  const [activeStyles, setActiveStyles] = useState<string[]>([]);
  const [activeBooking, setActiveBooking] = useState<MapBookingMode[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [viewportCounts, setViewportCounts] = useState({ artists: 0, studios: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [showsUserLocation, setShowsUserLocation] = useState(false);
  const [locating, setLocating] = useState(false);
  const [focusRefresh, setFocusRefresh] = useState(0);
  const loadSequence = useRef(0);

  useEffect(() => {
    const timeout = setTimeout(() => setSearch(searchInput.trim()), 320);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  useFocusEffect(useCallback(() => {
    setFocusRefresh((current) => current + 1);
  }, []));

  const loadMap = useCallback(async (asRefresh = false) => {
    if (status !== 'authenticated') return;
    const sequence = ++loadSequence.current;
    if (asRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      let offset = 0;
      let hasMore = true;
      const loaded: MapLocationMarker[] = [];
      let latestViewport = { artists: 0, studios: 0 };
      let latestStyles: string[] = [];

      while (hasMore) {
        const response = await fetchMapLocations(request, {
          region,
          kind,
          styles: activeStyles,
          booking: activeBooking,
          search,
          offset,
          limit: 200,
        });
        if (sequence !== loadSequence.current) return;
        loaded.push(...response.results);
        latestViewport = response.viewport;
        latestStyles = response.filters.styles;
        hasMore = response.has_more;
        if (hasMore) {
          if (response.next_offset === null || response.next_offset <= offset) {
            throw new Error('Map pagination did not advance.');
          }
          offset = response.next_offset;
        }
      }

      setMarkers(loaded);
      setViewportCounts(latestViewport);
      setStylesAvailable(latestStyles);
      setSelectedMarkerId((current) => (
        current && loaded.some((marker) => marker.marker_id === current)
          ? current
          : null
      ));
    } catch {
      if (sequence === loadSequence.current) setError(t('mapLoadError'));
    } finally {
      if (sequence === loadSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [
    activeBooking,
    activeStyles,
    kind,
    region,
    request,
    search,
    status,
  ]);

  useEffect(() => {
    const timeout = setTimeout(() => void loadMap(), 260);
    return () => clearTimeout(timeout);
  }, [focusRefresh, loadMap]);

  if (status === 'anonymous') {
    return <Redirect href="/(auth)/login" />;
  }

  const selected = markers.find((marker) => marker.marker_id === selectedMarkerId) ?? null;

  const toggleStyle = (style: string) => {
    setActiveStyles((current) => current.includes(style)
      ? current.filter((item) => item !== style)
      : [...current, style]);
  };

  const toggleBooking = (booking: MapBookingMode) => {
    setActiveBooking((current) => current.includes(booking)
      ? current.filter((item) => item !== booking)
      : [...current, booking]);
  };

  const locateMe = async () => {
    setLocating(true);
    setError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        setError(t('mapLocationDenied'));
        return;
      }
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setShowsUserLocation(true);
      setRegion({
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
        latitudeDelta: 0.16,
        longitudeDelta: 0.16,
      });
      setMode('map');
    } catch {
      setError(t('mapLocationError'));
    } finally {
      setLocating(false);
    }
  };

  const openMarkerFromList = (marker: MapLocationMarker) => {
    setSelectedMarkerId(marker.marker_id);
    setRegion({
      latitude: marker.latitude,
      longitude: marker.longitude,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08,
    });
    setMode('map');
  };

  const openAddLocation = () => {
    router.push({
      pathname: '/map/add-location',
      params: {
        latitude: region.latitude.toFixed(6),
        longitude: region.longitude.toFixed(6),
      },
    });
  };

  const updateRegion = (nextRegion: MapRegion) => {
    setRegion((current) => {
      const unchanged = (
        Math.abs(current.latitude - nextRegion.latitude) < 0.000001
        && Math.abs(current.longitude - nextRegion.longitude) < 0.000001
        && Math.abs(current.latitudeDelta - nextRegion.latitudeDelta) < 0.000001
        && Math.abs(current.longitudeDelta - nextRegion.longitudeDelta) < 0.000001
      );
      return unchanged ? current : nextRegion;
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <BrandHeader />
        <View style={styles.titleRow}>
          <View style={styles.titleBlock}>
            <Text style={styles.eyebrow}>TATZO MAPS</Text>
            <Text style={styles.title}>{t('mapTitle')}</Text>
          </View>
          <Pressable onPress={openAddLocation} style={styles.addButton}>
            <Text style={styles.addButtonText}>＋ {t('mapAdd')}</Text>
          </Pressable>
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>⌕</Text>
            <TextInput
              accessibilityLabel={t('mapSearch')}
              autoCapitalize="none"
              onChangeText={setSearchInput}
              placeholder={t('mapSearch')}
              placeholderTextColor={colors.textMuted}
              selectionColor={colors.primary}
              style={styles.searchInput}
              value={searchInput}
            />
            {searchInput ? (
              <Pressable onPress={() => setSearchInput('')} style={styles.clearSearch}>
                <Text style={styles.clearSearchText}>×</Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable
            accessibilityLabel={t('mapNearMe')}
            disabled={locating}
            onPress={() => void locateMe()}
            style={styles.locateButton}
          >
            {locating
              ? <ActivityIndicator color={colors.primary} />
              : <Text style={styles.locateText}>◎</Text>}
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.filterContent}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filters}
        >
          <Chip label={t('mapAll')} active={!kind} onPress={() => setKind(undefined)} />
          <Chip label={t('mapArtists')} active={kind === 'artist'} onPress={() => setKind('artist')} />
          <Chip label={t('mapStudios')} active={kind === 'studio'} onPress={() => setKind('studio')} />
          {stylesAvailable.map((style) => (
            <Chip
              active={activeStyles.includes(style)}
              key={style}
              label={style}
              onPress={() => toggleStyle(style)}
            />
          ))}
          <Chip
            active={activeBooking.includes('accepting')}
            label={t('mapAccepting')}
            onPress={() => toggleBooking('accepting')}
          />
          <Chip
            active={activeBooking.includes('online')}
            label={t('mapOnline')}
            onPress={() => toggleBooking('online')}
          />
          <Chip
            active={activeBooking.includes('in_person')}
            label={t('mapInPerson')}
            onPress={() => toggleBooking('in_person')}
          />
          <Chip disabled label={t('mapDistanceSoon')} />
          <Chip disabled label={t('mapRatingSoon')} />
          <Chip disabled label={t('mapPriceSoon')} />
        </ScrollView>

        <View style={styles.summaryRow}>
          <Text style={styles.summary}>
            {viewportCounts.artists} {t('mapArtistsShort')} · {viewportCounts.studios} {t('mapStudiosShort')}
          </Text>
          <View style={styles.modeSwitch}>
            <Pressable
              onPress={() => setMode('map')}
              style={[styles.modeButton, mode === 'map' && styles.modeButtonActive]}
            >
              <Text style={[styles.modeText, mode === 'map' && styles.modeTextActive]}>
                {t('mapMode')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMode('list')}
              style={[styles.modeButton, mode === 'list' && styles.modeButtonActive]}
            >
              <Text style={[styles.modeText, mode === 'list' && styles.modeTextActive]}>
                {t('mapListMode')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {error ? (
        <Pressable onPress={() => void loadMap()} style={styles.errorBanner}>
          <Text style={styles.errorText}>{error} · {t('retry')}</Text>
        </Pressable>
      ) : null}

      {mode === 'map' ? (
        <View style={styles.mapShell}>
          <MapCanvas
            markers={markers}
            onRegionChange={updateRegion}
            onSelectMarker={(marker) => setSelectedMarkerId(marker.marker_id)}
            region={region}
            selectedMarkerId={selectedMarkerId}
            showsUserLocation={showsUserLocation}
          />
          <View pointerEvents="none" style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.artistDot]} />
              <Text style={styles.legendText}>{t('mapArtists')}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.studioDot]} />
              <Text style={styles.legendText}>{t('mapStudios')}</Text>
            </View>
          </View>
          {loading && !markers.length ? (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={styles.loadingText}>{t('mapLoading')}</Text>
            </View>
          ) : null}
          {selected ? (
            <View style={styles.selectedCard}>
              <MapLocationCard
                marker={selected}
                onClose={() => setSelectedMarkerId(null)}
              />
            </View>
          ) : null}
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={markers}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          keyExtractor={(marker) => marker.marker_id}
          ListEmptyComponent={loading ? (
            <View style={styles.emptyState}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={styles.loadingText}>{t('mapLoading')}</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>{t('mapEmpty')}</Text>
              <Text style={styles.loadingText}>{t('mapEmptyHint')}</Text>
            </View>
          )}
          refreshControl={(
            <RefreshControl
              onRefresh={() => void loadMap(true)}
              refreshing={refreshing}
              tintColor={colors.primary}
            />
          )}
          renderItem={({ item }) => (
            <MapLocationCard marker={item} onSelect={() => openMarkerFromList(item)} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  titleBlock: { flex: 1 },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 25, fontWeight: '900' },
  addButton: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addButtonText: { color: colors.primary, fontWeight: '800', fontSize: 13 },
  searchRow: { flexDirection: 'row', gap: spacing.sm },
  searchBox: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.medium,
    paddingHorizontal: spacing.sm,
  },
  searchIcon: { color: colors.primary, fontSize: 22, marginRight: spacing.xs },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, minHeight: 46 },
  clearSearch: { minWidth: 38, minHeight: 38, alignItems: 'center', justifyContent: 'center' },
  clearSearchText: { color: colors.textMuted, fontSize: 24 },
  locateButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  locateText: { color: colors.primary, fontSize: 24, fontWeight: '900' },
  filters: { maxHeight: 38 },
  filterContent: { gap: spacing.xs, paddingRight: spacing.md },
  chip: {
    minHeight: 34,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primaryMuted },
  chipDisabled: { opacity: 0.4 },
  chipText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: colors.white },
  pressed: { opacity: 0.7 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  summary: { color: colors.textMuted, fontSize: 11, fontWeight: '700', flex: 1 },
  modeSwitch: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  modeButton: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, backgroundColor: colors.surface },
  modeButtonActive: { backgroundColor: colors.primary },
  modeText: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
  modeTextActive: { color: colors.backgroundDeep },
  errorBanner: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: radius.medium,
    padding: spacing.sm,
    backgroundColor: colors.surface,
  },
  errorText: { color: colors.danger, textAlign: 'center', fontSize: 12 },
  mapShell: {
    flex: 1,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.backgroundDeep,
  },
  legend: {
    position: 'absolute',
    left: spacing.sm,
    top: spacing.sm,
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.backgroundDeep,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  artistDot: { backgroundColor: colors.primary },
  studioDot: { backgroundColor: colors.accent },
  legendText: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(0, 13, 24, 0.76)',
  },
  loadingText: { color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  selectedCard: { position: 'absolute', left: spacing.sm, right: spacing.sm, bottom: spacing.sm },
  listContent: { flexGrow: 1, padding: spacing.md, paddingBottom: spacing.xxl },
  separator: { height: spacing.md },
  emptyState: { minHeight: 280, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '900' },
});

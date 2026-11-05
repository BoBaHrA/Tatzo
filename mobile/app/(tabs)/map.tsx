import { useLanguage } from '@/localization/language-context';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { Redirect, router, useFocusEffect } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Text } from '@/components/text';

import { SafeAreaView } from 'react-native-safe-area-context';

import type {
  MapBookingMode,
  MapLocationMarker,
} from '@/api/types';
import { useAuth } from '@/auth/auth-context';
import { BrandHeader } from '@/components/brand-header';
import { t } from '@/i18n';
import { profileCopy as copy } from '@/profile/profile-copy';
import { mapLocationPresentation } from '@/map/location-presentation';
import { matchesMapStyle } from '@/map/owner-details';
import { MapLocationCard } from '@/map/location-card';
import { enrichMapOwners, fetchMapLocations, type MapRegion } from '@/map/map-api';
import { MapCanvas } from '@/map/map-canvas';
import { colors, radius, spacing } from '@/theme';


const DEFAULT_REGION: MapRegion = {
  latitude: 46.8,
  longitude: 2.5,
  latitudeDelta: 12,
  longitudeDelta: 12,
};

type SheetMode = 'search' | 'filters' | 'list';
type UserLocation = { latitude: number; longitude: number };

type ChipProps = {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress?: () => void;
};

function Chip({ label, active = false, disabled = false, onPress }: ChipProps) {
  useLanguage();
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

function SheetTab({
  icon,
  active,
  accessibilityLabel,
  onPress,
  badge,
}: {
  icon: string;
  active?: boolean;
  accessibilityLabel: string;
  onPress: () => void;
  badge?: number;
}) {
  useLanguage();
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.sheetTab,
        active && styles.sheetTabActive,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.sheetTabIcon, active && styles.sheetTabIconActive]}>{icon}</Text>
      {badge ? (
        <View style={styles.filterBadge}>
          <Text style={styles.filterBadgeText}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function MapScreen() {
  useLanguage();
  const { request, status } = useAuth();
  const [region, setRegion] = useState<MapRegion>(DEFAULT_REGION);
  const [markers, setMarkers] = useState<MapLocationMarker[]>([]);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [kind, setKind] = useState<'verified' | 'unclaimed' | undefined>();
  const [stylesAvailable, setStylesAvailable] = useState<string[]>([]);
  const [activeStyles, setActiveStyles] = useState<string[]>([]);
  const [activeBooking, setActiveBooking] = useState<MapBookingMode[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [viewportCounts, setViewportCounts] = useState({ artists: 0, studios: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [sheetMode, setSheetMode] = useState<SheetMode | null>(null);
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

      // Show pins immediately; owner cards refresh without blocking the basemap.
      setMarkers(loaded);
      setViewportCounts(latestViewport);
      setStylesAvailable(latestStyles);
      const enriched = await enrichMapOwners(request, loaded, () => sequence === loadSequence.current);
      if (sequence !== loadSequence.current) return;
      setMarkers(enriched);
      setViewportCounts(latestViewport);
      setStylesAvailable([...new Set([...latestStyles, ...enriched.flatMap(marker => marker.style_keys ?? marker.styles)])]);
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
  }, [activeBooking, region, request, search, status]);

  useEffect(() => {
    const timeout = setTimeout(() => void loadMap(), 260);
    return () => { clearTimeout(timeout); loadSequence.current++; };
  }, [focusRefresh, loadMap]);

  if (status === 'anonymous') return <Redirect href="/(auth)/login" />;

  const visibleMarkers = markers.filter(marker => {
    const connected = mapLocationPresentation(marker).connected;
    return (!kind || (kind === 'verified' ? connected : !connected))
      && (!activeStyles.length || activeStyles.some(style => matchesMapStyle(marker, style)));
  });
  const selected = visibleMarkers.find((marker) => marker.marker_id === selectedMarkerId) ?? null;
  const activeFilterCount = activeStyles.length + activeBooking.length + (kind ? 1 : 0);

  const mapStyleLabel = (value: string) => {
    for (const marker of markers) {
      const index = marker.style_keys?.indexOf(value) ?? -1;
      if (index >= 0) return marker.styles[index] ?? value.replace(/_/g, ' ');
    }
    return value.replace(/_/g, ' ');
  };

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
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const point = {
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
      };
      setUserLocation(point);
      setRegion({ ...point, latitudeDelta: 0.16, longitudeDelta: 0.16 });
      setSheetMode(null);
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
    setSheetMode(null);
  };

  const openAddLocation = () => {
    setSheetMode(null);
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

  const renderSheetBody = () => {
    if (sheetMode === 'search') {
      return (
        <ScrollView contentContainerStyle={styles.sheetScrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>⌕</Text>
            <TextInput
              accessibilityLabel={t('mapSearch')}
              autoCapitalize="none"
              autoFocus
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

          <View style={styles.kindRow}>
            <Chip label={t('mapAll')} active={!kind} onPress={() => setKind(undefined)} />
            <Chip label={t('verified')} active={kind === 'verified'} onPress={() => setKind('verified')} />
            <Chip label={copy('Needs claim', 'À revendiquer', 'Не присвоено')} active={kind === 'unclaimed'} onPress={() => setKind('unclaimed')} />
          </View>

          <View style={styles.statGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{viewportCounts.artists}</Text>
              <Text style={styles.statLabel}>{t('mapArtistsShort')}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{viewportCounts.studios}</Text>
              <Text style={styles.statLabel}>{t('mapStudiosShort')}</Text>
            </View>
          </View>

          <Pressable
            accessibilityLabel={t('mapNearMe')}
            disabled={locating}
            onPress={() => void locateMe()}
            style={({ pressed }) => [styles.nearMeButton, pressed && styles.pressed]}
          >
            {locating ? <ActivityIndicator color={colors.backgroundDeep} /> : <Text style={styles.nearMeIcon}>◎</Text>}
            <Text style={styles.nearMeText}>{t('mapNearMe')}</Text>
          </Pressable>
        </ScrollView>
      );
    }

    if (sheetMode === 'filters') {
      return (
        <ScrollView contentContainerStyle={styles.sheetScrollContent}>
          <View style={styles.filterSection}>
            <Text style={styles.sectionTitle}>{copy('Location status', 'Statut du lieu', 'Статус адреса')}</Text>
            <View style={styles.kindRow}>
              <Chip label={t('mapAll')} active={!kind} onPress={() => setKind(undefined)} />
              <Chip label={t('verified')} active={kind === 'verified'} onPress={() => setKind('verified')} />
              <Chip label={copy('Needs claim', 'À revendiquer', 'Не присвоено')} active={kind === 'unclaimed'} onPress={() => setKind('unclaimed')} />
            </View>
          </View>

          {stylesAvailable.length ? (
            <View style={styles.filterSection}>
              <Text style={styles.sectionTitle}>{t('chooseStyle')}</Text>
              <View style={styles.wrapRow}>
                {stylesAvailable.map((style) => (
                  <Chip
                    active={activeStyles.includes(style)}
                    key={style}
                    label={mapStyleLabel(style)}
                    onPress={() => toggleStyle(style)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          <View style={styles.filterSection}>
            <Text style={styles.sectionTitle}>{t('bookings')}</Text>
            <View style={styles.wrapRow}>
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
            </View>
          </View>

          <View style={styles.filterSection}>
            <View style={styles.wrapRow}>
              <Chip disabled label={t('mapDistanceSoon')} />
              <Chip disabled label={t('mapRatingSoon')} />
              <Chip disabled label={t('mapPriceSoon')} />
            </View>
          </View>
        </ScrollView>
      );
    }

    return (
      <FlatList
        contentContainerStyle={styles.listContent}
        data={visibleMarkers}
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
    );
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
      <View style={styles.header}>
        <BrandHeader title={t('mapTitle')} />
      </View>

      <View style={styles.mapShell}>
        <MapCanvas
          markers={visibleMarkers}
          onRegionChange={updateRegion}
          onSelectMarker={(marker) => setSelectedMarkerId(marker.marker_id)}
          region={region}
          selectedMarkerId={selectedMarkerId}
          userLocation={userLocation}
        />

        <View pointerEvents="none" style={styles.summaryPill}>
          <Text style={styles.summaryText}>
            {viewportCounts.artists} {t('mapArtistsShort')} · {viewportCounts.studios} {t('mapStudiosShort')}
          </Text>
        </View>

        <Pressable
          accessibilityLabel={t('mapNearMe')}
          disabled={locating}
          onPress={() => void locateMe()}
          style={({ pressed }) => [styles.floatingLocate, pressed && styles.pressed]}
        >
          {locating ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.floatingLocateText}>◎</Text>}
        </Pressable>

        {error ? (
          <Pressable onPress={() => void loadMap()} style={styles.errorBanner}>
            <Text style={styles.errorText}>{error} · {t('retry')}</Text>
          </Pressable>
        ) : null}

        {loading && !markers.length ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.loadingText}>{t('mapLoading')}</Text>
          </View>
        ) : null}

        {selected ? (
          <View style={styles.selectedCard}>
            <MapLocationCard marker={selected} onClose={() => setSelectedMarkerId(null)} />
          </View>
        ) : null}

        <View style={styles.mapDock}>
          <SheetTab accessibilityLabel={t('mapSearch')} active={sheetMode === 'search'} icon="⌕" onPress={() => setSheetMode('search')} />
          <SheetTab
            accessibilityLabel={`${t('mapAll')} / ${t('mapArtists')} / ${t('mapStudios')}`}
            active={sheetMode === 'filters'}
            badge={activeFilterCount}
            icon="≡"
            onPress={() => setSheetMode('filters')}
          />
          <SheetTab accessibilityLabel={t('mapListMode')} active={sheetMode === 'list'} icon="☷" onPress={() => setSheetMode('list')} />
          <SheetTab accessibilityLabel={t('mapAdd')} icon="＋" onPress={openAddLocation} />
        </View>
      </View>

      <Modal animationType="slide" onRequestClose={() => setSheetMode(null)} transparent visible={sheetMode !== null}>
        <View style={styles.modalRoot}>
          <Pressable onPress={() => setSheetMode(null)} style={styles.modalBackdrop} />
          <View accessibilityViewIsModal style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetTopRow}>
              <View style={styles.sheetTabs}>
                <SheetTab accessibilityLabel={t('mapSearch')} active={sheetMode === 'search'} icon="⌕" onPress={() => setSheetMode('search')} />
                <SheetTab
                  accessibilityLabel={`${t('mapAll')} / ${t('mapArtists')} / ${t('mapStudios')}`}
                  active={sheetMode === 'filters'}
                  badge={activeFilterCount}
                  icon="≡"
                  onPress={() => setSheetMode('filters')}
                />
                <SheetTab accessibilityLabel={t('mapListMode')} active={sheetMode === 'list'} icon="☷" onPress={() => setSheetMode('list')} />
                <SheetTab accessibilityLabel={t('mapAdd')} icon="＋" onPress={openAddLocation} />
              </View>
              <Pressable accessibilityLabel={t('close')} accessibilityRole="button" onPress={() => setSheetMode(null)} style={({ pressed }) => [styles.sheetClose, pressed && styles.pressed]}>
                <Text style={styles.sheetCloseText}>×</Text>
              </Pressable>
            </View>
            <View style={styles.sheetBody}>{renderSheetBody()}</View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { backgroundColor: colors.background, paddingHorizontal: spacing.md, paddingBottom: spacing.xs },
  mapShell: { flex: 1, overflow: 'hidden', borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: '#071317' },
  summaryPill: {
    position: 'absolute', left: spacing.sm, top: spacing.sm, borderRadius: radius.pill,
    paddingHorizontal: 11, paddingVertical: 7, backgroundColor: 'rgba(0, 13, 24, 0.88)',
    borderWidth: 1, borderColor: 'rgba(4, 197, 191, 0.22)',
  },
  summaryText: { color: '#9bc0c4', fontSize: 10, fontWeight: '800' },
  floatingLocate: {
    position: 'absolute', right: spacing.sm, top: spacing.sm, width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center', borderRadius: 22,
    backgroundColor: 'rgba(7, 19, 23, 0.94)', borderWidth: 1, borderColor: 'rgba(4, 197, 191, 0.32)',
  },
  floatingLocateText: { color: colors.primary, fontSize: 23, fontWeight: '900' },
  mapDock: {
    position: 'absolute', left: '50%', bottom: spacing.md, marginLeft: -116, width: 232, minHeight: 58,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 6,
    borderRadius: 29, backgroundColor: 'rgba(7, 19, 23, 0.94)', borderWidth: 1,
    borderColor: 'rgba(4, 197, 191, 0.28)',
  },
  sheetTab: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 23, position: 'relative' },
  sheetTabActive: { backgroundColor: 'rgba(4, 197, 191, 0.14)' },
  sheetTabIcon: { color: '#9bc0c4', fontSize: 23, lineHeight: 25, fontWeight: '800' },
  sheetTabIconActive: { color: colors.primary },
  filterBadge: {
    position: 'absolute', right: 0, top: 0, minWidth: 17, height: 17, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent,
    borderWidth: 2, borderColor: '#071317',
  },
  filterBadgeText: { color: colors.white, fontSize: 9, fontWeight: '900' },
  selectedCard: { position: 'absolute', left: spacing.sm, right: spacing.sm, bottom: 82 },
  errorBanner: {
    position: 'absolute', left: spacing.md, right: spacing.md, top: 64, borderColor: colors.danger,
    borderWidth: 1, borderRadius: radius.medium, padding: spacing.sm, backgroundColor: 'rgba(7, 19, 23, 0.96)',
  },
  errorText: { color: colors.danger, textAlign: 'center', fontSize: 12 },
  loadingOverlay: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center',
    justifyContent: 'center', gap: spacing.sm, backgroundColor: 'rgba(0, 13, 24, 0.64)',
  },
  loadingText: { color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.38)',
  },
  sheet: {
    height: '72%', minHeight: 360, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderWidth: 1, borderBottomWidth: 0, borderColor: 'rgba(4, 197, 191, 0.24)',
    backgroundColor: '#071317', paddingTop: spacing.xs, overflow: 'hidden',
  },
  sheetHandle: { width: 42, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 4, marginBottom: spacing.xs, backgroundColor: 'rgba(155, 192, 196, 0.38)' },
  sheetTopRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, paddingBottom: spacing.xs,
    borderBottomWidth: 1, borderBottomColor: 'rgba(4, 197, 191, 0.12)',
  },
  sheetTabs: { flex: 1, flexDirection: 'row', justifyContent: 'space-around' },
  sheetClose: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  sheetCloseText: { color: colors.textMuted, fontSize: 28, lineHeight: 30 },
  sheetBody: { flex: 1 },
  sheetScrollContent: { padding: spacing.md, paddingBottom: spacing.xxxl, gap: spacing.md },
  searchBox: {
    minHeight: 48, flexDirection: 'row', alignItems: 'center', backgroundColor: '#030b10',
    borderColor: 'rgba(255, 255, 255, 0.12)', borderWidth: 1, borderRadius: 16, paddingHorizontal: spacing.sm,
  },
  searchIcon: { color: colors.primary, fontSize: 22, marginRight: spacing.xs },
  searchInput: { flex: 1, color: colors.text, fontSize: 15, minHeight: 46 },
  clearSearch: { minWidth: 38, minHeight: 38, alignItems: 'center', justifyContent: 'center' },
  clearSearchText: { color: colors.textMuted, fontSize: 24 },
  kindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    minHeight: 36, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)', backgroundColor: 'rgba(255, 255, 255, 0.06)', paddingHorizontal: 11,
  },
  chipActive: { borderColor: 'rgba(255,255,255,0.18)', backgroundColor: colors.primary },
  chipDisabled: { opacity: 0.42 },
  chipText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: colors.backgroundDeep, fontWeight: '900' },
  statGrid: { flexDirection: 'row', gap: spacing.sm },
  statCard: { flex: 1, borderRadius: 16, padding: spacing.md, backgroundColor: 'rgba(255, 255, 255, 0.06)' },
  statValue: { color: colors.text, fontSize: 22, fontWeight: '900' },
  statLabel: { color: '#9bc0c4', marginTop: 2, fontSize: 11, fontWeight: '700' },
  nearMeButton: {
    minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    borderRadius: radius.pill, backgroundColor: colors.primary,
  },
  nearMeIcon: { color: colors.backgroundDeep, fontSize: 21, fontWeight: '900' },
  nearMeText: { color: colors.backgroundDeep, fontSize: 13, fontWeight: '900' },
  filterSection: {
    gap: spacing.sm, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: spacing.md, backgroundColor: 'rgba(255,255,255,0.025)',
  },
  sectionTitle: { color: colors.text, fontSize: 13, fontWeight: '900' },
  listContent: { flexGrow: 1, padding: spacing.md, paddingBottom: spacing.xxxl },
  separator: { height: spacing.sm },
  emptyState: { minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '900' },
  pressed: { opacity: 0.72 },
});


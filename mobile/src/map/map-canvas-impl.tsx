import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MapLocationMarker } from '@/api/types';
import type { MapRegion } from '@/map/map-api';
import { clusterMapMarkers, regionAroundCluster } from '@/map/map-clusters';
import { colors, radius, spacing } from '@/theme';


export type MapCanvasProps = {
  markers: MapLocationMarker[];
  region: MapRegion;
  selectedMarkerId: string | null;
  showsUserLocation?: boolean;
  onRegionChange: (region: MapRegion) => void;
  onSelectMarker: (marker: MapLocationMarker) => void;
};

function longitudeOffset(longitude: number, west: number) {
  let value = longitude - west;
  while (value < 0) value += 360;
  while (value >= 360) value -= 360;
  return value;
}

export function MapCanvas({
  markers,
  region,
  selectedMarkerId,
  onRegionChange,
  onSelectMarker,
}: MapCanvasProps) {
  const clusters = useMemo(
    () => clusterMapMarkers(markers, region),
    [markers, region],
  );
  const north = region.latitude + region.latitudeDelta / 2;
  const west = region.longitude - region.longitudeDelta / 2;

  const zoom = (factor: number) => {
    onRegionChange({
      ...region,
      latitudeDelta: Math.max(0.002, Math.min(120, region.latitudeDelta * factor)),
      longitudeDelta: Math.max(0.002, Math.min(180, region.longitudeDelta * factor)),
    });
  };

  return (
    <View accessibilityLabel="Tatzo map" style={styles.map}>
      <View style={[styles.road, styles.roadOne]} />
      <View style={[styles.road, styles.roadTwo]} />
      <View style={[styles.road, styles.roadThree]} />
      <Text style={[styles.cityLabel, { left: '14%', top: '22%' }]}>TATZO</Text>
      <Text style={[styles.cityLabel, { right: '10%', bottom: '20%' }]}>MAPS</Text>
      {clusters.map((cluster) => {
        const left = Math.max(
          2,
          Math.min(
            94,
            longitudeOffset(cluster.longitude, west) / region.longitudeDelta * 100,
          ),
        );
        const top = Math.max(
          3,
          Math.min(92, (north - cluster.latitude) / region.latitudeDelta * 100),
        );
        const marker = cluster.markers[0];
        const selected = cluster.markers.some(
          (item) => item.marker_id === selectedMarkerId,
        );
        return (
          <Pressable
            accessibilityLabel={cluster.markers.length > 1
              ? `${cluster.markers.length} locations`
              : marker.name}
            key={cluster.id}
            onPress={() => {
              if (cluster.markers.length > 1) {
                onRegionChange(regionAroundCluster(cluster, region));
              } else {
                onSelectMarker(marker);
              }
            }}
            style={[
              styles.marker,
              styles[cluster.kind],
              selected && styles.selected,
              { left: `${left}%`, top: `${top}%` },
            ]}
          >
            <Text style={styles.markerText}>
              {cluster.markers.length > 1
                ? cluster.markers.length
                : cluster.kind === 'artist' ? 'A' : 'S'}
            </Text>
          </Pressable>
        );
      })}
      <View style={styles.zoomControls}>
        <Pressable onPress={() => zoom(0.5)} style={styles.zoomButton}>
          <Text style={styles.zoomText}>+</Text>
        </Pressable>
        <Pressable onPress={() => zoom(2)} style={styles.zoomButton}>
          <Text style={styles.zoomText}>−</Text>
        </Pressable>
      </View>
      <View style={styles.webHint}>
        <Text style={styles.webHintText}>Native map preview</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
    minHeight: 360,
    overflow: 'hidden',
    backgroundColor: '#071a22',
  },
  road: {
    position: 'absolute',
    height: 2,
    width: '145%',
    backgroundColor: '#1c3941',
  },
  roadOne: { top: '28%', left: '-18%', transform: [{ rotate: '-14deg' }] },
  roadTwo: { top: '62%', left: '-20%', transform: [{ rotate: '19deg' }] },
  roadThree: { top: '48%', left: '-22%', transform: [{ rotate: '4deg' }] },
  cityLabel: {
    position: 'absolute',
    color: '#173943',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 5,
  },
  marker: {
    position: 'absolute',
    width: 38,
    height: 38,
    marginLeft: -19,
    marginTop: -38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 3,
    borderColor: colors.backgroundDeep,
  },
  artist: { backgroundColor: colors.primary },
  studio: { backgroundColor: colors.accent },
  mixed: { backgroundColor: colors.heading },
  selected: { borderColor: colors.white, transform: [{ scale: 1.14 }] },
  markerText: { color: colors.backgroundDeep, fontWeight: '900', fontSize: 13 },
  zoomControls: {
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
    gap: 2,
  },
  zoomButton: {
    width: 44,
    height: 44,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomText: { color: colors.text, fontSize: 26, fontWeight: '700' },
  webHint: {
    position: 'absolute',
    left: spacing.sm,
    bottom: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.backgroundDeep,
  },
  webHintText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
});

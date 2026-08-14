import { useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';

import type { MapLocationMarker } from '@/api/types';
import type { MapRegion } from '@/map/map-api';
import { clusterMapMarkers, regionAroundCluster } from '@/map/map-clusters';
import { colors, radius } from '@/theme';


export type MapCanvasProps = {
  markers: MapLocationMarker[];
  region: MapRegion;
  selectedMarkerId: string | null;
  showsUserLocation?: boolean;
  onRegionChange: (region: MapRegion) => void;
  onSelectMarker: (marker: MapLocationMarker) => void;
};

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#071a22' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8faeb4' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#000d18' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#16414a' }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#071a22' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#0b242c' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#567b82' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#16333b' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#0d262e' }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#113039' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#001018' }] },
] as const;

export function MapCanvas({
  markers,
  region,
  selectedMarkerId,
  showsUserLocation = false,
  onRegionChange,
  onSelectMarker,
}: MapCanvasProps) {
  const mapRef = useRef<MapView>(null);
  const clusters = useMemo(
    () => clusterMapMarkers(markers, region),
    [markers, region],
  );

  const openCluster = (cluster: ReturnType<typeof clusterMapMarkers>[number]) => {
    const nextRegion = regionAroundCluster(cluster, region);
    mapRef.current?.animateToRegion(nextRegion, 280);
  };

  return (
    <MapView
      customMapStyle={darkMapStyle as unknown as never[]}
      loadingBackgroundColor={colors.backgroundDeep}
      loadingEnabled
      loadingIndicatorColor={colors.primary}
      maxZoomLevel={18}
      minZoomLevel={3}
      moveOnMarkerPress={false}
      onRegionChangeComplete={(next: Region) => onRegionChange({
        latitude: next.latitude,
        longitude: next.longitude,
        latitudeDelta: Math.max(0.002, Math.min(120, next.latitudeDelta)),
        longitudeDelta: Math.max(0.002, Math.min(180, next.longitudeDelta)),
      })}
      pitchEnabled={false}
      ref={mapRef}
      region={region}
      rotateEnabled={false}
      showsCompass={false}
      showsMyLocationButton={false}
      showsPointsOfInterest={false}
      showsUserLocation={showsUserLocation}
      style={styles.map}
      toolbarEnabled={false}
      userInterfaceStyle="dark"
    >
      {clusters.map((cluster) => {
        const marker = cluster.markers[0];
        const selected = cluster.markers.some(
          (item) => item.marker_id === selectedMarkerId,
        );
        return (
          <Marker
            coordinate={{
              latitude: cluster.latitude,
              longitude: cluster.longitude,
            }}
            key={cluster.id}
            onPress={() => {
              if (cluster.markers.length > 1) openCluster(cluster);
              else onSelectMarker(marker);
            }}
            tracksViewChanges
          >
            <View style={[
              styles.pin,
              styles[cluster.kind],
              selected && styles.selected,
            ]}>
              <Text style={styles.pinText}>
                {cluster.markers.length > 1
                  ? cluster.markers.length
                  : cluster.kind === 'artist' ? 'A' : 'S'}
              </Text>
            </View>
          </Marker>
        );
      })}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1, minHeight: 360 },
  pin: {
    minWidth: 38,
    height: 38,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 3,
    borderColor: colors.backgroundDeep,
  },
  artist: { backgroundColor: colors.primary },
  studio: { backgroundColor: colors.accent },
  mixed: { backgroundColor: colors.heading },
  selected: { borderColor: colors.white, transform: [{ scale: 1.12 }] },
  pinText: { color: colors.backgroundDeep, fontSize: 13, fontWeight: '900' },
});

import type { MapLocationMarker } from '@/api/types';
import type { MapRegion } from '@/map/map-api';


export type MapCluster = {
  id: string;
  latitude: number;
  longitude: number;
  markers: MapLocationMarker[];
  kind: 'artist' | 'studio' | 'mixed';
};

function longitudeOffset(longitude: number, west: number) {
  let value = longitude - west;
  while (value < 0) value += 360;
  while (value >= 360) value -= 360;
  return value;
}

function clusterKind(markers: MapLocationMarker[]): MapCluster['kind'] {
  const hasArtists = markers.some((marker) => marker.kind === 'artist');
  const hasStudios = markers.some((marker) => marker.kind === 'studio');
  if (hasArtists && hasStudios) return 'mixed';
  return hasArtists ? 'artist' : 'studio';
}

export function clusterMapMarkers(
  markers: MapLocationMarker[],
  region: MapRegion,
): MapCluster[] {
  if (region.latitudeDelta <= 0.08 || markers.length < 2) {
    return markers.map((marker) => ({
      id: marker.marker_id,
      latitude: marker.latitude,
      longitude: marker.longitude,
      markers: [marker],
      kind: marker.kind,
    }));
  }

  const rowSize = Math.max(region.latitudeDelta / 8, 0.001);
  const columnSize = Math.max(region.longitudeDelta / 6, 0.001);
  const south = region.latitude - region.latitudeDelta / 2;
  const west = region.longitude - region.longitudeDelta / 2;
  const buckets = new Map<string, MapLocationMarker[]>();

  markers.forEach((marker) => {
    const row = Math.floor((marker.latitude - south) / rowSize);
    const column = Math.floor(longitudeOffset(marker.longitude, west) / columnSize);
    const key = `${row}:${column}`;
    buckets.set(key, [...(buckets.get(key) ?? []), marker]);
  });

  return [...buckets.entries()].map(([cell, bucket]) => ({
    id: bucket.length === 1
      ? bucket[0].marker_id
      : `cluster:${cell}:${bucket.map((marker) => marker.marker_id).sort().join('|')}`,
    latitude: bucket.reduce((sum, marker) => sum + marker.latitude, 0) / bucket.length,
    longitude: bucket.reduce((sum, marker) => sum + marker.longitude, 0) / bucket.length,
    markers: bucket,
    kind: clusterKind(bucket),
  }));
}

export function regionAroundCluster(cluster: MapCluster, current: MapRegion): MapRegion {
  const latitudeSpread = Math.max(
    ...cluster.markers.map((marker) => Math.abs(marker.latitude - cluster.latitude)),
    0.01,
  );
  const longitudeSpread = Math.max(
    ...cluster.markers.map((marker) => Math.abs(marker.longitude - cluster.longitude)),
    0.01,
  );
  return {
    latitude: cluster.latitude,
    longitude: cluster.longitude,
    latitudeDelta: Math.max(0.02, Math.min(current.latitudeDelta / 2, latitudeSpread * 3)),
    longitudeDelta: Math.max(0.02, Math.min(current.longitudeDelta / 2, longitudeSpread * 3)),
  };
}

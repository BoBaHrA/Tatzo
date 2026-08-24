import { StyleSheet, View } from 'react-native';

import type { MapLocationMarker } from '@/api/types';
import LeafletMap from '@/map/leaflet-map';
import type { MapRegion } from '@/map/map-api';


export type MapCanvasProps = {
  markers: MapLocationMarker[];
  region: MapRegion;
  selectedMarkerId: string | null;
  showsUserLocation?: boolean;
  onRegionChange: (region: MapRegion) => void;
  onSelectMarker: (marker: MapLocationMarker) => void;
};

export function MapCanvas({
  markers,
  region,
  selectedMarkerId,
  showsUserLocation = false,
  onRegionChange,
  onSelectMarker,
}: MapCanvasProps) {
  return (
    <View style={styles.map}>
      <LeafletMap
        dom={{
          scrollEnabled: false,
          style: { flex: 1 },
          containerStyle: { flex: 1 },
        }}
        markers={markers}
        onRegionChange={async (nextRegion) => {
          onRegionChange(nextRegion);
        }}
        onSelectMarker={async (marker) => {
          onSelectMarker(marker);
        }}
        region={region}
        selectedMarkerId={selectedMarkerId}
        showsUserLocation={showsUserLocation}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
    minHeight: 360,
    overflow: 'hidden',
  },
});

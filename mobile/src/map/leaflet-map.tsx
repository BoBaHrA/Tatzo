'use dom';

import { useEffect, useRef } from 'react';

import type { MapLocationMarker } from '@/api/types';
import type { MapRegion } from '@/map/map-api';
import { clusterMapMarkers, regionAroundCluster } from '@/map/map-clusters';


type LeafletGlobal = any;

type LeafletMapProps = {
  markers: MapLocationMarker[];
  region: MapRegion;
  selectedMarkerId: string | null;
  showsUserLocation?: boolean;
  onRegionChange: (region: MapRegion) => Promise<void>;
  onSelectMarker: (marker: MapLocationMarker) => Promise<void>;
  dom?: import('expo/dom').DOMProps;
};

declare global {
  interface Window {
    L?: LeafletGlobal;
    __tatzoLeafletPromise?: Promise<LeafletGlobal>;
  }
}

const LEAFLET_VERSION = '1.9.4';
const LEAFLET_JS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
const OSM_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (window.__tatzoLeafletPromise) return window.__tatzoLeafletPromise;

  window.__tatzoLeafletPromise = new Promise<LeafletGlobal>((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = LEAFLET_CSS;
      stylesheet.crossOrigin = '';
      document.head.appendChild(stylesheet);
    }

    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${LEAFLET_JS}"]`);
    if (existingScript) {
      existingScript.addEventListener('load', () => window.L ? resolve(window.L) : reject(new Error('Leaflet did not initialize.')), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Leaflet failed to load.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.crossOrigin = '';
    script.onload = () => window.L ? resolve(window.L) : reject(new Error('Leaflet did not initialize.'));
    script.onerror = () => reject(new Error('Leaflet failed to load.'));
    document.head.appendChild(script);
  });

  return window.__tatzoLeafletPromise;
}

function regionBounds(region: MapRegion) {
  return [
    [region.latitude - region.latitudeDelta / 2, region.longitude - region.longitudeDelta / 2],
    [region.latitude + region.latitudeDelta / 2, region.longitude + region.longitudeDelta / 2],
  ];
}

function regionFromLeaflet(map: any): MapRegion {
  const center = map.getCenter();
  const bounds = map.getBounds();
  return {
    latitude: center.lat,
    longitude: center.lng,
    latitudeDelta: Math.max(0.002, Math.min(120, bounds.getNorth() - bounds.getSouth())),
    longitudeDelta: Math.max(0.002, Math.min(180, bounds.getEast() - bounds.getWest())),
  };
}

function markerHtml(kind: 'artist' | 'studio' | 'mixed', count: number, selected: boolean) {
  const label = count > 1 ? String(count) : kind === 'artist' ? 'A' : kind === 'studio' ? 'S' : '•';
  return `<span class="tatzo-map-pin tatzo-map-pin--${kind}${selected ? ' is-selected' : ''}">${label}</span>`;
}

export default function LeafletMap({
  markers,
  region,
  selectedMarkerId,
  onRegionChange,
  onSelectMarker,
}: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const leafletRef = useRef<LeafletGlobal | null>(null);
  const propsRef = useRef({ markers, region, selectedMarkerId, onRegionChange, onSelectMarker });
  const suppressMoveRef = useRef(false);
  const lastAppliedRegionRef = useRef('');

  propsRef.current = { markers, region, selectedMarkerId, onRegionChange, onSelectMarker };

  useEffect(() => {
    let disposed = false;
    let fallbackTimer: number | undefined;

    void loadLeaflet().then((L) => {
      if (disposed || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;

      const map = L.map(containerRef.current, {
        attributionControl: true,
        zoomControl: true,
        minZoom: 3,
        maxZoom: 19,
        preferCanvas: true,
      });

      L.tileLayer(OSM_TILES, {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;

      const emitRegion = () => {
        if (suppressMoveRef.current) return;
        void propsRef.current.onRegionChange(regionFromLeaflet(map));
      };
      map.on('moveend', emitRegion);

      const initial = propsRef.current.region;
      suppressMoveRef.current = true;
      map.fitBounds(regionBounds(initial), { animate: false, padding: [0, 0] });
      fallbackTimer = window.setTimeout(() => {
        suppressMoveRef.current = false;
      }, 180);
      map.once('moveend', () => {
        suppressMoveRef.current = false;
      });
    }).catch(() => {
      containerRef.current?.classList.add('is-unavailable');
    });

    return () => {
      disposed = true;
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      leafletRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    const layer = layerRef.current;
    if (!map || !L || !layer) return;

    layer.clearLayers();
    const clusters = clusterMapMarkers(markers, region);

    for (const cluster of clusters) {
      const marker = cluster.markers[0];
      const selected = cluster.markers.some((item) => item.marker_id === selectedMarkerId);
      const icon = L.divIcon({
        className: 'tatzo-map-marker-shell',
        html: markerHtml(cluster.kind, cluster.markers.length, selected),
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });
      const leafletMarker = L.marker([cluster.latitude, cluster.longitude], {
        icon,
        keyboard: true,
        title: cluster.markers.length > 1 ? `${cluster.markers.length} locations` : marker.name,
      });

      leafletMarker.on('click', () => {
        if (cluster.markers.length > 1) {
          const next = regionAroundCluster(cluster, propsRef.current.region);
          map.fitBounds(regionBounds(next), { animate: true, duration: 0.24, padding: [18, 18] });
          return;
        }
        void propsRef.current.onSelectMarker(marker);
      });
      leafletMarker.addTo(layer);
    }
  }, [markers, region, selectedMarkerId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const key = [
      region.latitude.toFixed(6),
      region.longitude.toFixed(6),
      region.latitudeDelta.toFixed(6),
      region.longitudeDelta.toFixed(6),
    ].join(':');
    if (key === lastAppliedRegionRef.current) return;
    lastAppliedRegionRef.current = key;

    suppressMoveRef.current = true;
    map.fitBounds(regionBounds(region), { animate: false, padding: [0, 0] });
    const release = () => {
      suppressMoveRef.current = false;
    };
    map.once('moveend', release);
    const timer = window.setTimeout(release, 180);
    return () => window.clearTimeout(timer);
  }, [region]);

  return (
    <div className="tatzo-leaflet-root">
      <style>{`
        html, body, #root { width: 100%; height: 100%; margin: 0; background: #000d18; overflow: hidden; }
        * { box-sizing: border-box; }
        .tatzo-leaflet-root { width: 100%; height: 100%; min-height: 360px; background: #000d18; }
        .tatzo-leaflet-map { width: 100%; height: 100%; min-height: 360px; background: #071a22; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .tatzo-leaflet-map.is-unavailable::after { content: "Map unavailable"; position: absolute; inset: 0; display: grid; place-items: center; z-index: 1000; color: #9bb0b6; background: #000d18; }
        .leaflet-container { background: #071a22; }
        .leaflet-tile-pane { filter: brightness(.72) saturate(.52) contrast(1.16) hue-rotate(168deg); }
        .leaflet-control-zoom, .leaflet-control-attribution { border: 1px solid rgba(4,197,191,.28) !important; background: rgba(0,13,24,.92) !important; box-shadow: none !important; }
        .leaflet-control-zoom a { color: #04c5bf !important; background: #001b24 !important; border-color: rgba(4,197,191,.22) !important; }
        .leaflet-control-attribution, .leaflet-control-attribution a { color: #73939b !important; font-size: 9px !important; }
        .tatzo-map-marker-shell { background: transparent !important; border: 0 !important; }
        .tatzo-map-pin { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 999px; border: 3px solid #000d18; color: #000d18; font-size: 13px; font-weight: 900; box-shadow: 0 5px 16px rgba(0,0,0,.32); transform-origin: center; transition: transform .16s ease, border-color .16s ease; }
        .tatzo-map-pin--artist { background: #04c5bf; }
        .tatzo-map-pin--studio { background: #ee0c6f; }
        .tatzo-map-pin--mixed { background: #c71b43; color: #fff; }
        .tatzo-map-pin.is-selected { border-color: #fff; transform: scale(1.13); }
      `}</style>
      <div className="tatzo-leaflet-map" ref={containerRef} />
    </div>
  );
}

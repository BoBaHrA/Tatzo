'use dom';

import { useEffect, useRef, useState } from 'react';

import type { MapLocationMarker } from '@/api/types';
import type { MapRegion } from '@/map/map-api';


type LeafletGlobal = any;

type UserLocation = {
  latitude: number;
  longitude: number;
};

type LeafletMapProps = {
  markers: MapLocationMarker[];
  region: MapRegion;
  selectedMarkerId: string | null;
  userLocation?: UserLocation | null;
  onRegionChange: (region: MapRegion) => Promise<void>;
  onSelectMarker: (marker: MapLocationMarker) => Promise<void>;
  dom?: import('expo/dom').DOMProps;
};

declare global {
  interface Window {
    L?: LeafletGlobal;
    __tatzoLeafletStackPromise?: Promise<LeafletGlobal>;
  }
}

const LEAFLET_VERSION = '1.9.4';
const CLUSTER_VERSION = '1.5.3';
const LEAFLET_JS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
const CLUSTER_JS = `https://unpkg.com/leaflet.markercluster@${CLUSTER_VERSION}/dist/leaflet.markercluster.js`;
const CLUSTER_CSS = `https://unpkg.com/leaflet.markercluster@${CLUSTER_VERSION}/dist/MarkerCluster.css`;
const CLUSTER_DEFAULT_CSS = `https://unpkg.com/leaflet.markercluster@${CLUSTER_VERSION}/dist/MarkerCluster.Default.css`;
const CARTO_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

function ensureStylesheet(href: string) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = href;
  stylesheet.crossOrigin = '';
  document.head.appendChild(stylesheet);
}

function loadScript(src: string, ready: () => boolean): Promise<void> {
  if (ready()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => ready() ? resolve() : reject(new Error(`${src} did not initialize.`)), { once: true });
      existing.addEventListener('error', () => reject(new Error(`${src} failed to load.`)), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.crossOrigin = '';
    script.onload = () => ready() ? resolve() : reject(new Error(`${src} did not initialize.`));
    script.onerror = () => reject(new Error(`${src} failed to load.`));
    document.head.appendChild(script);
  });
}

function loadLeafletStack() {
  if (window.L?.markerClusterGroup) return Promise.resolve(window.L);
  if (window.__tatzoLeafletStackPromise) return window.__tatzoLeafletStackPromise;

  ensureStylesheet(LEAFLET_CSS);
  ensureStylesheet(CLUSTER_CSS);
  ensureStylesheet(CLUSTER_DEFAULT_CSS);

  window.__tatzoLeafletStackPromise = (async () => {
    await loadScript(LEAFLET_JS, () => Boolean(window.L));
    await loadScript(CLUSTER_JS, () => Boolean(window.L?.markerClusterGroup));
    if (!window.L?.markerClusterGroup) throw new Error('Leaflet MarkerCluster did not initialize.');
    return window.L;
  })();

  return window.__tatzoLeafletStackPromise;
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

function regionKey(region: MapRegion) {
  return [
    region.latitude.toFixed(6),
    region.longitude.toFixed(6),
    region.latitudeDelta.toFixed(6),
    region.longitudeDelta.toFixed(6),
  ].join(':');
}

function pointMarkerHtml(marker: MapLocationMarker, selected: boolean) {
  const sourceClass = marker.kind === 'artist' ? 'verified' : 'unclaimed';
  const glyph = marker.kind === 'artist' ? '✓' : '•';
  return `<span class="tatzo-map-marker tatzo-map-marker-${sourceClass}${selected ? ' is-selected' : ''}"><span>${glyph}</span></span>`;
}

function clusterKind(cluster: any) {
  const markers = cluster.getAllChildMarkers();
  const hasArtist = markers.some((marker: any) => marker.options.tatzoKind === 'artist');
  const hasStudio = markers.some((marker: any) => marker.options.tatzoKind === 'studio');
  if (hasArtist && hasStudio) return 'mixed';
  return hasArtist ? 'verified' : 'unclaimed';
}

export default function LeafletMap({
  markers,
  region,
  selectedMarkerId,
  userLocation = null,
  onRegionChange,
  onSelectMarker,
}: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const userLayerRef = useRef<any>(null);
  const leafletRef = useRef<LeafletGlobal | null>(null);
  const propsRef = useRef({ markers, region, selectedMarkerId, userLocation, onRegionChange, onSelectMarker });
  const suppressMoveRef = useRef(false);
  const lastAppliedRegionRef = useRef('');
  const [ready, setReady] = useState(false);

  propsRef.current = { markers, region, selectedMarkerId, userLocation, onRegionChange, onSelectMarker };

  useEffect(() => {
    let disposed = false;
    let fallbackTimer: number | undefined;

    void loadLeafletStack().then((L) => {
      if (disposed || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;

      const worldBounds = L.latLngBounds([[-85, -180], [85, 180]]);
      const map = L.map(containerRef.current, {
        attributionControl: true,
        zoomControl: true,
        minZoom: 3,
        maxZoom: 19,
        maxBounds: worldBounds,
        maxBoundsViscosity: 1,
        worldCopyJump: false,
      });

      L.tileLayer(CARTO_TILES, {
        minZoom: 2,
        maxZoom: 19,
        noWrap: true,
        bounds: worldBounds,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      }).addTo(map);

      layerRef.current = L.markerClusterGroup({
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        zoomToBoundsOnClick: true,
        removeOutsideVisibleBounds: true,
        animate: true,
        animateAddingMarkers: true,
        maxClusterRadius: 46,
        iconCreateFunction: (cluster: any) => L.divIcon({
          className: `tatzo-cluster tatzo-cluster-${clusterKind(cluster)}`,
          html: `<span>${cluster.getChildCount()}</span>`,
          iconSize: [42, 42],
          iconAnchor: [21, 21],
        }),
      }).addTo(map);
      userLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;

      const emitRegion = () => {
        if (suppressMoveRef.current) return;
        const nextRegion = regionFromLeaflet(map);
        lastAppliedRegionRef.current = regionKey(nextRegion);
        void propsRef.current.onRegionChange(nextRegion);
      };
      map.on('moveend', emitRegion);

      const initial = propsRef.current.region;
      lastAppliedRegionRef.current = regionKey(initial);
      suppressMoveRef.current = true;
      map.fitBounds(regionBounds(initial), { animate: false, padding: [0, 0] });
      fallbackTimer = window.setTimeout(() => {
        suppressMoveRef.current = false;
      }, 220);
      map.once('moveend', () => {
        suppressMoveRef.current = false;
      });
      setReady(true);
    }).catch(() => {
      containerRef.current?.classList.add('is-unavailable');
    });

    return () => {
      disposed = true;
      if (fallbackTimer) window.clearTimeout(fallbackTimer);
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
      userLayerRef.current = null;
      leafletRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const layer = layerRef.current;
    if (!ready || !L || !layer) return;

    layer.clearLayers();
    for (const marker of markers) {
      const selected = marker.marker_id === selectedMarkerId;
      const icon = L.divIcon({
        className: 'tatzo-map-marker-shell',
        html: pointMarkerHtml(marker, selected),
        iconSize: [34, 34],
        iconAnchor: [17, 17],
        popupAnchor: [0, -18],
      });
      const leafletMarker = L.marker([marker.latitude, marker.longitude], {
        icon,
        keyboard: true,
        title: marker.name,
        tatzoKind: marker.kind,
      });
      leafletMarker.on('click', () => {
        void propsRef.current.onSelectMarker(marker);
      });
      layer.addLayer(leafletMarker);
    }
  }, [markers, ready, selectedMarkerId]);

  useEffect(() => {
    const L = leafletRef.current;
    const userLayer = userLayerRef.current;
    if (!ready || !L || !userLayer) return;
    userLayer.clearLayers();
    if (!userLocation) return;
    const pulse = L.divIcon({
      className: 'tatzo-user-location-shell',
      html: '<span class="tatzo-user-location"><i></i></span>',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
    L.marker([userLocation.latitude, userLocation.longitude], {
      icon: pulse,
      interactive: false,
      keyboard: false,
    }).addTo(userLayer);
  }, [ready, userLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const key = regionKey(region);
    if (key === lastAppliedRegionRef.current) return;
    lastAppliedRegionRef.current = key;

    suppressMoveRef.current = true;
    map.fitBounds(regionBounds(region), { animate: true, duration: 0.28, padding: [0, 0] });
    const release = () => {
      suppressMoveRef.current = false;
    };
    map.once('moveend', release);
    const timer = window.setTimeout(release, 360);
    return () => window.clearTimeout(timer);
  }, [ready, region]);

  return (
    <div className="tatzo-leaflet-root">
      <style>{`
        html, body, #root { width: 100%; height: 100%; margin: 0; background: #000d18; overflow: hidden; }
        * { box-sizing: border-box; }
        .tatzo-leaflet-root { width: 100%; height: 100%; min-height: 360px; background: #000d18; }
        .tatzo-leaflet-map { width: 100%; height: 100%; min-height: 360px; background: #071317; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .tatzo-leaflet-map.is-unavailable::after { content: "Map unavailable"; position: absolute; inset: 0; display: grid; place-items: center; z-index: 1000; color: #9bc0c4; background: #000d18; }
        .leaflet-container { background: #071317; }
        .leaflet-control-zoom, .leaflet-control-attribution { border: 1px solid rgba(4,197,191,.24) !important; background: rgba(0,13,24,.92) !important; box-shadow: none !important; }
        .leaflet-control-zoom a { color: #04c5bf !important; background: #071317 !important; border-color: rgba(4,197,191,.18) !important; }
        .leaflet-control-attribution { opacity: .62; transition: opacity .18s ease; }
        .leaflet-control-attribution:hover, .leaflet-control-attribution:focus-within { opacity: .96; }
        .leaflet-control-attribution, .leaflet-control-attribution a { color: #9bc0c4 !important; font-size: 9px !important; }
        .tatzo-map-marker-shell { background: transparent !important; border: 0 !important; }
        .tatzo-map-marker { width: 34px; height: 34px; border: 3px solid rgba(255,255,255,.86); border-radius: 50%; box-shadow: 0 10px 26px rgba(0,0,0,.36), 0 0 0 6px rgba(4,197,191,.12); display: grid; place-items: center; transform-origin: center; transition: transform .18s ease, box-shadow .18s ease; }
        .tatzo-map-marker span { color: #001316; font-size: 13px; font-weight: 900; line-height: 1; }
        .tatzo-map-marker-verified { background: #04c5bf; }
        .tatzo-map-marker-unclaimed { background: #ee0c6f; box-shadow: 0 10px 26px rgba(0,0,0,.36), 0 0 0 6px rgba(238,12,111,.16); }
        .tatzo-map-marker-unclaimed span { color: #fff; font-size: 20px; line-height: .8; }
        .tatzo-map-marker.is-selected { transform: scale(1.18); box-shadow: 0 10px 30px rgba(0,0,0,.42), 0 0 0 7px rgba(255,255,255,.18); }
        .tatzo-cluster { border: 3px solid rgba(255,255,255,.82) !important; border-radius: 50%; box-shadow: 0 12px 30px rgba(0,0,0,.38), 0 0 0 7px rgba(255,255,255,.05); display: grid !important; place-items: center; color: #fff; transition: transform .2s ease; }
        .tatzo-cluster span { color: #fff; font-size: 13px; font-weight: 900; line-height: 1; }
        .tatzo-cluster-verified { background: radial-gradient(circle at 35% 28%, #8ffefa, #04c5bf) !important; }
        .tatzo-cluster-unclaimed { background: radial-gradient(circle at 35% 28%, #ff9bc5, #ee0c6f) !important; }
        .tatzo-cluster-mixed { background: linear-gradient(135deg, #04c5bf, #ee0c6f) !important; }
        .marker-cluster-small, .marker-cluster-medium, .marker-cluster-large { background: transparent !important; }
        .marker-cluster div { margin: 0 !important; width: 100% !important; height: 100% !important; }
        .tatzo-user-location-shell { background: transparent !important; border: 0 !important; }
        .tatzo-user-location { position: relative; width: 18px; height: 18px; display: block; border-radius: 50%; background: #fff; border: 4px solid #04c5bf; box-shadow: 0 0 0 4px rgba(4,197,191,.18); }
        .tatzo-user-location::after { content: ""; position: absolute; inset: -9px; border: 2px solid rgba(4,197,191,.44); border-radius: 50%; animation: tatzoUserPulse 1.8s ease-out infinite; }
        @keyframes tatzoUserPulse { 0% { transform: scale(.55); opacity: .9; } 100% { transform: scale(1.5); opacity: 0; } }
      `}</style>
      <div aria-label="Tatzo map" className="tatzo-leaflet-map" ref={containerRef} />
    </div>
  );
}

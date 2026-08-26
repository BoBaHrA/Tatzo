'use dom';

import { useEffect, useRef, useState } from 'react';

import type { MapLocationMarker } from '@/api/types';
import type { MapRegion } from '@/map/map-api';


type LeafletGlobal = any;
type UserLocation = { latitude: number; longitude: number };
type LeafletMapProps = {
  markers: MapLocationMarker[];
  region: MapRegion;
  selectedMarkerId: string | null;
  userLocation?: UserLocation | null;
  onRegionChange: (region: MapRegion) => Promise<void>;
  onSelectMarker: (marker: MapLocationMarker) => Promise<void>;
  dom?: import('expo/dom').DOMProps;
};

type MarkerEntry = {
  layer: any;
  signature: string;
};

declare global {
  interface Window {
    L?: LeafletGlobal;
    __tatzoLeafletStablePromise?: Promise<LeafletGlobal>;
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
  const node = document.createElement('link');
  node.rel = 'stylesheet';
  node.href = href;
  node.crossOrigin = '';
  document.head.appendChild(node);
}

function loadScript(src: string, ready: () => boolean) {
  if (ready()) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => ready() ? resolve() : reject(new Error(`${src} did not initialize.`)), { once: true });
      existing.addEventListener('error', () => reject(new Error(`${src} failed to load.`)), { once: true });
      return;
    }
    const node = document.createElement('script');
    node.src = src;
    node.crossOrigin = '';
    node.onload = () => ready() ? resolve() : reject(new Error(`${src} did not initialize.`));
    node.onerror = () => reject(new Error(`${src} failed to load.`));
    document.head.appendChild(node);
  });
}

function loadLeafletStack() {
  if (window.L?.markerClusterGroup) return Promise.resolve(window.L);
  if (window.__tatzoLeafletStablePromise) return window.__tatzoLeafletStablePromise;
  ensureStylesheet(LEAFLET_CSS);
  ensureStylesheet(CLUSTER_CSS);
  ensureStylesheet(CLUSTER_DEFAULT_CSS);
  window.__tatzoLeafletStablePromise = (async () => {
    await loadScript(LEAFLET_JS, () => Boolean(window.L));
    await loadScript(CLUSTER_JS, () => Boolean(window.L?.markerClusterGroup));
    if (!window.L?.markerClusterGroup) throw new Error('Leaflet MarkerCluster did not initialize.');
    return window.L;
  })();
  return window.__tatzoLeafletStablePromise;
}

function boundsFor(region: MapRegion) {
  return [
    [region.latitude - region.latitudeDelta / 2, region.longitude - region.longitudeDelta / 2],
    [region.latitude + region.latitudeDelta / 2, region.longitude + region.longitudeDelta / 2],
  ];
}

function regionFromMap(map: any): MapRegion {
  const center = map.getCenter();
  const bounds = map.getBounds();
  return {
    latitude: center.lat,
    longitude: center.lng,
    latitudeDelta: Math.max(0.002, Math.min(120, bounds.getNorth() - bounds.getSouth())),
    longitudeDelta: Math.max(0.002, Math.min(180, bounds.getEast() - bounds.getWest())),
  };
}

function closeEnough(a: MapRegion, b: MapRegion) {
  const latTolerance = Math.max(0.0004, a.latitudeDelta * 0.018);
  const lngTolerance = Math.max(0.0004, a.longitudeDelta * 0.018);
  return Math.abs(a.latitude - b.latitude) < latTolerance
    && Math.abs(a.longitude - b.longitude) < lngTolerance
    && Math.abs(a.latitudeDelta - b.latitudeDelta) < latTolerance * 2
    && Math.abs(a.longitudeDelta - b.longitudeDelta) < lngTolerance * 2;
}

function markerHtml(marker: MapLocationMarker, selected: boolean) {
  const kind = marker.kind === 'artist' ? 'verified' : 'unclaimed';
  const glyph = marker.kind === 'artist' ? '✓' : '•';
  return `<span class="tatzo-map-marker tatzo-map-marker-${kind}${selected ? ' is-selected' : ''}"><span>${glyph}</span></span>`;
}

function clusterKind(cluster: any) {
  const children = cluster.getAllChildMarkers();
  const artist = children.some((item: any) => item.options.tatzoKind === 'artist');
  const studio = children.some((item: any) => item.options.tatzoKind === 'studio');
  if (artist && studio) return 'mixed';
  return artist ? 'verified' : 'unclaimed';
}

function markerSignature(marker: MapLocationMarker, selected: boolean) {
  return [marker.latitude, marker.longitude, marker.kind, marker.name, selected ? 1 : 0].join('|');
}

export default function LeafletMapStable({
  markers,
  region,
  selectedMarkerId,
  userLocation = null,
  onRegionChange,
  onSelectMarker,
}: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const clusterRef = useRef<any>(null);
  const markerEntriesRef = useRef<Map<string, MarkerEntry>>(new Map());
  const userLayerRef = useRef<any>(null);
  const leafletRef = useRef<LeafletGlobal | null>(null);
  const propsRef = useRef({ markers, region, selectedMarkerId, userLocation, onRegionChange, onSelectMarker });
  const suppressMoveRef = useRef(false);
  const [ready, setReady] = useState(false);

  propsRef.current = { markers, region, selectedMarkerId, userLocation, onRegionChange, onSelectMarker };

  useEffect(() => {
    let disposed = false;
    let releaseTimer: number | undefined;

    void loadLeafletStack().then((L) => {
      if (disposed || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;
      const isAndroid = /Android/i.test(navigator.userAgent || '');
      const worldBounds = L.latLngBounds([[-85, -180], [85, 180]]);
      const map = L.map(containerRef.current, {
        attributionControl: true,
        zoomControl: true,
        minZoom: 3,
        maxZoom: 19,
        maxBounds: worldBounds,
        maxBoundsViscosity: 1,
        worldCopyJump: false,
        zoomAnimation: !isAndroid,
        fadeAnimation: !isAndroid,
        markerZoomAnimation: !isAndroid,
      });

      L.tileLayer(CARTO_TILES, {
        minZoom: 2,
        maxZoom: 19,
        noWrap: true,
        bounds: worldBounds,
        updateWhenZooming: false,
        keepBuffer: 3,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      }).addTo(map);

      const cluster = L.markerClusterGroup({
        showCoverageOnHover: false,
        spiderfyOnMaxZoom: true,
        zoomToBoundsOnClick: false,
        removeOutsideVisibleBounds: true,
        animate: !isAndroid,
        animateAddingMarkers: false,
        maxClusterRadius: 46,
        iconCreateFunction: (group: any) => L.divIcon({
          className: `tatzo-cluster tatzo-cluster-${clusterKind(group)}`,
          html: `<span>${group.getChildCount()}</span>`,
          iconSize: [42, 42],
          iconAnchor: [21, 21],
        }),
      }).addTo(map);

      cluster.on('clusterclick', (event: any) => {
        const group = event.layer;
        if (map.getZoom() >= map.getMaxZoom() - 1) {
          group.spiderfy();
          return;
        }
        suppressMoveRef.current = true;
        map.fitBounds(group.getBounds(), {
          animate: !isAndroid,
          duration: 0.18,
          padding: [28, 28],
        });
        const release = () => { suppressMoveRef.current = false; };
        map.once('moveend', () => {
          release();
          void propsRef.current.onRegionChange(regionFromMap(map));
        });
        window.setTimeout(release, 280);
      });

      clusterRef.current = cluster;
      userLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;

      map.on('moveend', () => {
        if (suppressMoveRef.current) return;
        void propsRef.current.onRegionChange(regionFromMap(map));
      });

      suppressMoveRef.current = true;
      map.fitBounds(boundsFor(propsRef.current.region), { animate: false, padding: [0, 0] });
      map.once('moveend', () => { suppressMoveRef.current = false; });
      releaseTimer = window.setTimeout(() => { suppressMoveRef.current = false; }, 240);
      setReady(true);
    }).catch(() => containerRef.current?.classList.add('is-unavailable'));

    return () => {
      disposed = true;
      if (releaseTimer) window.clearTimeout(releaseTimer);
      mapRef.current?.remove();
      mapRef.current = null;
      clusterRef.current = null;
      markerEntriesRef.current.clear();
      userLayerRef.current = null;
      leafletRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const cluster = clusterRef.current;
    if (!ready || !L || !cluster) return;

    const desired = new Set(markers.map((marker) => marker.marker_id));
    for (const [id, entry] of markerEntriesRef.current.entries()) {
      if (desired.has(id)) continue;
      cluster.removeLayer(entry.layer);
      markerEntriesRef.current.delete(id);
    }

    for (const marker of markers) {
      const selected = marker.marker_id === selectedMarkerId;
      const signature = markerSignature(marker, selected);
      const icon = () => L.divIcon({
        className: 'tatzo-map-marker-shell',
        html: markerHtml(marker, selected),
        iconSize: [34, 34],
        iconAnchor: [17, 17],
        popupAnchor: [0, -18],
      });
      const existing = markerEntriesRef.current.get(marker.marker_id);

      if (existing) {
        existing.layer.options.tatzoData = marker;
        existing.layer.options.tatzoKind = marker.kind;
        if (existing.signature !== signature) {
          existing.layer.setLatLng([marker.latitude, marker.longitude]);
          existing.layer.setIcon(icon());
          existing.signature = signature;
          cluster.refreshClusters(existing.layer);
        }
        continue;
      }

      const layer = L.marker([marker.latitude, marker.longitude], {
        icon: icon(),
        keyboard: true,
        title: marker.name,
        tatzoKind: marker.kind,
        tatzoData: marker,
      });
      layer.on('click', () => {
        void propsRef.current.onSelectMarker(layer.options.tatzoData as MapLocationMarker);
      });
      markerEntriesRef.current.set(marker.marker_id, { layer, signature });
      cluster.addLayer(layer);
    }
  }, [markers, ready, selectedMarkerId]);

  useEffect(() => {
    const L = leafletRef.current;
    const layer = userLayerRef.current;
    if (!ready || !L || !layer) return;
    layer.clearLayers();
    if (!userLocation) return;
    const icon = L.divIcon({
      className: 'tatzo-user-location-shell',
      html: '<span class="tatzo-user-location"><i></i></span>',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
    L.marker([userLocation.latitude, userLocation.longitude], { icon, interactive: false, keyboard: false }).addTo(layer);
  }, [ready, userLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const current = regionFromMap(map);
    if (closeEnough(current, region)) return;
    suppressMoveRef.current = true;
    map.fitBounds(boundsFor(region), { animate: false, padding: [0, 0] });
    const release = () => { suppressMoveRef.current = false; };
    map.once('moveend', release);
    const timer = window.setTimeout(release, 220);
    return () => window.clearTimeout(timer);
  }, [ready, region]);

  return (
    <div className="tatzo-leaflet-root">
      <style>{`
        html, body, #root { width:100%; height:100%; margin:0; background:#000d18; overflow:hidden; }
        * { box-sizing:border-box; }
        .tatzo-leaflet-root, .tatzo-leaflet-map { width:100%; height:100%; min-height:360px; background:#071317; }
        .tatzo-leaflet-map { font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
        .tatzo-leaflet-map.is-unavailable::after { content:"Map unavailable"; position:absolute; inset:0; display:grid; place-items:center; z-index:1000; color:#9bc0c4; background:#000d18; }
        .leaflet-control-zoom, .leaflet-control-attribution { border:1px solid rgba(4,197,191,.24)!important; background:rgba(0,13,24,.92)!important; box-shadow:none!important; }
        .leaflet-control-zoom a { color:#04c5bf!important; background:#071317!important; border-color:rgba(4,197,191,.18)!important; }
        .leaflet-control-attribution, .leaflet-control-attribution a { color:#9bc0c4!important; font-size:9px!important; }
        .tatzo-map-marker-shell, .tatzo-user-location-shell { background:transparent!important; border:0!important; }
        .tatzo-map-marker { width:34px; height:34px; border:3px solid rgba(255,255,255,.86); border-radius:50%; box-shadow:0 10px 26px rgba(0,0,0,.36),0 0 0 6px rgba(4,197,191,.12); display:grid; place-items:center; transform-origin:center; transition:transform .14s ease,box-shadow .14s ease; }
        .tatzo-map-marker span { color:#001316; font-size:13px; font-weight:900; line-height:1; }
        .tatzo-map-marker-verified { background:#04c5bf; }
        .tatzo-map-marker-unclaimed { background:#ee0c6f; box-shadow:0 10px 26px rgba(0,0,0,.36),0 0 0 6px rgba(238,12,111,.16); }
        .tatzo-map-marker-unclaimed span { color:#fff; font-size:20px; line-height:.8; }
        .tatzo-map-marker.is-selected { transform:scale(1.15); box-shadow:0 10px 30px rgba(0,0,0,.42),0 0 0 7px rgba(255,255,255,.18); }
        .tatzo-cluster { border:3px solid rgba(255,255,255,.82)!important; border-radius:50%; box-shadow:0 12px 30px rgba(0,0,0,.38),0 0 0 7px rgba(255,255,255,.05); display:grid!important; place-items:center; color:#fff; }
        .tatzo-cluster span { color:#fff; font-size:13px; font-weight:900; line-height:1; }
        .tatzo-cluster-verified { background:radial-gradient(circle at 35% 28%,#8ffefa,#04c5bf)!important; }
        .tatzo-cluster-unclaimed { background:radial-gradient(circle at 35% 28%,#ff9bc5,#ee0c6f)!important; }
        .tatzo-cluster-mixed { background:linear-gradient(135deg,#04c5bf,#ee0c6f)!important; }
        .marker-cluster-small,.marker-cluster-medium,.marker-cluster-large { background:transparent!important; }
        .marker-cluster div { margin:0!important; width:100%!important; height:100%!important; }
        .tatzo-user-location { position:relative; width:18px; height:18px; display:block; border-radius:50%; background:#fff; border:4px solid #04c5bf; box-shadow:0 0 0 5px rgba(4,197,191,.18); }
        .tatzo-user-location i { position:absolute; inset:-9px; border-radius:50%; border:2px solid rgba(4,197,191,.36); animation:tatzo-pulse 1.8s ease-out infinite; }
        @keyframes tatzo-pulse { 0%{transform:scale(.55);opacity:.9} 100%{transform:scale(1.55);opacity:0} }
      `}</style>
      <div className="tatzo-leaflet-map" ref={containerRef} />
    </div>
  );
}

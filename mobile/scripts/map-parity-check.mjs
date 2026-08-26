#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const passed = [];

function source(relativePath) {
  const absolutePath = join(projectRoot, relativePath);
  if (!existsSync(absolutePath)) {
    failures.push(`${relativePath} exists`);
    return '';
  }
  return readFileSync(absolutePath, 'utf8');
}

function check(condition, label) {
  if (condition) passed.push(label);
  else failures.push(label);
}

const leaflet = source('src/map/leaflet-map.tsx');
const screen = source('app/(tabs)/map.tsx');
const card = source('src/map/location-card.tsx');

check(leaflet.includes("const LEAFLET_VERSION = '1.9.4'"), 'Map keeps the web Leaflet version');
check(leaflet.includes("const CLUSTER_VERSION = '1.5.3'"), 'Map loads the web marker-cluster version');
check(leaflet.includes('basemaps.cartocdn.com/dark_all'), 'Map uses the same CARTO dark tiles as web');
check(leaflet.includes('L.markerClusterGroup'), 'Map uses Leaflet MarkerCluster instead of manual cluster replacement');
check(leaflet.includes('animateAddingMarkers: true'), 'Cluster additions keep animated transitions');
check(leaflet.includes('maxClusterRadius: 46'), 'Cluster radius matches web behavior');
check(leaflet.includes('tatzo-cluster-mixed'), 'Mixed Tatzo cluster styling is present');
check(leaflet.includes('tatzo-user-location'), 'Map renders the real user-location pulse');
check(screen.includes("type SheetMode = 'search' | 'filters' | 'list'"), 'Mobile map has web-style search/filter/list sheet modes');
check(screen.includes('styles.mapDock'), 'Mobile map exposes controls from the bottom dock');
check(screen.includes('<Modal'), 'Mobile map uses a bottom-sheet modal instead of the old stacked toolbar');
check(screen.includes("setSheetMode('filters')"), 'Filters are accessible from the bottom map controls');
check(screen.includes("pathname: '/map/add-location'"), 'Add-location flow remains available');
check(card.includes("backgroundColor: 'rgba(7, 19, 23, 0.96)'"), 'Location cards use the web map surface');
check(card.includes('statusVerified'), 'Verified/unclaimed map status styling is preserved');

console.log('\nTatzo mobile map parity check');
for (const label of passed) console.log(`  ✓ ${label}`);
for (const label of failures) console.error(`  ✗ ${label}`);
console.log(`\n${passed.length} passed, ${failures.length} failure(s).`);

if (failures.length) process.exit(1);

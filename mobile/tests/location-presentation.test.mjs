import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapClusterTone, mapLocationPresentation, mapMarkerSignature } from '../src/map/location-presentation.ts';

const studio = {
  marker_id: 'location:42', location_id: 42, kind: 'studio', name: 'MedusaTattoo',
  status: 'claimed', username: 'medusatattoo', tag: 'medusatattoo',
  latitude: 48.8, longitude: 2.3, claimable: false, claim_status: null, can_book: false,
};
const unclaimed = { ...studio, status: 'unclaimed', username: null, tag: null, claimable: true };
const artist = { ...studio, kind: 'artist', status: 'verified', can_book: true };

test('claimed MedusaTattoo shows an owner profile and claimed badge without another claim or artist booking', () => {
  const result = mapLocationPresentation(studio);
  assert.equal(result.statusKey, 'mapClaimedStudio');
  assert.equal(result.markerKind, 'claimed');
  assert.equal(result.connected, true);
  assert.equal(result.canOpenProfile, true);
  assert.equal(result.showClaim, false);
  assert.equal(result.canClaim, false);
  assert.equal(result.canBook, false);
  assert.equal(result.artist, false);
  assert.equal(studio.kind, 'studio');
});

test('claimed status remains authoritative when owner details are absent', () => {
  const result = mapLocationPresentation({ ...studio, username: null });
  assert.equal(result.statusKey, 'mapClaimedStudio');
  assert.equal(result.canOpenProfile, false);
  assert.equal(result.showClaim, false);
});

test('an existing owner overrides stale unclaimed and pending flags', () => {
  const result = mapLocationPresentation({ ...unclaimed, username: 'medusatattoo', claim_status: 'submitted' });
  assert.equal(result.statusKey, 'mapClaimedStudio');
  assert.equal(result.canOpenProfile, true);
  assert.equal(result.canClaim, false);
  assert.equal(result.showClaim, false);
  assert.equal(result.claimPending, false);
});

test('unowned imported and unclaimed studios remain claimable', () => {
  for (const status of ['imported', 'unclaimed']) {
    const result = mapLocationPresentation({ ...unclaimed, status });
    assert.equal(result.statusKey, 'mapUnclaimedStudio');
    assert.equal(result.connected, false);
    assert.equal(result.showClaim, true);
    assert.equal(result.canClaim, true);
    assert.equal(result.canOpenProfile, false);
  }
});

test('an active claim remains visible but cannot be submitted twice', () => {
  for (const claim_status of ['submitted', 'under_review']) {
    const result = mapLocationPresentation({ ...unclaimed, claim_status });
    assert.equal(result.claimPending, true);
    assert.equal(result.showClaim, true);
    assert.equal(result.canClaim, false);
    assert.equal(result.connected, false);
  }
});

test('claimability is explicit and a rejected claim can be retried if permitted', () => {
  assert.equal(mapLocationPresentation({ ...unclaimed, claimable: false }).showClaim, false);
  assert.equal(mapLocationPresentation({ ...unclaimed, claim_status: 'rejected' }).canClaim, true);
});

test('verified artist profile and permitted booking remain available', () => {
  const result = mapLocationPresentation(artist);
  assert.equal(result.statusKey, 'mapVerifiedArtist');
  assert.equal(result.canOpenProfile, true);
  assert.equal(result.canBook, true);
  assert.equal(result.showClaim, false);
  assert.equal(mapLocationPresentation({ ...artist, can_book: false }).canBook, false);
  assert.equal(mapLocationPresentation({ ...artist, username: null }).canBook, false);
  assert.equal(mapLocationPresentation({ ...studio, can_book: true }).canBook, false);
});

test('verified studios without an owner payload are still connected and cannot be claimed again', () => {
  const result = mapLocationPresentation({ ...unclaimed, status: 'verified' });
  assert.equal(result.connected, true);
  assert.equal(result.glyph, '✓');
  assert.equal(result.canOpenProfile, false);
  assert.equal(result.showClaim, false);
  assert.equal(result.canBook, false);
});

test('the managed-studio pin matches the verified web-map pin', () => {
  assert.equal(mapLocationPresentation(studio).glyph, '✓');
  assert.equal(mapLocationPresentation(unclaimed).glyph, '•');
});

test('cluster colors reflect ownership while studio entity types stay intact', () => {
  assert.equal(mapClusterTone([studio]), 'connected');
  assert.equal(mapClusterTone([studio, artist]), 'connected');
  assert.equal(mapClusterTone([unclaimed, unclaimed]), 'unclaimed');
  assert.equal(mapClusterTone([studio, unclaimed]), 'mixed');
  assert.equal(studio.kind, 'studio');
});

test('approval refreshes an existing marker and cluster even without a coordinate change', () => {
  assert.notEqual(mapMarkerSignature(unclaimed, false), mapMarkerSignature(studio, false));
  assert.notEqual(mapMarkerSignature(unclaimed, false), mapMarkerSignature({ ...unclaimed, status: 'claimed' }, false));
  assert.notEqual(mapMarkerSignature(studio, false), mapMarkerSignature(studio, true));
  assert.equal(mapMarkerSignature(studio, false), mapMarkerSignature({ ...studio }, false));
});

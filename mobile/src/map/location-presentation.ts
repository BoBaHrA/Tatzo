import type { MapLocationMarker } from '@/api/types';

type OwnershipMarker = Pick<MapLocationMarker,
  'kind' | 'status' | 'username' | 'claim_status' | 'claimable' | 'can_book'>;

/** Entity kind and studio ownership are independent API fields. */
export function mapLocationPresentation(marker: OwnershipMarker) {
  const artist = marker.kind === 'artist';
  // Studio usernames belong to the owner; retain that evidence if status lags.
  const claimed = !artist && (marker.status === 'claimed' || marker.status === 'verified' || Boolean(marker.username));
  const connected = artist || claimed;
  const claimPending = !connected
    && (marker.claim_status === 'submitted' || marker.claim_status === 'under_review');
  return {
    artist,
    connected,
    markerKind: artist ? 'verified' : claimed ? 'claimed' : 'unclaimed',
    glyph: connected ? '✓' : '•',
    statusKey: artist ? 'mapVerifiedArtist' as const
      : claimed ? 'mapClaimedStudio' as const : 'mapUnclaimedStudio' as const,
    canOpenProfile: connected && Boolean(marker.username),
    canBook: artist && Boolean(marker.username) && marker.can_book,
    claimPending,
    showClaim: !connected && (marker.claimable || claimPending),
    canClaim: !connected && !claimPending && marker.claimable,
  };
}

export function mapClusterTone(markers: OwnershipMarker[]): 'connected' | 'unclaimed' | 'mixed' {
  const connected = markers.some((marker) => mapLocationPresentation(marker).connected);
  const unclaimed = markers.some((marker) => !mapLocationPresentation(marker).connected);
  return connected && unclaimed ? 'mixed' : connected ? 'connected' : 'unclaimed';
}

/** Include ownership so approving a claim repaints an existing marker and its cluster. */
export function mapMarkerSignature(marker: MapLocationMarker, selected: boolean) {
  return JSON.stringify([
    marker.latitude, marker.longitude, marker.kind, marker.name,
    mapLocationPresentation(marker).markerKind, selected,
  ]);
}

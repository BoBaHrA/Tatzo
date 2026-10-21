import type {
  MapBookingMode,
  MapLocationsResponse,
  MapLocationMarker,
  MapMarkerKind,
  MapSubmissionResponse,
} from '@/api/types';
import type { AuthenticatedRequest } from '@/auth/auth-context';
import { fetchPublicProfile, fetchProfileStyleOptions } from '@/profile/profile-api';
import { withOwnerDetails } from './owner-details';


export type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type MapLocationQuery = {
  region: MapRegion;
  kind?: MapMarkerKind;
  styles?: string[];
  booking?: MapBookingMode[];
  search?: string;
  offset?: number;
  limit?: number;
};

export type PendingMapDocument = {
  uri: string;
  name: string;
  mimeType: string;
};

export type MapLocationRequestDraft = {
  name: string;
  city: string;
  country: string;
  fullAddress: string;
  websiteOrMapLink: string;
  phone: string;
  contactEmail: string;
  wantsOwnership: boolean;
  latitude: number | null;
  longitude: number | null;
  message: string;
  supportingFile?: PendingMapDocument | null;
};

export type MapLocationClaimDraft = {
  claimantName: string;
  contactEmail: string;
  relationToLocation: string;
  proof: string;
  message: string;
  proofDocument?: PendingMapDocument | null;
};

function documentBody(document: PendingMapDocument): Blob {
  return {
    uri: document.uri,
    name: document.name,
    type: document.mimeType || 'application/octet-stream',
  } as unknown as Blob;
}

function boundsForRegion(region: MapRegion) {
  const latitudeHalf = Math.min(90, Math.max(0.001, region.latitudeDelta)) / 2;
  const longitudeHalf = Math.min(359.999, Math.max(0.001, region.longitudeDelta)) / 2;
  const north = Math.min(90, region.latitude + latitudeHalf);
  const south = Math.max(-90, region.latitude - latitudeHalf);
  let east = region.longitude + longitudeHalf;
  let west = region.longitude - longitudeHalf;
  if (east > 180) east -= 360;
  if (west < -180) west += 360;
  return { north, south, east, west };
}

export function fetchMapLocations(
  request: AuthenticatedRequest,
  query: MapLocationQuery,
) {
  const bounds = boundsForRegion(query.region);
  const search = new URLSearchParams({
    north: bounds.north.toFixed(6),
    south: bounds.south.toFixed(6),
    east: bounds.east.toFixed(6),
    west: bounds.west.toFixed(6),
    limit: String(query.limit ?? 200),
    offset: String(query.offset ?? 0),
  });
  if (query.kind) search.set('types', query.kind);
  if (query.styles?.length) search.set('styles', query.styles.join(','));
  if (query.booking?.length) search.set('booking', query.booking.join(','));
  if (query.search?.trim()) search.set('q', query.search.trim());
  return request<MapLocationsResponse>(`/map/locations/?${search.toString()}`);
}

/** Reuse deployed profile APIs until map responses include owner presentation data. */
export async function enrichMapOwners(request: AuthenticatedRequest, markers: MapLocationMarker[], isCurrent: () => boolean) {
  const owners = [...new Set(markers.filter(marker => marker.kind === 'studio').map(marker => marker.username).filter((name): name is string => Boolean(name)))];
  const details = new Map<string, { profile: Awaited<ReturnType<typeof fetchPublicProfile>>; options: { value: string; label: string }[] }>();
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, owners.length) }, async () => {
    while (cursor < owners.length && isCurrent()) {
      const username = owners[cursor++];
      try {
        const profile = await fetchPublicProfile(request, username);
        if (!isCurrent()) return;
        const options = await fetchProfileStyleOptions(request, profile);
        if (isCurrent()) details.set(username.toLowerCase(), { profile, options });
      } catch { /* Keep the map response when optional owner details are unavailable. */ }
    }
  }));
  return markers.map(marker => {
    const owner = marker.username ? details.get(marker.username.toLowerCase()) : undefined;
    return owner ? withOwnerDetails(marker, owner.profile, owner.options.map(option => option.label), owner.options.map(option => option.value)) : marker;
  });
}

export function submitMapLocation(
  request: AuthenticatedRequest,
  draft: MapLocationRequestDraft,
) {
  const body = new FormData();
  body.append('name', draft.name);
  body.append('city', draft.city);
  body.append('country', draft.country);
  body.append('full_address', draft.fullAddress);
  body.append('website_or_map_link', draft.websiteOrMapLink);
  body.append('phone', draft.phone);
  body.append('contact_email', draft.contactEmail);
  body.append('wants_ownership', draft.wantsOwnership ? 'true' : 'false');
  body.append('message', draft.message);
  if (draft.latitude !== null && draft.longitude !== null) {
    body.append('latitude', draft.latitude.toFixed(6));
    body.append('longitude', draft.longitude.toFixed(6));
  }
  if (draft.supportingFile) {
    body.append('supporting_file', documentBody(draft.supportingFile));
  }
  return request<MapSubmissionResponse>('/map/locations/request/', {
    method: 'POST',
    body,
  });
}

export function submitMapLocationClaim(
  request: AuthenticatedRequest,
  locationId: number,
  draft: MapLocationClaimDraft,
) {
  const body = new FormData();
  body.append('claimant_name', draft.claimantName);
  body.append('contact_email', draft.contactEmail);
  body.append('relation_to_location', draft.relationToLocation);
  body.append('proof', draft.proof);
  body.append('message', draft.message);
  if (draft.proofDocument) {
    body.append('proof_document', documentBody(draft.proofDocument));
  }
  return request<MapSubmissionResponse>(
    `/map/locations/${locationId}/claim/`,
    { method: 'POST', body },
  );
}

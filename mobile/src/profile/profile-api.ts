import type {
  ProfileBlockResult,
  ProfileFollowResult,
  PublicProfile,
} from '@/api/types';
import type { AuthenticatedRequest } from '@/auth/auth-context';
import type { ProfileContentResponse, ProfileContentTab } from './profile-types';
import { fetchArtistBookingPreferences } from '@/artist-dashboard/artist-dashboard-api';
import { fetchBookingConfig } from '@/booking/booking-api';


export function fetchPublicProfile(
  request: AuthenticatedRequest,
  username: string,
): Promise<PublicProfile> {
  return request<PublicProfile>(`/profiles/${encodeURIComponent(username)}/`);
}

/** Read existing artist selections, never the booking form's default list as specialties. */
export async function fetchProfileStyleOptions(request: AuthenticatedRequest, profile: PublicProfile): Promise<{ value: string; label: string }[]> {
  if (profile.account_type !== 'tattoo_artist') return [];
  try {
    if (profile.is_self && profile.is_verified_artist) {
      const preferences = await fetchArtistBookingPreferences(request);
      const labels = new Map(preferences.style_options.map(option => [option.value, option.label]));
      return [...new Set(preferences.active_styles)].map(value => ({ value, label: labels.get(value) ?? value }));
    }
    const [discovery, booking] = await Promise.all([
      request<{ results: { id: number; kind: string; styles: string[] }[] }>(`/search/?discovery=1&type=artists&q=${encodeURIComponent(profile.username)}`),
      profile.is_verified_artist ? fetchBookingConfig(request, profile.username).catch(() => null) : Promise.resolve(null),
    ]);
    const artist = discovery.results.find(item => item.kind === 'artist' && item.id === profile.id);
    return [...new Set(artist?.styles ?? [])].map(value => ({ value, label: booking?.option_labels.styles[value] ?? value.replace(/_/g, ' ') }));
  } catch {
    // A failed optional request must not hide a profile or manufacture specialties.
    return [];
  }
}

export async function fetchProfileStyles(request: AuthenticatedRequest, profile: PublicProfile): Promise<string[]> {
  return (await fetchProfileStyleOptions(request, profile)).map(option => option.label);
}

export function fetchProfileContent(
  request: AuthenticatedRequest,
  username: string,
  tab: ProfileContentTab,
): Promise<ProfileContentResponse> {
  return request<ProfileContentResponse>(
    `/profiles/${encodeURIComponent(username)}/content/?tab=${encodeURIComponent(tab)}`,
  );
}

export function toggleProfileFollow(
  request: AuthenticatedRequest,
  username: string,
): Promise<ProfileFollowResult> {
  return request<ProfileFollowResult>(
    `/profiles/${encodeURIComponent(username)}/follow/`,
    { method: 'POST' },
  );
}

export function toggleProfileBlock(
  request: AuthenticatedRequest,
  username: string,
): Promise<ProfileBlockResult> {
  return request<ProfileBlockResult>(
    `/profiles/${encodeURIComponent(username)}/block/`,
    { method: 'POST' },
  );
}

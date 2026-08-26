import type {
  ProfileBlockResult,
  ProfileFollowResult,
  PublicProfile,
} from '@/api/types';
import type { AuthenticatedRequest } from '@/auth/auth-context';
import type { ProfileContentResponse, ProfileContentTab } from './profile-types';


export function fetchPublicProfile(
  request: AuthenticatedRequest,
  username: string,
): Promise<PublicProfile> {
  return request<PublicProfile>(`/profiles/${encodeURIComponent(username)}/`);
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

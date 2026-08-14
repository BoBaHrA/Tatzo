import type { ProfileFollowResult, PublicProfile } from '@/api/types';
import type { AuthenticatedRequest } from '@/auth/auth-context';


export function fetchPublicProfile(
  request: AuthenticatedRequest,
  username: string,
): Promise<PublicProfile> {
  return request<PublicProfile>(`/profiles/${encodeURIComponent(username)}/`);
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

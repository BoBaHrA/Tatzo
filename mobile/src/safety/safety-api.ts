import type { BlockedUsersResponse, ProfileBlockResult } from '@/api/types';
import type { AuthenticatedRequest } from '@/auth/auth-context';


export function fetchBlockedUsers(
  request: AuthenticatedRequest,
): Promise<BlockedUsersResponse> {
  return request<BlockedUsersResponse>('/me/blocked-users/');
}

export function unblockUser(
  request: AuthenticatedRequest,
  username: string,
): Promise<ProfileBlockResult> {
  return request<ProfileBlockResult>(
    `/profiles/${encodeURIComponent(username)}/block/`,
    { method: 'POST' },
  );
}

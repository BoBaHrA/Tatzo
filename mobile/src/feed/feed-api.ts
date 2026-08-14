import type {
  FeedBookmarkResult,
  FeedLikeResult,
  FeedPage,
} from '@/api/types';
import type { AuthenticatedRequest } from '@/auth/auth-context';


export function fetchFeed(
  request: AuthenticatedRequest,
  cursor?: string | null,
): Promise<FeedPage> {
  const cursorQuery = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
  return request<FeedPage>(`/feed/?limit=10${cursorQuery}`);
}

export function toggleFeedLike(
  request: AuthenticatedRequest,
  postId: number,
): Promise<FeedLikeResult> {
  return request<FeedLikeResult>(`/feed/${postId}/like/`, { method: 'POST' });
}

export function toggleFeedBookmark(
  request: AuthenticatedRequest,
  postId: number,
): Promise<FeedBookmarkResult> {
  return request<FeedBookmarkResult>(`/feed/${postId}/bookmark/`, {
    method: 'POST',
  });
}

import type {
  FeedBookmarkResult,
  FeedLikeResult,
  FeedPage,
  FeedPost,
  FeedReportResult,
  ReportReason,
} from '@/api/types';
import type { AuthenticatedRequest } from '@/auth/auth-context';


export function fetchFeed(
  request: AuthenticatedRequest,
  cursor?: string | null,
): Promise<FeedPage> {
  const cursorQuery = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
  return request<FeedPage>(`/feed/?limit=10${cursorQuery}`);
}

export function fetchFeedPost(
  request: AuthenticatedRequest,
  postId: number,
): Promise<FeedPost> {
  return request<FeedPost>(`/feed/${postId}/`);
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

export function reportFeedPost(
  request: AuthenticatedRequest,
  postId: number,
  reason: ReportReason,
): Promise<FeedReportResult> {
  return request<FeedReportResult>(`/feed/${postId}/report/`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

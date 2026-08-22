import type {
  CommentCreateResult,
  CommentDeleteResult,
  CommentLikeResult,
  CommentPage,
  CommentReplyPage,
  CommentReportResult,
  CommentUpdateResult,
  ReportReason,
} from '@/api/types';
import type { AuthenticatedRequest } from '@/auth/auth-context';


function cursorQuery(cursor?: string | null): string {
  return cursor ? `?limit=15&cursor=${encodeURIComponent(cursor)}` : '?limit=15';
}

export function fetchPostComments(
  request: AuthenticatedRequest,
  postId: number,
  cursor?: string | null,
): Promise<CommentPage> {
  return request<CommentPage>(`/feed/${postId}/comments/${cursorQuery(cursor)}`);
}

export function fetchCommentReplies(
  request: AuthenticatedRequest,
  commentId: number,
  cursor?: string | null,
): Promise<CommentReplyPage> {
  return request<CommentReplyPage>(`/comments/${commentId}/replies/${cursorQuery(cursor)}`);
}

export function createPostComment(
  request: AuthenticatedRequest,
  postId: number,
  content: string,
  parentId?: number | null,
): Promise<CommentCreateResult> {
  return request<CommentCreateResult>(`/feed/${postId}/comments/`, {
    method: 'POST',
    body: JSON.stringify({ content, parent_id: parentId ?? null }),
  });
}

export function updatePostComment(
  request: AuthenticatedRequest,
  commentId: number,
  content: string,
): Promise<CommentUpdateResult> {
  return request<CommentUpdateResult>(`/comments/${commentId}/`, {
    method: 'PATCH',
    body: JSON.stringify({ content }),
  });
}

export function deletePostComment(
  request: AuthenticatedRequest,
  commentId: number,
): Promise<CommentDeleteResult> {
  return request<CommentDeleteResult>(`/comments/${commentId}/`, {
    method: 'DELETE',
  });
}

export function toggleCommentLike(
  request: AuthenticatedRequest,
  commentId: number,
): Promise<CommentLikeResult> {
  return request<CommentLikeResult>(`/comments/${commentId}/like/`, {
    method: 'POST',
  });
}

export function reportComment(
  request: AuthenticatedRequest,
  commentId: number,
  reason: ReportReason,
): Promise<CommentReportResult> {
  return request<CommentReportResult>(`/comments/${commentId}/report/`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

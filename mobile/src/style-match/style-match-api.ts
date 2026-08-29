import type {
  StyleMatchCard,
  StyleMatchOverview,
  StyleMatchReaction,
  StyleMatchReactionResult,
  StyleMatchResult,
  StyleMatchSession,
} from '@/api/types';
import type { AuthenticatedRequest } from '@/auth/auth-context';


type StyleMatchPreviewResponse = {
  results: StyleMatchCard[];
};

export function fetchStyleMatchOverview(
  request: AuthenticatedRequest,
): Promise<StyleMatchOverview> {
  return request<StyleMatchOverview>('/style-match/');
}

export function fetchStyleMatchPreview(
  request: AuthenticatedRequest,
): Promise<StyleMatchPreviewResponse> {
  return request<StyleMatchPreviewResponse>('/style-match/preview/');
}

export function startStyleMatch(
  request: AuthenticatedRequest,
): Promise<StyleMatchSession> {
  return request<StyleMatchSession>('/style-match/', { method: 'POST' });
}

export function reactToStyleMatch(
  request: AuthenticatedRequest,
  sessionId: string,
  cardId: number,
  action: StyleMatchReaction | 'save',
  saved?: boolean,
): Promise<StyleMatchReactionResult> {
  return request<StyleMatchReactionResult>(
    `/style-match/${encodeURIComponent(sessionId)}/react/`,
    {
      method: 'POST',
      body: JSON.stringify({
        action,
        card_id: cardId,
        ...(action === 'save' ? { saved } : {}),
      }),
    },
  );
}

export function fetchStyleMatchResult(
  request: AuthenticatedRequest,
  sessionId: string,
): Promise<StyleMatchResult> {
  return request<StyleMatchResult>(
    `/style-match/${encodeURIComponent(sessionId)}/result/`,
  );
}

import type {
  FeedPost,
  PortfolioPage,
  PortfolioWork,
} from '@/api/types';
import type { AuthenticatedRequest } from '@/auth/auth-context';


export type PendingPublishMedia = {
  key: string;
  uri: string;
  name: string;
  mimeType: string;
  type: 'image' | 'video';
};

export type PostDraft = {
  content: string;
  location: string;
  visibility: FeedPost['visibility'];
  disableComments: boolean;
  layout: FeedPost['layout'];
  media: PendingPublishMedia[];
};

export type PortfolioDraft = {
  image: PendingPublishMedia;
  title: string;
  description: string;
  style: string;
  bodyPlacement: string;
};

export type PortfolioUpdate = Pick<
  PortfolioDraft,
  'title' | 'description' | 'style' | 'bodyPlacement'
>;

function uploadBody(media: PendingPublishMedia): Blob {
  return {
    uri: media.uri,
    name: media.name,
    type: media.mimeType,
  } as unknown as Blob;
}

export function createPost(
  request: AuthenticatedRequest,
  draft: PostDraft,
): Promise<FeedPost> {
  const body = new FormData();
  body.append('content', draft.content);
  body.append('location', draft.location);
  body.append('visibility', draft.visibility);
  body.append('disable_comments', String(draft.disableComments));
  body.append('layout', draft.media.length > 1 ? draft.layout : 'grid');
  draft.media.forEach((item) => body.append('media', uploadBody(item)));
  return request<FeedPost>('/me/posts/', { method: 'POST', body });
}

export function deletePost(
  request: AuthenticatedRequest,
  postId: number,
): Promise<void> {
  return request<void>(`/me/posts/${postId}/`, { method: 'DELETE' });
}

export function fetchPortfolio(
  request: AuthenticatedRequest,
): Promise<PortfolioPage> {
  return request<PortfolioPage>('/me/portfolio/');
}

export function createPortfolioWork(
  request: AuthenticatedRequest,
  draft: PortfolioDraft,
): Promise<PortfolioWork> {
  const body = new FormData();
  body.append('image', uploadBody(draft.image));
  body.append('title', draft.title);
  body.append('description', draft.description);
  body.append('style', draft.style);
  body.append('body_placement', draft.bodyPlacement);
  return request<PortfolioWork>('/me/portfolio/', { method: 'POST', body });
}

export function updatePortfolioWork(
  request: AuthenticatedRequest,
  workId: number,
  update: PortfolioUpdate,
): Promise<PortfolioWork> {
  return request<PortfolioWork>(`/me/portfolio/${workId}/`, {
    method: 'PATCH',
    body: JSON.stringify({
      title: update.title,
      description: update.description,
      style: update.style,
      body_placement: update.bodyPlacement,
    }),
  });
}

export function deletePortfolioWork(
  request: AuthenticatedRequest,
  workId: number,
): Promise<void> {
  return request<void>(`/me/portfolio/${workId}/`, { method: 'DELETE' });
}

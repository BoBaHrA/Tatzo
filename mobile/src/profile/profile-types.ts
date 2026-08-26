import type { FeedPost } from '@/api/types';

export type ProfileContentTab = 'posts' | 'liked';

export type ProfileContentResponse = {
  tab: ProfileContentTab;
  can_view_liked: boolean;
  count: number;
  results: FeedPost[];
};

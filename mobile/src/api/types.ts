export type AccountType = 'regular' | 'tattoo_artist';

export type TatzoUser = {
  id: number;
  username: string;
  email: string;
  account_type: AccountType;
  tag: string | null;
  bio: string | null;
  timezone: string;
  show_liked_posts: boolean;
  is_email_verified: boolean;
  verification_status: string;
  is_verified_artist: boolean;
  is_staff: boolean;
  profile_image_url: string | null;
};

export type TokenPair = {
  access: string;
  refresh: string;
};

export type LoginResponse = TokenPair & {
  user: TatzoUser;
};

export type RegistrationPayload = {
  username: string;
  email: string;
  password: string;
  account_type: AccountType;
  accept_terms: boolean;
};

export type ProfileUpdate = Partial<
  Pick<TatzoUser, 'username' | 'tag' | 'bio' | 'timezone' | 'show_liked_posts'>
>;

export type FeedAuthor = {
  id: number;
  username: string;
  tag: string | null;
  is_verified_artist: boolean;
  profile_image_url: string | null;
};

export type FeedMedia = {
  id: number;
  type: 'image' | 'video';
  url: string;
  order: number;
};

export type FeedPost = {
  id: number;
  author: FeedAuthor;
  content: string;
  created_at: string;
  disable_comments: boolean;
  is_ad: boolean;
  visibility: 'public' | 'followers' | 'private';
  location: string;
  layout: 'grid' | 'carousel';
  media: FeedMedia[];
  likes_count: number;
  comments_count: number;
  is_liked: boolean;
  is_bookmarked: boolean;
  is_owned: boolean;
};

export type FeedPage = {
  next_cursor: string | null;
  has_more: boolean;
  results: FeedPost[];
};

export type FeedLikeResult = {
  liked: boolean;
  likes_count: number;
};

export type FeedBookmarkResult = {
  bookmarked: boolean;
};

export type PortfolioWork = {
  id: number;
  title: string;
  description: string;
  style: string;
  body_placement: string;
  created_at: string;
  image_url: string | null;
};

export type PublicProfile = {
  id: number;
  username: string;
  tag: string | null;
  bio: string | null;
  account_type: AccountType;
  is_verified_artist: boolean;
  profile_image_url: string | null;
  followers_count: number;
  following_count: number;
  posts_count: number;
  portfolio_works_count: number;
  is_following: boolean;
  is_self: boolean;
  portfolio: PortfolioWork[];
  recent_posts: FeedPost[];
};

export type ProfileFollowResult = {
  is_following: boolean;
  followers_count: number;
  following_count: number;
};

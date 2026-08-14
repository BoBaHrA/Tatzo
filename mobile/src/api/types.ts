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

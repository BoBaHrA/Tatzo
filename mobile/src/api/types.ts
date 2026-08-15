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
  is_reported: boolean;
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

export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'hate_or_violence'
  | 'sexual_content'
  | 'other';

export type FeedReportResult = {
  reported: boolean;
  created: boolean;
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

export type ProfileBlockResult = {
  is_blocked: boolean;
};

export type BlockedUser = {
  id: number;
  username: string;
  tag: string | null;
  is_verified_artist: boolean;
  profile_image_url: string | null;
};

export type BlockedUsersResponse = {
  results: BlockedUser[];
};

export type MapMarkerKind = 'artist' | 'studio';
export type MapBookingMode = 'accepting' | 'online' | 'in_person';

export type MapLocationMarker = {
  marker_id: string;
  location_id: number;
  kind: MapMarkerKind;
  name: string;
  tag: string | null;
  username: string | null;
  avatar_url: string | null;
  address: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  status: string;
  styles: string[];
  booking_modes: MapBookingMode[];
  can_book: boolean;
  portfolio_count: number;
  website: string | null;
  phone: string | null;
  claimable: boolean;
  claim_status: string | null;
};

export type MapLocationsResponse = {
  results: MapLocationMarker[];
  count: number;
  total: number;
  has_more: boolean;
  next_offset: number | null;
  viewport: {
    artists: number;
    studios: number;
  };
  filters: {
    styles: string[];
    booking: MapBookingMode[];
  };
  capabilities: {
    availability: boolean;
    distance: boolean;
    rating: boolean;
    price: boolean;
  };
};

export type MapSubmissionResponse = {
  id: number;
  status: string;
  detail: string;
};

export type ChatUser = {
  id: number;
  username: string;
  tag: string | null;
  is_verified_artist: boolean;
  profile_image_url: string | null;
};

export type ChatAttachment = {
  id: number;
  type: 'image' | 'video' | 'file';
  name: string;
  content_type: string;
  url: string;
};

export type ChatMessage = {
  id: number;
  sender: ChatUser;
  is_mine: boolean;
  content: string;
  is_read: boolean;
  is_edited: boolean;
  created_at: string;
  edited_at: string | null;
  attachments: ChatAttachment[];
};

export type ChatThreadSummary = {
  id: number;
  other_user: ChatUser;
  last_message: ChatMessage | null;
  unread_count: number;
  last_read_message_id: number | null;
  updated_at: string;
  is_blocked_by_me: boolean;
  has_blocked_me: boolean;
  chat_blocked: boolean;
};

export type ChatListResponse = {
  unread_count: number;
  results: ChatThreadSummary[];
};

export type ChatThreadDetail = ChatThreadSummary & {
  messages: ChatMessage[];
  has_more: boolean;
};

export type BookingType =
  | 'tattoo_session'
  | 'consultation'
  | 'online_consultation';

export type AppointmentStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'completed'
  | 'needs_references'
  | 'consultation_required';

export type AppointmentAction =
  | 'accept'
  | 'decline'
  | 'need_references'
  | 'consultation_required'
  | 'complete'
  | 'cancel';

export type BookingUser = {
  id: number;
  username: string;
  tag: string | null;
  is_verified_artist: boolean;
  profile_image_url: string | null;
};

export type BookingScheduleDay = {
  open: string | null;
  close: string | null;
  breaks: [string, string][];
};

export type BookingOccupiedSlot = {
  date: string;
  start_time: string;
  end_time: string;
};

export type BookingConfig = {
  artist: BookingUser;
  available: boolean;
  unavailable_code: string | null;
  unavailable_reason: string | null;
  artist_timezone: string;
  today: string;
  settings: {
    booking_status: string;
    minimum_notice_hours: number;
    maximum_booking_window_days: number;
    slot_step_minutes: number;
    default_session_minutes: number;
    maximum_session_hours: number;
    consultation_required_before_booking: boolean;
    consultation_price: number;
    online_consultation_price: number;
    reference_images_required: boolean;
    minimum_reference_images: number;
    maximum_reference_images: number;
    deposit_required: boolean;
    deposit_amount: number;
    booking_workflow: 'manual' | 'auto';
  };
  booking_types: BookingType[];
  durations: number[];
  styles: string[];
  placements: string[];
  sizes: string[];
  budgets: string[];
  option_labels: {
    booking_types: Record<string, string>;
    styles: Record<string, string>;
    placements: Record<string, string>;
    sizes: Record<string, string>;
    budgets: Record<string, string>;
  };
  schedule: Record<string, BookingScheduleDay>;
  vacations: string[];
  occupied_slots: BookingOccupiedSlot[];
  booked_minutes_by_date: Record<string, number>;
};

export type AppointmentReference = {
  id: number;
  name: string;
  url: string;
  order: number;
};

export type Appointment = {
  id: number;
  role: 'artist' | 'client';
  artist: BookingUser;
  client: BookingUser;
  other_user: BookingUser;
  booking_type: BookingType;
  booking_type_label: string;
  status: AppointmentStatus;
  status_label: string;
  date: string;
  start_time: string;
  end_time: string | null;
  session_length_minutes: number | null;
  client_comfort_limit: string;
  styles: string[];
  styles_label: string;
  placement: string;
  placement_label: string;
  size: string;
  size_label: string;
  budget: string;
  budget_label: string;
  description: string;
  consultation_already_completed: boolean;
  consultation_note: string;
  artist_note: string;
  created_at: string;
  updated_at: string;
  responded_at: string | null;
  reference_images: AppointmentReference[];
  reference_limit: number;
  can_add_references: boolean;
  available_actions: AppointmentAction[];
};

export type AppointmentListResponse = {
  attention_count: number;
  results: Appointment[];
};

export type ArtistBookingStatus =
  | 'open'
  | 'paused'
  | 'vacation'
  | 'fully_booked'
  | 'consultation_only'
  | 'emergency';

export type ArtistDashboardSettings = {
  booking_status: ArtistBookingStatus;
  booking_status_label: string;
  booking_status_options: { value: ArtistBookingStatus; label: string }[];
  bookings_enabled: boolean;
  booking_workflow: 'manual' | 'auto';
  maximum_session_hours: number;
  minimum_notice_hours: number;
  maximum_booking_window_days: number;
};

export type ArtistScheduleDay = {
  weekday: number;
  is_closed: boolean;
  open_time: string | null;
  close_time: string | null;
  break_start: string | null;
  break_end: string | null;
};

export type ArtistWorkloadDay = {
  date: string;
  booked_minutes: number;
  capacity_minutes: number;
  percent: number;
  workload: 'empty' | 'light' | 'busy' | 'full' | 'closed' | 'time_off';
};

export type ArtistTimeOff = {
  id: number;
  date: string;
  reason: string;
};

export type ArtistBlockedPeriod = {
  id: number;
  event_type: 'blocked' | 'vacation';
  event_type_label: string;
  date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  title: string;
};

export type ArtistTimelineItem = {
  id: string;
  source: 'appointment' | 'calendar_event' | 'time_off';
  appointment_id: number | null;
  role: 'artist' | 'client';
  date: string;
  start_time: string | null;
  end_time: string | null;
  title: string;
  status: string;
  status_label: string;
  other_user: BookingUser | null;
};

export type ArtistDashboard = {
  artist_timezone: string;
  today: string;
  settings: ArtistDashboardSettings;
  stats: {
    today_sessions: number;
    pending_requests: number;
    upcoming_consultations: number;
    unread_messages: number;
  };
  schedule: ArtistScheduleDay[];
  workload: ArtistWorkloadDay[];
  time_off: ArtistTimeOff[];
  blocked_periods: ArtistBlockedPeriod[];
  timeline: ArtistTimelineItem[];
};

export type NotificationKind =
  | 'follow'
  | 'post_like'
  | 'post_comment'
  | 'comment_reply'
  | 'chat_message'
  | 'booking_request'
  | 'booking_update';

export type NotificationTarget =
  | { type: 'profile'; username: string }
  | { type: 'post'; id: number }
  | { type: 'appointment'; id: number }
  | { type: 'chat'; id: number }
  | { type: 'none' };

export type NotificationItem = {
  id: number;
  kind: NotificationKind;
  actor: FeedAuthor | null;
  target: NotificationTarget;
  preview: string;
  appointment_status: AppointmentStatus | null;
  appointment_status_label: string | null;
  appointment_date: string | null;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
};

export type NotificationPage = {
  unread_count: number;
  next_cursor: string | null;
  has_more: boolean;
  results: NotificationItem[];
};

export type NotificationCountResponse = {
  unread_count: number;
};

export type NotificationReadResponse = NotificationCountResponse & {
  id?: number;
  is_read?: boolean;
  updated?: number;
};

export type StyleMatchCard = {
  id: number;
  card_id: string;
  image_url: string;
  alt: string;
};

export type StyleMatchSession = {
  session_id: string;
  current_index: number;
  total: number;
  cards: StyleMatchCard[];
  current_saved: boolean;
};

export type StyleMatchStyle = {
  slug: string;
  label: string;
  score: number;
};

export type StyleMatchArtist = {
  username: string;
  image_url: string;
  location: string;
  top_style: string;
  score: number;
};

export type StyleMatchResult = {
  session_id: string;
  top_style: StyleMatchStyle;
  styles: StyleMatchStyle[];
  personality: {
    slug: string;
    label: string;
    description: string;
  };
  drawn_to: string[];
  tend_to_skip: string[];
  artists: StyleMatchArtist[];
  community_count: number;
  completed_count: number;
  saved_count: number;
  saved_cards: StyleMatchCard[];
  match_confidence: number;
};

export type StyleMatchOverview = {
  active_session: StyleMatchSession | null;
  latest_result: StyleMatchResult | null;
};

export type StyleMatchReaction = 'reject' | 'like' | 'favorite';

export type StyleMatchReactionResult = {
  completed: boolean;
  current_index: number;
  total: number;
  saved?: boolean;
  clarification?: boolean;
  cards?: StyleMatchCard[];
  result?: StyleMatchResult;
};

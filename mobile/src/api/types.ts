export type AccountType = 'regular' | 'tattoo_artist';

export type VerificationStatus =
  | 'not_submitted'
  | 'pending_documents'
  | 'pending_manual_review'
  | 'pending'
  | 'approved'
  | 'rejected';

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
  verification_status: VerificationStatus;
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

export type VerificationChoice = {
  value: string;
  label: string;
};

export type ArtistVerification = {
  account_type: AccountType;
  status: VerificationStatus;
  can_submit: boolean;
  selected_path: 'documents' | 'manual' | null;
  business_document_types: VerificationChoice[];
  id_document_types: VerificationChoice[];
  documents: {
    business_document_type: string;
    id_document_type: string;
    has_business_document: boolean;
    has_id_document: boolean;
  } | null;
  manual: {
    portfolio_link: string;
    social_link: string;
    city_country: string;
    explanation: string;
    has_extra_file: boolean;
    updated_at: string;
  } | null;
};

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

export type CommentItem = {
  id: number;
  author: FeedAuthor;
  content: string;
  created_at: string;
  parent_id: number | null;
  likes_count: number;
  replies_count: number;
  is_liked: boolean;
  is_reported: boolean;
  is_owned: boolean;
  is_post_owner: boolean;
};

export type CommentPage = {
  next_cursor: string | null;
  has_more: boolean;
  results: CommentItem[];
  comments_count: number;
  comments_enabled: boolean;
};

export type CommentReplyPage = {
  next_cursor: string | null;
  has_more: boolean;
  results: CommentItem[];
  root_id: number;
  replies_count: number;
};

export type CommentCreateResult = {
  comment: CommentItem;
  comments_count: number;
};

export type CommentUpdateResult = {
  comment: CommentItem;
};

export type CommentDeleteResult = {
  deleted: boolean;
  id: number;
  parent_id: number | null;
  comments_count: number;
};

export type CommentLikeResult = {
  liked: boolean;
  likes_count: number;
};

export type CommentReportResult = {
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

export type PortfolioPage = {
  count: number;
  results: PortfolioWork[];
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

export type HealthSafetyFieldKey =
  | 'bleeding_clotting_condition'
  | 'blood_thinning_medication'
  | 'diabetes_or_blood_sugar_condition'
  | 'relevant_skin_condition'
  | 'relevant_allergy_sensitivity'
  | 'immune_or_healing_condition';

export type HealthSafetyValues = Record<HealthSafetyFieldKey, boolean>;

export type HealthSafetyField = {
  key: HealthSafetyFieldKey;
  label: string;
};

export type HealthSafetyCopy = Record<string, string>;

export type BookingHealthSafety = {
  has_card: boolean;
  fields: HealthSafetyField[];
  copy: HealthSafetyCopy;
};

export type HealthSafetySharedAppointment = {
  appointment_id: number;
  artist_username: string;
  appointment_date: string;
  expires_on: string;
};

export type HealthSafetyCard = {
  has_card: boolean;
  values: HealthSafetyValues;
  other_relevant_information: string;
  declared_count: number;
  consent_version: string;
  consented_at: string | null;
  updated_at: string | null;
  shared_appointments: HealthSafetySharedAppointment[];
  fields: HealthSafetyField[];
  copy: HealthSafetyCopy;
};

export type HealthSafetyShareMode = 'none' | 'card' | 'quick';

export type AppointmentHealthSafety = {
  role: 'artist' | 'client';
  active: boolean;
  source: 'card' | 'quick' | null;
  shared: boolean;
  expires_on: string | null;
  fields: HealthSafetyField[];
  copy: HealthSafetyCopy;
  has_card?: boolean;
  can_share_card?: boolean;
  can_share_quick?: boolean;
  items: string[];
  other: string;
  confirmed_none: boolean;
};

export type ArtistPaymentState =
  | 'unavailable'
  | 'not_connected'
  | 'onboarding'
  | 'ready';

export type ArtistPaymentSettings = {
  configured: boolean;
  state: ArtistPaymentState;
  label: string;
  ready: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  deposit_required: boolean;
  deposit_amount: string;
  copy: Record<string, string>;
};

export type DepositStatus =
  | 'pending'
  | 'checkout_created'
  | 'paid'
  | 'failed'
  | 'refunded'
  | 'cancelled'
  | 'expired';

export type AppointmentDeposit =
  | { has_deposit: false }
  | {
      has_deposit: true;
      role: 'artist' | 'client';
      amount: string;
      currency: string;
      status: DepositStatus;
      message: string;
      can_pay: boolean;
      expires_at: string | null;
      action_label: string;
      copy: Record<string, string>;
    };

export type HealingStatus = 'active' | 'healed' | 'archived';

export type HealingRole = 'client' | 'artist';

export type HealingTaskSlug = 'wash' | 'moisturize' | 'sun' | 'friction';

export type HealingUser = BookingUser;

export type HealingJourneySummary = {
  id: string;
  appointment_id: number;
  title: string;
  role: HealingRole;
  status: HealingStatus;
  started_on: string;
  healed_on: string | null;
  current_day: number;
  tracking_percent: number;
  days_remaining: number;
  checkin_count: number;
  latest_photo_url: string | null;
  other_user: HealingUser;
  updated_at: string;
};

export type HealingEligibleAppointment = {
  id: number;
  title: string;
  date: string;
  artist: HealingUser;
};

export type HealingListResponse = {
  language: string;
  copy: Record<string, string>;
  journeys: HealingJourneySummary[];
  eligible_appointments: HealingEligibleAppointment[];
};

export type HealingCheckIn = {
  id: number;
  day_number: number;
  url: string;
  note: string;
  symptoms: string[];
  created_at: string;
  updated_at: string;
};

export type HealingTask = {
  slug: HealingTaskSlug;
  label: string;
  completed: boolean;
};

export type HealingTimelineItem = {
  key: string;
  day: number | null;
  phase: string;
  heading: string;
  body: string;
  tags: string[];
  active: boolean;
};

export type HealingAchievements = {
  first_checkin: boolean;
  seven_day_streak: boolean;
  three_checkins: boolean;
  fully_healed: boolean;
};

export type HealingDetail = HealingJourneySummary & {
  language: string;
  copy: Record<string, string>;
  timeline: {
    current: string;
    items: HealingTimelineItem[];
  };
  checkins: HealingCheckIn[];
  tasks: HealingTask[];
  routine_done_count: number;
  routine_total: number;
  routine_streak: number;
  artist_reply_count: number;
  symptom_options: { slug: string; label: string }[];
  chat_draft: string;
  can_edit: boolean;
  achievements: HealingAchievements;
};

export type HealingTaskUpdate = {
  slug: HealingTaskSlug;
  completed: boolean;
  done_count: number;
  total: number;
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
  health_safety: BookingHealthSafety;
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
  healing_journey: {
    id: string;
    status: HealingStatus;
    current_day: number;
  } | null;
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

export type ArtistBookingWorkflow = 'manual' | 'auto';

export type ArtistDashboardSettings = {
  booking_status: ArtistBookingStatus;
  booking_status_label: string;
  booking_status_options: { value: ArtistBookingStatus; label: string }[];
  bookings_enabled: boolean;
  booking_workflow: ArtistBookingWorkflow;
  maximum_session_hours: number;
  minimum_notice_hours: number;
  maximum_booking_window_days: number;
};

export type ArtistBookingPreferences = {
  booking_workflow: ArtistBookingWorkflow;
  booking_workflow_options: {
    value: ArtistBookingWorkflow;
    label: string;
  }[];
  minimum_notice_hours: number;
  maximum_booking_window_days: number;
  slot_step_minutes: number;
  slot_step_options: number[];
  default_session_minutes: number;
  session_duration_options: number[];
  maximum_session_hours: number;
  consultation_enabled: boolean;
  online_consultation_enabled: boolean;
  studio_consultation_enabled: boolean;
  consultation_required_before_booking: boolean;
  consultation_price: string;
  online_consultation_price: string;
  reference_images_required: boolean;
  minimum_reference_images: number;
  maximum_reference_images: number;
  active_styles: string[];
  style_options: { value: string; label: string }[];
  auto_response_booking_received: string;
  auto_response_consultation_required: string;
  auto_response_need_more_references: string;
  auto_response_booking_approved: string;
  auto_response_booking_declined: string;
  updated_at: string;
};

export type ArtistBookingPreferencesUpdate = Omit<
  ArtistBookingPreferences,
  | 'booking_workflow_options'
  | 'slot_step_options'
  | 'session_duration_options'
  | 'style_options'
  | 'updated_at'
>;

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

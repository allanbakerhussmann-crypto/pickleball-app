/**
 * Pickleball Director - Type Definitions V07.08
 *
 * UPDATED V07.08:
 * - Added CommsMessageType, CommsMessageStatus, CommsTemplateCategory union types
 * - Added CommsTemplate interface for comms_templates collection
 * - Added CommsQueueMessage interface for tournament comms_queue subcollection
 *
 * UPDATED V07.05:
 * - Added OrganizerAgreement interface for organizer agreement tracking
 * - Added organizerAgreement and organizerAgreementRequired to UserProfile
 *
 * UPDATED V07.04:
 * - Added DUPR-compliant scoring types (ScoreState, ScoreProposal, OfficialResult)
 * - Added DuprSubmissionData with batch tracking and retry fields
 * - Added TeamSnapshot for signer validation
 * - Added scoreLocked fields to Match for post-finalization protection
 * - Added migratedAt/migratedFromLegacy for one-time migration tracking
 *
 * UPDATED V06.00:
 * - Added Pool Play → Medals integration to DivisionFormat
 * - Added competitionFormat and poolPlayMedalsSettings fields
 * - Extended DivisionFormat with all tournament settings
 *
 * UPDATED V05.44:
 * - Removed postpone functionality (not needed)
 * - Added score verification types
 * - Added LeagueByePolicy interface (for Phase 3)
 * - Added LeaguePool interface (for Phase 2)
 * - Added LeagueBoxOverride interface (for Phase 4)
 * - Added byeCount to MemberStats
 * - Added poolId, poolName, lastBoxOverride to LeagueMember
 * - Added pool support to LeagueRoundRobinSettings
 *
 * FILE: src/types.ts
 */

import type { CompetitionFormat, PoolPlayMedalsSettings } from './types/formats';
import type { MatchParticipant, PlayType } from './types/game';

// ============================================
// TOURNAMENT FORMAT TYPES (V06.06)
// ============================================

export type SeedingMethod = 'dupr' | 'manual' | 'random';

export type TieBreaker =
  | 'wins'
  | 'head_to_head'
  | 'point_diff'
  | 'points_scored'
  | 'points_against'
  | 'games_won';

// ============================================
// PREMIER COURTS & FINALS SCHEDULING (V07.02)
// ============================================

/**
 * Court tier for premier court scheduling.
 * Finals are played on designated premier courts.
 */
export type CourtTier = 'gold' | 'plate' | 'semi' | 'regular';

/**
 * Match type for tournament matches.
 * Used to identify match stage for court allocation.
 */
export type TournamentMatchType =
  | 'pool'          // Pool stage match
  | 'bracket'       // Early bracket rounds (quarters, etc.)
  | 'semifinal'     // Semi-final match
  | 'final'         // Gold final (1st place main bracket)
  | 'bronze'        // Bronze match (3rd place main bracket)
  | 'plate_final'   // Plate final (1st place plate bracket)
  | 'plate_bronze'; // Plate 3rd place

/**
 * Tournament court settings for premier court scheduling.
 * Configures which courts are used for finals and semi-finals.
 */
export interface TournamentCourtSettings {
  /** Court ID for Gold final and Bronze match */
  goldCourtId?: string;
  /** Court ID for Plate final and Plate 3rd place */
  plateCourtId?: string;
  /** Court IDs preferred for semi-finals */
  semiCourtIds?: string[];
}

/**
 * Helper to calculate smart default court settings based on court count.
 * Returns optimal court tier assignments for the number of available courts.
 */
export function getDefaultCourtSettings(courts: Court[]): TournamentCourtSettings {
  const count = courts.length;
  const ids = courts.map(c => c.id);

  if (count === 0) {
    return {};
  }

  if (count === 1) {
    // Single court: everything on Court 1 (sequential)
    return {
      goldCourtId: ids[0],
      plateCourtId: ids[0],
      semiCourtIds: [ids[0]],
    };
  }

  if (count === 2) {
    // 2 courts: Gold on 1, Plate on 2, semis on both
    return {
      goldCourtId: ids[0],
      plateCourtId: ids[1],
      semiCourtIds: ids.slice(0, 2),
    };
  }

  // 3+ courts: Full tier system
  return {
    goldCourtId: ids[0],
    plateCourtId: ids[1],
    semiCourtIds: ids.slice(0, Math.min(4, count)),
  };
}

// ============================================
// USER & PROFILE TYPES
// ============================================

export type UserRole = 'player' | 'organizer' | 'app_admin';

// ============================================
// ORGANIZER AGREEMENT TYPES (V07.05)
// ============================================

/**
 * Organizer Agreement acceptance tracking.
 * Stores which version was accepted and all required confirmations.
 */
export interface OrganizerAgreement {
  version: string;                    // e.g., "V1.7"
  acceptedAt: number;                 // Timestamp when accepted
  acceptedCheckboxes: {
    mainAcceptance: boolean;          // Main agreement acceptance
    integrityConfirmation: boolean;   // Integrity confirmation
    privacyConfirmation: boolean;     // Privacy confirmation
  };
  ipAddress?: string;                 // Optional audit field
  userAgent?: string;                 // Optional audit field
}

export interface UserProfile {
  id?: string;
  odUserId: string;
  odAccountId?: string;
  odOrganizationId?: string;
  email: string;
  displayName: string;
  // Role management
  roles?: UserRole[];
  isAppAdmin?: boolean;
  isRootAdmin?: boolean;
  phone?: string;
  phoneVerified?: boolean;
  phoneVerifiedAt?: number;
  bio?: string;
  photoURL?: string;
  photoData?: string;  // Base64 photo data for display
  coverPhotoURL?: string;
  region?: string;
  country?: string;
  city?: string;
  skillLevel?: string;
  playStyle?: string;
  preferredHand?: string;
  achievements?: string[];
  socialLinks?: { platform: string; url: string }[];
  isProfileComplete?: boolean;
  createdAt: number;
  updatedAt: number;
  // Stripe Connect
  stripeConnectedAccountId?: string;
  stripeOnboardingComplete?: boolean;
  stripeChargesEnabled?: boolean;
  stripePayoutsEnabled?: boolean;
  // DUPR Integration
  duprId?: string;
  duprAccessToken?: string;
  duprRefreshToken?: string;
  duprTokenExpiresAt?: number;
  duprProfile?: {
    fullName?: string;
    imageUrl?: string;
    doublesRating?: number;
    singlesRating?: number;
    isVerified?: boolean;
    isPremium?: boolean;
  };
  // Organizer Request
  organizerRequestStatus?: 'none' | 'pending' | 'approved' | 'rejected';
  organizerRequestDate?: number;
  organizerApprovedDate?: number;
  isApprovedOrganizer?: boolean;
  // Organizer Agreement (V07.05)
  organizerAgreement?: OrganizerAgreement;
  organizerAgreementRequired?: boolean;  // True if organizer needs to re-accept agreement
  // Privacy Consent (V06.04)
  privacyPolicyConsentAt?: number;      // Timestamp when privacy policy accepted
  termsOfServiceConsentAt?: number;     // Timestamp when ToS accepted
  dataProcessingConsentAt?: number;     // Timestamp when data processing consented
  consentPolicyVersion?: string;        // Version of policy agreed to (e.g., "1.0")
  // Personal info for eligibility checks
  birthDate?: string;
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  // Direct rating fields (duplicated from duprProfile for convenience)
  duprDoublesRating?: number;
  duprSinglesRating?: number;
  ratingDoubles?: number;
  ratingSingles?: number;
  // Notification Preferences (V06.17)
  notificationPreferences?: NotificationPreferences;
}

// ============================================
// NOTIFICATION TYPES (V06.07)
// ============================================

export type NotificationType =
  | 'court_assignment'    // Assigned to a court, ready to play
  | 'match_result'        // Match completed
  | 'score_confirmation'  // Opponent submitted score, needs confirmation
  | 'registration'        // Registration confirmed, cancelled, etc.
  | 'partner_invite'      // Partner invite received
  | 'challenge'           // Ladder challenge received
  | 'general';            // General notification

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: number;
  /** Additional data for navigation/context */
  data?: {
    tournamentId?: string;
    leagueId?: string;
    meetupId?: string;
    matchId?: string;
    courtName?: string;
    inviteId?: string;
  };
}

// ============================================
// SMS NOTIFICATION TYPES (V06.17)
// ============================================

export type SMSNotificationType =
  | 'court_assignment'     // Assigned to a court, ready to play
  | 'match_result'         // Match completed
  | 'score_confirmation'   // Score needs confirmation
  | 'reminder'             // Event reminder
  | 'custom';              // Custom organizer message

export type SMSStatus = 'pending' | 'sent' | 'failed';

export interface SMSMessage {
  id: string;
  to: string;              // Phone number in E.164 format (+1XXXXXXXXXX)
  body: string;            // Message content
  createdAt: number;
  status: SMSStatus;
  twilioSid?: string;      // Twilio message SID after sending
  sentAt?: number;
  error?: string;          // Error message if failed

  // Optional metadata
  userId?: string;         // User who triggered the SMS
  eventType?: 'tournament' | 'league' | 'meetup';
  eventId?: string;
  matchId?: string;
  notificationType?: SMSNotificationType;
}

/** User notification preferences */
export interface NotificationPreferences {
  /** Receive in-app notifications */
  inApp: boolean;
  /** Receive SMS notifications (requires phone number) */
  sms: boolean;
  /** Receive email notifications */
  email: boolean;
  /** Specific notification types to receive */
  types: {
    courtAssignment: boolean;
    matchResult: boolean;
    scoreConfirmation: boolean;
    reminders: boolean;
    marketing: boolean;
  };
}

// ============================================
// CLUB TYPES
// ============================================

export interface Club {
  id: string;
  name: string;
  description: string;
  logoUrl?: string;
  bannerUrl?: string;
  location?: string;
  region?: string;
  country?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  socialLinks?: { platform: string; url: string }[];
  // Location/Address fields
  address?: string;
  city?: string;
  coordinates?: { lat: number; lng: number };
  ownerId: string;
  adminIds: string[];
  memberCount: number;
  isPublic: boolean;
  requiresApproval: boolean;
  createdAt: number;
  updatedAt: number;
  stripeConnectedAccountId?: string;
  stripeOnboardingComplete?: boolean;
  stripeChargesEnabled?: boolean;
  stripePayoutsEnabled?: boolean;
  bookingSettings?: ClubBookingSettings;
  courts?: ClubCourt[];
  // Additional fields for ClubDetailPage
  members?: string[];
  admins?: string[];
  createdByUserId?: string;
  // DUPR Integration
  duprClubId?: string;
}

export interface ClubMember {
  odUserId: string;
  odAccountId?: string;
  odOrganizationId?: string;
  clubId: string;
  role: 'owner' | 'admin' | 'member';
  displayName: string;
  email?: string;
  joinedAt: number;
  status: 'active' | 'suspended' | 'pending';
}

export interface ClubJoinRequest {
  id: string;
  clubId: string;
  userId: string;
  userName: string;
  userEmail?: string;
  status: 'pending' | 'approved' | 'declined';
  message?: string;
  createdAt: number;
  reviewedAt?: number;
  reviewedBy?: string;
}

// Court-related types for club management
export type CourtGrade = 'standard' | 'premium' | 'elite';
export type CourtSurface = 'concrete' | 'asphalt' | 'wood' | 'sport_court' | 'turf' | 'other';
export type CourtLocation = 'indoor' | 'outdoor' | 'covered';
export type CourtStatus = 'active' | 'inactive' | 'maintenance';

export interface CourtGradeConfig {
  id: CourtGrade;
  name: string;
  description: string;
  icon: string;
  basePrice: number;
  peakPrice: number;
  weekendPrice: number;
  memberPricing: 'free' | 'discounted' | 'same' | 'full';
  memberDiscountPercent: number;
  visitorPremiumPercent: number;
}

export interface ClubCourt {
  id: string;
  name: string;
  type: 'indoor' | 'outdoor';
  surface?: string;
  isActive: boolean;
  hourlyRate?: number;
  peakHourlyRate?: number;
  order?: number;
  // Extended properties for ManageCourts
  description?: string;
  grade?: CourtGrade;
  location?: CourtLocation;
  surfaceType?: CourtSurface;
  status?: CourtStatus;
  useCustomPricing?: boolean;
  customBasePrice?: number;
  customPeakPrice?: number;
  customWeekendPrice?: number;
  features?: {
    hasLights?: boolean;
    hasCover?: boolean;
    hasAC?: boolean;
    hasSeating?: boolean;
    climateControlled?: boolean;
    ballMachineAvailable?: boolean;
    livestreamCapable?: boolean;
  };
  additionalFees?: {
    lighting?: {
      enabled: boolean;
      amount: number;
      appliesAfter?: string;
    };
    equipment?: {
      enabled: boolean;
      amount: number;
      description?: string;
    };
    ballMachine?: {
      enabled: boolean;
      amount: number;
    };
  };
  /** Court-specific lighting add-on */
  lighting?: {
    enabled?: boolean;
    feePerHour?: number;
    autoIncludedInPeak?: boolean;
  };
  /** Court-specific equipment add-on */
  equipment?: {
    enabled?: boolean;
    feePerHour?: number;
    description?: string;
  };
  active?: boolean;
}

export interface ClubBookingSettings {
  enabled: boolean;
  advanceBookingDays?: number;
  minBookingMinutes?: number;
  maxBookingMinutes?: number;
  cancellationMinutes?: number;
  peakHours?: { startTime?: string; endTime?: string; days?: number[]; enabled?: boolean };
  blockedTimes?: { dayOfWeek: number; start: string; end: string; reason?: string }[];
  // Extended properties for ManageCourts
  currency?: string;
  slotDurationMinutes?: number;
  openTime?: string;
  closeTime?: string;
  weekendPricingEnabled?: boolean;
  courtGrades?: Record<CourtGrade, CourtGradeConfig>;
  useCustomGradeNames?: boolean;
  visitors?: {
    allowVisitors?: boolean;
    visitorFeeEnabled?: boolean;
    visitorFee?: number;
    visitorFeeType?: 'per_day' | 'per_booking';
    visitorCourtPricing?: 'same' | 'premium' | 'custom';
    visitorPremiumPercent?: number;
    visitorCustomPrice?: number;
    requireMemberSignIn?: boolean;
  };
  maxAdvanceBookingDays?: number;
  maxBookingsPerMemberPerDay?: number;
  cancellationMinutesBeforeSlot?: number;
  paymentMethods?: {
    acceptPayAsYouGo?: boolean;
    acceptWallet?: boolean;
    walletTopUpAmounts?: number[];
    allowCustomTopUp?: boolean;
    acceptAnnualPass?: boolean;
    annualPassPrice?: number;
    annualPassBenefit?: 'unlimited' | 'discounted' | 'priority';
    annualPassPriorityDays?: number;
    annualPassDiscountPercent?: number;
    passFeeToCustomer?: boolean;
  };
  stripeAccountId?: string;
}

// Type aliases for pricing service compatibility
export type ClubBookingSettingsEnhanced = ClubBookingSettings;
export type ClubCourtEnhanced = ClubCourt;
export type PeakHoursConfig = ClubBookingSettings['peakHours'];
export type VisitorSettings = ClubBookingSettings['visitors'];
export type PaymentMethodsConfig = ClubBookingSettings['paymentMethods'];

export interface CourtBooking {
  id: string;
  odUserId: string;
  odAccountId?: string;
  odOrganizationId?: string;
  odUserName: string;
  odUserEmail?: string;
  clubId: string;
  courtId: string;
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: 'confirmed' | 'cancelled' | 'completed';
  totalAmount?: number;
  paymentStatus?: 'pending' | 'paid' | 'refunded';
  stripePaymentIntentId?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
  // Alternative booking user fields for CourtBookingCalendar
  bookedByUserId?: string;
  bookedByName?: string;
}

// ============================================
// TOURNAMENT TYPES
// ============================================

export type EventType = 'singles' | 'doubles' | 'mixed_doubles';
export type GenderCategory = 'open' | 'mens' | 'womens' | 'mixed' | 'men' | 'women';
// V07.03: Extended match status for player flow
export type MatchStatus =
  | 'scheduled'            // Match scheduled, not started
  | 'in_progress'          // Currently being played
  | 'pending_confirmation' // Score entered, awaiting confirmation
  | 'completed'            // Match finished and confirmed
  | 'disputed'             // Score disputed
  | 'cancelled'            // Match cancelled
  | 'forfeit'              // One side forfeited / no-show
  | 'bye';                 // Bye (no opponent)
export type PaymentStatus = 'pending' | 'processing' | 'paid' | 'failed' | 'refunded';

export interface Tournament {
  id: string;
  name: string;
  description: string;
  bannerUrl?: string;
  startDate: number;
  endDate: number;
  registrationOpens?: number;    // When registration becomes available
  registrationDeadline: number;  // When registration closes
  location: string;
  venue?: string;
  status: 'draft' | 'published' | 'registration_open' | 'registration_closed' | 'in_progress' | 'completed' | 'cancelled';
  organizerId: string;
  organizerName?: string;
  organizerEmail?: string;
  clubId?: string;
  clubName?: string;
  maxParticipants?: number;
  currentParticipants: number;
  entryFee: number;
  isFreeEvent?: boolean;         // If true, no payment required
  paymentMode?: TournamentPaymentMode;  // 'free' | 'paid' (paid = transfer + stripe)
  bankDetails?: BankDetails;     // Optional bank details for transfer payments
  showBankDetails?: boolean;     // Whether to show bank details in-app
  prizePool?: number;
  rules?: string;
  createdAt: number;
  updatedAt: number;
  settings?: TournamentSettings;
  stripeConnectedAccountId?: string;
  stripeProductId?: string;
  stripePriceId?: string;
  divisions?: Division[];
  /** Admin test mode - allows organizers to score any match and test features */
  testMode?: boolean;
  /** Tournament day schedule (for multi-day events) */
  days?: TournamentDay[];
  /** Currently active tournament day ID */
  activeDayId?: string;
  /** Tournament sponsors */
  sponsors?: TournamentSponsor[];
  /** Sponsor display settings */
  sponsorSettings?: SponsorDisplaySettings;
  /** User IDs of tournament staff who can manage live courts and scoring */
  staffIds?: string[];
  /** Premier court settings for finals scheduling (V07.02) */
  courtSettings?: TournamentCourtSettings;
  /** DUPR integration settings (V07.24) */
  duprSettings?: TournamentDuprSettings;
}

/**
 * Sponsor tier for display prominence
 */
export type SponsorTier = 'platinum' | 'gold' | 'silver' | 'bronze';

/**
 * Tournament sponsor
 */
export interface TournamentSponsor {
  id: string;
  name: string;
  logoUrl: string;           // Firebase Storage URL
  websiteUrl?: string;       // Opens in new tab when clicked
  tier: SponsorTier;
  displayOrder?: number;     // Order within tier (lower = first)
  isActive: boolean;         // Toggle visibility without deleting
  createdAt: number;
  updatedAt: number;
}

/**
 * Sponsor display settings - controls where sponsors appear
 */
export interface SponsorDisplaySettings {
  showOnCards: boolean;        // Tournament list cards
  showOnHeader: boolean;       // Tournament detail header
  showOnRegistration: boolean; // Registration confirmation
  showOnScoreboard: boolean;   // Live scoring displays
}

export interface TournamentSettings {
  allowPartnerSignup: boolean;
  requirePartner: boolean;
  allowWaitlist: boolean;
  waitlistMax?: number;
  checkInRequired: boolean;
  checkInWindowMinutes?: number;
  seeding: 'random' | 'rating' | 'manual';
  consolationBracket: boolean;
  thirdPlaceMatch: boolean;
  pointsPerWin?: number;
  pointsPerLoss?: number;
  matchFormat?: {
    gamesPerMatch: number;
    pointsPerGame: number;
    winBy: number;
    tiebreaker?: boolean;
  };
}

/**
 * Pool assignment for drag-drop pool editing
 */
export interface PoolAssignment {
  poolName: string;
  teamIds: string[];
}

export interface Division {
  id: string;
  tournamentId: string;
  name: string;
  type: EventType;
  gender: GenderCategory;
  skillMin?: number;
  skillMax?: number;
  ageMin?: number;
  ageMax?: number;
  // Alias fields for eligibility checks (same as skillMin/skillMax/ageMin/ageMax)
  minRating?: number;
  maxRating?: number;
  minAge?: number;
  maxAge?: number;
  maxTeams?: number;
  entryFee?: number;
  format: DivisionFormat;
  status: 'setup' | 'ready' | 'in_progress' | 'completed';
  createdAt: number;
  updatedAt: number;
  /** Manual pool assignments (if organizer edited pools) */
  poolAssignments?: PoolAssignment[];

  /** Day assignment for multi-day tournaments (single day - backwards compatible) */
  tournamentDayId?: string;
  /**
   * Multiple day assignments for divisions that span multiple days (V07.08)
   * When a division is split across days, this array contains all assigned day IDs.
   * If this is set, it takes precedence over tournamentDayId.
   * Example: A 15-hour division split across Day 1 and Day 2
   */
  tournamentDayIds?: string[];
  /** Scheduled start time for this division (e.g., "09:00") */
  scheduledStartTime?: string;
  /** Scheduled end time for this division (e.g., "14:30") */
  scheduledEndTime?: string;

  // ============================================
  // Schedule Generation Status (V06.21)
  // ============================================

  /** Schedule generation status (for idempotency lock) */
  scheduleStatus?: 'idle' | 'generating' | 'generated';
  /** Version number incremented each time schedule is regenerated */
  scheduleVersion?: number;
  /** Timestamp when schedule was last generated */
  scheduleGeneratedAt?: number;
  /** User ID who last generated the schedule */
  scheduleGeneratedBy?: string;

  // ============================================
  // Bracket Generation Status (V06.21)
  // ============================================

  /** Bracket generation status (for idempotency lock) */
  bracketStatus?: 'idle' | 'generating' | 'generated';
  /** Timestamp when bracket was last generated */
  bracketGeneratedAt?: number;
  /** User ID who last generated the bracket */
  bracketGeneratedBy?: string;
}

export interface DivisionFormat {
  stageMode: 'single_stage' | 'two_stage';
  mainFormat: MainFormat;

  // Pool settings
  numberOfPools?: number;
  teamsPerPool?: number;
  advancingPerPool?: number;
  advanceToMainPerPool?: number;
  advanceToPlatePerPool?: number;

  // Stage formats
  stage1Format?: 'round_robin_pools' | 'swiss_pools';
  stage2Format?: 'single_elim' | 'double_elim' | 'medal_rounds';
  playoffFormat?: MainFormat;

  // Plate/Consolation
  plateEnabled?: boolean;
  plateFormat?: 'single_elim' | 'round_robin';
  plateName?: string;
  plateThirdPlace?: boolean;       // Include 3rd place match in plate bracket

  // Match settings (pool play defaults)
  bestOfGames?: 1 | 3 | 5;
  pointsPerGame?: 11 | 15 | 21;
  winBy?: 1 | 2;
  hasBronzeMatch?: boolean;

  // Medal round settings (per-round configuration)
  useSeparateMedalSettings?: boolean;
  medalRoundSettings?: {
    quarterFinals?: { bestOf: 1 | 3 | 5; pointsToWin: 11 | 15 | 21; winBy: 1 | 2 };
    semiFinals?: { bestOf: 1 | 3 | 5; pointsToWin: 11 | 15 | 21; winBy: 1 | 2 };
    finals?: { bestOf: 1 | 3 | 5; pointsToWin: 11 | 15 | 21; winBy: 1 | 2 };
    bronze?: { bestOf: 1 | 3 | 5; pointsToWin: 11 | 15 | 21; winBy: 1 | 2 };
  };

  // V06.40: Plate bracket round-specific settings
  plateRoundSettings?: {
    plateFinals?: { bestOf: 1 | 3 | 5; pointsToWin: 11 | 15 | 21; winBy: 1 | 2 };
    plateBronze?: { bestOf: 1 | 3 | 5; pointsToWin: 11 | 15 | 21; winBy: 1 | 2 };
  };

  // Seeding
  seedingMethod?: SeedingMethod;

  // Tiebreakers
  thirdPlaceMatch?: boolean;
  consolationBracket?: boolean;
  tieBreakerPrimary?: TieBreaker;
  tieBreakerSecondary?: TieBreaker;
  tieBreakerTertiary?: TieBreaker;

  // V06.00: Pool Play → Medals integration
  competitionFormat?: CompetitionFormat;
  poolPlayMedalsSettings?: PoolPlayMedalsSettings;
}

export type MainFormat = 'single_elim' | 'double_elim' | 'round_robin' | 'swiss' | 'ladder';

export interface Team {
  // ID field - supports both naming conventions
  id?: string;
  odTeamId?: string;

  odAccountId?: string;
  odOrganizationId?: string;
  tournamentId?: string;
  divisionId?: string;
  name?: string;
  teamName?: string; // Alternative naming

  // Player references
  playerIds?: string[];
  players?: { odUserId?: string; id?: string; name: string; email?: string }[];
  captainPlayerId?: string;  // Team captain user ID

  seed?: number;
  poolGroup?: string;
  status?: 'registered' | 'confirmed' | 'checked_in' | 'active' | 'eliminated' | 'withdrawn' | 'pending_partner' | 'cancelled';
  isLookingForPartner?: boolean;
  registeredAt?: number;
  registeredByUserId?: string;
  paymentStatus?: PaymentStatus;
  paymentMethod?: 'stripe' | 'manual';  // How player chose to pay
  paidAt?: number;                       // When payment was confirmed
  paidAmount?: number;                   // Amount paid (with or without fees)
  stripePaymentId?: string;              // Stripe payment intent ID if applicable
  checkInAt?: number;
}

/**
 * Match Interface (V06.07)
 *
 * IMPORTANT: Use the unified format for all new code:
 * - sideA/sideB for participants (NOT teamAId/teamBId)
 * - scores[] for game scores (NOT scoreTeamAGames/scoreTeamBGames)
 * - winnerId for winner (NOT winnerTeamId)
 *
 * See types/game/match.ts for the canonical Match interface.
 */
export interface Match {
  id: string;
  tournamentId?: string;
  divisionId?: string;

  // Event context (V06.07 unified format)
  eventType?: 'tournament' | 'league' | 'meetup';
  eventId?: string;
  format?: string;  // CompetitionFormat

  // PARTICIPANTS - Use sideA/sideB
  sideA?: MatchParticipant;
  sideB?: MatchParticipant;

  // Game settings
  gameSettings?: {
    playType?: 'singles' | 'doubles' | 'mixed' | 'open';
    pointsPerGame?: 11 | 15 | 21;
    winBy?: 1 | 2;
    bestOf?: 1 | 3 | 5;
    capAt?: number;
  };

  // Round info
  round?: number;
  roundNumber?: number;
  matchNumber?: number;

  // Stage info
  stage?: string;
  poolGroup?: string;
  poolKey?: string;  // V06.21: Normalized pool key for validation/queries
  bracketType?: 'main' | 'plate' | 'consolation';
  /** Match type for court allocation (V07.02) */
  matchType?: TournamentMatchType;

  // @deprecated Use sideA.id / sideB.id instead
  team1Id?: string;
  /** @deprecated Use sideA.id instead */
  team2Id?: string;
  /** @deprecated Use sideA.id instead */
  teamAId?: string;
  /** @deprecated Use sideB.id instead */
  teamBId?: string;

  // @deprecated Use sideA.name / sideB.name instead
  team1Name?: string;
  /** @deprecated Use sideB.name instead */
  team2Name?: string;
  team1Seed?: number;
  team2Seed?: number;

  // RESULT - Use winnerId
  winnerId?: string;
  /** Winner name for display */
  winnerName?: string;
  /** @deprecated Use winnerId instead */
  winnerTeamId?: string;
  loserId?: string;

  // SCORES - Use scores[]
  scores?: GameScore[];
  /** @deprecated Use scores[] instead */
  scoreTeamAGames?: number[];
  /** @deprecated Use scores[] instead */
  scoreTeamBGames?: number[];

  // Match status
  status: MatchStatus | 'scheduled' | 'not_started';

  // Court info
  courtId?: string;
  courtName?: string;
  court?: string | null;
  courtNumber?: number;

  // Time info
  scheduledTime?: number;
  startTime?: number | null;
  endTime?: number | null;
  startedAt?: number;
  completedAt?: number;

  // Bracket advancement
  nextMatchId?: string | null;
  nextMatchSlot?: 'team1' | 'team2' | 'teamA' | 'teamB' | 'sideA' | 'sideB' | null;
  loserNextMatchId?: string;
  loserNextMatchSlot?: 'team1' | 'team2';

  // Score submission & verification (V07.03)
  submittedByUserId?: string;
  submittedAt?: number;
  verification?: MatchVerificationData;

  // ============================================
  // V07.04 DUPR-COMPLIANT SCORING
  // ============================================

  /** Player-submitted score proposal (NOT official) */
  scoreProposal?: ScoreProposal;

  /** Organizer-finalized official result (required for completion) */
  officialResult?: OfficialResult;

  /** DUPR submission tracking (server-side only) */
  dupr?: DuprSubmissionData;

  /** Current score state in the workflow */
  scoreState?: ScoreState;

  /** Score locked after organizer finalizes - blocks player writes */
  scoreLocked?: boolean;
  scoreLockedAt?: number;
  scoreLockedByUserId?: string;

  /** Team snapshot for signer validation */
  teamSnapshot?: TeamSnapshot;

  /** Migration tracking (for legacy matches) */
  migratedAt?: number;
  migratedFromLegacy?: boolean;

  // Other metadata
  isBye?: boolean;
  isThirdPlace?: boolean;  // Bronze/3rd place match
  bracketPosition?: number;
  testData?: boolean;
  lastUpdatedBy?: string | null;
  lastUpdatedAt?: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface MatchScoreSubmission {
  odAccountId?: string;
  odOrganizationId?: string;
  odUserId: string;
  odTeamId: string;
  tournamentId: string;
  divisionId: string;
  matchId: string;
  scores: GameScore[];
  winnerId?: string;
  submittedAt: number;
  status: 'pending' | 'confirmed' | 'disputed';
  confirmedBy?: string;
  confirmedAt?: number;
  disputeReason?: string;
}

export interface GameScore {
  gameNumber?: number;
  // Score naming convention 1
  scoreA?: number;
  scoreB?: number;
  // Score naming convention 2
  team1Score?: number;
  team2Score?: number;
  // Score naming convention 3
  teamAScore?: number;
  teamBScore?: number;
  // Timestamp when this game was completed (V06.06)
  completedAt?: number;
}

export interface StandingsEntry {
  odAccountId?: string;
  odOrganizationId?: string;
  odUserId?: string;
  odTeamId: string;
  odUserIds?: string[];
  teamName: string;
  played: number;
  won: number;
  wins?: number;  // Alias for won
  lost: number;
  losses?: number;  // Alias for lost
  pointsFor: number;
  pointsAgainst: number;
  pointDifferential: number;
  pointDifference?: number;  // Alias for pointDifferential
  points?: number;  // Alias for leaguePoints
  leaguePoints: number;
}

// ============================================
// MEETUP TYPES
// ============================================

export type AttendeePaymentStatus = 'not_required' | 'pending' | 'paid' | 'refunded' | 'failed';

export interface Meetup {
  id: string;
  title: string;
  description: string;
  date: number;
  when?: string;  // Display-friendly date/time string
  endDate?: number;
  location: string;
  venueDetails?: string;
  maxAttendees?: number;
  currentAttendees: number;
  hostId: string;
  hostName: string;
  clubId?: string;
  clubName?: string;
  status: 'upcoming' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: number;
  updatedAt: number;
  attendeeIds?: string[];
  pricing?: MeetupPricing;
  stripeConnectedAccountId?: string;
  paidCount?: number;
  totalCollected?: number;
  competitionType?: MeetupCompetitionType;
  competitionSettings?: MeetupCompetitionSettings;
  region?: string;
  duprClubId?: string;
  // Map coordinates
  lat?: number;
  lng?: number;
}

export type MeetupCompetitionType = 
  | 'casual'
  | 'round_robin'
  | 'single_elimination'
  | 'double_elimination'
  | 'king_of_court'
  | 'ladder'
  | 'swiss'
  | 'pool_play_knockout';

export interface MeetupCompetitionSettings {
  pointsToWin?: number;
  winBy?: number;
  gamesPerMatch?: number;
  scoringSystem?: 'rally' | 'traditional';
  timeLimit?: number | null;
  pointsPerWin?: number;
  pointsPerDraw?: number;
  pointsPerLoss?: number;
}

export interface MeetupPricing {
  enabled: boolean;
  amount: number;
  currency: string;
  feesPaidBy: 'organizer' | 'player';
  description?: string;
  prizePool?: {
    enabled: boolean;
    percentage: number;
  };
}

export interface MeetupRSVP {
  odUserId: string;
  odAccountId?: string;
  odOrganizationId?: string;
  odUserName: string;
  odUserEmail?: string;
  odUserPhone?: string;
  meetupId: string;
  status: 'attending' | 'maybe' | 'not_attending' | 'waitlist';
  paymentStatus: AttendeePaymentStatus;
  amountPaid?: number;
  paidAt?: number;
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  rsvpAt: number;
  updatedAt: number;
  duprId?: string;
}

// ============================================
// LEAGUE TYPES (UPDATED V05.37)
// ============================================

export type LeagueType = 'singles' | 'doubles' | 'mixed_doubles';
export type LeagueFormat = 'ladder' | 'round_robin' | 'swiss' | 'box_league';
export type LeagueStatus = 'draft' | 'registration' | 'registration_closed' | 'active' | 'completed' | 'cancelled';

/**
 * Match format settings
 */
export interface LeagueMatchFormat {
  bestOf: 1 | 3 | 5;
  gamesTo: 11 | 15 | 21;
  winBy: 1 | 2;
  capAt?: number;
}

/**
 * Payment collection mode for leagues (NEW V05.44)
 * - free: No payment required
 * - external: Organizer collects payment outside the app (display fee only)
 * - stripe: Collect payment via Stripe Connect
 */
export type PaymentMode = 'free' | 'external' | 'stripe';

/**
 * Tournament payment mode - simplified to just free or paid
 * 'paid' means both transfer AND Stripe options are available to players
 */
export type TournamentPaymentMode = 'free' | 'paid';

/**
 * Bank details for EFT/transfer payments
 * Organizer can optionally provide these to show in-app
 */
export interface BankDetails {
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  branchCode?: string;    // Branch/routing number
  reference?: string;     // e.g., "Use your name as reference"
}

/**
 * Pricing settings for paid leagues
 */
export interface LeaguePricing {
  // Payment mode (NEW V05.44)
  paymentMode: PaymentMode;

  // Legacy field - still used for backwards compatibility
  enabled: boolean;

  entryFee: number;
  entryFeeType: 'per_player' | 'per_team';
  memberDiscount?: number;
  earlyBirdEnabled: boolean;
  earlyBirdFee?: number;
  earlyBirdDeadline?: number | null;
  lateFeeEnabled: boolean;
  lateFee?: number;
  lateRegistrationStart?: number | null;
  prizePool?: LeaguePrizePool;
  feesPaidBy: 'player' | 'organizer';
  /**
   * Refund policy options:
   * - full: 100% refund before league starts
   * - full_7days: 100% refund up to 7 days before start
   * - full_14days: 100% refund up to 14 days before start
   * - 75_percent: 75% refund before league starts
   * - partial (50_percent): 50% refund before league starts
   * - 25_percent: 25% refund before league starts
   * - admin_fee_only: Refund minus $5 admin fee
   * - none: No refunds
   */
  refundPolicy: 'full' | 'full_7days' | 'full_14days' | '75_percent' | 'partial' | '25_percent' | 'admin_fee_only' | 'none';
  refundDeadline?: number | null;
  currency: string;
}

/**
 * Prize pool settings
 */
export interface LeaguePrizePool {
  enabled: boolean;
  type: 'none' | 'fixed' | 'percentage';
  amount: number;
  distribution: {
    first: number;
    second: number;
    third: number;
    fourth: number;
  };
}

/**
 * Challenge rules for ladder leagues
 */
export interface LeagueChallengeRules {
  challengeRange: number;
  responseDeadlineHours: number;
  matchDeadlineHours?: number;
  completionDeadlineDays?: number;
  forfeitOnDecline?: boolean;
  maxActiveChallenges: number;
  cooldownDays: number;
}

/**
 * Round robin schedule settings (UPDATED V05.37 - added pool support)
 */
export interface LeagueRoundRobinSettings {
  rounds: number;
  matchesPerWeek?: number;
  scheduleGeneration: 'auto' | 'manual';
  // V07.11: Weekly Full Round Robin - each week is a complete round robin
  weeklyFullRoundRobin?: boolean;
  // V05.37: Pool support
  numberOfPools?: number;
  poolNames?: string[];
  poolAssignment?: 'random' | 'seeded' | 'manual';
  standingsMode?: 'per_pool' | 'combined';
  crossPoolPlay?: boolean;
}

/**
 * Swiss system settings
 */
export interface LeagueSwissSettings {
  rounds: number;
  pairingMethod: 'adjacent' | 'slide' | 'accelerated';
}

/**
 * Box league (flights) settings
 */
export interface LeagueBoxSettings {
  playersPerBox: number;
  promotionSpots: number;
  relegationSpots: number;
  roundsPerBox: number;
}

/**
 * Partner settings for doubles/mixed leagues
 */
export interface LeaguePartnerSettings {
  allowInvitePartner: boolean;
  allowOpenTeam: boolean;
  allowJoinOpen: boolean;
  partnerLockRule: 'registration_close' | 'season_start' | 'anytime' | 'specific_week';
  partnerLockWeek?: number | null;
  allowSubstitutes: boolean;
  teamNameMode?: 'auto' | 'manual';
}

/**
 * Tiebreaker options (V07.11: extended for weekly round robin)
 */
export type LeagueTiebreaker =
  | 'league_points'   // Total league points from wins
  | 'wins'            // Number of wins
  | 'point_diff'      // Points For - Points Against
  | 'head_to_head'
  | 'game_diff'
  | 'games_won'
  | 'games_lost'
  | 'points_for'
  | 'points_against'
  | 'recent_form';

/**
 * Points system presets for leagues (V07.11)
 */
export type PointsSystemPreset = 'win_only' | 'enhanced' | 'participation' | 'custom';

// ============================================
// LEAGUE DUPR SETTINGS (V05.36)
// ============================================

/**
 * DUPR integration mode for leagues
 */
/**
 * DUPR integration mode (shared by leagues and tournaments)
 */
export type DuprMode = 'none' | 'optional' | 'required';

/**
 * @deprecated Use DuprMode instead
 */
export type LeagueDuprMode = DuprMode;

/**
 * DUPR integration settings for leagues
 */
export interface LeagueDuprSettings {
  mode: DuprMode;
  autoSubmit: boolean;
  submitTrigger: 'on_confirmation' | 'on_completion' | 'manual';
  duprClubId?: string | null;
  useDuprForSkillLevel: boolean;
  minDuprRating?: number | null;
  maxDuprRating?: number | null;
  ratingType: 'singles' | 'doubles' | 'both';
}

/**
 * DUPR integration settings for tournaments (V07.24)
 */
export interface TournamentDuprSettings {
  /** DUPR mode: none (no DUPR), optional (encouraged), required (must link to register) */
  mode: DuprMode;
  /** Auto-submit matches to DUPR when finalized */
  autoSubmit: boolean;
  /** DUPR Club ID for CLUB submissions (optional) */
  duprClubId?: string | null;
}

// ============================================
// LEAGUE BYE POLICY (NEW V05.37)
// ============================================

/**
 * BYE handling configuration for leagues
 */
export interface LeagueByePolicy {
  /** How BYEs are assigned when odd number of players */
  assignmentMode: 'rotate_fair' | 'lowest_rank' | 'random' | 'manual';
  /** Points awarded for a BYE */
  pointsForBye: number;
  /** Maximum BYEs allowed per player per season */
  maxByesPerPlayer?: number | null;
  /** Whether to count BYE as a "played" match in stats */
  countByeAsPlayed: boolean;
}

// ============================================
// LEAGUE POOL (NEW V05.37)
// ============================================

/**
 * Pool/Group for round robin leagues with multiple pools
 */
export interface LeaguePool {
  id: string;
  leagueId: string;
  divisionId?: string | null;
  name: string;
  order: number;
  memberIds: string[];
  createdAt: number;
  updatedAt: number;
}

// ============================================
// LEAGUE BOX OVERRIDE (NEW V05.37)
// ============================================

/**
 * Admin manual box move for box league format
 */
export interface LeagueBoxOverride {
  id: string;
  leagueId: string;
  memberId: string;
  memberName: string;
  fromBox: number;
  toBox: number;
  reason: string;
  overriddenByUserId: string;
  overriddenByName: string;
  createdAt: number;
}

// ============================================
// LEAGUE VENUE & COURT TYPES
// ============================================

/**
 * Day of week for scheduling
 */
export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

/**
 * Time slot for league play
 */
export interface LeagueTimeSlot {
  id: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  label?: string;
}

/**
 * Court definition for league
 */
export interface LeagueCourt {
  id: string;
  name: string;
  order: number;
  active: boolean;
  surface?: string;
  notes?: string;
}

/**
 * Generic court definition for tournaments (V06.05)
 * Compatible with LeagueCourt and ClubCourt
 */
export interface Court {
  id: string;
  name: string;
  active?: boolean;
  order?: number;
  surface?: string;
  notes?: string;
}

/**
 * Venue settings for league scheduling
 */
export interface LeagueVenueSettings {
  venueName: string;
  venueAddress?: string;
  venueNotes?: string;
  courts: LeagueCourt[];
  timeSlots?: LeagueTimeSlot[];
  matchDurationMinutes: number;
  bufferMinutes: number;
  schedulingMode: 'venue_based' | 'self_scheduled';
  autoAssignCourts: boolean;
  avoidBackToBack?: boolean;
  balanceCourtUsage: boolean;

  // V07.27: Single-session scheduling
  minRestMinutes?: number;           // Min gap before same team plays again (player recovery)
  sessionStartTime?: string;         // "18:00" (6pm) - session start
  sessionEndTime?: string;           // "21:00" (9pm) - session end
  sessionDay?: DayOfWeek;            // Primary day for this league

  // Calculated capacity (stored for reference)
  maxTeamsPerDivision?: number;      // Max teams that fit in single session
  slotsPerCourt?: number;            // Time slots available per court
  totalMatchSlots?: number;          // Total slots across all courts

  // Division scheduling mode
  divisionMode?: 'shared_time' | 'separate_time';
  // shared_time: All divisions play same window on different courts
  // separate_time: Each division has its own time window

  // Schedule lifecycle
  scheduleStatus?: 'draft' | 'published' | 'locked';
  scheduleGenerationId?: string;     // For idempotency

  // Recurring schedule config (V05.35)
  scheduleConfig?: {
    numberOfWeeks: number;
    matchDays: DayOfWeek[];
    matchStartTime: string;
    matchEndTime: string;
    matchNights: string[];
  };
}

/**
 * Per-division venue configuration (V07.27)
 * For shared_time mode: assigns specific courts to each division
 * For separate_time mode: assigns time windows to each division
 */
export interface DivisionVenueConfig {
  divisionId: string;
  courtIds: string[];                // Which courts this division uses (shared_time)
  startTime?: string;                // Division-specific start time (separate_time)
  endTime?: string;                  // Division-specific end time (separate_time)
  maxTeams?: number;                 // Calculated max teams for this division
}

// ============================================
// SCORE VERIFICATION TYPES (NEW V05.44)
// ============================================

/**
 * Who can enter scores for a match
 */
export type ScoreEntryMode =
  | 'any_player'        // Any player in the match
  | 'winner_only'       // Only winning side can enter
  | 'organizer_only';   // Only organizer can enter

/**
 * How scores are verified after entry
 */
export type ScoreVerificationMethod =
  | 'auto_confirm'      // Immediate - no confirmation needed
  | 'one_opponent'      // One player from opposing side confirms
  | 'majority'          // Majority of players confirm (2/4 for doubles, 1/2 for singles)
  | 'organizer_only';   // Organizer must approve all scores

/**
 * Match verification status (applies to ALL match types)
 */
export type MatchVerificationStatus =
  | 'pending'           // Score entered, awaiting verification
  | 'confirmed'         // Required confirmations received
  | 'disputed'          // Player disputed the score
  | 'final';            // Locked - affects standings

/**
 * Dispute reasons for score challenges
 */
export type DisputeReason =
  | 'wrong_score'
  | 'wrong_winner'
  | 'other';

/**
 * Score verification settings for a league
 */
export interface ScoreVerificationSettings {
  entryMode: ScoreEntryMode;
  verificationMethod: ScoreVerificationMethod;
  autoFinalizeHours: number;      // 0 = disabled
  allowDisputes: boolean;
}

/**
 * Verification data stored on a match
 */
export interface MatchVerificationData {
  verificationStatus: MatchVerificationStatus;
  confirmations: string[];        // User IDs who confirmed
  requiredConfirmations: number;  // Based on method + player count

  // Dispute tracking
  disputedAt?: number;
  disputedByUserId?: string;
  disputeReason?: DisputeReason;
  disputeNotes?: string;

  // Finalization
  finalizedAt?: number;
  finalizedByUserId?: string;
  autoFinalized?: boolean;
}

/**
 * Default score verification settings
 */
export const DEFAULT_SCORE_VERIFICATION: ScoreVerificationSettings = {
  entryMode: 'any_player',
  verificationMethod: 'one_opponent',
  autoFinalizeHours: 24,
  allowDisputes: true,
};

// ============================================
// LEAGUE SETTINGS (UPDATED V05.44)
// ============================================

/**
 * Comprehensive league settings
 */
export interface LeagueSettings {
  // Basic restrictions
  minRating?: number | null;
  maxRating?: number | null;
  minAge?: number | null;
  maxAge?: number | null;
  maxMembers?: number | null;
  
  // Points system
  pointsForWin: number;
  pointsForDraw: number;
  pointsForLoss: number;
  pointsForForfeit: number;
  pointsForNoShow: number;
  
  // Match format
  matchFormat: LeagueMatchFormat;
  
  // Match scheduling
  matchDays?: string[];
  matchDeadlineDays?: number;
  gameTime?: string | null; // V07.26: Game time display (e.g., "Sundays 2-5pm")

  // Score reporting
  allowSelfReporting: boolean;
  requireConfirmation: boolean;
  
  // Format-specific settings
  challengeRules?: LeagueChallengeRules;
  roundRobinSettings?: LeagueRoundRobinSettings;
  swissSettings?: LeagueSwissSettings;
  boxSettings?: LeagueBoxSettings;
  
  // Tiebreakers (in order of priority)
  tiebreakers: LeagueTiebreaker[];
  
  // Partner settings (for doubles/mixed)
  partnerSettings?: LeaguePartnerSettings;
  
  // Venue settings
  venueSettings?: LeagueVenueSettings | null;
  
  // DUPR settings (V05.36)
  duprSettings?: LeagueDuprSettings | null;

  // BYE policy (NEW V05.37)
  byePolicy?: LeagueByePolicy | null;

  // Score verification (NEW V05.44)
  scoreVerification?: ScoreVerificationSettings | null;
}

// ============================================
// LEAGUE DIVISION
// ============================================

/**
 * League division (for leagues with multiple skill levels)
 */
export interface LeagueDivision {
  id: string;
  leagueId: string;
  name: string;
  type: EventType;
  gender: GenderCategory;
  minRating?: number | null;
  maxRating?: number | null;
  minAge?: number | null;
  maxAge?: number | null;
  maxParticipants?: number | null;
  registrationOpen: boolean;
  order: number;
  createdAt: number;
  updatedAt: number;
}

// ============================================
// MAIN LEAGUE INTERFACE
// ============================================

/**
 * Main League interface
 */
export interface League {
  id: string;
  name: string;
  description: string;
  
  // League classification
  type: LeagueType;
  format: LeagueFormat;
  
  // Club association (optional)
  clubId?: string | null;
  clubName?: string | null;
  
  // Creator
  createdByUserId: string;
  organizerName?: string;
  
  // Dates
  seasonStart: number;
  seasonEnd: number;
  registrationDeadline?: number | null;
  registrationOpens?: number | null;
  
  // Payment
  pricing?: LeaguePricing | null;
  organizerStripeAccountId?: string | null;
  
  // Status
  status: LeagueStatus;
  
  // Settings
  settings: LeagueSettings;
  
  // Location
  location?: string | null;
  venue?: string | null;
  region?: string | null;
  
  // Visibility
  visibility: 'public' | 'private' | 'club_only';
  
  // Stats (auto-updated)
  memberCount: number;
  maxMembers?: number | null; // V07.15: Maximum players/teams allowed
  matchesPlayed: number;
  paidMemberCount?: number;
  totalCollected?: number;

  // Has divisions?
  hasDivisions: boolean;

  // V07.27: Single-session venue scheduling
  timezone?: string;                          // "Pacific/Auckland" - for DST handling
  maxTeamsPerDivision?: number;               // Capacity limit per division
  registrationOpen?: boolean;                 // Can be auto-closed when full
  divisionVenueConfigs?: DivisionVenueConfig[]; // Per-division court/time assignments

  // DUPR event tracking
  duprEventId?: string;                       // Created when first match submitted
  duprEventName?: string;                     // Event name for DUPR

  // V07.29: Week-based match states
  // Three states: 'closed' (not yet open), 'open' (players can score), 'locked' (finalized)
  weekStates?: Record<number, 'closed' | 'open' | 'locked'>;
  // If undefined, all weeks default to 'open' (backwards compat)

  // Timestamps
  createdAt: number;
  updatedAt: number;
}

// ============================================
// LEAGUE MEMBER TYPES (UPDATED V05.37)
// ============================================

export type MembershipStatus = 'pending' | 'pending_partner' | 'active' | 'suspended' | 'withdrawn';
export type MemberRole = 'member' | 'captain' | 'admin';

/**
 * Member statistics (UPDATED V05.37 - added byeCount)
 */
export interface MemberStats {
  played: number;
  wins: number;
  losses: number;
  draws: number;
  forfeits: number;
  points: number;
  gamesWon: number;
  gamesLost: number;
  pointsFor: number;
  pointsAgainst: number;
  currentStreak: number;
  bestWinStreak: number;
  recentForm: ('W' | 'L' | 'D' | 'F')[];
  // NEW V05.37: BYE tracking
  byeCount?: number;
}

/**
 * League member (UPDATED V05.37 - added pool and box override fields)
 */
export interface LeagueMember {
  id: string;
  leagueId: string;
  divisionId?: string | null;
  
  // Player info
  userId: string;
  displayName: string;
  duprId?: string | null;
  
  // Partner info (for doubles/mixed)
  partnerUserId?: string | null;
  partnerDisplayName?: string | null;
  partnerDuprId?: string | null;
  
  // Team info
  teamId?: string | null;
  teamName?: string | null;

  // Partner invite tracking (for doubles)
  isLookingForPartner?: boolean;
  pendingInviteId?: string | null;
  pendingInvitedUserId?: string | null;
  partnerLockedAt?: number | null;
  teamKey?: string | null;

  // V07.27: Join request tracking (when someone requests to join open team)
  pendingJoinRequestId?: string | null;
  pendingRequesterId?: string | null;
  pendingRequesterName?: string | null;

  // Status
  status: MembershipStatus;
  role: MemberRole;
  
  // Payment
  paymentStatus: AttendeePaymentStatus;
  amountPaid?: number;
  paidAt?: number;
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  
  // Rankings
  currentRank: number;
  previousRank?: number | null;
  peakRank?: number | null;
  
  // Box league specific
  currentBox?: number | null;
  
  // NEW V05.37: Pool assignment
  poolId?: string | null;
  poolName?: string | null;
  
  // NEW V05.37: Box override tracking
  lastBoxOverride?: LeagueBoxOverride | null;
  
  // Stats
  stats: MemberStats;
  
  // Activity
  joinedAt: number;
  lastActiveAt: number;
}

// ============================================
// LEAGUE TEAM TYPES
// ============================================

export type LeagueTeamStatus = 'pending_partner' | 'active' | 'withdrawn' | 'suspended';

/**
 * League team (for doubles/mixed/team leagues)
 */
export interface LeagueTeam {
  id: string;
  leagueId: string;
  divisionId?: string | null;
  teamName: string;
  captainUserId: string;
  playerIds: string[];
  status: LeagueTeamStatus;
  isLookingForPartner: boolean;
  pendingInviteId?: string | null;
  pendingInvitedUserId?: string | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Tournament partner invite (for doubles events)
 * Used when a player invites another to be their partner
 */
export interface PartnerInvite {
  id: string;
  tournamentId: string;
  divisionId: string;
  inviterId: string;
  inviterName?: string;
  inviterDuprId?: string | null;
  invitedUserId: string;
  invitedUserName?: string;
  invitedUserDuprId?: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';
  createdAt: number;
  respondedAt?: number | null;
  expiresAt?: number | null;
}

/**
 * League partner invite
 */
export interface LeaguePartnerInvite {
  id: string;
  leagueId: string;
  leagueName?: string;
  divisionId?: string | null;
  teamId?: string | null;
  memberId?: string | null;
  inviterId: string;
  inviterName: string;
  inviterDuprId?: string | null;
  invitedUserId: string;
  invitedUserName?: string;
  invitedUserDuprId?: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';
  createdAt: number;
  respondedAt?: number | null;
  expiresAt?: number | null;
}

/**
 * League join request (for open teams looking for partners)
 * Reverse of invite: requester wants to join an open team
 */
export interface LeagueJoinRequest {
  id: string;
  leagueId: string;
  leagueName?: string;
  divisionId?: string | null;

  // Open team being requested to join
  openTeamMemberId: string;
  openTeamOwnerUserId: string;
  openTeamOwnerName: string;

  // Requester info
  requesterId: string;
  requesterName: string;
  requesterDuprId?: string | null;

  status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
  createdAt: number;
  respondedAt?: number | null;
  expiresAt?: number | null;
}

// ============================================
// LEAGUE MATCH TYPES
// ============================================

/**
 * League match status
 */
export type LeagueMatchStatus =
  | 'scheduled'
  | 'pending_confirmation'
  | 'completed'
  | 'disputed'
  | 'cancelled'
  | 'forfeit'
  | 'no_show';

export type LeagueMatchType = 'regular' | 'challenge' | 'playoff' | 'box';

/**
 * League match
 */
export interface LeagueMatch {
  id: string;
  leagueId: string;
  divisionId?: string | null;
  
  // Participants (member IDs)
  memberAId: string;
  memberBId: string;
  
  // Player IDs (for queries)
  userAId: string;
  userBId: string;
  partnerAId?: string | null;
  partnerBId?: string | null;
  
  // DUPR IDs for submission (V05.36)
  userADuprId?: string | null;
  userBDuprId?: string | null;
  partnerADuprId?: string | null;
  partnerBDuprId?: string | null;
  
  // Display names
  memberAName: string;
  memberBName: string;
  
  // Match classification
  matchType: LeagueMatchType;
  weekNumber?: number | null;
  roundNumber?: number | null;
  boxNumber?: number | null;
  
  // Scheduling
  scheduledDate?: number | null;
  deadline?: number | null;
  court?: string | null;
  venue?: string | null;
  
  // Time slot fields
  timeSlotId?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  timeSlotIndex?: number | null;     // V07.27: 0, 1, 2... for ordering within session

  // V07.27: Single-session scheduling
  scheduledStartAt?: number | null;  // Absolute timestamp (derived from date + time + timezone)
  scheduleGenerationId?: string;     // Which generation created this schedule (for idempotency)

  // Status
  status: LeagueMatchStatus;
  
  // Scores
  scores: GameScore[];
  winnerMemberId?: string | null;
  
  // Rankings at time of match (for history)
  memberARankAtMatch?: number | null;
  memberBRankAtMatch?: number | null;
  
  // Reporting
  submittedByUserId?: string | null;
  confirmedByUserId?: string | null;
  disputeReason?: string | null;
  
  // DUPR submission tracking (V05.36)
  duprEligible?: boolean;
  duprSubmitted?: boolean;
  duprMatchId?: string | null;
  duprSubmittedAt?: number | null;
  duprSubmittedBy?: string | null;
  duprError?: string | null;

  // V07.14: DUPR exclusion (match doesn't count for league standings)
  duprExcluded?: boolean;
  duprExclusionReason?: string;

  // Score verification (NEW V05.44)
  verification?: MatchVerificationData | null;

  // V07.10: Unified sideA/sideB format for Firestore rules compatibility
  sideA?: {
    id: string;
    name: string;
    playerIds: string[];
  };
  sideB?: {
    id: string;
    name: string;
    playerIds: string[];
  };

  // V07.04: Team snapshot for score verification
  teamSnapshot?: TeamSnapshot;

  // V07.04: DUPR-compliant scoring fields
  scoreProposal?: ScoreProposal;
  officialResult?: OfficialResult;
  scoreState?: ScoreState;
  scoreLocked?: boolean;
  scoreLockedAt?: number;
  scoreLockedByUserId?: string;
  dupr?: DuprSubmissionData;

  // Timestamps
  createdAt: number;
  playedAt?: number | null;
  completedAt?: number | null;
  updatedAt?: number;
}

// ============================================
// LEAGUE CHALLENGE TYPES
// ============================================

export type ChallengeStatus = 'pending' | 'accepted' | 'declined' | 'completed' | 'expired' | 'cancelled';

/**
 * League challenge (for ladder format)
 */
export interface LeagueChallenge {
  id: string;
  leagueId: string;
  divisionId?: string | null;
  challengerId: string;
  challengerName: string;
  challengerRank: number;
  defenderId: string;
  defenderName: string;
  defenderRank: number;
  status: ChallengeStatus;
  matchId?: string | null;
  responseDeadline: number;
  matchDeadline?: number | null;
  message?: string;
  declineReason?: string;
  createdAt: number;
  respondedAt?: number | null;
  completedAt?: number | null;
}

// ============================================
// TOURNAMENT REGISTRATION
// ============================================

export interface TournamentRegistration {
  id: string;
  tournamentId: string;
  playerId: string;
  status: 'draft' | 'in_progress' | 'pending_payment' | 'completed' | 'cancelled';
  waiverAccepted: boolean;
  selectedEventIds: string[];  // Division IDs the player registered for
  partnerDetails?: Record<string, {
    partnerId?: string;
    partnerUserId?: string;  // Alias for partnerId
    partnerName?: string;
    mode?: 'invite' | 'join_open' | 'create_open' | 'open_team';
    teamId?: string;
    openTeamId?: string;  // ID of open team to join
  }>;
  paymentStatus?: 'pending' | 'paid' | 'refunded' | 'waived';
  paymentIntentId?: string;
  amountDue?: number;
  amountPaid?: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  checkedInAt?: number;
  checkedInBy?: string;
}

// ============================================
// LEAGUE REGISTRATION
// ============================================

export interface LeagueRegistration {
  id: string;
  odAccountId?: string;
  odOrganizationId?: string;
  leagueId: string;
  odUserId: string;
  divisionId?: string | null;
  status: 'draft' | 'pending_payment' | 'pending_partner' | 'completed' | 'cancelled';
  partnerOption?: 'invite' | 'open' | 'join_open' | null;
  partnerUserId?: string | null;
  teamId?: string | null;
  inviteId?: string | null;
  paymentStatus: AttendeePaymentStatus;
  amountDue?: number;
  amountPaid?: number;
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  createdAt: number;
  updatedAt: number;
}

// ============================================
// COMPETITION TYPES (LEGACY)
// ============================================

export type CompetitionType = 'casual' | 'round_robin' | 'ladder' | 'tournament' | 'box_league' | 'team_league';

// Visibility type for events and clubs
export type Visibility = 'public' | 'private' | 'club_only';

// Team league board configuration (for CreateCompetition)
export interface TeamLeagueBoardConfig {
  id: string;
  name: string;
  format: 'singles' | 'doubles';
}
export type CompetitionStatus = 'draft' | 'registration_open' | 'in_progress' | 'completed' | 'cancelled';

export interface CompetitionDivision {
  id: string;
  name: string;
  type?: EventType;  // singles, doubles, mixed_doubles
  skillLevelMin?: number;
  skillLevelMax?: number;
  minRating?: number;  // Alias for skillLevelMin
  maxRating?: number;  // Alias for skillLevelMax
  ageMin?: number;
  ageMax?: number;
  minAge?: number;  // Alias for ageMin
  maxAge?: number;  // Alias for ageMax
  gender?: 'open' | 'mens' | 'womens' | 'mixed';
}

export interface CompetitionEntry {
  id?: string;
  odUserId: string;
  playerId?: string;  // Alias for odUserId
  teamId?: string;    // For team-based competitions
  odAccountId?: string;
  odOrganizationId?: string;
  odUserName: string;
  odUserEmail?: string;
  odUserPhone?: string;
  odUserPhotoURL?: string;
  competitionId: string;
  divisionId?: string;
  partnerId?: string;
  partnerName?: string;
  teamName?: string;
  status: 'registered' | 'checked_in' | 'active' | 'eliminated' | 'withdrawn';
  seed?: number;
  currentRank?: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  registeredAt: number;
}

export interface Competition {
  id: string;
  odAccountId?: string;
  odOrganizationId?: string;
  clubId?: string;
  clubName?: string;
  name: string;
  description?: string;
  type: CompetitionType;
  format: 'singles' | 'doubles' | 'mixed_doubles';
  status: CompetitionStatus;
  startDate: number;
  endDate?: number;
  registrationDeadline?: number;
  location?: string;
  country?: string;
  region?: string;
  venue?: string;
  entryFee?: number;
  maxEntrants?: number;
  currentEntrants: number;
  organizerId: string;
  organizerName?: string;
  visibility: 'public' | 'private' | 'club_only';
  rules?: string;
  settings?: {
    matchFormat?: {
      gamesPerMatch: number;
      pointsPerGame: number;
      winBy: number;
    };
    pointsPerWin?: number;
    pointsPerLoss?: number;
    challengeRange?: number;
    boxSize?: number;
    promotionSpots?: number;
    relegationSpots?: number;
  };
  divisions?: CompetitionDivision[];
  createdAt: number;
  updatedAt: number;
}

// ============================================
// V06.00 UNIFIED GAME & FORMAT SYSTEM
// Re-export new types for gradual migration
// ============================================

// Export new game types
export type {
  PlayType,
  PointsPerGame,
  WinBy,
  BestOf,
  GameSettings,
} from './types/game';

export {
  DEFAULT_GAME_SETTINGS,
  GAME_SETTINGS_PRESETS,
  POINTS_PER_GAME_OPTIONS,
  WIN_BY_OPTIONS,
  BEST_OF_OPTIONS,
  PLAY_TYPE_OPTIONS,
} from './types/game';

// Export new format types
export type {
  CompetitionFormat,
  FormatOption,
  RoundRobinSettings,
  BoxSettings,
  EliminationSettings,
  SwissSettings,
  LadderSettings,
  KingOfCourtSettings,
  TeamLeagueSettings,
  FormatSettings,
} from './types/formats';

export {
  COMPETITION_FORMATS,
  DEFAULT_ROUND_ROBIN_SETTINGS,
  DEFAULT_BOX_SETTINGS,
  DEFAULT_ELIMINATION_SETTINGS,
  DEFAULT_SWISS_SETTINGS,
  DEFAULT_LADDER_SETTINGS,
  DEFAULT_KING_OF_COURT_SETTINGS,
  DEFAULT_TEAM_LEAGUE_SETTINGS,
  getFormatOption,
  getFormatsForPlayType,
  formatRequiresTeams,
  formatGeneratesMatchesUpfront,
  getDefaultFormatSettings,
} from './types/formats';

// Export new match types (aliased to avoid conflicts with local definitions)
export type {
  GameScore as UnifiedGameScore,
  MatchStatus as UnifiedMatchStatus,
  MatchParticipant,
  Match as UnifiedMatch,
} from './types/game';

// ============================================
// TYPE MAPPING HELPERS (for migration)
// ============================================

/**
 * Map legacy LeagueFormat to new CompetitionFormat
 */
export function mapLegacyFormat(legacyFormat: LeagueFormat): CompetitionFormat {
  const mapping: Record<LeagueFormat, CompetitionFormat> = {
    ladder: 'ladder',
    round_robin: 'round_robin',
    swiss: 'swiss',
    box_league: 'rotating_doubles_box',
  };
  return mapping[legacyFormat];
}

/**
 * Map legacy LeagueType to new PlayType
 */
export function mapLegacyType(legacyType: LeagueType): PlayType {
  const mapping: Record<LeagueType, PlayType> = {
    singles: 'singles',
    doubles: 'doubles',
    mixed_doubles: 'mixed',
  };
  return mapping[legacyType];
}

/**
 * Map new PlayType back to legacy LeagueType
 */
export function mapPlayTypeToLegacy(playType: PlayType): LeagueType {
  const mapping: Record<PlayType, LeagueType> = {
    singles: 'singles',
    doubles: 'doubles',
    mixed: 'mixed_doubles',
    open: 'doubles', // Open maps to doubles for backward compatibility
  };
  return mapping[playType];
}

/**
 * Map new CompetitionFormat back to legacy LeagueFormat
 */
export function mapFormatToLegacy(format: CompetitionFormat): LeagueFormat {
  const mapping: Record<CompetitionFormat, LeagueFormat> = {
    pool_play_medals: 'round_robin', // Pools use round robin
    round_robin: 'round_robin',
    rotating_doubles_box: 'box_league',
    fixed_doubles_box: 'box_league',
    singles_elimination: 'round_robin', // No direct mapping
    doubles_elimination: 'round_robin', // No direct mapping
    king_of_court: 'round_robin', // No direct mapping
    team_league_interclub: 'round_robin', // No direct mapping
    swiss: 'swiss',
    ladder: 'ladder',
  };
  return mapping[format];
}

// ============================================
// TOURNAMENT PLANNER TYPES (V06.00)
// ============================================

/**
 * Match preset templates for quick selection
 */
export type MatchPreset = 'quick' | 'standard' | 'finals' | 'custom';

/**
 * Game settings for scoring
 */
export interface PlannerGameSettings {
  pointsToWin: 11 | 15 | 21;
  winBy: 1 | 2;
  bestOf: 1 | 3 | 5;
}

/**
 * Timing settings for matches
 */
export interface PlannerTimingSettings {
  warmupMinutes: number;      // Time before match starts (default: 3)
  restMinutes: number;        // Rest between matches (default: 8)
  courtChangeMinutes: number; // Court transition time (default: 2)
}

/**
 * A single tournament day with its schedule
 */
export interface TournamentDay {
  id: string;
  date: string;       // "2024-03-15" (ISO date string)
  startTime: string;  // "09:00"
  endTime: string;    // "17:00"
  label?: string;     // Optional: "Day 1", "Finals Day", etc.
}

/**
 * A division in the planner
 */
export interface PlannerDivision {
  id: string;
  name: string;
  playType: 'singles' | 'doubles';
  gender?: GenderCategory;  // 'open' | 'men' | 'women' | 'mixed'
  format: CompetitionFormat;
  expectedPlayers: number;

  // DUPR rating requirements
  minRating?: number;  // e.g., 3.0
  maxRating?: number;  // e.g., 4.5

  // Age requirements
  minAge?: number;     // e.g., 50 for 50+ division
  maxAge?: number;     // e.g., 17 for junior division

  // Pool settings (for pool_play_medals format)
  poolSize?: number;

  // Entry fee for this division (in cents)
  entryFee?: number;

  // Calculated fields (set by planner)
  poolCount?: number;
  matchCount?: number;
  estimatedMinutes?: number;
  estimatedStartTime?: string;
  estimatedEndTime?: string;
  assignedDayId?: string;  // Which day this division runs on
}

/**
 * Tournament Planner settings - captures all wizard inputs
 */
export interface TournamentPlannerSettings {
  // Step 1: Courts
  courts: number;

  // Step 2: Time Window (multi-day support)
  days: TournamentDay[];

  // Legacy single-day fields (computed from first/last day for backwards compat)
  startTime: string;  // "09:00" - from first day
  endTime: string;    // "17:00" - from last day

  // Step 3: Match Settings
  matchPreset: MatchPreset;
  gameSettings: PlannerGameSettings;           // Legacy - used as default
  poolGameSettings: PlannerGameSettings;       // Pool play scoring (e.g., 1 game to 11)
  medalGameSettings: PlannerGameSettings;      // Medal rounds scoring - legacy simple mode
  useSeparateMedalSettings: boolean;           // Whether to use different settings for medals
  timingSettings: PlannerTimingSettings;

  // Per-round medal settings (overrides medalGameSettings when present)
  medalRoundSettings?: {
    quarterFinals?: PlannerGameSettings;
    semiFinals?: PlannerGameSettings;
    finals?: PlannerGameSettings;
    bronze?: PlannerGameSettings;
  };

  // Step 4: Divisions
  divisions: PlannerDivision[];

  // Registration & Payment (Step 2)
  registrationOpens?: number;    // When registration becomes available
  registrationDeadline?: number; // When registration closes
  isFreeEvent?: boolean;         // If true, no payment required (legacy)
  entryFee?: number;             // Legacy - use adminFee instead
  paymentMode?: TournamentPaymentMode;  // 'free' | 'paid' (paid = transfer + stripe)
  adminFee?: number;             // Tournament-level admin fee (in cents)
  bankDetails?: BankDetails;     // Optional bank details for transfer payments
  showBankDetails?: boolean;     // Whether to show bank details in-app (vs. share manually)
}

/**
 * Capacity calculation result
 */
export interface PlannerCapacity {
  // Totals
  totalPlayers: number;
  totalMatches: number;
  totalMinutes: number;
  totalHours: number;

  // Court hours
  courtHoursAvailable: number;
  courtHoursUsed: number;
  utilizationPercent: number;

  // Feasibility
  fitsInTimeframe: boolean;
  overtimeMinutes: number;

  // Per-day breakdown (for multi-day tournaments)
  dayBreakdown: {
    dayId: string;
    date: string;
    label?: string;
    courtHoursAvailable: number;
    courtHoursUsed: number;
    utilizationPercent: number;
    fitsInTimeframe: boolean;
  }[];

  // Per-division breakdown
  divisionBreakdown: {
    divisionId: string;
    name: string;
    matches: number;
    minutes: number;
    startTime: string;
    endTime: string;
    dayId?: string;  // Which day this division is on
  }[];

  // Feedback
  warningMessages: string[];
  suggestions: string[];
}

/**
 * Default values for Tournament Planner
 */
export const DEFAULT_PLANNER_GAME_SETTINGS: PlannerGameSettings = {
  pointsToWin: 11,
  winBy: 2,
  bestOf: 1,
};

export const DEFAULT_POOL_GAME_SETTINGS: PlannerGameSettings = {
  pointsToWin: 11,
  winBy: 2,
  bestOf: 1,  // Pool play: typically single game
};

export const DEFAULT_MEDAL_GAME_SETTINGS: PlannerGameSettings = {
  pointsToWin: 11,
  winBy: 2,
  bestOf: 3,  // Medal rounds: typically best of 3
};

export const DEFAULT_PLANNER_TIMING_SETTINGS: PlannerTimingSettings = {
  warmupMinutes: 3,
  restMinutes: 8,
  courtChangeMinutes: 2,
};

/**
 * Generate a default tournament day for today
 */
export const createDefaultTournamentDay = (daysFromNow = 0): TournamentDay => {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  const dateStr = date.toISOString().split('T')[0];
  return {
    id: `day-${Date.now()}-${daysFromNow}`,
    date: dateStr,
    startTime: '09:00',
    endTime: '17:00',
    label: daysFromNow === 0 ? 'Day 1' : `Day ${daysFromNow + 1}`,
  };
};

export const DEFAULT_TOURNAMENT_PLANNER_SETTINGS: TournamentPlannerSettings = {
  courts: 4,
  days: [createDefaultTournamentDay()],
  startTime: '09:00',
  endTime: '17:00',
  matchPreset: 'standard',
  gameSettings: DEFAULT_PLANNER_GAME_SETTINGS,
  poolGameSettings: DEFAULT_POOL_GAME_SETTINGS,
  medalGameSettings: DEFAULT_MEDAL_GAME_SETTINGS,
  useSeparateMedalSettings: true,  // Default: pool=1 game, medals=best of 3
  timingSettings: DEFAULT_PLANNER_TIMING_SETTINGS,
  divisions: [],
};

/**
 * Match preset configurations
 * Now includes separate pool and per-round medal game settings
 */
export const MATCH_PRESETS: Record<MatchPreset, {
  gameSettings: PlannerGameSettings;           // Legacy/default
  poolGameSettings: PlannerGameSettings;       // Pool play scoring
  medalGameSettings: PlannerGameSettings;      // Medal rounds scoring - legacy simple mode
  useSeparateMedalSettings: boolean;           // Whether pool ≠ medal
  // Per-round medal settings
  medalRoundSettings?: {
    quarterFinals?: PlannerGameSettings;
    semiFinals?: PlannerGameSettings;
    finals?: PlannerGameSettings;
    bronze?: PlannerGameSettings;
  };
  label: string;
  description: string;
  poolDescription: string;
  medalDescription: string;
  estimatedMinutes: number;                    // Average across both
  poolEstimatedMinutes: number;
  medalEstimatedMinutes: number;
}> = {
  quick: {
    gameSettings: { pointsToWin: 11, winBy: 1, bestOf: 1 },
    poolGameSettings: { pointsToWin: 11, winBy: 1, bestOf: 1 },
    medalGameSettings: { pointsToWin: 11, winBy: 1, bestOf: 1 },
    useSeparateMedalSettings: false,
    // Quick: all rounds Bo1
    medalRoundSettings: {
      quarterFinals: { pointsToWin: 11, winBy: 1, bestOf: 1 },
      semiFinals: { pointsToWin: 11, winBy: 1, bestOf: 1 },
      finals: { pointsToWin: 11, winBy: 1, bestOf: 1 },
      bronze: { pointsToWin: 11, winBy: 1, bestOf: 1 },
    },
    label: 'Quick',
    description: '11 pts, Win by 1, 1 game',
    poolDescription: '1 game to 11',
    medalDescription: '1 game to 11',
    estimatedMinutes: 10,
    poolEstimatedMinutes: 10,
    medalEstimatedMinutes: 10,
  },
  standard: {
    gameSettings: { pointsToWin: 11, winBy: 2, bestOf: 1 },
    poolGameSettings: { pointsToWin: 11, winBy: 2, bestOf: 1 },
    medalGameSettings: { pointsToWin: 11, winBy: 2, bestOf: 3 },
    useSeparateMedalSettings: true,
    // Standard: QF/SF = Bo1, Gold/Bronze = Bo3
    medalRoundSettings: {
      quarterFinals: { pointsToWin: 11, winBy: 2, bestOf: 1 },
      semiFinals: { pointsToWin: 11, winBy: 2, bestOf: 1 },
      finals: { pointsToWin: 11, winBy: 2, bestOf: 3 },
      bronze: { pointsToWin: 11, winBy: 2, bestOf: 3 },
    },
    label: 'Standard',
    description: 'Pool: 1 game • Gold/Bronze: Best of 3',
    poolDescription: '1 game to 11',
    medalDescription: 'Gold/Bronze: Bo3',
    estimatedMinutes: 15,
    poolEstimatedMinutes: 12,
    medalEstimatedMinutes: 28,
  },
  finals: {
    gameSettings: { pointsToWin: 15, winBy: 2, bestOf: 3 },
    poolGameSettings: { pointsToWin: 11, winBy: 2, bestOf: 1 },
    medalGameSettings: { pointsToWin: 15, winBy: 2, bestOf: 3 },
    useSeparateMedalSettings: true,
    // Pro: QF = Bo1, SF/Gold/Bronze = Bo3 to 15
    medalRoundSettings: {
      quarterFinals: { pointsToWin: 11, winBy: 2, bestOf: 1 },
      semiFinals: { pointsToWin: 15, winBy: 2, bestOf: 3 },
      finals: { pointsToWin: 15, winBy: 2, bestOf: 3 },
      bronze: { pointsToWin: 15, winBy: 2, bestOf: 3 },
    },
    label: 'Pro',
    description: 'Pool: 1 game • SF+Finals: Best of 3 to 15',
    poolDescription: '1 game to 11',
    medalDescription: 'SF+Finals: Bo3 to 15',
    estimatedMinutes: 20,
    poolEstimatedMinutes: 12,
    medalEstimatedMinutes: 40,
  },
  custom: {
    gameSettings: { pointsToWin: 11, winBy: 2, bestOf: 1 },
    poolGameSettings: { pointsToWin: 11, winBy: 2, bestOf: 1 },
    medalGameSettings: { pointsToWin: 11, winBy: 2, bestOf: 3 },
    useSeparateMedalSettings: true,
    // Custom: starts same as Standard, user can edit
    medalRoundSettings: {
      quarterFinals: { pointsToWin: 11, winBy: 2, bestOf: 1 },
      semiFinals: { pointsToWin: 11, winBy: 2, bestOf: 1 },
      finals: { pointsToWin: 11, winBy: 2, bestOf: 3 },
      bronze: { pointsToWin: 11, winBy: 2, bestOf: 3 },
    },
    label: 'Custom',
    description: 'Your settings',
    poolDescription: 'Custom',
    medalDescription: 'Custom',
    estimatedMinutes: 15,
    poolEstimatedMinutes: 12,
    medalEstimatedMinutes: 28,
  },
};

// ============================================
// PHASE 2: SCHEDULE BUILDER TYPES
// ============================================

/**
 * Types of scheduling conflicts
 */
export type ConflictType =
  | 'player_double_booked'    // Same player in 2 matches at same time
  | 'insufficient_rest'       // Player doesn't have enough rest between matches
  | 'court_double_booked'     // Same court assigned to 2 matches
  | 'bracket_dependency';     // Match scheduled before its prerequisite

/**
 * A scheduling conflict detected in the schedule
 */
export interface ScheduleConflict {
  id: string;
  type: ConflictType;
  severity: 'error' | 'warning';
  message: string;

  // Affected entities
  matchIds: string[];
  playerIds?: string[];
  courtId?: string;

  // Time info
  scheduledTime: string;

  // Resolution options
  canAutoFix: boolean;
  autoFixDescription?: string;
  ignored: boolean;
}

/**
 * A scheduled match slot
 */
export interface ScheduledMatch {
  matchId: string;
  divisionId: string;
  divisionName: string;

  // Match details
  stage: 'pool' | 'bracket' | 'medal';
  roundNumber?: number;
  matchNumber: number;

  // Participants
  teamA: {
    name: string;
    playerIds: string[];
  };
  teamB: {
    name: string;
    playerIds: string[];
  };

  // Schedule
  courtId: string;
  courtName: string;
  dayId: string;
  scheduledTime: string;       // "09:00"
  estimatedEndTime: string;    // "09:25"
  durationMinutes: number;

  // Status
  isLocked: boolean;           // Can't be moved by auto-scheduler
  hasConflict: boolean;
}

/**
 * Division schedule block for timeline
 */
export interface DivisionScheduleBlock {
  divisionId: string;
  divisionName: string;
  dayId: string;
  startTime: string;
  endTime: string;
  matchCount: number;
  stage: 'pool' | 'bracket' | 'all';
  color: string;
}

/**
 * Court availability for a day
 */
export interface CourtAvailability {
  courtId: string;
  courtName: string;
  dayId: string;
  available: boolean;
  startTime?: string;
  endTime?: string;
}

/**
 * Schedule Builder settings and state
 */
export interface ScheduleBuilderState {
  tournamentId: string;

  // Configuration
  courts: CourtAvailability[];
  enabledDivisions: string[];

  // Generated schedule
  matches: ScheduledMatch[];
  divisionBlocks: DivisionScheduleBlock[];

  // Conflicts
  conflicts: ScheduleConflict[];
  unresolvedConflictCount: number;

  // Status
  isGenerated: boolean;
  isPublished: boolean;
  lastGeneratedAt?: number;
  lastPublishedAt?: number;
}

/**
 * Schedule generation options
 */
export interface ScheduleGenerationOptions {
  // Timing
  minRestMinutes: number;          // Min rest between matches for same player
  slotDurationMinutes: number;     // Match slot duration

  // Preferences
  prioritizeEarlyFinish: boolean;  // Finish divisions ASAP vs spread out
  balanceCourtUsage: boolean;      // Distribute matches evenly across courts
  keepPoolsTogether: boolean;      // Schedule pool matches consecutively

  // Conflict handling
  autoResolveConflicts: boolean;   // Try to auto-fix conflicts
}

/**
 * Default schedule generation options
 */
export const DEFAULT_SCHEDULE_OPTIONS: ScheduleGenerationOptions = {
  minRestMinutes: 15,
  slotDurationMinutes: 25,
  prioritizeEarlyFinish: true,
  balanceCourtUsage: true,
  keepPoolsTogether: true,
  autoResolveConflicts: true,
};

// ============================================
// V06.33 RESULTS TABLE ARCHITECTURE
// Canonical subcollections for pool results and bracket seeding
// ============================================

/**
 * Pool result row - individual team standing in a pool
 */
export interface PoolResultRow {
  rank: number;
  teamId: string;
  name: string;
  wins: number;
  losses: number;
  pf: number;   // Points for
  pa: number;   // Points against
  diff: number; // Point differential
}

/**
 * Pool result document - stored at tournaments/{tId}/divisions/{dId}/poolResults/{poolKey}
 *
 * Canonical, persisted pool standings that bracket generation reads directly.
 * Prevents wrong participants in medal brackets caused by rank leakage.
 */
export interface PoolResultDoc {
  poolKey: string;              // "pool-a"
  poolName: string;             // "Pool A"
  divisionId: string;
  tournamentId: string;
  generatedAt: number;
  calculationVersion: string;   // "v06.33"
  testData: boolean;
  matchesUpdatedAtMax: number;  // Watermark: latest match.updatedAt used
  rows: PoolResultRow[];
}

// ============================================
// LEAGUE STANDINGS (V07.14)
// Same pattern as tournament poolResults
// ============================================

/**
 * League standings row - one entry per member
 *
 * V07.14: Stored at leagues/{leagueId}/standings/{standingsKey}
 */
export interface LeagueStandingsRow {
  rank: number;
  memberId: string;
  displayName: string;
  partnerDisplayName?: string | null;

  // Core stats
  wins: number;
  losses: number;
  played: number;

  // Points (game scores)
  pointsFor: number;      // Total points scored
  pointsAgainst: number;  // Total points conceded
  pointDiff: number;      // PF - PA

  // Games (in multi-game matches)
  gamesWon: number;
  gamesLost: number;
  gameDiff: number;

  // League points (3 for win, 0 for loss, etc.)
  leaguePoints: number;

  // Win rate for display
  winRate: number;        // 0-100
}

/**
 * League standings document - stored at leagues/{leagueId}/standings/{standingsKey}
 *
 * Canonical, persisted standings that UI reads directly.
 * Matches are truth - this is a calculated snapshot.
 *
 * V07.14: Same pattern as tournament PoolResultDoc
 * - Freshness tracking with matchesUpdatedAtMax
 * - Fail loudly if data is broken
 * - DUPR aware - exclude rejected matches
 */
export interface LeagueStandingsDoc {
  // Identity
  standingsKey: string;           // "overall", "week-1", "week-2", etc.
  leagueId: string;
  weekNumber: number | null;      // null for overall, 1+ for weekly

  // Freshness tracking (CRITICAL for stale detection)
  generatedAt: number;            // When this snapshot was calculated
  matchesUpdatedAtMax: number;    // Latest match.updatedAt used in calculation
  calculationVersion: string;     // "v07.14" - tracks algorithm changes

  // Stats
  totalMatches: number;           // Total matches used in calculation
  completedMatches: number;       // Completed matches counted

  // The standings rows
  rows: LeagueStandingsRow[];

  // Validation
  errors: string[];               // Any data issues found (for debugging)
}

/**
 * Bracket slot metadata - team info with pool context
 */
export interface BracketSlot {
  teamId: string;
  name: string;
  poolKey: string;
  poolName: string;
  rank: number;
  // Stats for debugging/results page
  wins: number;
  losses: number;
  pf: number;
  pa: number;
  diff: number;
}

/**
 * Round 1 pair - defines a single Round 1 match
 */
export interface Round1Pair {
  matchNum: number;           // 1, 2, 3, 4...
  sideA: string | null;       // Slot key like "A1", or null for BYE
  sideB: string | null;       // Slot key or null for BYE
}

/**
 * Bracket seeds document - stored at tournaments/{tId}/divisions/{dId}/bracketSeeds/{bracketType}
 *
 * Canonical bracket seeding that match generation reads directly.
 * Prevents bracket scattering caused by placementBracket() rearrangement.
 */
export interface BracketSeedsDoc {
  bracketType: 'main' | 'plate';
  generatedAt: number;
  qualifiersPerPool: number;    // K value
  poolCount: number;            // P value
  method: 'mirror';
  testData: boolean;

  // Bracket structure
  bracketSize: number;          // nextPow2(totalQualifiers)
  rounds: number;               // log2(bracketSize)
  round1MatchCount: number;     // bracketSize / 2

  // V06.39: Third place match support
  thirdPlaceMatch?: boolean;    // Whether bracket has 3rd place match (bronze for main, 3rd for plate)

  // Slots with FULL metadata (for debugging + results page)
  slots: {
    [slotKey: string]: BracketSlot;  // "A1", "A2", "B1", etc.
  };

  // Round 1 pairs - bracket generator creates matches DIRECTLY from this
  round1Pairs: Round1Pair[];
}

// ============================================
// V07.04 DUPR-COMPLIANT SCORING SYSTEM
// Three-tier model: scoreProposal → officialResult → dupr
// ============================================

/**
 * Score state progression for DUPR compliance
 * Match is NOT complete until organizer finalises (scoreState = 'official')
 */
export type ScoreState =
  | 'none'              // No score submitted
  | 'proposed'          // Player submitted score proposal
  | 'signed'            // Opponent acknowledged proposal
  | 'disputed'          // Opponent disputed proposal
  | 'official'          // Organizer finalized official result
  | 'submittedToDupr';  // Successfully submitted to DUPR

/**
 * Player-submitted score proposal (NOT the official result)
 * Becomes immutable once signed/disputed (except organizer can override)
 */
export interface ScoreProposal {
  scores: GameScore[];
  winnerId: string;
  winnerName?: string;
  enteredByUserId: string;
  enteredAt: number;
  status: 'proposed' | 'signed' | 'disputed';

  // Signer validation (MUST be on opposing team, not same user)
  signedByUserId?: string;
  signedAt?: number;

  // Dispute tracking
  disputedByUserId?: string;
  disputedAt?: number;
  disputeReason?: string;

  // Immutability flag (set true when signed/disputed)
  locked?: boolean;
}

/**
 * Official result - written ONLY by organizer
 * This is the canonical score used for standings and DUPR submission
 */
export interface OfficialResult {
  scores: GameScore[];
  winnerId: string;
  winnerName?: string;
  finalisedByUserId: string;
  finalisedAt: number;

  // Versioning for correction workflow
  version: number;
  previousVersions?: OfficialResultVersion[];
}

/**
 * Archived version of official result (for correction audit trail)
 */
export interface OfficialResultVersion {
  version: number;
  scores: GameScore[];
  winnerId: string;
  finalisedByUserId: string;
  finalisedAt: number;
  supersededAt: number;
  supersededByUserId: string;
  correctionReason?: string;
}

/**
 * DUPR submission tracking - server-side only
 * No client can directly trigger DUPR submission
 */
export interface DuprSubmissionData {
  eligible: boolean;
  submitted: boolean;
  submittedAt?: number;
  submissionId?: string;
  submissionError?: string;

  // Server-side tracking (NO client submittedByUserId)
  batchId?: string;              // Batch submission tracking
  retryCount?: number;           // Retry attempts
  lastRetryAt?: number;          // Last retry timestamp
  nextRetryAt?: number;          // Scheduled retry time

  // Correction workflow
  needsCorrection?: boolean;     // Set true when officialResult changes post-submission
  correctionSubmitted?: boolean;
  correctionSubmittedAt?: number;
  correctionBatchId?: string;
}

/**
 * DUPR submission batch - tracks batch submissions
 * Collection: dupr_submission_batches
 */
export interface DuprSubmissionBatch {
  id: string;
  eventId: string;
  eventType: 'tournament' | 'league';
  matchIds: string[];
  status: 'pending' | 'processing' | 'completed' | 'partial_failure';
  createdAt: number;
  createdByUserId: string;
  processedAt?: number;
  results: {
    matchId: string;
    success: boolean;
    duprMatchId?: string;
    error?: string;
  }[];
  retryCount: number;
  nextRetryAt?: number;
}

/**
 * Snapshot of team player IDs at match creation
 * Used for signer validation in Firestore rules
 */
export interface TeamSnapshot {
  sideAPlayerIds: string[];
  sideBPlayerIds: string[];
  snapshotAt: number;
}

// ============================================
// TOURNAMENT COMMUNICATIONS (V07.08)
// ============================================

/**
 * Message channel type
 */
export type CommsMessageType = 'sms' | 'email';

/**
 * Message delivery status (MVP: simple flow)
 * pending → sent | failed
 */
export type CommsMessageStatus = 'pending' | 'sent' | 'failed';

/**
 * Template category for organizing message templates
 */
export type CommsTemplateCategory =
  | 'briefing'           // Day briefing, welcome messages
  | 'score_reminder'     // Missing score notifications
  | 'match_notification' // Match assignments, court calls
  | 'court_assignment'   // Court assignment notifications
  | 'results'            // Match results, standings updates
  | 'custom';            // Custom/ad-hoc messages

/**
 * Reusable message template
 * Collection: comms_templates/{templateId}
 *
 * Templates use {{placeholder}} syntax for variable substitution.
 * The `variables` array documents expected placeholders.
 */
export interface CommsTemplate {
  // Note: id comes from Firestore document ID, not stored in document
  name: string;
  type: CommsMessageType;
  category: CommsTemplateCategory;
  subject: string | null;  // Email subject (null for SMS)
  body: string;            // Message body with {{placeholders}}
  variables: string[];     // Expected placeholder names
  isActive: boolean;
  createdBy: string;       // User ID
  createdAt: number;
  updatedAt: number;
}

/**
 * Queued message for sending via Cloud Functions
 * Collection: tournaments/{tournamentId}/comms_queue/{messageId}
 *
 * This collection serves as both queue (pending) and history (sent/failed).
 * Cloud Functions process pending messages and update status.
 */
export interface CommsQueueMessage {
  // Note: id comes from Firestore document ID, not stored in document
  type: CommsMessageType;
  status: CommsMessageStatus;

  // Recipient (required)
  recipientId: string;           // User ID
  recipientName: string;         // Display name
  recipientEmail: string | null; // Required for email type
  recipientPhone: string | null; // Required for SMS type (E.164 format)

  // Content
  body: string;                  // Resolved message body (required)
  subject?: string | null;       // Resolved subject (for email)
  templateId?: string | null;    // Reference to template used
  templateData?: Record<string, string> | null; // Merge field values

  // Scope - ONE of tournamentId or leagueId is required
  tournamentId?: string;         // Parent tournament (for tournament comms)
  leagueId?: string;             // Parent league (for league comms)
  divisionId?: string | null;    // Optional division filter
  poolGroup?: string | null;     // Optional pool filter (tournaments only)
  matchId?: string | null;       // Related match (for score reminders)

  // Timestamps
  createdAt: number;
  createdBy: string;             // User ID who queued message
  sentAt?: number | null;        // When successfully sent
  failedAt?: number | null;      // When failed (final)

  // Error info
  error?: string | null;         // Error message if failed

  // Concurrency control (MVP safe sending)
  lockedAt?: number | null;      // When Cloud Function claimed message
  lockedBy?: string | null;      // Function instance ID

  // Retry tracking
  retried: boolean;              // True if this is a retry attempt
  retryOf?: string | null;       // Original message ID if retried
}

// ============================================
// SMS CREDITS SYSTEM (V07.19)
// ============================================

/**
 * SMS credits balance for an organizer
 * Collection: sms_credits/{odUserId}
 */
export interface SMSCredits {
  odUserId: string;
  balance: number;           // SMS credits remaining
  totalPurchased: number;    // All-time purchased credits
  totalUsed: number;         // All-time used credits
  totalFreeCredits: number;  // Free credits given (e.g., sign-up bonus)
  lastTopUpAt?: number;      // Timestamp of last purchase
  lastUsedAt?: number;       // Timestamp of last SMS sent
  createdAt: number;
  updatedAt: number;
}

/**
 * SMS usage log entry
 * Collection: sms_credits/{odUserId}/usage/{usageId}
 */
export interface SMSUsage {
  id: string;
  messageId: string;         // Reference to comms_queue message
  tournamentId?: string;     // Tournament that triggered this SMS
  leagueId?: string;         // League that triggered this SMS
  recipientPhone: string;    // E.164 phone number
  recipientName?: string;    // Recipient display name
  status: 'sent' | 'failed'; // Delivery status
  creditsUsed: number;       // Credits deducted (usually 1)
  createdAt: number;
}

/**
 * SMS bundle product for purchase
 * Collection: sms_bundles/{bundleId}
 */
export interface SMSBundle {
  id: string;
  name: string;              // "Starter Pack", "Pro Pack", "Enterprise"
  description?: string;      // Bundle description
  credits: number;           // Number of SMS credits (50, 200, 500)
  priceNZD: number;          // Price in cents (1000 = $10.00)
  isActive: boolean;         // Whether bundle is available for purchase
  sortOrder: number;         // Display order (lower = first)
  createdAt?: number;
  updatedAt?: number;
}

/**
 * SMS purchase transaction record
 * Collection: sms_credits/{odUserId}/purchases/{purchaseId}
 */
export interface SMSPurchase {
  id: string;
  bundleId: string;
  bundleName: string;
  credits: number;
  amountNZD: number;         // Amount paid in cents
  stripeSessionId?: string;  // Stripe Checkout session ID
  stripePaymentIntentId?: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  createdAt: number;
  completedAt?: number;
}

/**
 * Default SMS bundles (seeded to sms_bundles collection)
 */
export const DEFAULT_SMS_BUNDLES: Omit<SMSBundle, 'id'>[] = [
  {
    name: 'Starter Pack',
    description: '50 SMS credits - great for small tournaments',
    credits: 50,
    priceNZD: 1000,  // $10.00
    isActive: true,
    sortOrder: 1,
  },
  {
    name: 'Pro Pack',
    description: '200 SMS credits - best value for regular organizers',
    credits: 200,
    priceNZD: 3500,  // $35.00
    isActive: true,
    sortOrder: 2,
  },
  {
    name: 'Enterprise Pack',
    description: '500 SMS credits - for high-volume events',
    credits: 500,
    priceNZD: 7500,  // $75.00
    isActive: true,
    sortOrder: 3,
  },
];

/**
 * Number of free SMS credits given to new organizers
 */
export const FREE_STARTER_SMS_CREDITS = 25;


/**
 * Pickleball Director - Type Definitions V06.00
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

// ============================================
// USER & PROFILE TYPES
// ============================================

export type UserRole = 'player' | 'organizer' | 'app_admin';

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
  bio?: string;
  photoURL?: string;
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

export interface ClubCourt {
  id: string;
  name: string;
  type: 'indoor' | 'outdoor';
  surface?: string;
  isActive: boolean;
  hourlyRate?: number;
  peakHourlyRate?: number;
  order?: number;
}

export interface ClubBookingSettings {
  enabled: boolean;
  advanceBookingDays: number;
  minBookingMinutes: number;
  maxBookingMinutes: number;
  cancellationMinutes: number;
  peakHours?: { start: string; end: string; days: number[] };
  blockedTimes?: { dayOfWeek: number; start: string; end: string; reason?: string }[];
}

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
}

// ============================================
// TOURNAMENT TYPES
// ============================================

export type EventType = 'singles' | 'doubles' | 'mixed_doubles';
export type GenderCategory = 'open' | 'mens' | 'womens' | 'mixed';
export type MatchStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'bye';
export type PaymentStatus = 'pending' | 'processing' | 'paid' | 'failed' | 'refunded';

export interface Tournament {
  id: string;
  name: string;
  description: string;
  bannerUrl?: string;
  startDate: number;
  endDate: number;
  registrationDeadline: number;
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
  prizePool?: number;
  rules?: string;
  createdAt: number;
  updatedAt: number;
  settings?: TournamentSettings;
  stripeConnectedAccountId?: string;
  stripeProductId?: string;
  stripePriceId?: string;
  divisions?: Division[];
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
  maxTeams?: number;
  entryFee?: number;
  format: DivisionFormat;
  status: 'setup' | 'ready' | 'in_progress' | 'completed';
  createdAt: number;
  updatedAt: number;
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

  // Match settings
  bestOfGames?: 1 | 3 | 5;
  pointsPerGame?: 11 | 15 | 21;
  winBy?: 1 | 2;
  hasBronzeMatch?: boolean;

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
  odTeamId: string;
  odAccountId?: string;
  odOrganizationId?: string;
  tournamentId: string;
  divisionId: string;
  name: string;
  playerIds: string[];
  players?: { odUserId: string; name: string; email?: string }[];
  seed?: number;
  poolGroup?: string;
  status: 'registered' | 'confirmed' | 'checked_in' | 'active' | 'eliminated' | 'withdrawn';
  registeredAt: number;
  registeredByUserId: string;
  paymentStatus?: PaymentStatus;
  checkInAt?: number;
}

export interface Match {
  id: string;
  tournamentId: string;
  divisionId: string;
  round: number;
  matchNumber: number;
  stage: 'pool' | 'bracket' | 'finals' | 'consolation';
  poolGroup?: string;
  team1Id?: string;
  team2Id?: string;
  team1Name?: string;
  team2Name?: string;
  team1Seed?: number;
  team2Seed?: number;
  winnerId?: string;
  loserId?: string;
  scores: GameScore[];
  status: MatchStatus;
  courtId?: string;
  courtName?: string;
  scheduledTime?: number;
  startedAt?: number;
  completedAt?: number;
  nextMatchId?: string;
  nextMatchSlot?: 'team1' | 'team2';
  loserNextMatchId?: string;
  loserNextMatchSlot?: 'team1' | 'team2';
  isBye: boolean;
  bracketPosition?: number;
  createdAt: number;
  updatedAt: number;
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
  gameNumber: number;
  scoreA: number;
  scoreB: number;
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
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDifferential: number;
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
export type LeagueStatus = 'draft' | 'registration' | 'active' | 'completed' | 'cancelled';

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
  refundPolicy: 'full' | 'partial' | 'none';
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
  // NEW V05.37: Pool support
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
 * Tiebreaker options
 */
export type LeagueTiebreaker = 
  | 'head_to_head'
  | 'game_diff'
  | 'games_won'
  | 'games_lost'
  | 'points_for'
  | 'points_against'
  | 'recent_form';

// ============================================
// LEAGUE DUPR SETTINGS (V05.36)
// ============================================

/**
 * DUPR integration mode for leagues
 */
export type LeagueDuprMode = 'none' | 'optional' | 'required';

/**
 * DUPR integration settings for leagues
 */
export interface LeagueDuprSettings {
  mode: LeagueDuprMode;
  autoSubmit: boolean;
  submitTrigger: 'on_confirmation' | 'on_completion' | 'manual';
  duprClubId?: string | null;
  useDuprForSkillLevel: boolean;
  minDuprRating?: number | null;
  maxDuprRating?: number | null;
  ratingType: 'singles' | 'doubles' | 'both';
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
  // Recurring schedule config (V05.35)
  scheduleConfig?: {
    numberOfWeeks: number;
    matchDays: DayOfWeek[];
    matchStartTime: string;
    matchEndTime: string;
    matchNights: string[];
  };
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
  matchesPlayed: number;
  paidMemberCount?: number;
  totalCollected?: number;
  
  // Has divisions?
  hasDivisions: boolean;
  
  // Timestamps
  createdAt: number;
  updatedAt: number;
}

// ============================================
// LEAGUE MEMBER TYPES (UPDATED V05.37)
// ============================================

export type MembershipStatus = 'pending' | 'active' | 'suspended' | 'withdrawn';
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
 * League partner invite
 */
export interface LeaguePartnerInvite {
  id: string;
  leagueId: string;
  divisionId?: string | null;
  teamId: string;
  inviterId: string;
  inviterName: string;
  invitedUserId: string;
  invitedUserName?: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
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

  // Score verification (NEW V05.44)
  verification?: MatchVerificationData | null;

  // Timestamps
  createdAt: number;
  playedAt?: number | null;
  completedAt?: number | null;
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

export type CompetitionType = 'casual' | 'round_robin' | 'ladder' | 'tournament' | 'box_league';
export type CompetitionStatus = 'draft' | 'registration_open' | 'in_progress' | 'completed' | 'cancelled';

export interface CompetitionDivision {
  id: string;
  name: string;
  skillLevelMin?: number;
  skillLevelMax?: number;
  ageMin?: number;
  ageMax?: number;
  gender?: 'open' | 'mens' | 'womens' | 'mixed';
}

export interface CompetitionEntry {
  odUserId: string;
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

// Export new match types
export type {
  GameScore,
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
  format: CompetitionFormat;
  expectedPlayers: number;

  // DUPR rating requirements
  minRating?: number;  // e.g., 3.0
  maxRating?: number;  // e.g., 4.5

  // Pool settings (for pool_play_medals format)
  poolSize?: number;

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
  medalGameSettings: PlannerGameSettings;      // Medal rounds scoring (e.g., best of 3)
  useSeparateMedalSettings: boolean;           // Whether to use different settings for medals
  timingSettings: PlannerTimingSettings;

  // Step 4: Divisions
  divisions: PlannerDivision[];
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
 * Now includes separate pool and medal game settings
 */
export const MATCH_PRESETS: Record<MatchPreset, {
  gameSettings: PlannerGameSettings;           // Legacy/default
  poolGameSettings: PlannerGameSettings;       // Pool play scoring
  medalGameSettings: PlannerGameSettings;      // Medal rounds scoring
  useSeparateMedalSettings: boolean;           // Whether pool ≠ medal
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
    label: 'Standard',
    description: 'Pool: 1 game • Medals: Best of 3',
    poolDescription: '1 game to 11',
    medalDescription: 'Best of 3 to 11',
    estimatedMinutes: 15,
    poolEstimatedMinutes: 12,
    medalEstimatedMinutes: 28,
  },
  finals: {
    gameSettings: { pointsToWin: 15, winBy: 2, bestOf: 3 },
    poolGameSettings: { pointsToWin: 11, winBy: 2, bestOf: 1 },
    medalGameSettings: { pointsToWin: 15, winBy: 2, bestOf: 3 },
    useSeparateMedalSettings: true,
    label: 'Pro',
    description: 'Pool: 1 game • Medals: Best of 3 to 15',
    poolDescription: '1 game to 11',
    medalDescription: 'Best of 3 to 15',
    estimatedMinutes: 20,
    poolEstimatedMinutes: 12,
    medalEstimatedMinutes: 40,
  },
  custom: {
    gameSettings: { pointsToWin: 11, winBy: 2, bestOf: 1 },
    poolGameSettings: { pointsToWin: 11, winBy: 2, bestOf: 1 },
    medalGameSettings: { pointsToWin: 11, winBy: 2, bestOf: 3 },
    useSeparateMedalSettings: true,
    label: 'Custom',
    description: 'Your settings',
    poolDescription: 'Custom',
    medalDescription: 'Custom',
    estimatedMinutes: 15,
    poolEstimatedMinutes: 12,
    medalEstimatedMinutes: 28,
  },
};


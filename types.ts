/**
 * Pickleball Director - Type Definitions
 * 
 * Central type definitions for the entire application.
 * 
 * FILE LOCATION: types.ts
 * VERSION: V05.34
 * 
 * CHANGELOG V05.34:
 * - Added LeagueVenueSettings, LeagueCourt, LeagueTimeSlot, DayOfWeek
 * - Updated LeagueSettings to include venueSettings
 * - Updated LeagueMatch to include timeSlotId, startTime, endTime
 */

// ============================================
// BASIC TYPES & ENUMS
// ============================================

export type Visibility = 'public' | 'linkOnly' | 'private';
export type TournamentStatus = 'draft' | 'registration' | 'active' | 'completed' | 'cancelled';
export type RegistrationMode = 'open' | 'invite_only' | 'approval_required';
export type SchedulingMode = 'live_courts' | 'scheduled' | 'manual';
export type SeedingMethod = 'random' | 'manual' | 'rating_based' | 'sign_up_order';
export type TieBreaker = 'head_to_head' | 'point_differential' | 'points_for' | 'games_won' | 'buchholz';
export type FeePaidBy = 'player' | 'organizer' | 'split';
export type RefundPolicy = 'full' | 'partial' | 'none';
export type PartnerFindingMode = 'invite_partner' | 'open_team' | 'join_open' | 'assigned';
export type EventType = 'singles' | 'doubles' | 'mixed_doubles' | 'team';
export type GenderCategory = 'open' | 'men' | 'women' | 'mixed';

// ============================================
// USER TYPES
// ============================================

export interface UserProfile {
  odUserId: string;
  odUserName: string;
  displayName: string;
  email: string;
  photoURL?: string | null;
  photoData?: string | null;
  phone?: string;
  duprId?: string | null;
  duprRating?: number | null;
  homeClub?: string;
  dateOfBirth?: string;
  gender?: 'male' | 'female' | 'other' | 'prefer_not_to_say';
  isOrganizer?: boolean;
  isAppAdmin?: boolean;
  stripeConnectedAccountId?: string | null;
  stripeOnboardingComplete?: boolean;
  stripeChargesEnabled?: boolean;
  stripePayoutsEnabled?: boolean;
  createdAt: number;
  updatedAt: number;
}

// ============================================
// CLUB TYPES
// ============================================

export interface Club {
  id: string;
  name: string;
  description?: string;
  region?: string;
  logoUrl?: string;
  website?: string;
  email?: string;
  phone?: string;
  memberCount?: number;
  adminUserIds: string[];
  adminNames?: string[];
  members?: ClubMember[];
  stripeConnectedAccountId?: string | null;
  stripeOnboardingComplete?: boolean;
  stripeChargesEnabled?: boolean;
  stripePayoutsEnabled?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ClubMember {
  odUserId: string;
  odUserName: string;
  role: 'owner' | 'admin' | 'member';
  status: 'active' | 'pending' | 'suspended';
  joinedAt: number;
}

// ============================================
// CLUB COURT BOOKING TYPES
// ============================================

export interface ClubCourt {
  id: string;
  clubId: string;
  name: string;
  order: number;
  active: boolean;
  surface?: string;
  indoor?: boolean;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ClubBookingSettings {
  id: string;
  clubId: string;
  enabled: boolean;
  slotDurationMinutes: number;
  maxAdvanceBookingDays: number;
  maxSlotsPerBooking: number;
  cancellationMinutes: number;
  openTime: string;
  closeTime: string;
  pricing: {
    enabled: boolean;
    pricePerSlot: number;
    memberDiscount: number;
    peakHoursEnabled: boolean;
    peakHoursStart?: string;
    peakHoursEnd?: string;
    peakHoursMultiplier?: number;
  };
  createdAt: number;
  updatedAt: number;
}

export interface CourtBooking {
  id: string;
  clubId: string;
  courtId: string;
  courtName: string;
  userId: string;
  userName: string;
  date: string;
  startTime: string;
  endTime: string;
  status: 'confirmed' | 'cancelled' | 'pending';
  amountPaid?: number;
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  cancelledAt?: number;
  cancelReason?: string;
  createdAt: number;
  updatedAt: number;
}

// ============================================
// TOURNAMENT TYPES
// ============================================

export interface Tournament {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  logoUrl?: string;
  sport: string;
  startDatetime: string;
  venue: string;
  visibility: Visibility;
  status: TournamentStatus;
  createdByUserId: string;
  registrationMode?: RegistrationMode;
  registrationOpen?: boolean;
  maxParticipants?: number;
  clubId: string;
  clubName: string;
  clubLogoUrl?: string | null;
  settings?: TournamentSettings;
}

export interface TournamentSettings {
  schedulingMode: SchedulingMode;
  totalCourts?: number;
  defaultMatchDurationMinutes?: number;
}

export interface TournamentRegistration {
  id: string;
  tournamentId: string;
  playerId: string;
  status: 'in_progress' | 'completed' | 'withdrawn';
  waiverAccepted: boolean;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  selectedEventIds: string[];
  partnerDetails?: Record<string, {
    mode: 'invite' | 'open_team' | 'join_open';
    partnerUserId?: string;
    openTeamId?: string;
    partnerName?: string;
    id?: string;
    name?: string;
    teamId?: string;
    teamName?: string;
  }>;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface CustomField {
  id: string;
  label: string;
  type: 'text' | 'dropdown';
  required: boolean;
  options?: string[];
}

// ============================================
// DIVISION TYPES
// ============================================

export type StageMode = 'single_stage' | 'two_stage';
export type MainFormat = 'round_robin' | 'single_elim' | 'double_elim' | 'ladder' | 'leaderboard' | 'swiss';
export type Stage1Format = 'round_robin_pools';
export type Stage2Format = 'single_elim' | 'double_elim' | 'medal_rounds';
export type PlateFormat = 'single_elim' | 'round_robin';

export interface DivisionFormat {
  stageMode: StageMode;
  mainFormat?: MainFormat | null;
  stage1Format?: Stage1Format | null;
  stage2Format?: Stage2Format | null;
  numberOfPools?: number | null;
  teamsPerPool?: number | null;
  advanceToMainPerPool?: number | null;
  advanceToPlatePerPool?: number | null;
  plateEnabled: boolean;
  plateFormat?: PlateFormat | null;
  plateName?: string | null;
  bestOfGames: 1 | 3 | 5;
  pointsPerGame: 11 | 15 | 21;
  winBy: 1 | 2;
  hasBronzeMatch: boolean;
  seedingMethod?: SeedingMethod;
  tieBreakerPrimary?: TieBreaker;
  tieBreakerSecondary?: TieBreaker;
  tieBreakerTertiary?: TieBreaker;
}

export interface Division {
  id: string;
  tournamentId: string;
  name: string;
  type: EventType;
  gender: GenderCategory;
  format: DivisionFormat;
  maxTeams?: number | null;
  registrationOpen: boolean;
  minRating?: number | null;
  maxRating?: number | null;
  minAge?: number | null;
  maxAge?: number | null;
  order?: number;
  pricing?: {
    entryFee?: number;
    feesPaidBy?: FeePaidBy;
  };
  partnerSettings?: {
    allowInvitePartner: boolean;
    allowOpenTeam: boolean;
    allowJoinOpen: boolean;
  };
  createdAt?: number;
  updatedAt?: number;
}

// ============================================
// TEAM TYPES
// ============================================

export interface Team {
  id: string;
  tournamentId: string;
  divisionId: string;
  type: EventType;
  teamName?: string | null;
  captainPlayerId: string;
  status: 'pending_partner' | 'active' | 'cancelled' | 'withdrawn';
  isLookingForPartner?: boolean;
  players: string[];
  pendingInvitedUserId?: string | null;
  createdAt?: number;
  updatedAt?: number;
  participants?: UserProfile[];
}

export interface PartnerInvite {
  id: string;
  tournamentId: string;
  divisionId: string;
  teamId: string;
  inviterId: string;
  invitedUserId: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  inviteToken?: string | null;
  createdAt: number;
  respondedAt?: number | null;
  expiresAt?: number | null;
}

// ============================================
// MATCH TYPES
// ============================================

export interface GameScore {
  gameNumber?: number;
  scoreA: number;
  scoreB: number;
}

export interface Match {
  id: string;
  tournamentId: string;
  divisionId: string;
  scorekeeperUserId?: string | null;
  teamAId: string;
  teamBId: string;
  status?: 'pending' | 'not_started' | 'scheduled' | 'in_progress' | 'pending_confirmation' | 'completed' | 'disputed' | 'cancelled' | 'skipped';
  scoreSubmittedBy?: string | null;
  pendingConfirmationFor?: string | null;
  disputeReason?: string | null;
  matchNumber?: number;
  roundNumber: number | null;
  stage: string | null;
  court: string | null;
  startTime: number | null;
  endTime: number | null;
  scoreTeamAGames: number[];
  scoreTeamBGames: number[];
  winnerTeamId: string | null;
  lastUpdatedBy: string | null;
  lastUpdatedAt: number | null;
  teamA?: Team;
  teamB?: Team;
}

export interface MatchScoreSubmission {
  id: string;
  tournamentId: string;
  matchId: string;
  submittedBy: string;
  teamAId: string;
  teamBId: string;
  submittedScore: {
    scoreTeamAGames: number[];
    scoreTeamBGames: number[];
    winnerTeamId: string;
  };
  status: 'pending_opponent' | 'confirmed' | 'rejected';
  opponentUserId?: string | null;
  respondedAt?: number | null;
  reasonRejected?: string | null;
  createdAt: number;
}

export interface StandingsEntry {
  teamId: string;
  teamName: string;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDifference: number;
  headToHeadWins?: number;
  points?: number;
  gamesWon?: number;
  gamesLost?: number;
  buchholz?: number;
  rank?: number;
}

// ============================================
// TOURNAMENT COURT
// ============================================

export interface Court {
  id: string;
  tournamentId: string;
  name: string;
  order: number;
  active: boolean;
  currentMatchId?: string;
}

// ============================================
// MEETUP TYPES
// ============================================

export type MeetupCompetitionType = 
  | 'casual'
  | 'round_robin'
  | 'single_elimination'
  | 'double_elimination'
  | 'king_of_court'
  | 'ladder'
  | 'swiss'
  | 'pool_play_knockout';

export interface MeetupPricing {
  enabled: boolean;
  entryFee: number;
  prizePoolEnabled: boolean;
  prizePoolContribution: number;
  prizeDistribution?: {
    first: number;
    second: number;
    third?: number;
    fourth?: number;
  };
  feesPaidBy: 'organizer' | 'player';
  totalPerPerson?: number;
  currency: string;
}

export interface MeetupCompetitionSettings {
  managedInApp: boolean;
  type: MeetupCompetitionType;
  settings?: {
    gamesPerMatch?: number;
    pointsPerWin?: number;
    pointsPerDraw?: number;
    consolationBracket?: boolean;
    thirdPlaceMatch?: boolean;
    poolSize?: number;
    teamsAdvancing?: number;
    numberOfRounds?: number;
    winStreak?: number;
    scoringSystem?: 'rally' | 'side_out';
    pointsToWin?: number;
    winBy?: number;
    timeLimit?: number;
  };
}

export interface Meetup {
  id: string;
  title: string;
  description: string;
  when: number;
  endTime?: number;
  visibility: 'public' | 'linkOnly' | 'private';
  maxPlayers: number;
  locationName: string;
  location?: { lat: number; lng: number };
  createdByUserId: string;
  organizerName?: string;
  clubId?: string;
  clubName?: string;
  pricing?: MeetupPricing;
  organizerStripeAccountId?: string;
  competition?: MeetupCompetitionSettings;
  status: 'draft' | 'active' | 'cancelled' | 'completed';
  cancelledAt?: number;
  cancelReason?: string;
  currentPlayers?: number;
  paidPlayers?: number;
  totalCollected?: number;
  createdAt: number;
  updatedAt: number;
}

export type AttendeePaymentStatus = 
  | 'not_required'
  | 'pending'
  | 'paid'
  | 'refunded'
  | 'waived';

export interface MeetupRSVP {
  odUserId: string;
  odUserName: string;
  status: 'going' | 'maybe' | 'waitlist' | 'cancelled';
  paymentStatus?: AttendeePaymentStatus;
  amountPaid?: number;
  paidAt?: number;
  stripePaymentIntentId?: string;
  stripeSessionId?: string;
  createdAt: number;
  updatedAt?: number;
}

// ============================================
// LEAGUE TYPES
// ============================================

export type LeagueType = 'singles' | 'doubles' | 'mixed_doubles' | 'team';
export type LeagueFormat = 'ladder' | 'round_robin' | 'swiss' | 'box_league';
export type LeagueStatus = 'draft' | 'registration' | 'active' | 'completed' | 'cancelled';

/**
 * Prize pool configuration
 */
export interface LeaguePrizePool {
  enabled: boolean;
  type: 'none' | 'fixed' | 'percentage';
  amount: number;
  distribution?: {
    first: number;
    second: number;
    third?: number;
    fourth?: number;
  };
}

/**
 * League pricing settings
 */
export interface LeaguePricing {
  enabled: boolean;
  entryFee: number;
  entryFeeType: 'per_player' | 'per_team';
  memberDiscount?: number | null;
  earlyBirdEnabled: boolean;
  earlyBirdFee?: number | null;
  earlyBirdDeadline?: number | null;
  lateFeeEnabled: boolean;
  lateFee?: number | null;
  lateRegistrationStart?: number | null;
  prizePool?: LeaguePrizePool;
  feesPaidBy: FeePaidBy;
  refundPolicy: RefundPolicy;
  refundDeadline?: number | null;
  currency: string;
}

/**
 * Match format settings
 */
export interface LeagueMatchFormat {
  bestOf: 1 | 3 | 5;
  gamesTo: 11 | 15 | 21;
  winBy: 1 | 2;
  allowDraw?: boolean;
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
 * Round robin schedule settings
 */
export interface LeagueRoundRobinSettings {
  rounds: number;
  matchesPerWeek?: number;
  scheduleGeneration: 'auto' | 'manual';
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
// LEAGUE VENUE & COURT TYPES (NEW V05.34)
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
  startTime: string;          // "18:00" format (24hr)
  endTime: string;            // "21:00" format (24hr)
  label?: string;             // Optional: "Tuesday Night League"
}

/**
 * Court definition for league
 */
export interface LeagueCourt {
  id: string;
  name: string;               // "Court 1", "Main Court", etc.
  order: number;              // Display order
  active: boolean;            // Is court available for scheduling
  surface?: string;           // "indoor", "outdoor", "hard", "gym"
  notes?: string;             // Special notes about the court
}

/**
 * Venue settings for league scheduling
 */
export interface LeagueVenueSettings {
  // Venue info
  venueName: string;
  venueAddress?: string;
  venueNotes?: string;
  
  // Courts
  courts: LeagueCourt[];
  
  // Time slots
  timeSlots: LeagueTimeSlot[];
  
  // Match timing
  matchDurationMinutes: number;      // Default 20 min
  bufferMinutes: number;             // Between matches, default 5 min
  
  // Scheduling mode
  schedulingMode: 'venue_based' | 'self_scheduled';
  
  // Auto-assignment settings
  autoAssignCourts: boolean;
  avoidBackToBack?: boolean;         // Try not to schedule same player twice in a row
  balanceCourtUsage: boolean;        // Spread matches across courts evenly
}

// ============================================
// LEAGUE SETTINGS (UPDATED V05.34)
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
  
  // Venue settings (NEW V05.34)
  venueSettings?: LeagueVenueSettings | null;
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
// LEAGUE MEMBER TYPES
// ============================================

export type MembershipStatus = 'pending' | 'active' | 'suspended' | 'withdrawn';
export type MemberRole = 'member' | 'captain' | 'admin';

/**
 * Member statistics
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
}

/**
 * League member (individual or team depending on league type)
 */
export interface LeagueMember {
  id: string;
  leagueId: string;
  divisionId?: string | null;
  
  // Player info
  userId: string;
  displayName: string;
  
  // Partner info (for doubles/mixed)
  partnerUserId?: string | null;
  partnerDisplayName?: string | null;
  
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
// LEAGUE MATCH TYPES (UPDATED V05.34)
// ============================================

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
 * League match (UPDATED V05.34 - added time slot fields)
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
  
  // Time slot fields (NEW V05.34)
  timeSlotId?: string | null;
  startTime?: string | null;       // "18:00" format
  endTime?: string | null;         // "18:20" format
  
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
  
  // Challenger (lower ranked)
  challengerId: string;
  challengerUserId: string;
  challengerName: string;
  challengerRank: number;
  
  // Challenged (higher ranked)
  challengedId: string;
  challengedUserId: string;
  challengedName: string;
  challengedRank: number;
  
  // Status
  status: ChallengeStatus;
  
  // Deadlines
  responseDeadline: number;
  completionDeadline?: number;
  
  // Result
  matchId?: string | null;
  winnerId?: string | null;
  
  // Message
  message?: string | null;
  declineReason?: string | null;
  
  createdAt: number;
  respondedAt?: number | null;
  completedAt?: number | null;
}

// ============================================
// LEAGUE REGISTRATION TYPES
// ============================================

/**
 * Partner details for league registration
 */
export interface LeaguePartnerDetails {
  mode: PartnerFindingMode;
  partnerUserId?: string;
  partnerName?: string;
  openTeamId?: string;
  teamId?: string;
  teamName?: string;
}

/**
 * League registration
 */
export interface LeagueRegistration {
  id: string;
  leagueId: string;
  userId: string;
  displayName: string;
  divisionId?: string | null;
  status: 'in_progress' | 'completed' | 'withdrawn';
  waiverAccepted: boolean;
  partnerDetails?: LeaguePartnerDetails;
  paymentStatus: AttendeePaymentStatus;
  amountPaid?: number;
  paidAt?: number;
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

// ============================================
// COMPETITION TYPES (LEGACY)
// ============================================

export interface Competition {
  id: string;
  name: string;
  description?: string;
  type: 'tournament' | 'league' | 'team_league';
  format: 'round_robin' | 'single_elimination' | 'double_elimination' | 'swiss' | 'ladder';
  status: 'draft' | 'registration' | 'active' | 'completed' | 'cancelled';
  startDate: number;
  endDate?: number;
  registrationDeadline?: number;
  maxEntrants?: number;
  createdByUserId: string;
  clubId?: string;
  clubName?: string;
  visibility: Visibility;
  divisions?: CompetitionDivision[];
  settings?: {
    pointsForWin?: number;
    pointsForDraw?: number;
    pointsForLoss?: number;
    gamesPerMatch?: number;
    pointsPerGame?: number;
    winBy?: number;
  };
  createdAt: number;
  updatedAt: number;
}

export interface CompetitionDivision {
  id: string;
  name: string;
  type: EventType;
  gender: GenderCategory;
  minRating?: number;
  maxRating?: number;
  minAge?: number;
  maxAge?: number;
}

export interface CompetitionEntry {
  id: string;
  competitionId: string;
  odUserId: string;
  odUserName: string;
  divisionId?: string;
  teamId?: string;
  status: 'registered' | 'confirmed' | 'withdrawn';
  createdAt: number;
}

// ============================================
// EXPORT ALL
// ============================================

export default {};
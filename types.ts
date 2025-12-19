/**
 * Pickleball Director - Type Definitions
 * 
 * Complete TypeScript interfaces for the application.
 * 
 * FILE LOCATION: src/types.ts
 * 
 * LEAGUE TYPES UPDATE - V05.17
 * Added comprehensive league settings including:
 * - Partner settings (doubles/mixed)
 * - Pricing/payment options
 * - Division support
 * - Multiple formats (ladder, round_robin, swiss, box_league)
 */

// ============================================
// USER TYPES
// ============================================

export type UserRole = 'player' | 'organizer' | 'app_admin';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  photoURL?: string | null;

  role: UserRole;

  gender?: 'male' | 'female' | 'other' | null;
  birthDate?: string | null;

  ratingSingles?: number | null;
  ratingDoubles?: number | null;
  duprSinglesRating?: number | null;
  duprDoublesRating?: number | null;
  duprId?: string | null;

  phone?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  
  location?: string | null;
  region?: string | null;
  
  bio?: string | null;

  // Organizer Stripe Connect
  isOrganizer?: boolean;
  stripeConnectedAccountId?: string | null;
  stripeOnboardingComplete?: boolean;
  stripeChargesEnabled?: boolean;
  stripePayoutsEnabled?: boolean;

  createdAt?: number;
  updatedAt?: number;
}

// ============================================
// VISIBILITY & STATUS TYPES
// ============================================

export type Visibility = 'public' | 'linkOnly' | 'private';
export type TournamentStatus = 'draft' | 'live' | 'completed' | 'cancelled';
export type RegistrationMode = 'open' | 'invite' | 'approval';
export type EventType = 'singles' | 'doubles' | 'team';
export type GenderCategory = 'open' | 'men' | 'women' | 'mixed';
export type SchedulingMode = 'manual' | 'auto';
export type SeedingMethod = 'random' | 'rating' | 'manual';
export type TieBreaker = 'head_to_head' | 'point_differential' | 'points_for' | 'games_won';

// ============================================
// CLUB TYPES
// ============================================

export interface Club {
  id: string;
  name: string;
  description: string;
  location: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  logoUrl?: string;
  ownerId: string;
  memberCount: number;
  courtCount?: number;
  stripeConnectedAccountId?: string | null;
  stripeOnboardingComplete?: boolean;
  stripeChargesEnabled?: boolean;
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
  
  partnerDetails?: Record<
    string,
    {
      mode: 'invite' | 'open_team' | 'join_open';
      partnerUserId?: string;
      openTeamId?: string;
      partnerName?: string;
      id?: string;
      name?: string;
      teamId?: string;
      teamName?: string;
    }
  >;

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
export type MainFormat =
  | 'round_robin'
  | 'single_elim'
  | 'double_elim'
  | 'ladder'
  | 'leaderboard'
  | 'swiss';
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
  
  minRating?: number | null;
  maxRating?: number | null;
  minAge?: number | null;
  maxAge?: number | null;

  maxParticipants?: number | null;
  registrationOpen: boolean;
  registrationMode?: RegistrationMode;
  
  format: DivisionFormat;
  customFields?: CustomField[];
  
  createdByUserId?: string;
  createdAt?: number;
  updatedAt?: number;
}

// ============================================
// STAGE TYPES
// ============================================

export type StageType =
  | 'round_robin'
  | 'bracket_single_elim'
  | 'bracket_double_elim'
  | 'swiss'
  | 'leaderboard';

export type StageSettings =
  | RoundRobinSettings
  | BracketSettings
  | SwissSettings
  | LeaderboardSettings;

export interface RoundRobinSettings {
  kind: 'round_robin';
  groups?: number | null;
  matchesPerPair?: number | null;
}

export interface BracketSettings {
  kind: 'bracket_single_elim' | 'bracket_double_elim';
  seedingMethod: SeedingMethod;
  thirdPlacePlayoff?: boolean;
}

export interface SwissSettings {
  kind: 'swiss';
  rounds: number;
  points: {
    win: number;
    loss: number;
    draw?: number;
  };
  tieBreakers: string[];
}

export interface LeaderboardSettings {
  kind: 'leaderboard';
  points: {
    win: number;
    loss: number;
    draw?: number;
  };
  seasonStart?: number;
  seasonEnd?: number;
  maxMatchesPerDay?: number | null;
}

export interface Stage {
  id: string;
  divisionId: string;
  name: string;
  type: StageType;
  order: number;
  isPrimaryRankingStage?: boolean;
  matchIds: string[];
  settings: StageSettings;
}

export interface StageStandingsEntry {
  id: string;
  stageId: string;
  entryId: string;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  gamesWon?: number;
  gamesLost?: number;
  pointsFor?: number;
  pointsAgainst?: number;
  buchholz?: number;
  rank?: number;
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
// LEAGUE TYPES (COMPREHENSIVE UPDATE)
// ============================================

export type LeagueType = 'singles' | 'doubles' | 'mixed_doubles' | 'team';
export type LeagueFormat = 'ladder' | 'round_robin' | 'swiss' | 'box_league';
export type LeagueStatus = 'draft' | 'registration' | 'active' | 'playoffs' | 'completed' | 'cancelled';

/**
 * Partner finding mode options for doubles/mixed leagues
 */
export type PartnerFindingMode = 'invite' | 'open_team' | 'join_open';

/**
 * Partner lock rule - when partners become locked
 */
export type PartnerLockRule = 'registration_close' | 'anytime' | 'after_week';

/**
 * Team name generation mode
 */
export type TeamNameMode = 'auto' | 'custom';

/**
 * Partner settings for doubles/mixed leagues
 * Organizer can enable/disable each feature
 */
export interface LeaguePartnerSettings {
  // Which partner finding modes are allowed
  allowInvitePartner: boolean;      // Search & invite specific person
  allowOpenTeam: boolean;           // Create "looking for partner" listing
  allowJoinOpen: boolean;           // Browse & join available players
  
  // When partners get locked
  partnerLockRule: PartnerLockRule;
  partnerLockWeek?: number | null;  // If 'after_week', which week number
  
  // Substitute partners
  allowSubstitutes: boolean;        // Allow temp subs when partner unavailable
  
  // Team naming
  teamNameMode: TeamNameMode;       // Auto-generate or allow custom
}

/**
 * Fee handling - who pays Stripe fees
 */
export type FeePaidBy = 'organizer' | 'player';

/**
 * Refund policy options
 */
export type RefundPolicy = 'full' | 'partial' | 'none';

/**
 * Prize pool configuration
 */
export interface LeaguePrizePool {
  enabled: boolean;
  type: 'none' | 'fixed' | 'percentage';
  amount?: number;                  // Fixed amount in cents OR percentage (1-100)
  distribution?: {
    first: number;                  // Percentage
    second: number;
    third?: number;
    fourth?: number;
  };
}

/**
 * League pricing settings
 * Similar to meetup pricing but league-specific
 */
export interface LeaguePricing {
  enabled: boolean;
  
  // Registration fee (per player or per team)
  entryFee: number;                 // In cents (NZD)
  entryFeeType: 'per_player' | 'per_team';
  
  // Member discount (if league is club-linked)
  memberDiscount?: number | null;   // Percentage (0-100)
  
  // Early bird pricing
  earlyBirdEnabled: boolean;
  earlyBirdFee?: number | null;     // In cents
  earlyBirdDeadline?: number | null; // Timestamp
  
  // Late registration fee
  lateFeeEnabled: boolean;
  lateFee?: number | null;          // Additional fee in cents
  lateRegistrationStart?: number | null; // Timestamp
  
  // Prize pool
  prizePool: LeaguePrizePool;
  
  // Fee handling
  feesPaidBy: FeePaidBy;
  
  // Refund policy
  refundPolicy: RefundPolicy;
  refundDeadline?: number | null;   // Timestamp - after this, no refunds
  
  // Currency (always NZD for NZ app)
  currency: string;
}

/**
 * Match format settings
 */
export interface LeagueMatchFormat {
  bestOf: 1 | 3 | 5;                // Best of X games
  gamesTo: 11 | 15 | 21;            // Points per game
  winBy: 1 | 2;                     // Win by X points
  allowDraw?: boolean;              // For round robin/swiss
}

/**
 * Challenge rules for ladder leagues
 */
export interface LeagueChallengeRules {
  challengeRange: number;           // How many positions up can challenge
  responseDeadlineHours: number;    // Hours to accept/decline
  completionDeadlineDays: number;   // Days to complete match after acceptance
  forfeitOnDecline: boolean;        // Does declining count as forfeit?
  maxActiveChallenges: number;      // Max outgoing challenges at once
  cooldownDays: number;             // Days before can challenge same person again
}

/**
 * Round robin schedule settings
 */
export interface LeagueRoundRobinSettings {
  rounds: number;                   // Number of rounds (1 = play everyone once)
  matchesPerWeek?: number;          // Suggested matches per week
  scheduleGeneration: 'auto' | 'manual';
}

/**
 * Swiss system settings
 */
export interface LeagueSwissSettings {
  rounds: number;                   // Number of rounds
  pairingMethod: 'adjacent' | 'slide' | 'accelerated';
}

/**
 * Box league (flights) settings
 */
export interface LeagueBoxSettings {
  playersPerBox: number;            // 4-6 typically
  promotionSpots: number;           // How many promote to higher box
  relegationSpots: number;          // How many relegate to lower box
  roundsPerBox: number;             // Rounds within each box
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

/**
 * Comprehensive league settings
 */
export interface LeagueSettings {
  // Basic restrictions
  minRating?: number | null;
  maxRating?: number | null;
  minAge?: number | null;
  maxAge?: number | null;
  maxMembers?: number | null;       // Max players/teams in league
  
  // Points system
  pointsForWin: number;
  pointsForDraw: number;
  pointsForLoss: number;
  pointsForForfeit: number;         // Usually negative
  pointsForNoShow: number;          // Usually more negative
  
  // Match format
  matchFormat: LeagueMatchFormat;
  
  // Match scheduling
  matchDays?: string[];             // e.g., ['monday', 'wednesday']
  matchDeadlineDays?: number;       // Days to complete each round's matches
  
  // Score reporting
  allowSelfReporting: boolean;
  requireConfirmation: boolean;     // Opponent must confirm scores
  
  // Format-specific settings
  challengeRules?: LeagueChallengeRules;    // For ladder
  roundRobinSettings?: LeagueRoundRobinSettings;
  swissSettings?: LeagueSwissSettings;
  boxSettings?: LeagueBoxSettings;
  
  // Tiebreakers (in order of priority)
  tiebreakers: LeagueTiebreaker[];
  
  // Partner settings (for doubles/mixed)
  partnerSettings?: LeaguePartnerSettings;
}

/**
 * League division (for leagues with multiple skill levels)
 */
export interface LeagueDivision {
  id: string;
  leagueId: string;
  name: string;                     // e.g., "Open", "3.0-3.5", "50+"
  type: EventType;                  // singles, doubles, team
  gender: GenderCategory;           // open, men, women, mixed
  
  // Restrictions
  minRating?: number | null;
  maxRating?: number | null;
  minAge?: number | null;
  maxAge?: number | null;
  maxParticipants?: number | null;
  
  // Status
  registrationOpen: boolean;
  
  // Order for display
  order: number;
  
  createdAt: number;
  updatedAt: number;
}

/**
 * Main League interface
 */
export interface League {
  id: string;
  name: string;
  description: string;
  
  // League classification
  type: LeagueType;                 // singles, doubles, mixed_doubles, team
  format: LeagueFormat;             // ladder, round_robin, swiss, box_league
  
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
  organizerStripeAccountId?: string | null;   // Organizer's Stripe Connect
  
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
  totalCollected?: number;          // In cents
  
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
  points: number;                   // League points
  gamesWon: number;
  gamesLost: number;
  pointsFor: number;                // Total points scored
  pointsAgainst: number;            // Total points conceded
  currentStreak: number;            // Positive = wins, negative = losses
  bestWinStreak: number;
  recentForm: ('W' | 'L' | 'D' | 'F')[];  // Last 5 results (F = forfeit)
}

/**
 * League member (individual or team depending on league type)
 */
export interface LeagueMember {
  id: string;
  leagueId: string;
  divisionId?: string | null;       // If league has divisions
  
  // Player info (for singles or doubles player 1)
  userId: string;
  displayName: string;
  
  // Partner info (for doubles/mixed)
  partnerUserId?: string | null;
  partnerDisplayName?: string | null;
  
  // Team info (for doubles/mixed/team)
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
  currentBox?: number | null;       // Box number (1 = top)
  
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
  
  // Players
  captainUserId: string;
  playerIds: string[];              // All player user IDs
  
  // Status
  status: LeagueTeamStatus;
  isLookingForPartner: boolean;     // For "open team" mode
  
  // Partner invite tracking
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
  partnerAId?: string | null;       // For doubles
  partnerBId?: string | null;
  
  // Display names
  memberAName: string;
  memberBName: string;
  
  // Match classification
  matchType: LeagueMatchType;
  weekNumber?: number | null;
  roundNumber?: number | null;
  boxNumber?: number | null;        // For box league
  
  // Scheduling
  scheduledDate?: number | null;
  deadline?: number | null;         // Must be played by
  court?: string | null;
  venue?: string | null;
  
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
  challengerId: string;             // Member ID
  challengerUserId: string;
  challengerName: string;
  challengerRank: number;
  
  // Challenged (higher ranked)
  challengedId: string;             // Member ID
  challengedUserId: string;
  challengedName: string;
  challengedRank: number;
  
  // Status
  status: ChallengeStatus;
  
  // Deadlines
  responseDeadline: number;         // Must accept/decline by
  completionDeadline?: number;      // Must play match by (after acceptance)
  
  // Result
  matchId?: string | null;          // Created when accepted
  winnerId?: string | null;         // Member ID of winner
  
  // Message
  message?: string | null;          // Optional message from challenger
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
  openTeamId?: string;              // If joining existing open team
  teamId?: string;                  // Created/joined team ID
  teamName?: string;
}

/**
 * League registration record
 */
export interface LeagueRegistration {
  id: string;                       // {odUserId}_{leagueId}
  leagueId: string;
  userId: string;
  
  // Status
  status: 'in_progress' | 'completed' | 'withdrawn';
  
  // Division selection (if league has divisions)
  divisionId?: string | null;
  
  // Partner details (for doubles/mixed)
  partnerDetails?: LeaguePartnerDetails | null;
  
  // Payment
  paymentStatus: AttendeePaymentStatus;
  amountPaid?: number;
  paidAt?: number;
  stripeSessionId?: string;
  
  // Timestamps
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

// ============================================
// COMPETITION TYPES (shared)
// ============================================

export interface Competition {
  id: string;
  name: string;
  description: string;
  type: 'tournament' | 'league' | 'meetup';
  divisions: Division[];
  settings?: any;
  createdByUserId: string;
  status: string;
  createdAt: number;
  updatedAt: number;
}

export interface CompetitionEntry {
  id: string;
  competitionId: string;
  odUserId: string;
  divisionId?: string;
  status: 'registered' | 'withdrawn';
  createdAt: number;
  updatedAt?: number;
}

// ============================================
// ORGANIZER REQUEST
// ============================================

export interface OrganizerRequest {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string | null;
  reviewedAt?: number | null;
  reviewNotes?: string | null;
  createdAt: number;
}
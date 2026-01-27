/**
 * Team League (Interclub) Types
 *
 * Comprehensive type definitions for the Team League format where
 * clubs/organizations field teams that compete against each other
 * across multiple "boards" (e.g., Men's Doubles, Women's Doubles, Mixed Doubles).
 *
 * FILE LOCATION: types/teamLeague.ts
 * VERSION: V07.57
 *
 * ⚠️ COLLECTION PATH: teamLeagues/{teamLeagueId}
 *    - Teams: teamLeagues/{teamLeagueId}/teams/{teamId}
 *    - Fixtures: teamLeagues/{teamLeagueId}/fixtures/{fixtureId}
 *    - Do NOT use leagues/ collection for team leagues
 */

import type { GameScore } from './game/match';

// ============================================
// SHARED ENUMS
// ============================================

/**
 * Team league lifecycle status
 */
export type TeamLeagueStatus =
  | 'draft'
  | 'published'
  | 'registration'
  | 'registration_closed'
  | 'active'
  | 'completed'
  | 'cancelled';

/**
 * Schedule generation type
 */
export type ScheduleType = 'round_robin' | 'double_round_robin' | 'custom';

/**
 * DUPR integration mode
 */
export type DuprMode = 'none' | 'required';

/**
 * Board status for individual board matches
 */
export type BoardStatus = 'scheduled' | 'played' | 'forfeit' | 'cancelled';

// ============================================
// BOARD CONFIGURATION
// ============================================

/**
 * Configuration for a single board in the team league
 * Boards are the individual matches within a fixture (e.g., "Men's Doubles")
 */
export interface TeamLeagueBoardConfig {
  /** Unique identifier for this board config */
  id: string;

  /** Display name (e.g., "Men's Doubles", "Mixed Doubles 1") */
  name: string;

  /** Format of play */
  format: 'singles' | 'doubles' | 'mixed';

  /** Gender restriction for this board */
  gender?: 'mens' | 'womens' | 'open' | 'mixed';

  /** Display order (1 = first board) */
  order: number;

  /** Points awarded for winning this board (default: 1) */
  pointValue?: number;
}

// ============================================
// TEAM LEAGUE (ROOT DOCUMENT)
// ============================================

/**
 * DUPR rating restrictions configuration
 */
export interface DuprRestrictions {
  enabled: boolean;
  maxDoublesRating?: number;
  maxSinglesRating?: number;
  ratingType: 'doubles' | 'singles' | 'higher_of';
  enforceAtRegistration: boolean;
  enforceAtLineup: boolean;
}

/**
 * Age restrictions configuration
 */
export interface AgeRestrictions {
  enabled: boolean;
  leagueType: 'adult' | 'junior';
  minAge?: number;
  maxAge?: number;
  ageAsOfDate?: string;
}

/**
 * Player seeding configuration
 */
export interface PlayerSeedingConfig {
  method: 'dupr_rating' | 'captain_assigns' | 'hybrid';
  ratingType: 'doubles' | 'singles' | 'average';
  allowCaptainOverride: boolean;
  lockSeedingsAfterRound?: number;
}

/**
 * Board assignment rules
 */
export interface BoardAssignmentRules {
  enforceSeeding: boolean;
  allowedSeedRange?: number;
  requireTopSeedsOnTopBoards: boolean;
}

/**
 * Substitute rules configuration
 */
export interface SubstituteRulesConfig {
  allowExternalSubs: boolean;
  externalSubLimit?: number;
  externalSubSeasonLimit?: number;
  requireSubApproval: boolean;
  subMustMeetEligibility: boolean;
  subPool?: {
    enabled: boolean;
    playerIds: string[];
  };
}

/**
 * Playoff configuration
 */
export interface PlayoffConfig {
  enabled: boolean;
  format: 'single_elimination' | 'double_elimination';
  teamsQualify: 2 | 4 | 8;
  seedByStandings: boolean;
  bronzeMatch: boolean;
  fixtureFormat: 'same' | 'extended';
}

/**
 * Roster gender requirements
 */
export interface RosterGenderRequirements {
  enabled: boolean;
  minMale?: number;
  minFemale?: number;
}

/**
 * TeamLeague - Root document for a team league
 *
 * ⚠️ FLATTENED STRUCTURE: All settings are at root level, NOT nested under settings.teamLeague
 * ⚠️ COLLECTION PATH: teamLeagues/{teamLeagueId}
 * ⚠️ TIMESTAMPS: All timestamps are number (epoch ms), NOT Firestore Timestamp
 */
export interface TeamLeague {
  /** Unique team league ID */
  id: string;

  // ============================================
  // Basic Info
  // ============================================
  /** League name */
  name: string;

  /** Description */
  description?: string;

  // ============================================
  // Location
  // ============================================
  /** Country */
  country: string;

  /** Region/State */
  region?: string;

  /** Venue name or address */
  venue?: string;

  // ============================================
  // Season
  // ============================================
  /** Season start date (ISO format YYYY-MM-DD) */
  seasonStart: string;

  /** Season end date (ISO format YYYY-MM-DD) */
  seasonEnd: string;

  // ============================================
  // Status
  // ============================================
  /** League lifecycle status */
  status: TeamLeagueStatus;

  // ============================================
  // Organizer
  // ============================================
  /** User ID of creator */
  createdByUserId: string;

  /** Denormalized organizer name */
  organizerName: string;

  // ============================================
  // Board Configuration
  // ============================================
  /** Board configurations */
  boards: TeamLeagueBoardConfig[];

  // ============================================
  // Team Settings
  // ============================================
  /** Maximum teams allowed */
  maxTeams: number;

  /** Minimum players per team roster */
  minPlayersPerTeam: number;

  /** Maximum players per team roster */
  maxPlayersPerTeam: number;

  /** Allow same player on multiple teams */
  allowMultiTeamPlayers: boolean;

  // ============================================
  // Schedule Settings
  // ============================================
  /** Total weeks in the season */
  numberOfWeeks: number;

  /** Schedule format type */
  scheduleType: ScheduleType;

  /** Default match day (0=Sunday, 1=Monday, etc.) */
  defaultMatchDay: number;

  /** Default match time (24-hour format, e.g., "19:00") */
  defaultMatchTime: string;

  /** Minutes before match when lineups lock */
  lineupLockMinutesBeforeMatch: number;

  // ============================================
  // DUPR Integration
  // ============================================
  /** DUPR mode */
  duprMode: DuprMode;

  /** DUPR rating restrictions */
  duprRestrictions?: DuprRestrictions;

  /** Grandfathered player IDs exempt from rating restrictions */
  grandfatheredPlayerIds?: string[];

  // ============================================
  // Scoring
  // ============================================
  /** Points per board win */
  pointsPerBoardWin: number;

  /** Bonus points for fixture win */
  pointsPerMatchWin: number;

  /** Tiebreaker order for standings */
  tieBreakerOrder: ('matchWins' | 'boardDiff' | 'headToHead' | 'pointDiff')[];

  /** Bye handling - boards won when opponent is BYE */
  byeBoardWins: number;

  /** When standings update */
  standingsUpdateMode: 'on_finalize' | 'on_board_complete';

  // ============================================
  // Roster & Seeding
  // ============================================
  /** Roster gender requirements */
  rosterGenderRequirements?: RosterGenderRequirements;

  /** Player seeding configuration */
  playerSeeding: PlayerSeedingConfig;

  /** Board assignment rules */
  boardAssignmentRules?: BoardAssignmentRules;

  /** Substitute rules */
  substituteRules: SubstituteRulesConfig;

  // ============================================
  // Playoffs
  // ============================================
  /** Playoff configuration */
  playoffs?: PlayoffConfig;

  // ============================================
  // Fees (Flattened)
  // ============================================
  /** Entry fee type */
  entryFeeType: 'none' | 'per_team' | 'per_player';

  /** Entry fee amount in cents (e.g., 20000 = $200.00) */
  entryFeeAmount: number;

  /** Venue fee enabled */
  venueFeeEnabled: boolean;

  /** Venue fee amount in cents */
  venueFeeAmount: number;

  /** Require payment before approval */
  requirePaymentBeforeApproval: boolean;

  /** Currency code */
  feeCurrency: string;

  // ============================================
  // Withdrawal Handling
  // ============================================
  /** Default withdrawal handling */
  defaultWithdrawalHandling: 'auto_forfeit' | 'convert_to_bye' | 'remove_fixtures' | 'void_all';

  // ============================================
  // Venues
  // ============================================
  /** Venues for this league */
  venues: TeamLeagueVenue[];

  // ============================================
  // Age Restrictions
  // ============================================
  /** Age restrictions */
  ageRestrictions?: AgeRestrictions;

  // ============================================
  // Public Settings
  // ============================================
  /** Public visibility settings */
  publicSettings?: LeaguePublicSettings;

  // ============================================
  // Timestamps (all number - epoch ms)
  // ============================================
  /** Created timestamp (epoch ms) */
  createdAt: number;

  /** Updated timestamp (epoch ms) */
  updatedAt: number;
}

/**
 * Default values for creating a new TeamLeague
 */
export const DEFAULT_TEAM_LEAGUE: Omit<TeamLeague, 'id' | 'name' | 'createdByUserId' | 'organizerName' | 'seasonStart' | 'seasonEnd' | 'createdAt' | 'updatedAt'> = {
  country: 'NZ',
  status: 'draft',
  boards: [],
  maxTeams: 8,
  minPlayersPerTeam: 4,
  maxPlayersPerTeam: 12,
  allowMultiTeamPlayers: true,
  numberOfWeeks: 10,
  scheduleType: 'round_robin',
  defaultMatchDay: 3, // Wednesday
  defaultMatchTime: '19:00',
  lineupLockMinutesBeforeMatch: 30,
  duprMode: 'none',
  pointsPerBoardWin: 1,
  pointsPerMatchWin: 2,
  tieBreakerOrder: ['matchWins', 'boardDiff', 'headToHead'],
  byeBoardWins: 3,
  standingsUpdateMode: 'on_finalize',
  playerSeeding: {
    method: 'dupr_rating',
    ratingType: 'doubles',
    allowCaptainOverride: false,
  },
  substituteRules: {
    allowExternalSubs: false,
    requireSubApproval: true,
    subMustMeetEligibility: true,
  },
  entryFeeType: 'none',
  entryFeeAmount: 0,
  venueFeeEnabled: false,
  venueFeeAmount: 0,
  requirePaymentBeforeApproval: false,
  feeCurrency: 'NZD',
  defaultWithdrawalHandling: 'auto_forfeit',
  venues: [],
};

// ============================================
// TEAM LEAGUE SETTINGS (LEGACY - Use TeamLeague instead)
// ============================================

/**
 * @deprecated Use TeamLeague interface with flattened settings instead
 * Complete settings for a team league
 */
export interface TeamLeagueSettings {
  /** Board configurations */
  boards: TeamLeagueBoardConfig[];

  /** Maximum number of teams allowed to register */
  maxTeams: number;

  /** Total number of weeks in the season */
  numberOfWeeks: number;

  /** Schedule format type */
  scheduleType: 'round_robin' | 'double_round_robin' | 'custom';

  /** Default match day (0=Sunday, 1=Monday, etc.) */
  defaultMatchDay?: number;

  /** Default match time (24-hour format, e.g., "19:00") */
  defaultMatchTime?: string;

  /** Minimum players per team roster */
  minPlayersPerTeam: number;

  /** Maximum players per team roster */
  maxPlayersPerTeam: number;

  /** Minutes before match when lineups lock */
  lineupLockMinutesBeforeMatch: number;

  /** Points awarded per board win */
  pointsPerBoardWin: number;

  /** Bonus points for winning the fixture (more boards than opponent) */
  pointsPerMatchWin: number;

  /** Tiebreaker order for standings */
  tieBreakerOrder: ('matchWins' | 'boardDiff' | 'headToHead' | 'pointDiff')[];

  /** DUPR mode - only none or required for team leagues */
  duprMode?: 'none' | 'required';

  /** Roster gender requirements */
  rosterGenderRequirements?: {
    enabled: boolean;
    minMale?: number;
    minFemale?: number;
  };

  /** Allow same player on multiple teams */
  allowMultiTeamPlayers: boolean;

  /** DUPR rating restrictions */
  duprRestrictions?: {
    enabled: boolean;
    maxDoublesRating?: number;
    maxSinglesRating?: number;
    ratingType: 'doubles' | 'singles' | 'higher_of';
    enforceAtRegistration: boolean;
    enforceAtLineup: boolean;
  };

  /** Age group restrictions */
  ageRestrictions?: {
    enabled: boolean;
    leagueType: 'adult' | 'junior';
    minAge?: number;
    maxAge?: number;
    ageAsOfDate?: string;
  };

  /** Grandfathered players exempt from rating restrictions */
  grandfatheredPlayerIds?: string[];

  /** Player seeding configuration */
  playerSeeding: {
    method: 'dupr_rating' | 'captain_assigns' | 'hybrid';
    ratingType: 'doubles' | 'singles' | 'average';
    allowCaptainOverride: boolean;
    lockSeedingsAfterRound?: number;
  };

  /** Board assignment rules */
  boardAssignmentRules?: {
    enforceSeeding: boolean;
    allowedSeedRange?: number;
    requireTopSeedsOnTopBoards: boolean;
  };

  /** Substitute rules */
  substituteRules: {
    allowExternalSubs: boolean;
    externalSubLimit?: number;
    externalSubSeasonLimit?: number;
    requireSubApproval: boolean;
    subMustMeetEligibility: boolean;
    subPool?: {
      enabled: boolean;
      playerIds: string[];
    };
  };

  /** Playoff configuration */
  playoffs?: {
    enabled: boolean;
    format: 'single_elimination' | 'double_elimination';
    teamsQualify: 2 | 4 | 8;
    seedByStandings: boolean;
    bronzeMatch: boolean;
    fixtureFormat: 'same' | 'extended';
  };

  /** Venues for this league */
  venues: TeamLeagueVenue[];

  /** Fee configuration */
  fees?: TeamLeagueFeeConfig;

  /** Bye handling */
  byeBoardWins: number;

  /** Default withdrawal handling */
  defaultWithdrawalHandling: 'auto_forfeit' | 'convert_to_bye' | 'remove_fixtures' | 'void_all';

  /** When standings update */
  standingsUpdateMode: 'on_finalize' | 'on_board_complete';
}

/**
 * Default team league settings
 */
export const DEFAULT_TEAM_LEAGUE_SETTINGS: TeamLeagueSettings = {
  boards: [],
  maxTeams: 8,
  numberOfWeeks: 10,
  scheduleType: 'round_robin',
  defaultMatchDay: 3, // Wednesday
  defaultMatchTime: '19:00',
  minPlayersPerTeam: 4,
  maxPlayersPerTeam: 12,
  lineupLockMinutesBeforeMatch: 30,
  pointsPerBoardWin: 1,
  pointsPerMatchWin: 2,
  tieBreakerOrder: ['matchWins', 'boardDiff', 'headToHead'],
  duprMode: 'none',
  allowMultiTeamPlayers: true,
  playerSeeding: {
    method: 'dupr_rating',
    ratingType: 'doubles',
    allowCaptainOverride: false,
  },
  substituteRules: {
    allowExternalSubs: false,
    requireSubApproval: true,
    subMustMeetEligibility: true,
  },
  venues: [],
  byeBoardWins: 3,
  defaultWithdrawalHandling: 'auto_forfeit',
  standingsUpdateMode: 'on_finalize',
};

// ============================================
// VENUE
// ============================================

/**
 * Venue configuration for team league fixtures
 */
export interface TeamLeagueVenue {
  id: string;
  name: string;
  address?: string;
  courts: {
    id: string;
    name: string;
    surface?: string;
  }[];
  notes?: string;
  courtFee?: {
    enabled: boolean;
    amountPerPlayer: number;
    paymentMethod: 'offline' | 'stripe';
  };
}

// ============================================
// FEE CONFIGURATION
// ============================================

/**
 * Fee configuration for team league
 */
export interface TeamLeagueFeeConfig {
  /** Entry fee type - none, per team, or per player */
  entryFeeType: 'none' | 'per_team' | 'per_player';

  /** Entry fee amount in cents (e.g., 20000 = $200.00) */
  entryFeeAmount?: number;

  /** Whether venue fee is enabled */
  venueFeeEnabled: boolean;

  /** Venue fee amount per fixture in cents (home team pays) */
  venueFeeAmount?: number;

  /** Require payment before organizer can approve team */
  requirePaymentBeforeApproval: boolean;

  /** Currency code (default: NZD) */
  currency: string;

  /** Legacy fields for backwards compatibility */
  feeModel?: 'per_team' | 'per_player' | 'combined';
  teamFee?: number;
  playerFee?: number;
  paymentFlow?: 'captain_pays' | 'players_pay' | 'team_managed';
  stripeEnabled?: boolean;
}

// ============================================
// WAIVER & AGREEMENT TYPES
// ============================================

/**
 * Individual waiver acceptance record
 */
export interface WaiverAcceptance {
  accepted: boolean;
  acceptedAt: number;
  acceptedBy: string;
  waiverVersion: string;
}

/**
 * Captain's team registration agreement
 */
export interface CaptainAgreement {
  accepted: boolean;
  acceptedAt: number;
  acceptedBy: string;
  agreementVersion: string;
}

// ============================================
// TEAM ROSTER PLAYER
// ============================================

/**
 * A player on a team roster
 */
export interface TeamRosterPlayer {
  /** User ID */
  playerId: string;

  /** Display name */
  playerName: string;

  /** Player email for invitations */
  playerEmail?: string;

  /** Gender (for board assignment validation) */
  gender?: 'male' | 'female' | 'other';

  /** DUPR ID for submissions */
  duprId?: string;

  /** DUPR doubles rating at time of registration */
  duprRatingAtRegistration?: number;

  /** Current DUPR doubles rating (updated periodically) */
  currentDuprRating?: number;

  /** Seed number within team (1 = highest) */
  seedNumber?: number;

  /** Captain-assigned seed override */
  captainOverrideSeed?: number;

  /** Is this player the team captain? */
  isCaptain: boolean;

  /** Is this a playing captain? (captain who is also on the roster) */
  isPlayingCaptain: boolean;

  /** Player type */
  playerType: 'rostered' | 'substitute';

  /** Roster invitation status */
  status?: 'invited' | 'confirmed' | 'declined';

  /** Max appearances if substitute */
  maxSubAppearances?: number;

  /** Current sub appearance count */
  subAppearanceCount?: number;

  /** Individual liability waiver acceptance */
  waiverAcceptance?: WaiverAcceptance;

  /** DUPR consent (if league requires DUPR) */
  duprWaiverAcceptance?: WaiverAcceptance;

  /** Can this player be included in lineups? */
  eligibleForLineup: boolean;

  /** When player was added to roster */
  addedAt: number;

  /** Who added the player */
  addedBy: string;
}

// ============================================
// INTERCLUB TEAM
// ============================================

/**
 * Team status in the league
 */
export type TeamStatus =
  | 'pending_approval'
  | 'approved'
  | 'approved_pending_payment'
  | 'approved_paid'
  | 'withdrawn'
  | 'rejected';

/**
 * A team in the interclub league
 */
export interface InterclubTeam {
  /** Unique team ID */
  id: string;

  /** Team league this team belongs to */
  teamLeagueId: string;

  /** Team name */
  name: string;

  /** Club ID (if affiliated with a club) */
  clubId?: string;

  /** Club name */
  clubName?: string;

  /** Team captain user ID */
  captainId: string;

  /** Team captain name */
  captainName: string;

  /** Captain's phone for contact */
  captainPhone?: string;

  /** Captain's email */
  captainEmail?: string;

  /** Is the captain also a playing member of the team? */
  captainIsPlaying: boolean;

  /** Team roster (only includes playing members) */
  roster: TeamRosterPlayer[];

  /** Team status */
  status: TeamStatus;

  /** Captain's registration agreement */
  captainAgreement: CaptainAgreement;

  /** Payment status */
  paymentStatus: 'pending' | 'partial' | 'paid' | 'waived';
  amountDue: number;
  amountPaid: number;
  paymentMethod?: 'stripe' | 'manual';
  stripePaymentId?: string;

  /** Per-player payments (if players_pay model) */
  playerPayments?: {
    playerId: string;
    status: 'pending' | 'paid' | 'waived';
    amount: number;
    paidAt?: number;
  }[];

  /** Team stats (denormalized for standings) */
  stats: InterclubTeamStats;

  /** Withdrawal tracking */
  withdrawnAt?: number;
  withdrawnReason?: string;
  withdrawalHandling?: 'auto_forfeit' | 'convert_to_bye' | 'remove_fixtures' | 'void_all';

  /** Timestamps */
  createdAt: number;
  updatedAt: number;
}

/**
 * Team statistics for standings
 */
export interface InterclubTeamStats {
  /** Fixtures played */
  played: number;

  /** Fixtures won */
  wins: number;

  /** Fixtures lost */
  losses: number;

  /** Fixtures drawn */
  draws: number;

  /** Total boards won */
  boardsWon: number;

  /** Total boards lost */
  boardsLost: number;

  /** Board differential */
  boardDiff: number;

  /** Total points */
  points: number;
}

// ============================================
// TEAM LINEUP
// ============================================

/**
 * Board assignment in a lineup
 */
export interface BoardAssignment {
  /** Board config ID */
  boardId: string;

  /** Player IDs assigned to this board (1 for singles, 2 for doubles) */
  playerIds: string[];

  /** Player names */
  playerNames: string[];

  /** DUPR IDs of assigned players */
  duprIds?: string[];
}

/**
 * Team lineup for a fixture
 */
export interface TeamLineup {
  /** Team ID */
  teamId: string;

  /** Team name */
  teamName: string;

  /** Board assignments */
  boardAssignments: BoardAssignment[];

  /** Substitutes used */
  substitutes?: {
    boardId: string;
    playerId: string;
    playerName: string;
    substituteType: 'roster' | 'external' | 'pool';
    replacingPlayerId?: string;
    approvedByOrganizer?: boolean;
    duprRating?: number;
    duprId?: string;
  }[];

  /** When lineup was submitted */
  submittedAt: number;

  /** Who submitted the lineup */
  submittedBy: string;
}

// ============================================
// BOARD MATCH
// ============================================

/**
 * DUPR tracking for a board match
 */
export interface BoardDuprData {
  /** Are all players DUPR-eligible? */
  eligible: boolean;

  /** When submitted to DUPR */
  submittedAt?: number;

  /** DUPR submission ID */
  submissionId?: string;

  /** Error message if submission failed */
  error?: string;

  /** Retry count */
  retryCount?: number;
}

/**
 * Status of a board match
 */
export type BoardMatchStatus = 'scheduled' | 'in_progress' | 'played' | 'forfeit' | 'cancelled';

/**
 * Individual board match within a fixture
 */
export interface BoardMatch {
  /** Unique ID for this board match */
  boardMatchId: string;

  /** Links to TeamLeagueBoardConfig.id */
  boardConfigId: string;

  /** Board name (denormalized for display) */
  boardName: string;

  /** Display order */
  boardOrder: number;

  /** Format of this board */
  format: 'singles' | 'doubles' | 'mixed';

  /** Board status (independent of fixture status) */
  status: BoardMatchStatus;

  /** Home team players */
  homePlayers: {
    playerId: string;
    playerName: string;
    duprId?: string;
  }[];

  /** Away team players */
  awayPlayers: {
    playerId: string;
    playerName: string;
    duprId?: string;
  }[];

  /** Game scores */
  scores: GameScore[];

  /** Winner */
  winnerId?: 'home' | 'away';

  /** Scheduled time for this board (for session scheduling) */
  scheduledTime?: string;

  /** Session slot (for wave-based play) */
  sessionSlot?: number;

  /** Assigned court */
  courtId?: string;

  /** DUPR tracking */
  dupr: BoardDuprData;

  /** When board started */
  startedAt?: number;

  /** When board completed */
  completedAt?: number;
}

/**
 * FixtureBoardMatch - Board match for map-based storage
 *
 * ⚠️ IMPORTANT: Used when boards are stored as Record<string, FixtureBoardMatch>
 * The key is the boardMatchId for atomic per-board updates via Firestore dot notation:
 *   updateDoc(fixtureRef, { [`boards.${boardMatchId}.scores`]: scores })
 *
 * UI iterates: Object.values(boards).sort((a, b) => a.boardNumber - b.boardNumber)
 */
export interface FixtureBoardMatch {
  /** Stable ID for this board match (used as map key) */
  boardMatchId: string;

  /** Links to TeamLeagueBoardConfig.id */
  boardConfigId: string;

  /** Board number for ordering (1, 2, 3...) */
  boardNumber: number;

  /** Status per board */
  status: BoardStatus;

  /** Home team player IDs */
  homePlayerIds: string[];

  /** Away team player IDs */
  awayPlayerIds: string[];

  /** Denormalized home player names */
  homePlayerNames: string[];

  /** Denormalized away player names */
  awayPlayerNames: string[];

  /** Game scores */
  scores?: GameScore[];

  /** Winning side */
  winningSide?: 'home' | 'away' | 'draw';

  /** DUPR tracking per board */
  dupr?: {
    eligible: boolean;
    submittedAt?: number;
    submissionId?: string;
    error?: string;
  };

  /** When board started */
  startedAt?: number;

  /** When board completed */
  completedAt?: number;
}

/**
 * FixtureLineupPlayer - A player in a fixture lineup
 *
 * Used in homeLineup and awayLineup arrays on TeamLeagueFixture
 */
export interface FixtureLineupPlayer {
  /** Player ID */
  playerId: string;

  /** Denormalized player name */
  playerName: string;

  /** Player's DUPR doubles rating */
  duprDoublesRating?: number;

  /** Player's DUPR ID */
  duprId?: string;

  /** Board assignment (if pre-assigned) */
  boardConfigId?: string;

  /** Player's seed number on the team */
  seedNumber?: number;
}

// ============================================
// FIXTURE SESSION
// ============================================

/**
 * A session/wave within a fixture (for staggered play)
 */
export interface FixtureSession {
  /** Session number (1, 2, 3...) */
  sessionNumber: number;

  /** Session name (e.g., "Round 1", "Wave A") */
  name?: string;

  /** Start time (24-hour format) */
  startTime: string;

  /** Board IDs in this session */
  boardIds: string[];

  /** Court assignments for this session */
  courtAssignments?: {
    boardId: string;
    courtId: string;
  }[];
}

// ============================================
// FIXTURE AUDIT LOG
// ============================================

/**
 * Audit action types
 */
export type FixtureAuditAction =
  | 'fixture_created'
  | 'lineup_submitted'
  | 'lineup_unlocked'
  | 'scores_proposed'
  | 'scores_confirmed'
  | 'scores_disputed'
  | 'dispute_resolved'
  | 'fixture_finalized'
  | 'board_forfeit'
  | 'board_cancelled'
  | 'dupr_submitted'
  | 'dupr_failed';

/**
 * Immutable audit log entry
 */
export interface FixtureAuditEntry {
  /** Unique entry ID */
  id: string;

  /** When action occurred */
  timestamp: number;

  /** Action type */
  action: FixtureAuditAction;

  /** User who performed the action */
  performedBy: string;

  /** Display name for audit trail */
  performedByName: string;

  /** Team ID (for captain actions) */
  teamId?: string;

  /** Action-specific details */
  details: Record<string, unknown>;

  /** Score snapshot for score-related actions */
  scoreSnapshot?: {
    boards: {
      boardMatchId: string;
      scores: GameScore[];
      winnerId?: 'home' | 'away' | 'draw';
    }[];
  };
}

// ============================================
// FIXTURE COURT FEES
// ============================================

/**
 * Court fee tracking for a fixture
 */
export interface FixtureCourtFees {
  venueId: string;
  amountPerPlayer: number;
  totalPlayers: number;
  totalAmount: number;
  status: 'pending' | 'partial' | 'collected';
  playerPayments?: {
    playerId: string;
    teamId: string;
    status: 'pending' | 'paid' | 'waived';
    amount: number;
    paidAt?: number;
  }[];
}

// ============================================
// FIXTURE SCORE STATE
// ============================================

/**
 * Score state for fixture workflow
 */
export type FixtureScoreState = 'none' | 'proposed' | 'signed' | 'disputed' | 'official';

// ============================================
// TEAM LEAGUE FIXTURE
// ============================================

/**
 * Fixture status
 *
 * State machine:
 * - scheduled → in_progress (first board score entered)
 * - in_progress → completed (ALL boards have status in ['played', 'forfeit', 'cancelled'])
 * - completed → finalized (organizer ONLY - locks results)
 * - any → cancelled (organizer, before finalized)
 * - finalized → ❌ BLOCKED (cannot un-finalize)
 *
 * DUPR submission only allowed when status === 'finalized'
 */
export type FixtureStatus =
  | 'scheduled'
  | 'lineups_submitted'
  | 'in_progress'
  | 'completed'
  | 'finalized'
  | 'cancelled';

/**
 * A fixture (team vs team match) in the team league
 *
 * ⚠️ COLLECTION PATH: teamLeagues/{teamLeagueId}/fixtures/{fixtureId}
 * ⚠️ BOARDS: Stored as Record<string, FixtureBoardMatch> for atomic per-board updates
 */
export interface TeamLeagueFixture {
  /** Unique fixture ID */
  id: string;

  /** Team League ID (NOT leagueId) */
  teamLeagueId: string;

  /** Home team ID */
  homeTeamId: string;

  /** Home team name (denormalized) */
  homeTeamName: string;

  /** Home team captain ID (denormalized for Firestore rules) */
  homeCaptainId: string;

  /** Away team ID (can be 'BYE' for bye fixtures) */
  awayTeamId: string;

  /** Away team name (denormalized) */
  awayTeamName: string;

  /** Away team captain ID (denormalized for Firestore rules) */
  awayCaptainId: string;

  /** Week number in the season */
  weekNumber: number;

  /** Round number (for playoffs) */
  roundNumber?: number;

  /** Scheduled date (ISO format YYYY-MM-DD) */
  scheduledDate: string;

  /** Scheduled time (24-hour format) */
  scheduledTime: string;

  /** Venue ID */
  venueId?: string;

  /** Venue name (denormalized) */
  venueName?: string;

  /** Session scheduling for wave-based play */
  sessions?: FixtureSession[];

  /** Fixture status */
  status: FixtureStatus;

  /**
   * Home team lineup
   * Use FixtureLineupPlayer[] for typed lineup
   */
  homeLineup?: FixtureLineupPlayer[];

  /**
   * Away team lineup
   * Use FixtureLineupPlayer[] for typed lineup
   */
  awayLineup?: FixtureLineupPlayer[];

  /** When lineup was locked */
  lineupLockedAt?: number;

  /** Who unlocked lineup (if organizer override) */
  lineupUnlockedBy?: string;

  /** When lineup was unlocked */
  lineupUnlockedAt?: number;

  /** Reason for unlock */
  lineupUnlockReason?: string;

  /**
   * Board matches - stored as map keyed by boardMatchId
   *
   * ⚠️ IMPORTANT: Use Record<string, FixtureBoardMatch> for atomic per-board updates
   * Update individual boards via Firestore dot notation:
   *   updateDoc(fixtureRef, { [`boards.${boardMatchId}.scores`]: scores })
   *
   * UI iteration: Object.values(boards || {}).sort((a, b) => a.boardNumber - b.boardNumber)
   */
  boards: Record<string, FixtureBoardMatch>;

  /** Aggregate result */
  result?: {
    homeBoardsWon: number;
    awayBoardsWon: number;
    winnerId?: 'home' | 'away' | 'draw';
  };

  /** Score workflow state */
  scoreState: FixtureScoreState;

  /** Score proposal (captain submission) */
  scoreProposal?: {
    proposedBy: string;
    proposedAt: number;
    proposedByTeam: 'home' | 'away';
  };

  /** Is score locked? */
  scoreLocked: boolean;

  /** Immutable audit log */
  auditLog?: FixtureAuditEntry[];

  /** Official result (after finalization) */
  officialResult?: {
    boards: Record<string, FixtureBoardMatch>;
    homeBoardsWon: number;
    awayBoardsWon: number;
    winnerId: 'home' | 'away' | 'draw';
    finalizedBy: string;
    finalizedAt: number;
  };

  /** Court fees for this fixture */
  courtFees?: FixtureCourtFees;

  /** Is this a playoff fixture? */
  isPlayoff?: boolean;

  /** Playoff bracket info */
  playoffBracket?: {
    bracketPosition: number;
    nextFixtureId?: string;
    nextFixtureSlot?: 'home' | 'away';
  };

  /** When organizer finalized the fixture (epoch ms) */
  finalizedAt?: number;

  /** User ID of organizer who finalized */
  finalizedBy?: string;

  /** Timestamps (epoch ms) */
  createdAt: number;
  updatedAt: number;
}

// ============================================
// STANDINGS
// ============================================

/**
 * Team standing in the league
 */
export interface TeamLeagueStanding {
  /** Team ID */
  teamId: string;

  /** Team name */
  teamName: string;

  /** Current rank */
  rank: number;

  /** Stats */
  stats: InterclubTeamStats;

  /** Is team withdrawn? */
  withdrawn?: boolean;
}

// ============================================
// PUBLIC SETTINGS
// ============================================

/**
 * Public visibility settings for a league
 */
export interface LeaguePublicSettings {
  /** Enable public access */
  enabled: boolean;

  /** Show team standings publicly */
  showStandings: boolean;

  /** Show fixture schedule publicly */
  showFixtures: boolean;

  /** Show completed results publicly */
  showResults: boolean;

  /** Show player names (privacy option) */
  showPlayerNames: boolean;

  /** Custom branding */
  customBranding?: {
    headerImage?: string;
    primaryColor?: string;
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if a player is eligible for lineup
 */
export function isPlayerEligibleForLineup(player: TeamRosterPlayer): boolean {
  return player.eligibleForLineup && player.waiverAcceptance?.accepted === true;
}

/**
 * Calculate team standings from fixtures
 */
export function calculateTeamStanding(
  team: InterclubTeam,
  fixtures: TeamLeagueFixture[],
  settings: TeamLeagueSettings
): InterclubTeamStats {
  const stats: InterclubTeamStats = {
    played: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    boardsWon: 0,
    boardsLost: 0,
    boardDiff: 0,
    points: 0,
  };

  for (const fixture of fixtures) {
    if (fixture.status !== 'completed' || !fixture.officialResult) continue;

    const isHome = fixture.homeTeamId === team.id;
    const isAway = fixture.awayTeamId === team.id;
    if (!isHome && !isAway) continue;

    stats.played++;

    const result = fixture.officialResult;
    const teamBoardsWon = isHome ? result.homeBoardsWon : result.awayBoardsWon;
    const opponentBoardsWon = isHome ? result.awayBoardsWon : result.homeBoardsWon;

    stats.boardsWon += teamBoardsWon;
    stats.boardsLost += opponentBoardsWon;

    if (teamBoardsWon > opponentBoardsWon) {
      stats.wins++;
      stats.points += settings.pointsPerMatchWin;
    } else if (teamBoardsWon < opponentBoardsWon) {
      stats.losses++;
    } else {
      stats.draws++;
      stats.points += 1; // Draw points
    }

    stats.points += teamBoardsWon * settings.pointsPerBoardWin;
  }

  stats.boardDiff = stats.boardsWon - stats.boardsLost;

  return stats;
}

/**
 * Generate a unique board match ID
 */
export function generateBoardMatchId(fixtureId: string, boardConfigId: string): string {
  return `${fixtureId}_${boardConfigId}`;
}

/**
 * Create initial boards for a fixture from board configs
 */
export function createInitialBoards(
  fixtureId: string,
  boardConfigs: TeamLeagueBoardConfig[]
): BoardMatch[] {
  return boardConfigs.map((config) => ({
    boardMatchId: generateBoardMatchId(fixtureId, config.id),
    boardConfigId: config.id,
    boardName: config.name,
    boardOrder: config.order,
    format: config.format,
    status: 'scheduled' as BoardMatchStatus,
    homePlayers: [],
    awayPlayers: [],
    scores: [],
    dupr: { eligible: false },
  }));
}

/**
 * Create an audit log entry
 */
export function createAuditEntry(
  action: FixtureAuditAction,
  performedBy: string,
  performedByName: string,
  details: Record<string, unknown> = {},
  teamId?: string,
  scoreSnapshot?: FixtureAuditEntry['scoreSnapshot']
): FixtureAuditEntry {
  return {
    id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    action,
    performedBy,
    performedByName,
    teamId,
    details,
    scoreSnapshot,
  };
}

/**
 * Calculate minimum weeks required for a schedule type
 */
export function getMinimumWeeksRequired(
  maxTeams: number,
  scheduleType: 'round_robin' | 'double_round_robin' | 'custom'
): number {
  if (scheduleType === 'custom') return 1;

  // Round robin: N-1 weeks for even teams, N weeks for odd (byes)
  const isOdd = maxTeams % 2 !== 0;
  const baseWeeks = isOdd ? maxTeams : maxTeams - 1;

  // Double round robin needs 2x the weeks
  return scheduleType === 'double_round_robin' ? baseWeeks * 2 : baseWeeks;
}

/**
 * Validate schedule configuration
 */
export function validateScheduleConfig(settings: TeamLeagueSettings): string | null {
  const minWeeks = getMinimumWeeksRequired(settings.maxTeams, settings.scheduleType);

  if (settings.numberOfWeeks < minWeeks) {
    const formatName = settings.scheduleType === 'double_round_robin' ? 'Double Round Robin' : 'Round Robin';
    return `${formatName} with ${settings.maxTeams} teams requires at least ${minWeeks} weeks. You have ${settings.numberOfWeeks} weeks configured.`;
  }

  if (settings.maxTeams < 2) {
    return 'At least 2 teams are required.';
  }

  if (settings.maxTeams > 20) {
    return 'Maximum 20 teams allowed per league.';
  }

  return null; // Valid
}

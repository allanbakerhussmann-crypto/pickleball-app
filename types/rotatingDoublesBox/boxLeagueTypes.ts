/**
 * Rotating Doubles Box League Types
 *
 * Complete type definitions for the box league system.
 * Tracks individual player rankings with rotating partners,
 * skill-based boxes, and weekly promotion/relegation.
 *
 * V07.27: Added 4 absentee policies (freeze, ghost_score, average_points, auto_relegate)
 *         and separated substitute (ghost player) concept from absence policy.
 *
 * FILE LOCATION: types/rotatingDoublesBox/boxLeagueTypes.ts
 * VERSION: V07.27
 */

import type { GameSettings } from '../game/gameSettings';

// ============================================
// SEASON TYPES
// ============================================

/**
 * Season state machine
 */
export type SeasonState = 'setup' | 'active' | 'completed' | 'cancelled';

/**
 * Week status within a season schedule
 */
export type WeekStatus = 'scheduled' | 'active' | 'completed' | 'cancelled' | 'postponed';

/**
 * Individual week entry in the season calendar
 */
export interface WeekScheduleEntry {
  /** Week number (1-based) */
  weekNumber: number;

  /** When this week is played (timestamp) */
  scheduledDate: number;

  /** Current status of the week */
  status: WeekStatus;

  /** Reason for cancellation if cancelled */
  cancellationReason?: string;

  /** New date if postponed (timestamp) */
  rescheduledTo?: number;
}

/**
 * Box League Season
 *
 * A defined period with calendar dates and rules.
 * All weeks within a season follow the frozen rules snapshot.
 */
export interface BoxLeagueSeason {
  /** Unique season ID */
  id: string;

  /** Parent league ID */
  leagueId: string;

  /** Season name (e.g., "Summer 2026", "Term 1") */
  name: string;

  // ==========================================
  // Calendar
  // ==========================================

  /** Season start timestamp */
  startDate: number;

  /** Season end timestamp */
  endDate: number;

  /** Planned number of weeks */
  totalWeeks: number;

  /** Week schedule with calendar mapping */
  weekSchedule: WeekScheduleEntry[];

  // ==========================================
  // State
  // ==========================================

  /** Current season state */
  state: SeasonState;

  /** Rules frozen at season start */
  rulesSnapshot: RotatingDoublesBoxSettings;

  // ==========================================
  // Timestamps
  // ==========================================

  /** When season was created */
  createdAt: number;

  /** When season was activated */
  activatedAt?: number;

  /** When season was completed */
  completedAt?: number;
}

// ============================================
// WEEKLY STATE MACHINE
// ============================================

/**
 * Week state machine states
 *
 * Draft → Active → Closing → Finalized
 */
export type BoxWeekState = 'draft' | 'active' | 'closing' | 'finalized';

/**
 * Session within a week (for multi-session weeks)
 */
export interface WeekSession {
  /** Session ID */
  sessionId: string;

  /** Session name (e.g., "Tuesday Night", "Make-up Session") */
  sessionName?: string;

  /** Start time in 24-hour format (e.g., "18:30") */
  startTime: string;

  /** End time in 24-hour format (e.g., "21:00") */
  endTime: string;

  /** Date for this session (timestamp) */
  date: number;

  /** Venue if different from league default */
  venue?: string;
}

/**
 * Attendance status for a player
 */
export type AttendanceStatus = 'checked_in' | 'not_checked_in' | 'no_show' | 'excused';

/**
 * Player attendance tracking
 */
export interface PlayerAttendance {
  /** Player ID */
  playerId: string;

  /** Attendance status */
  status: AttendanceStatus;

  /** When checked in (timestamp) */
  checkedInAt?: number;

  /** Who performed the check-in (self or organizer) */
  checkedInByUserId?: string;

  /** When marked as no-show (timestamp) */
  noShowMarkedAt?: number;

  /** Excuse reason if excused */
  excuseReason?: string;
}

/**
 * Box assignment for a week
 *
 * NOTE: No names stored - lookup at render time to avoid stale data
 */
export interface BoxAssignment {
  /** Box number (1-based) */
  boxNumber: number;

  /** Player IDs ordered by position (index 0 = position 1) */
  playerIds: string[];
}

/**
 * Per-box completion tracking
 */
export interface BoxCompletionStatus {
  /** Box number */
  boxNumber: number;

  /** Number of completed rounds */
  completedRounds: number;

  /** Total rounds expected */
  totalRounds: number;

  /** Organizer override to freeze movement */
  movementFrozen: boolean;
}

/**
 * Rules snapshot frozen at week activation
 */
export interface WeekRulesSnapshot {
  /** Points to win a game */
  pointsTo: 11 | 15 | 21;

  /** Win-by margin */
  winBy: 1 | 2;

  /** Best of N games */
  bestOf: 1 | 3 | 5;

  /** Score verification method */
  verificationMethod: 'auto_confirm' | 'one_opponent' | 'majority' | 'organizer_only';

  /** How many promote from each box */
  promotionCount: 1 | 2;

  /** How many relegate from each box */
  relegationCount: 1 | 2;

  /** Tiebreaker order */
  tiebreakers: string[];

  /** Minimum rounds to allow promotion/relegation */
  minCompletedRoundsForMovement: number;
}

/**
 * Box League Week
 *
 * AUTHORITATIVE document for a week's assignments and rules.
 * State machine controls match generation and finalization.
 */
export interface BoxLeagueWeek {
  /** Week ID (weekNumber as string) */
  id: string;

  /** Parent league ID */
  leagueId: string;

  /** Parent season ID */
  seasonId: string;

  /** Week number (1-based) */
  weekNumber: number;

  /** Current state in the state machine */
  state: BoxWeekState;

  // ==========================================
  // Calendar
  // ==========================================

  /** When this week is played (timestamp) */
  scheduledDate: number;

  /** Week status from season schedule */
  weekStatus: WeekStatus;

  // ==========================================
  // Sessions & Courts
  // ==========================================

  /** Sessions for this week (supports multi-session) */
  sessions: WeekSession[];

  /** Box assignments - AUTHORITATIVE for this week */
  boxAssignments: BoxAssignment[];

  /** Court assignments per box */
  courtAssignments: { boxNumber: number; courtLabel: string }[];

  // ==========================================
  // Match Configuration
  // ==========================================

  /** Expected matches per player (derived from boxSize) */
  expectedMatchesPerPlayer: number;

  /** Number of rounds (derived from boxSize) */
  roundCount: number;

  /** Rules snapshot - frozen at week activation */
  rulesSnapshot: WeekRulesSnapshot;

  // ==========================================
  // Attendance
  // ==========================================

  /** Player attendance tracking */
  attendance: PlayerAttendance[];

  /** Whether attendance has been locked */
  attendanceLocked?: boolean;

  /** When attendance was locked */
  attendanceLockedAt?: number;

  // ==========================================
  // Match Tracking
  // ==========================================

  /** Match IDs in leagues/{leagueId}/matches collection */
  matchIds: string[];

  /** Total matches for this week */
  totalMatches: number;

  /** Completed match count */
  completedMatches: number;

  /** Matches pending verification */
  pendingVerificationCount: number;

  /** Disputed match count */
  disputedCount: number;

  /** Per-box completion tracking */
  boxCompletionStatus: BoxCompletionStatus[];

  // ==========================================
  // Finalization Data
  // ==========================================

  /** Standings snapshot (populated during Finalized state) */
  standingsSnapshot?: BoxStandingsSnapshot;

  /** Movement records (populated during Finalized state) */
  movements?: PlayerMovement[];

  // ==========================================
  // Absences
  // ==========================================

  /** Declared absences for this week */
  absences?: WeekAbsence[];

  // ==========================================
  // Timestamps
  // ==========================================

  /** When week was drafted */
  draftedAt?: number;

  /** When week was activated */
  activatedAt?: number;

  /** When closing started */
  closingStartedAt?: number;

  /** When week was finalized */
  finalizedAt?: number;

  /** Who finalized the week */
  finalizedByUserId?: string;
}

// ============================================
// MEMBER TYPES
// ============================================

/**
 * Member status
 */
export type MemberStatus = 'active' | 'withdrawn' | 'suspended';

/**
 * Box League Member
 *
 * LIGHTWEIGHT - just membership data, not ladder state.
 * Ladder position is derived from week snapshots.
 */
export interface BoxLeagueMember {
  /** OD User ID */
  odUserId: string;

  /** Display name */
  displayName: string;

  /** DUPR ID if linked */
  duprId?: string;

  /** DUPR doubles rating */
  duprDoublesRating?: number;

  /** DUPR consent for submission */
  duprConsent?: boolean;

  /** When DUPR consent was given */
  duprConsentAt?: number;

  /** Member status */
  status: MemberStatus;

  /** When member joined */
  joinedAt: number;

  /** Subs used this season */
  subsUsedThisSeason?: number;

  /** When member withdrew */
  withdrawnAt?: number;

  /** Suspension end date */
  suspendedUntil?: number;
}

// ============================================
// STANDINGS TYPES
// ============================================

/**
 * Individual player standing within a box
 */
export interface BoxStanding {
  /** Player ID */
  playerId: string;

  /** Player name (snapshot at finalization) */
  playerName: string;

  /** Box number */
  boxNumber: number;

  /** Position within box (1 = top) */
  positionInBox: number;

  /** Total matches played */
  matchesPlayed: number;

  /** Matches won */
  wins: number;

  /** Matches lost */
  losses: number;

  /** Total points scored */
  pointsFor: number;

  /** Total points conceded */
  pointsAgainst: number;

  /** Point differential */
  pointsDiff: number;

  /** Movement for next week */
  movement: 'promotion' | 'relegation' | 'stayed' | 'frozen';

  /** Was player absent this week? */
  wasAbsent: boolean;

  /** Substitute ID if a ghost player filled in */
  substituteId?: string;

  /** Which absence policy was applied */
  absencePolicy?: AbsencePolicyType;
}

/**
 * Standings snapshot for a week
 */
export interface BoxStandingsSnapshot {
  /** Week number */
  weekNumber: number;

  /** When calculated */
  calculatedAt: number;

  /** Latest match.updatedAt used in calculation */
  matchesUpdatedAtMax: number;

  /** Number of matches used in calculation */
  sourceMatchCount: number;

  /** All box standings */
  boxes: BoxStanding[];
}

// ============================================
// MOVEMENT TYPES
// ============================================

/**
 * Reason for player movement
 */
export type MovementReason =
  | 'promotion'
  | 'relegation'
  | 'stayed'
  | 'frozen'
  | 'new_joiner'
  | 'withdrawn';

/**
 * Player movement record
 */
export interface PlayerMovement {
  /** Player ID */
  playerId: string;

  /** Player name (snapshot) */
  playerName: string;

  /** Source box */
  fromBox: number;

  /** Destination box */
  toBox: number;

  /** Position in old box (1-based) */
  fromPosition: number;

  /** Position in new box (1-based) */
  toPosition: number;

  /** Reason for movement */
  reason: MovementReason;

  /** Was player absent? */
  wasAbsent?: boolean;

  /** Which absence policy applied */
  absencePolicy?: string;
}

// ============================================
// SEASON STATS (LEADERBOARD)
// ============================================

/**
 * Season-wide player statistics
 */
export interface SeasonPlayerStats {
  /** Player ID */
  playerId: string;

  /** Season ID */
  seasonId: string;

  // ==========================================
  // Participation
  // ==========================================

  /** Weeks played */
  weeksPlayed: number;

  /** Weeks absent */
  weeksAbsent: number;

  /** Times they subbed for someone else */
  weeksAsSubstitute: number;

  // ==========================================
  // Match Stats (Cumulative)
  // ==========================================

  /** Total matches played */
  totalMatches: number;

  /** Total wins */
  totalWins: number;

  /** Total losses */
  totalLosses: number;

  /** Total points scored */
  totalPointsFor: number;

  /** Total points conceded */
  totalPointsAgainst: number;

  /** Win percentage (derived) */
  winPercentage: number;

  // ==========================================
  // Box Movement
  // ==========================================

  /** Current box number */
  currentBox: number;

  /** Highest (best) box reached */
  highestBox: number;

  /** Times promoted */
  promotions: number;

  /** Times relegated */
  relegations: number;

  // ==========================================
  // Attendance
  // ==========================================

  /** Undeclared absences (no-shows) */
  noShows: number;

  /** Percentage of weeks checked in on time */
  checkInRate: number;

  // ==========================================
  // Final Standing
  // ==========================================

  /** Overall rank at season end */
  finalStanding?: number;
}

// ============================================
// ABSENCE & SUBSTITUTE TYPES
// ============================================

/**
 * Absentee Policy Options (what happens to the absent player's standings)
 *
 * - freeze: Stay where you were (no movement, no stats change)
 * - ghost_score: Get 0 wins, 0 points (ranks last in box, likely relegates)
 * - average_points: Get season average stats (normal movement rules apply)
 * - auto_relegate: Automatic penalty (always drop one box)
 */
export type AbsencePolicyType = 'freeze' | 'ghost_score' | 'average_points' | 'auto_relegate';

/**
 * Who can pick the substitute (ghost player)
 */
export type SubApprovalType = 'organizer_only' | 'player_selects';

/**
 * Which boxes substitutes can come from
 */
export type SubBoxRestriction = 'same_only' | 'same_or_lower' | 'any';

/**
 * Absence policy settings
 *
 * Separates two concepts:
 * 1. Substitute (Ghost Player) - fills the spot so matches can happen
 *    - Sub is NOT in standings, results don't count for anyone
 * 2. Absentee Policy - what happens to the absent player's standings
 */
export interface AbsencePolicy {
  /** Policy for absent player's standings */
  policy: AbsencePolicyType;

  /** Allow substitutes (ghost players) to fill spots */
  allowSubstitutes: boolean;

  /** Who picks the substitute */
  subApproval: SubApprovalType;

  /** Max subs per player per season */
  maxSubsPerSeason: 1 | 2 | 3 | 'unlimited';
}

/**
 * Substitute eligibility rules
 */
export interface SubstituteEligibility {
  /** Must be a league member (not casual fill-in) */
  subMustBeMember: boolean;

  /** Box restriction for subs */
  subAllowedFromBoxes: SubBoxRestriction;

  /** Optional max DUPR rating difference */
  subMaxRatingGap?: number;

  /** Must have DUPR ID linked */
  subMustHaveDuprLinked: boolean;

  /** Must have given DUPR consent */
  subMustHaveDuprConsent: boolean;
}

/**
 * Declared absence for a week
 *
 * Tracks both the absence declaration and the ghost player assignment.
 */
export interface WeekAbsence {
  /** Player who is absent */
  playerId: string;

  /** Player name (snapshot for display) */
  playerName?: string;

  /** Which box the player is in */
  boxNumber: number;

  /** Assigned substitute/ghost player (if any) */
  substituteId?: string;

  /** Substitute name (snapshot for display) */
  substituteName?: string;

  /** Reason for absence */
  reason?: 'travel' | 'injury' | 'personal' | 'other' | string;

  /** Custom reason text if 'other' */
  reasonText?: string;

  /** When absence was declared */
  declaredAt: number;

  /** Who declared (self or organizer) */
  declaredByUserId: string;

  /** Absence policy that will be applied */
  policyApplied: AbsencePolicyType;

  /** Whether this was a night-of no-show vs pre-declared */
  isNoShow: boolean;
}

// ============================================
// SETTINGS TYPES
// ============================================

/**
 * Score verification method
 */
export type ScoreVerificationMethod =
  | 'auto_confirm'
  | 'one_opponent'
  | 'majority'
  | 'organizer_only';

/**
 * Score verification settings
 */
export interface BoxScoreVerificationSettings {
  /** Who can enter scores */
  entryMode: 'any_player' | 'winner_only' | 'organizer_only';

  /** Verification method */
  verificationMethod: ScoreVerificationMethod;

  /** Hours before auto-finalization */
  autoFinalizeHours: number;

  /** Allow score disputes */
  allowDisputes: boolean;
}

/**
 * New player join policy
 */
export interface NewPlayerJoinPolicy {
  /** Allow joining mid-season */
  allowMidSeason: boolean;

  /** Which box new players enter */
  entryBox: 'bottom' | 'rating_based';

  /** Position within entry box */
  entryPosition: 'bottom' | 'top';
}

/**
 * Rotating Doubles Box Settings
 *
 * Stored in League.settings.rotatingDoublesBox
 */
export interface RotatingDoublesBoxSettings {
  /** Players per box (4, 5, or 6) */
  boxSize: 4 | 5 | 6;

  /** Game scoring settings */
  gameSettings: GameSettings;

  /** How many promote from each box */
  promotionCount: 1 | 2;

  /** How many relegate from each box */
  relegationCount: 1 | 2;

  /** Initial seeding method (always DUPR) */
  initialSeeding: 'dupr';

  /** Score verification settings */
  scoreVerification: BoxScoreVerificationSettings;

  /** Tiebreaker order (drag-and-drop configurable) */
  tiebreakers: ('wins' | 'head_to_head' | 'points_diff' | 'points_for')[];

  /** Absence policy */
  absencePolicy: AbsencePolicy;

  /** Substitute eligibility rules */
  substituteEligibility: SubstituteEligibility;

  /** Minimum rounds for movement */
  minCompletedRoundsForMovement?: number;

  /** New player join policy */
  newPlayerJoinPolicy?: NewPlayerJoinPolicy;

  /** Freeze movement if player was absent */
  movementFrozenIfAbsent?: boolean;

  /** Venue configuration */
  venue?: BoxLeagueVenueSettings;
}

// ============================================
// VENUE TYPES
// ============================================

/**
 * Court definition for box league
 */
export interface BoxLeagueCourt {
  /** Unique court ID */
  id: string;

  /** Display name (e.g., "Court 1", "Main Court") */
  name: string;

  /** Order for display */
  order: number;

  /** Whether court is active */
  active: boolean;
}

/**
 * Session time slot for box league
 * Allows multiple time slots per match day (e.g., Early 6-7:30pm, Late 7:30-9pm)
 */
export interface BoxLeagueSession {
  /** Unique session ID */
  id: string;

  /** Display name (e.g., "Early", "Late", "Session 1") */
  name: string;

  /** Start time in 24-hour format (e.g., "18:00") */
  startTime: string;

  /** End time in 24-hour format (e.g., "19:30") */
  endTime: string;

  /** Order for display */
  order: number;

  /** Whether session is active */
  active: boolean;
}

/**
 * Box League Venue Settings
 *
 * Configures courts and sessions for the venue.
 * Capacity = courts × sessions × boxSize
 */
export interface BoxLeagueVenueSettings {
  /** Venue name */
  venueName: string;

  /** Venue address */
  venueAddress?: string;

  /** Available courts */
  courts: BoxLeagueCourt[];

  /** Session time slots */
  sessions: BoxLeagueSession[];

  /** Match duration in minutes (default: 20 for games to 11) */
  matchDurationMinutes: number;

  /** Buffer time between rounds in minutes */
  bufferMinutes: number;

  // ==========================================
  // Derived/Calculated
  // ==========================================

  /** Total boxes that can run (courts × sessions) */
  totalBoxCapacity?: number;

  /** Maximum players (totalBoxCapacity × boxSize) */
  maxPlayers?: number;
}

/**
 * Default venue settings
 */
export const DEFAULT_BOX_LEAGUE_VENUE: BoxLeagueVenueSettings = {
  venueName: '',
  courts: [
    { id: 'court_1', name: 'Court 1', order: 1, active: true },
  ],
  sessions: [
    { id: 'session_1', name: 'Session 1', startTime: '18:00', endTime: '19:30', order: 1, active: true },
  ],
  matchDurationMinutes: 20,
  bufferMinutes: 5,
};

// ============================================
// DEFAULT VALUES
// ============================================

/**
 * Default absence policy
 *
 * Uses 'freeze' (no movement) as default to avoid unexpected relegation.
 * Substitutes enabled by default so games can still happen.
 */
export const DEFAULT_ABSENCE_POLICY: AbsencePolicy = {
  policy: 'freeze',
  allowSubstitutes: true,
  subApproval: 'organizer_only',
  maxSubsPerSeason: 2,
};

/**
 * Default substitute eligibility
 */
export const DEFAULT_SUBSTITUTE_ELIGIBILITY: SubstituteEligibility = {
  subMustBeMember: false,
  subAllowedFromBoxes: 'same_or_lower',
  subMustHaveDuprLinked: false,
  subMustHaveDuprConsent: false,
};

/**
 * Default score verification settings
 */
export const DEFAULT_SCORE_VERIFICATION: BoxScoreVerificationSettings = {
  entryMode: 'any_player',
  verificationMethod: 'one_opponent',
  autoFinalizeHours: 24,
  allowDisputes: true,
};

/**
 * Default new player join policy
 */
export const DEFAULT_NEW_PLAYER_JOIN_POLICY: NewPlayerJoinPolicy = {
  allowMidSeason: true,
  entryBox: 'bottom',
  entryPosition: 'bottom',
};

/**
 * Default rotating doubles box settings
 */
export const DEFAULT_ROTATING_DOUBLES_BOX_SETTINGS: RotatingDoublesBoxSettings = {
  boxSize: 5,
  gameSettings: {
    playType: 'doubles',
    pointsPerGame: 11,
    winBy: 2,
    bestOf: 1,
  },
  promotionCount: 1,
  relegationCount: 1,
  initialSeeding: 'dupr',
  scoreVerification: DEFAULT_SCORE_VERIFICATION,
  tiebreakers: ['wins', 'head_to_head', 'points_diff', 'points_for'],
  absencePolicy: DEFAULT_ABSENCE_POLICY,
  substituteEligibility: DEFAULT_SUBSTITUTE_ELIGIBILITY,
  newPlayerJoinPolicy: DEFAULT_NEW_PLAYER_JOIN_POLICY,
};

// ============================================
// ROTATION TYPES (for boxLeagueRotation.ts)
// ============================================

/**
 * Single round pairing in a rotation
 */
export interface RotationRound {
  /** Round number (1-based) */
  roundNumber: number;

  /** Team A player indices (0-based into playerIds array) */
  teamA: [number, number];

  /** Team B player indices (0-based into playerIds array) */
  teamB: [number, number];

  /** Player index with bye (for 5/6 player boxes) */
  byePlayerIndex?: number;

  /** Player indices resting (for 6 player boxes) */
  restingPlayerIndices?: number[];
}

/**
 * Complete rotation pattern for a box size
 */
export interface RotationPattern {
  /** Box size this pattern is for */
  boxSize: 4 | 5 | 6;

  /** Total rounds in the pattern */
  totalRounds: number;

  /** Matches per player */
  matchesPerPlayer: number;

  /** Byes per player (0 for 4-player, 1 for 5-player, 2 for 6-player) */
  byesPerPlayer: number;

  /** All rounds in the pattern */
  rounds: RotationRound[];
}

/**
 * Generated pairing with actual player IDs
 */
export interface GeneratedPairing {
  /** Round number */
  roundNumber: number;

  /** Team A player IDs */
  teamAPlayerIds: [string, string];

  /** Team A player names (for display) */
  teamAPlayerNames?: [string, string];

  /** Team B player IDs */
  teamBPlayerIds: [string, string];

  /** Team B player names (for display) */
  teamBPlayerNames?: [string, string];

  /** Player ID with bye */
  byePlayerId?: string;

  /** Bye player name (for display) */
  byePlayerName?: string;

  /** Player IDs resting (for 6-player) */
  restingPlayerIds?: string[];
}

/**
 * Validation result for rotation patterns
 */
export interface PatternValidationResult {
  /** Is the pattern valid? */
  valid: boolean;

  /** Error message if invalid */
  error?: string;

  /** Warning messages for non-critical issues */
  warnings?: string[];

  /** Validation checks performed */
  checks?: {
    eachPlayerPlaysCorrectMatches: boolean;
    eachPlayerRestsCorrectTimes: boolean;
    partnerDistributionBalanced: boolean;
    opponentDistributionBalanced: boolean;
  };
}

// ============================================
// LEAGUE SUBSTITUTES TABLE (V07.44)
// ============================================

/**
 * Substitute availability status
 */
export type SubstituteStatus = 'available' | 'unavailable' | 'banned';

/**
 * Record of a single substitution instance
 */
export interface SubstitutionRecord {
  /** Week number they substituted */
  weekNumber: number;

  /** Season ID */
  seasonId: string;

  /** Player ID they replaced */
  replacedPlayerId: string;

  /** Player name they replaced (snapshot) */
  replacedPlayerName?: string;

  /** Box they played in */
  boxNumber: number;

  /** When they were assigned */
  assignedAt: number;

  /** Matches played that week */
  matchesPlayed: number;

  /** Wins that week */
  wins: number;

  /** Points scored */
  pointsFor: number;

  /** Points conceded */
  pointsAgainst: number;
}

/**
 * League Substitute
 *
 * Tracks substitute (ghost) players who can fill in for absent players.
 * Stored in leagues/{leagueId}/substitutes/{odUserId}
 *
 * V07.44: Separate table for substitute tracking
 */
export interface LeagueSubstitute {
  /** OD User ID */
  odUserId: string;

  /** Display name (cached for quick display) */
  displayName: string;

  /** Email (for contact) */
  email?: string;

  /** Phone (for SMS notifications) */
  phone?: string;

  // ==========================================
  // DUPR Info (for eligibility checking)
  // ==========================================

  /** DUPR ID if linked */
  duprId?: string;

  /** DUPR doubles rating */
  duprDoublesRating?: number;

  /** DUPR singles rating */
  duprSinglesRating?: number;

  /** Has given DUPR consent */
  duprConsent?: boolean;

  // ==========================================
  // Availability
  // ==========================================

  /** Current availability status */
  status: SubstituteStatus;

  /** Reason if unavailable/banned */
  statusReason?: string;

  /** Weeks they've indicated they're available */
  availableWeeks?: number[];

  /** Weeks they've indicated they're NOT available */
  unavailableWeeks?: number[];

  /** Preferred boxes (1 = top box) */
  preferredBoxes?: number[];

  // ==========================================
  // History & Stats
  // ==========================================

  /** Complete history of substitutions */
  substitutionHistory: SubstitutionRecord[];

  /** Total times they've substituted */
  totalSubstitutions: number;

  /** Total matches played as substitute */
  totalMatchesPlayed: number;

  /** Total wins as substitute */
  totalWins: number;

  /** Total points scored as substitute */
  totalPointsFor: number;

  /** Total points conceded as substitute */
  totalPointsAgainst: number;

  // ==========================================
  // Administrative
  // ==========================================

  /** When they were added as potential substitute */
  addedAt: number;

  /** Who added them (organizer user ID) */
  addedByUserId: string;

  /** When last used as substitute */
  lastUsedAt?: number;

  /** Organizer notes */
  notes?: string;

  /** Is this person also a league member? */
  isMember?: boolean;
}

/**
 * Rotating Doubles Box League Types - Barrel Exports
 *
 * FILE LOCATION: types/rotatingDoublesBox/index.ts
 * VERSION: V07.27
 */

// ============================================
// TYPE DEFINITIONS
// ============================================

export type {
  // Season types
  SeasonState,
  WeekStatus,
  WeekScheduleEntry,
  BoxLeagueSeason,

  // Week types
  BoxWeekState,
  WeekSession,
  AttendanceStatus,
  PlayerAttendance,
  BoxAssignment,
  BoxCompletionStatus,
  WeekRulesSnapshot,
  BoxLeagueWeek,

  // Member types
  MemberStatus,
  BoxLeagueMember,

  // Standings types
  BoxStanding,
  BoxStandingsSnapshot,

  // Movement types
  MovementReason,
  PlayerMovement,

  // Season stats types
  SeasonPlayerStats,

  // Absence types
  AbsencePolicyType,
  SubApprovalType,
  SubBoxRestriction,
  AbsencePolicy,
  SubstituteEligibility,
  WeekAbsence,

  // Settings types
  ScoreVerificationMethod,
  BoxScoreVerificationSettings,
  NewPlayerJoinPolicy,
  RotatingDoublesBoxSettings,

  // Venue types
  BoxLeagueCourt,
  BoxLeagueSession,
  BoxLeagueVenueSettings,

  // Rotation types
  RotationRound,
  RotationPattern,
  GeneratedPairing,
  PatternValidationResult,
} from './boxLeagueTypes';

// ============================================
// DEFAULT VALUES
// ============================================

export {
  DEFAULT_ABSENCE_POLICY,
  DEFAULT_SUBSTITUTE_ELIGIBILITY,
  DEFAULT_SCORE_VERIFICATION,
  DEFAULT_NEW_PLAYER_JOIN_POLICY,
  DEFAULT_ROTATING_DOUBLES_BOX_SETTINGS,
  DEFAULT_BOX_LEAGUE_VENUE,
} from './boxLeagueTypes';

// ============================================
// ROTATION FUNCTIONS
// ============================================

export {
  getRotationPattern,
  getByeRounds,
  generateBoxPairings,
  validatePatternFairness,
  getRoundCount,
  getMatchesPerPlayer,
  getByesPerPlayer,
  formatPairingForDisplay,
  getScheduleDisplay,
} from './boxLeagueRotation';

export type { PlayerInfo } from './boxLeagueRotation';

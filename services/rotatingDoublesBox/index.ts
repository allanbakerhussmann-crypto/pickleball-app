/**
 * Rotating Doubles Box League Services - Barrel Exports
 *
 * FILE LOCATION: services/rotatingDoublesBox/index.ts
 * VERSION: V07.28
 */

// ============================================
// BOX PACKING
// ============================================

export {
  packPlayersIntoBoxes,
  distributePlayersToBoxes,
  canPackPlayers,
  getValidPlayerCounts,
  getInvalidPlayerCounts,
  getPackingAdjustmentSuggestions,
  checkRebalanceNeeded,
  formatPackingForDisplay,
} from './boxLeagueBoxPacking';

export type {
  BoxPackingResult,
  BoxDistribution,
  PackingAdjustmentSuggestion,
} from './boxLeagueBoxPacking';

// ============================================
// SEASON LIFECYCLE
// ============================================

export {
  createSeason,
  getSeason,
  getActiveSeason,
  getSeasons,
  activateSeason,
  completeSeason,
  cancelSeason,
  rescheduleWeek,
  cancelWeek,
  markWeekCompleted,
  markWeekActive,
  canActivateSeason,
  canCompleteSeason,
  getCurrentWeekNumber,
  getNextScheduledDate,
  getSeasonProgress,
} from './boxLeagueSeason';

// ============================================
// WEEK STATE MACHINE
// ============================================

export {
  createWeekDraft,
  getWeek,
  getWeeks,
  getCurrentWeek,
  canTransitionTo,
  activateWeek,
  startClosing,
  finalizeWeek,
  updateBoxAssignments,
  updateCourtAssignments,
  updateSessions,
  freezeBoxMovement,
  updateMatchCounts,
  updateBoxCompletion,
} from './boxLeagueWeek';

// ============================================
// MATCH FACTORY
// ============================================

export {
  createBoxLeagueMatch,
  generateMatchesForWeek,
  getMatchesForWeek,
  getMatchesForBox,
  getMatchCounts,
  getMatchesForDuprSubmission,
  calculatePlayerResults,
  validateMatchForDupr,
  canConfirmScore,
  getConfirmEligibleUsers,
} from './boxLeagueMatchFactory';

export type { PlayerLookup } from './boxLeagueMatchFactory';

// ============================================
// STANDINGS
// ============================================

export {
  calculateWeekStandings,
  calculateBoxStandings,
  createStandingsSnapshot,
  isStandingsStale,
  formatStandingsTable,
  getPlayerStanding,
  getPromotionCandidates,
  getRelegationCandidates,
} from './boxLeagueStandings';

// ============================================
// SEASON STATS
// ============================================

export {
  initializePlayerStats,
  initializeSeasonStats,
  updateStatsAfterWeek,
  recordSubstitutePlay,
  getSeasonLeaderboard,
  getTopPerformers,
  getMostImproved,
  calculateFinalStandings,
  getPlayerSeasonStats,
  getPlayerRank,
  formatStatsForDisplay,
  formatLeaderboardRow,
} from './boxLeagueSeasonStats';

// ============================================
// PROMOTION / RELEGATION
// ============================================

export {
  applyMovements,
  generateNextWeekAssignments,
  handleAbsentPlayerMovement,
  getNewJoinerPlacement,
  removeWithdrawnPlayer,
  needsRebalancing,
  suggestRebalancing,
  formatMovementsForDisplay,
  getMovementSummary,
} from './boxLeaguePromotion';

// ============================================
// ATTENDANCE
// ============================================

export {
  checkInPlayer,
  markNoShow,
  markExcused,
  lockAttendance,
  unlockAttendance,
  canStartBox,
  canStartAllBoxes,
  getAttendanceSummary,
  getBoxAttendance,
  getNotCheckedIn,
  getNoShows,
  formatAttendanceStatus,
  formatAttendanceSummary,
} from './boxLeagueAttendance';

// ============================================
// ABSENCE / SUBSTITUTES
// ============================================

export {
  // Declaration
  declareAbsence,
  cancelAbsence,
  recordNoShowAbsence,

  // Substitute assignment
  assignSubstitute,
  removeSubstitute,
  canBeSubstitute,
  getEligibleSubstitutes,
  hasExceededMaxSubs,
  getPlayerAbsenceSummary,

  // Policy application
  applyAbsencePolicy,
  canSubmitMatchToDupr,
  getDuprPlayerIdsForMatch,
  getSubstituteInfoForMatch,
  canBoxRunMatches,

  // Display helpers
  getAbsencesForDisplay,
  getAbsencesByBox,
  getAbsenceSummary,
  formatAbsence,
  formatPolicyName,
} from './boxLeagueAbsence';

export type { AbsentPlayerStanding } from './boxLeagueAbsence';

// ============================================
// ELIGIBILITY
// ============================================

export {
  canJoinLeague,
  canJoinMidSeason,
  canSubstitute,
  checkBoxRestriction,
  isMatchDuprEligibleWithSub,
  calculateInitialBoxPlacement,
  calculateBoxAverages,
  validateBoxAssignmentPlayers,
} from './boxLeagueEligibility';

export type { EligibilityResult } from './boxLeagueEligibility';

// ============================================
// SCHEDULE GENERATION
// ============================================

export {
  generateBoxLeagueSchedule,
  canGenerateSchedule,
  getSchedulePreview,
  getLeagueMembersWithRatings,
  sortMembersByRating,
  createBoxAssignments,
  assignCourtsToBoxes,
  createWeekSessions,
} from './boxLeagueScheduleGeneration';

export type {
  ScheduleGenerationResult,
  ScheduleGenerationInput,
} from './boxLeagueScheduleGeneration';

/**
 * Firebase Services - Main Entry Point
 *
 * This file re-exports all Firebase functionality for backwards compatibility.
 * Import from here: import { ... } from './services/firebase';
 *
 * UPDATED V06.33:
 * - Added pool results and bracket seeds service exports
 * - Added generateBracketFromSeeds for Results Table Architecture
 *
 * FILE LOCATION: services/firebase/index.ts
 * VERSION: V06.33
 */

// Re-export config and core instances
export {
  db,
  storage,
  functions,
  getAuth,
  saveFirebaseConfig,
  hasCustomConfig,
  isFirebaseConfigured,
} from './config';

// Re-export Firestore primitives for components that need direct access
export {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  deleteDoc,
  writeBatch,
  setDoc,
  updateDoc,
  addDoc,
  arrayUnion,
  arrayRemove,
  increment,
  serverTimestamp,
  onSnapshot,
  orderBy,
  limit,
  Timestamp,
} from '@firebase/firestore';

// ============================================
// Re-export all modules for backwards compatibility
// ============================================

// Users
export {
  createUserProfile,
  getUserProfile,
  updateUserProfile,
  updateUserProfileDoc,
  searchUsers,
  searchEligiblePartners,
  getAllUsers,
  getUsersByIds,
  uploadProfileImage,
  promoteToAppAdmin,
  demoteFromAppAdmin,
  promoteToOrganizer,
  demoteFromOrganizer,
  promoteToPlayer,
  demoteFromPlayer,
} from './users';

// Tournaments
export {
  saveTournament,
  subscribeToTournaments,
  getAllTournaments,
  getTournament,
  subscribeToDivisions,
  updateDivision,
} from './tournaments';

// Teams
export {
  subscribeToTeams,
  createTeam,
  deleteTeam,
  createTeamServer,
  ensureTeamExists,
  getUserTeamsForTournament,
  withdrawPlayerFromDivision,
  getOpenTeamsForDivision,
  getTeamsForDivision,
  // Capacity enforcement (V06.05)
  getActiveTeamCountForDivision,
  isDivisionFull,
  subscribeToUserPartnerInvites,
  respondToPartnerInvite,
  getPendingInvitesForDivision,
  // Payment management (V06.08)
  markTeamAsPaid,
  updateTeamPaymentStatus,
} from './teams';

// Matches
export {
  subscribeToMatches,
  createMatch,
  updateMatchScore,
  batchCreateMatches,
  generatePoolsSchedule,
  generateBracketSchedule,
  generateFinalsFromPools,
  // Pool Play Medals schedule generation (V06.06)
  generatePoolPlaySchedule,
  generateFinalsFromPoolStandings,
  // V06.33 Results Table Architecture
  generateBracketFromSeeds,
  // Match completion with bracket advancement (V06.05)
  completeMatchWithAdvancement,
  getMatch,
  processMatchBye,
  // Schedule publishing (V06.05)
  publishScheduleTimes,
  // Data cleanup utilities
  deleteCorruptedSelfMatches,
  clearTestData,
  // V07.49: League match queries
  getMyMatchesForWeek,
} from './matches';

// ============================================
// V06.35 Results Table Architecture
// ============================================
export {
  buildPoolResults,
  getPoolResults,
  poolResultToStandings,
  // V06.35: Automatic pool results on match completion
  updatePoolResultsOnMatchComplete,
  // V07.30: Safe wrapper (non-fatal) for callers
  updatePoolResultsOnMatchCompleteSafe,
} from './poolResults';

export {
  buildBracketSeeds,
  buildPlateBracketSeeds,  // V06.39: Plate bracket seeds
  getBracketSeeds,
} from './bracketSeeds';

// ============================================
// V07.14 League Standings (Same pattern as poolResults)
// ============================================
export {
  buildLeagueStandings,
  buildWeekStandings,
  getLeagueStandings,
  getAllLeagueStandings,
  isStandingsStale,
  getStandingsStatus,
  updateStandingsOnMatchComplete,
  rebuildAllStandings,
  rebuildAllStandingsById,
} from './leagueStandings';

// Courts
export {
  subscribeToCourts,
  addCourt,
  updateCourt,
  deleteCourt,
} from './courts';

// Registrations
export {
  getRegistration,
  saveRegistration,
  getAllRegistrations,
  finalizeRegistration,
  ensureRegistrationForUser,
  // Check-in functions (V06.05)
  checkInPlayer,
  isPlayerCheckedIn,
  getCheckInStats,
  isWithinCheckInWindow,
  getTournamentRegistrations,
} from './registrations';

// Clubs
export {
  createClub,
  getClub,
  getAllClubs,
  getUserClubs,
  subscribeToClub,
  getClubsForUser,
  subscribeToClubRequests,
  subscribeToMyClubJoinRequest,
  requestJoinClub,
  approveClubJoinRequest,
  declineClubJoinRequest,
  bulkImportClubMembers,
} from './clubs';

// Meetups
export {
  createMeetup,
  getMeetups,
  getMeetupById,
  setMeetupRSVP,
  getMeetupRSVPs,
  updateMeetup,
  cancelMeetup,
  deleteMeetup,
  removeMeetupRSVP,
  getMyMeetups,
} from './meetups';

// Social Events & Game Sessions
export {
  // Legacy Social Events
  createSocialEvent,
  subscribeToSocialEvents,
  joinSocialEvent,
  leaveSocialEvent,
  deleteSocialEvent,
  // Game Sessions
  createGameSession,
  getGameSession,
  subscribeToGameSessions,
  joinGameSession,
  leaveGameSession,
  updateGameSessionStatus,
  deleteGameSession,
} from './social';

// ============================================
// LEAGUES (UPDATED V05.32)
// ============================================
export {
  // League CRUD
  createLeague,
  getLeague,
  updateLeague,
  deleteLeague,
  getLeagues,
  subscribeToLeagues,
  getUserLeagues,
  
  // League Divisions
  createLeagueDivision,
  getLeagueDivisions,
  subscribeToLeagueDivisions,
  updateLeagueDivision,
  deleteLeagueDivision,
  
  // League Members
  joinLeague,
  leaveLeague,
  getLeagueMemberByUserId,
  getLeagueMembers,
  subscribeToLeagueMembers,
  updateMemberStats,
  updateMemberPaymentStatus,
  
  // League Teams (for doubles)
  createLeagueTeam,
  getOpenLeagueTeams,
  updateLeagueTeam,
  
  // Partner Invites
  createLeaguePartnerInvite,
  getPendingLeagueInvites,
  respondToLeaguePartnerInvite,

  // Doubles Partner System (V07.26)
  subscribeToUserLeaguePartnerInvites,
  subscribeToMyOpenTeamRequests,
  getOpenLeagueMembers,
  joinLeagueWithPartnerInvite,
  joinLeagueAsOpenTeam,
  createLeagueJoinRequest,
  respondToLeaguePartnerInviteAtomic,
  respondToLeagueJoinRequest,
  getMyOpenTeamRequests,
  // V07.27: Direct join for open teams (no request/approval needed)
  joinOpenTeamDirect,
  cancelPendingRequestsForTeam,

  // V07.29: Week state management (closed/open/locked)
  getWeekState,
  setWeekState,
  openLeagueWeek,
  closeLeagueWeek,
  lockLeagueWeek,
  unlockLeagueWeek,  // Alias for openLeagueWeek (backwards compat)
  isWeekUnlocked,
  initializeWeekStates,  // V07.32: Initialize week states after match generation

  // League Matches
  createLeagueMatch,
  getLeagueMatches,
  subscribeToLeagueMatches,
  submitLeagueMatchResult,
  confirmLeagueMatchResult,
  disputeLeagueMatchResult,
  
  // Challenges (Ladder)
  createChallenge,
  respondToChallenge,
  getPendingChallenges,
  completeChallenge,
  subscribeToUserChallenges,
  
  // Ladder Rankings
  swapLadderPositions,
  
  // Registration
  saveLeagueRegistration,
  getLeagueRegistration,
  
  // Status Transitions
  openLeagueRegistration,
  startLeague,
  completeLeague,
  cancelLeague,

  // Auto-Registration (NEW V05.44)
  checkAndUpdateLeagueStatus,
  getExpectedLeagueStatus,

  // DUPR+ Gate (V07.50)
  checkDuprPlusGate,

  // Payment Helpers (V07.53)
  generateBankTransferReference,
  getMemberPaymentStatus,
  getPartnerPaymentStatus,
  isTeamFullyPaid,
  markMemberAsPaid,

  // Types
  type LeaguePaymentParams,
} from './leagues';

// League Scheduling (V07.27)
export {
  scheduleMatchesToSlots,
  applyScheduleToMatches,
  getLeagueMatches as getLeagueMatchesForScheduling,
  scheduleLeagueMatches,
  updateScheduleStatus,
  clearMatchSchedules,
  checkTeamCapacity,
  type ScheduleResult,
  type ScheduledMatch,
} from './leagueScheduling';

// ============================================
// LEAGUE MATCH GENERATION (NEW V05.32)
// ============================================
export {
  generateLeagueSchedule,
  generateRoundRobinSchedule,
  generateSwissRound,
  generateBoxLeagueSchedule,
  processBoxLeaguePromotions,
  clearLeagueMatches,
  type GenerationResult,
} from './leagueMatchGeneration';

// ============================================
// BOX LEAGUE SERVICE (UPDATED V05.44)
// ============================================
export {
  // Player operations
  addBoxLeaguePlayer,
  getBoxLeaguePlayers,
  subscribeToBoxLeaguePlayers,
  updateBoxLeaguePlayer,
  seedBoxLeaguePlayers,

  // Player drag-and-drop (NEW V05.44)
  movePlayerBetweenBoxes,
  reorderPlayersInBox,
  swapPlayersBetweenBoxes,

  // Match operations
  generateWeekMatches,
  getBoxLeagueMatchesForWeek,
  getBoxLeagueMatchesForBox,
  subscribeToBoxLeagueMatches,

  // Week operations
  createBoxLeagueWeek,
  getBoxLeagueWeek,
  getBoxLeagueWeeks,
  subscribeToBoxLeagueWeeks,

  // Score entry
  enterBoxLeagueScore,

  // Standings & Processing
  calculateBoxStandings,
  processBoxLeagueWeek,

  // Schedule Generation
  generateBoxLeagueSchedule as generateNewBoxLeagueSchedule,
} from './boxLeague';

// ============================================
// SCORE VERIFICATION SERVICE (NEW V05.44)
// ============================================
export {
  // Core functions
  confirmMatchScore,
  disputeMatchScore,
  resolveDispute,
  autoFinalizeMatch,

  // Helpers
  getRequiredConfirmations,
  createInitialVerificationData,
  canUserConfirm,
  shouldAutoFinalize,

  // Constants
  DEFAULT_VERIFICATION_SETTINGS,

  // Types
  type VerifiableEventType,
  type VerificationResult,
  type DisputeResult,
  type ResolveResult,
} from './scoreVerification';

// Court Bookings
export {
  addClubCourt,
  updateClubCourt,
  deleteClubCourt,
  getClubCourts,
  subscribeToClubCourts,
  getClubBookingSettings,
  updateClubBookingSettings,
  createCourtBooking,
  cancelCourtBooking,
  getBookingsForDate,
  getBookingsForDateRange,
  subscribeToBookingsForDate,
  getUserBookings,
  getUserBookingCountForDate,
  canUserBook,
  canCancelBooking,
  generateTimeSlots,
  calculateEndTime,
  isSlotInPast,
  formatDateLabel,
} from './courtBookings';

// Organizer Requests
export {
  createOrganizerRequest,
  getOrganizerRequest,
  getOrganizerRequestByUserId,
  getPendingOrganizerRequests,
  getAllOrganizerRequests,
  subscribeToPendingOrganizerRequests,
  subscribeToAllOrganizerRequests,
  approveOrganizerRequest,
  denyOrganizerRequest,
  deleteOrganizerRequest,
  hasUserPendingRequest,
  getUserRequestStatus,
  type OrganizerRequest,
  type OrganizerRequestStatus,
  type CreateOrganizerRequestInput,
} from './organizerRequests';

// Audit
export { logAudit } from './audit';

// Meetup Matches
export * from './meetupMatches';

// ============================================
// LIVE SCORES SERVICE (NEW V06.03)
// ============================================
export {
  // Create
  createLiveScore,
  createStandaloneGame,
  // Read
  getLiveScore,
  subscribeToLiveScore,
  subscribeToEventLiveScores,
  getLiveScoreByMatchId,
  getGameByShareCode,
  subscribeToStandaloneGame,
  getUserStandaloneGames,
  // Update
  updateLiveScore,
  updateStandaloneGame,
  syncLiveScoreState,
  assignScorer,
  removeScorer,
  // Delete
  deleteLiveScore,
  deleteStandaloneGame,
  // Scoreboard
  getScoreboardConfig,
  saveScoreboardConfig,
  subscribeToScoreboardConfig,
  // Batch
  batchCreateLiveScores,
  completeLiveScore,
  // Helpers
  canUserScore,
  getActiveMatchesCount,
} from './liveScores';

// ============================================
// PRIVACY & COMPLIANCE (NEW V06.04)
// ============================================

// Account Deletion
export {
  deleteAccount,
  exportUserData,
  type DeletionResult,
} from './accountDeletion';

// Breach Logging
export {
  logBreach,
  updateBreachStatus,
  addBreachAction,
  markUsersNotified,
  getBreachById,
  getAllBreaches,
  getNotifiableBreaches,
  getBreachesAffectingUser,
  assessNotificationRequirement,
  formatBreachForReport,
  type BreachRecord,
  type BreachSeverity,
  type BreachCategory,
  type BreachStatus,
  type LogBreachInput,
} from './breachLogging';

// Data Retention
export {
  getRetentionPolicies,
  getRetentionPolicyByType,
  getDataRetentionLogs,
  runDataCleanup,
  calculateRetentionDate,
  isEligibleForCleanup,
  getUsersMarkedForDeletion,
  getUserDataSummary,
  formatRetentionPeriod,
  DEFAULT_RETENTION_POLICIES,
  type RetentionPolicy,
  type DataRetentionLog,
  type CleanupResult,
} from './dataRetention';

// Privacy Requests
export {
  createPrivacyRequest,
  getPrivacyRequest,
  getAllPrivacyRequests,
  getPendingPrivacyRequestsCount,
  getUserPrivacyRequests,
  updatePrivacyRequestStatus,
  addPrivacyRequestNotes,
  getRequestTypeLabel,
  getStatusColor,
  calculateResponseDeadline,
  isRequestOverdue,
  type PrivacyRequest,
  type PrivacyRequestType,
  type PrivacyRequestStatus,
  type CreatePrivacyRequestInput,
} from './privacyRequests';

// ============================================
// NOTIFICATIONS (NEW V06.07)
// ============================================
export {
  createNotification,
  createNotificationBatch,
  subscribeToNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  notifyCourtAssignment,
  notifyMatchResult,
  notifyScoreConfirmation,
} from './notifications';

// ============================================
// PHONE VERIFICATION (NEW V06.18)
// ============================================
export {
  sendPhoneVerificationCode,
  verifyPhoneCode,
  formatPhoneE164,
  isValidPhoneNumber,
  formatPhoneForDisplay,
  isPhoneVerified,
  canReceiveSMS,
} from './phoneVerification';

// ============================================
// SMS CREDITS (NEW V07.19)
// ============================================
export {
  // Credits CRUD
  getOrCreateSMSCredits,
  getSMSCredits,
  getSMSBalance,
  hasSufficientCredits,
  subscribeToSMSCredits,
  // Credit transactions
  deductCredits,
  addCredits,
  // Usage history
  logSMSUsage,
  getSMSUsageHistory,
  subscribeToSMSUsage,
  // Purchase history
  getSMSPurchaseHistory,
  createPendingPurchase,
  updatePurchaseStatus,
  // SMS bundles
  getSMSBundles,
  getSMSBundle,
  subscribeToSMSBundles,
  saveSMSBundle,
  deactivateSMSBundle,
  // Helpers
  formatPriceNZD,
  getPricePerSMS,
  formatPricePerSMS,
  isCreditsLow,
  getBalanceColorClass,
} from './smsCredits';

// ============================================
// LEAGUE SUBSTITUTES (NEW V07.44)
// ============================================
export {
  // CRUD
  addSubstitute,
  getSubstitute,
  getSubstitutes,
  getAvailableSubstitutes,
  updateSubstitute,
  removeSubstitute,
  // Status management
  markSubstituteAvailable,
  markSubstituteUnavailable,
  banSubstitute,
  // Substitution tracking
  recordSubstitution,
  getSubstitutionHistory,
  getWeekSubstitutions,
  // Availability
  setWeekAvailability,
  isAvailableForWeek,
  getAvailableSubstitutesForWeek,
  // Subscriptions
  subscribeToSubstitutes,
  subscribeToAvailableSubstitutes,
  // Stats & reporting
  getTopSubstitutes,
  getSubstituteStats,
  // Utility
  addSubstituteFromUser,
} from './leagueSubstitutes';

// ============================================
// COMPETITION STUBS (Placeholder functions for CompetitionManager)
// ============================================

import type { Competition, CompetitionEntry, Match, StandingsEntry } from '../../types';

// Stub functions for competition management - to be implemented
export const getCompetition = async (_competitionId: string): Promise<Competition | null> => {
  console.warn('getCompetition: Not implemented');
  return null;
};

export const updateCompetition = async (_competitionId: string, _data: Partial<Competition>): Promise<void> => {
  console.warn('updateCompetition: Not implemented');
};

export const subscribeToCompetitionMatches = (
  _competitionId: string,
  callback: (matches: Match[]) => void
): (() => void) => {
  console.warn('subscribeToCompetitionMatches: Not implemented');
  callback([]);
  return () => {};
};

export const subscribeToCompetitionEntries = (
  _competitionId: string,
  callback: (entries: CompetitionEntry[]) => void
): (() => void) => {
  console.warn('subscribeToCompetitionEntries: Not implemented');
  callback([]);
  return () => {};
};

export const subscribeToStandings = (
  _competitionId: string,
  callback: (standings: StandingsEntry[]) => void
): (() => void) => {
  console.warn('subscribeToStandings: Not implemented');
  callback([]);
  return () => {};
};

export const createCompetitionEntry = async (_competitionId: string, _entry: Partial<CompetitionEntry>): Promise<string> => {
  console.warn('createCompetitionEntry: Not implemented');
  return '';
};

export const getCompetitionEntry = async (_competitionId: string, _entryId: string): Promise<CompetitionEntry | null> => {
  console.warn('getCompetitionEntry: Not implemented');
  return null;
};

export const createCompetition = async (_data: Partial<Competition>): Promise<string> => {
  console.warn('createCompetition: Not implemented');
  return '';
};

export const listCompetitions = async (): Promise<Competition[]> => {
  console.warn('listCompetitions: Not implemented');
  return [];
};

// ============================================
// TEAM LEAGUE (INTERCLUB) SERVICE (V07.53)
// ============================================
export {
  // Team CRUD
  createInterclubTeam,
  getInterclubTeam,
  getInterclubTeams,
  getInterclubTeamsByStatus,
  updateInterclubTeam,
  approveTeam,
  rejectTeam,
  withdrawTeam,
  // Subscriptions
  subscribeToInterclubTeams,
  subscribeToFixtures,
  // Roster management
  addPlayerToRoster,
  removePlayerFromRoster,
  acceptPlayerWaivers,
  updatePlayerSeeding,
  // Fixtures
  createFixture,
  getFixture,
  getFixtures,
  getFixturesByWeek,
  getTeamFixtures,
  updateFixture,
  // Lineup
  submitLineup,
  unlockLineup,
  validateLineup,
  // Scoring
  proposeFixtureScores,
  confirmFixtureScores,
  disputeFixtureScores,
  finalizeFixture,
  // Standings
  calculateStandings as calculateTeamLeagueStandings,
  // Schedule
  generateTeamLeagueSchedule,
  // Listing (V07.54+)
  getTeamLeagues,
  getTeamLeague,
  subscribeToTeamLeagues,
  subscribeToTeamLeague,
  // CRUD
  createTeamLeague,
  updateTeamLeague,
  deleteTeamLeague,
  updateTeamLeagueStatus,
} from './teamLeague';

// ============================================
// STANDING MEETUPS (V07.56)
// ============================================
export {
  // CRUD
  getStandingMeetup,
  getStandingMeetupsByClub,
  getPublicStandingMeetups,
  createStandingMeetup,
  updateStandingMeetup,
  archiveStandingMeetup,
  deleteStandingMeetup,
  // Subscriptions
  subscribeToStandingMeetup,
  subscribeToClubStandingMeetups,
  // Occurrences
  getOccurrence,
  getUpcomingOccurrences,
  getPastOccurrences,
  subscribeToOccurrences,
  // Participants
  getParticipant,
  getOccurrenceParticipants,
  subscribeToOccurrenceParticipants,
  // Index (Discovery)
  getUpcomingOccurrenceIndex,
  subscribeToOccurrenceIndex,
  // User Sessions
  getUserUpcomingSessions,
} from './standingMeetups';

// Standing Meetup Registrations (MVP - one-time payments)
// ============================================
export {
  // Read (prefixed to avoid conflict with tournament registrations)
  getRegistration as getStandingMeetupRegistration,
  getRegistrationByMeetupAndUser as getStandingMeetupRegistrationByMeetupAndUser,
  getRegistrationsByMeetup as getStandingMeetupRegistrationsByMeetup,
  getPendingRegistrationsByMeetup as getPendingStandingMeetupRegistrations,
  getRegistrationsByUser as getStandingMeetupRegistrationsByUser,
  // Subscriptions
  subscribeToRegistrationsByMeetup,
  subscribeToPendingRegistrations,
  subscribeToUserRegistrations,
  // Helpers
  buildRegistrationId,
  isUserRegistered,
  hasUserPaid,
} from './standingMeetupRegistrations';
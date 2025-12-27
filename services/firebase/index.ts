/**
 * Firebase Services - Main Entry Point
 *
 * This file re-exports all Firebase functionality for backwards compatibility.
 * Import from here: import { ... } from './services/firebase';
 *
 * UPDATED V06.03:
 * - Added live scores service exports
 *
 * FILE LOCATION: services/firebase/index.ts
 * VERSION: V06.03
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
  // Match completion with bracket advancement (V06.05)
  completeMatchWithAdvancement,
  getMatch,
  processMatchBye,
  // Schedule publishing (V06.05)
  publishScheduleTimes,
  // Data cleanup utilities
  deleteCorruptedSelfMatches,
} from './matches';

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
} from './leagues';

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
  deleteUserData,
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
} from './notifications';

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
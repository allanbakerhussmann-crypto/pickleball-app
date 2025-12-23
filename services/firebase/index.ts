/**
 * Firebase Services - Main Entry Point
 *
 * This file re-exports all Firebase functionality for backwards compatibility.
 * Import from here: import { ... } from './services/firebase';
 *
 * UPDATED V05.44:
 * - Added score verification service exports
 * - Removed postpone functionality exports
 *
 * FILE LOCATION: services/firebase/index.ts
 * VERSION: V05.44
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
/**
 * Firebase Services - Main Entry Point
 * 
 * This file re-exports all Firebase functionality for backwards compatibility.
 * Import from here: import { ... } from './services/firebase';
 * 
 * FILE LOCATION: services/firebase/index.ts
 * VERSION: V05.37
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
// LEAGUE POSTPONE SERVICE (NEW V05.37)
// ============================================
export {
  // Match Postpone/Reschedule
  postponeMatch,
  rescheduleMatch,
  cancelPostponedMatch,
  
  // Week Postpone/Reschedule
  postponeWeek,
  rescheduleWeek,
  
  // Queries
  getPostponedMatches,
  
  // Helpers
  formatPostponeReason,
  getDefaultMakeupDays,
} from './leaguePostpone';

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
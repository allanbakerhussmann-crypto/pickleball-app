/**
 * Firebase Services - Main Entry Point
 * 
 * This file re-exports all Firebase functionality for backwards compatibility.
 * Import from here: import { ... } from './services/firebase';
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

// Social Events (Legacy)
export {
  createSocialEvent,
  subscribeToSocialEvents,
  joinSocialEvent,
  leaveSocialEvent,
  deleteSocialEvent,
} from './social';

// Leagues
export {
  createLeague,
  getLeague,
  updateLeague,
  deleteLeague,
  getLeagues,
  subscribeToLeagues,
  joinLeague,
  leaveLeague,
  getLeagueMemberByUserId,
  getLeagueMembers,
  subscribeToLeagueMembers,
  updateMemberStats,
  createLeagueMatch,
  getLeagueMatches,
  subscribeToLeagueMatches,
  submitLeagueMatchResult,
  confirmLeagueMatchResult,
  disputeLeagueMatchResult,
  createChallenge,
  respondToChallenge,
  getPendingChallenges,
  getUserLeagues,
} from './leagues';

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

// Audit
export { logAudit } from './audit';
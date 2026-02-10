/**
 * Firebase Cloud Functions - Main Entry Point
 * 
 * FILE LOCATION: functions/src/index.ts
 */

import * as admin from 'firebase-admin';

// Initialize Firebase Admin
admin.initializeApp();

// ============================================
// STRIPE FUNCTIONS
// ============================================

export {
  // Club Connect (V1 - Legacy)
  stripe_createConnectAccount,
  stripe_getConnectAccountStatus,
  stripe_createConnectLoginLink,

  // User/Organizer Connect (V1 - Legacy)
  stripe_createUserConnectAccount,
  stripe_createUserConnectLoginLink,

  // V2 Account Functions (Direct Charges)
  stripe_createAccountV2,
  stripe_createAccountLinkV2,
  stripe_getAccountStatusV2,
  stripe_createUserAccountV2,
  stripe_createUserAccountLinkV2,

  // V2 Thin Events Webhook
  stripe_v2_webhook,

  // Checkout & Webhook
  stripe_createCheckoutSession,
  stripe_webhook,

  // Refunds
  stripe_createRefund,

  // SMS Bundles
  stripe_purchaseSMSBundle,
  stripe_seedSMSBundles,

  // Standing Meetup Subscriptions (V07.53)
  stripe_createStandingMeetupSubscription,
  stripe_cancelStandingMeetupSubscription,

  // Standing Meetup Guest Checkout (V07.59)
  standingMeetup_createGuestCheckoutSession,
  standingMeetup_verifyGuestCheckoutSession,
  // Standing Meetup Quick Register at door (V07.59)
  standingMeetup_createQuickRegisterCheckoutSession,
} from './stripe';

// ============================================
// ADMIN FUNCTIONS
// ============================================

export {
  admin_promoteToAppAdmin,
  admin_demoteFromAppAdmin,
  admin_promoteToOrganizer,
  admin_demoteFromOrganizer,
  admin_getAuditLogs,
} from './admin';

// ============================================
// PRIVACY FUNCTIONS
// ============================================

export {
  privacy_notifyBreachAffectedUsers,
  privacy_logBreach,
  privacy_scheduledDataCleanup,
  privacy_runDataCleanup,
  privacy_processRequest,
} from './privacy';

// ============================================
// SMS FUNCTIONS (SMSGlobal)
// ============================================

export {
  sendSMS,
  sendBulkSMS,
} from './sms';

// ============================================
// PHONE VERIFICATION FUNCTIONS (V06.18)
// ============================================

export {
  phone_sendVerificationCode,
  phone_verifyCode,
} from './phoneVerification';

// ============================================
// DUPR FUNCTIONS (V07.24)
// ============================================

export {
  dupr_submitMatches,
  dupr_processQueue,
  dupr_processCorrections,
  dupr_getBatchStatus,
  dupr_syncRatings,       // Daily rating sync
  dupr_refreshMyRating,   // Manual rating refresh
  dupr_testConnection,    // V07.54: Admin connection test
  dupr_testSubmitOneMatch, // Debug single match submission
  dupr_retryFailed,       // Retry failed submissions
  // Webhook & subscriptions (V07.25)
  duprWebhook,            // HTTP webhook handler for DUPR rating events
  dupr_subscribeToRatings, // Subscribe users to rating notifications
  dupr_subscribeAllUsers,  // Bulk subscribe ALL users with DUPR IDs (admin only)
  dupr_getSubscriptions,   // List current subscriptions
  dupr_onUserDuprLinked,   // Auto-subscribe when user links DUPR account
  // DUPR+ subscription (V07.50)
  dupr_updateMySubscriptions, // Update user's DUPR+ subscription status
} from './dupr';

// ============================================
// LEAGUE FUNCTIONS (V07.53)
// ============================================

export {
  league_join,            // Join league with server-side DUPR+ gate enforcement
  league_markMemberAsPaid, // Mark league member payment as paid (organizer only)
} from './leagues';

// ============================================
// MIGRATION FUNCTIONS (V07.04)
// ============================================

export {
  migrate_toOfficialResult,
  migrate_dryRun,
} from './migrations/migrateToOfficialResult';

// ============================================
// MIGRATION FUNCTIONS (V07.05) - Organizer Agreement
// ============================================

export {
  migrate_markOrganizersForAgreement,
  migrate_getOrganizerAgreementStats,
} from './migrations/markOrganizersForAgreement';

// ============================================
// COMMS FUNCTIONS (V07.17) - Tournament & League Communications
// ============================================

export {
  comms_processQueue,
  comms_processLeagueQueue,
} from './comms';

// ============================================
// RECEIPT EMAIL FUNCTIONS (V07.51)
// ============================================

export {
  receipt_resend,
} from './receiptEmail';

// ============================================
// PLATFORM FINANCE FUNCTIONS (V07.61)
// ============================================

export {
  platform_getAccountBalances,
  platform_getAccountPayouts,
  platform_runReconciliation,
  platform_runOrganizerReconciliation, // V07.61: Organizer-level reconciliation
  platform_addMissingTransaction,
  platform_exportTransactions,
} from './platformFinance';

// ============================================
// USER ACCOUNT FUNCTIONS (V07.53)
// ============================================

export {
  user_deleteAccount,
} from './userAccount';

// ============================================
// STANDING MEETUP FUNCTIONS (V07.58) - Hybrid Model
// ============================================

// Core functions (1st Gen - australia-southeast1)
export {
  standingMeetup_ensureOccurrences,
  standingMeetup_checkIn,
  standingMeetup_generateCheckInToken,
  standingMeetup_cancelAttendance,
  standingMeetup_cancelOccurrence,
  standingMeetup_manualCheckIn,
  standingMeetup_markNoShow,
  onOccurrenceDeleted,
  // Check-in & Guest Management (V07.59)
  standingMeetup_checkInSelf,
  standingMeetup_addCashGuest,
  standingMeetup_closeSession,
  // QR Scanner Check-in (V07.60)
  standingMeetup_checkInPlayer,
} from './standingMeetups';

// Registration functions (1st Gen - us-central1)
export {
  standingMeetup_register,
  standingMeetup_confirmBankPayment,
  standingMeetup_cancelUnpaidBankRegistration,
  standingMeetup_unregister,
} from './standingMeetupRegistration';

// ============================================
// MEETUP FUNCTIONS (V07.61) - Enhanced Meetup System
// ============================================

export {
  meetup_rsvpWithPayment,
  meetup_rsvpFree,
  meetup_cancelRsvp,
  meetup_expirePromotionHolds,
  meetup_manualCheckIn,
  meetup_markNoShow,
  meetup_addCashGuest,
  meetup_closeSession,
  meetup_undoCheckIn,
  meetup_undoNoShow,
} from './meetups';

// ============================================
// GUEST MARKETING FUNCTIONS (V07.61)
// ============================================

export {
  guest_onGuestCreated,
  guest_unsubscribe,
} from './guestMarketing';

// ============================================
// TEST DATA SEEDING (V07.57) - TEST PROJECT ONLY
// ============================================

export {
  seed_testData,
  seed_clearTestData,
} from './seedTestData';
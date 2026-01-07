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
  // Club Connect
  stripe_createConnectAccount,
  stripe_getConnectAccountStatus,
  stripe_createConnectLoginLink,

  // User/Organizer Connect (NEW)
  stripe_createUserConnectAccount,
  stripe_createUserConnectLoginLink,

  // Checkout & Webhook
  stripe_createCheckoutSession,
  stripe_webhook,

  // SMS Bundles
  stripe_purchaseSMSBundle,
  stripe_seedSMSBundles,
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
// TEAM FUNCTIONS (if you have them)
// ============================================

// export { createTeam } from './teams';

// ============================================
// SMS FUNCTIONS (Twilio)
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
  dupr_testSubmitOneMatch, // Debug single match submission
  dupr_retryFailed,       // Retry failed submissions
} from './dupr';

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
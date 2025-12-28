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
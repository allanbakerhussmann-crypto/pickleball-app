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
  stripe_createConnectAccount,
  stripe_getConnectAccountStatus,
  stripe_createConnectLoginLink,
  stripe_createCheckoutSession,
  stripe_webhook,
} from './stripe';

// ============================================
// TEAM FUNCTIONS (if you have them)
// ============================================

// export { createTeam } from './teams';
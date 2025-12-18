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
// TEAM FUNCTIONS (if you have them)
// ============================================

// export { createTeam } from './teams';
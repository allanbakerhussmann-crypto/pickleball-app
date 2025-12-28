/**
 * Notifications Service - Barrel Export
 *
 * FILE LOCATION: services/notifications/index.ts
 * VERSION: 06.17
 */

export {
  // Core SMS functions
  sendSMS,
  sendBulkSMS,

  // Notification helpers
  notifySMSCourtAssignment,
  notifySMSMatchResult,
  notifySMSReminder,
  notifySMSScoreConfirmation,
  notifySMSCustom,

  // Utility functions
  getSMSHistory,
  formatPhoneE164,
  isValidPhoneNumber,
} from './sms';

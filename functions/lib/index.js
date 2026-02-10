"use strict";
/**
 * Firebase Cloud Functions - Main Entry Point
 *
 * FILE LOCATION: functions/src/index.ts
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.dupr_updateMySubscriptions = exports.dupr_onUserDuprLinked = exports.dupr_getSubscriptions = exports.dupr_subscribeAllUsers = exports.dupr_subscribeToRatings = exports.duprWebhook = exports.dupr_retryFailed = exports.dupr_testSubmitOneMatch = exports.dupr_testConnection = exports.dupr_refreshMyRating = exports.dupr_syncRatings = exports.dupr_getBatchStatus = exports.dupr_processCorrections = exports.dupr_processQueue = exports.dupr_submitMatches = exports.phone_verifyCode = exports.phone_sendVerificationCode = exports.sendBulkSMS = exports.sendSMS = exports.privacy_processRequest = exports.privacy_runDataCleanup = exports.privacy_scheduledDataCleanup = exports.privacy_logBreach = exports.privacy_notifyBreachAffectedUsers = exports.admin_getAuditLogs = exports.admin_demoteFromOrganizer = exports.admin_promoteToOrganizer = exports.admin_demoteFromAppAdmin = exports.admin_promoteToAppAdmin = exports.standingMeetup_createQuickRegisterCheckoutSession = exports.standingMeetup_verifyGuestCheckoutSession = exports.standingMeetup_createGuestCheckoutSession = exports.stripe_cancelStandingMeetupSubscription = exports.stripe_createStandingMeetupSubscription = exports.stripe_seedSMSBundles = exports.stripe_purchaseSMSBundle = exports.stripe_createRefund = exports.stripe_webhook = exports.stripe_createCheckoutSession = exports.stripe_v2_webhook = exports.stripe_createUserAccountLinkV2 = exports.stripe_createUserAccountV2 = exports.stripe_getAccountStatusV2 = exports.stripe_createAccountLinkV2 = exports.stripe_createAccountV2 = exports.stripe_createUserConnectLoginLink = exports.stripe_createUserConnectAccount = exports.stripe_createConnectLoginLink = exports.stripe_getConnectAccountStatus = exports.stripe_createConnectAccount = void 0;
exports.seed_clearTestData = exports.seed_testData = exports.guest_unsubscribe = exports.guest_onGuestCreated = exports.meetup_undoNoShow = exports.meetup_undoCheckIn = exports.meetup_closeSession = exports.meetup_addCashGuest = exports.meetup_markNoShow = exports.meetup_manualCheckIn = exports.meetup_expirePromotionHolds = exports.meetup_cancelRsvp = exports.meetup_rsvpFree = exports.meetup_rsvpWithPayment = exports.standingMeetup_unregister = exports.standingMeetup_cancelUnpaidBankRegistration = exports.standingMeetup_confirmBankPayment = exports.standingMeetup_register = exports.standingMeetup_checkInPlayer = exports.standingMeetup_closeSession = exports.standingMeetup_addCashGuest = exports.standingMeetup_checkInSelf = exports.onOccurrenceDeleted = exports.standingMeetup_markNoShow = exports.standingMeetup_manualCheckIn = exports.standingMeetup_cancelOccurrence = exports.standingMeetup_cancelAttendance = exports.standingMeetup_generateCheckInToken = exports.standingMeetup_checkIn = exports.standingMeetup_ensureOccurrences = exports.user_deleteAccount = exports.platform_exportTransactions = exports.platform_addMissingTransaction = exports.platform_runOrganizerReconciliation = exports.platform_runReconciliation = exports.platform_getAccountPayouts = exports.platform_getAccountBalances = exports.receipt_resend = exports.comms_processLeagueQueue = exports.comms_processQueue = exports.migrate_getOrganizerAgreementStats = exports.migrate_markOrganizersForAgreement = exports.migrate_dryRun = exports.migrate_toOfficialResult = exports.league_markMemberAsPaid = exports.league_join = void 0;
const admin = __importStar(require("firebase-admin"));
// Initialize Firebase Admin
admin.initializeApp();
// ============================================
// STRIPE FUNCTIONS
// ============================================
var stripe_1 = require("./stripe");
// Club Connect (V1 - Legacy)
Object.defineProperty(exports, "stripe_createConnectAccount", { enumerable: true, get: function () { return stripe_1.stripe_createConnectAccount; } });
Object.defineProperty(exports, "stripe_getConnectAccountStatus", { enumerable: true, get: function () { return stripe_1.stripe_getConnectAccountStatus; } });
Object.defineProperty(exports, "stripe_createConnectLoginLink", { enumerable: true, get: function () { return stripe_1.stripe_createConnectLoginLink; } });
// User/Organizer Connect (V1 - Legacy)
Object.defineProperty(exports, "stripe_createUserConnectAccount", { enumerable: true, get: function () { return stripe_1.stripe_createUserConnectAccount; } });
Object.defineProperty(exports, "stripe_createUserConnectLoginLink", { enumerable: true, get: function () { return stripe_1.stripe_createUserConnectLoginLink; } });
// V2 Account Functions (Direct Charges)
Object.defineProperty(exports, "stripe_createAccountV2", { enumerable: true, get: function () { return stripe_1.stripe_createAccountV2; } });
Object.defineProperty(exports, "stripe_createAccountLinkV2", { enumerable: true, get: function () { return stripe_1.stripe_createAccountLinkV2; } });
Object.defineProperty(exports, "stripe_getAccountStatusV2", { enumerable: true, get: function () { return stripe_1.stripe_getAccountStatusV2; } });
Object.defineProperty(exports, "stripe_createUserAccountV2", { enumerable: true, get: function () { return stripe_1.stripe_createUserAccountV2; } });
Object.defineProperty(exports, "stripe_createUserAccountLinkV2", { enumerable: true, get: function () { return stripe_1.stripe_createUserAccountLinkV2; } });
// V2 Thin Events Webhook
Object.defineProperty(exports, "stripe_v2_webhook", { enumerable: true, get: function () { return stripe_1.stripe_v2_webhook; } });
// Checkout & Webhook
Object.defineProperty(exports, "stripe_createCheckoutSession", { enumerable: true, get: function () { return stripe_1.stripe_createCheckoutSession; } });
Object.defineProperty(exports, "stripe_webhook", { enumerable: true, get: function () { return stripe_1.stripe_webhook; } });
// Refunds
Object.defineProperty(exports, "stripe_createRefund", { enumerable: true, get: function () { return stripe_1.stripe_createRefund; } });
// SMS Bundles
Object.defineProperty(exports, "stripe_purchaseSMSBundle", { enumerable: true, get: function () { return stripe_1.stripe_purchaseSMSBundle; } });
Object.defineProperty(exports, "stripe_seedSMSBundles", { enumerable: true, get: function () { return stripe_1.stripe_seedSMSBundles; } });
// Standing Meetup Subscriptions (V07.53)
Object.defineProperty(exports, "stripe_createStandingMeetupSubscription", { enumerable: true, get: function () { return stripe_1.stripe_createStandingMeetupSubscription; } });
Object.defineProperty(exports, "stripe_cancelStandingMeetupSubscription", { enumerable: true, get: function () { return stripe_1.stripe_cancelStandingMeetupSubscription; } });
// Standing Meetup Guest Checkout (V07.59)
Object.defineProperty(exports, "standingMeetup_createGuestCheckoutSession", { enumerable: true, get: function () { return stripe_1.standingMeetup_createGuestCheckoutSession; } });
Object.defineProperty(exports, "standingMeetup_verifyGuestCheckoutSession", { enumerable: true, get: function () { return stripe_1.standingMeetup_verifyGuestCheckoutSession; } });
// Standing Meetup Quick Register at door (V07.59)
Object.defineProperty(exports, "standingMeetup_createQuickRegisterCheckoutSession", { enumerable: true, get: function () { return stripe_1.standingMeetup_createQuickRegisterCheckoutSession; } });
// ============================================
// ADMIN FUNCTIONS
// ============================================
var admin_1 = require("./admin");
Object.defineProperty(exports, "admin_promoteToAppAdmin", { enumerable: true, get: function () { return admin_1.admin_promoteToAppAdmin; } });
Object.defineProperty(exports, "admin_demoteFromAppAdmin", { enumerable: true, get: function () { return admin_1.admin_demoteFromAppAdmin; } });
Object.defineProperty(exports, "admin_promoteToOrganizer", { enumerable: true, get: function () { return admin_1.admin_promoteToOrganizer; } });
Object.defineProperty(exports, "admin_demoteFromOrganizer", { enumerable: true, get: function () { return admin_1.admin_demoteFromOrganizer; } });
Object.defineProperty(exports, "admin_getAuditLogs", { enumerable: true, get: function () { return admin_1.admin_getAuditLogs; } });
// ============================================
// PRIVACY FUNCTIONS
// ============================================
var privacy_1 = require("./privacy");
Object.defineProperty(exports, "privacy_notifyBreachAffectedUsers", { enumerable: true, get: function () { return privacy_1.privacy_notifyBreachAffectedUsers; } });
Object.defineProperty(exports, "privacy_logBreach", { enumerable: true, get: function () { return privacy_1.privacy_logBreach; } });
Object.defineProperty(exports, "privacy_scheduledDataCleanup", { enumerable: true, get: function () { return privacy_1.privacy_scheduledDataCleanup; } });
Object.defineProperty(exports, "privacy_runDataCleanup", { enumerable: true, get: function () { return privacy_1.privacy_runDataCleanup; } });
Object.defineProperty(exports, "privacy_processRequest", { enumerable: true, get: function () { return privacy_1.privacy_processRequest; } });
// ============================================
// SMS FUNCTIONS (SMSGlobal)
// ============================================
var sms_1 = require("./sms");
Object.defineProperty(exports, "sendSMS", { enumerable: true, get: function () { return sms_1.sendSMS; } });
Object.defineProperty(exports, "sendBulkSMS", { enumerable: true, get: function () { return sms_1.sendBulkSMS; } });
// ============================================
// PHONE VERIFICATION FUNCTIONS (V06.18)
// ============================================
var phoneVerification_1 = require("./phoneVerification");
Object.defineProperty(exports, "phone_sendVerificationCode", { enumerable: true, get: function () { return phoneVerification_1.phone_sendVerificationCode; } });
Object.defineProperty(exports, "phone_verifyCode", { enumerable: true, get: function () { return phoneVerification_1.phone_verifyCode; } });
// ============================================
// DUPR FUNCTIONS (V07.24)
// ============================================
var dupr_1 = require("./dupr");
Object.defineProperty(exports, "dupr_submitMatches", { enumerable: true, get: function () { return dupr_1.dupr_submitMatches; } });
Object.defineProperty(exports, "dupr_processQueue", { enumerable: true, get: function () { return dupr_1.dupr_processQueue; } });
Object.defineProperty(exports, "dupr_processCorrections", { enumerable: true, get: function () { return dupr_1.dupr_processCorrections; } });
Object.defineProperty(exports, "dupr_getBatchStatus", { enumerable: true, get: function () { return dupr_1.dupr_getBatchStatus; } });
Object.defineProperty(exports, "dupr_syncRatings", { enumerable: true, get: function () { return dupr_1.dupr_syncRatings; } });
Object.defineProperty(exports, "dupr_refreshMyRating", { enumerable: true, get: function () { return dupr_1.dupr_refreshMyRating; } });
Object.defineProperty(exports, "dupr_testConnection", { enumerable: true, get: function () { return dupr_1.dupr_testConnection; } });
Object.defineProperty(exports, "dupr_testSubmitOneMatch", { enumerable: true, get: function () { return dupr_1.dupr_testSubmitOneMatch; } });
Object.defineProperty(exports, "dupr_retryFailed", { enumerable: true, get: function () { return dupr_1.dupr_retryFailed; } });
// Webhook & subscriptions (V07.25)
Object.defineProperty(exports, "duprWebhook", { enumerable: true, get: function () { return dupr_1.duprWebhook; } });
Object.defineProperty(exports, "dupr_subscribeToRatings", { enumerable: true, get: function () { return dupr_1.dupr_subscribeToRatings; } });
Object.defineProperty(exports, "dupr_subscribeAllUsers", { enumerable: true, get: function () { return dupr_1.dupr_subscribeAllUsers; } });
Object.defineProperty(exports, "dupr_getSubscriptions", { enumerable: true, get: function () { return dupr_1.dupr_getSubscriptions; } });
Object.defineProperty(exports, "dupr_onUserDuprLinked", { enumerable: true, get: function () { return dupr_1.dupr_onUserDuprLinked; } });
// DUPR+ subscription (V07.50)
Object.defineProperty(exports, "dupr_updateMySubscriptions", { enumerable: true, get: function () { return dupr_1.dupr_updateMySubscriptions; } });
// ============================================
// LEAGUE FUNCTIONS (V07.53)
// ============================================
var leagues_1 = require("./leagues");
Object.defineProperty(exports, "league_join", { enumerable: true, get: function () { return leagues_1.league_join; } });
Object.defineProperty(exports, "league_markMemberAsPaid", { enumerable: true, get: function () { return leagues_1.league_markMemberAsPaid; } });
// ============================================
// MIGRATION FUNCTIONS (V07.04)
// ============================================
var migrateToOfficialResult_1 = require("./migrations/migrateToOfficialResult");
Object.defineProperty(exports, "migrate_toOfficialResult", { enumerable: true, get: function () { return migrateToOfficialResult_1.migrate_toOfficialResult; } });
Object.defineProperty(exports, "migrate_dryRun", { enumerable: true, get: function () { return migrateToOfficialResult_1.migrate_dryRun; } });
// ============================================
// MIGRATION FUNCTIONS (V07.05) - Organizer Agreement
// ============================================
var markOrganizersForAgreement_1 = require("./migrations/markOrganizersForAgreement");
Object.defineProperty(exports, "migrate_markOrganizersForAgreement", { enumerable: true, get: function () { return markOrganizersForAgreement_1.migrate_markOrganizersForAgreement; } });
Object.defineProperty(exports, "migrate_getOrganizerAgreementStats", { enumerable: true, get: function () { return markOrganizersForAgreement_1.migrate_getOrganizerAgreementStats; } });
// ============================================
// COMMS FUNCTIONS (V07.17) - Tournament & League Communications
// ============================================
var comms_1 = require("./comms");
Object.defineProperty(exports, "comms_processQueue", { enumerable: true, get: function () { return comms_1.comms_processQueue; } });
Object.defineProperty(exports, "comms_processLeagueQueue", { enumerable: true, get: function () { return comms_1.comms_processLeagueQueue; } });
// ============================================
// RECEIPT EMAIL FUNCTIONS (V07.51)
// ============================================
var receiptEmail_1 = require("./receiptEmail");
Object.defineProperty(exports, "receipt_resend", { enumerable: true, get: function () { return receiptEmail_1.receipt_resend; } });
// ============================================
// PLATFORM FINANCE FUNCTIONS (V07.61)
// ============================================
var platformFinance_1 = require("./platformFinance");
Object.defineProperty(exports, "platform_getAccountBalances", { enumerable: true, get: function () { return platformFinance_1.platform_getAccountBalances; } });
Object.defineProperty(exports, "platform_getAccountPayouts", { enumerable: true, get: function () { return platformFinance_1.platform_getAccountPayouts; } });
Object.defineProperty(exports, "platform_runReconciliation", { enumerable: true, get: function () { return platformFinance_1.platform_runReconciliation; } });
Object.defineProperty(exports, "platform_runOrganizerReconciliation", { enumerable: true, get: function () { return platformFinance_1.platform_runOrganizerReconciliation; } });
Object.defineProperty(exports, "platform_addMissingTransaction", { enumerable: true, get: function () { return platformFinance_1.platform_addMissingTransaction; } });
Object.defineProperty(exports, "platform_exportTransactions", { enumerable: true, get: function () { return platformFinance_1.platform_exportTransactions; } });
// ============================================
// USER ACCOUNT FUNCTIONS (V07.53)
// ============================================
var userAccount_1 = require("./userAccount");
Object.defineProperty(exports, "user_deleteAccount", { enumerable: true, get: function () { return userAccount_1.user_deleteAccount; } });
// ============================================
// STANDING MEETUP FUNCTIONS (V07.58) - Hybrid Model
// ============================================
// Core functions (1st Gen - australia-southeast1)
var standingMeetups_1 = require("./standingMeetups");
Object.defineProperty(exports, "standingMeetup_ensureOccurrences", { enumerable: true, get: function () { return standingMeetups_1.standingMeetup_ensureOccurrences; } });
Object.defineProperty(exports, "standingMeetup_checkIn", { enumerable: true, get: function () { return standingMeetups_1.standingMeetup_checkIn; } });
Object.defineProperty(exports, "standingMeetup_generateCheckInToken", { enumerable: true, get: function () { return standingMeetups_1.standingMeetup_generateCheckInToken; } });
Object.defineProperty(exports, "standingMeetup_cancelAttendance", { enumerable: true, get: function () { return standingMeetups_1.standingMeetup_cancelAttendance; } });
Object.defineProperty(exports, "standingMeetup_cancelOccurrence", { enumerable: true, get: function () { return standingMeetups_1.standingMeetup_cancelOccurrence; } });
Object.defineProperty(exports, "standingMeetup_manualCheckIn", { enumerable: true, get: function () { return standingMeetups_1.standingMeetup_manualCheckIn; } });
Object.defineProperty(exports, "standingMeetup_markNoShow", { enumerable: true, get: function () { return standingMeetups_1.standingMeetup_markNoShow; } });
Object.defineProperty(exports, "onOccurrenceDeleted", { enumerable: true, get: function () { return standingMeetups_1.onOccurrenceDeleted; } });
// Check-in & Guest Management (V07.59)
Object.defineProperty(exports, "standingMeetup_checkInSelf", { enumerable: true, get: function () { return standingMeetups_1.standingMeetup_checkInSelf; } });
Object.defineProperty(exports, "standingMeetup_addCashGuest", { enumerable: true, get: function () { return standingMeetups_1.standingMeetup_addCashGuest; } });
Object.defineProperty(exports, "standingMeetup_closeSession", { enumerable: true, get: function () { return standingMeetups_1.standingMeetup_closeSession; } });
// QR Scanner Check-in (V07.60)
Object.defineProperty(exports, "standingMeetup_checkInPlayer", { enumerable: true, get: function () { return standingMeetups_1.standingMeetup_checkInPlayer; } });
// Registration functions (1st Gen - us-central1)
var standingMeetupRegistration_1 = require("./standingMeetupRegistration");
Object.defineProperty(exports, "standingMeetup_register", { enumerable: true, get: function () { return standingMeetupRegistration_1.standingMeetup_register; } });
Object.defineProperty(exports, "standingMeetup_confirmBankPayment", { enumerable: true, get: function () { return standingMeetupRegistration_1.standingMeetup_confirmBankPayment; } });
Object.defineProperty(exports, "standingMeetup_cancelUnpaidBankRegistration", { enumerable: true, get: function () { return standingMeetupRegistration_1.standingMeetup_cancelUnpaidBankRegistration; } });
Object.defineProperty(exports, "standingMeetup_unregister", { enumerable: true, get: function () { return standingMeetupRegistration_1.standingMeetup_unregister; } });
// ============================================
// MEETUP FUNCTIONS (V07.61) - Enhanced Meetup System
// ============================================
var meetups_1 = require("./meetups");
Object.defineProperty(exports, "meetup_rsvpWithPayment", { enumerable: true, get: function () { return meetups_1.meetup_rsvpWithPayment; } });
Object.defineProperty(exports, "meetup_rsvpFree", { enumerable: true, get: function () { return meetups_1.meetup_rsvpFree; } });
Object.defineProperty(exports, "meetup_cancelRsvp", { enumerable: true, get: function () { return meetups_1.meetup_cancelRsvp; } });
Object.defineProperty(exports, "meetup_expirePromotionHolds", { enumerable: true, get: function () { return meetups_1.meetup_expirePromotionHolds; } });
Object.defineProperty(exports, "meetup_manualCheckIn", { enumerable: true, get: function () { return meetups_1.meetup_manualCheckIn; } });
Object.defineProperty(exports, "meetup_markNoShow", { enumerable: true, get: function () { return meetups_1.meetup_markNoShow; } });
Object.defineProperty(exports, "meetup_addCashGuest", { enumerable: true, get: function () { return meetups_1.meetup_addCashGuest; } });
Object.defineProperty(exports, "meetup_closeSession", { enumerable: true, get: function () { return meetups_1.meetup_closeSession; } });
Object.defineProperty(exports, "meetup_undoCheckIn", { enumerable: true, get: function () { return meetups_1.meetup_undoCheckIn; } });
Object.defineProperty(exports, "meetup_undoNoShow", { enumerable: true, get: function () { return meetups_1.meetup_undoNoShow; } });
// ============================================
// GUEST MARKETING FUNCTIONS (V07.61)
// ============================================
var guestMarketing_1 = require("./guestMarketing");
Object.defineProperty(exports, "guest_onGuestCreated", { enumerable: true, get: function () { return guestMarketing_1.guest_onGuestCreated; } });
Object.defineProperty(exports, "guest_unsubscribe", { enumerable: true, get: function () { return guestMarketing_1.guest_unsubscribe; } });
// ============================================
// TEST DATA SEEDING (V07.57) - TEST PROJECT ONLY
// ============================================
var seedTestData_1 = require("./seedTestData");
Object.defineProperty(exports, "seed_testData", { enumerable: true, get: function () { return seedTestData_1.seed_testData; } });
Object.defineProperty(exports, "seed_clearTestData", { enumerable: true, get: function () { return seedTestData_1.seed_clearTestData; } });
//# sourceMappingURL=index.js.map
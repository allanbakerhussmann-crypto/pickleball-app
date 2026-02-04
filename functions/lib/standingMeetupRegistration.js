"use strict";
/**
 * Standing Meetup Registration Functions (1st Gen)
 *
 * These functions handle player registration for weekly meetups using the hybrid model:
 * - Season Pass: All remaining sessions for a flat price
 * - Pick-and-Pay: Select specific sessions at per-session rate
 *
 * Using 1st Gen functions for reliable deployment.
 *
 * @version 07.58
 * @file functions/src/standingMeetupRegistration.ts
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.standingMeetup_unregister = exports.standingMeetup_cancelUnpaidBankRegistration = exports.standingMeetup_confirmBankPayment = exports.standingMeetup_register = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
const stripe_1 = __importDefault(require("stripe"));
const db = admin.firestore();
// Stripe configuration (same as standingMeetups.ts)
// Check if running in test mode (emulator or explicit test flag)
function checkTestMode() {
    var _a;
    // Environment variables
    if (process.env.FUNCTIONS_EMULATOR === 'true')
        return true;
    if (process.env.STRIPE_TEST_MODE === 'true')
        return true;
    if (process.env.NODE_ENV === 'development')
        return true;
    // Check functions config
    try {
        if (((_a = functions.config().stripe) === null || _a === void 0 ? void 0 : _a.test_mode) === 'true')
            return true;
    }
    catch (_b) {
        // Config not available
    }
    return false;
}
const isTestMode = checkTestMode();
function getStripeSecretKey() {
    var _a, _b;
    // In test mode, prefer test key
    if (isTestMode && process.env.STRIPE_TEST_SECRET_KEY) {
        console.log('Using Stripe TEST mode');
        return process.env.STRIPE_TEST_SECRET_KEY;
    }
    if (process.env.STRIPE_SECRET_KEY) {
        return process.env.STRIPE_SECRET_KEY;
    }
    try {
        // In test mode, try test key from config first
        if (isTestMode) {
            const testKey = (_a = functions.config().stripe) === null || _a === void 0 ? void 0 : _a.test_secret_key;
            if (testKey) {
                console.log('Using Stripe TEST mode from config');
                return testKey;
            }
        }
        return (_b = functions.config().stripe) === null || _b === void 0 ? void 0 : _b.secret_key;
    }
    catch (_c) {
        console.warn('Unable to access functions.config() - using environment variables only');
        return undefined;
    }
}
const stripeSecretKey = getStripeSecretKey();
const stripe = stripeSecretKey ? new stripe_1.default(stripeSecretKey, { apiVersion: '2024-11-20.acacia' }) : null;
// Log which mode we're running in
if (stripeSecretKey) {
    const isLiveKey = stripeSecretKey.startsWith('sk_live_');
    console.log(`Stripe initialized in ${isLiveKey ? 'LIVE' : 'TEST'} mode`);
}
// Platform fees (1.5% standard rate - same as stripe.ts)
const PLATFORM_FEE_PERCENT = 0.015;
const STRIPE_FEE_PERCENT = 0.027; // NZ Stripe rate: 2.7% + $0.30
const STRIPE_FIXED_FEE_CENTS = 30;
/**
 * Player registers for a weekly meetup (Hybrid Model)
 * 1st Gen version for reliable deployment
 */
exports.standingMeetup_register = functions.https.onCall(async (data, context) => {
    var _a, _b, _c, _d;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { standingMeetupId, registrationType, selectedSessionIds, paymentMethod, returnUrl } = data;
    const userId = context.auth.uid;
    // Validation
    if (!standingMeetupId || !paymentMethod || !registrationType) {
        throw new functions.https.HttpsError('invalid-argument', 'standingMeetupId, registrationType, and paymentMethod are required');
    }
    if (registrationType === 'pick_and_pay' && (!selectedSessionIds || selectedSessionIds.length === 0)) {
        throw new functions.https.HttpsError('invalid-argument', 'MISSING_SESSION_SELECTION');
    }
    // Get meetup
    const meetupRef = db.collection('standingMeetups').doc(standingMeetupId);
    const meetupSnap = await meetupRef.get();
    if (!meetupSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'MEETUP_NOT_FOUND');
    }
    const meetup = Object.assign({ id: meetupSnap.id }, meetupSnap.data());
    // Verify meetup is active
    if (meetup.status !== 'active') {
        throw new functions.https.HttpsError('failed-precondition', 'MEETUP_NOT_ACTIVE');
    }
    // Verify payment method is accepted
    if (paymentMethod === 'stripe' && !((_a = meetup.paymentMethods) === null || _a === void 0 ? void 0 : _a.acceptCardPayments)) {
        throw new functions.https.HttpsError('invalid-argument', 'PAYMENT_METHOD_NOT_ENABLED');
    }
    if (paymentMethod === 'bank_transfer' && !((_b = meetup.paymentMethods) === null || _b === void 0 ? void 0 : _b.acceptBankTransfer)) {
        throw new functions.https.HttpsError('invalid-argument', 'PAYMENT_METHOD_NOT_ENABLED');
    }
    // Validate registration type
    if (registrationType === 'season_pass' && meetup.billing.amount <= 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Season pass not available for this meetup');
    }
    if (registrationType === 'pick_and_pay' && !meetup.billing.perSessionAmount) {
        throw new functions.https.HttpsError('invalid-argument', 'Per-session pricing not configured');
    }
    // Check if already has active registration(s)
    // Important: User may have MULTIPLE registrations from previous pick_and_pay purchases
    const existingRegQuery = await db.collection('standingMeetupRegistrations')
        .where('standingMeetupId', '==', standingMeetupId)
        .where('odUserId', '==', userId)
        .where('status', '==', 'active')
        .get();
    let hasExistingRegistration = false;
    let alreadyRegisteredSessionIds = [];
    if (!existingRegQuery.empty) {
        hasExistingRegistration = true;
        // Collect ALL sessions from ALL registrations (user may have multiple pick_and_pay registrations)
        for (const doc of existingRegQuery.docs) {
            const regData = doc.data();
            // If user has a season pass, they're registered for everything - block any new registration
            if (regData.registrationType === 'season_pass') {
                throw new functions.https.HttpsError('already-exists', 'ALREADY_REGISTERED_SEASON_PASS');
            }
            // Collect sessions from this registration
            if (regData.selectedSessionIds && Array.isArray(regData.selectedSessionIds)) {
                alreadyRegisteredSessionIds.push(...regData.selectedSessionIds);
            }
        }
        // Remove duplicates
        alreadyRegisteredSessionIds = [...new Set(alreadyRegisteredSessionIds)];
        console.log(`User ${userId} already registered for sessions: ${alreadyRegisteredSessionIds.join(', ')}`);
    }
    // For pick_and_pay, filter out sessions user is already registered for
    let sessionsToRegister = selectedSessionIds || [];
    if (registrationType === 'pick_and_pay' && alreadyRegisteredSessionIds.length > 0) {
        // Filter out already registered sessions
        sessionsToRegister = sessionsToRegister.filter((sessionId) => !alreadyRegisteredSessionIds.includes(sessionId));
        if (sessionsToRegister.length === 0) {
            throw new functions.https.HttpsError('already-exists', 'ALREADY_REGISTERED_FOR_ALL_SELECTED');
        }
    }
    // Generate registration ID
    // - For first registration: `${standingMeetupId}_${userId}`
    // - For additional sessions: `${standingMeetupId}_${userId}_${timestamp}` (unique)
    const registrationId = hasExistingRegistration
        ? `${standingMeetupId}_${userId}_${Date.now()}`
        : `${standingMeetupId}_${userId}`;
    // Get user info
    const userSnap = await db.collection('users').doc(userId).get();
    const userData = userSnap.data() || {};
    const userName = userData.name || userData.displayName || ((_c = context.auth.token.email) === null || _c === void 0 ? void 0 : _c.split('@')[0]) || 'Player';
    const userEmail = userData.email || context.auth.token.email || '';
    // Calculate amount and session count based on registration type
    let amount;
    let sessionCount;
    if (registrationType === 'season_pass') {
        amount = meetup.billing.amount;
        const now = Date.now();
        const occSnap = await db
            .collection('standingMeetups')
            .doc(standingMeetupId)
            .collection('occurrences')
            .where('startAt', '>=', now)
            .where('status', '==', 'scheduled')
            .get();
        sessionCount = occSnap.size;
        if (sessionCount === 0) {
            throw new functions.https.HttpsError('failed-precondition', 'NO_SESSIONS_AVAILABLE');
        }
    }
    else {
        const perSessionAmount = meetup.billing.perSessionAmount || 0;
        sessionCount = sessionsToRegister.length;
        amount = perSessionAmount * sessionCount;
        // Validate selected sessions exist and have capacity
        const now = Date.now();
        for (const dateId of sessionsToRegister) {
            const occSnap = await db
                .collection('standingMeetups')
                .doc(standingMeetupId)
                .collection('occurrences')
                .doc(dateId)
                .get();
            if (!occSnap.exists) {
                throw new functions.https.HttpsError('not-found', `Session ${dateId} not found`);
            }
            const occData = occSnap.data();
            if (occData.status !== 'scheduled') {
                throw new functions.https.HttpsError('failed-precondition', `Session ${dateId} is not available`);
            }
            if (occData.startAt < now) {
                throw new functions.https.HttpsError('failed-precondition', `Session ${dateId} has already passed`);
            }
            const spotsLeft = meetup.maxPlayers - (occData.expectedCount || 0);
            if (spotsLeft <= 0) {
                throw new functions.https.HttpsError('resource-exhausted', `SESSIONS_FULL:${dateId}`);
            }
        }
    }
    if (amount <= 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid payment amount');
    }
    // STRIPE PATH
    if (paymentMethod === 'stripe') {
        if (!stripe) {
            throw new functions.https.HttpsError('failed-precondition', 'Stripe not configured');
        }
        // Get valid Stripe account - auto-heal if needed
        let stripeAccountId = meetup.organizerStripeAccountId;
        // In test mode, allow test accounts; in production, block them
        const isTestAccount = (stripeAccountId === null || stripeAccountId === void 0 ? void 0 : stripeAccountId.startsWith('acct_test')) || stripeAccountId === 'acct_test123';
        const isInvalidStripeAccount = !stripeAccountId ||
            (!isTestMode && isTestAccount); // Only block test accounts in production
        if (isInvalidStripeAccount) {
            console.log(`Meetup ${standingMeetupId} has invalid Stripe account "${stripeAccountId}", looking up club...`);
            const clubDoc = await db.collection('clubs').doc(meetup.clubId).get();
            if (clubDoc.exists) {
                const clubData = clubDoc.data();
                const clubStripeAccount = (clubData === null || clubData === void 0 ? void 0 : clubData.stripeConnectedAccountId) || (clubData === null || clubData === void 0 ? void 0 : clubData.stripeAccountId);
                const isClubTestAccount = (clubStripeAccount === null || clubStripeAccount === void 0 ? void 0 : clubStripeAccount.startsWith('acct_test')) || clubStripeAccount === 'acct_test123';
                // In test mode, accept test accounts; in production, only accept real accounts
                if (clubStripeAccount && (isTestMode || !isClubTestAccount)) {
                    stripeAccountId = clubStripeAccount;
                    console.log(`Auto-healed: Using club's Stripe account ${stripeAccountId} (testMode=${isTestMode})`);
                    await db.collection('standingMeetups').doc(standingMeetupId).update({
                        organizerStripeAccountId: stripeAccountId,
                        updatedAt: Date.now(),
                    });
                }
            }
            // Final check: must have an account (test accounts allowed in test mode)
            const isFinalTestAccount = (stripeAccountId === null || stripeAccountId === void 0 ? void 0 : stripeAccountId.startsWith('acct_test')) || stripeAccountId === 'acct_test123';
            if (!stripeAccountId || (!isTestMode && isFinalTestAccount)) {
                throw new functions.https.HttpsError('failed-precondition', 'ORGANIZER_STRIPE_NOT_CONFIGURED');
            }
        }
        // Calculate fees
        let totalAmount = amount;
        let platformFee = Math.round(amount * PLATFORM_FEE_PERCENT);
        if (meetup.billing.feesPaidBy === 'player') {
            const divisor = 1 - STRIPE_FEE_PERCENT - PLATFORM_FEE_PERCENT;
            totalAmount = Math.ceil((amount + STRIPE_FIXED_FEE_CENTS) / divisor);
            platformFee = Math.round(totalAmount * PLATFORM_FEE_PERCENT);
        }
        // Extract origin from returnUrl or use default
        // returnUrl might be full URL like "https://example.com/clubs/123/settings?..."
        // We only need the origin (protocol + host)
        let baseUrl = 'https://pickleballdirector.co.nz';
        if (returnUrl) {
            try {
                const url = new URL(returnUrl);
                baseUrl = url.origin;
            }
            catch (_e) {
                // If returnUrl is invalid, use default
                console.log('Invalid returnUrl, using default:', returnUrl);
            }
        }
        const successUrl = `${baseUrl}/#/weekly-meetup/${standingMeetupId}?payment=success`;
        const cancelUrl = `${baseUrl}/#/weekly-meetup/${standingMeetupId}?payment=cancelled`;
        console.log(`Stripe checkout URLs - success: ${successUrl}, cancel: ${cancelUrl}`);
        const description = registrationType === 'season_pass'
            ? `Season Pass - ${sessionCount} sessions at ${meetup.clubName}`
            : `${sessionCount} session${sessionCount > 1 ? 's' : ''} at ${meetup.clubName}`;
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            customer_email: userEmail,
            line_items: [
                {
                    price_data: {
                        currency: meetup.billing.currency,
                        product_data: {
                            name: meetup.title,
                            description,
                        },
                        unit_amount: totalAmount,
                    },
                    quantity: 1,
                },
            ],
            success_url: successUrl,
            cancel_url: cancelUrl,
            metadata: {
                type: 'standing_meetup_registration',
                standingMeetupId,
                odUserId: userId,
                registrationType,
                registrationId, // Include the registration ID for the webhook
                selectedSessionIds: sessionsToRegister.length > 0 ? JSON.stringify(sessionsToRegister) : '',
                clubId: meetup.clubId,
                // Finance transaction fields
                referenceId: standingMeetupId,
                eventName: meetup.title,
                organizerUserId: meetup.clubId, // Club receives the payment
                payerName: userName,
                // Player info
                userName,
                userEmail,
                amount: String(amount),
                sessionCount: String(sessionCount),
                maxPlayers: String(meetup.maxPlayers),
            },
            payment_intent_data: {
                application_fee_amount: platformFee,
                metadata: {
                    type: 'standing_meetup_registration',
                    standingMeetupId,
                    odUserId: userId,
                    registrationType,
                },
            },
        }, {
            stripeAccount: stripeAccountId,
        });
        console.log(`Stripe checkout session ${session.id} created for account ${stripeAccountId}`);
        return {
            checkoutUrl: session.url,
        };
    }
    // BANK TRANSFER PATH
    const bankDetails = (_d = meetup.paymentMethods) === null || _d === void 0 ? void 0 : _d.bankDetails;
    if (!bankDetails || !bankDetails.showToPlayers) {
        throw new functions.https.HttpsError('failed-precondition', 'Bank details not configured');
    }
    const bankTransferReference = `${meetup.title.substring(0, 10)}-${userName.substring(0, 10)}`.replace(/\s/g, '');
    const registration = Object.assign(Object.assign({ id: registrationId, standingMeetupId, clubId: meetup.clubId, odUserId: userId, userName,
        userEmail,
        registrationType }, (registrationType === 'pick_and_pay' ? { selectedSessionIds: sessionsToRegister } : {})), { sessionCount, paymentStatus: 'pending', paymentMethod: 'bank_transfer', amount, currency: meetup.billing.currency, bankTransferReference, status: 'active', createdAt: Date.now(), updatedAt: Date.now() });
    await db.collection('standingMeetupRegistrations').doc(registrationId).set(registration);
    console.log(`Bank transfer registration ${registrationId} created (pending confirmation)`);
    return {
        registrationId,
        bankDetails: {
            bankName: bankDetails.bankName,
            accountName: bankDetails.accountName,
            accountNumber: bankDetails.accountNumber,
            reference: bankDetails.reference || bankTransferReference,
        },
    };
});
/**
 * Helper: Add player to all future occurrences with capacity
 */
async function addPlayerToAllFutureOccurrences(standingMeetupId, userId, userName, maxPlayers) {
    const now = Date.now();
    const occSnap = await db
        .collection('standingMeetups')
        .doc(standingMeetupId)
        .collection('occurrences')
        .where('startAt', '>=', now)
        .where('status', '==', 'scheduled')
        .get();
    const addedTo = [];
    const skippedFull = [];
    for (const doc of occSnap.docs) {
        const occData = doc.data();
        const spotsLeft = maxPlayers - (occData.expectedCount || 0);
        if (spotsLeft <= 0) {
            skippedFull.push(doc.id);
            continue;
        }
        const participantRef = doc.ref.collection('participants').doc(userId);
        await participantRef.set({
            odUserId: userId,
            userName,
            status: 'expected',
            creditIssued: false,
            addedAt: Date.now(),
        });
        await doc.ref.update({
            expectedCount: firestore_1.FieldValue.increment(1),
            updatedAt: Date.now(),
        });
        addedTo.push(doc.id);
    }
    return { addedTo, skippedFull };
}
/**
 * Helper: Add player to selected occurrences
 */
async function addPlayerToSelectedOccurrences(standingMeetupId, userId, userName, sessionIds, maxPlayers) {
    const addedTo = [];
    const failedFull = [];
    for (const dateId of sessionIds) {
        const occRef = db
            .collection('standingMeetups')
            .doc(standingMeetupId)
            .collection('occurrences')
            .doc(dateId);
        const occSnap = await occRef.get();
        if (!occSnap.exists)
            continue;
        const occData = occSnap.data();
        const spotsLeft = maxPlayers - (occData.expectedCount || 0);
        if (spotsLeft <= 0) {
            failedFull.push(dateId);
            continue;
        }
        const participantRef = occRef.collection('participants').doc(userId);
        await participantRef.set({
            odUserId: userId,
            userName,
            status: 'expected',
            creditIssued: false,
            addedAt: Date.now(),
        });
        await occRef.update({
            expectedCount: firestore_1.FieldValue.increment(1),
            updatedAt: Date.now(),
        });
        addedTo.push(dateId);
    }
    return { addedTo, failedFull };
}
/**
 * Organizer confirms a bank transfer payment
 */
exports.standingMeetup_confirmBankPayment = functions.https.onCall(async (data, context) => {
    var _a, _b;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { registrationId } = data;
    if (!registrationId) {
        throw new functions.https.HttpsError('invalid-argument', 'registrationId is required');
    }
    // Get registration
    const regRef = db.collection('standingMeetupRegistrations').doc(registrationId);
    const regSnap = await regRef.get();
    if (!regSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Registration not found');
    }
    const registration = regSnap.data();
    // Validate status
    if (registration.paymentMethod !== 'bank_transfer') {
        throw new functions.https.HttpsError('failed-precondition', 'Not a bank transfer registration');
    }
    if (registration.paymentStatus !== 'pending') {
        throw new functions.https.HttpsError('failed-precondition', 'Payment already confirmed');
    }
    // Check if caller is organizer/admin
    const meetupSnap = await db.collection('standingMeetups').doc(registration.standingMeetupId).get();
    if (!meetupSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Meetup not found');
    }
    const meetup = meetupSnap.data();
    const clubSnap = await db.collection('clubs').doc(meetup.clubId).get();
    const clubData = clubSnap.data();
    const isClubAdmin = (clubData === null || clubData === void 0 ? void 0 : clubData.createdByUserId) === context.auth.uid ||
        ((_a = clubData === null || clubData === void 0 ? void 0 : clubData.admins) === null || _a === void 0 ? void 0 : _a.includes(context.auth.uid));
    const isMeetupOrganizer = meetup.clubId && ((_b = meetupSnap.data()) === null || _b === void 0 ? void 0 : _b.createdByUserId) === context.auth.uid;
    if (!isClubAdmin && !isMeetupOrganizer) {
        throw new functions.https.HttpsError('permission-denied', 'Only organizers can confirm payments');
    }
    // Update registration
    const paidAt = Date.now();
    await regRef.update({
        paymentStatus: 'paid',
        paidAt,
        updatedAt: paidAt,
    });
    // Add player to occurrences
    if (registration.registrationType === 'season_pass') {
        await addPlayerToAllFutureOccurrences(registration.standingMeetupId, registration.odUserId, registration.userName, meetup.maxPlayers);
    }
    else if (registration.selectedSessionIds) {
        await addPlayerToSelectedOccurrences(registration.standingMeetupId, registration.odUserId, registration.userName, registration.selectedSessionIds, meetup.maxPlayers);
    }
    // Increment subscriber count
    await db.collection('standingMeetups').doc(registration.standingMeetupId).update({
        subscriberCount: firestore_1.FieldValue.increment(1),
        updatedAt: Date.now(),
    });
    console.log(`Confirmed bank payment for registration ${registrationId}`);
    return {
        success: true,
        paidAt,
    };
});
/**
 * Cancel an unpaid bank transfer registration
 */
exports.standingMeetup_cancelUnpaidBankRegistration = functions.https.onCall(async (data, context) => {
    var _a;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { registrationId } = data;
    if (!registrationId) {
        throw new functions.https.HttpsError('invalid-argument', 'registrationId is required');
    }
    // Get registration
    const regRef = db.collection('standingMeetupRegistrations').doc(registrationId);
    const regSnap = await regRef.get();
    if (!regSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Registration not found');
    }
    const registration = regSnap.data();
    // Validate
    if (registration.paymentMethod !== 'bank_transfer') {
        throw new functions.https.HttpsError('failed-precondition', 'Not a bank transfer registration');
    }
    if (registration.paymentStatus !== 'pending') {
        throw new functions.https.HttpsError('failed-precondition', 'Cannot cancel - payment already confirmed');
    }
    // Check if caller is the user or organizer
    const isOwner = registration.odUserId === context.auth.uid;
    if (!isOwner) {
        const meetupSnap = await db.collection('standingMeetups').doc(registration.standingMeetupId).get();
        const meetup = meetupSnap.data();
        const clubSnap = await db.collection('clubs').doc(meetup.clubId).get();
        const clubData = clubSnap.data();
        const isClubAdmin = (clubData === null || clubData === void 0 ? void 0 : clubData.createdByUserId) === context.auth.uid ||
            ((_a = clubData === null || clubData === void 0 ? void 0 : clubData.admins) === null || _a === void 0 ? void 0 : _a.includes(context.auth.uid));
        if (!isClubAdmin) {
            throw new functions.https.HttpsError('permission-denied', 'Not authorized to cancel this registration');
        }
    }
    // Cancel registration (player was never added to sessions)
    const cancelledAt = Date.now();
    await regRef.update({
        status: 'cancelled',
        cancelledAt,
        updatedAt: cancelledAt,
    });
    console.log(`Cancelled unpaid bank registration ${registrationId}`);
    return {
        success: true,
        cancelledAt,
    };
});
/**
 * Helper: Remove player from future occurrences
 */
async function removePlayerFromFutureOccurrences(standingMeetupId, userId) {
    var _a;
    const now = Date.now();
    const occSnap = await db
        .collection('standingMeetups')
        .doc(standingMeetupId)
        .collection('occurrences')
        .where('startAt', '>=', now)
        .get();
    const batch = db.batch();
    let removedCount = 0;
    for (const doc of occSnap.docs) {
        const participantRef = doc.ref.collection('participants').doc(userId);
        const participantSnap = await participantRef.get();
        if (participantSnap.exists && ((_a = participantSnap.data()) === null || _a === void 0 ? void 0 : _a.status) === 'expected') {
            batch.delete(participantRef);
            batch.update(doc.ref, {
                expectedCount: firestore_1.FieldValue.increment(-1),
                updatedAt: Date.now(),
            });
            removedCount++;
        }
    }
    if (removedCount > 0) {
        await batch.commit();
    }
}
/**
 * Helper: Remove player from selected occurrences
 */
async function removePlayerFromSelectedOccurrences(standingMeetupId, userId, sessionIds) {
    var _a;
    const now = Date.now();
    const batch = db.batch();
    for (const dateId of sessionIds) {
        const occRef = db
            .collection('standingMeetups')
            .doc(standingMeetupId)
            .collection('occurrences')
            .doc(dateId);
        const occSnap = await occRef.get();
        if (!occSnap.exists)
            continue;
        const occData = occSnap.data();
        if (occData.startAt < now)
            continue;
        const participantRef = occRef.collection('participants').doc(userId);
        const participantSnap = await participantRef.get();
        if (participantSnap.exists && ((_a = participantSnap.data()) === null || _a === void 0 ? void 0 : _a.status) === 'expected') {
            batch.delete(participantRef);
            batch.update(occRef, {
                expectedCount: firestore_1.FieldValue.increment(-1),
                updatedAt: Date.now(),
            });
        }
    }
    await batch.commit();
}
/**
 * Player unregisters from a paid registration
 */
exports.standingMeetup_unregister = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { registrationId } = data;
    const userId = context.auth.uid;
    if (!registrationId) {
        throw new functions.https.HttpsError('invalid-argument', 'registrationId is required');
    }
    // Get registration
    const regRef = db.collection('standingMeetupRegistrations').doc(registrationId);
    const regSnap = await regRef.get();
    if (!regSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Registration not found');
    }
    const registration = regSnap.data();
    // Validate
    if (registration.odUserId !== userId) {
        throw new functions.https.HttpsError('permission-denied', 'Not your registration');
    }
    if (registration.status !== 'active') {
        throw new functions.https.HttpsError('failed-precondition', 'Registration already cancelled');
    }
    if (registration.paymentStatus !== 'paid') {
        throw new functions.https.HttpsError('failed-precondition', 'Use cancelUnpaidBankRegistration for pending registrations');
    }
    // Cancel registration
    const cancelledAt = Date.now();
    await regRef.update({
        status: 'cancelled',
        cancelledAt,
        updatedAt: cancelledAt,
    });
    // Decrement subscriber count
    await db.collection('standingMeetups').doc(registration.standingMeetupId).update({
        subscriberCount: firestore_1.FieldValue.increment(-1),
        updatedAt: Date.now(),
    });
    // Remove from future occurrences
    if (registration.registrationType === 'pick_and_pay' && registration.selectedSessionIds) {
        await removePlayerFromSelectedOccurrences(registration.standingMeetupId, userId, registration.selectedSessionIds);
    }
    else {
        await removePlayerFromFutureOccurrences(registration.standingMeetupId, userId);
    }
    console.log(`Unregistered user ${userId} from meetup ${registration.standingMeetupId}`);
    return {
        success: true,
        cancelledAt,
    };
});
//# sourceMappingURL=standingMeetupRegistration.js.map
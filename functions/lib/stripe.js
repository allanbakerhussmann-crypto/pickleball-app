"use strict";
/**
 * Stripe Cloud Functions
 *
 * Backend functions for Stripe integration:
 * - Create Connect accounts for clubs and users
 * - Create Checkout sessions
 * - Handle webhooks (creates bookings/RSVPs after payment)
 *
 * UPDATED: Now supports TWO webhook secrets:
 * - stripe.webhook_secret = Account webhook (for checkout.session.completed)
 * - stripe.connect_webhook_secret = Connect webhook (for account.updated)
 *
 * FILE LOCATION: functions/src/stripe.ts
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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripe_webhook = exports.stripe_createCheckoutSession = exports.stripe_createUserConnectLoginLink = exports.stripe_createConnectLoginLink = exports.stripe_getConnectAccountStatus = exports.stripe_createUserConnectAccount = exports.stripe_createConnectAccount = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const stripe_1 = __importDefault(require("stripe"));
// Initialize Firebase Admin if not already
if (!admin.apps.length) {
    admin.initializeApp();
}
// Initialize Stripe with your secret key
const stripe = new stripe_1.default(((_a = functions.config().stripe) === null || _a === void 0 ? void 0 : _a.secret_key) || process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-11-20.acacia' });
// Platform fee percentage (1.5%)
const PLATFORM_FEE_PERCENT = 1.5;
// ============================================
// CREATE CONNECT ACCOUNT (FOR CLUBS)
// ============================================
exports.stripe_createConnectAccount = functions.https.onCall(async (data, context) => {
    var _a;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { clubId, clubName, clubEmail, returnUrl, refreshUrl } = data;
    if (!clubId || !clubName) {
        throw new functions.https.HttpsError('invalid-argument', 'Club ID and name required');
    }
    try {
        // Check if club already has an account
        const clubDoc = await admin.firestore().collection('clubs').doc(clubId).get();
        const existingAccountId = (_a = clubDoc.data()) === null || _a === void 0 ? void 0 : _a.stripeConnectedAccountId;
        let accountId;
        if (existingAccountId) {
            // Use existing account
            accountId = existingAccountId;
        }
        else {
            // Create new Express account
            const account = await stripe.accounts.create({
                type: 'express',
                country: 'NZ',
                email: clubEmail,
                capabilities: {
                    card_payments: { requested: true },
                    transfers: { requested: true },
                },
                business_type: 'company',
                business_profile: {
                    name: clubName,
                    mcc: '7941', // Sports clubs
                },
                metadata: {
                    clubId,
                    platform: 'pickleball-director',
                },
            });
            accountId = account.id;
            // Save to club document
            await admin.firestore().collection('clubs').doc(clubId).update({
                stripeConnectedAccountId: accountId,
                stripeOnboardingComplete: false,
                updatedAt: Date.now(),
            });
        }
        // Create account link for onboarding
        const accountLink = await stripe.accountLinks.create({
            account: accountId,
            refresh_url: refreshUrl,
            return_url: returnUrl,
            type: 'account_onboarding',
        });
        return {
            accountId,
            url: accountLink.url,
        };
    }
    catch (error) {
        console.error('Create connect account error:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Failed to create Stripe account');
    }
});
// ============================================
// USER STRIPE CONNECT - CREATE ACCOUNT
// ============================================
exports.stripe_createUserConnectAccount = functions.https.onCall(async (data, context) => {
    var _a;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { userId, userName, userEmail, returnUrl, refreshUrl } = data;
    if (!userId) {
        throw new functions.https.HttpsError('invalid-argument', 'User ID required');
    }
    try {
        // Check if user already has an account
        const userDoc = await admin.firestore().collection('users').doc(userId).get();
        const existingAccountId = (_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.stripeConnectedAccountId;
        let accountId;
        if (existingAccountId) {
            accountId = existingAccountId;
        }
        else {
            // Create new Express account for individual organizer
            const account = await stripe.accounts.create({
                type: 'express',
                country: 'NZ',
                email: userEmail,
                capabilities: {
                    card_payments: { requested: true },
                    transfers: { requested: true },
                },
                business_type: 'individual',
                business_profile: {
                    name: userName || 'Pickleball Organizer',
                    mcc: '7941', // Sports clubs/promoters
                },
                metadata: {
                    odUserId: userId,
                    platform: 'pickleball-director',
                    accountType: 'organizer',
                },
            });
            accountId = account.id;
            // Save to user document
            await admin.firestore().collection('users').doc(userId).update({
                stripeConnectedAccountId: accountId,
                stripeOnboardingComplete: false,
                updatedAt: Date.now(),
            });
        }
        // Create account link for onboarding
        const accountLink = await stripe.accountLinks.create({
            account: accountId,
            refresh_url: refreshUrl,
            return_url: returnUrl,
            type: 'account_onboarding',
        });
        return {
            accountId,
            url: accountLink.url,
        };
    }
    catch (error) {
        console.error('Create user connect account error:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Failed to create Stripe account');
    }
});
// ============================================
// GET CONNECT ACCOUNT STATUS
// ============================================
exports.stripe_getConnectAccountStatus = functions.https.onCall(async (data, context) => {
    var _a, _b, _c;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { accountId } = data;
    if (!accountId) {
        throw new functions.https.HttpsError('invalid-argument', 'Account ID required');
    }
    try {
        const account = await stripe.accounts.retrieve(accountId);
        return {
            isConnected: true,
            accountId: account.id,
            chargesEnabled: account.charges_enabled,
            payoutsEnabled: account.payouts_enabled,
            detailsSubmitted: account.details_submitted,
            requirements: {
                currentlyDue: ((_a = account.requirements) === null || _a === void 0 ? void 0 : _a.currently_due) || [],
                eventuallyDue: ((_b = account.requirements) === null || _b === void 0 ? void 0 : _b.eventually_due) || [],
                pastDue: ((_c = account.requirements) === null || _c === void 0 ? void 0 : _c.past_due) || [],
            },
        };
    }
    catch (error) {
        console.error('Get account status error:', error);
        if (error.code === 'resource_missing') {
            return {
                isConnected: false,
                accountId: null,
            };
        }
        throw new functions.https.HttpsError('internal', error.message || 'Failed to get account status');
    }
});
// ============================================
// CREATE CONNECT LOGIN LINK (FOR CLUBS)
// ============================================
exports.stripe_createConnectLoginLink = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { accountId } = data;
    if (!accountId) {
        throw new functions.https.HttpsError('invalid-argument', 'Account ID required');
    }
    try {
        const loginLink = await stripe.accounts.createLoginLink(accountId);
        return {
            url: loginLink.url,
        };
    }
    catch (error) {
        console.error('Create login link error:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Failed to create login link');
    }
});
// ============================================
// USER STRIPE CONNECT - LOGIN LINK
// ============================================
exports.stripe_createUserConnectLoginLink = functions.https.onCall(async (data, context) => {
    var _a;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { accountId } = data;
    if (!accountId) {
        throw new functions.https.HttpsError('invalid-argument', 'Account ID required');
    }
    // Verify user owns this account
    const userDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
    if (!userDoc.exists || ((_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.stripeConnectedAccountId) !== accountId) {
        throw new functions.https.HttpsError('permission-denied', 'You do not own this Stripe account');
    }
    try {
        const loginLink = await stripe.accounts.createLoginLink(accountId);
        return {
            url: loginLink.url,
        };
    }
    catch (error) {
        console.error('Create user login link error:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Failed to create login link');
    }
});
// ============================================
// CREATE CHECKOUT SESSION
// ============================================
exports.stripe_createCheckoutSession = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { items, customerEmail, successUrl, cancelUrl, clubId, clubStripeAccountId, organizerStripeAccountId, metadata = {}, } = data;
    if (!items || items.length === 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Items required');
    }
    try {
        // Calculate total and platform fee
        const totalAmount = items.reduce((sum, item) => sum + item.amount * item.quantity, 0);
        const platformFee = Math.round(totalAmount * (PLATFORM_FEE_PERCENT / 100));
        // Determine destination account (club or organizer)
        const destinationAccount = clubStripeAccountId || organizerStripeAccountId;
        // Build line items
        const lineItems = items.map((item) => ({
            price_data: {
                currency: 'nzd',
                product_data: {
                    name: item.name,
                    description: item.description,
                },
                unit_amount: item.amount,
            },
            quantity: item.quantity,
        }));
        // Session config
        const sessionConfig = {
            mode: 'payment',
            customer_email: customerEmail,
            line_items: lineItems,
            success_url: successUrl,
            cancel_url: cancelUrl,
            metadata: Object.assign({ clubId: clubId || '', odUserId: context.auth.uid }, metadata),
        };
        // If connected account, split the payment
        if (destinationAccount) {
            sessionConfig.payment_intent_data = {
                application_fee_amount: platformFee,
                transfer_data: {
                    destination: destinationAccount,
                },
                metadata: Object.assign({ clubId: clubId || '', odUserId: context.auth.uid }, metadata),
            };
        }
        // Create Checkout Session
        const session = await stripe.checkout.sessions.create(sessionConfig);
        return {
            sessionId: session.id,
            url: session.url,
        };
    }
    catch (error) {
        console.error('Create checkout session error:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Failed to create checkout session');
    }
});
// ============================================
// STRIPE WEBHOOK HANDLER
// Supports TWO webhook secrets (Account + Connect)
// ============================================
exports.stripe_webhook = functions.https.onRequest(async (req, res) => {
    var _a, _b;
    const sig = req.headers['stripe-signature'];
    // Get BOTH webhook secrets
    const accountWebhookSecret = ((_a = functions.config().stripe) === null || _a === void 0 ? void 0 : _a.webhook_secret) || process.env.STRIPE_WEBHOOK_SECRET;
    const connectWebhookSecret = ((_b = functions.config().stripe) === null || _b === void 0 ? void 0 : _b.connect_webhook_secret) || process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
    if (!sig) {
        console.error('Missing stripe-signature header');
        res.status(400).send('Missing signature');
        return;
    }
    let event;
    // Try to verify with Account webhook secret first (for checkout.session.completed)
    // If that fails, try Connect webhook secret (for account.updated)
    try {
        if (accountWebhookSecret) {
            event = stripe.webhooks.constructEvent(req.rawBody, sig, accountWebhookSecret);
            console.log('✅ Verified with Account webhook secret');
        }
        else {
            throw new Error('No account webhook secret configured');
        }
    }
    catch (err1) {
        // First secret failed, try the Connect secret
        console.log('Account webhook verification failed, trying Connect secret...');
        try {
            if (connectWebhookSecret) {
                event = stripe.webhooks.constructEvent(req.rawBody, sig, connectWebhookSecret);
                console.log('✅ Verified with Connect webhook secret');
            }
            else {
                throw new Error('No connect webhook secret configured');
            }
        }
        catch (err2) {
            // Both secrets failed
            console.error('❌ Webhook signature verification failed with BOTH secrets');
            console.error('Account secret error:', err1.message);
            console.error('Connect secret error:', err2.message);
            res.status(400).send(`Webhook Error: Signature verification failed`);
            return;
        }
    }
    console.log(`📩 Received webhook event: ${event.type}`);
    // Handle the event
    switch (event.type) {
        case 'checkout.session.completed': {
            const session = event.data.object;
            console.log('Processing checkout.session.completed:', session.id);
            await handleCheckoutComplete(session);
            break;
        }
        case 'account.updated': {
            const account = event.data.object;
            console.log('Processing account.updated:', account.id);
            await handleAccountUpdated(account);
            break;
        }
        case 'payment_intent.succeeded': {
            const paymentIntent = event.data.object;
            console.log('Payment succeeded:', paymentIntent.id);
            break;
        }
        case 'payment_intent.payment_failed': {
            const paymentIntent = event.data.object;
            console.log('Payment failed:', paymentIntent.id);
            break;
        }
        case 'charge.refunded': {
            const charge = event.data.object;
            console.log('Charge refunded:', charge.id);
            // TODO: Handle refund - update RSVP status, etc.
            break;
        }
        default:
            console.log(`Unhandled event type: ${event.type}`);
    }
    res.json({ received: true });
});
// ============================================
// WEBHOOK HANDLERS
// ============================================
async function handleCheckoutComplete(session) {
    console.log('Checkout completed:', session.id);
    const metadata = session.metadata || {};
    const paymentType = metadata.type;
    const odUserId = metadata.odUserId;
    if (!odUserId) {
        console.error('Missing odUserId in session metadata');
        return;
    }
    try {
        // Route to appropriate handler based on payment type
        switch (paymentType) {
            case 'meetup':
                await handleMeetupPayment(session, metadata);
                break;
            case 'court_booking':
                await handleCourtBookingPayment(session, metadata);
                break;
            case 'tournament':
                await handleTournamentPayment(session, metadata);
                break;
            case 'league':
                await handleLeaguePayment(session, metadata);
                break;
            default:
                // Legacy: court booking without type
                if (metadata.slots) {
                    await handleCourtBookingPayment(session, metadata);
                }
                else {
                    console.log('Unknown payment type:', paymentType);
                }
        }
    }
    catch (error) {
        console.error('Error handling checkout complete:', error);
    }
}
// ============================================
// MEETUP PAYMENT HANDLER
// ============================================
async function handleMeetupPayment(session, metadata) {
    const meetupId = metadata.meetupId;
    const odUserId = metadata.odUserId;
    if (!meetupId || !odUserId) {
        console.error('Missing meetupId or odUserId for meetup payment');
        return;
    }
    console.log(`Processing meetup payment: meetup=${meetupId}, user=${odUserId}`);
    const db = admin.firestore();
    try {
        // Get user info
        const userDoc = await db.collection('users').doc(odUserId).get();
        const userData = userDoc.exists ? userDoc.data() : null;
        const userName = (userData === null || userData === void 0 ? void 0 : userData.displayName) || (userData === null || userData === void 0 ? void 0 : userData.email) || 'Unknown';
        // Get meetup to verify and get pricing info
        const meetupDoc = await db.collection('meetups').doc(meetupId).get();
        if (!meetupDoc.exists) {
            console.error('Meetup not found:', meetupId);
            return;
        }
        const meetupData = meetupDoc.data();
        const amountPaid = session.amount_total || 0;
        // Create or update RSVP with payment info
        const rsvpRef = db.collection('meetups').doc(meetupId).collection('rsvps').doc(odUserId);
        await rsvpRef.set({
            userId: odUserId,
            userName,
            status: 'going',
            paymentStatus: 'paid',
            amountPaid,
            paidAt: Date.now(),
            stripeSessionId: session.id,
            stripePaymentIntentId: session.payment_intent,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        }, { merge: true });
        // Update meetup counters
        const currentPaidPlayers = meetupData.paidPlayers || 0;
        const currentTotalCollected = meetupData.totalCollected || 0;
        await db.collection('meetups').doc(meetupId).update({
            paidPlayers: currentPaidPlayers + 1,
            totalCollected: currentTotalCollected + amountPaid,
            updatedAt: Date.now(),
        });
        console.log(`✅ Meetup payment successful: ${userName} paid ${amountPaid} cents for meetup ${meetupId}`);
    }
    catch (error) {
        console.error('Error processing meetup payment:', error);
        throw error;
    }
}
// ============================================
// COURT BOOKING PAYMENT HANDLER
// ============================================
async function handleCourtBookingPayment(session, metadata) {
    var _a;
    const clubId = metadata.clubId;
    const odUserId = metadata.odUserId;
    const slotsJson = metadata.slots;
    if (!clubId || !odUserId) {
        console.error('Missing clubId or odUserId for court booking');
        return;
    }
    console.log(`Processing court booking: club=${clubId}, user=${odUserId}`);
    const db = admin.firestore();
    try {
        // Get user info for booking
        const userDoc = await db.collection('users').doc(odUserId).get();
        const userData = userDoc.exists ? userDoc.data() : null;
        const userName = (userData === null || userData === void 0 ? void 0 : userData.displayName) || (userData === null || userData === void 0 ? void 0 : userData.email) || 'Unknown';
        // Parse slots if provided
        let slots = [];
        if (slotsJson) {
            try {
                slots = JSON.parse(slotsJson);
            }
            catch (e) {
                console.error('Failed to parse slots JSON:', e);
            }
        }
        else if (metadata.courtId && metadata.date && metadata.startTime) {
            // Single slot from metadata
            slots = [{
                    courtId: metadata.courtId,
                    date: metadata.date,
                    startTime: metadata.startTime,
                    endTime: metadata.endTime || '',
                }];
        }
        // Create bookings for each slot
        for (const slot of slots) {
            // Get court name
            let courtName = 'Court';
            try {
                const courtDoc = await db.collection('clubs').doc(clubId).collection('courts').doc(slot.courtId).get();
                if (courtDoc.exists) {
                    courtName = ((_a = courtDoc.data()) === null || _a === void 0 ? void 0 : _a.name) || 'Court';
                }
            }
            catch (e) {
                console.warn('Could not get court name:', e);
            }
            // Create booking document
            const bookingRef = db.collection('clubs').doc(clubId).collection('bookings').doc();
            await bookingRef.set({
                id: bookingRef.id,
                clubId,
                courtId: slot.courtId,
                courtName,
                date: slot.date,
                startTime: slot.startTime,
                endTime: slot.endTime,
                bookedByUserId: odUserId,
                bookedByName: userName,
                status: 'confirmed',
                paymentStatus: 'paid',
                stripeSessionId: session.id,
                stripePaymentIntentId: session.payment_intent,
                amountPaid: session.amount_total || 0,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
            console.log(`✅ Court booking created: ${courtName} on ${slot.date} at ${slot.startTime}`);
        }
    }
    catch (error) {
        console.error('Error processing court booking:', error);
        throw error;
    }
}
// ============================================
// TOURNAMENT PAYMENT HANDLER (Placeholder)
// ============================================
async function handleTournamentPayment(session, metadata) {
    const tournamentId = metadata.tournamentId;
    const odUserId = metadata.odUserId;
    console.log(`Tournament payment: tournament=${tournamentId}, user=${odUserId}`);
    // TODO: Implement tournament registration payment handling
    // 1. Update registration status to 'paid'
    // 2. Add user to tournament participants
    // 3. Send confirmation email
}
// ============================================
// LEAGUE PAYMENT HANDLER (Placeholder)
// ============================================
async function handleLeaguePayment(session, metadata) {
    const leagueId = metadata.leagueId;
    const odUserId = metadata.odUserId;
    console.log(`League payment: league=${leagueId}, user=${odUserId}`);
    // TODO: Implement league membership payment handling
    // 1. Update membership status to 'paid'
    // 2. Add user to league members
    // 3. Send confirmation email
}
// ============================================
// ACCOUNT UPDATED HANDLER (Connect Onboarding)
// ============================================
async function handleAccountUpdated(account) {
    var _a, _b, _c;
    console.log('Account updated:', account.id);
    console.log('  - charges_enabled:', account.charges_enabled);
    console.log('  - payouts_enabled:', account.payouts_enabled);
    console.log('  - details_submitted:', account.details_submitted);
    const db = admin.firestore();
    // Check metadata to determine if this is a club or user account
    const accountType = (_a = account.metadata) === null || _a === void 0 ? void 0 : _a.accountType;
    const odUserId = (_b = account.metadata) === null || _b === void 0 ? void 0 : _b.odUserId;
    const clubId = (_c = account.metadata) === null || _c === void 0 ? void 0 : _c.clubId;
    try {
        if (accountType === 'organizer' && odUserId) {
            // Update user document
            console.log(`Updating user ${odUserId} with Stripe status`);
            await db.collection('users').doc(odUserId).update({
                stripeChargesEnabled: account.charges_enabled,
                stripePayoutsEnabled: account.payouts_enabled,
                stripeOnboardingComplete: account.details_submitted,
                updatedAt: Date.now(),
            });
            console.log(`✅ User ${odUserId} Stripe status updated`);
        }
        else if (clubId) {
            // Update club document
            console.log(`Updating club ${clubId} with Stripe status`);
            await db.collection('clubs').doc(clubId).update({
                stripeChargesEnabled: account.charges_enabled,
                stripePayoutsEnabled: account.payouts_enabled,
                stripeOnboardingComplete: account.details_submitted,
                updatedAt: Date.now(),
            });
            console.log(`✅ Club ${clubId} Stripe status updated`);
        }
        else {
            // Try to find by stripeConnectedAccountId in users first, then clubs
            console.log('No metadata, searching by account ID...');
            // Search users
            const usersSnapshot = await db.collection('users')
                .where('stripeConnectedAccountId', '==', account.id)
                .limit(1)
                .get();
            if (!usersSnapshot.empty) {
                const userDoc = usersSnapshot.docs[0];
                await userDoc.ref.update({
                    stripeChargesEnabled: account.charges_enabled,
                    stripePayoutsEnabled: account.payouts_enabled,
                    stripeOnboardingComplete: account.details_submitted,
                    updatedAt: Date.now(),
                });
                console.log(`✅ Found and updated user ${userDoc.id}`);
                return;
            }
            // Search clubs
            const clubsSnapshot = await db.collection('clubs')
                .where('stripeConnectedAccountId', '==', account.id)
                .limit(1)
                .get();
            if (!clubsSnapshot.empty) {
                const clubDoc = clubsSnapshot.docs[0];
                await clubDoc.ref.update({
                    stripeChargesEnabled: account.charges_enabled,
                    stripePayoutsEnabled: account.payouts_enabled,
                    stripeOnboardingComplete: account.details_submitted,
                    updatedAt: Date.now(),
                });
                console.log(`✅ Found and updated club ${clubDoc.id}`);
                return;
            }
            console.warn('Could not find user or club for account:', account.id);
        }
    }
    catch (error) {
        console.error('Error handling account updated:', error);
    }
}
//# sourceMappingURL=stripe.js.map
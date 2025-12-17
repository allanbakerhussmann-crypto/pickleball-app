"use strict";
/**
 * Stripe Cloud Functions
 *
 * Backend functions for Stripe integration:
 * - Create Connect accounts for clubs
 * - Create Checkout sessions
 * - Handle webhooks
 *
 * FILE LOCATION: functions/src/stripe.ts
 *
 * SETUP:
 * 1. cd functions
 * 2. npm install stripe
 * 3. firebase functions:config:set stripe.secret_key="sk_test_xxx"
 * 4. firebase deploy --only functions
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
exports.stripe_webhook = exports.stripe_createCheckoutSession = exports.stripe_createConnectLoginLink = exports.stripe_getConnectAccountStatus = exports.stripe_createConnectAccount = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const stripe_1 = __importDefault(require("stripe"));
// Initialize Firebase Admin if not already
if (!admin.apps.length) {
    admin.initializeApp();
}
// Initialize Stripe with your secret key
const stripe = new stripe_1.default(((_a = functions.config().stripe) === null || _a === void 0 ? void 0 : _a.secret_key) ||
    'sk_test_51SfRmcAX1ucMm7kBCgn9NkrnydakcyyLBNQj2N3IFFfiPKvxaexcVjSYHYOJlS9Q5bnmDW1aP8ipEXkp1XJEHJbY00IfxbFOo7', { apiVersion: '2025-12-15.clover' });
// Platform fee percentage (1.5%)
const PLATFORM_FEE_PERCENT = 1.5;
// ============================================
// CREATE CONNECT ACCOUNT
// ============================================
exports.stripe_createConnectAccount = functions.https.onCall(async (data, context) => {
    var _a;
    // Verify user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { clubId, clubName, clubEmail, returnUrl, refreshUrl } = data;
    if (!clubId || !clubName || !returnUrl || !refreshUrl) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
    }
    // Verify user is club admin
    const clubDoc = await admin.firestore().collection('clubs').doc(clubId).get();
    if (!clubDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Club not found');
    }
    const clubData = clubDoc.data();
    const isAdmin = ((_a = clubData.admins) === null || _a === void 0 ? void 0 : _a.includes(context.auth.uid)) ||
        clubData.createdBy === context.auth.uid;
    if (!isAdmin) {
        throw new functions.https.HttpsError('permission-denied', 'Must be club admin');
    }
    try {
        // Check if account already exists
        let accountId = clubData.stripeConnectedAccountId;
        if (!accountId) {
            // Create new Express account
            const account = await stripe.accounts.create({
                type: 'express',
                country: 'NZ', // New Zealand
                email: clubEmail || undefined,
                capabilities: {
                    card_payments: { requested: true },
                    transfers: { requested: true },
                },
                business_type: 'company',
                company: {
                    name: clubName,
                },
                metadata: {
                    clubId,
                    platform: 'pickleball-director',
                },
            });
            accountId = account.id;
            // Save account ID to club document
            await admin.firestore().collection('clubs').doc(clubId).update({
                stripeConnectedAccountId: accountId,
                stripeOnboardingComplete: false,
                stripeChargesEnabled: false,
                stripePayoutsEnabled: false,
                stripeUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
            url: accountLink.url,
            accountId,
        };
    }
    catch (error) {
        console.error('Stripe Connect error:', error);
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
// CREATE CONNECT LOGIN LINK
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
// CREATE CHECKOUT SESSION
// ============================================
exports.stripe_createCheckoutSession = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { items, customerEmail, clubId, clubStripeAccountId, successUrl, cancelUrl, metadata, } = data;
    if (!items || !items.length || !successUrl || !cancelUrl) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
    }
    // Calculate total amount
    const totalAmount = items.reduce((sum, item) => {
        return sum + (item.amount * item.quantity);
    }, 0);
    // Calculate platform fee (1.5%)
    const platformFee = Math.round(totalAmount * (PLATFORM_FEE_PERCENT / 100));
    try {
        // Build session config
        const sessionConfig = {
            payment_method_types: ['card'],
            mode: 'payment',
            customer_email: customerEmail,
            line_items: items.map((item) => ({
                price_data: {
                    currency: 'nzd',
                    product_data: {
                        name: item.name,
                        description: item.description,
                    },
                    unit_amount: item.amount,
                },
                quantity: item.quantity,
            })),
            success_url: successUrl,
            cancel_url: cancelUrl,
            metadata: Object.assign({ clubId: clubId || '', odUserId: context.auth.uid, platformFee: platformFee.toString() }, metadata),
        };
        // If club has connected Stripe account, split the payment
        if (clubStripeAccountId) {
            sessionConfig.payment_intent_data = {
                application_fee_amount: platformFee,
                transfer_data: {
                    destination: clubStripeAccountId,
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
// ============================================
exports.stripe_webhook = functions.https.onRequest(async (req, res) => {
    var _a;
    const sig = req.headers['stripe-signature'];
    const webhookSecret = ((_a = functions.config().stripe) === null || _a === void 0 ? void 0 : _a.webhook_secret) || process.env.STRIPE_WEBHOOK_SECRET;
    if (!sig) {
        res.status(400).send('Missing signature');
        return;
    }
    let event;
    try {
        if (webhookSecret) {
            event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
        }
        else {
            // For testing without webhook secret
            event = req.body;
        }
    }
    catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }
    // Handle the event
    switch (event.type) {
        case 'checkout.session.completed': {
            const session = event.data.object;
            await handleCheckoutComplete(session);
            break;
        }
        case 'account.updated': {
            const account = event.data.object;
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
        default:
            console.log(`Unhandled event type: ${event.type}`);
    }
    res.json({ received: true });
});
// ============================================
// WEBHOOK HANDLERS
// ============================================
async function handleCheckoutComplete(session) {
    var _a;
    console.log('Checkout completed:', session.id);
    const metadata = session.metadata || {};
    const clubId = metadata.clubId;
    const odUserId = metadata.odUserId;
    const bookingIds = ((_a = metadata.bookingIds) === null || _a === void 0 ? void 0 : _a.split(',')) || [];
    if (!odUserId) {
        console.error('Missing odUserId in session metadata');
        return;
    }
    try {
        // Create payment record
        await admin.firestore().collection('payments').add({
            stripeSessionId: session.id,
            stripePaymentIntentId: session.payment_intent,
            clubId: clubId || null,
            odUserId,
            amount: session.amount_total,
            currency: session.currency,
            status: 'completed',
            platformFee: parseInt(metadata.platformFee || '0'),
            bookingIds,
            metadata,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        // Update any pending bookings to confirmed
        if (clubId && bookingIds.length > 0) {
            for (const bookingId of bookingIds) {
                if (bookingId) {
                    await admin.firestore()
                        .collection('clubs')
                        .doc(clubId)
                        .collection('bookings')
                        .doc(bookingId)
                        .update({
                        status: 'confirmed',
                        paymentStatus: 'paid',
                        stripeSessionId: session.id,
                        paidAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                }
            }
        }
        console.log('Payment recorded successfully');
    }
    catch (error) {
        console.error('Error handling checkout complete:', error);
    }
}
async function handleAccountUpdated(account) {
    console.log('Account updated:', account.id);
    try {
        // Find club with this Stripe account
        const clubsQuery = await admin.firestore()
            .collection('clubs')
            .where('stripeConnectedAccountId', '==', account.id)
            .limit(1)
            .get();
        if (clubsQuery.empty) {
            console.log('No club found for account:', account.id);
            return;
        }
        const clubDoc = clubsQuery.docs[0];
        // Update club with latest account status
        await clubDoc.ref.update({
            stripeChargesEnabled: account.charges_enabled,
            stripePayoutsEnabled: account.payouts_enabled,
            stripeOnboardingComplete: account.details_submitted,
            stripeUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log('Club Stripe status updated:', clubDoc.id);
    }
    catch (error) {
        console.error('Error handling account update:', error);
    }
}
//# sourceMappingURL=stripe.js.map
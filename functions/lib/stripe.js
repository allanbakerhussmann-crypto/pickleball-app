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
exports.stripe_createRefund = exports.stripe_seedSMSBundles = exports.stripe_webhook = exports.stripe_v2_webhook = exports.stripe_purchaseSMSBundle = exports.stripe_createCheckoutSession = exports.stripe_createUserConnectLoginLink = exports.stripe_createConnectLoginLink = exports.stripe_getConnectAccountStatus = exports.stripe_createUserAccountLinkV2 = exports.stripe_createUserAccountV2 = exports.stripe_getAccountStatusV2 = exports.stripe_createAccountLinkV2 = exports.stripe_createAccountV2 = exports.stripe_createUserConnectAccount = exports.stripe_createConnectAccount = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const stripe_1 = __importDefault(require("stripe"));
const receiptEmail_1 = require("./receiptEmail");
// Initialize Firebase Admin if not already
if (!admin.apps.length) {
    admin.initializeApp();
}
// Initialize Stripe with your secret key
const stripe = new stripe_1.default(((_a = functions.config().stripe) === null || _a === void 0 ? void 0 : _a.secret_key) || process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-11-20.acacia' });
// Platform fee percentage (1.5%)
const PLATFORM_FEE_PERCENT = 1.5;
// Free starter SMS credits for new organizers
const FREE_STARTER_SMS_CREDITS = 25;
// Default SMS bundles for seeding
const DEFAULT_SMS_BUNDLES = [
    {
        name: 'Starter Pack',
        description: '50 SMS credits - great for small tournaments',
        credits: 50,
        priceNZD: 1000, // $10.00
        isActive: true,
        sortOrder: 1,
    },
    {
        name: 'Pro Pack',
        description: '200 SMS credits - best value for regular organizers',
        credits: 200,
        priceNZD: 3500, // $35.00
        isActive: true,
        sortOrder: 2,
    },
    {
        name: 'Enterprise Pack',
        description: '500 SMS credits - for high-volume events',
        credits: 500,
        priceNZD: 7500, // $75.00
        isActive: true,
        sortOrder: 3,
    },
];
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
// V2 ACCOUNT FUNCTIONS
// ============================================
// Supported countries for V2 accounts (UPPERCASE)
const SUPPORTED_COUNTRIES = ['NZ', 'AU', 'US', 'GB'];
/**
 * Create a Stripe Account for clubs/organizers with country selection
 * Uses Express accounts with Direct Charges model
 *
 * Note: Despite the "V2" name, this uses the standard Stripe API with Express accounts
 * because the actual Stripe V2 API is not yet publicly available in the SDK.
 */
exports.stripe_createAccountV2 = functions.https.onCall(async (data, context) => {
    var _a;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { clubId, displayName, email, country } = data;
    if (!clubId || !displayName) {
        throw new functions.https.HttpsError('invalid-argument', 'Club ID and display name required');
    }
    // Validate and normalize country code to UPPERCASE
    const cc = String(country || 'NZ').toUpperCase();
    if (!SUPPORTED_COUNTRIES.includes(cc)) {
        throw new functions.https.HttpsError('invalid-argument', `Unsupported country: ${cc}. Supported: ${SUPPORTED_COUNTRIES.join(', ')}`);
    }
    const db = admin.firestore();
    try {
        // Check if club already has an account
        const clubDoc = await db.collection('clubs').doc(clubId).get();
        if (!clubDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Club not found');
        }
        const existingAccountId = (_a = clubDoc.data()) === null || _a === void 0 ? void 0 : _a.stripeConnectedAccountId;
        if (existingAccountId) {
            // Return existing account ID - don't create duplicate
            return {
                accountId: existingAccountId,
                existing: true,
            };
        }
        // Create Express account with selected country
        const account = await stripe.accounts.create({
            type: 'express',
            country: cc, // NZ, AU, US, GB
            email: email || undefined,
            capabilities: {
                card_payments: { requested: true },
                transfers: { requested: true },
            },
            business_type: 'company',
            business_profile: {
                name: displayName,
                mcc: '7941', // Sports clubs
            },
            metadata: {
                clubId,
                platform: 'pickleball-director',
                accountVersion: 'v2',
            },
        });
        // Store UPPERCASE country in Firestore
        await db.collection('clubs').doc(clubId).update({
            stripeConnectedAccountId: account.id,
            stripeAccountVersion: 'v2',
            stripeAccountCountry: cc, // UPPERCASE: NZ, AU, US, GB
            stripeOnboardingComplete: false,
            stripeChargesEnabled: false,
            stripePayoutsEnabled: false,
            updatedAt: Date.now(),
        });
        console.log(`✅ Created Stripe account ${account.id} for club ${clubId} (country: ${cc})`);
        return {
            accountId: account.id,
            existing: false,
        };
    }
    catch (error) {
        console.error('Create account error:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Failed to create Stripe account');
    }
});
/**
 * Create an Account Link for onboarding
 * Uses standard Stripe account links API
 */
exports.stripe_createAccountLinkV2 = functions.https.onCall(async (data, context) => {
    var _a;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { accountId, clubId, returnUrl, refreshUrl } = data;
    if (!accountId) {
        throw new functions.https.HttpsError('invalid-argument', 'Account ID required');
    }
    try {
        // Build URLs - use provided or construct defaults
        const baseUrl = ((_a = functions.config().app) === null || _a === void 0 ? void 0 : _a.url) || 'https://pickleballdirector.co.nz';
        const finalReturnUrl = returnUrl || `${baseUrl}/#/clubs/${clubId}/settings?stripe=success`;
        const finalRefreshUrl = refreshUrl || `${baseUrl}/#/clubs/${clubId}/settings?stripe=refresh`;
        // Create standard account link for onboarding
        const accountLink = await stripe.accountLinks.create({
            account: accountId,
            refresh_url: finalRefreshUrl,
            return_url: finalReturnUrl,
            type: 'account_onboarding',
        });
        console.log(`✅ Created account link for account ${accountId}`);
        return {
            url: accountLink.url,
        };
    }
    catch (error) {
        console.error('Create account link error:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Failed to create account link');
    }
});
/**
 * Get Account Status
 * CRITICAL: Always fetch from Stripe directly - no DB caching for status
 */
exports.stripe_getAccountStatusV2 = functions.https.onCall(async (data, context) => {
    var _a, _b, _c, _d, _e, _f;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { accountId } = data;
    if (!accountId) {
        throw new functions.https.HttpsError('invalid-argument', 'Account ID required');
    }
    try {
        // Fetch fresh status from Stripe
        const account = await stripe.accounts.retrieve(accountId);
        // Check capabilities
        const chargesEnabled = account.charges_enabled === true;
        const payoutsEnabled = account.payouts_enabled === true;
        const detailsSubmitted = account.details_submitted === true;
        // Ready to process = both charges and payouts enabled
        const readyToProcessPayments = chargesEnabled && payoutsEnabled;
        const onboardingComplete = detailsSubmitted;
        // Get requirements status
        const requirementsStatus = ((_b = (_a = account.requirements) === null || _a === void 0 ? void 0 : _a.currently_due) === null || _b === void 0 ? void 0 : _b.length)
            ? 'currently_due'
            : ((_d = (_c = account.requirements) === null || _c === void 0 ? void 0 : _c.eventually_due) === null || _d === void 0 ? void 0 : _d.length)
                ? 'eventually_due'
                : 'complete';
        return {
            accountId: account.id,
            readyToProcessPayments,
            onboardingComplete,
            cardPaymentsStatus: chargesEnabled ? 'active' : 'inactive',
            requirementsStatus,
            // Additional useful info
            displayName: ((_e = account.business_profile) === null || _e === void 0 ? void 0 : _e.name) || account.email,
            country: (_f = account.country) === null || _f === void 0 ? void 0 : _f.toUpperCase(), // Return UPPERCASE
            chargesEnabled,
            payoutsEnabled,
        };
    }
    catch (error) {
        console.error('Get account status error:', error);
        if (error.code === 'resource_missing' || error.type === 'StripeInvalidRequestError') {
            return {
                accountId,
                isConnected: false,
                readyToProcessPayments: false,
                onboardingComplete: false,
                error: 'Account not found',
            };
        }
        throw new functions.https.HttpsError('internal', error.message || 'Failed to get account status');
    }
});
/**
 * Create a Stripe Account for individual organizers (users)
 * Uses Express accounts with country selection
 */
exports.stripe_createUserAccountV2 = functions.https.onCall(async (data, context) => {
    var _a;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { userId, displayName, email, country } = data;
    if (!userId) {
        throw new functions.https.HttpsError('invalid-argument', 'User ID required');
    }
    // Validate and normalize country code to UPPERCASE
    const cc = String(country || 'NZ').toUpperCase();
    if (!SUPPORTED_COUNTRIES.includes(cc)) {
        throw new functions.https.HttpsError('invalid-argument', `Unsupported country: ${cc}. Supported: ${SUPPORTED_COUNTRIES.join(', ')}`);
    }
    const db = admin.firestore();
    try {
        // Check if user already has an account
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'User not found');
        }
        const existingAccountId = (_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.stripeConnectedAccountId;
        if (existingAccountId) {
            return {
                accountId: existingAccountId,
                existing: true,
            };
        }
        // Create Express account with selected country
        const account = await stripe.accounts.create({
            type: 'express',
            country: cc, // NZ, AU, US, GB
            email: email || undefined,
            capabilities: {
                card_payments: { requested: true },
                transfers: { requested: true },
            },
            business_type: 'individual',
            business_profile: {
                name: displayName || 'Pickleball Organizer',
                mcc: '7941', // Sports clubs
            },
            metadata: {
                userId,
                platform: 'pickleball-director',
                accountVersion: 'v2',
            },
        });
        // Store UPPERCASE country in Firestore
        await db.collection('users').doc(userId).update({
            stripeConnectedAccountId: account.id,
            stripeAccountVersion: 'v2',
            stripeAccountCountry: cc, // UPPERCASE
            stripeOnboardingComplete: false,
            stripeChargesEnabled: false,
            stripePayoutsEnabled: false,
            updatedAt: Date.now(),
        });
        console.log(`✅ Created Stripe account ${account.id} for user ${userId} (country: ${cc})`);
        return {
            accountId: account.id,
            existing: false,
        };
    }
    catch (error) {
        console.error('Create user account error:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Failed to create Stripe account');
    }
});
/**
 * Create an Account Link for user onboarding
 */
exports.stripe_createUserAccountLinkV2 = functions.https.onCall(async (data, context) => {
    var _a, _b;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { accountId, returnUrl, refreshUrl } = data;
    if (!accountId) {
        throw new functions.https.HttpsError('invalid-argument', 'Account ID required');
    }
    // Verify user owns this account
    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    if (!userDoc.exists || ((_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.stripeConnectedAccountId) !== accountId) {
        throw new functions.https.HttpsError('permission-denied', 'You do not own this Stripe account');
    }
    try {
        const baseUrl = ((_b = functions.config().app) === null || _b === void 0 ? void 0 : _b.url) || 'https://pickleballdirector.co.nz';
        const finalReturnUrl = returnUrl || `${baseUrl}/#/profile?tab=payments&stripe=success`;
        const finalRefreshUrl = refreshUrl || `${baseUrl}/#/profile?tab=payments&stripe=refresh`;
        const accountLink = await stripe.accountLinks.create({
            account: accountId,
            refresh_url: finalRefreshUrl,
            return_url: finalReturnUrl,
            type: 'account_onboarding',
        });
        console.log(`✅ Created account link for user account ${accountId}`);
        return {
            url: accountLink.url,
        };
    }
    catch (error) {
        console.error('Create user account link error:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Failed to create account link');
    }
});
// ============================================
// GET CONNECT ACCOUNT STATUS (V1 - Legacy)
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
// Supports both V1 (destination charges) and V2 (direct charges)
// ============================================
exports.stripe_createCheckoutSession = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { items, customerEmail, successUrl, cancelUrl, clubId, organizerUserId, // For user-based organizer accounts
    metadata = {}, } = data;
    if (!items || items.length === 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Items required');
    }
    const db = admin.firestore();
    try {
        // Calculate total and platform fee
        const totalAmount = items.reduce((sum, item) => sum + item.amount * item.quantity, 0);
        const platformFee = Math.round(totalAmount * (PLATFORM_FEE_PERCENT / 100));
        // Look up connected account and version from Firestore
        let connectedAccountId = null;
        let accountVersion = null;
        let currency = 'nzd'; // Default
        // Try club first, then organizer user
        if (clubId) {
            const clubDoc = await db.collection('clubs').doc(clubId).get();
            if (clubDoc.exists) {
                const clubData = clubDoc.data();
                connectedAccountId = (clubData === null || clubData === void 0 ? void 0 : clubData.stripeConnectedAccountId) || null;
                accountVersion = (clubData === null || clubData === void 0 ? void 0 : clubData.stripeAccountVersion) || null;
                // Get currency from country (UPPERCASE in DB)
                const country = (clubData === null || clubData === void 0 ? void 0 : clubData.stripeAccountCountry) || 'NZ';
                currency = getCurrencyForCountry(country);
            }
        }
        else if (organizerUserId) {
            const userDoc = await db.collection('users').doc(organizerUserId).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                connectedAccountId = (userData === null || userData === void 0 ? void 0 : userData.stripeConnectedAccountId) || null;
                accountVersion = (userData === null || userData === void 0 ? void 0 : userData.stripeAccountVersion) || null;
                const country = (userData === null || userData === void 0 ? void 0 : userData.stripeAccountCountry) || 'NZ';
                currency = getCurrencyForCountry(country);
            }
        }
        // Build line items
        const lineItems = items.map((item) => ({
            price_data: {
                currency: currency.toLowerCase(), // Stripe requires lowercase
                product_data: {
                    name: item.name,
                    description: item.description,
                },
                unit_amount: item.amount,
            },
            quantity: item.quantity,
        }));
        // Build payment metadata - used at BOTH session and payment_intent levels
        const paymentMetadata = Object.assign({ clubId: clubId || '', odUserId: context.auth.uid, type: metadata.type || '', referenceId: metadata.meetupId || metadata.tournamentId || metadata.leagueId || metadata.bookingKey || '', eventName: metadata.eventName || '', payerName: metadata.payerName || '' }, metadata);
        // For V2 accounts, use DIRECT CHARGES (stripeAccount header)
        if (accountVersion === 'v2' && connectedAccountId) {
            console.log(`Creating V2 direct charge session on account ${connectedAccountId}`);
            const session = await stripe.checkout.sessions.create({
                mode: 'payment',
                customer_email: customerEmail,
                line_items: lineItems,
                success_url: successUrl,
                cancel_url: cancelUrl,
                // Session-level metadata (easy access from session events)
                metadata: paymentMetadata,
                payment_intent_data: {
                    application_fee_amount: platformFee, // Platform receives this
                    // Same metadata on PI (for charge events)
                    metadata: paymentMetadata,
                },
            }, {
                stripeAccount: connectedAccountId, // DIRECT CHARGE - execute ON connected account
            });
            console.log(`✅ Created V2 direct charge session ${session.id}`);
            return {
                sessionId: session.id,
                url: session.url,
                chargeModel: 'direct',
            };
        }
        // CRITICAL: If this is a meetup/tournament/league payment, we MUST have a connected account
        // Otherwise payments would incorrectly go to the platform instead of the organizer
        const requiresConnectedAccount = metadata.type === 'meetup' || metadata.type === 'tournament' ||
            metadata.type === 'league' || metadata.type === 'court_booking';
        if (requiresConnectedAccount && !connectedAccountId) {
            console.error(`Payment rejected: No connected account for ${metadata.type} payment. ClubId: ${clubId}, OrganizerUserId: ${organizerUserId}`);
            throw new functions.https.HttpsError('failed-precondition', 'Payment cannot be processed: The organizer has not connected their Stripe account. Please contact the organizer.');
        }
        // For V1 accounts, use DESTINATION CHARGES
        const sessionConfig = {
            mode: 'payment',
            customer_email: customerEmail,
            line_items: lineItems,
            success_url: successUrl,
            cancel_url: cancelUrl,
            metadata: paymentMetadata,
        };
        // If connected account (V1), split the payment with destination charge
        if (connectedAccountId) {
            sessionConfig.payment_intent_data = {
                application_fee_amount: platformFee,
                transfer_data: {
                    destination: connectedAccountId,
                },
                metadata: paymentMetadata,
            };
        }
        // Create Checkout Session
        const session = await stripe.checkout.sessions.create(sessionConfig);
        console.log(`✅ Created ${connectedAccountId ? 'V1 destination charge' : 'platform'} session ${session.id}`);
        return {
            sessionId: session.id,
            url: session.url,
            chargeModel: connectedAccountId ? 'destination' : 'platform',
        };
    }
    catch (error) {
        console.error('Create checkout session error:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Failed to create checkout session');
    }
});
/**
 * Get currency code for a country (UPPERCASE input, lowercase output for Stripe)
 */
function getCurrencyForCountry(country) {
    const currencyMap = {
        'NZ': 'nzd',
        'AU': 'aud',
        'US': 'usd',
        'GB': 'gbp',
    };
    return currencyMap[country.toUpperCase()] || 'nzd';
}
/**
 * Create a Checkout Session for purchasing SMS credits bundle
 * This uses the PLATFORM Stripe account (not Connect) since SMS credits
 * are a platform service, not an organizer payment.
 */
exports.stripe_purchaseSMSBundle = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { bundleId, successUrl, cancelUrl } = data;
    if (!bundleId) {
        throw new functions.https.HttpsError('invalid-argument', 'Bundle ID required');
    }
    const db = admin.firestore();
    try {
        // Get bundle details
        const bundleDoc = await db.collection('sms_bundles').doc(bundleId).get();
        if (!bundleDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Bundle not found');
        }
        const bundle = Object.assign({ id: bundleDoc.id }, bundleDoc.data());
        if (!bundle.isActive) {
            throw new functions.https.HttpsError('failed-precondition', 'Bundle is not available');
        }
        // Create Checkout Session (no connected account - goes to platform)
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            customer_email: context.auth.token.email || undefined,
            line_items: [
                {
                    price_data: {
                        currency: 'nzd',
                        product_data: {
                            name: bundle.name,
                            description: `${bundle.credits} SMS credits`,
                        },
                        unit_amount: bundle.priceNZD,
                    },
                    quantity: 1,
                },
            ],
            success_url: successUrl,
            cancel_url: cancelUrl,
            metadata: {
                type: 'sms_bundle',
                bundleId: bundle.id,
                bundleName: bundle.name,
                credits: bundle.credits.toString(),
                odUserId: context.auth.uid,
            },
        });
        console.log(`Created SMS bundle checkout session ${session.id} for user ${context.auth.uid}`);
        return {
            sessionId: session.id,
            url: session.url,
        };
    }
    catch (error) {
        console.error('Create SMS bundle checkout error:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Failed to create checkout session');
    }
});
// ============================================
// IDEMPOTENCY HELPERS
// Shared by BOTH standard webhook and V2 thin webhook
// Uses transactional lock pattern via stripeEvents/{evtId}
// ============================================
/**
 * Claim a Stripe event ID for processing (transactional lock)
 * Returns true if claimed, false if already claimed
 * Throws on unexpected Firestore errors (let webhook return 500)
 */
async function claimStripeEventId(eventId, eventType) {
    const db = admin.firestore();
    const ref = db.collection('stripeEvents').doc(eventId);
    try {
        const claimed = await db.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            if (snap.exists) {
                return false; // Already claimed
            }
            tx.set(ref, {
                status: 'processing',
                type: eventType,
                claimedAt: Date.now(),
            });
            return true;
        });
        if (!claimed) {
            console.log(`Event ${eventId} already claimed, skipping`);
        }
        return claimed;
    }
    catch (err) {
        // Unexpected Firestore error - rethrow so webhook returns 500
        console.error(`claimStripeEventId failed for ${eventId}:`, err);
        throw err;
    }
}
/**
 * Mark a Stripe event as successfully processed
 */
async function markStripeEventComplete(eventId) {
    const db = admin.firestore();
    await db.collection('stripeEvents').doc(eventId).update({
        completedAt: Date.now(),
        status: 'completed',
    });
}
/**
 * Mark a Stripe event as failed
 */
async function markStripeEventFailed(eventId, error) {
    const db = admin.firestore();
    await db.collection('stripeEvents').doc(eventId).update({
        failedAt: Date.now(),
        status: 'failed',
        error,
    });
}
// ============================================
// V2 THIN EVENTS WEBHOOK
// For V2 account status updates (requirements, capabilities)
// ============================================
exports.stripe_v2_webhook = functions.https.onRequest(async (req, res) => {
    var _a;
    const sig = req.headers['stripe-signature'];
    const v2WebhookSecret = ((_a = functions.config().stripe) === null || _a === void 0 ? void 0 : _a.v2_webhook_secret) || process.env.STRIPE_V2_WEBHOOK_SECRET;
    if (!sig) {
        console.error('Missing stripe-signature header');
        res.status(400).send('Missing signature');
        return;
    }
    if (!v2WebhookSecret) {
        console.error('V2 webhook secret not configured');
        res.status(500).send('Webhook not configured');
        return;
    }
    // 1. Verify signature - return 400 only for verification failures
    let thinEvent;
    try {
        thinEvent = stripe.parseThinEvent(req.rawBody, sig, v2WebhookSecret);
    }
    catch (err) {
        console.error('V2 webhook signature verification failed:', err.message);
        res.status(400).send('Signature verification failed');
        return;
    }
    console.log(`📩 V2 Thin Event: ${thinEvent.type} (${thinEvent.id})`);
    // 2. Claim event with transactional lock
    let claimed = false;
    try {
        claimed = await claimStripeEventId(thinEvent.id, thinEvent.type);
    }
    catch (err) {
        console.error('Failed to claim V2 event:', err);
        res.status(500).send('Failed to claim event');
        return;
    }
    if (!claimed) {
        res.status(200).send('OK'); // Already processed
        return;
    }
    // 3. Process event - return 500 on failures so Stripe retries
    try {
        // Fetch full event details
        const event = await stripe.v2.core.events.retrieve(thinEvent.id);
        switch (event.type) {
            case 'v2.core.account[requirements].updated':
            case 'v2.core.account[configuration.merchant].capability_status_updated':
            case 'v2.core.account[configuration.customer].capability_status_updated':
                await handleV2AccountUpdate(event);
                break;
            default:
                console.log(`Unhandled V2 event type: ${event.type}`);
        }
        await markStripeEventComplete(thinEvent.id);
        res.status(200).send('OK');
    }
    catch (err) {
        console.error('V2 webhook processing error:', err);
        await markStripeEventFailed(thinEvent.id, String(err));
        // Return 500 so Stripe retries - switch to 200 once stable
        res.status(500).send('Processing failed');
    }
});
/**
 * Handle V2 account update events
 * Updates club or user documents with latest Stripe status
 */
async function handleV2AccountUpdate(event) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const db = admin.firestore();
    const accountId = (_a = event.related_object) === null || _a === void 0 ? void 0 : _a.id;
    if (!accountId) {
        console.warn('V2 event missing account ID');
        return;
    }
    console.log(`Processing V2 account update for ${accountId}`);
    try {
        // Fetch latest status from Stripe
        const account = await stripe.v2.core.accounts.retrieve(accountId, {
            include: ['configuration.merchant', 'requirements'],
        });
        const cardPaymentsStatus = (_e = (_d = (_c = (_b = account === null || account === void 0 ? void 0 : account.configuration) === null || _b === void 0 ? void 0 : _b.merchant) === null || _c === void 0 ? void 0 : _c.capabilities) === null || _d === void 0 ? void 0 : _d.card_payments) === null || _e === void 0 ? void 0 : _e.status;
        const requirementsStatus = (_h = (_g = (_f = account === null || account === void 0 ? void 0 : account.requirements) === null || _f === void 0 ? void 0 : _f.summary) === null || _g === void 0 ? void 0 : _g.minimum_deadline) === null || _h === void 0 ? void 0 : _h.status;
        const updateData = {
            stripeChargesEnabled: cardPaymentsStatus === 'active',
            stripePayoutsEnabled: cardPaymentsStatus === 'active',
            stripeOnboardingComplete: requirementsStatus !== 'currently_due' && requirementsStatus !== 'past_due',
            stripeUpdatedAt: Date.now(),
            updatedAt: Date.now(),
        };
        // Update club if found
        const clubSnap = await db.collection('clubs')
            .where('stripeConnectedAccountId', '==', accountId)
            .limit(1)
            .get();
        if (!clubSnap.empty) {
            await clubSnap.docs[0].ref.update(updateData);
            console.log(`✅ Updated club ${clubSnap.docs[0].id} Stripe status`);
        }
        // Also check users collection for organizer accounts
        const userSnap = await db.collection('users')
            .where('stripeConnectedAccountId', '==', accountId)
            .limit(1)
            .get();
        if (!userSnap.empty) {
            await userSnap.docs[0].ref.update(updateData);
            console.log(`✅ Updated user ${userSnap.docs[0].id} Stripe status`);
        }
        if (clubSnap.empty && userSnap.empty) {
            console.warn(`No club or user found for V2 account ${accountId}`);
        }
    }
    catch (err) {
        console.error(`Error handling V2 account update for ${accountId}:`, err);
        throw err;
    }
}
// ============================================
// STRIPE WEBHOOK HANDLER (Standard)
// For checkout.session.completed, account.updated, charges, refunds
// Uses ONE webhook secret (Connect application type recommended)
// ============================================
exports.stripe_webhook = functions.https.onRequest(async (req, res) => {
    var _a;
    const sig = req.headers['stripe-signature'];
    const webhookSecret = ((_a = functions.config().stripe) === null || _a === void 0 ? void 0 : _a.webhook_secret) || process.env.STRIPE_WEBHOOK_SECRET;
    if (!sig) {
        console.error('Missing stripe-signature header');
        res.status(400).send('Missing signature');
        return;
    }
    if (!webhookSecret) {
        console.error('Webhook secret not configured');
        res.status(500).send('Webhook not configured');
        return;
    }
    // 1. Verify signature - return 400 only for verification failures
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    }
    catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        res.status(400).send('Signature verification failed');
        return;
    }
    console.log(`📩 Received webhook event: ${event.type} (${event.id})`);
    // 2. Claim event with transactional lock (idempotency)
    let claimed = false;
    try {
        claimed = await claimStripeEventId(event.id, event.type);
    }
    catch (err) {
        console.error('Failed to claim event:', err);
        res.status(500).send('Failed to claim event');
        return;
    }
    if (!claimed) {
        res.status(200).send('OK'); // Already processed
        return;
    }
    // 3. Process event - return 500 on failures so Stripe retries
    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                console.log('Processing checkout.session.completed:', session.id);
                await handleCheckoutComplete(session, event);
                break;
            }
            case 'charge.succeeded': {
                const charge = event.data.object;
                console.log('Processing charge.succeeded:', charge.id);
                await handleChargeSucceeded(charge, event);
                break;
            }
            case 'charge.refunded': {
                const charge = event.data.object;
                console.log('Processing charge.refunded:', charge.id);
                await handleChargeRefunded(charge, event);
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
            case 'charge.dispute.created': {
                const dispute = event.data.object;
                console.log('Processing charge.dispute.created:', dispute.id);
                await handleDisputeCreated(dispute, event);
                break;
            }
            case 'charge.dispute.closed': {
                const dispute = event.data.object;
                console.log('Processing charge.dispute.closed:', dispute.id);
                await handleDisputeClosed(dispute, event);
                break;
            }
            case 'charge.dispute.updated': {
                const dispute = event.data.object;
                console.log('Processing charge.dispute.updated:', dispute.id);
                // Optional: track status changes
                break;
            }
            default:
                console.log(`Unhandled event type: ${event.type}`);
        }
        await markStripeEventComplete(event.id);
        res.status(200).send('OK');
    }
    catch (err) {
        console.error('Webhook processing error:', err);
        await markStripeEventFailed(event.id, String(err));
        // Return 500 so Stripe retries
        res.status(500).send('Processing failed');
    }
});
// ============================================
// WEBHOOK HANDLERS
// ============================================
/**
 * Handle checkout.session.completed event
 * Phase 1 of two-phase recording: creates 'processing' Finance transaction
 */
async function handleCheckoutComplete(session, event) {
    console.log('Checkout completed:', session.id);
    const metadata = session.metadata || {};
    const paymentType = metadata.type;
    const odUserId = metadata.odUserId;
    const clubId = metadata.clubId;
    if (!odUserId) {
        console.error('Missing odUserId in session metadata');
        return;
    }
    // Guard: Only process if payment is confirmed
    // (async payment methods can send completed without paid status)
    if (session.payment_status !== 'paid') {
        console.log(`Session ${session.id} completed but not paid (status: ${session.payment_status}), skipping`);
        return;
    }
    const db = admin.firestore();
    try {
        // Create Finance transaction in 'processing' state (for Connect payments)
        // For direct charges, event.account contains the connected account ID
        const connectedAccountId = event.account;
        if (connectedAccountId && clubId && paymentType !== 'sms_bundle') {
            // Secondary idempotency: check if transaction already exists for this PaymentIntent
            const existingTx = await db.collection('transactions')
                .where('stripe.paymentIntentId', '==', session.payment_intent)
                .where('type', '==', 'payment')
                .limit(1)
                .get();
            if (!existingTx.empty) {
                console.log(`Transaction already exists for PI ${session.payment_intent}, skipping Finance ledger creation`);
            }
            else {
                // Create Finance transaction
                const txRef = db.collection('transactions').doc();
                await txRef.set({
                    id: txRef.id, // ID matches Firestore doc ID
                    schemaVersion: 1,
                    odClubId: clubId,
                    odUserId: odUserId,
                    type: 'payment',
                    status: 'processing', // NOT completed yet - wait for charge.succeeded
                    referenceType: paymentType || 'unknown',
                    referenceId: metadata.referenceId || metadata.meetupId || metadata.tournamentId || metadata.leagueId || '',
                    referenceName: metadata.eventName || '',
                    amount: session.amount_total || 0,
                    currency: (session.currency || 'nzd').toUpperCase(),
                    // Don't calculate platformFeeAmount yet - wait for charge.succeeded
                    platformFeeAmount: 0,
                    clubNetAmount: 0,
                    payerDisplayName: metadata.payerName || '',
                    stripe: {
                        schemaVersion: 1,
                        accountId: connectedAccountId,
                        sessionId: session.id,
                        paymentIntentId: session.payment_intent,
                        webhookEventId: event.id,
                    },
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                });
                console.log(`✅ Created Finance transaction ${txRef.id} (processing) for session ${session.id}`);
            }
        }
        // Route to appropriate handler based on payment type (existing logic for RSVPs, bookings, etc.)
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
            case 'sms_bundle':
                await handleSMSBundlePayment(session, metadata);
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
        throw error; // Re-throw to mark event as failed
    }
}
/**
 * Handle charge.succeeded event
 * Phase 2 of two-phase recording: enriches and completes Finance transaction
 */
async function handleChargeSucceeded(charge, event) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const db = admin.firestore();
    // Guard: check this is a Connect charge
    const connectedAccountId = event.account;
    if (!connectedAccountId) {
        // This is a platform charge (like SMS bundles) - no Finance ledger needed
        console.log('Platform charge (no connected account), skipping Finance ledger');
        return;
    }
    const paymentIntentId = charge.payment_intent;
    console.log(`Processing charge.succeeded for PI ${paymentIntentId} on account ${connectedAccountId}`);
    // Find the processing transaction
    const txSnap = await db.collection('transactions')
        .where('stripe.paymentIntentId', '==', paymentIntentId)
        .where('type', '==', 'payment')
        .limit(1)
        .get();
    // Get actual fees and net from balance_transaction (source of truth for what club receives)
    let platformFee = charge.application_fee_amount || 0;
    let balanceTransactionId = charge.balance_transaction;
    let totalFees = 0; // Platform fee + Stripe fee
    let netAmount = 0; // What club actually receives
    // Always fetch the charge with balance_transaction expanded to get TRUE net amount
    console.log(`charge.succeeded: Fetching balance_transaction for charge ${charge.id}`);
    try {
        const chargeFull = await stripe.charges.retrieve(charge.id, { expand: ['balance_transaction'] }, { stripeAccount: connectedAccountId });
        platformFee = (_a = chargeFull.application_fee_amount) !== null && _a !== void 0 ? _a : 0;
        // Extract balance_transaction data
        const balanceTx = chargeFull.balance_transaction;
        if (typeof balanceTx === 'object' && balanceTx !== null) {
            // Expanded object - get the real net amount
            balanceTransactionId = balanceTx.id;
            totalFees = balanceTx.fee || 0; // Total fees (Stripe + platform)
            netAmount = balanceTx.net || 0; // TRUE net to connected account
            console.log(`Balance transaction: gross=${balanceTx.amount}, totalFees=${totalFees}, net=${netAmount}`);
        }
        else {
            // Just the ID - fall back to calculation
            balanceTransactionId = balanceTx;
            netAmount = charge.amount - platformFee;
            totalFees = platformFee;
            console.log(`Balance transaction not expanded, using fallback: net=${netAmount}`);
        }
    }
    catch (err) {
        console.error(`Failed to fetch charge ${charge.id} from ${connectedAccountId}:`, err);
        // Fallback calculation
        netAmount = charge.amount - platformFee;
        totalFees = platformFee;
    }
    if (platformFee === 0) {
        console.warn(`charge.succeeded: application_fee_amount is 0 for Connect charge ${charge.id}. Check checkout session configuration.`);
    }
    if (!txSnap.empty) {
        // Update existing transaction to completed
        const txDoc = txSnap.docs[0];
        const existingTx = txDoc.data();
        // Verify accountId matches (detect webhook routing issues)
        if (((_b = existingTx.stripe) === null || _b === void 0 ? void 0 : _b.accountId) && existingTx.stripe.accountId !== connectedAccountId) {
            console.error(`⚠️ Account mismatch: transaction has ${existingTx.stripe.accountId}, event has ${connectedAccountId}`);
        }
        await txDoc.ref.update({
            status: 'completed',
            completedAt: Date.now(),
            updatedAt: Date.now(),
            platformFeeAmount: platformFee,
            totalFeeAmount: totalFees, // Total fees including Stripe processing
            clubNetAmount: netAmount, // TRUE net from balance_transaction
            'stripe.chargeId': charge.id,
            'stripe.balanceTransactionId': balanceTransactionId,
            'stripe.applicationFeeId': charge.application_fee,
            'stripe.applicationFeeAmount': platformFee,
            'stripe.totalFee': totalFees,
            'stripe.accountId': connectedAccountId,
            'stripe.mode': event.livemode ? 'live' : 'test',
            'stripe.paymentMethodType': (_c = charge.payment_method_details) === null || _c === void 0 ? void 0 : _c.type,
        });
        console.log(`✅ Completed Finance transaction ${txDoc.id}: platformFee=${platformFee}, totalFees=${totalFees}, net=${netAmount}`);
        // Send receipt email (non-blocking)
        const metadata = charge.metadata || {};
        if (metadata.type && metadata.type !== 'sms_bundle') {
            let userEmail = metadata.payerEmail;
            if (!userEmail && metadata.odUserId) {
                try {
                    const userDoc = await db.collection('users').doc(metadata.odUserId).get();
                    userEmail = (_d = userDoc.data()) === null || _d === void 0 ? void 0 : _d.email;
                }
                catch (err) {
                    console.warn('Failed to fetch user email for receipt:', err);
                }
            }
            if (userEmail) {
                (0, receiptEmail_1.sendReceiptEmail)({
                    transactionId: txDoc.id,
                    userId: metadata.odUserId || '',
                    userEmail,
                    userName: metadata.payerName || 'Customer',
                    paymentType: metadata.type,
                    amount: charge.amount,
                    currency: charge.currency.toUpperCase(),
                    eventName: metadata.eventName || '',
                    clubId: metadata.clubId,
                    cardLast4: ((_f = (_e = charge.payment_method_details) === null || _e === void 0 ? void 0 : _e.card) === null || _f === void 0 ? void 0 : _f.last4) || undefined,
                }).catch(err => console.error('Receipt email failed:', err));
            }
            else {
                console.warn('Receipt skipped: missing userEmail', { txId: txDoc.id });
            }
        }
    }
    else {
        // OUT-OF-ORDER HANDLING: charge.succeeded arrived before checkout.session.completed
        // Create + complete from PI metadata
        console.log(`charge.succeeded: No transaction found for PI ${paymentIntentId}, creating from charge metadata`);
        // Fetch PaymentIntent to get metadata (charge may not have full metadata)
        let metadata = (charge.metadata || {});
        if (!metadata.clubId) {
            try {
                const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {}, { stripeAccount: connectedAccountId });
                metadata = (pi.metadata || {});
            }
            catch (err) {
                console.error(`Failed to fetch PI ${paymentIntentId}:`, err);
            }
        }
        if (metadata.clubId) {
            const txRef = db.collection('transactions').doc();
            await txRef.set({
                id: txRef.id,
                schemaVersion: 1,
                odClubId: metadata.clubId,
                odUserId: metadata.odUserId || '',
                type: 'payment',
                status: 'completed', // Already completed since charge succeeded
                referenceType: metadata.type || 'unknown',
                referenceId: metadata.referenceId || metadata.meetupId || metadata.tournamentId || metadata.leagueId || '',
                referenceName: metadata.eventName || '',
                amount: charge.amount,
                currency: (charge.currency || 'nzd').toUpperCase(),
                platformFeeAmount: platformFee,
                totalFeeAmount: totalFees, // Total fees including Stripe processing
                clubNetAmount: netAmount, // TRUE net from balance_transaction
                payerDisplayName: metadata.payerName || '',
                stripe: {
                    schemaVersion: 1,
                    accountId: connectedAccountId,
                    paymentIntentId: paymentIntentId,
                    chargeId: charge.id,
                    balanceTransactionId: balanceTransactionId,
                    applicationFeeId: charge.application_fee,
                    applicationFeeAmount: platformFee,
                    totalFee: totalFees,
                    webhookEventId: event.id,
                    mode: event.livemode ? 'live' : 'test',
                    paymentMethodType: (_g = charge.payment_method_details) === null || _g === void 0 ? void 0 : _g.type,
                },
                createdAt: Date.now(),
                updatedAt: Date.now(),
                completedAt: Date.now(),
            });
            console.log(`✅ Created completed Finance transaction ${txRef.id}: platformFee=${platformFee}, totalFees=${totalFees}, net=${netAmount}`);
            // Send receipt email for out-of-order case too (non-blocking)
            if (metadata.type && metadata.type !== 'sms_bundle') {
                let userEmail = metadata.payerEmail;
                if (!userEmail && metadata.odUserId) {
                    try {
                        const userDoc = await db.collection('users').doc(metadata.odUserId).get();
                        userEmail = (_h = userDoc.data()) === null || _h === void 0 ? void 0 : _h.email;
                    }
                    catch (err) {
                        console.warn('Failed to fetch user email for receipt:', err);
                    }
                }
                if (userEmail) {
                    (0, receiptEmail_1.sendReceiptEmail)({
                        transactionId: txRef.id,
                        userId: metadata.odUserId || '',
                        userEmail,
                        userName: metadata.payerName || 'Customer',
                        paymentType: metadata.type,
                        amount: charge.amount,
                        currency: (charge.currency || 'nzd').toUpperCase(),
                        eventName: metadata.eventName || '',
                        clubId: metadata.clubId,
                        cardLast4: ((_k = (_j = charge.payment_method_details) === null || _j === void 0 ? void 0 : _j.card) === null || _k === void 0 ? void 0 : _k.last4) || undefined,
                    }).catch(err => console.error('Receipt email failed:', err));
                }
            }
        }
        else {
            console.warn(`charge.succeeded: Cannot create transaction - no clubId in metadata for charge ${charge.id}`);
        }
    }
}
/**
 * Handle charge.refunded event
 * Creates or confirms refund transactions in Finance ledger
 */
async function handleChargeRefunded(charge, event) {
    var _a, _b, _c;
    const db = admin.firestore();
    // Guard: check this is a Connect charge
    const connectedAccountId = event.account;
    if (!connectedAccountId) {
        console.log('Platform refund (no connected account), skipping Finance ledger');
        return;
    }
    console.log(`Processing charge.refunded for charge ${charge.id} on account ${connectedAccountId}`);
    // Find original transaction by chargeId
    const originalSnap = await db.collection('transactions')
        .where('stripe.chargeId', '==', charge.id)
        .where('type', '==', 'payment')
        .limit(1)
        .get();
    if (originalSnap.empty) {
        console.warn(`No original transaction found for charge ${charge.id}`);
        return;
    }
    const originalDoc = originalSnap.docs[0];
    const original = originalDoc.data();
    const refunds = ((_a = charge.refunds) === null || _a === void 0 ? void 0 : _a.data) || [];
    // Get all existing refund transactions for this payment
    const existingRefundsSnap = await db.collection('transactions')
        .where('parentTransactionId', '==', original.id)
        .where('type', '==', 'refund')
        .get();
    // Build set of refund IDs we already have completed transactions for
    const completedRefundIds = new Set();
    const processingRefundDocs = new Map();
    existingRefundsSnap.docs.forEach((doc) => {
        var _a;
        const data = doc.data();
        const refundIds = ((_a = data.stripe) === null || _a === void 0 ? void 0 : _a.refundIds) || [];
        if (data.status === 'completed') {
            refundIds.forEach((id) => completedRefundIds.add(id));
        }
        else if (data.status === 'processing') {
            // Map each refundId to its processing doc
            refundIds.forEach((id) => processingRefundDocs.set(id, doc));
        }
    });
    // Process each refund from Stripe
    const allRefundIds = [];
    for (const stripeRefund of refunds) {
        const refundId = stripeRefund.id;
        allRefundIds.push(refundId);
        // Skip if already completed
        if (completedRefundIds.has(refundId)) {
            continue;
        }
        // Check if we have a processing transaction for this refund
        const processingDoc = processingRefundDocs.get(refundId);
        if (processingDoc) {
            // Confirm existing processing transaction
            await processingDoc.ref.update({
                status: 'completed',
                completedAt: Date.now(),
                updatedAt: Date.now(),
                amount: -stripeRefund.amount,
                platformFeeRefundEstimated: true,
                'stripe.webhookEventId': event.id,
            });
            console.log(`✅ Confirmed refund transaction ${processingDoc.id} for refund ${refundId}`);
            // Send refund receipt email (non-blocking)
            if (original.odUserId) {
                let userEmail = null;
                try {
                    const userDoc = await db.collection('users').doc(original.odUserId).get();
                    userEmail = ((_b = userDoc.data()) === null || _b === void 0 ? void 0 : _b.email) || null;
                }
                catch (err) {
                    console.warn('Failed to fetch user email for refund receipt:', err);
                }
                (0, receiptEmail_1.sendRefundReceiptEmail)({
                    originalTransactionId: original.id,
                    refundAmount: stripeRefund.amount,
                    userId: original.odUserId,
                    userEmail,
                    userName: original.payerDisplayName || 'Customer',
                    currency: original.currency || 'NZD',
                    eventName: original.referenceName || 'Refund',
                    clubId: original.odClubId,
                }).catch(err => console.error('Refund receipt email failed:', err));
            }
        }
        else {
            // Create new refund transaction (initiated outside app, e.g., Stripe Dashboard)
            const refTxRef = db.collection('transactions').doc();
            await refTxRef.set({
                id: refTxRef.id,
                schemaVersion: 1,
                odClubId: original.odClubId,
                odUserId: original.odUserId,
                type: 'refund',
                status: 'completed',
                parentTransactionId: original.id,
                referenceType: original.referenceType,
                referenceId: original.referenceId,
                referenceName: original.referenceName,
                currency: original.currency,
                amount: -stripeRefund.amount,
                platformFeeAmount: 0,
                platformFeeRefundEstimated: true,
                clubNetAmount: -stripeRefund.amount, // Approximate
                payerDisplayName: original.payerDisplayName,
                stripe: {
                    schemaVersion: 1,
                    accountId: connectedAccountId,
                    chargeId: charge.id,
                    refundIds: [refundId],
                    webhookEventId: event.id,
                },
                createdAt: Date.now(),
                updatedAt: Date.now(),
                completedAt: Date.now(),
            });
            console.log(`✅ Created new refund transaction ${refTxRef.id} for external refund ${refundId}`);
            // Send refund receipt email for external refunds too (non-blocking)
            if (original.odUserId) {
                let userEmail = null;
                try {
                    const userDoc = await db.collection('users').doc(original.odUserId).get();
                    userEmail = ((_c = userDoc.data()) === null || _c === void 0 ? void 0 : _c.email) || null;
                }
                catch (err) {
                    console.warn('Failed to fetch user email for refund receipt:', err);
                }
                (0, receiptEmail_1.sendRefundReceiptEmail)({
                    originalTransactionId: original.id,
                    refundAmount: stripeRefund.amount,
                    userId: original.odUserId,
                    userEmail,
                    userName: original.payerDisplayName || 'Customer',
                    currency: original.currency || 'NZD',
                    eventName: original.referenceName || 'Refund',
                    clubId: original.odClubId,
                }).catch(err => console.error('Refund receipt email failed:', err));
            }
        }
    }
    // Update original transaction status
    await originalDoc.ref.update({
        status: charge.refunded ? 'refunded' : 'partially_refunded',
        'stripe.refundIds': allRefundIds,
        updatedAt: Date.now(),
    });
    console.log(`✅ Updated original transaction ${original.id} status to ${charge.refunded ? 'refunded' : 'partially_refunded'}`);
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
// TOURNAMENT PAYMENT HANDLER
// ============================================
async function handleTournamentPayment(session, metadata) {
    const db = admin.firestore();
    const tournamentId = metadata.tournamentId;
    const odUserId = metadata.odUserId;
    const registrationId = metadata.registrationId;
    const divisionIds = metadata.divisionIds ? JSON.parse(metadata.divisionIds) : [];
    const partnerDetails = metadata.partnerDetails ? JSON.parse(metadata.partnerDetails) : {};
    if (!tournamentId || !odUserId) {
        console.error('Missing tournamentId or odUserId for tournament payment');
        return;
    }
    console.log(`Processing tournament payment: tournament=${tournamentId}, user=${odUserId}, reg=${registrationId}`);
    const now = Date.now();
    try {
        // 1. Update registration status to 'completed' and 'paid'
        if (registrationId) {
            const regRef = db.collection('tournament_registrations').doc(registrationId);
            await regRef.update({
                status: 'completed',
                paymentStatus: 'paid',
                paymentMethod: 'stripe',
                stripeSessionId: session.id,
                stripePaymentIntentId: session.payment_intent,
                paidAt: now,
                paidAmount: session.amount_total || 0,
                completedAt: now,
                updatedAt: now,
            });
            console.log(`✅ Registration ${registrationId} updated to paid`);
        }
        // 2. Get user profile for team creation
        const userSnap = await db.collection('users').doc(odUserId).get();
        const userProfile = userSnap.exists ? userSnap.data() : null;
        const userName = (userProfile === null || userProfile === void 0 ? void 0 : userProfile.displayName) || (userProfile === null || userProfile === void 0 ? void 0 : userProfile.firstName) || 'Unknown';
        // 3. Create/update teams for each division
        for (const divisionId of divisionIds) {
            const teamsRef = db.collection('tournaments').doc(tournamentId).collection('teams');
            // Check if team already exists for this user in this division
            const existingTeamSnap = await teamsRef
                .where('divisionId', '==', divisionId)
                .where('players', 'array-contains', odUserId)
                .get();
            if (!existingTeamSnap.empty) {
                // Update existing team to paid
                const batch = db.batch();
                existingTeamSnap.docs.forEach((doc) => {
                    batch.update(doc.ref, {
                        paymentStatus: 'paid',
                        paymentMethod: 'stripe',
                        stripeSessionId: session.id,
                        paidAt: now,
                        paidAmount: session.amount_total || 0,
                        updatedAt: now,
                    });
                });
                await batch.commit();
                console.log(`✅ Updated ${existingTeamSnap.size} existing team(s) in division ${divisionId}`);
            }
            else {
                // Create new team
                const partnerInfo = partnerDetails[divisionId];
                const players = [odUserId];
                // Add partner if specified
                if (partnerInfo === null || partnerInfo === void 0 ? void 0 : partnerInfo.partnerId) {
                    players.push(partnerInfo.partnerId);
                }
                const teamRef = teamsRef.doc();
                await teamRef.set({
                    id: teamRef.id,
                    tournamentId,
                    divisionId,
                    players,
                    name: userName,
                    status: (partnerInfo === null || partnerInfo === void 0 ? void 0 : partnerInfo.partnerId) ? 'active' : 'pending_partner',
                    paymentStatus: 'paid',
                    paymentMethod: 'stripe',
                    stripeSessionId: session.id,
                    paidAt: now,
                    paidAmount: session.amount_total || 0,
                    createdByUserId: odUserId,
                    createdAt: now,
                    updatedAt: now,
                });
                console.log(`✅ Created new team ${teamRef.id} in division ${divisionId}`);
            }
        }
        console.log(`✅ Tournament registration complete: ${divisionIds.length} division(s) processed`);
    }
    catch (error) {
        console.error('Error processing tournament payment:', error);
        throw error;
    }
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
// SMS BUNDLE PAYMENT HANDLER
// ============================================
async function handleSMSBundlePayment(session, metadata) {
    const bundleId = metadata.bundleId;
    const bundleName = metadata.bundleName;
    const credits = parseInt(metadata.credits, 10);
    const odUserId = metadata.odUserId;
    if (!bundleId || !odUserId || isNaN(credits)) {
        console.error('Missing required metadata for SMS bundle payment:', {
            bundleId,
            odUserId,
            credits,
        });
        return;
    }
    console.log(`Processing SMS bundle payment: bundle=${bundleName}, credits=${credits}, user=${odUserId}`);
    const db = admin.firestore();
    try {
        const now = Date.now();
        const creditsRef = db.collection('sms_credits').doc(odUserId);
        // Use a transaction to safely update credits
        await db.runTransaction(async (transaction) => {
            const creditsDoc = await transaction.get(creditsRef);
            if (!creditsDoc.exists) {
                // Create new credits document with purchased credits + free starter
                const newCredits = {
                    odUserId,
                    balance: credits + FREE_STARTER_SMS_CREDITS,
                    totalPurchased: credits,
                    totalUsed: 0,
                    totalFreeCredits: FREE_STARTER_SMS_CREDITS,
                    lastTopUpAt: now,
                    createdAt: now,
                    updatedAt: now,
                };
                transaction.set(creditsRef, newCredits);
            }
            else {
                // Update existing credits
                const existing = creditsDoc.data();
                transaction.update(creditsRef, {
                    balance: existing.balance + credits,
                    totalPurchased: existing.totalPurchased + credits,
                    lastTopUpAt: now,
                    updatedAt: now,
                });
            }
            // Log the purchase
            const purchaseRef = db.collection('sms_credits').doc(odUserId).collection('purchases').doc();
            transaction.set(purchaseRef, {
                bundleId,
                bundleName,
                credits,
                amountNZD: session.amount_total || 0,
                stripeSessionId: session.id,
                stripePaymentIntentId: session.payment_intent,
                status: 'completed',
                createdAt: now,
                completedAt: now,
            });
        });
        console.log(`✅ SMS bundle purchase successful: ${bundleName} (${credits} credits) for user ${odUserId}`);
    }
    catch (error) {
        console.error('Error processing SMS bundle payment:', error);
        throw error;
    }
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
// ============================================
// SEED SMS BUNDLES (One-time setup)
// ============================================
/**
 * Seed the default SMS bundles to Firestore
 * Call this once to populate the sms_bundles collection
 */
exports.stripe_seedSMSBundles = functions.https.onCall(async (_data, context) => {
    var _a;
    // Only app admins can seed bundles
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const db = admin.firestore();
    // Check if user is app admin
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    if (!userDoc.exists || !((_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.isAppAdmin)) {
        throw new functions.https.HttpsError('permission-denied', 'Only app admins can seed bundles');
    }
    try {
        const bundlesRef = db.collection('sms_bundles');
        // Check if bundles already exist
        const existingBundles = await bundlesRef.get();
        if (!existingBundles.empty) {
            return {
                success: false,
                message: `${existingBundles.size} bundles already exist. Delete them first to re-seed.`,
                existing: existingBundles.docs.map(d => ({
                    id: d.id,
                    name: d.data().name,
                    credits: d.data().credits,
                })),
            };
        }
        // Seed the default bundles
        const now = Date.now();
        const batch = db.batch();
        const seededBundles = [];
        for (const bundle of DEFAULT_SMS_BUNDLES) {
            const docRef = bundlesRef.doc();
            batch.set(docRef, Object.assign(Object.assign({}, bundle), { createdAt: now, updatedAt: now }));
            seededBundles.push({
                id: docRef.id,
                name: bundle.name,
                credits: bundle.credits,
                priceNZD: bundle.priceNZD,
            });
        }
        await batch.commit();
        console.log(`✅ Seeded ${seededBundles.length} SMS bundles by user ${context.auth.uid}`);
        return {
            success: true,
            message: `Successfully seeded ${seededBundles.length} SMS bundles`,
            bundles: seededBundles,
        };
    }
    catch (error) {
        console.error('Error seeding SMS bundles:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Failed to seed bundles');
    }
});
// ============================================
// REFUND CALLABLE FUNCTION
// Initiate refunds from the app (creates pending, webhook confirms)
// ============================================
/**
 * Create a refund for a Finance transaction
 * Better than dashboard-initiated refunds for audit trail
 */
exports.stripe_createRefund = functions.https.onCall(async (data, context) => {
    var _a, _b;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { transactionId, amount, reason } = data;
    if (!transactionId) {
        throw new functions.https.HttpsError('invalid-argument', 'Transaction ID required');
    }
    const db = admin.firestore();
    try {
        // 1. Load original transaction
        const txDoc = await db.collection('transactions').doc(transactionId).get();
        if (!txDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Transaction not found');
        }
        const tx = txDoc.data();
        // Validate transaction can be refunded
        if (tx.type !== 'payment') {
            throw new functions.https.HttpsError('failed-precondition', 'Can only refund payment transactions');
        }
        if (tx.status !== 'completed') {
            throw new functions.https.HttpsError('failed-precondition', 'Can only refund completed transactions');
        }
        if (!((_a = tx.stripe) === null || _a === void 0 ? void 0 : _a.chargeId)) {
            throw new functions.https.HttpsError('failed-precondition', 'Transaction has no charge ID');
        }
        if (!((_b = tx.stripe) === null || _b === void 0 ? void 0 : _b.accountId)) {
            throw new functions.https.HttpsError('failed-precondition', 'Transaction has no connected account');
        }
        // Validate refund amount
        const refundAmount = amount || tx.amount; // Full refund if not specified
        if (refundAmount <= 0) {
            throw new functions.https.HttpsError('invalid-argument', 'Refund amount must be positive');
        }
        if (refundAmount > tx.amount) {
            throw new functions.https.HttpsError('invalid-argument', 'Refund amount cannot exceed original amount');
        }
        // 2. Create Stripe refund on connected account
        const refund = await stripe.refunds.create({
            charge: tx.stripe.chargeId,
            amount: refundAmount,
            reason: reason || 'requested_by_customer',
        }, {
            stripeAccount: tx.stripe.accountId,
        });
        console.log(`✅ Created Stripe refund ${refund.id} for transaction ${transactionId}`);
        // 3. Create pending refund transaction (webhook will confirm)
        const refTxRef = db.collection('transactions').doc();
        await refTxRef.set({
            id: refTxRef.id,
            schemaVersion: 1,
            odClubId: tx.odClubId,
            odUserId: tx.odUserId,
            type: 'refund',
            status: 'processing', // Webhook will complete
            parentTransactionId: transactionId,
            referenceType: tx.referenceType,
            referenceId: tx.referenceId,
            referenceName: tx.referenceName,
            currency: tx.currency,
            amount: -refundAmount, // Negative
            platformFeeAmount: 0, // Will be set by webhook based on Stripe actuals
            platformFeeRefundEstimated: true, // Mark as not yet confirmed
            clubNetAmount: 0,
            payerDisplayName: tx.payerDisplayName,
            stripe: {
                schemaVersion: 1,
                accountId: tx.stripe.accountId,
                chargeId: tx.stripe.chargeId,
                refundIds: [refund.id],
            },
            initiatedByUserId: context.auth.uid,
            reason: reason || 'requested_by_customer',
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });
        console.log(`✅ Created refund transaction ${refTxRef.id} (processing)`);
        return {
            refundId: refund.id,
            transactionId: refTxRef.id,
            amount: refundAmount,
            status: 'processing',
        };
    }
    catch (error) {
        console.error('Create refund error:', error);
        if (error.type === 'StripeCardError' || error.type === 'StripeInvalidRequestError') {
            throw new functions.https.HttpsError('failed-precondition', error.message);
        }
        throw new functions.https.HttpsError('internal', error.message || 'Failed to create refund');
    }
});
// ============================================
// DISPUTE HANDLERS
// Track chargebacks/disputes in Finance ledger
// ============================================
/**
 * Handle charge.dispute.created event
 * Creates a dispute transaction in Finance ledger
 */
async function handleDisputeCreated(dispute, event) {
    var _a;
    const db = admin.firestore();
    // Guard: check this is a Connect dispute
    const connectedAccountId = event.account;
    if (!connectedAccountId) {
        console.log('Platform dispute (no connected account), skipping Finance ledger');
        return;
    }
    const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge.id;
    console.log(`Processing dispute ${dispute.id} for charge ${chargeId} on account ${connectedAccountId}`);
    // Find the original transaction
    const originalSnap = await db.collection('transactions')
        .where('stripe.chargeId', '==', chargeId)
        .where('type', '==', 'payment')
        .limit(1)
        .get();
    if (originalSnap.empty) {
        console.warn(`No original transaction found for disputed charge ${chargeId}`);
        return;
    }
    const originalDoc = originalSnap.docs[0];
    const original = originalDoc.data();
    // Check if we already have a dispute transaction for this dispute
    const existingDisputeSnap = await db.collection('transactions')
        .where('stripe.disputeId', '==', dispute.id)
        .limit(1)
        .get();
    if (!existingDisputeSnap.empty) {
        console.log(`Dispute transaction already exists for ${dispute.id}`);
        return;
    }
    // Create dispute transaction
    const disputeTxRef = db.collection('transactions').doc();
    await disputeTxRef.set({
        id: disputeTxRef.id,
        schemaVersion: 1,
        odClubId: original.odClubId,
        odUserId: original.odUserId,
        type: 'dispute',
        status: 'open', // open | won | lost
        parentTransactionId: original.id,
        referenceType: original.referenceType,
        referenceId: original.referenceId,
        referenceName: `DISPUTE - ${original.referenceName}`,
        currency: original.currency,
        amount: -dispute.amount, // Held amount (negative)
        platformFeeAmount: 0, // Will be determined on resolution
        stripeFeeAmount: 0,
        totalFeeAmount: 0,
        clubNetAmount: -dispute.amount, // Held from club
        payerDisplayName: original.payerDisplayName,
        stripe: {
            schemaVersion: 1,
            accountId: connectedAccountId,
            chargeId: chargeId,
            disputeId: dispute.id,
            disputeReason: dispute.reason,
            disputeStatus: dispute.status,
            webhookEventId: event.id,
            mode: event.livemode ? 'live' : 'test',
        },
        disputeDueBy: ((_a = dispute.evidence_details) === null || _a === void 0 ? void 0 : _a.due_by) ? dispute.evidence_details.due_by * 1000 : undefined,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    });
    // Update original transaction status
    await originalDoc.ref.update({
        status: 'disputed',
        'stripe.disputeId': dispute.id,
        updatedAt: Date.now(),
    });
    console.log(`✅ Created dispute transaction ${disputeTxRef.id} for charge ${chargeId}`);
}
/**
 * Handle charge.dispute.closed event
 * Updates dispute transaction status (won/lost)
 */
async function handleDisputeClosed(dispute, event) {
    const db = admin.firestore();
    // Guard: check this is a Connect dispute
    const connectedAccountId = event.account;
    if (!connectedAccountId) {
        console.log('Platform dispute closed (no connected account), skipping Finance ledger');
        return;
    }
    console.log(`Processing closed dispute ${dispute.id} with status ${dispute.status}`);
    // Find the dispute transaction
    const disputeSnap = await db.collection('transactions')
        .where('stripe.disputeId', '==', dispute.id)
        .where('type', '==', 'dispute')
        .limit(1)
        .get();
    if (disputeSnap.empty) {
        console.warn(`No dispute transaction found for ${dispute.id}`);
        return;
    }
    const disputeDoc = disputeSnap.docs[0];
    const disputeTx = disputeDoc.data();
    // Determine outcome
    // dispute.status: 'won' (merchant won, funds returned), 'lost' (customer won, funds gone)
    const won = dispute.status === 'won';
    const lost = dispute.status === 'lost';
    await disputeDoc.ref.update({
        status: won ? 'won' : lost ? 'lost' : 'closed',
        'stripe.disputeStatus': dispute.status,
        updatedAt: Date.now(),
        completedAt: Date.now(),
        // If won, funds returned - set amounts to 0 (no impact)
        // If lost, funds permanently gone - keep negative amount
        clubNetAmount: won ? 0 : disputeTx.clubNetAmount,
        amount: won ? 0 : disputeTx.amount,
    });
    // Update original transaction status
    if (disputeTx.parentTransactionId) {
        const originalDoc = await db.collection('transactions').doc(disputeTx.parentTransactionId).get();
        if (originalDoc.exists) {
            await originalDoc.ref.update({
                status: won ? 'completed' : 'dispute_lost',
                updatedAt: Date.now(),
            });
        }
    }
    console.log(`✅ Dispute ${dispute.id} closed with status: ${dispute.status} (${won ? 'WON' : lost ? 'LOST' : 'OTHER'})`);
}
//# sourceMappingURL=stripe.js.map
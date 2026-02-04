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
exports.stripe_cancelStandingMeetupSubscription = exports.stripe_createStandingMeetupSubscription = exports.standingMeetup_createQuickRegisterCheckoutSession = exports.standingMeetup_createGuestCheckoutSession = exports.stripe_createRefund = exports.stripe_seedSMSBundles = exports.stripe_webhook = exports.stripe_v2_webhook = exports.stripe_purchaseSMSBundle = exports.stripe_createCheckoutSession = exports.stripe_createUserConnectLoginLink = exports.stripe_createConnectLoginLink = exports.stripe_getConnectAccountStatus = exports.stripe_createUserAccountLinkV2 = exports.stripe_createUserAccountV2 = exports.stripe_getAccountStatusV2 = exports.stripe_createAccountLinkV2 = exports.stripe_createAccountV2 = exports.stripe_createUserConnectAccount = exports.stripe_createConnectAccount = void 0;
exports.handleStandingMeetupSubscriptionWebhook = handleStandingMeetupSubscriptionWebhook;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const stripe_1 = __importDefault(require("stripe"));
const receiptEmail_1 = require("./receiptEmail");
const comms_1 = require("./comms");
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
        // Return to /clubs/:id with stripe param - ClubDetailPage handles switching to settings tab
        const baseUrl = ((_a = functions.config().app) === null || _a === void 0 ? void 0 : _a.url) || 'https://pickleballdirector.co.nz';
        const finalReturnUrl = returnUrl || `${baseUrl}/#/clubs/${clubId}?stripe=success`;
        const finalRefreshUrl = refreshUrl || `${baseUrl}/#/clubs/${clubId}?stripe=refresh`;
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
    var _a, _b;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { items, customerEmail, successUrl, cancelUrl, leagueId, // V07.54: Highest priority - routes to league.organizerStripeAccountId
    clubId, organizerUserId, // For user-based organizer accounts (fallback)
    metadata = {}, } = data;
    // V07.54: Debug logging for routing
    console.log('[Checkout] Input params:', { leagueId, clubId, organizerUserId, metadataType: metadata === null || metadata === void 0 ? void 0 : metadata.type });
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
        let routingSource = 'none'; // Track which routing path was used
        // V07.54: Priority order for routing:
        // 1. leagueId -> league.organizerStripeAccountId (highest priority - fixes stale user account issue)
        // 2. clubId -> club.stripeConnectedAccountId
        // 3. organizerUserId -> user.stripeConnectedAccountId (fallback)
        if (leagueId) {
            console.log(`[Checkout] Attempting league routing for leagueId=${leagueId}`);
            const leagueDoc = await db.collection('leagues').doc(leagueId).get();
            if (leagueDoc.exists) {
                const leagueData = leagueDoc.data();
                console.log(`[Checkout] League found. organizerStripeAccountId=${leagueData === null || leagueData === void 0 ? void 0 : leagueData.organizerStripeAccountId}, clubId=${leagueData === null || leagueData === void 0 ? void 0 : leagueData.clubId}, createdByUserId=${leagueData === null || leagueData === void 0 ? void 0 : leagueData.createdByUserId}`);
                connectedAccountId = (leagueData === null || leagueData === void 0 ? void 0 : leagueData.organizerStripeAccountId) || null;
                routingSource = 'league';
                // Derive currency from league's club if available, otherwise use creator's country
                if (leagueData === null || leagueData === void 0 ? void 0 : leagueData.clubId) {
                    const clubDoc = await db.collection('clubs').doc(leagueData.clubId).get();
                    if (clubDoc.exists) {
                        const clubData = clubDoc.data();
                        const country = (clubData === null || clubData === void 0 ? void 0 : clubData.stripeAccountCountry) || 'NZ';
                        currency = getCurrencyForCountry(country);
                    }
                }
                else if (leagueData === null || leagueData === void 0 ? void 0 : leagueData.createdByUserId) {
                    const userDoc = await db.collection('users').doc(leagueData.createdByUserId).get();
                    if (userDoc.exists) {
                        const userData = userDoc.data();
                        const country = (userData === null || userData === void 0 ? void 0 : userData.stripeAccountCountry) || 'NZ';
                        currency = getCurrencyForCountry(country);
                    }
                }
                console.log(`[Checkout] League routing result: connectedAccount=${connectedAccountId}, currency=${currency}`);
            }
            else {
                console.log(`[Checkout] League not found for leagueId=${leagueId}`);
            }
        }
        // Fallback to club if no league or league had no connected account
        if (!connectedAccountId && clubId) {
            console.log(`[Checkout] Falling back to club routing for clubId=${clubId}`);
            const clubDoc = await db.collection('clubs').doc(clubId).get();
            if (clubDoc.exists) {
                const clubData = clubDoc.data();
                connectedAccountId = (clubData === null || clubData === void 0 ? void 0 : clubData.stripeConnectedAccountId) || null;
                accountVersion = (clubData === null || clubData === void 0 ? void 0 : clubData.stripeAccountVersion) || null;
                routingSource = 'club';
                // Get currency from country (UPPERCASE in DB)
                const country = (clubData === null || clubData === void 0 ? void 0 : clubData.stripeAccountCountry) || 'NZ';
                currency = getCurrencyForCountry(country);
                console.log(`[Checkout] Club routing result: connectedAccount=${connectedAccountId}`);
            }
        }
        // Fallback to organizer user if no club account found
        if (!connectedAccountId && organizerUserId) {
            console.log(`[Checkout] Falling back to user routing for organizerUserId=${organizerUserId}`);
            const userDoc = await db.collection('users').doc(organizerUserId).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                connectedAccountId = (userData === null || userData === void 0 ? void 0 : userData.stripeConnectedAccountId) || null;
                accountVersion = (userData === null || userData === void 0 ? void 0 : userData.stripeAccountVersion) || null;
                routingSource = 'user';
                const country = (userData === null || userData === void 0 ? void 0 : userData.stripeAccountCountry) || 'NZ';
                currency = getCurrencyForCountry(country);
                console.log(`[Checkout] User routing result: connectedAccount=${connectedAccountId}`);
            }
        }
        console.log(`[Checkout] Final routing: source=${routingSource}, connectedAccountId=${connectedAccountId}, currency=${currency}`);
        // V07.54: Detect test/live mode mismatch
        // Test accounts start with acct_1 and have 18 chars, live accounts are longer
        // More reliable: check if we're using a live key (starts with sk_live_) vs test key (sk_test_)
        const stripeKey = ((_a = functions.config().stripe) === null || _a === void 0 ? void 0 : _a.secret_key) || process.env.STRIPE_SECRET_KEY || '';
        const isLiveMode = stripeKey.startsWith('sk_live_') || stripeKey.startsWith('rk_live_');
        if (connectedAccountId && isLiveMode) {
            // In live mode, verify the account is not a test account by checking a simple API call
            // Test accounts will fail with "The account was created with a testmode key"
            // We catch this early to give a better error message
            try {
                await stripe.accounts.retrieve(connectedAccountId);
            }
            catch (accountError) {
                if ((_b = accountError.message) === null || _b === void 0 ? void 0 : _b.includes('testmode')) {
                    console.error(`[Checkout] Test account detected in live mode: ${connectedAccountId}`);
                    throw new functions.https.HttpsError('failed-precondition', `The organizer's Stripe account is a test account and cannot process live payments. Please ask the organizer to reconnect their Stripe account.`);
                }
                // Other errors - let them proceed and fail at checkout creation
                console.warn(`[Checkout] Account check warning:`, accountError.message);
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
        // Build payment metadata - MUST be flat string map (Stripe requirement)
        // Stringify all values to ensure no objects/arrays/numbers
        const paymentMetadata = {
            clubId: clubId || '',
            organizerUserId: organizerUserId || '',
            odUserId: context.auth.uid,
            type: String(metadata.type || ''),
            referenceId: String(metadata.meetupId || metadata.tournamentId || metadata.leagueId || metadata.bookingKey || ''),
            meetupId: String(metadata.meetupId || ''),
            tournamentId: String(metadata.tournamentId || ''),
            leagueId: String(metadata.leagueId || ''),
            bookingKey: String(metadata.bookingKey || ''),
            eventName: String(metadata.eventName || ''),
            payerName: String(metadata.payerName || ''),
            payerEmail: String(customerEmail || ''),
            headcount: String(metadata.headcount || '1'),
            includeSelf: String(metadata.includeSelf || 'true'),
        };
        // Add optional guest/member info if present (already strings from client)
        if (metadata.guestNames)
            paymentMetadata.guestNames = String(metadata.guestNames);
        if (metadata.guestRelationships)
            paymentMetadata.guestRelationships = String(metadata.guestRelationships);
        if (metadata.memberIds)
            paymentMetadata.memberIds = String(metadata.memberIds);
        if (metadata.memberNames)
            paymentMetadata.memberNames = String(metadata.memberNames);
        // V07.54: League payment fields (for webhook to update correct member)
        if (metadata.memberId)
            paymentMetadata.memberId = String(metadata.memberId);
        if (metadata.slot)
            paymentMetadata.slot = String(metadata.slot);
        // GATE: If leagueId, clubId or organizerUserId is provided, we MUST have a connected account
        // This catches organizer-owned events that should have Stripe Connect set up
        // Platform-owned events (no routing params) are allowed to proceed without connected account
        if ((leagueId || clubId || organizerUserId) && !connectedAccountId) {
            console.error(`Payment rejected: No connected account. LeagueId: ${leagueId}, ClubId: ${clubId}, OrganizerUserId: ${organizerUserId}`);
            throw new functions.https.HttpsError('failed-precondition', 'Payment cannot be processed: The organizer has not connected their Stripe account. Please contact the organizer.');
        }
        // ALL connected account payments use DIRECT CHARGES
        if (connectedAccountId) {
            console.log(`Creating direct charge session on account ${connectedAccountId}`);
            const session = await stripe.checkout.sessions.create({
                mode: 'payment',
                customer_email: customerEmail,
                line_items: lineItems,
                success_url: successUrl,
                cancel_url: cancelUrl,
                // Session-level metadata (for checkout.session.completed webhook)
                metadata: paymentMetadata,
                payment_intent_data: {
                    application_fee_amount: platformFee, // Platform receives this as "Collected fee"
                    // Same metadata on PaymentIntent (for charge.succeeded webhook)
                    metadata: paymentMetadata,
                },
            }, {
                stripeAccount: connectedAccountId, // DIRECT CHARGE - charge created ON connected account
            });
            console.log(`✅ Created direct charge session ${session.id} on account ${connectedAccountId}`);
            return {
                sessionId: session.id,
                url: session.url,
                chargeModel: 'direct',
            };
        }
        // Platform-only payment (no connected account - e.g., SMS bundles, platform-owned events)
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            customer_email: customerEmail,
            line_items: lineItems,
            success_url: successUrl,
            cancel_url: cancelUrl,
            metadata: paymentMetadata,
            payment_intent_data: {
                metadata: paymentMetadata,
            },
        });
        console.log(`✅ Created platform session ${session.id}`);
        return {
            sessionId: session.id,
            url: session.url,
            chargeModel: 'platform',
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
// Supports TWO webhook secrets:
// - stripe.webhook_secret = Account webhook (platform events)
// - stripe.connect_webhook_secret = Connect webhook (connected account events)
// ============================================
exports.stripe_webhook = functions.https.onRequest(async (req, res) => {
    var _a, _b;
    const sig = req.headers['stripe-signature'];
    // Support multiple webhook secrets (Account + Connect webhooks use different secrets)
    const accountWebhookSecret = ((_a = functions.config().stripe) === null || _a === void 0 ? void 0 : _a.webhook_secret) || process.env.STRIPE_WEBHOOK_SECRET;
    const connectWebhookSecret = ((_b = functions.config().stripe) === null || _b === void 0 ? void 0 : _b.connect_webhook_secret) || process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
    if (!sig) {
        console.error('Missing stripe-signature header');
        res.status(400).send('Missing signature');
        return;
    }
    if (!accountWebhookSecret && !connectWebhookSecret) {
        console.error('No webhook secrets configured');
        res.status(500).send('Webhook not configured');
        return;
    }
    // 1. Verify signature - try both secrets (Account and Connect webhooks have different secrets)
    let event = null;
    const secrets = [accountWebhookSecret, connectWebhookSecret].filter(Boolean);
    for (const secret of secrets) {
        try {
            event = stripe.webhooks.constructEvent(req.rawBody, sig, secret);
            break; // Success - exit loop
        }
        catch (err) {
            // Continue to try next secret
        }
    }
    if (!event) {
        console.error('Webhook signature verification failed with all secrets');
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
            // Standing Meetup Subscription Events
            case 'invoice.paid': {
                const invoice = event.data.object;
                const connectedAccountId = event.account;
                if (connectedAccountId && invoice.subscription) {
                    console.log('Processing invoice.paid for subscription:', invoice.subscription);
                    await handleStandingMeetupInvoicePaid(invoice, connectedAccountId);
                }
                break;
            }
            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                const connectedAccountId = event.account;
                if (connectedAccountId && invoice.subscription) {
                    console.log('Processing invoice.payment_failed for subscription:', invoice.subscription);
                    await handleStandingMeetupPaymentFailed(invoice, connectedAccountId);
                }
                break;
            }
            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                const connectedAccountId = event.account;
                if (connectedAccountId) {
                    console.log('Processing customer.subscription.deleted:', subscription.id);
                    await handleStandingMeetupSubscriptionDeleted(subscription, connectedAccountId);
                }
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
    // Guest payments don't have odUserId - they're unauthenticated
    // Handle them separately to avoid early return
    if (paymentType === 'guest_session_payment') {
        console.log(`Processing guest_session_payment for session ${session.id}`);
        if (session.payment_status !== 'paid') {
            console.log(`Guest session ${session.id} completed but not paid (status: ${session.payment_status}), skipping`);
            return;
        }
        try {
            await handleGuestSessionPayment(session, metadata);
        }
        catch (error) {
            console.error('Error handling guest session payment:', error);
            throw error; // Re-throw to mark event as failed for retry
        }
        return;
    }
    // Member quick registration at the door (Phase 7)
    // Member scans check-in QR but isn't registered -> pays to register + auto check-in
    if (paymentType === 'member_session_registration') {
        console.log(`Processing member_session_registration for session ${session.id}, user ${metadata.odUserId}`);
        if (session.payment_status !== 'paid') {
            console.log(`Member registration session ${session.id} completed but not paid (status: ${session.payment_status}), skipping`);
            return;
        }
        try {
            await handleMemberSessionRegistration(session, metadata);
        }
        catch (error) {
            console.error('Error handling member session registration:', error);
            throw error; // Re-throw to mark event as failed for retry
        }
        return;
    }
    // For all other payment types, odUserId is required
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
        if (connectedAccountId && (clubId || metadata.organizerUserId) && paymentType !== 'sms_bundle') {
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
                    odClubId: clubId || '',
                    odUserId: odUserId,
                    organizerUserId: metadata.organizerUserId || '',
                    type: 'payment',
                    status: 'processing', // NOT completed yet - wait for charge.succeeded
                    referenceType: paymentType || 'unknown',
                    referenceId: metadata.referenceId || metadata.meetupId || metadata.tournamentId || metadata.leagueId || metadata.standingMeetupId || '',
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
        console.log(`🔀 Routing payment type: "${paymentType}" for session ${session.id}`);
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
            case 'standing_meetup_registration':
                await handleStandingMeetupRegistrationPayment(session, metadata);
                break;
            // Note: guest_session_payment is handled before this switch (no odUserId required)
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    const db = admin.firestore();
    // Guard: check this is a Connect charge
    const connectedAccountId = event.account;
    if (!connectedAccountId) {
        // This is a platform charge (like SMS bundles) - no Finance ledger needed
        console.log('Platform charge (no connected account), skipping Finance ledger');
        return;
    }
    const paymentIntentId = charge.payment_intent;
    console.log(`Processing charge.succeeded for PI ${paymentIntentId} on account ${connectedAccountId}, chargeId=${charge.id}`);
    // Find the processing transaction - try by paymentIntentId first
    let txSnap = await db.collection('transactions')
        .where('stripe.paymentIntentId', '==', paymentIntentId)
        .where('type', '==', 'payment')
        .limit(1)
        .get();
    console.log(`charge.succeeded: Query by PI found ${txSnap.size} transactions`);
    // Fallback: try by chargeId if PI lookup failed (in case checkout stored chargeId differently)
    if (txSnap.empty && charge.id) {
        txSnap = await db.collection('transactions')
            .where('stripe.chargeId', '==', charge.id)
            .where('type', '==', 'payment')
            .limit(1)
            .get();
        console.log(`charge.succeeded: Fallback query by chargeId found ${txSnap.size} transactions`);
    }
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
        console.log(`charge.succeeded: Found transaction ${txDoc.id} with status=${existingTx.status}, PI=${(_b = existingTx.stripe) === null || _b === void 0 ? void 0 : _b.paymentIntentId}`);
        // Verify accountId matches (detect webhook routing issues)
        if (((_c = existingTx.stripe) === null || _c === void 0 ? void 0 : _c.accountId) && existingTx.stripe.accountId !== connectedAccountId) {
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
            'stripe.paymentMethodType': (_d = charge.payment_method_details) === null || _d === void 0 ? void 0 : _d.type,
        });
        console.log(`✅ Completed Finance transaction ${txDoc.id}: platformFee=${platformFee}, totalFees=${totalFees}, net=${netAmount}`);
        // Send receipt email (non-blocking)
        const metadata = charge.metadata || {};
        if (metadata.type && metadata.type !== 'sms_bundle') {
            let userEmail = metadata.payerEmail;
            if (!userEmail && metadata.odUserId) {
                try {
                    const userDoc = await db.collection('users').doc(metadata.odUserId).get();
                    userEmail = (_e = userDoc.data()) === null || _e === void 0 ? void 0 : _e.email;
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
                    cardLast4: ((_g = (_f = charge.payment_method_details) === null || _f === void 0 ? void 0 : _f.card) === null || _g === void 0 ? void 0 : _g.last4) || undefined,
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
        if (metadata.clubId || metadata.organizerUserId) {
            const txRef = db.collection('transactions').doc();
            await txRef.set({
                id: txRef.id,
                schemaVersion: 1,
                odClubId: metadata.clubId || '',
                odUserId: metadata.odUserId || '',
                organizerUserId: metadata.organizerUserId || '',
                type: 'payment',
                status: 'completed', // Already completed since charge succeeded
                referenceType: metadata.type || 'unknown',
                referenceId: metadata.referenceId || metadata.meetupId || metadata.tournamentId || metadata.leagueId || metadata.standingMeetupId || '',
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
                    paymentMethodType: (_h = charge.payment_method_details) === null || _h === void 0 ? void 0 : _h.type,
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
                        userEmail = (_j = userDoc.data()) === null || _j === void 0 ? void 0 : _j.email;
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
                        cardLast4: ((_l = (_k = charge.payment_method_details) === null || _k === void 0 ? void 0 : _k.card) === null || _l === void 0 ? void 0 : _l.last4) || undefined,
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
                organizerUserId: original.organizerUserId || '',
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
// LEAGUE PAYMENT HANDLER (V07.53)
// ============================================
async function handleLeaguePayment(session, metadata) {
    var _a, _b;
    console.log(`🏆 handleLeaguePayment called with metadata:`, JSON.stringify(metadata));
    const { leagueId, memberId } = metadata;
    const slot = metadata.slot || 'primary'; // Default to 'primary' if omitted
    // Validate required fields - log and return if missing (never throw)
    if (!leagueId || !memberId) {
        console.error('League payment missing required metadata:', { leagueId, memberId, slot });
        return;
    }
    const db = admin.firestore();
    const memberRef = db.collection('leagues').doc(leagueId).collection('members').doc(memberId);
    const memberDoc = await memberRef.get();
    if (!memberDoc.exists) {
        console.error(`League member not found: ${leagueId}/members/${memberId}`);
        return;
    }
    const now = Date.now();
    const member = memberDoc.data();
    // Update correct slot (defaults to 'primary')
    // NOTE: Firestore will create partnerPayment map if it doesn't exist
    // UI should only show partner payment status when entryFeeType === 'per_player'
    try {
        if (slot === 'partner') {
            // Use amountDue from member doc (set at join time), NOT session.amount_total
            const amountDue = ((_a = member === null || member === void 0 ? void 0 : member.partnerPayment) === null || _a === void 0 ? void 0 : _a.amountDue) || 0;
            await memberRef.update({
                'partnerPayment.status': 'paid',
                'partnerPayment.method': 'stripe',
                'partnerPayment.amountPaid': amountDue, // Match the entry fee, not Stripe total
                'partnerPayment.totalCharged': session.amount_total, // Audit: actual charge incl fees
                'partnerPayment.paidAt': now,
                'partnerPayment.stripeSessionId': session.id,
                updatedAt: now,
            });
        }
        else {
            // Use amountDue from member doc (set at join time), NOT session.amount_total
            const amountDue = ((_b = member === null || member === void 0 ? void 0 : member.payment) === null || _b === void 0 ? void 0 : _b.amountDue) || 0;
            // Primary - write BOTH nested AND flat for backwards compat
            await memberRef.update({
                'payment.status': 'paid',
                'payment.method': 'stripe',
                'payment.amountPaid': amountDue, // Match the entry fee, not Stripe total
                'payment.totalCharged': session.amount_total, // Audit: actual charge incl fees
                'payment.paidAt': now,
                'payment.stripeSessionId': session.id,
                // Flat format (backwards compat)
                paymentStatus: 'paid',
                amountPaid: amountDue,
                paidAt: now,
                stripeSessionId: session.id,
                updatedAt: now,
            });
        }
        console.log(`✅ League payment confirmed: league=${leagueId}, member=${memberId}, slot=${slot}`);
    }
    catch (updateError) {
        console.error(`❌ Failed to update league member payment status:`, updateError);
        throw updateError;
    }
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
// STANDING MEETUP REGISTRATION PAYMENT HANDLER (V07.57)
// ============================================
/**
 * Handle standing meetup registration payment (Stripe checkout success)
 *
 * CRITICAL: For Stripe payments, the registration doc does NOT exist yet!
 * We CREATE it here from the metadata, not update it.
 *
 * Hybrid Model:
 * - season_pass: Add to ALL future sessions
 * - pick_and_pay: Add to SELECTED sessions only
 */
async function handleStandingMeetupRegistrationPayment(session, metadata) {
    var _a;
    const { standingMeetupId, odUserId, registrationType, selectedSessionIds: selectedSessionIdsJson, clubId, userName, userEmail, amount, sessionCount, maxPlayers, } = metadata;
    // Validate required fields
    if (!standingMeetupId || !odUserId) {
        console.error('Standing meetup registration missing required metadata:', {
            standingMeetupId,
            odUserId,
            registrationType,
        });
        return;
    }
    const db = admin.firestore();
    const now = Date.now();
    // Build deterministic registration ID
    const registrationId = `${standingMeetupId}_${odUserId}`;
    // Parse selectedSessionIds if present
    const selectedSessionIds = selectedSessionIdsJson ? JSON.parse(selectedSessionIdsJson) : undefined;
    try {
        // Idempotency check: if registration already exists and is paid, skip
        const regRef = db.collection('standingMeetupRegistrations').doc(registrationId);
        const existingReg = await regRef.get();
        if (existingReg.exists && ((_a = existingReg.data()) === null || _a === void 0 ? void 0 : _a.paymentStatus) === 'paid') {
            console.log(`Registration ${registrationId} already paid, skipping (idempotency)`);
            return;
        }
        // Get meetup for title and maxPlayers validation
        const meetupRef = db.collection('standingMeetups').doc(standingMeetupId);
        const meetupSnap = await meetupRef.get();
        if (!meetupSnap.exists) {
            console.error(`Standing meetup not found: ${standingMeetupId}`);
            return;
        }
        const meetup = meetupSnap.data();
        const meetupMaxPlayers = parseInt(maxPlayers || '0') || meetup.maxPlayers || 20;
        // CREATE registration doc (Stripe path - doc doesn't exist yet!)
        const registration = Object.assign(Object.assign({ id: registrationId, standingMeetupId, clubId: clubId || meetup.clubId, odUserId, userName: userName || 'Player', userEmail: userEmail || '', registrationType: registrationType || 'season_pass' }, (selectedSessionIds ? { selectedSessionIds } : {})), { sessionCount: parseInt(sessionCount || '0'), paymentStatus: 'paid', paymentMethod: 'stripe', amount: parseInt(amount || '0'), currency: (session.currency || 'nzd').toLowerCase(), paidAt: now, stripeCheckoutSessionId: session.id, stripePaymentIntentId: session.payment_intent, status: 'active', createdAt: now, updatedAt: now });
        // Use transaction to create registration and increment subscriber count
        await db.runTransaction(async (transaction) => {
            transaction.set(regRef, registration);
            transaction.update(meetupRef, {
                subscriberCount: admin.firestore.FieldValue.increment(1),
                updatedAt: now,
            });
        });
        console.log(`✅ Created registration ${registrationId} from Stripe webhook`);
        // Add player to occurrences based on registration type
        if (registrationType === 'pick_and_pay' && (selectedSessionIds === null || selectedSessionIds === void 0 ? void 0 : selectedSessionIds.length) > 0) {
            // Pick-and-Pay: Add to selected sessions only
            await addPlayerToSelectedOccurrences(standingMeetupId, odUserId, userName || 'Player', selectedSessionIds, meetupMaxPlayers);
        }
        else {
            // Season Pass: Add to all future sessions
            await addPlayerToAllFutureOccurrences(standingMeetupId, odUserId, userName || 'Player', meetupMaxPlayers);
        }
        console.log(`✅ Standing meetup registration confirmed: ${registrationId}, meetup=${meetup.title || standingMeetupId}, type=${registrationType}`);
    }
    catch (error) {
        console.error('Error processing standing meetup registration payment:', error);
        throw error;
    }
}
/**
 * Add a registered player to all future occurrences of a standing meetup
 */
/**
 * Add player to ALL future occurrences with available capacity (for Season Pass)
 */
async function addPlayerToAllFutureOccurrences(standingMeetupId, userId, userName, maxPlayers) {
    const db = admin.firestore();
    const now = Date.now();
    const eightWeeksLater = now + 8 * 7 * 24 * 60 * 60 * 1000;
    const occurrencesSnap = await db
        .collection('standingMeetups')
        .doc(standingMeetupId)
        .collection('occurrences')
        .where('startAt', '>=', now)
        .where('startAt', '<', eightWeeksLater)
        .where('status', '==', 'scheduled')
        .get();
    if (occurrencesSnap.empty) {
        console.log(`No future occurrences found for meetup ${standingMeetupId}`);
        return { addedTo: [], skippedFull: [] };
    }
    const addedTo = [];
    const skippedFull = [];
    const batch = db.batch();
    for (const occDoc of occurrencesSnap.docs) {
        const occData = occDoc.data();
        // Check capacity
        const spotsLeft = maxPlayers - (occData.expectedCount || 0);
        if (spotsLeft <= 0) {
            skippedFull.push(occDoc.id);
            continue;
        }
        const participantRef = occDoc.ref.collection('participants').doc(userId);
        const participantSnap = await participantRef.get();
        if (!participantSnap.exists) {
            batch.set(participantRef, {
                userName,
                status: 'expected',
                creditIssued: false,
                updatedAt: now,
            });
            batch.update(occDoc.ref, {
                expectedCount: admin.firestore.FieldValue.increment(1),
                updatedAt: now,
            });
            const indexRef = db
                .collection('meetupOccurrencesIndex')
                .doc(`${standingMeetupId}_${occDoc.id}`);
            batch.update(indexRef, {
                expectedCount: admin.firestore.FieldValue.increment(1),
                spotsLeft: admin.firestore.FieldValue.increment(-1),
                updatedAt: now,
            });
            addedTo.push(occDoc.id);
        }
    }
    await batch.commit();
    console.log(`Season Pass: Added ${userName} to ${addedTo.length} occurrences, skipped ${skippedFull.length} full`);
    return { addedTo, skippedFull };
}
/**
 * Add player to SELECTED occurrences only (for Pick-and-Pay)
 */
async function addPlayerToSelectedOccurrences(standingMeetupId, userId, userName, sessionIds, maxPlayers) {
    const db = admin.firestore();
    const now = Date.now();
    if (!sessionIds || sessionIds.length === 0) {
        console.warn('addPlayerToSelectedOccurrences: No sessions selected');
        return { addedTo: [], failedFull: [] };
    }
    const addedTo = [];
    const failedFull = [];
    const batch = db.batch();
    for (const dateId of sessionIds) {
        const occRef = db
            .collection('standingMeetups')
            .doc(standingMeetupId)
            .collection('occurrences')
            .doc(dateId);
        const occSnap = await occRef.get();
        if (!occSnap.exists) {
            console.warn(`Occurrence ${dateId} not found, skipping`);
            continue;
        }
        const occData = occSnap.data();
        // Check capacity
        const spotsLeft = maxPlayers - (occData.expectedCount || 0);
        if (spotsLeft <= 0) {
            failedFull.push(dateId);
            continue;
        }
        const participantRef = occRef.collection('participants').doc(userId);
        const participantSnap = await participantRef.get();
        if (!participantSnap.exists) {
            batch.set(participantRef, {
                userName,
                status: 'expected',
                creditIssued: false,
                updatedAt: now,
            });
            batch.update(occRef, {
                expectedCount: admin.firestore.FieldValue.increment(1),
                updatedAt: now,
            });
            const indexRef = db
                .collection('meetupOccurrencesIndex')
                .doc(`${standingMeetupId}_${dateId}`);
            batch.update(indexRef, {
                expectedCount: admin.firestore.FieldValue.increment(1),
                spotsLeft: admin.firestore.FieldValue.increment(-1),
                updatedAt: now,
            });
            addedTo.push(dateId);
        }
    }
    await batch.commit();
    console.log(`Pick-and-Pay: Added ${userName} to ${addedTo.length} selected occurrences`);
    return { addedTo, failedFull };
}
// ============================================
// GUEST SESSION PAYMENT HANDLER
// ============================================
/**
 * Handle guest_session_payment checkout completion
 * Creates OccurrenceGuest document and updates occurrence counters
 */
async function handleGuestSessionPayment(session, metadata) {
    var _a;
    const { standingMeetupId, occurrenceId, guestName, guestEmail } = metadata;
    // Validate required fields
    if (!standingMeetupId || !occurrenceId || !guestName || !guestEmail) {
        console.error('Guest session payment missing required metadata:', {
            standingMeetupId,
            occurrenceId,
            guestName,
            guestEmail,
        });
        return;
    }
    const db = admin.firestore();
    const now = Date.now();
    try {
        // Get references
        const occurrenceRef = db
            .collection('standingMeetups')
            .doc(standingMeetupId)
            .collection('occurrences')
            .doc(occurrenceId);
        // Check if occurrence exists
        const occurrenceSnap = await occurrenceRef.get();
        if (!occurrenceSnap.exists) {
            console.error(`Guest payment: Occurrence ${occurrenceId} not found for meetup ${standingMeetupId}`);
            // Don't throw - webhook should succeed to avoid retries for data that won't exist
            return;
        }
        // Idempotency check: Look for existing guest with same checkout session
        const existingGuestSnap = await occurrenceRef
            .collection('guests')
            .where('stripeCheckoutSessionId', '==', session.id)
            .limit(1)
            .get();
        if (!existingGuestSnap.empty) {
            console.log(`Guest already exists for session ${session.id}, skipping (idempotency)`);
            return;
        }
        // Use a transaction to atomically create guest and update occurrence counters
        await db.runTransaction(async (transaction) => {
            // Re-read occurrence in transaction
            const occDoc = await transaction.get(occurrenceRef);
            if (!occDoc.exists) {
                throw new Error('Occurrence not found in transaction');
            }
            // Create the guest document
            const guestRef = occurrenceRef.collection('guests').doc();
            const guestData = {
                id: guestRef.id,
                name: guestName,
                email: guestEmail,
                amount: session.amount_total || 0,
                paymentMethod: 'stripe',
                stripeCheckoutSessionId: session.id,
                stripePaymentIntentId: session.payment_intent || null,
                createdAt: now,
                createdBy: 'stripe_webhook',
            };
            transaction.set(guestRef, guestData);
            // Atomically increment guestCount and guestRevenue on the occurrence
            // FieldValue.increment handles the case where fields don't exist (treats as 0)
            transaction.update(occurrenceRef, {
                guestCount: admin.firestore.FieldValue.increment(1),
                guestRevenue: admin.firestore.FieldValue.increment(session.amount_total || 0),
                updatedAt: now,
            });
        });
        console.log(`✅ Guest payment processed: ${guestName} (${guestEmail}) for occurrence ${occurrenceId}`);
        // Send receipt email to guest (best-effort, never breaks webhook)
        try {
            // Fetch meetup title for the email
            const meetupDoc = await db.collection('standingMeetups').doc(standingMeetupId).get();
            const meetupTitle = meetupDoc.exists ? (((_a = meetupDoc.data()) === null || _a === void 0 ? void 0 : _a.title) || 'Pickleball Session') : 'Pickleball Session';
            const amountCents = session.amount_total || 0;
            const amountFormatted = `$${(amountCents / 100).toFixed(2)}`;
            const currency = (session.currency || 'nzd').toUpperCase();
            const subject = `Payment Receipt - ${meetupTitle}`;
            const textBody = [
                `Hi ${guestName},`,
                '',
                `Thank you for your payment!`,
                '',
                `Event: ${meetupTitle}`,
                `Session: ${occurrenceId}`,
                `Amount: ${amountFormatted} ${currency}`,
                `Payment method: Card`,
                '',
                `Want to track your sessions and get notified about upcoming events?`,
                `Create your free account: https://pickleballdirector.co.nz`,
                '',
                `Thanks for playing!`,
                `Pickleball Director`,
            ].join('\n');
            const htmlBody = `
<!doctype html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#030712;color:#fff;border-radius:14px;padding:24px;">
      <div style="font-size:20px;font-weight:700;">Pickleball Director</div>
      <div style="margin-top:6px;color:#84cc16;font-size:14px;">Payment Receipt</div>
    </div>
    <div style="background:#fff;border-radius:14px;margin-top:14px;padding:24px;box-shadow:0 2px 10px rgba(0,0,0,0.05);">
      <div style="font-size:16px;color:#111;">Hi ${guestName},</div>
      <div style="margin-top:12px;color:#374151;">Thank you for your payment!</div>
      <div style="margin-top:18px;padding:16px;background:#f9fafb;border-radius:10px;">
        <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Event</div>
        <div style="font-size:16px;font-weight:600;margin-top:4px;">${meetupTitle}</div>
        <div style="margin-top:12px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Session</div>
        <div style="font-size:14px;font-weight:500;margin-top:4px;">${occurrenceId}</div>
        <div style="margin-top:12px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Amount Paid</div>
        <div style="font-size:20px;font-weight:700;color:#84cc16;margin-top:4px;">${amountFormatted} ${currency}</div>
        <div style="margin-top:12px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Payment Method</div>
        <div style="font-size:14px;margin-top:4px;">Card</div>
      </div>
      <div style="margin-top:24px;padding:16px;background:#030712;border-radius:10px;text-align:center;">
        <div style="color:#d1d5db;font-size:14px;">Want to track your sessions?</div>
        <a href="https://pickleballdirector.co.nz" style="display:inline-block;margin-top:10px;padding:10px 24px;background:#84cc16;color:#030712;font-weight:700;text-decoration:none;border-radius:8px;font-size:14px;">Create Free Account</a>
      </div>
    </div>
    <div style="text-align:center;margin-top:16px;color:#9ca3af;font-size:12px;">
      Pickleball Director &mdash; pickleballdirector.co.nz
    </div>
  </div>
</body>
</html>`;
            const emailResult = await (0, comms_1.sendEmail)(guestEmail, subject, textBody, htmlBody);
            if (emailResult.success) {
                console.log(`Receipt email sent to guest ${guestEmail} for session ${session.id}`);
            }
            else {
                console.warn(`Receipt email failed for guest ${guestEmail}: ${emailResult.error}`);
            }
        }
        catch (emailError) {
            // Never let email failure break the webhook
            console.warn('Guest receipt email failed (non-fatal):', emailError);
        }
    }
    catch (error) {
        console.error('Error handling guest session payment:', error);
        throw error; // Re-throw to mark webhook as failed for retry
    }
}
// ============================================
// MEMBER SESSION REGISTRATION HANDLER (Phase 7)
// ============================================
/**
 * Handle member_session_registration checkout completion
 * Creates OccurrenceParticipant document with checked_in status
 * This is for when a logged-in member scans check-in QR but wasn't registered
 */
async function handleMemberSessionRegistration(session, metadata) {
    var _a;
    const { standingMeetupId, occurrenceId, odUserId, memberName, memberEmail } = metadata;
    // Validate required fields
    if (!standingMeetupId || !occurrenceId || !odUserId) {
        console.error('Member session registration missing required metadata:', {
            standingMeetupId,
            occurrenceId,
            odUserId,
        });
        return;
    }
    const db = admin.firestore();
    const now = Date.now();
    try {
        // Get references
        const occurrenceRef = db
            .collection('standingMeetups')
            .doc(standingMeetupId)
            .collection('occurrences')
            .doc(occurrenceId);
        const participantRef = occurrenceRef.collection('participants').doc(odUserId);
        // Check if occurrence exists
        const occurrenceSnap = await occurrenceRef.get();
        if (!occurrenceSnap.exists) {
            console.error(`Member registration: Occurrence ${occurrenceId} not found for meetup ${standingMeetupId}`);
            return;
        }
        // Idempotency check: If participant already exists, skip
        const existingParticipantSnap = await participantRef.get();
        if (existingParticipantSnap.exists) {
            console.log(`Participant ${odUserId} already exists for occurrence ${occurrenceId}, skipping (idempotency)`);
            return;
        }
        // Use a transaction to atomically create participant and update counters
        await db.runTransaction(async (transaction) => {
            // Re-read occurrence in transaction
            const occDoc = await transaction.get(occurrenceRef);
            if (!occDoc.exists) {
                throw new Error('Occurrence not found in transaction');
            }
            // Create the participant document with checked_in status
            // The participant is paying at the door, so they're physically present
            const participantData = {
                odUserId,
                userName: memberName || 'Member', // Must be userName to match UI expectations
                email: memberEmail || null,
                status: 'checked_in', // Auto-checked in since they're at the door paying
                checkedInAt: now,
                checkedInBy: 'stripe_webhook', // Auto check-in on payment
                registeredAt: now,
                paymentMethod: 'stripe',
                paymentStatus: 'paid',
                stripeCheckoutSessionId: session.id,
                stripePaymentIntentId: session.payment_intent || null,
                amountPaid: session.amount_total || 0,
                createdAt: now,
                updatedAt: now,
            };
            transaction.set(participantRef, participantData);
            // Atomically increment both expected count AND checked-in count
            // Since they're registering AND checking in at the same time
            // We only increment checkedInCount (not expectedCount) because:
            // - expectedCount is for "waiting to arrive"
            // - checkedInCount is for "physically arrived"
            // They go straight to checkedInCount since they're already at the door
            transaction.update(occurrenceRef, {
                checkedInCount: admin.firestore.FieldValue.increment(1),
                updatedAt: now,
            });
        });
        console.log(`✅ Member registration + check-in processed: ${memberName || odUserId} for occurrence ${occurrenceId}`);
        // Send confirmation email to member (best-effort, never breaks webhook)
        if (memberEmail) {
            try {
                // Fetch meetup title for the email
                const meetupDoc = await db.collection('standingMeetups').doc(standingMeetupId).get();
                const meetupTitle = meetupDoc.exists ? (((_a = meetupDoc.data()) === null || _a === void 0 ? void 0 : _a.title) || 'Pickleball Session') : 'Pickleball Session';
                const amountCents = session.amount_total || 0;
                const amountFormatted = `$${(amountCents / 100).toFixed(2)}`;
                const currency = (session.currency || 'nzd').toUpperCase();
                const displayName = memberName || 'there';
                const subject = `Registered & Checked In - ${meetupTitle}`;
                const textBody = [
                    `Hi ${displayName},`,
                    '',
                    `You're registered and checked in!`,
                    '',
                    `Event: ${meetupTitle}`,
                    `Session: ${occurrenceId}`,
                    `Amount: ${amountFormatted} ${currency}`,
                    `Status: Checked In`,
                    '',
                    `Have a great session!`,
                    `Pickleball Director`,
                ].join('\n');
                const htmlBody = `
<!doctype html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#030712;color:#fff;border-radius:14px;padding:24px;">
      <div style="font-size:20px;font-weight:700;">Pickleball Director</div>
      <div style="margin-top:6px;color:#84cc16;font-size:14px;">Registration Confirmation</div>
    </div>
    <div style="background:#fff;border-radius:14px;margin-top:14px;padding:24px;box-shadow:0 2px 10px rgba(0,0,0,0.05);">
      <div style="font-size:16px;color:#111;">Hi ${displayName},</div>
      <div style="margin-top:12px;color:#374151;">You're registered and checked in!</div>
      <div style="margin-top:18px;padding:16px;background:#f9fafb;border-radius:10px;">
        <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Event</div>
        <div style="font-size:16px;font-weight:600;margin-top:4px;">${meetupTitle}</div>
        <div style="margin-top:12px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Session</div>
        <div style="font-size:14px;font-weight:500;margin-top:4px;">${occurrenceId}</div>
        <div style="margin-top:12px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Amount Paid</div>
        <div style="font-size:20px;font-weight:700;color:#84cc16;margin-top:4px;">${amountFormatted} ${currency}</div>
        <div style="margin-top:12px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Status</div>
        <div style="display:inline-block;margin-top:4px;padding:4px 12px;background:#dcfce7;color:#166534;font-weight:600;border-radius:20px;font-size:13px;">Checked In</div>
      </div>
      <div style="margin-top:18px;color:#6b7280;font-size:13px;">Have a great session!</div>
    </div>
    <div style="text-align:center;margin-top:16px;color:#9ca3af;font-size:12px;">
      Pickleball Director &mdash; pickleballdirector.co.nz
    </div>
  </div>
</body>
</html>`;
                const emailResult = await (0, comms_1.sendEmail)(memberEmail, subject, textBody, htmlBody);
                if (emailResult.success) {
                    console.log(`Confirmation email sent to member ${memberEmail} for session ${session.id}`);
                }
                else {
                    console.warn(`Confirmation email failed for member ${memberEmail}: ${emailResult.error}`);
                }
            }
            catch (emailError) {
                // Never let email failure break the webhook
                console.warn('Member confirmation email failed (non-fatal):', emailError);
            }
        }
    }
    catch (error) {
        console.error('Error handling member session registration:', error);
        throw error; // Re-throw to mark webhook as failed for retry
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
        // Validate refund amount - default to NET amount (what organizer actually received)
        // clubNetAmount is the TRUE net from Stripe's balance_transaction (set by charge.succeeded webhook)
        const netAmount = tx.clubNetAmount || tx.organizerNetAmount || (tx.amount - (tx.totalFeeAmount || tx.platformFeeAmount || 0));
        console.log(`Refund calculation: original=${tx.amount}, totalFees=${tx.totalFeeAmount}, platformFee=${tx.platformFeeAmount}, net=${netAmount}`);
        const refundAmount = amount || netAmount; // Refund net amount if not specified
        if (refundAmount <= 0) {
            throw new functions.https.HttpsError('invalid-argument', 'Refund amount must be positive');
        }
        if (refundAmount > netAmount) {
            throw new functions.https.HttpsError('invalid-argument', `Refund amount (${refundAmount}) cannot exceed net amount (${netAmount})`);
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
            organizerUserId: tx.organizerUserId || '',
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
// ============================================
// STANDING MEETUP GUEST CHECKOUT
// ============================================
// Fee constants for guest checkout calculations
// NZ Stripe standard rate: 2.9% + $0.30
// Note: Link/international cards may be higher, but this covers most domestic cards
const GUEST_STRIPE_FEE_PERCENT = 0.029;
const GUEST_STRIPE_FIXED_FEE_CENTS = 30;
const GUEST_PLATFORM_FEE_PERCENT = 0.015; // 1.5% platform fee
/**
 * Create a Checkout Session for a guest (walk-in) at a standing meetup.
 * The guest pays by card and the payment goes to the organizer's connected account.
 *
 * This function does NOT require authentication - guests don't have accounts.
 * Security is provided by:
 * - The meetup must be active
 * - The occurrence must exist and not be closed
 * - Card payments must be enabled for the meetup
 *
 * @region australia-southeast1
 */
exports.standingMeetup_createGuestCheckoutSession = functions
    .region('australia-southeast1')
    .https.onCall(async (data) => {
    var _a;
    const { standingMeetupId, occurrenceId, name, email, returnUrl } = data;
    // Input validation
    if (!standingMeetupId) {
        throw new functions.https.HttpsError('invalid-argument', 'standingMeetupId is required');
    }
    if (!occurrenceId) {
        throw new functions.https.HttpsError('invalid-argument', 'occurrenceId is required');
    }
    if (!name || name.trim().length === 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Guest name is required');
    }
    if (!email || !email.includes('@')) {
        throw new functions.https.HttpsError('invalid-argument', 'Valid email is required');
    }
    if (!returnUrl) {
        throw new functions.https.HttpsError('invalid-argument', 'returnUrl is required');
    }
    const db = admin.firestore();
    // Get the standing meetup
    const meetupDoc = await db.collection('standingMeetups').doc(standingMeetupId).get();
    if (!meetupDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Standing meetup not found');
    }
    const meetup = meetupDoc.data();
    // Verify meetup is active
    if (meetup.status !== 'active') {
        throw new functions.https.HttpsError('failed-precondition', 'Meetup is not active');
    }
    // Verify card payments are enabled
    if (!((_a = meetup.paymentMethods) === null || _a === void 0 ? void 0 : _a.acceptCardPayments)) {
        throw new functions.https.HttpsError('failed-precondition', 'Card payments are not enabled for this meetup');
    }
    // Verify organizer has Stripe connected
    if (!meetup.organizerStripeAccountId) {
        throw new functions.https.HttpsError('failed-precondition', 'Organizer has not connected Stripe');
    }
    // Get the occurrence to verify it exists and is not closed
    const occurrenceDoc = await db
        .collection('standingMeetups')
        .doc(standingMeetupId)
        .collection('occurrences')
        .doc(occurrenceId)
        .get();
    if (!occurrenceDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Occurrence not found');
    }
    const occurrence = occurrenceDoc.data();
    // Check occurrence is not cancelled or closed
    if (occurrence.status === 'cancelled') {
        throw new functions.https.HttpsError('failed-precondition', 'This session has been cancelled');
    }
    if (occurrence.closedAt) {
        throw new functions.https.HttpsError('failed-precondition', 'This session has been closed');
    }
    // Get the per-session amount
    const baseAmount = meetup.billing.perSessionAmount || meetup.billing.amount;
    if (!baseAmount || baseAmount <= 0) {
        throw new functions.https.HttpsError('failed-precondition', 'Invalid session price');
    }
    // Calculate the amount to charge (gross up if player pays fees)
    let chargedAmount = baseAmount;
    if (meetup.billing.feesPaidBy === 'player') {
        // Gross up: amount / (1 - stripe_fee - platform_fee)
        const divisor = 1 - GUEST_STRIPE_FEE_PERCENT - GUEST_PLATFORM_FEE_PERCENT;
        chargedAmount = Math.ceil((baseAmount + GUEST_STRIPE_FIXED_FEE_CENTS) / divisor);
    }
    // Calculate platform fee (1.5% of charged amount)
    const platformFee = Math.round(chargedAmount * GUEST_PLATFORM_FEE_PERCENT);
    // Build success and cancel URLs
    const successUrl = `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}success=true`;
    const cancelUrl = returnUrl;
    // Create Stripe Checkout Session
    const sessionMetadata = {
        type: 'guest_session_payment',
        standingMeetupId,
        occurrenceId,
        guestName: name.trim(),
        guestEmail: email.trim().toLowerCase(),
        clubId: meetup.clubId || '',
        organizerUserId: meetup.createdByUserId || '',
        payerName: name.trim(),
        payerEmail: email.trim().toLowerCase(),
        eventName: meetup.title || '',
    };
    try {
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            customer_email: email.trim().toLowerCase(),
            line_items: [
                {
                    price_data: {
                        currency: meetup.billing.currency,
                        product_data: {
                            name: meetup.title,
                            description: `Guest session - ${meetup.clubName}`,
                        },
                        unit_amount: chargedAmount,
                    },
                    quantity: 1,
                },
            ],
            success_url: successUrl,
            cancel_url: cancelUrl,
            metadata: sessionMetadata,
            payment_intent_data: {
                application_fee_amount: platformFee,
                metadata: sessionMetadata,
            },
        }, {
            stripeAccount: meetup.organizerStripeAccountId,
        });
        console.log(`✅ Created guest checkout session ${session.id} for ${name} at ${meetup.title}`);
        return {
            checkoutUrl: session.url,
            checkoutSessionId: session.id,
        };
    }
    catch (error) {
        console.error('Failed to create guest checkout session:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Failed to create checkout session');
    }
});
// ============================================
// STANDING MEETUP QUICK REGISTER (Member at door)
// ============================================
/**
 * Create a Checkout Session for a member to register and pay for a session at the door.
 * This is for the scenario where a logged-in member scans the check-in QR but hasn't
 * registered for the session. They can pay and register in one step.
 *
 * Key differences from guest checkout:
 * - Requires authentication (member must be logged in)
 * - Uses member's profile data (name, email)
 * - Creates OccurrenceParticipant (not OccurrenceGuest)
 * - Auto-checks-in on payment success (they're physically at the door)
 *
 * @region australia-southeast1
 */
exports.standingMeetup_createQuickRegisterCheckoutSession = functions
    .region('australia-southeast1')
    .https.onCall(async (data, context) => {
    var _a;
    // Require authentication - this is for members only
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in to register');
    }
    const userId = context.auth.uid;
    const { standingMeetupId, occurrenceId, successUrl, cancelUrl } = data;
    // Input validation
    if (!standingMeetupId) {
        throw new functions.https.HttpsError('invalid-argument', 'standingMeetupId is required');
    }
    if (!occurrenceId) {
        throw new functions.https.HttpsError('invalid-argument', 'occurrenceId is required');
    }
    if (!successUrl || !cancelUrl) {
        throw new functions.https.HttpsError('invalid-argument', 'successUrl and cancelUrl are required');
    }
    const db = admin.firestore();
    // Get user profile
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User profile not found');
    }
    const userProfile = userDoc.data();
    if (!userProfile.email) {
        throw new functions.https.HttpsError('failed-precondition', 'User email is required');
    }
    // Get the standing meetup
    const meetupDoc = await db.collection('standingMeetups').doc(standingMeetupId).get();
    if (!meetupDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Standing meetup not found');
    }
    const meetup = meetupDoc.data();
    // Verify meetup is active
    if (meetup.status !== 'active') {
        throw new functions.https.HttpsError('failed-precondition', 'Meetup is not active');
    }
    // Verify card payments are enabled
    if (!((_a = meetup.paymentMethods) === null || _a === void 0 ? void 0 : _a.acceptCardPayments)) {
        throw new functions.https.HttpsError('failed-precondition', 'Card payments are not enabled for this meetup');
    }
    // Verify organizer has Stripe connected
    if (!meetup.organizerStripeAccountId) {
        throw new functions.https.HttpsError('failed-precondition', 'Organizer has not connected Stripe');
    }
    // Get the occurrence
    const occurrenceDoc = await db
        .collection('standingMeetups')
        .doc(standingMeetupId)
        .collection('occurrences')
        .doc(occurrenceId)
        .get();
    if (!occurrenceDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Occurrence not found');
    }
    const occurrence = occurrenceDoc.data();
    // Check occurrence is not cancelled or closed
    if (occurrence.status === 'cancelled') {
        throw new functions.https.HttpsError('failed-precondition', 'This session has been cancelled');
    }
    if (occurrence.closedAt) {
        throw new functions.https.HttpsError('failed-precondition', 'This session has been closed');
    }
    // Check if user is already registered
    const participantDoc = await db
        .collection('standingMeetups')
        .doc(standingMeetupId)
        .collection('occurrences')
        .doc(occurrenceId)
        .collection('participants')
        .doc(userId)
        .get();
    if (participantDoc.exists) {
        throw new functions.https.HttpsError('already-exists', 'You are already registered for this session');
    }
    // Get the per-session amount
    const baseAmount = meetup.billing.perSessionAmount || meetup.billing.amount;
    if (!baseAmount || baseAmount <= 0) {
        throw new functions.https.HttpsError('failed-precondition', 'Invalid session price');
    }
    // Calculate the amount to charge (gross up if player pays fees)
    let chargedAmount = baseAmount;
    if (meetup.billing.feesPaidBy === 'player') {
        // Gross up: amount / (1 - stripe_fee - platform_fee)
        const divisor = 1 - GUEST_STRIPE_FEE_PERCENT - GUEST_PLATFORM_FEE_PERCENT;
        chargedAmount = Math.ceil((baseAmount + GUEST_STRIPE_FIXED_FEE_CENTS) / divisor);
    }
    // Calculate platform fee (1.5% of charged amount)
    const platformFee = Math.round(chargedAmount * GUEST_PLATFORM_FEE_PERCENT);
    // Create Stripe Checkout Session
    const sessionMetadata = {
        type: 'member_session_registration',
        standingMeetupId,
        occurrenceId,
        odUserId: userId,
        memberName: userProfile.displayName || 'Member',
        memberEmail: userProfile.email,
        clubId: meetup.clubId,
        organizerUserId: meetup.createdByUserId || '',
        payerName: userProfile.displayName || 'Member',
        payerEmail: userProfile.email || '',
        eventName: meetup.title || '',
    };
    try {
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            customer_email: userProfile.email,
            line_items: [
                {
                    price_data: {
                        currency: meetup.billing.currency,
                        product_data: {
                            name: meetup.title,
                            description: `Session registration - ${meetup.clubName}`,
                        },
                        unit_amount: chargedAmount,
                    },
                    quantity: 1,
                },
            ],
            success_url: successUrl,
            cancel_url: cancelUrl,
            metadata: sessionMetadata,
            payment_intent_data: {
                application_fee_amount: platformFee,
                metadata: sessionMetadata,
            },
        }, {
            stripeAccount: meetup.organizerStripeAccountId,
        });
        console.log(`✅ Created quick register checkout session ${session.id} for ${userProfile.displayName} at ${meetup.title}`);
        return {
            checkoutUrl: session.url,
            checkoutSessionId: session.id,
        };
    }
    catch (error) {
        console.error('Failed to create quick register checkout session:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Failed to create checkout session');
    }
});
// ============================================
// STANDING MEETUP SUBSCRIPTIONS
// ============================================
/**
 * Create a subscription for a standing meetup
 * Uses Direct Charges - subscription on connected account
 */
exports.stripe_createStandingMeetupSubscription = functions.https.onCall(async (data, context) => {
    var _a, _b;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { standingMeetupId, paymentMethodId } = data;
    const userId = context.auth.uid;
    if (!standingMeetupId || !paymentMethodId) {
        throw new functions.https.HttpsError('invalid-argument', 'standingMeetupId and paymentMethodId are required');
    }
    const db = admin.firestore();
    // Get standing meetup
    const meetupDoc = await db.collection('standingMeetups').doc(standingMeetupId).get();
    if (!meetupDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'MEETUP_NOT_FOUND');
    }
    const meetup = meetupDoc.data();
    // Validate meetup is active
    if (meetup.status !== 'active') {
        throw new functions.https.HttpsError('failed-precondition', 'MEETUP_NOT_ACTIVE');
    }
    // CAPACITY CHECK FIRST - before any Stripe API calls
    if (meetup.subscriberCount >= meetup.maxPlayers) {
        throw new functions.https.HttpsError('failed-precondition', 'CAPACITY_FULL');
    }
    // Check if already subscribed
    const subscriptionId = `${standingMeetupId}_${userId}`;
    const existingSubDoc = await db.collection('standingMeetupSubscriptions').doc(subscriptionId).get();
    if (existingSubDoc.exists && ((_a = existingSubDoc.data()) === null || _a === void 0 ? void 0 : _a.status) === 'active') {
        throw new functions.https.HttpsError('already-exists', 'ALREADY_SUBSCRIBED');
    }
    // Get user info
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User not found');
    }
    const user = userDoc.data();
    const connectedAccountId = meetup.organizerStripeAccountId;
    if (!connectedAccountId) {
        throw new functions.https.HttpsError('failed-precondition', 'Organizer has no Stripe account');
    }
    try {
        // STEP 1: Create/get customer on CONNECTED account (not platform)
        // IMPORTANT: Customers are per-account in Stripe Connect
        let customerId;
        // Check if user has a customer ID for this connected account
        const customerMapping = (_b = user.stripeCustomers) === null || _b === void 0 ? void 0 : _b[connectedAccountId];
        if (customerMapping) {
            customerId = customerMapping;
        }
        else {
            // Create customer on connected account
            const customer = await stripe.customers.create({
                email: user.email,
                name: user.displayName || user.email,
                metadata: {
                    userId,
                    platform: 'pickleball-director',
                },
            }, { stripeAccount: connectedAccountId });
            customerId = customer.id;
            // Store customer mapping for future use
            await db.collection('users').doc(userId).update({
                [`stripeCustomers.${connectedAccountId}`]: customerId,
                updatedAt: Date.now(),
            });
        }
        // STEP 2: Attach payment method to customer on connected account
        await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId }, { stripeAccount: connectedAccountId });
        // Set as default payment method
        await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: paymentMethodId } }, { stripeAccount: connectedAccountId });
        // STEP 3: Get or create price on connected account
        let priceId = meetup.billing.stripePriceId;
        if (!priceId) {
            // Map our interval to Stripe's interval
            const stripeInterval = meetup.billing.interval === 'weekly' ? 'week' : 'month';
            const price = await stripe.prices.create({
                unit_amount: meetup.billing.amount,
                currency: meetup.billing.currency,
                recurring: {
                    interval: stripeInterval,
                    interval_count: meetup.billing.intervalCount || 1,
                },
                product_data: {
                    name: `${meetup.title} Subscription`,
                },
            }, { stripeAccount: connectedAccountId });
            priceId = price.id;
            // Store price ID for reuse
            await db.collection('standingMeetups').doc(standingMeetupId).update({
                'billing.stripePriceId': priceId,
                updatedAt: Date.now(),
            });
        }
        // STEP 4: Calculate billing anchor (next meetup day)
        // If today is meetup day and past start time, use next week
        const now = new Date();
        const dayOfWeek = meetup.recurrence.dayOfWeek;
        const currentDay = now.getDay();
        let daysUntilMeetup = (dayOfWeek - currentDay + 7) % 7;
        // Parse start time
        const [startHour, startMinute] = meetup.recurrence.startTime.split(':').map(Number);
        const todaysMeetupTime = new Date(now);
        todaysMeetupTime.setHours(startHour, startMinute, 0, 0);
        // If today is meetup day but past start time, use next occurrence
        if (daysUntilMeetup === 0 && now > todaysMeetupTime) {
            daysUntilMeetup = 7 * (meetup.recurrence.intervalCount || 1);
        }
        const nextMeetupDate = new Date(now);
        nextMeetupDate.setDate(now.getDate() + daysUntilMeetup);
        nextMeetupDate.setHours(startHour, startMinute, 0, 0);
        const billingAnchor = Math.floor(nextMeetupDate.getTime() / 1000);
        // STEP 5: Create subscription with billing anchor
        const subscription = await stripe.subscriptions.create({
            customer: customerId,
            items: [{ price: priceId }],
            billing_cycle_anchor: billingAnchor,
            proration_behavior: 'create_prorations',
            payment_settings: {
                payment_method_types: ['card'],
                save_default_payment_method: 'on_subscription',
            },
            metadata: {
                type: 'standing_meetup_subscription',
                standingMeetupId,
                clubId: meetup.clubId,
                userId,
                platform: 'pickleball-director',
            },
            // Apply platform fee as application_fee_percent
            application_fee_percent: PLATFORM_FEE_PERCENT,
        }, { stripeAccount: connectedAccountId });
        // STEP 6: Create subscription document in Firestore
        const subscriptionData = {
            id: subscriptionId,
            standingMeetupId,
            clubId: meetup.clubId,
            userId,
            userName: user.displayName || user.email,
            userEmail: user.email,
            stripeAccountId: connectedAccountId,
            stripeSubscriptionId: subscription.id,
            stripeCustomerId: customerId,
            stripeStatus: subscription.status,
            currentPeriodStart: subscription.current_period_start * 1000,
            currentPeriodEnd: subscription.current_period_end * 1000,
            billingAmount: meetup.billing.amount,
            status: 'active',
            totalPaid: 0,
            totalCreditsReceived: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        await db.collection('standingMeetupSubscriptions').doc(subscriptionId).set(subscriptionData);
        // STEP 7: Increment subscriber count on standing meetup
        await db.collection('standingMeetups').doc(standingMeetupId).update({
            subscriberCount: admin.firestore.FieldValue.increment(1),
            updatedAt: Date.now(),
        });
        // STEP 8: Stamp subscriber into occurrences in window [now, currentPeriodEnd]
        // This is done via Cloud Function standingMeetup_ensureOccurrences
        // Call it to ensure occurrences exist, then stamp the subscriber
        const periodEnd = subscription.current_period_end * 1000;
        const occurrencesSnap = await db
            .collection('standingMeetups')
            .doc(standingMeetupId)
            .collection('occurrences')
            .where('startAt', '>=', Date.now())
            .where('startAt', '<', periodEnd)
            .get();
        const batch = db.batch();
        let firstOccurrenceDate = '';
        for (const occDoc of occurrencesSnap.docs) {
            if (!firstOccurrenceDate) {
                firstOccurrenceDate = occDoc.id;
            }
            const participantRef = occDoc.ref.collection('participants').doc(userId);
            batch.set(participantRef, {
                userName: user.displayName || user.email,
                status: 'expected',
                creditIssued: false,
                updatedAt: Date.now(),
            });
            // Increment expectedCount
            batch.update(occDoc.ref, {
                expectedCount: admin.firestore.FieldValue.increment(1),
                updatedAt: Date.now(),
            });
            // Update index
            const indexRef = db
                .collection('meetupOccurrencesIndex')
                .doc(`${standingMeetupId}_${occDoc.id}`);
            batch.update(indexRef, {
                expectedCount: admin.firestore.FieldValue.increment(1),
                spotsLeft: admin.firestore.FieldValue.increment(-1),
                updatedAt: Date.now(),
            });
        }
        await batch.commit();
        console.log(`✅ Created standing meetup subscription ${subscriptionId} for user ${userId}`);
        return {
            subscriptionId,
            stripeSubscriptionId: subscription.id,
            currentPeriodEnd: subscription.current_period_end * 1000,
            firstOccurrenceDate: firstOccurrenceDate || nextMeetupDate.toISOString().split('T')[0],
        };
    }
    catch (error) {
        console.error('Error creating standing meetup subscription:', error);
        if (error.type === 'StripeCardError') {
            throw new functions.https.HttpsError('failed-precondition', 'PAYMENT_FAILED');
        }
        throw new functions.https.HttpsError('internal', error.message || 'Failed to create subscription');
    }
});
/**
 * Cancel a standing meetup subscription
 * Cancels at period end (subscriber keeps access until billing period ends)
 */
exports.stripe_cancelStandingMeetupSubscription = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { subscriptionId } = data;
    const userId = context.auth.uid;
    if (!subscriptionId) {
        throw new functions.https.HttpsError('invalid-argument', 'subscriptionId is required');
    }
    const db = admin.firestore();
    // Get subscription
    const subDoc = await db.collection('standingMeetupSubscriptions').doc(subscriptionId).get();
    if (!subDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'SUBSCRIPTION_NOT_FOUND');
    }
    const subscription = subDoc.data();
    // Verify ownership
    if (subscription.userId !== userId) {
        throw new functions.https.HttpsError('permission-denied', 'NOT_OWNER');
    }
    // Check if already cancelled
    if (subscription.status === 'cancelled') {
        throw new functions.https.HttpsError('already-exists', 'ALREADY_CANCELLED');
    }
    try {
        // Cancel on Stripe (at period end)
        const stripeSubscription = await stripe.subscriptions.update(subscription.stripeSubscriptionId, { cancel_at_period_end: true }, { stripeAccount: subscription.stripeAccountId });
        const cancelledAt = Date.now();
        // Update Firestore subscription
        await subDoc.ref.update({
            status: 'cancelled',
            cancelledAt,
            stripeStatus: stripeSubscription.status,
            updatedAt: Date.now(),
        });
        // Note: We don't decrement subscriberCount or remove from occurrences yet
        // That happens when the subscription actually ends (via webhook)
        console.log(`✅ Cancelled standing meetup subscription ${subscriptionId}`);
        return {
            cancelledAt,
            effectiveEndDate: subscription.currentPeriodEnd,
        };
    }
    catch (error) {
        console.error('Error cancelling standing meetup subscription:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Failed to cancel subscription');
    }
});
/**
 * Handle standing meetup subscription webhooks
 * Called by the main webhook handler for subscription-related events
 */
async function handleStandingMeetupSubscriptionWebhook(event) {
    const db = admin.firestore();
    const connectedAccountId = event.account;
    // Only process events from connected accounts
    if (!connectedAccountId) {
        return;
    }
    // 2-STEP LOCK PATTERN: Acquire lock FIRST
    const lockRef = db.collection('stripeEvents').doc(event.id);
    let alreadyProcessed = false;
    await db.runTransaction(async (transaction) => {
        const lockSnap = await transaction.get(lockRef);
        if (lockSnap.exists) {
            alreadyProcessed = true;
            return;
        }
        transaction.set(lockRef, {
            eventType: event.type,
            status: 'processing',
            startedAt: Date.now(),
            accountId: connectedAccountId,
        });
    });
    if (alreadyProcessed) {
        console.log(`Event ${event.id} already processed, skipping`);
        return;
    }
    try {
        // Process event OUTSIDE the transaction
        switch (event.type) {
            case 'invoice.paid':
                await handleStandingMeetupInvoicePaid(event.data.object, connectedAccountId);
                break;
            case 'invoice.payment_failed':
                await handleStandingMeetupPaymentFailed(event.data.object, connectedAccountId);
                break;
            case 'customer.subscription.deleted':
                await handleStandingMeetupSubscriptionDeleted(event.data.object, connectedAccountId);
                break;
        }
        // Mark lock as done
        await lockRef.update({
            status: 'done',
            completedAt: Date.now(),
        });
    }
    catch (error) {
        // Mark lock as failed
        await lockRef.update({
            status: 'failed',
            error: error.message,
            failedAt: Date.now(),
        });
        throw error;
    }
}
/**
 * Handle invoice.paid for standing meetup subscriptions
 */
async function handleStandingMeetupInvoicePaid(invoice, connectedAccountId) {
    var _a, _b;
    const db = admin.firestore();
    // Check if this is a standing meetup subscription
    const subscription = invoice.subscription;
    if (!subscription)
        return;
    // Get subscription by Stripe ID
    const subsSnap = await db.collection('standingMeetupSubscriptions')
        .where('stripeSubscriptionId', '==', subscription)
        .where('stripeAccountId', '==', connectedAccountId)
        .limit(1)
        .get();
    if (subsSnap.empty) {
        // Not a standing meetup subscription
        return;
    }
    const subDoc = subsSnap.docs[0];
    const subData = subDoc.data();
    // Update subscription with new period
    const stripeSubscription = await stripe.subscriptions.retrieve(subscription, { stripeAccount: connectedAccountId });
    await subDoc.ref.update({
        currentPeriodStart: stripeSubscription.current_period_start * 1000,
        currentPeriodEnd: stripeSubscription.current_period_end * 1000,
        stripeStatus: stripeSubscription.status,
        totalPaid: admin.firestore.FieldValue.increment(invoice.amount_paid),
        updatedAt: Date.now(),
    });
    // Stamp subscriber into new occurrences for the new period
    const periodEnd = stripeSubscription.current_period_end * 1000;
    const periodStart = stripeSubscription.current_period_start * 1000;
    const occurrencesSnap = await db
        .collection('standingMeetups')
        .doc(subData.standingMeetupId)
        .collection('occurrences')
        .where('startAt', '>=', periodStart)
        .where('startAt', '<', periodEnd)
        .get();
    // Get user info
    const userDoc = await db.collection('users').doc(subData.userId).get();
    const userName = ((_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.displayName) || ((_b = userDoc.data()) === null || _b === void 0 ? void 0 : _b.email) || 'Unknown';
    const batch = db.batch();
    for (const occDoc of occurrencesSnap.docs) {
        const participantRef = occDoc.ref.collection('participants').doc(subData.userId);
        const participantSnap = await participantRef.get();
        if (!participantSnap.exists) {
            batch.set(participantRef, {
                userName,
                status: 'expected',
                creditIssued: false,
                updatedAt: Date.now(),
            });
            batch.update(occDoc.ref, {
                expectedCount: admin.firestore.FieldValue.increment(1),
                updatedAt: Date.now(),
            });
            const indexRef = db
                .collection('meetupOccurrencesIndex')
                .doc(`${subData.standingMeetupId}_${occDoc.id}`);
            batch.update(indexRef, {
                expectedCount: admin.firestore.FieldValue.increment(1),
                spotsLeft: admin.firestore.FieldValue.increment(-1),
                updatedAt: Date.now(),
            });
        }
    }
    await batch.commit();
    console.log(`✅ Processed invoice.paid for subscription ${subDoc.id}`);
}
/**
 * Handle invoice.payment_failed for standing meetup subscriptions
 */
async function handleStandingMeetupPaymentFailed(invoice, connectedAccountId) {
    const db = admin.firestore();
    const subscription = invoice.subscription;
    if (!subscription)
        return;
    // Get subscription by Stripe ID
    const subsSnap = await db.collection('standingMeetupSubscriptions')
        .where('stripeSubscriptionId', '==', subscription)
        .where('stripeAccountId', '==', connectedAccountId)
        .limit(1)
        .get();
    if (subsSnap.empty)
        return;
    const subDoc = subsSnap.docs[0];
    // Update status to past_due
    await subDoc.ref.update({
        status: 'past_due',
        stripeStatus: 'past_due',
        updatedAt: Date.now(),
    });
    // TODO: Send SMS notification to player about payment failure
    console.log(`✅ Marked subscription ${subDoc.id} as past_due`);
}
/**
 * Handle customer.subscription.deleted for standing meetup subscriptions
 */
async function handleStandingMeetupSubscriptionDeleted(subscription, connectedAccountId) {
    var _a;
    const db = admin.firestore();
    // Get subscription by Stripe ID
    const subsSnap = await db.collection('standingMeetupSubscriptions')
        .where('stripeSubscriptionId', '==', subscription.id)
        .where('stripeAccountId', '==', connectedAccountId)
        .limit(1)
        .get();
    if (subsSnap.empty)
        return;
    const subDoc = subsSnap.docs[0];
    const subData = subDoc.data();
    // Mark as cancelled (final)
    await subDoc.ref.update({
        status: 'cancelled',
        stripeStatus: 'canceled',
        updatedAt: Date.now(),
    });
    // Decrement subscriber count
    await db.collection('standingMeetups').doc(subData.standingMeetupId).update({
        subscriberCount: admin.firestore.FieldValue.increment(-1),
        updatedAt: Date.now(),
    });
    // Remove from future occurrences
    const now = Date.now();
    const occurrencesSnap = await db
        .collection('standingMeetups')
        .doc(subData.standingMeetupId)
        .collection('occurrences')
        .where('startAt', '>', now)
        .get();
    const batch = db.batch();
    for (const occDoc of occurrencesSnap.docs) {
        const participantRef = occDoc.ref.collection('participants').doc(subData.userId);
        const participantSnap = await participantRef.get();
        if (participantSnap.exists && ((_a = participantSnap.data()) === null || _a === void 0 ? void 0 : _a.status) === 'expected') {
            batch.delete(participantRef);
            batch.update(occDoc.ref, {
                expectedCount: admin.firestore.FieldValue.increment(-1),
                updatedAt: Date.now(),
            });
            const indexRef = db
                .collection('meetupOccurrencesIndex')
                .doc(`${subData.standingMeetupId}_${occDoc.id}`);
            batch.update(indexRef, {
                expectedCount: admin.firestore.FieldValue.increment(-1),
                spotsLeft: admin.firestore.FieldValue.increment(1),
                updatedAt: Date.now(),
            });
        }
    }
    await batch.commit();
    console.log(`✅ Processed subscription.deleted for ${subDoc.id}`);
}
//# sourceMappingURL=stripe.js.map
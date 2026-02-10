"use strict";
/**
 * Platform Finance Cloud Functions
 *
 * Server-side functions for platform-level finance operations:
 * - Account balances (requires Stripe API)
 * - Payout history (requires Stripe API)
 * - Club reconciliation (Stripe vs Firestore comparison)
 * - Organizer reconciliation (balance transactions)
 * - Transaction export
 * - Missing transaction creation
 *
 * @version 07.61
 * @file functions/src/platformFinance.ts
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
exports.platform_exportTransactions = exports.platform_addMissingTransaction = exports.platform_runOrganizerReconciliation = exports.platform_runReconciliation = exports.platform_getAccountPayouts = exports.platform_getAccountBalances = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const stripe_1 = __importDefault(require("stripe"));
// Initialize Firebase Admin if not already
if (!admin.apps.length) {
    admin.initializeApp();
}
// Initialize Stripe
const stripe = new stripe_1.default(((_a = functions.config().stripe) === null || _a === void 0 ? void 0 : _a.secret_key) || process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-11-20.acacia' });
// ============================================
// HELPER FUNCTIONS
// ============================================
/**
 * Check if user is an app admin
 */
async function isAppAdmin(uid) {
    var _a;
    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(uid).get();
    return userDoc.exists && ((_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.isAppAdmin) === true;
}
/**
 * Require app admin role
 */
async function requireAppAdmin(context) {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const isAdmin = await isAppAdmin(context.auth.uid);
    if (!isAdmin) {
        throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }
}
/**
 * Get Stripe account balances for connected accounts
 */
exports.platform_getAccountBalances = functions.https.onCall(async (data, context) => {
    await requireAppAdmin(context);
    const { clubIds } = data;
    const db = admin.firestore();
    try {
        // Get clubs with Stripe accounts
        let clubsQuery = db.collection('clubs').where('stripeConnectedAccountId', '!=', null);
        const clubsSnap = await clubsQuery.get();
        // Filter by clubIds if provided
        let clubDocs = clubsSnap.docs;
        if (clubIds && clubIds.length > 0) {
            clubDocs = clubDocs.filter(doc => clubIds.includes(doc.id));
        }
        const accounts = [];
        // Fetch balance for each account
        for (const clubDoc of clubDocs) {
            const clubData = clubDoc.data();
            const stripeAccountId = clubData.stripeConnectedAccountId;
            if (!stripeAccountId)
                continue;
            try {
                const balance = await stripe.balance.retrieve({
                    stripeAccount: stripeAccountId,
                });
                accounts.push({
                    clubId: clubDoc.id,
                    clubName: clubData.name || clubDoc.id,
                    stripeAccountId,
                    available: balance.available.map(b => ({
                        amount: b.amount,
                        currency: b.currency,
                    })),
                    pending: balance.pending.map(b => ({
                        amount: b.amount,
                        currency: b.currency,
                    })),
                    lastUpdated: Date.now(),
                });
            }
            catch (err) {
                console.warn(`Failed to get balance for account ${stripeAccountId}:`, err.message);
                // Include with zero balance
                accounts.push({
                    clubId: clubDoc.id,
                    clubName: clubData.name || clubDoc.id,
                    stripeAccountId,
                    available: [],
                    pending: [],
                    lastUpdated: Date.now(),
                });
            }
        }
        return { accounts };
    }
    catch (error) {
        console.error('Get account balances error:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Failed to get account balances');
    }
});
/**
 * Get payout history for a connected account
 */
exports.platform_getAccountPayouts = functions.https.onCall(async (data, context) => {
    await requireAppAdmin(context);
    const { stripeAccountId, limit: payoutLimit = 10 } = data;
    if (!stripeAccountId) {
        throw new functions.https.HttpsError('invalid-argument', 'Stripe account ID required');
    }
    try {
        const payouts = await stripe.payouts.list({ limit: payoutLimit + 1 }, { stripeAccount: stripeAccountId });
        const result = payouts.data.slice(0, payoutLimit).map(payout => {
            var _a;
            return ({
                id: payout.id,
                amount: payout.amount,
                currency: payout.currency,
                status: payout.status,
                arrivalDate: payout.arrival_date * 1000, // Convert to milliseconds
                createdAt: payout.created * 1000,
                bankAccountLast4: typeof payout.destination === 'object'
                    ? (_a = payout.destination) === null || _a === void 0 ? void 0 : _a.last4
                    : undefined,
                failureMessage: payout.failure_message || undefined,
            });
        });
        return {
            payouts: result,
            hasMore: payouts.data.length > payoutLimit,
        };
    }
    catch (error) {
        console.error('Get account payouts error:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Failed to get payouts');
    }
});
/**
 * Run reconciliation between Stripe and Firestore
 */
exports.platform_runReconciliation = functions.https.onCall(async (data, context) => {
    var _a;
    await requireAppAdmin(context);
    const { stripeAccountId, clubId, startDate, endDate } = data;
    if (!stripeAccountId || !clubId || !startDate || !endDate) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required parameters');
    }
    const db = admin.firestore();
    try {
        // Get club name
        const clubDoc = await db.collection('clubs').doc(clubId).get();
        const clubName = clubDoc.exists ? ((_a = clubDoc.data()) === null || _a === void 0 ? void 0 : _a.name) || clubId : clubId;
        // 1. Fetch Stripe charges in date range
        const startTimestamp = Math.floor(startDate / 1000);
        const endTimestamp = Math.floor(endDate / 1000);
        const stripeCharges = [];
        let hasMore = true;
        let startingAfter;
        while (hasMore) {
            const chargesPage = await stripe.charges.list({
                created: { gte: startTimestamp, lte: endTimestamp },
                limit: 100,
                starting_after: startingAfter,
            }, { stripeAccount: stripeAccountId });
            stripeCharges.push(...chargesPage.data);
            hasMore = chargesPage.has_more;
            if (chargesPage.data.length > 0) {
                startingAfter = chargesPage.data[chargesPage.data.length - 1].id;
            }
        }
        // Filter to successful charges only
        const successfulCharges = stripeCharges.filter(c => c.status === 'succeeded' && !c.refunded);
        // 2. Fetch Firestore transactions in date range
        // Include both completed and partially_refunded payments (they still match to Stripe charges)
        const firestoreTxSnap = await db.collection('transactions')
            .where('odClubId', '==', clubId)
            .where('type', '==', 'payment')
            .where('status', 'in', ['completed', 'partially_refunded'])
            .where('createdAt', '>=', startDate)
            .where('createdAt', '<=', endDate)
            .get();
        const firestoreTxMap = new Map();
        firestoreTxSnap.docs.forEach(doc => {
            var _a;
            const chargeId = (_a = doc.data().stripe) === null || _a === void 0 ? void 0 : _a.chargeId;
            if (chargeId) {
                firestoreTxMap.set(chargeId, doc);
            }
        });
        // 3. Compare and find discrepancies
        const discrepancies = [];
        let matchedCount = 0;
        let firestoreTotal = 0;
        let stripeTotal = 0;
        // Check each Stripe charge against Firestore
        for (const charge of successfulCharges) {
            stripeTotal += charge.amount;
            const firestoreDoc = firestoreTxMap.get(charge.id);
            if (!firestoreDoc) {
                // Not found in this club - check if it exists in a DIFFERENT club (club mismatch)
                const crossClubSnap = await db.collection('transactions')
                    .where('stripe.chargeId', '==', charge.id)
                    .limit(1)
                    .get();
                if (!crossClubSnap.empty) {
                    // Transaction exists but in a different club!
                    const wrongClubTx = crossClubSnap.docs[0].data();
                    discrepancies.push({
                        type: 'club_mismatch',
                        stripeChargeId: charge.id,
                        firestoreTransactionId: crossClubSnap.docs[0].id,
                        stripeAmount: charge.amount,
                        firestoreAmount: wrongClubTx.amount || 0,
                        createdAt: charge.created * 1000,
                        description: `Charge ${charge.id} ($${(charge.amount / 100).toFixed(2)}) recorded under different club: ${wrongClubTx.odClubId || 'unknown'}`,
                        canAutoFix: false, // Needs manual review
                        actualClubId: wrongClubTx.odClubId || '',
                    });
                }
                else {
                    // Truly missing in Firestore
                    discrepancies.push({
                        type: 'missing_in_firestore',
                        stripeChargeId: charge.id,
                        stripeAmount: charge.amount,
                        createdAt: charge.created * 1000,
                        description: `Charge ${charge.id} ($${(charge.amount / 100).toFixed(2)}) not found in Firestore`,
                        canAutoFix: true,
                    });
                }
            }
            else {
                const firestoreAmount = firestoreDoc.data().amount || 0;
                firestoreTotal += firestoreAmount;
                if (Math.abs(charge.amount - firestoreAmount) > 1) {
                    // Amount mismatch (allow 1 cent tolerance for rounding)
                    discrepancies.push({
                        type: 'amount_mismatch',
                        stripeChargeId: charge.id,
                        firestoreTransactionId: firestoreDoc.id,
                        stripeAmount: charge.amount,
                        firestoreAmount: firestoreAmount,
                        difference: charge.amount - firestoreAmount,
                        createdAt: charge.created * 1000,
                        description: `Amount mismatch: Stripe $${(charge.amount / 100).toFixed(2)} vs Firestore $${(firestoreAmount / 100).toFixed(2)}`,
                        canAutoFix: false,
                    });
                }
                else {
                    matchedCount++;
                }
                // Remove from map to track what's left
                firestoreTxMap.delete(charge.id);
            }
        }
        // Check for Firestore transactions not in Stripe
        firestoreTxMap.forEach((doc, chargeId) => {
            const amount = doc.data().amount || 0;
            firestoreTotal += amount;
            discrepancies.push({
                type: 'missing_in_stripe',
                stripeChargeId: chargeId,
                firestoreTransactionId: doc.id,
                firestoreAmount: amount,
                createdAt: doc.data().createdAt || Date.now(),
                description: `Transaction ${doc.id} has charge ID ${chargeId} but charge not found in Stripe`,
                canAutoFix: false,
            });
        });
        // Calculate summary
        const clubMismatchCount = discrepancies.filter(d => d.type === 'club_mismatch').length;
        const summary = {
            firestoreTotal,
            stripeTotal,
            difference: Math.abs(stripeTotal - firestoreTotal),
            matchedCount,
            missingInFirestore: discrepancies.filter(d => d.type === 'missing_in_firestore').length,
            missingInStripe: discrepancies.filter(d => d.type === 'missing_in_stripe').length,
            amountMismatches: discrepancies.filter(d => d.type === 'amount_mismatch').length,
            clubMismatches: clubMismatchCount,
            // Club mismatches should count as "matched" for rate calculation - the transaction exists, just in wrong club
            matchRate: successfulCharges.length > 0
                ? Math.round(((matchedCount + clubMismatchCount) / successfulCharges.length) * 100)
                : 100,
        };
        console.log(`Reconciliation for ${clubName}: ${matchedCount}/${successfulCharges.length} matched, ${discrepancies.length} discrepancies`);
        return {
            accountId: stripeAccountId,
            clubId,
            clubName,
            period: { start: startDate, end: endDate },
            summary,
            discrepancies,
            runAt: Date.now(),
            runByUserId: context.auth.uid,
        };
    }
    catch (error) {
        console.error('Run reconciliation error:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Failed to run reconciliation');
    }
});
/**
 * Run reconciliation for an individual organizer
 * Uses Balance Transactions as the source of truth for payouts
 *
 * CRITICAL: Max date range is 90 days to prevent expensive queries
 */
exports.platform_runOrganizerReconciliation = functions.https.onCall(async (data, context) => {
    await requireAppAdmin(context);
    const { organizerId, startDate, endDate } = data;
    if (!organizerId || !startDate || !endDate) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required parameters');
    }
    // Enforce date range limit (max 90 days)
    const maxRangeMs = 90 * 24 * 60 * 60 * 1000; // 90 days in ms
    if (endDate - startDate > maxRangeMs) {
        throw new functions.https.HttpsError('invalid-argument', 'Date range must be 90 days or less');
    }
    const db = admin.firestore();
    try {
        // Get organizer's Stripe connected account
        const orgDoc = await db.collection('users').doc(organizerId).get();
        if (!orgDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Organizer not found');
        }
        const orgData = orgDoc.data();
        const stripeAccountId = orgData.stripeConnectedAccountId;
        const organizerName = orgData.displayName || orgData.email || organizerId;
        if (!stripeAccountId) {
            throw new functions.https.HttpsError('failed-precondition', 'Organizer has no connected Stripe account');
        }
        // Fetch from Stripe using BALANCE TRANSACTIONS (source of truth for payouts)
        const stripeBalanceTxns = [];
        const startTimestamp = Math.floor(startDate / 1000);
        const endTimestamp = Math.floor(endDate / 1000);
        let hasMore = true;
        let startingAfter;
        while (hasMore) {
            const page = await stripe.balanceTransactions.list({
                created: { gte: startTimestamp, lte: endTimestamp },
                limit: 100,
                starting_after: startingAfter,
                expand: ['data.source'],
            }, { stripeAccount: stripeAccountId });
            stripeBalanceTxns.push(...page.data);
            hasMore = page.has_more;
            if (page.data.length > 0) {
                startingAfter = page.data[page.data.length - 1].id;
            }
        }
        // Fetch Firestore transactions for this organizer
        const firestoreTxSnap = await db.collection('transactions')
            .where('organizerUserId', '==', organizerId)
            .where('status', '==', 'completed')
            .where('createdAt', '>=', startDate)
            .where('createdAt', '<=', endDate)
            .get();
        // Build maps for matching
        const firestoreByBalanceTxnId = new Map();
        const firestoreByChargeId = new Map();
        firestoreTxSnap.docs.forEach(doc => {
            var _a, _b;
            const data = doc.data();
            if ((_a = data.stripe) === null || _a === void 0 ? void 0 : _a.balanceTransactionId) {
                firestoreByBalanceTxnId.set(data.stripe.balanceTransactionId, doc);
            }
            if ((_b = data.stripe) === null || _b === void 0 ? void 0 : _b.chargeId) {
                firestoreByChargeId.set(data.stripe.chargeId, doc);
            }
        });
        // Compare and identify discrepancies
        const discrepancies = [];
        let matched = 0;
        let stripeTotal = 0;
        let firestoreTotal = 0;
        let ignoredCount = 0;
        const ignoredTypes = {};
        const matchedBalanceTxnIds = new Set();
        for (const stripeTxn of stripeBalanceTxns) {
            // Only process charges and refunds (skip payouts, fees, adjustments, etc.)
            // Stripe balance_transaction.type can include: charge, payment, refund,
            // adjustment, payout, stripe_fee, application_fee, etc.
            if (!['charge', 'refund', 'payment'].includes(stripeTxn.type)) {
                ignoredCount++;
                ignoredTypes[stripeTxn.type] = (ignoredTypes[stripeTxn.type] || 0) + 1;
                continue;
            }
            stripeTotal += stripeTxn.net; // Use net (after Stripe fees)
            // Try to match by balance transaction ID first, then by charge ID
            let firestoreDoc = firestoreByBalanceTxnId.get(stripeTxn.id);
            if (!firestoreDoc && stripeTxn.source) {
                // Try matching by source (charge) ID
                const sourceId = typeof stripeTxn.source === 'string'
                    ? stripeTxn.source
                    : stripeTxn.source.id;
                firestoreDoc = firestoreByChargeId.get(sourceId);
            }
            if (!firestoreDoc) {
                discrepancies.push({
                    type: 'missing_in_firestore',
                    stripeId: stripeTxn.id,
                    stripeAmount: stripeTxn.net,
                    description: `Stripe ${stripeTxn.type} not found in Firestore`,
                });
            }
            else {
                const firestoreAmount = firestoreDoc.data().clubNetAmount || 0;
                firestoreTotal += firestoreAmount;
                matchedBalanceTxnIds.add(stripeTxn.id);
                // Check amount match (allow 1 cent tolerance for rounding)
                if (Math.abs(stripeTxn.net - firestoreAmount) > 1) {
                    discrepancies.push({
                        type: 'amount_mismatch',
                        stripeId: stripeTxn.id,
                        stripeAmount: stripeTxn.net,
                        firestoreAmount: firestoreAmount,
                        firestoreId: firestoreDoc.id,
                        diff: stripeTxn.net - firestoreAmount,
                        description: `Amount mismatch: Stripe ${stripeTxn.net} vs Firestore ${firestoreAmount}`,
                    });
                }
                else {
                    matched++;
                }
            }
        }
        // Check for Firestore transactions missing from Stripe
        firestoreTxSnap.docs.forEach(doc => {
            var _a;
            const data = doc.data();
            const balTxnId = (_a = data.stripe) === null || _a === void 0 ? void 0 : _a.balanceTransactionId;
            if (balTxnId && !matchedBalanceTxnIds.has(balTxnId)) {
                // This transaction has a balance transaction ID that wasn't in our Stripe results
                const hasStripeMatch = stripeBalanceTxns.some(s => s.id === balTxnId);
                if (!hasStripeMatch) {
                    discrepancies.push({
                        type: 'missing_in_stripe',
                        stripeId: balTxnId,
                        firestoreId: doc.id,
                        firestoreAmount: data.clubNetAmount,
                        description: 'Firestore transaction not found in Stripe',
                    });
                }
            }
        });
        // Calculate match rate based on processed transactions (not ignored ones)
        const processedCount = stripeBalanceTxns.length - ignoredCount;
        const summary = {
            stripeTotal,
            firestoreTotal,
            difference: Math.abs(stripeTotal - firestoreTotal),
            matched,
            discrepancyCount: discrepancies.length,
            matchRate: processedCount > 0
                ? ((matched / processedCount) * 100).toFixed(1)
                : '100',
            ignoredCount,
            ignoredTypes,
        };
        console.log(`Organizer reconciliation for ${organizerName}: ${matched}/${processedCount} matched, ${discrepancies.length} discrepancies, ${ignoredCount} ignored`);
        return {
            organizerId,
            organizerName,
            stripeAccountId,
            summary,
            discrepancies,
            period: { startDate, endDate },
            runAt: Date.now(),
            runByUserId: context.auth.uid,
        };
    }
    catch (error) {
        console.error('Organizer reconciliation error:', error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', error.message || 'Failed to run organizer reconciliation');
    }
});
// ============================================
// ADD MISSING TRANSACTION
// ============================================
/**
 * Create a missing Firestore transaction from Stripe charge data
 * Used for reconciliation fixes
 */
exports.platform_addMissingTransaction = functions.https.onCall(async (data, context) => {
    var _a;
    await requireAppAdmin(context);
    const { stripeChargeId, stripeAccountId, clubId } = data;
    if (!stripeChargeId || !stripeAccountId || !clubId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required parameters');
    }
    const db = admin.firestore();
    try {
        // Check if transaction already exists
        const existingSnap = await db.collection('transactions')
            .where('stripe.chargeId', '==', stripeChargeId)
            .limit(1)
            .get();
        if (!existingSnap.empty) {
            throw new functions.https.HttpsError('already-exists', 'Transaction already exists for this charge');
        }
        // Fetch charge from Stripe
        const charge = await stripe.charges.retrieve(stripeChargeId, { expand: ['balance_transaction', 'payment_intent'] }, { stripeAccount: stripeAccountId });
        if (charge.status !== 'succeeded') {
            throw new functions.https.HttpsError('failed-precondition', 'Charge is not successful');
        }
        // Get payment intent metadata
        const pi = charge.payment_intent;
        const metadata = (pi === null || pi === void 0 ? void 0 : pi.metadata) || charge.metadata || {};
        // Extract balance transaction data
        let platformFee = charge.application_fee_amount || 0;
        let totalFees = platformFee;
        let netAmount = charge.amount - platformFee;
        let balanceTransactionId;
        const balanceTx = charge.balance_transaction;
        if (typeof balanceTx === 'object' && balanceTx !== null) {
            balanceTransactionId = balanceTx.id;
            totalFees = balanceTx.fee || 0;
            netAmount = balanceTx.net || 0;
        }
        // Create the transaction
        const txRef = db.collection('transactions').doc();
        const now = Date.now();
        await txRef.set({
            id: txRef.id,
            schemaVersion: 1,
            odClubId: clubId,
            odUserId: metadata.odUserId || '',
            type: 'payment',
            status: 'completed',
            referenceType: metadata.type || 'unknown',
            referenceId: metadata.referenceId || metadata.meetupId || metadata.tournamentId || '',
            referenceName: metadata.eventName || 'Reconciliation import',
            amount: charge.amount,
            currency: (charge.currency || 'nzd').toUpperCase(),
            platformFeeAmount: platformFee,
            totalFeeAmount: totalFees,
            clubNetAmount: netAmount,
            payerDisplayName: metadata.payerName || 'Unknown',
            stripe: {
                schemaVersion: 1,
                accountId: stripeAccountId,
                paymentIntentId: typeof charge.payment_intent === 'string' ? charge.payment_intent : pi === null || pi === void 0 ? void 0 : pi.id,
                chargeId: charge.id,
                balanceTransactionId,
                applicationFeeId: charge.application_fee,
                applicationFeeAmount: platformFee,
                totalFee: totalFees,
                mode: charge.livemode ? 'live' : 'test',
                paymentMethodType: (_a = charge.payment_method_details) === null || _a === void 0 ? void 0 : _a.type,
            },
            createdAt: charge.created * 1000, // Use Stripe's created timestamp
            updatedAt: now,
            completedAt: charge.created * 1000,
            addedByReconciliation: true,
            addedByUserId: context.auth.uid,
        });
        console.log(`Created missing transaction ${txRef.id} from charge ${stripeChargeId}`);
        return {
            transactionId: txRef.id,
            amount: charge.amount,
            chargeId: stripeChargeId,
        };
    }
    catch (error) {
        console.error('Add missing transaction error:', error);
        if (error.code === 'already-exists') {
            throw error;
        }
        throw new functions.https.HttpsError('internal', error.message || 'Failed to add transaction');
    }
});
// ============================================
// EXPORT TRANSACTIONS
// ============================================
/**
 * Export transactions as CSV or JSON
 */
exports.platform_exportTransactions = functions.https.onCall(async (data, context) => {
    await requireAppAdmin(context);
    const { startDate, endDate, format = 'csv', fieldSet = 'basic', types, clubIds, includeFeeBreakdown = true, } = data;
    if (!startDate || !endDate) {
        throw new functions.https.HttpsError('invalid-argument', 'Start and end dates required');
    }
    const db = admin.firestore();
    try {
        // Build query
        let query = db.collection('transactions')
            .where('createdAt', '>=', startDate)
            .where('createdAt', '<=', endDate)
            .orderBy('createdAt', 'desc');
        // Note: Can't use multiple 'in' filters, so we'll filter in memory for types/clubIds
        const snapshot = await query.get();
        // Filter results in memory
        let transactions = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        if (types && types.length > 0) {
            transactions = transactions.filter(tx => types.includes(tx.type));
        }
        if (clubIds && clubIds.length > 0) {
            transactions = transactions.filter(tx => clubIds.includes(tx.odClubId));
        }
        // Get club names for the transactions
        const clubIdSet = new Set(transactions.map(tx => tx.odClubId).filter(Boolean));
        const clubNames = new Map();
        if (clubIdSet.size > 0) {
            const clubsSnap = await db.collection('clubs').get();
            clubsSnap.docs.forEach(doc => {
                if (clubIdSet.has(doc.id)) {
                    clubNames.set(doc.id, doc.data().name || doc.id);
                }
            });
        }
        // Format output
        let output;
        let filename;
        if (format === 'json') {
            output = JSON.stringify(transactions, null, 2);
            filename = `transactions_${new Date(startDate).toISOString().split('T')[0]}_to_${new Date(endDate).toISOString().split('T')[0]}.json`;
        }
        else {
            // CSV format
            const headers = [
                'Date',
                'Time',
                'Club',
                'Description',
                'Type',
                'Payer',
                'Gross',
                ...(includeFeeBreakdown ? ['Platform Fee', 'Stripe Fee'] : []),
                'Net',
                'Currency',
                'Status',
                ...(fieldSet === 'detailed' || fieldSet === 'full' ? ['Charge ID', 'Reference Type', 'Reference ID'] : []),
            ];
            const rows = transactions.map((tx) => {
                var _a;
                const date = new Date(tx.createdAt);
                const clubName = clubNames.get(tx.odClubId) || tx.odClubId;
                const platformFee = (tx.platformFeeAmount || 0) / 100;
                const totalFee = (tx.totalFeeAmount || tx.platformFeeAmount || 0) / 100;
                const stripeFee = totalFee - platformFee;
                const row = [
                    date.toLocaleDateString('en-NZ'),
                    date.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' }),
                    clubName,
                    tx.referenceName || tx.referenceType,
                    tx.type,
                    tx.payerDisplayName,
                    (tx.amount / 100).toFixed(2),
                    ...(includeFeeBreakdown
                        ? [platformFee.toFixed(2), stripeFee > 0 ? stripeFee.toFixed(2) : '0.00']
                        : []),
                    (tx.clubNetAmount / 100).toFixed(2),
                    tx.currency,
                    tx.status,
                    ...(fieldSet === 'detailed' || fieldSet === 'full'
                        ? [((_a = tx.stripe) === null || _a === void 0 ? void 0 : _a.chargeId) || '', tx.referenceType, tx.referenceId]
                        : []),
                ];
                // Escape fields that might contain commas
                return row.map(field => {
                    const str = String(field);
                    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                        return `"${str.replace(/"/g, '""')}"`;
                    }
                    return str;
                }).join(',');
            });
            output = [headers.join(','), ...rows].join('\n');
            filename = `transactions_${new Date(startDate).toISOString().split('T')[0]}_to_${new Date(endDate).toISOString().split('T')[0]}.csv`;
        }
        return {
            data: output,
            filename,
            recordCount: transactions.length,
            generatedAt: Date.now(),
        };
    }
    catch (error) {
        console.error('Export transactions error:', error);
        throw new functions.https.HttpsError('internal', error.message || 'Failed to export transactions');
    }
});
//# sourceMappingURL=platformFinance.js.map
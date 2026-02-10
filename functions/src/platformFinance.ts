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

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

// Initialize Firebase Admin if not already
if (!admin.apps.length) {
  admin.initializeApp();
}

// Initialize Stripe
const stripe = new Stripe(
  functions.config().stripe?.secret_key || process.env.STRIPE_SECRET_KEY || '',
  { apiVersion: '2024-11-20.acacia' as any }
);

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if user is an app admin
 */
async function isAppAdmin(uid: string): Promise<boolean> {
  const db = admin.firestore();
  const userDoc = await db.collection('users').doc(uid).get();
  return userDoc.exists && userDoc.data()?.isAppAdmin === true;
}

/**
 * Require app admin role
 */
async function requireAppAdmin(context: functions.https.CallableContext): Promise<void> {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const isAdmin = await isAppAdmin(context.auth.uid);
  if (!isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
  }
}

// ============================================
// GET ACCOUNT BALANCES
// ============================================

interface AccountBalanceResult {
  clubId: string;
  clubName: string;
  stripeAccountId: string;
  available: { amount: number; currency: string }[];
  pending: { amount: number; currency: string }[];
  lastUpdated: number;
}

/**
 * Get Stripe account balances for connected accounts
 */
export const platform_getAccountBalances = functions.https.onCall(async (data, context) => {
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

    const accounts: AccountBalanceResult[] = [];

    // Fetch balance for each account
    for (const clubDoc of clubDocs) {
      const clubData = clubDoc.data();
      const stripeAccountId = clubData.stripeConnectedAccountId;

      if (!stripeAccountId) continue;

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
      } catch (err: any) {
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
  } catch (error: any) {
    console.error('Get account balances error:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Failed to get account balances');
  }
});

// ============================================
// GET ACCOUNT PAYOUTS
// ============================================

interface PayoutResult {
  id: string;
  amount: number;
  currency: string;
  status: string;
  arrivalDate: number;
  createdAt: number;
  bankAccountLast4?: string;
  failureMessage?: string;
}

/**
 * Get payout history for a connected account
 */
export const platform_getAccountPayouts = functions.https.onCall(async (data, context) => {
  await requireAppAdmin(context);

  const { stripeAccountId, limit: payoutLimit = 10 } = data;

  if (!stripeAccountId) {
    throw new functions.https.HttpsError('invalid-argument', 'Stripe account ID required');
  }

  try {
    const payouts = await stripe.payouts.list(
      { limit: payoutLimit + 1 },
      { stripeAccount: stripeAccountId }
    );

    const result: PayoutResult[] = payouts.data.slice(0, payoutLimit).map(payout => ({
      id: payout.id,
      amount: payout.amount,
      currency: payout.currency,
      status: payout.status,
      arrivalDate: payout.arrival_date * 1000, // Convert to milliseconds
      createdAt: payout.created * 1000,
      bankAccountLast4: typeof payout.destination === 'object'
        ? (payout.destination as any)?.last4
        : undefined,
      failureMessage: payout.failure_message || undefined,
    }));

    return {
      payouts: result,
      hasMore: payouts.data.length > payoutLimit,
    };
  } catch (error: any) {
    console.error('Get account payouts error:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Failed to get payouts');
  }
});

// ============================================
// RUN RECONCILIATION
// ============================================

interface ReconciliationDiscrepancy {
  type: 'missing_in_firestore' | 'missing_in_stripe' | 'amount_mismatch' | 'club_mismatch';
  stripeChargeId?: string;
  firestoreTransactionId?: string;
  stripeAmount?: number;
  firestoreAmount?: number;
  difference?: number;
  createdAt: number;
  description: string;
  canAutoFix: boolean;
  actualClubId?: string; // For club_mismatch: which club the transaction is actually in
}

interface ReconciliationSummary {
  firestoreTotal: number;
  stripeTotal: number;
  difference: number;
  matchedCount: number;
  missingInFirestore: number;
  missingInStripe: number;
  amountMismatches: number;
  clubMismatches: number;
  matchRate: number;
}

/**
 * Run reconciliation between Stripe and Firestore
 */
export const platform_runReconciliation = functions.https.onCall(async (data, context) => {
  await requireAppAdmin(context);

  const { stripeAccountId, clubId, startDate, endDate } = data;

  if (!stripeAccountId || !clubId || !startDate || !endDate) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required parameters');
  }

  const db = admin.firestore();

  try {
    // Get club name
    const clubDoc = await db.collection('clubs').doc(clubId).get();
    const clubName = clubDoc.exists ? clubDoc.data()?.name || clubId : clubId;

    // 1. Fetch Stripe charges in date range
    const startTimestamp = Math.floor(startDate / 1000);
    const endTimestamp = Math.floor(endDate / 1000);

    const stripeCharges: Stripe.Charge[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const chargesPage = await stripe.charges.list(
        {
          created: { gte: startTimestamp, lte: endTimestamp },
          limit: 100,
          starting_after: startingAfter,
        },
        { stripeAccount: stripeAccountId }
      );

      stripeCharges.push(...chargesPage.data);
      hasMore = chargesPage.has_more;
      if (chargesPage.data.length > 0) {
        startingAfter = chargesPage.data[chargesPage.data.length - 1].id;
      }
    }

    // Filter to successful charges only
    const successfulCharges = stripeCharges.filter(
      c => c.status === 'succeeded' && !c.refunded
    );

    // 2. Fetch Firestore transactions in date range
    // Include both completed and partially_refunded payments (they still match to Stripe charges)
    const firestoreTxSnap = await db.collection('transactions')
      .where('odClubId', '==', clubId)
      .where('type', '==', 'payment')
      .where('status', 'in', ['completed', 'partially_refunded'])
      .where('createdAt', '>=', startDate)
      .where('createdAt', '<=', endDate)
      .get();

    const firestoreTxMap = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    firestoreTxSnap.docs.forEach(doc => {
      const chargeId = doc.data().stripe?.chargeId;
      if (chargeId) {
        firestoreTxMap.set(chargeId, doc);
      }
    });

    // 3. Compare and find discrepancies
    const discrepancies: ReconciliationDiscrepancy[] = [];
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
        } else {
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
      } else {
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
        } else {
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
    const summary: ReconciliationSummary = {
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
      runByUserId: context.auth!.uid,
    };
  } catch (error: any) {
    console.error('Run reconciliation error:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Failed to run reconciliation');
  }
});

// ============================================
// RUN ORGANIZER RECONCILIATION
// ============================================

interface OrganizerReconciliationDiscrepancy {
  type: 'missing_in_firestore' | 'missing_in_stripe' | 'amount_mismatch';
  stripeId: string;
  stripeAmount?: number;
  firestoreAmount?: number;
  diff?: number;
  description: string;
  firestoreId?: string;
}

interface OrganizerReconciliationSummary {
  stripeTotal: number;
  firestoreTotal: number;
  difference: number;
  matched: number;
  discrepancyCount: number;
  matchRate: string;
  ignoredCount: number;
  ignoredTypes: Record<string, number>;
}

/**
 * Run reconciliation for an individual organizer
 * Uses Balance Transactions as the source of truth for payouts
 *
 * CRITICAL: Max date range is 90 days to prevent expensive queries
 */
export const platform_runOrganizerReconciliation = functions.https.onCall(async (data, context) => {
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

    const orgData = orgDoc.data()!;
    const stripeAccountId = orgData.stripeConnectedAccountId;
    const organizerName = orgData.displayName || orgData.email || organizerId;

    if (!stripeAccountId) {
      throw new functions.https.HttpsError('failed-precondition', 'Organizer has no connected Stripe account');
    }

    // Fetch from Stripe using BALANCE TRANSACTIONS (source of truth for payouts)
    const stripeBalanceTxns: Stripe.BalanceTransaction[] = [];
    const startTimestamp = Math.floor(startDate / 1000);
    const endTimestamp = Math.floor(endDate / 1000);

    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const page = await stripe.balanceTransactions.list(
        {
          created: { gte: startTimestamp, lte: endTimestamp },
          limit: 100,
          starting_after: startingAfter,
          expand: ['data.source'],
        },
        { stripeAccount: stripeAccountId }
      );

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
    const firestoreByBalanceTxnId = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    const firestoreByChargeId = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();

    firestoreTxSnap.docs.forEach(doc => {
      const data = doc.data();
      if (data.stripe?.balanceTransactionId) {
        firestoreByBalanceTxnId.set(data.stripe.balanceTransactionId, doc);
      }
      if (data.stripe?.chargeId) {
        firestoreByChargeId.set(data.stripe.chargeId, doc);
      }
    });

    // Compare and identify discrepancies
    const discrepancies: OrganizerReconciliationDiscrepancy[] = [];
    let matched = 0;
    let stripeTotal = 0;
    let firestoreTotal = 0;
    let ignoredCount = 0;
    const ignoredTypes: Record<string, number> = {};
    const matchedBalanceTxnIds = new Set<string>();

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
          : (stripeTxn.source as any).id;
        firestoreDoc = firestoreByChargeId.get(sourceId);
      }

      if (!firestoreDoc) {
        discrepancies.push({
          type: 'missing_in_firestore',
          stripeId: stripeTxn.id,
          stripeAmount: stripeTxn.net,
          description: `Stripe ${stripeTxn.type} not found in Firestore`,
        });
      } else {
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
        } else {
          matched++;
        }
      }
    }

    // Check for Firestore transactions missing from Stripe
    firestoreTxSnap.docs.forEach(doc => {
      const data = doc.data();
      const balTxnId = data.stripe?.balanceTransactionId;
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

    const summary: OrganizerReconciliationSummary = {
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
      runByUserId: context.auth!.uid,
    };
  } catch (error: any) {
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
export const platform_addMissingTransaction = functions.https.onCall(async (data, context) => {
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
    const charge = await stripe.charges.retrieve(
      stripeChargeId,
      { expand: ['balance_transaction', 'payment_intent'] },
      { stripeAccount: stripeAccountId }
    );

    if (charge.status !== 'succeeded') {
      throw new functions.https.HttpsError('failed-precondition', 'Charge is not successful');
    }

    // Get payment intent metadata
    const pi = charge.payment_intent as Stripe.PaymentIntent | null;
    const metadata = pi?.metadata || charge.metadata || {};

    // Extract balance transaction data
    let platformFee = charge.application_fee_amount || 0;
    let totalFees = platformFee;
    let netAmount = charge.amount - platformFee;
    let balanceTransactionId: string | undefined;

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
        paymentIntentId: typeof charge.payment_intent === 'string' ? charge.payment_intent : pi?.id,
        chargeId: charge.id,
        balanceTransactionId,
        applicationFeeId: charge.application_fee,
        applicationFeeAmount: platformFee,
        totalFee: totalFees,
        mode: charge.livemode ? 'live' : 'test',
        paymentMethodType: charge.payment_method_details?.type,
      },
      createdAt: charge.created * 1000, // Use Stripe's created timestamp
      updatedAt: now,
      completedAt: charge.created * 1000,
      addedByReconciliation: true,
      addedByUserId: context.auth!.uid,
    });

    console.log(`Created missing transaction ${txRef.id} from charge ${stripeChargeId}`);

    return {
      transactionId: txRef.id,
      amount: charge.amount,
      chargeId: stripeChargeId,
    };
  } catch (error: any) {
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
export const platform_exportTransactions = functions.https.onCall(async (data, context) => {
  await requireAppAdmin(context);

  const {
    startDate,
    endDate,
    format = 'csv',
    fieldSet = 'basic',
    types,
    clubIds,
    includeFeeBreakdown = true,
  } = data;

  if (!startDate || !endDate) {
    throw new functions.https.HttpsError('invalid-argument', 'Start and end dates required');
  }

  const db = admin.firestore();

  try {
    // Build query
    let query: FirebaseFirestore.Query = db.collection('transactions')
      .where('createdAt', '>=', startDate)
      .where('createdAt', '<=', endDate)
      .orderBy('createdAt', 'desc');

    // Note: Can't use multiple 'in' filters, so we'll filter in memory for types/clubIds
    const snapshot = await query.get();

    // Filter results in memory
    let transactions = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    if (types && types.length > 0) {
      transactions = transactions.filter(tx => types.includes((tx as any).type));
    }

    if (clubIds && clubIds.length > 0) {
      transactions = transactions.filter(tx => clubIds.includes((tx as any).odClubId));
    }

    // Get club names for the transactions
    const clubIdSet = new Set(transactions.map(tx => (tx as any).odClubId).filter(Boolean));
    const clubNames = new Map<string, string>();

    if (clubIdSet.size > 0) {
      const clubsSnap = await db.collection('clubs').get();
      clubsSnap.docs.forEach(doc => {
        if (clubIdSet.has(doc.id)) {
          clubNames.set(doc.id, doc.data().name || doc.id);
        }
      });
    }

    // Format output
    let output: string;
    let filename: string;

    if (format === 'json') {
      output = JSON.stringify(transactions, null, 2);
      filename = `transactions_${new Date(startDate).toISOString().split('T')[0]}_to_${new Date(endDate).toISOString().split('T')[0]}.json`;
    } else {
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

      const rows = transactions.map((tx: any) => {
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
            ? [tx.stripe?.chargeId || '', tx.referenceType, tx.referenceId]
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
  } catch (error: any) {
    console.error('Export transactions error:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Failed to export transactions');
  }
});

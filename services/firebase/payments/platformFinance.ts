/**
 * Platform Finance Service
 *
 * Query functions for the Platform Finance dashboard (app admins only).
 * Provides platform-wide transaction visibility, club breakdowns,
 * and calls Cloud Functions for Stripe operations.
 *
 * @version 07.50
 * @file services/firebase/payments/platformFinance.ts
 */

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  QueryDocumentSnapshot,
  DocumentData,
  getCountFromServer,
} from '@firebase/firestore';
import { httpsCallable } from '@firebase/functions';
import { db, functions } from '../index';
import { FinanceTransaction, FinanceCurrency } from './types';
import {
  PlatformFinanceOverview,
  ClubFinanceBreakdown,
  OrganizerFinanceBreakdown,
  PlatformTransactionQueryOptions,
  PlatformTransactionsResult,
  AccountBalance,
  PayoutData,
  ReconciliationResult,
  OrganizerReconciliationResult,
  GetPlatformOverviewInput,
  GetClubBreakdownInput,
  GetAccountBalancesInput,
  GetAccountPayoutsInput,
  RunReconciliationInput,
  RunOrganizerReconciliationInput,
  AddMissingTransactionInput,
  ExportTransactionsInput,
  ExportResult,
} from './platformFinanceTypes';

// ============================================
// PLATFORM TRANSACTIONS
// ============================================

/**
 * Get platform-wide transactions (all clubs)
 * Requires app_admin role
 */
export async function getPlatformTransactions(
  options: PlatformTransactionQueryOptions
): Promise<PlatformTransactionsResult> {
  const {
    clubId,
    type,
    referenceType,
    status,
    startDate,
    endDate,
    limit: pageLimit = 20,
    orderDirection = 'desc',
  } = options;

  const transactionsRef = collection(db, 'transactions');

  // Build query constraints - note: can't orderBy AND filter on different fields
  // without composite indexes, so we're limited in filtering options
  const constraints: any[] = [orderBy('createdAt', orderDirection)];

  // Add optional filters
  if (clubId) {
    constraints.push(where('odClubId', '==', clubId));
  }
  if (type) {
    constraints.push(where('type', '==', type));
  }
  if (status) {
    constraints.push(where('status', '==', status));
  }
  if (referenceType) {
    constraints.push(where('referenceType', '==', referenceType));
  }
  if (startDate) {
    constraints.push(where('createdAt', '>=', startDate));
  }
  if (endDate) {
    constraints.push(where('createdAt', '<=', endDate));
  }

  // Add limit + 1 to check if there are more
  constraints.push(limit(pageLimit + 1));

  const q = query(transactionsRef, ...constraints);
  const snapshot = await getDocs(q);

  const transactions: FinanceTransaction[] = [];
  snapshot.docs.slice(0, pageLimit).forEach((docSnap: QueryDocumentSnapshot<DocumentData>) => {
    transactions.push({
      id: docSnap.id,
      ...docSnap.data(),
    } as FinanceTransaction);
  });

  return {
    transactions,
    hasMore: snapshot.docs.length > pageLimit,
  };
}

// ============================================
// PLATFORM OVERVIEW
// ============================================

/**
 * Get platform-wide finance overview
 * Aggregates across all clubs
 */
export async function getPlatformFinanceOverview(
  startDate: number,
  endDate: number
): Promise<PlatformFinanceOverview> {
  const transactionsRef = collection(db, 'transactions');

  // Get completed transactions in the period
  const q = query(
    transactionsRef,
    where('status', '==', 'completed'),
    where('createdAt', '>=', startDate),
    where('createdAt', '<=', endDate)
  );

  const snapshot = await getDocs(q);

  let grossVolume = 0;
  let platformFeesCollected = 0;
  let stripeFeesCollected = 0;
  let refundsTotal = 0;
  let transactionCount = 0;
  let refundCount = 0;
  let disputeCount = 0;
  const clubIds = new Set<string>();
  let currency: FinanceCurrency = 'NZD';

  snapshot.docs.forEach((docSnap: QueryDocumentSnapshot<DocumentData>) => {
    const tx = docSnap.data() as FinanceTransaction;

    // Track unique clubs
    if (tx.odClubId) {
      clubIds.add(tx.odClubId);
    }

    // Get currency from first transaction
    if (!currency && tx.currency) {
      currency = tx.currency;
    }

    if (tx.type === 'payment') {
      grossVolume += tx.amount;
      platformFeesCollected += tx.platformFeeAmount || 0;

      // Calculate Stripe fee if we have totalFeeAmount
      const totalFee = (tx as any).totalFeeAmount || tx.platformFeeAmount || 0;
      const stripeFee = totalFee - (tx.platformFeeAmount || 0);
      if (stripeFee > 0) {
        stripeFeesCollected += stripeFee;
      }

      transactionCount++;
    } else if (tx.type === 'refund') {
      refundsTotal += Math.abs(tx.amount);
      refundCount++;
    } else if ((tx as any).type === 'dispute') {
      disputeCount++;
    }
  });

  const totalFees = platformFeesCollected + stripeFeesCollected;
  const netPlatformRevenue = platformFeesCollected; // Platform's cut only

  return {
    period: { start: startDate, end: endDate },
    grossVolume,
    platformFeesCollected,
    stripeFeesCollected,
    totalFees,
    refundsTotal,
    netPlatformRevenue,
    transactionCount,
    refundCount,
    disputeCount,
    activeClubCount: clubIds.size,
    currency,
  };
}

/**
 * Get platform overview for last 30 days
 */
export async function getPlatformOverviewLast30Days(): Promise<PlatformFinanceOverview> {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  return getPlatformFinanceOverview(thirtyDaysAgo, now);
}

// ============================================
// CLUB BREAKDOWN
// ============================================

/**
 * Get per-club finance breakdown
 */
export async function getClubFinanceBreakdown(
  startDate: number,
  endDate: number
): Promise<ClubFinanceBreakdown[]> {
  const transactionsRef = collection(db, 'transactions');

  // Get completed transactions in the period
  const q = query(
    transactionsRef,
    where('status', '==', 'completed'),
    where('createdAt', '>=', startDate),
    where('createdAt', '<=', endDate)
  );

  const snapshot = await getDocs(q);

  // Aggregate by club
  const clubMap = new Map<
    string,
    {
      grossVolume: number;
      platformFees: number;
      stripeFees: number;
      netToClub: number;
      transactionCount: number;
      refundCount: number;
      disputeCount: number;
    }
  >();

  snapshot.docs.forEach((docSnap: QueryDocumentSnapshot<DocumentData>) => {
    const tx = docSnap.data() as FinanceTransaction;
    const clubId = tx.odClubId;
    if (!clubId) return;

    // Initialize if needed
    if (!clubMap.has(clubId)) {
      clubMap.set(clubId, {
        grossVolume: 0,
        platformFees: 0,
        stripeFees: 0,
        netToClub: 0,
        transactionCount: 0,
        refundCount: 0,
        disputeCount: 0,
      });
    }

    const club = clubMap.get(clubId)!;

    if (tx.type === 'payment') {
      club.grossVolume += tx.amount;
      club.platformFees += tx.platformFeeAmount || 0;
      club.netToClub += tx.clubNetAmount || 0;

      // Estimate Stripe fee
      const totalFee = (tx as any).totalFeeAmount || tx.platformFeeAmount || 0;
      const stripeFee = totalFee - (tx.platformFeeAmount || 0);
      if (stripeFee > 0) {
        club.stripeFees += stripeFee;
      }

      club.transactionCount++;
    } else if (tx.type === 'refund') {
      club.refundCount++;
      club.netToClub -= Math.abs(tx.amount);
    } else if ((tx as any).type === 'dispute') {
      club.disputeCount++;
    }
  });

  // Fetch club names
  const clubsRef = collection(db, 'clubs');
  const clubsSnapshot = await getDocs(clubsRef);
  const clubNames = new Map<string, { name: string; stripeAccountId?: string; stripeChargesEnabled?: boolean }>();

  clubsSnapshot.docs.forEach((docSnap) => {
    const data = docSnap.data();
    clubNames.set(docSnap.id, {
      name: data.name || docSnap.id,
      stripeAccountId: data.stripeConnectedAccountId,
      stripeChargesEnabled: data.stripeChargesEnabled,
    });
  });

  // Build result array
  const result: ClubFinanceBreakdown[] = [];

  clubMap.forEach((data, clubId) => {
    const clubInfo = clubNames.get(clubId);
    const stripeStatus: 'ready' | 'pending' | 'none' = clubInfo?.stripeAccountId
      ? clubInfo.stripeChargesEnabled
        ? 'ready'
        : 'pending'
      : 'none';

    result.push({
      clubId,
      clubName: clubInfo?.name || clubId,
      stripeAccountId: clubInfo?.stripeAccountId,
      stripeStatus,
      ...data,
    });
  });

  // Sort by gross volume descending
  result.sort((a, b) => b.grossVolume - a.grossVolume);

  return result;
}

// ============================================
// ORGANIZER BREAKDOWN
// ============================================

/**
 * Get per-organizer finance breakdown
 * For organizers who run events independently (not tied to a club)
 *
 * NOTE: This uses client-side filtering since Firestore can't query "NOT NULL".
 * For large datasets, consider adding isOrganizerTransaction field to transactions.
 */
export async function getOrganizerFinanceBreakdown(
  startDate: number,
  endDate: number
): Promise<OrganizerFinanceBreakdown[]> {
  const transactionsRef = collection(db, 'transactions');

  // Get completed transactions in the period
  // We filter client-side for organizerUserId since Firestore can't do NOT NULL
  const q = query(
    transactionsRef,
    where('status', '==', 'completed'),
    where('createdAt', '>=', startDate),
    where('createdAt', '<=', endDate),
    orderBy('createdAt', 'desc'),
    limit(1000) // Cap for performance
  );

  const snapshot = await getDocs(q);

  // Aggregate by organizerUserId (filter out club transactions)
  const organizerMap = new Map<
    string,
    {
      grossVolume: number;
      platformFees: number;
      stripeFees: number;
      netToOrganizer: number;
      transactionCount: number;
      refundCount: number;
    }
  >();

  snapshot.docs.forEach((docSnap: QueryDocumentSnapshot<DocumentData>) => {
    const tx = docSnap.data() as FinanceTransaction;

    // Only include transactions that have organizerUserId AND no odClubId
    // (independent organizer transactions)
    const organizerId = tx.organizerUserId;
    if (!organizerId || organizerId.trim() === '') return;
    if (tx.odClubId && tx.odClubId.trim() !== '') return;

    // Initialize if needed
    if (!organizerMap.has(organizerId)) {
      organizerMap.set(organizerId, {
        grossVolume: 0,
        platformFees: 0,
        stripeFees: 0,
        netToOrganizer: 0,
        transactionCount: 0,
        refundCount: 0,
      });
    }

    const org = organizerMap.get(organizerId)!;

    if (tx.type === 'payment') {
      org.grossVolume += tx.amount;
      org.platformFees += tx.platformFeeAmount || 0;
      org.netToOrganizer += tx.clubNetAmount || 0;

      // Estimate Stripe fee
      const totalFee = (tx as any).totalFeeAmount || tx.platformFeeAmount || 0;
      const stripeFee = totalFee - (tx.platformFeeAmount || 0);
      if (stripeFee > 0) {
        org.stripeFees += stripeFee;
      }

      org.transactionCount++;
    } else if (tx.type === 'refund') {
      org.refundCount++;
      org.netToOrganizer -= Math.abs(tx.amount);
    }
  });

  // Batch fetch user profiles for organizer names/emails
  // Chunk into groups of 10 for Firestore 'in' query limit
  const organizerIds = Array.from(organizerMap.keys());
  const userProfiles = new Map<
    string,
    { displayName: string; email: string; stripeConnectedAccountId?: string; stripeChargesEnabled?: boolean; stripeDetailsSubmitted?: boolean }
  >();

  // Fetch in batches of 10
  for (let i = 0; i < organizerIds.length; i += 10) {
    const batch = organizerIds.slice(i, i + 10);
    if (batch.length === 0) continue;

    const usersRef = collection(db, 'users');
    const usersQuery = query(usersRef, where('__name__', 'in', batch));
    const usersSnapshot = await getDocs(usersQuery);

    usersSnapshot.docs.forEach((docSnap) => {
      const data = docSnap.data();
      userProfiles.set(docSnap.id, {
        displayName: data.displayName || data.email || docSnap.id,
        email: data.email || '',
        stripeConnectedAccountId: data.stripeConnectedAccountId,
        stripeChargesEnabled: data.stripeChargesEnabled,
        stripeDetailsSubmitted: data.stripeDetailsSubmitted,
      });
    });
  }

  // Helper to derive Stripe status from user profile
  const deriveStripeStatus = (profile: any): 'ready' | 'pending' | 'none' => {
    if (!profile?.stripeConnectedAccountId) return 'none';
    if (profile.stripeChargesEnabled && profile.stripeDetailsSubmitted) return 'ready';
    return 'pending';
  };

  // Build result array
  const result: OrganizerFinanceBreakdown[] = [];

  organizerMap.forEach((data, organizerId) => {
    const profile = userProfiles.get(organizerId);

    result.push({
      organizerId,
      organizerName: profile?.displayName || 'Unknown',
      organizerEmail: profile?.email || '',
      stripeConnectedAccountId: profile?.stripeConnectedAccountId,
      stripeStatus: deriveStripeStatus(profile),
      ...data,
    });
  });

  // Sort by gross volume descending
  result.sort((a, b) => b.grossVolume - a.grossVolume);

  return result;
}

// ============================================
// CLOUD FUNCTION WRAPPERS
// ============================================

/**
 * Get account balances via Cloud Function
 * (Requires server-side Stripe API call)
 */
export async function getAccountBalances(
  input: GetAccountBalancesInput = {}
): Promise<AccountBalance[]> {
  const callable = httpsCallable<GetAccountBalancesInput, { accounts: AccountBalance[] }>(
    functions,
    'platform_getAccountBalances'
  );

  const result = await callable(input);
  return result.data.accounts;
}

/**
 * Get account payouts via Cloud Function
 */
export async function getAccountPayouts(
  input: GetAccountPayoutsInput
): Promise<{ payouts: PayoutData[]; hasMore: boolean }> {
  const callable = httpsCallable<
    GetAccountPayoutsInput,
    { payouts: PayoutData[]; hasMore: boolean }
  >(functions, 'platform_getAccountPayouts');

  const result = await callable(input);
  return result.data;
}

/**
 * Run reconciliation via Cloud Function (for clubs)
 */
export async function runReconciliation(
  input: RunReconciliationInput
): Promise<ReconciliationResult> {
  const callable = httpsCallable<RunReconciliationInput, ReconciliationResult>(
    functions,
    'platform_runReconciliation'
  );

  const result = await callable(input);
  return result.data;
}

/**
 * Run organizer reconciliation via Cloud Function
 * Compares Stripe balance transactions against Firestore transactions
 * for an individual organizer's connected account
 */
export async function runOrganizerReconciliation(
  input: RunOrganizerReconciliationInput
): Promise<OrganizerReconciliationResult> {
  const callable = httpsCallable<RunOrganizerReconciliationInput, OrganizerReconciliationResult>(
    functions,
    'platform_runOrganizerReconciliation'
  );

  const result = await callable(input);
  return result.data;
}

/**
 * Add missing transaction via Cloud Function
 * (For reconciliation fixes)
 */
export async function addMissingTransaction(
  input: AddMissingTransactionInput
): Promise<{ transactionId: string; amount: number }> {
  const callable = httpsCallable<
    AddMissingTransactionInput,
    { transactionId: string; amount: number }
  >(functions, 'platform_addMissingTransaction');

  const result = await callable(input);
  return result.data;
}

/**
 * Export transactions via Cloud Function
 */
export async function exportTransactions(
  input: ExportTransactionsInput
): Promise<ExportResult> {
  const callable = httpsCallable<ExportTransactionsInput, ExportResult>(
    functions,
    'platform_exportTransactions'
  );

  const result = await callable(input);
  return result.data;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get total transaction count for the platform
 */
export async function getPlatformTransactionCount(): Promise<number> {
  const transactionsRef = collection(db, 'transactions');
  const countSnapshot = await getCountFromServer(transactionsRef);
  return countSnapshot.data().count;
}

/**
 * Get transactions for a specific club (platform admin view)
 */
export async function getPlatformClubTransactions(
  clubId: string,
  options: Omit<PlatformTransactionQueryOptions, 'clubId'> = {}
): Promise<PlatformTransactionsResult> {
  return getPlatformTransactions({ ...options, clubId });
}

/**
 * Get recent disputes
 */
export async function getRecentDisputes(limitCount: number = 10): Promise<FinanceTransaction[]> {
  const transactionsRef = collection(db, 'transactions');
  const q = query(
    transactionsRef,
    where('type', '==', 'dispute'),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  })) as FinanceTransaction[];
}

/**
 * Format CSV for export (client-side fallback)
 */
export function formatTransactionsAsCSV(
  transactions: FinanceTransaction[],
  includeFeeBreakdown: boolean = true
): string {
  const headers = [
    'Date',
    'Time',
    'Club ID',
    'Description',
    'Type',
    'Payer',
    'Gross',
    ...(includeFeeBreakdown ? ['Platform Fee', 'Stripe Fee'] : []),
    'Net',
    'Currency',
    'Status',
    'Charge ID',
    'Reference Type',
    'Reference ID',
  ];

  const rows = transactions.map((tx) => {
    const date = new Date(tx.createdAt);
    const dateStr = date.toLocaleDateString('en-NZ');
    const timeStr = date.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' });

    const platformFee = (tx.platformFeeAmount || 0) / 100;
    const totalFee = ((tx as any).totalFeeAmount || tx.platformFeeAmount || 0) / 100;
    const stripeFee = totalFee - platformFee;

    const row = [
      dateStr,
      timeStr,
      tx.odClubId,
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
      tx.stripe?.chargeId || '',
      tx.referenceType,
      tx.referenceId,
    ];

    // Escape fields that might contain commas
    return row.map((field) => {
      const str = String(field);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
  });

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

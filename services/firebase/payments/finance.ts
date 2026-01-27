/**
 * Finance Service
 *
 * Query functions for the Finance UI - fetches transactions from Firestore.
 * Source of truth for club payment data.
 *
 * FILE LOCATION: services/firebase/payments/finance.ts
 */

import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  getDoc,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
} from '@firebase/firestore';
import { db } from '../index';
import {
  FinanceTransaction,
  FinanceTransactionQueryOptions,
  OrganizerFinanceQueryOptions,
  FinanceOverview,
  FinanceCurrency,
} from './types';

/**
 * Get transactions for a club (Finance tab main query)
 */
export async function getClubTransactions(
  options: FinanceTransactionQueryOptions
): Promise<{ transactions: FinanceTransaction[]; hasMore: boolean }> {
  const {
    odClubId,
    type,
    status,
    referenceType,
    startDate,
    endDate,
    limit: pageLimit = 20,
    orderDirection = 'desc',
  } = options;

  const transactionsRef = collection(db, 'transactions');

  // Build query constraints
  const constraints: any[] = [
    where('odClubId', '==', odClubId),
    orderBy('createdAt', orderDirection),
  ];

  // Add optional filters
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

/**
 * Get paginated transactions (for "Load More" / infinite scroll)
 */
export async function getClubTransactionsPaginated(
  options: FinanceTransactionQueryOptions,
  lastDoc: QueryDocumentSnapshot | null
): Promise<{ transactions: FinanceTransaction[]; hasMore: boolean; lastDoc: QueryDocumentSnapshot | null }> {
  const {
    odClubId,
    type,
    referenceType,
    limit: pageLimit = 20,
    orderDirection = 'desc',
  } = options;

  const transactionsRef = collection(db, 'transactions');

  // Build query constraints
  const constraints: any[] = [
    where('odClubId', '==', odClubId),
    orderBy('createdAt', orderDirection),
  ];

  if (type) {
    constraints.push(where('type', '==', type));
  }
  if (referenceType) {
    constraints.push(where('referenceType', '==', referenceType));
  }
  if (lastDoc) {
    constraints.push(startAfter(lastDoc));
  }
  constraints.push(limit(pageLimit + 1));

  const q = query(transactionsRef, ...constraints);
  const snapshot = await getDocs(q);

  const transactions: FinanceTransaction[] = [];
  const docs = snapshot.docs.slice(0, pageLimit);

  docs.forEach((docSnap: QueryDocumentSnapshot<DocumentData>) => {
    transactions.push({
      id: docSnap.id,
      ...docSnap.data(),
    } as FinanceTransaction);
  });

  return {
    transactions,
    hasMore: snapshot.docs.length > pageLimit,
    lastDoc: docs.length > 0 ? docs[docs.length - 1] : null,
  };
}

/**
 * Get a single transaction by ID
 */
export async function getTransaction(transactionId: string): Promise<FinanceTransaction | null> {
  const docRef = doc(db, 'transactions', transactionId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return null;
  }

  return {
    id: docSnap.id,
    ...docSnap.data(),
  } as FinanceTransaction;
}

/**
 * Get refunds for a parent transaction
 */
export async function getTransactionRefunds(parentTransactionId: string): Promise<FinanceTransaction[]> {
  const transactionsRef = collection(db, 'transactions');
  const q = query(
    transactionsRef,
    where('parentTransactionId', '==', parentTransactionId),
    where('type', '==', 'refund'),
    orderBy('createdAt', 'desc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnap: QueryDocumentSnapshot<DocumentData>) => ({
    id: docSnap.id,
    ...docSnap.data(),
  })) as FinanceTransaction[];
}

/**
 * Calculate finance overview for a club
 * Returns aggregated totals for the specified period
 */
export async function getClubFinanceOverview(
  odClubId: string,
  startDate: number,
  endDate: number
): Promise<FinanceOverview> {
  const transactionsRef = collection(db, 'transactions');

  // Get completed transactions in the period
  const q = query(
    transactionsRef,
    where('odClubId', '==', odClubId),
    where('status', '==', 'completed'),
    where('createdAt', '>=', startDate),
    where('createdAt', '<=', endDate)
  );

  const snapshot = await getDocs(q);

  let grossSales = 0;
  let refundsTotal = 0;
  let platformFeesTotal = 0;
  let transactionCount = 0;
  let refundCount = 0;
  let currency: FinanceCurrency = 'NZD';

  snapshot.docs.forEach((docSnap: QueryDocumentSnapshot<DocumentData>) => {
    const tx = docSnap.data() as FinanceTransaction;

    // Get currency from first transaction
    if (!currency && tx.currency) {
      currency = tx.currency;
    }

    if (tx.type === 'payment') {
      grossSales += tx.amount;
      // Use totalFeeAmount (includes Stripe fees) if available, otherwise fall back to platformFeeAmount
      platformFeesTotal += (tx as any).totalFeeAmount || tx.platformFeeAmount || 0;
      transactionCount++;
    } else if (tx.type === 'refund') {
      refundsTotal += Math.abs(tx.amount); // Refunds stored as negative
      refundCount++;
    }
  });

  // Net revenue is calculated from actual clubNetAmount values for accuracy
  // But we can also calculate: grossSales - refundsTotal - platformFeesTotal
  const netRevenue = grossSales - refundsTotal - platformFeesTotal;

  return {
    periodStart: startDate,
    periodEnd: endDate,
    grossSales,
    refundsTotal,
    platformFeesTotal,
    netRevenue,
    transactionCount,
    refundCount,
    currency,
  };
}

/**
 * Get finance overview for last 30 days
 */
export async function getClubFinanceOverviewLast30Days(odClubId: string): Promise<FinanceOverview> {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  return getClubFinanceOverview(odClubId, thirtyDaysAgo, now);
}

/**
 * Search transactions by payer name
 */
export async function searchTransactionsByPayer(
  odClubId: string,
  searchTerm: string,
  limitCount: number = 20
): Promise<FinanceTransaction[]> {
  // Note: Firestore doesn't support full-text search
  // This is a simple prefix search on payerDisplayName
  // For production, consider Algolia or similar
  const transactionsRef = collection(db, 'transactions');
  const q = query(
    transactionsRef,
    where('odClubId', '==', odClubId),
    orderBy('payerDisplayName'),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );

  const snapshot = await getDocs(q);
  const searchLower = searchTerm.toLowerCase();

  return snapshot.docs
    .map((docSnap: QueryDocumentSnapshot<DocumentData>) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }) as FinanceTransaction)
    .filter((tx: FinanceTransaction) => tx.payerDisplayName?.toLowerCase().includes(searchLower));
}

// ============================================
// ORGANIZER FINANCE FUNCTIONS
// ============================================

/**
 * Get transactions for an organizer (Finance tab main query)
 * Queries by organizerUserId instead of odClubId
 */
export async function getOrganizerTransactions(
  options: OrganizerFinanceQueryOptions
): Promise<{ transactions: FinanceTransaction[]; hasMore: boolean }> {
  const {
    organizerUserId,
    type,
    status,
    referenceType,
    startDate,
    endDate,
    limit: pageLimit = 20,
    orderDirection = 'desc',
  } = options;

  const transactionsRef = collection(db, 'transactions');

  // Build query constraints
  const constraints: any[] = [
    where('organizerUserId', '==', organizerUserId),
    orderBy('createdAt', orderDirection),
  ];

  // Add optional filters
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

/**
 * Calculate finance overview for an organizer
 * Returns aggregated totals for the specified period
 */
export async function getOrganizerFinanceOverview(
  organizerUserId: string,
  startDate: number,
  endDate: number
): Promise<FinanceOverview> {
  const transactionsRef = collection(db, 'transactions');

  // Get completed transactions in the period
  const q = query(
    transactionsRef,
    where('organizerUserId', '==', organizerUserId),
    where('status', '==', 'completed'),
    where('createdAt', '>=', startDate),
    where('createdAt', '<=', endDate)
  );

  const snapshot = await getDocs(q);

  let grossSales = 0;
  let refundsTotal = 0;
  let platformFeesTotal = 0;
  let transactionCount = 0;
  let refundCount = 0;
  let currency: FinanceCurrency = 'NZD';

  snapshot.docs.forEach((docSnap: QueryDocumentSnapshot<DocumentData>) => {
    const tx = docSnap.data() as FinanceTransaction;

    // Get currency from first transaction
    if (!currency && tx.currency) {
      currency = tx.currency;
    }

    if (tx.type === 'payment') {
      grossSales += tx.amount;
      // Use totalFeeAmount (includes Stripe fees) if available, otherwise fall back to platformFeeAmount
      platformFeesTotal += (tx as any).totalFeeAmount || tx.platformFeeAmount || 0;
      transactionCount++;
    } else if (tx.type === 'refund') {
      refundsTotal += Math.abs(tx.amount); // Refunds stored as negative
      refundCount++;
    }
  });

  const netRevenue = grossSales - refundsTotal - platformFeesTotal;

  return {
    periodStart: startDate,
    periodEnd: endDate,
    grossSales,
    refundsTotal,
    platformFeesTotal,
    netRevenue,
    transactionCount,
    refundCount,
    currency,
  };
}

/**
 * Get finance overview for organizer for last 30 days
 */
export async function getOrganizerFinanceOverviewLast30Days(organizerUserId: string): Promise<FinanceOverview> {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  return getOrganizerFinanceOverview(organizerUserId, thirtyDaysAgo, now);
}

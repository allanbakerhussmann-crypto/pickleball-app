/**
 * Transaction Service
 * 
 * Firebase service for transaction management including:
 * - Logging transactions
 * - Querying transaction history
 * - Real-time subscriptions
 * 
 * FILE LOCATION: services/firebase/payments/transactions.ts
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  Timestamp,
  type QueryConstraint,
  type Unsubscribe,
  type DocumentSnapshot,
} from '@firebase/firestore';
import { db } from '../config';
import type {
  Transaction,
  CreateTransactionInput,
  TransactionType,
  TransactionStatus,
  TransactionQueryOptions,
  ReferenceType,
  SupportedCurrency,
  TransactionBreakdown,
} from './types';
import { validateCreateTransactionInput } from './validation';

// ============================================
// CONSTANTS
// ============================================

const TRANSACTIONS_COLLECTION = 'transactions';

/**
 * Generate a unique transaction ID
 * Format: txn_{timestamp}_{random}
 */
export const generateTransactionId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `txn_${timestamp}_${random}`;
};

// ============================================
// CREATE TRANSACTION
// ============================================

/**
 * Log a new transaction
 * This is the primary method for recording any financial activity
 */
export const logTransaction = async (
  input: CreateTransactionInput,
  options?: {
    balanceBefore?: number;
    balanceAfter?: number;
    status?: TransactionStatus;
  }
): Promise<Transaction> => {
  // Validate input
  const validation = validateCreateTransactionInput(input);
  if (!validation.valid) {
    throw new Error(`Invalid transaction input: ${validation.errors.join(', ')}`);
  }

  const transactionId = generateTransactionId();
  const transactionRef = doc(db, TRANSACTIONS_COLLECTION, transactionId);
  const now = Date.now();

  const transaction: Transaction = {
    id: transactionId,
    walletId: input.walletId,
    odUserId: input.odUserId,
    odClubId: input.odClubId,
    tournamentId: input.tournamentId,
    leagueId: input.leagueId,
    type: input.type,
    amount: input.amount,
    currency: input.currency,
    balanceBefore: options?.balanceBefore,
    balanceAfter: options?.balanceAfter,
    status: options?.status ?? 'pending',
    paymentMethod: input.paymentMethod,
    stripePaymentIntentId: input.stripePaymentIntentId,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    referenceName: input.referenceName,
    breakdown: input.breakdown,
    metadata: input.metadata,
    createdAt: now,
  };

  await setDoc(transactionRef, transaction);
  return transaction;
};

/**
 * Update transaction status
 */
export const updateTransactionStatus = async (
  transactionId: string,
  status: TransactionStatus,
  additionalData?: Partial<Transaction>
): Promise<Transaction> => {
  const transactionRef = doc(db, TRANSACTIONS_COLLECTION, transactionId);
  const snap = await getDoc(transactionRef);

  if (!snap.exists()) {
    throw new Error(`Transaction not found: ${transactionId}`);
  }

  const now = Date.now();
  const updates: Partial<Transaction> = {
    status,
    ...additionalData,
  };

  // Set completedAt if status is completed
  if (status === 'completed' && !additionalData?.completedAt) {
    updates.completedAt = now;
  }

  await setDoc(transactionRef, updates, { merge: true });

  return {
    id: snap.id,
    ...snap.data(),
    ...updates,
  } as Transaction;
};

/**
 * Mark transaction as completed
 */
export const completeTransaction = async (
  transactionId: string,
  additionalData?: {
    stripeChargeId?: string;
    receiptUrl?: string;
    receiptNumber?: string;
    platformFee?: number;
    taxAmount?: number;
    netAmount?: number;
  }
): Promise<Transaction> => {
  return updateTransactionStatus(transactionId, 'completed', {
    ...additionalData,
    completedAt: Date.now(),
  });
};

/**
 * Mark transaction as failed
 */
export const failTransaction = async (
  transactionId: string,
  error?: string
): Promise<Transaction> => {
  return updateTransactionStatus(transactionId, 'failed', {
    metadata: error ? { failureReason: error } : undefined,
  });
};

/**
 * Reverse a transaction (for refunds)
 */
export const reverseTransaction = async (
  transactionId: string
): Promise<Transaction> => {
  return updateTransactionStatus(transactionId, 'reversed');
};

// ============================================
// GET TRANSACTIONS
// ============================================

/**
 * Get a single transaction by ID
 */
export const getTransaction = async (
  transactionId: string
): Promise<Transaction | null> => {
  const transactionRef = doc(db, TRANSACTIONS_COLLECTION, transactionId);
  const snap = await getDoc(transactionRef);

  if (!snap.exists()) {
    return null;
  }

  return { id: snap.id, ...snap.data() } as Transaction;
};

/**
 * Get transaction by Stripe Payment Intent ID
 */
export const getTransactionByStripePaymentIntent = async (
  stripePaymentIntentId: string
): Promise<Transaction | null> => {
  const q = query(
    collection(db, TRANSACTIONS_COLLECTION),
    where('stripePaymentIntentId', '==', stripePaymentIntentId),
    limit(1)
  );

  const snap = await getDocs(q);
  if (snap.empty) {
    return null;
  }

  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() } as Transaction;
};

/**
 * Get transactions by reference (e.g., all transactions for a booking)
 */
export const getTransactionsByReference = async (
  referenceType: ReferenceType,
  referenceId: string
): Promise<Transaction[]> => {
  const q = query(
    collection(db, TRANSACTIONS_COLLECTION),
    where('referenceType', '==', referenceType),
    where('referenceId', '==', referenceId),
    orderBy('createdAt', 'desc')
  );

  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));
};

// ============================================
// QUERY TRANSACTIONS
// ============================================

/**
 * Build query constraints from options
 */
const buildQueryConstraints = (
  options: TransactionQueryOptions
): QueryConstraint[] => {
  const constraints: QueryConstraint[] = [];

  if (options.odUserId) {
    constraints.push(where('odUserId', '==', options.odUserId));
  }

  if (options.odClubId) {
    constraints.push(where('odClubId', '==', options.odClubId));
  }

  if (options.tournamentId) {
    constraints.push(where('tournamentId', '==', options.tournamentId));
  }

  if (options.leagueId) {
    constraints.push(where('leagueId', '==', options.leagueId));
  }

  if (options.type) {
    constraints.push(where('type', '==', options.type));
  }

  if (options.status) {
    constraints.push(where('status', '==', options.status));
  }

  if (options.referenceType) {
    constraints.push(where('referenceType', '==', options.referenceType));
  }

  // Add ordering
  const orderField = options.orderBy ?? 'createdAt';
  const orderDir = options.orderDirection ?? 'desc';
  constraints.push(orderBy(orderField, orderDir));

  // Add limit
  if (options.limit) {
    constraints.push(limit(options.limit));
  }

  return constraints;
};

/**
 * Query transactions with flexible filtering
 */
export const queryTransactions = async (
  options: TransactionQueryOptions
): Promise<Transaction[]> => {
  const constraints = buildQueryConstraints(options);
  const q = query(collection(db, TRANSACTIONS_COLLECTION), ...constraints);

  const snap = await getDocs(q);
  let transactions = snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));

  // Apply date filters in JavaScript (Firestore can't do inequality on multiple fields)
  if (options.startDate) {
    transactions = transactions.filter(t => t.createdAt >= options.startDate!);
  }
  if (options.endDate) {
    transactions = transactions.filter(t => t.createdAt <= options.endDate!);
  }

  return transactions;
};

/**
 * Get user transaction history
 */
export const getUserTransactionHistory = async (
  odUserId: string,
  options?: {
    limit?: number;
    type?: TransactionType;
    startDate?: number;
    endDate?: number;
  }
): Promise<Transaction[]> => {
  return queryTransactions({
    odUserId,
    ...options,
    orderBy: 'createdAt',
    orderDirection: 'desc',
  });
};

/**
 * Get user transactions for a specific club
 */
export const getUserClubTransactionHistory = async (
  odUserId: string,
  odClubId: string,
  options?: {
    limit?: number;
    type?: TransactionType;
  }
): Promise<Transaction[]> => {
  return queryTransactions({
    odUserId,
    odClubId,
    ...options,
    orderBy: 'createdAt',
    orderDirection: 'desc',
  });
};

/**
 * Get club transaction history (all members)
 */
export const getClubTransactionHistory = async (
  odClubId: string,
  options?: {
    limit?: number;
    type?: TransactionType;
    startDate?: number;
    endDate?: number;
  }
): Promise<Transaction[]> => {
  return queryTransactions({
    odClubId,
    ...options,
    orderBy: 'createdAt',
    orderDirection: 'desc',
  });
};

/**
 * Get wallet transaction history
 */
export const getWalletTransactionHistory = async (
  walletId: string,
  options?: {
    limit?: number;
    type?: TransactionType;
  }
): Promise<Transaction[]> => {
  const constraints: QueryConstraint[] = [
    where('walletId', '==', walletId),
    orderBy('createdAt', 'desc'),
  ];

  if (options?.type) {
    constraints.push(where('type', '==', options.type));
  }

  if (options?.limit) {
    constraints.push(limit(options.limit));
  }

  const q = query(collection(db, TRANSACTIONS_COLLECTION), ...constraints);
  const snap = await getDocs(q);

  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));
};

/**
 * Get tournament transaction history
 */
export const getTournamentTransactions = async (
  tournamentId: string
): Promise<Transaction[]> => {
  return queryTransactions({
    tournamentId,
    orderBy: 'createdAt',
    orderDirection: 'desc',
  });
};

/**
 * Get league transaction history
 */
export const getLeagueTransactions = async (
  leagueId: string
): Promise<Transaction[]> => {
  return queryTransactions({
    leagueId,
    orderBy: 'createdAt',
    orderDirection: 'desc',
  });
};

// ============================================
// REAL-TIME SUBSCRIPTIONS
// ============================================

/**
 * Subscribe to user's transactions
 */
export const subscribeToUserTransactions = (
  odUserId: string,
  callback: (transactions: Transaction[]) => void,
  options?: { limit?: number }
): Unsubscribe => {
  const constraints: QueryConstraint[] = [
    where('odUserId', '==', odUserId),
    orderBy('createdAt', 'desc'),
  ];

  if (options?.limit) {
    constraints.push(limit(options.limit));
  }

  const q = query(collection(db, TRANSACTIONS_COLLECTION), ...constraints);

  return onSnapshot(q, (snap) => {
    const transactions = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
    } as Transaction));
    callback(transactions);
  });
};

/**
 * Subscribe to wallet transactions
 */
export const subscribeToWalletTransactions = (
  walletId: string,
  callback: (transactions: Transaction[]) => void,
  options?: { limit?: number }
): Unsubscribe => {
  const constraints: QueryConstraint[] = [
    where('walletId', '==', walletId),
    orderBy('createdAt', 'desc'),
  ];

  if (options?.limit) {
    constraints.push(limit(options.limit));
  }

  const q = query(collection(db, TRANSACTIONS_COLLECTION), ...constraints);

  return onSnapshot(q, (snap) => {
    const transactions = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
    } as Transaction));
    callback(transactions);
  });
};

/**
 * Subscribe to club transactions (admin)
 */
export const subscribeToClubTransactions = (
  odClubId: string,
  callback: (transactions: Transaction[]) => void,
  options?: { limit?: number }
): Unsubscribe => {
  const constraints: QueryConstraint[] = [
    where('odClubId', '==', odClubId),
    orderBy('createdAt', 'desc'),
  ];

  if (options?.limit) {
    constraints.push(limit(options.limit));
  }

  const q = query(collection(db, TRANSACTIONS_COLLECTION), ...constraints);

  return onSnapshot(q, (snap) => {
    const transactions = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
    } as Transaction));
    callback(transactions);
  });
};

// ============================================
// AGGREGATION HELPERS
// ============================================

/**
 * Calculate total amount for a set of transactions
 */
export const calculateTransactionTotal = (
  transactions: Transaction[],
  options?: {
    type?: TransactionType;
    status?: TransactionStatus;
  }
): number => {
  let filtered = transactions;

  if (options?.type) {
    filtered = filtered.filter(t => t.type === options.type);
  }

  if (options?.status) {
    filtered = filtered.filter(t => t.status === options.status);
  }

  return filtered.reduce((sum, t) => sum + t.amount, 0);
};

/**
 * Group transactions by type
 */
export const groupTransactionsByType = (
  transactions: Transaction[]
): Record<TransactionType, Transaction[]> => {
  const grouped: Record<string, Transaction[]> = {};

  for (const tx of transactions) {
    if (!grouped[tx.type]) {
      grouped[tx.type] = [];
    }
    grouped[tx.type].push(tx);
  }

  return grouped as Record<TransactionType, Transaction[]>;
};

/**
 * Group transactions by date (day)
 */
export const groupTransactionsByDate = (
  transactions: Transaction[]
): Record<string, Transaction[]> => {
  const grouped: Record<string, Transaction[]> = {};

  for (const tx of transactions) {
    const date = new Date(tx.createdAt).toISOString().split('T')[0];
    if (!grouped[date]) {
      grouped[date] = [];
    }
    grouped[date].push(tx);
  }

  return grouped;
};

/**
 * Group transactions by month
 */
export const groupTransactionsByMonth = (
  transactions: Transaction[]
): Record<string, Transaction[]> => {
  const grouped: Record<string, Transaction[]> = {};

  for (const tx of transactions) {
    const date = new Date(tx.createdAt);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!grouped[month]) {
      grouped[month] = [];
    }
    grouped[month].push(tx);
  }

  return grouped;
};

/**
 * Get spending summary by category for a user
 */
export const getUserSpendingByCategory = async (
  odUserId: string,
  options?: {
    startDate?: number;
    endDate?: number;
  }
): Promise<Record<ReferenceType, number>> => {
  const transactions = await queryTransactions({
    odUserId,
    type: 'payment',
    status: 'completed',
    ...options,
  });

  const summary: Record<string, number> = {};

  for (const tx of transactions) {
    if (!summary[tx.referenceType]) {
      summary[tx.referenceType] = 0;
    }
    summary[tx.referenceType] += tx.amount;
  }

  return summary as Record<ReferenceType, number>;
};

/**
 * Get revenue summary by source for a club
 */
export const getClubRevenueBySource = async (
  odClubId: string,
  options?: {
    startDate?: number;
    endDate?: number;
  }
): Promise<Record<ReferenceType, number>> => {
  const transactions = await queryTransactions({
    odClubId,
    type: 'payment',
    status: 'completed',
    ...options,
  });

  const summary: Record<string, number> = {};

  for (const tx of transactions) {
    if (!summary[tx.referenceType]) {
      summary[tx.referenceType] = 0;
    }
    summary[tx.referenceType] += tx.amount;
  }

  return summary as Record<ReferenceType, number>;
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Create a transaction breakdown for a simple payment
 */
export const createSimpleBreakdown = (
  amount: number,
  description: string
): TransactionBreakdown => ({
  items: [
    {
      label: description,
      amount,
      type: 'charge',
    },
  ],
  subtotal: amount,
  discounts: 0,
  fees: 0,
  tax: 0,
  total: amount,
});

/**
 * Count transactions for a user
 */
export const countUserTransactions = async (
  odUserId: string,
  options?: {
    type?: TransactionType;
    status?: TransactionStatus;
  }
): Promise<number> => {
  const transactions = await queryTransactions({
    odUserId,
    ...options,
  });
  return transactions.length;
};

/**
 * Get the most recent transaction for a user
 */
export const getLatestUserTransaction = async (
  odUserId: string
): Promise<Transaction | null> => {
  const transactions = await queryTransactions({
    odUserId,
    limit: 1,
    orderBy: 'createdAt',
    orderDirection: 'desc',
  });

  return transactions[0] ?? null;
};
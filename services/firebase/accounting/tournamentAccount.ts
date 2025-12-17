/**
 * Tournament Account Service
 * 
 * Manages tournament financial accounts including:
 * - Registration fee collection
 * - Division-level revenue tracking
 * - Player payment status
 * - Expenses and profit calculation
 * 
 * All amounts are in CENTS.
 * 
 * FILE LOCATION: services/firebase/accounting/tournamentAccount.ts
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  increment,
  type Unsubscribe,
} from '@firebase/firestore';
import { db } from '../config';
import type {
  TournamentAccount,
  DivisionRevenue,
  PlayerPaymentStatus,
} from './types';
import { createEmptyTournamentAccount } from './types';
import type { 
  Transaction,
  SupportedCurrency,
} from '../payments/types';

// ============================================
// CONSTANTS
// ============================================

const TOURNAMENT_ACCOUNTS_COLLECTION = 'tournamentAccounts';

// ============================================
// GET & CREATE TOURNAMENT ACCOUNT
// ============================================

/**
 * Get a tournament's financial account
 * Returns null if account doesn't exist
 */
export const getTournamentAccount = async (
  tournamentId: string
): Promise<TournamentAccount | null> => {
  const docRef = doc(db, TOURNAMENT_ACCOUNTS_COLLECTION, tournamentId);
  const snap = await getDoc(docRef);
  
  if (!snap.exists()) {
    return null;
  }
  
  return { id: snap.id, ...snap.data() } as TournamentAccount;
};

/**
 * Get or create a tournament's financial account
 */
export const getOrCreateTournamentAccount = async (
  tournamentId: string,
  organizerId: string,
  entryFee: number = 0,
  clubId?: string
): Promise<TournamentAccount> => {
  const existing = await getTournamentAccount(tournamentId);
  if (existing) {
    return existing;
  }
  
  // Create new account
  const newAccount = createEmptyTournamentAccount(tournamentId, organizerId, entryFee, clubId);
  const docRef = doc(db, TOURNAMENT_ACCOUNTS_COLLECTION, tournamentId);
  await setDoc(docRef, newAccount);
  
  return newAccount;
};

/**
 * Subscribe to real-time tournament account updates
 */
export const subscribeToTournamentAccount = (
  tournamentId: string,
  callback: (account: TournamentAccount | null) => void
): Unsubscribe => {
  const docRef = doc(db, TOURNAMENT_ACCOUNTS_COLLECTION, tournamentId);
  
  return onSnapshot(docRef, (snap) => {
    if (snap.exists()) {
      callback({ id: snap.id, ...snap.data() } as TournamentAccount);
    } else {
      callback(null);
    }
  });
};

// ============================================
// REGISTRATION & REVENUE
// ============================================

/**
 * Record a player registration payment
 */
export const recordTournamentRegistration = async (
  tournamentId: string,
  playerId: string,
  playerName: string,
  divisionId: string,
  amount: number,
  platformFee: number,
  transactionId: string
): Promise<void> => {
  const docRef = doc(db, TOURNAMENT_ACCOUNTS_COLLECTION, tournamentId);
  const account = await getTournamentAccount(tournamentId);
  
  if (!account) {
    throw new Error(`Tournament account not found: ${tournamentId}`);
  }
  
  const now = Date.now();
  const netAmount = amount - platformFee;
  
  // Update player payment status
  const playerStatus: PlayerPaymentStatus = {
    odUserId: playerId,
    displayName: playerName,
    divisionId,
    status: 'paid',
    amountDue: amount,
    amountPaid: amount,
    transactionId,
    paidAt: now,
  };
  
  await updateDoc(docRef, {
    totalRevenue: increment(amount),
    platformFees: increment(platformFee),
    netRevenue: increment(netAmount),
    entryFeesCollected: increment(amount),
    paidPlayerCount: increment(1),
    [`divisionRevenue.${divisionId}.collected`]: increment(amount),
    [`divisionRevenue.${divisionId}.playerCount`]: increment(1),
    [`playerPaymentStatus.${playerId}`]: playerStatus,
    updatedAt: now,
  });
};

/**
 * Record a player refund
 */
export const recordTournamentRefund = async (
  tournamentId: string,
  playerId: string,
  divisionId: string,
  amount: number,
  platformFeeRefunded: number = 0
): Promise<void> => {
  const docRef = doc(db, TOURNAMENT_ACCOUNTS_COLLECTION, tournamentId);
  const account = await getTournamentAccount(tournamentId);
  
  if (!account) {
    throw new Error(`Tournament account not found: ${tournamentId}`);
  }
  
  const now = Date.now();
  const netRefund = amount - platformFeeRefunded;
  
  // Get current player status
  const currentStatus = account.playerPaymentStatus[playerId];
  
  await updateDoc(docRef, {
    totalRefunded: increment(amount),
    platformFees: increment(-platformFeeRefunded),
    netRevenue: increment(-netRefund),
    entryFeesCollected: increment(-amount),
    [`divisionRevenue.${divisionId}.collected`]: increment(-amount),
    [`divisionRevenue.${divisionId}.refunded`]: increment(amount),
    [`playerPaymentStatus.${playerId}.status`]: 'refunded',
    [`playerPaymentStatus.${playerId}.refundedAt`]: now,
    [`playerPaymentStatus.${playerId}.amountPaid`]: (currentStatus?.amountPaid ?? amount) - amount,
    updatedAt: now,
  });
};

/**
 * Mark a player as requiring payment (for invoiced/pay-later)
 */
export const markPlayerPaymentPending = async (
  tournamentId: string,
  playerId: string,
  playerName: string,
  divisionId: string,
  amountDue: number
): Promise<void> => {
  const docRef = doc(db, TOURNAMENT_ACCOUNTS_COLLECTION, tournamentId);
  await getTournamentAccount(tournamentId);
  
  const playerStatus: PlayerPaymentStatus = {
    odUserId: playerId,
    displayName: playerName,
    divisionId,
    status: 'pending',
    amountDue,
    amountPaid: 0,
  };
  
  await updateDoc(docRef, {
    entryFeesPending: increment(amountDue),
    unpaidPlayerCount: increment(1),
    [`divisionRevenue.${divisionId}.pending`]: increment(amountDue),
    [`playerPaymentStatus.${playerId}`]: playerStatus,
    updatedAt: Date.now(),
  });
};

/**
 * Waive a player's fee
 */
export const waivePlayerFee = async (
  tournamentId: string,
  playerId: string,
  reason: string
): Promise<void> => {
  const docRef = doc(db, TOURNAMENT_ACCOUNTS_COLLECTION, tournamentId);
  const account = await getTournamentAccount(tournamentId);
  
  if (!account) {
    throw new Error(`Tournament account not found: ${tournamentId}`);
  }
  
  const playerStatus = account.playerPaymentStatus[playerId];
  if (!playerStatus) {
    throw new Error(`Player not found in tournament: ${playerId}`);
  }
  
  const amountWaived = playerStatus.amountDue - playerStatus.amountPaid;
  
  await updateDoc(docRef, {
    entryFeesPending: increment(-amountWaived),
    unpaidPlayerCount: increment(-1),
    [`divisionRevenue.${playerStatus.divisionId}.pending`]: increment(-amountWaived),
    [`playerPaymentStatus.${playerId}.status`]: 'waived',
    [`playerPaymentStatus.${playerId}.waivedReason`]: reason,
    updatedAt: Date.now(),
  });
};

// ============================================
// DIVISION MANAGEMENT
// ============================================

/**
 * Initialize a division's revenue tracking
 */
export const initializeDivision = async (
  tournamentId: string,
  divisionId: string,
  divisionName: string,
  entryFee: number
): Promise<void> => {
  const docRef = doc(db, TOURNAMENT_ACCOUNTS_COLLECTION, tournamentId);
  
  const divisionRevenue: DivisionRevenue = {
    divisionId,
    divisionName,
    entryFee,
    playerCount: 0,
    collected: 0,
    pending: 0,
    refunded: 0,
  };
  
  await updateDoc(docRef, {
    [`divisionRevenue.${divisionId}`]: divisionRevenue,
    updatedAt: Date.now(),
  });
};

/**
 * Update division entry fee
 */
export const updateDivisionEntryFee = async (
  tournamentId: string,
  divisionId: string,
  newEntryFee: number
): Promise<void> => {
  const docRef = doc(db, TOURNAMENT_ACCOUNTS_COLLECTION, tournamentId);
  
  await updateDoc(docRef, {
    [`divisionRevenue.${divisionId}.entryFee`]: newEntryFee,
    updatedAt: Date.now(),
  });
};

/**
 * Get division revenue summary
 */
export const getDivisionRevenue = async (
  tournamentId: string,
  divisionId: string
): Promise<DivisionRevenue | null> => {
  const account = await getTournamentAccount(tournamentId);
  if (!account) return null;
  
  return account.divisionRevenue[divisionId] ?? null;
};

// ============================================
// EXPENSES
// ============================================

/**
 * Record an expense for the tournament
 */
export const recordTournamentExpense = async (
  tournamentId: string,
  category: string,
  amount: number,
  description?: string
): Promise<void> => {
  const docRef = doc(db, TOURNAMENT_ACCOUNTS_COLLECTION, tournamentId);
  const account = await getTournamentAccount(tournamentId);
  
  if (!account) {
    throw new Error(`Tournament account not found: ${tournamentId}`);
  }
  
  const currentCategoryTotal = account.expenses[category] ?? 0;
  const newNetProfit = account.netRevenue - account.totalExpenses - amount;
  
  await updateDoc(docRef, {
    [`expenses.${category}`]: currentCategoryTotal + amount,
    totalExpenses: increment(amount),
    netProfit: newNetProfit,
    updatedAt: Date.now(),
  });
};

/**
 * Remove/adjust an expense
 */
export const adjustTournamentExpense = async (
  tournamentId: string,
  category: string,
  newAmount: number
): Promise<void> => {
  const docRef = doc(db, TOURNAMENT_ACCOUNTS_COLLECTION, tournamentId);
  const account = await getTournamentAccount(tournamentId);
  
  if (!account) {
    throw new Error(`Tournament account not found: ${tournamentId}`);
  }
  
  const currentCategoryTotal = account.expenses[category] ?? 0;
  const difference = newAmount - currentCategoryTotal;
  const newTotalExpenses = account.totalExpenses + difference;
  const newNetProfit = account.netRevenue - newTotalExpenses;
  
  await updateDoc(docRef, {
    [`expenses.${category}`]: newAmount,
    totalExpenses: newTotalExpenses,
    netProfit: newNetProfit,
    updatedAt: Date.now(),
  });
};

/**
 * Get expenses summary
 */
export const getTournamentExpenses = async (
  tournamentId: string
): Promise<Record<string, number>> => {
  const account = await getTournamentAccount(tournamentId);
  return account?.expenses ?? {};
};

// ============================================
// PLAYER QUERIES
// ============================================

/**
 * Get all players' payment status
 */
export const getPlayerPaymentStatuses = async (
  tournamentId: string
): Promise<Record<string, PlayerPaymentStatus>> => {
  const account = await getTournamentAccount(tournamentId);
  return account?.playerPaymentStatus ?? {};
};

/**
 * Get unpaid players
 */
export const getUnpaidPlayers = async (
  tournamentId: string
): Promise<PlayerPaymentStatus[]> => {
  const account = await getTournamentAccount(tournamentId);
  if (!account) return [];
  
  return Object.values(account.playerPaymentStatus)
    .filter(p => p.status === 'pending' || p.status === 'partial');
};

/**
 * Get paid players
 */
export const getPaidPlayers = async (
  tournamentId: string
): Promise<PlayerPaymentStatus[]> => {
  const account = await getTournamentAccount(tournamentId);
  if (!account) return [];
  
  return Object.values(account.playerPaymentStatus)
    .filter(p => p.status === 'paid');
};

/**
 * Get player payment status
 */
export const getPlayerPaymentStatus = async (
  tournamentId: string,
  playerId: string
): Promise<PlayerPaymentStatus | null> => {
  const account = await getTournamentAccount(tournamentId);
  return account?.playerPaymentStatus[playerId] ?? null;
};

// ============================================
// FINANCIAL SUMMARY
// ============================================

/**
 * Get tournament financial summary
 */
export const getTournamentFinancialSummary = async (
  tournamentId: string
): Promise<{
  totalRevenue: number;
  totalRefunded: number;
  netRevenue: number;
  platformFees: number;
  totalExpenses: number;
  netProfit: number;
  paidPlayerCount: number;
  unpaidPlayerCount: number;
  collectionRate: number;
} | null> => {
  const account = await getTournamentAccount(tournamentId);
  if (!account) return null;
  
  const totalPlayers = account.paidPlayerCount + account.unpaidPlayerCount;
  const collectionRate = totalPlayers > 0 
    ? (account.paidPlayerCount / totalPlayers) * 100 
    : 0;
  
  return {
    totalRevenue: account.totalRevenue,
    totalRefunded: account.totalRefunded,
    netRevenue: account.netRevenue,
    platformFees: account.platformFees,
    totalExpenses: account.totalExpenses,
    netProfit: account.netProfit,
    paidPlayerCount: account.paidPlayerCount,
    unpaidPlayerCount: account.unpaidPlayerCount,
    collectionRate: Math.round(collectionRate * 10) / 10,
  };
};

// ============================================
// BATCH OPERATIONS
// ============================================

/**
 * Recalculate tournament account from transactions
 */
export const recalculateTournamentAccount = async (
  tournamentId: string,
  transactions: Transaction[],
  organizerId: string,
  entryFee: number,
  clubId?: string
): Promise<TournamentAccount> => {
  // Start fresh
  const account = createEmptyTournamentAccount(tournamentId, organizerId, entryFee, clubId);
  
  // Process all transactions
  for (const tx of transactions) {
    if (tx.status !== 'completed') continue;
    if (tx.tournamentId !== tournamentId) continue;
    
    const platformFee = tx.breakdown?.fees ?? 0;
    
    switch (tx.type) {
      case 'payment':
        account.totalRevenue += tx.amount;
        account.platformFees += platformFee;
        account.netRevenue += (tx.amount - platformFee);
        account.entryFeesCollected += tx.amount;
        account.paidPlayerCount++;
        break;
        
      case 'refund':
        account.totalRefunded += Math.abs(tx.amount);
        account.netRevenue -= Math.abs(tx.amount);
        break;
    }
  }
  
  // Calculate net profit
  account.netProfit = account.netRevenue - account.totalExpenses;
  account.updatedAt = Date.now();
  
  // Save recalculated account
  const docRef = doc(db, TOURNAMENT_ACCOUNTS_COLLECTION, tournamentId);
  await setDoc(docRef, account);
  
  return account;
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Common expense categories for tournaments
 */
export const TOURNAMENT_EXPENSE_CATEGORIES = [
  'venue',
  'equipment',
  'prizes',
  'catering',
  'officials',
  'marketing',
  'insurance',
  'other',
] as const;

export type TournamentExpenseCategory = typeof TOURNAMENT_EXPENSE_CATEGORIES[number];

/**
 * Get expense category label
 */
export const getExpenseCategoryLabel = (category: string): string => {
  const labels: Record<string, string> = {
    venue: 'Venue Hire',
    equipment: 'Equipment',
    prizes: 'Prizes & Trophies',
    catering: 'Catering',
    officials: 'Officials & Referees',
    marketing: 'Marketing',
    insurance: 'Insurance',
    other: 'Other',
  };
  
  return labels[category] || category;
};
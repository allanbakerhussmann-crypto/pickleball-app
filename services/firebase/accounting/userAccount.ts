/**
 * User Account Service
 * 
 * Manages user financial accounts including:
 * - Lifetime spending totals
 * - Spending by category and club
 * - Monthly spending trends
 * - Wallet and pass counts
 * 
 * All amounts are in CENTS.
 * 
 * FILE LOCATION: services/firebase/accounting/userAccount.ts
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
  UserAccount,
  SpendingByCategory,
  UserFinancialSummary,
  UserClubFinancialSummary,
  TransactionSummary,
} from './types';
import { createEmptyUserAccount } from './types';
import type { 
  Transaction, 
  ReferenceType,
  Wallet,
  AnnualPass,
} from '../payments/types';

// ============================================
// CONSTANTS
// ============================================

const USER_ACCOUNTS_COLLECTION = 'userAccounts';

// ============================================
// GET & CREATE USER ACCOUNT
// ============================================

/**
 * Get a user's financial account
 * Returns null if account doesn't exist
 */
export const getUserAccount = async (
  userId: string
): Promise<UserAccount | null> => {
  const docRef = doc(db, USER_ACCOUNTS_COLLECTION, userId);
  const snap = await getDoc(docRef);
  
  if (!snap.exists()) {
    return null;
  }
  
  return { id: snap.id, ...snap.data() } as UserAccount;
};

/**
 * Get or create a user's financial account
 */
export const getOrCreateUserAccount = async (
  userId: string
): Promise<UserAccount> => {
  const existing = await getUserAccount(userId);
  if (existing) {
    return existing;
  }
  
  // Create new account
  const newAccount = createEmptyUserAccount(userId);
  const docRef = doc(db, USER_ACCOUNTS_COLLECTION, userId);
  await setDoc(docRef, newAccount);
  
  return newAccount;
};

/**
 * Subscribe to real-time user account updates
 */
export const subscribeToUserAccount = (
  userId: string,
  callback: (account: UserAccount | null) => void
): Unsubscribe => {
  const docRef = doc(db, USER_ACCOUNTS_COLLECTION, userId);
  
  return onSnapshot(docRef, (snap) => {
    if (snap.exists()) {
      callback({ id: snap.id, ...snap.data() } as UserAccount);
    } else {
      callback(null);
    }
  });
};

// ============================================
// UPDATE OPERATIONS
// ============================================

/**
 * Record a payment in the user's account
 * Call this after a successful transaction
 */
export const recordUserPayment = async (
  userId: string,
  transaction: {
    amount: number;
    referenceType: ReferenceType;
    clubId?: string;
  }
): Promise<void> => {
  const docRef = doc(db, USER_ACCOUNTS_COLLECTION, userId);
  const account = await getOrCreateUserAccount(userId);
  
  const now = Date.now();
  const monthKey = getMonthKey(now);
  
  // Build category key
  const categoryKey = mapReferenceTypeToCategory(transaction.referenceType);
  
  // Build updates
  const updates: Record<string, any> = {
    totalSpent: increment(transaction.amount),
    transactionCount: increment(1),
    [`spendingByCategory.${categoryKey}`]: increment(transaction.amount),
    [`spendingByMonth.${monthKey}`]: increment(transaction.amount),
    lastPaymentAt: now,
    updatedAt: now,
  };
  
  // Set first payment date if not set
  if (!account.firstPaymentAt) {
    updates.firstPaymentAt = now;
  }
  
  // Update club spending if club provided
  if (transaction.clubId) {
    updates[`spendingByClub.${transaction.clubId}`] = increment(transaction.amount);
  }
  
  await updateDoc(docRef, updates);
};

/**
 * Record a refund in the user's account
 */
export const recordUserRefund = async (
  userId: string,
  amount: number,
  clubId?: string
): Promise<void> => {
  const docRef = doc(db, USER_ACCOUNTS_COLLECTION, userId);
  await getOrCreateUserAccount(userId);
  
  const now = Date.now();
  const monthKey = getMonthKey(now);
  
  const updates: Record<string, any> = {
    totalRefunded: increment(amount),
    // Subtract from month spending
    [`spendingByMonth.${monthKey}`]: increment(-amount),
    updatedAt: now,
  };
  
  // Subtract from club spending if club provided
  if (clubId) {
    updates[`spendingByClub.${clubId}`] = increment(-amount);
  }
  
  await updateDoc(docRef, updates);
};

/**
 * Record a wallet top-up
 */
export const recordUserTopUp = async (
  userId: string,
  amount: number
): Promise<void> => {
  const docRef = doc(db, USER_ACCOUNTS_COLLECTION, userId);
  await getOrCreateUserAccount(userId);
  
  const now = Date.now();
  const monthKey = getMonthKey(now);
  
  await updateDoc(docRef, {
    totalTopUps: increment(amount),
    transactionCount: increment(1),
    [`spendingByCategory.wallet_topup`]: increment(amount),
    [`spendingByMonth.${monthKey}`]: increment(amount),
    updatedAt: now,
  });
};

/**
 * Update wallet count for user
 */
export const updateUserWalletCount = async (
  userId: string,
  delta: number
): Promise<void> => {
  const docRef = doc(db, USER_ACCOUNTS_COLLECTION, userId);
  await getOrCreateUserAccount(userId);
  
  await updateDoc(docRef, {
    activeWalletCount: increment(delta),
    updatedAt: Date.now(),
  });
};

/**
 * Update pass count for user
 */
export const updateUserPassCount = async (
  userId: string,
  delta: number
): Promise<void> => {
  const docRef = doc(db, USER_ACCOUNTS_COLLECTION, userId);
  await getOrCreateUserAccount(userId);
  
  await updateDoc(docRef, {
    activePassCount: increment(delta),
    updatedAt: Date.now(),
  });
};

// ============================================
// SPENDING QUERIES
// ============================================

/**
 * Get user's total spending
 */
export const getUserTotalSpending = async (
  userId: string
): Promise<number> => {
  const account = await getUserAccount(userId);
  return account?.totalSpent ?? 0;
};

/**
 * Get user's spending for a specific month
 */
export const getUserMonthlySpending = async (
  userId: string,
  year: number,
  month: number
): Promise<number> => {
  const account = await getUserAccount(userId);
  if (!account) return 0;
  
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  return account.spendingByMonth[monthKey] ?? 0;
};

/**
 * Get user's spending for a specific club
 */
export const getUserClubSpending = async (
  userId: string,
  clubId: string
): Promise<number> => {
  const account = await getUserAccount(userId);
  if (!account) return 0;
  
  return account.spendingByClub[clubId] ?? 0;
};

/**
 * Get user's spending by category
 */
export const getUserSpendingByCategory = async (
  userId: string
): Promise<SpendingByCategory> => {
  const account = await getUserAccount(userId);
  if (!account) {
    return createEmptyUserAccount(userId).spendingByCategory;
  }
  
  return account.spendingByCategory;
};

/**
 * Get user's spending trend (last N months)
 */
export const getUserSpendingTrend = async (
  userId: string,
  months: number = 6
): Promise<{ month: string; amount: number }[]> => {
  const account = await getUserAccount(userId);
  if (!account) return [];
  
  const trend: { month: string; amount: number }[] = [];
  const now = new Date();
  
  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = getMonthKey(date.getTime());
    trend.push({
      month: monthKey,
      amount: account.spendingByMonth[monthKey] ?? 0,
    });
  }
  
  return trend;
};

/**
 * Get user's top clubs by spending
 */
export const getUserTopClubs = async (
  userId: string,
  limit: number = 5
): Promise<{ clubId: string; amount: number }[]> => {
  const account = await getUserAccount(userId);
  if (!account) return [];
  
  const clubs = Object.entries(account.spendingByClub)
    .map(([clubId, amount]) => ({ clubId, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
  
  return clubs;
};

// ============================================
// FINANCIAL SUMMARY
// ============================================

/**
 * Get comprehensive financial summary for a user
 * Includes data from wallets, passes, and transactions
 */
export const getUserFinancialSummary = async (
  userId: string,
  wallets: Wallet[],
  passes: AnnualPass[],
  recentTransactions: Transaction[],
  clubNames: Record<string, string>
): Promise<UserFinancialSummary> => {
  const account = await getOrCreateUserAccount(userId);
  
  // Calculate total wallet balance
  const totalWalletBalance = wallets.reduce((sum, w) => sum + w.balance, 0);
  
  // Count active passes
  const now = new Date().toISOString().split('T')[0];
  const activePassesCount = passes.filter(p => 
    p.status === 'active' && p.startDate <= now && p.endDate >= now
  ).length;
  
  // Build club summaries
  const byClub: UserClubFinancialSummary[] = [];
  const clubIds = new Set<string>();
  
  // Add clubs from wallets
  wallets.forEach(w => clubIds.add(w.odClubId));
  // Add clubs from passes
  passes.forEach(p => clubIds.add(p.odClubId));
  // Add clubs from spending
  Object.keys(account.spendingByClub).forEach(id => clubIds.add(id));
  
  for (const clubId of clubIds) {
    const wallet = wallets.find(w => w.odClubId === clubId);
    const pass = passes.find(p => 
      p.odClubId === clubId && 
      p.status === 'active' && 
      p.startDate <= now && 
      p.endDate >= now
    );
    
    byClub.push({
      clubId,
      clubName: clubNames[clubId] || 'Unknown Club',
      walletBalance: wallet?.balance ?? 0,
      totalSpent: account.spendingByClub[clubId] ?? 0,
      hasActivePass: !!pass,
      passExpiresAt: pass?.endDate,
    });
  }
  
  // Sort by total spent
  byClub.sort((a, b) => b.totalSpent - a.totalSpent);
  
  // Build recent transactions summary
  const recentTxSummary: TransactionSummary[] = recentTransactions
    .slice(0, 10)
    .map(tx => ({
      id: tx.id,
      type: tx.type,
      amount: tx.amount,
      description: tx.referenceName,
      date: tx.createdAt,
      status: tx.status,
    }));
  
  // Calculate month-over-month change
  const currentMonth = getMonthKey(Date.now());
  const lastMonth = getMonthKey(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const thisMonthSpending = account.spendingByMonth[currentMonth] ?? 0;
  const lastMonthSpending = account.spendingByMonth[lastMonth] ?? 0;
  const monthOverMonthChange = lastMonthSpending > 0 
    ? ((thisMonthSpending - lastMonthSpending) / lastMonthSpending) * 100 
    : 0;
  
  return {
    userId,
    totalSpent: account.totalSpent,
    totalWalletBalance,
    activePassesCount,
    byClub,
    recentTransactions: recentTxSummary,
    thisMonth: thisMonthSpending,
    lastMonth: lastMonthSpending,
    monthOverMonthChange: Math.round(monthOverMonthChange * 10) / 10,
    generatedAt: Date.now(),
  };
};

// ============================================
// BATCH OPERATIONS
// ============================================

/**
 * Recalculate user account from transactions
 * Use this to fix discrepancies or rebuild account data
 */
export const recalculateUserAccount = async (
  userId: string,
  transactions: Transaction[],
  wallets: Wallet[],
  passes: AnnualPass[]
): Promise<UserAccount> => {
  // Start fresh
  const account = createEmptyUserAccount(userId);
  
  // Process all transactions
  for (const tx of transactions) {
    if (tx.status !== 'completed') continue;
    
    const monthKey = getMonthKey(tx.createdAt);
    const categoryKey = mapReferenceTypeToCategory(tx.referenceType);
    
    switch (tx.type) {
      case 'payment':
        account.totalSpent += tx.amount;
        account.transactionCount++;
        account.spendingByCategory[categoryKey] = 
          (account.spendingByCategory[categoryKey] || 0) + tx.amount;
        account.spendingByMonth[monthKey] = 
          (account.spendingByMonth[monthKey] || 0) + tx.amount;
        if (tx.odClubId) {
          account.spendingByClub[tx.odClubId] = 
            (account.spendingByClub[tx.odClubId] || 0) + tx.amount;
        }
        if (!account.firstPaymentAt || tx.createdAt < account.firstPaymentAt) {
          account.firstPaymentAt = tx.createdAt;
        }
        if (!account.lastPaymentAt || tx.createdAt > account.lastPaymentAt) {
          account.lastPaymentAt = tx.createdAt;
        }
        break;
        
      case 'topup':
        account.totalTopUps += tx.amount;
        account.transactionCount++;
        account.spendingByCategory.wallet_topup += tx.amount;
        account.spendingByMonth[monthKey] = 
          (account.spendingByMonth[monthKey] || 0) + tx.amount;
        break;
        
      case 'refund':
        account.totalRefunded += Math.abs(tx.amount);
        break;
    }
  }
  
  // Count active wallets and passes
  account.activeWalletCount = wallets.filter(w => w.status === 'active').length;
  
  const now = new Date().toISOString().split('T')[0];
  account.activePassCount = passes.filter(p => 
    p.status === 'active' && p.startDate <= now && p.endDate >= now
  ).length;
  
  account.updatedAt = Date.now();
  
  // Save recalculated account
  const docRef = doc(db, USER_ACCOUNTS_COLLECTION, userId);
  await setDoc(docRef, account);
  
  return account;
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get month key in YYYY-MM format
 */
const getMonthKey = (timestamp: number): string => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Map reference type to spending category
 */
const mapReferenceTypeToCategory = (
  referenceType: ReferenceType
): keyof SpendingByCategory => {
  const mapping: Record<ReferenceType, keyof SpendingByCategory> = {
    court_booking: 'court_booking',
    tournament: 'tournament',
    league: 'league',
    annual_pass: 'annual_pass',
    wallet_topup: 'wallet_topup',
    membership: 'membership',
    visitor_fee: 'visitor_fee',
  };
  
  return mapping[referenceType] || 'other';
};

/**
 * Format spending amount for display
 */
export const formatSpendingAmount = (
  cents: number,
  currency: string = 'nzd'
): string => {
  const dollars = cents / 100;
  const symbols: Record<string, string> = {
    nzd: 'NZ$',
    aud: 'A$',
    usd: '$',
  };
  return `${symbols[currency] || '$'}${dollars.toFixed(2)}`;
};

/**
 * Get spending category label
 */
export const getSpendingCategoryLabel = (
  category: keyof SpendingByCategory
): string => {
  const labels: Record<keyof SpendingByCategory, string> = {
    court_booking: 'Court Bookings',
    tournament: 'Tournaments',
    league: 'Leagues',
    annual_pass: 'Annual Passes',
    membership: 'Memberships',
    visitor_fee: 'Visitor Fees',
    wallet_topup: 'Wallet Top-ups',
    other: 'Other',
  };
  
  return labels[category] || category;
};
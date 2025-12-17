/**
 * League Account Service
 * 
 * Manages league financial accounts including:
 * - Member fee collection
 * - Season revenue tracking
 * - Member payment status
 * - Expenses and profit calculation
 * 
 * All amounts are in CENTS.
 * 
 * FILE LOCATION: services/firebase/accounting/leagueAccount.ts
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
  LeagueAccount,
  MemberPaymentStatus,
} from './types';
import { createEmptyLeagueAccount } from './types';
import type { 
  Transaction,
  SupportedCurrency,
} from '../payments/types';

// ============================================
// CONSTANTS
// ============================================

const LEAGUE_ACCOUNTS_COLLECTION = 'leagueAccounts';

// ============================================
// GET & CREATE LEAGUE ACCOUNT
// ============================================

/**
 * Get a league's financial account
 * Returns null if account doesn't exist
 */
export const getLeagueAccount = async (
  leagueId: string
): Promise<LeagueAccount | null> => {
  const docRef = doc(db, LEAGUE_ACCOUNTS_COLLECTION, leagueId);
  const snap = await getDoc(docRef);
  
  if (!snap.exists()) {
    return null;
  }
  
  return { id: snap.id, ...snap.data() } as LeagueAccount;
};

/**
 * Get or create a league's financial account
 */
export const getOrCreateLeagueAccount = async (
  leagueId: string,
  organizerId: string,
  memberFee: number = 0,
  clubId?: string
): Promise<LeagueAccount> => {
  const existing = await getLeagueAccount(leagueId);
  if (existing) {
    return existing;
  }
  
  // Create new account
  const newAccount = createEmptyLeagueAccount(leagueId, organizerId, memberFee, clubId);
  const docRef = doc(db, LEAGUE_ACCOUNTS_COLLECTION, leagueId);
  await setDoc(docRef, newAccount);
  
  return newAccount;
};

/**
 * Subscribe to real-time league account updates
 */
export const subscribeToLeagueAccount = (
  leagueId: string,
  callback: (account: LeagueAccount | null) => void
): Unsubscribe => {
  const docRef = doc(db, LEAGUE_ACCOUNTS_COLLECTION, leagueId);
  
  return onSnapshot(docRef, (snap) => {
    if (snap.exists()) {
      callback({ id: snap.id, ...snap.data() } as LeagueAccount);
    } else {
      callback(null);
    }
  });
};

// ============================================
// MEMBER FEE MANAGEMENT
// ============================================

/**
 * Update league member fee
 */
export const updateLeagueMemberFee = async (
  leagueId: string,
  newFee: number
): Promise<void> => {
  const docRef = doc(db, LEAGUE_ACCOUNTS_COLLECTION, leagueId);
  
  await updateDoc(docRef, {
    memberFeePerPerson: newFee,
    updatedAt: Date.now(),
  });
};

/**
 * Get league member fee
 */
export const getLeagueMemberFee = async (
  leagueId: string
): Promise<number> => {
  const account = await getLeagueAccount(leagueId);
  return account?.memberFeePerPerson ?? 0;
};

// ============================================
// MEMBER PAYMENTS
// ============================================

/**
 * Record a member's payment
 */
export const recordLeagueMemberPayment = async (
  leagueId: string,
  memberId: string,
  memberName: string,
  amount: number,
  platformFee: number,
  transactionId: string
): Promise<void> => {
  const docRef = doc(db, LEAGUE_ACCOUNTS_COLLECTION, leagueId);
  const account = await getLeagueAccount(leagueId);
  
  if (!account) {
    throw new Error(`League account not found: ${leagueId}`);
  }
  
  const now = Date.now();
  const netAmount = amount - platformFee;
  
  // Get existing status or create new
  const existingStatus = account.memberPaymentStatus[memberId];
  const amountDue = existingStatus?.amountDue ?? account.memberFeePerPerson;
  const previouslyPaid = existingStatus?.amountPaid ?? 0;
  const newAmountPaid = previouslyPaid + amount;
  
  // Determine new status
  let newStatus: MemberPaymentStatus['status'] = 'paid';
  if (newAmountPaid < amountDue) {
    newStatus = 'partial';
  }
  
  const memberStatus: MemberPaymentStatus = {
    odUserId: memberId,
    displayName: memberName,
    status: newStatus,
    amountDue,
    amountPaid: newAmountPaid,
    transactionId,
    paidAt: now,
  };
  
  // Calculate pending amount change
  const pendingReduction = Math.min(amount, amountDue - previouslyPaid);
  
  await updateDoc(docRef, {
    totalRevenue: increment(amount),
    platformFees: increment(platformFee),
    netRevenue: increment(netAmount),
    memberFeesCollected: increment(amount),
    memberFeesPending: increment(-pendingReduction),
    paidMemberCount: newStatus === 'paid' && existingStatus?.status !== 'paid' ? increment(1) : increment(0),
    unpaidMemberCount: newStatus === 'paid' && existingStatus?.status !== 'paid' ? increment(-1) : increment(0),
    [`memberPaymentStatus.${memberId}`]: memberStatus,
    updatedAt: now,
  });
};

/**
 * Record a member refund
 */
export const recordLeagueMemberRefund = async (
  leagueId: string,
  memberId: string,
  amount: number,
  platformFeeRefunded: number = 0
): Promise<void> => {
  const docRef = doc(db, LEAGUE_ACCOUNTS_COLLECTION, leagueId);
  const account = await getLeagueAccount(leagueId);
  
  if (!account) {
    throw new Error(`League account not found: ${leagueId}`);
  }
  
  const now = Date.now();
  const netRefund = amount - platformFeeRefunded;
  
  // Get current member status
  const currentStatus = account.memberPaymentStatus[memberId];
  if (!currentStatus) {
    throw new Error(`Member not found in league: ${memberId}`);
  }
  
  const newAmountPaid = Math.max(0, currentStatus.amountPaid - amount);
  let newStatus: MemberPaymentStatus['status'] = 'refunded';
  if (newAmountPaid > 0 && newAmountPaid < currentStatus.amountDue) {
    newStatus = 'partial';
  } else if (newAmountPaid >= currentStatus.amountDue) {
    newStatus = 'paid';
  }
  
  await updateDoc(docRef, {
    totalRefunded: increment(amount),
    platformFees: increment(-platformFeeRefunded),
    netRevenue: increment(-netRefund),
    memberFeesCollected: increment(-amount),
    [`memberPaymentStatus.${memberId}.status`]: newStatus,
    [`memberPaymentStatus.${memberId}.amountPaid`]: newAmountPaid,
    [`memberPaymentStatus.${memberId}.refundedAt`]: now,
    updatedAt: now,
  });
};

/**
 * Add a member with pending payment
 */
export const addLeagueMemberPending = async (
  leagueId: string,
  memberId: string,
  memberName: string,
  amountDue?: number
): Promise<void> => {
  const docRef = doc(db, LEAGUE_ACCOUNTS_COLLECTION, leagueId);
  const account = await getLeagueAccount(leagueId);
  
  if (!account) {
    throw new Error(`League account not found: ${leagueId}`);
  }
  
  const fee = amountDue ?? account.memberFeePerPerson;
  
  const memberStatus: MemberPaymentStatus = {
    odUserId: memberId,
    displayName: memberName,
    status: fee > 0 ? 'pending' : 'paid', // Free leagues are auto-paid
    amountDue: fee,
    amountPaid: 0,
  };
  
  const updates: Record<string, any> = {
    [`memberPaymentStatus.${memberId}`]: memberStatus,
    updatedAt: Date.now(),
  };
  
  if (fee > 0) {
    updates.memberFeesPending = increment(fee);
    updates.unpaidMemberCount = increment(1);
  } else {
    updates.paidMemberCount = increment(1);
  }
  
  await updateDoc(docRef, updates);
};

/**
 * Remove a member from the league
 */
export const removeLeagueMember = async (
  leagueId: string,
  memberId: string
): Promise<void> => {
  const docRef = doc(db, LEAGUE_ACCOUNTS_COLLECTION, leagueId);
  const account = await getLeagueAccount(leagueId);
  
  if (!account) {
    throw new Error(`League account not found: ${leagueId}`);
  }
  
  const memberStatus = account.memberPaymentStatus[memberId];
  if (!memberStatus) {
    return; // Already removed
  }
  
  const updates: Record<string, any> = {
    [`memberPaymentStatus.${memberId}`]: null, // Remove the field
    updatedAt: Date.now(),
  };
  
  // Update counts based on status
  if (memberStatus.status === 'paid') {
    updates.paidMemberCount = increment(-1);
  } else if (memberStatus.status === 'pending' || memberStatus.status === 'partial') {
    updates.unpaidMemberCount = increment(-1);
    updates.memberFeesPending = increment(-(memberStatus.amountDue - memberStatus.amountPaid));
  }
  
  await updateDoc(docRef, updates);
};

/**
 * Waive a member's fee
 */
export const waiveLeagueMemberFee = async (
  leagueId: string,
  memberId: string,
  reason: string
): Promise<void> => {
  const docRef = doc(db, LEAGUE_ACCOUNTS_COLLECTION, leagueId);
  const account = await getLeagueAccount(leagueId);
  
  if (!account) {
    throw new Error(`League account not found: ${leagueId}`);
  }
  
  const memberStatus = account.memberPaymentStatus[memberId];
  if (!memberStatus) {
    throw new Error(`Member not found in league: ${memberId}`);
  }
  
  const amountWaived = memberStatus.amountDue - memberStatus.amountPaid;
  
  const updates: Record<string, any> = {
    [`memberPaymentStatus.${memberId}.status`]: 'waived',
    [`memberPaymentStatus.${memberId}.waivedReason`]: reason,
    updatedAt: Date.now(),
  };
  
  if (amountWaived > 0) {
    updates.memberFeesPending = increment(-amountWaived);
    updates.unpaidMemberCount = increment(-1);
    updates.paidMemberCount = increment(1);
  }
  
  await updateDoc(docRef, updates);
};

// ============================================
// EXPENSES
// ============================================

/**
 * Record an expense for the league
 */
export const recordLeagueExpense = async (
  leagueId: string,
  category: string,
  amount: number,
  description?: string
): Promise<void> => {
  const docRef = doc(db, LEAGUE_ACCOUNTS_COLLECTION, leagueId);
  const account = await getLeagueAccount(leagueId);
  
  if (!account) {
    throw new Error(`League account not found: ${leagueId}`);
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
 * Adjust an expense category
 */
export const adjustLeagueExpense = async (
  leagueId: string,
  category: string,
  newAmount: number
): Promise<void> => {
  const docRef = doc(db, LEAGUE_ACCOUNTS_COLLECTION, leagueId);
  const account = await getLeagueAccount(leagueId);
  
  if (!account) {
    throw new Error(`League account not found: ${leagueId}`);
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
export const getLeagueExpenses = async (
  leagueId: string
): Promise<Record<string, number>> => {
  const account = await getLeagueAccount(leagueId);
  return account?.expenses ?? {};
};

// ============================================
// MEMBER QUERIES
// ============================================

/**
 * Get all members' payment status
 */
export const getMemberPaymentStatuses = async (
  leagueId: string
): Promise<Record<string, MemberPaymentStatus>> => {
  const account = await getLeagueAccount(leagueId);
  return account?.memberPaymentStatus ?? {};
};

/**
 * Get unpaid members
 */
export const getUnpaidMembers = async (
  leagueId: string
): Promise<MemberPaymentStatus[]> => {
  const account = await getLeagueAccount(leagueId);
  if (!account) return [];
  
  return Object.values(account.memberPaymentStatus)
    .filter(m => m.status === 'pending' || m.status === 'partial');
};

/**
 * Get paid members
 */
export const getPaidMembers = async (
  leagueId: string
): Promise<MemberPaymentStatus[]> => {
  const account = await getLeagueAccount(leagueId);
  if (!account) return [];
  
  return Object.values(account.memberPaymentStatus)
    .filter(m => m.status === 'paid' || m.status === 'waived');
};

/**
 * Get member payment status
 */
export const getMemberPaymentStatus = async (
  leagueId: string,
  memberId: string
): Promise<MemberPaymentStatus | null> => {
  const account = await getLeagueAccount(leagueId);
  return account?.memberPaymentStatus[memberId] ?? null;
};

// ============================================
// FINANCIAL SUMMARY
// ============================================

/**
 * Get league financial summary
 */
export const getLeagueFinancialSummary = async (
  leagueId: string
): Promise<{
  totalRevenue: number;
  totalRefunded: number;
  netRevenue: number;
  platformFees: number;
  memberFeesCollected: number;
  memberFeesPending: number;
  totalExpenses: number;
  netProfit: number;
  paidMemberCount: number;
  unpaidMemberCount: number;
  collectionRate: number;
} | null> => {
  const account = await getLeagueAccount(leagueId);
  if (!account) return null;
  
  const totalMembers = account.paidMemberCount + account.unpaidMemberCount;
  const collectionRate = totalMembers > 0 
    ? (account.paidMemberCount / totalMembers) * 100 
    : 0;
  
  return {
    totalRevenue: account.totalRevenue,
    totalRefunded: account.totalRefunded,
    netRevenue: account.netRevenue,
    platformFees: account.platformFees,
    memberFeesCollected: account.memberFeesCollected,
    memberFeesPending: account.memberFeesPending,
    totalExpenses: account.totalExpenses,
    netProfit: account.netProfit,
    paidMemberCount: account.paidMemberCount,
    unpaidMemberCount: account.unpaidMemberCount,
    collectionRate: Math.round(collectionRate * 10) / 10,
  };
};

// ============================================
// SEASON MANAGEMENT
// ============================================

/**
 * Reset league for new season
 * Preserves settings but clears financial data
 */
export const resetLeagueForNewSeason = async (
  leagueId: string,
  newMemberFee?: number
): Promise<void> => {
  const docRef = doc(db, LEAGUE_ACCOUNTS_COLLECTION, leagueId);
  const account = await getLeagueAccount(leagueId);
  
  if (!account) {
    throw new Error(`League account not found: ${leagueId}`);
  }
  
  // Create fresh account but preserve some settings
  const resetAccount = createEmptyLeagueAccount(
    leagueId,
    account.organizerId,
    newMemberFee ?? account.memberFeePerPerson,
    account.odClubId
  );
  
  await setDoc(docRef, resetAccount);
};

// ============================================
// BATCH OPERATIONS
// ============================================

/**
 * Recalculate league account from transactions
 */
export const recalculateLeagueAccount = async (
  leagueId: string,
  transactions: Transaction[],
  organizerId: string,
  memberFee: number,
  clubId?: string
): Promise<LeagueAccount> => {
  // Start fresh
  const account = createEmptyLeagueAccount(leagueId, organizerId, memberFee, clubId);
  
  // Process all transactions
  for (const tx of transactions) {
    if (tx.status !== 'completed') continue;
    if (tx.leagueId !== leagueId) continue;
    
    const platformFee = tx.breakdown?.fees ?? 0;
    
    switch (tx.type) {
      case 'payment':
        account.totalRevenue += tx.amount;
        account.platformFees += platformFee;
        account.netRevenue += (tx.amount - platformFee);
        account.memberFeesCollected += tx.amount;
        account.paidMemberCount++;
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
  const docRef = doc(db, LEAGUE_ACCOUNTS_COLLECTION, leagueId);
  await setDoc(docRef, account);
  
  return account;
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Common expense categories for leagues
 */
export const LEAGUE_EXPENSE_CATEGORIES = [
  'venue',
  'equipment',
  'balls',
  'prizes',
  'officials',
  'admin',
  'insurance',
  'other',
] as const;

export type LeagueExpenseCategory = typeof LEAGUE_EXPENSE_CATEGORIES[number];

/**
 * Get expense category label
 */
export const getLeagueExpenseCategoryLabel = (category: string): string => {
  const labels: Record<string, string> = {
    venue: 'Venue Hire',
    equipment: 'Equipment',
    balls: 'Balls',
    prizes: 'Prizes',
    officials: 'Officials',
    admin: 'Admin & Software',
    insurance: 'Insurance',
    other: 'Other',
  };
  
  return labels[category] || category;
};

/**
 * Calculate per-member cost
 */
export const calculatePerMemberCost = (
  totalExpenses: number,
  memberCount: number
): number => {
  if (memberCount === 0) return 0;
  return Math.ceil(totalExpenses / memberCount);
};

/**
 * Suggest member fee based on expenses and desired margin
 */
export const suggestMemberFee = (
  totalExpenses: number,
  memberCount: number,
  marginPercent: number = 10
): number => {
  const perMemberCost = calculatePerMemberCost(totalExpenses, memberCount);
  const margin = Math.ceil(perMemberCost * (marginPercent / 100));
  return perMemberCost + margin;
};
/**
 * Club Account Service
 * 
 * Manages club financial accounts including:
 * - Revenue tracking by source
 * - Platform fee tracking
 * - Payout management
 * - Member financial statistics
 * - Monthly revenue trends
 * 
 * All amounts are in CENTS.
 * 
 * FILE LOCATION: services/firebase/accounting/clubAccount.ts
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
  orderBy,
  limit,
  onSnapshot,
  increment,
  runTransaction,
  type Unsubscribe,
} from '@firebase/firestore';
import { db } from '../config';
import type {
  ClubAccount,
  RevenueBySource,
  PaymentMethodBreakdown,
  ClubFinancialSummary,
} from './types';
import { createEmptyClubAccount } from './types';
import type { 
  Transaction, 
  ReferenceType,
  PaymentMethod,
  Wallet,
  AnnualPass,
  Payout,
  PayoutSettings,
  SupportedCurrency,
} from '../payments/types';

// ============================================
// CONSTANTS
// ============================================

const CLUB_ACCOUNTS_COLLECTION = 'clubAccounts';

// ============================================
// GET & CREATE CLUB ACCOUNT
// ============================================

/**
 * Get a club's financial account
 * Returns null if account doesn't exist
 */
export const getClubAccount = async (
  clubId: string
): Promise<ClubAccount | null> => {
  const docRef = doc(db, CLUB_ACCOUNTS_COLLECTION, clubId);
  const snap = await getDoc(docRef);
  
  if (!snap.exists()) {
    return null;
  }
  
  return { id: snap.id, ...snap.data() } as ClubAccount;
};

/**
 * Get or create a club's financial account
 */
export const getOrCreateClubAccount = async (
  clubId: string,
  currency: SupportedCurrency = 'nzd'
): Promise<ClubAccount> => {
  const existing = await getClubAccount(clubId);
  if (existing) {
    return existing;
  }
  
  // Create new account
  const newAccount = createEmptyClubAccount(clubId, currency);
  const docRef = doc(db, CLUB_ACCOUNTS_COLLECTION, clubId);
  await setDoc(docRef, newAccount);
  
  return newAccount;
};

/**
 * Subscribe to real-time club account updates
 */
export const subscribeToClubAccount = (
  clubId: string,
  callback: (account: ClubAccount | null) => void
): Unsubscribe => {
  const docRef = doc(db, CLUB_ACCOUNTS_COLLECTION, clubId);
  
  return onSnapshot(docRef, (snap) => {
    if (snap.exists()) {
      callback({ id: snap.id, ...snap.data() } as ClubAccount);
    } else {
      callback(null);
    }
  });
};

// ============================================
// REVENUE RECORDING
// ============================================

/**
 * Record revenue from a transaction
 * Call this after a successful payment
 */
export const recordClubRevenue = async (
  clubId: string,
  transaction: {
    amount: number;
    referenceType: ReferenceType;
    paymentMethod: PaymentMethod;
    platformFee: number;
  }
): Promise<void> => {
  const docRef = doc(db, CLUB_ACCOUNTS_COLLECTION, clubId);
  await getOrCreateClubAccount(clubId);
  
  const now = Date.now();
  const monthKey = getMonthKey(now);
  
  // Map reference type to revenue source key
  const sourceKey = mapReferenceTypeToSource(transaction.referenceType);
  const methodKey = mapPaymentMethodToKey(transaction.paymentMethod);
  
  // Calculate net amount (after platform fee)
  const netAmount = transaction.amount - transaction.platformFee;
  
  await updateDoc(docRef, {
    totalRevenue: increment(transaction.amount),
    platformFeesTotal: increment(transaction.platformFee),
    netRevenue: increment(netAmount),
    pendingPayout: increment(netAmount),
    [`revenueBySource.${sourceKey}`]: increment(transaction.amount),
    [`revenueByMonth.${monthKey}`]: increment(transaction.amount),
    [`paymentMethodBreakdown.${methodKey}`]: increment(transaction.amount),
    updatedAt: now,
  });
};

/**
 * Record a refund against the club's account
 */
export const recordClubRefund = async (
  clubId: string,
  amount: number,
  platformFeeRefunded: number = 0
): Promise<void> => {
  const docRef = doc(db, CLUB_ACCOUNTS_COLLECTION, clubId);
  await getOrCreateClubAccount(clubId);
  
  const now = Date.now();
  const monthKey = getMonthKey(now);
  const netRefund = amount - platformFeeRefunded;
  
  await updateDoc(docRef, {
    totalRefunded: increment(amount),
    platformFeesTotal: increment(-platformFeeRefunded),
    netRevenue: increment(-netRefund),
    pendingPayout: increment(-netRefund),
    [`revenueByMonth.${monthKey}`]: increment(-amount),
    updatedAt: now,
  });
};

/**
 * Record a payout to the club
 */
export const recordClubPayout = async (
  clubId: string,
  amount: number
): Promise<void> => {
  const docRef = doc(db, CLUB_ACCOUNTS_COLLECTION, clubId);
  
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(docRef);
    if (!snap.exists()) {
      throw new Error(`Club account not found: ${clubId}`);
    }
    
    const account = snap.data() as ClubAccount;
    
    // Verify sufficient pending payout
    if (account.pendingPayout < amount) {
      throw new Error(`Insufficient pending payout. Available: ${account.pendingPayout}, Requested: ${amount}`);
    }
    
    transaction.update(docRef, {
      totalPayouts: increment(amount),
      pendingPayout: increment(-amount),
      lastPayoutAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
};

// ============================================
// MEMBER STATISTICS
// ============================================

/**
 * Update member count for club
 */
export const updateClubMemberCount = async (
  clubId: string,
  delta: number
): Promise<void> => {
  const docRef = doc(db, CLUB_ACCOUNTS_COLLECTION, clubId);
  await getOrCreateClubAccount(clubId);
  
  await updateDoc(docRef, {
    memberCount: increment(delta),
    updatedAt: Date.now(),
  });
};

/**
 * Update active wallet count for club
 */
export const updateClubWalletCount = async (
  clubId: string,
  delta: number
): Promise<void> => {
  const docRef = doc(db, CLUB_ACCOUNTS_COLLECTION, clubId);
  await getOrCreateClubAccount(clubId);
  
  await updateDoc(docRef, {
    activeWalletCount: increment(delta),
    updatedAt: Date.now(),
  });
};

/**
 * Update active pass count for club
 */
export const updateClubPassCount = async (
  clubId: string,
  delta: number
): Promise<void> => {
  const docRef = doc(db, CLUB_ACCOUNTS_COLLECTION, clubId);
  await getOrCreateClubAccount(clubId);
  
  await updateDoc(docRef, {
    activePassCount: increment(delta),
    updatedAt: Date.now(),
  });
};

/**
 * Sync member statistics from actual data
 */
export const syncClubMemberStats = async (
  clubId: string,
  stats: {
    memberCount: number;
    activeWalletCount: number;
    activePassCount: number;
  }
): Promise<void> => {
  const docRef = doc(db, CLUB_ACCOUNTS_COLLECTION, clubId);
  await getOrCreateClubAccount(clubId);
  
  await updateDoc(docRef, {
    memberCount: stats.memberCount,
    activeWalletCount: stats.activeWalletCount,
    activePassCount: stats.activePassCount,
    updatedAt: Date.now(),
  });
};

// ============================================
// PAYOUT SETTINGS
// ============================================

/**
 * Update club payout settings
 */
export const updateClubPayoutSettings = async (
  clubId: string,
  settings: Partial<PayoutSettings>
): Promise<void> => {
  const docRef = doc(db, CLUB_ACCOUNTS_COLLECTION, clubId);
  await getOrCreateClubAccount(clubId);
  
  const updates: Record<string, any> = { updatedAt: Date.now() };
  
  // Update each setting individually to preserve existing values
  for (const [key, value] of Object.entries(settings)) {
    updates[`payoutSettings.${key}`] = value;
  }
  
  await updateDoc(docRef, updates);
};

/**
 * Get club payout settings
 */
export const getClubPayoutSettings = async (
  clubId: string
): Promise<PayoutSettings | null> => {
  const account = await getClubAccount(clubId);
  return account?.payoutSettings ?? null;
};

// ============================================
// REVENUE QUERIES
// ============================================

/**
 * Get club's total revenue
 */
export const getClubTotalRevenue = async (
  clubId: string
): Promise<number> => {
  const account = await getClubAccount(clubId);
  return account?.totalRevenue ?? 0;
};

/**
 * Get club's net revenue (after fees and refunds)
 */
export const getClubNetRevenue = async (
  clubId: string
): Promise<number> => {
  const account = await getClubAccount(clubId);
  return account?.netRevenue ?? 0;
};

/**
 * Get club's pending payout amount
 */
export const getClubPendingPayout = async (
  clubId: string
): Promise<number> => {
  const account = await getClubAccount(clubId);
  return account?.pendingPayout ?? 0;
};

/**
 * Get club's revenue for a specific month
 */
export const getClubMonthlyRevenue = async (
  clubId: string,
  year: number,
  month: number
): Promise<number> => {
  const account = await getClubAccount(clubId);
  if (!account) return 0;
  
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  return account.revenueByMonth[monthKey] ?? 0;
};

/**
 * Get club's revenue by source
 */
export const getClubRevenueBySource = async (
  clubId: string
): Promise<RevenueBySource> => {
  const account = await getClubAccount(clubId);
  if (!account) {
    return createEmptyClubAccount(clubId).revenueBySource;
  }
  
  return account.revenueBySource;
};

/**
 * Get club's revenue trend (last N months)
 */
export const getClubRevenueTrend = async (
  clubId: string,
  months: number = 6
): Promise<{ month: string; amount: number }[]> => {
  const account = await getClubAccount(clubId);
  if (!account) return [];
  
  const trend: { month: string; amount: number }[] = [];
  const now = new Date();
  
  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = getMonthKey(date.getTime());
    trend.push({
      month: monthKey,
      amount: account.revenueByMonth[monthKey] ?? 0,
    });
  }
  
  return trend;
};

/**
 * Get club's payment method breakdown
 */
export const getClubPaymentMethodBreakdown = async (
  clubId: string
): Promise<PaymentMethodBreakdown> => {
  const account = await getClubAccount(clubId);
  if (!account) {
    return createEmptyClubAccount(clubId).paymentMethodBreakdown;
  }
  
  return account.paymentMethodBreakdown;
};

// ============================================
// FINANCIAL SUMMARY
// ============================================

/**
 * Get comprehensive financial summary for a club
 */
export const getClubFinancialSummary = async (
  clubId: string,
  clubName: string,
  dateRange: { start: number; end: number }
): Promise<ClubFinancialSummary> => {
  const account = await getOrCreateClubAccount(clubId);
  
  // Calculate period revenue from monthly data
  let periodRevenue = 0;
  let periodRefunds = 0;
  
  // Get months in date range
  const startDate = new Date(dateRange.start);
  const endDate = new Date(dateRange.end);
  
  const currentDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  while (currentDate <= endDate) {
    const monthKey = getMonthKey(currentDate.getTime());
    periodRevenue += account.revenueByMonth[monthKey] ?? 0;
    currentDate.setMonth(currentDate.getMonth() + 1);
  }
  
  // Calculate period platform fees (estimate based on ratio)
  const feeRatio = account.totalRevenue > 0 
    ? account.platformFeesTotal / account.totalRevenue 
    : 0;
  const periodFees = Math.round(periodRevenue * feeRatio);
  const periodNetRevenue = periodRevenue - periodFees - periodRefunds;
  
  // Calculate previous period for comparison
  const periodLength = dateRange.end - dateRange.start;
  const prevStart = dateRange.start - periodLength;
  const prevEnd = dateRange.start - 1;
  
  let previousPeriodRevenue = 0;
  const prevStartDate = new Date(prevStart);
  const prevEndDate = new Date(prevEnd);
  const prevCurrentDate = new Date(prevStartDate.getFullYear(), prevStartDate.getMonth(), 1);
  
  while (prevCurrentDate <= prevEndDate) {
    const monthKey = getMonthKey(prevCurrentDate.getTime());
    previousPeriodRevenue += account.revenueByMonth[monthKey] ?? 0;
    prevCurrentDate.setMonth(prevCurrentDate.getMonth() + 1);
  }
  
  const revenueChange = periodRevenue - previousPeriodRevenue;
  const revenueChangePercent = previousPeriodRevenue > 0
    ? (revenueChange / previousPeriodRevenue) * 100
    : 0;
  
  // Build top revenue sources
  const topRevenueSources = Object.entries(account.revenueBySource)
    .map(([source, amount]) => ({ 
      source: getRevenueSourceLabel(source as keyof RevenueBySource), 
      amount 
    }))
    .filter(item => item.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);
  
  return {
    clubId,
    clubName,
    periodRevenue,
    periodRefunds,
    periodPayouts: 0, // Would need to query payouts for this period
    periodNetRevenue,
    pendingPayout: account.pendingPayout,
    revenueVsLastPeriod: revenueChangePercent,
    topRevenueSources,
    newMembersThisPeriod: 0, // Would need to query members
    activeWallets: account.activeWalletCount,
    activePasses: account.activePassCount,
    generatedAt: Date.now(),
  };
};

// ============================================
// BATCH OPERATIONS
// ============================================

/**
 * Recalculate club account from transactions
 * Use this to fix discrepancies or rebuild account data
 */
export const recalculateClubAccount = async (
  clubId: string,
  transactions: Transaction[],
  payouts: Payout[],
  wallets: Wallet[],
  passes: AnnualPass[],
  memberCount: number,
  currency: SupportedCurrency = 'nzd'
): Promise<ClubAccount> => {
  // Start fresh but preserve payout settings
  const existingAccount = await getClubAccount(clubId);
  const account = createEmptyClubAccount(clubId, currency);
  
  // Preserve payout settings if they exist
  if (existingAccount?.payoutSettings) {
    account.payoutSettings = existingAccount.payoutSettings;
  }
  if (existingAccount?.branding) {
    account.branding = existingAccount.branding;
  }
  
  // Process all transactions
  for (const tx of transactions) {
    if (tx.status !== 'completed') continue;
    if (tx.odClubId !== clubId) continue;
    
    const monthKey = getMonthKey(tx.createdAt);
    const sourceKey = mapReferenceTypeToSource(tx.referenceType);
    const methodKey = mapPaymentMethodToKey(tx.paymentMethod);
    const platformFee = tx.breakdown?.fees ?? 0;
    
    switch (tx.type) {
      case 'payment':
        account.totalRevenue += tx.amount;
        account.platformFeesTotal += platformFee;
        account.netRevenue += (tx.amount - platformFee);
        account.revenueBySource[sourceKey] = 
          (account.revenueBySource[sourceKey] || 0) + tx.amount;
        account.revenueByMonth[monthKey] = 
          (account.revenueByMonth[monthKey] || 0) + tx.amount;
        account.paymentMethodBreakdown[methodKey] = 
          (account.paymentMethodBreakdown[methodKey] || 0) + tx.amount;
        break;
        
      case 'refund':
        account.totalRefunded += Math.abs(tx.amount);
        account.netRevenue -= Math.abs(tx.amount);
        account.revenueByMonth[monthKey] = 
          (account.revenueByMonth[monthKey] || 0) - Math.abs(tx.amount);
        break;
    }
  }
  
  // Process payouts
  for (const payout of payouts) {
    if (payout.status === 'completed') {
      account.totalPayouts += payout.amount;
      if (!account.lastPayoutAt || payout.completedAt! > account.lastPayoutAt) {
        account.lastPayoutAt = payout.completedAt;
      }
    }
  }
  
  // Calculate pending payout
  account.pendingPayout = account.netRevenue - account.totalPayouts;
  
  // Count active wallets and passes
  account.activeWalletCount = wallets.filter(w => 
    w.odClubId === clubId && w.status === 'active'
  ).length;
  
  const now = new Date().toISOString().split('T')[0];
  account.activePassCount = passes.filter(p => 
    p.odClubId === clubId &&
    p.status === 'active' && 
    p.startDate <= now && 
    p.endDate >= now
  ).length;
  
  account.memberCount = memberCount;
  account.updatedAt = Date.now();
  
  // Save recalculated account
  const docRef = doc(db, CLUB_ACCOUNTS_COLLECTION, clubId);
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
 * Map reference type to revenue source key
 */
const mapReferenceTypeToSource = (
  referenceType: ReferenceType
): keyof RevenueBySource => {
  const mapping: Record<ReferenceType, keyof RevenueBySource> = {
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
 * Map payment method to breakdown key
 */
const mapPaymentMethodToKey = (
  method: PaymentMethod
): keyof PaymentMethodBreakdown => {
  const mapping: Record<PaymentMethod, keyof PaymentMethodBreakdown> = {
    card: 'card',
    wallet: 'wallet',
    annual_pass: 'annual_pass',
    bank_transfer: 'bank_transfer',
    free: 'free',
  };
  
  return mapping[method] || 'card';
};

/**
 * Get revenue source label for display
 */
export const getRevenueSourceLabel = (
  source: keyof RevenueBySource
): string => {
  const labels: Record<keyof RevenueBySource, string> = {
    court_booking: 'Court Bookings',
    tournament: 'Tournaments',
    league: 'Leagues',
    annual_pass: 'Annual Passes',
    membership: 'Memberships',
    visitor_fee: 'Visitor Fees',
    wallet_topup: 'Wallet Top-ups',
    other: 'Other',
  };
  
  return labels[source] || source;
};

/**
 * Get payment method label for display
 */
export const getPaymentMethodLabel = (
  method: keyof PaymentMethodBreakdown
): string => {
  const labels: Record<keyof PaymentMethodBreakdown, string> = {
    card: 'Credit/Debit Card',
    wallet: 'Wallet',
    annual_pass: 'Annual Pass',
    bank_transfer: 'Bank Transfer',
    free: 'Free',
  };
  
  return labels[method] || method;
};

/**
 * Format revenue amount for display
 */
export const formatRevenueAmount = (
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
 * Calculate revenue growth percentage
 */
export const calculateRevenueGrowth = (
  current: number,
  previous: number
): number => {
  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return Math.round(((current - previous) / previous) * 100 * 10) / 10;
};
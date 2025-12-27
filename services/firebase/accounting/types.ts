/**
 * Accounting System Types
 * 
 * Type definitions for user accounts, club accounts, and financial tracking.
 * These types support the reporting and accounting features.
 * 
 * FILE LOCATION: services/firebase/accounting/types.ts
 */

import type { SupportedCurrency, ReferenceType, PayoutSettings } from '../payments/types';

// ============================================
// USER ACCOUNT TYPES
// ============================================

export interface UserAccount {
  id: string; // Same as odUserId
  
  /** Lifetime totals (in cents) */
  totalSpent: number;
  totalRefunded: number;
  totalTopUps: number;
  
  /** Transaction count */
  transactionCount: number;
  
  /** Spending breakdown by category */
  spendingByCategory: SpendingByCategory;
  
  /** Spending breakdown by club */
  spendingByClub: Record<string, number>; // { clubId: amountInCents }
  
  /** Spending by month (for trends) */
  spendingByMonth: Record<string, number>; // { 'YYYY-MM': amountInCents }
  
  /** First and last payment dates */
  firstPaymentAt?: number;
  lastPaymentAt?: number;
  
  /** Active wallets count */
  activeWalletCount: number;
  
  /** Active passes count */
  activePassCount: number;
  
  updatedAt: number;
}

export interface SpendingByCategory {
  court_booking: number;
  tournament: number;
  league: number;
  annual_pass: number;
  membership: number;
  visitor_fee: number;
  wallet_topup: number;
  other: number;
}

/** Default empty user account */
export const createEmptyUserAccount = (userId: string): UserAccount => ({
  id: userId,
  totalSpent: 0,
  totalRefunded: 0,
  totalTopUps: 0,
  transactionCount: 0,
  spendingByCategory: {
    court_booking: 0,
    tournament: 0,
    league: 0,
    annual_pass: 0,
    membership: 0,
    visitor_fee: 0,
    wallet_topup: 0,
    other: 0,
  },
  spendingByClub: {},
  spendingByMonth: {},
  activeWalletCount: 0,
  activePassCount: 0,
  updatedAt: Date.now(),
});

// ============================================
// CLUB ACCOUNT TYPES
// ============================================

export interface ClubAccount {
  id: string; // Same as odClubId
  
  /** Revenue totals (in cents) */
  totalRevenue: number;
  totalRefunded: number;
  totalPayouts: number;
  pendingPayout: number;
  
  /** Platform fees paid */
  platformFeesTotal: number;
  
  /** Net revenue after fees and refunds */
  netRevenue: number;
  
  /** Revenue breakdown by source */
  revenueBySource: RevenueBySource;
  
  /** Revenue by month (for trends) */
  revenueByMonth: Record<string, number>; // { 'YYYY-MM': amountInCents }
  
  /** Member statistics */
  memberCount: number;
  activeWalletCount: number;
  activePassCount: number;
  
  /** Payment method breakdown */
  paymentMethodBreakdown: PaymentMethodBreakdown;
  
  /** Payout settings */
  payoutSettings: PayoutSettings;
  
  /** Branding settings */
  branding?: ClubBrandingSettings;
  
  /** Last payout date */
  lastPayoutAt?: number;
  
  /** Tax settings for this club */
  taxEnabled: boolean;
  taxNumber?: string;
  
  /** Currency preference */
  currency: SupportedCurrency;
  
  createdAt: number;
  updatedAt: number;
}

export interface RevenueBySource {
  court_booking: number;
  tournament: number;
  league: number;
  annual_pass: number;
  membership: number;
  visitor_fee: number;
  other: number;
}

export interface PaymentMethodBreakdown {
  card: number;
  wallet: number;
  annual_pass: number;
  bank_transfer: number;
  free: number;
}

export interface ClubBrandingSettings {
  logoUrl?: string;
  logoWidth?: number;
  primaryColor?: string;
  secondaryColor?: string;
  receiptFooter?: string;
  businessName?: string;
  businessAddress?: string;
  contactEmail?: string;
  contactPhone?: string;
}

/** Default empty club account */
export const createEmptyClubAccount = (
  clubId: string, 
  currency: SupportedCurrency = 'nzd'
): ClubAccount => ({
  id: clubId,
  totalRevenue: 0,
  totalRefunded: 0,
  totalPayouts: 0,
  pendingPayout: 0,
  platformFeesTotal: 0,
  netRevenue: 0,
  revenueBySource: {
    court_booking: 0,
    tournament: 0,
    league: 0,
    annual_pass: 0,
    membership: 0,
    visitor_fee: 0,
    other: 0,
  },
  revenueByMonth: {},
  memberCount: 0,
  activeWalletCount: 0,
  activePassCount: 0,
  paymentMethodBreakdown: {
    card: 0,
    wallet: 0,
    annual_pass: 0,
    bank_transfer: 0,
    free: 0,
  },
  payoutSettings: {
    frequency: 'weekly',
    dayOfWeek: 1, // Monday
    minimumPayout: 5000, // $50
    holdPeriodDays: 7,
  },
  taxEnabled: false,
  currency,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

// ============================================
// TOURNAMENT ACCOUNT TYPES
// ============================================

export interface TournamentAccount {
  id: string; // Same as tournamentId
  
  /** Club if associated */
  odClubId?: string;
  
  /** Organizer */
  organizerId: string;
  
  /** Revenue (in cents) */
  totalRevenue: number;
  totalRefunded: number;
  netRevenue: number;
  
  /** Entry tracking */
  entryCount: number;
  paidCount: number;
  pendingCount: number;
  unpaidCount: number;
  withdrawnCount: number;
  
  /** Revenue by division */
  revenueByDivision: Record<string, DivisionRevenue>;
  
  /** Expenses (optional tracking) */
  expenses: Record<string, number>; // { category: amountInCents }
  totalExpenses: number;
  
  /** Net profit/loss */
  netProfit: number;
  
  /** Platform fees */
  platformFees: number;
  
  /** Status */
  status: 'open' | 'closed' | 'reconciled';
  
  /** Payment status by player */
  playerPaymentStatus: Record<string, PlayerPaymentStatus>;
  
  createdAt: number;
  updatedAt: number;
  closedAt?: number;
}

export interface DivisionRevenue {
  divisionId: string;
  divisionName: string;
  entryFee: number;
  entryCount: number;
  paidCount: number;
  totalRevenue: number;
  refunded: number;
  netRevenue: number;
}

export interface PlayerPaymentStatus {
  odUserId: string;
  displayName: string;
  divisionIds: string[];
  divisionId?: string;  // Single division for simpler lookups
  totalOwed: number;
  totalPaid: number;
  amountDue?: number;   // Alias for totalOwed
  amountPaid?: number;  // Alias for totalPaid
  status: 'paid' | 'partial' | 'unpaid' | 'refunded' | 'pending';
  paymentId?: string;
  paidAt?: number;
}

/** Default empty tournament account */
export const createEmptyTournamentAccount = (
  tournamentId: string,
  organizerId: string,
  clubId?: string
): TournamentAccount => ({
  id: tournamentId,
  odClubId: clubId,
  organizerId,
  totalRevenue: 0,
  totalRefunded: 0,
  netRevenue: 0,
  entryCount: 0,
  paidCount: 0,
  pendingCount: 0,
  unpaidCount: 0,
  withdrawnCount: 0,
  revenueByDivision: {},
  expenses: {},
  totalExpenses: 0,
  netProfit: 0,
  platformFees: 0,
  status: 'open',
  playerPaymentStatus: {},
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

// ============================================
// LEAGUE ACCOUNT TYPES
// ============================================

export interface LeagueAccount {
  id: string; // Same as leagueId
  
  /** Club if associated */
  odClubId?: string;
  
  /** Organizer */
  organizerId: string;
  
  /** Season info */
  seasonId?: string;
  seasonName?: string;
  
  /** Revenue (in cents) */
  totalRevenue: number;
  totalRefunded: number;
  netRevenue: number;
  
  /** Member fee tracking */
  memberFeesCollected: number;
  memberFeesPending: number;
  memberFeePerPerson: number;
  
  /** Member payment status */
  paidMemberCount: number;
  unpaidMemberCount: number;
  
  /** Expenses */
  expenses: Record<string, number>;
  totalExpenses: number;
  
  /** Net profit/loss */
  netProfit: number;
  
  /** Platform fees */
  platformFees: number;
  
  /** Member payment status map */
  memberPaymentStatus: Record<string, MemberPaymentStatus>;
  
  createdAt: number;
  updatedAt: number;
}

export interface MemberPaymentStatus {
  odUserId: string;
  displayName: string;
  membershipId: string;
  feeOwed: number;
  feePaid: number;
  status: 'paid' | 'partial' | 'unpaid' | 'waived';
  paymentId?: string;
  paidAt?: number;
  waivedReason?: string;
}

/** Default empty league account */
export const createEmptyLeagueAccount = (
  leagueId: string,
  organizerId: string,
  memberFeePerPerson: number = 0,
  clubId?: string
): LeagueAccount => ({
  id: leagueId,
  odClubId: clubId,
  organizerId,
  totalRevenue: 0,
  totalRefunded: 0,
  netRevenue: 0,
  memberFeesCollected: 0,
  memberFeesPending: 0,
  memberFeePerPerson,
  paidMemberCount: 0,
  unpaidMemberCount: 0,
  expenses: {},
  totalExpenses: 0,
  netProfit: 0,
  platformFees: 0,
  memberPaymentStatus: {},
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

// ============================================
// FINANCIAL SUMMARY TYPES
// ============================================

export interface UserFinancialSummary {
  userId: string;
  
  /** Total across all clubs */
  totalSpent: number;
  totalWalletBalance: number;
  activePassesCount: number;
  
  /** By club breakdown */
  byClub: UserClubFinancialSummary[];
  
  /** Recent transactions */
  recentTransactions: TransactionSummary[];
  
  /** This month vs last month */
  thisMonth: number;
  lastMonth: number;
  monthOverMonthChange: number;
  
  generatedAt: number;
}

export interface UserClubFinancialSummary {
  clubId: string;
  clubName: string;
  walletBalance: number;
  totalSpent: number;
  hasActivePass: boolean;
  passExpiresAt?: string;
}

export interface ClubFinancialSummary {
  clubId: string;
  clubName: string;
  
  /** Period totals */
  periodRevenue: number;
  periodRefunds: number;
  periodPayouts: number;
  periodNetRevenue: number;
  
  /** Outstanding */
  pendingPayout: number;
  
  /** Comparisons */
  revenueVsLastPeriod: number;
  
  /** Top sources */
  topRevenueSources: { source: string; amount: number }[];
  
  /** Member metrics */
  newMembersThisPeriod: number;
  activeWallets: number;
  activePasses: number;
  
  generatedAt: number;
}

export interface TransactionSummary {
  id: string;
  type: string;
  amount: number;
  description: string;
  date: number;
  status: string;
}

// ============================================
// DATE RANGE TYPES
// ============================================

export type DateRangePreset = 
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'last_quarter'
  | 'this_year'
  | 'last_year'
  | 'last_7_days'
  | 'last_30_days'
  | 'last_90_days'
  | 'custom';

export interface DateRange {
  preset?: DateRangePreset;
  startDate: number; // timestamp
  endDate: number;   // timestamp
}

/** Helper to get date range from preset */
export const getDateRangeFromPreset = (preset: DateRangePreset): DateRange => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  let startDate: Date;
  let endDate: Date = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1); // End of today
  
  switch (preset) {
    case 'today':
      startDate = today;
      break;
    case 'yesterday':
      startDate = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      endDate = new Date(today.getTime() - 1);
      break;
    case 'this_week':
      const dayOfWeek = today.getDay();
      startDate = new Date(today.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
      break;
    case 'last_week':
      const lastWeekDay = today.getDay();
      endDate = new Date(today.getTime() - lastWeekDay * 24 * 60 * 60 * 1000 - 1);
      startDate = new Date(endDate.getTime() - 6 * 24 * 60 * 60 * 1000);
      break;
    case 'this_month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'last_month':
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      break;
    case 'this_quarter':
      const quarter = Math.floor(now.getMonth() / 3);
      startDate = new Date(now.getFullYear(), quarter * 3, 1);
      break;
    case 'last_quarter':
      const lastQuarter = Math.floor(now.getMonth() / 3) - 1;
      const lastQuarterYear = lastQuarter < 0 ? now.getFullYear() - 1 : now.getFullYear();
      const adjustedQuarter = lastQuarter < 0 ? 3 : lastQuarter;
      startDate = new Date(lastQuarterYear, adjustedQuarter * 3, 1);
      endDate = new Date(lastQuarterYear, adjustedQuarter * 3 + 3, 0, 23, 59, 59, 999);
      break;
    case 'this_year':
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    case 'last_year':
      startDate = new Date(now.getFullYear() - 1, 0, 1);
      endDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
      break;
    case 'last_7_days':
      startDate = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
      break;
    case 'last_30_days':
      startDate = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000);
      break;
    case 'last_90_days':
      startDate = new Date(today.getTime() - 89 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = today;
  }
  
  return {
    preset,
    startDate: startDate.getTime(),
    endDate: endDate.getTime(),
  };
};

// ============================================
// RETENTION TYPES
// ============================================

export interface RetentionRecord {
  id: string;
  entityType: 'transaction' | 'payment' | 'receipt' | 'audit_log' | 'report';
  entityId: string;
  createdAt: number;
  archiveAfter: number; // Timestamp when this can be archived
  deleteAfter?: number; // Timestamp when this can be deleted (if ever)
  isArchived: boolean;
  archivedAt?: number;
}

/** Calculate archive date based on retention years */
export const calculateArchiveDate = (
  createdAt: number, 
  retentionYears: number = 7
): number => {
  const date = new Date(createdAt);
  date.setFullYear(date.getFullYear() + retentionYears);
  return date.getTime();
};
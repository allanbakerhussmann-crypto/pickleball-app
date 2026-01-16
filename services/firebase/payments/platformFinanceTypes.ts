/**
 * Platform Finance Types
 *
 * Types for the platform-level Finance dashboard (app admins only).
 * Shows aggregated data across all clubs, reconciliation tools,
 * and platform revenue tracking.
 *
 * @version 07.50
 * @file services/firebase/payments/platformFinanceTypes.ts
 */

import { FinanceCurrency, FinanceTransaction, FinanceTransactionType, FinanceReferenceType } from './types';

// ============================================
// PLATFORM OVERVIEW TYPES
// ============================================

/**
 * Platform-wide finance overview
 * Aggregated totals across all clubs
 */
export interface PlatformFinanceOverview {
  period: {
    start: number;
    end: number;
  };

  // Volume totals (all in cents)
  grossVolume: number; // Total payments across all clubs
  platformFeesCollected: number; // Sum of platformFeeAmount (our 1.5%)
  stripeFeesCollected: number; // Estimated Stripe fees (totalFee - platformFee)
  totalFees: number; // Platform + Stripe
  refundsTotal: number;
  netPlatformRevenue: number; // Platform fees after refund reversals

  // Counts
  transactionCount: number;
  refundCount: number;
  disputeCount: number;
  activeClubCount: number; // Distinct clubs with transactions

  // Currency (primary, for display)
  currency: FinanceCurrency;
}

// ============================================
// CLUB BREAKDOWN TYPES
// ============================================

/**
 * Per-club finance breakdown
 */
export interface ClubFinanceBreakdown {
  clubId: string;
  clubName: string;
  stripeAccountId?: string;
  stripeStatus: 'ready' | 'pending' | 'none';

  // Volume (all in cents)
  grossVolume: number;
  platformFees: number;
  stripeFees: number; // Estimated
  netToClub: number;

  // Counts
  transactionCount: number;
  refundCount: number;
  disputeCount: number;
}

// ============================================
// ACCOUNT BALANCE TYPES
// ============================================

/**
 * Balance for a single currency
 */
export interface CurrencyBalance {
  amount: number; // In cents
  currency: string; // Lowercase from Stripe
}

/**
 * Connected account balance
 */
export interface AccountBalance {
  clubId: string;
  clubName: string;
  stripeAccountId: string;

  available: CurrencyBalance[];
  pending: CurrencyBalance[];

  lastUpdated: number;
}

// ============================================
// PAYOUT TYPES
// ============================================

/**
 * Payout status from Stripe
 */
export type StripePayoutStatus =
  | 'pending'
  | 'in_transit'
  | 'paid'
  | 'failed'
  | 'canceled';

/**
 * Payout data for tracking
 */
export interface PayoutData {
  id: string; // po_xxx
  amount: number; // In cents
  currency: string;
  status: StripePayoutStatus;
  arrivalDate: number; // Estimated arrival timestamp
  createdAt: number;
  bankAccountLast4?: string;
  failureMessage?: string;
}

// ============================================
// RECONCILIATION TYPES
// ============================================

/**
 * Types of discrepancies found during reconciliation
 */
export type ReconciliationDiscrepancyType =
  | 'missing_in_firestore' // Stripe has charge, Firestore doesn't
  | 'missing_in_stripe' // Firestore has transaction, Stripe doesn't
  | 'amount_mismatch' // Both exist but amounts differ
  | 'status_mismatch'; // Both exist but status differs

/**
 * Individual discrepancy found
 */
export interface ReconciliationDiscrepancy {
  type: ReconciliationDiscrepancyType;
  stripeChargeId?: string;
  firestoreTransactionId?: string;
  stripeAmount?: number;
  firestoreAmount?: number;
  difference?: number;
  createdAt: number;
  description: string;
  canAutoFix: boolean; // True if we can create missing transaction
}

/**
 * Result of a reconciliation run
 */
export interface ReconciliationResult {
  accountId: string;
  clubId: string;
  clubName: string;
  period: {
    start: number;
    end: number;
  };

  summary: {
    firestoreTotal: number; // Sum from Firestore
    stripeTotal: number; // Sum from Stripe
    difference: number; // Absolute difference
    matchedCount: number; // Charges that match
    missingInFirestore: number;
    missingInStripe: number;
    amountMismatches: number;
    matchRate: number; // 0-100 percentage
  };

  discrepancies: ReconciliationDiscrepancy[];

  runAt: number;
  runByUserId: string;
}

// ============================================
// DISPUTE TYPES
// ============================================

/**
 * Dispute status from Stripe
 */
export type DisputeStatus =
  | 'warning_needs_response'
  | 'warning_under_review'
  | 'warning_closed'
  | 'needs_response'
  | 'under_review'
  | 'won'
  | 'lost';

/**
 * Dispute reason from Stripe
 */
export type DisputeReason =
  | 'bank_cannot_process'
  | 'check_returned'
  | 'credit_not_processed'
  | 'customer_initiated'
  | 'debit_not_authorized'
  | 'duplicate'
  | 'fraudulent'
  | 'general'
  | 'incorrect_account_details'
  | 'insufficient_funds'
  | 'product_not_received'
  | 'product_unacceptable'
  | 'subscription_canceled'
  | 'unrecognized';

/**
 * Dispute tracking data
 */
export interface DisputeData {
  id: string; // dp_xxx
  chargeId: string;
  transactionId?: string; // Our Firestore transaction ID
  clubId: string;
  clubName: string;

  amount: number; // In cents
  currency: string;

  status: DisputeStatus;
  reason: DisputeReason;

  createdAt: number;
  dueBy?: number; // Response deadline
  resolvedAt?: number;

  isTest: boolean;
}

// ============================================
// PLATFORM QUERY OPTIONS
// ============================================

/**
 * Query options for platform-wide transactions
 */
export interface PlatformTransactionQueryOptions {
  // Optional filters
  clubId?: string;
  type?: FinanceTransactionType;
  referenceType?: FinanceReferenceType;
  status?: string;

  // Date range
  startDate?: number;
  endDate?: number;

  // Pagination
  limit?: number;
  offset?: number;

  // Sorting
  orderBy?: 'createdAt' | 'amount' | 'clubId';
  orderDirection?: 'asc' | 'desc';
}

/**
 * Result of platform transactions query
 */
export interface PlatformTransactionsResult {
  transactions: FinanceTransaction[];
  hasMore: boolean;
  totalCount?: number;
}

// ============================================
// EXPORT TYPES
// ============================================

/**
 * Export format options
 */
export type ExportFormat = 'csv' | 'json';

/**
 * Fields to include in export
 */
export type ExportFieldSet = 'basic' | 'detailed' | 'full';

/**
 * Export options
 */
export interface ExportOptions {
  format: ExportFormat;
  fieldSet: ExportFieldSet;

  // Filters
  startDate: number;
  endDate: number;
  types?: FinanceTransactionType[];
  clubIds?: string[];

  // Include fee breakdown
  includeFeeBreakdown: boolean;
}

/**
 * Export result
 */
export interface ExportResult {
  data: string; // CSV string or JSON string
  filename: string;
  recordCount: number;
  generatedAt: number;
}

// ============================================
// CLOUD FUNCTION INPUT TYPES
// ============================================

/**
 * Input for platform overview function
 */
export interface GetPlatformOverviewInput {
  startDate?: number;
  endDate?: number;
}

/**
 * Input for club breakdown function
 */
export interface GetClubBreakdownInput {
  startDate?: number;
  endDate?: number;
  limit?: number;
}

/**
 * Input for account balances function
 */
export interface GetAccountBalancesInput {
  clubIds?: string[]; // Optional filter to specific clubs
}

/**
 * Input for account payouts function
 */
export interface GetAccountPayoutsInput {
  stripeAccountId: string;
  limit?: number;
}

/**
 * Input for reconciliation function
 */
export interface RunReconciliationInput {
  stripeAccountId: string;
  clubId: string;
  startDate: number;
  endDate: number;
}

/**
 * Input for adding missing transaction
 */
export interface AddMissingTransactionInput {
  stripeChargeId: string;
  stripeAccountId: string;
  clubId: string;
}

/**
 * Input for export function
 */
export interface ExportTransactionsInput {
  startDate: number;
  endDate: number;
  format: ExportFormat;
  fieldSet: ExportFieldSet;
  types?: FinanceTransactionType[];
  clubIds?: string[];
  includeFeeBreakdown?: boolean;
}

// ============================================
// DATE RANGE PRESETS
// ============================================

/**
 * Predefined date range options
 */
export type DateRangePreset =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_30_days'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'last_quarter'
  | 'this_year'
  | 'ytd'
  | 'custom';

/**
 * Helper to get date range from preset
 */
export function getDateRangeFromPreset(preset: DateRangePreset): { start: number; end: number } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1);

  switch (preset) {
    case 'today':
      return { start: today.getTime(), end: todayEnd.getTime() };

    case 'yesterday': {
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayEnd = new Date(yesterday.getTime() + 24 * 60 * 60 * 1000 - 1);
      return { start: yesterday.getTime(), end: yesterdayEnd.getTime() };
    }

    case 'last_7_days': {
      const start = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { start: start.getTime(), end: todayEnd.getTime() };
    }

    case 'last_30_days': {
      const start = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { start: start.getTime(), end: todayEnd.getTime() };
    }

    case 'this_month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: start.getTime(), end: todayEnd.getTime() };
    }

    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start: start.getTime(), end: end.getTime() };
    }

    case 'this_quarter': {
      const quarter = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), quarter * 3, 1);
      return { start: start.getTime(), end: todayEnd.getTime() };
    }

    case 'last_quarter': {
      const quarter = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), (quarter - 1) * 3, 1);
      const end = new Date(now.getFullYear(), quarter * 3, 0, 23, 59, 59, 999);
      return { start: start.getTime(), end: end.getTime() };
    }

    case 'this_year': {
      const start = new Date(now.getFullYear(), 0, 1);
      return { start: start.getTime(), end: todayEnd.getTime() };
    }

    case 'ytd': {
      const start = new Date(now.getFullYear(), 0, 1);
      return { start: start.getTime(), end: todayEnd.getTime() };
    }

    case 'custom':
    default:
      // Return last 30 days as default
      const defaultStart = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { start: defaultStart.getTime(), end: todayEnd.getTime() };
  }
}

// ============================================
// PLATFORM TAB TYPES
// ============================================

/**
 * Available tabs in the Platform Finance dashboard
 */
export type PlatformFinanceTab =
  | 'overview'
  | 'transactions'
  | 'clubs'
  | 'reconciliation'
  | 'payouts';

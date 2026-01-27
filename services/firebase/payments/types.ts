/**
 * Payment System Types
 * 
 * Core type definitions for the payment system.
 * All monetary amounts are in CENTS (e.g., $10.00 = 1000 cents).
 * 
 * FILE LOCATION: services/firebase/payments/types.ts
 */

// ============================================
// CURRENCY & PLATFORM TYPES
// ============================================

/**
 * Supported currencies (ISO 4217 codes, lowercase)
 */
export type SupportedCurrency = 'nzd' | 'aud' | 'usd';

/**
 * Platform fee configuration
 */
export interface PlatformFeeSettings {
  /** Base percentage fee (e.g., 2.9 for 2.9%) */
  percentageFee: number;
  /** Fixed fee per transaction in cents */
  fixedFee: number;
  /** Minimum fee in cents */
  minimumFee: number;
  /** Maximum fee in cents (0 = no max) */
  maximumFee: number;
}

/**
 * Tax/GST settings
 */
export interface TaxSettings {
  /** Whether tax is enabled */
  enabled: boolean;
  /** Tax rates by currency/jurisdiction */
  rates: Record<SupportedCurrency, number>;
  /** Whether to display prices as tax-inclusive */
  displayInclusive: boolean;
}

/**
 * Data retention settings for financial records
 */
export interface RetentionSettings {
  /** Years to retain records (7 for NZ IRD compliance) */
  years: number;
  /** Whether to archive old records */
  archiveEnabled: boolean;
  /** Prevent auto-deletion (always true for financial data) */
  autoDeleteDisabled: boolean;
}

/**
 * Complete platform settings
 */
export interface PlatformSettings {
  fees: PlatformFeeSettings;
  currencies: {
    supported: SupportedCurrency[];
    default: SupportedCurrency;
  };
  tax: TaxSettings;
  retention: RetentionSettings;
}

/**
 * Default platform settings
 */
export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  fees: {
    percentageFee: 2.9,
    fixedFee: 30, // 30 cents
    minimumFee: 50, // 50 cents
    maximumFee: 0, // No max
  },
  currencies: {
    supported: ['nzd', 'aud', 'usd'],
    default: 'nzd',
  },
  tax: {
    enabled: false, // Disabled by default, checkbox to enable
    rates: {
      nzd: 0.15,
      aud: 0.10,
      usd: 0,
    },
    displayInclusive: true,
  },
  retention: {
    years: 7, // IRD compliant
    archiveEnabled: true,
    autoDeleteDisabled: true, // Never auto-delete financial records
  },
};

// ============================================
// WALLET TYPES
// ============================================

export type WalletStatus = 'active' | 'frozen' | 'closed';

export interface Wallet {
  id: string;
  odUserId: string;
  odClubId: string;
  /** Balance in cents */
  balance: number;
  currency: SupportedCurrency;
  /** Total amount ever loaded */
  totalLoaded: number;
  /** Total amount ever spent */
  totalSpent: number;
  status: WalletStatus;
  createdAt: number;
  updatedAt: number;
  /** Last top-up timestamp */
  lastTopUpAt?: number;
}

/** Input for creating a new wallet */
export interface CreateWalletInput {
  odUserId: string;
  odClubId: string;
  currency?: SupportedCurrency;
}

// ============================================
// TRANSACTION TYPES
// ============================================

export type TransactionType = 
  | 'topup'           // Wallet top-up via card
  | 'payment'         // Payment for service
  | 'refund'          // Refund to wallet or card
  | 'adjustment'      // Manual admin adjustment
  | 'payout'          // Club payout
  | 'commission';     // Platform commission

export type TransactionStatus = 
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'reversed';

export type PaymentMethod = 
  | 'card'
  | 'wallet'
  | 'annual_pass'
  | 'bank_transfer'
  | 'free';

export type ReferenceType = 
  | 'court_booking'
  | 'tournament'
  | 'league'
  | 'annual_pass'
  | 'wallet_topup'
  | 'membership'
  | 'visitor_fee';

export interface TransactionBreakdownItem {
  label: string;
  amount: number;
  type: 'charge' | 'discount' | 'fee' | 'tax';
}

export interface TransactionBreakdown {
  items: TransactionBreakdownItem[];
  subtotal: number;
  discounts: number;
  fees: number;
  tax: number;
  total: number;
}

export interface Transaction {
  id: string;
  /** Wallet ID if wallet was involved */
  walletId?: string;
  odUserId: string;
  odClubId?: string;
  tournamentId?: string;
  leagueId?: string;
  
  type: TransactionType;
  /** Amount in cents (positive for credits, negative for debits) */
  amount: number;
  currency: SupportedCurrency;
  
  /** Balance before this transaction */
  balanceBefore?: number;
  /** Balance after this transaction */
  balanceAfter?: number;
  
  status: TransactionStatus;
  paymentMethod: PaymentMethod;
  
  /** Stripe Payment Intent ID */
  stripePaymentIntentId?: string;
  /** Stripe Charge ID */
  stripeChargeId?: string;
  
  /** What this transaction is for */
  referenceType: ReferenceType;
  referenceId: string;
  referenceName: string;
  
  /** Detailed breakdown */
  breakdown: TransactionBreakdown;
  
  /** Platform fee charged (in cents) */
  platformFee?: number;
  /** Tax amount (in cents) */
  taxAmount?: number;
  /** Net amount after fees (in cents) */
  netAmount?: number;
  
  /** Receipt URL if generated */
  receiptUrl?: string;
  receiptNumber?: string;
  
  /** For adjustments - who made the adjustment */
  adjustedByUserId?: string;
  adjustmentReason?: string;
  
  /** Metadata for any additional info */
  metadata?: Record<string, unknown>;
  
  createdAt: number;
  completedAt?: number;
}

/** Input for creating a transaction */
export interface CreateTransactionInput {
  walletId?: string;
  odUserId: string;
  odClubId?: string;
  tournamentId?: string;
  leagueId?: string;
  type: TransactionType;
  amount: number;
  currency: SupportedCurrency;
  paymentMethod: PaymentMethod;
  referenceType: ReferenceType;
  referenceId: string;
  referenceName: string;
  breakdown: TransactionBreakdown;
  stripePaymentIntentId?: string;
  metadata?: Record<string, unknown>;
}

// ============================================
// PAYMENT TYPES
// ============================================

export type PaymentStatus = 
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'refunded'
  | 'partially_refunded'
  | 'disputed';

export interface Payment {
  id: string;
  odUserId: string;
  odClubId?: string;
  tournamentId?: string;
  leagueId?: string;
  
  /** Total amount in cents */
  amount: number;
  currency: SupportedCurrency;
  status: PaymentStatus;
  
  paymentMethod: PaymentMethod;
  stripePaymentIntentId?: string;
  stripeChargeId?: string;
  
  /** Associated wallet transaction ID */
  walletTransactionId?: string;
  
  referenceType: ReferenceType;
  referenceId: string;
  referenceName: string;
  
  /** Full price breakdown */
  breakdown: TransactionBreakdown;
  
  /** Tax collected */
  taxAmount?: number;
  /** Platform fee */
  platformFee?: number;
  /** Net amount to club/organizer */
  netAmount?: number;
  
  /** Refund tracking */
  refundedAmount?: number;
  refundIds?: string[];
  
  createdAt: number;
  completedAt?: number;
  
  /** For failed payments */
  failureReason?: string;
  failureCode?: string;
}

// ============================================
// REFUND TYPES
// ============================================

export type RefundStatus = 
  | 'pending'
  | 'approved'
  | 'processing'
  | 'completed'
  | 'rejected';

export type RefundMethod = 'original' | 'wallet' | 'credit';

export type RefundReason =
  | 'customer_request'
  | 'booking_cancelled'
  | 'event_cancelled'
  | 'service_issue'
  | 'duplicate_payment'
  | 'pricing_error'
  | 'other';

export interface Refund {
  id: string;
  paymentId: string;
  transactionId?: string;
  odUserId: string;
  odClubId?: string;
  
  /** Original payment amount */
  originalAmount: number;
  /** Requested refund amount */
  requestedAmount: number;
  /** Actual refund amount (after fees) */
  refundAmount: number;
  /** Whether this is a full refund */
  isFullRefund: boolean;
  currency: SupportedCurrency;
  
  /** Reason for refund */
  reason: RefundReason;
  /** Additional details */
  reasonDetails?: string;
  /** Reference type from original payment */
  referenceType: ReferenceType;
  
  status: RefundStatus;
  refundMethod: RefundMethod;
  
  /** Stripe refund ID if applicable */
  stripeRefundId?: string;
  
  /** Who requested/processed the refund */
  requestedBy: string;
  processedBy?: string;
  
  /** If rejected, why */
  rejectionReason?: string;
  
  /** Fee breakdown */
  cancellationFee?: number;
  platformFeeRefund?: number;
  
  createdAt: number;
  processedAt?: number;
}

/** Input for creating a refund request */
export interface CreateRefundInput {
  paymentId: string;
  amount?: number;
  reason: RefundReason;
  reasonDetails?: string;
  refundMethod?: RefundMethod;
  requestedBy: string;
}

// ============================================
// ANNUAL PASS TYPES
// ============================================

export type AnnualPassStatus = 'active' | 'expired' | 'cancelled' | 'suspended' | 'pending';

export interface AnnualPass {
  id: string;
  odUserId: string;
  odClubId: string;
  
  /** Pass type (standard, premium, etc.) */
  passType: string;
  
  /** Pass validity */
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  
  status: AnnualPassStatus;
  
  /** Payment info */
  purchasePrice: number;
  currency: SupportedCurrency;
  stripePaymentIntentId?: string;
  paymentId?: string;
  transactionId?: string;
  
  /** Usage tracking */
  usageCount: number;
  totalSaved: number;
  
  /** Renewal settings */
  autoRenew?: boolean;
  stripeSubscriptionId?: string;
  renewalDate?: number;
  renewedAt?: number;
  renewalPrice?: number;
  gracePeriodEnd?: number;
  
  purchasedAt: number;
  createdAt: number;
  updatedAt: number;
  cancelledAt?: number;
  cancellationReason?: string;
}

/** Input for purchasing an annual pass */
export interface PurchaseAnnualPassInput {
  odUserId: string;
  odClubId: string;
  purchasePrice: number;
  currency: SupportedCurrency;
  passType?: string;
  startDate?: string;
  durationDays?: number;
  stripePaymentIntentId?: string;
  autoRenew?: boolean;
}

// ============================================
// PAYOUT TYPES
// ============================================

export type PayoutStatus = 
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type PayoutFrequency = 'daily' | 'weekly' | 'monthly' | 'manual';

export interface PayoutSettings {
  frequency: PayoutFrequency;
  minimumAmount: number; // Minimum payout amount in cents
  bankAccountId?: string;
  stripeAccountId?: string;
}

export interface Payout {
  id: string;
  odClubId: string;
  
  /** Amount in cents */
  amount: number;
  currency: SupportedCurrency;
  
  status: PayoutStatus;
  
  /** Stripe payout ID */
  stripePayoutId?: string;
  
  /** Period this payout covers */
  periodStart: number;
  periodEnd: number;
  
  /** Transaction IDs included in this payout */
  transactionIds: string[];
  
  /** Fees deducted */
  platformFees: number;
  stripeFees: number;
  netAmount: number;
  
  createdAt: number;
  processedAt?: number;
  
  /** If failed */
  failureReason?: string;
}

// ============================================
// RECEIPT TYPES
// ============================================

export interface ReceiptItem {
  label: string;
  amount: number;
  type: 'charge' | 'discount' | 'fee' | 'tax';
  quantity?: number;
  unitPrice?: number;
}

export interface Receipt {
  id: string;
  receiptNumber: string;
  
  /** Associated records */
  transactionId?: string;
  paymentId?: string;
  refundId?: string;
  
  /** User info */
  odUserId: string;
  userName?: string;
  userEmail?: string;
  
  /** Club info */
  odClubId?: string;
  clubName?: string;
  
  /** Receipt type */
  type: 'payment' | 'refund' | 'topup' | 'payout';
  
  /** What this is for */
  referenceType: ReferenceType;
  referenceName: string;
  
  /** Amounts */
  amount: number;
  currency: SupportedCurrency;
  taxAmount?: number;
  taxRate?: number;
  
  /** Line items */
  items: ReceiptItem[];
  
  /** Status */
  status: 'draft' | 'generated' | 'sent' | 'voided';
  
  /** URLs */
  pdfUrl?: string;
  
  createdAt: number;
  sentAt?: number;
  voidedAt?: number;
}

// ============================================
// BRANDING TYPES
// ============================================

export interface ClubBranding {
  name: string;
  logo?: string;
  primaryColor?: string;
  secondaryColor?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  gstNumber?: string;
  bankAccount?: string;
}

// ============================================
// PRICING TYPES
// ============================================

export type PriceType = 'peak' | 'offpeak' | 'weekend' | 'member' | 'visitor' | 'standard';

export interface PriceBreakdownItem {
  label: string;
  amount: number;
  type?: 'base' | 'discount' | 'surcharge' | 'fee' | 'tax';
}

export interface BookingPriceResult {
  basePrice: number;
  finalPrice: number;
  totalPrice: number;
  priceType: PriceType;
  breakdown: PriceBreakdownItem[];
  discounts: number;
  surcharges: number;
  savings: number;
  isFree: boolean;
  // Optional fee details
  courtFee?: number;
  lightingFee?: number;
  equipmentFee?: number;
  memberDiscount?: number;
  visitorPremium?: number;
  passDiscount?: number;
}

// ============================================
// REFUND POLICY TYPES
// ============================================

export interface RefundPolicy {
  allowFullRefund: boolean;
  allowPartialRefunds: boolean;
  fullRefundDeadlineHours: number;
  partialRefundDeadlineHours: number;
  cancellationFeePercent: number;
  minimumRefundAmount: number;
  refundToWalletOnly: boolean;
  requireApproval: boolean;
  approvalThresholdAmount: number;
}

// ============================================
// AUDIT LOG TYPES
// ============================================

export type AuditAction = 
  | 'payment_created'
  | 'payment_completed'
  | 'payment_failed'
  | 'refund_requested'
  | 'refund_approved'
  | 'refund_processed'
  | 'refund_rejected'
  | 'wallet_created'
  | 'wallet_topup'
  | 'wallet_debit'
  | 'wallet_adjustment'
  | 'wallet_frozen'
  | 'wallet_unfrozen'
  | 'payout_initiated'
  | 'payout_completed'
  | 'payout_failed'
  | 'pass_purchased'
  | 'pass_renewed'
  | 'pass_cancelled'
  | 'settings_updated';

export interface PaymentAuditLog {
  id: string;
  action: AuditAction;
  
  /** Entity being acted upon */
  entityType: 'payment' | 'transaction' | 'wallet' | 'refund' | 'payout' | 'pass' | 'settings';
  entityId: string;
  
  /** Who performed the action */
  performedByUserId: string;
  
  /** Changes made (for updates) */
  changes?: {
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  };
  
  /** Additional context */
  metadata?: Record<string, unknown>;
  
  /** Request info */
  ipAddress?: string;
  userAgent?: string;
  
  timestamp: number;
}

// ============================================
// QUERY & FILTER TYPES
// ============================================

export interface TransactionQueryOptions {
  odUserId?: string;
  odClubId?: string;
  tournamentId?: string;
  leagueId?: string;
  type?: TransactionType;
  status?: TransactionStatus;
  referenceType?: ReferenceType;
  startDate?: number;
  endDate?: number;
  limit?: number;
  orderBy?: 'createdAt' | 'amount';
  orderDirection?: 'asc' | 'desc';
}

export interface PayoutQueryOptions {
  odClubId: string;
  status?: PayoutStatus;
  startDate?: number;
  endDate?: number;
  limit?: number;
}

// ============================================
// TYPE GUARDS / HELPERS
// ============================================

export const isWalletActive = (wallet: Wallet): boolean => 
  wallet.status === 'active';

export const isTransactionComplete = (tx: Transaction): boolean => 
  tx.status === 'completed';

export const isPaymentSuccessful = (payment: Payment): boolean => 
  payment.status === 'succeeded';

export const isRefundPending = (refund: Refund): boolean => 
  refund.status === 'pending';

export const isPassActive = (pass: AnnualPass): boolean => {
  if (pass.status !== 'active') return false;
  const today = new Date().toISOString().split('T')[0];
  return pass.startDate <= today && pass.endDate >= today;
};

// ============================================
// AMOUNT HELPERS
// ============================================

export const toCents = (dollars: number): number => 
  Math.round(dollars * 100);

export const toDollars = (cents: number): number => 
  cents / 100;

export const formatCurrency = (
  cents: number, 
  currency: SupportedCurrency = 'nzd'
): string => {
  const dollars = toDollars(cents);
  const symbols: Record<SupportedCurrency, string> = {
    nzd: 'NZ$',
    aud: 'A$',
    usd: '$',
  };
  return `${symbols[currency]}${dollars.toFixed(2)}`;
};

export const getCurrencySymbol = (currency: SupportedCurrency): string => {
  const symbols: Record<SupportedCurrency, string> = {
    nzd: 'NZ$',
    aud: 'A$',
    usd: '$',
  };
  return symbols[currency];
};

// ============================================
// FINANCE TRANSACTION TYPES (V2 Direct Charges)
// For the Finance ledger UI - source of truth for payments
// ============================================

/**
 * Supported currencies for Finance (UPPERCASE for DB storage)
 */
export type FinanceCurrency = 'NZD' | 'AUD' | 'USD' | 'GBP';

/**
 * Finance transaction type
 */
export type FinanceTransactionType = 'payment' | 'refund';

/**
 * Finance transaction status
 */
export type FinanceTransactionStatus =
  | 'processing'
  | 'completed'
  | 'failed'
  | 'refunded'
  | 'partially_refunded';

/**
 * Finance reference type (what this transaction is for)
 */
export type FinanceReferenceType =
  | 'meetup'
  | 'court_booking'
  | 'tournament'
  | 'league'
  | 'subscription'
  | 'sms_bundle';

/**
 * Stripe-specific data stored with Finance transactions
 * Schema versioned for future migrations
 */
export interface FinanceStripeData {
  schemaVersion: number; // Start at 1, bump on structure changes
  accountId: string; // acct_xxx (connected account)
  sessionId?: string; // cs_xxx
  paymentIntentId?: string; // pi_xxx
  chargeId?: string; // ch_xxx - KEY IDENTIFIER
  balanceTransactionId?: string; // txn_xxx - KEY IDENTIFIER
  applicationFeeAmount?: number; // Actual fee from Stripe
  applicationFeeId?: string; // fee_xxx
  refundIds?: string[]; // re_xxx[]
  webhookEventId?: string;
  mode?: 'live' | 'test'; // From Stripe event livemode
  paymentMethodType?: string; // 'card', 'bank_transfer', etc.
}

/**
 * Finance Transaction - the source of truth for the Finance UI
 *
 * All monetary amounts are in CENTS.
 * Currency codes are UPPERCASE (NZD, AUD, USD, GBP).
 *
 * Uses two-phase recording:
 * 1. checkout.session.completed → creates 'processing' transaction
 * 2. charge.succeeded → updates to 'completed' with actual fees
 */
export interface FinanceTransaction {
  id: string; // MUST equal Firestore doc ID
  schemaVersion: number; // Start at 1, bump on structure changes

  // Parties
  odClubId: string;
  odUserId: string; // Payer
  organizerUserId?: string;

  // Type & Status
  type: FinanceTransactionType;
  status: FinanceTransactionStatus;

  // Reference
  referenceType: FinanceReferenceType;
  referenceId: string;
  referenceName: string;

  // Amounts (all in cents)
  currency: FinanceCurrency; // UPPERCASE
  amount: number; // Gross (positive for payments, negative for refunds)
  platformFeeAmount: number; // Platform's cut (from Stripe, not calculated)
  clubNetAmount: number; // Club receives (from Stripe actuals)

  payerDisplayName: string;

  // Stripe identifiers
  stripe: FinanceStripeData;

  // For refunds: link to parent transaction
  parentTransactionId?: string;

  // Refund fee handling
  platformFeeRefundEstimated?: boolean; // True if we estimated, false if from Stripe

  // Refund initiation tracking
  initiatedByUserId?: string;
  reason?: string;

  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

/**
 * Query options for Finance transactions
 */
export interface FinanceTransactionQueryOptions {
  odClubId: string;
  type?: FinanceTransactionType;
  status?: FinanceTransactionStatus;
  referenceType?: FinanceReferenceType;
  startDate?: number;
  endDate?: number;
  limit?: number;
  offset?: number;
  orderBy?: 'createdAt' | 'amount';
  orderDirection?: 'asc' | 'desc';
}

/**
 * Query options for organizer finance transactions
 * Same as club options but uses organizerUserId instead of odClubId
 */
export interface OrganizerFinanceQueryOptions {
  organizerUserId: string;
  type?: FinanceTransactionType;
  status?: FinanceTransactionStatus;
  referenceType?: FinanceReferenceType;
  startDate?: number;
  endDate?: number;
  limit?: number;
  offset?: number;
  orderBy?: 'createdAt' | 'amount';
  orderDirection?: 'asc' | 'desc';
}

/**
 * Finance overview/summary for a club or organizer
 */
export interface FinanceOverview {
  // Period
  periodStart: number;
  periodEnd: number;

  // Totals (all in cents)
  grossSales: number;
  refundsTotal: number;
  platformFeesTotal: number;
  netRevenue: number;

  // Counts
  transactionCount: number;
  refundCount: number;

  // Currency
  currency: FinanceCurrency;
}

// Helper to check if transaction is completed
export const isFinanceTransactionComplete = (tx: FinanceTransaction): boolean =>
  tx.status === 'completed';

// Helper to format finance currency
export const formatFinanceCurrency = (
  cents: number,
  currency: FinanceCurrency = 'NZD'
): string => {
  const dollars = cents / 100;
  const symbols: Record<FinanceCurrency, string> = {
    NZD: 'NZ$',
    AUD: 'A$',
    USD: '$',
    GBP: '£',
  };
  return `${symbols[currency]}${dollars.toFixed(2)}`;
};
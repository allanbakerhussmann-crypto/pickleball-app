/**
 * Payment System Types
 * 
 * Core type definitions for the unified payment system.
 * All amounts are stored in CENTS (e.g., $10.00 = 1000)
 * 
 * FILE LOCATION: services/firebase/payments/types.ts
 */

// ============================================
// CURRENCY & PLATFORM SETTINGS
// ============================================

export type SupportedCurrency = 'nzd' | 'aud' | 'usd';

export interface PlatformFeeSettings {
  /** Default platform fee rate (e.g., 0.015 = 1.5%) */
  defaultRate: number;
  /** Minimum allowed rate */
  minRate: number;
  /** Maximum allowed rate */
  maxRate: number;
  /** Fixed fee per transaction in cents (e.g., 30 = $0.30) */
  perTransactionFee: number;
  /** Override rates by transaction type */
  rateByType: {
    court_booking: number;
    tournament: number;
    league: number;
    wallet_topup: number;
    annual_pass: number;
    membership: number;
  };
}

export interface TaxSettings {
  /** Whether tax calculation is enabled */
  enabled: boolean;
  /** Tax rates by currency/country */
  rates: {
    nzd: number;  // NZ GST: 0.15
    aud: number;  // AU GST: 0.10
    usd: number;  // US: 0 (varies by state)
  };
  /** Display prices inclusive of tax */
  displayInclusive: boolean;
}

export interface RetentionSettings {
  /** Years to retain financial records (7 for IRD compliance) */
  years: number;
  /** Enable auto-archiving of old records */
  archiveEnabled: boolean;
  /** Never auto-delete (always true for compliance) */
  autoDeleteDisabled: boolean;
}

export interface PlatformSettings {
  fees: PlatformFeeSettings;
  currencies: {
    supported: SupportedCurrency[];
    default: SupportedCurrency;
  };
  tax: TaxSettings;
  retention: RetentionSettings;
}

/** Default platform settings */
export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  fees: {
    defaultRate: 0.015, // 1.5%
    minRate: 0.01,
    maxRate: 0.03,
    perTransactionFee: 0, // No fixed fee initially
    rateByType: {
      court_booking: 0.015,
      tournament: 0.015,
      league: 0.015,
      wallet_topup: 0.015,
      annual_pass: 0.015,
      membership: 0.015,
    },
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

export interface Refund {
  id: string;
  paymentId: string;
  transactionId?: string;
  odUserId: string;
  odClubId?: string;
  
  /** Refund amount in cents */
  amount: number;
  currency: SupportedCurrency;
  
  /** Reason for refund */
  reason: string;
  /** Additional notes */
  notes?: string;
  
  status: RefundStatus;
  refundMethod: RefundMethod;
  
  /** Stripe refund ID if applicable */
  stripeRefundId?: string;
  
  /** Who processed the refund */
  requestedByUserId: string;
  processedByUserId?: string;
  
  /** If rejected, why */
  rejectionReason?: string;
  
  requestedAt: number;
  processedAt?: number;
}

/** Input for creating a refund request */
export interface CreateRefundInput {
  paymentId: string;
  amount: number;
  reason: string;
  refundMethod: RefundMethod;
  requestedByUserId: string;
  notes?: string;
}

// ============================================
// ANNUAL PASS TYPES (Enhanced)
// ============================================

export type AnnualPassStatus = 'active' | 'expired' | 'cancelled' | 'refunded' | 'pending';

export interface AnnualPass {
  id: string;
  odUserId: string;
  odClubId: string;
  
  /** Pass validity */
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  
  status: AnnualPassStatus;
  
  /** Payment info */
  amountPaid: number;
  currency: SupportedCurrency;
  stripePaymentIntentId?: string;
  paymentId?: string;
  
  /** Usage tracking */
  bookingsUsed: number;
  bookingsLimit?: number; // undefined = unlimited
  
  /** Renewal settings */
  autoRenew: boolean;
  stripeSubscriptionId?: string;
  renewalDate?: number;
  gracePeriodEnd?: number;
  
  /** Benefit type */
  benefitType: 'unlimited' | 'discounted';
  discountPercent?: number;
  
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
  stripePaymentIntentId?: string;
  autoRenew?: boolean;
}

// ============================================
// PAYOUT TYPES
// ============================================

export type PayoutStatus = 
  | 'pending'
  | 'scheduled'
  | 'in_transit'
  | 'paid'
  | 'failed'
  | 'cancelled';

export type PayoutFrequency = 'daily' | 'weekly' | 'monthly';

export interface PayoutSettings {
  frequency: PayoutFrequency;
  /** Day of week for weekly payouts (0=Sunday, 6=Saturday) */
  dayOfWeek?: number;
  /** Day of month for monthly payouts (1-28) */
  dayOfMonth?: number;
  /** Minimum amount to trigger payout (in cents) */
  minimumPayout: number;
  /** Days to hold funds before payout (fraud prevention) */
  holdPeriodDays: number;
  /** Stripe Connect account ID */
  stripeAccountId?: string;
  stripeAccountStatus?: 'pending' | 'active' | 'restricted';
}

export interface Payout {
  id: string;
  odClubId: string;
  
  /** Payout amount in cents */
  amount: number;
  currency: SupportedCurrency;
  
  status: PayoutStatus;
  
  /** Stripe references */
  stripePayoutId?: string;
  stripeTransferId?: string;
  
  /** Timing */
  initiatedAt: number;
  scheduledAt?: number;
  expectedArrivalAt?: number;
  paidAt?: number;
  
  /** For failed payouts */
  failureReason?: string;
  failureCode?: string;
  
  /** Transaction IDs included in this payout */
  transactionIds: string[];
  
  /** Summary */
  transactionCount: number;
  grossAmount: number;
  platformFees: number;
  netAmount: number;
}

// ============================================
// RECEIPT TYPES
// ============================================

export interface Receipt {
  id: string;
  transactionId: string;
  paymentId?: string;
  odUserId: string;
  odClubId?: string;
  
  /** Sequential receipt number (e.g., CLUB-2024-00001) */
  receiptNumber: string;
  
  /** Line items */
  items: ReceiptItem[];
  
  /** Amounts */
  subtotal: number;
  discounts: number;
  tax: number;
  total: number;
  currency: SupportedCurrency;
  
  /** PDF and email tracking */
  pdfUrl?: string;
  emailedAt?: number;
  emailedTo?: string;
  
  /** Club branding applied */
  brandingApplied: boolean;
  
  createdAt: number;
}

export interface ReceiptItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  taxRate?: number;
}

// ============================================
// CLUB BRANDING TYPES
// ============================================

export interface ClubBranding {
  /** Club logo URL for receipts */
  logoUrl?: string;
  /** Max logo width in pixels */
  logoWidth?: number;
  /** Primary brand color (hex) */
  primaryColor?: string;
  /** Secondary/accent color (hex) */
  secondaryColor?: string;
  /** Custom receipt footer text */
  receiptFooter?: string;
  /** Tax registration number (GST/ABN) */
  taxNumber?: string;
  /** Legal business name */
  businessName?: string;
  /** Business address for receipts */
  businessAddress?: string;
  /** Contact email */
  contactEmail?: string;
  /** Contact phone */
  contactPhone?: string;
}

// ============================================
// PRICING TYPES
// ============================================

export type PriceType = 'standard' | 'peak' | 'weekend' | 'holiday';

export interface PriceBreakdownItem {
  label: string;
  amount: number;
}

export interface BookingPriceResult {
  /** Base court fee */
  courtFee: number;
  /** Additional fees */
  lightingFee: number;
  equipmentFee: number;
  ballMachineFee: number;
  visitorFee: number;
  
  /** Subtotal before discounts */
  subtotal: number;
  
  /** Discounts applied */
  memberDiscount: number;
  passDiscount: number;
  promoDiscount: number;
  totalDiscounts: number;
  
  /** Fees */
  processingFee: number;
  platformFee: number;
  taxAmount: number;
  
  /** Final total */
  total: number;
  
  /** Detailed breakdown for display */
  breakdown: PriceBreakdownItem[];
  discounts: PriceBreakdownItem[];
  
  /** Context */
  priceType: PriceType;
  courtGrade: string;
  isMember: boolean;
  hasAnnualPass: boolean;
  isVisitor: boolean;
  currency: SupportedCurrency;
  
  /** Applied promo code */
  promoCode?: string;
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
// HELPER TYPE GUARDS
// ============================================

export const isWalletActive = (wallet: Wallet): boolean => 
  wallet.status === 'active';

export const isTransactionComplete = (tx: Transaction): boolean => 
  tx.status === 'completed';

export const isPaymentSuccessful = (payment: Payment): boolean => 
  payment.status === 'succeeded';

export const isRefundPending = (refund: Refund): boolean => 
  refund.status === 'pending' || refund.status === 'approved';

export const isPassActive = (pass: AnnualPass): boolean => {
  if (pass.status !== 'active') return false;
  const today = new Date().toISOString().split('T')[0];
  return pass.startDate <= today && pass.endDate >= today;
};

// ============================================
// AMOUNT HELPER FUNCTIONS
// ============================================

/** Convert dollars to cents */
export const toCents = (dollars: number): number => 
  Math.round(dollars * 100);

/** Convert cents to dollars */
export const toDollars = (cents: number): number => 
  cents / 100;

/** Format cents as currency string */
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

/** Get currency symbol */
export const getCurrencySymbol = (currency: SupportedCurrency): string => {
  const symbols: Record<SupportedCurrency, string> = {
    nzd: 'NZ$',
    aud: 'A$',
    usd: '$',
  };
  return symbols[currency];
};
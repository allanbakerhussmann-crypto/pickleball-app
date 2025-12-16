/**
 * Payment Services - Main Entry Point
 * 
 * Re-exports all payment-related types and functions.
 * 
 * FILE LOCATION: services/firebase/payments/index.ts
 */

// ============================================
// TYPE EXPORTS
// ============================================

export type {
  // Currency & Platform
  SupportedCurrency,
  PlatformFeeSettings,
  TaxSettings,
  RetentionSettings,
  PlatformSettings,
  
  // Wallet
  WalletStatus,
  Wallet,
  CreateWalletInput,
  
  // Transaction
  TransactionType,
  TransactionStatus,
  PaymentMethod,
  ReferenceType,
  TransactionBreakdownItem,
  TransactionBreakdown,
  Transaction,
  CreateTransactionInput,
  
  // Payment
  PaymentStatus,
  Payment,
  
  // Refund
  RefundStatus,
  RefundMethod,
  Refund,
  CreateRefundInput,
  
  // Annual Pass
  AnnualPassStatus,
  AnnualPass,
  PurchaseAnnualPassInput,
  
  // Payout
  PayoutStatus,
  PayoutFrequency,
  PayoutSettings,
  Payout,
  
  // Receipt
  Receipt,
  ReceiptItem,
  
  // Branding
  ClubBranding,
  
  // Pricing
  PriceType,
  PriceBreakdownItem,
  BookingPriceResult,
  
  // Audit
  AuditAction,
  PaymentAuditLog,
  
  // Query
  TransactionQueryOptions,
  PayoutQueryOptions,
} from './types';

// ============================================
// CONSTANT & DEFAULT EXPORTS
// ============================================

export { DEFAULT_PLATFORM_SETTINGS } from './types';

// ============================================
// HELPER FUNCTION EXPORTS
// ============================================

export {
  // Type guards
  isWalletActive,
  isTransactionComplete,
  isPaymentSuccessful,
  isRefundPending,
  isPassActive,
  
  // Amount helpers
  toCents,
  toDollars,
  formatCurrency,
  getCurrencySymbol,
} from './types';

// ============================================
// SERVICE EXPORTS (to be added as we build them)
// ============================================

// Wallet services
// export * from './wallet';

// Transaction services
// export * from './transactions';

// Pricing services
// export * from './pricing';

// Annual pass services
// export * from './annualPass';

// Refund services
// export * from './refunds';

// Platform fee services
// export * from './platformFees';

// Validation services
// export * from './validation';
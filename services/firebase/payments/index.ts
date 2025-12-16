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
// HELPER FUNCTION EXPORTS FROM TYPES
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
// WALLET SERVICE EXPORTS
// ============================================

export {
  // Wallet ID generation
  generateWalletId,
  
  // Create & Get
  createWallet,
  getOrCreateWallet,
  getWallet,
  getWalletByUserAndClub,
  getWalletBalance,
  getUserWallets,
  getClubWallets,
  getActiveClubWallets,
  
  // Subscriptions
  subscribeToWallet,
  subscribeToUserWallets,
  subscribeToClubWallets,
  
  // Balance operations
  addToWallet,
  deductFromWallet,
  hasSufficientFunds,
  transferBetweenWallets,
  
  // Status management
  updateWalletStatus,
  freezeWallet,
  unfreezeWallet,
  closeWallet,
  
  // Utilities
  getTotalUserBalance,
  getTotalClubWalletBalance,
  countActiveClubWallets,
  
  // Types
  type BalanceOperationResult,
} from './wallet';

// ============================================
// TRANSACTION SERVICE EXPORTS
// ============================================

export {
  // ID generation
  generateTransactionId,
  
  // Create & Update
  logTransaction,
  updateTransactionStatus,
  completeTransaction,
  failTransaction,
  reverseTransaction,
  
  // Get transactions
  getTransaction,
  getTransactionByStripePaymentIntent,
  getTransactionsByReference,
  
  // Query transactions
  queryTransactions,
  getUserTransactionHistory,
  getUserClubTransactionHistory,
  getClubTransactionHistory,
  getWalletTransactionHistory,
  getTournamentTransactions,
  getLeagueTransactions,
  
  // Subscriptions
  subscribeToUserTransactions,
  subscribeToWalletTransactions,
  subscribeToClubTransactions,
  
  // Aggregation helpers
  calculateTransactionTotal,
  groupTransactionsByType,
  groupTransactionsByDate,
  groupTransactionsByMonth,
  getUserSpendingByCategory,
  getClubRevenueBySource,
  
  // Utilities
  createSimpleBreakdown,
  countUserTransactions,
  getLatestUserTransaction,
} from './transactions';

// ============================================
// VALIDATION SERVICE EXPORTS
// ============================================

export {
  // Validation result type
  type ValidationResult,
  
  // Basic validators
  isNonEmptyString,
  isPositiveNumber,
  isNonNegativeNumber,
  isValidCentsAmount,
  isValidCurrency,
  isValidTransactionType,
  isValidPaymentMethod,
  isValidReferenceType,
  
  // Amount validation
  validateAmount,
  
  // Wallet validation
  validateCreateWalletInput,
  validateWalletOperation,
  
  // Transaction validation
  validateTransactionBreakdown,
  validateCreateTransactionInput,
  
  // Refund validation
  validateCreateRefundInput,
  
  // Top-up validation
  validateTopUpAmount,
  
  // Date validation
  validateDateRange,
  
  // Stripe validation
  validateStripePaymentIntentId,
  validateStripeChargeId,
  
  // Utilities
  combineValidationResults,
  assertValid,
} from './validation';

// ============================================
// SERVICE EXPORTS (to be added as we build them)
// ============================================

// Pricing services
// export * from './pricing';

// Annual pass services
// export * from './annualPass';

// Refund services
// export * from './refunds';

// Platform fee services
// export * from './platformFees';
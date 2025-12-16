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
// PRICING SERVICE EXPORTS
// ============================================

export {
  // Types
  type PricingContext,
  
  // Time helpers
  parseTimeToMinutes,
  getDayOfWeek,
  isWeekend,
  isPeakTime,
  determinePriceType,
  
  // Price lookups
  getBasePrice,
  getGradeConfig,
  
  // Discount calculations
  calculateMemberDiscount,
  calculatePassDiscount,
  calculateVisitorPremium,
  
  // Add-on calculations
  calculateLightingFee,
  calculateEquipmentFee,
  calculateBallMachineFee,
  calculateVisitorFee,
  
  // Main pricing function
  calculateBookingPrice,
  calculateMultiSlotPrice,
  
  // Utilities
  isBookingFree,
  getPriceSummary,
  formatPrice,
  getPriceTypeLabel,
} from './pricing';

// ============================================
// PLATFORM FEE SERVICE EXPORTS
// ============================================

export {
  // Types
  type FeeCalculationResult,
  type TaxCalculationResult,
  
  // Fee rate lookups
  getFeeRateForType,
  getFixedFee,
  
  // Fee calculations
  calculatePlatformFee,
  calculatePlatformFeeWithRate,
  
  // Tax calculations
  getTaxRate,
  calculateTax,
  addTaxToBreakdown,
  getTaxLabel,
  
  // Combined calculations
  calculateAllFees,
  calculateNetPayout,
  
  // Validation
  validateFeeRate,
  
  // Display helpers
  formatFeeRate,
  formatFeeAmount,
  getFeeSummary,
  
  // Stripe fee passthrough (optional)
  calculateStripeProcessingFee,
  calculateAmountWithStripeFee,
} from './platformFees';

// ============================================
// RETENTION & COMPLIANCE SERVICE EXPORTS
// ============================================

export {
  // Constants
  RETENTION_PERIODS,
  CURRENCY_JURISDICTION,
  FINANCIAL_COLLECTIONS,
  
  // Types
  type FinancialCollection,
  type RetentionMetadata,
  type RetentionStatus,
  type ComplianceCheckResult,
  
  // Date calculations
  getRetentionPeriod,
  calculateRetentionEndDate,
  calculateCustomRetentionEndDate,
  isInRetentionPeriod,
  getDaysRemainingInRetention,
  getRetentionStatus,
  
  // Metadata helpers
  createRetentionMetadata,
  addRetentionMetadata,
  
  // Archival functions
  markAsArchived,
  getRecordsReadyForArchival,
  countRecordsReadyForArchival,
  batchArchiveRecords,
  
  // Compliance helpers
  checkRecordCompliance,
  getRetentionSummary,
  
  // Tax year helpers
  getTaxYear,
  getTaxYearDateRange,
  isTaxYearInRetention,
  
  // Display helpers
  formatRetentionStatus,
  getRetentionRequirementText,
} from './retention';

// ============================================
// SERVICE EXPORTS (to be added as we build them)
// ============================================

// Annual pass services
// export * from './annualPass';

// Refund services
// export * from './refunds';
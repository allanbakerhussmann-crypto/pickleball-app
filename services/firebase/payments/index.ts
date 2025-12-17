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

// ============================================
// ANNUAL PASS SERVICE EXPORTS
// ============================================

export {
  // Constants
  DEFAULT_PASS_DURATION_DAYS,
  RENEWAL_GRACE_PERIOD_DAYS,
  MAX_PASSES_PER_CLUB,
  
  // Types
  type AnnualPassConfig,
  type PassUsageRecord,
  type PassValidationResult,
  type PassUsageStats,
  
  // ID generation
  generatePassId,
  
  // CRUD operations
  createAnnualPass,
  getAnnualPass,
  getActivePassForUserAndClub,
  getUserPasses,
  getClubActivePasses,
  
  // Subscriptions
  subscribeToUserPasses,
  subscribeToPass,
  
  // Status management
  updatePassStatus,
  suspendPass,
  reactivatePass,
  cancelPass,
  expirePass,
  
  // Renewal
  isPassEligibleForRenewal,
  renewPass,
  getPassesExpiringSoon,
  getExpiredPasses,
  batchExpirePasses,
  
  // Validation & Usage
  validatePassForBooking,
  recordPassUsage,
  getPassUsageHistory,
  countPassUsageForDate,
  getPassUsageForDateRange,
  
  // Statistics
  getPassUsageStats,
  getClubPassStats,
  
  // Helpers
  calculateEndDate,
  getDaysRemaining,
  isPassActiveAndValid,
  getPassStatusLabel,
  getPassStatusColor,
  formatSavings,
  calculatePassValue,
  createDefaultPassConfig,
} from './annualPass';

// Refund services
// ============================================
// REFUND SERVICE EXPORTS
// ============================================

export {
  // Constants
  MAX_REFUND_WINDOW_DAYS,
  MIN_REFUND_AMOUNT,
  REFUND_REASONS,
  type RefundReason,
  
  // Types
  type RefundPolicy,
  type RefundCalculation,
  type RefundRequest,
  type RefundApproval,
  
  // ID generation
  generateRefundId,
  
  // CRUD operations
  getRefund,
  getRefundsForPayment,
  getUserRefunds,
  getClubRefunds,
  getPendingRefunds,
  
  // Subscriptions
  subscribeToUserRefunds,
  subscribeToPendingRefunds,
  
  // Validation
  validateRefundRequest,
  calculateRefundAmounts,
  canPaymentBeRefunded,
  
  // Processing
  createRefundRequest,
  processRefundApproval,
  processApprovedRefund,
  completeRefund,
  failRefund,
  
  // Queries
  getTotalRefundedForPayment,
  getClubRefundStats,
  
  // Helpers
  getRefundStatusLabel,
  getRefundStatusColor,
  getRefundReasonLabel,
  formatRefundAmount,
  createDefaultRefundPolicy,
  isRefundProcessingDelayed,
  estimateRefundCompletionTime,
} from './refunds';

// ============================================
// STRIPE SERVICE EXPORTS
// ============================================

export {
  // Types
  type StripePaymentIntentStatus,
  type CreatePaymentIntentParams,
  type PaymentIntentResponse,
  type StripeCustomer,
  type StripeConnectAccount,
  type StripeWebhookEvent,
  
  // Status mapping
  mapStripeStatusToPaymentStatus,
  
  // Customer management
  getStripeCustomer,
  getStripeCustomerByStripeId,
  saveStripeCustomer,
  updateDefaultPaymentMethod,
  
  // Connect account management
  getStripeConnectAccount,
  getStripeConnectAccountByStripeId,
  saveStripeConnectAccount,
  updateStripeConnectAccountStatus,
  canClubReceivePayments,
  canClubReceivePayouts,
  
  // Payment management
  createPendingPayment,
  linkPaymentToStripeIntent,
  getPayment,
  getPaymentByStripeIntent,
  updatePaymentStatus,
  getUserPayments,
  getClubPayments,
  
  // Webhook events
  hasWebhookEventBeenProcessed,
  recordWebhookEvent,
  markWebhookEventProcessed,
  
  // Payment flow helpers
  buildPaymentIntentMetadata,
  calculateApplicationFee,
  getStripeCurrency,
  
  // Refund helpers
  recordPaymentRefund,
  
  // Validation
  validatePaymentAmount,
  isPaymentMethodValidForCurrency,
  
  // Display helpers
  getPaymentStatusText,
  getPaymentStatusColor,
  formatPaymentAmount,
} from './stripe';

// ============================================
// STRIPE WEBHOOK EXPORTS
// ============================================

export {
  // Types
  type StripeEvent,
  type StripePaymentIntent,
  type StripeRefund,
  type WebhookHandlerResult,
  
  // Main processor
  processStripeWebhook,
  
  // Utility
  getRecentWebhookEvents,
  retryWebhookEvent,
} from './stripeWebhooks';
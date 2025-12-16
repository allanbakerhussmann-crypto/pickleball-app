/**
 * Payment Validation Service
 * 
 * Input validation helpers for payment operations.
 * All validation functions return a ValidationResult object.
 * 
 * FILE LOCATION: services/firebase/payments/validation.ts
 */

import type {
  CreateWalletInput,
  CreateTransactionInput,
  CreateRefundInput,
  TransactionType,
  TransactionStatus,
  PaymentMethod,
  ReferenceType,
  SupportedCurrency,
  TransactionBreakdown,
} from './types';

// ============================================
// VALIDATION RESULT TYPE
// ============================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Create a successful validation result
 */
const validResult = (): ValidationResult => ({
  valid: true,
  errors: [],
});

/**
 * Create a failed validation result
 */
const invalidResult = (errors: string[]): ValidationResult => ({
  valid: false,
  errors,
});

// ============================================
// BASIC VALIDATORS
// ============================================

/**
 * Check if a string is non-empty
 */
export const isNonEmptyString = (value: unknown): value is string => {
  return typeof value === 'string' && value.trim().length > 0;
};

/**
 * Check if a value is a positive number
 */
export const isPositiveNumber = (value: unknown): value is number => {
  return typeof value === 'number' && value > 0 && Number.isFinite(value);
};

/**
 * Check if a value is a non-negative number
 */
export const isNonNegativeNumber = (value: unknown): value is number => {
  return typeof value === 'number' && value >= 0 && Number.isFinite(value);
};

/**
 * Check if a value is a valid integer (for cents)
 */
export const isValidCentsAmount = (value: unknown): value is number => {
  return typeof value === 'number' && 
         Number.isInteger(value) && 
         value >= 0 && 
         value <= 99999999; // Max ~$999,999.99
};

/**
 * Check if a value is a valid currency
 */
export const isValidCurrency = (value: unknown): value is SupportedCurrency => {
  return value === 'nzd' || value === 'aud' || value === 'usd';
};

/**
 * Check if a value is a valid transaction type
 */
export const isValidTransactionType = (value: unknown): value is TransactionType => {
  const validTypes: TransactionType[] = [
    'topup', 'payment', 'refund', 'adjustment', 'payout', 'commission'
  ];
  return validTypes.includes(value as TransactionType);
};

/**
 * Check if a value is a valid payment method
 */
export const isValidPaymentMethod = (value: unknown): value is PaymentMethod => {
  const validMethods: PaymentMethod[] = [
    'card', 'wallet', 'annual_pass', 'bank_transfer', 'free'
  ];
  return validMethods.includes(value as PaymentMethod);
};

/**
 * Check if a value is a valid reference type
 */
export const isValidReferenceType = (value: unknown): value is ReferenceType => {
  const validTypes: ReferenceType[] = [
    'court_booking', 'tournament', 'league', 'annual_pass', 
    'wallet_topup', 'membership', 'visitor_fee'
  ];
  return validTypes.includes(value as ReferenceType);
};

// ============================================
// AMOUNT VALIDATION
// ============================================

/**
 * Validate an amount in cents
 */
export const validateAmount = (
  amount: unknown,
  options?: {
    allowZero?: boolean;
    allowNegative?: boolean;
    maxAmount?: number;
    minAmount?: number;
  }
): ValidationResult => {
  const errors: string[] = [];
  const { 
    allowZero = false, 
    allowNegative = false, 
    maxAmount = 99999999,
    minAmount = 0
  } = options ?? {};

  if (typeof amount !== 'number') {
    errors.push('Amount must be a number');
    return invalidResult(errors);
  }

  if (!Number.isFinite(amount)) {
    errors.push('Amount must be a finite number');
    return invalidResult(errors);
  }

  if (!Number.isInteger(amount)) {
    errors.push('Amount must be an integer (in cents)');
  }

  if (!allowNegative && amount < 0) {
    errors.push('Amount cannot be negative');
  }

  if (!allowZero && amount === 0) {
    errors.push('Amount cannot be zero');
  }

  if (amount > maxAmount) {
    errors.push(`Amount cannot exceed ${maxAmount} cents`);
  }

  if (amount < minAmount) {
    errors.push(`Amount must be at least ${minAmount} cents`);
  }

  return errors.length > 0 ? invalidResult(errors) : validResult();
};

// ============================================
// WALLET VALIDATION
// ============================================

/**
 * Validate wallet creation input
 */
export const validateCreateWalletInput = (
  input: CreateWalletInput
): ValidationResult => {
  const errors: string[] = [];

  if (!isNonEmptyString(input.odUserId)) {
    errors.push('odUserId is required and must be a non-empty string');
  }

  if (!isNonEmptyString(input.odClubId)) {
    errors.push('odClubId is required and must be a non-empty string');
  }

  if (input.currency !== undefined && !isValidCurrency(input.currency)) {
    errors.push('currency must be one of: nzd, aud, usd');
  }

  return errors.length > 0 ? invalidResult(errors) : validResult();
};

/**
 * Validate wallet balance operation
 */
export const validateWalletOperation = (
  odUserId: string,
  odClubId: string,
  amount: number
): ValidationResult => {
  const errors: string[] = [];

  if (!isNonEmptyString(odUserId)) {
    errors.push('odUserId is required');
  }

  if (!isNonEmptyString(odClubId)) {
    errors.push('odClubId is required');
  }

  const amountValidation = validateAmount(amount, { minAmount: 1 });
  if (!amountValidation.valid) {
    errors.push(...amountValidation.errors);
  }

  return errors.length > 0 ? invalidResult(errors) : validResult();
};

// ============================================
// TRANSACTION VALIDATION
// ============================================

/**
 * Validate transaction breakdown
 */
export const validateTransactionBreakdown = (
  breakdown: TransactionBreakdown
): ValidationResult => {
  const errors: string[] = [];

  if (!breakdown) {
    errors.push('Transaction breakdown is required');
    return invalidResult(errors);
  }

  if (!Array.isArray(breakdown.items)) {
    errors.push('Breakdown items must be an array');
  } else if (breakdown.items.length === 0) {
    errors.push('Breakdown must have at least one item');
  } else {
    // Validate each item
    for (let i = 0; i < breakdown.items.length; i++) {
      const item = breakdown.items[i];
      if (!isNonEmptyString(item.label)) {
        errors.push(`Item ${i + 1}: label is required`);
      }
      if (!isValidCentsAmount(item.amount) && item.amount !== 0) {
        errors.push(`Item ${i + 1}: amount must be a valid cents value`);
      }
      if (!['charge', 'discount', 'fee', 'tax'].includes(item.type)) {
        errors.push(`Item ${i + 1}: type must be charge, discount, fee, or tax`);
      }
    }
  }

  // Validate totals are numbers
  if (typeof breakdown.subtotal !== 'number') {
    errors.push('Breakdown subtotal must be a number');
  }
  if (typeof breakdown.discounts !== 'number') {
    errors.push('Breakdown discounts must be a number');
  }
  if (typeof breakdown.fees !== 'number') {
    errors.push('Breakdown fees must be a number');
  }
  if (typeof breakdown.tax !== 'number') {
    errors.push('Breakdown tax must be a number');
  }
  if (typeof breakdown.total !== 'number') {
    errors.push('Breakdown total must be a number');
  }

  // Validate total calculation
  if (errors.length === 0) {
    const calculatedTotal = breakdown.subtotal - breakdown.discounts + breakdown.fees + breakdown.tax;
    if (Math.abs(calculatedTotal - breakdown.total) > 1) { // Allow 1 cent rounding difference
      errors.push(`Breakdown total (${breakdown.total}) doesn't match calculated total (${calculatedTotal})`);
    }
  }

  return errors.length > 0 ? invalidResult(errors) : validResult();
};

/**
 * Validate transaction creation input
 */
export const validateCreateTransactionInput = (
  input: CreateTransactionInput
): ValidationResult => {
  const errors: string[] = [];

  // Required fields
  if (!isNonEmptyString(input.odUserId)) {
    errors.push('odUserId is required');
  }

  if (!isValidTransactionType(input.type)) {
    errors.push('type must be a valid transaction type');
  }

  // Amount validation - allow negative for refunds
  const allowNegative = input.type === 'refund' || input.type === 'adjustment';
  const amountValidation = validateAmount(input.amount, { 
    allowNegative, 
    allowZero: input.type === 'adjustment' 
  });
  if (!amountValidation.valid) {
    errors.push(...amountValidation.errors.map(e => `amount: ${e}`));
  }

  if (!isValidCurrency(input.currency)) {
    errors.push('currency must be one of: nzd, aud, usd');
  }

  if (!isValidPaymentMethod(input.paymentMethod)) {
    errors.push('paymentMethod must be a valid payment method');
  }

  if (!isValidReferenceType(input.referenceType)) {
    errors.push('referenceType must be a valid reference type');
  }

  if (!isNonEmptyString(input.referenceId)) {
    errors.push('referenceId is required');
  }

  if (!isNonEmptyString(input.referenceName)) {
    errors.push('referenceName is required');
  }

  // Validate breakdown
  const breakdownValidation = validateTransactionBreakdown(input.breakdown);
  if (!breakdownValidation.valid) {
    errors.push(...breakdownValidation.errors.map(e => `breakdown: ${e}`));
  }

  // Conditional validations
  if (input.paymentMethod === 'wallet' && !isNonEmptyString(input.walletId)) {
    errors.push('walletId is required when paymentMethod is wallet');
  }

  // Club/Tournament/League - at least one should be present for most types
  if (input.type !== 'adjustment') {
    if (!input.odClubId && !input.tournamentId && !input.leagueId) {
      // This is a warning, not an error - some transactions might be platform-level
    }
  }

  return errors.length > 0 ? invalidResult(errors) : validResult();
};

// ============================================
// REFUND VALIDATION
// ============================================

/**
 * Validate refund creation input
 */
export const validateCreateRefundInput = (
  input: CreateRefundInput,
  originalPaymentAmount?: number
): ValidationResult => {
  const errors: string[] = [];

  if (!isNonEmptyString(input.paymentId)) {
    errors.push('paymentId is required');
  }

  const amountValidation = validateAmount(input.amount, { minAmount: 1 });
  if (!amountValidation.valid) {
    errors.push(...amountValidation.errors.map(e => `amount: ${e}`));
  }

  // Check refund doesn't exceed original payment
  if (originalPaymentAmount !== undefined && input.amount > originalPaymentAmount) {
    errors.push(`Refund amount (${input.amount}) cannot exceed original payment (${originalPaymentAmount})`);
  }

  if (!isNonEmptyString(input.reason)) {
    errors.push('reason is required');
  }

  if (!['original', 'wallet', 'credit'].includes(input.refundMethod)) {
    errors.push('refundMethod must be: original, wallet, or credit');
  }

  if (!isNonEmptyString(input.requestedByUserId)) {
    errors.push('requestedByUserId is required');
  }

  return errors.length > 0 ? invalidResult(errors) : validResult();
};

// ============================================
// TOP-UP VALIDATION
// ============================================

/**
 * Validate wallet top-up amount against club settings
 */
export const validateTopUpAmount = (
  amount: number,
  settings?: {
    allowCustomTopUp?: boolean;
    allowedAmounts?: number[];
    minTopUp?: number;
    maxTopUp?: number;
  }
): ValidationResult => {
  const errors: string[] = [];

  // Basic amount validation
  const amountValidation = validateAmount(amount, { minAmount: 100 }); // Min $1.00
  if (!amountValidation.valid) {
    return amountValidation;
  }

  if (settings) {
    const { allowCustomTopUp, allowedAmounts, minTopUp, maxTopUp } = settings;

    // Check against allowed amounts if custom not allowed
    if (!allowCustomTopUp && allowedAmounts && allowedAmounts.length > 0) {
      if (!allowedAmounts.includes(amount)) {
        errors.push(`Amount must be one of: ${allowedAmounts.map(a => `$${a/100}`).join(', ')}`);
      }
    }

    // Check min/max
    if (minTopUp && amount < minTopUp) {
      errors.push(`Minimum top-up is $${minTopUp/100}`);
    }
    if (maxTopUp && amount > maxTopUp) {
      errors.push(`Maximum top-up is $${maxTopUp/100}`);
    }
  }

  return errors.length > 0 ? invalidResult(errors) : validResult();
};

// ============================================
// DATE VALIDATION
// ============================================

/**
 * Validate a date range
 */
export const validateDateRange = (
  startDate: number,
  endDate: number
): ValidationResult => {
  const errors: string[] = [];

  if (typeof startDate !== 'number' || !Number.isFinite(startDate)) {
    errors.push('startDate must be a valid timestamp');
  }

  if (typeof endDate !== 'number' || !Number.isFinite(endDate)) {
    errors.push('endDate must be a valid timestamp');
  }

  if (errors.length === 0 && startDate > endDate) {
    errors.push('startDate cannot be after endDate');
  }

  // Check for reasonable date range (not more than 10 years)
  const tenYears = 10 * 365 * 24 * 60 * 60 * 1000;
  if (errors.length === 0 && (endDate - startDate) > tenYears) {
    errors.push('Date range cannot exceed 10 years');
  }

  return errors.length > 0 ? invalidResult(errors) : validResult();
};

// ============================================
// STRIPE VALIDATION
// ============================================

/**
 * Validate Stripe Payment Intent ID format
 */
export const validateStripePaymentIntentId = (
  id: string
): ValidationResult => {
  const errors: string[] = [];

  if (!isNonEmptyString(id)) {
    errors.push('Payment Intent ID is required');
  } else if (!id.startsWith('pi_')) {
    errors.push('Invalid Payment Intent ID format (should start with pi_)');
  }

  return errors.length > 0 ? invalidResult(errors) : validResult();
};

/**
 * Validate Stripe Charge ID format
 */
export const validateStripeChargeId = (
  id: string
): ValidationResult => {
  const errors: string[] = [];

  if (!isNonEmptyString(id)) {
    errors.push('Charge ID is required');
  } else if (!id.startsWith('ch_') && !id.startsWith('py_')) {
    errors.push('Invalid Charge ID format');
  }

  return errors.length > 0 ? invalidResult(errors) : validResult();
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Combine multiple validation results
 */
export const combineValidationResults = (
  ...results: ValidationResult[]
): ValidationResult => {
  const allErrors = results.flatMap(r => r.errors);
  return allErrors.length > 0 ? invalidResult(allErrors) : validResult();
};

/**
 * Assert validation passes, throw if not
 */
export const assertValid = (
  result: ValidationResult,
  errorPrefix?: string
): void => {
  if (!result.valid) {
    const message = errorPrefix 
      ? `${errorPrefix}: ${result.errors.join(', ')}`
      : result.errors.join(', ');
    throw new Error(message);
  }
};
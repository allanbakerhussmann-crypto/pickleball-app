/**
 * Platform Fee Service
 * 
 * Calculates platform fees for different transaction types.
 * Fees are configurable per transaction type and can include
 * both percentage-based and fixed per-transaction fees.
 * 
 * All amounts are in CENTS.
 * 
 * FILE LOCATION: services/firebase/payments/platformFees.ts
 */

import type {
  SupportedCurrency,
  ReferenceType,
  PlatformFeeSettings,
  PlatformSettings,
  TransactionBreakdown,
} from './types';
import { DEFAULT_PLATFORM_SETTINGS } from './types';

// ============================================
// FEE CALCULATION TYPES
// ============================================

export interface FeeCalculationResult {
  /** Gross amount (original transaction amount) */
  grossAmount: number;
  /** Platform fee in cents */
  platformFee: number;
  /** Fixed per-transaction fee in cents */
  fixedFee: number;
  /** Percentage-based fee in cents */
  percentageFee: number;
  /** Fee rate applied (e.g., 0.015 for 1.5%) */
  feeRate: number;
  /** Net amount after fees */
  netAmount: number;
  /** Breakdown for display */
  breakdown: {
    label: string;
    amount: number;
  }[];
}

export interface TaxCalculationResult {
  /** Amount before tax */
  subtotal: number;
  /** Tax amount */
  taxAmount: number;
  /** Tax rate applied */
  taxRate: number;
  /** Total including tax */
  total: number;
  /** Whether prices are displayed inclusive of tax */
  isInclusive: boolean;
}

// ============================================
// FEE RATE LOOKUPS
// ============================================

/**
 * Get the fee rate for a specific transaction type
 */
export const getFeeRateForType = (
  referenceType: ReferenceType,
  settings: PlatformFeeSettings = DEFAULT_PLATFORM_SETTINGS.fees
): number => {
  // Map reference types to fee rate keys
  const typeMap: Record<ReferenceType, keyof PlatformFeeSettings['rateByType']> = {
    court_booking: 'court_booking',
    tournament: 'tournament',
    league: 'league',
    annual_pass: 'annual_pass',
    wallet_topup: 'wallet_topup',
    membership: 'membership',
    visitor_fee: 'court_booking', // Use court booking rate for visitor fees
  };

  const rateKey = typeMap[referenceType];
  const rate = settings.rateByType[rateKey];

  // Fall back to default rate if specific rate not found
  return rate ?? settings.defaultRate;
};

/**
 * Get the fixed per-transaction fee
 */
export const getFixedFee = (
  settings: PlatformFeeSettings = DEFAULT_PLATFORM_SETTINGS.fees
): number => {
  return settings.perTransactionFee ?? 0;
};

// ============================================
// FEE CALCULATIONS
// ============================================

/**
 * Calculate platform fee for a transaction
 */
export const calculatePlatformFee = (
  amount: number,
  referenceType: ReferenceType,
  settings?: PlatformFeeSettings
): FeeCalculationResult => {
  const feeSettings = settings ?? DEFAULT_PLATFORM_SETTINGS.fees;
  
  // Get fee rate for this type
  const feeRate = getFeeRateForType(referenceType, feeSettings);
  
  // Calculate percentage-based fee
  const percentageFee = Math.round(amount * feeRate);
  
  // Get fixed fee
  const fixedFee = getFixedFee(feeSettings);
  
  // Total platform fee
  const platformFee = percentageFee + fixedFee;
  
  // Net amount (what the club/organizer receives)
  const netAmount = amount - platformFee;

  // Build breakdown
  const breakdown: { label: string; amount: number }[] = [];
  
  if (percentageFee > 0) {
    breakdown.push({
      label: `Platform Fee (${(feeRate * 100).toFixed(1)}%)`,
      amount: percentageFee,
    });
  }
  
  if (fixedFee > 0) {
    breakdown.push({
      label: 'Transaction Fee',
      amount: fixedFee,
    });
  }

  return {
    grossAmount: amount,
    platformFee,
    fixedFee,
    percentageFee,
    feeRate,
    netAmount,
    breakdown,
  };
};

/**
 * Calculate platform fee with custom rate (for admin overrides)
 */
export const calculatePlatformFeeWithRate = (
  amount: number,
  rate: number,
  fixedFee: number = 0
): FeeCalculationResult => {
  const percentageFee = Math.round(amount * rate);
  const platformFee = percentageFee + fixedFee;
  const netAmount = amount - platformFee;

  const breakdown: { label: string; amount: number }[] = [];
  
  if (percentageFee > 0) {
    breakdown.push({
      label: `Platform Fee (${(rate * 100).toFixed(1)}%)`,
      amount: percentageFee,
    });
  }
  
  if (fixedFee > 0) {
    breakdown.push({
      label: 'Transaction Fee',
      amount: fixedFee,
    });
  }

  return {
    grossAmount: amount,
    platformFee,
    fixedFee,
    percentageFee,
    feeRate: rate,
    netAmount,
    breakdown,
  };
};

// ============================================
// TAX CALCULATIONS
// ============================================

/**
 * Get tax rate for a currency/country
 */
export const getTaxRate = (
  currency: SupportedCurrency,
  settings?: PlatformSettings
): number => {
  const taxSettings = settings?.tax ?? DEFAULT_PLATFORM_SETTINGS.tax;
  
  if (!taxSettings.enabled) {
    return 0;
  }

  return taxSettings.rates[currency] ?? 0;
};

/**
 * Calculate tax on an amount
 * Handles both inclusive and exclusive tax display
 */
export const calculateTax = (
  amount: number,
  currency: SupportedCurrency,
  settings?: PlatformSettings
): TaxCalculationResult => {
  const taxSettings = settings?.tax ?? DEFAULT_PLATFORM_SETTINGS.tax;
  const taxRate = getTaxRate(currency, settings);

  if (!taxSettings.enabled || taxRate === 0) {
    return {
      subtotal: amount,
      taxAmount: 0,
      taxRate: 0,
      total: amount,
      isInclusive: taxSettings.displayInclusive,
    };
  }

  if (taxSettings.displayInclusive) {
    // Amount already includes tax - calculate backwards
    const subtotal = Math.round(amount / (1 + taxRate));
    const taxAmount = amount - subtotal;

    return {
      subtotal,
      taxAmount,
      taxRate,
      total: amount,
      isInclusive: true,
    };
  } else {
    // Tax is added on top
    const taxAmount = Math.round(amount * taxRate);
    const total = amount + taxAmount;

    return {
      subtotal: amount,
      taxAmount,
      taxRate,
      total,
      isInclusive: false,
    };
  }
};

/**
 * Add tax to a transaction breakdown
 */
export const addTaxToBreakdown = (
  breakdown: TransactionBreakdown,
  currency: SupportedCurrency,
  settings?: PlatformSettings
): TransactionBreakdown => {
  const taxResult = calculateTax(breakdown.subtotal, currency, settings);

  if (taxResult.taxAmount === 0) {
    return breakdown;
  }

  return {
    ...breakdown,
    items: [
      ...breakdown.items,
      {
        label: getTaxLabel(currency),
        amount: taxResult.taxAmount,
        type: 'tax' as const,
      },
    ],
    tax: taxResult.taxAmount,
    total: taxResult.total,
  };
};

/**
 * Get tax label for display (GST, VAT, etc.)
 */
export const getTaxLabel = (currency: SupportedCurrency): string => {
  switch (currency) {
    case 'nzd':
      return 'GST (15%)';
    case 'aud':
      return 'GST (10%)';
    case 'usd':
      return 'Tax';
    default:
      return 'Tax';
  }
};

// ============================================
// COMBINED CALCULATIONS
// ============================================

/**
 * Calculate all fees for a transaction (platform fee + tax)
 */
export const calculateAllFees = (
  amount: number,
  referenceType: ReferenceType,
  currency: SupportedCurrency,
  settings?: PlatformSettings
): {
  grossAmount: number;
  platformFee: FeeCalculationResult;
  tax: TaxCalculationResult;
  netToClub: number;
  totalCharged: number;
} => {
  // Calculate platform fee
  const platformFee = calculatePlatformFee(
    amount,
    referenceType,
    settings?.fees
  );

  // Calculate tax (on the gross amount, not net)
  const tax = calculateTax(amount, currency, settings);

  // Net amount to club is gross minus platform fee
  const netToClub = platformFee.netAmount;

  // Total charged depends on whether tax is inclusive
  const totalCharged = tax.isInclusive ? amount : tax.total;

  return {
    grossAmount: amount,
    platformFee,
    tax,
    netToClub,
    totalCharged,
  };
};

// ============================================
// PAYOUT CALCULATIONS
// ============================================

/**
 * Calculate net payout amount for a club
 * Takes into account all platform fees from transactions
 */
export const calculateNetPayout = (
  transactions: { amount: number; platformFee: number }[]
): {
  grossAmount: number;
  totalPlatformFees: number;
  netAmount: number;
} => {
  const grossAmount = transactions.reduce((sum, t) => sum + t.amount, 0);
  const totalPlatformFees = transactions.reduce((sum, t) => sum + t.platformFee, 0);
  const netAmount = grossAmount - totalPlatformFees;

  return {
    grossAmount,
    totalPlatformFees,
    netAmount,
  };
};

// ============================================
// FEE VALIDATION
// ============================================

/**
 * Validate that a fee rate is within allowed bounds
 */
export const validateFeeRate = (
  rate: number,
  settings?: PlatformFeeSettings
): { valid: boolean; error?: string } => {
  const feeSettings = settings ?? DEFAULT_PLATFORM_SETTINGS.fees;

  if (rate < feeSettings.minRate) {
    return {
      valid: false,
      error: `Fee rate cannot be less than ${(feeSettings.minRate * 100).toFixed(1)}%`,
    };
  }

  if (rate > feeSettings.maxRate) {
    return {
      valid: false,
      error: `Fee rate cannot exceed ${(feeSettings.maxRate * 100).toFixed(1)}%`,
    };
  }

  return { valid: true };
};

// ============================================
// DISPLAY HELPERS
// ============================================

/**
 * Format fee rate as percentage string
 */
export const formatFeeRate = (rate: number): string => {
  return `${(rate * 100).toFixed(1)}%`;
};

/**
 * Format fee amount with currency
 */
export const formatFeeAmount = (
  cents: number,
  currency: SupportedCurrency = 'nzd'
): string => {
  const dollars = (cents / 100).toFixed(2);
  const symbols: Record<SupportedCurrency, string> = {
    nzd: 'NZ$',
    aud: 'A$',
    usd: '$',
  };
  return `${symbols[currency]}${dollars}`;
};

/**
 * Get a summary of fees for display
 */
export const getFeeSummary = (
  result: FeeCalculationResult,
  currency: SupportedCurrency = 'nzd'
): string => {
  if (result.platformFee === 0) {
    return 'No fees';
  }

  const feeStr = formatFeeAmount(result.platformFee, currency);
  const rateStr = formatFeeRate(result.feeRate);

  return `${feeStr} (${rateStr})`;
};

// ============================================
// STRIPE FEE PASSTHROUGH (Optional)
// ============================================

/**
 * Calculate Stripe processing fee (if passing through to customer)
 * Note: This is separate from platform fee
 * 
 * Standard Stripe fees (may vary by region):
 * - 2.9% + $0.30 per successful card charge (US)
 * - 2.7% + $0.30 (NZ)
 * - 1.75% + $0.30 (AU)
 */
export const calculateStripeProcessingFee = (
  amount: number,
  currency: SupportedCurrency
): number => {
  // Stripe fee rates by currency
  const stripeRates: Record<SupportedCurrency, { percent: number; fixed: number }> = {
    nzd: { percent: 0.027, fixed: 30 }, // 2.7% + $0.30
    aud: { percent: 0.0175, fixed: 30 }, // 1.75% + $0.30
    usd: { percent: 0.029, fixed: 30 }, // 2.9% + $0.30
  };

  const rates = stripeRates[currency];
  const percentageFee = Math.round(amount * rates.percent);
  const fixedFee = rates.fixed;

  return percentageFee + fixedFee;
};

/**
 * Calculate amount to charge to cover Stripe fees
 * (Reverse calculation to ensure net amount after Stripe fee)
 */
export const calculateAmountWithStripeFee = (
  desiredNet: number,
  currency: SupportedCurrency
): number => {
  const stripeRates: Record<SupportedCurrency, { percent: number; fixed: number }> = {
    nzd: { percent: 0.027, fixed: 30 },
    aud: { percent: 0.0175, fixed: 30 },
    usd: { percent: 0.029, fixed: 30 },
  };

  const rates = stripeRates[currency];
  
  // Formula: grossAmount = (desiredNet + fixedFee) / (1 - percentRate)
  const grossAmount = Math.ceil((desiredNet + rates.fixed) / (1 - rates.percent));
  
  return grossAmount;
};
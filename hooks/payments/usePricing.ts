/**
 * usePricing Hook
 * 
 * React hook for price calculations including:
 * - Court booking pricing
 * - Member/visitor pricing
 * - Discounts and fees
 * - Price breakdowns
 * 
 * FILE LOCATION: hooks/payments/usePricing.ts
 */

import { useState, useCallback, useMemo } from 'react';
import {
  calculateBookingPrice,
  calculateMultiSlotPrice,
  calculateMemberDiscount,
  calculatePassDiscount,
  calculateVisitorPremium,
  calculateLightingFee,
  calculateEquipmentFee,
  calculateBallMachineFee,
  calculateAllFees,
  calculateNetPayout,
  isPeakTime,
  isWeekend,
  determinePriceType,
  getPriceSummary,
  formatPrice,
  getPriceTypeLabel,
  type PricingContext,
  type BookingPriceResult,
  type SupportedCurrency,
  type TransactionBreakdown,
} from '../../services/firebase/payments';

// ============================================
// TYPES
// ============================================

export interface BookingSlot {
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  courtId: string;
  courtName: string;
}

export interface UsePricingOptions {
  /** Default currency */
  currency?: SupportedCurrency;
  /** Club ID for pricing rules */
  clubId?: string;
}

export interface UsePricingReturn {
  // State
  breakdown: BookingPriceResult | null;
  loading: boolean;
  error: Error | null;
  
  // Calculations
  calculatePrice: (context: PricingContext) => BookingPriceResult;
  calculateMultipleSlots: (slots: BookingSlot[], context: Omit<PricingContext, 'date' | 'startTime' | 'endTime'>) => BookingPriceResult[];
  calculateTotalPrice: (results: BookingPriceResult[]) => number;
  
  // Individual calculations
  getMemberDiscount: (basePrice: number, discountPercent?: number) => number;
  getPassDiscount: (basePrice: number, passDiscountPercent?: number) => number;
  getVisitorPremium: (basePrice: number, premiumPercent?: number) => number;
  getLightingFee: (durationMinutes: number, enabled?: boolean) => number;
  getEquipmentFee: (enabled?: boolean, feePerHour?: number, durationMinutes?: number) => number;
  getBallMachineFee: (enabled?: boolean, feePerHour?: number, durationMinutes?: number) => number;
  
  // Fee calculations
  calculateFees: (amount: number, referenceType: string) => { platformFee: number; tax: number; total: number };
  calculatePayout: (amount: number, referenceType: string) => number;
  
  // Helpers
  checkIsPeakTime: (time: string, date?: string) => boolean;
  checkIsWeekend: (date: string) => boolean;
  getPriceType: (date: string, time: string) => string;
  formatPriceAmount: (amount: number) => string;
  getPriceLabel: (type: string) => string;
  getSummary: (result: BookingPriceResult) => string;
  buildBreakdown: (result: BookingPriceResult) => TransactionBreakdown;
}

// ============================================
// HOOK IMPLEMENTATION
// ============================================

export const usePricing = (options: UsePricingOptions = {}): UsePricingReturn => {
  const {
    currency = 'nzd',
    clubId,
  } = options;

  // State
  const [breakdown, setBreakdown] = useState<BookingPriceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Calculate price for a single booking
  const calculatePrice = useCallback((context: PricingContext): BookingPriceResult => {
    try {
      setLoading(true);
      setError(null);

      const result = calculateBookingPrice(context);
      setBreakdown(result);
      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to calculate price');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  // Calculate prices for multiple slots
  const calculateMultipleSlots = useCallback((
    slots: BookingSlot[],
    context: Omit<PricingContext, 'date' | 'startTime' | 'endTime'>
  ): BookingPriceResult[] => {
    return slots.map(slot => 
      calculateBookingPrice({
        ...context,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
      })
    );
  }, []);

  // Calculate total price from multiple results
  const calculateTotalPrice = useCallback((results: BookingPriceResult[]): number => {
    return results.reduce((sum, r) => sum + r.totalPrice, 0);
  }, []);

  // Individual calculation helpers
  const getMemberDiscount = useCallback((
    basePrice: number,
    discountPercent?: number
  ): number => {
    return calculateMemberDiscount(basePrice, discountPercent);
  }, []);

  const getPassDiscount = useCallback((
    basePrice: number,
    passDiscountPercent?: number
  ): number => {
    return calculatePassDiscount(basePrice, passDiscountPercent);
  }, []);

  const getVisitorPremium = useCallback((
    basePrice: number,
    premiumPercent?: number
  ): number => {
    return calculateVisitorPremium(basePrice, premiumPercent);
  }, []);

  const getLightingFee = useCallback((
    durationMinutes: number,
    enabled: boolean = false
  ): number => {
    return calculateLightingFee(durationMinutes, enabled);
  }, []);

  const getEquipmentFee = useCallback((
    enabled: boolean = false,
    feePerHour?: number,
    durationMinutes?: number
  ): number => {
    return calculateEquipmentFee(enabled, feePerHour, durationMinutes);
  }, []);

  const getBallMachineFee = useCallback((
    enabled: boolean = false,
    feePerHour?: number,
    durationMinutes?: number
  ): number => {
    return calculateBallMachineFee(enabled, feePerHour, durationMinutes);
  }, []);

  // Fee calculations
  const calculateFees = useCallback((
    amount: number,
    referenceType: string
  ): { platformFee: number; tax: number; total: number } => {
    const result = calculateAllFees(amount, referenceType as any, currency);
    return {
      platformFee: result.platformFee,
      tax: result.tax,
      total: result.total,
    };
  }, [currency]);

  const calculatePayout = useCallback((
    amount: number,
    referenceType: string
  ): number => {
    return calculateNetPayout(amount, referenceType as any, currency);
  }, [currency]);

  // Helper functions
  const checkIsPeakTime = useCallback((time: string, date?: string): boolean => {
    return isPeakTime(time, date);
  }, []);

  const checkIsWeekend = useCallback((date: string): boolean => {
    return isWeekend(date);
  }, []);

  const getPriceType = useCallback((date: string, time: string): string => {
    return determinePriceType(date, time);
  }, []);

  const formatPriceAmount = useCallback((amount: number): string => {
    return formatPrice(amount, currency);
  }, [currency]);

  const getPriceLabel = useCallback((type: string): string => {
    return getPriceTypeLabel(type as any);
  }, []);

  const getSummary = useCallback((result: BookingPriceResult): string => {
    return getPriceSummary(result);
  }, []);

  const buildBreakdown = useCallback((result: BookingPriceResult): TransactionBreakdown => {
    const items = result.breakdown.map(item => ({
      label: item.label,
      amount: item.amount,
      type: item.type as 'charge' | 'discount' | 'fee' | 'tax',
    }));

    const subtotal = items
      .filter(i => i.type === 'charge')
      .reduce((sum, i) => sum + i.amount, 0);
    
    const discounts = items
      .filter(i => i.type === 'discount')
      .reduce((sum, i) => sum + Math.abs(i.amount), 0);
    
    const fees = items
      .filter(i => i.type === 'fee')
      .reduce((sum, i) => sum + i.amount, 0);

    return {
      items,
      subtotal,
      discounts,
      fees,
      tax: 0,
      total: result.totalPrice,
    };
  }, []);

  return {
    // State
    breakdown,
    loading,
    error,
    
    // Calculations
    calculatePrice,
    calculateMultipleSlots,
    calculateTotalPrice,
    
    // Individual calculations
    getMemberDiscount,
    getPassDiscount,
    getVisitorPremium,
    getLightingFee,
    getEquipmentFee,
    getBallMachineFee,
    
    // Fee calculations
    calculateFees,
    calculatePayout,
    
    // Helpers
    checkIsPeakTime,
    checkIsWeekend,
    getPriceType,
    formatPriceAmount,
    getPriceLabel,
    getSummary,
    buildBreakdown,
  };
};

export default usePricing;
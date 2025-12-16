/**
 * Pricing Engine Service
 * 
 * Calculates prices for court bookings with support for:
 * - Peak/off-peak/weekend pricing
 * - Member discounts
 * - Visitor premiums
 * - Annual pass benefits
 * - Add-on fees (lighting, equipment, etc.)
 * - Promo codes (future)
 * 
 * All amounts are in CENTS.
 * 
 * FILE LOCATION: services/firebase/payments/pricing.ts
 */

import type {
  SupportedCurrency,
  PriceType,
  BookingPriceResult,
  PriceBreakdownItem,
} from './types';

// Import club types from main types file
import type {
  ClubBookingSettingsEnhanced,
  ClubCourtEnhanced,
  CourtGrade,
  CourtGradeConfig,
  PeakHoursConfig,
  VisitorSettings,
  PaymentMethodsConfig,
} from '../../../types';

// ============================================
// PRICING INPUT TYPES
// ============================================

export interface PricingContext {
  /** Club booking settings */
  settings: ClubBookingSettingsEnhanced;
  /** Court being booked */
  court: ClubCourtEnhanced;
  /** Booking details */
  booking: {
    date: string;      // YYYY-MM-DD
    startTime: string; // HH:MM
    endTime: string;   // HH:MM
  };
  /** User context */
  user: {
    isMember: boolean;
    hasAnnualPass: boolean;
    passDiscountPercent?: number;
    isVisitor: boolean;
  };
  /** Optional add-ons */
  addOns?: {
    lighting?: boolean;
    equipment?: boolean;
    ballMachine?: boolean;
  };
  /** Applied promo code (future) */
  promoCode?: string;
}

// ============================================
// TIME HELPERS
// ============================================

/**
 * Parse time string (HH:MM) to minutes since midnight
 */
export const parseTimeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

/**
 * Get day of week from date string (0 = Sunday, 6 = Saturday)
 */
export const getDayOfWeek = (dateStr: string): number => {
  const date = new Date(dateStr + 'T12:00:00'); // Use noon to avoid timezone issues
  return date.getDay();
};

/**
 * Check if a date is a weekend (Saturday or Sunday)
 */
export const isWeekend = (dateStr: string): boolean => {
  const day = getDayOfWeek(dateStr);
  return day === 0 || day === 6; // Sunday = 0, Saturday = 6
};

/**
 * Check if a time falls within peak hours
 */
export const isPeakTime = (
  time: string,
  dateStr: string,
  peakHours: PeakHoursConfig
): boolean => {
  if (!peakHours.enabled) {
    return false;
  }

  const dayOfWeek = getDayOfWeek(dateStr);
  
  // Check if this day has peak hours
  if (!peakHours.days.includes(dayOfWeek)) {
    return false;
  }

  const timeMinutes = parseTimeToMinutes(time);
  const peakStart = parseTimeToMinutes(peakHours.startTime);
  const peakEnd = parseTimeToMinutes(peakHours.endTime);

  return timeMinutes >= peakStart && timeMinutes < peakEnd;
};

/**
 * Determine the price type based on date/time
 */
export const determinePriceType = (
  dateStr: string,
  startTime: string,
  settings: ClubBookingSettingsEnhanced
): PriceType => {
  // Check weekend first (if weekend pricing enabled)
  if (settings.weekendPricingEnabled && isWeekend(dateStr)) {
    return 'weekend';
  }

  // Check peak hours
  if (settings.peakHours && isPeakTime(startTime, dateStr, settings.peakHours)) {
    return 'peak';
  }

  return 'standard';
};

// ============================================
// PRICE LOOKUPS
// ============================================

/**
 * Get the base price for a court based on grade and price type
 */
export const getBasePrice = (
  court: ClubCourtEnhanced,
  gradeConfig: CourtGradeConfig,
  priceType: PriceType
): number => {
  // Check for custom court pricing first
  if (court.useCustomPricing) {
    switch (priceType) {
      case 'peak':
        return court.customPeakPrice ?? court.customBasePrice ?? gradeConfig.peakPrice;
      case 'weekend':
        return court.customWeekendPrice ?? court.customBasePrice ?? gradeConfig.weekendPrice;
      default:
        return court.customBasePrice ?? gradeConfig.basePrice;
    }
  }

  // Use grade-based pricing
  switch (priceType) {
    case 'peak':
      return gradeConfig.peakPrice;
    case 'weekend':
      return gradeConfig.weekendPrice;
    default:
      return gradeConfig.basePrice;
  }
};

/**
 * Get the grade configuration for a court
 */
export const getGradeConfig = (
  court: ClubCourtEnhanced,
  settings: ClubBookingSettingsEnhanced
): CourtGradeConfig => {
  const grade = court.grade || 'standard';
  return settings.courtGrades[grade];
};

// ============================================
// DISCOUNT CALCULATIONS
// ============================================

/**
 * Calculate member discount
 */
export const calculateMemberDiscount = (
  basePrice: number,
  gradeConfig: CourtGradeConfig,
  isMember: boolean
): number => {
  if (!isMember) {
    return 0;
  }

  switch (gradeConfig.memberPricing) {
    case 'free':
      return basePrice; // 100% discount
    case 'discounted':
      const discountPercent = gradeConfig.memberDiscountPercent ?? 0;
      return Math.round(basePrice * (discountPercent / 100));
    case 'full':
    default:
      return 0;
  }
};

/**
 * Calculate annual pass discount
 */
export const calculatePassDiscount = (
  priceAfterMemberDiscount: number,
  hasPass: boolean,
  passBenefit: 'unlimited' | 'discounted',
  passDiscountPercent?: number
): number => {
  if (!hasPass) {
    return 0;
  }

  if (passBenefit === 'unlimited') {
    return priceAfterMemberDiscount; // 100% discount (free)
  }

  if (passBenefit === 'discounted' && passDiscountPercent) {
    return Math.round(priceAfterMemberDiscount * (passDiscountPercent / 100));
  }

  return 0;
};

/**
 * Calculate visitor premium
 */
export const calculateVisitorPremium = (
  basePrice: number,
  visitorSettings: VisitorSettings,
  isVisitor: boolean
): number => {
  if (!isVisitor || !visitorSettings.allowVisitors) {
    return 0;
  }

  switch (visitorSettings.visitorCourtPricing) {
    case 'premium':
      const premiumPercent = visitorSettings.visitorPremiumPercent ?? 0;
      return Math.round(basePrice * (premiumPercent / 100));
    case 'custom':
      // Custom pricing replaces base price, handled separately
      return 0;
    case 'same':
    default:
      return 0;
  }
};

// ============================================
// ADD-ON CALCULATIONS
// ============================================

/**
 * Calculate lighting fee
 */
export const calculateLightingFee = (
  court: ClubCourtEnhanced,
  bookingTime: string,
  wantsLighting: boolean
): number => {
  if (!wantsLighting) {
    return 0;
  }

  const lightingConfig = court.additionalFees?.lighting;
  if (!lightingConfig?.enabled) {
    return 0;
  }

  // Check if lighting only applies after certain time
  if (lightingConfig.appliesAfter) {
    const bookingMinutes = parseTimeToMinutes(bookingTime);
    const appliesAfterMinutes = parseTimeToMinutes(lightingConfig.appliesAfter);
    if (bookingMinutes < appliesAfterMinutes) {
      return 0;
    }
  }

  return lightingConfig.amount;
};

/**
 * Calculate equipment fee
 */
export const calculateEquipmentFee = (
  court: ClubCourtEnhanced,
  wantsEquipment: boolean
): number => {
  if (!wantsEquipment) {
    return 0;
  }

  const equipmentConfig = court.additionalFees?.equipment;
  if (!equipmentConfig?.enabled) {
    return 0;
  }

  return equipmentConfig.amount;
};

/**
 * Calculate ball machine fee
 */
export const calculateBallMachineFee = (
  court: ClubCourtEnhanced,
  wantsBallMachine: boolean
): number => {
  if (!wantsBallMachine) {
    return 0;
  }

  const ballMachineConfig = court.additionalFees?.ballMachine;
  if (!ballMachineConfig?.enabled) {
    return 0;
  }

  return ballMachineConfig.amount;
};

/**
 * Calculate visitor day fee
 */
export const calculateVisitorFee = (
  visitorSettings: VisitorSettings,
  isVisitor: boolean,
  alreadyPaidToday: boolean = false
): number => {
  if (!isVisitor || !visitorSettings.visitorFeeEnabled || alreadyPaidToday) {
    return 0;
  }

  return visitorSettings.visitorFee;
};

// ============================================
// MAIN PRICING FUNCTION
// ============================================

/**
 * Calculate the full price for a court booking
 * Returns detailed breakdown for display
 */
export const calculateBookingPrice = (
  context: PricingContext
): BookingPriceResult => {
  const { settings, court, booking, user, addOns } = context;

  // Get grade configuration
  const gradeConfig = getGradeConfig(court, settings);
  
  // Determine price type
  const priceType = determinePriceType(
    booking.date,
    booking.startTime,
    settings
  );

  // Get base court fee
  let courtFee = getBasePrice(court, gradeConfig, priceType);

  // Handle visitor custom pricing (replaces base price)
  if (user.isVisitor && settings.visitors?.visitorCourtPricing === 'custom') {
    courtFee = settings.visitors.visitorCustomPrice ?? courtFee;
  }

  // Calculate visitor premium (added to base price)
  const visitorPremium = calculateVisitorPremium(
    courtFee,
    settings.visitors || { allowVisitors: false, visitorFeeEnabled: false, visitorFee: 0, visitorFeeType: 'per_day', visitorCourtPricing: 'same', requireMemberSignIn: false },
    user.isVisitor
  );
  courtFee += visitorPremium;

  // Calculate add-on fees
  const lightingFee = calculateLightingFee(
    court,
    booking.startTime,
    addOns?.lighting ?? false
  );
  const equipmentFee = calculateEquipmentFee(court, addOns?.equipment ?? false);
  const ballMachineFee = calculateBallMachineFee(court, addOns?.ballMachine ?? false);

  // Visitor day fee (separate from court premium)
  const visitorFee = calculateVisitorFee(
    settings.visitors || { allowVisitors: false, visitorFeeEnabled: false, visitorFee: 0, visitorFeeType: 'per_day', visitorCourtPricing: 'same', requireMemberSignIn: false },
    user.isVisitor
  );

  // Calculate subtotal before discounts
  const subtotal = courtFee + lightingFee + equipmentFee + ballMachineFee + visitorFee;

  // Build breakdown items
  const breakdown: PriceBreakdownItem[] = [];
  
  // Court fee with price type label
  const priceTypeLabel = priceType === 'peak' ? ' (Peak)' : priceType === 'weekend' ? ' (Weekend)' : '';
  breakdown.push({
    label: `Court: ${court.name}${priceTypeLabel}`,
    amount: courtFee - visitorPremium, // Show base without premium
  });

  if (visitorPremium > 0) {
    breakdown.push({ label: 'Visitor Premium', amount: visitorPremium });
  }

  if (lightingFee > 0) {
    breakdown.push({ label: 'Lighting', amount: lightingFee });
  }
  if (equipmentFee > 0) {
    breakdown.push({ label: 'Equipment Hire', amount: equipmentFee });
  }
  if (ballMachineFee > 0) {
    breakdown.push({ label: 'Ball Machine', amount: ballMachineFee });
  }
  if (visitorFee > 0) {
    breakdown.push({ label: 'Visitor Day Pass', amount: visitorFee });
  }

  // Calculate discounts
  const discounts: PriceBreakdownItem[] = [];
  let totalDiscounts = 0;

  // Member discount (only on court fee, not add-ons)
  const memberDiscount = calculateMemberDiscount(
    courtFee,
    gradeConfig,
    user.isMember
  );
  if (memberDiscount > 0) {
    discounts.push({ label: 'Member Discount', amount: memberDiscount });
    totalDiscounts += memberDiscount;
  }

  // Annual pass discount (on remaining amount after member discount)
  const priceAfterMemberDiscount = courtFee - memberDiscount;
  const passDiscount = calculatePassDiscount(
    priceAfterMemberDiscount,
    user.hasAnnualPass,
    settings.paymentMethods?.annualPassBenefit ?? 'unlimited',
    user.passDiscountPercent ?? settings.paymentMethods?.annualPassDiscountPercent
  );
  if (passDiscount > 0) {
    discounts.push({ label: 'Annual Pass', amount: passDiscount });
    totalDiscounts += passDiscount;
  }

  // Calculate fees (processing fee, etc.)
  // Note: Platform fee is calculated separately by platformFees.ts
  const processingFee = 0; // Could add Stripe fee pass-through here if needed

  // Calculate total
  const total = Math.max(0, subtotal - totalDiscounts + processingFee);

  return {
    // Individual amounts
    courtFee: courtFee - visitorPremium, // Base court fee without visitor premium
    lightingFee,
    equipmentFee,
    ballMachineFee,
    visitorFee: visitorFee + visitorPremium, // Combine visitor costs

    // Totals
    subtotal,
    memberDiscount,
    passDiscount,
    promoDiscount: 0, // Future: promo code support
    totalDiscounts,
    processingFee,
    platformFee: 0, // Calculated separately
    taxAmount: 0,   // Calculated separately if enabled
    total,

    // Breakdowns for display
    breakdown,
    discounts,

    // Context
    priceType,
    courtGrade: court.grade || 'standard',
    isMember: user.isMember,
    hasAnnualPass: user.hasAnnualPass,
    isVisitor: user.isVisitor,
    currency: settings.currency || 'nzd',
    promoCode: context.promoCode,
  };
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Calculate price for multiple slots (e.g., 2-hour booking)
 */
export const calculateMultiSlotPrice = (
  context: PricingContext,
  numberOfSlots: number
): BookingPriceResult => {
  const singleSlotPrice = calculateBookingPrice(context);
  
  // Multiply court fee and add-ons by number of slots
  // Discounts are applied proportionally
  const multiplier = numberOfSlots;

  return {
    ...singleSlotPrice,
    courtFee: singleSlotPrice.courtFee * multiplier,
    lightingFee: singleSlotPrice.lightingFee * multiplier,
    equipmentFee: singleSlotPrice.equipmentFee * multiplier,
    ballMachineFee: singleSlotPrice.ballMachineFee * multiplier,
    // Visitor fee is typically per-day, not per-slot
    visitorFee: singleSlotPrice.visitorFee,
    
    subtotal: singleSlotPrice.subtotal * multiplier,
    memberDiscount: singleSlotPrice.memberDiscount * multiplier,
    passDiscount: singleSlotPrice.passDiscount * multiplier,
    promoDiscount: singleSlotPrice.promoDiscount * multiplier,
    totalDiscounts: singleSlotPrice.totalDiscounts * multiplier,
    processingFee: singleSlotPrice.processingFee * multiplier,
    platformFee: 0, // Recalculated on final amount
    taxAmount: 0,
    total: singleSlotPrice.total * multiplier,

    // Update breakdown
    breakdown: singleSlotPrice.breakdown.map(item => ({
      ...item,
      amount: item.label.includes('Visitor Day Pass') ? item.amount : item.amount * multiplier,
    })),
    discounts: singleSlotPrice.discounts.map(item => ({
      ...item,
      amount: item.amount * multiplier,
    })),
  };
};

/**
 * Check if a booking would be free (for UI display)
 */
export const isBookingFree = (result: BookingPriceResult): boolean => {
  return result.total === 0;
};

/**
 * Get a summary string for the price
 */
export const getPriceSummary = (result: BookingPriceResult): string => {
  if (isBookingFree(result)) {
    if (result.hasAnnualPass) {
      return 'Free (Annual Pass)';
    }
    if (result.isMember && result.memberDiscount > 0) {
      return 'Free (Member)';
    }
    return 'Free';
  }

  const currency = result.currency.toUpperCase();
  const dollars = (result.total / 100).toFixed(2);
  return `${currency} $${dollars}`;
};

/**
 * Format price for display
 */
export const formatPrice = (
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
 * Get price type display label
 */
export const getPriceTypeLabel = (priceType: PriceType): string => {
  switch (priceType) {
    case 'peak':
      return 'Peak Rate';
    case 'weekend':
      return 'Weekend Rate';
    case 'holiday':
      return 'Holiday Rate';
    default:
      return 'Standard Rate';
  }
};
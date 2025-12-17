/**
 * Pricing Service
 * 
 * Calculates prices for all product types:
 * - Court bookings
 * - Tournament entries
 * - League registrations
 * - Meetup fees
 * - Club memberships
 * - Visitor fees
 * 
 * FILE LOCATION: services/firebase/pricing.ts
 */

import type { 
  ClubBookingSettings, 
  Court, 
  CourtGradeConfig,
  Tournament,
  Division,
} from '../../types';

// ============================================
// TYPES
// ============================================

export type ProductType = 
  | 'court_booking' 
  | 'tournament' 
  | 'league' 
  | 'meetup' 
  | 'club_membership' 
  | 'annual_pass'
  | 'visitor_fee'
  | 'wallet_topup';

export interface PriceLineItem {
  label: string;
  amount: number;  // In cents, positive = charge, negative = discount
  type: 'base' | 'fee' | 'discount' | 'tax';
}

export interface PriceCalculation {
  productType: ProductType;
  basePrice: number;
  finalPrice: number;
  savings: number;
  lineItems: PriceLineItem[];
  priceLabel: string;  // e.g., "Peak", "Member Rate", "Early Bird"
  currency: string;
  isFree: boolean;
}

// ============================================
// COURT BOOKING PRICING
// ============================================

export interface CourtBookingPriceInput {
  court: Court;
  date: string;
  startTime: string;
  durationMinutes: number;
  settings: ClubBookingSettings;
  isMember: boolean;
  hasAnnualPass: boolean;
  annualPassBenefit?: 'unlimited' | 'discounted';
  annualPassDiscountPercent?: number;
  isVisitor?: boolean;
}

const isPeakTime = (
  time: string,
  date: string,
  peakConfig?: { enabled: boolean; startTime: string; endTime: string; days: number[] }
): boolean => {
  if (!peakConfig?.enabled) return false;

  const dayOfWeek = new Date(date + 'T00:00:00').getDay();
  if (!peakConfig.days.includes(dayOfWeek)) return false;

  const timeNum = parseInt(time.replace(':', ''));
  const peakStart = parseInt(peakConfig.startTime.replace(':', ''));
  const peakEnd = parseInt(peakConfig.endTime.replace(':', ''));

  return timeNum >= peakStart && timeNum < peakEnd;
};

const isWeekend = (date: string): boolean => {
  const dayOfWeek = new Date(date + 'T00:00:00').getDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
};

export const calculateCourtBookingPrice = (input: CourtBookingPriceInput): PriceCalculation => {
  const { court, date, startTime, durationMinutes, settings, isMember, hasAnnualPass, annualPassBenefit, annualPassDiscountPercent, isVisitor } = input;

  const lineItems: PriceLineItem[] = [];
  const slotCount = durationMinutes / (settings.slotDurationMinutes || 60);

  // Get court grade config
  const gradeConfig = settings.courtGrades?.[court.grade || 'standard'];

  if (!gradeConfig) {
    // Fallback pricing - $5 per slot
    const basePrice = 500 * slotCount;
    return {
      productType: 'court_booking',
      basePrice,
      finalPrice: basePrice,
      savings: 0,
      lineItems: [{ label: 'Court hire', amount: basePrice, type: 'base' }],
      priceLabel: 'Standard',
      currency: 'nzd',
      isFree: false,
    };
  }

  // Determine base price based on time
  let pricePerSlot = gradeConfig.basePrice;
  let priceLabel = 'Standard';

  if (isPeakTime(startTime, date, settings.peakHours)) {
    pricePerSlot = gradeConfig.peakPrice;
    priceLabel = 'Peak';
  } else if (isWeekend(date)) {
    pricePerSlot = gradeConfig.weekendPrice;
    priceLabel = 'Weekend';
  }

  const basePrice = pricePerSlot * slotCount;
  lineItems.push({
    label: `Court hire (${priceLabel})`,
    amount: basePrice,
    type: 'base',
  });

  let currentPrice = basePrice;

  // Visitor premium
  if (isVisitor && gradeConfig.visitorPremiumPercent > 0) {
    const visitorFee = Math.round(basePrice * (gradeConfig.visitorPremiumPercent / 100));
    lineItems.push({
      label: `Visitor premium (${gradeConfig.visitorPremiumPercent}%)`,
      amount: visitorFee,
      type: 'fee',
    });
    currentPrice += visitorFee;
    priceLabel = 'Visitor';
  }

  // Annual pass - unlimited
  if (hasAnnualPass && annualPassBenefit === 'unlimited') {
    lineItems.push({
      label: 'Annual Pass (Unlimited)',
      amount: -currentPrice,
      type: 'discount',
    });
    return {
      productType: 'court_booking',
      basePrice,
      finalPrice: 0,
      savings: currentPrice,
      lineItems,
      priceLabel: 'Annual Pass',
      currency: 'nzd',
      isFree: true,
    };
  }

  // Member discount
  if (isMember && !isVisitor) {
    if (gradeConfig.memberPricing === 'free') {
      lineItems.push({
        label: 'Member benefit (Free)',
        amount: -currentPrice,
        type: 'discount',
      });
      return {
        productType: 'court_booking',
        basePrice,
        finalPrice: 0,
        savings: currentPrice,
        lineItems,
        priceLabel: 'Member (Free)',
        currency: 'nzd',
        isFree: true,
      };
    } else if (gradeConfig.memberPricing === 'discounted' && gradeConfig.memberDiscountPercent) {
      const discount = Math.round(currentPrice * (gradeConfig.memberDiscountPercent / 100));
      lineItems.push({
        label: `Member discount (${gradeConfig.memberDiscountPercent}%)`,
        amount: -discount,
        type: 'discount',
      });
      currentPrice -= discount;
      priceLabel = 'Member';
    }
  }

  // Annual pass - discounted
  if (hasAnnualPass && annualPassBenefit === 'discounted' && annualPassDiscountPercent) {
    const discount = Math.round(currentPrice * (annualPassDiscountPercent / 100));
    lineItems.push({
      label: `Annual Pass discount (${annualPassDiscountPercent}%)`,
      amount: -discount,
      type: 'discount',
    });
    currentPrice -= discount;
  }

  const savings = basePrice - currentPrice;

  return {
    productType: 'court_booking',
    basePrice,
    finalPrice: Math.max(0, currentPrice),
    savings: Math.max(0, savings),
    lineItems,
    priceLabel,
    currency: 'nzd',
    isFree: currentPrice <= 0,
  };
};

// ============================================
// TOURNAMENT ENTRY PRICING
// ============================================

export interface TournamentEntryPriceInput {
  tournament: {
    id: string;
    name: string;
    entryFee?: number;
    earlyBirdFee?: number;
    earlyBirdDeadline?: string;
    lateFee?: number;
    lateRegistrationStart?: string;
    memberDiscount?: number;
    currency?: string;
  };
  division?: {
    id: string;
    name: string;
    entryFee?: number;  // Override tournament fee
  };
  isMember: boolean;
  registrationDate?: Date;
}

export const calculateTournamentEntryPrice = (input: TournamentEntryPriceInput): PriceCalculation => {
  const { tournament, division, isMember, registrationDate = new Date() } = input;

  const lineItems: PriceLineItem[] = [];
  let priceLabel = 'Standard';

  // Base fee (division overrides tournament)
  const baseFee = division?.entryFee ?? tournament.entryFee ?? 0;
  
  if (baseFee === 0) {
    return {
      productType: 'tournament',
      basePrice: 0,
      finalPrice: 0,
      savings: 0,
      lineItems: [{ label: 'Entry fee', amount: 0, type: 'base' }],
      priceLabel: 'Free Entry',
      currency: tournament.currency || 'nzd',
      isFree: true,
    };
  }

  let currentPrice = baseFee;

  // Check for early bird
  if (tournament.earlyBirdFee && tournament.earlyBirdDeadline) {
    const deadline = new Date(tournament.earlyBirdDeadline);
    if (registrationDate < deadline) {
      lineItems.push({
        label: 'Early bird entry',
        amount: tournament.earlyBirdFee,
        type: 'base',
      });
      currentPrice = tournament.earlyBirdFee;
      priceLabel = 'Early Bird';
    } else {
      lineItems.push({
        label: 'Entry fee',
        amount: baseFee,
        type: 'base',
      });
    }
  } else {
    lineItems.push({
      label: 'Entry fee',
      amount: baseFee,
      type: 'base',
    });
  }

  // Check for late fee
  if (tournament.lateFee && tournament.lateRegistrationStart) {
    const lateStart = new Date(tournament.lateRegistrationStart);
    if (registrationDate >= lateStart) {
      lineItems.push({
        label: 'Late registration fee',
        amount: tournament.lateFee,
        type: 'fee',
      });
      currentPrice += tournament.lateFee;
      priceLabel = 'Late Registration';
    }
  }

  // Member discount
  if (isMember && tournament.memberDiscount) {
    const discount = Math.round(currentPrice * (tournament.memberDiscount / 100));
    lineItems.push({
      label: `Member discount (${tournament.memberDiscount}%)`,
      amount: -discount,
      type: 'discount',
    });
    currentPrice -= discount;
    if (priceLabel === 'Standard') priceLabel = 'Member';
  }

  const savings = baseFee - currentPrice;

  return {
    productType: 'tournament',
    basePrice: baseFee,
    finalPrice: Math.max(0, currentPrice),
    savings: Math.max(0, savings),
    lineItems,
    priceLabel,
    currency: tournament.currency || 'nzd',
    isFree: currentPrice <= 0,
  };
};

// ============================================
// LEAGUE REGISTRATION PRICING
// ============================================

export interface LeagueRegistrationPriceInput {
  league: {
    id: string;
    name: string;
    registrationFee?: number;
    teamFee?: number;
    perPlayerFee?: number;
    memberDiscount?: number;
    earlyBirdFee?: number;
    earlyBirdDeadline?: string;
    currency?: string;
  };
  isTeamRegistration: boolean;
  playerCount?: number;
  isMember: boolean;
  registrationDate?: Date;
}

export const calculateLeagueRegistrationPrice = (input: LeagueRegistrationPriceInput): PriceCalculation => {
  const { league, isTeamRegistration, playerCount = 1, isMember, registrationDate = new Date() } = input;

  const lineItems: PriceLineItem[] = [];
  let priceLabel = 'Standard';
  let currentPrice = 0;

  // Team registration fee
  if (isTeamRegistration && league.teamFee) {
    lineItems.push({
      label: 'Team registration',
      amount: league.teamFee,
      type: 'base',
    });
    currentPrice += league.teamFee;
  }

  // Per-player fee
  if (league.perPlayerFee && playerCount > 0) {
    const playerFees = league.perPlayerFee * playerCount;
    lineItems.push({
      label: `Player fees (${playerCount} × ${formatCentsToDisplay(league.perPlayerFee)})`,
      amount: playerFees,
      type: 'base',
    });
    currentPrice += playerFees;
  }

  // Individual registration fee
  if (!isTeamRegistration && league.registrationFee) {
    // Check early bird
    if (league.earlyBirdFee && league.earlyBirdDeadline) {
      const deadline = new Date(league.earlyBirdDeadline);
      if (registrationDate < deadline) {
        lineItems.push({
          label: 'Early bird registration',
          amount: league.earlyBirdFee,
          type: 'base',
        });
        currentPrice += league.earlyBirdFee;
        priceLabel = 'Early Bird';
      } else {
        lineItems.push({
          label: 'Registration fee',
          amount: league.registrationFee,
          type: 'base',
        });
        currentPrice += league.registrationFee;
      }
    } else {
      lineItems.push({
        label: 'Registration fee',
        amount: league.registrationFee,
        type: 'base',
      });
      currentPrice += league.registrationFee;
    }
  }

  const basePrice = currentPrice;

  // Member discount
  if (isMember && league.memberDiscount && currentPrice > 0) {
    const discount = Math.round(currentPrice * (league.memberDiscount / 100));
    lineItems.push({
      label: `Member discount (${league.memberDiscount}%)`,
      amount: -discount,
      type: 'discount',
    });
    currentPrice -= discount;
    if (priceLabel === 'Standard') priceLabel = 'Member';
  }

  const savings = basePrice - currentPrice;

  return {
    productType: 'league',
    basePrice,
    finalPrice: Math.max(0, currentPrice),
    savings: Math.max(0, savings),
    lineItems,
    priceLabel,
    currency: league.currency || 'nzd',
    isFree: currentPrice <= 0,
  };
};

// ============================================
// MEETUP FEE PRICING
// ============================================

export interface MeetupFeePriceInput {
  meetup: {
    id: string;
    title: string;
    fee?: number;
    memberFee?: number;
    currency?: string;
  };
  isMember: boolean;
}

export const calculateMeetupFeePrice = (input: MeetupFeePriceInput): PriceCalculation => {
  const { meetup, isMember } = input;

  const lineItems: PriceLineItem[] = [];

  // Check if meetup has a fee
  const baseFee = meetup.fee ?? 0;
  const memberFee = meetup.memberFee ?? baseFee;

  if (baseFee === 0) {
    return {
      productType: 'meetup',
      basePrice: 0,
      finalPrice: 0,
      savings: 0,
      lineItems: [{ label: 'RSVP fee', amount: 0, type: 'base' }],
      priceLabel: 'Free',
      currency: meetup.currency || 'nzd',
      isFree: true,
    };
  }

  if (isMember && memberFee < baseFee) {
    lineItems.push({
      label: 'Member rate',
      amount: memberFee,
      type: 'base',
    });
    return {
      productType: 'meetup',
      basePrice: baseFee,
      finalPrice: memberFee,
      savings: baseFee - memberFee,
      lineItems,
      priceLabel: 'Member',
      currency: meetup.currency || 'nzd',
      isFree: memberFee <= 0,
    };
  }

  lineItems.push({
    label: 'RSVP fee',
    amount: baseFee,
    type: 'base',
  });

  return {
    productType: 'meetup',
    basePrice: baseFee,
    finalPrice: baseFee,
    savings: 0,
    lineItems,
    priceLabel: 'Standard',
    currency: meetup.currency || 'nzd',
    isFree: baseFee <= 0,
  };
};

// ============================================
// CLUB MEMBERSHIP PRICING
// ============================================

export interface ClubMembershipPriceInput {
  club: {
    id: string;
    name: string;
  };
  membershipType: 'annual_pass' | 'monthly' | 'yearly';
  price: number;
  currency?: string;
}

export const calculateClubMembershipPrice = (input: ClubMembershipPriceInput): PriceCalculation => {
  const { membershipType, price, currency = 'nzd' } = input;

  const labels: Record<string, string> = {
    annual_pass: 'Annual Pass',
    monthly: 'Monthly Membership',
    yearly: 'Yearly Membership',
  };

  return {
    productType: membershipType === 'annual_pass' ? 'annual_pass' : 'club_membership',
    basePrice: price,
    finalPrice: price,
    savings: 0,
    lineItems: [{ label: labels[membershipType] || 'Membership', amount: price, type: 'base' }],
    priceLabel: labels[membershipType] || 'Membership',
    currency,
    isFree: price <= 0,
  };
};

// ============================================
// VISITOR FEE PRICING
// ============================================

export interface VisitorFeePriceInput {
  club: {
    id: string;
    name: string;
  };
  settings: ClubBookingSettings;
}

export const calculateVisitorFeePrice = (input: VisitorFeePriceInput): PriceCalculation => {
  const { settings } = input;

  const visitorSettings = settings.visitors;
  
  if (!visitorSettings?.visitorFeeEnabled || !visitorSettings.visitorFee) {
    return {
      productType: 'visitor_fee',
      basePrice: 0,
      finalPrice: 0,
      savings: 0,
      lineItems: [],
      priceLabel: 'No Fee',
      currency: 'nzd',
      isFree: true,
    };
  }

  const fee = visitorSettings.visitorFee;
  const feeLabel = visitorSettings.visitorFeeType === 'per_day' ? 'Visitor fee (per day)' : 'Visitor fee (per booking)';

  return {
    productType: 'visitor_fee',
    basePrice: fee,
    finalPrice: fee,
    savings: 0,
    lineItems: [{ label: feeLabel, amount: fee, type: 'base' }],
    priceLabel: 'Visitor',
    currency: 'nzd',
    isFree: false,
  };
};

// ============================================
// HELPERS
// ============================================

export const formatCentsToDisplay = (cents: number): string => {
  return `$${(cents / 100).toFixed(2)}`;
};

export const formatPriceCalculation = (calc: PriceCalculation): string => {
  if (calc.isFree) return 'Free';
  return formatCentsToDisplay(calc.finalPrice);
};

// ============================================
// UNIVERSAL PRICE CALCULATOR
// ============================================

export type PriceInput = 
  | { type: 'court_booking'; data: CourtBookingPriceInput }
  | { type: 'tournament'; data: TournamentEntryPriceInput }
  | { type: 'league'; data: LeagueRegistrationPriceInput }
  | { type: 'meetup'; data: MeetupFeePriceInput }
  | { type: 'club_membership'; data: ClubMembershipPriceInput }
  | { type: 'visitor_fee'; data: VisitorFeePriceInput };

export const calculatePrice = (input: PriceInput): PriceCalculation => {
  switch (input.type) {
    case 'court_booking':
      return calculateCourtBookingPrice(input.data);
    case 'tournament':
      return calculateTournamentEntryPrice(input.data);
    case 'league':
      return calculateLeagueRegistrationPrice(input.data);
    case 'meetup':
      return calculateMeetupFeePrice(input.data);
    case 'club_membership':
      return calculateClubMembershipPrice(input.data);
    case 'visitor_fee':
      return calculateVisitorFeePrice(input.data);
    default:
      throw new Error('Unknown product type');
  }
};
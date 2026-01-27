/**
 * Stripe Service
 * 
 * Client-side Stripe integration for:
 * - Checkout sessions
 * - Connect accounts (clubs and users)
 * - Payment calculations
 * 
 * FILE LOCATION: services/stripe/index.ts
 */

import { loadStripe, Stripe } from '@stripe/stripe-js';
import { httpsCallable } from '@firebase/functions';
import { functions } from '../firebase';

// ============================================
// STRIPE INITIALIZATION
// ============================================

let stripePromise: Promise<Stripe | null> | null = null;

// Read Stripe key from environment variable
const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';

if (!STRIPE_PUBLISHABLE_KEY) {
  console.error('❌ Stripe publishable key missing! Check your .env file has VITE_STRIPE_PUBLISHABLE_KEY.');
}

export const getStripe = () => {
  if (!stripePromise) {
    if (!STRIPE_PUBLISHABLE_KEY) {
      console.error('❌ Cannot initialize Stripe: VITE_STRIPE_PUBLISHABLE_KEY not found in .env');
      return Promise.resolve(null);
    }
    stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
  }
  return stripePromise;
};

// ============================================
// CONSTANTS
// ============================================

export const PLATFORM_FEE_PERCENT = 1.5;
export const STRIPE_FEE_PERCENT = 2.7;  // NZ domestic card rate
export const STRIPE_FEE_FIXED = 70;     // 70 cents NZD

// ============================================
// TYPES
// ============================================

export interface StripeConnectStatus {
  isConnected: boolean;
  accountId: string | null;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
  requirements?: {
    currentlyDue: string[];
    eventuallyDue: string[];
    pastDue: string[];
  };
}

export interface CreateCheckoutSessionInput {
  items: Array<{
    name: string;
    description?: string;
    amount: number; // in cents
    quantity: number;
  }>;
  customerEmail?: string;
  // V07.54: Routing priority order (server-side):
  // 1. leagueId -> loads league.organizerStripeAccountId (highest priority)
  // 2. clubId -> loads club.stripeConnectedAccountId
  // 3. organizerUserId -> loads user.stripeConnectedAccountId (fallback)
  leagueId?: string;              // V07.54: League ID for server-side account lookup
  clubId?: string;
  clubStripeAccountId?: string;   // Legacy - not used by CF
  organizerStripeAccountId?: string; // Legacy - not used by CF (security: don't pass account IDs from client)
  organizerUserId?: string;       // User ID of organizer (fallback routing)
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export interface CreateConnectAccountInput {
  clubId: string;
  clubName: string;
  clubEmail?: string;
  returnUrl: string;
  refreshUrl: string;
}

// NEW: User connect account input
export interface CreateUserConnectAccountInput {
  userId: string;
  userName: string;
  userEmail?: string;
  returnUrl: string;
  refreshUrl: string;
}

// V2 Account types (Direct Charges)
export type StripeCountryCode = 'NZ' | 'AU' | 'US' | 'GB';

export interface CreateAccountV2Input {
  clubId: string;
  displayName: string;
  email?: string;
  country: StripeCountryCode;
}

export interface CreateUserAccountV2Input {
  userId: string;
  displayName: string;
  email?: string;
  country: StripeCountryCode;
}

export interface StripeAccountStatusV2 {
  accountId: string;
  readyToProcessPayments: boolean;
  onboardingComplete: boolean;
  cardPaymentsStatus?: string;
  requirementsStatus?: string;
  displayName?: string;
  country?: StripeCountryCode;
  isConnected?: boolean;
  error?: string;
}

// ============================================
// CHECKOUT FUNCTIONS
// ============================================

/**
 * Redirect to Stripe Checkout page
 */
export const redirectToCheckout = async (url: string): Promise<void> => {
  window.location.href = url;
};

/**
 * Redirect to Checkout using session ID
 * Handles both old and new Stripe.js API versions
 */
export const redirectToCheckoutById = async (sessionId: string): Promise<void> => {
  const stripe = await getStripe();
  if (!stripe) throw new Error('Stripe not loaded');

  // Try the old API first (for compatibility)
  if (typeof (stripe as any).redirectToCheckout === 'function') {
    const { error } = await (stripe as any).redirectToCheckout({ sessionId });
    if (error) {
      throw new Error(error.message);
    }
  } else {
    // Fallback: redirect directly to Stripe checkout URL
    // This works when you have the session URL from createCheckoutSession
    throw new Error('Please use redirectToCheckout(url) with the session URL instead');
  }
};

/**
 * Create a Checkout Session via Cloud Function
 */
export const createCheckoutSession = async (
  input: CreateCheckoutSessionInput
): Promise<{ sessionId: string; url: string }> => {
  try {
    const callable = httpsCallable<CreateCheckoutSessionInput, { sessionId: string; url: string }>(
      functions,
      'stripe_createCheckoutSession'
    );
    
    const result = await callable(input);
    return result.data;
  } catch (error: any) {
    console.error('createCheckoutSession error:', error);
    throw new Error(error.message || 'Failed to create checkout session');
  }
};

// ============================================
// CLUB STRIPE CONNECT FUNCTIONS
// ============================================

/**
 * Create a Connect Account onboarding link for clubs
 */
export const createConnectAccountLink = async (
  input: CreateConnectAccountInput
): Promise<{ url: string; accountId: string }> => {
  try {
    const callable = httpsCallable<CreateConnectAccountInput, { url: string; accountId: string }>(
      functions,
      'stripe_createConnectAccount'
    );
    
    const result = await callable(input);
    return result.data;
  } catch (error: any) {
    console.error('createConnectAccountLink error:', error);
    throw new Error(error.message || 'Failed to create Connect account link');
  }
};

/**
 * Get Connect Account status
 */
export const getConnectAccountStatus = async (
  accountId: string
): Promise<StripeConnectStatus> => {
  try {
    const callable = httpsCallable<{ accountId: string }, StripeConnectStatus>(
      functions,
      'stripe_getConnectAccountStatus'
    );
    
    const result = await callable({ accountId });
    return result.data;
  } catch (error: any) {
    console.error('getConnectAccountStatus error:', error);
    throw new Error(error.message || 'Failed to get account status');
  }
};

/**
 * Create a Connect Account login link (for dashboard access)
 */
export const createConnectLoginLink = async (
  accountId: string
): Promise<{ url: string }> => {
  try {
    const callable = httpsCallable<{ accountId: string }, { url: string }>(
      functions,
      'stripe_createConnectLoginLink'
    );
    
    const result = await callable({ accountId });
    return result.data;
  } catch (error: any) {
    console.error('createConnectLoginLink error:', error);
    throw new Error(error.message || 'Failed to create login link');
  }
};

// ============================================
// USER STRIPE CONNECT FUNCTIONS (NEW)
// ============================================

/**
 * Create a Connect Account onboarding link for individual organizers
 */
export const createUserConnectAccountLink = async (
  input: CreateUserConnectAccountInput
): Promise<{ url: string; accountId: string }> => {
  try {
    const callable = httpsCallable<CreateUserConnectAccountInput, { url: string; accountId: string }>(
      functions,
      'stripe_createUserConnectAccount'
    );
    
    const result = await callable(input);
    return result.data;
  } catch (error: any) {
    console.error('createUserConnectAccountLink error:', error);
    throw new Error(error.message || 'Failed to create user Connect account link');
  }
};

/**
 * Get User Connect Account status
 */
export const getUserConnectAccountStatus = async (
  accountId: string
): Promise<StripeConnectStatus> => {
  try {
    const callable = httpsCallable<{ accountId: string }, StripeConnectStatus>(
      functions,
      'stripe_getConnectAccountStatus'
    );
    
    const result = await callable({ accountId });
    return result.data;
  } catch (error: any) {
    console.error('getUserConnectAccountStatus error:', error);
    throw new Error(error.message || 'Failed to get user account status');
  }
};

/**
 * Create a User Connect Account login link (for dashboard access)
 */
export const createUserConnectLoginLink = async (
  accountId: string
): Promise<{ url: string }> => {
  try {
    const callable = httpsCallable<{ accountId: string }, { url: string }>(
      functions,
      'stripe_createUserConnectLoginLink'
    );

    const result = await callable({ accountId });
    return result.data;
  } catch (error: any) {
    console.error('createUserConnectLoginLink error:', error);
    throw new Error(error.message || 'Failed to create user login link');
  }
};

// ============================================
// V2 ACCOUNT FUNCTIONS (Direct Charges)
// ============================================

/**
 * Supported countries for Stripe Connect V2
 */
export const SUPPORTED_COUNTRIES: { code: StripeCountryCode; name: string; currency: string }[] = [
  { code: 'NZ', name: 'New Zealand', currency: 'NZD' },
  { code: 'AU', name: 'Australia', currency: 'AUD' },
  { code: 'US', name: 'United States', currency: 'USD' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP' },
];

/**
 * Create a V2 Stripe account for a club
 */
export const createAccountV2 = async (
  input: CreateAccountV2Input
): Promise<{ accountId: string; existing: boolean }> => {
  try {
    const callable = httpsCallable<CreateAccountV2Input, { accountId: string; existing: boolean }>(
      functions,
      'stripe_createAccountV2'
    );

    const result = await callable(input);
    return result.data;
  } catch (error: any) {
    console.error('createAccountV2 error:', error);
    throw new Error(error.message || 'Failed to create V2 Stripe account');
  }
};

/**
 * Create a V2 account link for onboarding
 */
export const createAccountLinkV2 = async (
  accountId: string,
  clubId: string,
  returnUrl?: string,
  refreshUrl?: string
): Promise<{ url: string }> => {
  try {
    const callable = httpsCallable<
      { accountId: string; clubId: string; returnUrl?: string; refreshUrl?: string },
      { url: string }
    >(functions, 'stripe_createAccountLinkV2');

    const result = await callable({ accountId, clubId, returnUrl, refreshUrl });
    return result.data;
  } catch (error: any) {
    console.error('createAccountLinkV2 error:', error);
    throw new Error(error.message || 'Failed to create V2 account link');
  }
};

/**
 * Get V2 account status (always fetches fresh from Stripe)
 */
export const getAccountStatusV2 = async (
  accountId: string
): Promise<StripeAccountStatusV2> => {
  try {
    const callable = httpsCallable<{ accountId: string }, StripeAccountStatusV2>(
      functions,
      'stripe_getAccountStatusV2'
    );

    const result = await callable({ accountId });
    return result.data;
  } catch (error: any) {
    console.error('getAccountStatusV2 error:', error);
    throw new Error(error.message || 'Failed to get V2 account status');
  }
};

/**
 * Create a V2 Stripe account for a user/organizer
 */
export const createUserAccountV2 = async (
  input: CreateUserAccountV2Input
): Promise<{ accountId: string; existing: boolean }> => {
  try {
    const callable = httpsCallable<CreateUserAccountV2Input, { accountId: string; existing: boolean }>(
      functions,
      'stripe_createUserAccountV2'
    );

    const result = await callable(input);
    return result.data;
  } catch (error: any) {
    console.error('createUserAccountV2 error:', error);
    throw new Error(error.message || 'Failed to create V2 user Stripe account');
  }
};

/**
 * Create a V2 account link for user onboarding
 */
export const createUserAccountLinkV2 = async (
  accountId: string,
  returnUrl?: string,
  refreshUrl?: string
): Promise<{ url: string }> => {
  try {
    const callable = httpsCallable<
      { accountId: string; returnUrl?: string; refreshUrl?: string },
      { url: string }
    >(functions, 'stripe_createUserAccountLinkV2');

    const result = await callable({ accountId, returnUrl, refreshUrl });
    return result.data;
  } catch (error: any) {
    console.error('createUserAccountLinkV2 error:', error);
    throw new Error(error.message || 'Failed to create V2 user account link');
  }
};

/**
 * Check if a V2 account is ready to process payments
 */
export const isAccountV2Ready = (status: StripeAccountStatusV2): boolean => {
  return status.readyToProcessPayments === true && status.onboardingComplete === true;
};

// ============================================
// FEE CALCULATIONS
// ============================================

export interface FeeCalculation {
  subtotal: number;           // Base price
  platformFee: number;        // Our 1.5%
  stripeFee: number;          // Stripe's 2.7% + 70¢ (NZ rate)
  totalFees: number;          // Platform + Stripe
  organizerReceives: number;  // What organizer gets
  playerPays: number;         // Total player pays (if fees passed on)
}

/**
 * Calculate all fees for a transaction
 * @param amount - Base amount in cents
 * @param feesPaidBy - Who pays the platform and stripe fees
 */
export const calculateFees = (
  amount: number,
  feesPaidBy: 'organizer' | 'player' = 'organizer'
): FeeCalculation => {
  const platformFee = Math.round(amount * (PLATFORM_FEE_PERCENT / 100));
  const stripeFee = Math.round(amount * (STRIPE_FEE_PERCENT / 100)) + STRIPE_FEE_FIXED;
  const totalFees = platformFee + stripeFee;

  if (feesPaidBy === 'organizer') {
    // Organizer absorbs fees
    return {
      subtotal: amount,
      platformFee,
      stripeFee,
      totalFees,
      organizerReceives: amount - totalFees,
      playerPays: amount,
    };
  } else {
    // Player pays fees - we need to calculate the amount that after fees equals original
    // player_pays - stripe_fee(player_pays) - platform_fee = amount
    // player_pays * (1 - stripe_rate) - stripe_fixed - platform_fee = amount
    // We'll use a simpler approach: add fees on top
    const playerPays = amount + totalFees;
    const actualStripeFee = Math.round(playerPays * (STRIPE_FEE_PERCENT / 100)) + STRIPE_FEE_FIXED;
    
    return {
      subtotal: amount,
      platformFee,
      stripeFee: actualStripeFee,
      totalFees: platformFee + actualStripeFee,
      organizerReceives: amount,
      playerPays,
    };
  }
};

/**
 * Calculate platform fee only
 */
export const calculatePlatformFee = (amount: number): number => {
  return Math.round(amount * (PLATFORM_FEE_PERCENT / 100));
};

/**
 * Calculate what club/organizer receives after platform fee
 */
export const calculateOrganizerPayout = (amount: number): number => {
  const platformFee = calculatePlatformFee(amount);
  return amount - platformFee;
};

// Legacy alias
export const calculateClubPayout = calculateOrganizerPayout;

/**
 * Format amount for Stripe (already in cents, just validate)
 */
export const formatAmountForStripe = (cents: number): number => {
  return Math.round(cents);
};

/**
 * Check if club has completed Stripe onboarding
 */
export const isClubStripeReady = (status: StripeConnectStatus): boolean => {
  return status.isConnected && 
         status.chargesEnabled === true && 
         status.payoutsEnabled === true;
};

/**
 * Check if user has completed Stripe onboarding
 */
export const isUserStripeReady = (status: StripeConnectStatus): boolean => {
  return status.isConnected && 
         status.chargesEnabled === true && 
         status.payoutsEnabled === true;
};

// ============================================
// EXPORTS
// ============================================

export default {
  getStripe,
  redirectToCheckout,
  redirectToCheckoutById,
  createCheckoutSession,
  // Club connect (V1 - Legacy)
  createConnectAccountLink,
  getConnectAccountStatus,
  createConnectLoginLink,
  isClubStripeReady,
  // User connect (V1 - Legacy)
  createUserConnectAccountLink,
  getUserConnectAccountStatus,
  createUserConnectLoginLink,
  isUserStripeReady,
  // V2 Account functions (Direct Charges)
  createAccountV2,
  createAccountLinkV2,
  getAccountStatusV2,
  createUserAccountV2,
  createUserAccountLinkV2,
  isAccountV2Ready,
  SUPPORTED_COUNTRIES,
  // Calculations
  calculateFees,
  calculatePlatformFee,
  calculateOrganizerPayout,
  calculateClubPayout,
  PLATFORM_FEE_PERCENT,
  STRIPE_FEE_PERCENT,
  STRIPE_FEE_FIXED,
};
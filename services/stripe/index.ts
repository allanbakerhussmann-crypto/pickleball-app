/**
 * Stripe Service
 * 
 * Handles Stripe integration for the platform:
 * - Stripe Checkout for payments
 * - Stripe Connect for club onboarding
 * - Payment processing and transfers
 * 
 * FILE LOCATION: services/stripe/index.ts
 */

import { loadStripe, Stripe } from '@stripe/stripe-js';

// ============================================
// CONFIGURATION
// ============================================

// Publishable key (safe for frontend)
const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 
  'pk_test_51SfRmcAX1ucMm7kBSc07uoszxi8BOsqCnf6YVTHYdOJCVYbwdLoS14RxaNxVrtsoUYikNnrcHukragKUDPQNhBq8000RYa4u4S';

// Platform fee percentage (your revenue)
export const PLATFORM_FEE_PERCENT = 6; // 6% platform fee

// Stripe instance (singleton)
let stripePromise: Promise<Stripe | null> | null = null;

// ============================================
// INITIALIZE STRIPE
// ============================================

/**
 * Get the Stripe instance (lazy loaded)
 */
export const getStripe = (): Promise<Stripe | null> => {
  if (!stripePromise) {
    stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
  }
  return stripePromise;
};

// ============================================
// TYPES
// ============================================

export interface CreateCheckoutSessionInput {
  // What they're buying
  items: CheckoutLineItem[];
  
  // Who's paying
  customerEmail?: string;
  customerId?: string;
  
  // Who's receiving payment
  clubId: string;
  clubStripeAccountId: string;
  
  // URLs
  successUrl: string;
  cancelUrl: string;
  
  // Metadata for tracking
  metadata?: Record<string, string>;
}

export interface CheckoutLineItem {
  name: string;
  description?: string;
  amount: number; // in cents
  quantity: number;
}

export interface CreateConnectAccountInput {
  clubId: string;
  clubName: string;
  clubEmail: string;
  returnUrl: string;
  refreshUrl: string;
}

export interface StripeConnectStatus {
  isConnected: boolean;
  accountId?: string;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
  requirements?: {
    currentlyDue: string[];
    eventuallyDue: string[];
    pastDue: string[];
  };
}

// ============================================
// CHECKOUT SESSION (Client-side redirect)
// ============================================

/**
 * Redirect to Stripe Checkout
 * This creates a checkout session via your backend and redirects
 */
export const redirectToCheckout = async (sessionId: string): Promise<void> => {
  const stripe = await getStripe();
  if (!stripe) {
    throw new Error('Stripe failed to load');
  }
  
  const { error } = await stripe.redirectToCheckout({ sessionId });
  if (error) {
    throw new Error(error.message || 'Failed to redirect to checkout');
  }
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Calculate platform fee in cents
 */
export const calculatePlatformFee = (amount: number, feePercent: number = PLATFORM_FEE_PERCENT): number => {
  return Math.round(amount * (feePercent / 100));
};

/**
 * Calculate club payout (after platform fee)
 */
export const calculateClubPayout = (amount: number, feePercent: number = PLATFORM_FEE_PERCENT): number => {
  const platformFee = calculatePlatformFee(amount, feePercent);
  return amount - platformFee;
};

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

// ============================================
// FIREBASE CALLABLE FUNCTIONS
// ============================================

import { getFunctions, httpsCallable } from 'firebase/functions';

// Get functions instance (lazy)
let functionsInstance: ReturnType<typeof getFunctions> | null = null;

const getFunctionsInstance = () => {
  if (!functionsInstance) {
    // Import dynamically to avoid circular deps
    const { app } = require('../firebase');
    functionsInstance = getFunctions(app);
  }
  return functionsInstance;
};

/**
 * Create a Checkout Session via Cloud Function
 * Returns session ID and URL to redirect to
 */
export const createCheckoutSession = async (
  input: CreateCheckoutSessionInput
): Promise<{ sessionId: string; url: string }> => {
  const functions = getFunctionsInstance();
  const createSession = httpsCallable<CreateCheckoutSessionInput, { sessionId: string; url: string }>(
    functions, 
    'stripe_createCheckoutSession'
  );
  
  const result = await createSession(input);
  return result.data;
};

/**
 * Create a Connect Account onboarding link
 * Returns URL to redirect club admin to
 */
export const createConnectAccountLink = async (
  input: CreateConnectAccountInput
): Promise<{ url: string; accountId: string }> => {
  const functions = getFunctionsInstance();
  const createAccount = httpsCallable<CreateConnectAccountInput, { url: string; accountId: string }>(
    functions,
    'stripe_createConnectAccount'
  );
  
  const result = await createAccount(input);
  return result.data;
};

/**
 * Get Connect Account status
 */
export const getConnectAccountStatus = async (
  accountId: string
): Promise<StripeConnectStatus> => {
  const functions = getFunctionsInstance();
  const getStatus = httpsCallable<{ accountId: string }, StripeConnectStatus>(
    functions,
    'stripe_getConnectAccountStatus'
  );
  
  const result = await getStatus({ accountId });
  return result.data;
};

/**
 * Create a Connect Account login link (for dashboard access)
 */
export const createConnectLoginLink = async (
  accountId: string
): Promise<{ url: string }> => {
  const functions = getFunctionsInstance();
  const createLink = httpsCallable<{ accountId: string }, { url: string }>(
    functions,
    'stripe_createConnectLoginLink'
  );
  
  const result = await createLink({ accountId });
  return result.data;
};

// ============================================
// EXPORTS
// ============================================

export default {
  getStripe,
  redirectToCheckout,
  createCheckoutSession,
  createConnectAccountLink,
  getConnectAccountStatus,
  createConnectLoginLink,
  calculatePlatformFee,
  calculateClubPayout,
  isClubStripeReady,
  PLATFORM_FEE_PERCENT,
};
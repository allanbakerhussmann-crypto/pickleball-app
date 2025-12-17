/**
 * Stripe Integration Service
 * 
 * Handles all Stripe payment processing including:
 * - Payment Intents for one-time payments
 * - Customer management
 * - Webhook event processing
 * - Connect payouts to clubs
 * 
 * All amounts are in CENTS.
 * 
 * IMPORTANT: This file contains client-side safe functions.
 * Webhook handlers and secret key operations should be in
 * Cloud Functions or server-side code.
 * 
 * FILE LOCATION: services/firebase/payments/stripe.ts
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
} from '@firebase/firestore';
import { db } from '../config';
import type {
  SupportedCurrency,
  Transaction,
  Payment,
  PaymentStatus,
  ReferenceType,
  TransactionBreakdown,
} from './types';

// ============================================
// TYPES
// ============================================

/**
 * Stripe Payment Intent status mapping
 */
export type StripePaymentIntentStatus =
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'requires_action'
  | 'processing'
  | 'requires_capture'
  | 'canceled'
  | 'succeeded';

/**
 * Map Stripe status to our PaymentStatus
 */
export const mapStripeStatusToPaymentStatus = (
  stripeStatus: StripePaymentIntentStatus
): PaymentStatus => {
  const mapping: Record<StripePaymentIntentStatus, PaymentStatus> = {
    requires_payment_method: 'pending',
    requires_confirmation: 'pending',
    requires_action: 'requires_action',
    processing: 'processing',
    requires_capture: 'processing',
    canceled: 'failed',
    succeeded: 'succeeded',
  };
  return mapping[stripeStatus] || 'pending';
};

/**
 * Payment Intent creation parameters
 */
export interface CreatePaymentIntentParams {
  /** Amount in cents */
  amount: number;
  currency: SupportedCurrency;
  /** User making the payment */
  userId: string;
  /** Club receiving the payment (optional) */
  clubId?: string;
  /** What this payment is for */
  referenceType: ReferenceType;
  referenceId: string;
  referenceName: string;
  /** Price breakdown */
  breakdown: TransactionBreakdown;
  /** Stripe Customer ID (if known) */
  stripeCustomerId?: string;
  /** Additional metadata */
  metadata?: Record<string, string>;
  /** For tournaments/leagues */
  tournamentId?: string;
  leagueId?: string;
}

/**
 * Payment Intent response from our API
 */
export interface PaymentIntentResponse {
  /** Stripe Payment Intent ID */
  paymentIntentId: string;
  /** Client secret for Stripe.js */
  clientSecret: string;
  /** Our internal payment record ID */
  paymentId: string;
  /** Amount in cents */
  amount: number;
  currency: SupportedCurrency;
  status: PaymentStatus;
}

/**
 * Stripe Customer data
 */
export interface StripeCustomer {
  id: string;
  odUserId: string;
  stripeCustomerId: string;
  email?: string;
  name?: string;
  defaultPaymentMethodId?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Stripe Connect Account for clubs
 */
export interface StripeConnectAccount {
  id: string;
  odClubId: string;
  stripeAccountId: string;
  accountType: 'standard' | 'express' | 'custom';
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  email?: string;
  businessName?: string;
  country: string;
  defaultCurrency: SupportedCurrency;
  createdAt: number;
  updatedAt: number;
}

/**
 * Webhook event record
 */
export interface StripeWebhookEvent {
  id: string;
  stripeEventId: string;
  type: string;
  processed: boolean;
  processedAt?: number;
  error?: string;
  data: Record<string, any>;
  createdAt: number;
}

// ============================================
// COLLECTIONS
// ============================================

const STRIPE_CUSTOMERS_COLLECTION = 'stripeCustomers';
const STRIPE_CONNECT_ACCOUNTS_COLLECTION = 'stripeConnectAccounts';
const STRIPE_WEBHOOK_EVENTS_COLLECTION = 'stripeWebhookEvents';
const PAYMENTS_COLLECTION = 'payments';

// ============================================
// CUSTOMER MANAGEMENT
// ============================================

/**
 * Get Stripe customer by user ID
 */
export const getStripeCustomer = async (
  userId: string
): Promise<StripeCustomer | null> => {
  const q = query(
    collection(db, STRIPE_CUSTOMERS_COLLECTION),
    where('odUserId', '==', userId),
    limit(1)
  );
  
  const snap = await getDocs(q);
  if (snap.empty) return null;
  
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as StripeCustomer;
};

/**
 * Get Stripe customer by Stripe Customer ID
 */
export const getStripeCustomerByStripeId = async (
  stripeCustomerId: string
): Promise<StripeCustomer | null> => {
  const q = query(
    collection(db, STRIPE_CUSTOMERS_COLLECTION),
    where('stripeCustomerId', '==', stripeCustomerId),
    limit(1)
  );
  
  const snap = await getDocs(q);
  if (snap.empty) return null;
  
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as StripeCustomer;
};

/**
 * Save Stripe customer record
 * Called after creating a customer via Stripe API
 */
export const saveStripeCustomer = async (
  userId: string,
  stripeCustomerId: string,
  email?: string,
  name?: string
): Promise<StripeCustomer> => {
  const existing = await getStripeCustomer(userId);
  
  if (existing) {
    // Update existing
    const docRef = doc(db, STRIPE_CUSTOMERS_COLLECTION, existing.id);
    await updateDoc(docRef, {
      stripeCustomerId,
      email,
      name,
      updatedAt: Date.now(),
    });
    return { ...existing, stripeCustomerId, email, name, updatedAt: Date.now() };
  }
  
  // Create new
  const docRef = doc(collection(db, STRIPE_CUSTOMERS_COLLECTION));
  const customer: StripeCustomer = {
    id: docRef.id,
    odUserId: userId,
    stripeCustomerId,
    email,
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  
  await setDoc(docRef, customer);
  return customer;
};

/**
 * Update default payment method
 */
export const updateDefaultPaymentMethod = async (
  userId: string,
  paymentMethodId: string
): Promise<void> => {
  const customer = await getStripeCustomer(userId);
  if (!customer) {
    throw new Error(`Stripe customer not found for user: ${userId}`);
  }
  
  const docRef = doc(db, STRIPE_CUSTOMERS_COLLECTION, customer.id);
  await updateDoc(docRef, {
    defaultPaymentMethodId: paymentMethodId,
    updatedAt: Date.now(),
  });
};

// ============================================
// CONNECT ACCOUNT MANAGEMENT
// ============================================

/**
 * Get Stripe Connect account for a club
 */
export const getStripeConnectAccount = async (
  clubId: string
): Promise<StripeConnectAccount | null> => {
  const q = query(
    collection(db, STRIPE_CONNECT_ACCOUNTS_COLLECTION),
    where('odClubId', '==', clubId),
    limit(1)
  );
  
  const snap = await getDocs(q);
  if (snap.empty) return null;
  
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as StripeConnectAccount;
};

/**
 * Get Stripe Connect account by Stripe Account ID
 */
export const getStripeConnectAccountByStripeId = async (
  stripeAccountId: string
): Promise<StripeConnectAccount | null> => {
  const q = query(
    collection(db, STRIPE_CONNECT_ACCOUNTS_COLLECTION),
    where('stripeAccountId', '==', stripeAccountId),
    limit(1)
  );
  
  const snap = await getDocs(q);
  if (snap.empty) return null;
  
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as StripeConnectAccount;
};

/**
 * Save Stripe Connect account
 * Called after creating a Connect account via Stripe API
 */
export const saveStripeConnectAccount = async (
  clubId: string,
  stripeAccountId: string,
  accountType: StripeConnectAccount['accountType'],
  country: string,
  defaultCurrency: SupportedCurrency
): Promise<StripeConnectAccount> => {
  const existing = await getStripeConnectAccount(clubId);
  
  if (existing) {
    // Update existing
    const docRef = doc(db, STRIPE_CONNECT_ACCOUNTS_COLLECTION, existing.id);
    await updateDoc(docRef, {
      stripeAccountId,
      accountType,
      country,
      defaultCurrency,
      updatedAt: Date.now(),
    });
    return { ...existing, stripeAccountId, accountType, country, defaultCurrency, updatedAt: Date.now() };
  }
  
  // Create new
  const docRef = doc(collection(db, STRIPE_CONNECT_ACCOUNTS_COLLECTION));
  const account: StripeConnectAccount = {
    id: docRef.id,
    odClubId: clubId,
    stripeAccountId,
    accountType,
    chargesEnabled: false,
    payoutsEnabled: false,
    detailsSubmitted: false,
    country,
    defaultCurrency,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  
  await setDoc(docRef, account);
  return account;
};

/**
 * Update Connect account status
 * Called from webhook when account is updated
 */
export const updateStripeConnectAccountStatus = async (
  stripeAccountId: string,
  status: {
    chargesEnabled?: boolean;
    payoutsEnabled?: boolean;
    detailsSubmitted?: boolean;
    email?: string;
    businessName?: string;
  }
): Promise<void> => {
  const account = await getStripeConnectAccountByStripeId(stripeAccountId);
  if (!account) {
    console.warn(`Connect account not found: ${stripeAccountId}`);
    return;
  }
  
  const docRef = doc(db, STRIPE_CONNECT_ACCOUNTS_COLLECTION, account.id);
  await updateDoc(docRef, {
    ...status,
    updatedAt: Date.now(),
  });
};

/**
 * Check if club can receive payments
 */
export const canClubReceivePayments = async (
  clubId: string
): Promise<boolean> => {
  const account = await getStripeConnectAccount(clubId);
  if (!account) return false;
  
  return account.chargesEnabled && account.detailsSubmitted;
};

/**
 * Check if club can receive payouts
 */
export const canClubReceivePayouts = async (
  clubId: string
): Promise<boolean> => {
  const account = await getStripeConnectAccount(clubId);
  if (!account) return false;
  
  return account.payoutsEnabled && account.detailsSubmitted;
};

// ============================================
// PAYMENT INTENT MANAGEMENT
// ============================================

/**
 * Create a pending payment record
 * Called before creating Stripe Payment Intent
 */
export const createPendingPayment = async (
  params: CreatePaymentIntentParams
): Promise<Payment> => {
  const docRef = doc(collection(db, PAYMENTS_COLLECTION));
  
  const payment: Payment = {
    id: docRef.id,
    odUserId: params.userId,
    odClubId: params.clubId,
    tournamentId: params.tournamentId,
    leagueId: params.leagueId,
    amount: params.amount,
    currency: params.currency,
    status: 'pending',
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    referenceName: params.referenceName,
    breakdown: params.breakdown,
    platformFee: params.breakdown.fees,
    netAmount: params.amount - params.breakdown.fees,
    createdAt: Date.now(),
  };
  
  await setDoc(docRef, payment);
  return payment;
};

/**
 * Update payment with Stripe Payment Intent ID
 * Called after creating Payment Intent via Stripe API
 */
export const linkPaymentToStripeIntent = async (
  paymentId: string,
  stripePaymentIntentId: string,
  stripeCustomerId?: string
): Promise<void> => {
  const docRef = doc(db, PAYMENTS_COLLECTION, paymentId);
  await updateDoc(docRef, {
    stripePaymentIntentId,
    stripeCustomerId,
  });
};

/**
 * Get payment by ID
 */
export const getPayment = async (
  paymentId: string
): Promise<Payment | null> => {
  const docRef = doc(db, PAYMENTS_COLLECTION, paymentId);
  const snap = await getDoc(docRef);
  
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Payment;
};

/**
 * Get payment by Stripe Payment Intent ID
 */
export const getPaymentByStripeIntent = async (
  stripePaymentIntentId: string
): Promise<Payment | null> => {
  const q = query(
    collection(db, PAYMENTS_COLLECTION),
    where('stripePaymentIntentId', '==', stripePaymentIntentId),
    limit(1)
  );
  
  const snap = await getDocs(q);
  if (snap.empty) return null;
  
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as Payment;
};

/**
 * Update payment status
 */
export const updatePaymentStatus = async (
  paymentId: string,
  status: PaymentStatus,
  additionalData?: {
    stripeChargeId?: string;
    failureReason?: string;
    failureCode?: string;
    completedAt?: number;
  }
): Promise<void> => {
  const docRef = doc(db, PAYMENTS_COLLECTION, paymentId);
  
  const updates: Record<string, any> = { status };
  
  if (additionalData?.stripeChargeId) {
    updates.stripeChargeId = additionalData.stripeChargeId;
  }
  if (additionalData?.failureReason) {
    updates.failureReason = additionalData.failureReason;
  }
  if (additionalData?.failureCode) {
    updates.failureCode = additionalData.failureCode;
  }
  if (status === 'succeeded') {
    updates.completedAt = additionalData?.completedAt || Date.now();
  }
  
  await updateDoc(docRef, updates);
};

/**
 * Get user's payments
 */
export const getUserPayments = async (
  userId: string,
  limitCount: number = 20
): Promise<Payment[]> => {
  const q = query(
    collection(db, PAYMENTS_COLLECTION),
    where('odUserId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Payment));
};

/**
 * Get club's payments
 */
export const getClubPayments = async (
  clubId: string,
  limitCount: number = 50
): Promise<Payment[]> => {
  const q = query(
    collection(db, PAYMENTS_COLLECTION),
    where('odClubId', '==', clubId),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Payment));
};

// ============================================
// WEBHOOK EVENT MANAGEMENT
// ============================================

/**
 * Check if webhook event has been processed
 */
export const hasWebhookEventBeenProcessed = async (
  stripeEventId: string
): Promise<boolean> => {
  const q = query(
    collection(db, STRIPE_WEBHOOK_EVENTS_COLLECTION),
    where('stripeEventId', '==', stripeEventId),
    limit(1)
  );
  
  const snap = await getDocs(q);
  if (snap.empty) return false;
  
  const event = snap.docs[0].data() as StripeWebhookEvent;
  return event.processed;
};

/**
 * Record webhook event
 */
export const recordWebhookEvent = async (
  stripeEventId: string,
  eventType: string,
  data: Record<string, any>
): Promise<StripeWebhookEvent> => {
  const docRef = doc(collection(db, STRIPE_WEBHOOK_EVENTS_COLLECTION));
  
  const event: StripeWebhookEvent = {
    id: docRef.id,
    stripeEventId,
    type: eventType,
    processed: false,
    data,
    createdAt: Date.now(),
  };
  
  await setDoc(docRef, event);
  return event;
};

/**
 * Mark webhook event as processed
 */
export const markWebhookEventProcessed = async (
  stripeEventId: string,
  error?: string
): Promise<void> => {
  const q = query(
    collection(db, STRIPE_WEBHOOK_EVENTS_COLLECTION),
    where('stripeEventId', '==', stripeEventId),
    limit(1)
  );
  
  const snap = await getDocs(q);
  if (snap.empty) return;
  
  const docRef = doc(db, STRIPE_WEBHOOK_EVENTS_COLLECTION, snap.docs[0].id);
  await updateDoc(docRef, {
    processed: true,
    processedAt: Date.now(),
    error: error || null,
  });
};

// ============================================
// PAYMENT FLOW HELPERS
// ============================================

/**
 * Build metadata for Stripe Payment Intent
 */
export const buildPaymentIntentMetadata = (
  params: CreatePaymentIntentParams
): Record<string, string> => {
  const metadata: Record<string, string> = {
    userId: params.userId,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    referenceName: params.referenceName,
  };
  
  if (params.clubId) metadata.clubId = params.clubId;
  if (params.tournamentId) metadata.tournamentId = params.tournamentId;
  if (params.leagueId) metadata.leagueId = params.leagueId;
  
  // Add any custom metadata
  if (params.metadata) {
    Object.assign(metadata, params.metadata);
  }
  
  return metadata;
};

/**
 * Calculate application fee for Connect payments
 * This is the platform fee we keep
 */
export const calculateApplicationFee = (
  amount: number,
  feePercent: number = 1.5
): number => {
  return Math.round(amount * (feePercent / 100));
};

/**
 * Get currency code for Stripe (lowercase)
 */
export const getStripeCurrency = (currency: SupportedCurrency): string => {
  return currency.toLowerCase();
};

// ============================================
// REFUND HELPERS
// ============================================

/**
 * Record a refund on a payment
 */
export const recordPaymentRefund = async (
  paymentId: string,
  refundAmount: number,
  refundId: string
): Promise<void> => {
  const payment = await getPayment(paymentId);
  if (!payment) {
    throw new Error(`Payment not found: ${paymentId}`);
  }
  
  const currentRefunded = payment.refundedAmount || 0;
  const currentRefundIds = payment.refundIds || [];
  
  const docRef = doc(db, PAYMENTS_COLLECTION, paymentId);
  await updateDoc(docRef, {
    refundedAmount: currentRefunded + refundAmount,
    refundIds: [...currentRefundIds, refundId],
  });
};

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Validate payment amount
 */
export const validatePaymentAmount = (
  amount: number,
  currency: SupportedCurrency
): { valid: boolean; error?: string } => {
  // Minimum amounts by currency (in cents)
  const minimums: Record<SupportedCurrency, number> = {
    nzd: 50, // $0.50 NZD
    aud: 50, // $0.50 AUD
    usd: 50, // $0.50 USD
  };
  
  // Maximum amounts (Stripe limit is ~$999,999.99)
  const maximum = 99999999; // $999,999.99
  
  if (amount < minimums[currency]) {
    return {
      valid: false,
      error: `Minimum payment is ${minimums[currency] / 100} ${currency.toUpperCase()}`,
    };
  }
  
  if (amount > maximum) {
    return {
      valid: false,
      error: 'Amount exceeds maximum allowed',
    };
  }
  
  if (!Number.isInteger(amount)) {
    return {
      valid: false,
      error: 'Amount must be a whole number (in cents)',
    };
  }
  
  return { valid: true };
};

/**
 * Check if payment method is valid for currency
 */
export const isPaymentMethodValidForCurrency = (
  paymentMethodType: string,
  currency: SupportedCurrency
): boolean => {
  // Card payments work for all currencies
  if (paymentMethodType === 'card') return true;
  
  // Add currency-specific payment methods here
  // e.g., BECS Direct Debit for AUD, etc.
  
  return false;
};

// ============================================
// DISPLAY HELPERS
// ============================================

/**
 * Get payment status display text
 */
export const getPaymentStatusText = (status: PaymentStatus): string => {
  const texts: Record<PaymentStatus, string> = {
    pending: 'Pending',
    processing: 'Processing',
    requires_action: 'Action Required',
    succeeded: 'Succeeded',
    failed: 'Failed',
    refunded: 'Refunded',
    partially_refunded: 'Partially Refunded',
  };
  return texts[status] || status;
};

/**
 * Get payment status color for UI
 */
export const getPaymentStatusColor = (status: PaymentStatus): string => {
  const colors: Record<PaymentStatus, string> = {
    pending: 'yellow',
    processing: 'blue',
    requires_action: 'orange',
    succeeded: 'green',
    failed: 'red',
    refunded: 'gray',
    partially_refunded: 'purple',
  };
  return colors[status] || 'gray';
};

/**
 * Format amount for display
 */
export const formatPaymentAmount = (
  amount: number,
  currency: SupportedCurrency
): string => {
  const dollars = amount / 100;
  const symbols: Record<SupportedCurrency, string> = {
    nzd: 'NZ$',
    aud: 'A$',
    usd: '$',
  };
  return `${symbols[currency]}${dollars.toFixed(2)}`;
};
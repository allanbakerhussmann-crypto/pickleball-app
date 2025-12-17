/**
 * Refund Service
 * 
 * Manages refunds including:
 * - Full and partial refunds
 * - Refund to original payment method or wallet
 * - Refund approval workflow
 * - Refund policies and validation
 * 
 * All amounts are in CENTS.
 * 
 * FILE LOCATION: services/firebase/payments/refunds.ts
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
  onSnapshot,
  runTransaction,
  type Unsubscribe,
} from '@firebase/firestore';
import { db } from '../config';
import type {
  Refund,
  RefundStatus,
  RefundMethod,
  CreateRefundInput,
  Payment,
  Transaction,
  SupportedCurrency,
  ReferenceType,
  TransactionBreakdown,
} from './types';

// ============================================
// CONSTANTS
// ============================================

const REFUNDS_COLLECTION = 'refunds';
const PAYMENTS_COLLECTION = 'payments';

/**
 * Maximum days after payment to allow refund
 */
export const MAX_REFUND_WINDOW_DAYS = 30;

/**
 * Minimum refund amount in cents
 */
export const MIN_REFUND_AMOUNT = 100; // $1.00

/**
 * Refund reasons
 */
export const REFUND_REASONS = [
  'customer_request',
  'duplicate_payment',
  'booking_cancelled',
  'event_cancelled',
  'service_issue',
  'pricing_error',
  'fraudulent',
  'other',
] as const;

export type RefundReason = typeof REFUND_REASONS[number];

// ============================================
// TYPES
// ============================================

/**
 * Refund policy configuration
 */
export interface RefundPolicy {
  /** Whether refunds are allowed */
  enabled: boolean;
  /** Maximum days after payment to request refund */
  maxDaysAfterPayment: number;
  /** Whether partial refunds are allowed */
  allowPartialRefunds: boolean;
  /** Minimum refund amount in cents */
  minRefundAmount: number;
  /** Whether admin approval is required */
  requiresApproval: boolean;
  /** Automatic refund threshold (below this, auto-approve) */
  autoApproveThreshold: number;
  /** Restocking/cancellation fee percentage (0-100) */
  cancellationFeePercent: number;
  /** Whether to refund platform fees */
  refundPlatformFees: boolean;
  /** Specific rules by reference type */
  typeRules?: Partial<Record<ReferenceType, {
    maxDaysAfterPayment?: number;
    cancellationFeePercent?: number;
    enabled?: boolean;
  }>>;
}

/**
 * Refund calculation result
 */
export interface RefundCalculation {
  /** Original payment amount */
  originalAmount: number;
  /** Amount already refunded */
  previouslyRefunded: number;
  /** Maximum refundable amount */
  maxRefundable: number;
  /** Requested refund amount */
  requestedAmount: number;
  /** Cancellation fee (if any) */
  cancellationFee: number;
  /** Platform fee refund (if applicable) */
  platformFeeRefund: number;
  /** Net refund to customer */
  netRefundAmount: number;
  /** Whether this would be a full refund */
  isFullRefund: boolean;
  /** Breakdown of refund */
  breakdown: TransactionBreakdown;
}

/**
 * Refund request input
 */
export interface RefundRequest {
  paymentId: string;
  amount?: number; // If not provided, full refund
  reason: RefundReason;
  reasonDetails?: string;
  requestedBy: string; // User ID of requester
  refundMethod?: RefundMethod; // Default: original payment method
}

/**
 * Refund approval input
 */
export interface RefundApproval {
  refundId: string;
  approved: boolean;
  approvedBy: string;
  approvalNotes?: string;
  adjustedAmount?: number; // If approver wants to adjust
}

// ============================================
// ID GENERATION
// ============================================

/**
 * Generate a unique refund ID
 */
export const generateRefundId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `ref_${timestamp}${random}`;
};

// ============================================
// REFUND CRUD OPERATIONS
// ============================================

/**
 * Get a refund by ID
 */
export const getRefund = async (
  refundId: string
): Promise<Refund | null> => {
  const docRef = doc(db, REFUNDS_COLLECTION, refundId);
  const snap = await getDoc(docRef);
  
  if (!snap.exists()) {
    return null;
  }
  
  return { id: snap.id, ...snap.data() } as Refund;
};

/**
 * Get refunds for a payment
 */
export const getRefundsForPayment = async (
  paymentId: string
): Promise<Refund[]> => {
  const q = query(
    collection(db, REFUNDS_COLLECTION),
    where('paymentId', '==', paymentId),
    orderBy('createdAt', 'desc')
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Refund));
};

/**
 * Get refunds for a user
 */
export const getUserRefunds = async (
  userId: string,
  limitCount: number = 20
): Promise<Refund[]> => {
  const q = query(
    collection(db, REFUNDS_COLLECTION),
    where('odUserId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Refund));
};

/**
 * Get refunds for a club
 */
export const getClubRefunds = async (
  clubId: string,
  limitCount: number = 50
): Promise<Refund[]> => {
  const q = query(
    collection(db, REFUNDS_COLLECTION),
    where('odClubId', '==', clubId),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Refund));
};

/**
 * Get pending refunds (awaiting approval)
 */
export const getPendingRefunds = async (
  clubId?: string
): Promise<Refund[]> => {
  let q;
  
  if (clubId) {
    q = query(
      collection(db, REFUNDS_COLLECTION),
      where('odClubId', '==', clubId),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'asc')
    );
  } else {
    q = query(
      collection(db, REFUNDS_COLLECTION),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'asc')
    );
  }
  
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Refund));
};

/**
 * Subscribe to refunds for a user
 */
export const subscribeToUserRefunds = (
  userId: string,
  callback: (refunds: Refund[]) => void
): Unsubscribe => {
  const q = query(
    collection(db, REFUNDS_COLLECTION),
    where('odUserId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(20)
  );
  
  return onSnapshot(q, (snap) => {
    const refunds = snap.docs.map(d => ({ id: d.id, ...d.data() } as Refund));
    callback(refunds);
  });
};

/**
 * Subscribe to pending refunds for a club
 */
export const subscribeToPendingRefunds = (
  clubId: string,
  callback: (refunds: Refund[]) => void
): Unsubscribe => {
  const q = query(
    collection(db, REFUNDS_COLLECTION),
    where('odClubId', '==', clubId),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'asc')
  );
  
  return onSnapshot(q, (snap) => {
    const refunds = snap.docs.map(d => ({ id: d.id, ...d.data() } as Refund));
    callback(refunds);
  });
};

// ============================================
// REFUND VALIDATION
// ============================================

/**
 * Validate if a refund can be processed
 */
export const validateRefundRequest = async (
  request: RefundRequest,
  policy: RefundPolicy
): Promise<{ valid: boolean; error?: string; calculation?: RefundCalculation }> => {
  // Get the payment
  const paymentRef = doc(db, PAYMENTS_COLLECTION, request.paymentId);
  const paymentSnap = await getDoc(paymentRef);
  
  if (!paymentSnap.exists()) {
    return { valid: false, error: 'Payment not found' };
  }
  
  const payment = { id: paymentSnap.id, ...paymentSnap.data() } as Payment;
  
  // Check if refunds are enabled
  if (!policy.enabled) {
    return { valid: false, error: 'Refunds are not enabled' };
  }
  
  // Check payment status
  if (payment.status !== 'succeeded' && payment.status !== 'partially_refunded') {
    return { valid: false, error: `Cannot refund payment with status: ${payment.status}` };
  }
  
  // Check refund window
  const daysSincePayment = Math.floor(
    (Date.now() - payment.createdAt) / (1000 * 60 * 60 * 24)
  );
  
  const maxDays = policy.typeRules?.[payment.referenceType]?.maxDaysAfterPayment 
    ?? policy.maxDaysAfterPayment;
  
  if (daysSincePayment > maxDays) {
    return { valid: false, error: `Refund window expired (${maxDays} days)` };
  }
  
  // Calculate refund amounts
  const calculation = calculateRefundAmounts(payment, request.amount, policy);
  
  // Check minimum amount
  if (calculation.netRefundAmount < policy.minRefundAmount) {
    return { 
      valid: false, 
      error: `Refund amount below minimum (${policy.minRefundAmount / 100})` 
    };
  }
  
  // Check if partial refunds are allowed
  if (!calculation.isFullRefund && !policy.allowPartialRefunds) {
    return { valid: false, error: 'Partial refunds are not allowed' };
  }
  
  // Check if amount exceeds maximum refundable
  if (calculation.requestedAmount > calculation.maxRefundable) {
    return { 
      valid: false, 
      error: `Amount exceeds maximum refundable (${calculation.maxRefundable / 100})` 
    };
  }
  
  return { valid: true, calculation };
};

/**
 * Calculate refund amounts
 */
export const calculateRefundAmounts = (
  payment: Payment,
  requestedAmount: number | undefined,
  policy: RefundPolicy
): RefundCalculation => {
  const originalAmount = payment.amount;
  const previouslyRefunded = payment.refundedAmount || 0;
  const maxRefundable = originalAmount - previouslyRefunded;
  
  // If no amount specified, refund everything
  const requestedRefund = requestedAmount ?? maxRefundable;
  const isFullRefund = requestedRefund >= maxRefundable;
  
  // Calculate cancellation fee
  const cancellationFeePercent = policy.typeRules?.[payment.referenceType]?.cancellationFeePercent
    ?? policy.cancellationFeePercent;
  const cancellationFee = Math.round(requestedRefund * (cancellationFeePercent / 100));
  
  // Calculate platform fee refund
  let platformFeeRefund = 0;
  if (policy.refundPlatformFees && payment.platformFee) {
    // Proportional platform fee refund
    const refundRatio = requestedRefund / originalAmount;
    platformFeeRefund = Math.round(payment.platformFee * refundRatio);
  }
  
  // Net refund to customer
  const netRefundAmount = requestedRefund - cancellationFee;
  
  // Build breakdown
  const breakdown: TransactionBreakdown = {
    items: [
      { label: 'Refund Amount', amount: requestedRefund, type: 'charge' },
    ],
    subtotal: requestedRefund,
    discounts: 0,
    fees: cancellationFee,
    tax: 0,
    total: netRefundAmount,
  };
  
  if (cancellationFee > 0) {
    breakdown.items.push({
      label: 'Cancellation Fee',
      amount: -cancellationFee,
      type: 'fee',
    });
  }
  
  return {
    originalAmount,
    previouslyRefunded,
    maxRefundable,
    requestedAmount: requestedRefund,
    cancellationFee,
    platformFeeRefund,
    netRefundAmount,
    isFullRefund,
    breakdown,
  };
};

// ============================================
// REFUND PROCESSING
// ============================================

/**
 * Create a refund request
 */
export const createRefundRequest = async (
  request: RefundRequest,
  policy: RefundPolicy
): Promise<Refund> => {
  // Validate the request
  const validation = await validateRefundRequest(request, policy);
  if (!validation.valid || !validation.calculation) {
    throw new Error(validation.error || 'Invalid refund request');
  }
  
  // Get the payment
  const paymentRef = doc(db, PAYMENTS_COLLECTION, request.paymentId);
  const paymentSnap = await getDoc(paymentRef);
  const payment = { id: paymentSnap.id, ...paymentSnap.data() } as Payment;
  
  const calc = validation.calculation;
  const refundId = generateRefundId();
  const now = Date.now();
  
  // Determine initial status
  let initialStatus: RefundStatus = 'pending';
  if (!policy.requiresApproval || calc.netRefundAmount <= policy.autoApproveThreshold) {
    initialStatus = 'approved';
  }
  
  // Create refund record
  const refund: Refund = {
    id: refundId,
    paymentId: request.paymentId,
    odUserId: payment.odUserId,
    odClubId: payment.odClubId,
    originalAmount: calc.originalAmount,
    refundAmount: calc.netRefundAmount,
    cancellationFee: calc.cancellationFee,
    platformFeeRefund: calc.platformFeeRefund,
    currency: payment.currency,
    status: initialStatus,
    method: request.refundMethod || (payment.paymentMethod === 'wallet' ? 'wallet' : 'original'),
    reason: request.reason,
    reasonDetails: request.reasonDetails,
    requestedBy: request.requestedBy,
    referenceType: payment.referenceType,
    referenceId: payment.referenceId,
    referenceName: payment.referenceName,
    isFullRefund: calc.isFullRefund,
    createdAt: now,
  };
  
  // Save refund
  const refundRef = doc(db, REFUNDS_COLLECTION, refundId);
  await setDoc(refundRef, refund);
  
  // If auto-approved, process immediately
  if (initialStatus === 'approved') {
    return processApprovedRefund(refund);
  }
  
  return refund;
};

/**
 * Approve or reject a refund
 */
export const processRefundApproval = async (
  approval: RefundApproval
): Promise<Refund> => {
  const refund = await getRefund(approval.refundId);
  if (!refund) {
    throw new Error(`Refund not found: ${approval.refundId}`);
  }
  
  if (refund.status !== 'pending') {
    throw new Error(`Refund is not pending: ${refund.status}`);
  }
  
  const now = Date.now();
  const refundRef = doc(db, REFUNDS_COLLECTION, approval.refundId);
  
  if (approval.approved) {
    // Update refund as approved
    const updates: Partial<Refund> = {
      status: 'approved',
      approvedBy: approval.approvedBy,
      approvedAt: now,
      approvalNotes: approval.approvalNotes,
    };
    
    // Adjust amount if specified
    if (approval.adjustedAmount !== undefined) {
      updates.refundAmount = approval.adjustedAmount;
    }
    
    await updateDoc(refundRef, updates);
    
    // Process the refund
    const updatedRefund = { ...refund, ...updates };
    return processApprovedRefund(updatedRefund as Refund);
  } else {
    // Reject the refund
    await updateDoc(refundRef, {
      status: 'rejected',
      approvedBy: approval.approvedBy,
      approvedAt: now,
      approvalNotes: approval.approvalNotes,
    });
    
    return { ...refund, status: 'rejected' };
  }
};

/**
 * Process an approved refund
 * This handles the actual money movement
 */
export const processApprovedRefund = async (
  refund: Refund
): Promise<Refund> => {
  const refundRef = doc(db, REFUNDS_COLLECTION, refund.id);
  const now = Date.now();
  
  try {
    // Mark as processing
    await updateDoc(refundRef, {
      status: 'processing',
    });
    
    // Get the payment
    const paymentRef = doc(db, PAYMENTS_COLLECTION, refund.paymentId);
    const paymentSnap = await getDoc(paymentRef);
    
    if (!paymentSnap.exists()) {
      throw new Error('Payment not found');
    }
    
    const payment = { id: paymentSnap.id, ...paymentSnap.data() } as Payment;
    
    // Process based on refund method
    if (refund.method === 'wallet') {
      // Refund to wallet - this would call wallet service
      // await addToWallet(payment.walletId, refund.refundAmount, ...);
      
      // For now, just mark as completed
      await updateDoc(refundRef, {
        status: 'completed',
        completedAt: now,
      });
    } else {
      // Refund to original payment method (Stripe)
      // This would typically be handled by Stripe webhook
      // For now, mark as processing (Stripe will complete it)
      
      // The stripeRefundId would be set by the webhook handler
      await updateDoc(refundRef, {
        status: 'processing',
        // stripeRefundId will be set by webhook
      });
    }
    
    // Update payment record
    const newRefundedAmount = (payment.refundedAmount || 0) + refund.refundAmount;
    const newStatus = newRefundedAmount >= payment.amount ? 'refunded' : 'partially_refunded';
    
    await updateDoc(paymentRef, {
      refundedAmount: newRefundedAmount,
      status: newStatus,
      refundIds: [...(payment.refundIds || []), refund.id],
    });
    
    return { ...refund, status: 'completed', completedAt: now };
    
  } catch (error) {
    // Mark as failed
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await updateDoc(refundRef, {
      status: 'failed',
      failureReason: errorMessage,
    });
    
    throw error;
  }
};

/**
 * Mark refund as completed (called from Stripe webhook)
 */
export const completeRefund = async (
  refundId: string,
  stripeRefundId?: string
): Promise<void> => {
  const refundRef = doc(db, REFUNDS_COLLECTION, refundId);
  
  await updateDoc(refundRef, {
    status: 'completed',
    completedAt: Date.now(),
    stripeRefundId,
  });
};

/**
 * Mark refund as failed
 */
export const failRefund = async (
  refundId: string,
  reason: string
): Promise<void> => {
  const refundRef = doc(db, REFUNDS_COLLECTION, refundId);
  
  await updateDoc(refundRef, {
    status: 'failed',
    failureReason: reason,
  });
};

// ============================================
// REFUND QUERIES
// ============================================

/**
 * Get total refunded amount for a payment
 */
export const getTotalRefundedForPayment = async (
  paymentId: string
): Promise<number> => {
  const refunds = await getRefundsForPayment(paymentId);
  return refunds
    .filter(r => r.status === 'completed')
    .reduce((sum, r) => sum + r.refundAmount, 0);
};

/**
 * Get refund statistics for a club
 */
export const getClubRefundStats = async (
  clubId: string,
  startDate: number,
  endDate: number
): Promise<{
  totalRefunds: number;
  totalAmount: number;
  averageAmount: number;
  byReason: Record<string, number>;
  byStatus: Record<RefundStatus, number>;
}> => {
  const q = query(
    collection(db, REFUNDS_COLLECTION),
    where('odClubId', '==', clubId),
    where('createdAt', '>=', startDate),
    where('createdAt', '<=', endDate)
  );
  
  const snap = await getDocs(q);
  const refunds = snap.docs.map(d => ({ id: d.id, ...d.data() } as Refund));
  
  const completedRefunds = refunds.filter(r => r.status === 'completed');
  const totalAmount = completedRefunds.reduce((sum, r) => sum + r.refundAmount, 0);
  
  const byReason: Record<string, number> = {};
  const byStatus: Record<RefundStatus, number> = {
    pending: 0,
    approved: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    rejected: 0,
  };
  
  for (const refund of refunds) {
    byReason[refund.reason] = (byReason[refund.reason] || 0) + 1;
    byStatus[refund.status]++;
  }
  
  return {
    totalRefunds: refunds.length,
    totalAmount,
    averageAmount: completedRefunds.length > 0 
      ? Math.round(totalAmount / completedRefunds.length) 
      : 0,
    byReason,
    byStatus,
  };
};

/**
 * Check if a payment can be refunded
 */
export const canPaymentBeRefunded = async (
  paymentId: string,
  policy: RefundPolicy
): Promise<{ canRefund: boolean; reason?: string; maxAmount?: number }> => {
  const paymentRef = doc(db, PAYMENTS_COLLECTION, paymentId);
  const paymentSnap = await getDoc(paymentRef);
  
  if (!paymentSnap.exists()) {
    return { canRefund: false, reason: 'Payment not found' };
  }
  
  const payment = { id: paymentSnap.id, ...paymentSnap.data() } as Payment;
  
  // Check if refunds are enabled
  if (!policy.enabled) {
    return { canRefund: false, reason: 'Refunds are not enabled' };
  }
  
  // Check payment status
  if (payment.status !== 'succeeded' && payment.status !== 'partially_refunded') {
    return { canRefund: false, reason: `Payment status: ${payment.status}` };
  }
  
  // Check refund window
  const daysSincePayment = Math.floor(
    (Date.now() - payment.createdAt) / (1000 * 60 * 60 * 24)
  );
  
  if (daysSincePayment > policy.maxDaysAfterPayment) {
    return { canRefund: false, reason: 'Refund window expired' };
  }
  
  // Calculate max refundable
  const maxAmount = payment.amount - (payment.refundedAmount || 0);
  
  if (maxAmount <= 0) {
    return { canRefund: false, reason: 'Already fully refunded' };
  }
  
  return { canRefund: true, maxAmount };
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get refund status label
 */
export const getRefundStatusLabel = (status: RefundStatus): string => {
  const labels: Record<RefundStatus, string> = {
    pending: 'Pending Approval',
    approved: 'Approved',
    processing: 'Processing',
    completed: 'Completed',
    failed: 'Failed',
    rejected: 'Rejected',
  };
  return labels[status] || status;
};

/**
 * Get refund status color
 */
export const getRefundStatusColor = (status: RefundStatus): string => {
  const colors: Record<RefundStatus, string> = {
    pending: 'yellow',
    approved: 'blue',
    processing: 'blue',
    completed: 'green',
    failed: 'red',
    rejected: 'gray',
  };
  return colors[status] || 'gray';
};

/**
 * Get refund reason label
 */
export const getRefundReasonLabel = (reason: RefundReason): string => {
  const labels: Record<RefundReason, string> = {
    customer_request: 'Customer Request',
    duplicate_payment: 'Duplicate Payment',
    booking_cancelled: 'Booking Cancelled',
    event_cancelled: 'Event Cancelled',
    service_issue: 'Service Issue',
    pricing_error: 'Pricing Error',
    fraudulent: 'Fraudulent',
    other: 'Other',
  };
  return labels[reason] || reason;
};

/**
 * Format refund amount
 */
export const formatRefundAmount = (
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

/**
 * Create default refund policy
 */
export const createDefaultRefundPolicy = (): RefundPolicy => ({
  enabled: true,
  maxDaysAfterPayment: MAX_REFUND_WINDOW_DAYS,
  allowPartialRefunds: true,
  minRefundAmount: MIN_REFUND_AMOUNT,
  requiresApproval: true,
  autoApproveThreshold: 5000, // $50 auto-approve
  cancellationFeePercent: 0,
  refundPlatformFees: true,
  typeRules: {
    court_booking: {
      maxDaysAfterPayment: 7,
      cancellationFeePercent: 0,
    },
    tournament: {
      maxDaysAfterPayment: 14,
      cancellationFeePercent: 10,
    },
    league: {
      maxDaysAfterPayment: 14,
      cancellationFeePercent: 10,
    },
    annual_pass: {
      maxDaysAfterPayment: 30,
      cancellationFeePercent: 20,
    },
  },
});

/**
 * Check if refund is within processing time
 */
export const isRefundProcessingDelayed = (refund: Refund): boolean => {
  if (refund.status !== 'processing') {
    return false;
  }
  
  // Consider delayed if processing for more than 24 hours
  const processingTime = Date.now() - refund.createdAt;
  const twentyFourHours = 24 * 60 * 60 * 1000;
  
  return processingTime > twentyFourHours;
};

/**
 * Estimate refund completion time
 */
export const estimateRefundCompletionTime = (
  method: RefundMethod
): string => {
  switch (method) {
    case 'wallet':
      return 'Instant';
    case 'original':
    case 'card':
      return '5-10 business days';
    case 'bank_transfer':
      return '3-5 business days';
    default:
      return 'Unknown';
  }
};
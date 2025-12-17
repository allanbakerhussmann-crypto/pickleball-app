/**
 * usePayment Hook
 * 
 * React hook for payment processing including:
 * - Payment intent creation
 * - Payment status tracking
 * - Stripe integration
 * - Payment history
 * 
 * FILE LOCATION: hooks/payments/usePayment.ts
 */

import { useState, useCallback } from 'react';
import {
  createPendingPayment,
  getPayment,
  getUserPayments,
  getClubPayments,
  updatePaymentStatus,
  buildPaymentIntentMetadata,
  validatePaymentAmount,
  calculateApplicationFee,
  getPaymentStatusText,
  getPaymentStatusColor,
  formatPaymentAmount,
  type Payment,
  type PaymentStatus,
  type CreatePaymentIntentParams,
  type SupportedCurrency,
  type ReferenceType,
  type TransactionBreakdown,
} from '../../services/firebase/payments';

// ============================================
// TYPES
// ============================================

export interface PaymentInput {
  amount: number;
  currency: SupportedCurrency;
  referenceType: ReferenceType;
  referenceId: string;
  referenceName: string;
  breakdown: TransactionBreakdown;
  clubId?: string;
  tournamentId?: string;
  leagueId?: string;
  metadata?: Record<string, string>;
}

export interface UsePaymentOptions {
  /** User ID */
  userId: string;
  /** Default currency */
  currency?: SupportedCurrency;
  /** Callback on payment success */
  onSuccess?: (payment: Payment) => void;
  /** Callback on payment failure */
  onError?: (error: Error) => void;
}

export interface UsePaymentReturn {
  // State
  payment: Payment | null;
  payments: Payment[];
  loading: boolean;
  processing: boolean;
  error: Error | null;
  
  // Payment status
  status: PaymentStatus | null;
  statusText: string;
  statusColor: string;
  
  // Actions
  initiatePayment: (input: PaymentInput) => Promise<Payment>;
  getPaymentById: (paymentId: string) => Promise<Payment | null>;
  fetchUserPayments: (limit?: number) => Promise<void>;
  fetchClubPayments: (clubId: string, limit?: number) => Promise<void>;
  resetPayment: () => void;
  
  // Helpers
  validateAmount: (amount: number, currency?: SupportedCurrency) => { valid: boolean; error?: string };
  calculateFee: (amount: number, feePercent?: number) => number;
  formatAmount: (amount: number, currency?: SupportedCurrency) => string;
}

// ============================================
// HOOK IMPLEMENTATION
// ============================================

export const usePayment = (options: UsePaymentOptions): UsePaymentReturn => {
  const {
    userId,
    currency = 'nzd',
    onSuccess,
    onError,
  } = options;

  // State
  const [payment, setPayment] = useState<Payment | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Computed status
  const status = payment?.status ?? null;
  const statusText = status ? getPaymentStatusText(status) : '';
  const statusColor = status ? getPaymentStatusColor(status) : 'gray';

  // Initiate a new payment
  const initiatePayment = useCallback(async (input: PaymentInput): Promise<Payment> => {
    if (!userId) {
      throw new Error('User ID is required');
    }

    try {
      setProcessing(true);
      setError(null);

      // Validate amount
      const validation = validatePaymentAmount(input.amount, input.currency);
      if (!validation.valid) {
        throw new Error(validation.error);
      }

      // Create payment intent params
      const params: CreatePaymentIntentParams = {
        amount: input.amount,
        currency: input.currency,
        userId,
        clubId: input.clubId,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        referenceName: input.referenceName,
        breakdown: input.breakdown,
        tournamentId: input.tournamentId,
        leagueId: input.leagueId,
        metadata: input.metadata,
      };

      // Create pending payment record
      const newPayment = await createPendingPayment(params);
      setPayment(newPayment);

      // Note: At this point, the caller should use Stripe.js to complete the payment
      // The payment will be updated via webhooks

      onSuccess?.(newPayment);
      return newPayment;

    } catch (err) {
      const error = err instanceof Error ? err : new Error('Payment failed');
      setError(error);
      onError?.(error);
      throw error;
    } finally {
      setProcessing(false);
    }
  }, [userId, onSuccess, onError]);

  // Get a payment by ID
  const getPaymentById = useCallback(async (paymentId: string): Promise<Payment | null> => {
    try {
      setLoading(true);
      const p = await getPayment(paymentId);
      if (p) {
        setPayment(p);
      }
      return p;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to get payment'));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch user's payments
  const fetchUserPayments = useCallback(async (limit: number = 20) => {
    if (!userId) return;

    try {
      setLoading(true);
      const userPayments = await getUserPayments(userId, limit);
      setPayments(userPayments);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch payments'));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Fetch club's payments
  const fetchClubPayments = useCallback(async (clubId: string, limit: number = 50) => {
    try {
      setLoading(true);
      const clubPayments = await getClubPayments(clubId, limit);
      setPayments(clubPayments);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch club payments'));
    } finally {
      setLoading(false);
    }
  }, []);

  // Reset payment state
  const resetPayment = useCallback(() => {
    setPayment(null);
    setError(null);
    setProcessing(false);
  }, []);

  // Validate amount helper
  const validateAmount = useCallback((amount: number, curr?: SupportedCurrency) => {
    return validatePaymentAmount(amount, curr || currency);
  }, [currency]);

  // Calculate fee helper
  const calculateFee = useCallback((amount: number, feePercent: number = 1.5) => {
    return calculateApplicationFee(amount, feePercent);
  }, []);

  // Format amount helper
  const formatAmount = useCallback((amount: number, curr?: SupportedCurrency) => {
    return formatPaymentAmount(amount, curr || currency);
  }, [currency]);

  return {
    // State
    payment,
    payments,
    loading,
    processing,
    error,
    
    // Status
    status,
    statusText,
    statusColor,
    
    // Actions
    initiatePayment,
    getPaymentById,
    fetchUserPayments,
    fetchClubPayments,
    resetPayment,
    
    // Helpers
    validateAmount,
    calculateFee,
    formatAmount,
  };
};

export default usePayment;
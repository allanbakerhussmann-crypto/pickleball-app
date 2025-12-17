/**
 * useRefund Hook
 * 
 * React hook for refund management including:
 * - Refund requests
 * - Refund approval workflow
 * - Refund status tracking
 * - Refund history
 * 
 * FILE LOCATION: hooks/payments/useRefund.ts
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getRefund,
  getRefundsForPayment,
  getUserRefunds,
  getClubRefunds,
  getPendingRefunds,
  subscribeToUserRefunds,
  subscribeToPendingRefunds,
  createRefundRequest,
  processRefundApproval,
  validateRefundRequest,
  calculateRefundAmounts,
  canPaymentBeRefunded,
  createDefaultRefundPolicy,
  getRefundStatusLabel,
  getRefundStatusColor,
  getRefundReasonLabel,
  formatRefundAmount,
  estimateRefundCompletionTime,
  type Refund,
  type RefundStatus,
  type RefundPolicy,
  type RefundRequest,
  type RefundApproval,
  type RefundCalculation,
  type RefundReason,
  type Payment,
  type SupportedCurrency,
} from '../../services/firebase/payments';

// ============================================
// TYPES
// ============================================

export interface UseRefundOptions {
  /** User ID */
  userId?: string;
  /** Club ID (for admin/club view) */
  clubId?: string;
  /** Payment ID (for payment-specific refunds) */
  paymentId?: string;
  /** Refund policy to use */
  policy?: RefundPolicy;
  /** Enable real-time updates */
  realtime?: boolean;
}

export interface UseRefundReturn {
  // State
  refund: Refund | null;
  refunds: Refund[];
  pendingRefunds: Refund[];
  loading: boolean;
  error: Error | null;
  
  // Computed
  statusLabel: string;
  statusColor: string;
  
  // Actions
  refetch: () => Promise<void>;
  requestRefund: (request: RefundRequest) => Promise<Refund>;
  approveRefund: (refundId: string, notes?: string) => Promise<Refund>;
  rejectRefund: (refundId: string, notes?: string) => Promise<Refund>;
  calculateRefund: (payment: Payment, amount?: number) => RefundCalculation;
  checkCanRefund: (paymentId: string) => Promise<{ canRefund: boolean; reason?: string; maxAmount?: number }>;
  getRefundById: (refundId: string) => Promise<Refund | null>;
  
  // Helpers
  formatAmount: (amount: number, currency: SupportedCurrency) => string;
  getStatusLabel: (status: RefundStatus) => string;
  getStatusColor: (status: RefundStatus) => string;
  getReasonLabel: (reason: RefundReason) => string;
  getEstimatedTime: (method: string) => string;
}

// ============================================
// HOOK IMPLEMENTATION
// ============================================

export const useRefund = (options: UseRefundOptions = {}): UseRefundReturn => {
  const {
    userId,
    clubId,
    paymentId,
    policy = createDefaultRefundPolicy(),
    realtime = true,
  } = options;

  // State
  const [refund, setRefund] = useState<Refund | null>(null);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [pendingRefunds, setPendingRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Computed
  const statusLabel = refund ? getRefundStatusLabel(refund.status) : '';
  const statusColor = refund ? getRefundStatusColor(refund.status) : 'gray';

  // Fetch refunds
  const fetchRefunds = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      if (paymentId) {
        const paymentRefunds = await getRefundsForPayment(paymentId);
        setRefunds(paymentRefunds);
        if (paymentRefunds.length > 0) {
          setRefund(paymentRefunds[0]);
        }
      } else if (clubId) {
        const clubRefunds = await getClubRefunds(clubId);
        setRefunds(clubRefunds);
        
        const pending = await getPendingRefunds(clubId);
        setPendingRefunds(pending);
      } else if (userId) {
        const userRefunds = await getUserRefunds(userId);
        setRefunds(userRefunds);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch refunds'));
    } finally {
      setLoading(false);
    }
  }, [userId, clubId, paymentId]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!realtime) {
      fetchRefunds();
      return;
    }

    if (!userId && !clubId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const unsubscribers: Array<() => void> = [];

    if (userId) {
      unsubscribers.push(
        subscribeToUserRefunds(userId, (updatedRefunds) => {
          setRefunds(updatedRefunds);
          setLoading(false);
        })
      );
    }

    if (clubId) {
      unsubscribers.push(
        subscribeToPendingRefunds(clubId, (pending) => {
          setPendingRefunds(pending);
        })
      );
    }

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [userId, clubId, realtime, fetchRefunds]);

  // Actions
  const refetch = useCallback(async () => {
    await fetchRefunds();
  }, [fetchRefunds]);

  const requestRefund = useCallback(async (request: RefundRequest): Promise<Refund> => {
    try {
      setLoading(true);
      setError(null);

      const newRefund = await createRefundRequest(request, policy);
      setRefund(newRefund);
      
      // Update refunds list
      setRefunds(prev => [newRefund, ...prev]);
      
      return newRefund;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to create refund request');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [policy]);

  const approveRefund = useCallback(async (
    refundId: string,
    notes?: string
  ): Promise<Refund> => {
    if (!userId) {
      throw new Error('User ID required for approval');
    }

    try {
      setLoading(true);
      setError(null);

      const approval: RefundApproval = {
        refundId,
        approved: true,
        approvedBy: userId,
        approvalNotes: notes,
      };

      const approvedRefund = await processRefundApproval(approval);
      setRefund(approvedRefund);

      // Update lists
      setRefunds(prev => prev.map(r => r.id === refundId ? approvedRefund : r));
      setPendingRefunds(prev => prev.filter(r => r.id !== refundId));

      return approvedRefund;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to approve refund');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const rejectRefund = useCallback(async (
    refundId: string,
    notes?: string
  ): Promise<Refund> => {
    if (!userId) {
      throw new Error('User ID required for rejection');
    }

    try {
      setLoading(true);
      setError(null);

      const approval: RefundApproval = {
        refundId,
        approved: false,
        approvedBy: userId,
        approvalNotes: notes,
      };

      const rejectedRefund = await processRefundApproval(approval);
      setRefund(rejectedRefund);

      // Update lists
      setRefunds(prev => prev.map(r => r.id === refundId ? rejectedRefund : r));
      setPendingRefunds(prev => prev.filter(r => r.id !== refundId));

      return rejectedRefund;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to reject refund');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const calculateRefund = useCallback((
    payment: Payment,
    amount?: number
  ): RefundCalculation => {
    return calculateRefundAmounts(payment, amount, policy);
  }, [policy]);

  const checkCanRefund = useCallback(async (
    paymentId: string
  ): Promise<{ canRefund: boolean; reason?: string; maxAmount?: number }> => {
    return canPaymentBeRefunded(paymentId, policy);
  }, [policy]);

  const getRefundById = useCallback(async (refundId: string): Promise<Refund | null> => {
    try {
      const r = await getRefund(refundId);
      if (r) {
        setRefund(r);
      }
      return r;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to get refund'));
      return null;
    }
  }, []);

  // Helper functions
  const formatAmount = useCallback((amount: number, currency: SupportedCurrency): string => {
    return formatRefundAmount(amount, currency);
  }, []);

  const getStatusLabelFn = useCallback((status: RefundStatus): string => {
    return getRefundStatusLabel(status);
  }, []);

  const getStatusColorFn = useCallback((status: RefundStatus): string => {
    return getRefundStatusColor(status);
  }, []);

  const getReasonLabelFn = useCallback((reason: RefundReason): string => {
    return getRefundReasonLabel(reason);
  }, []);

  const getEstimatedTime = useCallback((method: string): string => {
    return estimateRefundCompletionTime(method as any);
  }, []);

  return {
    // State
    refund,
    refunds,
    pendingRefunds,
    loading,
    error,
    
    // Computed
    statusLabel,
    statusColor,
    
    // Actions
    refetch,
    requestRefund,
    approveRefund,
    rejectRefund,
    calculateRefund,
    checkCanRefund,
    getRefundById,
    
    // Helpers
    formatAmount,
    getStatusLabel: getStatusLabelFn,
    getStatusColor: getStatusColorFn,
    getReasonLabel: getReasonLabelFn,
    getEstimatedTime,
  };
};

export default useRefund;
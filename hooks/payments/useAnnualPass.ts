/**
 * useAnnualPass Hook
 * 
 * React hook for annual pass management including:
 * - Pass purchase and renewal
 * - Pass validation for bookings
 * - Usage tracking
 * - Real-time updates
 * 
 * FILE LOCATION: hooks/payments/useAnnualPass.ts
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getAnnualPass,
  getActivePassForUserAndClub,
  getUserPasses,
  subscribeToUserPasses,
  subscribeToPass,
  createAnnualPass,
  renewPass,
  validatePassForBooking,
  recordPassUsage,
  getPassUsageStats,
  getDaysRemaining,
  isPassActiveAndValid,
  isPassEligibleForRenewal,
  getPassStatusLabel,
  getPassStatusColor,
  formatSavings,
  calculatePassValue,
  type AnnualPass,
  type AnnualPassStatus,
  type AnnualPassConfig,
  type PassValidationResult,
  type PassUsageStats,
  type PurchaseAnnualPassInput,
  type SupportedCurrency,
} from '../../services/firebase/payments';

// ============================================
// TYPES
// ============================================

export interface UseAnnualPassOptions {
  /** User ID */
  userId: string;
  /** Club ID (optional - for club-specific pass) */
  clubId?: string;
  /** Specific pass ID to load */
  passId?: string;
  /** Enable real-time updates */
  realtime?: boolean;
}

export interface UseAnnualPassReturn {
  // State
  pass: AnnualPass | null;
  passes: AnnualPass[];
  loading: boolean;
  error: Error | null;
  
  // Computed
  isActive: boolean;
  daysRemaining: number;
  canRenew: boolean;
  statusLabel: string;
  statusColor: string;
  usageStats: PassUsageStats | null;
  passValue: { roi: number; valueRating: string } | null;
  
  // Actions
  refetch: () => Promise<void>;
  purchasePass: (input: PurchaseAnnualPassInput, transactionId?: string) => Promise<AnnualPass>;
  renewCurrentPass: (renewalPrice: number, transactionId?: string) => Promise<AnnualPass>;
  validateForBooking: (bookingDate: string, isPeakTime?: boolean, config?: AnnualPassConfig) => Promise<PassValidationResult>;
  recordUsage: (bookingId: string, bookingDate: string, courtId: string, courtName: string, startTime: string, endTime: string, amountSaved: number) => Promise<void>;
  loadUsageStats: () => Promise<void>;
  
  // Helpers
  formatSavingsAmount: (amount: number) => string;
}

// ============================================
// HOOK IMPLEMENTATION
// ============================================

export const useAnnualPass = (options: UseAnnualPassOptions): UseAnnualPassReturn => {
  const {
    userId,
    clubId,
    passId,
    realtime = true,
  } = options;

  // State
  const [pass, setPass] = useState<AnnualPass | null>(null);
  const [passes, setPasses] = useState<AnnualPass[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [usageStats, setUsageStats] = useState<PassUsageStats | null>(null);

  // Fetch pass(es)
  const fetchPass = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      if (passId) {
        // Load specific pass
        const p = await getAnnualPass(passId);
        setPass(p);
      } else if (clubId) {
        // Load active pass for user+club
        const p = await getActivePassForUserAndClub(userId, clubId);
        setPass(p);
      }

      // Load all user passes
      const allPasses = await getUserPasses(userId, true);
      setPasses(allPasses);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch pass'));
    } finally {
      setLoading(false);
    }
  }, [userId, clubId, passId]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!userId || !realtime) {
      fetchPass();
      return;
    }

    setLoading(true);

    // Subscribe to user's passes
    const unsubscribe = subscribeToUserPasses(userId, (updatedPasses) => {
      setPasses(updatedPasses);

      // Find active pass for club
      if (clubId) {
        const activePass = updatedPasses.find(p => 
          p.odClubId === clubId && 
          p.status === 'active' &&
          isPassActiveAndValid(p)
        ) || null;
        setPass(activePass);
      } else if (passId) {
        const specificPass = updatedPasses.find(p => p.id === passId) || null;
        setPass(specificPass);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId, clubId, passId, realtime, fetchPass]);

  // Computed values
  const isActive = pass ? isPassActiveAndValid(pass) : false;
  const daysRemaining = pass ? getDaysRemaining(pass) : 0;
  const canRenew = pass ? isPassEligibleForRenewal(pass) : false;
  const statusLabel = pass ? getPassStatusLabel(pass.status) : '';
  const statusColor = pass ? getPassStatusColor(pass.status) : 'gray';
  const passValue = pass ? calculatePassValue(pass) : null;

  // Actions
  const refetch = useCallback(async () => {
    await fetchPass();
  }, [fetchPass]);

  const purchasePass = useCallback(async (
    input: PurchaseAnnualPassInput,
    transactionId?: string
  ): Promise<AnnualPass> => {
    try {
      setLoading(true);
      const newPass = await createAnnualPass(input, transactionId);
      setPass(newPass);
      return newPass;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to purchase pass');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  const renewCurrentPass = useCallback(async (
    renewalPrice: number,
    transactionId?: string
  ): Promise<AnnualPass> => {
    if (!pass) {
      throw new Error('No pass to renew');
    }

    try {
      setLoading(true);
      const renewedPass = await renewPass(pass.id, renewalPrice, transactionId);
      setPass(renewedPass);
      return renewedPass;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to renew pass');
      setError(error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [pass]);

  const validateForBooking = useCallback(async (
    bookingDate: string,
    isPeakTime: boolean = false,
    config?: AnnualPassConfig
  ): Promise<PassValidationResult> => {
    if (!userId || !clubId) {
      return { valid: false, error: 'User ID and Club ID required', errorCode: 'NO_PASS' };
    }

    return validatePassForBooking(userId, clubId, bookingDate, isPeakTime, config);
  }, [userId, clubId]);

  const recordUsageAction = useCallback(async (
    bookingId: string,
    bookingDate: string,
    courtId: string,
    courtName: string,
    startTime: string,
    endTime: string,
    amountSaved: number
  ): Promise<void> => {
    if (!pass) {
      throw new Error('No active pass');
    }

    await recordPassUsage(
      pass.id,
      bookingId,
      bookingDate,
      courtId,
      courtName,
      startTime,
      endTime,
      amountSaved
    );
  }, [pass]);

  const loadUsageStats = useCallback(async (): Promise<void> => {
    if (!pass) return;

    try {
      const stats = await getPassUsageStats(pass.id);
      setUsageStats(stats);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load usage stats'));
    }
  }, [pass]);

  const formatSavingsAmount = useCallback((amount: number): string => {
    return formatSavings(amount, pass?.currency || 'nzd');
  }, [pass]);

  return {
    // State
    pass,
    passes,
    loading,
    error,
    
    // Computed
    isActive,
    daysRemaining,
    canRenew,
    statusLabel,
    statusColor,
    usageStats,
    passValue,
    
    // Actions
    refetch,
    purchasePass,
    renewCurrentPass,
    validateForBooking,
    recordUsage: recordUsageAction,
    loadUsageStats,
    
    // Helpers
    formatSavingsAmount,
  };
};

export default useAnnualPass;
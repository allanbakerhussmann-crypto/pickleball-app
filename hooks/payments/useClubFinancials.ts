/**
 * useClubFinancials Hook
 * 
 * React hook for club financial management including:
 * - Revenue tracking
 * - Financial summaries
 * - Payout management
 * - Real-time updates
 * 
 * FILE LOCATION: hooks/payments/useClubFinancials.ts
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getClubAccount,
  getOrCreateClubAccount,
  subscribeToClubAccount,
  getClubTotalRevenue,
  getClubNetRevenue,
  getClubPendingPayout,
  getClubMonthlyRevenue,
  getClubRevenueBySource,
  getClubRevenueTrend,
  getClubPaymentMethodBreakdown,
  getClubFinancialSummary,
  updateClubPayoutSettings,
  getClubPayoutSettings,
  formatRevenueAmount,
  getRevenueSourceLabel,
  getPaymentMethodLabel,
  type ClubAccount,
  type ClubFinancialSummary,
  type RevenueBySource,
  type PaymentMethodBreakdown,
  type PayoutSettings,
  type SupportedCurrency,
} from '../../services/firebase/accounting';

// ============================================
// TYPES
// ============================================

export interface UseClubFinancialsOptions {
  /** Club ID */
  clubId: string;
  /** Club name (for summaries) */
  clubName?: string;
  /** Default currency */
  currency?: SupportedCurrency;
  /** Enable real-time updates */
  realtime?: boolean;
}

export interface RevenueTrend {
  month: string;
  amount: number;
  formattedAmount: string;
}

export interface UseClubFinancialsReturn {
  // State
  account: ClubAccount | null;
  loading: boolean;
  error: Error | null;
  
  // Revenue
  totalRevenue: number;
  netRevenue: number;
  pendingPayout: number;
  revenueBySource: RevenueBySource | null;
  paymentMethodBreakdown: PaymentMethodBreakdown | null;
  revenueTrend: RevenueTrend[];
  
  // Summary
  summary: ClubFinancialSummary | null;
  
  // Actions
  refetch: () => Promise<void>;
  loadSummary: (startDate: number, endDate: number) => Promise<void>;
  loadRevenueTrend: (months?: number) => Promise<void>;
  getMonthlyRevenue: (year: number, month: number) => Promise<number>;
  updatePayoutSettings: (settings: Partial<PayoutSettings>) => Promise<void>;
  
  // Helpers
  formatRevenue: (amount: number) => string;
  getSourceLabel: (source: string) => string;
  getMethodLabel: (method: string) => string;
}

// ============================================
// HOOK IMPLEMENTATION
// ============================================

export const useClubFinancials = (options: UseClubFinancialsOptions): UseClubFinancialsReturn => {
  const {
    clubId,
    clubName = 'Club',
    currency = 'nzd',
    realtime = true,
  } = options;

  // State
  const [account, setAccount] = useState<ClubAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [summary, setSummary] = useState<ClubFinancialSummary | null>(null);
  const [revenueTrend, setRevenueTrend] = useState<RevenueTrend[]>([]);

  // Computed values
  const totalRevenue = account?.totalRevenue ?? 0;
  const netRevenue = account?.netRevenue ?? 0;
  const pendingPayout = account?.pendingPayout ?? 0;
  const revenueBySource = account?.revenueBySource ?? null;
  const paymentMethodBreakdown = account?.paymentMethodBreakdown ?? null;

  // Fetch account
  const fetchAccount = useCallback(async () => {
    if (!clubId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const clubAccount = await getOrCreateClubAccount(clubId, currency);
      setAccount(clubAccount);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch club account'));
    } finally {
      setLoading(false);
    }
  }, [clubId, currency]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!clubId || !realtime) {
      fetchAccount();
      return;
    }

    setLoading(true);

    const unsubscribe = subscribeToClubAccount(clubId, (updatedAccount) => {
      setAccount(updatedAccount);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [clubId, realtime, fetchAccount]);

  // Actions
  const refetch = useCallback(async () => {
    await fetchAccount();
  }, [fetchAccount]);

  const loadSummary = useCallback(async (startDate: number, endDate: number) => {
    if (!clubId) return;

    try {
      const financialSummary = await getClubFinancialSummary(
        clubId,
        clubName,
        { start: startDate, end: endDate }
      );
      setSummary(financialSummary);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load summary'));
    }
  }, [clubId, clubName]);

  const loadRevenueTrend = useCallback(async (months: number = 6) => {
    if (!clubId) return;

    try {
      const trend = await getClubRevenueTrend(clubId, months);
      const formattedTrend: RevenueTrend[] = trend.map(t => ({
        month: t.month,
        amount: t.amount,
        formattedAmount: formatRevenueAmount(t.amount, currency),
      }));
      setRevenueTrend(formattedTrend);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load revenue trend'));
    }
  }, [clubId, currency]);

  const getMonthlyRevenue = useCallback(async (year: number, month: number): Promise<number> => {
    if (!clubId) return 0;
    return getClubMonthlyRevenue(clubId, year, month);
  }, [clubId]);

  const updatePayoutSettingsAction = useCallback(async (settings: Partial<PayoutSettings>) => {
    if (!clubId) return;

    try {
      await updateClubPayoutSettings(clubId, settings);
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to update payout settings'));
      throw err;
    }
  }, [clubId, refetch]);

  // Helpers
  const formatRevenue = useCallback((amount: number): string => {
    return formatRevenueAmount(amount, currency);
  }, [currency]);

  const getSourceLabel = useCallback((source: string): string => {
    return getRevenueSourceLabel(source as any);
  }, []);

  const getMethodLabel = useCallback((method: string): string => {
    return getPaymentMethodLabel(method as any);
  }, []);

  return {
    // State
    account,
    loading,
    error,
    
    // Revenue
    totalRevenue,
    netRevenue,
    pendingPayout,
    revenueBySource,
    paymentMethodBreakdown,
    revenueTrend,
    
    // Summary
    summary,
    
    // Actions
    refetch,
    loadSummary,
    loadRevenueTrend,
    getMonthlyRevenue,
    updatePayoutSettings: updatePayoutSettingsAction,
    
    // Helpers
    formatRevenue,
    getSourceLabel,
    getMethodLabel,
  };
};

export default useClubFinancials;
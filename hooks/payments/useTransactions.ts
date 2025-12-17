/**
 * useTransactions Hook
 * 
 * React hook for transaction management including:
 * - Transaction history
 * - Filtering and pagination
 * - Real-time updates
 * - Transaction summaries
 * 
 * FILE LOCATION: hooks/payments/useTransactions.ts
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getTransaction,
  getUserTransactionHistory,
  getUserClubTransactionHistory,
  getClubTransactionHistory,
  getWalletTransactionHistory,
  subscribeToUserTransactions,
  subscribeToWalletTransactions,
  calculateTransactionTotal,
  groupTransactionsByType,
  groupTransactionsByMonth,
  getUserSpendingByCategory,
  type Transaction,
  type TransactionType,
  type TransactionStatus,
  type ReferenceType,
  formatCurrency,
} from '../../services/firebase/payments';

// ============================================
// TYPES
// ============================================

export interface TransactionFilters {
  type?: TransactionType;
  status?: TransactionStatus;
  referenceType?: ReferenceType;
  startDate?: Date;
  endDate?: Date;
  minAmount?: number;
  maxAmount?: number;
}

export interface UseTransactionsOptions {
  /** User ID */
  userId?: string;
  /** Club ID (for club-specific transactions) */
  clubId?: string;
  /** Wallet ID (for wallet-specific transactions) */
  walletId?: string;
  /** Initial filters */
  filters?: TransactionFilters;
  /** Number of transactions to load */
  limit?: number;
  /** Enable real-time updates */
  realtime?: boolean;
}

export interface TransactionSummary {
  totalCount: number;
  totalAmount: number;
  byType: Record<string, number>;
  byMonth: Record<string, number>;
  byCategory: Record<string, number>;
}

export interface UseTransactionsReturn {
  // State
  transactions: Transaction[];
  loading: boolean;
  error: Error | null;
  hasMore: boolean;
  
  // Summary
  summary: TransactionSummary;
  
  // Actions
  refetch: () => Promise<void>;
  loadMore: () => Promise<void>;
  setFilters: (filters: TransactionFilters) => void;
  clearFilters: () => void;
  getTransaction: (id: string) => Promise<Transaction | null>;
}

// ============================================
// HOOK IMPLEMENTATION
// ============================================

export const useTransactions = (options: UseTransactionsOptions): UseTransactionsReturn => {
  const {
    userId,
    clubId,
    walletId,
    filters: initialFilters,
    limit = 20,
    realtime = true,
  } = options;

  // State
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [filters, setFiltersState] = useState<TransactionFilters>(initialFilters || {});
  const [hasMore, setHasMore] = useState(true);

  // Apply filters to transactions
  const applyFilters = useCallback((txs: Transaction[]): Transaction[] => {
    return txs.filter(tx => {
      if (filters.type && tx.type !== filters.type) return false;
      if (filters.status && tx.status !== filters.status) return false;
      if (filters.referenceType && tx.referenceType !== filters.referenceType) return false;
      
      if (filters.startDate && tx.createdAt < filters.startDate.getTime()) return false;
      if (filters.endDate && tx.createdAt > filters.endDate.getTime()) return false;
      
      if (filters.minAmount && Math.abs(tx.amount) < filters.minAmount) return false;
      if (filters.maxAmount && Math.abs(tx.amount) > filters.maxAmount) return false;
      
      return true;
    });
  }, [filters]);

  // Fetch transactions
  const fetchTransactions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      let txs: Transaction[] = [];

      if (walletId) {
        txs = await getWalletTransactionHistory(walletId, limit);
      } else if (userId && clubId) {
        txs = await getUserClubTransactionHistory(userId, clubId, limit);
      } else if (clubId) {
        txs = await getClubTransactionHistory(clubId, limit);
      } else if (userId) {
        txs = await getUserTransactionHistory(userId, limit);
      }

      const filtered = applyFilters(txs);
      setTransactions(filtered);
      setHasMore(txs.length >= limit);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch transactions'));
    } finally {
      setLoading(false);
    }
  }, [userId, clubId, walletId, limit, applyFilters]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!realtime) {
      fetchTransactions();
      return;
    }

    if (!userId && !walletId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    let unsubscribe: () => void;

    if (walletId) {
      unsubscribe = subscribeToWalletTransactions(walletId, (txs) => {
        const filtered = applyFilters(txs);
        setTransactions(filtered);
        setLoading(false);
      });
    } else if (userId) {
      unsubscribe = subscribeToUserTransactions(userId, (txs) => {
        let filtered = txs;
        if (clubId) {
          filtered = txs.filter(tx => tx.odClubId === clubId);
        }
        filtered = applyFilters(filtered);
        setTransactions(filtered);
        setLoading(false);
      });
    } else {
      setLoading(false);
      return;
    }

    return () => unsubscribe?.();
  }, [userId, clubId, walletId, realtime, applyFilters, fetchTransactions]);

  // Re-fetch when filters change (for non-realtime mode)
  useEffect(() => {
    if (!realtime) {
      fetchTransactions();
    }
  }, [filters, realtime, fetchTransactions]);

  // Calculate summary
  const summary = useMemo((): TransactionSummary => {
    const completedTxs = transactions.filter(tx => tx.status === 'completed');
    
    return {
      totalCount: transactions.length,
      totalAmount: calculateTransactionTotal(completedTxs),
      byType: groupTransactionsByType(completedTxs),
      byMonth: groupTransactionsByMonth(completedTxs),
      byCategory: completedTxs.reduce((acc, tx) => {
        acc[tx.referenceType] = (acc[tx.referenceType] || 0) + Math.abs(tx.amount);
        return acc;
      }, {} as Record<string, number>),
    };
  }, [transactions]);

  // Actions
  const refetch = useCallback(async () => {
    await fetchTransactions();
  }, [fetchTransactions]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loading) return;

    try {
      setLoading(true);
      
      // Get older transactions
      const oldestTx = transactions[transactions.length - 1];
      if (!oldestTx) return;

      let moreTxs: Transaction[] = [];
      
      if (walletId) {
        moreTxs = await getWalletTransactionHistory(walletId, limit);
      } else if (userId && clubId) {
        moreTxs = await getUserClubTransactionHistory(userId, clubId, limit);
      } else if (userId) {
        moreTxs = await getUserTransactionHistory(userId, limit);
      }

      // Filter out already loaded transactions
      const newTxs = moreTxs.filter(tx => 
        !transactions.some(existing => existing.id === tx.id)
      );

      const filtered = applyFilters(newTxs);
      setTransactions(prev => [...prev, ...filtered]);
      setHasMore(newTxs.length >= limit);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load more transactions'));
    } finally {
      setLoading(false);
    }
  }, [transactions, hasMore, loading, userId, clubId, walletId, limit, applyFilters]);

  const setFilters = useCallback((newFilters: TransactionFilters) => {
    setFiltersState(newFilters);
  }, []);

  const clearFilters = useCallback(() => {
    setFiltersState({});
  }, []);

  const getTransactionById = useCallback(async (id: string): Promise<Transaction | null> => {
    return getTransaction(id);
  }, []);

  return {
    // State
    transactions,
    loading,
    error,
    hasMore,
    
    // Summary
    summary,
    
    // Actions
    refetch,
    loadMore,
    setFilters,
    clearFilters,
    getTransaction: getTransactionById,
  };
};

export default useTransactions;
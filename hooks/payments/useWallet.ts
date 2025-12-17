/**
 * useWallet Hook
 * 
 * React hook for wallet management including:
 * - Wallet state and balance
 * - Top-up functionality
 * - Transaction history
 * - Real-time updates
 * 
 * FILE LOCATION: hooks/payments/useWallet.ts
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  getWallet,
  getWalletByUserAndClub,
  getOrCreateWallet,
  subscribeToWallet,
  subscribeToUserWallets,
  addToWallet,
  deductFromWallet,
  hasSufficientFunds,
  getTotalUserBalance,
  type Wallet,
  type SupportedCurrency,
  formatCurrency,
} from '../../services/firebase/payments';

// ============================================
// TYPES
// ============================================

export interface UseWalletOptions {
  /** User ID */
  userId: string;
  /** Club ID (optional - for club-specific wallet) */
  clubId?: string;
  /** Whether to auto-create wallet if not exists */
  autoCreate?: boolean;
  /** Currency for new wallet */
  currency?: SupportedCurrency;
  /** Enable real-time updates */
  realtime?: boolean;
}

export interface UseWalletReturn {
  // State
  wallet: Wallet | null;
  wallets: Wallet[];
  loading: boolean;
  error: Error | null;
  
  // Computed
  balance: number;
  formattedBalance: string;
  totalBalance: number;
  formattedTotalBalance: string;
  isActive: boolean;
  
  // Actions
  refetch: () => Promise<void>;
  topUp: (amount: number, transactionId?: string) => Promise<void>;
  deduct: (amount: number, referenceType: string, referenceId: string, referenceName: string) => Promise<void>;
  checkFunds: (amount: number) => Promise<boolean>;
  createWallet: () => Promise<Wallet>;
}

// ============================================
// HOOK IMPLEMENTATION
// ============================================

export const useWallet = (options: UseWalletOptions): UseWalletReturn => {
  const {
    userId,
    clubId,
    autoCreate = false,
    currency = 'nzd',
    realtime = true,
  } = options;

  // State
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Fetch wallet
  const fetchWallet = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      if (clubId) {
        // Get specific wallet for user+club
        let w = await getWalletByUserAndClub(userId, clubId);
        
        if (!w && autoCreate) {
          w = await getOrCreateWallet(userId, clubId, currency);
        }
        
        setWallet(w);
      } else {
        // Just set wallet to null if no clubId
        setWallet(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch wallet'));
    } finally {
      setLoading(false);
    }
  }, [userId, clubId, autoCreate, currency]);

  // Subscribe to wallet updates
  useEffect(() => {
    if (!userId || !realtime) {
      fetchWallet();
      return;
    }

    setLoading(true);

    // Subscribe to all user wallets
    const unsubscribe = subscribeToUserWallets(userId, (updatedWallets) => {
      setWallets(updatedWallets);
      
      // If clubId specified, find that specific wallet
      if (clubId) {
        const specificWallet = updatedWallets.find(w => w.odClubId === clubId) || null;
        setWallet(specificWallet);
      } else if (updatedWallets.length > 0) {
        // Use first wallet as default
        setWallet(updatedWallets[0]);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId, clubId, realtime, fetchWallet]);

  // Auto-create wallet if needed
  useEffect(() => {
    if (!loading && !wallet && autoCreate && userId && clubId) {
      getOrCreateWallet(userId, clubId, currency)
        .then(setWallet)
        .catch(err => setError(err instanceof Error ? err : new Error('Failed to create wallet')));
    }
  }, [loading, wallet, autoCreate, userId, clubId, currency]);

  // Computed values
  const balance = wallet?.balance ?? 0;
  const formattedBalance = formatCurrency(balance, wallet?.currency || currency);
  
  const totalBalance = useMemo(() => {
    return wallets.reduce((sum, w) => sum + w.balance, 0);
  }, [wallets]);
  
  const formattedTotalBalance = formatCurrency(totalBalance, currency);
  const isActive = wallet?.status === 'active';

  // Actions
  const refetch = useCallback(async () => {
    await fetchWallet();
  }, [fetchWallet]);

  const topUp = useCallback(async (amount: number, transactionId?: string) => {
    if (!wallet) {
      throw new Error('No wallet available');
    }
    
    await addToWallet(
      wallet.id,
      amount,
      'wallet_topup',
      transactionId || `topup_${Date.now()}`,
      'Wallet Top-up'
    );
  }, [wallet]);

  const deduct = useCallback(async (
    amount: number,
    referenceType: string,
    referenceId: string,
    referenceName: string
  ) => {
    if (!wallet) {
      throw new Error('No wallet available');
    }
    
    await deductFromWallet(
      wallet.id,
      amount,
      referenceType as any,
      referenceId,
      referenceName
    );
  }, [wallet]);

  const checkFunds = useCallback(async (amount: number): Promise<boolean> => {
    if (!wallet) {
      return false;
    }
    
    return hasSufficientFunds(wallet.id, amount);
  }, [wallet]);

  const createWalletAction = useCallback(async (): Promise<Wallet> => {
    if (!userId || !clubId) {
      throw new Error('User ID and Club ID required to create wallet');
    }
    
    const newWallet = await getOrCreateWallet(userId, clubId, currency);
    setWallet(newWallet);
    return newWallet;
  }, [userId, clubId, currency]);

  return {
    // State
    wallet,
    wallets,
    loading,
    error,
    
    // Computed
    balance,
    formattedBalance,
    totalBalance,
    formattedTotalBalance,
    isActive,
    
    // Actions
    refetch,
    topUp,
    deduct,
    checkFunds,
    createWallet: createWalletAction,
  };
};

export default useWallet;
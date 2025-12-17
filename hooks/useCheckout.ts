/**
 * useCheckout Hook
 * 
 * Manages checkout flow including:
 * - Creating pending reservations
 * - Countdown timer
 * - Payment processing (wallet/card)
 * - Confirmation
 * 
 * FILE LOCATION: hooks/useCheckout.ts
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  doc, 
  getDoc, 
  getDocs,
  updateDoc, 
  addDoc, 
  collection,
  query,
  where,
} from '@firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';
import type { 
  CheckoutItem, 
  CheckoutItemType, 
  CheckoutItemDetails,
  PaymentMethod,
  CreateCheckoutInput,
} from '../services/firebase/checkout';
import {
  createPendingCheckout,
  confirmCheckout,
  cancelCheckout,
  getCheckout,
  subscribeToCheckout,
  HOLD_TIMES,
} from '../services/firebase/checkout';
import type { PriceCalculation } from '../services/firebase/pricing';

// ============================================
// TYPES
// ============================================

export interface WalletData {
  id: string;
  odUserId: string;
  odClubId: string;
  balance: number;
  currency: string;
  status: string;
}

export interface AnnualPassData {
  id: string;
  odUserId: string;
  odClubId: string;
  status: string;
  benefit: 'unlimited' | 'discounted';
  discountPercent?: number;
  startDate: string;
  endDate: string;
}

export interface UseCheckoutOptions {
  clubId?: string;
  onSuccess?: (checkout: CheckoutItem) => void;
  onError?: (error: Error) => void;
  onExpire?: () => void;
}

export interface UseCheckoutReturn {
  // State
  checkout: CheckoutItem | null;
  wallet: WalletData | null;
  annualPass: AnnualPassData | null;
  loading: boolean;
  processing: boolean;
  error: string | null;
  
  // Timer
  timeRemaining: number;  // Seconds remaining
  isExpired: boolean;
  formattedTime: string;  // "4:32"
  
  // Payment
  selectedPaymentMethod: PaymentMethod | null;
  setSelectedPaymentMethod: (method: PaymentMethod) => void;
  canPayWithWallet: boolean;
  canPayWithAnnualPass: boolean;
  
  // Actions
  startCheckout: (input: StartCheckoutInput) => Promise<CheckoutItem | null>;
  completePayment: () => Promise<boolean>;
  cancelReservation: () => Promise<void>;
  
  // Helpers
  formatCurrency: (cents: number) => string;
  hasEnoughBalance: (amount: number) => boolean;
}

export interface StartCheckoutInput {
  type: CheckoutItemType;
  itemDetails: CheckoutItemDetails;
  pricing: PriceCalculation;
}

// ============================================
// HOOK
// ============================================

export const useCheckout = (options: UseCheckoutOptions = {}): UseCheckoutReturn => {
  const { clubId, onSuccess, onError, onExpire } = options;
  const { currentUser, userProfile } = useAuth();
  
  // State
  const [checkout, setCheckout] = useState<CheckoutItem | null>(null);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [annualPass, setAnnualPass] = useState<AnnualPassData | null>(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);
  
  // Timer
  const [timeRemaining, setTimeRemaining] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // ============================================
  // LOAD WALLET & ANNUAL PASS
  // ============================================
  
  useEffect(() => {
    if (!currentUser) return;
    
    const loadPaymentData = async () => {
      try {
        // UPDATED: Find ANY wallet for this user
        // First try club-specific wallet, then fall back to any wallet
        let foundWallet: WalletData | null = null;
        
        if (clubId) {
          // Try to find wallet for this specific club
          const clubWalletQuery = query(
            collection(db, 'wallets'),
            where('odUserId', '==', currentUser.uid),
            where('odClubId', '==', clubId)
          );
          const clubWalletSnap = await getDocs(clubWalletQuery);
          
          if (!clubWalletSnap.empty) {
            foundWallet = { id: clubWalletSnap.docs[0].id, ...clubWalletSnap.docs[0].data() } as WalletData;
          }
        }
        
        // If no club-specific wallet, find any wallet for this user
        if (!foundWallet) {
          const anyWalletQuery = query(
            collection(db, 'wallets'),
            where('odUserId', '==', currentUser.uid)
          );
          const anyWalletSnap = await getDocs(anyWalletQuery);
          
          if (!anyWalletSnap.empty) {
            // Use the first wallet found (or the one with highest balance)
            const wallets = anyWalletSnap.docs.map(d => ({ id: d.id, ...d.data() } as WalletData));
            foundWallet = wallets.reduce((best, current) => 
              current.balance > best.balance ? current : best
            , wallets[0]);
          }
        }
        
        if (foundWallet) {
          setWallet(foundWallet);
        }
        
        // Find annual pass for this club
        if (clubId) {
          const passQuery = query(
            collection(db, 'annualPasses'),
            where('odUserId', '==', currentUser.uid),
            where('odClubId', '==', clubId),
            where('status', '==', 'active')
          );
          const passSnap = await getDocs(passQuery);
          
          if (!passSnap.empty) {
            setAnnualPass({ id: passSnap.docs[0].id, ...passSnap.docs[0].data() } as AnnualPassData);
          }
        }
      } catch (err) {
        console.error('Failed to load payment data:', err);
      }
    };
    
    loadPaymentData();
  }, [currentUser, clubId]);
  
  // ============================================
  // TIMER
  // ============================================
  
  useEffect(() => {
    if (!checkout || checkout.status !== 'pending' || checkout.expiresAt === 0) {
      setTimeRemaining(0);
      return;
    }
    
    const updateTimer = () => {
      const remaining = Math.max(0, Math.floor((checkout.expiresAt - Date.now()) / 1000));
      setTimeRemaining(remaining);
      
      if (remaining === 0) {
        setCheckout(prev => prev ? { ...prev, status: 'expired' } : null);
        onExpire?.();
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }
    };
    
    updateTimer();
    timerRef.current = setInterval(updateTimer, 1000);
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [checkout, onExpire]);
  
  // ============================================
  // COMPUTED VALUES
  // ============================================
  
  const isExpired = checkout?.status === 'expired' || (checkout?.expiresAt ? Date.now() > checkout.expiresAt : false);
  
  const formattedTime = (() => {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  })();
  
  const canPayWithWallet = wallet !== null && wallet.balance >= (checkout?.pricing.finalPrice || 0);
  
  const canPayWithAnnualPass = annualPass !== null && checkout?.pricing.isFree === true;
  
  // ============================================
  // HELPERS
  // ============================================
  
  const formatCurrency = useCallback((cents: number): string => {
    return `NZ$${(cents / 100).toFixed(2)}`;
  }, []);
  
  const hasEnoughBalance = useCallback((amount: number): boolean => {
    return wallet !== null && wallet.balance >= amount;
  }, [wallet]);
  
  // ============================================
  // START CHECKOUT
  // ============================================
  
  const startCheckout = useCallback(async (input: StartCheckoutInput): Promise<CheckoutItem | null> => {
    if (!currentUser || !userProfile) {
      setError('You must be logged in to make a booking');
      return null;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const checkoutInput: CreateCheckoutInput = {
        type: input.type,
        userId: currentUser.uid,
        userName: userProfile.displayName || 'Unknown',
        userEmail: currentUser.email || undefined,
        itemDetails: input.itemDetails,
        pricing: input.pricing,
        clubId,
      };
      
      const newCheckout = await createPendingCheckout(checkoutInput);
      setCheckout(newCheckout);
      
      // Auto-select payment method
      if (newCheckout.pricing.isFree) {
        setSelectedPaymentMethod('free');
      } else if (canPayWithWallet) {
        setSelectedPaymentMethod('wallet');
      } else {
        setSelectedPaymentMethod('card');
      }
      
      return newCheckout;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create reservation';
      setError(errorMessage);
      onError?.(err instanceof Error ? err : new Error(errorMessage));
      return null;
    } finally {
      setLoading(false);
    }
  }, [currentUser, userProfile, clubId, canPayWithWallet, onError]);
  
  // ============================================
  // COMPLETE PAYMENT
  // ============================================
  
  const completePayment = useCallback(async (): Promise<boolean> => {
    if (!checkout || !currentUser) {
      setError('No active checkout');
      return false;
    }
    
    if (isExpired) {
      setError('This reservation has expired. Please try again.');
      return false;
    }
    
    if (!selectedPaymentMethod) {
      setError('Please select a payment method');
      return false;
    }
    
    setProcessing(true);
    setError(null);
    
    try {
      const amount = checkout.pricing.finalPrice;
      let transactionId: string | undefined;
      let walletId: string | undefined;
      
      // Process wallet payment
      if (selectedPaymentMethod === 'wallet') {
        if (!wallet) {
          throw new Error('No wallet found');
        }
        
        if (wallet.balance < amount) {
          throw new Error(`Insufficient wallet balance. You have ${formatCurrency(wallet.balance)} but need ${formatCurrency(amount)}`);
        }
        
        // Deduct from wallet
        const newBalance = wallet.balance - amount;
        await updateDoc(doc(db, 'wallets', wallet.id), {
          balance: newBalance,
          updatedAt: Date.now(),
        });
        
        // Create transaction
        const txRef = await addDoc(collection(db, 'transactions'), {
          walletId: wallet.id,
          odUserId: currentUser.uid,
          odClubId: clubId || wallet.odClubId,
          type: 'payment',
          amount: -amount,
          currency: checkout.pricing.currency,
          status: 'completed',
          paymentMethod: 'wallet',
          referenceType: checkout.type,
          referenceId: checkout.id,
          referenceName: getCheckoutDescription(checkout),
          balanceBefore: wallet.balance,
          balanceAfter: newBalance,
          breakdown: {
            items: checkout.pricing.lineItems,
            subtotal: checkout.pricing.basePrice,
            discounts: checkout.pricing.savings,
            fees: 0,
            tax: 0,
            total: amount,
          },
          createdAt: Date.now(),
          completedAt: Date.now(),
        });
        
        transactionId = txRef.id;
        walletId = wallet.id;
        
        // Update local wallet state
        setWallet(prev => prev ? { ...prev, balance: newBalance } : null);
      }
      
      // Process card payment (placeholder - needs Stripe)
      if (selectedPaymentMethod === 'card') {
        // TODO: Implement Stripe payment
        // For now, just mark as pending card payment
        throw new Error('Card payments are not yet enabled. Please use wallet or contact support.');
      }
      
      // Confirm the checkout
      const confirmedCheckout = await confirmCheckout({
        checkoutId: checkout.id,
        paymentMethod: selectedPaymentMethod,
        transactionId,
        walletId,
      });
      
      setCheckout(confirmedCheckout);
      onSuccess?.(confirmedCheckout);
      
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Payment failed';
      setError(errorMessage);
      onError?.(err instanceof Error ? err : new Error(errorMessage));
      return false;
    } finally {
      setProcessing(false);
    }
  }, [checkout, currentUser, wallet, clubId, selectedPaymentMethod, isExpired, formatCurrency, onSuccess, onError]);
  
  // ============================================
  // CANCEL RESERVATION
  // ============================================
  
  const cancelReservation = useCallback(async (): Promise<void> => {
    if (!checkout || !currentUser) return;
    
    try {
      await cancelCheckout(checkout.id, currentUser.uid);
      setCheckout(null);
      setTimeRemaining(0);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to cancel';
      setError(errorMessage);
    }
  }, [checkout, currentUser]);
  
  // ============================================
  // RETURN
  // ============================================
  
  return {
    checkout,
    wallet,
    annualPass,
    loading,
    processing,
    error,
    timeRemaining,
    isExpired,
    formattedTime,
    selectedPaymentMethod,
    setSelectedPaymentMethod,
    canPayWithWallet,
    canPayWithAnnualPass,
    startCheckout,
    completePayment,
    cancelReservation,
    formatCurrency,
    hasEnoughBalance,
  };
};

// ============================================
// HELPERS
// ============================================

const getCheckoutDescription = (checkout: CheckoutItem): string => {
  const details = checkout.itemDetails;
  
  switch (checkout.type) {
    case 'court_booking':
      return `Court Booking - ${details.courtName || 'Court'} on ${details.date} at ${details.startTime}`;
    case 'tournament':
      return `Tournament Entry - ${details.tournamentName || 'Tournament'}${details.divisionName ? ` (${details.divisionName})` : ''}`;
    case 'league':
      return `League Registration - ${details.leagueName || 'League'}`;
    case 'meetup':
      return `Meetup RSVP - ${details.meetupTitle || 'Meetup'}`;
    case 'annual_pass':
      return `Annual Pass - ${details.clubName || 'Club'}`;
    case 'club_membership':
      return `Membership - ${details.clubName || 'Club'}`;
    default:
      return details.description || 'Purchase';
  }
};

export default useCheckout;
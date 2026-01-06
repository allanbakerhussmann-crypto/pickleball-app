/**
 * SMS Credits Service
 *
 * Manages SMS credits for organizers:
 * - sms_credits/{odUserId}: Credit balance and totals
 * - sms_credits/{odUserId}/usage/{usageId}: Usage log
 * - sms_credits/{odUserId}/purchases/{purchaseId}: Purchase history
 * - sms_bundles/{bundleId}: Available SMS bundles
 *
 * FILE LOCATION: services/firebase/smsCredits.ts
 * VERSION: 07.19
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  runTransaction,
  limit,
  type Unsubscribe,
} from '@firebase/firestore';
import { db } from './config';
import type {
  SMSCredits,
  SMSUsage,
  SMSBundle,
  SMSPurchase,
} from '../../types';
import { FREE_STARTER_SMS_CREDITS } from '../../types';

// ============================================
// CREDITS CRUD
// Collection: sms_credits/{odUserId}
// ============================================

/**
 * Get or create SMS credits document for a user
 * Creates with 25 free credits if doesn't exist
 */
export const getOrCreateSMSCredits = async (
  userId: string
): Promise<SMSCredits> => {
  const creditsRef = doc(db, 'sms_credits', userId);
  const snap = await getDoc(creditsRef);

  if (snap.exists()) {
    return snap.data() as SMSCredits;
  }

  // Create new credits document with free starter credits
  const now = Date.now();
  const newCredits: SMSCredits = {
    odUserId: userId,
    balance: FREE_STARTER_SMS_CREDITS,
    totalPurchased: 0,
    totalUsed: 0,
    totalFreeCredits: FREE_STARTER_SMS_CREDITS,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(creditsRef, newCredits);
  return newCredits;
};

/**
 * Get SMS credits for a user (returns null if doesn't exist)
 */
export const getSMSCredits = async (
  userId: string
): Promise<SMSCredits | null> => {
  const snap = await getDoc(doc(db, 'sms_credits', userId));
  return snap.exists() ? (snap.data() as SMSCredits) : null;
};

/**
 * Get current SMS balance for a user
 */
export const getSMSBalance = async (userId: string): Promise<number> => {
  const credits = await getSMSCredits(userId);
  return credits?.balance ?? 0;
};

/**
 * Check if user has sufficient credits
 */
export const hasSufficientCredits = async (
  userId: string,
  count: number
): Promise<boolean> => {
  const balance = await getSMSBalance(userId);
  return balance >= count;
};

/**
 * Subscribe to SMS credits (real-time updates)
 * Returns null if document doesn't exist (user gets free credits on first use)
 */
export const subscribeToSMSCredits = (
  userId: string,
  callback: (credits: SMSCredits | null) => void
): Unsubscribe => {
  const creditsRef = doc(db, 'sms_credits', userId);
  return onSnapshot(
    creditsRef,
    (snap) => {
      callback(snap.exists() ? (snap.data() as SMSCredits) : null);
    },
    (error) => {
      // Handle permission errors gracefully - user just doesn't have credits yet
      console.warn('SMS credits subscription error (may be normal for new users):', error.message);
      callback(null);
    }
  );
};

// ============================================
// CREDIT TRANSACTIONS
// ============================================

/**
 * Deduct credits from user balance (transactional)
 * Only succeeds if user has sufficient credits
 */
export const deductCredits = async (
  userId: string,
  count: number,
  metadata?: {
    messageId?: string;
    tournamentId?: string;
    leagueId?: string;
    recipientPhone?: string;
    recipientName?: string;
  }
): Promise<{ success: boolean; newBalance: number; error?: string }> => {
  const creditsRef = doc(db, 'sms_credits', userId);

  try {
    const result = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(creditsRef);

      if (!snap.exists()) {
        return { success: false, newBalance: 0, error: 'No credits document found' };
      }

      const credits = snap.data() as SMSCredits;

      if (credits.balance < count) {
        return {
          success: false,
          newBalance: credits.balance,
          error: `Insufficient credits: ${credits.balance} available, ${count} required`,
        };
      }

      const newBalance = credits.balance - count;
      const now = Date.now();

      transaction.update(creditsRef, {
        balance: newBalance,
        totalUsed: credits.totalUsed + count,
        lastUsedAt: now,
        updatedAt: now,
      });

      // Log usage if metadata provided
      if (metadata?.messageId) {
        const usageRef = doc(collection(db, 'sms_credits', userId, 'usage'));
        const usage: Omit<SMSUsage, 'id'> = {
          messageId: metadata.messageId,
          tournamentId: metadata.tournamentId,
          leagueId: metadata.leagueId,
          recipientPhone: metadata.recipientPhone || '',
          recipientName: metadata.recipientName,
          status: 'sent',
          creditsUsed: count,
          createdAt: now,
        };
        transaction.set(usageRef, usage);
      }

      return { success: true, newBalance };
    });

    return result;
  } catch (error: any) {
    console.error('Error deducting credits:', error);
    return { success: false, newBalance: 0, error: error.message };
  }
};

/**
 * Add credits to user balance (transactional)
 */
export const addCredits = async (
  userId: string,
  count: number,
  reason: 'purchase' | 'refund' | 'bonus' | 'admin',
  purchaseData?: {
    bundleId: string;
    bundleName: string;
    amountNZD: number;
    stripeSessionId?: string;
    stripePaymentIntentId?: string;
  }
): Promise<{ success: boolean; newBalance: number; error?: string }> => {
  const creditsRef = doc(db, 'sms_credits', userId);

  try {
    const result = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(creditsRef);
      const now = Date.now();

      if (!snap.exists()) {
        // Create new credits document
        const newCredits: SMSCredits = {
          odUserId: userId,
          balance: count + FREE_STARTER_SMS_CREDITS,
          totalPurchased: reason === 'purchase' ? count : 0,
          totalUsed: 0,
          totalFreeCredits: FREE_STARTER_SMS_CREDITS + (reason === 'bonus' ? count : 0),
          lastTopUpAt: now,
          createdAt: now,
          updatedAt: now,
        };
        transaction.set(creditsRef, newCredits);

        // Log purchase if applicable
        if (reason === 'purchase' && purchaseData) {
          const purchaseRef = doc(collection(db, 'sms_credits', userId, 'purchases'));
          const purchase: Omit<SMSPurchase, 'id'> = {
            bundleId: purchaseData.bundleId,
            bundleName: purchaseData.bundleName,
            credits: count,
            amountNZD: purchaseData.amountNZD,
            stripeSessionId: purchaseData.stripeSessionId,
            stripePaymentIntentId: purchaseData.stripePaymentIntentId,
            status: 'completed',
            createdAt: now,
            completedAt: now,
          };
          transaction.set(purchaseRef, purchase);
        }

        return { success: true, newBalance: count + FREE_STARTER_SMS_CREDITS };
      }

      const credits = snap.data() as SMSCredits;
      const newBalance = credits.balance + count;

      const updates: Partial<SMSCredits> = {
        balance: newBalance,
        updatedAt: now,
      };

      if (reason === 'purchase') {
        updates.totalPurchased = credits.totalPurchased + count;
        updates.lastTopUpAt = now;
      } else if (reason === 'bonus') {
        updates.totalFreeCredits = credits.totalFreeCredits + count;
      }

      transaction.update(creditsRef, updates);

      // Log purchase if applicable
      if (reason === 'purchase' && purchaseData) {
        const purchaseRef = doc(collection(db, 'sms_credits', userId, 'purchases'));
        const purchase: Omit<SMSPurchase, 'id'> = {
          bundleId: purchaseData.bundleId,
          bundleName: purchaseData.bundleName,
          credits: count,
          amountNZD: purchaseData.amountNZD,
          stripeSessionId: purchaseData.stripeSessionId,
          stripePaymentIntentId: purchaseData.stripePaymentIntentId,
          status: 'completed',
          createdAt: now,
          completedAt: now,
        };
        transaction.set(purchaseRef, purchase);
      }

      return { success: true, newBalance };
    });

    return result;
  } catch (error: any) {
    console.error('Error adding credits:', error);
    return { success: false, newBalance: 0, error: error.message };
  }
};

// ============================================
// USAGE HISTORY
// Collection: sms_credits/{odUserId}/usage/{usageId}
// ============================================

/**
 * Log SMS usage
 */
export const logSMSUsage = async (
  userId: string,
  data: Omit<SMSUsage, 'id' | 'createdAt'>
): Promise<string> => {
  const usageRef = doc(collection(db, 'sms_credits', userId, 'usage'));
  await setDoc(usageRef, {
    ...data,
    createdAt: Date.now(),
  });
  return usageRef.id;
};

/**
 * Get SMS usage history for a user
 */
export const getSMSUsageHistory = async (
  userId: string,
  limitCount: number = 50
): Promise<(SMSUsage & { id: string })[]> => {
  const q = query(
    collection(db, 'sms_credits', userId, 'usage'),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SMSUsage & { id: string }));
};

/**
 * Subscribe to SMS usage history (real-time)
 */
export const subscribeToSMSUsage = (
  userId: string,
  callback: (usage: (SMSUsage & { id: string })[]) => void,
  limitCount: number = 50
): Unsubscribe => {
  const q = query(
    collection(db, 'sms_credits', userId, 'usage'),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  return onSnapshot(q, (snap) => {
    const usage = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SMSUsage & { id: string }));
    callback(usage);
  });
};

// ============================================
// PURCHASE HISTORY
// Collection: sms_credits/{odUserId}/purchases/{purchaseId}
// ============================================

/**
 * Get purchase history for a user
 */
export const getSMSPurchaseHistory = async (
  userId: string,
  limitCount: number = 20
): Promise<(SMSPurchase & { id: string })[]> => {
  const q = query(
    collection(db, 'sms_credits', userId, 'purchases'),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SMSPurchase & { id: string }));
};

/**
 * Create a pending purchase (before Stripe checkout)
 */
export const createPendingPurchase = async (
  userId: string,
  bundleId: string,
  bundleName: string,
  credits: number,
  amountNZD: number
): Promise<string> => {
  const purchaseRef = doc(collection(db, 'sms_credits', userId, 'purchases'));
  const now = Date.now();

  const purchase: Omit<SMSPurchase, 'id'> = {
    bundleId,
    bundleName,
    credits,
    amountNZD,
    status: 'pending',
    createdAt: now,
  };

  await setDoc(purchaseRef, purchase);
  return purchaseRef.id;
};

/**
 * Update purchase status after payment
 */
export const updatePurchaseStatus = async (
  userId: string,
  purchaseId: string,
  status: SMSPurchase['status'],
  stripeData?: {
    stripeSessionId?: string;
    stripePaymentIntentId?: string;
  }
): Promise<void> => {
  const purchaseRef = doc(db, 'sms_credits', userId, 'purchases', purchaseId);

  const updates: Partial<SMSPurchase> = {
    status,
  };

  if (stripeData?.stripeSessionId) {
    updates.stripeSessionId = stripeData.stripeSessionId;
  }
  if (stripeData?.stripePaymentIntentId) {
    updates.stripePaymentIntentId = stripeData.stripePaymentIntentId;
  }
  if (status === 'completed') {
    updates.completedAt = Date.now();
  }

  await updateDoc(purchaseRef, updates);
};

// ============================================
// SMS BUNDLES
// Collection: sms_bundles/{bundleId}
// ============================================

/**
 * Get all active SMS bundles
 */
export const getSMSBundles = async (): Promise<(SMSBundle & { id: string })[]> => {
  const q = query(
    collection(db, 'sms_bundles'),
    where('isActive', '==', true),
    orderBy('sortOrder', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SMSBundle & { id: string }));
};

/**
 * Get a single SMS bundle by ID
 */
export const getSMSBundle = async (
  bundleId: string
): Promise<(SMSBundle & { id: string }) | null> => {
  const snap = await getDoc(doc(db, 'sms_bundles', bundleId));
  return snap.exists()
    ? ({ id: snap.id, ...snap.data() } as SMSBundle & { id: string })
    : null;
};

/**
 * Subscribe to SMS bundles (real-time)
 */
export const subscribeToSMSBundles = (
  callback: (bundles: (SMSBundle & { id: string })[]) => void
): Unsubscribe => {
  const q = query(
    collection(db, 'sms_bundles'),
    where('isActive', '==', true),
    orderBy('sortOrder', 'asc')
  );
  return onSnapshot(q, (snap) => {
    const bundles = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SMSBundle & { id: string }));
    callback(bundles);
  });
};

/**
 * Create or update an SMS bundle (admin only)
 */
export const saveSMSBundle = async (
  bundleId: string | null,
  bundle: Omit<SMSBundle, 'id'>
): Promise<string> => {
  const now = Date.now();

  if (bundleId) {
    // Update existing
    const bundleRef = doc(db, 'sms_bundles', bundleId);
    await updateDoc(bundleRef, {
      ...bundle,
      updatedAt: now,
    });
    return bundleId;
  }

  // Create new
  const bundleRef = doc(collection(db, 'sms_bundles'));
  await setDoc(bundleRef, {
    ...bundle,
    createdAt: now,
    updatedAt: now,
  });
  return bundleRef.id;
};

/**
 * Deactivate an SMS bundle (soft delete)
 */
export const deactivateSMSBundle = async (bundleId: string): Promise<void> => {
  await updateDoc(doc(db, 'sms_bundles', bundleId), {
    isActive: false,
    updatedAt: Date.now(),
  });
};

// ============================================
// HELPERS
// ============================================

/**
 * Format price in NZD (from cents)
 */
export const formatPriceNZD = (cents: number): string => {
  return `$${(cents / 100).toFixed(2)}`;
};

/**
 * Calculate price per SMS for a bundle
 */
export const getPricePerSMS = (bundle: SMSBundle): number => {
  return bundle.priceNZD / bundle.credits;
};

/**
 * Format price per SMS
 */
export const formatPricePerSMS = (bundle: SMSBundle): string => {
  const pricePerSMS = getPricePerSMS(bundle);
  return `${(pricePerSMS / 100).toFixed(2)}c`;
};

/**
 * Check if user's credits are low (below threshold)
 */
export const isCreditsLow = (credits: SMSCredits, threshold: number = 10): boolean => {
  return credits.balance <= threshold;
};

/**
 * Get credit balance color class based on level
 */
export const getBalanceColorClass = (balance: number): string => {
  if (balance <= 0) return 'text-red-400';
  if (balance <= 10) return 'text-yellow-400';
  return 'text-lime-400';
};

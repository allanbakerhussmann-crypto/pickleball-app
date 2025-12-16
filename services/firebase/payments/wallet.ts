/**
 * Wallet Service
 * 
 * Firebase service for wallet management including:
 * - Creating and retrieving wallets
 * - Balance operations (add, deduct)
 * - Real-time subscriptions
 * 
 * FILE LOCATION: services/firebase/payments/wallet.ts
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
  onSnapshot,
  runTransaction,
  Timestamp,
  type Unsubscribe,
} from '@firebase/firestore';
import { db } from '../config';
import type {
  Wallet,
  CreateWalletInput,
  WalletStatus,
  SupportedCurrency,
} from './types';
import { validateCreateWalletInput, validateAmount } from './validation';

// ============================================
// CONSTANTS
// ============================================

const WALLETS_COLLECTION = 'wallets';

/**
 * Generate a deterministic wallet ID from user and club IDs
 * Format: {userId}_{clubId}
 */
export const generateWalletId = (odUserId: string, odClubId: string): string => {
  return `${odUserId}_${odClubId}`;
};

// ============================================
// CREATE & GET OPERATIONS
// ============================================

/**
 * Create a new wallet for a user at a specific club
 * Returns existing wallet if one already exists
 */
export const createWallet = async (
  input: CreateWalletInput
): Promise<Wallet> => {
  // Validate input
  const validation = validateCreateWalletInput(input);
  if (!validation.valid) {
    throw new Error(`Invalid wallet input: ${validation.errors.join(', ')}`);
  }

  const { odUserId, odClubId, currency = 'nzd' } = input;
  const walletId = generateWalletId(odUserId, odClubId);
  const walletRef = doc(db, WALLETS_COLLECTION, walletId);

  // Check if wallet already exists
  const existingSnap = await getDoc(walletRef);
  if (existingSnap.exists()) {
    return { id: existingSnap.id, ...existingSnap.data() } as Wallet;
  }

  // Create new wallet
  const now = Date.now();
  const wallet: Wallet = {
    id: walletId,
    odUserId,
    odClubId,
    balance: 0,
    currency,
    totalLoaded: 0,
    totalSpent: 0,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(walletRef, wallet);
  return wallet;
};

/**
 * Get or create a wallet for a user at a specific club
 * This is the primary method to use - ensures wallet exists
 */
export const getOrCreateWallet = async (
  odUserId: string,
  odClubId: string,
  currency: SupportedCurrency = 'nzd'
): Promise<Wallet> => {
  return createWallet({ odUserId, odClubId, currency });
};

/**
 * Get a wallet by its ID
 */
export const getWallet = async (walletId: string): Promise<Wallet | null> => {
  const walletRef = doc(db, WALLETS_COLLECTION, walletId);
  const snap = await getDoc(walletRef);
  
  if (!snap.exists()) {
    return null;
  }
  
  return { id: snap.id, ...snap.data() } as Wallet;
};

/**
 * Get a wallet by user and club IDs
 */
export const getWalletByUserAndClub = async (
  odUserId: string,
  odClubId: string
): Promise<Wallet | null> => {
  const walletId = generateWalletId(odUserId, odClubId);
  return getWallet(walletId);
};

/**
 * Get wallet balance (convenience method)
 * Returns 0 if wallet doesn't exist
 */
export const getWalletBalance = async (
  odUserId: string,
  odClubId: string
): Promise<number> => {
  const wallet = await getWalletByUserAndClub(odUserId, odClubId);
  return wallet?.balance ?? 0;
};

/**
 * Get all wallets for a user across all clubs
 */
export const getUserWallets = async (odUserId: string): Promise<Wallet[]> => {
  const q = query(
    collection(db, WALLETS_COLLECTION),
    where('odUserId', '==', odUserId)
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Wallet));
};

/**
 * Get all wallets for a club (admin use)
 */
export const getClubWallets = async (odClubId: string): Promise<Wallet[]> => {
  const q = query(
    collection(db, WALLETS_COLLECTION),
    where('odClubId', '==', odClubId)
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Wallet));
};

/**
 * Get active wallets for a club (non-zero balance or recent activity)
 */
export const getActiveClubWallets = async (odClubId: string): Promise<Wallet[]> => {
  const q = query(
    collection(db, WALLETS_COLLECTION),
    where('odClubId', '==', odClubId),
    where('status', '==', 'active')
  );
  
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as Wallet))
    .filter(w => w.balance > 0 || w.totalLoaded > 0);
};

// ============================================
// REAL-TIME SUBSCRIPTIONS
// ============================================

/**
 * Subscribe to real-time wallet updates
 */
export const subscribeToWallet = (
  odUserId: string,
  odClubId: string,
  callback: (wallet: Wallet | null) => void
): Unsubscribe => {
  const walletId = generateWalletId(odUserId, odClubId);
  const walletRef = doc(db, WALLETS_COLLECTION, walletId);
  
  return onSnapshot(walletRef, (snap) => {
    if (snap.exists()) {
      callback({ id: snap.id, ...snap.data() } as Wallet);
    } else {
      callback(null);
    }
  });
};

/**
 * Subscribe to all wallets for a user
 */
export const subscribeToUserWallets = (
  odUserId: string,
  callback: (wallets: Wallet[]) => void
): Unsubscribe => {
  const q = query(
    collection(db, WALLETS_COLLECTION),
    where('odUserId', '==', odUserId)
  );
  
  return onSnapshot(q, (snap) => {
    const wallets = snap.docs.map(d => ({ id: d.id, ...d.data() } as Wallet));
    callback(wallets);
  });
};

/**
 * Subscribe to all wallets for a club (admin use)
 */
export const subscribeToClubWallets = (
  odClubId: string,
  callback: (wallets: Wallet[]) => void
): Unsubscribe => {
  const q = query(
    collection(db, WALLETS_COLLECTION),
    where('odClubId', '==', odClubId)
  );
  
  return onSnapshot(q, (snap) => {
    const wallets = snap.docs.map(d => ({ id: d.id, ...d.data() } as Wallet));
    callback(wallets);
  });
};

// ============================================
// BALANCE OPERATIONS (Transactional)
// ============================================

/**
 * Result of a balance operation
 */
export interface BalanceOperationResult {
  success: boolean;
  wallet: Wallet;
  previousBalance: number;
  newBalance: number;
  error?: string;
}

/**
 * Add funds to a wallet (top-up)
 * Uses Firestore transaction for atomic operation
 */
export const addToWallet = async (
  odUserId: string,
  odClubId: string,
  amount: number
): Promise<BalanceOperationResult> => {
  // Validate amount
  const amountValidation = validateAmount(amount);
  if (!amountValidation.valid) {
    throw new Error(`Invalid amount: ${amountValidation.errors.join(', ')}`);
  }

  const walletId = generateWalletId(odUserId, odClubId);
  const walletRef = doc(db, WALLETS_COLLECTION, walletId);

  return runTransaction(db, async (transaction) => {
    const walletSnap = await transaction.get(walletRef);
    
    if (!walletSnap.exists()) {
      throw new Error(`Wallet not found: ${walletId}`);
    }
    
    const wallet = { id: walletSnap.id, ...walletSnap.data() } as Wallet;
    
    // Check wallet status
    if (wallet.status !== 'active') {
      throw new Error(`Wallet is ${wallet.status}, cannot add funds`);
    }
    
    const previousBalance = wallet.balance;
    const newBalance = previousBalance + amount;
    const now = Date.now();
    
    // Update wallet
    transaction.update(walletRef, {
      balance: newBalance,
      totalLoaded: wallet.totalLoaded + amount,
      updatedAt: now,
    });
    
    return {
      success: true,
      wallet: {
        ...wallet,
        balance: newBalance,
        totalLoaded: wallet.totalLoaded + amount,
        updatedAt: now,
      },
      previousBalance,
      newBalance,
    };
  });
};

/**
 * Deduct funds from a wallet (payment)
 * Uses Firestore transaction for atomic operation
 * Returns error if insufficient funds
 */
export const deductFromWallet = async (
  odUserId: string,
  odClubId: string,
  amount: number
): Promise<BalanceOperationResult> => {
  // Validate amount
  const amountValidation = validateAmount(amount);
  if (!amountValidation.valid) {
    throw new Error(`Invalid amount: ${amountValidation.errors.join(', ')}`);
  }

  const walletId = generateWalletId(odUserId, odClubId);
  const walletRef = doc(db, WALLETS_COLLECTION, walletId);

  return runTransaction(db, async (transaction) => {
    const walletSnap = await transaction.get(walletRef);
    
    if (!walletSnap.exists()) {
      throw new Error(`Wallet not found: ${walletId}`);
    }
    
    const wallet = { id: walletSnap.id, ...walletSnap.data() } as Wallet;
    
    // Check wallet status
    if (wallet.status !== 'active') {
      throw new Error(`Wallet is ${wallet.status}, cannot deduct funds`);
    }
    
    const previousBalance = wallet.balance;
    
    // Check sufficient funds
    if (previousBalance < amount) {
      return {
        success: false,
        wallet,
        previousBalance,
        newBalance: previousBalance,
        error: `Insufficient funds. Balance: ${previousBalance}, Required: ${amount}`,
      };
    }
    
    const newBalance = previousBalance - amount;
    const now = Date.now();
    
    // Update wallet
    transaction.update(walletRef, {
      balance: newBalance,
      totalSpent: wallet.totalSpent + amount,
      updatedAt: now,
    });
    
    return {
      success: true,
      wallet: {
        ...wallet,
        balance: newBalance,
        totalSpent: wallet.totalSpent + amount,
        updatedAt: now,
      },
      previousBalance,
      newBalance,
    };
  });
};

/**
 * Check if wallet has sufficient funds
 */
export const hasSufficientFunds = async (
  odUserId: string,
  odClubId: string,
  amount: number
): Promise<boolean> => {
  const balance = await getWalletBalance(odUserId, odClubId);
  return balance >= amount;
};

/**
 * Transfer between two wallets (same user, different clubs)
 * Uses Firestore transaction for atomic operation
 */
export const transferBetweenWallets = async (
  odUserId: string,
  fromClubId: string,
  toClubId: string,
  amount: number
): Promise<{ success: boolean; error?: string }> => {
  // Validate amount
  const amountValidation = validateAmount(amount);
  if (!amountValidation.valid) {
    throw new Error(`Invalid amount: ${amountValidation.errors.join(', ')}`);
  }

  const fromWalletId = generateWalletId(odUserId, fromClubId);
  const toWalletId = generateWalletId(odUserId, toClubId);
  
  const fromWalletRef = doc(db, WALLETS_COLLECTION, fromWalletId);
  const toWalletRef = doc(db, WALLETS_COLLECTION, toWalletId);

  return runTransaction(db, async (transaction) => {
    const fromSnap = await transaction.get(fromWalletRef);
    const toSnap = await transaction.get(toWalletRef);
    
    if (!fromSnap.exists()) {
      throw new Error(`Source wallet not found: ${fromWalletId}`);
    }
    if (!toSnap.exists()) {
      throw new Error(`Destination wallet not found: ${toWalletId}`);
    }
    
    const fromWallet = fromSnap.data() as Wallet;
    const toWallet = toSnap.data() as Wallet;
    
    // Check wallet statuses
    if (fromWallet.status !== 'active') {
      throw new Error(`Source wallet is ${fromWallet.status}`);
    }
    if (toWallet.status !== 'active') {
      throw new Error(`Destination wallet is ${toWallet.status}`);
    }
    
    // Check sufficient funds
    if (fromWallet.balance < amount) {
      return {
        success: false,
        error: `Insufficient funds. Balance: ${fromWallet.balance}, Required: ${amount}`,
      };
    }
    
    const now = Date.now();
    
    // Deduct from source
    transaction.update(fromWalletRef, {
      balance: fromWallet.balance - amount,
      totalSpent: fromWallet.totalSpent + amount,
      updatedAt: now,
    });
    
    // Add to destination
    transaction.update(toWalletRef, {
      balance: toWallet.balance + amount,
      totalLoaded: toWallet.totalLoaded + amount,
      updatedAt: now,
    });
    
    return { success: true };
  });
};

// ============================================
// WALLET STATUS MANAGEMENT
// ============================================

/**
 * Update wallet status (freeze, unfreeze, close)
 */
export const updateWalletStatus = async (
  walletId: string,
  status: WalletStatus
): Promise<Wallet> => {
  const walletRef = doc(db, WALLETS_COLLECTION, walletId);
  const snap = await getDoc(walletRef);
  
  if (!snap.exists()) {
    throw new Error(`Wallet not found: ${walletId}`);
  }
  
  const now = Date.now();
  await updateDoc(walletRef, {
    status,
    updatedAt: now,
  });
  
  return {
    id: snap.id,
    ...snap.data(),
    status,
    updatedAt: now,
  } as Wallet;
};

/**
 * Freeze a wallet (prevents all transactions)
 */
export const freezeWallet = async (
  odUserId: string,
  odClubId: string
): Promise<Wallet> => {
  const walletId = generateWalletId(odUserId, odClubId);
  return updateWalletStatus(walletId, 'frozen');
};

/**
 * Unfreeze a wallet
 */
export const unfreezeWallet = async (
  odUserId: string,
  odClubId: string
): Promise<Wallet> => {
  const walletId = generateWalletId(odUserId, odClubId);
  return updateWalletStatus(walletId, 'active');
};

/**
 * Close a wallet (permanent)
 * Only allowed if balance is zero
 */
export const closeWallet = async (
  odUserId: string,
  odClubId: string
): Promise<Wallet> => {
  const walletId = generateWalletId(odUserId, odClubId);
  const wallet = await getWallet(walletId);
  
  if (!wallet) {
    throw new Error(`Wallet not found: ${walletId}`);
  }
  
  if (wallet.balance > 0) {
    throw new Error(`Cannot close wallet with positive balance: ${wallet.balance}`);
  }
  
  return updateWalletStatus(walletId, 'closed');
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get total wallet balance for a user across all clubs
 */
export const getTotalUserBalance = async (odUserId: string): Promise<number> => {
  const wallets = await getUserWallets(odUserId);
  return wallets.reduce((sum, w) => sum + w.balance, 0);
};

/**
 * Get total wallet balances for a club (all members)
 */
export const getTotalClubWalletBalance = async (odClubId: string): Promise<number> => {
  const wallets = await getClubWallets(odClubId);
  return wallets.reduce((sum, w) => sum + w.balance, 0);
};

/**
 * Count active wallets for a club
 */
export const countActiveClubWallets = async (odClubId: string): Promise<number> => {
  const wallets = await getActiveClubWallets(odClubId);
  return wallets.length;
};
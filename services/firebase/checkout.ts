/**
 * Checkout Service
 * 
 * Manages pending bookings/registrations with hold system:
 * - Create pending items with expiry
 * - Confirm after payment
 * - Expire/cancel pending items
 * - Check for conflicts
 * 
 * FILE LOCATION: services/firebase/checkout.ts
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
} from '@firebase/firestore';
import { db } from './index';
import type { PriceCalculation } from './pricing';

// ============================================
// TYPES
// ============================================

export type CheckoutItemType = 
  | 'court_booking' 
  | 'tournament' 
  | 'league' 
  | 'meetup'
  | 'annual_pass'
  | 'club_membership'
  | 'visitor_fee';

export type CheckoutStatus = 
  | 'pending'      // Held, awaiting payment
  | 'confirmed'    // Paid and confirmed
  | 'expired'      // Hold timed out
  | 'cancelled'    // User cancelled
  | 'failed';      // Payment failed

export type PaymentMethod = 'wallet' | 'card' | 'annual_pass' | 'free';

export interface CheckoutItemDetails {
  // Court booking
  courtId?: string;
  courtName?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  
  // Tournament
  tournamentId?: string;
  tournamentName?: string;
  divisionId?: string;
  divisionName?: string;
  
  // League
  leagueId?: string;
  leagueName?: string;
  teamId?: string;
  teamName?: string;
  
  // Meetup
  meetupId?: string;
  meetupTitle?: string;
  
  // Club
  clubId?: string;
  clubName?: string;
  
  // Generic
  description?: string;
}

export interface CheckoutItem {
  id: string;
  type: CheckoutItemType;
  status: CheckoutStatus;
  
  // What they're buying
  itemDetails: CheckoutItemDetails;
  
  // Who's buying
  userId: string;
  userName: string;
  userEmail?: string;
  
  // Pricing
  pricing: PriceCalculation;
  
  // Timing
  createdAt: number;
  expiresAt: number;
  confirmedAt?: number;
  cancelledAt?: number;
  
  // Payment
  paymentMethod?: PaymentMethod;
  transactionId?: string;
  walletId?: string;
  
  // Reference for easy lookup
  clubId?: string;
}

// Hold times in milliseconds
export const HOLD_TIMES: Record<CheckoutItemType, number> = {
  court_booking: 5 * 60 * 1000,    // 5 minutes
  tournament: 10 * 60 * 1000,      // 10 minutes
  league: 10 * 60 * 1000,          // 10 minutes
  meetup: 5 * 60 * 1000,           // 5 minutes
  annual_pass: 0,                   // No hold
  club_membership: 0,               // No hold
  visitor_fee: 5 * 60 * 1000,      // 5 minutes
};

// ============================================
// CREATE PENDING CHECKOUT
// ============================================

export interface CreateCheckoutInput {
  type: CheckoutItemType;
  userId: string;
  userName: string;
  userEmail?: string;
  itemDetails: CheckoutItemDetails;
  pricing: PriceCalculation;
  clubId?: string;
}

export const createPendingCheckout = async (input: CreateCheckoutInput): Promise<CheckoutItem> => {
  const { type, userId, userName, userEmail, itemDetails, pricing, clubId } = input;
  
  // Check for conflicts first (for court bookings)
  if (type === 'court_booking' && itemDetails.courtId && itemDetails.date && itemDetails.startTime && clubId) {
    const hasConflict = await checkCourtBookingConflict(
      clubId,
      itemDetails.courtId,
      itemDetails.date,
      itemDetails.startTime,
      undefined, // No checkout to exclude yet
      userId     // But exclude user's own pending checkouts
    );
    if (hasConflict) {
      throw new Error('This time slot is no longer available');
    }
  }
  
  const now = Date.now();
  const holdTime = HOLD_TIMES[type];
  const expiresAt = holdTime > 0 ? now + holdTime : 0;
  
  const checkoutRef = doc(collection(db, 'checkouts'));
  
  const checkoutItem: CheckoutItem = {
    id: checkoutRef.id,
    type,
    status: holdTime > 0 ? 'pending' : 'confirmed', // Instant for no-hold items
    itemDetails,
    userId,
    userName,
    userEmail,
    pricing,
    createdAt: now,
    expiresAt,
    clubId,
  };
  
  await setDoc(checkoutRef, checkoutItem);
  
  return checkoutItem;
};

// ============================================
// CONFIRM CHECKOUT (After Payment)
// ============================================

export interface ConfirmCheckoutInput {
  checkoutId: string;
  paymentMethod: PaymentMethod;
  transactionId?: string;
  walletId?: string;
}

export const confirmCheckout = async (input: ConfirmCheckoutInput): Promise<CheckoutItem> => {
  const { checkoutId, paymentMethod, transactionId, walletId } = input;
  
  const checkoutRef = doc(db, 'checkouts', checkoutId);
  const checkoutSnap = await getDoc(checkoutRef);
  
  if (!checkoutSnap.exists()) {
    throw new Error('Checkout not found');
  }
  
  const checkout = checkoutSnap.data() as CheckoutItem;
  
  // Check if already confirmed
  if (checkout.status === 'confirmed') {
    return checkout;
  }
  
  // Check if expired
  if (checkout.status === 'expired' || (checkout.expiresAt > 0 && Date.now() > checkout.expiresAt)) {
    await updateDoc(checkoutRef, { status: 'expired' });
    throw new Error('This reservation has expired. Please try again.');
  }
  
  // Check if cancelled
  if (checkout.status === 'cancelled') {
    throw new Error('This reservation was cancelled.');
  }
  
  // For court bookings, verify slot is still available
  // ONLY check the actual bookings collection, not checkout collection
  if (checkout.type === 'court_booking' && checkout.clubId) {
    const { courtId, date, startTime } = checkout.itemDetails;
    if (courtId && date && startTime) {
      const hasRealBooking = await checkExistingBooking(
        checkout.clubId,
        courtId,
        date,
        startTime
      );
      if (hasRealBooking) {
        await updateDoc(checkoutRef, { status: 'failed' });
        throw new Error('This time slot was booked by someone else. Please try a different time.');
      }
    }
  }
  
  // Confirm the checkout
  const now = Date.now();
  await updateDoc(checkoutRef, {
    status: 'confirmed',
    confirmedAt: now,
    paymentMethod,
    transactionId,
    walletId,
  });
  
  return {
    ...checkout,
    status: 'confirmed',
    confirmedAt: now,
    paymentMethod,
    transactionId,
    walletId,
  };
};

// ============================================
// CANCEL CHECKOUT
// ============================================

export const cancelCheckout = async (checkoutId: string, userId: string): Promise<void> => {
  const checkoutRef = doc(db, 'checkouts', checkoutId);
  const checkoutSnap = await getDoc(checkoutRef);
  
  if (!checkoutSnap.exists()) {
    throw new Error('Checkout not found');
  }
  
  const checkout = checkoutSnap.data() as CheckoutItem;
  
  // Only the owner can cancel
  if (checkout.userId !== userId) {
    throw new Error('You can only cancel your own reservations');
  }
  
  // Can't cancel confirmed checkouts (need refund flow)
  if (checkout.status === 'confirmed') {
    throw new Error('Cannot cancel a confirmed booking. Please request a refund.');
  }
  
  await updateDoc(checkoutRef, {
    status: 'cancelled',
    cancelledAt: Date.now(),
  });
};

// ============================================
// EXPIRE OLD CHECKOUTS
// ============================================

export const expireOldCheckouts = async (): Promise<number> => {
  const now = Date.now();
  
  const q = query(
    collection(db, 'checkouts'),
    where('status', '==', 'pending'),
    where('expiresAt', '>', 0),
    where('expiresAt', '<', now)
  );
  
  const snap = await getDocs(q);
  let expiredCount = 0;
  
  for (const docSnap of snap.docs) {
    await updateDoc(docSnap.ref, { status: 'expired' });
    expiredCount++;
  }
  
  return expiredCount;
};

// ============================================
// CHECK FOR CONFLICTS (Pending checkouts from others)
// ============================================

export const checkCourtBookingConflict = async (
  clubId: string,
  courtId: string,
  date: string,
  startTime: string,
  excludeCheckoutId?: string,
  excludeUserId?: string
): Promise<boolean> => {
  const now = Date.now();
  
  // Only check PENDING checkouts (not confirmed - those create real bookings)
  const pendingQuery = query(
    collection(db, 'checkouts'),
    where('type', '==', 'court_booking'),
    where('clubId', '==', clubId),
    where('status', '==', 'pending')
  );
  
  const pendingSnap = await getDocs(pendingQuery);
  
  for (const docSnap of pendingSnap.docs) {
    // Skip if this is the checkout we're excluding
    if (excludeCheckoutId && docSnap.id === excludeCheckoutId) continue;
    
    const checkout = docSnap.data() as CheckoutItem;
    
    // Skip if this is the user's own checkout
    if (excludeUserId && checkout.userId === excludeUserId) continue;
    
    // Check if expired
    if (checkout.expiresAt > 0 && now > checkout.expiresAt) {
      // Mark as expired and skip
      await updateDoc(docSnap.ref, { status: 'expired' });
      continue;
    }
    
    // Check if same slot
    if (
      checkout.itemDetails.courtId === courtId &&
      checkout.itemDetails.date === date &&
      checkout.itemDetails.startTime === startTime
    ) {
      return true; // Conflict found - someone else is checking out this slot
    }
  }
  
  // Also check if there's already a real booking
  const hasRealBooking = await checkExistingBooking(clubId, courtId, date, startTime);
  if (hasRealBooking) {
    return true;
  }
  
  return false;
};

// ============================================
// CHECK EXISTING BOOKING (In bookings collection)
// ============================================

export const checkExistingBooking = async (
  clubId: string,
  courtId: string,
  date: string,
  startTime: string
): Promise<boolean> => {
  try {
    const bookingsQuery = query(
      collection(db, 'clubs', clubId, 'bookings'),
      where('courtId', '==', courtId),
      where('date', '==', date),
      where('startTime', '==', startTime),
      where('status', '==', 'confirmed')
    );
    
    const bookingsSnap = await getDocs(bookingsQuery);
    return !bookingsSnap.empty;
  } catch (err) {
    // Collection might not exist yet - that's fine, no bookings
    console.warn('Could not check bookings collection:', err);
    return false;
  }
};

// ============================================
// GET CHECKOUT BY ID
// ============================================

export const getCheckout = async (checkoutId: string): Promise<CheckoutItem | null> => {
  const checkoutRef = doc(db, 'checkouts', checkoutId);
  const checkoutSnap = await getDoc(checkoutRef);
  
  if (!checkoutSnap.exists()) {
    return null;
  }
  
  return checkoutSnap.data() as CheckoutItem;
};

// ============================================
// GET USER'S PENDING CHECKOUTS
// ============================================

export const getUserPendingCheckouts = async (userId: string): Promise<CheckoutItem[]> => {
  const q = query(
    collection(db, 'checkouts'),
    where('userId', '==', userId),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc')
  );
  
  const snap = await getDocs(q);
  const checkouts: CheckoutItem[] = [];
  
  for (const docSnap of snap.docs) {
    const checkout = docSnap.data() as CheckoutItem;
    
    // Check if expired
    if (checkout.expiresAt > 0 && Date.now() > checkout.expiresAt) {
      await updateDoc(docSnap.ref, { status: 'expired' });
      continue;
    }
    
    checkouts.push(checkout);
  }
  
  return checkouts;
};

// ============================================
// SUBSCRIBE TO CHECKOUT STATUS
// ============================================

export const subscribeToCheckout = (
  checkoutId: string,
  callback: (checkout: CheckoutItem | null) => void
): (() => void) => {
  const checkoutRef = doc(db, 'checkouts', checkoutId);
  
  return onSnapshot(checkoutRef, (snap) => {
    if (!snap.exists()) {
      callback(null);
      return;
    }
    callback(snap.data() as CheckoutItem);
  });
};

// ============================================
// GET PENDING HOLDS FOR COURT CALENDAR
// ============================================

export const getPendingCourtHolds = async (
  clubId: string,
  date: string
): Promise<CheckoutItem[]> => {
  const now = Date.now();
  
  const q = query(
    collection(db, 'checkouts'),
    where('type', '==', 'court_booking'),
    where('clubId', '==', clubId),
    where('status', '==', 'pending')
  );
  
  const snap = await getDocs(q);
  const holds: CheckoutItem[] = [];
  
  for (const docSnap of snap.docs) {
    const checkout = docSnap.data() as CheckoutItem;
    
    // Skip if expired
    if (checkout.expiresAt > 0 && now > checkout.expiresAt) {
      await updateDoc(docSnap.ref, { status: 'expired' });
      continue;
    }
    
    // Only include if matching date
    if (checkout.itemDetails.date === date) {
      holds.push(checkout);
    }
  }
  
  return holds;
};

// ============================================
// CLEANUP HELPER - Call periodically
// ============================================

export const cleanupExpiredCheckouts = async (): Promise<void> => {
  const expiredCount = await expireOldCheckouts();
  if (expiredCount > 0) {
    console.log(`Cleaned up ${expiredCount} expired checkout(s)`);
  }
};
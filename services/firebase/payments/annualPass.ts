/**
 * Annual Pass Service
 * 
 * Manages annual passes including:
 * - Pass purchase and activation
 * - Pass renewal and expiration
 * - Usage tracking for bookings
 * - Pass validation for payments
 * 
 * All amounts are in CENTS.
 * 
 * FILE LOCATION: services/firebase/payments/annualPass.ts
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
  limit,
  onSnapshot,
  increment,
  type Unsubscribe,
} from '@firebase/firestore';
import { db } from '../config';
import type {
  AnnualPass,
  AnnualPassStatus,
  PurchaseAnnualPassInput,
  SupportedCurrency,
  Transaction,
  ReferenceType,
} from './types';

// ============================================
// CONSTANTS
// ============================================

const ANNUAL_PASSES_COLLECTION = 'annualPasses';

/**
 * Default pass duration in days (365 = 1 year)
 */
export const DEFAULT_PASS_DURATION_DAYS = 365;

/**
 * Grace period for renewals in days
 * Allows renewal up to 30 days before expiry
 */
export const RENEWAL_GRACE_PERIOD_DAYS = 30;

/**
 * Maximum passes a user can have per club
 */
export const MAX_PASSES_PER_CLUB = 1;

// ============================================
// TYPES
// ============================================

/**
 * Annual pass configuration for a club
 */
export interface AnnualPassConfig {
  /** Whether the club offers annual passes */
  enabled: boolean;
  /** Price in cents */
  price: number;
  /** Currency */
  currency: SupportedCurrency;
  /** Duration in days (default 365) */
  durationDays: number;
  /** Discount percentage applied to bookings (e.g., 100 = free) */
  discountPercent: number;
  /** Maximum bookings per day (0 = unlimited) */
  maxBookingsPerDay: number;
  /** Maximum bookings per week (0 = unlimited) */
  maxBookingsPerWeek: number;
  /** Whether pass can be used for peak hours */
  allowPeakHours: boolean;
  /** Whether pass can be used for tournaments */
  allowTournaments: boolean;
  /** Description shown to users */
  description?: string;
  /** Terms and conditions */
  terms?: string;
}

/**
 * Pass usage record for a specific booking
 */
export interface PassUsageRecord {
  id: string;
  passId: string;
  odUserId: string;
  odClubId: string;
  bookingId: string;
  bookingDate: string; // YYYY-MM-DD
  courtId: string;
  courtName: string;
  startTime: string;
  endTime: string;
  /** Amount saved by using the pass */
  amountSaved: number;
  usedAt: number;
}

/**
 * Result of pass validation
 */
export interface PassValidationResult {
  valid: boolean;
  passId?: string;
  discountPercent?: number;
  error?: string;
  errorCode?: 'NO_PASS' | 'EXPIRED' | 'SUSPENDED' | 'LIMIT_REACHED' | 'NOT_ALLOWED';
}

/**
 * Pass usage statistics
 */
export interface PassUsageStats {
  totalBookings: number;
  totalSaved: number;
  bookingsThisMonth: number;
  savedThisMonth: number;
  averageSavingsPerBooking: number;
  mostUsedCourt?: string;
  peakUsageDay?: string;
}

// ============================================
// ID GENERATION
// ============================================

/**
 * Generate a unique pass ID
 */
export const generatePassId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `pass_${timestamp}${random}`;
};

// ============================================
// PASS CRUD OPERATIONS
// ============================================

/**
 * Create/purchase a new annual pass
 */
export const createAnnualPass = async (
  input: PurchaseAnnualPassInput,
  transactionId?: string
): Promise<AnnualPass> => {
  // Check if user already has an active pass for this club
  const existingPass = await getActivePassForUserAndClub(input.odUserId, input.odClubId);
  if (existingPass) {
    throw new Error('User already has an active pass for this club');
  }
  
  const passId = generatePassId();
  const now = Date.now();
  
  // Calculate dates
  const startDate = input.startDate || new Date().toISOString().split('T')[0];
  const durationDays = input.durationDays || DEFAULT_PASS_DURATION_DAYS;
  const endDate = calculateEndDate(startDate, durationDays);
  
  const pass: AnnualPass = {
    id: passId,
    odUserId: input.odUserId,
    odClubId: input.odClubId,
    passType: input.passType || 'standard',
    status: 'active',
    purchasePrice: input.purchasePrice,
    currency: input.currency,
    startDate,
    endDate,
    purchasedAt: now,
    transactionId,
    usageCount: 0,
    totalSaved: 0,
    createdAt: now,
    updatedAt: now,
  };
  
  const docRef = doc(db, ANNUAL_PASSES_COLLECTION, passId);
  await setDoc(docRef, pass);
  
  return pass;
};

/**
 * Get an annual pass by ID
 */
export const getAnnualPass = async (
  passId: string
): Promise<AnnualPass | null> => {
  const docRef = doc(db, ANNUAL_PASSES_COLLECTION, passId);
  const snap = await getDoc(docRef);
  
  if (!snap.exists()) {
    return null;
  }
  
  return { id: snap.id, ...snap.data() } as AnnualPass;
};

/**
 * Get active pass for a user at a specific club
 */
export const getActivePassForUserAndClub = async (
  userId: string,
  clubId: string
): Promise<AnnualPass | null> => {
  const today = new Date().toISOString().split('T')[0];
  
  const q = query(
    collection(db, ANNUAL_PASSES_COLLECTION),
    where('odUserId', '==', userId),
    where('odClubId', '==', clubId),
    where('status', '==', 'active'),
    where('endDate', '>=', today),
    limit(1)
  );
  
  const snap = await getDocs(q);
  if (snap.empty) {
    return null;
  }
  
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as AnnualPass;
};

/**
 * Get all passes for a user
 */
export const getUserPasses = async (
  userId: string,
  includeExpired: boolean = false
): Promise<AnnualPass[]> => {
  let q;
  
  if (includeExpired) {
    q = query(
      collection(db, ANNUAL_PASSES_COLLECTION),
      where('odUserId', '==', userId),
      orderBy('createdAt', 'desc')
    );
  } else {
    const today = new Date().toISOString().split('T')[0];
    q = query(
      collection(db, ANNUAL_PASSES_COLLECTION),
      where('odUserId', '==', userId),
      where('endDate', '>=', today),
      orderBy('endDate', 'desc')
    );
  }
  
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as AnnualPass));
};

/**
 * Get all active passes for a club
 */
export const getClubActivePasses = async (
  clubId: string
): Promise<AnnualPass[]> => {
  const today = new Date().toISOString().split('T')[0];
  
  const q = query(
    collection(db, ANNUAL_PASSES_COLLECTION),
    where('odClubId', '==', clubId),
    where('status', '==', 'active'),
    where('endDate', '>=', today)
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as AnnualPass));
};

/**
 * Subscribe to user's passes
 */
export const subscribeToUserPasses = (
  userId: string,
  callback: (passes: AnnualPass[]) => void
): Unsubscribe => {
  const q = query(
    collection(db, ANNUAL_PASSES_COLLECTION),
    where('odUserId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  
  return onSnapshot(q, (snap) => {
    const passes = snap.docs.map(d => ({ id: d.id, ...d.data() } as AnnualPass));
    callback(passes);
  });
};

/**
 * Subscribe to a specific pass
 */
export const subscribeToPass = (
  passId: string,
  callback: (pass: AnnualPass | null) => void
): Unsubscribe => {
  const docRef = doc(db, ANNUAL_PASSES_COLLECTION, passId);
  
  return onSnapshot(docRef, (snap) => {
    if (snap.exists()) {
      callback({ id: snap.id, ...snap.data() } as AnnualPass);
    } else {
      callback(null);
    }
  });
};

// ============================================
// PASS STATUS MANAGEMENT
// ============================================

/**
 * Update pass status
 */
export const updatePassStatus = async (
  passId: string,
  status: AnnualPassStatus,
  reason?: string
): Promise<void> => {
  const docRef = doc(db, ANNUAL_PASSES_COLLECTION, passId);
  
  const updates: Record<string, any> = {
    status,
    updatedAt: Date.now(),
  };
  
  if (status === 'cancelled') {
    updates.cancelledAt = Date.now();
    updates.cancellationReason = reason;
  } else if (status === 'suspended') {
    updates.suspendedAt = Date.now();
    updates.suspensionReason = reason;
  }
  
  await updateDoc(docRef, updates);
};

/**
 * Suspend a pass
 */
export const suspendPass = async (
  passId: string,
  reason: string
): Promise<void> => {
  await updatePassStatus(passId, 'suspended', reason);
};

/**
 * Reactivate a suspended pass
 */
export const reactivatePass = async (
  passId: string
): Promise<void> => {
  const pass = await getAnnualPass(passId);
  if (!pass) {
    throw new Error(`Pass not found: ${passId}`);
  }
  
  // Check if pass is still within validity period
  const today = new Date().toISOString().split('T')[0];
  if (pass.endDate < today) {
    throw new Error('Cannot reactivate expired pass');
  }
  
  const docRef = doc(db, ANNUAL_PASSES_COLLECTION, passId);
  await updateDoc(docRef, {
    status: 'active',
    suspendedAt: null,
    suspensionReason: null,
    updatedAt: Date.now(),
  });
};

/**
 * Cancel a pass
 */
export const cancelPass = async (
  passId: string,
  reason: string
): Promise<void> => {
  await updatePassStatus(passId, 'cancelled', reason);
};

/**
 * Mark pass as expired
 * This should be called by a scheduled function
 */
export const expirePass = async (
  passId: string
): Promise<void> => {
  await updatePassStatus(passId, 'expired');
};

// ============================================
// PASS RENEWAL
// ============================================

/**
 * Check if a pass is eligible for renewal
 */
export const isPassEligibleForRenewal = (pass: AnnualPass): boolean => {
  if (pass.status === 'cancelled') {
    return false;
  }
  
  const today = new Date();
  const endDate = new Date(pass.endDate);
  const daysUntilExpiry = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  // Can renew if within grace period or already expired (within reason)
  return daysUntilExpiry <= RENEWAL_GRACE_PERIOD_DAYS && daysUntilExpiry >= -30;
};

/**
 * Renew an annual pass
 */
export const renewPass = async (
  passId: string,
  renewalPrice: number,
  transactionId?: string,
  durationDays: number = DEFAULT_PASS_DURATION_DAYS
): Promise<AnnualPass> => {
  const existingPass = await getAnnualPass(passId);
  if (!existingPass) {
    throw new Error(`Pass not found: ${passId}`);
  }
  
  if (!isPassEligibleForRenewal(existingPass)) {
    throw new Error('Pass is not eligible for renewal');
  }
  
  const now = Date.now();
  
  // Calculate new dates
  // If pass hasn't expired yet, extend from end date
  // If expired, start from today
  const today = new Date().toISOString().split('T')[0];
  const startDate = existingPass.endDate >= today ? existingPass.endDate : today;
  const newEndDate = calculateEndDate(startDate, durationDays);
  
  // Update the pass
  const docRef = doc(db, ANNUAL_PASSES_COLLECTION, passId);
  await updateDoc(docRef, {
    status: 'active',
    endDate: newEndDate,
    renewedAt: now,
    renewalPrice,
    renewalTransactionId: transactionId,
    previousEndDate: existingPass.endDate,
    updatedAt: now,
  });
  
  return {
    ...existingPass,
    status: 'active',
    endDate: newEndDate,
    renewedAt: now,
    updatedAt: now,
  };
};

/**
 * Get passes expiring soon
 * Useful for sending renewal reminders
 */
export const getPassesExpiringSoon = async (
  daysUntilExpiry: number = 14
): Promise<AnnualPass[]> => {
  const today = new Date();
  const futureDate = new Date(today);
  futureDate.setDate(futureDate.getDate() + daysUntilExpiry);
  
  const todayStr = today.toISOString().split('T')[0];
  const futureDateStr = futureDate.toISOString().split('T')[0];
  
  const q = query(
    collection(db, ANNUAL_PASSES_COLLECTION),
    where('status', '==', 'active'),
    where('endDate', '>=', todayStr),
    where('endDate', '<=', futureDateStr)
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as AnnualPass));
};

/**
 * Get expired passes that need status update
 */
export const getExpiredPasses = async (): Promise<AnnualPass[]> => {
  const today = new Date().toISOString().split('T')[0];
  
  const q = query(
    collection(db, ANNUAL_PASSES_COLLECTION),
    where('status', '==', 'active'),
    where('endDate', '<', today)
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as AnnualPass));
};

/**
 * Batch expire passes
 * Call this from a scheduled function
 */
export const batchExpirePasses = async (): Promise<number> => {
  const expiredPasses = await getExpiredPasses();
  
  for (const pass of expiredPasses) {
    await expirePass(pass.id);
  }
  
  return expiredPasses.length;
};

// ============================================
// PASS VALIDATION & USAGE
// ============================================

/**
 * Validate if a user can use their pass for a booking
 */
export const validatePassForBooking = async (
  userId: string,
  clubId: string,
  bookingDate: string,
  isPeakTime: boolean = false,
  config?: AnnualPassConfig
): Promise<PassValidationResult> => {
  // Get active pass
  const pass = await getActivePassForUserAndClub(userId, clubId);
  
  if (!pass) {
    return {
      valid: false,
      error: 'No active annual pass found',
      errorCode: 'NO_PASS',
    };
  }
  
  // Check if pass is active
  if (pass.status !== 'active') {
    return {
      valid: false,
      error: `Pass is ${pass.status}`,
      errorCode: 'SUSPENDED',
    };
  }
  
  // Check if booking date is within pass validity
  if (bookingDate < pass.startDate || bookingDate > pass.endDate) {
    return {
      valid: false,
      error: 'Booking date is outside pass validity period',
      errorCode: 'EXPIRED',
    };
  }
  
  // Check peak time restriction if config provided
  if (config && isPeakTime && !config.allowPeakHours) {
    return {
      valid: false,
      error: 'Pass cannot be used during peak hours',
      errorCode: 'NOT_ALLOWED',
    };
  }
  
  // Check daily/weekly limits if config provided
  if (config && config.maxBookingsPerDay > 0) {
    const dailyUsage = await countPassUsageForDate(pass.id, bookingDate);
    if (dailyUsage >= config.maxBookingsPerDay) {
      return {
        valid: false,
        error: `Daily booking limit reached (${config.maxBookingsPerDay})`,
        errorCode: 'LIMIT_REACHED',
      };
    }
  }
  
  // Pass is valid
  return {
    valid: true,
    passId: pass.id,
    discountPercent: config?.discountPercent ?? 100, // Default to 100% (free)
  };
};

/**
 * Record pass usage for a booking
 */
export const recordPassUsage = async (
  passId: string,
  bookingId: string,
  bookingDate: string,
  courtId: string,
  courtName: string,
  startTime: string,
  endTime: string,
  amountSaved: number
): Promise<PassUsageRecord> => {
  const pass = await getAnnualPass(passId);
  if (!pass) {
    throw new Error(`Pass not found: ${passId}`);
  }
  
  // Create usage record
  const usageId = `usage_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`;
  const usage: PassUsageRecord = {
    id: usageId,
    passId,
    odUserId: pass.odUserId,
    odClubId: pass.odClubId,
    bookingId,
    bookingDate,
    courtId,
    courtName,
    startTime,
    endTime,
    amountSaved,
    usedAt: Date.now(),
  };
  
  // Save usage record in a subcollection
  const usageRef = doc(db, ANNUAL_PASSES_COLLECTION, passId, 'usage', usageId);
  await setDoc(usageRef, usage);
  
  // Update pass statistics
  const passRef = doc(db, ANNUAL_PASSES_COLLECTION, passId);
  await updateDoc(passRef, {
    usageCount: increment(1),
    totalSaved: increment(amountSaved),
    lastUsedAt: Date.now(),
    updatedAt: Date.now(),
  });
  
  return usage;
};

/**
 * Get pass usage history
 */
export const getPassUsageHistory = async (
  passId: string,
  limitCount: number = 50
): Promise<PassUsageRecord[]> => {
  const q = query(
    collection(db, ANNUAL_PASSES_COLLECTION, passId, 'usage'),
    orderBy('usedAt', 'desc'),
    limit(limitCount)
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as PassUsageRecord));
};

/**
 * Count pass usage for a specific date
 */
export const countPassUsageForDate = async (
  passId: string,
  date: string
): Promise<number> => {
  const q = query(
    collection(db, ANNUAL_PASSES_COLLECTION, passId, 'usage'),
    where('bookingDate', '==', date)
  );
  
  const snap = await getDocs(q);
  return snap.size;
};

/**
 * Get pass usage for a date range
 */
export const getPassUsageForDateRange = async (
  passId: string,
  startDate: string,
  endDate: string
): Promise<PassUsageRecord[]> => {
  const q = query(
    collection(db, ANNUAL_PASSES_COLLECTION, passId, 'usage'),
    where('bookingDate', '>=', startDate),
    where('bookingDate', '<=', endDate),
    orderBy('bookingDate', 'desc')
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as PassUsageRecord));
};

// ============================================
// PASS STATISTICS
// ============================================

/**
 * Get pass usage statistics
 */
export const getPassUsageStats = async (
  passId: string
): Promise<PassUsageStats> => {
  const pass = await getAnnualPass(passId);
  if (!pass) {
    throw new Error(`Pass not found: ${passId}`);
  }
  
  // Get this month's usage
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString().split('T')[0];
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString().split('T')[0];
  
  const monthUsage = await getPassUsageForDateRange(passId, monthStart, monthEnd);
  
  const bookingsThisMonth = monthUsage.length;
  const savedThisMonth = monthUsage.reduce((sum, u) => sum + u.amountSaved, 0);
  
  // Calculate averages
  const averageSavingsPerBooking = pass.usageCount > 0
    ? Math.round(pass.totalSaved / pass.usageCount)
    : 0;
  
  // Find most used court
  const courtCounts: Record<string, number> = {};
  for (const usage of monthUsage) {
    courtCounts[usage.courtName] = (courtCounts[usage.courtName] || 0) + 1;
  }
  const mostUsedCourt = Object.entries(courtCounts)
    .sort(([, a], [, b]) => b - a)[0]?.[0];
  
  // Find peak usage day
  const dayCounts: Record<string, number> = {};
  for (const usage of monthUsage) {
    const dayOfWeek = new Date(usage.bookingDate).toLocaleDateString('en-US', { weekday: 'long' });
    dayCounts[dayOfWeek] = (dayCounts[dayOfWeek] || 0) + 1;
  }
  const peakUsageDay = Object.entries(dayCounts)
    .sort(([, a], [, b]) => b - a)[0]?.[0];
  
  return {
    totalBookings: pass.usageCount,
    totalSaved: pass.totalSaved,
    bookingsThisMonth,
    savedThisMonth,
    averageSavingsPerBooking,
    mostUsedCourt,
    peakUsageDay,
  };
};

/**
 * Get club's annual pass statistics
 */
export const getClubPassStats = async (
  clubId: string
): Promise<{
  activePasses: number;
  totalRevenue: number;
  totalSavingsProvided: number;
  averageUsagePerPass: number;
}> => {
  const activePasses = await getClubActivePasses(clubId);
  
  const totalRevenue = activePasses.reduce((sum, p) => sum + p.purchasePrice, 0);
  const totalSavingsProvided = activePasses.reduce((sum, p) => sum + p.totalSaved, 0);
  const totalUsage = activePasses.reduce((sum, p) => sum + p.usageCount, 0);
  const averageUsagePerPass = activePasses.length > 0
    ? Math.round(totalUsage / activePasses.length)
    : 0;
  
  return {
    activePasses: activePasses.length,
    totalRevenue,
    totalSavingsProvided,
    averageUsagePerPass,
  };
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Calculate end date from start date and duration
 */
export const calculateEndDate = (
  startDate: string,
  durationDays: number
): string => {
  const date = new Date(startDate);
  date.setDate(date.getDate() + durationDays);
  return date.toISOString().split('T')[0];
};

/**
 * Get days remaining on a pass
 */
export const getDaysRemaining = (pass: AnnualPass): number => {
  const today = new Date();
  const endDate = new Date(pass.endDate);
  const diffTime = endDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

/**
 * Check if pass is currently active and valid
 */
export const isPassActiveAndValid = (pass: AnnualPass): boolean => {
  if (pass.status !== 'active') {
    return false;
  }
  
  const today = new Date().toISOString().split('T')[0];
  return pass.startDate <= today && pass.endDate >= today;
};

/**
 * Get pass status label for display
 */
export const getPassStatusLabel = (status: AnnualPassStatus): string => {
  const labels: Record<AnnualPassStatus, string> = {
    active: 'Active',
    expired: 'Expired',
    suspended: 'Suspended',
    cancelled: 'Cancelled',
  };
  return labels[status] || status;
};

/**
 * Get pass status color for UI
 */
export const getPassStatusColor = (status: AnnualPassStatus): string => {
  const colors: Record<AnnualPassStatus, string> = {
    active: 'green',
    expired: 'gray',
    suspended: 'orange',
    cancelled: 'red',
  };
  return colors[status] || 'gray';
};

/**
 * Format savings amount for display
 */
export const formatSavings = (
  amount: number,
  currency: SupportedCurrency
): string => {
  const dollars = amount / 100;
  const symbols: Record<SupportedCurrency, string> = {
    nzd: 'NZ$',
    aud: 'A$',
    usd: '$',
  };
  return `${symbols[currency]}${dollars.toFixed(2)}`;
};

/**
 * Calculate value/ROI of a pass
 */
export const calculatePassValue = (pass: AnnualPass): {
  roi: number;
  valueRating: 'excellent' | 'good' | 'fair' | 'poor';
} => {
  if (pass.purchasePrice === 0) {
    return { roi: 0, valueRating: 'excellent' };
  }
  
  const roi = ((pass.totalSaved - pass.purchasePrice) / pass.purchasePrice) * 100;
  
  let valueRating: 'excellent' | 'good' | 'fair' | 'poor';
  if (roi >= 100) {
    valueRating = 'excellent';
  } else if (roi >= 50) {
    valueRating = 'good';
  } else if (roi >= 0) {
    valueRating = 'fair';
  } else {
    valueRating = 'poor';
  }
  
  return { roi: Math.round(roi), valueRating };
};

/**
 * Create default pass config for a club
 */
export const createDefaultPassConfig = (
  currency: SupportedCurrency = 'nzd'
): AnnualPassConfig => ({
  enabled: false,
  price: 50000, // $500
  currency,
  durationDays: 365,
  discountPercent: 100, // Free bookings
  maxBookingsPerDay: 2,
  maxBookingsPerWeek: 0, // Unlimited
  allowPeakHours: true,
  allowTournaments: false,
  description: 'Unlimited court bookings for one year',
});
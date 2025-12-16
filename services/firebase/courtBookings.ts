/**
 * Court Booking Firebase Services
 * 
 * Database operations for club court bookings
 * 
 * FILE LOCATION: services/firebase/courtBookings.ts
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
  deleteDoc,
} from '@firebase/firestore';
import { db } from './config';
import type {
  ClubCourt,
  ClubBookingSettings,
  CourtBooking,
} from '../../types';

// ============================================
// CLUB COURTS CRUD
// ============================================

/**
 * Add a new court to a club
 */
export const addClubCourt = async (
  clubId: string,
  court: Partial<ClubCourt>
): Promise<string> => {
  const courtRef = doc(collection(db, 'clubs', clubId, 'courts'));
  const now = Date.now();
  
  const newCourt: ClubCourt = {
    id: courtRef.id,
    clubId,
    name: court.name || 'New Court',
    description: court.description || null,
    isActive: court.isActive !== false,
    order: court.order || 0,
    createdAt: now,
    updatedAt: now,
    // Support enhanced fields if provided
    ...(court.grade && { grade: court.grade }),
    ...(court.location && { location: court.location }),
    ...(court.surfaceType && { surfaceType: court.surfaceType }),
    ...(court.features && { features: court.features }),
    ...(court.additionalFees && { additionalFees: court.additionalFees }),
    ...(court.useCustomPricing !== undefined && { useCustomPricing: court.useCustomPricing }),
    ...(court.customBasePrice !== undefined && { customBasePrice: court.customBasePrice }),
  } as ClubCourt;
  
  await setDoc(courtRef, newCourt);
  return courtRef.id;
};

/**
 * Update a court
 */
export const updateClubCourt = async (
  clubId: string,
  courtId: string,
  updates: Partial<ClubCourt>
): Promise<void> => {
  await updateDoc(doc(db, 'clubs', clubId, 'courts', courtId), {
    ...updates,
    updatedAt: Date.now(),
  });
};

/**
 * Delete a court (only if no future bookings)
 */
export const deleteClubCourt = async (
  clubId: string,
  courtId: string
): Promise<void> => {
  const bookingsQuery = query(
    collection(db, 'clubs', clubId, 'bookings'),
    where('courtId', '==', courtId)
  );
  
  const bookingsSnap = await getDocs(bookingsQuery);
  const today = new Date().toISOString().split('T')[0];
  
  const futureBookings = bookingsSnap.docs.filter(doc => {
    const booking = doc.data();
    return booking.date >= today && booking.status === 'confirmed';
  });
  
  if (futureBookings.length > 0) {
    throw new Error(`Cannot delete court with ${futureBookings.length} future booking(s). Cancel them first.`);
  }
  
  await deleteDoc(doc(db, 'clubs', clubId, 'courts', courtId));
};

/**
 * Get all courts for a club
 */
export const getClubCourts = async (clubId: string): Promise<ClubCourt[]> => {
  const q = query(
    collection(db, 'clubs', clubId, 'courts'),
    orderBy('order', 'asc')
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as ClubCourt);
};

/**
 * Subscribe to club courts
 */
export const subscribeToClubCourts = (
  clubId: string,
  callback: (courts: ClubCourt[]) => void
): (() => void) => {
  const q = query(
    collection(db, 'clubs', clubId, 'courts'),
    orderBy('order', 'asc')
  );
  
  return onSnapshot(q, (snap) => {
    const courts = snap.docs.map(d => d.data() as ClubCourt);
    callback(courts);
  }, (error) => {
    console.error('Error subscribing to courts:', error);
    callback([]);
  });
};

// ============================================
// BOOKING SETTINGS
// ============================================

/**
 * Get club booking settings
 */
export const getClubBookingSettings = async (
  clubId: string
): Promise<ClubBookingSettings | null> => {
  try {
    const docSnap = await getDoc(doc(db, 'clubs', clubId));
    if (!docSnap.exists()) return null;
    
    const club = docSnap.data();
    return club.bookingSettings || null;
  } catch (error) {
    console.error('Error getting booking settings:', error);
    return null;
  }
};

/**
 * Update club booking settings
 */
export const updateClubBookingSettings = async (
  clubId: string,
  settings: ClubBookingSettings
): Promise<void> => {
  await updateDoc(doc(db, 'clubs', clubId), {
    bookingSettings: settings,
    updatedAt: Date.now(),
  });
};

// ============================================
// BOOKINGS CRUD
// ============================================

/**
 * Create a new booking
 */
export const createCourtBooking = async (
  clubId: string,
  booking: Omit<CourtBooking, 'id' | 'clubId' | 'createdAt' | 'updatedAt' | 'status'>
): Promise<string> => {
  // Validate no conflicts
  const existingBookings = await getBookingsForDate(clubId, booking.date);
  const conflict = existingBookings.find(
    b => b.courtId === booking.courtId && 
         b.startTime === booking.startTime && 
         b.status === 'confirmed'
  );
  
  if (conflict) {
    throw new Error('This slot is already booked');
  }
  
  const bookingRef = doc(collection(db, 'clubs', clubId, 'bookings'));
  const now = Date.now();
  
  const newBooking: CourtBooking = {
    ...booking,
    id: bookingRef.id,
    clubId,
    status: 'confirmed',
    createdAt: now,
    updatedAt: now,
  };
  
  await setDoc(bookingRef, newBooking);
  return bookingRef.id;
};

/**
 * Cancel a booking
 */
export const cancelCourtBooking = async (
  clubId: string,
  bookingId: string,
  cancelledByUserId: string
): Promise<void> => {
  await updateDoc(doc(db, 'clubs', clubId, 'bookings', bookingId), {
    status: 'cancelled',
    cancelledAt: Date.now(),
    cancelledByUserId,
    updatedAt: Date.now(),
  });
};

/**
 * Get bookings for a specific date
 */
export const getBookingsForDate = async (
  clubId: string,
  date: string
): Promise<CourtBooking[]> => {
  const q = query(
    collection(db, 'clubs', clubId, 'bookings'),
    where('date', '==', date)
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as CourtBooking);
};

/**
 * Get bookings for a date range
 */
export const getBookingsForDateRange = async (
  clubId: string,
  startDate: string,
  endDate: string
): Promise<CourtBooking[]> => {
  const q = query(
    collection(db, 'clubs', clubId, 'bookings'),
    where('date', '>=', startDate),
    where('date', '<=', endDate)
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as CourtBooking);
};

/**
 * Subscribe to bookings for a date
 */
export const subscribeToBookingsForDate = (
  clubId: string,
  date: string,
  callback: (bookings: CourtBooking[]) => void
): (() => void) => {
  const q = query(
    collection(db, 'clubs', clubId, 'bookings'),
    where('date', '==', date)
  );
  
  return onSnapshot(q, (snap) => {
    const bookings = snap.docs.map(d => d.data() as CourtBooking);
    callback(bookings);
  }, (error) => {
    console.error('Error subscribing to bookings:', error);
    callback([]);
  });
};

/**
 * Get user's bookings (upcoming)
 */
export const getUserBookings = async (
  clubId: string,
  userId: string
): Promise<CourtBooking[]> => {
  const today = new Date().toISOString().split('T')[0];
  
  const q = query(
    collection(db, 'clubs', clubId, 'bookings'),
    where('bookedByUserId', '==', userId),
    where('date', '>=', today),
    where('status', '==', 'confirmed'),
    orderBy('date', 'asc')
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as CourtBooking);
};

/**
 * Get user's booking count for a specific date
 */
export const getUserBookingCountForDate = async (
  clubId: string,
  userId: string,
  date: string
): Promise<number> => {
  const q = query(
    collection(db, 'clubs', clubId, 'bookings'),
    where('bookedByUserId', '==', userId),
    where('date', '==', date),
    where('status', '==', 'confirmed')
  );
  
  const snap = await getDocs(q);
  return snap.size;
};

/**
 * Check if user can book (within daily limit)
 */
export const canUserBook = async (
  clubId: string,
  userId: string,
  date: string,
  maxPerDay: number
): Promise<{ canBook: boolean; currentCount: number }> => {
  const count = await getUserBookingCountForDate(clubId, userId, date);
  return {
    canBook: count < maxPerDay,
    currentCount: count,
  };
};

/**
 * Check if booking can be cancelled (within cancellation window)
 */
export const canCancelBooking = (
  booking: CourtBooking,
  cancellationMinutes: number
): boolean => {
  const bookingDateTime = new Date(`${booking.date}T${booking.startTime}`);
  const now = new Date();
  const diffMinutes = (bookingDateTime.getTime() - now.getTime()) / 60000;
  return diffMinutes >= cancellationMinutes;
};

// ============================================
// TIME SLOT HELPERS
// ============================================

/**
 * Generate time slots for a day
 */
export const generateTimeSlots = (
  openTime: string,
  closeTime: string,
  durationMinutes: number
): string[] => {
  const slots: string[] = [];
  
  const [openHour, openMin] = openTime.split(':').map(Number);
  const [closeHour, closeMin] = closeTime.split(':').map(Number);
  
  let currentMinutes = openHour * 60 + openMin;
  const endMinutes = closeHour * 60 + closeMin;
  
  while (currentMinutes + durationMinutes <= endMinutes) {
    const hour = Math.floor(currentMinutes / 60);
    const min = currentMinutes % 60;
    slots.push(`${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`);
    currentMinutes += durationMinutes;
  }
  
  return slots;
};

/**
 * Calculate end time from start time and duration
 */
export const calculateEndTime = (startTime: string, durationMinutes: number): string => {
  const [hour, min] = startTime.split(':').map(Number);
  const totalMinutes = hour * 60 + min + durationMinutes;
  const endHour = Math.floor(totalMinutes / 60);
  const endMin = totalMinutes % 60;
  return `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`;
};

/**
 * Check if a slot is in the past
 */
export const isSlotInPast = (date: string, time: string): boolean => {
  const slotDateTime = new Date(`${date}T${time}`);
  return slotDateTime < new Date();
};

/**
 * Format date for display
 */
export const formatDateLabel = (dateString: string): string => {
  const date = new Date(dateString);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
};
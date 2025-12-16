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
  writeBatch,
} from '@firebase/firestore';
import { db } from './config';
import type {
  ClubCourt,
  ClubBookingSettings,
  CourtBooking,
  BookingStatus,
  DEFAULT_BOOKING_SETTINGS,
} from '../../types';

// ============================================
// CLUB COURTS CRUD
// ============================================

/**
 * Add a new court to a club
 */
export const addClubCourt = async (
  clubId: string,
  court: Omit<ClubCourt, 'id' | 'clubId' | 'createdAt' | 'updatedAt'>
): Promise<string> => {
  const courtRef = doc(collection(db, 'clubs', clubId, 'courts'));
  const now = Date.now();
  
  const newCourt: ClubCourt = {
    ...court,
    id: courtRef.id,
    clubId,
    createdAt: now,
    updatedAt: now,
  };
  
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
  // Get all bookings for this court
  const bookingsQuery = query(
    collection(db, 'clubs', clubId, 'bookings'),
    where('courtId', '==', courtId)
  );
  
  const bookingsSnap = await getDocs(bookingsQuery);
  
  // Filter in JavaScript for future confirmed bookings
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
  const docSnap = await getDoc(doc(db, 'clubs', clubId));
  if (!docSnap.exists()) return null;
  
  const club = docSnap.data();
  return club.bookingSettings || null;
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
  const conflict = existingBookings.find(b => 
    b.courtId === booking.courtId && 
    b.startTime === booking.startTime &&
    b.status === 'confirmed'
  );
  
  if (conflict) {
    throw new Error('This time slot is already booked');
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
    where('date', '<=', endDate),
    orderBy('date', 'asc')
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
  const diffMinutes = (bookingDateTime.getTime() - now.getTime()) / (1000 * 60);
  
  return diffMinutes >= cancellationMinutes;
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate time slots for a day based on settings
 */
export const generateTimeSlots = (
  openTime: string,
  closeTime: string,
  slotDurationMinutes: number
): string[] => {
  const slots: string[] = [];
  
  const [openHour, openMin] = openTime.split(':').map(Number);
  const [closeHour, closeMin] = closeTime.split(':').map(Number);
  
  let currentMinutes = openHour * 60 + openMin;
  const endMinutes = closeHour * 60 + closeMin;
  
  while (currentMinutes + slotDurationMinutes <= endMinutes) {
    const hours = Math.floor(currentMinutes / 60);
    const mins = currentMinutes % 60;
    slots.push(`${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`);
    currentMinutes += slotDurationMinutes;
  }
  
  return slots;
};

/**
 * Calculate end time given start time and duration
 */
export const calculateEndTime = (
  startTime: string,
  durationMinutes: number
): string => {
  const [hours, mins] = startTime.split(':').map(Number);
  const totalMinutes = hours * 60 + mins + durationMinutes;
  const endHours = Math.floor(totalMinutes / 60);
  const endMins = totalMinutes % 60;
  return `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
};

/**
 * Check if a time slot is in the past
 */
export const isSlotInPast = (date: string, time: string): boolean => {
  const slotDateTime = new Date(`${date}T${time}`);
  return slotDateTime < new Date();
};

/**
 * Format date for display
 */
export const formatDateLabel = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
};
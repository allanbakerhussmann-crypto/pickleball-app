/**
 * Meetup Attendance Service
 *
 * Frontend service for meetup RSVP, check-in, guest management,
 * and session management. All mutations go through Cloud Functions.
 *
 * @version 07.61
 * @file services/firebase/meetupAttendance.ts
 */

import { httpsCallable } from '@firebase/functions';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  getDocs,
  doc,
  getDoc,
} from '@firebase/firestore';
import { db, functions } from './config';
import type { MeetupRSVP, MeetupGuest } from '../../types';

// =============================================================================
// RSVP Functions
// =============================================================================

/**
 * RSVP to a paid meetup - returns Stripe checkout URL
 */
export async function rsvpWithPayment(
  meetupId: string,
  successUrl: string,
  cancelUrl: string
): Promise<{ checkoutUrl?: string; waitlisted?: boolean; waitlistPosition?: number }> {
  const fn = httpsCallable<
    { meetupId: string; successUrl: string; cancelUrl: string },
    { success: boolean; checkoutUrl?: string; sessionId?: string; waitlisted?: boolean; waitlistPosition?: number }
  >(functions, 'meetup_rsvpWithPayment');

  const result = await fn({ meetupId, successUrl, cancelUrl });
  return result.data;
}

/**
 * RSVP to a free meetup
 */
export async function rsvpFree(
  meetupId: string
): Promise<{ waitlisted: boolean; waitlistPosition?: number }> {
  const fn = httpsCallable<
    { meetupId: string },
    { success: boolean; waitlisted: boolean; waitlistPosition?: number }
  >(functions, 'meetup_rsvpFree');

  const result = await fn({ meetupId });
  return result.data;
}

/**
 * Cancel RSVP (player cancels themselves)
 */
export async function cancelRsvp(
  meetupId: string
): Promise<{ refundEligible: boolean; promotedUserId: string | null }> {
  const fn = httpsCallable<
    { meetupId: string },
    { success: boolean; refundEligible: boolean; promotedUserId: string | null }
  >(functions, 'meetup_cancelRsvp');

  const result = await fn({ meetupId });
  return result.data;
}

// =============================================================================
// Check-In Functions (Organizer actions)
// =============================================================================

/**
 * Manual check-in of a player (organizer action)
 */
export async function checkInPlayer(
  meetupId: string,
  targetUserId: string
): Promise<{ checkedInAt: number }> {
  const fn = httpsCallable<
    { meetupId: string; targetUserId: string },
    { success: boolean; checkedInAt: number }
  >(functions, 'meetup_manualCheckIn');

  const result = await fn({ meetupId, targetUserId });
  return result.data;
}

/**
 * Undo check-in (organizer action)
 */
export async function undoCheckIn(
  meetupId: string,
  targetUserId: string
): Promise<void> {
  const fn = httpsCallable<
    { meetupId: string; targetUserId: string },
    { success: boolean }
  >(functions, 'meetup_undoCheckIn');

  await fn({ meetupId, targetUserId });
}

/**
 * Mark player as no-show (organizer action)
 */
export async function markNoShow(
  meetupId: string,
  targetUserId: string
): Promise<void> {
  const fn = httpsCallable<
    { meetupId: string; targetUserId: string },
    { success: boolean }
  >(functions, 'meetup_markNoShow');

  await fn({ meetupId, targetUserId });
}

/**
 * Undo no-show marking (organizer action)
 */
export async function undoNoShow(
  meetupId: string,
  targetUserId: string
): Promise<void> {
  const fn = httpsCallable<
    { meetupId: string; targetUserId: string },
    { success: boolean }
  >(functions, 'meetup_undoNoShow');

  await fn({ meetupId, targetUserId });
}

// =============================================================================
// Guest Management
// =============================================================================

/**
 * Add a cash guest (organizer action)
 */
export async function addCashGuest(
  meetupId: string,
  data: { name: string; email?: string; amount: number; notes?: string; emailConsent?: boolean }
): Promise<{ guestId: string }> {
  const fn = httpsCallable<
    { meetupId: string; name: string; email?: string; amount: number; notes?: string; emailConsent?: boolean },
    { success: boolean; guestId: string }
  >(functions, 'meetup_addCashGuest');

  const result = await fn({ meetupId, ...data });
  return result.data;
}

/**
 * Get all guests for a meetup
 */
export async function getMeetupGuests(meetupId: string): Promise<MeetupGuest[]> {
  const guestsRef = collection(db, 'meetups', meetupId, 'guests');
  const q = query(guestsRef, orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as MeetupGuest));
}

// =============================================================================
// Session Management
// =============================================================================

/**
 * Close meetup session - marks remaining confirmed as no-show
 */
export async function closeMeetupSession(
  meetupId: string
): Promise<{ closedAt: number; finalCounts: { checkedIn: number; guests: number; noShows: number; totalPlayed: number } }> {
  const fn = httpsCallable<
    { meetupId: string },
    { success: boolean; closedAt: number; finalCounts: { checkedIn: number; guests: number; noShows: number; totalPlayed: number } }
  >(functions, 'meetup_closeSession');

  const result = await fn({ meetupId });
  return result.data;
}

// =============================================================================
// Real-Time Subscriptions
// =============================================================================

/**
 * Subscribe to real-time RSVP list for a meetup
 * Returns unsubscribe function
 */
export function subscribeToMeetupRsvps(
  meetupId: string,
  callback: (rsvps: MeetupRSVP[]) => void
): () => void {
  const rsvpsRef = collection(db, 'meetups', meetupId, 'rsvps');
  const q = query(rsvpsRef, orderBy('rsvpAt', 'asc'));

  return onSnapshot(q, (snapshot) => {
    const rsvps = snapshot.docs.map(d => ({
      ...d.data(),
      odUserId: d.id,
    } as MeetupRSVP));
    callback(rsvps);
  });
}

/**
 * Subscribe to real-time guest list for a meetup
 */
export function subscribeToMeetupGuests(
  meetupId: string,
  callback: (guests: MeetupGuest[]) => void
): () => void {
  const guestsRef = collection(db, 'meetups', meetupId, 'guests');
  const q = query(guestsRef, orderBy('createdAt', 'desc'));

  return onSnapshot(q, (snapshot) => {
    const guests = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data(),
    } as MeetupGuest));
    callback(guests);
  });
}

/**
 * Get a single RSVP for current user
 */
export async function getMeetupRsvp(
  meetupId: string,
  userId: string
): Promise<MeetupRSVP | null> {
  const rsvpRef = doc(db, 'meetups', meetupId, 'rsvps', userId);
  const rsvpSnap = await getDoc(rsvpRef);

  if (!rsvpSnap.exists()) return null;
  return { ...rsvpSnap.data(), odUserId: rsvpSnap.id } as MeetupRSVP;
}

/**
 * Get confirmed RSVPs count
 */
export async function getConfirmedCount(meetupId: string): Promise<number> {
  const rsvpsRef = collection(db, 'meetups', meetupId, 'rsvps');
  const q = query(rsvpsRef, where('status', '==', 'confirmed'));
  const snap = await getDocs(q);
  return snap.size;
}

/**
 * Get waitlisted RSVPs ordered by position
 */
export async function getWaitlist(meetupId: string): Promise<MeetupRSVP[]> {
  const rsvpsRef = collection(db, 'meetups', meetupId, 'rsvps');
  const q = query(rsvpsRef, where('status', '==', 'waitlisted'), orderBy('rsvpAt', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ...d.data(), odUserId: d.id } as MeetupRSVP));
}

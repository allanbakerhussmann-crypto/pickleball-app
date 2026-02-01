/**
 * Standing Meetup Registrations Service
 *
 * Client-side query functions for standing meetup registrations.
 * Note: Registration creation is handled by Cloud Functions.
 *
 * MVP Hybrid model:
 * - Stripe: Registration created ONLY on webhook success (no pending state)
 * - Bank Transfer: Pending registration created immediately
 *
 * @version 07.57
 * @file services/firebase/standingMeetupRegistrations.ts
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Unsubscribe,
} from '@firebase/firestore';
import { db } from './index';
import { StandingMeetupRegistration } from '../../types/standingMeetup';

// =============================================================================
// Collection Reference
// =============================================================================

const REGISTRATIONS_COLLECTION = 'standingMeetupRegistrations';

// =============================================================================
// Registration Queries
// =============================================================================

/**
 * Get a registration by ID
 */
export async function getRegistration(
  registrationId: string
): Promise<StandingMeetupRegistration | null> {
  const docRef = doc(db, REGISTRATIONS_COLLECTION, registrationId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return null;
  }

  return { id: docSnap.id, ...docSnap.data() } as StandingMeetupRegistration;
}

/**
 * Build deterministic registration ID
 */
export function buildRegistrationId(standingMeetupId: string, userId: string): string {
  return `${standingMeetupId}_${userId}`;
}

/**
 * Get a user's registration for a specific meetup
 * Returns null if not registered
 */
export async function getRegistrationByMeetupAndUser(
  standingMeetupId: string,
  userId: string
): Promise<StandingMeetupRegistration | null> {
  const registrationId = buildRegistrationId(standingMeetupId, userId);
  return getRegistration(registrationId);
}

/**
 * Check if user is registered (active status)
 */
export async function isUserRegistered(
  standingMeetupId: string,
  userId: string
): Promise<boolean> {
  const registration = await getRegistrationByMeetupAndUser(standingMeetupId, userId);
  return registration !== null && registration.status === 'active';
}

/**
 * Check if user has paid (active + paid)
 */
export async function hasUserPaid(
  standingMeetupId: string,
  userId: string
): Promise<boolean> {
  const registration = await getRegistrationByMeetupAndUser(standingMeetupId, userId);
  return registration !== null &&
         registration.status === 'active' &&
         registration.paymentStatus === 'paid';
}

/**
 * Get all registrations for a user (for profile page)
 * Includes pending bank transfers and paid registrations
 */
export async function getRegistrationsByUser(
  userId: string,
  options?: {
    status?: 'active' | 'cancelled';
    paymentStatus?: 'pending' | 'paid';
    limit?: number;
  }
): Promise<StandingMeetupRegistration[]> {
  let q = query(
    collection(db, REGISTRATIONS_COLLECTION),
    where('odUserId', '==', userId),
    orderBy('createdAt', 'desc')
  );

  if (options?.status) {
    q = query(
      collection(db, REGISTRATIONS_COLLECTION),
      where('odUserId', '==', userId),
      where('status', '==', options.status),
      orderBy('createdAt', 'desc')
    );
  }

  if (options?.paymentStatus) {
    q = query(
      collection(db, REGISTRATIONS_COLLECTION),
      where('odUserId', '==', userId),
      where('paymentStatus', '==', options.paymentStatus),
      orderBy('createdAt', 'desc')
    );
  }

  if (options?.limit) {
    q = query(q, limit(options.limit));
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map(
    (doc) => ({ id: doc.id, ...doc.data() } as StandingMeetupRegistration)
  );
}

/**
 * Get pending bank transfer registrations for a meetup (organizer view)
 */
export async function getPendingRegistrationsByMeetup(
  standingMeetupId: string
): Promise<StandingMeetupRegistration[]> {
  const q = query(
    collection(db, REGISTRATIONS_COLLECTION),
    where('standingMeetupId', '==', standingMeetupId),
    where('paymentMethod', '==', 'bank_transfer'),
    where('paymentStatus', '==', 'pending'),
    where('status', '==', 'active'),
    orderBy('createdAt', 'asc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(
    (doc) => ({ id: doc.id, ...doc.data() } as StandingMeetupRegistration)
  );
}

/**
 * Get all active registrations for a meetup (organizer view)
 * Includes both paid and pending registrations
 */
export async function getRegistrationsByMeetup(
  standingMeetupId: string,
  options?: {
    paymentStatus?: 'pending' | 'paid';
    limit?: number;
  }
): Promise<StandingMeetupRegistration[]> {
  let q = query(
    collection(db, REGISTRATIONS_COLLECTION),
    where('standingMeetupId', '==', standingMeetupId),
    where('status', '==', 'active'),
    orderBy('createdAt', 'desc')
  );

  if (options?.paymentStatus) {
    q = query(
      collection(db, REGISTRATIONS_COLLECTION),
      where('standingMeetupId', '==', standingMeetupId),
      where('status', '==', 'active'),
      where('paymentStatus', '==', options.paymentStatus),
      orderBy('createdAt', 'desc')
    );
  }

  if (options?.limit) {
    q = query(q, limit(options.limit));
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map(
    (doc) => ({ id: doc.id, ...doc.data() } as StandingMeetupRegistration)
  );
}

// =============================================================================
// Real-time Subscriptions
// =============================================================================

/**
 * Subscribe to a user's registration(s) for a specific meetup
 * Returns the COMBINED registration (merges multiple registrations if user added sessions)
 */
export function subscribeToUserRegistrationForMeetup(
  standingMeetupId: string,
  userId: string,
  callback: (registration: StandingMeetupRegistration | null) => void
): Unsubscribe {
  // Query by odUserId + status only (simpler index)
  // Then filter client-side for this specific meetup
  const q = query(
    collection(db, REGISTRATIONS_COLLECTION),
    where('odUserId', '==', userId),
    where('status', '==', 'active')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        callback(null);
        return;
      }

      // Get all registrations and filter to this specific meetup
      const allRegistrations = snapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as StandingMeetupRegistration)
      );

      // Filter to only registrations for this meetup
      const registrations = allRegistrations.filter(
        (reg) => reg.standingMeetupId === standingMeetupId
      );

      if (registrations.length === 0) {
        callback(null);
        return;
      }

      // If only one registration, return it directly
      if (registrations.length === 1) {
        callback(registrations[0]);
        return;
      }

      // Multiple registrations - combine them
      // Check if any is a season pass (takes precedence)
      const seasonPass = registrations.find(r => r.registrationType === 'season_pass');
      if (seasonPass) {
        callback(seasonPass);
        return;
      }

      // Combine all pick_and_pay registrations
      // Track paid vs pending sessions separately
      const paidSessionIds: string[] = [];
      const pendingSessionIds: string[] = [];

      registrations.forEach(reg => {
        const sessionIds = reg.selectedSessionIds || [];
        if (reg.paymentStatus === 'paid') {
          paidSessionIds.push(...sessionIds);
        } else {
          pendingSessionIds.push(...sessionIds);
        }
      });

      const combined: StandingMeetupRegistration = {
        ...registrations[0], // Use first registration as base
        // Combine all session IDs from all registrations
        selectedSessionIds: [...paidSessionIds, ...pendingSessionIds],
        // Track paid vs pending separately (extended fields)
        paidSessionIds,
        pendingSessionIds,
        // Sum up amounts and session counts
        amount: registrations.reduce((sum, reg) => sum + reg.amount, 0),
        sessionCount: registrations.reduce((sum, reg) => sum + reg.sessionCount, 0),
        // Overall status: 'paid' only if ALL registrations are paid
        paymentStatus: registrations.every(r => r.paymentStatus === 'paid') ? 'paid' : 'pending',
      };

      callback(combined);
    },
    (error) => {
      // Handle Firestore SDK errors gracefully
      console.debug('User registration subscription error (safe to ignore):', error.message);
      callback(null);
    }
  );
}

/**
 * Subscribe to pending bank transfer registrations for a meetup (organizer view)
 */
export function subscribeToPendingRegistrations(
  standingMeetupId: string,
  callback: (registrations: StandingMeetupRegistration[]) => void
): Unsubscribe {
  const q = query(
    collection(db, REGISTRATIONS_COLLECTION),
    where('standingMeetupId', '==', standingMeetupId),
    where('paymentMethod', '==', 'bank_transfer'),
    where('paymentStatus', '==', 'pending'),
    where('status', '==', 'active'),
    orderBy('createdAt', 'asc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const registrations = snapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as StandingMeetupRegistration)
      );
      callback(registrations);
    },
    (error) => {
      // Handle Firestore SDK errors gracefully (known bug in v12.6.0)
      console.debug('Pending registrations subscription error (safe to ignore):', error.message);
      // Return empty array on error to prevent UI crashes
      callback([]);
    }
  );
}

/**
 * Subscribe to all of a user's registrations (for profile page)
 */
export function subscribeToUserRegistrations(
  userId: string,
  callback: (registrations: StandingMeetupRegistration[]) => void,
  options?: { activeOnly?: boolean }
): Unsubscribe {
  let q = query(
    collection(db, REGISTRATIONS_COLLECTION),
    where('odUserId', '==', userId),
    orderBy('createdAt', 'desc')
  );

  if (options?.activeOnly) {
    q = query(
      collection(db, REGISTRATIONS_COLLECTION),
      where('odUserId', '==', userId),
      where('status', '==', 'active'),
      orderBy('createdAt', 'desc')
    );
  }

  return onSnapshot(
    q,
    (snapshot) => {
      const registrations = snapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as StandingMeetupRegistration)
      );
      callback(registrations);
    },
    (error) => {
      // Handle Firestore SDK errors gracefully
      console.debug('User registrations subscription error (safe to ignore):', error.message);
      callback([]);
    }
  );
}

/**
 * Subscribe to all active registrations for a meetup (organizer view)
 */
export function subscribeToRegistrationsByMeetup(
  standingMeetupId: string,
  callback: (registrations: StandingMeetupRegistration[]) => void
): Unsubscribe {
  const q = query(
    collection(db, REGISTRATIONS_COLLECTION),
    where('standingMeetupId', '==', standingMeetupId),
    where('status', '==', 'active'),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const registrations = snapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as StandingMeetupRegistration)
      );
      callback(registrations);
    },
    (error) => {
      // Handle Firestore SDK errors gracefully
      console.debug('Meetup registrations subscription error (safe to ignore):', error.message);
      callback([]);
    }
  );
}

/**
 * Subscribe to registrations for a specific session/occurrence (organizer view)
 * Returns all players registered for this session:
 * - Season pass holders (paid) - registered for all sessions
 * - Pick-and-pay with this session in selectedSessionIds
 */
export function subscribeToSessionRegistrations(
  standingMeetupId: string,
  sessionId: string,
  callback: (registrations: StandingMeetupRegistration[]) => void
): Unsubscribe {
  // Query all active registrations for this meetup
  const q = query(
    collection(db, REGISTRATIONS_COLLECTION),
    where('standingMeetupId', '==', standingMeetupId),
    where('status', '==', 'active'),
    orderBy('createdAt', 'asc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const allRegistrations = snapshot.docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as StandingMeetupRegistration)
      );

      // Filter to only those registered for this specific session
      const sessionRegistrations = allRegistrations.filter((reg) => {
        // Season pass (paid) = registered for all sessions
        if (reg.registrationType === 'season_pass' && reg.paymentStatus === 'paid') {
          return true;
        }

        // Pick-and-pay: check if session is in their selectedSessionIds
        if (reg.selectedSessionIds && reg.selectedSessionIds.includes(sessionId)) {
          return true;
        }

        return false;
      });

      callback(sessionRegistrations);
    },
    (error) => {
      console.debug('Session registrations subscription error (safe to ignore):', error.message);
      callback([]);
    }
  );
}

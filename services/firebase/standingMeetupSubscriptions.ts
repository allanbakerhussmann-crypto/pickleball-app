/**
 * Standing Meetup Subscriptions Service
 *
 * Read operations for subscriptions. All writes go through Cloud Functions.
 *
 * @version 07.53
 * @file services/firebase/standingMeetupSubscriptions.ts
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
import { StandingMeetupSubscription } from '../../types/standingMeetup';

// =============================================================================
// Collection Reference
// =============================================================================

const SUBSCRIPTIONS_COLLECTION = 'standingMeetupSubscriptions';

/**
 * Build subscription document ID
 * Format: {standingMeetupId}_{userId}
 */
export function buildSubscriptionId(standingMeetupId: string, userId: string): string {
  return `${standingMeetupId}_${userId}`;
}

// =============================================================================
// Subscription Read Operations
// =============================================================================

/**
 * Get a subscription by ID
 */
export async function getSubscription(
  subscriptionId: string
): Promise<StandingMeetupSubscription | null> {
  const docRef = doc(db, SUBSCRIPTIONS_COLLECTION, subscriptionId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return null;
  }

  return { id: docSnap.id, ...docSnap.data() } as StandingMeetupSubscription;
}

/**
 * Get subscription by meetup and user
 */
export async function getSubscriptionByMeetupAndUser(
  standingMeetupId: string,
  userId: string
): Promise<StandingMeetupSubscription | null> {
  const subscriptionId = buildSubscriptionId(standingMeetupId, userId);
  return getSubscription(subscriptionId);
}

/**
 * Get all subscriptions for a user
 */
export async function getUserSubscriptions(
  userId: string,
  options?: {
    status?: StandingMeetupSubscription['status'];
    activeOnly?: boolean;
  }
): Promise<StandingMeetupSubscription[]> {
  let q = query(
    collection(db, SUBSCRIPTIONS_COLLECTION),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );

  if (options?.status) {
    q = query(
      collection(db, SUBSCRIPTIONS_COLLECTION),
      where('userId', '==', userId),
      where('status', '==', options.status),
      orderBy('createdAt', 'desc')
    );
  } else if (options?.activeOnly) {
    q = query(
      collection(db, SUBSCRIPTIONS_COLLECTION),
      where('userId', '==', userId),
      where('status', '==', 'active'),
      orderBy('createdAt', 'desc')
    );
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map(
    (doc) => ({ id: doc.id, ...doc.data() } as StandingMeetupSubscription)
  );
}

/**
 * Get all subscriptions for a standing meetup
 */
export async function getMeetupSubscriptions(
  standingMeetupId: string,
  options?: {
    status?: StandingMeetupSubscription['status'];
    activeOnly?: boolean;
    limit?: number;
  }
): Promise<StandingMeetupSubscription[]> {
  let q = query(
    collection(db, SUBSCRIPTIONS_COLLECTION),
    where('standingMeetupId', '==', standingMeetupId),
    orderBy('createdAt', 'desc')
  );

  if (options?.status) {
    q = query(
      collection(db, SUBSCRIPTIONS_COLLECTION),
      where('standingMeetupId', '==', standingMeetupId),
      where('status', '==', options.status),
      orderBy('createdAt', 'desc')
    );
  } else if (options?.activeOnly) {
    q = query(
      collection(db, SUBSCRIPTIONS_COLLECTION),
      where('standingMeetupId', '==', standingMeetupId),
      where('status', '==', 'active'),
      orderBy('createdAt', 'desc')
    );
  }

  if (options?.limit) {
    q = query(q, limit(options.limit));
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map(
    (doc) => ({ id: doc.id, ...doc.data() } as StandingMeetupSubscription)
  );
}

/**
 * Check if user has an active subscription to a meetup
 */
export async function hasActiveSubscription(
  standingMeetupId: string,
  userId: string
): Promise<boolean> {
  const subscription = await getSubscriptionByMeetupAndUser(standingMeetupId, userId);
  return subscription?.status === 'active';
}

// =============================================================================
// Subscription Subscriptions (Real-time)
// =============================================================================

/**
 * Subscribe to a single subscription document
 */
export function subscribeToSubscription(
  subscriptionId: string,
  callback: (subscription: StandingMeetupSubscription | null) => void
): Unsubscribe {
  const docRef = doc(db, SUBSCRIPTIONS_COLLECTION, subscriptionId);

  return onSnapshot(docRef, (docSnap) => {
    if (!docSnap.exists()) {
      callback(null);
      return;
    }
    callback({ id: docSnap.id, ...docSnap.data() } as StandingMeetupSubscription);
  });
}

/**
 * Subscribe to user's subscriptions
 */
export function subscribeToUserSubscriptions(
  userId: string,
  callback: (subscriptions: StandingMeetupSubscription[]) => void,
  options?: { activeOnly?: boolean }
): Unsubscribe {
  let q = query(
    collection(db, SUBSCRIPTIONS_COLLECTION),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );

  if (options?.activeOnly) {
    q = query(
      collection(db, SUBSCRIPTIONS_COLLECTION),
      where('userId', '==', userId),
      where('status', '==', 'active'),
      orderBy('createdAt', 'desc')
    );
  }

  return onSnapshot(q, (snapshot) => {
    const subscriptions = snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() } as StandingMeetupSubscription)
    );
    callback(subscriptions);
  });
}

/**
 * Subscribe to meetup's subscriptions
 */
export function subscribeToMeetupSubscriptions(
  standingMeetupId: string,
  callback: (subscriptions: StandingMeetupSubscription[]) => void,
  options?: { activeOnly?: boolean }
): Unsubscribe {
  let q = query(
    collection(db, SUBSCRIPTIONS_COLLECTION),
    where('standingMeetupId', '==', standingMeetupId),
    orderBy('createdAt', 'desc')
  );

  if (options?.activeOnly) {
    q = query(
      collection(db, SUBSCRIPTIONS_COLLECTION),
      where('standingMeetupId', '==', standingMeetupId),
      where('status', '==', 'active'),
      orderBy('createdAt', 'desc')
    );
  }

  return onSnapshot(q, (snapshot) => {
    const subscriptions = snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() } as StandingMeetupSubscription)
    );
    callback(subscriptions);
  });
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get subscription stats for a meetup
 */
export async function getMeetupSubscriptionStats(
  standingMeetupId: string
): Promise<{
  activeCount: number;
  totalPaidAmount: number;
  totalCreditsIssued: number;
}> {
  const subscriptions = await getMeetupSubscriptions(standingMeetupId);

  const activeCount = subscriptions.filter((s) => s.status === 'active').length;
  const totalPaidAmount = subscriptions.reduce((sum, s) => sum + (s.totalPaid || 0), 0);
  const totalCreditsIssued = subscriptions.reduce(
    (sum, s) => sum + (s.totalCreditsReceived || 0),
    0
  );

  return {
    activeCount,
    totalPaidAmount,
    totalCreditsIssued,
  };
}

/**
 * Get user's active subscription meetup IDs
 * Useful for filtering the index to show user's upcoming sessions
 */
export async function getUserActiveSubscriptionMeetupIds(
  userId: string
): Promise<string[]> {
  const subscriptions = await getUserSubscriptions(userId, { activeOnly: true });
  return subscriptions.map((s) => s.standingMeetupId);
}

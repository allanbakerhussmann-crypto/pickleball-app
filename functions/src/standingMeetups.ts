/**
 * Standing Meetups Cloud Functions
 *
 * Server-side functions for standing meetup management:
 * - Subscription creation/cancellation
 * - Occurrence generation
 * - Participant status updates
 * - Check-in
 * - Credit issuance
 *
 * @version 07.53
 * @file functions/src/standingMeetups.ts
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { HttpsError, onCall, CallableRequest } from 'firebase-functions/v2/https';
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import * as crypto from 'crypto';

const db = admin.firestore();

// =============================================================================
// Types (duplicated from types/standingMeetup.ts for Cloud Functions)
// =============================================================================

interface StandingMeetup {
  id: string;
  clubId: string;
  clubName: string;
  createdByUserId: string;
  organizerStripeAccountId: string;
  title: string;
  description: string;
  locationName: string;
  lat?: number;
  lng?: number;
  timezone: string;
  recurrence: {
    interval: 'weekly';
    intervalCount?: number;
    dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
    startTime: string;
    endTime: string;
    startDate: string;
    endDate?: string;
  };
  maxPlayers: number;
  waitlistEnabled: boolean;
  billing: {
    interval: 'weekly';
    intervalCount?: number;
    amount: number;
    currency: 'nzd' | 'aud' | 'usd';
    feesPaidBy: 'organizer' | 'player';
    stripePriceId?: string;
  };
  credits: {
    enabled: boolean;
    cancellationCutoffHours: number;
  };
  status: 'draft' | 'active' | 'paused' | 'archived';
  visibility: 'public' | 'linkOnly' | 'private';
  subscriberCount: number;
  createdAt: number;
  updatedAt: number;
}

interface MeetupOccurrence {
  id: string;
  standingMeetupId: string;
  clubId: string;
  date: string;
  startTime: string;
  endTime: string;
  when: number;
  startAt: number;
  endAt: number;
  isModified: boolean;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  expectedCount: number;
  checkedInCount: number;
  cancelledCount: number;
  noShowCount: number;
  creditsIssued: boolean;
  checkInEnabled: boolean;
  checkInTokenHash?: string;
  checkInTokenExpiresAt?: number;
  createdAt: number;
  updatedAt: number;
}

interface OccurrenceParticipant {
  userName: string;
  status: 'expected' | 'cancelled' | 'checked_in' | 'no_show';
  checkedInAt?: number;
  checkInMethod?: 'qr' | 'organizer' | 'manual';
  creditIssued: boolean;
  creditIssuedAt?: number;
  creditAmount?: number;
  creditReason?: 'organizer_cancelled' | 'player_cancelled_before_cutoff';
  walletTransactionId?: string;
  updatedAt: number;
}

interface StandingMeetupSubscription {
  id: string;
  standingMeetupId: string;
  clubId: string;
  userId: string;
  userName: string;
  userEmail: string;
  stripeAccountId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  stripeStatus: 'active' | 'past_due' | 'canceled' | 'unpaid';
  currentPeriodStart: number;
  currentPeriodEnd: number;
  billingAmount: number;
  status: 'active' | 'paused' | 'cancelled' | 'past_due';
  totalPaid: number;
  totalCreditsReceived: number;
  createdAt: number;
  updatedAt: number;
}

// Constants
const OCCURRENCE_LOOKAHEAD_DAYS = 56; // 8 weeks
const PLATFORM_FEE_PERCENT = 0.10;
const STRIPE_FEE_PERCENT = 0.029;
const STRIPE_FIXED_FEE_CENTS = 30;

// Status to counter field mapping
const STATUS_TO_COUNTER_FIELD: Record<string, string> = {
  expected: 'expectedCount',
  cancelled: 'cancelledCount',
  checked_in: 'checkedInCount',
  no_show: 'noShowCount',
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate credit amount (what organizer received after fees)
 */
function calculateCreditAmount(
  billingAmount: number,
  feesPaidBy: 'organizer' | 'player'
): number {
  const stripeFee = Math.round(billingAmount * STRIPE_FEE_PERCENT) + STRIPE_FIXED_FEE_CENTS;
  const platformFee = Math.round(billingAmount * PLATFORM_FEE_PERCENT);

  if (feesPaidBy === 'organizer') {
    return billingAmount - stripeFee - platformFee;
  } else {
    return billingAmount;
  }
}

/**
 * Parse time string to hours and minutes
 */
function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return { hours, minutes };
}

/**
 * Get next occurrence of a day of week from a given date
 */
function getNextDayOfWeek(
  fromDate: Date,
  dayOfWeek: number,
  timezone: string
): Date {
  const date = new Date(fromDate);
  const currentDay = date.getDay();
  const daysUntilNext = (dayOfWeek - currentDay + 7) % 7;

  if (daysUntilNext === 0) {
    // Today is the day - check if we've passed the time
    return date;
  }

  date.setDate(date.getDate() + daysUntilNext);
  return date;
}

/**
 * Calculate occurrence dates within a window
 */
function calculateOccurrenceDates(
  meetup: StandingMeetup,
  endTimestamp: number
): string[] {
  const dates: string[] = [];
  const intervalCount = meetup.recurrence.intervalCount || 1;
  const msPerWeek = 7 * 24 * 60 * 60 * 1000 * intervalCount;

  // Start from the meetup's start date or today, whichever is later
  const startDate = new Date(meetup.recurrence.startDate);
  const today = new Date();
  let currentDate = startDate > today ? startDate : today;

  // Find the first occurrence on the correct day of week
  currentDate = getNextDayOfWeek(currentDate, meetup.recurrence.dayOfWeek, meetup.timezone);

  while (currentDate.getTime() < endTimestamp) {
    // Check if we've passed the end date
    if (meetup.recurrence.endDate) {
      const endDate = new Date(meetup.recurrence.endDate);
      if (currentDate > endDate) break;
    }

    // Format as YYYY-MM-DD
    const dateStr = currentDate.toISOString().split('T')[0];
    dates.push(dateStr);

    // Move to next occurrence
    currentDate = new Date(currentDate.getTime() + msPerWeek);
  }

  return dates;
}

/**
 * Calculate timestamp for a date + time in a timezone
 * Note: This is a simplified version - production should use a proper timezone library
 */
function calculateTimestamp(
  dateStr: string,
  timeStr: string,
  _timezone: string
): number {
  const { hours, minutes } = parseTime(timeStr);
  const date = new Date(dateStr);
  date.setHours(hours, minutes, 0, 0);
  return date.getTime();
}

/**
 * Update participant status with atomic counter updates
 * CRITICAL: All participant status changes MUST use this function
 */
async function updateParticipantStatus(
  standingMeetupId: string,
  dateId: string,
  userId: string,
  toStatus: 'expected' | 'cancelled' | 'checked_in' | 'no_show',
  additionalData?: Partial<OccurrenceParticipant>
): Promise<void> {
  const occurrenceRef = db
    .collection('standingMeetups')
    .doc(standingMeetupId)
    .collection('occurrences')
    .doc(dateId);
  const participantRef = occurrenceRef.collection('participants').doc(userId);

  await db.runTransaction(async (transaction) => {
    const participantSnap = await transaction.get(participantRef);
    const occurrenceSnap = await transaction.get(occurrenceRef);

    if (!occurrenceSnap.exists) {
      throw new HttpsError(
        'not-found',
        `Occurrence ${standingMeetupId}/${dateId} not found`
      );
    }

    const fromStatus = participantSnap.exists
      ? (participantSnap.data()?.status as string)
      : null;

    // Skip if already in target status (idempotent)
    if (fromStatus === toStatus) return;

    // Calculate counter deltas using the mapping
    const counterDeltas: Record<string, number> = {};
    if (fromStatus && STATUS_TO_COUNTER_FIELD[fromStatus]) {
      counterDeltas[STATUS_TO_COUNTER_FIELD[fromStatus]] = -1;
    }
    counterDeltas[STATUS_TO_COUNTER_FIELD[toStatus]] = 1;

    // Validate counters won't go negative
    const occData = occurrenceSnap.data() as MeetupOccurrence;
    for (const [key, delta] of Object.entries(counterDeltas)) {
      if (delta < 0 && ((occData as any)[key] || 0) + delta < 0) {
        throw new HttpsError('failed-precondition', `Counter ${key} would go negative`);
      }
    }

    // Update participant
    transaction.set(
      participantRef,
      {
        ...additionalData,
        status: toStatus,
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    // Update occurrence counters atomically
    const counterUpdates: Record<string, admin.firestore.FieldValue> = {};
    for (const [key, delta] of Object.entries(counterDeltas)) {
      counterUpdates[key] = admin.firestore.FieldValue.increment(delta);
    }
    counterUpdates['updatedAt'] = admin.firestore.FieldValue.serverTimestamp() as any;

    transaction.update(occurrenceRef, counterUpdates);
  });
}

/**
 * Add credit to user's wallet
 */
async function addToWallet(
  userId: string,
  clubId: string,
  amount: number,
  metadata: Record<string, any>
): Promise<string> {
  const walletId = `${userId}_${clubId}`;
  const walletRef = db.collection('wallets').doc(walletId);
  const transactionRef = db.collection('walletTransactions').doc();

  await db.runTransaction(async (transaction) => {
    const walletSnap = await transaction.get(walletRef);

    if (!walletSnap.exists) {
      // Create wallet if it doesn't exist
      transaction.set(walletRef, {
        userId,
        clubId,
        balance: amount,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    } else {
      transaction.update(walletRef, {
        balance: admin.firestore.FieldValue.increment(amount),
        updatedAt: Date.now(),
      });
    }

    transaction.set(transactionRef, {
      walletId,
      userId,
      clubId,
      amount,
      type: 'credit',
      referenceType: 'standing_meetup_credit',
      metadata,
      createdAt: Date.now(),
    });
  });

  return transactionRef.id;
}

// =============================================================================
// Occurrence Generation
// =============================================================================

/**
 * Ensure occurrences exist for the lookahead window
 * Safe to call frequently - only creates missing occurrences
 */
export const standingMeetup_ensureOccurrences = onCall(
  { region: 'australia-southeast1' },
  async (request: CallableRequest<{ standingMeetupId: string }>) => {
    const { standingMeetupId } = request.data;

    if (!standingMeetupId) {
      throw new HttpsError('invalid-argument', 'standingMeetupId is required');
    }

    // Get the standing meetup
    const meetupRef = db.collection('standingMeetups').doc(standingMeetupId);
    const meetupSnap = await meetupRef.get();

    if (!meetupSnap.exists) {
      throw new HttpsError('not-found', 'Standing meetup not found');
    }

    const meetup = { id: meetupSnap.id, ...meetupSnap.data() } as StandingMeetup;
    const endTimestamp = Date.now() + OCCURRENCE_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000;

    // Calculate expected occurrence dates
    const expectedDates = calculateOccurrenceDates(meetup, endTimestamp);

    if (expectedDates.length === 0) {
      return { created: [], existing: 0 };
    }

    // Build doc refs for all expected dates
    const occurrenceRefs = expectedDates.map((date) =>
      meetupRef.collection('occurrences').doc(date)
    );

    // Use getAll() to batch-check existence
    const snapshots = await db.getAll(...occurrenceRefs);

    const existingSet = new Set<string>();
    snapshots.forEach((snap) => {
      if (snap.exists) {
        existingSet.add(snap.id);
      }
    });

    // Only create missing occurrences
    const created: string[] = [];
    const batch = db.batch();

    for (const date of expectedDates) {
      if (!existingSet.has(date)) {
        const occRef = meetupRef.collection('occurrences').doc(date);
        const indexRef = db
          .collection('meetupOccurrencesIndex')
          .doc(`${standingMeetupId}_${date}`);

        const startAt = calculateTimestamp(date, meetup.recurrence.startTime, meetup.timezone);
        const endAt = calculateTimestamp(date, meetup.recurrence.endTime, meetup.timezone);

        const occurrence: Omit<MeetupOccurrence, 'id'> = {
          standingMeetupId,
          clubId: meetup.clubId,
          date,
          startTime: meetup.recurrence.startTime,
          endTime: meetup.recurrence.endTime,
          when: startAt,
          startAt,
          endAt,
          isModified: false,
          status: 'scheduled',
          expectedCount: 0,
          checkedInCount: 0,
          cancelledCount: 0,
          noShowCount: 0,
          creditsIssued: false,
          checkInEnabled: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        batch.set(occRef, { id: date, ...occurrence });

        // Also sync to index
        batch.set(indexRef, {
          id: `${standingMeetupId}_${date}`,
          standingMeetupId,
          occurrenceDate: date,
          clubId: meetup.clubId,
          when: startAt,
          status: 'scheduled',
          title: meetup.title,
          clubName: meetup.clubName,
          locationName: meetup.locationName,
          startTime: meetup.recurrence.startTime,
          endTime: meetup.recurrence.endTime,
          venueGeo: meetup.lat && meetup.lng ? { lat: meetup.lat, lng: meetup.lng } : null,
          maxPlayers: meetup.maxPlayers,
          expectedCount: 0,
          spotsLeft: meetup.maxPlayers,
          billingAmount: meetup.billing.amount,
          billingInterval: meetup.billing.interval,
          billingIntervalCount: meetup.billing.intervalCount,
          updatedAt: Date.now(),
        });

        created.push(date);
      }
    }

    if (created.length > 0) {
      await batch.commit();
    }

    return {
      created,
      existing: existingSet.size,
    };
  }
);

/**
 * Stamp a subscriber into occurrences within their billing period
 */
async function stampSubscriberIntoOccurrences(
  meetup: StandingMeetup,
  userId: string,
  userName: string,
  periodStart: number,
  periodEnd: number
): Promise<void> {
  const now = Date.now();

  // Get occurrences in the window [now, periodEnd]
  const occurrencesSnap = await db
    .collection('standingMeetups')
    .doc(meetup.id)
    .collection('occurrences')
    .where('startAt', '>=', now)
    .where('startAt', '<', periodEnd)
    .get();

  const batch = db.batch();

  for (const occDoc of occurrencesSnap.docs) {
    const participantRef = occDoc.ref.collection('participants').doc(userId);
    const participantSnap = await participantRef.get();

    if (!participantSnap.exists) {
      batch.set(participantRef, {
        userName,
        status: 'expected',
        creditIssued: false,
        updatedAt: Date.now(),
      });

      // Increment expectedCount
      batch.update(occDoc.ref, {
        expectedCount: admin.firestore.FieldValue.increment(1),
        updatedAt: Date.now(),
      });

      // Update index
      const indexRef = db
        .collection('meetupOccurrencesIndex')
        .doc(`${meetup.id}_${occDoc.id}`);
      batch.update(indexRef, {
        expectedCount: admin.firestore.FieldValue.increment(1),
        spotsLeft: admin.firestore.FieldValue.increment(-1),
        updatedAt: Date.now(),
      });
    }
  }

  await batch.commit();
}

// =============================================================================
// Check-In
// =============================================================================

/**
 * Player check-in via QR code
 */
export const standingMeetup_checkIn = onCall(
  { region: 'australia-southeast1' },
  async (
    request: CallableRequest<{
      standingMeetupId: string;
      dateId: string;
      token: string;
    }>
  ) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in');
    }

    const { standingMeetupId, dateId, token } = request.data;
    const userId = request.auth.uid;

    if (!standingMeetupId || !dateId || !token) {
      throw new HttpsError(
        'invalid-argument',
        'standingMeetupId, dateId, and token are required'
      );
    }

    // Get the occurrence
    const occurrenceRef = db
      .collection('standingMeetups')
      .doc(standingMeetupId)
      .collection('occurrences')
      .doc(dateId);
    const occurrenceSnap = await occurrenceRef.get();

    if (!occurrenceSnap.exists) {
      throw new HttpsError('not-found', 'OCCURRENCE_NOT_FOUND');
    }

    const occurrence = occurrenceSnap.data() as MeetupOccurrence;

    // Validate occurrence status
    if (!['scheduled', 'in_progress'].includes(occurrence.status)) {
      throw new HttpsError('failed-precondition', 'SESSION_NOT_ACTIVE');
    }

    // Validate token
    if (!occurrence.checkInEnabled || !occurrence.checkInTokenHash) {
      throw new HttpsError('failed-precondition', 'Check-in not enabled');
    }

    if (occurrence.checkInTokenExpiresAt && Date.now() > occurrence.checkInTokenExpiresAt) {
      throw new HttpsError('failed-precondition', 'TOKEN_EXPIRED');
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    if (tokenHash !== occurrence.checkInTokenHash) {
      throw new HttpsError('permission-denied', 'TOKEN_INVALID');
    }

    // Check if user is a participant
    const participantRef = occurrenceRef.collection('participants').doc(userId);
    const participantSnap = await participantRef.get();

    if (!participantSnap.exists) {
      throw new HttpsError('not-found', 'NOT_PARTICIPANT');
    }

    const participant = participantSnap.data() as OccurrenceParticipant;

    if (participant.status === 'checked_in') {
      throw new HttpsError('already-exists', 'ALREADY_CHECKED_IN');
    }

    // Update participant status
    const checkedInAt = Date.now();
    await updateParticipantStatus(standingMeetupId, dateId, userId, 'checked_in', {
      checkedInAt,
      checkInMethod: 'qr',
    });

    return {
      success: true,
      checkedInAt,
    };
  }
);

/**
 * Generate or refresh check-in token for an occurrence
 */
export const standingMeetup_generateCheckInToken = onCall(
  { region: 'australia-southeast1' },
  async (
    request: CallableRequest<{
      standingMeetupId: string;
      dateId: string;
      expiresInMinutes?: number;
    }>
  ) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in');
    }

    const { standingMeetupId, dateId, expiresInMinutes = 30 } = request.data;
    const userId = request.auth.uid;

    // Verify user is organizer (check club membership)
    const meetupRef = db.collection('standingMeetups').doc(standingMeetupId);
    const meetupSnap = await meetupRef.get();

    if (!meetupSnap.exists) {
      throw new HttpsError('not-found', 'Standing meetup not found');
    }

    const meetup = meetupSnap.data() as StandingMeetup;

    // TODO: Verify user is organizer of the club
    // For now, just check if user created the meetup
    if (meetup.createdByUserId !== userId) {
      // Check if user is club admin
      const clubMemberSnap = await db
        .collection('clubs')
        .doc(meetup.clubId)
        .collection('members')
        .doc(userId)
        .get();

      if (!clubMemberSnap.exists) {
        throw new HttpsError('permission-denied', 'NOT_AUTHORIZED');
      }

      const memberRole = clubMemberSnap.data()?.role;
      if (!['owner', 'admin'].includes(memberRole)) {
        throw new HttpsError('permission-denied', 'NOT_AUTHORIZED');
      }
    }

    // Generate token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = Date.now() + expiresInMinutes * 60 * 1000;

    // Update occurrence
    const occurrenceRef = meetupRef.collection('occurrences').doc(dateId);
    await occurrenceRef.update({
      checkInEnabled: true,
      checkInTokenHash: tokenHash,
      checkInTokenExpiresAt: expiresAt,
      checkInLastRotatedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return {
      token,
      expiresAt,
    };
  }
);

// =============================================================================
// Attendance Cancellation
// =============================================================================

/**
 * Player cancels attendance for an occurrence
 */
export const standingMeetup_cancelAttendance = onCall(
  { region: 'australia-southeast1' },
  async (
    request: CallableRequest<{
      standingMeetupId: string;
      dateId: string;
    }>
  ) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in');
    }

    const { standingMeetupId, dateId } = request.data;
    const userId = request.auth.uid;

    if (!standingMeetupId || !dateId) {
      throw new HttpsError(
        'invalid-argument',
        'standingMeetupId and dateId are required'
      );
    }

    // Get the standing meetup and occurrence
    const meetupRef = db.collection('standingMeetups').doc(standingMeetupId);
    const occurrenceRef = meetupRef.collection('occurrences').doc(dateId);

    const [meetupSnap, occurrenceSnap] = await Promise.all([
      meetupRef.get(),
      occurrenceRef.get(),
    ]);

    if (!meetupSnap.exists) {
      throw new HttpsError('not-found', 'MEETUP_NOT_FOUND');
    }

    if (!occurrenceSnap.exists) {
      throw new HttpsError('not-found', 'OCCURRENCE_NOT_FOUND');
    }

    const meetup = meetupSnap.data() as StandingMeetup;
    const occurrence = occurrenceSnap.data() as MeetupOccurrence;

    // Check if occurrence is in the past
    if (occurrence.startAt < Date.now()) {
      throw new HttpsError('failed-precondition', 'OCCURRENCE_PASSED');
    }

    // Check if user is a participant
    const participantRef = occurrenceRef.collection('participants').doc(userId);
    const participantSnap = await participantRef.get();

    if (!participantSnap.exists) {
      throw new HttpsError('not-found', 'NOT_PARTICIPANT');
    }

    const participant = participantSnap.data() as OccurrenceParticipant;

    if (participant.status === 'cancelled') {
      throw new HttpsError('already-exists', 'ALREADY_CANCELLED');
    }

    // Check if eligible for credit (before cutoff)
    const cutoffTimestamp =
      occurrence.startAt - meetup.credits.cancellationCutoffHours * 60 * 60 * 1000;
    const isBeforeCutoff = Date.now() <= cutoffTimestamp;
    const shouldIssueCredit = meetup.credits.enabled && isBeforeCutoff;

    let creditAmount: number | undefined;
    let walletTransactionId: string | undefined;

    if (shouldIssueCredit) {
      creditAmount = calculateCreditAmount(
        meetup.billing.amount,
        meetup.billing.feesPaidBy
      );

      // Issue credit to wallet
      walletTransactionId = await addToWallet(userId, meetup.clubId, creditAmount, {
        type: 'standing_meetup_credit',
        standingMeetupId,
        occurrenceId: dateId,
        reason: 'player_cancelled_before_cutoff',
      });
    }

    // Update participant status
    await updateParticipantStatus(standingMeetupId, dateId, userId, 'cancelled', {
      creditIssued: shouldIssueCredit,
      creditIssuedAt: shouldIssueCredit ? Date.now() : undefined,
      creditAmount,
      creditReason: shouldIssueCredit ? 'player_cancelled_before_cutoff' : undefined,
      walletTransactionId,
    });

    // Update subscription stats if credit was issued
    if (shouldIssueCredit && creditAmount) {
      const subscriptionId = `${standingMeetupId}_${userId}`;
      const subscriptionRef = db
        .collection('standingMeetupSubscriptions')
        .doc(subscriptionId);
      await subscriptionRef.update({
        totalCreditsReceived: admin.firestore.FieldValue.increment(creditAmount),
        updatedAt: Date.now(),
      });
    }

    return {
      credited: shouldIssueCredit,
      creditAmount,
      reason: isBeforeCutoff ? 'before_cutoff' : 'after_cutoff',
    };
  }
);

// =============================================================================
// Organizer Actions
// =============================================================================

/**
 * Organizer cancels an occurrence (batch credits)
 */
export const standingMeetup_cancelOccurrence = onCall(
  { region: 'australia-southeast1' },
  async (
    request: CallableRequest<{
      standingMeetupId: string;
      dateId: string;
      reason?: string;
    }>
  ) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in');
    }

    const { standingMeetupId, dateId, reason } = request.data;
    const userId = request.auth.uid;

    // Get meetup and verify organizer
    const meetupRef = db.collection('standingMeetups').doc(standingMeetupId);
    const meetupSnap = await meetupRef.get();

    if (!meetupSnap.exists) {
      throw new HttpsError('not-found', 'Standing meetup not found');
    }

    const meetup = meetupSnap.data() as StandingMeetup;

    // Verify organizer
    if (meetup.createdByUserId !== userId) {
      const clubMemberSnap = await db
        .collection('clubs')
        .doc(meetup.clubId)
        .collection('members')
        .doc(userId)
        .get();

      if (!clubMemberSnap.exists) {
        throw new HttpsError('permission-denied', 'NOT_AUTHORIZED');
      }

      const memberRole = clubMemberSnap.data()?.role;
      if (!['owner', 'admin'].includes(memberRole)) {
        throw new HttpsError('permission-denied', 'NOT_AUTHORIZED');
      }
    }

    // Get occurrence
    const occurrenceRef = meetupRef.collection('occurrences').doc(dateId);
    const occurrenceSnap = await occurrenceRef.get();

    if (!occurrenceSnap.exists) {
      throw new HttpsError('not-found', 'Occurrence not found');
    }

    const occurrence = occurrenceSnap.data() as MeetupOccurrence;

    // Check if already cancelled
    if (occurrence.status === 'cancelled') {
      throw new HttpsError('already-exists', 'Occurrence already cancelled');
    }

    // Check if credits already issued
    if (occurrence.creditsIssued) {
      throw new HttpsError('already-exists', 'Credits already issued');
    }

    // Get all eligible participants (expected or checked_in)
    const participantsSnap = await occurrenceRef.collection('participants').get();
    const eligibleParticipants: Array<{ id: string; data: OccurrenceParticipant }> = [];

    participantsSnap.forEach((doc) => {
      const data = doc.data() as OccurrenceParticipant;
      if (['expected', 'checked_in'].includes(data.status) && !data.creditIssued) {
        eligibleParticipants.push({ id: doc.id, data });
      }
    });

    // Calculate credit amount
    const creditAmount = meetup.credits.enabled
      ? calculateCreditAmount(meetup.billing.amount, meetup.billing.feesPaidBy)
      : 0;

    // Issue credits to each eligible participant
    let totalCreditsIssued = 0;
    const creditResults: Array<{ odUserId: string; creditAmount: number }> = [];

    for (const participant of eligibleParticipants) {
      if (creditAmount > 0) {
        const walletTxId = await addToWallet(
          participant.id,
          meetup.clubId,
          creditAmount,
          {
            type: 'standing_meetup_credit',
            standingMeetupId,
            occurrenceId: dateId,
            reason: 'organizer_cancelled',
          }
        );

        // Update participant
        await occurrenceRef.collection('participants').doc(participant.id).update({
          creditIssued: true,
          creditIssuedAt: Date.now(),
          creditAmount,
          creditReason: 'organizer_cancelled',
          walletTransactionId: walletTxId,
          updatedAt: Date.now(),
        });

        // Update subscription stats
        const subscriptionId = `${standingMeetupId}_${participant.id}`;
        const subscriptionRef = db
          .collection('standingMeetupSubscriptions')
          .doc(subscriptionId);
        const subscriptionSnap = await subscriptionRef.get();
        if (subscriptionSnap.exists) {
          await subscriptionRef.update({
            totalCreditsReceived: admin.firestore.FieldValue.increment(creditAmount),
            updatedAt: Date.now(),
          });
        }

        totalCreditsIssued += creditAmount;
        creditResults.push({ odUserId: participant.id, creditAmount });
      }
    }

    // Update occurrence
    await occurrenceRef.update({
      status: 'cancelled',
      cancelledAt: Date.now(),
      cancelReason: reason || null,
      creditsIssued: true,
      creditsIssuedAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Update index
    const indexRef = db
      .collection('meetupOccurrencesIndex')
      .doc(`${standingMeetupId}_${dateId}`);
    await indexRef.update({
      status: 'cancelled',
      updatedAt: Date.now(),
    });

    return {
      cancelled: true,
      participantsAffected: eligibleParticipants.length,
      totalCreditsIssued,
      creditResults,
    };
  }
);

/**
 * Organizer marks participant as checked in manually
 */
export const standingMeetup_manualCheckIn = onCall(
  { region: 'australia-southeast1' },
  async (
    request: CallableRequest<{
      standingMeetupId: string;
      dateId: string;
      targetUserId: string;
    }>
  ) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in');
    }

    const { standingMeetupId, dateId, targetUserId } = request.data;
    const userId = request.auth.uid;

    // Verify organizer (similar to cancelOccurrence)
    const meetupRef = db.collection('standingMeetups').doc(standingMeetupId);
    const meetupSnap = await meetupRef.get();

    if (!meetupSnap.exists) {
      throw new HttpsError('not-found', 'Standing meetup not found');
    }

    const meetup = meetupSnap.data() as StandingMeetup;

    if (meetup.createdByUserId !== userId) {
      const clubMemberSnap = await db
        .collection('clubs')
        .doc(meetup.clubId)
        .collection('members')
        .doc(userId)
        .get();

      if (!clubMemberSnap.exists || !['owner', 'admin'].includes(clubMemberSnap.data()?.role)) {
        throw new HttpsError('permission-denied', 'NOT_AUTHORIZED');
      }
    }

    // Update participant status
    const checkedInAt = Date.now();
    await updateParticipantStatus(standingMeetupId, dateId, targetUserId, 'checked_in', {
      checkedInAt,
      checkInMethod: 'organizer',
    });

    return {
      success: true,
      checkedInAt,
    };
  }
);

/**
 * Organizer marks participant as no-show
 */
export const standingMeetup_markNoShow = onCall(
  { region: 'australia-southeast1' },
  async (
    request: CallableRequest<{
      standingMeetupId: string;
      dateId: string;
      targetUserId: string;
    }>
  ) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be logged in');
    }

    const { standingMeetupId, dateId, targetUserId } = request.data;
    const userId = request.auth.uid;

    // Verify organizer
    const meetupRef = db.collection('standingMeetups').doc(standingMeetupId);
    const meetupSnap = await meetupRef.get();

    if (!meetupSnap.exists) {
      throw new HttpsError('not-found', 'Standing meetup not found');
    }

    const meetup = meetupSnap.data() as StandingMeetup;

    if (meetup.createdByUserId !== userId) {
      const clubMemberSnap = await db
        .collection('clubs')
        .doc(meetup.clubId)
        .collection('members')
        .doc(userId)
        .get();

      if (!clubMemberSnap.exists || !['owner', 'admin'].includes(clubMemberSnap.data()?.role)) {
        throw new HttpsError('permission-denied', 'NOT_AUTHORIZED');
      }
    }

    // Update participant status (no-shows don't get credits)
    await updateParticipantStatus(standingMeetupId, dateId, targetUserId, 'no_show');

    return {
      success: true,
    };
  }
);

// =============================================================================
// Index Sync Trigger
// =============================================================================

/**
 * When an occurrence is deleted, also delete the index entry
 */
export const onOccurrenceDeleted = onDocumentDeleted(
  {
    document: 'standingMeetups/{standingMeetupId}/occurrences/{dateId}',
    region: 'australia-southeast1',
  },
  async (event) => {
    const { standingMeetupId, dateId } = event.params;
    const indexRef = db
      .collection('meetupOccurrencesIndex')
      .doc(`${standingMeetupId}_${dateId}`);

    try {
      await indexRef.delete();
      console.log(`Deleted index entry for ${standingMeetupId}_${dateId}`);
    } catch (error) {
      console.error(`Failed to delete index entry: ${error}`);
    }
  }
);

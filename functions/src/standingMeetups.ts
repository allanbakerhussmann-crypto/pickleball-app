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
 * NOTE: Using 1st Gen functions for reliable deployment
 * (2nd Gen has Container Healthcheck issues in australia-southeast1)
 *
 * @version 07.59
 * @file functions/src/standingMeetups.ts
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import * as crypto from 'crypto';
import Stripe from 'stripe';

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
    perSessionAmount?: number;
  };
  credits: {
    enabled: boolean;
    cancellationCutoffHours: number;
  };
  paymentMethods?: {
    acceptCardPayments: boolean;
    acceptBankTransfer: boolean;
    bankDetails?: {
      bankName: string;
      accountName: string;
      accountNumber: string;
      reference?: string;
      showToPlayers: boolean;
    };
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
  // Guest tracking (V07.59)
  guestCount?: number;
  guestRevenue?: number;
  // Session finalization (V07.59)
  closedAt?: number;
  closedBy?: string;
  createdAt: number;
  updatedAt: number;
}

interface OccurrenceParticipant {
  userName: string;
  status: 'expected' | 'cancelled' | 'checked_in' | 'no_show';
  checkedInAt?: number;
  checkInMethod?: 'qr' | 'organizer' | 'manual';
  checkedInBy?: string; // userId of organizer who scanned QR (for QR check-in)
  creditIssued: boolean;
  creditIssuedAt?: number;
  creditAmount?: number;
  creditReason?: 'organizer_cancelled' | 'player_cancelled_before_cutoff';
  walletTransactionId?: string;
  updatedAt: number;
}

interface StandingMeetupRegistration {
  id: string;
  standingMeetupId: string;
  clubId: string;
  odUserId: string;
  userName: string;
  userEmail: string;
  registrationType: 'season_pass' | 'pick_and_pay';
  selectedSessionIds?: string[];
  sessionCount: number;
  paymentStatus: 'pending' | 'paid';
  paymentMethod: 'stripe' | 'bank_transfer';
  amount: number;
  currency: 'nzd' | 'aud' | 'usd';
  paidAt?: number;
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
  bankTransferReference?: string;
  status: 'active' | 'cancelled';
  cancelledAt?: number;
  createdAt: number;
  updatedAt: number;
}

// Constants
const OCCURRENCE_LOOKAHEAD_DAYS = 112; // 16 weeks
const PLATFORM_FEE_PERCENT = 0.015; // 1.5% standard rate - same as stripe.ts
const STRIPE_FEE_PERCENT = 0.027;  // NZ Stripe rate: 2.7% + $0.30
const STRIPE_FIXED_FEE_CENTS = 30;

// Status to counter field mapping
const STATUS_TO_COUNTER_FIELD: Record<string, string> = {
  expected: 'expectedCount',
  cancelled: 'cancelledCount',
  checked_in: 'checkedInCount',
  no_show: 'noShowCount',
};

// Stripe initialization
function getStripeSecretKey(): string | undefined {
  try {
    return functions.config().stripe?.secret_key;
  } catch {
    return undefined;
  }
}

const stripeSecretKey = getStripeSecretKey();
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey, { apiVersion: '2024-11-20.acacia' as any }) : null;

// =============================================================================
// Helper Functions
// =============================================================================

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

function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return { hours, minutes };
}

function getNextDayOfWeek(
  fromDate: Date,
  dayOfWeek: number,
  _timezone: string
): Date {
  const date = new Date(fromDate);
  const currentDay = date.getDay();
  const daysUntilNext = (dayOfWeek - currentDay + 7) % 7;

  if (daysUntilNext === 0) {
    return date;
  }

  date.setDate(date.getDate() + daysUntilNext);
  return date;
}

function calculateOccurrenceDates(
  meetup: StandingMeetup,
  endTimestamp: number
): string[] {
  const dates: string[] = [];
  const intervalCount = meetup.recurrence.intervalCount || 1;
  const msPerWeek = 7 * 24 * 60 * 60 * 1000 * intervalCount;

  const startDate = new Date(meetup.recurrence.startDate);
  const today = new Date();
  let currentDate = startDate > today ? startDate : today;

  currentDate = getNextDayOfWeek(currentDate, meetup.recurrence.dayOfWeek, meetup.timezone);

  while (currentDate.getTime() < endTimestamp) {
    if (meetup.recurrence.endDate) {
      const endDate = new Date(meetup.recurrence.endDate);
      if (currentDate > endDate) break;
    }

    const dateStr = currentDate.toISOString().split('T')[0];
    dates.push(dateStr);

    currentDate = new Date(currentDate.getTime() + msPerWeek);
  }

  return dates;
}

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
      throw new functions.https.HttpsError(
        'not-found',
        `Occurrence ${standingMeetupId}/${dateId} not found`
      );
    }

    const fromStatus = participantSnap.exists
      ? (participantSnap.data()?.status as string)
      : null;

    if (fromStatus === toStatus) return;

    const counterDeltas: Record<string, number> = {};
    if (fromStatus && STATUS_TO_COUNTER_FIELD[fromStatus]) {
      counterDeltas[STATUS_TO_COUNTER_FIELD[fromStatus]] = -1;
    }
    counterDeltas[STATUS_TO_COUNTER_FIELD[toStatus]] = 1;

    const occData = occurrenceSnap.data() as MeetupOccurrence;
    for (const [key, delta] of Object.entries(counterDeltas)) {
      if (delta < 0 && ((occData as any)[key] || 0) + delta < 0) {
        throw new functions.https.HttpsError('failed-precondition', `Counter ${key} would go negative`);
      }
    }

    transaction.set(
      participantRef,
      {
        ...additionalData,
        status: toStatus,
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    const counterUpdates: Record<string, admin.firestore.FieldValue> = {};
    for (const [key, delta] of Object.entries(counterDeltas)) {
      counterUpdates[key] = FieldValue.increment(delta);
    }
    counterUpdates['updatedAt'] = admin.firestore.FieldValue.serverTimestamp() as any;

    transaction.update(occurrenceRef, counterUpdates);
  });
}

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
      transaction.set(walletRef, {
        userId,
        clubId,
        balance: amount,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    } else {
      transaction.update(walletRef, {
        balance: FieldValue.increment(amount),
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
// Occurrence Generation (1st Gen - australia-southeast1)
// =============================================================================

export const standingMeetup_ensureOccurrences = functions
  .region('australia-southeast1')
  .https.onCall(async (data: { standingMeetupId: string }, context) => {
    const { standingMeetupId } = data;

    if (!standingMeetupId) {
      throw new functions.https.HttpsError('invalid-argument', 'standingMeetupId is required');
    }

    const meetupRef = db.collection('standingMeetups').doc(standingMeetupId);
    const meetupSnap = await meetupRef.get();

    if (!meetupSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Standing meetup not found');
    }

    const meetup = { id: meetupSnap.id, ...meetupSnap.data() } as StandingMeetup;
    const endTimestamp = Date.now() + OCCURRENCE_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000;

    const expectedDates = calculateOccurrenceDates(meetup, endTimestamp);

    if (expectedDates.length === 0) {
      return { created: [], existing: 0 };
    }

    const occurrenceRefs = expectedDates.map((date) =>
      meetupRef.collection('occurrences').doc(date)
    );

    const snapshots = await db.getAll(...occurrenceRefs);

    const existingActiveSet = new Set<string>();
    const cancelledSet = new Set<string>();

    snapshots.forEach((snap) => {
      if (snap.exists) {
        const snapData = snap.data();
        if (snapData?.status === 'cancelled') {
          cancelledSet.add(snap.id);
        } else {
          existingActiveSet.add(snap.id);
        }
      }
    });

    const created: string[] = [];
    const skippedCancelled: string[] = [];
    const batch = db.batch();

    for (const date of expectedDates) {
      // SAFEGUARD: Skip cancelled sessions - don't auto-revive them
      // Organizers must explicitly revive cancelled sessions if needed
      // This prevents accidentally resetting registrations/participants
      if (cancelledSet.has(date)) {
        skippedCancelled.push(date);
        continue;
      }

      if (!existingActiveSet.has(date)) {
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
          billingIntervalCount: meetup.billing.intervalCount ?? 1,
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
      skippedCancelled,
      existing: existingActiveSet.size,
    };
  });

// =============================================================================
// Check-In (1st Gen - australia-southeast1)
// =============================================================================

export const standingMeetup_checkIn = functions
  .region('australia-southeast1')
  .https.onCall(async (data: { standingMeetupId: string; dateId: string; token: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { standingMeetupId, dateId, token } = data;
    const userId = context.auth.uid;

    if (!standingMeetupId || !dateId || !token) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'standingMeetupId, dateId, and token are required'
      );
    }

    const occurrenceRef = db
      .collection('standingMeetups')
      .doc(standingMeetupId)
      .collection('occurrences')
      .doc(dateId);
    const occurrenceSnap = await occurrenceRef.get();

    if (!occurrenceSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'OCCURRENCE_NOT_FOUND');
    }

    const occurrence = occurrenceSnap.data() as MeetupOccurrence;

    if (!['scheduled', 'in_progress'].includes(occurrence.status)) {
      throw new functions.https.HttpsError('failed-precondition', 'SESSION_NOT_ACTIVE');
    }

    if (!occurrence.checkInEnabled || !occurrence.checkInTokenHash) {
      throw new functions.https.HttpsError('failed-precondition', 'Check-in not enabled');
    }

    if (occurrence.checkInTokenExpiresAt && Date.now() > occurrence.checkInTokenExpiresAt) {
      throw new functions.https.HttpsError('failed-precondition', 'TOKEN_EXPIRED');
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    if (tokenHash !== occurrence.checkInTokenHash) {
      throw new functions.https.HttpsError('permission-denied', 'TOKEN_INVALID');
    }

    const participantRef = occurrenceRef.collection('participants').doc(userId);
    const participantSnap = await participantRef.get();

    if (!participantSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'NOT_PARTICIPANT');
    }

    const participant = participantSnap.data() as OccurrenceParticipant;

    if (participant.status === 'checked_in') {
      throw new functions.https.HttpsError('already-exists', 'ALREADY_CHECKED_IN');
    }

    const checkedInAt = Date.now();
    await updateParticipantStatus(standingMeetupId, dateId, userId, 'checked_in', {
      checkedInAt,
      checkInMethod: 'qr',
    });

    return {
      success: true,
      checkedInAt,
    };
  });

// =============================================================================
// Generate Check-In Token (1st Gen - australia-southeast1)
// =============================================================================

export const standingMeetup_generateCheckInToken = functions
  .region('australia-southeast1')
  .https.onCall(async (data: { standingMeetupId: string; dateId: string; expiresInMinutes?: number }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { standingMeetupId, dateId, expiresInMinutes = 30 } = data;
    const userId = context.auth.uid;

    const meetupRef = db.collection('standingMeetups').doc(standingMeetupId);
    const meetupSnap = await meetupRef.get();

    if (!meetupSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Standing meetup not found');
    }

    const meetup = meetupSnap.data() as StandingMeetup;

    if (meetup.createdByUserId !== userId) {
      const clubMemberSnap = await db
        .collection('clubs')
        .doc(meetup.clubId)
        .collection('members')
        .doc(userId)
        .get();

      if (!clubMemberSnap.exists) {
        throw new functions.https.HttpsError('permission-denied', 'NOT_AUTHORIZED');
      }

      const memberRole = clubMemberSnap.data()?.role;
      if (!['owner', 'admin'].includes(memberRole)) {
        throw new functions.https.HttpsError('permission-denied', 'NOT_AUTHORIZED');
      }
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = Date.now() + expiresInMinutes * 60 * 1000;

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
  });

// =============================================================================
// Cancel Attendance (1st Gen - australia-southeast1)
// =============================================================================

export const standingMeetup_cancelAttendance = functions
  .region('australia-southeast1')
  .https.onCall(async (data: { standingMeetupId: string; dateId: string; odUserId?: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { standingMeetupId, dateId, odUserId } = data;
    const callerUid = context.auth.uid;

    if (!standingMeetupId || !dateId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'standingMeetupId and dateId are required'
      );
    }

    const meetupRef = db.collection('standingMeetups').doc(standingMeetupId);
    const occurrenceRef = meetupRef.collection('occurrences').doc(dateId);

    const [meetupSnap, occurrenceSnap] = await Promise.all([
      meetupRef.get(),
      occurrenceRef.get(),
    ]);

    if (!meetupSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'MEETUP_NOT_FOUND');
    }

    if (!occurrenceSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'OCCURRENCE_NOT_FOUND');
    }

    const meetup = meetupSnap.data() as StandingMeetup;
    const occurrence = occurrenceSnap.data() as MeetupOccurrence;

    // Determine target user: if odUserId provided, verify caller is admin
    let userId = callerUid;
    if (odUserId && odUserId !== callerUid) {
      // Admin trying to remove another player - verify permissions
      const isCreator = meetup.createdByUserId === callerUid;
      let isClubAdmin = false;

      if (!isCreator) {
        const clubMemberSnap = await db
          .collection('clubs')
          .doc(meetup.clubId)
          .collection('members')
          .doc(callerUid)
          .get();

        if (clubMemberSnap.exists) {
          const memberRole = clubMemberSnap.data()?.role;
          isClubAdmin = ['owner', 'admin'].includes(memberRole);
        }
      }

      if (!isCreator && !isClubAdmin) {
        throw new functions.https.HttpsError('permission-denied', 'NOT_AUTHORIZED');
      }

      userId = odUserId;
    }

    if (occurrence.startAt < Date.now()) {
      throw new functions.https.HttpsError('failed-precondition', 'OCCURRENCE_PASSED');
    }

    const participantRef = occurrenceRef.collection('participants').doc(userId);
    const participantSnap = await participantRef.get();

    if (!participantSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'NOT_PARTICIPANT');
    }

    const participant = participantSnap.data() as OccurrenceParticipant;

    if (participant.status === 'cancelled') {
      throw new functions.https.HttpsError('already-exists', 'ALREADY_CANCELLED');
    }

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

      walletTransactionId = await addToWallet(userId, meetup.clubId, creditAmount, {
        type: 'standing_meetup_credit',
        standingMeetupId,
        occurrenceId: dateId,
        reason: 'player_cancelled_before_cutoff',
      });
    }

    // Build update object without undefined values (Firestore doesn't allow undefined)
    const participantUpdate: Record<string, any> = {
      creditIssued: shouldIssueCredit,
    };
    if (shouldIssueCredit) {
      participantUpdate.creditIssuedAt = Date.now();
      participantUpdate.creditReason = 'player_cancelled_before_cutoff';
      if (creditAmount !== undefined) {
        participantUpdate.creditAmount = creditAmount;
      }
      if (walletTransactionId !== undefined) {
        participantUpdate.walletTransactionId = walletTransactionId;
      }
    }

    await updateParticipantStatus(standingMeetupId, dateId, userId, 'cancelled', participantUpdate);

    if (shouldIssueCredit && creditAmount) {
      // Try to update subscription (old model) - skip if doesn't exist (MVP hybrid model uses registrations)
      const subscriptionId = `${standingMeetupId}_${userId}`;
      const subscriptionRef = db
        .collection('standingMeetupSubscriptions')
        .doc(subscriptionId);
      const subscriptionSnap = await subscriptionRef.get();
      if (subscriptionSnap.exists) {
        await subscriptionRef.update({
          totalCreditsReceived: FieldValue.increment(creditAmount),
          updatedAt: Date.now(),
        });
      }
    }

    return {
      credited: shouldIssueCredit,
      creditAmount,
      reason: isBeforeCutoff ? 'before_cutoff' : 'after_cutoff',
    };
  });

// =============================================================================
// Cancel Occurrence (1st Gen - australia-southeast1)
// =============================================================================

export const standingMeetup_cancelOccurrence = functions
  .region('australia-southeast1')
  .https.onCall(async (data: { standingMeetupId: string; dateId: string; reason?: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { standingMeetupId, dateId, reason } = data;
    const userId = context.auth.uid;

    const meetupRef = db.collection('standingMeetups').doc(standingMeetupId);
    const meetupSnap = await meetupRef.get();

    if (!meetupSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Standing meetup not found');
    }

    const meetup = meetupSnap.data() as StandingMeetup;

    if (meetup.createdByUserId !== userId) {
      const clubMemberSnap = await db
        .collection('clubs')
        .doc(meetup.clubId)
        .collection('members')
        .doc(userId)
        .get();

      if (!clubMemberSnap.exists) {
        throw new functions.https.HttpsError('permission-denied', 'NOT_AUTHORIZED');
      }

      const memberRole = clubMemberSnap.data()?.role;
      if (!['owner', 'admin'].includes(memberRole)) {
        throw new functions.https.HttpsError('permission-denied', 'NOT_AUTHORIZED');
      }
    }

    const occurrenceRef = meetupRef.collection('occurrences').doc(dateId);
    const occurrenceSnap = await occurrenceRef.get();

    if (!occurrenceSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Occurrence not found');
    }

    const occurrence = occurrenceSnap.data() as MeetupOccurrence;

    if (occurrence.status === 'cancelled') {
      throw new functions.https.HttpsError('already-exists', 'Occurrence already cancelled');
    }

    if (occurrence.creditsIssued) {
      throw new functions.https.HttpsError('already-exists', 'Credits already issued');
    }

    const participantsSnap = await occurrenceRef.collection('participants').get();
    const eligibleParticipants: Array<{ id: string; data: OccurrenceParticipant }> = [];

    participantsSnap.forEach((doc) => {
      const docData = doc.data() as OccurrenceParticipant;
      if (['expected', 'checked_in'].includes(docData.status) && !docData.creditIssued) {
        eligibleParticipants.push({ id: doc.id, data: docData });
      }
    });

    const creditAmount = meetup.credits.enabled
      ? calculateCreditAmount(meetup.billing.amount, meetup.billing.feesPaidBy)
      : 0;

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

        await occurrenceRef.collection('participants').doc(participant.id).update({
          creditIssued: true,
          creditIssuedAt: Date.now(),
          creditAmount,
          creditReason: 'organizer_cancelled',
          walletTransactionId: walletTxId,
          updatedAt: Date.now(),
        });

        const subscriptionId = `${standingMeetupId}_${participant.id}`;
        const subscriptionRef = db
          .collection('standingMeetupSubscriptions')
          .doc(subscriptionId);
        const subscriptionSnap = await subscriptionRef.get();
        if (subscriptionSnap.exists) {
          await subscriptionRef.update({
            totalCreditsReceived: FieldValue.increment(creditAmount),
            updatedAt: Date.now(),
          });
        }

        totalCreditsIssued += creditAmount;
        creditResults.push({ odUserId: participant.id, creditAmount });
      }
    }

    await occurrenceRef.update({
      status: 'cancelled',
      cancelledAt: Date.now(),
      cancelReason: reason || null,
      creditsIssued: true,
      creditsIssuedAt: Date.now(),
      updatedAt: Date.now(),
    });

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
  });

// =============================================================================
// Manual Check-In (1st Gen - australia-southeast1)
// =============================================================================

export const standingMeetup_manualCheckIn = functions
  .region('australia-southeast1')
  .https.onCall(async (data: { standingMeetupId: string; dateId: string; targetUserId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { standingMeetupId, dateId, targetUserId } = data;
    const userId = context.auth.uid;

    const meetupRef = db.collection('standingMeetups').doc(standingMeetupId);
    const meetupSnap = await meetupRef.get();

    if (!meetupSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Standing meetup not found');
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
        throw new functions.https.HttpsError('permission-denied', 'NOT_AUTHORIZED');
      }
    }

    const checkedInAt = Date.now();
    await updateParticipantStatus(standingMeetupId, dateId, targetUserId, 'checked_in', {
      checkedInAt,
      checkInMethod: 'organizer',
    });

    return {
      success: true,
      checkedInAt,
    };
  });

// =============================================================================
// Mark No-Show (1st Gen - australia-southeast1)
// =============================================================================

export const standingMeetup_markNoShow = functions
  .region('australia-southeast1')
  .https.onCall(async (data: { standingMeetupId: string; dateId: string; targetUserId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { standingMeetupId, dateId, targetUserId } = data;
    const userId = context.auth.uid;

    const meetupRef = db.collection('standingMeetups').doc(standingMeetupId);
    const meetupSnap = await meetupRef.get();

    if (!meetupSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Standing meetup not found');
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
        throw new functions.https.HttpsError('permission-denied', 'NOT_AUTHORIZED');
      }
    }

    await updateParticipantStatus(standingMeetupId, dateId, targetUserId, 'no_show');

    return {
      success: true,
    };
  });

// =============================================================================
// Index Sync Trigger (1st Gen - australia-southeast1)
// =============================================================================

export const onOccurrenceDeleted = functions
  .region('australia-southeast1')
  .firestore.document('standingMeetups/{standingMeetupId}/occurrences/{dateId}')
  .onDelete(async (snap, context) => {
    const { standingMeetupId, dateId } = context.params;
    const indexRef = db
      .collection('meetupOccurrencesIndex')
      .doc(`${standingMeetupId}_${dateId}`);

    try {
      await indexRef.delete();
      console.log(`Deleted index entry for ${standingMeetupId}_${dateId}`);
    } catch (error) {
      console.error(`Failed to delete index entry: ${error}`);
    }
  });

// =============================================================================
// Registration Helper Functions
// =============================================================================

async function addPlayerToAllFutureOccurrences(
  standingMeetupId: string,
  userId: string,
  userName: string,
  maxPlayers: number
): Promise<{ addedTo: string[]; skippedFull: string[] }> {
  const now = Date.now();
  const eightWeeksLater = now + 8 * 7 * 24 * 60 * 60 * 1000;

  const occurrencesSnap = await db
    .collection('standingMeetups')
    .doc(standingMeetupId)
    .collection('occurrences')
    .where('startAt', '>=', now)
    .where('startAt', '<', eightWeeksLater)
    .where('status', '==', 'scheduled')
    .get();

  if (occurrencesSnap.empty) {
    console.log(`No future occurrences found for meetup ${standingMeetupId}`);
    return { addedTo: [], skippedFull: [] };
  }

  const addedTo: string[] = [];
  const skippedFull: string[] = [];
  const batch = db.batch();

  for (const occDoc of occurrencesSnap.docs) {
    const occData = occDoc.data();

    const spotsLeft = maxPlayers - (occData.expectedCount || 0);
    if (spotsLeft <= 0) {
      skippedFull.push(occDoc.id);
      continue;
    }

    const participantRef = occDoc.ref.collection('participants').doc(userId);
    const participantSnap = await participantRef.get();

    if (!participantSnap.exists) {
      batch.set(participantRef, {
        userName,
        status: 'expected',
        creditIssued: false,
        updatedAt: Date.now(),
      });

      batch.update(occDoc.ref, {
        expectedCount: FieldValue.increment(1),
        updatedAt: Date.now(),
      });

      const indexRef = db
        .collection('meetupOccurrencesIndex')
        .doc(`${standingMeetupId}_${occDoc.id}`);
      batch.update(indexRef, {
        expectedCount: FieldValue.increment(1),
        spotsLeft: FieldValue.increment(-1),
        updatedAt: Date.now(),
      });

      addedTo.push(occDoc.id);
    }
  }

  await batch.commit();
  console.log(`Season Pass: Added ${userId} to ${addedTo.length} occurrences, skipped ${skippedFull.length} full`);

  return { addedTo, skippedFull };
}

async function addPlayerToSelectedOccurrences(
  standingMeetupId: string,
  userId: string,
  userName: string,
  sessionIds: string[],
  maxPlayers: number
): Promise<{ addedTo: string[]; failedFull: string[] }> {
  if (!sessionIds || sessionIds.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'No sessions selected');
  }

  const addedTo: string[] = [];
  const failedFull: string[] = [];

  for (const dateId of sessionIds) {
    const occRef = db
      .collection('standingMeetups')
      .doc(standingMeetupId)
      .collection('occurrences')
      .doc(dateId);

    try {
      await db.runTransaction(async (transaction) => {
        const occSnap = await transaction.get(occRef);

        if (!occSnap.exists) {
          console.warn(`Occurrence ${dateId} not found, skipping`);
          return;
        }

        const occData = occSnap.data() as any;

        const spotsLeft = maxPlayers - (occData.expectedCount || 0);
        if (spotsLeft <= 0) {
          failedFull.push(dateId);
          return;
        }

        const participantRef = occRef.collection('participants').doc(userId);
        const participantSnap = await transaction.get(participantRef);

        if (!participantSnap.exists) {
          transaction.set(participantRef, {
            userName,
            status: 'expected',
            creditIssued: false,
            updatedAt: Date.now(),
          });

          transaction.update(occRef, {
            expectedCount: FieldValue.increment(1),
            updatedAt: Date.now(),
          });

          const indexRef = db
            .collection('meetupOccurrencesIndex')
            .doc(`${standingMeetupId}_${dateId}`);
          transaction.update(indexRef, {
            expectedCount: FieldValue.increment(1),
            spotsLeft: FieldValue.increment(-1),
            updatedAt: Date.now(),
          });

          addedTo.push(dateId);
        }
      });
    } catch (err) {
      console.error(`Failed to add to occurrence ${dateId}:`, err);
      failedFull.push(dateId);
    }
  }

  if (failedFull.length > 0) {
    console.warn(`Pick-and-Pay: ${failedFull.length} sessions were full: ${failedFull.join(', ')}`);
  }

  console.log(`Pick-and-Pay: Added ${userId} to ${addedTo.length} selected occurrences`);

  return { addedTo, failedFull };
}

async function removePlayerFromFutureOccurrences(
  standingMeetupId: string,
  userId: string
): Promise<void> {
  const now = Date.now();

  const occurrencesSnap = await db
    .collection('standingMeetups')
    .doc(standingMeetupId)
    .collection('occurrences')
    .where('startAt', '>=', now)
    .where('status', '==', 'scheduled')
    .get();

  const batch = db.batch();

  for (const occDoc of occurrencesSnap.docs) {
    const participantRef = occDoc.ref.collection('participants').doc(userId);
    const participantSnap = await participantRef.get();

    if (participantSnap.exists && participantSnap.data()?.status === 'expected') {
      batch.delete(participantRef);

      batch.update(occDoc.ref, {
        expectedCount: FieldValue.increment(-1),
        updatedAt: Date.now(),
      });

      const indexRef = db
        .collection('meetupOccurrencesIndex')
        .doc(`${standingMeetupId}_${occDoc.id}`);
      batch.update(indexRef, {
        expectedCount: FieldValue.increment(-1),
        spotsLeft: FieldValue.increment(1),
        updatedAt: Date.now(),
      });
    }
  }

  await batch.commit();
}

async function removePlayerFromSelectedOccurrences(
  standingMeetupId: string,
  userId: string,
  sessionIds: string[]
): Promise<void> {
  const now = Date.now();
  const batch = db.batch();
  let removedCount = 0;

  for (const dateId of sessionIds) {
    const occRef = db
      .collection('standingMeetups')
      .doc(standingMeetupId)
      .collection('occurrences')
      .doc(dateId);

    const occSnap = await occRef.get();
    if (!occSnap.exists) continue;

    const occData = occSnap.data() as any;

    if (occData.startAt < now) continue;

    const participantRef = occRef.collection('participants').doc(userId);
    const participantSnap = await participantRef.get();

    if (participantSnap.exists && participantSnap.data()?.status === 'expected') {
      batch.delete(participantRef);

      batch.update(occRef, {
        expectedCount: FieldValue.increment(-1),
        updatedAt: Date.now(),
      });

      const indexRef = db
        .collection('meetupOccurrencesIndex')
        .doc(`${standingMeetupId}_${dateId}`);
      batch.update(indexRef, {
        expectedCount: FieldValue.increment(-1),
        spotsLeft: FieldValue.increment(1),
        updatedAt: Date.now(),
      });

      removedCount++;
    }
  }

  await batch.commit();
  console.log(`Removed ${userId} from ${removedCount} selected occurrences`);
}

// =============================================================================
// Helper: Format Session Date for Display
// =============================================================================

function formatSessionDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const dayName = days[date.getDay()];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();

  return `${dayName} ${day} ${month} ${year}`;
}

// =============================================================================
// Helper: Check if User is Club Admin or Meetup Organizer
// =============================================================================

async function isOrganizerOrClubAdmin(
  userId: string,
  meetup: StandingMeetup
): Promise<boolean> {
  // Check if user is the meetup creator
  if (meetup.createdByUserId === userId) {
    return true;
  }

  // Check if user is a club admin/owner
  const clubMemberSnap = await db
    .collection('clubs')
    .doc(meetup.clubId)
    .collection('members')
    .doc(userId)
    .get();

  if (clubMemberSnap.exists) {
    const memberRole = clubMemberSnap.data()?.role;
    if (['owner', 'admin'].includes(memberRole)) {
      return true;
    }
  }

  return false;
}

// =============================================================================
// Self Check-In (Auth-based, no token - player scans static session QR)
// =============================================================================

export const standingMeetup_checkInSelf = functions
  .region('australia-southeast1')
  .https.onCall(async (data: { standingMeetupId: string; occurrenceId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { standingMeetupId, occurrenceId } = data;
    const userId = context.auth.uid;

    if (!standingMeetupId || !occurrenceId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'standingMeetupId and occurrenceId are required'
      );
    }

    // Get the meetup for title
    const meetupRef = db.collection('standingMeetups').doc(standingMeetupId);
    const meetupSnap = await meetupRef.get();

    if (!meetupSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'MEETUP_NOT_FOUND');
    }

    const meetup = meetupSnap.data() as StandingMeetup;

    // Get the occurrence
    const occurrenceRef = meetupRef.collection('occurrences').doc(occurrenceId);
    const occurrenceSnap = await occurrenceRef.get();

    if (!occurrenceSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'OCCURRENCE_NOT_FOUND');
    }

    const occurrence = occurrenceSnap.data() as MeetupOccurrence;

    // Check occurrence status is valid for check-in
    if (!['scheduled', 'in_progress'].includes(occurrence.status)) {
      throw new functions.https.HttpsError('failed-precondition', 'SESSION_NOT_ACTIVE');
    }

    // Check session is not closed
    if (occurrence.closedAt) {
      throw new functions.https.HttpsError('failed-precondition', 'SESSION_ALREADY_CLOSED');
    }

    // Check user is a participant
    const participantRef = occurrenceRef.collection('participants').doc(userId);
    const participantSnap = await participantRef.get();

    if (!participantSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'NOT_PARTICIPANT');
    }

    const participant = participantSnap.data() as OccurrenceParticipant;

    // Check not already checked in
    if (participant.status === 'checked_in') {
      throw new functions.https.HttpsError('already-exists', 'ALREADY_CHECKED_IN');
    }

    // Perform check-in using existing helper
    const checkedInAt = Date.now();
    await updateParticipantStatus(standingMeetupId, occurrenceId, userId, 'checked_in', {
      checkedInAt,
      checkInMethod: 'qr',
    });

    return {
      success: true,
      checkedInAt,
      sessionDate: formatSessionDate(occurrence.date),
      meetupTitle: meetup.title,
    };
  });

// =============================================================================
// Add Cash Guest (Organizer only)
// =============================================================================

interface OccurrenceGuest {
  id: string;
  name: string;
  email?: string;
  emailConsent?: boolean;
  amount: number;
  paymentMethod: 'cash' | 'stripe';
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
  receivedBy?: string;
  notes?: string;
  createdAt: number;
  createdBy: string;
}

export const standingMeetup_addCashGuest = functions
  .region('australia-southeast1')
  .https.onCall(async (data: {
    standingMeetupId: string;
    occurrenceId: string;
    name: string;
    email?: string;
    amount: number;
    notes?: string;
    emailConsent?: boolean;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { standingMeetupId, occurrenceId, name, email, amount, notes, emailConsent } = data;
    const userId = context.auth.uid;

    // Validate required fields
    if (!standingMeetupId || !occurrenceId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'standingMeetupId and occurrenceId are required'
      );
    }

    if (!name || name.trim().length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'GUEST_NAME_REQUIRED');
    }

    if (typeof amount !== 'number' || amount < 0) {
      throw new functions.https.HttpsError('invalid-argument', 'INVALID_AMOUNT');
    }

    // Get the meetup
    const meetupRef = db.collection('standingMeetups').doc(standingMeetupId);
    const meetupSnap = await meetupRef.get();

    if (!meetupSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'MEETUP_NOT_FOUND');
    }

    const meetup = meetupSnap.data() as StandingMeetup;

    // Check authorization
    const isAuthorized = await isOrganizerOrClubAdmin(userId, meetup);
    if (!isAuthorized) {
      throw new functions.https.HttpsError('permission-denied', 'NOT_CLUB_ADMIN');
    }

    // Get the occurrence
    const occurrenceRef = meetupRef.collection('occurrences').doc(occurrenceId);
    const occurrenceSnap = await occurrenceRef.get();

    if (!occurrenceSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'OCCURRENCE_NOT_FOUND');
    }

    const occurrence = occurrenceSnap.data() as MeetupOccurrence;

    // Check session is not closed
    if (occurrence.closedAt) {
      throw new functions.https.HttpsError('failed-precondition', 'SESSION_ALREADY_CLOSED');
    }

    // Create guest document and update counters atomically
    const guestRef = occurrenceRef.collection('guests').doc();
    const guestId = guestRef.id;

    // Build guest data, omitting optional fields that are empty
    // Firestore rejects undefined values, so we only add fields that have values
    const guestData: OccurrenceGuest = {
      id: guestId,
      name: name.trim(),
      amount,
      paymentMethod: 'cash',
      receivedBy: userId,
      createdAt: Date.now(),
      createdBy: userId,
      ...(email?.trim() && { email: email.trim() }),
      ...(notes?.trim() && { notes: notes.trim() }),
      ...(typeof emailConsent === 'boolean' && { emailConsent }),
    };

    // Use transaction to atomically create guest and update counters
    const result = await db.runTransaction(async (transaction) => {
      // Re-read occurrence in transaction
      const occSnap = await transaction.get(occurrenceRef);
      if (!occSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'OCCURRENCE_NOT_FOUND');
      }

      const occData = occSnap.data() as MeetupOccurrence;

      // Check again session is not closed (in transaction)
      if (occData.closedAt) {
        throw new functions.https.HttpsError('failed-precondition', 'SESSION_ALREADY_CLOSED');
      }

      // Create guest document
      transaction.set(guestRef, guestData);

      // Update occurrence counters
      const newGuestCount = (occData.guestCount || 0) + 1;
      const newGuestRevenue = (occData.guestRevenue || 0) + amount;

      transaction.update(occurrenceRef, {
        guestCount: FieldValue.increment(1),
        guestRevenue: FieldValue.increment(amount),
        updatedAt: Date.now(),
      });

      return { guestCount: newGuestCount };
    });

    return {
      success: true,
      guestId,
      guestCount: result.guestCount,
    };
  });

// =============================================================================
// Close Session (Organizer only)
// =============================================================================

export const standingMeetup_closeSession = functions
  .region('australia-southeast1')
  .https.onCall(async (data: { standingMeetupId: string; occurrenceId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { standingMeetupId, occurrenceId } = data;
    const userId = context.auth.uid;

    if (!standingMeetupId || !occurrenceId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'standingMeetupId and occurrenceId are required'
      );
    }

    // Get the meetup
    const meetupRef = db.collection('standingMeetups').doc(standingMeetupId);
    const meetupSnap = await meetupRef.get();

    if (!meetupSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'MEETUP_NOT_FOUND');
    }

    const meetup = meetupSnap.data() as StandingMeetup;

    // Check authorization
    const isAuthorized = await isOrganizerOrClubAdmin(userId, meetup);
    if (!isAuthorized) {
      throw new functions.https.HttpsError('permission-denied', 'NOT_CLUB_ADMIN');
    }

    // Get the occurrence
    const occurrenceRef = meetupRef.collection('occurrences').doc(occurrenceId);
    const occurrenceSnap = await occurrenceRef.get();

    if (!occurrenceSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'OCCURRENCE_NOT_FOUND');
    }

    const occurrence = occurrenceSnap.data() as MeetupOccurrence;

    // Check session is not already closed
    if (occurrence.closedAt) {
      throw new functions.https.HttpsError('failed-precondition', 'SESSION_ALREADY_CLOSED');
    }

    // Get all participants with status='expected' and mark them as no-show
    const participantsSnap = await occurrenceRef
      .collection('participants')
      .where('status', '==', 'expected')
      .get();

    const noShowCount = participantsSnap.size;
    const closedAt = Date.now();

    // Use batch for atomic updates
    const batch = db.batch();

    // Update each expected participant to no_show
    for (const participantDoc of participantsSnap.docs) {
      batch.update(participantDoc.ref, {
        status: 'no_show',
        updatedAt: closedAt,
      });
    }

    // Update occurrence: counters, closedAt, closedBy
    batch.update(occurrenceRef, {
      noShowCount: FieldValue.increment(noShowCount),
      expectedCount: 0, // All expected are now no_shows
      closedAt,
      closedBy: userId,
      status: 'completed',
      updatedAt: closedAt,
    });

    // Update index
    const indexRef = db
      .collection('meetupOccurrencesIndex')
      .doc(`${standingMeetupId}_${occurrenceId}`);
    batch.update(indexRef, {
      status: 'completed',
      updatedAt: closedAt,
    });

    await batch.commit();

    // Calculate final counts
    const finalCounts = {
      checkedIn: occurrence.checkedInCount || 0,
      guests: occurrence.guestCount || 0,
      noShows: (occurrence.noShowCount || 0) + noShowCount,
      totalPlayed: (occurrence.checkedInCount || 0) + (occurrence.guestCount || 0),
    };

    return {
      success: true,
      closedAt,
      finalCounts,
    };
  });

// =============================================================================
// Check-In Player via QR Scan (Organizer Only)
// =============================================================================

/**
 * Check in a player by scanning their QR code (organizer action)
 * This is different from standingMeetup_checkInSelf (player self-check-in)
 * and standingMeetup_manualCheckIn (organizer selects from list)
 *
 * Input: { standingMeetupId, occurrenceId, playerUserId }
 * - Verifies caller is organizer/admin of the meetup
 * - Checks the player is registered for this occurrence
 * - Updates their registration to checked_in status
 * - Increments checkedInCount on the occurrence
 */
export const standingMeetup_checkInPlayer = functions
  .region('australia-southeast1')
  .https.onCall(async (data: {
    standingMeetupId: string;
    occurrenceId: string;
    playerUserId: string;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { standingMeetupId, occurrenceId, playerUserId } = data;
    const callerUserId = context.auth.uid;

    // Validate required fields
    if (!standingMeetupId || !occurrenceId || !playerUserId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'standingMeetupId, occurrenceId, and playerUserId are required'
      );
    }

    // Get the meetup
    const meetupRef = db.collection('standingMeetups').doc(standingMeetupId);
    const meetupSnap = await meetupRef.get();

    if (!meetupSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'MEETUP_NOT_FOUND');
    }

    const meetup = meetupSnap.data() as StandingMeetup;

    // Check authorization - must be organizer or club admin
    const isAuthorized = await isOrganizerOrClubAdmin(callerUserId, meetup);
    if (!isAuthorized) {
      throw new functions.https.HttpsError('permission-denied', 'NOT_AUTHORIZED');
    }

    // Get the occurrence
    const occurrenceRef = meetupRef.collection('occurrences').doc(occurrenceId);
    const occurrenceSnap = await occurrenceRef.get();

    if (!occurrenceSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'OCCURRENCE_NOT_FOUND');
    }

    const occurrence = occurrenceSnap.data() as MeetupOccurrence;

    // Check occurrence status is valid for check-in
    if (!['scheduled', 'in_progress'].includes(occurrence.status)) {
      throw new functions.https.HttpsError('failed-precondition', 'SESSION_NOT_ACTIVE');
    }

    // Check session is not closed
    if (occurrence.closedAt) {
      throw new functions.https.HttpsError('failed-precondition', 'SESSION_ALREADY_CLOSED');
    }

    // Check user is a participant
    const participantRef = occurrenceRef.collection('participants').doc(playerUserId);
    const participantSnap = await participantRef.get();

    if (!participantSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'NOT_PARTICIPANT');
    }

    const participant = participantSnap.data() as OccurrenceParticipant;

    // Check not already checked in
    if (participant.status === 'checked_in') {
      throw new functions.https.HttpsError('already-exists', 'ALREADY_CHECKED_IN');
    }

    // Perform check-in using existing helper
    const checkedInAt = Date.now();
    await updateParticipantStatus(standingMeetupId, occurrenceId, playerUserId, 'checked_in', {
      checkedInAt,
      checkInMethod: 'qr', // Via QR scan
      checkedInBy: callerUserId, // Track who scanned
    });

    // Get player name for response
    const playerName = participant.userName || 'Player';

    return {
      success: true,
      checkedInAt,
      playerUserId,
      playerName,
    };
  });

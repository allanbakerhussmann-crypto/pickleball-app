/**
 * Meetup Cloud Functions
 *
 * Server-side functions for enhanced meetup management:
 * - Pay-to-play RSVP with Stripe checkout
 * - Free RSVP with auto-waitlist
 * - Transactional waitlist promotion
 * - Promotion hold expiry (15-min window)
 * - Manual check-in
 * - Mark no-show
 * - Add cash guest
 * - Close session
 * - Cancel RSVP with refund deadline
 *
 * NOTE: Using 1st Gen functions for reliable deployment
 * (2nd Gen has Container Healthcheck issues in australia-southeast1)
 *
 * @version 07.61
 * @file functions/src/meetups.ts
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import Stripe from 'stripe';
import {
  tryClaimAccountFee,
  STRIPE_ACCOUNT_FEE_CENTS,
  MIN_PAYMENT_FOR_ACCOUNT_FEE,
} from './stripe';

const db = admin.firestore();

// =============================================================================
// Constants
// =============================================================================

const PLATFORM_FEE_PERCENT = 0.015; // 1.5% standard rate
const PROMOTION_HOLD_MINUTES = 15;
const PROMOTION_HOLD_MS = PROMOTION_HOLD_MINUTES * 60 * 1000;

// =============================================================================
// Types (server-side copies)
// =============================================================================

type MeetupRsvpStatus = 'confirmed' | 'waitlisted' | 'cancelled' | 'no_show';
type MeetupPaymentStatus = 'not_required' | 'pending' | 'paid' | 'refunded' | 'failed' | 'expired';

interface MeetupRsvpData {
  odUserId: string;
  odUserName: string;
  odUserEmail?: string;
  odUserPhone?: string;
  meetupId: string;
  rsvpAt: number;
  updatedAt: number;
  duprId?: string;
  status: MeetupRsvpStatus;
  paymentStatus: MeetupPaymentStatus;
  amountPaid?: number;
  paidAt?: number;
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  waitlistPosition?: number;
  promotedAt?: number;
  promotionExpiresAt?: number;
  checkedInAt?: number;
  checkInMethod?: 'qr' | 'organizer' | 'manual';
  checkedInBy?: string;
  cancelledAt?: number;
  refundIssued?: boolean;
  refundAmount?: number;
}

interface MeetupData {
  id: string;
  hostId: string;
  coHostIds?: string[];
  maxAttendees?: number;
  pricing?: {
    enabled: boolean;
    amount: number;
    currency: string;
    feesPaidBy: 'organizer' | 'player';
  };
  rsvpSettings?: {
    requirePayment: boolean;
    autoConfirm: boolean;
    refundDeadlineHours?: number;
  };
  waitlistEnabled?: boolean;
  cancellationPolicy?: {
    refundDeadlineHours: number;
    noRefundAfterDeadline: boolean;
    creditInsteadOfRefund?: boolean;
  };
  checkInEnabled?: boolean;
  stripeConnectedAccountId?: string;
  date: number;
  status: string;
  confirmedCount?: number;
  waitlistCount?: number;
  checkedInCount?: number;
  cancelledCount?: number;
  noShowCount?: number;
  guestCount?: number;
  guestRevenue?: number;
  closedAt?: number;
}

// =============================================================================
// Auth Helpers
// =============================================================================

function isMeetupOrganizer(userId: string, meetup: MeetupData): boolean {
  return meetup.hostId === userId ||
         meetup.coHostIds?.includes(userId) || false;
}

async function isAppAdmin(userId: string): Promise<boolean> {
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data();
  return userData?.isAppAdmin === true ||
    userData?.role === 'app_admin' ||
    (Array.isArray(userData?.roles) && userData.roles.includes('app_admin'));
}

async function isOrganizerOrAdmin(userId: string, meetup: MeetupData): Promise<boolean> {
  if (isMeetupOrganizer(userId, meetup)) return true;
  return isAppAdmin(userId);
}

// =============================================================================
// Stripe initialization
// =============================================================================

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
// RSVP with Payment (Pay-to-play)
// =============================================================================

export const meetup_rsvpWithPayment = functions
  .region('australia-southeast1')
  .https.onCall(async (data: {
    meetupId: string;
    successUrl: string;
    cancelUrl: string;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { meetupId, successUrl, cancelUrl } = data;
    const userId = context.auth.uid;

    if (!meetupId || !successUrl || !cancelUrl) {
      throw new functions.https.HttpsError('invalid-argument', 'meetupId, successUrl, and cancelUrl are required');
    }

    if (!stripe) {
      throw new functions.https.HttpsError('failed-precondition', 'Stripe not configured');
    }

    // Get meetup
    const meetupRef = db.collection('meetups').doc(meetupId);
    const meetupSnap = await meetupRef.get();

    if (!meetupSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'MEETUP_NOT_FOUND');
    }

    const meetup = { id: meetupSnap.id, ...meetupSnap.data() } as MeetupData;

    // Validate meetup is active
    if (meetup.status === 'cancelled' || meetup.status === 'completed') {
      throw new functions.https.HttpsError('failed-precondition', 'MEETUP_NOT_ACTIVE');
    }

    // Check session not closed
    if (meetup.closedAt) {
      throw new functions.https.HttpsError('failed-precondition', 'SESSION_CLOSED');
    }

    // Validate pricing
    if (!meetup.pricing?.enabled || !meetup.pricing.amount) {
      throw new functions.https.HttpsError('failed-precondition', 'PAYMENT_NOT_REQUIRED');
    }

    if (!meetup.stripeConnectedAccountId) {
      throw new functions.https.HttpsError('failed-precondition', 'ORGANIZER_NOT_CONNECTED');
    }

    // Check for existing RSVP
    const rsvpRef = meetupRef.collection('rsvps').doc(userId);
    const existingRsvp = await rsvpRef.get();

    if (existingRsvp.exists) {
      const rsvpData = existingRsvp.data() as MeetupRsvpData;
      if (rsvpData.status === 'confirmed' && rsvpData.paymentStatus === 'paid') {
        throw new functions.https.HttpsError('already-exists', 'ALREADY_CONFIRMED');
      }
      // Allow re-RSVP if cancelled or expired
      if (rsvpData.status !== 'cancelled' && rsvpData.paymentStatus !== 'expired') {
        throw new functions.https.HttpsError('already-exists', 'RSVP_EXISTS');
      }
    }

    // Get user info
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const userName = userData?.displayName || userData?.email || 'Unknown';
    const userEmail = userData?.email || '';

    // Determine if full -> waitlist
    const confirmedCount = meetup.confirmedCount || 0;
    const maxPlayers = meetup.maxAttendees || 999;
    const isFull = confirmedCount >= maxPlayers;
    const shouldWaitlist = isFull && meetup.waitlistEnabled;

    if (isFull && !shouldWaitlist) {
      throw new functions.https.HttpsError('failed-precondition', 'MEETUP_FULL');
    }

    // If waitlisted, no payment needed yet
    if (shouldWaitlist) {
      // Get waitlist position
      const waitlistSnap = await meetupRef.collection('rsvps')
        .where('status', '==', 'waitlisted')
        .orderBy('rsvpAt', 'asc')
        .get();

      const waitlistPosition = waitlistSnap.size + 1;
      const now = Date.now();

      await rsvpRef.set({
        odUserId: userId,
        odUserName: userName,
        odUserEmail: userEmail,
        meetupId,
        rsvpAt: now,
        updatedAt: now,
        status: 'waitlisted' as MeetupRsvpStatus,
        paymentStatus: 'not_required' as MeetupPaymentStatus,
        waitlistPosition,
        duprId: userData?.duprId || null,
      });

      // Update waitlist counter
      await meetupRef.update({
        waitlistCount: FieldValue.increment(1),
        updatedAt: now,
      });

      return {
        success: true,
        waitlisted: true,
        waitlistPosition,
      };
    }

    // Not waitlisted: create Stripe checkout
    const amount = meetup.pricing.amount; // cents
    const currency = meetup.pricing.currency || 'nzd';
    let platformFee = Math.round(amount * PLATFORM_FEE_PERCENT);

    // Try to claim monthly account fee ($2/month for active Stripe Connect accounts)
    let accountFeeIncluded = false;
    let accountFeeMonth = '';
    let accountFeeLockId = '';

    // Regular meetups use hostId (user) as organizer, not clubs
    const organizerType: 'club' | 'user' = 'user';
    const organizerId = meetup.hostId;

    if (organizerId && meetup.stripeConnectedAccountId && amount >= MIN_PAYMENT_FOR_ACCOUNT_FEE) {
      try {
        const feeResult = await tryClaimAccountFee(organizerType, organizerId);
        if (feeResult.shouldCharge && feeResult.lockId) {
          platformFee += STRIPE_ACCOUNT_FEE_CENTS;
          accountFeeIncluded = true;
          accountFeeMonth = feeResult.currentMonth;
          accountFeeLockId = feeResult.lockId;
          console.log(`[Meetup] Claimed $2 account fee for ${organizerType}/${organizerId} (${accountFeeMonth}, lock=${accountFeeLockId})`);
        } else {
          console.log(`[Meetup] Account fee not claimed for ${organizerType}/${organizerId} (already collected or exempt)`);
        }
      } catch (feeError) {
        // Don't fail checkout if fee claim fails - just log and continue
        console.error(`[Meetup] Failed to claim account fee:`, feeError);
      }
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: userEmail || undefined,
      line_items: [{
        price_data: {
          currency,
          product_data: {
            name: `Meetup RSVP`,
            description: meetup.id,
          },
          unit_amount: amount,
        },
        quantity: 1,
      }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        type: 'meetup',
        meetupId,
        odUserId: userId,
        organizerUserId: meetup.hostId,
        // Account fee metadata (for webhook confirmation)
        accountFeeIncluded: accountFeeIncluded ? 'true' : 'false',
        accountFeeMonth,
        accountFeeLockId,
        accountFeeOrganizerType: organizerType,
        accountFeeOrganizerId: organizerId,
      },
      payment_intent_data: {
        application_fee_amount: platformFee,
        metadata: {
          type: 'meetup',
          meetupId,
          odUserId: userId,
          organizerUserId: meetup.hostId,
        },
      },
    }, {
      stripeAccount: meetup.stripeConnectedAccountId,
    });

    // Create RSVP doc with pending payment
    const now = Date.now();
    await rsvpRef.set({
      odUserId: userId,
      odUserName: userName,
      odUserEmail: userEmail,
      meetupId,
      rsvpAt: now,
      updatedAt: now,
      status: 'confirmed' as MeetupRsvpStatus,
      paymentStatus: 'pending' as MeetupPaymentStatus,
      stripeSessionId: checkoutSession.id,
      duprId: userData?.duprId || null,
    });

    // Increment confirmed count (will decrement if payment fails/expires)
    await meetupRef.update({
      confirmedCount: FieldValue.increment(1),
      updatedAt: now,
    });

    return {
      success: true,
      checkoutUrl: checkoutSession.url,
      sessionId: checkoutSession.id,
    };
  });

// =============================================================================
// Free RSVP (no payment required)
// =============================================================================

export const meetup_rsvpFree = functions
  .region('australia-southeast1')
  .https.onCall(async (data: { meetupId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { meetupId } = data;
    const userId = context.auth.uid;

    if (!meetupId) {
      throw new functions.https.HttpsError('invalid-argument', 'meetupId is required');
    }

    const meetupRef = db.collection('meetups').doc(meetupId);
    const meetupSnap = await meetupRef.get();

    if (!meetupSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'MEETUP_NOT_FOUND');
    }

    const meetup = { id: meetupSnap.id, ...meetupSnap.data() } as MeetupData;

    if (meetup.status === 'cancelled' || meetup.status === 'completed') {
      throw new functions.https.HttpsError('failed-precondition', 'MEETUP_NOT_ACTIVE');
    }

    if (meetup.closedAt) {
      throw new functions.https.HttpsError('failed-precondition', 'SESSION_CLOSED');
    }

    // If pricing enabled and requirePayment, reject free RSVP
    if (meetup.pricing?.enabled && meetup.rsvpSettings?.requirePayment) {
      throw new functions.https.HttpsError('failed-precondition', 'PAYMENT_REQUIRED');
    }

    // Check for existing RSVP
    const rsvpRef = meetupRef.collection('rsvps').doc(userId);
    const existingRsvp = await rsvpRef.get();

    if (existingRsvp.exists) {
      const rsvpData = existingRsvp.data() as MeetupRsvpData;
      if (rsvpData.status === 'confirmed' || rsvpData.status === 'waitlisted') {
        throw new functions.https.HttpsError('already-exists', 'RSVP_EXISTS');
      }
    }

    // Get user info
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const userName = userData?.displayName || userData?.email || 'Unknown';
    const userEmail = userData?.email || '';

    // Determine capacity
    const confirmedCount = meetup.confirmedCount || 0;
    const maxPlayers = meetup.maxAttendees || 999;
    const isFull = confirmedCount >= maxPlayers;
    const shouldWaitlist = isFull && meetup.waitlistEnabled;

    if (isFull && !shouldWaitlist) {
      throw new functions.https.HttpsError('failed-precondition', 'MEETUP_FULL');
    }

    const now = Date.now();

    if (shouldWaitlist) {
      const waitlistSnap = await meetupRef.collection('rsvps')
        .where('status', '==', 'waitlisted')
        .orderBy('rsvpAt', 'asc')
        .get();

      const waitlistPosition = waitlistSnap.size + 1;

      await rsvpRef.set({
        odUserId: userId,
        odUserName: userName,
        odUserEmail: userEmail,
        meetupId,
        rsvpAt: now,
        updatedAt: now,
        status: 'waitlisted' as MeetupRsvpStatus,
        paymentStatus: 'not_required' as MeetupPaymentStatus,
        waitlistPosition,
        duprId: userData?.duprId || null,
      });

      await meetupRef.update({
        waitlistCount: FieldValue.increment(1),
        updatedAt: now,
      });

      return { success: true, waitlisted: true, waitlistPosition };
    }

    // Confirm directly
    await rsvpRef.set({
      odUserId: userId,
      odUserName: userName,
      odUserEmail: userEmail,
      meetupId,
      rsvpAt: now,
      updatedAt: now,
      status: 'confirmed' as MeetupRsvpStatus,
      paymentStatus: 'not_required' as MeetupPaymentStatus,
      duprId: userData?.duprId || null,
    });

    await meetupRef.update({
      confirmedCount: FieldValue.increment(1),
      updatedAt: now,
    });

    return { success: true, waitlisted: false };
  });

// =============================================================================
// Cancel RSVP (Player cancels themselves)
// =============================================================================

export const meetup_cancelRsvp = functions
  .region('australia-southeast1')
  .https.onCall(async (data: { meetupId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { meetupId } = data;
    const userId = context.auth.uid;

    if (!meetupId) {
      throw new functions.https.HttpsError('invalid-argument', 'meetupId is required');
    }

    const meetupRef = db.collection('meetups').doc(meetupId);
    const rsvpRef = meetupRef.collection('rsvps').doc(userId);

    // Run in transaction for atomic counter updates + waitlist promotion
    const result = await db.runTransaction(async (transaction) => {
      const meetupSnap = await transaction.get(meetupRef);
      const rsvpSnap = await transaction.get(rsvpRef);

      if (!meetupSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'MEETUP_NOT_FOUND');
      }

      if (!rsvpSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'RSVP_NOT_FOUND');
      }

      const meetup = { id: meetupSnap.id, ...meetupSnap.data() } as MeetupData;
      const rsvp = rsvpSnap.data() as MeetupRsvpData;

      if (rsvp.status === 'cancelled') {
        throw new functions.https.HttpsError('failed-precondition', 'ALREADY_CANCELLED');
      }

      const now = Date.now();
      const wasConfirmed = rsvp.status === 'confirmed';
      const wasWaitlisted = rsvp.status === 'waitlisted';

      // Determine refund eligibility
      let refundEligible = false;
      if (rsvp.paymentStatus === 'paid' && meetup.cancellationPolicy) {
        const meetupStartAt = meetup.date;
        const deadlineMs = meetup.cancellationPolicy.refundDeadlineHours * 60 * 60 * 1000;
        const refundDeadline = meetupStartAt - deadlineMs;
        refundEligible = now < refundDeadline;
      }

      // Cancel the RSVP - spot freed immediately
      transaction.update(rsvpRef, {
        status: 'cancelled' as MeetupRsvpStatus,
        cancelledAt: now,
        updatedAt: now,
        ...(refundEligible ? { refundIssued: true } : {}),
      });

      // Update counters
      const counterUpdates: any = { updatedAt: now };
      if (wasConfirmed) {
        counterUpdates.confirmedCount = FieldValue.increment(-1);
      } else if (wasWaitlisted) {
        counterUpdates.waitlistCount = FieldValue.increment(-1);
      }
      counterUpdates.cancelledCount = FieldValue.increment(1);
      transaction.update(meetupRef, counterUpdates);

      // If confirmed player cancelled, promote first waitlisted
      let promotedUserId: string | null = null;
      if (wasConfirmed && meetup.waitlistEnabled) {
        const waitlistSnap = await transaction.get(
          meetupRef.collection('rsvps')
            .where('status', '==', 'waitlisted')
            .orderBy('rsvpAt', 'asc')
            .limit(1)
        );

        if (!waitlistSnap.empty) {
          const nextDoc = waitlistSnap.docs[0];
          promotedUserId = nextDoc.id;
          const requiresPayment = meetup.pricing?.enabled && meetup.rsvpSettings?.requirePayment;

          transaction.update(nextDoc.ref, {
            status: 'confirmed' as MeetupRsvpStatus,
            promotedAt: now,
            updatedAt: now,
            waitlistPosition: FieldValue.delete(),
            ...(requiresPayment ? {
              paymentStatus: 'pending' as MeetupPaymentStatus,
              promotionExpiresAt: now + PROMOTION_HOLD_MS,
            } : {}),
          });

          // Adjust counters for promotion
          transaction.update(meetupRef, {
            confirmedCount: FieldValue.increment(1),
            waitlistCount: FieldValue.increment(-1),
          });
        }
      }

      return { refundEligible, promotedUserId, wasConfirmed, wasWaitlisted };
    });

    // Handle refund outside transaction (Stripe API call)
    if (result.refundEligible) {
      // Refund is processed asynchronously - the spot is already freed
      try {
        const rsvpSnap = await rsvpRef.get();
        const rsvpData = rsvpSnap.data() as MeetupRsvpData;
        if (rsvpData.stripePaymentIntentId && stripe) {
          const meetupSnap = await meetupRef.get();
          const meetupData = meetupSnap.data() as MeetupData;
          await stripe.refunds.create({
            payment_intent: rsvpData.stripePaymentIntentId,
          }, {
            stripeAccount: meetupData.stripeConnectedAccountId,
          });
          await rsvpRef.update({
            paymentStatus: 'refunded' as MeetupPaymentStatus,
            refundAmount: rsvpData.amountPaid,
          });
        }
      } catch (err) {
        console.error('Refund failed for meetup RSVP cancellation:', err);
        // Spot is already freed, refund failure is logged but doesn't block
      }
    }

    return {
      success: true,
      refundEligible: result.refundEligible,
      promotedUserId: result.promotedUserId,
    };
  });

// =============================================================================
// Expire Promotion Holds (Scheduled - runs every 5 minutes)
// =============================================================================

export const meetup_expirePromotionHolds = functions
  .region('australia-southeast1')
  .pubsub.schedule('every 5 minutes')
  .onRun(async () => {
    const now = Date.now();

    // Find all RSVPs with expired promotion holds
    const expiredSnap = await db.collectionGroup('rsvps')
      .where('status', '==', 'confirmed')
      .where('paymentStatus', '==', 'pending')
      .where('promotionExpiresAt', '<=', now)
      .get();

    if (expiredSnap.empty) {
      console.log('No expired promotion holds found');
      return null;
    }

    console.log(`Found ${expiredSnap.size} expired promotion holds`);

    for (const doc of expiredSnap.docs) {
      try {
        const rsvpData = doc.data() as MeetupRsvpData;
        const meetupId = rsvpData.meetupId;
        const userId = doc.id;
        const meetupRef = db.collection('meetups').doc(meetupId);
        const rsvpRef = meetupRef.collection('rsvps').doc(userId);

        await db.runTransaction(async (transaction) => {
          const rsvpSnap = await transaction.get(rsvpRef);
          if (!rsvpSnap.exists) return;

          const currentData = rsvpSnap.data() as MeetupRsvpData;

          // Double-check still expired
          if (currentData.status !== 'confirmed' ||
              currentData.paymentStatus !== 'pending' ||
              !currentData.promotionExpiresAt ||
              currentData.promotionExpiresAt > now) {
            return;
          }

          // Expire: set payment to expired, cancel RSVP
          transaction.update(rsvpRef, {
            status: 'cancelled' as MeetupRsvpStatus,
            paymentStatus: 'expired' as MeetupPaymentStatus,
            cancelledAt: now,
            updatedAt: now,
          });

          // Update meetup counters
          transaction.update(meetupRef, {
            confirmedCount: FieldValue.increment(-1),
            cancelledCount: FieldValue.increment(1),
            updatedAt: now,
          });

          // Promote next waitlisted
          const meetupSnap = await transaction.get(meetupRef);
          const meetupData = meetupSnap.data() as MeetupData;

          if (meetupData?.waitlistEnabled) {
            const waitlistSnap = await transaction.get(
              meetupRef.collection('rsvps')
                .where('status', '==', 'waitlisted')
                .orderBy('rsvpAt', 'asc')
                .limit(1)
            );

            if (!waitlistSnap.empty) {
              const nextDoc = waitlistSnap.docs[0];
              const requiresPayment = meetupData.pricing?.enabled && meetupData.rsvpSettings?.requirePayment;

              transaction.update(nextDoc.ref, {
                status: 'confirmed' as MeetupRsvpStatus,
                promotedAt: now,
                updatedAt: now,
                waitlistPosition: FieldValue.delete(),
                ...(requiresPayment ? {
                  paymentStatus: 'pending' as MeetupPaymentStatus,
                  promotionExpiresAt: now + PROMOTION_HOLD_MS,
                } : {}),
              });

              transaction.update(meetupRef, {
                confirmedCount: FieldValue.increment(1),
                waitlistCount: FieldValue.increment(-1),
              });
            }
          }
        });

        console.log(`Expired promotion hold for user ${userId} in meetup ${meetupId}`);
      } catch (err) {
        console.error(`Error expiring promotion hold for ${doc.ref.path}:`, err);
      }
    }

    return null;
  });

// =============================================================================
// Manual Check-In (Organizer action)
// =============================================================================

export const meetup_manualCheckIn = functions
  .region('australia-southeast1')
  .https.onCall(async (data: {
    meetupId: string;
    targetUserId: string;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { meetupId, targetUserId } = data;
    const userId = context.auth.uid;

    if (!meetupId || !targetUserId) {
      throw new functions.https.HttpsError('invalid-argument', 'meetupId and targetUserId are required');
    }

    const meetupRef = db.collection('meetups').doc(meetupId);
    const meetupSnap = await meetupRef.get();

    if (!meetupSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'MEETUP_NOT_FOUND');
    }

    const meetup = { id: meetupSnap.id, ...meetupSnap.data() } as MeetupData;

    // Check authorization (host or co-host)
    const isAuthorized = await isOrganizerOrAdmin(userId, meetup);
    if (!isAuthorized) {
      throw new functions.https.HttpsError('permission-denied', 'NOT_ORGANIZER');
    }

    if (meetup.closedAt) {
      throw new functions.https.HttpsError('failed-precondition', 'SESSION_CLOSED');
    }

    const rsvpRef = meetupRef.collection('rsvps').doc(targetUserId);
    const rsvpSnap = await rsvpRef.get();

    if (!rsvpSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'RSVP_NOT_FOUND');
    }

    const rsvp = rsvpSnap.data() as MeetupRsvpData;

    if (rsvp.checkedInAt) {
      throw new functions.https.HttpsError('already-exists', 'ALREADY_CHECKED_IN');
    }

    if (rsvp.status !== 'confirmed') {
      throw new functions.https.HttpsError('failed-precondition', 'NOT_CONFIRMED');
    }

    const now = Date.now();
    await rsvpRef.update({
      checkedInAt: now,
      checkInMethod: 'organizer',
      checkedInBy: userId,
      updatedAt: now,
    });

    await meetupRef.update({
      checkedInCount: FieldValue.increment(1),
      updatedAt: now,
    });

    return { success: true, checkedInAt: now };
  });

// =============================================================================
// Mark No-Show (Organizer action)
// =============================================================================

export const meetup_markNoShow = functions
  .region('australia-southeast1')
  .https.onCall(async (data: {
    meetupId: string;
    targetUserId: string;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { meetupId, targetUserId } = data;
    const userId = context.auth.uid;

    if (!meetupId || !targetUserId) {
      throw new functions.https.HttpsError('invalid-argument', 'meetupId and targetUserId are required');
    }

    const meetupRef = db.collection('meetups').doc(meetupId);
    const meetupSnap = await meetupRef.get();

    if (!meetupSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'MEETUP_NOT_FOUND');
    }

    const meetup = { id: meetupSnap.id, ...meetupSnap.data() } as MeetupData;

    const isAuthorized = await isOrganizerOrAdmin(userId, meetup);
    if (!isAuthorized) {
      throw new functions.https.HttpsError('permission-denied', 'NOT_ORGANIZER');
    }

    const rsvpRef = meetupRef.collection('rsvps').doc(targetUserId);
    const rsvpSnap = await rsvpRef.get();

    if (!rsvpSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'RSVP_NOT_FOUND');
    }

    const rsvp = rsvpSnap.data() as MeetupRsvpData;

    if (rsvp.status === 'no_show') {
      throw new functions.https.HttpsError('already-exists', 'ALREADY_NO_SHOW');
    }

    if (rsvp.status !== 'confirmed') {
      throw new functions.https.HttpsError('failed-precondition', 'NOT_CONFIRMED');
    }

    const now = Date.now();
    await rsvpRef.update({
      status: 'no_show' as MeetupRsvpStatus,
      updatedAt: now,
    });

    const counterUpdates: any = {
      noShowCount: FieldValue.increment(1),
      updatedAt: now,
    };
    // If was checked in, decrement that counter
    if (rsvp.checkedInAt) {
      counterUpdates.checkedInCount = FieldValue.increment(-1);
    } else {
      counterUpdates.confirmedCount = FieldValue.increment(-1);
    }

    await meetupRef.update(counterUpdates);

    return { success: true };
  });

// =============================================================================
// Add Cash Guest (Organizer only)
// =============================================================================

export const meetup_addCashGuest = functions
  .region('australia-southeast1')
  .https.onCall(async (data: {
    meetupId: string;
    name: string;
    email?: string;
    amount: number;
    notes?: string;
    emailConsent?: boolean;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { meetupId, name, email, amount, notes, emailConsent } = data;
    const userId = context.auth.uid;

    if (!meetupId) {
      throw new functions.https.HttpsError('invalid-argument', 'meetupId is required');
    }

    if (!name || name.trim().length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'GUEST_NAME_REQUIRED');
    }

    if (typeof amount !== 'number' || amount < 0) {
      throw new functions.https.HttpsError('invalid-argument', 'INVALID_AMOUNT');
    }

    const meetupRef = db.collection('meetups').doc(meetupId);
    const meetupSnap = await meetupRef.get();

    if (!meetupSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'MEETUP_NOT_FOUND');
    }

    const meetup = { id: meetupSnap.id, ...meetupSnap.data() } as MeetupData;

    const isAuthorized = await isOrganizerOrAdmin(userId, meetup);
    if (!isAuthorized) {
      throw new functions.https.HttpsError('permission-denied', 'NOT_ORGANIZER');
    }

    if (meetup.closedAt) {
      throw new functions.https.HttpsError('failed-precondition', 'SESSION_CLOSED');
    }

    // Create guest in /guests subcollection with atomic counter update
    const guestRef = meetupRef.collection('guests').doc();
    const guestId = guestRef.id;

    const guestData: any = {
      id: guestId,
      name: name.trim(),
      amount,
      paymentMethod: 'cash',
      createdAt: Date.now(),
      createdBy: userId,
    };
    if (email?.trim()) guestData.email = email.trim();
    if (notes?.trim()) guestData.notes = notes.trim();
    if (typeof emailConsent === 'boolean') guestData.emailConsent = emailConsent;

    await db.runTransaction(async (transaction) => {
      const meetupSnap2 = await transaction.get(meetupRef);
      if (!meetupSnap2.exists) {
        throw new functions.https.HttpsError('not-found', 'MEETUP_NOT_FOUND');
      }

      const meetupData = meetupSnap2.data() as MeetupData;
      if (meetupData.closedAt) {
        throw new functions.https.HttpsError('failed-precondition', 'SESSION_CLOSED');
      }

      transaction.set(guestRef, guestData);
      transaction.update(meetupRef, {
        guestCount: FieldValue.increment(1),
        guestRevenue: FieldValue.increment(amount),
        updatedAt: Date.now(),
      });
    });

    return { success: true, guestId };
  });

// =============================================================================
// Close Session (Organizer only)
// =============================================================================

export const meetup_closeSession = functions
  .region('australia-southeast1')
  .https.onCall(async (data: { meetupId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { meetupId } = data;
    const userId = context.auth.uid;

    if (!meetupId) {
      throw new functions.https.HttpsError('invalid-argument', 'meetupId is required');
    }

    const meetupRef = db.collection('meetups').doc(meetupId);
    const meetupSnap = await meetupRef.get();

    if (!meetupSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'MEETUP_NOT_FOUND');
    }

    const meetup = { id: meetupSnap.id, ...meetupSnap.data() } as MeetupData;

    const isAuthorized = await isOrganizerOrAdmin(userId, meetup);
    if (!isAuthorized) {
      throw new functions.https.HttpsError('permission-denied', 'NOT_ORGANIZER');
    }

    if (meetup.closedAt) {
      throw new functions.https.HttpsError('failed-precondition', 'SESSION_ALREADY_CLOSED');
    }

    // Get all confirmed RSVPs that haven't checked in -> mark as no-show
    const confirmedNotCheckedIn = await meetupRef.collection('rsvps')
      .where('status', '==', 'confirmed')
      .get();

    const closedAt = Date.now();
    const batch = db.batch();
    let noShowCount = 0;

    for (const doc of confirmedNotCheckedIn.docs) {
      const rsvpData = doc.data() as MeetupRsvpData;
      if (!rsvpData.checkedInAt) {
        batch.update(doc.ref, {
          status: 'no_show' as MeetupRsvpStatus,
          updatedAt: closedAt,
        });
        noShowCount++;
      }
    }

    // Update meetup
    batch.update(meetupRef, {
      closedAt,
      closedBy: userId,
      status: 'completed',
      noShowCount: FieldValue.increment(noShowCount),
      confirmedCount: FieldValue.increment(-noShowCount),
      updatedAt: closedAt,
    });

    await batch.commit();

    const finalCounts = {
      checkedIn: meetup.checkedInCount || 0,
      guests: meetup.guestCount || 0,
      noShows: (meetup.noShowCount || 0) + noShowCount,
      totalPlayed: (meetup.checkedInCount || 0) + (meetup.guestCount || 0),
    };

    return { success: true, closedAt, finalCounts };
  });

// =============================================================================
// Undo Check-In (Organizer action)
// =============================================================================

export const meetup_undoCheckIn = functions
  .region('australia-southeast1')
  .https.onCall(async (data: {
    meetupId: string;
    targetUserId: string;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { meetupId, targetUserId } = data;
    const userId = context.auth.uid;

    if (!meetupId || !targetUserId) {
      throw new functions.https.HttpsError('invalid-argument', 'meetupId and targetUserId are required');
    }

    const meetupRef = db.collection('meetups').doc(meetupId);
    const meetupSnap = await meetupRef.get();

    if (!meetupSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'MEETUP_NOT_FOUND');
    }

    const meetup = { id: meetupSnap.id, ...meetupSnap.data() } as MeetupData;

    const isAuthorized = await isOrganizerOrAdmin(userId, meetup);
    if (!isAuthorized) {
      throw new functions.https.HttpsError('permission-denied', 'NOT_ORGANIZER');
    }

    const rsvpRef = meetupRef.collection('rsvps').doc(targetUserId);
    const rsvpSnap = await rsvpRef.get();

    if (!rsvpSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'RSVP_NOT_FOUND');
    }

    const rsvp = rsvpSnap.data() as MeetupRsvpData;

    if (!rsvp.checkedInAt) {
      throw new functions.https.HttpsError('failed-precondition', 'NOT_CHECKED_IN');
    }

    const now = Date.now();
    await rsvpRef.update({
      checkedInAt: FieldValue.delete(),
      checkInMethod: FieldValue.delete(),
      checkedInBy: FieldValue.delete(),
      updatedAt: now,
    });

    await meetupRef.update({
      checkedInCount: FieldValue.increment(-1),
      updatedAt: now,
    });

    return { success: true };
  });

// =============================================================================
// Undo No-Show (Organizer action)
// =============================================================================

export const meetup_undoNoShow = functions
  .region('australia-southeast1')
  .https.onCall(async (data: {
    meetupId: string;
    targetUserId: string;
  }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { meetupId, targetUserId } = data;
    const userId = context.auth.uid;

    if (!meetupId || !targetUserId) {
      throw new functions.https.HttpsError('invalid-argument', 'meetupId and targetUserId are required');
    }

    const meetupRef = db.collection('meetups').doc(meetupId);
    const meetupSnap = await meetupRef.get();

    if (!meetupSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'MEETUP_NOT_FOUND');
    }

    const meetup = { id: meetupSnap.id, ...meetupSnap.data() } as MeetupData;

    const isAuthorized = await isOrganizerOrAdmin(userId, meetup);
    if (!isAuthorized) {
      throw new functions.https.HttpsError('permission-denied', 'NOT_ORGANIZER');
    }

    const rsvpRef = meetupRef.collection('rsvps').doc(targetUserId);
    const rsvpSnap = await rsvpRef.get();

    if (!rsvpSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'RSVP_NOT_FOUND');
    }

    const rsvp = rsvpSnap.data() as MeetupRsvpData;

    if (rsvp.status !== 'no_show') {
      throw new functions.https.HttpsError('failed-precondition', 'NOT_NO_SHOW');
    }

    const now = Date.now();
    await rsvpRef.update({
      status: 'confirmed' as MeetupRsvpStatus,
      updatedAt: now,
    });

    await meetupRef.update({
      noShowCount: FieldValue.increment(-1),
      confirmedCount: FieldValue.increment(1),
      updatedAt: now,
    });

    return { success: true };
  });

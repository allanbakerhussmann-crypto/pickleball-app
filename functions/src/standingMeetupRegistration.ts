/**
 * Standing Meetup Registration Functions (1st Gen)
 *
 * These functions handle player registration for weekly meetups using the hybrid model:
 * - Season Pass: All remaining sessions for a flat price
 * - Pick-and-Pay: Select specific sessions at per-session rate
 *
 * Using 1st Gen functions for reliable deployment.
 *
 * @version 07.58
 * @file functions/src/standingMeetupRegistration.ts
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import Stripe from 'stripe';
import { v4 as uuidv4 } from 'uuid';
import {
  tryClaimAccountFee,
  STRIPE_ACCOUNT_FEE_CENTS,
  MIN_PAYMENT_FOR_ACCOUNT_FEE,
} from './stripe';

const db = admin.firestore();

// Stripe configuration (same as standingMeetups.ts)
// Check if running in test mode (emulator or explicit test flag)
function checkTestMode(): boolean {
  // Environment variables
  if (process.env.FUNCTIONS_EMULATOR === 'true') return true;
  if (process.env.STRIPE_TEST_MODE === 'true') return true;
  if (process.env.NODE_ENV === 'development') return true;

  // Check functions config
  try {
    if (functions.config().stripe?.test_mode === 'true') return true;
  } catch {
    // Config not available
  }
  return false;
}
const isTestMode = checkTestMode();

function getStripeSecretKey(): string | undefined {
  // In test mode, prefer test key
  if (isTestMode && process.env.STRIPE_TEST_SECRET_KEY) {
    console.log('Using Stripe TEST mode');
    return process.env.STRIPE_TEST_SECRET_KEY;
  }
  if (process.env.STRIPE_SECRET_KEY) {
    return process.env.STRIPE_SECRET_KEY;
  }
  try {
    // In test mode, try test key from config first
    if (isTestMode) {
      const testKey = functions.config().stripe?.test_secret_key;
      if (testKey) {
        console.log('Using Stripe TEST mode from config');
        return testKey;
      }
    }
    return functions.config().stripe?.secret_key;
  } catch {
    console.warn('Unable to access functions.config() - using environment variables only');
    return undefined;
  }
}

const stripeSecretKey = getStripeSecretKey();
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey, { apiVersion: '2024-11-20.acacia' as any }) : null;

// Log which mode we're running in
if (stripeSecretKey) {
  const isLiveKey = stripeSecretKey.startsWith('sk_live_');
  console.log(`Stripe initialized in ${isLiveKey ? 'LIVE' : 'TEST'} mode`);
}

// Platform fees (1.5% standard rate - same as stripe.ts)
const PLATFORM_FEE_PERCENT = 0.015;
const STRIPE_FEE_PERCENT = 0.027;  // NZ Stripe rate: 2.7% + $0.30
const STRIPE_FIXED_FEE_CENTS = 30;

// Types
interface StandingMeetup {
  id: string;
  clubId: string;
  clubName: string;
  organizerStripeAccountId: string;
  title: string;
  maxPlayers: number;
  billing: {
    amount: number;
    perSessionAmount?: number;
    currency: 'nzd' | 'aud' | 'usd';
    feesPaidBy: 'organizer' | 'player';
  };
  status: 'draft' | 'active' | 'paused' | 'archived';
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
  bankTransferReference?: string;
  status: 'active' | 'cancelled';
  cancelledAt?: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Player registers for a weekly meetup (Hybrid Model)
 * 1st Gen version for reliable deployment
 */
export const standingMeetup_register = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const { standingMeetupId, registrationType, selectedSessionIds, paymentMethod, returnUrl } = data;
  const userId = context.auth.uid;

  // Validation
  if (!standingMeetupId || !paymentMethod || !registrationType) {
    throw new functions.https.HttpsError('invalid-argument', 'standingMeetupId, registrationType, and paymentMethod are required');
  }

  if (registrationType === 'pick_and_pay' && (!selectedSessionIds || selectedSessionIds.length === 0)) {
    throw new functions.https.HttpsError('invalid-argument', 'MISSING_SESSION_SELECTION');
  }

  // Get meetup
  const meetupRef = db.collection('standingMeetups').doc(standingMeetupId);
  const meetupSnap = await meetupRef.get();

  if (!meetupSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'MEETUP_NOT_FOUND');
  }

  const meetup = { id: meetupSnap.id, ...meetupSnap.data() } as StandingMeetup;

  // Verify meetup is active
  if (meetup.status !== 'active') {
    throw new functions.https.HttpsError('failed-precondition', 'MEETUP_NOT_ACTIVE');
  }

  // Verify payment method is accepted
  if (paymentMethod === 'stripe' && !meetup.paymentMethods?.acceptCardPayments) {
    throw new functions.https.HttpsError('invalid-argument', 'PAYMENT_METHOD_NOT_ENABLED');
  }
  if (paymentMethod === 'bank_transfer' && !meetup.paymentMethods?.acceptBankTransfer) {
    throw new functions.https.HttpsError('invalid-argument', 'PAYMENT_METHOD_NOT_ENABLED');
  }

  // Validate registration type
  if (registrationType === 'season_pass' && meetup.billing.amount <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Season pass not available for this meetup');
  }
  if (registrationType === 'pick_and_pay' && !meetup.billing.perSessionAmount) {
    throw new functions.https.HttpsError('invalid-argument', 'Per-session pricing not configured');
  }

  // Check if already has active registration(s)
  // Important: User may have MULTIPLE registrations from previous pick_and_pay purchases
  const existingRegQuery = await db.collection('standingMeetupRegistrations')
    .where('standingMeetupId', '==', standingMeetupId)
    .where('odUserId', '==', userId)
    .where('status', '==', 'active')
    .get();

  let hasExistingRegistration = false;
  let alreadyRegisteredSessionIds: string[] = [];

  if (!existingRegQuery.empty) {
    hasExistingRegistration = true;

    // Collect ALL sessions from ALL registrations (user may have multiple pick_and_pay registrations)
    for (const doc of existingRegQuery.docs) {
      const regData = doc.data();

      // If user has a season pass, they're registered for everything - block any new registration
      if (regData.registrationType === 'season_pass') {
        throw new functions.https.HttpsError('already-exists', 'ALREADY_REGISTERED_SEASON_PASS');
      }

      // Collect sessions from this registration
      if (regData.selectedSessionIds && Array.isArray(regData.selectedSessionIds)) {
        alreadyRegisteredSessionIds.push(...regData.selectedSessionIds);
      }
    }

    // Remove duplicates
    alreadyRegisteredSessionIds = [...new Set(alreadyRegisteredSessionIds)];
    console.log(`User ${userId} already registered for sessions: ${alreadyRegisteredSessionIds.join(', ')}`);
  }

  // For pick_and_pay, filter out sessions user is already registered for
  let sessionsToRegister = selectedSessionIds || [];
  if (registrationType === 'pick_and_pay' && alreadyRegisteredSessionIds.length > 0) {
    // Filter out already registered sessions
    sessionsToRegister = sessionsToRegister.filter(
      (sessionId: string) => !alreadyRegisteredSessionIds.includes(sessionId)
    );

    if (sessionsToRegister.length === 0) {
      throw new functions.https.HttpsError('already-exists', 'ALREADY_REGISTERED_FOR_ALL_SELECTED');
    }
  }

  // Generate registration ID
  // - For first registration: `${standingMeetupId}_${userId}`
  // - For additional sessions: `${standingMeetupId}_${userId}_${timestamp}` (unique)
  const registrationId = hasExistingRegistration
    ? `${standingMeetupId}_${userId}_${Date.now()}`
    : `${standingMeetupId}_${userId}`;

  // Get user info
  const userSnap = await db.collection('users').doc(userId).get();
  const userData = userSnap.data() || {};
  const userName = userData.name || userData.displayName || context.auth.token.email?.split('@')[0] || 'Player';
  const userEmail = userData.email || context.auth.token.email || '';

  // Calculate amount and session count based on registration type
  let amount: number;
  let sessionCount: number;

  if (registrationType === 'season_pass') {
    amount = meetup.billing.amount;
    const now = Date.now();
    const occSnap = await db
      .collection('standingMeetups')
      .doc(standingMeetupId)
      .collection('occurrences')
      .where('startAt', '>=', now)
      .where('status', '==', 'scheduled')
      .get();
    sessionCount = occSnap.size;

    if (sessionCount === 0) {
      throw new functions.https.HttpsError('failed-precondition', 'NO_SESSIONS_AVAILABLE');
    }
  } else {
    const perSessionAmount = meetup.billing.perSessionAmount || 0;
    sessionCount = sessionsToRegister.length;
    amount = perSessionAmount * sessionCount;

    // Validate selected sessions exist and have capacity
    const now = Date.now();
    for (const dateId of sessionsToRegister) {
      const occSnap = await db
        .collection('standingMeetups')
        .doc(standingMeetupId)
        .collection('occurrences')
        .doc(dateId)
        .get();

      if (!occSnap.exists) {
        throw new functions.https.HttpsError('not-found', `Session ${dateId} not found`);
      }

      const occData = occSnap.data() as any;
      if (occData.status !== 'scheduled') {
        throw new functions.https.HttpsError('failed-precondition', `Session ${dateId} is not available`);
      }
      if (occData.startAt < now) {
        throw new functions.https.HttpsError('failed-precondition', `Session ${dateId} has already passed`);
      }

      const spotsLeft = meetup.maxPlayers - (occData.expectedCount || 0);
      if (spotsLeft <= 0) {
        throw new functions.https.HttpsError('resource-exhausted', `SESSIONS_FULL:${dateId}`);
      }
    }
  }

  if (amount <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid payment amount');
  }

  // STRIPE PATH
  if (paymentMethod === 'stripe') {
    if (!stripe) {
      throw new functions.https.HttpsError('failed-precondition', 'Stripe not configured');
    }

    // Get valid Stripe account - auto-heal if needed
    let stripeAccountId = meetup.organizerStripeAccountId;

    // In test mode, allow test accounts; in production, block them
    const isTestAccount = stripeAccountId?.startsWith('acct_test') || stripeAccountId === 'acct_test123';
    const isInvalidStripeAccount = !stripeAccountId ||
        (!isTestMode && isTestAccount); // Only block test accounts in production

    if (isInvalidStripeAccount) {
      console.log(`Meetup ${standingMeetupId} has invalid Stripe account "${stripeAccountId}", looking up club...`);

      const clubDoc = await db.collection('clubs').doc(meetup.clubId).get();
      if (clubDoc.exists) {
        const clubData = clubDoc.data();
        const clubStripeAccount = clubData?.stripeConnectedAccountId || clubData?.stripeAccountId;

        const isClubTestAccount = clubStripeAccount?.startsWith('acct_test') || clubStripeAccount === 'acct_test123';
        // In test mode, accept test accounts; in production, only accept real accounts
        if (clubStripeAccount && (isTestMode || !isClubTestAccount)) {
          stripeAccountId = clubStripeAccount;
          console.log(`Auto-healed: Using club's Stripe account ${stripeAccountId} (testMode=${isTestMode})`);

          await db.collection('standingMeetups').doc(standingMeetupId).update({
            organizerStripeAccountId: stripeAccountId,
            updatedAt: Date.now(),
          });
        }
      }

      // Final check: must have an account (test accounts allowed in test mode)
      const isFinalTestAccount = stripeAccountId?.startsWith('acct_test') || stripeAccountId === 'acct_test123';
      if (!stripeAccountId || (!isTestMode && isFinalTestAccount)) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'ORGANIZER_STRIPE_NOT_CONFIGURED',
        );
      }
    }

    // Calculate fees
    let totalAmount = amount;
    let platformFee = Math.round(amount * PLATFORM_FEE_PERCENT);

    if (meetup.billing.feesPaidBy === 'player') {
      const divisor = 1 - STRIPE_FEE_PERCENT - PLATFORM_FEE_PERCENT;
      totalAmount = Math.ceil((amount + STRIPE_FIXED_FEE_CENTS) / divisor);
      platformFee = Math.round(totalAmount * PLATFORM_FEE_PERCENT);
    }

    // Try to claim monthly account fee ($2/month for active Stripe Connect accounts)
    let accountFeeIncluded = false;
    let accountFeeMonth = '';
    let accountFeeLockId = '';

    if (meetup.clubId && stripeAccountId && totalAmount >= MIN_PAYMENT_FOR_ACCOUNT_FEE) {
      try {
        const feeResult = await tryClaimAccountFee('club', meetup.clubId);
        if (feeResult.shouldCharge && feeResult.lockId) {
          platformFee += STRIPE_ACCOUNT_FEE_CENTS;
          accountFeeIncluded = true;
          accountFeeMonth = feeResult.currentMonth;
          accountFeeLockId = feeResult.lockId;
          console.log(`[StandingMeetup] Claimed $2 account fee for club/${meetup.clubId} (${accountFeeMonth}, lock=${accountFeeLockId})`);
        } else {
          console.log(`[StandingMeetup] Account fee not claimed for club/${meetup.clubId} (already collected or exempt)`);
        }
      } catch (feeError) {
        // Don't fail checkout if fee claim fails - just log and continue
        console.error(`[StandingMeetup] Failed to claim account fee:`, feeError);
      }
    }

    // Extract origin from returnUrl or use default
    // returnUrl might be full URL like "https://example.com/clubs/123/settings?..."
    // We only need the origin (protocol + host)
    let baseUrl = 'https://pickleballdirector.co.nz';
    if (returnUrl) {
      try {
        const url = new URL(returnUrl);
        baseUrl = url.origin;
      } catch {
        // If returnUrl is invalid, use default
        console.log('Invalid returnUrl, using default:', returnUrl);
      }
    }
    const successUrl = `${baseUrl}/#/weekly-meetup/${standingMeetupId}?payment=success`;
    const cancelUrl = `${baseUrl}/#/weekly-meetup/${standingMeetupId}?payment=cancelled`;

    console.log(`Stripe checkout URLs - success: ${successUrl}, cancel: ${cancelUrl}`);

    const description = registrationType === 'season_pass'
      ? `Season Pass - ${sessionCount} sessions at ${meetup.clubName}`
      : `${sessionCount} session${sessionCount > 1 ? 's' : ''} at ${meetup.clubName}`;

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        customer_email: userEmail,
        line_items: [
          {
            price_data: {
              currency: meetup.billing.currency,
              product_data: {
                name: meetup.title,
                description,
              },
              unit_amount: totalAmount,
            },
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          type: 'standing_meetup_registration',
          standingMeetupId,
          odUserId: userId,
          registrationType,
          registrationId, // Include the registration ID for the webhook
          selectedSessionIds: sessionsToRegister.length > 0 ? JSON.stringify(sessionsToRegister) : '',
          clubId: meetup.clubId,
          // Finance transaction fields
          referenceId: standingMeetupId,
          eventName: meetup.title,
          organizerUserId: meetup.clubId, // Club receives the payment
          payerName: userName,
          // Player info
          userName,
          userEmail,
          amount: String(amount),
          sessionCount: String(sessionCount),
          maxPlayers: String(meetup.maxPlayers),
          platformFee: String(platformFee), // For Finance transaction
          // Account fee metadata (for webhook confirmation)
          accountFeeIncluded: accountFeeIncluded ? 'true' : 'false',
          accountFeeMonth,
          accountFeeLockId,
          accountFeeOrganizerType: 'club',
          accountFeeOrganizerId: meetup.clubId,
        },
        payment_intent_data: {
          application_fee_amount: platformFee,
          metadata: {
            type: 'standing_meetup_registration',
            standingMeetupId,
            odUserId: userId,
            registrationType,
          },
        },
      },
      {
        stripeAccount: stripeAccountId,
      }
    );

    console.log(`Stripe checkout session ${session.id} created for account ${stripeAccountId}`);

    return {
      checkoutUrl: session.url,
    };
  }

  // BANK TRANSFER PATH
  const bankDetails = meetup.paymentMethods?.bankDetails;

  if (!bankDetails || !bankDetails.showToPlayers) {
    throw new functions.https.HttpsError('failed-precondition', 'Bank details not configured');
  }

  const bankTransferReference = `${meetup.title.substring(0, 10)}-${userName.substring(0, 10)}`.replace(/\s/g, '');

  const registration: StandingMeetupRegistration = {
    id: registrationId,
    standingMeetupId,
    clubId: meetup.clubId,
    odUserId: userId,
    userName,
    userEmail,
    registrationType,
    // Only include selectedSessionIds for pick_and_pay (Firestore doesn't allow undefined)
    ...(registrationType === 'pick_and_pay' ? { selectedSessionIds: sessionsToRegister } : {}),
    sessionCount,
    paymentStatus: 'pending',
    paymentMethod: 'bank_transfer',
    amount,
    currency: meetup.billing.currency,
    bankTransferReference,
    status: 'active',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await db.collection('standingMeetupRegistrations').doc(registrationId).set(registration);

  console.log(`Bank transfer registration ${registrationId} created (pending confirmation)`);

  return {
    registrationId,
    bankDetails: {
      bankName: bankDetails.bankName,
      accountName: bankDetails.accountName,
      accountNumber: bankDetails.accountNumber,
      reference: bankDetails.reference || bankTransferReference,
    },
  };
});

/**
 * Helper: Add player to all future occurrences with capacity
 */
async function addPlayerToAllFutureOccurrences(
  standingMeetupId: string,
  userId: string,
  userName: string,
  maxPlayers: number
): Promise<{ addedTo: string[]; skippedFull: string[] }> {
  const now = Date.now();
  const occSnap = await db
    .collection('standingMeetups')
    .doc(standingMeetupId)
    .collection('occurrences')
    .where('startAt', '>=', now)
    .where('status', '==', 'scheduled')
    .get();

  const addedTo: string[] = [];
  const skippedFull: string[] = [];

  for (const doc of occSnap.docs) {
    const occData = doc.data();
    const spotsLeft = maxPlayers - (occData.expectedCount || 0);

    if (spotsLeft <= 0) {
      skippedFull.push(doc.id);
      continue;
    }

    const participantRef = doc.ref.collection('participants').doc(userId);
    await participantRef.set({
      odUserId: userId,
      userName,
      status: 'expected',
      creditIssued: false,
      addedAt: Date.now(),
    });

    await doc.ref.update({
      expectedCount: FieldValue.increment(1),
      updatedAt: Date.now(),
    });

    addedTo.push(doc.id);
  }

  return { addedTo, skippedFull };
}

/**
 * Helper: Add player to selected occurrences
 */
async function addPlayerToSelectedOccurrences(
  standingMeetupId: string,
  userId: string,
  userName: string,
  sessionIds: string[],
  maxPlayers: number
): Promise<{ addedTo: string[]; failedFull: string[] }> {
  const addedTo: string[] = [];
  const failedFull: string[] = [];

  for (const dateId of sessionIds) {
    const occRef = db
      .collection('standingMeetups')
      .doc(standingMeetupId)
      .collection('occurrences')
      .doc(dateId);

    const occSnap = await occRef.get();
    if (!occSnap.exists) continue;

    const occData = occSnap.data() as any;
    const spotsLeft = maxPlayers - (occData.expectedCount || 0);

    if (spotsLeft <= 0) {
      failedFull.push(dateId);
      continue;
    }

    const participantRef = occRef.collection('participants').doc(userId);
    await participantRef.set({
      odUserId: userId,
      userName,
      status: 'expected',
      creditIssued: false,
      addedAt: Date.now(),
    });

    await occRef.update({
      expectedCount: FieldValue.increment(1),
      updatedAt: Date.now(),
    });

    addedTo.push(dateId);
  }

  return { addedTo, failedFull };
}

/**
 * Organizer confirms a bank transfer payment
 */
export const standingMeetup_confirmBankPayment = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const { registrationId } = data;

  if (!registrationId) {
    throw new functions.https.HttpsError('invalid-argument', 'registrationId is required');
  }

  // Get registration
  const regRef = db.collection('standingMeetupRegistrations').doc(registrationId);
  const regSnap = await regRef.get();

  if (!regSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Registration not found');
  }

  const registration = regSnap.data() as StandingMeetupRegistration;

  // Validate status
  if (registration.paymentMethod !== 'bank_transfer') {
    throw new functions.https.HttpsError('failed-precondition', 'Not a bank transfer registration');
  }
  if (registration.paymentStatus !== 'pending') {
    throw new functions.https.HttpsError('failed-precondition', 'Payment already confirmed');
  }

  // Check if caller is organizer/admin
  const meetupSnap = await db.collection('standingMeetups').doc(registration.standingMeetupId).get();
  if (!meetupSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Meetup not found');
  }
  const meetup = meetupSnap.data() as StandingMeetup;

  const clubSnap = await db.collection('clubs').doc(meetup.clubId).get();
  const clubData = clubSnap.data();
  const isClubAdmin = clubData?.createdByUserId === context.auth.uid ||
    clubData?.admins?.includes(context.auth.uid);
  const isMeetupOrganizer = meetup.clubId && meetupSnap.data()?.createdByUserId === context.auth.uid;

  if (!isClubAdmin && !isMeetupOrganizer) {
    throw new functions.https.HttpsError('permission-denied', 'Only organizers can confirm payments');
  }

  // Update registration
  const paidAt = Date.now();
  await regRef.update({
    paymentStatus: 'paid',
    paidAt,
    updatedAt: paidAt,
  });

  // Add player to occurrences
  if (registration.registrationType === 'season_pass') {
    await addPlayerToAllFutureOccurrences(
      registration.standingMeetupId,
      registration.odUserId,
      registration.userName,
      meetup.maxPlayers
    );
  } else if (registration.selectedSessionIds) {
    await addPlayerToSelectedOccurrences(
      registration.standingMeetupId,
      registration.odUserId,
      registration.userName,
      registration.selectedSessionIds,
      meetup.maxPlayers
    );
  }

  // Increment subscriber count
  await db.collection('standingMeetups').doc(registration.standingMeetupId).update({
    subscriberCount: FieldValue.increment(1),
    updatedAt: Date.now(),
  });

  console.log(`Confirmed bank payment for registration ${registrationId}`);

  return {
    success: true,
    paidAt,
  };
});

/**
 * Cancel an unpaid bank transfer registration
 */
export const standingMeetup_cancelUnpaidBankRegistration = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const { registrationId } = data;

  if (!registrationId) {
    throw new functions.https.HttpsError('invalid-argument', 'registrationId is required');
  }

  // Get registration
  const regRef = db.collection('standingMeetupRegistrations').doc(registrationId);
  const regSnap = await regRef.get();

  if (!regSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Registration not found');
  }

  const registration = regSnap.data() as StandingMeetupRegistration;

  // Validate
  if (registration.paymentMethod !== 'bank_transfer') {
    throw new functions.https.HttpsError('failed-precondition', 'Not a bank transfer registration');
  }
  if (registration.paymentStatus !== 'pending') {
    throw new functions.https.HttpsError('failed-precondition', 'Cannot cancel - payment already confirmed');
  }

  // Check if caller is the user or organizer
  const isOwner = registration.odUserId === context.auth.uid;

  if (!isOwner) {
    const meetupSnap = await db.collection('standingMeetups').doc(registration.standingMeetupId).get();
    const meetup = meetupSnap.data() as StandingMeetup;
    const clubSnap = await db.collection('clubs').doc(meetup.clubId).get();
    const clubData = clubSnap.data();
    const isClubAdmin = clubData?.createdByUserId === context.auth.uid ||
      clubData?.admins?.includes(context.auth.uid);

    if (!isClubAdmin) {
      throw new functions.https.HttpsError('permission-denied', 'Not authorized to cancel this registration');
    }
  }

  // Cancel registration (player was never added to sessions)
  const cancelledAt = Date.now();
  await regRef.update({
    status: 'cancelled',
    cancelledAt,
    updatedAt: cancelledAt,
  });

  console.log(`Cancelled unpaid bank registration ${registrationId}`);

  return {
    success: true,
    cancelledAt,
  };
});

/**
 * Helper: Remove player from future occurrences
 */
async function removePlayerFromFutureOccurrences(
  standingMeetupId: string,
  userId: string
): Promise<void> {
  const now = Date.now();
  const occSnap = await db
    .collection('standingMeetups')
    .doc(standingMeetupId)
    .collection('occurrences')
    .where('startAt', '>=', now)
    .get();

  const batch = db.batch();
  let removedCount = 0;

  for (const doc of occSnap.docs) {
    const participantRef = doc.ref.collection('participants').doc(userId);
    const participantSnap = await participantRef.get();

    if (participantSnap.exists && participantSnap.data()?.status === 'expected') {
      batch.delete(participantRef);
      batch.update(doc.ref, {
        expectedCount: FieldValue.increment(-1),
        updatedAt: Date.now(),
      });
      removedCount++;
    }
  }

  if (removedCount > 0) {
    await batch.commit();
  }
}

/**
 * Helper: Remove player from selected occurrences
 */
async function removePlayerFromSelectedOccurrences(
  standingMeetupId: string,
  userId: string,
  sessionIds: string[]
): Promise<void> {
  const now = Date.now();
  const batch = db.batch();

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
    }
  }

  await batch.commit();
}

/**
 * Player unregisters from a paid registration
 */
export const standingMeetup_unregister = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const { registrationId } = data;
  const userId = context.auth.uid;

  if (!registrationId) {
    throw new functions.https.HttpsError('invalid-argument', 'registrationId is required');
  }

  // Get registration
  const regRef = db.collection('standingMeetupRegistrations').doc(registrationId);
  const regSnap = await regRef.get();

  if (!regSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Registration not found');
  }

  const registration = regSnap.data() as StandingMeetupRegistration;

  // Validate
  if (registration.odUserId !== userId) {
    throw new functions.https.HttpsError('permission-denied', 'Not your registration');
  }
  if (registration.status !== 'active') {
    throw new functions.https.HttpsError('failed-precondition', 'Registration already cancelled');
  }
  if (registration.paymentStatus !== 'paid') {
    throw new functions.https.HttpsError('failed-precondition', 'Use cancelUnpaidBankRegistration for pending registrations');
  }

  // Cancel registration
  const cancelledAt = Date.now();
  await regRef.update({
    status: 'cancelled',
    cancelledAt,
    updatedAt: cancelledAt,
  });

  // Decrement subscriber count
  await db.collection('standingMeetups').doc(registration.standingMeetupId).update({
    subscriberCount: FieldValue.increment(-1),
    updatedAt: Date.now(),
  });

  // Remove from future occurrences
  if (registration.registrationType === 'pick_and_pay' && registration.selectedSessionIds) {
    await removePlayerFromSelectedOccurrences(
      registration.standingMeetupId,
      userId,
      registration.selectedSessionIds
    );
  } else {
    await removePlayerFromFutureOccurrences(registration.standingMeetupId, userId);
  }

  console.log(`Unregistered user ${userId} from meetup ${registration.standingMeetupId}`);

  return {
    success: true,
    cancelledAt,
  };
});

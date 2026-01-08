/**
 * Stripe Cloud Functions
 *
 * Backend functions for Stripe integration:
 * - Create Connect accounts for clubs and users
 * - Create Checkout sessions
 * - Handle webhooks (creates bookings/RSVPs after payment)
 *
 * UPDATED: Now supports TWO webhook secrets:
 * - stripe.webhook_secret = Account webhook (for checkout.session.completed)
 * - stripe.connect_webhook_secret = Connect webhook (for account.updated)
 *
 * FILE LOCATION: functions/src/stripe.ts
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

// Initialize Firebase Admin if not already
if (!admin.apps.length) {
  admin.initializeApp();
}

// Initialize Stripe with your secret key
const stripe = new Stripe(
  functions.config().stripe?.secret_key || process.env.STRIPE_SECRET_KEY || '',
  { apiVersion: '2024-11-20.acacia' as any }
);

// Platform fee percentage (1.5%)
const PLATFORM_FEE_PERCENT = 1.5;

// Free starter SMS credits for new organizers
const FREE_STARTER_SMS_CREDITS = 25;

// Default SMS bundles for seeding
const DEFAULT_SMS_BUNDLES = [
  {
    name: 'Starter Pack',
    description: '50 SMS credits - great for small tournaments',
    credits: 50,
    priceNZD: 1000,  // $10.00
    isActive: true,
    sortOrder: 1,
  },
  {
    name: 'Pro Pack',
    description: '200 SMS credits - best value for regular organizers',
    credits: 200,
    priceNZD: 3500,  // $35.00
    isActive: true,
    sortOrder: 2,
  },
  {
    name: 'Enterprise Pack',
    description: '500 SMS credits - for high-volume events',
    credits: 500,
    priceNZD: 7500,  // $75.00
    isActive: true,
    sortOrder: 3,
  },
];

// ============================================
// CREATE CONNECT ACCOUNT (FOR CLUBS)
// ============================================

export const stripe_createConnectAccount = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const { clubId, clubName, clubEmail, returnUrl, refreshUrl } = data;

  if (!clubId || !clubName) {
    throw new functions.https.HttpsError('invalid-argument', 'Club ID and name required');
  }

  try {
    // Check if club already has an account
    const clubDoc = await admin.firestore().collection('clubs').doc(clubId).get();
    const existingAccountId = clubDoc.data()?.stripeConnectedAccountId;

    let accountId: string;

    if (existingAccountId) {
      // Use existing account
      accountId = existingAccountId;
    } else {
      // Create new Express account
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'NZ',
        email: clubEmail,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: 'company',
        business_profile: {
          name: clubName,
          mcc: '7941', // Sports clubs
        },
        metadata: {
          clubId,
          platform: 'pickleball-director',
        },
      });

      accountId = account.id;

      // Save to club document
      await admin.firestore().collection('clubs').doc(clubId).update({
        stripeConnectedAccountId: accountId,
        stripeOnboardingComplete: false,
        updatedAt: Date.now(),
      });
    }

    // Create account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });

    return {
      accountId,
      url: accountLink.url,
    };
  } catch (error: any) {
    console.error('Create connect account error:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Failed to create Stripe account');
  }
});

// ============================================
// USER STRIPE CONNECT - CREATE ACCOUNT
// ============================================

export const stripe_createUserConnectAccount = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const { userId, userName, userEmail, returnUrl, refreshUrl } = data;

  if (!userId) {
    throw new functions.https.HttpsError('invalid-argument', 'User ID required');
  }

  try {
    // Check if user already has an account
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    const existingAccountId = userDoc.data()?.stripeConnectedAccountId;

    let accountId: string;

    if (existingAccountId) {
      accountId = existingAccountId;
    } else {
      // Create new Express account for individual organizer
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'NZ',
        email: userEmail,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: 'individual',
        business_profile: {
          name: userName || 'Pickleball Organizer',
          mcc: '7941', // Sports clubs/promoters
        },
        metadata: {
          odUserId: userId,
          platform: 'pickleball-director',
          accountType: 'organizer',
        },
      });

      accountId = account.id;

      // Save to user document
      await admin.firestore().collection('users').doc(userId).update({
        stripeConnectedAccountId: accountId,
        stripeOnboardingComplete: false,
        updatedAt: Date.now(),
      });
    }

    // Create account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding',
    });

    return {
      accountId,
      url: accountLink.url,
    };
  } catch (error: any) {
    console.error('Create user connect account error:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Failed to create Stripe account');
  }
});

// ============================================
// GET CONNECT ACCOUNT STATUS
// ============================================

export const stripe_getConnectAccountStatus = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const { accountId } = data;

  if (!accountId) {
    throw new functions.https.HttpsError('invalid-argument', 'Account ID required');
  }

  try {
    const account = await stripe.accounts.retrieve(accountId);

    return {
      isConnected: true,
      accountId: account.id,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      requirements: {
        currentlyDue: account.requirements?.currently_due || [],
        eventuallyDue: account.requirements?.eventually_due || [],
        pastDue: account.requirements?.past_due || [],
      },
    };
  } catch (error: any) {
    console.error('Get account status error:', error);
    if (error.code === 'resource_missing') {
      return {
        isConnected: false,
        accountId: null,
      };
    }
    throw new functions.https.HttpsError('internal', error.message || 'Failed to get account status');
  }
});

// ============================================
// CREATE CONNECT LOGIN LINK (FOR CLUBS)
// ============================================

export const stripe_createConnectLoginLink = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const { accountId } = data;

  if (!accountId) {
    throw new functions.https.HttpsError('invalid-argument', 'Account ID required');
  }

  try {
    const loginLink = await stripe.accounts.createLoginLink(accountId);
    return {
      url: loginLink.url,
    };
  } catch (error: any) {
    console.error('Create login link error:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Failed to create login link');
  }
});

// ============================================
// USER STRIPE CONNECT - LOGIN LINK
// ============================================

export const stripe_createUserConnectLoginLink = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const { accountId } = data;

  if (!accountId) {
    throw new functions.https.HttpsError('invalid-argument', 'Account ID required');
  }

  // Verify user owns this account
  const userDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
  if (!userDoc.exists || userDoc.data()?.stripeConnectedAccountId !== accountId) {
    throw new functions.https.HttpsError('permission-denied', 'You do not own this Stripe account');
  }

  try {
    const loginLink = await stripe.accounts.createLoginLink(accountId);
    return {
      url: loginLink.url,
    };
  } catch (error: any) {
    console.error('Create user login link error:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Failed to create login link');
  }
});

// ============================================
// CREATE CHECKOUT SESSION
// ============================================

export const stripe_createCheckoutSession = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const {
    items,
    customerEmail,
    successUrl,
    cancelUrl,
    clubId,
    clubStripeAccountId,
    organizerStripeAccountId,
    metadata = {},
  } = data;

  if (!items || items.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Items required');
  }

  try {
    // Calculate total and platform fee
    const totalAmount = items.reduce((sum: number, item: any) => sum + item.amount * item.quantity, 0);
    const platformFee = Math.round(totalAmount * (PLATFORM_FEE_PERCENT / 100));

    // Determine destination account (club or organizer)
    const destinationAccount = clubStripeAccountId || organizerStripeAccountId;

    // Build line items
    const lineItems = items.map((item: any) => ({
      price_data: {
        currency: 'nzd',
        product_data: {
          name: item.name,
          description: item.description,
        },
        unit_amount: item.amount,
      },
      quantity: item.quantity,
    }));

    // Session config
    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment',
      customer_email: customerEmail,
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        clubId: clubId || '',
        odUserId: context.auth.uid,
        ...metadata,
      },
    };

    // If connected account, split the payment
    if (destinationAccount) {
      sessionConfig.payment_intent_data = {
        application_fee_amount: platformFee,
        transfer_data: {
          destination: destinationAccount,
        },
        metadata: {
          clubId: clubId || '',
          odUserId: context.auth.uid,
          ...metadata,
        },
      };
    }

    // Create Checkout Session
    const session = await stripe.checkout.sessions.create(sessionConfig);

    return {
      sessionId: session.id,
      url: session.url,
    };
  } catch (error: any) {
    console.error('Create checkout session error:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Failed to create checkout session');
  }
});

// ============================================
// SMS BUNDLE PURCHASE
// ============================================

interface SMSBundle {
  id: string;
  name: string;
  description?: string;
  credits: number;
  priceNZD: number;
  isActive: boolean;
  sortOrder: number;
}

interface SMSCredits {
  odUserId: string;
  balance: number;
  totalPurchased: number;
  totalUsed: number;
  totalFreeCredits: number;
  lastTopUpAt?: number;
  lastUsedAt?: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Create a Checkout Session for purchasing SMS credits bundle
 * This uses the PLATFORM Stripe account (not Connect) since SMS credits
 * are a platform service, not an organizer payment.
 */
export const stripe_purchaseSMSBundle = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const { bundleId, successUrl, cancelUrl } = data;

  if (!bundleId) {
    throw new functions.https.HttpsError('invalid-argument', 'Bundle ID required');
  }

  const db = admin.firestore();

  try {
    // Get bundle details
    const bundleDoc = await db.collection('sms_bundles').doc(bundleId).get();

    if (!bundleDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Bundle not found');
    }

    const bundle = { id: bundleDoc.id, ...bundleDoc.data() } as SMSBundle;

    if (!bundle.isActive) {
      throw new functions.https.HttpsError('failed-precondition', 'Bundle is not available');
    }

    // Create Checkout Session (no connected account - goes to platform)
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: context.auth.token.email || undefined,
      line_items: [
        {
          price_data: {
            currency: 'nzd',
            product_data: {
              name: bundle.name,
              description: `${bundle.credits} SMS credits`,
            },
            unit_amount: bundle.priceNZD,
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        type: 'sms_bundle',
        bundleId: bundle.id,
        bundleName: bundle.name,
        credits: bundle.credits.toString(),
        odUserId: context.auth.uid,
      },
    });

    console.log(`Created SMS bundle checkout session ${session.id} for user ${context.auth.uid}`);

    return {
      sessionId: session.id,
      url: session.url,
    };
  } catch (error: any) {
    console.error('Create SMS bundle checkout error:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Failed to create checkout session');
  }
});

// ============================================
// STRIPE WEBHOOK HANDLER
// Supports TWO webhook secrets (Account + Connect)
// ============================================

export const stripe_webhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'];

  // Get BOTH webhook secrets
  const accountWebhookSecret = functions.config().stripe?.webhook_secret || process.env.STRIPE_WEBHOOK_SECRET;
  const connectWebhookSecret = functions.config().stripe?.connect_webhook_secret || process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

  if (!sig) {
    console.error('Missing stripe-signature header');
    res.status(400).send('Missing signature');
    return;
  }

  let event: Stripe.Event;

  // Try to verify with Account webhook secret first (for checkout.session.completed)
  // If that fails, try Connect webhook secret (for account.updated)
  try {
    if (accountWebhookSecret) {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, accountWebhookSecret);
      console.log('✅ Verified with Account webhook secret');
    } else {
      throw new Error('No account webhook secret configured');
    }
  } catch (err1: any) {
    // First secret failed, try the Connect secret
    console.log('Account webhook verification failed, trying Connect secret...');
    
    try {
      if (connectWebhookSecret) {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, connectWebhookSecret);
        console.log('✅ Verified with Connect webhook secret');
      } else {
        throw new Error('No connect webhook secret configured');
      }
    } catch (err2: any) {
      // Both secrets failed
      console.error('❌ Webhook signature verification failed with BOTH secrets');
      console.error('Account secret error:', err1.message);
      console.error('Connect secret error:', err2.message);
      res.status(400).send(`Webhook Error: Signature verification failed`);
      return;
    }
  }

  console.log(`📩 Received webhook event: ${event.type}`);

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log('Processing checkout.session.completed:', session.id);
      await handleCheckoutComplete(session);
      break;
    }

    case 'account.updated': {
      const account = event.data.object as Stripe.Account;
      console.log('Processing account.updated:', account.id);
      await handleAccountUpdated(account);
      break;
    }

    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.log('Payment succeeded:', paymentIntent.id);
      break;
    }

    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.log('Payment failed:', paymentIntent.id);
      break;
    }

    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge;
      console.log('Charge refunded:', charge.id);
      // TODO: Handle refund - update RSVP status, etc.
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
});

// ============================================
// WEBHOOK HANDLERS
// ============================================

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  console.log('Checkout completed:', session.id);

  const metadata = session.metadata || {};
  const paymentType = metadata.type;
  const odUserId = metadata.odUserId;

  if (!odUserId) {
    console.error('Missing odUserId in session metadata');
    return;
  }

  try {
    // Route to appropriate handler based on payment type
    switch (paymentType) {
      case 'meetup':
        await handleMeetupPayment(session, metadata);
        break;

      case 'court_booking':
        await handleCourtBookingPayment(session, metadata);
        break;

      case 'tournament':
        await handleTournamentPayment(session, metadata);
        break;

      case 'league':
        await handleLeaguePayment(session, metadata);
        break;

      case 'sms_bundle':
        await handleSMSBundlePayment(session, metadata);
        break;

      default:
        // Legacy: court booking without type
        if (metadata.slots) {
          await handleCourtBookingPayment(session, metadata);
        } else {
          console.log('Unknown payment type:', paymentType);
        }
    }
  } catch (error) {
    console.error('Error handling checkout complete:', error);
  }
}

// ============================================
// MEETUP PAYMENT HANDLER
// ============================================

async function handleMeetupPayment(
  session: Stripe.Checkout.Session,
  metadata: Record<string, string>
) {
  const meetupId = metadata.meetupId;
  const odUserId = metadata.odUserId;

  if (!meetupId || !odUserId) {
    console.error('Missing meetupId or odUserId for meetup payment');
    return;
  }

  console.log(`Processing meetup payment: meetup=${meetupId}, user=${odUserId}`);

  const db = admin.firestore();

  try {
    // Get user info
    const userDoc = await db.collection('users').doc(odUserId).get();
    const userData = userDoc.exists ? userDoc.data() : null;
    const userName = userData?.displayName || userData?.email || 'Unknown';

    // Get meetup to verify and get pricing info
    const meetupDoc = await db.collection('meetups').doc(meetupId).get();
    if (!meetupDoc.exists) {
      console.error('Meetup not found:', meetupId);
      return;
    }

    const meetupData = meetupDoc.data()!;
    const amountPaid = session.amount_total || 0;

    // Create or update RSVP with payment info
    const rsvpRef = db.collection('meetups').doc(meetupId).collection('rsvps').doc(odUserId);
    
    await rsvpRef.set({
      userId: odUserId,
      userName,
      status: 'going',
      paymentStatus: 'paid',
      amountPaid,
      paidAt: Date.now(),
      stripeSessionId: session.id,
      stripePaymentIntentId: session.payment_intent as string,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }, { merge: true });

    // Update meetup counters
    const currentPaidPlayers = meetupData.paidPlayers || 0;
    const currentTotalCollected = meetupData.totalCollected || 0;

    await db.collection('meetups').doc(meetupId).update({
      paidPlayers: currentPaidPlayers + 1,
      totalCollected: currentTotalCollected + amountPaid,
      updatedAt: Date.now(),
    });

    console.log(`✅ Meetup payment successful: ${userName} paid ${amountPaid} cents for meetup ${meetupId}`);

  } catch (error) {
    console.error('Error processing meetup payment:', error);
    throw error;
  }
}

// ============================================
// COURT BOOKING PAYMENT HANDLER
// ============================================

async function handleCourtBookingPayment(
  session: Stripe.Checkout.Session,
  metadata: Record<string, string>
) {
  const clubId = metadata.clubId;
  const odUserId = metadata.odUserId;
  const slotsJson = metadata.slots;

  if (!clubId || !odUserId) {
    console.error('Missing clubId or odUserId for court booking');
    return;
  }

  console.log(`Processing court booking: club=${clubId}, user=${odUserId}`);

  const db = admin.firestore();

  try {
    // Get user info for booking
    const userDoc = await db.collection('users').doc(odUserId).get();
    const userData = userDoc.exists ? userDoc.data() : null;
    const userName = userData?.displayName || userData?.email || 'Unknown';

    // Parse slots if provided
    let slots: Array<{
      courtId: string;
      date: string;
      startTime: string;
      endTime: string;
    }> = [];

    if (slotsJson) {
      try {
        slots = JSON.parse(slotsJson);
      } catch (e) {
        console.error('Failed to parse slots JSON:', e);
      }
    } else if (metadata.courtId && metadata.date && metadata.startTime) {
      // Single slot from metadata
      slots = [{
        courtId: metadata.courtId,
        date: metadata.date,
        startTime: metadata.startTime,
        endTime: metadata.endTime || '',
      }];
    }

    // Create bookings for each slot
    for (const slot of slots) {
      // Get court name
      let courtName = 'Court';
      try {
        const courtDoc = await db.collection('clubs').doc(clubId).collection('courts').doc(slot.courtId).get();
        if (courtDoc.exists) {
          courtName = courtDoc.data()?.name || 'Court';
        }
      } catch (e) {
        console.warn('Could not get court name:', e);
      }

      // Create booking document
      const bookingRef = db.collection('clubs').doc(clubId).collection('bookings').doc();

      await bookingRef.set({
        id: bookingRef.id,
        clubId,
        courtId: slot.courtId,
        courtName,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        bookedByUserId: odUserId,
        bookedByName: userName,
        status: 'confirmed',
        paymentStatus: 'paid',
        stripeSessionId: session.id,
        stripePaymentIntentId: session.payment_intent as string,
        amountPaid: session.amount_total || 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      console.log(`✅ Court booking created: ${courtName} on ${slot.date} at ${slot.startTime}`);
    }

  } catch (error) {
    console.error('Error processing court booking:', error);
    throw error;
  }
}

// ============================================
// TOURNAMENT PAYMENT HANDLER
// ============================================

async function handleTournamentPayment(
  session: Stripe.Checkout.Session,
  metadata: Record<string, string>
) {
  const db = admin.firestore();
  const tournamentId = metadata.tournamentId;
  const odUserId = metadata.odUserId;
  const registrationId = metadata.registrationId;
  const divisionIds = metadata.divisionIds ? JSON.parse(metadata.divisionIds) : [];
  const partnerDetails = metadata.partnerDetails ? JSON.parse(metadata.partnerDetails) : {};

  if (!tournamentId || !odUserId) {
    console.error('Missing tournamentId or odUserId for tournament payment');
    return;
  }

  console.log(`Processing tournament payment: tournament=${tournamentId}, user=${odUserId}, reg=${registrationId}`);

  const now = Date.now();

  try {
    // 1. Update registration status to 'completed' and 'paid'
    if (registrationId) {
      const regRef = db.collection('tournament_registrations').doc(registrationId);
      await regRef.update({
        status: 'completed',
        paymentStatus: 'paid',
        paymentMethod: 'stripe',
        stripeSessionId: session.id,
        stripePaymentIntentId: session.payment_intent as string,
        paidAt: now,
        paidAmount: session.amount_total || 0,
        completedAt: now,
        updatedAt: now,
      });
      console.log(`✅ Registration ${registrationId} updated to paid`);
    }

    // 2. Get user profile for team creation
    const userSnap = await db.collection('users').doc(odUserId).get();
    const userProfile = userSnap.exists ? userSnap.data() : null;
    const userName = userProfile?.displayName || userProfile?.firstName || 'Unknown';

    // 3. Create/update teams for each division
    for (const divisionId of divisionIds) {
      const teamsRef = db.collection('tournaments').doc(tournamentId).collection('teams');

      // Check if team already exists for this user in this division
      const existingTeamSnap = await teamsRef
        .where('divisionId', '==', divisionId)
        .where('players', 'array-contains', odUserId)
        .get();

      if (!existingTeamSnap.empty) {
        // Update existing team to paid
        const batch = db.batch();
        existingTeamSnap.docs.forEach((doc: admin.firestore.QueryDocumentSnapshot) => {
          batch.update(doc.ref, {
            paymentStatus: 'paid',
            paymentMethod: 'stripe',
            stripeSessionId: session.id,
            paidAt: now,
            paidAmount: session.amount_total || 0,
            updatedAt: now,
          });
        });
        await batch.commit();
        console.log(`✅ Updated ${existingTeamSnap.size} existing team(s) in division ${divisionId}`);
      } else {
        // Create new team
        const partnerInfo = partnerDetails[divisionId];
        const players = [odUserId];

        // Add partner if specified
        if (partnerInfo?.partnerId) {
          players.push(partnerInfo.partnerId);
        }

        const teamRef = teamsRef.doc();
        await teamRef.set({
          id: teamRef.id,
          tournamentId,
          divisionId,
          players,
          name: userName,
          status: partnerInfo?.partnerId ? 'active' : 'pending_partner',
          paymentStatus: 'paid',
          paymentMethod: 'stripe',
          stripeSessionId: session.id,
          paidAt: now,
          paidAmount: session.amount_total || 0,
          createdByUserId: odUserId,
          createdAt: now,
          updatedAt: now,
        });
        console.log(`✅ Created new team ${teamRef.id} in division ${divisionId}`);
      }
    }

    console.log(`✅ Tournament registration complete: ${divisionIds.length} division(s) processed`);

  } catch (error) {
    console.error('Error processing tournament payment:', error);
    throw error;
  }
}

// ============================================
// LEAGUE PAYMENT HANDLER (Placeholder)
// ============================================

async function handleLeaguePayment(
  session: Stripe.Checkout.Session,
  metadata: Record<string, string>
) {
  const leagueId = metadata.leagueId;
  const odUserId = metadata.odUserId;

  console.log(`League payment: league=${leagueId}, user=${odUserId}`);

  // TODO: Implement league membership payment handling
  // 1. Update membership status to 'paid'
  // 2. Add user to league members
  // 3. Send confirmation email
}

// ============================================
// SMS BUNDLE PAYMENT HANDLER
// ============================================

async function handleSMSBundlePayment(
  session: Stripe.Checkout.Session,
  metadata: Record<string, string>
) {
  const bundleId = metadata.bundleId;
  const bundleName = metadata.bundleName;
  const credits = parseInt(metadata.credits, 10);
  const odUserId = metadata.odUserId;

  if (!bundleId || !odUserId || isNaN(credits)) {
    console.error('Missing required metadata for SMS bundle payment:', {
      bundleId,
      odUserId,
      credits,
    });
    return;
  }

  console.log(`Processing SMS bundle payment: bundle=${bundleName}, credits=${credits}, user=${odUserId}`);

  const db = admin.firestore();

  try {
    const now = Date.now();
    const creditsRef = db.collection('sms_credits').doc(odUserId);

    // Use a transaction to safely update credits
    await db.runTransaction(async (transaction) => {
      const creditsDoc = await transaction.get(creditsRef);

      if (!creditsDoc.exists) {
        // Create new credits document with purchased credits + free starter
        const newCredits: SMSCredits = {
          odUserId,
          balance: credits + FREE_STARTER_SMS_CREDITS,
          totalPurchased: credits,
          totalUsed: 0,
          totalFreeCredits: FREE_STARTER_SMS_CREDITS,
          lastTopUpAt: now,
          createdAt: now,
          updatedAt: now,
        };
        transaction.set(creditsRef, newCredits);
      } else {
        // Update existing credits
        const existing = creditsDoc.data() as SMSCredits;
        transaction.update(creditsRef, {
          balance: existing.balance + credits,
          totalPurchased: existing.totalPurchased + credits,
          lastTopUpAt: now,
          updatedAt: now,
        });
      }

      // Log the purchase
      const purchaseRef = db.collection('sms_credits').doc(odUserId).collection('purchases').doc();
      transaction.set(purchaseRef, {
        bundleId,
        bundleName,
        credits,
        amountNZD: session.amount_total || 0,
        stripeSessionId: session.id,
        stripePaymentIntentId: session.payment_intent as string,
        status: 'completed',
        createdAt: now,
        completedAt: now,
      });
    });

    console.log(`✅ SMS bundle purchase successful: ${bundleName} (${credits} credits) for user ${odUserId}`);

  } catch (error) {
    console.error('Error processing SMS bundle payment:', error);
    throw error;
  }
}

// ============================================
// ACCOUNT UPDATED HANDLER (Connect Onboarding)
// ============================================

async function handleAccountUpdated(account: Stripe.Account) {
  console.log('Account updated:', account.id);
  console.log('  - charges_enabled:', account.charges_enabled);
  console.log('  - payouts_enabled:', account.payouts_enabled);
  console.log('  - details_submitted:', account.details_submitted);

  const db = admin.firestore();

  // Check metadata to determine if this is a club or user account
  const accountType = account.metadata?.accountType;
  const odUserId = account.metadata?.odUserId;
  const clubId = account.metadata?.clubId;

  try {
    if (accountType === 'organizer' && odUserId) {
      // Update user document
      console.log(`Updating user ${odUserId} with Stripe status`);
      await db.collection('users').doc(odUserId).update({
        stripeChargesEnabled: account.charges_enabled,
        stripePayoutsEnabled: account.payouts_enabled,
        stripeOnboardingComplete: account.details_submitted,
        updatedAt: Date.now(),
      });
      console.log(`✅ User ${odUserId} Stripe status updated`);
    } else if (clubId) {
      // Update club document
      console.log(`Updating club ${clubId} with Stripe status`);
      await db.collection('clubs').doc(clubId).update({
        stripeChargesEnabled: account.charges_enabled,
        stripePayoutsEnabled: account.payouts_enabled,
        stripeOnboardingComplete: account.details_submitted,
        updatedAt: Date.now(),
      });
      console.log(`✅ Club ${clubId} Stripe status updated`);
    } else {
      // Try to find by stripeConnectedAccountId in users first, then clubs
      console.log('No metadata, searching by account ID...');

      // Search users
      const usersSnapshot = await db.collection('users')
        .where('stripeConnectedAccountId', '==', account.id)
        .limit(1)
        .get();

      if (!usersSnapshot.empty) {
        const userDoc = usersSnapshot.docs[0];
        await userDoc.ref.update({
          stripeChargesEnabled: account.charges_enabled,
          stripePayoutsEnabled: account.payouts_enabled,
          stripeOnboardingComplete: account.details_submitted,
          updatedAt: Date.now(),
        });
        console.log(`✅ Found and updated user ${userDoc.id}`);
        return;
      }

      // Search clubs
      const clubsSnapshot = await db.collection('clubs')
        .where('stripeConnectedAccountId', '==', account.id)
        .limit(1)
        .get();

      if (!clubsSnapshot.empty) {
        const clubDoc = clubsSnapshot.docs[0];
        await clubDoc.ref.update({
          stripeChargesEnabled: account.charges_enabled,
          stripePayoutsEnabled: account.payouts_enabled,
          stripeOnboardingComplete: account.details_submitted,
          updatedAt: Date.now(),
        });
        console.log(`✅ Found and updated club ${clubDoc.id}`);
        return;
      }

      console.warn('Could not find user or club for account:', account.id);
    }
  } catch (error) {
    console.error('Error handling account updated:', error);
  }
}

// ============================================
// SEED SMS BUNDLES (One-time setup)
// ============================================

/**
 * Seed the default SMS bundles to Firestore
 * Call this once to populate the sms_bundles collection
 */
export const stripe_seedSMSBundles = functions.https.onCall(async (_data, context) => {
  // Only app admins can seed bundles
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const db = admin.firestore();

  // Check if user is app admin
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  if (!userDoc.exists || !userDoc.data()?.isAppAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Only app admins can seed bundles');
  }

  try {
    const bundlesRef = db.collection('sms_bundles');

    // Check if bundles already exist
    const existingBundles = await bundlesRef.get();
    if (!existingBundles.empty) {
      return {
        success: false,
        message: `${existingBundles.size} bundles already exist. Delete them first to re-seed.`,
        existing: existingBundles.docs.map(d => ({
          id: d.id,
          name: d.data().name,
          credits: d.data().credits,
        })),
      };
    }

    // Seed the default bundles
    const now = Date.now();
    const batch = db.batch();
    const seededBundles: { id: string; name: string; credits: number; priceNZD: number }[] = [];

    for (const bundle of DEFAULT_SMS_BUNDLES) {
      const docRef = bundlesRef.doc();
      batch.set(docRef, {
        ...bundle,
        createdAt: now,
        updatedAt: now,
      });
      seededBundles.push({
        id: docRef.id,
        name: bundle.name,
        credits: bundle.credits,
        priceNZD: bundle.priceNZD,
      });
    }

    await batch.commit();

    console.log(`✅ Seeded ${seededBundles.length} SMS bundles by user ${context.auth.uid}`);

    return {
      success: true,
      message: `Successfully seeded ${seededBundles.length} SMS bundles`,
      bundles: seededBundles,
    };
  } catch (error: any) {
    console.error('Error seeding SMS bundles:', error);
    throw new functions.https.HttpsError('internal', error.message || 'Failed to seed bundles');
  }
});


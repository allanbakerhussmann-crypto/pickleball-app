/**
 * Stripe Cloud Functions
 * 
 * Backend functions for Stripe integration:
 * - Create Connect accounts for clubs and users
 * - Create Checkout sessions
 * - Handle webhooks (creates bookings/RSVPs after payment)
 * 
 * FILE LOCATION: functions/src/stripe.ts
 */
// Updated webhook secret

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

// Initialize Firebase Admin if not already
if (!admin.apps.length) {
  admin.initializeApp();
}

// Initialize Stripe with your secret key
const stripe = new Stripe(
  functions.config().stripe?.secret_key || 
  'sk_test_51SfRmRAbckg8jC4DL2WMiwN3KWk4NP3GzP1RsLp8mrk8PALZF734VhcHwbnAIIPeHCKM0A0xviOhKch7V8AMzOWS0032p75RHd',
  { apiVersion: '2023-10-16' as any }
);

// Platform fee percentage (1.5%)
const PLATFORM_FEE_PERCENT = 1.5;

// ============================================
// CREATE CONNECT ACCOUNT (FOR CLUBS)
// ============================================

export const stripe_createConnectAccount = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const { clubId, clubName, clubEmail, returnUrl, refreshUrl } = data;

  if (!clubId || !clubName || !returnUrl || !refreshUrl) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  // Verify user is club admin
  const clubDoc = await admin.firestore().collection('clubs').doc(clubId).get();
  if (!clubDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Club not found');
  }

  const clubData = clubDoc.data()!;
  if (clubData.createdByUserId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Only club owner can connect Stripe');
  }

  try {
    // Check if club already has a Stripe account
    let accountId = clubData.stripeConnectedAccountId;

    if (!accountId) {
      // Create new Express account
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'NZ',
        email: clubEmail || undefined,
        business_type: 'company',
        company: {
          name: clubName,
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: {
          clubId,
          clubName,
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
// CREATE USER CONNECT ACCOUNT (FOR ORGANIZERS)
// ============================================

export const stripe_createUserConnectAccount = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const { userId, userName, userEmail, returnUrl, refreshUrl } = data;

  if (!userId || !userName || !returnUrl || !refreshUrl) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  // Verify user is creating for themselves
  if (userId !== context.auth.uid) {
    throw new functions.https.HttpsError('permission-denied', 'Can only create account for yourself');
  }

  // Verify user is an organizer
  const userDoc = await admin.firestore().collection('users').doc(userId).get();
  if (!userDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'User not found');
  }

  const userData = userDoc.data()!;
  const roles = userData.roles || [];
  const isOrganizer = roles.includes('organizer') || roles.includes('admin') || userData.isRootAdmin;

  if (!isOrganizer) {
    throw new functions.https.HttpsError('permission-denied', 'Only organizers can connect Stripe');
  }

  try {
    // Check if user already has a Stripe account
    let accountId = userData.stripeConnectedAccountId;

    if (!accountId) {
      // Create new Express account
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'NZ',
        email: userEmail || undefined,
        business_type: 'individual',
        individual: {
          first_name: userName.split(' ')[0],
          last_name: userName.split(' ').slice(1).join(' ') || undefined,
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        metadata: {
          odUserId: userId,
          userName,
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
    throw new functions.https.HttpsError('permission-denied', 'Not your Stripe account');
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
    clubId,
    clubStripeAccountId,
    organizerStripeAccountId,
    successUrl,
    cancelUrl,
    metadata,
  } = data;

  if (!items || !items.length || !successUrl || !cancelUrl) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
  }

  // Calculate total amount
  const totalAmount = items.reduce((sum: number, item: any) => {
    return sum + (item.amount * item.quantity);
  }, 0);

  // Calculate platform fee (1.5%)
  const platformFee = Math.round(totalAmount * (PLATFORM_FEE_PERCENT / 100));

  // Determine destination account (club or organizer)
  const destinationAccount = clubStripeAccountId || organizerStripeAccountId;

  try {
    // Build session config
    const sessionConfig: any = {
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: customerEmail,
      line_items: items.map((item: any) => ({
        price_data: {
          currency: 'nzd',
          product_data: {
            name: item.name,
            description: item.description,
          },
          unit_amount: item.amount,
        },
        quantity: item.quantity,
      })),
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        clubId: clubId || '',
        odUserId: context.auth.uid,
        platformFee: platformFee.toString(),
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
// STRIPE WEBHOOK HANDLER
// ============================================

export const stripe_webhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = functions.config().stripe?.webhook_secret || process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig) {
    res.status(400).send('Missing signature');
    return;
  }

  let event: Stripe.Event;

  try {
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    } else {
      // For testing without webhook secret
      event = req.body as Stripe.Event;
    }
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutComplete(session);
      break;
    }

    case 'account.updated': {
      const account = event.data.object as Stripe.Account;
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

    console.log(`Meetup payment successful: ${userName} paid ${amountPaid} cents for meetup ${meetupId}`);

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

    // Parse slots
    let slots: Array<{ courtId: string; startTime: string; endTime: string }> = [];
    if (slotsJson) {
      try {
        slots = JSON.parse(slotsJson);
      } catch (e) {
        console.error('Failed to parse slots JSON:', e);
      }
    }

    // Create bookings for each slot
    for (const slot of slots) {
      const bookingId = `${slot.courtId}_${slot.startTime}_${odUserId}`;
      
      await db.collection('clubs').doc(clubId).collection('court_bookings').doc(bookingId).set({
        odUserId,
        odClubId: clubId,
        courtId: slot.courtId,
        startTime: slot.startTime,
        endTime: slot.endTime,
        status: 'confirmed',
        paymentStatus: 'paid',
        stripeSessionId: session.id,
        stripePaymentIntentId: session.payment_intent,
        bookedByName: userName,
        bookedAt: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      console.log(`Created booking: ${bookingId}`);
    }

    console.log(`Court booking successful: ${slots.length} slots booked for ${userName}`);

  } catch (error) {
    console.error('Error processing court booking:', error);
    throw error;
  }
}

// ============================================
// TOURNAMENT PAYMENT HANDLER (PLACEHOLDER)
// ============================================

async function handleTournamentPayment(
  session: Stripe.Checkout.Session,
  metadata: Record<string, string>
) {
  const tournamentId = metadata.tournamentId;
  const divisionId = metadata.divisionId;
  const odUserId = metadata.odUserId;

  console.log(`Tournament payment: tournament=${tournamentId}, division=${divisionId}, user=${odUserId}`);

  // TODO: Implement tournament registration payment
  // 1. Update registration paymentStatus to 'paid'
  // 2. Update tournament account with revenue
  // 3. Confirm team registration if applicable
}

// ============================================
// LEAGUE PAYMENT HANDLER (PLACEHOLDER)
// ============================================

async function handleLeaguePayment(
  session: Stripe.Checkout.Session,
  metadata: Record<string, string>
) {
  const leagueId = metadata.leagueId;
  const odUserId = metadata.odUserId;

  console.log(`League payment: league=${leagueId}, user=${odUserId}`);

  // TODO: Implement league membership payment
  // 1. Update member paymentStatus to 'paid'
  // 2. Update league account with revenue
}

// ============================================
// ACCOUNT UPDATED HANDLER
// ============================================

async function handleAccountUpdated(account: Stripe.Account) {
  console.log('Account updated:', account.id);

  const db = admin.firestore();

  try {
    // Check if this is a club account
    const clubsQuery = await db.collection('clubs')
      .where('stripeConnectedAccountId', '==', account.id)
      .limit(1)
      .get();

    if (!clubsQuery.empty) {
      const clubDoc = clubsQuery.docs[0];
      await clubDoc.ref.update({
        stripeOnboardingComplete: account.details_submitted,
        stripeChargesEnabled: account.charges_enabled,
        stripePayoutsEnabled: account.payouts_enabled,
        updatedAt: Date.now(),
      });
      console.log(`Updated club ${clubDoc.id} Stripe status`);
      return;
    }

    // Check if this is a user account
    const usersQuery = await db.collection('users')
      .where('stripeConnectedAccountId', '==', account.id)
      .limit(1)
      .get();

    if (!usersQuery.empty) {
      const userDoc = usersQuery.docs[0];
      await userDoc.ref.update({
        stripeOnboardingComplete: account.details_submitted,
        stripeChargesEnabled: account.charges_enabled,
        stripePayoutsEnabled: account.payouts_enabled,
        updatedAt: Date.now(),
      });
      console.log(`Updated user ${userDoc.id} Stripe status`);
      return;
    }

    console.log('No matching club or user found for account:', account.id);

  } catch (error) {
    console.error('Error handling account update:', error);
  }
}
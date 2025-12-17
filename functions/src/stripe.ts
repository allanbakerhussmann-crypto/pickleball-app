/**
 * Stripe Cloud Functions
 * 
 * Backend functions for Stripe integration:
 * - Create Connect accounts for clubs
 * - Create Checkout sessions
 * - Handle webhooks
 * 
 * FILE LOCATION: functions/src/stripe.ts
 * 
 * SETUP:
 * 1. cd functions
 * 2. npm install stripe
 * 3. firebase functions:config:set stripe.secret_key="sk_test_xxx"
 * 4. firebase deploy --only functions
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
  functions.config().stripe?.secret_key || 
  'sk_test_51SfRmcAX1ucMm7kBCgn9NkrnydakcyyLBNQj2N3IFFfiPKvxaexcVjSYHYOJlS9Q5bnmDW1aP8ipEXkp1XJEHJbY00IfxbFOo7',
  { apiVersion: '2025-12-15.clover' as any }
);

// Platform fee percentage (1.5%)
const PLATFORM_FEE_PERCENT = 1.5;

// ============================================
// CREATE CONNECT ACCOUNT
// ============================================

export const stripe_createConnectAccount = functions.https.onCall(async (data, context) => {
  // Verify user is authenticated
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
  const isAdmin = clubData.admins?.includes(context.auth.uid) || 
                  clubData.createdBy === context.auth.uid;

  if (!isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Must be club admin');
  }

  try {
    // Check if account already exists
    let accountId = clubData.stripeConnectedAccountId;

    if (!accountId) {
      // Create new Express account
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'NZ', // New Zealand
        email: clubEmail || undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: 'company',
        company: {
          name: clubName,
        },
        metadata: {
          clubId,
          platform: 'pickleball-director',
        },
      });

      accountId = account.id;

      // Save account ID to club document
      await admin.firestore().collection('clubs').doc(clubId).update({
        stripeConnectedAccountId: accountId,
        stripeOnboardingComplete: false,
        stripeChargesEnabled: false,
        stripePayoutsEnabled: false,
        stripeUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
      url: accountLink.url,
      accountId,
    };
  } catch (error: any) {
    console.error('Stripe Connect error:', error);
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
// CREATE CONNECT LOGIN LINK
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

  try {
    // Build session config
    const sessionConfig: Stripe.Checkout.SessionCreateParams = {
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

    // If club has connected Stripe account, split the payment
    if (clubStripeAccountId) {
      sessionConfig.payment_intent_data = {
        application_fee_amount: platformFee,
        transfer_data: {
          destination: clubStripeAccountId,
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
  const clubId = metadata.clubId;
  const odUserId = metadata.odUserId;
  const bookingIds = metadata.bookingIds?.split(',') || [];

  if (!odUserId) {
    console.error('Missing odUserId in session metadata');
    return;
  }

  try {
    // Create payment record
    await admin.firestore().collection('payments').add({
      stripeSessionId: session.id,
      stripePaymentIntentId: session.payment_intent,
      clubId: clubId || null,
      odUserId,
      amount: session.amount_total,
      currency: session.currency,
      status: 'completed',
      platformFee: parseInt(metadata.platformFee || '0'),
      bookingIds,
      metadata,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Update any pending bookings to confirmed
    if (clubId && bookingIds.length > 0) {
      for (const bookingId of bookingIds) {
        if (bookingId) {
          await admin.firestore()
            .collection('clubs')
            .doc(clubId)
            .collection('bookings')
            .doc(bookingId)
            .update({
              status: 'confirmed',
              paymentStatus: 'paid',
              stripeSessionId: session.id,
              paidAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
      }
    }

    console.log('Payment recorded successfully');
  } catch (error) {
    console.error('Error handling checkout complete:', error);
  }
}

async function handleAccountUpdated(account: Stripe.Account) {
  console.log('Account updated:', account.id);

  try {
    // Find club with this Stripe account
    const clubsQuery = await admin.firestore()
      .collection('clubs')
      .where('stripeConnectedAccountId', '==', account.id)
      .limit(1)
      .get();

    if (clubsQuery.empty) {
      console.log('No club found for account:', account.id);
      return;
    }

    const clubDoc = clubsQuery.docs[0];

    // Update club with latest account status
    await clubDoc.ref.update({
      stripeChargesEnabled: account.charges_enabled,
      stripePayoutsEnabled: account.payouts_enabled,
      stripeOnboardingComplete: account.details_submitted,
      stripeUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('Club Stripe status updated:', clubDoc.id);
  } catch (error) {
    console.error('Error handling account update:', error);
  }
}
/**
 * Stripe Webhook Handlers
 * 
 * Processes Stripe webhook events and updates our database accordingly.
 * 
 * IMPORTANT: These handlers should be called from Cloud Functions
 * after verifying the webhook signature with Stripe's library.
 * 
 * FILE LOCATION: services/firebase/payments/stripeWebhooks.ts
 */

import {
  getPaymentByStripeIntent,
  updatePaymentStatus,
  hasWebhookEventBeenProcessed,
  recordWebhookEvent,
  markWebhookEventProcessed,
  updateStripeConnectAccountStatus,
  getStripeConnectAccountByStripeId,
  mapStripeStatusToPaymentStatus,
  recordPaymentRefund,
} from './stripe';
import { logTransaction, updateTransactionStatus } from './transactions';
import { addToWallet, deductFromWallet } from './wallet';
import { recordClubRevenue, recordClubRefund } from '../accounting/clubAccount';
import { recordUserPayment, recordUserRefund } from '../accounting/userAccount';
import type { PaymentStatus, ReferenceType } from './types';

// ============================================
// TYPES
// ============================================

/**
 * Stripe Event structure (simplified)
 */
export interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, any>;
    previous_attributes?: Record<string, any>;
  };
  created: number;
}

/**
 * Payment Intent object from Stripe
 */
export interface StripePaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: string;
  customer?: string;
  metadata: Record<string, string>;
  charges?: {
    data: Array<{
      id: string;
      amount: number;
      amount_refunded: number;
      refunded: boolean;
    }>;
  };
  last_payment_error?: {
    message: string;
    code: string;
  };
  application_fee_amount?: number;
  transfer_data?: {
    destination: string;
  };
}

/**
 * Refund object from Stripe
 */
export interface StripeRefund {
  id: string;
  amount: number;
  currency: string;
  payment_intent: string;
  status: string;
  reason?: string;
  metadata?: Record<string, string>;
}

/**
 * Connect Account object from Stripe
 */
export interface StripeConnectAccount {
  id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  email?: string;
  business_profile?: {
    name?: string;
  };
}

/**
 * Webhook handler result
 */
export interface WebhookHandlerResult {
  success: boolean;
  error?: string;
  action?: string;
}

// ============================================
// MAIN WEBHOOK PROCESSOR
// ============================================

/**
 * Process a Stripe webhook event
 * Call this from your Cloud Function after verifying the signature
 */
export const processStripeWebhook = async (
  event: StripeEvent
): Promise<WebhookHandlerResult> => {
  // Check for duplicate events (idempotency)
  const alreadyProcessed = await hasWebhookEventBeenProcessed(event.id);
  if (alreadyProcessed) {
    return { success: true, action: 'skipped_duplicate' };
  }
  
  // Record the event
  await recordWebhookEvent(event.id, event.type, event.data.object);
  
  try {
    let result: WebhookHandlerResult;
    
    // Route to appropriate handler
    switch (event.type) {
      // Payment Intent events
      case 'payment_intent.succeeded':
        result = await handlePaymentIntentSucceeded(event.data.object as StripePaymentIntent);
        break;
        
      case 'payment_intent.payment_failed':
        result = await handlePaymentIntentFailed(event.data.object as StripePaymentIntent);
        break;
        
      case 'payment_intent.canceled':
        result = await handlePaymentIntentCanceled(event.data.object as StripePaymentIntent);
        break;
        
      case 'payment_intent.requires_action':
        result = await handlePaymentIntentRequiresAction(event.data.object as StripePaymentIntent);
        break;
        
      case 'payment_intent.processing':
        result = await handlePaymentIntentProcessing(event.data.object as StripePaymentIntent);
        break;
        
      // Refund events
      case 'charge.refunded':
        result = await handleChargeRefunded(event.data.object);
        break;
        
      case 'charge.refund.updated':
        result = await handleRefundUpdated(event.data.object);
        break;
        
      // Connect account events
      case 'account.updated':
        result = await handleConnectAccountUpdated(event.data.object as StripeConnectAccount);
        break;
        
      case 'account.application.deauthorized':
        result = await handleConnectAccountDeauthorized(event.data.object);
        break;
        
      // Payout events
      case 'payout.paid':
        result = await handlePayoutPaid(event.data.object);
        break;
        
      case 'payout.failed':
        result = await handlePayoutFailed(event.data.object);
        break;
        
      default:
        // Unknown event type - log but don't fail
        result = { success: true, action: `unhandled_event_type: ${event.type}` };
    }
    
    // Mark as processed
    await markWebhookEventProcessed(event.id);
    return result;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await markWebhookEventProcessed(event.id, errorMessage);
    return { success: false, error: errorMessage };
  }
};

// ============================================
// PAYMENT INTENT HANDLERS
// ============================================

/**
 * Handle successful payment
 */
const handlePaymentIntentSucceeded = async (
  paymentIntent: StripePaymentIntent
): Promise<WebhookHandlerResult> => {
  // Find our payment record
  const payment = await getPaymentByStripeIntent(paymentIntent.id);
  if (!payment) {
    return { success: false, error: `Payment not found for intent: ${paymentIntent.id}` };
  }
  
  // Get charge ID
  const chargeId = paymentIntent.charges?.data[0]?.id;
  
  // Update payment status
  await updatePaymentStatus(payment.id, 'succeeded', {
    stripeChargeId: chargeId,
    completedAt: Date.now(),
  });
  
  // Create transaction record
  const transaction = await logTransaction({
    walletId: undefined, // Direct card payment
    odUserId: payment.odUserId,
    odClubId: payment.odClubId,
    tournamentId: payment.tournamentId,
    leagueId: payment.leagueId,
    type: 'payment',
    amount: payment.amount,
    currency: payment.currency,
    status: 'completed',
    paymentMethod: 'card',
    stripePaymentIntentId: paymentIntent.id,
    stripeChargeId: chargeId,
    referenceType: payment.referenceType,
    referenceId: payment.referenceId,
    referenceName: payment.referenceName,
    breakdown: payment.breakdown,
    platformFee: payment.platformFee,
    netAmount: payment.netAmount,
  });
  
  // Update user account
  await recordUserPayment(payment.odUserId, {
    amount: payment.amount,
    referenceType: payment.referenceType,
    clubId: payment.odClubId,
  });
  
  // Update club account if applicable
  if (payment.odClubId) {
    await recordClubRevenue(payment.odClubId, {
      amount: payment.amount,
      referenceType: payment.referenceType,
      paymentMethod: 'card',
      platformFee: payment.platformFee || 0,
    });
  }
  
  return { success: true, action: 'payment_completed' };
};

/**
 * Handle failed payment
 */
const handlePaymentIntentFailed = async (
  paymentIntent: StripePaymentIntent
): Promise<WebhookHandlerResult> => {
  const payment = await getPaymentByStripeIntent(paymentIntent.id);
  if (!payment) {
    return { success: false, error: `Payment not found for intent: ${paymentIntent.id}` };
  }
  
  await updatePaymentStatus(payment.id, 'failed', {
    failureReason: paymentIntent.last_payment_error?.message,
    failureCode: paymentIntent.last_payment_error?.code,
  });
  
  return { success: true, action: 'payment_failed' };
};

/**
 * Handle canceled payment
 */
const handlePaymentIntentCanceled = async (
  paymentIntent: StripePaymentIntent
): Promise<WebhookHandlerResult> => {
  const payment = await getPaymentByStripeIntent(paymentIntent.id);
  if (!payment) {
    return { success: false, error: `Payment not found for intent: ${paymentIntent.id}` };
  }
  
  await updatePaymentStatus(payment.id, 'failed', {
    failureReason: 'Payment was canceled',
  });
  
  return { success: true, action: 'payment_canceled' };
};

/**
 * Handle payment requiring action (3D Secure, etc.)
 */
const handlePaymentIntentRequiresAction = async (
  paymentIntent: StripePaymentIntent
): Promise<WebhookHandlerResult> => {
  const payment = await getPaymentByStripeIntent(paymentIntent.id);
  if (!payment) {
    return { success: false, error: `Payment not found for intent: ${paymentIntent.id}` };
  }
  
  await updatePaymentStatus(payment.id, 'requires_action');
  
  return { success: true, action: 'payment_requires_action' };
};

/**
 * Handle payment processing
 */
const handlePaymentIntentProcessing = async (
  paymentIntent: StripePaymentIntent
): Promise<WebhookHandlerResult> => {
  const payment = await getPaymentByStripeIntent(paymentIntent.id);
  if (!payment) {
    return { success: false, error: `Payment not found for intent: ${paymentIntent.id}` };
  }
  
  await updatePaymentStatus(payment.id, 'processing');
  
  return { success: true, action: 'payment_processing' };
};

// ============================================
// REFUND HANDLERS
// ============================================

/**
 * Handle charge refunded
 */
const handleChargeRefunded = async (
  charge: Record<string, any>
): Promise<WebhookHandlerResult> => {
  const paymentIntentId = charge.payment_intent;
  if (!paymentIntentId) {
    return { success: true, action: 'no_payment_intent' };
  }
  
  const payment = await getPaymentByStripeIntent(paymentIntentId);
  if (!payment) {
    return { success: false, error: `Payment not found for intent: ${paymentIntentId}` };
  }
  
  const refundedAmount = charge.amount_refunded;
  const isFullyRefunded = charge.refunded;
  
  // Update payment status
  const newStatus: PaymentStatus = isFullyRefunded ? 'refunded' : 'partially_refunded';
  await updatePaymentStatus(payment.id, newStatus);
  
  // Record refund in payment
  const latestRefund = charge.refunds?.data?.[0];
  if (latestRefund) {
    await recordPaymentRefund(payment.id, latestRefund.amount, latestRefund.id);
  }
  
  // Update user account
  await recordUserRefund(payment.odUserId, refundedAmount, payment.odClubId);
  
  // Update club account if applicable
  if (payment.odClubId) {
    // Calculate platform fee portion to refund (proportional)
    const platformFeeRefund = payment.platformFee 
      ? Math.round((refundedAmount / payment.amount) * payment.platformFee)
      : 0;
    
    await recordClubRefund(payment.odClubId, refundedAmount, platformFeeRefund);
  }
  
  return { success: true, action: isFullyRefunded ? 'fully_refunded' : 'partially_refunded' };
};

/**
 * Handle refund updated
 */
const handleRefundUpdated = async (
  refund: Record<string, any>
): Promise<WebhookHandlerResult> => {
  // Handle refund status changes if needed
  // Most refunds complete immediately, but some may fail
  
  if (refund.status === 'failed') {
    // Log the failure - in production, you'd want to notify someone
    console.error(`Refund failed: ${refund.id}, reason: ${refund.failure_reason}`);
  }
  
  return { success: true, action: `refund_status_${refund.status}` };
};

// ============================================
// CONNECT ACCOUNT HANDLERS
// ============================================

/**
 * Handle Connect account updated
 */
const handleConnectAccountUpdated = async (
  account: StripeConnectAccount
): Promise<WebhookHandlerResult> => {
  await updateStripeConnectAccountStatus(account.id, {
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
    email: account.email,
    businessName: account.business_profile?.name,
  });
  
  return { success: true, action: 'connect_account_updated' };
};

/**
 * Handle Connect account deauthorized
 */
const handleConnectAccountDeauthorized = async (
  data: Record<string, any>
): Promise<WebhookHandlerResult> => {
  const stripeAccountId = data.id;
  
  // Mark account as disabled
  await updateStripeConnectAccountStatus(stripeAccountId, {
    chargesEnabled: false,
    payoutsEnabled: false,
  });
  
  return { success: true, action: 'connect_account_deauthorized' };
};

// ============================================
// PAYOUT HANDLERS
// ============================================

/**
 * Handle payout paid
 */
const handlePayoutPaid = async (
  payout: Record<string, any>
): Promise<WebhookHandlerResult> => {
  // Payouts are typically to Connect accounts (clubs)
  // Log the successful payout
  
  const stripeAccountId = payout.destination;
  const amount = payout.amount;
  const currency = payout.currency;
  
  console.log(`Payout successful: ${amount} ${currency} to account ${stripeAccountId}`);
  
  // In production, you'd update your payout records here
  
  return { success: true, action: 'payout_paid' };
};

/**
 * Handle payout failed
 */
const handlePayoutFailed = async (
  payout: Record<string, any>
): Promise<WebhookHandlerResult> => {
  const stripeAccountId = payout.destination;
  const failureCode = payout.failure_code;
  const failureMessage = payout.failure_message;
  
  console.error(`Payout failed: ${failureCode} - ${failureMessage} for account ${stripeAccountId}`);
  
  // In production, you'd:
  // 1. Update your payout records
  // 2. Notify the club/admin
  // 3. Maybe retry the payout
  
  return { success: true, action: 'payout_failed' };
};

// ============================================
// WEBHOOK SIGNATURE VERIFICATION
// ============================================

/**
 * Note: Signature verification should be done in your Cloud Function
 * using the Stripe library. This is just a placeholder showing the pattern.
 * 
 * Example Cloud Function:
 * 
 * ```typescript
 * import * as functions from 'firebase-functions';
 * import Stripe from 'stripe';
 * import { processStripeWebhook } from './services/firebase/payments/stripeWebhooks';
 * 
 * const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
 *   apiVersion: '2023-10-16',
 * });
 * 
 * export const stripeWebhook = functions.https.onRequest(async (req, res) => {
 *   const sig = req.headers['stripe-signature'] as string;
 *   const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;
 *   
 *   let event: Stripe.Event;
 *   
 *   try {
 *     event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
 *   } catch (err) {
 *     console.error('Webhook signature verification failed:', err);
 *     res.status(400).send(`Webhook Error: ${err.message}`);
 *     return;
 *   }
 *   
 *   const result = await processStripeWebhook(event as StripeEvent);
 *   
 *   if (result.success) {
 *     res.status(200).json({ received: true, action: result.action });
 *   } else {
 *     res.status(500).json({ error: result.error });
 *   }
 * });
 * ```
 */

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get webhook events for debugging
 */
export const getRecentWebhookEvents = async (
  limitCount: number = 20
): Promise<Array<{ id: string; type: string; processed: boolean; createdAt: number }>> => {
  // This would query the stripeWebhookEvents collection
  // Implementation depends on your query patterns
  return [];
};

/**
 * Retry failed webhook event
 */
export const retryWebhookEvent = async (
  eventId: string
): Promise<WebhookHandlerResult> => {
  // Fetch the event from our records and reprocess
  // This is useful for recovering from temporary failures
  return { success: false, error: 'Not implemented' };
};
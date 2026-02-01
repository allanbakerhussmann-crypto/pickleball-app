/**
 * Standing Meetup Types
 *
 * Types for recurring meetups with one-time registration payments (MVP).
 * Stripe subscriptions deferred to V2.
 *
 * @version 07.57
 * @file types/standingMeetup.ts
 */

import { MeetupCompetitionType, MeetupCompetitionSettings } from '../types';

// =============================================================================
// Standing Meetup (Parent)
// =============================================================================

/**
 * Standing Meetup - Parent document for recurring meetups
 * Collection: standingMeetups/{standingMeetupId}
 */
export interface StandingMeetup {
  id: string;

  // Ownership
  clubId: string;
  clubName: string;
  createdByUserId: string;
  organizerStripeAccountId: string;

  // Basic Info
  title: string;
  description: string;
  locationName: string;
  lat?: number;
  lng?: number;

  /**
   * Timezone (CRITICAL for NZ/AU)
   * All occurrence generation, billing anchors, and cutoff checks use this timezone.
   * NEVER use server timezone (UTC) - always use this field.
   */
  timezone: string; // IANA timezone, e.g., "Pacific/Auckland", "Australia/Sydney"

  /**
   * Recurrence Pattern
   * V1: ONLY 'weekly' is supported. Monthly requires monthlyMode field (V1.5).
   */
  recurrence: {
    interval: 'weekly'; // V1: Weekly only. Monthly deferred to V1.5.
    intervalCount?: number; // e.g., 2 = every 2 weeks (default: 1)
    dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday
    startTime: string; // "08:00" (interpreted in `timezone`)
    endTime: string; // "21:00" (interpreted in `timezone`)
    startDate: string; // "2025-02-01"
    endDate?: string; // Calculated from startDate + totalSessions
    totalSessions?: number; // Number of weekly sessions (e.g., 10 for school term)
  };

  // Capacity
  maxPlayers: number;
  /**
   * V1: waitlistEnabled field exists but is NOT implemented. UI should hide this toggle.
   * V1.5: Implement waitlist with status='waitlisted', waitlistPosition, and promotion logic.
   */
  waitlistEnabled: boolean; // RESERVED for V1.5 - do not use in V1

  /**
   * Billing (organizer-configured)
   * MVP Hybrid model: Season Pass + Pick-and-Pay
   */
  billing: {
    interval: 'weekly'; // V1: Weekly only. Monthly deferred to V1.5.
    intervalCount?: number; // e.g., 2 = every 2 weeks (default: 1)
    amount: number; // Season Pass price in cents (optional - if 0, only pick-and-pay shown)
    perSessionAmount: number; // Per-session price in cents (required for pick-and-pay)
    currency: 'nzd' | 'aud' | 'usd';
    feesPaidBy: 'organizer' | 'player';
    stripePriceId?: string; // Created on first subscription
  };

  /**
   * Credits (auto-calculated)
   * Credit amount is NOT stored here - it's calculated at runtime
   * as: billingAmount - stripeFees - platformFee (net to organizer)
   */
  credits: {
    enabled: boolean;
    cancellationCutoffHours: number; // e.g., 24
  };

  // Competition
  competitionType: MeetupCompetitionType;
  competitionSettings?: MeetupCompetitionSettings;

  /**
   * State
   * NOTE: 'paused' is RESERVED for V1.5. V1 code must NEVER set this value.
   */
  status: 'draft' | 'active' | 'paused' | 'archived';
  visibility: 'public' | 'linkOnly' | 'private';
  subscriberCount: number;

  /**
   * Payment Methods (MVP)
   * Same pattern as leagues - one-time registration fee
   */
  paymentMethods?: {
    acceptCardPayments: boolean;      // Stripe online payment
    acceptBankTransfer: boolean;      // Manual bank transfer
    bankDetails?: {
      bankName: string;
      accountName: string;
      accountNumber: string;
      reference?: string;             // Reference instructions
      showToPlayers: boolean;
    };
  };

  createdAt: number;
  updatedAt: number;
}

// =============================================================================
// Meetup Occurrence (Subcollection)
// =============================================================================

/**
 * Meetup Occurrence - Individual session instance
 * Collection: standingMeetups/{id}/occurrences/{dateId}
 *
 * INVARIANT: Document ID === occurrence.date (both "YYYY-MM-DD")
 * INVARIANT: `when` = timestamp of session START (date + startTime in meetup's timezone)
 *            NOT midnight, NOT endTime
 */
export interface MeetupOccurrence {
  id: string; // Same as dateId, e.g., "2025-02-10"
  standingMeetupId: string;
  clubId: string;

  // Time (human-readable, for display)
  date: string; // "YYYY-MM-DD" - MUST match document ID
  startTime: string; // "18:30" (24-hour format, for display)
  endTime: string; // "21:00" (24-hour format, for display)

  /**
   * Time (timestamps, for queries and logic)
   * These avoid repeated timezone parsing in UI and simplify cutoff checks
   */
  when: number; // Alias for startAt (for backwards compat with queries)
  startAt: number; // Timestamp of session START (date + startTime in meetup's timezone)
  endAt: number; // Timestamp of session END (date + endTime in meetup's timezone)
  // INVARIANT: when === startAt (both are the same value)

  // Overrides
  isModified: boolean;
  locationOverride?: string;
  timeOverride?: { startTime: string; endTime: string };

  // State
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  cancelledAt?: number;
  cancelReason?: string;

  /**
   * Attendance COUNTERS (not arrays - participants in subcollection)
   * Each counter = count(participants where status == X)
   * INVARIANT: expectedCount + checkedInCount + cancelledCount + noShowCount = total participants
   */
  expectedCount: number; // count(status == 'expected') - waiting to arrive
  checkedInCount: number; // count(status == 'checked_in') - physically arrived
  cancelledCount: number; // count(status == 'cancelled') - player cancelled
  noShowCount: number; // count(status == 'no_show') - didn't show, didn't cancel

  // Credits - just a flag, wallet ledger is truth
  creditsIssued: boolean;
  creditsIssuedAt?: number;

  // QR Check-In (optional feature)
  checkInEnabled: boolean;
  checkInTokenHash?: string; // Store hash, not raw token
  checkInTokenExpiresAt?: number;
  checkInLastRotatedAt?: number;

  createdAt: number;
  updatedAt: number;
}

// =============================================================================
// Occurrence Participant (Subcollection of Occurrence)
// =============================================================================

/**
 * Occurrence Participant - Attendance record per session
 * Collection: standingMeetups/{id}/occurrences/{dateId}/participants/{userId}
 * NOTE: Document ID is {userId}, so no need for separate userId field
 */
export interface OccurrenceParticipant {
  userName: string; // Canonical field name - do not use odUserName

  /**
   * Status definitions:
   * - expected: subscribed/registered for this occurrence
   * - cancelled: player cancelled before cutoff (may receive credit)
   * - checked_in: physically arrived (via QR or manual)
   * - no_show: didn't show up, no cancel (no credit by default)
   */
  status: 'expected' | 'cancelled' | 'checked_in' | 'no_show';

  // Check-in tracking
  checkedInAt?: number;
  checkInMethod?: 'qr' | 'organizer' | 'manual';

  // Credit tracking (with idempotency)
  creditIssued: boolean;
  creditIssuedAt?: number;
  creditAmount?: number;
  creditReason?: 'organizer_cancelled' | 'player_cancelled_before_cutoff';
  walletTransactionId?: string; // Idempotency: prevents double-crediting on retries

  updatedAt: number;
}

export type ParticipantStatus = OccurrenceParticipant['status'];

// =============================================================================
// Meetup Occurrence Index (Flat Collection for Discovery)
// =============================================================================

/**
 * Meetup Occurrence Index - Flat collection for discovery queries
 * Collection: meetupOccurrencesIndex/{standingMeetupId}_{dateId}
 *
 * Purpose: Global feed, "near me" queries, cross-club discovery
 * WRITE ACCESS: Cloud Functions only (synced from occurrences subcollection)
 */
export interface MeetupOccurrenceIndex {
  id: string; // {standingMeetupId}_{dateId}

  // References
  standingMeetupId: string;
  occurrenceDate: string; // "2025-02-08"
  clubId: string;

  // Query fields
  when: number; // Timestamp for sorting
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

  // Display fields (denormalized for feed)
  title: string;
  clubName: string;
  locationName: string;
  startTime: string;
  endTime: string;

  // Geo for "near me" queries
  venueGeo?: { lat: number; lng: number };
  geohash?: string; // For geofire-common range queries

  // Capacity hint
  maxPlayers: number;
  expectedCount: number;
  spotsLeft: number;

  // Price hint
  billingAmount: number;
  billingInterval: 'weekly';
  billingIntervalCount?: number; // e.g., 2 = every 2 weeks

  updatedAt: number;
}

// =============================================================================
// Standing Meetup Subscription
// =============================================================================

/**
 * Standing Meetup Subscription - Player subscription record
 * Collection: standingMeetupSubscriptions/{standingMeetupId}_{userId}
 */
export interface StandingMeetupSubscription {
  id: string;
  standingMeetupId: string;
  clubId: string;
  userId: string;
  userName: string;
  userEmail: string;

  /**
   * Stripe (IMPORTANT: All IDs belong to the CONNECTED account, not platform)
   */
  stripeAccountId: string; // Connected account ID (e.g., "acct_xxx") - store for routing
  stripeSubscriptionId: string; // Subscription ID on connected account
  stripeCustomerId: string; // Customer ID on connected account (NOT platform customer)
  stripeStatus: 'active' | 'past_due' | 'canceled' | 'unpaid';

  // Billing
  currentPeriodStart: number;
  currentPeriodEnd: number;
  billingAmount: number;

  /**
   * State
   * NOTE: 'paused' is RESERVED for V1.5. V1 code must NEVER set this value.
   */
  status: 'active' | 'paused' | 'cancelled' | 'past_due';
  pausedAt?: number; // V1.5 only
  cancelledAt?: number;

  // Stats
  totalPaid: number;
  totalCreditsReceived: number;

  createdAt: number;
  updatedAt: number;
}

// =============================================================================
// Helper Types & Constants
// =============================================================================

/**
 * Map status values to their counter field names
 * This prevents bugs like 'checked_inCount' (wrong) vs 'checkedInCount' (correct)
 */
export const STATUS_TO_COUNTER_FIELD: Record<ParticipantStatus, string> = {
  expected: 'expectedCount',
  cancelled: 'cancelledCount',
  checked_in: 'checkedInCount',
  no_show: 'noShowCount',
};

/**
 * Occurrence lookahead window (8 weeks)
 */
export const OCCURRENCE_LOOKAHEAD_DAYS = 56;

/**
 * Platform fee percentage (10%)
 */
export const PLATFORM_FEE_PERCENT = 0.10;

/**
 * Stripe fee percentage (2.9%)
 */
export const STRIPE_FEE_PERCENT = 0.029;

/**
 * Stripe fixed fee in cents ($0.30)
 */
export const STRIPE_FIXED_FEE_CENTS = 30;

// =============================================================================
// Credit Calculation Helpers
// =============================================================================

/**
 * Calculate credit amount (what organizer received after fees)
 * V1 uses ESTIMATED net, not true net from Stripe.
 *
 * @param billingAmount - Amount in cents (what organizer configured)
 * @param feesPaidBy - Who pays the fees
 * @returns Credit amount in cents
 */
export function calculateCreditAmount(
  billingAmount: number,
  feesPaidBy: 'organizer' | 'player'
): number {
  const stripeFee = Math.round(billingAmount * STRIPE_FEE_PERCENT) + STRIPE_FIXED_FEE_CENTS;
  const platformFee = Math.round(billingAmount * PLATFORM_FEE_PERCENT);

  if (feesPaidBy === 'organizer') {
    return billingAmount - stripeFee - platformFee;
  } else {
    // Player paid fees on top, so organizer received full amount
    return billingAmount;
  }
}

/**
 * Calculate what player actually pays when they cover fees (gross-up)
 *
 * @param billingAmount - Amount in cents (what organizer wants to receive)
 * @param feesPaidBy - Who pays the fees
 * @returns Charged amount in cents
 */
export function calculateChargedAmount(
  billingAmount: number,
  feesPaidBy: 'organizer' | 'player'
): number {
  if (feesPaidBy === 'organizer') {
    return billingAmount; // Player pays exactly the configured price
  }

  // Player pays fees: gross-up so organizer receives billingAmount after fees
  // Formula: chargedAmount = (billingAmount + 30) / (1 - 0.029 - 0.10)
  const divisor = 1 - STRIPE_FEE_PERCENT - PLATFORM_FEE_PERCENT;
  const chargedAmount = Math.ceil((billingAmount + STRIPE_FIXED_FEE_CENTS) / divisor);
  return chargedAmount;
}

// =============================================================================
// Callable Function Input/Output Types
// =============================================================================

// stripe_createStandingMeetupSubscription
export interface CreateSubscriptionInput {
  standingMeetupId: string;
  paymentMethodId: string; // From Stripe.js
}

export interface CreateSubscriptionOutput {
  subscriptionId: string; // Firestore doc ID
  stripeSubscriptionId: string; // Stripe subscription ID
  currentPeriodEnd: number; // Unix timestamp
  firstOccurrenceDate: string; // "YYYY-MM-DD"
}

// stripe_cancelStandingMeetupSubscription
export interface CancelSubscriptionInput {
  subscriptionId: string; // Firestore doc ID (standingMeetupId_userId)
}

export interface CancelSubscriptionOutput {
  cancelledAt: number;
  effectiveEndDate: number; // currentPeriodEnd (subscription continues until then)
}

// standingMeetup_ensureOccurrences
export interface EnsureOccurrencesInput {
  standingMeetupId: string;
}

export interface EnsureOccurrencesOutput {
  created: string[]; // List of dateIds created (e.g., ["2025-02-10", "2025-02-17"])
  skippedCancelled: string[]; // List of cancelled sessions that were NOT auto-revived (safeguard)
  existing: number; // Count of occurrences that already existed
}

// standingMeetup_checkIn
export interface CheckInInput {
  standingMeetupId: string;
  dateId: string; // "YYYY-MM-DD"
  token: string; // From QR code
}

export interface CheckInOutput {
  success: true;
  checkedInAt: number;
}

// standingMeetup_cancelAttendance
export interface CancelAttendanceInput {
  standingMeetupId: string;
  dateId: string; // "YYYY-MM-DD"
}

export interface CancelAttendanceOutput {
  credited: boolean; // true if credit was issued
  creditAmount?: number; // cents, only if credited
  reason: 'before_cutoff' | 'after_cutoff';
}

// =============================================================================
// Standing Meetup Registration (MVP)
// =============================================================================

/**
 * Standing Meetup Registration - Player registration record (MVP Hybrid)
 * Collection: standingMeetupRegistrations/{registrationId}
 *
 * MVP Hybrid model:
 * - Season Pass: Pay once for all remaining sessions (discounted)
 * - Pick-and-Pay: Select specific sessions, pay per session
 *
 * CRITICAL Payment Rules:
 * - Stripe: Registration created ONLY on webhook success (no pending)
 * - Bank Transfer: Pending registration created immediately, player NOT added to sessions until confirmed
 */
export interface StandingMeetupRegistration {
  id: string;                    // {standingMeetupId}_{odUserId}
  standingMeetupId: string;
  clubId: string;
  odUserId: string;
  userName: string;
  userEmail: string;

  // Registration type (Hybrid model)
  registrationType: 'season_pass' | 'pick_and_pay';

  // For pick_and_pay: list of selected session IDs (occurrence dateIds)
  selectedSessionIds?: string[];  // e.g., ['2025-02-03', '2025-02-10', '2025-02-17']

  // Client-side only: When combining multiple registrations, track paid vs pending separately
  // These are populated by subscribeToUserRegistrationForMeetup when merging registrations
  paidSessionIds?: string[];      // Sessions from paid registrations
  pendingSessionIds?: string[];   // Sessions from pending registrations

  // Payment
  paymentStatus: 'pending' | 'paid';
  paymentMethod: 'stripe' | 'bank_transfer';
  amount: number;                // Total amount paid (in cents)
  sessionCount: number;          // Number of sessions (remaining for season_pass, selected for pick_and_pay)
  currency: 'nzd' | 'aud' | 'usd';
  paidAt?: number;

  // Stripe-only fields (populated only after webhook success)
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;

  // Bank transfer reference (for organizer to verify)
  bankTransferReference?: string;

  // Status
  status: 'active' | 'cancelled';
  cancelledAt?: number;

  createdAt: number;
  updatedAt: number;
}

// =============================================================================
// Registration Callable Function Types
// =============================================================================

// standingMeetup_register (Hybrid model)
export interface RegisterInput {
  standingMeetupId: string;
  registrationType: 'season_pass' | 'pick_and_pay';
  selectedSessionIds?: string[];  // Required if pick_and_pay
  paymentMethod: 'stripe' | 'bank_transfer';
  returnUrl: string;  // For Stripe redirect after checkout
}

// Stripe output - NO registration created yet (created on webhook)
export interface RegisterOutputStripe {
  checkoutUrl: string;
}

// Bank output - Registration created in pending state
export interface RegisterOutputBank {
  registrationId: string;
  bankDetails: {
    bankName: string;
    accountName: string;
    accountNumber: string;
    reference?: string;
  };
}

// standingMeetup_confirmBankPayment (organizer confirms bank transfer)
export interface ConfirmBankPaymentInput {
  registrationId: string;
}

export interface ConfirmBankPaymentOutput {
  success: true;
  paidAt: number;
  addedToSessions: string[];  // List of occurrence dateIds player was added to
}

// standingMeetup_cancelUnpaidBankRegistration (organizer OR player)
export interface CancelUnpaidBankRegistrationInput {
  registrationId: string;
}

export interface CancelUnpaidBankRegistrationOutput {
  success: true;
  cancelledAt: number;
}

// standingMeetup_unregister (cancel paid registration)
export interface UnregisterInput {
  registrationId: string;
}

export interface UnregisterOutput {
  success: true;
  cancelledAt: number;
  removedFromSessions: string[];  // List of occurrence dateIds player was removed from
}

// =============================================================================
// Error Codes
// =============================================================================

export type StandingMeetupErrorCode =
  | 'CAPACITY_FULL'
  | 'SESSIONS_FULL'              // All selected sessions are at capacity
  | 'SOME_SESSIONS_FULL'         // Some selected sessions are full (pick-and-pay)
  | 'NO_SESSIONS_AVAILABLE'      // No future sessions with capacity (season pass)
  | 'ALREADY_SUBSCRIBED'
  | 'ALREADY_REGISTERED'
  | 'REGISTRATION_NOT_FOUND'
  | 'MEETUP_NOT_FOUND'
  | 'MEETUP_NOT_ACTIVE'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_NOT_PENDING'
  | 'PAYMENT_METHOD_NOT_ENABLED' // Stripe or bank not enabled
  | 'SUBSCRIPTION_NOT_FOUND'
  | 'NOT_OWNER'
  | 'ALREADY_CANCELLED'
  | 'NOT_AUTHORIZED'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'OCCURRENCE_NOT_FOUND'
  | 'NOT_PARTICIPANT'
  | 'ALREADY_CHECKED_IN'
  | 'SESSION_NOT_ACTIVE'
  | 'OCCURRENCE_PASSED'
  | 'INVALID_REGISTRATION_TYPE'  // registrationType must be season_pass or pick_and_pay
  | 'MISSING_SESSION_SELECTION'; // pick_and_pay requires selectedSessionIds

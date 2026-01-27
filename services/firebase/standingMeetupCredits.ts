/**
 * Standing Meetup Credits Service
 *
 * Credit issuance for standing meetups. Uses the existing wallet system.
 * All credit writes go through Cloud Functions for consistency.
 *
 * @version 07.53
 * @file services/firebase/standingMeetupCredits.ts
 */

import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  limit,
} from 'firebase/firestore';
import { db } from './index';
import {
  calculateCreditAmount,
  StandingMeetup,
} from '../../types/standingMeetup';

// =============================================================================
// Types
// =============================================================================

export interface StandingMeetupCreditTransaction {
  id: string;
  userId: string;
  clubId: string;
  amount: number;
  type: 'credit';
  referenceType: 'standing_meetup_credit';
  referenceId: string; // standingMeetupId
  metadata: {
    type: 'standing_meetup_credit';
    standingMeetupId: string;
    occurrenceId: string;
    reason: 'organizer_cancelled' | 'player_cancelled_before_cutoff';
  };
  createdAt: number;
}

// =============================================================================
// Credit Calculation (Client-side preview)
// =============================================================================

/**
 * Calculate the credit amount for a standing meetup
 * This is used for UI display - actual credit issuance happens in Cloud Functions
 */
export function calculateMeetupCreditAmount(meetup: StandingMeetup): number {
  return calculateCreditAmount(meetup.billing.amount, meetup.billing.feesPaidBy);
}

/**
 * Check if a player is eligible for credit based on cancellation timing
 *
 * @param occurrenceStartAt - Occurrence start timestamp
 * @param cancellationCutoffHours - Hours before session that cutoff applies
 * @returns Whether player is eligible for credit
 */
export function isEligibleForCredit(
  occurrenceStartAt: number,
  cancellationCutoffHours: number
): boolean {
  const cutoffTimestamp =
    occurrenceStartAt - cancellationCutoffHours * 60 * 60 * 1000;
  return Date.now() <= cutoffTimestamp;
}

/**
 * Get time until cancellation cutoff
 *
 * @param occurrenceStartAt - Occurrence start timestamp
 * @param cancellationCutoffHours - Hours before session that cutoff applies
 * @returns Milliseconds until cutoff (negative if past cutoff)
 */
export function getTimeUntilCutoff(
  occurrenceStartAt: number,
  cancellationCutoffHours: number
): number {
  const cutoffTimestamp =
    occurrenceStartAt - cancellationCutoffHours * 60 * 60 * 1000;
  return cutoffTimestamp - Date.now();
}

/**
 * Format time until cutoff for display
 */
export function formatTimeUntilCutoff(
  occurrenceStartAt: number,
  cancellationCutoffHours: number
): string {
  const msUntilCutoff = getTimeUntilCutoff(occurrenceStartAt, cancellationCutoffHours);

  if (msUntilCutoff <= 0) {
    return 'Cutoff passed';
  }

  const hours = Math.floor(msUntilCutoff / (1000 * 60 * 60));
  const minutes = Math.floor((msUntilCutoff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? 's' : ''} until cutoff`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m until cutoff`;
  }

  return `${minutes} minutes until cutoff`;
}

// =============================================================================
// Credit History (Read from wallet transactions)
// =============================================================================

/**
 * Get credit transactions for a user at a specific club
 * Filters wallet transactions to only show standing meetup credits
 */
export async function getUserStandingMeetupCredits(
  userId: string,
  clubId: string,
  options?: { limit?: number }
): Promise<StandingMeetupCreditTransaction[]> {
  const walletId = `${userId}_${clubId}`;

  let q = query(
    collection(db, 'walletTransactions'),
    where('walletId', '==', walletId),
    where('metadata.type', '==', 'standing_meetup_credit'),
    orderBy('createdAt', 'desc')
  );

  if (options?.limit) {
    q = query(q, limit(options.limit));
  }

  const snapshot = await getDocs(q);
  return snapshot.docs.map(
    (doc) => ({ id: doc.id, ...doc.data() } as StandingMeetupCreditTransaction)
  );
}

/**
 * Get total credits received for a specific standing meetup subscription
 */
export async function getSubscriptionTotalCredits(
  userId: string,
  clubId: string,
  standingMeetupId: string
): Promise<number> {
  const walletId = `${userId}_${clubId}`;

  const q = query(
    collection(db, 'walletTransactions'),
    where('walletId', '==', walletId),
    where('metadata.type', '==', 'standing_meetup_credit'),
    where('metadata.standingMeetupId', '==', standingMeetupId)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0);
}

// =============================================================================
// Credit Display Helpers
// =============================================================================

/**
 * Format credit amount for display
 *
 * @param amountCents - Amount in cents
 * @param currency - Currency code
 * @returns Formatted string like "$12.76"
 */
export function formatCreditAmount(
  amountCents: number,
  currency: 'nzd' | 'aud' | 'usd' = 'nzd'
): string {
  const currencySymbols: Record<string, string> = {
    nzd: '$',
    aud: '$',
    usd: '$',
  };

  const symbol = currencySymbols[currency] || '$';
  const dollars = (amountCents / 100).toFixed(2);
  return `${symbol}${dollars}`;
}

/**
 * Get credit reason display text
 */
export function getCreditReasonText(
  reason: 'organizer_cancelled' | 'player_cancelled_before_cutoff'
): string {
  switch (reason) {
    case 'organizer_cancelled':
      return 'Session cancelled by organizer';
    case 'player_cancelled_before_cutoff':
      return 'You cancelled before cutoff';
    default:
      return 'Credit issued';
  }
}

// =============================================================================
// Credit Estimation for UI
// =============================================================================

/**
 * Estimate total credits to be issued when organizer cancels a session
 *
 * @param creditAmount - Credit amount per participant in cents
 * @param expectedCount - Number of expected participants
 * @param checkedInCount - Number of checked-in participants
 * @returns Total credits to be issued in cents
 */
export function estimateOrganizerCancelCredits(
  creditAmount: number,
  expectedCount: number,
  checkedInCount: number
): number {
  // Credits go to expected + checked_in participants
  const eligibleCount = expectedCount + checkedInCount;
  return creditAmount * eligibleCount;
}

/**
 * Meetup Credits & Cancellation Policy Service
 *
 * Handles refund deadline calculations and cancellation policy logic.
 * Adapted from standingMeetupCredits.ts patterns.
 *
 * @version 07.61
 * @file services/firebase/meetupCredits.ts
 */

import type { Meetup, MeetupCancellationPolicy } from '../../types';

/**
 * Check if a cancellation is eligible for a refund based on the deadline
 */
export function isEligibleForRefund(
  meetupDate: number,
  cancellationPolicy?: MeetupCancellationPolicy
): boolean {
  if (!cancellationPolicy) return false;

  const now = Date.now();
  const deadlineMs = cancellationPolicy.refundDeadlineHours * 60 * 60 * 1000;
  const refundDeadline = meetupDate - deadlineMs;

  return now < refundDeadline;
}

/**
 * Get milliseconds remaining until the refund deadline
 * Returns 0 if deadline has passed
 */
export function getTimeUntilDeadline(
  meetupDate: number,
  cancellationPolicy?: MeetupCancellationPolicy
): number {
  if (!cancellationPolicy) return 0;

  const deadlineMs = cancellationPolicy.refundDeadlineHours * 60 * 60 * 1000;
  const refundDeadline = meetupDate - deadlineMs;
  const remaining = refundDeadline - Date.now();

  return Math.max(0, remaining);
}

/**
 * Format time remaining until refund deadline as human-readable string
 */
export function formatTimeUntilDeadline(
  meetupDate: number,
  cancellationPolicy?: MeetupCancellationPolicy
): string {
  const remaining = getTimeUntilDeadline(meetupDate, cancellationPolicy);

  if (remaining <= 0) return 'Refund deadline passed';

  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

  if (hours >= 48) {
    const days = Math.floor(hours / 24);
    return `${days} days left to cancel for refund`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m left to cancel for refund`;
  }

  return `${minutes} minutes left to cancel for refund`;
}

/**
 * Get cancellation message based on policy and timing
 */
export function getCancellationMessage(meetup: Meetup): string {
  const policy = meetup.cancellationPolicy;

  if (!meetup.pricing?.enabled) {
    return 'You can cancel at any time.';
  }

  if (!policy) {
    return 'No refund policy set. Contact the organizer for refund questions.';
  }

  const eligible = isEligibleForRefund(meetup.date, policy);

  if (eligible) {
    const timeLeft = formatTimeUntilDeadline(meetup.date, policy);
    if (policy.creditInsteadOfRefund) {
      return `Cancel now to receive a wallet credit. ${timeLeft}.`;
    }
    return `Cancel now for a full refund. ${timeLeft}.`;
  }

  if (policy.noRefundAfterDeadline) {
    return 'Refund deadline has passed. No refund will be issued.';
  }

  return 'Refund deadline has passed.';
}

/**
 * Get the refund deadline timestamp
 */
export function getRefundDeadline(
  meetupDate: number,
  cancellationPolicy?: MeetupCancellationPolicy
): number | null {
  if (!cancellationPolicy) return null;

  const deadlineMs = cancellationPolicy.refundDeadlineHours * 60 * 60 * 1000;
  return meetupDate - deadlineMs;
}

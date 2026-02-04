/**
 * CheckInPage - Player self-check-in for standing meetup sessions
 *
 * Accessed via QR code scan at meetup sessions.
 * URL format: /#/checkin/:standingMeetupId/:occurrenceId
 *
 * Features:
 * - Auto check-in for registered players
 * - Quick pay & register for unregistered members (Phase 7)
 *
 * @version 07.60
 * @file pages/CheckInPage.tsx
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { httpsCallable, getFunctions, connectFunctionsEmulator } from '@firebase/functions';
import { getApp } from '@firebase/app';
import type { CheckInSelfInput, CheckInSelfOutput, StandingMeetupErrorCode } from '../types/standingMeetup';
import { getStandingMeetup, getOccurrence } from '../services/firebase/standingMeetups';
import type { StandingMeetup, MeetupOccurrence } from '../types/standingMeetup';

// Get functions instance for australia-southeast1 region (where standing meetup functions are deployed)
const functionsAU = getFunctions(getApp(), 'australia-southeast1');

// Connect to emulator if in development mode
if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  try {
    connectFunctionsEmulator(functionsAU, '127.0.0.1', 5001);
  } catch {
    // Already connected, ignore
  }
}

type CheckInState = 'loading' | 'success' | 'error' | 'not_registered';

interface CheckInResult {
  sessionDate: string;
  meetupTitle: string;
  checkedInAt: number;
}

interface CheckInError {
  code: StandingMeetupErrorCode | 'UNKNOWN';
  message: string;
}

interface SessionDetails {
  meetup: StandingMeetup;
  occurrence: MeetupOccurrence;
}

const ERROR_MESSAGES: Record<StandingMeetupErrorCode | 'UNKNOWN', string> = {
  NOT_PARTICIPANT: "You're not registered for this session",
  ALREADY_CHECKED_IN: "You're already checked in",
  SESSION_ALREADY_CLOSED: "This session has been closed",
  SESSION_NOT_ACTIVE: "This session is not active yet",
  OCCURRENCE_NOT_FOUND: "Session not found",
  MEETUP_NOT_FOUND: "Meetup not found",
  MEETUP_NOT_ACTIVE: "This meetup is not active",
  NOT_AUTHORIZED: "You are not authorized to check in",
  TOKEN_EXPIRED: "Check-in link has expired",
  TOKEN_INVALID: "Invalid check-in link",
  OCCURRENCE_PASSED: "This session has already ended",
  CAPACITY_FULL: "This session is at capacity",
  SESSIONS_FULL: "All sessions are full",
  SOME_SESSIONS_FULL: "Some sessions are full",
  NO_SESSIONS_AVAILABLE: "No sessions available",
  ALREADY_SUBSCRIBED: "Already subscribed",
  ALREADY_REGISTERED: "Already registered",
  REGISTRATION_NOT_FOUND: "Registration not found",
  PAYMENT_FAILED: "Payment failed",
  PAYMENT_NOT_PENDING: "Payment not pending",
  PAYMENT_METHOD_NOT_ENABLED: "Payment method not enabled",
  SUBSCRIPTION_NOT_FOUND: "Subscription not found",
  NOT_OWNER: "Not authorized",
  ALREADY_CANCELLED: "Already cancelled",
  INVALID_REGISTRATION_TYPE: "Invalid registration type",
  MISSING_SESSION_SELECTION: "Missing session selection",
  NOT_CLUB_ADMIN: "Not authorized",
  GUEST_NAME_REQUIRED: "Guest name required",
  INVALID_AMOUNT: "Invalid amount",
  UNKNOWN: "Something went wrong. Please try again.",
};

export const CheckInPage: React.FC = () => {
  const { standingMeetupId, occurrenceId } = useParams<{
    standingMeetupId: string;
    occurrenceId: string;
  }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  // Check if returning from successful payment
  const isPaymentReturn = searchParams.get('registered') === 'success';

  const [state, setState] = useState<CheckInState>('loading');
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [error, setError] = useState<CheckInError | null>(null);
  const [sessionDetails, setSessionDetails] = useState<SessionDetails | null>(null);
  const [isPaymentLoading, setIsPaymentLoading] = useState(false);

  // Track if we've already attempted check-in to prevent double calls
  const hasAttemptedRef = useRef(false);

  useEffect(() => {
    const performCheckIn = async (retryCount = 0) => {
      // Prevent double execution (unless retrying)
      if (hasAttemptedRef.current && retryCount === 0) return;
      hasAttemptedRef.current = true;

      // Validate params
      if (!standingMeetupId || !occurrenceId) {
        setError({ code: 'UNKNOWN', message: 'Invalid check-in link' });
        setState('error');
        return;
      }

      // User must be logged in (route should be protected, but double-check)
      if (!currentUser) {
        setError({ code: 'NOT_AUTHORIZED', message: 'Please log in to check in' });
        setState('error');
        return;
      }

      try {
        const checkInFn = httpsCallable<CheckInSelfInput, CheckInSelfOutput>(
          functionsAU,
          'standingMeetup_checkInSelf'
        );

        const response = await checkInFn({
          standingMeetupId,
          occurrenceId,
        });

        setResult({
          sessionDate: response.data.sessionDate,
          meetupTitle: response.data.meetupTitle,
          checkedInAt: response.data.checkedInAt,
        });
        setState('success');
      } catch (err: unknown) {
        console.error('Check-in failed:', err);

        // Extract error code from Firebase Functions error
        let errorCode: StandingMeetupErrorCode | 'UNKNOWN' = 'UNKNOWN';
        let errorMessage = ERROR_MESSAGES.UNKNOWN;

        if (err && typeof err === 'object' && 'code' in err) {
          const firebaseError = err as { code: string; message?: string };
          // Firebase Functions errors have format: functions/error-code
          // The actual error code is in the message or details
          if ('details' in firebaseError && typeof firebaseError.details === 'object') {
            const details = firebaseError.details as { code?: string };
            if (details.code && details.code in ERROR_MESSAGES) {
              errorCode = details.code as StandingMeetupErrorCode;
              errorMessage = ERROR_MESSAGES[errorCode];
            }
          } else if (firebaseError.message) {
            // Try to extract error code from message
            const knownCodes = Object.keys(ERROR_MESSAGES) as (StandingMeetupErrorCode | 'UNKNOWN')[];
            for (const code of knownCodes) {
              if (firebaseError.message.includes(code)) {
                errorCode = code;
                errorMessage = ERROR_MESSAGES[code];
                break;
              }
            }
          }
        }

        // Special handling for ALREADY_CHECKED_IN when returning from payment
        // The webhook already checked them in, so this is actually SUCCESS!
        if (errorCode === 'ALREADY_CHECKED_IN' && isPaymentReturn) {
          console.log('Payment return: already checked in by webhook - treating as success');
          // Fetch session details to show success message
          try {
            const [meetup, occurrence] = await Promise.all([
              getStandingMeetup(standingMeetupId),
              getOccurrence(standingMeetupId, occurrenceId),
            ]);

            if (meetup && occurrence) {
              setResult({
                sessionDate: occurrence.date,
                meetupTitle: meetup.title,
                checkedInAt: Date.now(),
              });
              setState('success');
              return;
            }
          } catch (fetchErr) {
            console.error('Failed to fetch session details for success display:', fetchErr);
          }
          // Even if fetch fails, show success since they ARE checked in
          setResult({
            sessionDate: occurrenceId,
            meetupTitle: 'Session',
            checkedInAt: Date.now(),
          });
          setState('success');
          return;
        }

        // Special handling for NOT_PARTICIPANT
        if (errorCode === 'NOT_PARTICIPANT') {
          // If returning from payment, the webhook may not have finished yet
          // Retry a few times with delay
          if (isPaymentReturn && retryCount < 3) {
            console.log(`Payment return, retrying check-in (attempt ${retryCount + 1}/3)...`);
            await new Promise(resolve => setTimeout(resolve, 1500));
            return performCheckIn(retryCount + 1);
          }

          // After retries or not a payment return - show pay & register option
          try {
            // Fetch session details to show payment option
            const [meetup, occurrence] = await Promise.all([
              getStandingMeetup(standingMeetupId),
              getOccurrence(standingMeetupId, occurrenceId),
            ]);

            if (meetup && occurrence) {
              setSessionDetails({ meetup, occurrence });
              setState('not_registered');
              return;
            }
          } catch (fetchErr) {
            console.error('Failed to fetch session details:', fetchErr);
          }
        }

        setError({ code: errorCode, message: errorMessage });
        setState('error');
      }
    };

    // Only attempt check-in when user is available
    if (currentUser !== undefined) {
      performCheckIn();
    }
  }, [standingMeetupId, occurrenceId, currentUser, isPaymentReturn]);

  const handleViewMeetup = () => {
    if (standingMeetupId) {
      navigate(`/weekly-meetup/${standingMeetupId}`);
    }
  };

  const handleGoBack = () => {
    navigate(-1);
  };

  const handleGoHome = () => {
    navigate('/');
  };

  // Handle quick pay & register for unregistered members
  const handlePayAndRegister = useCallback(async () => {
    if (!sessionDetails || !standingMeetupId || !occurrenceId || !currentUser) return;

    setIsPaymentLoading(true);
    try {
      const createCheckoutFn = httpsCallable<
        {
          standingMeetupId: string;
          occurrenceId: string;
          successUrl: string;
          cancelUrl: string;
        },
        { checkoutUrl: string }
      >(functionsAU, 'standingMeetup_createQuickRegisterCheckoutSession');

      const currentUrl = window.location.href;
      const successUrl = `${window.location.origin}/#/checkin/${standingMeetupId}/${occurrenceId}?registered=success`;
      const cancelUrl = currentUrl;

      const response = await createCheckoutFn({
        standingMeetupId,
        occurrenceId,
        successUrl,
        cancelUrl,
      });

      // Redirect to Stripe Checkout
      window.location.href = response.data.checkoutUrl;
    } catch (err) {
      console.error('Failed to create checkout session:', err);
      alert('Failed to start payment. Please try again or ask the organizer for help.');
      setIsPaymentLoading(false);
    }
  }, [sessionDetails, standingMeetupId, occurrenceId, currentUser]);

  // Loading state
  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
        <div className="bg-gray-900 rounded-2xl p-8 border border-gray-800 max-w-md w-full text-center">
          <div className="w-16 h-16 mx-auto mb-6 relative">
            <div className="absolute inset-0 border-4 border-gray-700 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-lime-500 rounded-full border-t-transparent animate-spin"></div>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Checking you in...</h1>
          <p className="text-gray-400">Please wait a moment</p>
        </div>
      </div>
    );
  }

  // Success state
  if (state === 'success' && result) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
        <div className="bg-gray-900 rounded-2xl p-8 border border-gray-800 max-w-md w-full text-center">
          {/* Success checkmark */}
          <div className="w-20 h-20 mx-auto mb-6 bg-lime-500/20 rounded-full flex items-center justify-center">
            <svg
              className="w-12 h-12 text-lime-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-lime-400 mb-2">You're checked in!</h1>

          {/* Session details */}
          <div className="bg-gray-800 rounded-xl p-4 mt-6 mb-6 border border-gray-700">
            <p className="text-white font-semibold text-lg">{result.meetupTitle}</p>
            <p className="text-gray-400 mt-1">{result.sessionDate}</p>
          </div>

          <p className="text-gray-400 text-sm mb-8">
            Checked in at {new Date(result.checkedInAt).toLocaleTimeString('en-NZ', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            })}
          </p>

          {/* Action button */}
          <button
            onClick={handleViewMeetup}
            className="w-full py-3 px-4 bg-lime-500 hover:bg-lime-400 text-gray-900 font-semibold rounded-xl transition-colors"
          >
            View Meetup
          </button>
        </div>
      </div>
    );
  }

  // Not registered state - show pay & register option
  if (state === 'not_registered' && sessionDetails) {
    const { meetup, occurrence } = sessionDetails;
    const price = meetup.billing.perSessionAmount;
    const currency = meetup.billing.currency.toUpperCase();
    const currencySymbol = currency === 'NZD' ? 'NZ$' : currency === 'AUD' ? 'A$' : '$';

    // Format session date
    const sessionDate = new Date(occurrence.date + 'T12:00:00');
    const formattedDate = sessionDate.toLocaleDateString('en-NZ', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    // Format time
    const formatTime = (time: string) => {
      const [hours, minutes] = time.split(':').map(Number);
      const period = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 || 12;
      return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
    };

    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
        <div className="bg-gray-900 rounded-2xl p-8 border border-gray-800 max-w-md w-full text-center">
          {/* Info icon */}
          <div className="w-20 h-20 mx-auto mb-6 bg-amber-500/20 rounded-full flex items-center justify-center">
            <svg
              className="w-12 h-12 text-amber-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-amber-400 mb-2">Not Registered</h1>
          <p className="text-gray-400 mb-6">You're not registered for this session</p>

          {/* Session details */}
          <div className="bg-gray-800 rounded-xl p-4 mb-6 border border-gray-700 text-left">
            <p className="text-white font-semibold text-lg">{meetup.title}</p>
            <p className="text-gray-400 mt-1">{formattedDate}</p>
            <p className="text-gray-500 text-sm">
              {formatTime(occurrence.startTime)} - {formatTime(occurrence.endTime)}
            </p>
            <div className="mt-3 pt-3 border-t border-gray-700">
              <p className="text-lime-400 font-bold text-2xl">
                {currencySymbol}{(price / 100).toFixed(2)}
              </p>
            </div>
          </div>

          {/* Pay & Register button */}
          <button
            onClick={handlePayAndRegister}
            disabled={isPaymentLoading}
            className="w-full py-4 px-4 bg-lime-500 hover:bg-lime-400 disabled:bg-lime-500/50 text-gray-900 font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {isPaymentLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-gray-900 border-t-transparent rounded-full animate-spin"></div>
                <span>Starting payment...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                  />
                </svg>
                <span>Pay & Register Now ({currencySymbol}{(price / 100).toFixed(2)})</span>
              </>
            )}
          </button>

          {/* Help text */}
          <p className="text-gray-500 text-sm mt-4">
            Already paid another way? Ask the organizer to check you in manually.
          </p>

          {/* Secondary actions */}
          <div className="mt-6 space-y-2">
            <button
              onClick={handleViewMeetup}
              className="w-full py-2 px-4 text-gray-400 hover:text-gray-300 font-medium transition-colors"
            >
              View Meetup Details
            </button>
            <button
              onClick={handleGoHome}
              className="w-full py-2 px-4 text-gray-500 hover:text-gray-400 font-medium transition-colors text-sm"
            >
              Go to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl p-8 border border-gray-800 max-w-md w-full text-center">
        {/* Error icon */}
        <div className="w-20 h-20 mx-auto mb-6 bg-red-500/20 rounded-full flex items-center justify-center">
          <svg
            className="w-12 h-12 text-red-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-red-400 mb-2">Check-in Failed</h1>

        <p className="text-gray-300 mt-4 mb-8">
          {error?.message || ERROR_MESSAGES.UNKNOWN}
        </p>

        {/* Action buttons */}
        <div className="space-y-3">
          {standingMeetupId && (
            <button
              onClick={handleViewMeetup}
              className="w-full py-3 px-4 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-xl transition-colors"
            >
              View Meetup
            </button>
          )}
          <button
            onClick={handleGoBack}
            className="w-full py-3 px-4 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-xl transition-colors border border-gray-700"
          >
            Go Back
          </button>
          <button
            onClick={handleGoHome}
            className="w-full py-3 px-4 text-gray-400 hover:text-gray-300 font-medium transition-colors"
          >
            Go to Home
          </button>
        </div>
      </div>
    </div>
  );
};

export default CheckInPage;

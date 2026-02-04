/**
 * GuestPayPage - Guest card payment for walk-ins at meetups
 *
 * This page is PUBLIC - no login required.
 * Accessed via QR code scan at the door: /#/guest-pay/:standingMeetupId/:occurrenceId
 *
 * Flow:
 * 1. Guest scans QR code
 * 2. Page loads meetup details and per-session price
 * 3. Guest enters name + email
 * 4. Guest clicks "Pay Now"
 * 5. Cloud function creates Stripe Checkout session
 * 6. Guest redirected to Stripe Checkout
 * 7. On success, redirected back with ?success=true
 * 8. Success message displayed
 *
 * @version 07.58
 * @file pages/GuestPayPage.tsx
 */

import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { httpsCallable, getFunctions, connectFunctionsEmulator } from '@firebase/functions';
import { getApp } from '@firebase/app';
import { doc, getDoc } from '@firebase/firestore';
import { db } from '../services/firebase';
import type {
  StandingMeetup,
  CreateGuestCheckoutSessionInput,
  CreateGuestCheckoutSessionOutput,
} from '../types/standingMeetup';

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

export const GuestPayPage: React.FC = () => {
  const { standingMeetupId, occurrenceId } = useParams<{
    standingMeetupId: string;
    occurrenceId: string;
  }>();
  const [searchParams] = useSearchParams();
  const isSuccess = searchParams.get('success') === 'true';

  // State
  const [meetup, setMeetup] = useState<StandingMeetup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [processing, setProcessing] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Fetch standing meetup data
  useEffect(() => {
    const fetchMeetup = async () => {
      if (!standingMeetupId) {
        setError('Invalid link - missing meetup ID');
        setLoading(false);
        return;
      }

      try {
        const meetupRef = doc(db, 'standingMeetups', standingMeetupId);
        const meetupSnap = await getDoc(meetupRef);

        if (!meetupSnap.exists()) {
          setError('Meetup not found');
          setLoading(false);
          return;
        }

        const meetupData = { id: meetupSnap.id, ...meetupSnap.data() } as StandingMeetup;

        // Verify meetup is active
        if (meetupData.status !== 'active') {
          setError('This meetup is not currently accepting registrations');
          setLoading(false);
          return;
        }

        // Verify card payments are enabled
        if (!meetupData.paymentMethods?.acceptCardPayments) {
          setError('Card payments are not enabled for this meetup');
          setLoading(false);
          return;
        }

        setMeetup(meetupData);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching meetup:', err);
        setError('Failed to load meetup details');
        setLoading(false);
      }
    };

    fetchMeetup();
  }, [standingMeetupId]);

  const formatCurrency = (cents: number, currency: string): string => {
    const symbol = currency === 'usd' ? 'US$' : currency === 'aud' ? 'A$' : '$';
    return `${symbol}${(cents / 100).toFixed(2)}`;
  };

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validate inputs
    if (!name.trim()) {
      setFormError('Please enter your name');
      return;
    }

    if (!email.trim()) {
      setFormError('Please enter your email');
      return;
    }

    if (!validateEmail(email)) {
      setFormError('Please enter a valid email address');
      return;
    }

    if (!standingMeetupId || !occurrenceId || !meetup) {
      setFormError('Invalid session information');
      return;
    }

    setProcessing(true);

    try {
      const createCheckoutSession = httpsCallable<
        CreateGuestCheckoutSessionInput,
        CreateGuestCheckoutSessionOutput
      >(functionsAU, 'standingMeetup_createGuestCheckoutSession');

      // Build return URL - current page with success param
      const returnUrl = `${window.location.origin}${window.location.pathname}${window.location.hash.split('?')[0]}?success=true`;

      const result = await createCheckoutSession({
        standingMeetupId,
        occurrenceId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        returnUrl,
      });

      // Redirect to Stripe Checkout
      window.location.href = result.data.checkoutUrl;
    } catch (err: any) {
      console.error('Error creating checkout session:', err);
      const errorMessage = err.message || 'Payment setup failed. Please try again.';
      setFormError(errorMessage);
      setProcessing(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-lime-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !meetup) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-800 rounded-xl p-8 border border-gray-700 text-center">
          <div className="w-16 h-16 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Unable to Load</h2>
          <p className="text-gray-400 mb-6">{error || 'Something went wrong'}</p>
          <p className="text-sm text-gray-500">
            Please check the QR code and try again, or contact the organizer.
          </p>
        </div>
      </div>
    );
  }

  // Success state
  if (isSuccess) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-800 rounded-xl p-8 border border-lime-500/30 text-center">
          <div className="w-20 h-20 bg-lime-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-lime-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Payment Successful!</h1>
          <p className="text-lime-400 text-lg mb-4">You're checked in.</p>
          <div className="bg-gray-900/50 rounded-lg p-4 mb-6">
            <p className="text-gray-300 font-medium">{meetup.title}</p>
            <p className="text-gray-500 text-sm">{meetup.clubName}</p>
          </div>
          <p className="text-gray-400 text-sm">
            A receipt will be sent to your email. Enjoy your session!
          </p>
        </div>
      </div>
    );
  }

  // Payment form
  const perSessionAmount = meetup.billing.perSessionAmount;
  const currency = meetup.billing.currency;

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white mb-1">{meetup.title}</h1>
          <p className="text-gray-400">{meetup.clubName}</p>
          <p className="text-gray-500 text-sm mt-1">{meetup.locationName}</p>
        </div>

        {/* Payment Card */}
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          {/* Amount Display */}
          <div className="text-center mb-6 pb-6 border-b border-gray-700">
            <p className="text-gray-400 text-sm mb-1">Guest Session Fee</p>
            <p className="text-4xl font-bold text-lime-400">
              {formatCurrency(perSessionAmount, currency)}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name Input */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
                Your Name
              </label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your full name"
                disabled={processing}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500 disabled:opacity-50"
                autoComplete="name"
              />
            </div>

            {/* Email Input */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                disabled={processing}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500 disabled:opacity-50"
                autoComplete="email"
              />
              <p className="mt-1 text-xs text-gray-500">Receipt will be sent to this email</p>
            </div>

            {/* Error Message */}
            {formError && (
              <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm">
                {formError}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={processing}
              className="w-full py-4 bg-lime-600 hover:bg-lime-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {processing ? (
                <>
                  <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full"></div>
                  Processing...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                  Pay Now - {formatCurrency(perSessionAmount, currency)}
                </>
              )}
            </button>
          </form>

          {/* Secure Payment Badge */}
          <div className="flex items-center justify-center gap-2 mt-4 text-gray-500 text-xs">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Secure payment powered by Stripe
          </div>
        </div>

        {/* Session Info */}
        {occurrenceId && (
          <div className="mt-4 text-center">
            <p className="text-gray-500 text-sm">
              Session: {new Date(occurrenceId + 'T00:00:00').toLocaleDateString('en-NZ', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default GuestPayPage;

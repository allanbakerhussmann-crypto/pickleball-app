/**
 * StandingMeetupPage - Player-facing detail view
 *
 * Shows weekly meetup details for players to view and register.
 * Includes registration flow with Stripe or Bank Transfer payment.
 *
 * @version 07.57
 * @file pages/StandingMeetupPage.tsx
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  subscribeToStandingMeetup,
  subscribeToOccurrences,
} from '../services/firebase/standingMeetups';
import { getRegistrationByMeetupAndUser } from '../services/firebase/standingMeetupRegistrations';
import { formatTime } from '../utils/timeFormat';
import type { StandingMeetup, MeetupOccurrence, StandingMeetupRegistration } from '../types/standingMeetup';
import { RegisterButton } from '../components/meetups/RegisterButton';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const StandingMeetupPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [meetup, setMeetup] = useState<StandingMeetup | null>(null);
  const [upcomingOccurrences, setUpcomingOccurrences] = useState<MeetupOccurrence[]>([]);
  const [registration, setRegistration] = useState<StandingMeetupRegistration | null>(null);
  const [loading, setLoading] = useState(true);
  const [registrationLoading, setRegistrationLoading] = useState(true);

  // Subscribe to meetup and occurrences
  useEffect(() => {
    if (!id) return;

    const unsubMeetup = subscribeToStandingMeetup(id, (data) => {
      setMeetup(data);
      setLoading(false);
    });

    const unsubOccurrences = subscribeToOccurrences(
      id,
      (occurrences) => {
        // Filter to scheduled occurrences only
        const scheduled = occurrences.filter(o => o.status === 'scheduled');
        setUpcomingOccurrences(scheduled.slice(0, 4));
      },
      { upcoming: true, limit: 4 }
    );

    return () => {
      unsubMeetup();
      unsubOccurrences();
    };
  }, [id]);

  // Check if user is already registered
  useEffect(() => {
    const checkRegistration = async () => {
      if (!id || !currentUser?.uid) {
        setRegistrationLoading(false);
        return;
      }

      try {
        const reg = await getRegistrationByMeetupAndUser(id, currentUser.uid);
        setRegistration(reg);
      } catch (err) {
        console.error('Failed to check registration:', err);
      } finally {
        setRegistrationLoading(false);
      }
    };

    checkRegistration();
  }, [id, currentUser?.uid]);

  const formatCurrency = (cents: number): string => {
    if (!meetup) return '';
    const symbol = meetup.billing.currency === 'usd' ? 'US$' : meetup.billing.currency === 'aud' ? 'A$' : '$';
    return `${symbol}${(cents / 100).toFixed(2)}`;
  };

  const formatOccurrenceDate = (occurrence: MeetupOccurrence) => {
    const date = new Date(occurrence.date + 'T00:00:00');
    return date.toLocaleDateString('en-NZ', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-lime-500"></div>
      </div>
    );
  }

  if (!meetup) {
    return (
      <div className="min-h-screen bg-gray-950 p-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 text-center">
            <h2 className="text-xl font-bold text-white mb-2">Meetup Not Found</h2>
            <p className="text-gray-400 mb-4">This weekly meetup may have been deleted or is not available.</p>
            <button
              onClick={() => navigate(-1)}
              className="text-lime-400 hover:text-lime-300 font-medium"
            >
              ← Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const spotsLeft = meetup.maxPlayers - meetup.subscriberCount;
  const isFull = spotsLeft <= 0;
  const isRegistered = registration?.status === 'active';
  const isPending = isRegistered && registration?.paymentStatus === 'pending';
  const isPaid = isRegistered && registration?.paymentStatus === 'paid';

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-4"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </button>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">{meetup.title}</h1>
              <p className="text-gray-400">{meetup.clubName}</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-lime-400">
                {formatCurrency(meetup.billing.amount)}
              </div>
              <div className="text-sm text-gray-500">one-time registration</div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Registration Status Banner */}
        {isRegistered && (
          <div className={`p-4 rounded-xl border ${
            isPaid
              ? 'bg-lime-900/20 border-lime-500/30'
              : 'bg-yellow-900/20 border-yellow-500/30'
          }`}>
            <div className="flex items-center gap-3">
              {isPaid ? (
                <>
                  <svg className="w-6 h-6 text-lime-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-lime-400 font-medium">You're Registered!</p>
                    <p className="text-lime-400/70 text-sm">You have access to all upcoming sessions.</p>
                  </div>
                </>
              ) : (
                <>
                  <svg className="w-6 h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-yellow-400 font-medium">Payment Pending</p>
                    <p className="text-yellow-400/70 text-sm">
                      Your bank transfer is awaiting confirmation from the organizer.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Schedule & Location */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <h2 className="text-lg font-semibold text-white mb-4">Schedule & Location</h2>

              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-600/20 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-white font-medium">
                      Every {DAY_NAMES[meetup.recurrence.dayOfWeek]}
                    </p>
                    <p className="text-gray-400 text-sm">
                      {formatTime(meetup.recurrence.startTime)} - {formatTime(meetup.recurrence.endTime)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-purple-600/20 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-white font-medium">{meetup.locationName}</p>
                    <p className="text-gray-400 text-sm">{meetup.timezone}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Description */}
            {meetup.description && (
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h2 className="text-lg font-semibold text-white mb-3">About</h2>
                <p className="text-gray-300 whitespace-pre-wrap">{meetup.description}</p>
              </div>
            )}

            {/* Upcoming Sessions */}
            {upcomingOccurrences.length > 0 && (
              <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h2 className="text-lg font-semibold text-white mb-4">Upcoming Sessions</h2>
                <div className="space-y-3">
                  {upcomingOccurrences.map((occurrence) => (
                    <div
                      key={occurrence.id}
                      className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gray-700 rounded-lg flex flex-col items-center justify-center">
                          <span className="text-xs text-gray-400">
                            {new Date(occurrence.date + 'T00:00:00').toLocaleDateString('en-NZ', { month: 'short' })}
                          </span>
                          <span className="text-lg font-bold text-white">
                            {new Date(occurrence.date + 'T00:00:00').getDate()}
                          </span>
                        </div>
                        <div>
                          <p className="text-white font-medium">{formatOccurrenceDate(occurrence)}</p>
                          <p className="text-gray-500 text-sm">
                            {formatTime(occurrence.startTime)} - {formatTime(occurrence.endTime)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-gray-400 text-sm">
                          {occurrence.expectedCount} expected
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Credit Policy */}
            {meetup.credits.enabled && (
              <div className="bg-lime-900/20 border border-lime-500/30 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-lime-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-lime-400 font-medium">Cancellation Credits</p>
                    <p className="text-lime-400/70 text-sm">
                      Cancel at least {meetup.credits.cancellationCutoffHours} hours before a session to receive credit for a future booking.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Registration */}
          <div className="lg:col-span-1">
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 sticky top-4">
              <h2 className="text-lg font-semibold text-white mb-4">Registration</h2>

              {/* Capacity Info */}
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-700">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span className="text-gray-300">
                    {meetup.subscriberCount} / {meetup.maxPlayers}
                  </span>
                </div>
                {isFull ? (
                  <span className="px-2 py-1 bg-red-600/20 text-red-400 text-xs rounded-full font-medium">
                    Full
                  </span>
                ) : spotsLeft <= 3 ? (
                  <span className="px-2 py-1 bg-yellow-600/20 text-yellow-400 text-xs rounded-full font-medium">
                    {spotsLeft} spots left
                  </span>
                ) : (
                  <span className="px-2 py-1 bg-lime-600/20 text-lime-400 text-xs rounded-full font-medium">
                    Open
                  </span>
                )}
              </div>

              {/* Price */}
              <div className="mb-6">
                <div className="text-3xl font-bold text-white mb-1">
                  {formatCurrency(meetup.billing.amount)}
                </div>
                <p className="text-gray-500 text-sm">
                  One-time registration fee for unlimited sessions
                </p>
              </div>

              {/* Registration Button */}
              {registrationLoading ? (
                <div className="flex items-center justify-center py-4">
                  <div className="animate-spin h-6 w-6 border-2 border-lime-500 border-t-transparent rounded-full" />
                </div>
              ) : isPaid ? (
                <div className="text-center py-4">
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-lime-600/20 text-lime-400 rounded-lg">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Registered
                  </div>
                </div>
              ) : isPending ? (
                <div className="text-center py-4">
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-600/20 text-yellow-400 rounded-lg">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Awaiting Payment Confirmation
                  </div>
                </div>
              ) : (
                <RegisterButton
                  meetup={meetup}
                  disabled={isFull || !currentUser}
                  onSuccess={() => {
                    // Refresh registration status
                    if (id && currentUser?.uid) {
                      getRegistrationByMeetupAndUser(id, currentUser.uid).then(setRegistration);
                    }
                  }}
                />
              )}

              {!currentUser && (
                <p className="text-center text-gray-500 text-sm mt-4">
                  Please{' '}
                  <button
                    onClick={() => navigate('/login')}
                    className="text-lime-400 hover:underline"
                  >
                    log in
                  </button>
                  {' '}to register
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StandingMeetupPage;

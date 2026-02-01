/**
 * MyWeeklyMeetups Component
 *
 * Displays a player's weekly meetup registrations in their profile.
 * Shows both paid and pending registrations with actions to:
 * - View meetup details
 * - Cancel pending bank transfer registrations
 * - Unregister from paid registrations
 *
 * @version 07.58
 * @file components/profile/MyWeeklyMeetups.tsx
 */

import React, { useEffect, useState } from 'react';
import { httpsCallable, getFunctions, connectFunctionsEmulator } from '@firebase/functions';
import { getApp } from '@firebase/app';
import { useAuth } from '../../contexts/AuthContext';
import { subscribeToUserRegistrations } from '../../services/firebase/standingMeetupRegistrations';
import { getStandingMeetup } from '../../services/firebase/standingMeetups';
import type { StandingMeetupRegistration, StandingMeetup } from '../../types/standingMeetup';
import { formatTime } from '../../utils/timeFormat';

// Get functions instance for us-central1 region (registration functions deployed there)
const functionsUS = getFunctions(getApp(), 'us-central1');

// Connect to emulator if in development mode
if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  try {
    connectFunctionsEmulator(functionsUS, '127.0.0.1', 5001);
  } catch {
    // Already connected, ignore
  }
}

interface RegistrationWithMeetup extends StandingMeetupRegistration {
  meetup?: StandingMeetup;
}

interface MyWeeklyMeetupsProps {
  onViewMeetup?: (standingMeetupId: string) => void;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const MyWeeklyMeetups: React.FC<MyWeeklyMeetupsProps> = ({ onViewMeetup }) => {
  const { userProfile } = useAuth();
  const [registrations, setRegistrations] = useState<RegistrationWithMeetup[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userProfile?.odUserId) {
      setLoading(false);
      return;
    }

    const unsubscribe = subscribeToUserRegistrations(
      userProfile.odUserId,
      async (regs) => {
        // Only show active registrations
        const activeRegs = regs.filter((r) => r.status === 'active');

        // Fetch meetup details for each registration
        const regsWithMeetups = await Promise.all(
          activeRegs.map(async (reg) => {
            try {
              const meetup = await getStandingMeetup(reg.standingMeetupId);
              return { ...reg, meetup: meetup || undefined };
            } catch {
              return { ...reg };
            }
          })
        );

        setRegistrations(regsWithMeetups);
        setLoading(false);
      },
      { activeOnly: true }
    );

    return () => {
      try {
        unsubscribe();
      } catch {
        // Ignore cleanup errors
      }
    };
  }, [userProfile?.odUserId]);

  // Currency formatter
  const formatCurrency = (cents: number, currency?: string): string => {
    const curr = currency || 'nzd';
    const symbol = curr === 'usd' ? 'US$' : curr === 'aud' ? 'A$' : '$';
    return `${symbol}${(cents / 100).toFixed(2)}`;
  };

  // Cancel unpaid bank registration
  const handleCancelPending = async (registrationId: string) => {
    if (!confirm('Cancel this registration? You have not been charged yet.')) {
      return;
    }

    setActionLoading(registrationId);
    setError(null);

    try {
      const cancelFn = httpsCallable(functionsUS, 'standingMeetup_cancelUnpaidBankRegistration');
      await cancelFn({ registrationId });
      // Registration will be removed from list via subscription
    } catch (err: any) {
      setError(err.message || 'Failed to cancel registration');
    } finally {
      setActionLoading(null);
    }
  };

  // Unregister from paid registration
  const handleUnregister = async (registrationId: string) => {
    if (!confirm('Are you sure you want to unregister? Your payment is non-refundable.')) {
      return;
    }

    setActionLoading(registrationId);
    setError(null);

    try {
      const unregisterFn = httpsCallable(functionsUS, 'standingMeetup_unregister');
      await unregisterFn({ registrationId });
      // Registration will be removed from list via subscription
    } catch (err: any) {
      setError(err.message || 'Failed to unregister');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">My Weekly Meetups</h3>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-lime-500"></div>
        </div>
      </div>
    );
  }

  if (registrations.length === 0) {
    return (
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">My Weekly Meetups</h3>
        <div className="text-center py-6">
          <svg className="w-12 h-12 text-gray-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-gray-400">No weekly meetup registrations</p>
          <p className="text-gray-500 text-sm mt-1">Join a weekly meetup to see it here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
      <h3 className="text-lg font-semibold text-white mb-4">My Weekly Meetups</h3>

      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {registrations.map((reg) => (
          <div
            key={reg.id}
            className="bg-gray-900/50 rounded-lg border border-gray-700 p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                {/* Meetup Title */}
                <h4 className="text-white font-medium truncate">
                  {reg.meetup?.title || 'Weekly Meetup'}
                </h4>

                {/* Club Name */}
                {reg.meetup?.clubName && (
                  <p className="text-gray-500 text-sm truncate">{reg.meetup.clubName}</p>
                )}

                {/* Schedule */}
                {reg.meetup?.recurrence && (
                  <p className="text-gray-400 text-sm mt-1">
                    {DAY_NAMES[reg.meetup.recurrence.dayOfWeek]}s at {formatTime(reg.meetup.recurrence.startTime)}
                  </p>
                )}

                {/* Registration Type */}
                <div className="flex items-center gap-2 mt-2">
                  {reg.registrationType === 'season_pass' ? (
                    <span className="text-xs bg-lime-500/20 text-lime-400 px-2 py-0.5 rounded-full">
                      Season Pass
                    </span>
                  ) : (
                    <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
                      {reg.sessionCount} session{reg.sessionCount !== 1 ? 's' : ''}
                    </span>
                  )}

                  {/* Payment Status */}
                  {reg.paymentStatus === 'paid' ? (
                    <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-green-400 rounded-full"></span>
                      Paid
                    </span>
                  ) : (
                    <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse"></span>
                      Pending
                    </span>
                  )}
                </div>

                {/* Amount */}
                <p className="text-gray-500 text-xs mt-1">
                  {formatCurrency(reg.amount, reg.currency)}
                  {reg.paymentMethod === 'bank_transfer' && reg.paymentStatus === 'pending' && (
                    <span className="ml-2">• Bank transfer</span>
                  )}
                </p>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2">
                {onViewMeetup && (
                  <button
                    onClick={() => onViewMeetup(reg.standingMeetupId)}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
                  >
                    View
                  </button>
                )}

                {/* Cancel pending bank registration */}
                {reg.paymentStatus === 'pending' && reg.paymentMethod === 'bank_transfer' && (
                  <button
                    onClick={() => handleCancelPending(reg.id)}
                    disabled={actionLoading === reg.id}
                    className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-sm transition-colors disabled:opacity-50"
                  >
                    {actionLoading === reg.id ? 'Cancelling...' : 'Cancel'}
                  </button>
                )}

                {/* Unregister from paid registration */}
                {reg.paymentStatus === 'paid' && (
                  <button
                    onClick={() => handleUnregister(reg.id)}
                    disabled={actionLoading === reg.id}
                    className="px-3 py-1.5 text-gray-400 hover:text-red-400 text-sm transition-colors disabled:opacity-50"
                  >
                    {actionLoading === reg.id ? '...' : 'Unregister'}
                  </button>
                )}
              </div>
            </div>

            {/* Bank transfer pending notice */}
            {reg.paymentStatus === 'pending' && reg.paymentMethod === 'bank_transfer' && (
              <div className="mt-3 p-3 bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
                <p className="text-yellow-400 text-sm">
                  <strong>Awaiting payment confirmation</strong>
                </p>
                <p className="text-gray-400 text-xs mt-1">
                  Complete your bank transfer. The organizer will confirm when received.
                </p>

                {/* Bank Details */}
                {reg.meetup?.paymentMethods?.bankDetails?.showToPlayers && (
                  <div className="mt-3 pt-3 border-t border-yellow-700/30">
                    <p className="text-yellow-400 text-xs font-medium mb-1">Bank Details</p>
                    <div className="space-y-0.5 text-xs">
                      {reg.meetup.paymentMethods.bankDetails.bankName && (
                        <p className="text-gray-400">
                          Bank: <span className="text-white">{reg.meetup.paymentMethods.bankDetails.bankName}</span>
                        </p>
                      )}
                      {reg.meetup.paymentMethods.bankDetails.accountName && (
                        <p className="text-gray-400">
                          Account: <span className="text-white">{reg.meetup.paymentMethods.bankDetails.accountName}</span>
                        </p>
                      )}
                      {reg.meetup.paymentMethods.bankDetails.accountNumber && (
                        <p className="text-gray-400">
                          Number: <span className="text-white font-mono">{reg.meetup.paymentMethods.bankDetails.accountNumber}</span>
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {reg.bankTransferReference && (
                  <p className="text-gray-500 text-xs mt-2">
                    Reference: <span className="text-white font-mono">{reg.bankTransferReference}</span>
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default MyWeeklyMeetups;

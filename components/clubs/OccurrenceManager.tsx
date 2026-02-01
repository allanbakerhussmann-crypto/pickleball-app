/**
 * OccurrenceManager Component
 *
 * Organizer tool for managing a single standing meetup session/occurrence.
 * Allows check-in, mark no-show, and session cancellation.
 *
 * @version 07.58
 * @file components/clubs/OccurrenceManager.tsx
 */

import React, { useEffect, useState } from 'react';
import {
  subscribeToOccurrenceParticipants,
  getOccurrence,
} from '../../services/firebase/standingMeetups';
import {
  subscribeToSessionRegistrations,
} from '../../services/firebase/standingMeetupRegistrations';
import { httpsCallable, getFunctions, connectFunctionsEmulator } from '@firebase/functions';
import { getApp } from '@firebase/app';
import type {
  MeetupOccurrence,
  OccurrenceParticipant,
  StandingMeetupRegistration,
} from '../../types/standingMeetup';
import { formatTime } from '../../utils/timeFormat';

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

interface OccurrenceManagerProps {
  standingMeetupId: string;
  occurrence: MeetupOccurrence;
  meetupTitle: string;
  onBack: () => void;
  onOccurrenceUpdated?: () => void;
}

type ParticipantWithId = OccurrenceParticipant & { odUserId: string };

export const OccurrenceManager: React.FC<OccurrenceManagerProps> = ({
  standingMeetupId,
  occurrence: initialOccurrence,
  meetupTitle,
  onBack,
  onOccurrenceUpdated,
}) => {
  const [occurrence, setOccurrence] = useState<MeetupOccurrence>(initialOccurrence);
  const [participants, setParticipants] = useState<ParticipantWithId[]>([]);
  const [registrations, setRegistrations] = useState<StandingMeetupRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Admin remove player state
  const [showRemovePlayerModal, setShowRemovePlayerModal] = useState(false);
  const [removePlayerTarget, setRemovePlayerTarget] = useState<ParticipantWithId | null>(null);
  const [removingPlayer, setRemovingPlayer] = useState(false);
  const [removePlayerError, setRemovePlayerError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribed = false;

    // Fetch latest occurrence data with error handling for Firestore race conditions
    getOccurrence(standingMeetupId, occurrence.id)
      .then((data) => {
        if (data && !unsubscribed) setOccurrence(data);
      })
      .catch((err) => {
        // Handle Firestore internal errors (can happen during concurrent operations)
        console.error('Error fetching occurrence:', err);
        // Use the initial occurrence data passed as prop if fetch fails
        if (!unsubscribed) setLoading(false);
      });

    // Subscribe to participants with error handling
    const unsubscribe = subscribeToOccurrenceParticipants(
      standingMeetupId,
      occurrence.id,
      (data) => {
        if (!unsubscribed) {
          setParticipants(data);
          setLoading(false);
        }
      }
    );

    return () => {
      unsubscribed = true;
      unsubscribe();
    };
  }, [standingMeetupId, occurrence.id]);

  // Subscribe to registrations for this session (shows who's registered + pending bank transfers)
  useEffect(() => {
    const unsubscribe = subscribeToSessionRegistrations(
      standingMeetupId,
      occurrence.id,
      (data) => {
        setRegistrations(data);
      }
    );

    return () => unsubscribe();
  }, [standingMeetupId, occurrence.id]);

  const handleCheckIn = async (userId: string) => {
    setActionLoading(userId);
    setError(null);
    try {
      const checkInFn = httpsCallable(functionsAU, 'standingMeetup_organizerCheckIn');
      await checkInFn({
        standingMeetupId,
        dateId: occurrence.id,
        userId,
      });
      onOccurrenceUpdated?.();
    } catch (err: any) {
      setError(err.message || 'Failed to check in participant');
    } finally {
      setActionLoading(null);
    }
  };

  const handleMarkNoShow = async (userId: string) => {
    setActionLoading(userId);
    setError(null);
    try {
      const noShowFn = httpsCallable(functionsAU, 'standingMeetup_markNoShow');
      await noShowFn({
        standingMeetupId,
        dateId: occurrence.id,
        userId,
      });
      onOccurrenceUpdated?.();
    } catch (err: any) {
      setError(err.message || 'Failed to mark as no-show');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelSession = async () => {
    setActionLoading('cancel');
    setError(null);
    try {
      const cancelFn = httpsCallable(functionsAU, 'standingMeetup_cancelOccurrence');
      await cancelFn({
        standingMeetupId,
        dateId: occurrence.id,
        reason: cancelReason || 'Cancelled by organizer',
      });
      setShowCancelModal(false);
      onOccurrenceUpdated?.();
      onBack();
    } catch (err: any) {
      // Handle "already cancelled" gracefully - just go back
      const errorCode = err.code || '';
      const errorMessage = err.message || '';

      if (errorCode === 'already-exists' || errorMessage.includes('already cancelled')) {
        // Session was already cancelled - close modal and go back
        setShowCancelModal(false);
        onOccurrenceUpdated?.();
        onBack();
        return;
      }

      setError(err.message || 'Failed to cancel session');
    } finally {
      setActionLoading(null);
    }
  };

  // Admin remove player from session
  const handleRemovePlayer = async () => {
    if (!removePlayerTarget) return;

    setRemovingPlayer(true);
    setRemovePlayerError(null);

    try {
      // Use the same cancel attendance function - it works for any participant
      const cancelFn = httpsCallable<
        { standingMeetupId: string; dateId: string; odUserId: string },
        { credited: boolean; creditAmount?: number; reason: string }
      >(functionsAU, 'standingMeetup_cancelAttendance');

      await cancelFn({
        standingMeetupId,
        dateId: occurrence.id,
        odUserId: removePlayerTarget.odUserId,
      });

      setShowRemovePlayerModal(false);
      setRemovePlayerTarget(null);
      onOccurrenceUpdated?.();
    } catch (err: any) {
      console.error('Failed to remove player:', err);
      const errorCode = err.code || err.message || '';
      if (errorCode.includes('NOT_PARTICIPANT')) {
        setRemovePlayerError('This player is not registered for this session.');
      } else if (errorCode.includes('ALREADY_CANCELLED')) {
        setRemovePlayerError('This player has already withdrawn from this session.');
      } else if (errorCode.includes('OCCURRENCE_PASSED')) {
        setRemovePlayerError('This session has already started or passed.');
      } else {
        setRemovePlayerError(err.message || 'Failed to remove player from session.');
      }
    } finally {
      setRemovingPlayer(false);
    }
  };

  const formatOccurrenceDate = () => {
    const date = new Date(occurrence.date + 'T00:00:00');
    return date.toLocaleDateString('en-NZ', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const getStatusColor = (status: OccurrenceParticipant['status']) => {
    switch (status) {
      case 'checked_in':
        return 'text-green-400 bg-green-600/20';
      case 'expected':
        return 'text-blue-400 bg-blue-600/20';
      case 'cancelled':
        return 'text-yellow-400 bg-yellow-600/20';
      case 'no_show':
        return 'text-red-400 bg-red-600/20';
      default:
        return 'text-gray-400 bg-gray-600/20';
    }
  };

  const getStatusLabel = (status: OccurrenceParticipant['status']) => {
    switch (status) {
      case 'checked_in':
        return 'Checked In';
      case 'expected':
        return 'Expected';
      case 'cancelled':
        return 'Cancelled';
      case 'no_show':
        return 'No Show';
      default:
        return status;
    }
  };

  const isCancelled = occurrence.status === 'cancelled';
  const isCompleted = occurrence.status === 'completed';
  const isPast = occurrence.startAt < Date.now();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-white">Session Management</h2>
          <p className="text-gray-400 text-sm">{meetupTitle}</p>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Session Info Card */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">{formatOccurrenceDate()}</h3>
            <p className="text-gray-400">
              {formatTime(occurrence.startTime)} - {formatTime(occurrence.endTime)}
            </p>
          </div>
          <div className={`px-3 py-1 rounded-lg text-sm font-medium ${
            isCancelled ? 'bg-red-600/30 text-red-400' :
            isCompleted ? 'bg-gray-600/30 text-gray-400' :
            isPast ? 'bg-yellow-600/30 text-yellow-400' :
            'bg-green-600/30 text-green-400'
          }`}>
            {isCancelled ? 'Cancelled' :
             isCompleted ? 'Completed' :
             isPast ? 'In Progress' :
             'Scheduled'}
          </div>
        </div>

        {/* Attendance Summary */}
        <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t border-gray-700">
          <div className="text-center">
            <p className="text-2xl font-bold text-blue-400">{occurrence.expectedCount}</p>
            <p className="text-gray-500 text-xs">Expected</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-400">{occurrence.checkedInCount}</p>
            <p className="text-gray-500 text-xs">Checked In</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-yellow-400">{occurrence.cancelledCount}</p>
            <p className="text-gray-500 text-xs">Cancelled</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-red-400">{occurrence.noShowCount}</p>
            <p className="text-gray-500 text-xs">No Shows</p>
          </div>
        </div>
      </div>

      {/* Participants List */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">Participants</h3>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-500"></div>
          </div>
        ) : participants.length === 0 ? (
          <div className="text-center py-8">
            <svg className="w-12 h-12 text-gray-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="text-gray-400">No participants for this session</p>
          </div>
        ) : (
          <div className="space-y-3">
            {participants.map((participant) => (
              <div
                key={participant.odUserId}
                className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg border border-gray-700"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center">
                    <span className="text-white font-medium">
                      {participant.userName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-white font-medium">{participant.userName}</p>
                    {participant.checkedInAt && (
                      <p className="text-gray-500 text-xs">
                        Checked in at {new Date(participant.checkedInAt).toLocaleTimeString()}
                      </p>
                    )}
                    {participant.creditIssued && (
                      <p className="text-green-500 text-xs">
                        Credit issued: ${((participant.creditAmount || 0) / 100).toFixed(2)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className={`px-2 py-1 rounded-lg text-xs font-medium ${getStatusColor(participant.status)}`}>
                    {getStatusLabel(participant.status)}
                  </span>

                  {/* Action buttons - only show for expected status and non-cancelled sessions */}
                  {participant.status === 'expected' && !isCancelled && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleCheckIn(participant.odUserId)}
                        disabled={actionLoading === participant.odUserId}
                        className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {actionLoading === participant.odUserId ? (
                          <span className="flex items-center gap-1">
                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            ...
                          </span>
                        ) : (
                          'Check In'
                        )}
                      </button>
                      <button
                        onClick={() => handleMarkNoShow(participant.odUserId)}
                        disabled={actionLoading === participant.odUserId}
                        className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        No Show
                      </button>
                      <button
                        onClick={() => {
                          setRemovePlayerTarget(participant);
                          setShowRemovePlayerModal(true);
                          setRemovePlayerError(null);
                        }}
                        disabled={actionLoading === participant.odUserId}
                        className="px-3 py-1.5 bg-gray-600/20 hover:bg-gray-600/30 text-gray-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Remove player from session"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Registrations for this Session */}
      {registrations.length > 0 && (
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">
            Registrations for This Session
            <span className="ml-2 text-sm font-normal text-gray-400">
              ({registrations.length} total)
            </span>
          </h3>

          {/* Pending Bank Transfers */}
          {registrations.filter(r => r.paymentStatus === 'pending').length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-yellow-400 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Pending Bank Transfers
              </h4>
              <div className="space-y-2">
                {registrations
                  .filter(r => r.paymentStatus === 'pending')
                  .map((reg) => (
                    <div
                      key={reg.id}
                      className="flex items-center justify-between p-3 bg-yellow-900/20 rounded-lg border border-yellow-700/50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-yellow-600/30 rounded-full flex items-center justify-center">
                          <span className="text-yellow-400 font-medium text-sm">
                            {reg.userName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-white font-medium">{reg.userName}</p>
                          <p className="text-gray-500 text-xs">
                            {reg.registrationType === 'season_pass' ? 'Season Pass' : 'Pay Per Session'}
                            {' • '}${(reg.amount / 100).toFixed(2)}
                          </p>
                        </div>
                      </div>
                      <span className="px-2 py-1 rounded-lg text-xs font-medium bg-yellow-600/20 text-yellow-400">
                        Awaiting Payment
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Paid Registrations */}
          {registrations.filter(r => r.paymentStatus === 'paid').length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-green-400 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Confirmed Registrations
              </h4>
              <div className="space-y-2">
                {registrations
                  .filter(r => r.paymentStatus === 'paid')
                  .map((reg) => (
                    <div
                      key={reg.id}
                      className="flex items-center justify-between p-3 bg-green-900/20 rounded-lg border border-green-700/50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-green-600/30 rounded-full flex items-center justify-center">
                          <span className="text-green-400 font-medium text-sm">
                            {reg.userName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-white font-medium">{reg.userName}</p>
                          <p className="text-gray-500 text-xs">
                            {reg.registrationType === 'season_pass' ? 'Season Pass' : 'Pay Per Session'}
                            {' • '}${(reg.amount / 100).toFixed(2)}
                            {reg.paymentMethod === 'stripe' ? ' • Stripe' : ' • Bank Transfer'}
                          </p>
                        </div>
                      </div>
                      <span className="px-2 py-1 rounded-lg text-xs font-medium bg-green-600/20 text-green-400">
                        Paid
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Session Actions */}
      {!isCancelled && !isCompleted && (
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Session Actions</h3>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setShowCancelModal(true)}
              className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Cancel Session
            </button>
          </div>
          <p className="text-gray-500 text-sm mt-3">
            Cancelling will notify all participants and issue credits (if credit policy is enabled).
          </p>
        </div>
      )}

      {/* Cancel Session Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">Cancel Session</h3>
            <p className="text-gray-400 mb-4">
              Are you sure you want to cancel the session on {formatOccurrenceDate()}?
            </p>
            <p className="text-yellow-400 text-sm mb-4">
              This will notify all {occurrence.expectedCount} expected participants and may issue credits.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Reason (optional)
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g., Weather conditions, venue unavailable..."
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Keep Session
              </button>
              <button
                onClick={handleCancelSession}
                disabled={actionLoading === 'cancel'}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading === 'cancel' ? 'Cancelling...' : 'Cancel Session'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Player Modal */}
      {showRemovePlayerModal && removePlayerTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">Remove Player</h3>
            <p className="text-gray-400 mb-2">
              Are you sure you want to remove this player from the session?
            </p>
            <div className="bg-gray-900/50 rounded-lg p-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center">
                  <span className="text-white font-medium">
                    {removePlayerTarget.userName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <p className="text-white font-medium">{removePlayerTarget.userName}</p>
              </div>
            </div>

            <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3 mb-4">
              <p className="text-yellow-400 text-sm">
                The player may receive a credit to their wallet depending on the cancellation cutoff policy.
              </p>
            </div>

            {removePlayerError && (
              <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 mb-4">
                <p className="text-red-400 text-sm">{removePlayerError}</p>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowRemovePlayerModal(false);
                  setRemovePlayerTarget(null);
                  setRemovePlayerError(null);
                }}
                disabled={removingPlayer}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRemovePlayer}
                disabled={removingPlayer}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {removingPlayer ? 'Removing...' : 'Remove Player'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OccurrenceManager;

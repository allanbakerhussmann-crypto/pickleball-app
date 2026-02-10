/**
 * OccurrenceManager Component
 *
 * Organizer tool for managing a single standing meetup session/occurrence.
 * Allows check-in, mark no-show, session cancellation, and guest management.
 *
 * Features:
 * - Check-in / No-show participant management
 * - Session cancellation with credits
 * - QR code for player self check-in
 * - QR code for guest walk-in payment
 * - Add cash guests manually
 * - Close session (mark remaining as no-show)
 *
 * @version 07.60
 * @file components/clubs/OccurrenceManager.tsx
 */

import React, { useEffect, useState } from 'react';
import {
  subscribeToOccurrenceParticipants,
  subscribeToOccurrenceGuests,
  subscribeToOccurrence,
} from '../../services/firebase/standingMeetups';
import {
  subscribeToSessionRegistrations,
} from '../../services/firebase/standingMeetupRegistrations';
import { httpsCallable, getFunctions, connectFunctionsEmulator } from '@firebase/functions';
import { getApp } from '@firebase/app';
import type {
  MeetupOccurrence,
  OccurrenceParticipant,
  OccurrenceGuest,
  StandingMeetupRegistration,
} from '../../types/standingMeetup';
import { formatTime } from '../../utils/timeFormat';
import { maskEmail } from '../../utils/privacy';
import { SessionCheckInQR } from './SessionCheckInQR';
import { GuestPayQR } from './GuestPayQR';
import { AddCashGuestModal } from './AddCashGuestModal';
import { PlayerQRScanner } from './PlayerQRScanner';
import { AttendanceSummary } from './AttendanceSummary';

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
  /** Billing info for GuestPayQR - per session amount in cents */
  perSessionAmount?: number;
  /** Currency code for payments */
  currency?: 'nzd' | 'aud' | 'usd';
}

type ParticipantWithId = OccurrenceParticipant & { odUserId: string };

export const OccurrenceManager: React.FC<OccurrenceManagerProps> = ({
  standingMeetupId,
  occurrence: initialOccurrence,
  meetupTitle,
  onBack,
  onOccurrenceUpdated,
  perSessionAmount = 1000, // Default $10.00
  currency = 'nzd',
}) => {
  const [occurrence, setOccurrence] = useState<MeetupOccurrence>(initialOccurrence);
  const [participants, setParticipants] = useState<ParticipantWithId[]>([]);
  const [guests, setGuests] = useState<OccurrenceGuest[]>([]);
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

  // Session tools state (QR codes, guest management)
  const [showCheckInQR, setShowCheckInQR] = useState(false);
  const [showGuestPayQR, setShowGuestPayQR] = useState(false);
  const [showAddGuestModal, setShowAddGuestModal] = useState(false);
  const [showPlayerScanner, setShowPlayerScanner] = useState(false);
  const [isClosingSession, setIsClosingSession] = useState(false);

  useEffect(() => {
    let unsubscribed = false;

    // Subscribe to occurrence document for real-time counter updates
    const unsubOccurrence = subscribeToOccurrence(
      standingMeetupId,
      initialOccurrence.id,
      (data) => {
        if (data && !unsubscribed) setOccurrence(data);
      }
    );

    // Subscribe to participants with error handling
    const unsubParticipants = subscribeToOccurrenceParticipants(
      standingMeetupId,
      initialOccurrence.id,
      (data) => {
        if (!unsubscribed) {
          setParticipants(data);
          setLoading(false);
        }
      }
    );

    return () => {
      unsubscribed = true;
      unsubOccurrence();
      unsubParticipants();
    };
  }, [standingMeetupId, initialOccurrence.id]);

  // Subscribe to registrations for this session (shows who's registered + pending bank transfers)
  useEffect(() => {
    const unsubscribe = subscribeToSessionRegistrations(
      standingMeetupId,
      initialOccurrence.id,
      (data) => {
        setRegistrations(data);
      }
    );

    return () => unsubscribe();
  }, [standingMeetupId, initialOccurrence.id]);

  // Subscribe to guests (walk-ins added at door)
  useEffect(() => {
    const unsubscribe = subscribeToOccurrenceGuests(
      standingMeetupId,
      initialOccurrence.id,
      (data) => {
        setGuests(data);
      }
    );

    return () => unsubscribe();
  }, [standingMeetupId, initialOccurrence.id]);

  const handleCheckIn = async (userId: string) => {
    setActionLoading(userId);
    setError(null);
    try {
      const checkInFn = httpsCallable(functionsAU, 'standingMeetup_manualCheckIn');
      await checkInFn({
        standingMeetupId,
        dateId: occurrence.id,
        targetUserId: userId,
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

  // Close session - marks all remaining expected players as no-shows
  const handleCloseSession = async () => {
    if (!confirm('Close this session? This will mark all remaining expected players as no-shows.')) {
      return;
    }
    setIsClosingSession(true);
    setError(null);
    try {
      const closeSession = httpsCallable(functionsAU, 'standingMeetup_closeSession');
      await closeSession({ standingMeetupId, occurrenceId: occurrence.id });
      onOccurrenceUpdated?.();
    } catch (err: any) {
      console.error('Error closing session:', err);
      setError(err.message || 'Failed to close session');
    } finally {
      setIsClosingSession(false);
    }
  };

  // Format session date for QR displays (e.g., "Monday 3 Feb 2025")
  const formatSessionDate = () => {
    const date = new Date(occurrence.date + 'T00:00:00');
    return date.toLocaleDateString('en-NZ', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  // Format session time range for QR displays (e.g., "6:00 PM - 8:00 PM")
  const formatSessionTime = () => {
    return `${formatTime(occurrence.startTime)} - ${formatTime(occurrence.endTime)}`;
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

      </div>

      {/* Attendance Summary */}
      <AttendanceSummary
        occurrence={{
          expectedCount: occurrence.expectedCount,
          checkedInCount: occurrence.checkedInCount,
          noShowCount: occurrence.noShowCount,
          cancelledCount: occurrence.cancelledCount,
          guestCount: occurrence.guestCount || 0,
          guestRevenue: occurrence.guestRevenue || 0,
          closedAt: occurrence.closedAt,
          status: occurrence.status,
        }}
        currency={currency}
      />

      {/* Participants List */}
      <div className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700">
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
                className="p-3 sm:p-4 bg-gray-900/50 rounded-lg border border-gray-700"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gray-700 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-white font-medium text-sm sm:text-base">
                        {(participant.userName || '?').charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-white font-medium truncate">{participant.userName || 'Unknown'}</p>
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

                  <span className={`px-2 py-1 rounded-lg text-xs font-medium whitespace-nowrap flex-shrink-0 ${getStatusColor(participant.status)}`}>
                    {getStatusLabel(participant.status)}
                  </span>
                </div>

                {/* Action buttons - only show for expected status and non-cancelled sessions */}
                {participant.status === 'expected' && !isCancelled && (
                  <div className="flex items-center gap-2 mt-3 pl-12 sm:pl-13">
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
            ))}
          </div>
        )}
      </div>

      {/* Guests (Walk-ins) */}
      {guests.length > 0 && (
        <div className="bg-gray-800 rounded-xl p-4 sm:p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            Guests
            <span className="text-sm font-normal text-gray-400">
              ({guests.length} total)
            </span>
          </h3>

          <div className="space-y-3">
            {guests.map((guest) => (
              <div
                key={guest.id}
                className="p-3 sm:p-4 bg-cyan-900/20 rounded-lg border border-cyan-700/50"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 bg-cyan-600/30 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-cyan-400 font-medium text-sm sm:text-base">
                      {(guest.name || 'G').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-white font-medium truncate">{guest.name || 'Guest'}</p>
                      <p className="text-cyan-400 font-semibold whitespace-nowrap">
                        ${(guest.amount / 100).toFixed(2)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs flex-wrap">
                      <span className={`px-1.5 py-0.5 rounded ${
                        guest.paymentMethod === 'stripe'
                          ? 'bg-purple-600/20 text-purple-400'
                          : 'bg-green-600/20 text-green-400'
                      }`}>
                        {guest.paymentMethod === 'stripe' ? 'Card' : 'Cash'}
                      </span>
                      <span className="text-gray-500">
                        {new Date(guest.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {guest.email && (
                        <span className="text-gray-500 truncate max-w-[160px]">{maskEmail(guest.email)}</span>
                      )}
                    </div>
                    {guest.notes && (
                      <p className="text-gray-500 text-xs mt-1 italic truncate">"{guest.notes}"</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Guest Revenue Summary - Show NET (what organizer receives) */}
          {(() => {
            // Calculate estimated NET revenue
            // Cash: full amount (no fees)
            // Stripe: gross - Stripe fee (~2.9% + 30c + 15% GST) - platform fee (1.5%)
            const grossTotal = guests.reduce((sum, g) => sum + g.amount, 0);
            const netTotal = guests.reduce((sum, g) => {
              if (g.paymentMethod === 'cash') {
                // Cash: organizer keeps full amount
                return sum + g.amount;
              } else {
                // Stripe: estimate net after fees
                // Stripe fee: 2.9% + 30c base, plus 15% GST (NZ)
                const stripeFeeBase = Math.round(g.amount * 0.029) + 30;
                const stripeFee = Math.round(stripeFeeBase * 1.15);
                // Platform fee: 1.5%
                const platformFee = Math.round(g.amount * 0.015);
                const net = g.amount - stripeFee - platformFee;
                return sum + Math.max(0, net);
              }
            }, 0);

            return (
              <div className="mt-4 pt-4 border-t border-cyan-700/30">
                <div className="flex justify-between items-baseline gap-2">
                  <div className="text-sm">
                    <span className="text-gray-400">Your Revenue</span>
                    <span className="text-gray-500 text-xs ml-1">(after fees)</span>
                  </div>
                  <span className="text-cyan-400 font-bold text-xl">
                    ${(netTotal / 100).toFixed(2)}
                  </span>
                </div>
                {grossTotal !== netTotal && (
                  <p className="text-gray-500 text-xs mt-1 text-right">
                    Gross: ${(grossTotal / 100).toFixed(2)} &middot; Fees: ${((grossTotal - netTotal) / 100).toFixed(2)}
                  </p>
                )}
              </div>
            );
          })()}
        </div>
      )}

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
                            {(reg.userName || '?').charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-white font-medium">{reg.userName || 'Unknown'}</p>
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
                            {(reg.userName || '?').charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-white font-medium">{reg.userName || 'Unknown'}</p>
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

      {/* Session Tools - QR Codes and Guest Management */}
      {!isCancelled && (
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Session Tools</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* Check-In QR */}
            <button
              onClick={() => setShowCheckInQR(true)}
              className="flex flex-col items-center gap-2 p-4 bg-lime-600/20 hover:bg-lime-600/30 border border-lime-600/30 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6 text-lime-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              <span className="text-lime-400 text-sm font-medium text-center">Check-In QR</span>
            </button>

            {/* Guest Pay QR */}
            <button
              onClick={() => setShowGuestPayQR(true)}
              className="flex flex-col items-center gap-2 p-4 bg-green-600/20 hover:bg-green-600/30 border border-green-600/30 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span className="text-green-400 text-sm font-medium text-center">Guest Pay QR</span>
            </button>

            {/* Add Guest (Cash) */}
            <button
              onClick={() => setShowAddGuestModal(true)}
              className="flex flex-col items-center gap-2 p-4 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/30 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
              </svg>
              <span className="text-blue-400 text-sm font-medium text-center">Add Guest (Cash)</span>
            </button>

            {/* Scan Player QR */}
            <button
              onClick={() => setShowPlayerScanner(true)}
              className="flex flex-col items-center gap-2 p-4 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-600/30 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-purple-400 text-sm font-medium text-center">Scan Player QR</span>
            </button>

            {/* Close Session */}
            <button
              onClick={handleCloseSession}
              disabled={isClosingSession || !!occurrence.closedAt}
              className={`flex flex-col items-center gap-2 p-4 rounded-lg transition-colors ${
                occurrence.closedAt
                  ? 'bg-gray-600/20 border border-gray-600/30 cursor-not-allowed'
                  : 'bg-orange-600/20 hover:bg-orange-600/30 border border-orange-600/30'
              }`}
            >
              {isClosingSession ? (
                <div className="w-6 h-6 border-2 border-orange-400/30 border-t-orange-400 rounded-full animate-spin" />
              ) : (
                <svg className={`w-6 h-6 ${occurrence.closedAt ? 'text-gray-500' : 'text-orange-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              <span className={`text-sm font-medium text-center ${occurrence.closedAt ? 'text-gray-500' : 'text-orange-400'}`}>
                {occurrence.closedAt ? 'Session Closed' : 'Close Session'}
              </span>
            </button>
          </div>
          <p className="text-gray-500 text-sm mt-3">
            Use QR codes for self-service check-in and guest payments. Close session to finalize attendance.
          </p>
        </div>
      )}

      {/* Session Actions - Cancel */}
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
                    {(removePlayerTarget.userName || '?').charAt(0).toUpperCase()}
                  </span>
                </div>
                <p className="text-white font-medium">{removePlayerTarget.userName || 'Unknown'}</p>
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

      {/* Session Check-In QR Modal */}
      {showCheckInQR && (
        <SessionCheckInQR
          standingMeetupId={standingMeetupId}
          occurrenceId={occurrence.id}
          meetupTitle={meetupTitle}
          sessionDate={formatSessionDate()}
          sessionTime={formatSessionTime()}
          onClose={() => setShowCheckInQR(false)}
        />
      )}

      {/* Guest Pay QR Modal */}
      {showGuestPayQR && (
        <GuestPayQR
          standingMeetupId={standingMeetupId}
          occurrenceId={occurrence.id}
          meetupTitle={meetupTitle}
          sessionDate={formatSessionDate()}
          amount={perSessionAmount}
          currency={currency}
          onClose={() => setShowGuestPayQR(false)}
        />
      )}

      {/* Add Cash Guest Modal */}
      <AddCashGuestModal
        isOpen={showAddGuestModal}
        onClose={() => setShowAddGuestModal(false)}
        standingMeetupId={standingMeetupId}
        occurrenceId={occurrence.id}
        defaultAmount={perSessionAmount}
        currency={currency}
        onGuestAdded={() => {
          onOccurrenceUpdated?.();
        }}
      />

      {/* Player QR Scanner Modal */}
      <PlayerQRScanner
        isOpen={showPlayerScanner}
        onClose={() => setShowPlayerScanner(false)}
        standingMeetupId={standingMeetupId}
        occurrenceId={occurrence.id}
        onCheckInSuccess={() => {
          onOccurrenceUpdated?.();
        }}
      />
    </div>
  );
};

export default OccurrenceManager;

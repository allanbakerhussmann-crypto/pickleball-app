/**
 * StandingMeetupDetail Component
 *
 * Displays detailed view of a standing meetup including:
 * - Overview (title, schedule, pricing, credit policy)
 * - Upcoming sessions/occurrences
 * - Subscriber management (for organizers)
 *
 * @version 07.58
 * @file components/clubs/StandingMeetupDetail.tsx
 */

import React, { useEffect, useState } from 'react';
import {
  subscribeToStandingMeetup,
  subscribeToOccurrences,
  subscribeToOccurrenceParticipants,
} from '../../services/firebase/standingMeetups';
import {
  subscribeToPendingRegistrations,
  subscribeToUserRegistrationForMeetup,
} from '../../services/firebase/standingMeetupRegistrations';
import { httpsCallable, getFunctions, connectFunctionsEmulator } from '@firebase/functions';
import { getApp } from '@firebase/app';
import { useAuth } from '../../contexts/AuthContext';
import type { StandingMeetup, MeetupOccurrence, OccurrenceParticipant, EnsureOccurrencesInput, EnsureOccurrencesOutput, StandingMeetupRegistration, ConfirmBankPaymentInput, ConfirmBankPaymentOutput } from '../../types/standingMeetup';
import { PendingPaymentsList, type PendingPaymentItem } from '../payments';

// Get functions instances for different regions
const functionsAU = getFunctions(getApp(), 'australia-southeast1');  // For check-in, cancel, etc.
const functionsUS = getFunctions(getApp(), 'us-central1');           // For registration functions

// Connect to emulator if in development mode
if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  try {
    connectFunctionsEmulator(functionsAU, '127.0.0.1', 5001);
    connectFunctionsEmulator(functionsUS, '127.0.0.1', 5001);
  } catch {
    // Already connected, ignore
  }
}
import { formatTime } from '../../utils/timeFormat';
import { OccurrenceManager } from './OccurrenceManager';
import { EditStandingMeetup } from './EditStandingMeetup';
import { JoinMeetupModal } from './JoinMeetupModal';
import { SessionHistory } from './SessionHistory';

interface StandingMeetupDetailProps {
  standingMeetupId: string;
  isAdmin: boolean;
  onBack: () => void;
  initialOccurrenceDate?: string; // Auto-select this occurrence on load
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const StandingMeetupDetail: React.FC<StandingMeetupDetailProps> = ({
  standingMeetupId,
  isAdmin,
  onBack,
  initialOccurrenceDate,
}) => {
  const { currentUser } = useAuth();
  const [meetup, setMeetup] = useState<StandingMeetup | null>(null);
  const [upcomingOccurrences, setUpcomingOccurrences] = useState<MeetupOccurrence[]>([]);
  const [pendingRegistrations, setPendingRegistrations] = useState<StandingMeetupRegistration[]>([]);
  const [userRegistration, setUserRegistration] = useState<StandingMeetupRegistration | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOccurrence, setSelectedOccurrence] = useState<MeetupOccurrence | null>(null);
  const [initialOccurrenceHandled, setInitialOccurrenceHandled] = useState(false);
  const [generatingsessions, setGeneratingSessions] = useState(false);
  const [generateMessage, setGenerateMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinModalType, setJoinModalType] = useState<'season_pass' | 'pick_and_pay'>('pick_and_pay');

  // Session history state
  const [showHistory, setShowHistory] = useState(false);

  // Multi-select session cancellation state
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [showBulkCancelModal, setShowBulkCancelModal] = useState(false);
  const [bulkCancelReason, setBulkCancelReason] = useState('');
  const [bulkCancelling, setBulkCancelling] = useState(false);

  // Player session detail expansion (to see who's coming)
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [expandedSessionPlayers, setExpandedSessionPlayers] = useState<(OccurrenceParticipant & { odUserId: string })[]>([]);

  // Player withdraw from session state
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawOccurrence, setWithdrawOccurrence] = useState<MeetupOccurrence | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  useEffect(() => {
    // Subscribe to standing meetup
    const unsubMeetup = subscribeToStandingMeetup(standingMeetupId, (data) => {
      setMeetup(data);
      setLoading(false);
    });

    // Subscribe to upcoming occurrences
    const unsubOccurrences = subscribeToOccurrences(
      standingMeetupId,
      (occurrences) => {
        // Filter out cancelled sessions - only show scheduled/in_progress
        const activeOccurrences = occurrences.filter(o => o.status !== 'cancelled');
        setUpcomingOccurrences(activeOccurrences);
        // Auto-select initial occurrence if provided and not yet handled (admin only)
        // Players don't have access to OccurrenceManager so skip auto-selection
        if (initialOccurrenceDate && !initialOccurrenceHandled && isAdmin) {
          const targetOccurrence = activeOccurrences.find(o => o.date === initialOccurrenceDate);
          if (targetOccurrence) {
            setSelectedOccurrence(targetOccurrence);
            setInitialOccurrenceHandled(true);
          }
        }
      },
      { upcoming: true, limit: 12 } // Increased limit to account for filtered cancelled sessions
    );

    // Subscribe to pending registrations (bank transfers awaiting confirmation)
    const unsubPending = subscribeToPendingRegistrations(
      standingMeetupId,
      (registrations) => {
        setPendingRegistrations(registrations);
      }
    );

    // Subscribe to current user's registration status (for player join UI)
    // IMPORTANT: Use currentUser.uid (Firebase Auth UID) because that's what the
    // Cloud Function uses to create the registration ID
    let unsubUserReg: (() => void) | null = null;
    if (currentUser?.uid) {
      unsubUserReg = subscribeToUserRegistrationForMeetup(
        standingMeetupId,
        currentUser.uid,
        (registration) => {
          setUserRegistration(registration);
        }
      );
    }

    return () => {
      try {
        unsubMeetup();
        unsubOccurrences();
        unsubPending();
        if (unsubUserReg) unsubUserReg();
      } catch (err) {
        // Ignore Firestore SDK errors during cleanup (race condition bug in SDK 12.6.0)
        console.debug('Subscription cleanup error (safe to ignore):', err);
      }
    };
  }, [standingMeetupId, initialOccurrenceDate, initialOccurrenceHandled, currentUser?.uid]);

  // Subscribe to occurrence participants when a session is expanded (player view)
  // This shows who is expected to attend (paid players added to the session)
  useEffect(() => {
    if (!expandedSessionId) {
      setExpandedSessionPlayers([]);
      return;
    }

    const unsubscribe = subscribeToOccurrenceParticipants(
      standingMeetupId,
      expandedSessionId,
      (participants) => {
        // Filter to only expected/checked_in participants (not no_show)
        const expectedPlayers = participants.filter(p => p.status === 'expected' || p.status === 'checked_in');
        setExpandedSessionPlayers(expectedPlayers);
      }
    );

    return () => unsubscribe();
  }, [standingMeetupId, expandedSessionId]);

  // Generate weekly sessions handler
  const handleGenerateSessions = async () => {
    setGeneratingSessions(true);
    setGenerateMessage(null);

    try {
      const ensureOccurrences = httpsCallable<EnsureOccurrencesInput, EnsureOccurrencesOutput>(
        functionsAU,
        'standingMeetup_ensureOccurrences'
      );

      const result = await ensureOccurrences({ standingMeetupId });
      const createdCount = result.data.created.length;
      const skippedCount = result.data.skippedCancelled?.length || 0;

      if (createdCount > 0) {
        let message = `Created ${createdCount} new session(s)`;
        if (skippedCount > 0) {
          message += `. ${skippedCount} cancelled session(s) were skipped.`;
        }
        setGenerateMessage({
          type: 'success',
          text: message,
        });
      } else if (skippedCount > 0) {
        setGenerateMessage({
          type: 'success',
          text: `${skippedCount} cancelled session(s) were skipped. No new sessions needed.`,
        });
      } else {
        setGenerateMessage({
          type: 'success',
          text: `All sessions already exist (${result.data.existing} sessions)`,
        });
      }
    } catch (error) {
      console.error('Failed to generate sessions:', error);
      setGenerateMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to generate sessions',
      });
    } finally {
      setGeneratingSessions(false);
    }
  };

  // Currency formatter
  const formatCurrency = (cents: number): string => {
    const currency = meetup?.billing.currency || 'nzd';
    const symbol = currency === 'usd' ? 'US$' : currency === 'aud' ? 'A$' : '$';
    return `${symbol}${(cents / 100).toFixed(2)}`;
  };

  // Handle marking a bank transfer payment as paid
  const handleMarkAsPaid = async (registrationId: string, _amount: number) => {
    setMarkingPaidId(registrationId);
    try {
      const confirmBankPayment = httpsCallable<ConfirmBankPaymentInput, ConfirmBankPaymentOutput>(
        functionsUS,  // Registration functions are in us-central1
        'standingMeetup_confirmBankPayment'
      );
      await confirmBankPayment({ registrationId });
      // Registration list will auto-update via subscription
    } catch (error) {
      console.error('Failed to confirm payment:', error);
      alert(error instanceof Error ? error.message : 'Failed to confirm payment');
    } finally {
      setMarkingPaidId(null);
    }
  };

  // Bulk cancel multiple sessions
  const handleBulkCancel = async () => {
    setBulkCancelling(true);
    const cancelFn = httpsCallable(functionsAU, 'standingMeetup_cancelOccurrence');

    let successCount = 0;
    let errorCount = 0;

    for (const dateId of selectedSessionIds) {
      try {
        await cancelFn({
          standingMeetupId,
          dateId,
          reason: bulkCancelReason || 'Bulk cancelled by organizer',
        });
        successCount++;
      } catch (err: any) {
        // Ignore "already cancelled" errors - count as success
        if (err.message?.includes('already cancelled')) {
          successCount++;
        } else {
          errorCount++;
        }
      }
    }

    setShowBulkCancelModal(false);
    setBulkCancelReason('');
    setSelectedSessionIds(new Set());
    setBulkCancelling(false);

    // Show feedback
    if (errorCount > 0) {
      setGenerateMessage({
        type: 'error',
        text: `Cancelled ${successCount} session(s), ${errorCount} failed`,
      });
    } else {
      setGenerateMessage({
        type: 'success',
        text: `Successfully cancelled ${successCount} session(s)`,
      });
    }
  };

  // Player withdraw from a single session
  const handleWithdraw = async () => {
    if (!withdrawOccurrence || !currentUser) return;

    setWithdrawing(true);
    setWithdrawError(null);

    try {
      const cancelFn = httpsCallable<
        { standingMeetupId: string; dateId: string },
        { credited: boolean; creditAmount?: number; reason: string }
      >(functionsAU, 'standingMeetup_cancelAttendance');

      const result = await cancelFn({
        standingMeetupId,
        dateId: withdrawOccurrence.id,
      });

      setShowWithdrawModal(false);
      setWithdrawOccurrence(null);

      // Show feedback
      if (result.data.credited && result.data.creditAmount) {
        setGenerateMessage({
          type: 'success',
          text: `Withdrawn from session. Credit of ${formatCurrency(result.data.creditAmount)} issued to your wallet.`,
        });
      } else {
        setGenerateMessage({
          type: 'success',
          text: 'Successfully withdrawn from session.',
        });
      }
    } catch (error: any) {
      console.error('Failed to withdraw from session:', error);
      const errorCode = error.code || error.message || '';
      if (errorCode.includes('NOT_PARTICIPANT')) {
        setWithdrawError('You are not registered for this session.');
      } else if (errorCode.includes('ALREADY_CANCELLED')) {
        setWithdrawError('You have already withdrawn from this session.');
      } else if (errorCode.includes('OCCURRENCE_PASSED')) {
        setWithdrawError('This session has already started or passed.');
      } else {
        setWithdrawError(error.message || 'Failed to withdraw from session.');
      }
    } finally {
      setWithdrawing(false);
    }
  };

  // Check if user can get credit for withdrawing from this occurrence
  const getWithdrawCreditInfo = (occurrence: MeetupOccurrence): { canGetCredit: boolean; cutoffTime: Date } => {
    const cutoffHours = meetup?.credits.cancellationCutoffHours || 24;
    const cutoffTime = new Date(occurrence.startAt - cutoffHours * 60 * 60 * 1000);
    const canGetCredit = meetup?.credits.enabled && Date.now() <= cutoffTime.getTime();
    return { canGetCredit, cutoffTime };
  };

  // Transform pending registrations to PendingPaymentItem format
  const pendingPaymentItems: PendingPaymentItem[] = pendingRegistrations.map((reg) => ({
    id: reg.id,
    displayName: reg.userName,
    amount: reg.amount,
    reference: reg.bankTransferReference,
    subtitle: `Registered ${new Date(reg.createdAt).toLocaleDateString('en-NZ')}`,
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-500"></div>
      </div>
    );
  }

  if (!meetup) {
    return (
      <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 text-center">
        <h3 className="text-lg font-semibold text-white mb-2">Meetup Not Found</h3>
        <p className="text-gray-400 mb-4">This standing meetup may have been deleted.</p>
        <button
          onClick={onBack}
          className="text-green-400 hover:text-green-300 font-medium"
        >
          ← Back to Standing Meetups
        </button>
      </div>
    );
  }

  const formatOccurrenceDate = (occurrence: MeetupOccurrence) => {
    const date = new Date(occurrence.date + 'T00:00:00');
    return date.toLocaleDateString('en-NZ', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusBadge = (status: MeetupOccurrence['status']) => {
    switch (status) {
      case 'scheduled':
        return <span className="px-2 py-0.5 bg-blue-600/30 text-blue-400 text-xs rounded-full">Scheduled</span>;
      case 'in_progress':
        return <span className="px-2 py-0.5 bg-green-600/30 text-green-400 text-xs rounded-full">In Progress</span>;
      case 'completed':
        return <span className="px-2 py-0.5 bg-gray-600/30 text-gray-400 text-xs rounded-full">Completed</span>;
      case 'cancelled':
        return <span className="px-2 py-0.5 bg-red-600/30 text-red-400 text-xs rounded-full">Cancelled</span>;
      default:
        return null;
    }
  };

  // Get user's registration status for a specific session
  const getUserSessionStatus = (sessionId: string): 'paid' | 'pending' | null => {
    if (!userRegistration || userRegistration.status !== 'active') {
      return null;
    }

    // Season pass (paid) = registered for ALL sessions
    if (userRegistration.registrationType === 'season_pass' && userRegistration.paymentStatus === 'paid') {
      return 'paid';
    }

    // Pick-and-pay: Use paidSessionIds/pendingSessionIds if available (combined registration)
    // This handles the case where user has multiple registrations with different payment statuses
    if (userRegistration.paidSessionIds?.includes(sessionId)) {
      return 'paid';
    }
    if (userRegistration.pendingSessionIds?.includes(sessionId)) {
      return 'pending';
    }

    // Fallback: check selectedSessionIds with overall payment status
    if (userRegistration.selectedSessionIds?.includes(sessionId)) {
      return userRegistration.paymentStatus;
    }

    return null;
  };

  // Render user registration badge for a session
  const getUserRegistrationBadge = (sessionId: string) => {
    const status = getUserSessionStatus(sessionId);
    if (!status) return null;

    if (status === 'paid') {
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 bg-green-600/30 text-green-400 text-xs rounded-full">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Registered
        </span>
      );
    }

    if (status === 'pending') {
      return (
        <span className="flex items-center gap-1 px-2 py-0.5 bg-yellow-600/30 text-yellow-400 text-xs rounded-full">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Pending
        </span>
      );
    }

    return null;
  };

  // Show OccurrenceManager when an occurrence is selected (admin only)
  // Players don't have access to session management - they see the main detail view
  if (selectedOccurrence && meetup && isAdmin) {
    return (
      <OccurrenceManager
        standingMeetupId={standingMeetupId}
        occurrence={selectedOccurrence}
        meetupTitle={meetup.title}
        onBack={() => setSelectedOccurrence(null)}
        perSessionAmount={meetup.billing.perSessionAmount}
        currency={meetup.billing.currency}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Back Button */}
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
          <h2 className="text-xl font-bold text-white">{meetup.title}</h2>
          <p className="text-gray-400 text-sm">{meetup.clubName}</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowEditModal(true)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Edit
            </button>
          </div>
        )}
      </div>

      {/* Overview Card */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">Overview</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Schedule */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-600/20 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
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

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

          {/* Pricing & Capacity */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-600/20 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-white font-medium">
                  ${((meetup.billing.perSessionAmount || meetup.billing.amount) / 100).toFixed(2)} / session
                </p>
                <p className="text-gray-400 text-sm">
                  {meetup.billing.feesPaidBy === 'player' ? 'Player pays fees' : 'Fees included'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-600/20 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div>
                <p className="text-white font-medium">
                  {meetup.subscriberCount} / {meetup.maxPlayers} subscribers
                </p>
                <p className="text-gray-400 text-sm">
                  {meetup.maxPlayers - meetup.subscriberCount} spots available
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Description */}
        {meetup.description && (
          <div className="mt-4 pt-4 border-t border-gray-700">
            <p className="text-gray-300">{meetup.description}</p>
          </div>
        )}
      </div>

      {/* Player Join Section (Show for all users) */}
      {currentUser && (
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          {/* Admin Preview Notice */}
          {isAdmin && (
            <div className="mb-4 p-3 bg-blue-900/20 border border-blue-700/50 rounded-lg">
              <p className="text-blue-400 text-sm">
                <strong>Admin Preview:</strong> This is what players see when they visit this meetup.
              </p>
            </div>
          )}

          {/* Already Registered - Show Status */}
          {userRegistration && userRegistration.status === 'active' ? (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-3 h-3 rounded-full ${
                  userRegistration.paymentStatus === 'paid' ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'
                }`}></div>
                <h3 className="text-lg font-semibold text-white">
                  {userRegistration.paymentStatus === 'paid' ? 'You\'re Registered!' : 'Registration Pending'}
                </h3>
              </div>

              {userRegistration.paymentStatus === 'pending' ? (
                <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-4">
                  <p className="text-yellow-400 text-sm mb-2">
                    <strong>Awaiting payment confirmation</strong>
                  </p>
                  <p className="text-gray-400 text-sm">
                    Please complete your bank transfer. Once confirmed by the organizer, you'll be added to the sessions.
                  </p>

                  {/* Bank Details */}
                  {meetup.paymentMethods?.bankDetails?.showToPlayers && (
                    <div className="mt-4 pt-4 border-t border-yellow-700/30">
                      <p className="text-yellow-400 text-sm font-medium mb-2">Bank Details</p>
                      <div className="space-y-1 text-sm">
                        {meetup.paymentMethods.bankDetails.bankName && (
                          <p className="text-gray-400">
                            Bank: <span className="text-white">{meetup.paymentMethods.bankDetails.bankName}</span>
                          </p>
                        )}
                        {meetup.paymentMethods.bankDetails.accountName && (
                          <p className="text-gray-400">
                            Account Name: <span className="text-white">{meetup.paymentMethods.bankDetails.accountName}</span>
                          </p>
                        )}
                        {meetup.paymentMethods.bankDetails.accountNumber && (
                          <p className="text-gray-400">
                            Account Number: <span className="text-white font-mono">{meetup.paymentMethods.bankDetails.accountNumber}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {userRegistration.bankTransferReference && (
                    <p className="text-gray-500 text-xs mt-3">
                      Reference: <span className="text-white font-mono">{userRegistration.bankTransferReference}</span>
                    </p>
                  )}
                </div>
              ) : (
                <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-4">
                  <p className="text-green-400 text-sm">
                    {userRegistration.registrationType === 'season_pass' ? (
                      <>You have a <strong>Season Pass</strong> - access to all sessions!</>
                    ) : (
                      <>You're registered for <strong>{userRegistration.sessionCount} session{userRegistration.sessionCount !== 1 ? 's' : ''}</strong></>
                    )}
                  </p>
                  <p className="text-gray-500 text-xs mt-2">
                    Amount paid: {formatCurrency(userRegistration.amount)}
                  </p>

                  {/* Add More Sessions button (only for pick_and_pay, not season_pass) */}
                  {userRegistration.registrationType === 'pick_and_pay' && meetup.billing.perSessionAmount && (
                    <button
                      onClick={() => {
                        setJoinModalType('pick_and_pay');
                        setShowJoinModal(true);
                      }}
                      className="mt-4 w-full bg-lime-600 hover:bg-lime-500 text-white py-2 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      Add More Sessions
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Not Registered - Show Join Options */
            <div>
              <h3 className="text-lg font-semibold text-white mb-4">Join This Weekly Meetup</h3>

              {/* Check if spots available */}
              {meetup.subscriberCount >= meetup.maxPlayers ? (
                <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-4 text-center">
                  <p className="text-red-400 font-medium">This meetup is currently full</p>
                  <p className="text-gray-500 text-sm mt-1">{meetup.subscriberCount}/{meetup.maxPlayers} subscribers</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Season Pass Option (if enabled) */}
                  {meetup.billing.amount > 0 && (
                    <button
                      onClick={() => {
                        setJoinModalType('season_pass');
                        setShowJoinModal(true);
                      }}
                      className="w-full bg-gradient-to-r from-lime-600/20 to-green-600/20 hover:from-lime-600/30 hover:to-green-600/30 border border-lime-500/50 rounded-xl p-4 text-left transition-all group"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-lime-400 text-lg">⭐</span>
                            <span className="text-white font-semibold">Season Pass</span>
                            <span className="text-xs bg-lime-500/20 text-lime-400 px-2 py-0.5 rounded-full">Best Value</span>
                          </div>
                          <p className="text-gray-400 text-sm mt-1">
                            All {upcomingOccurrences.length} remaining sessions
                          </p>
                          <p className="text-lime-400 font-bold text-lg mt-1">
                            {formatCurrency(meetup.billing.amount)}
                            <span className="text-gray-500 text-sm font-normal ml-2">
                              ({formatCurrency(Math.round(meetup.billing.amount / Math.max(upcomingOccurrences.length, 1)))}/session)
                            </span>
                          </p>
                        </div>
                        <svg className="w-6 h-6 text-lime-400 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>
                  )}

                  {/* Pay Per Session Option - show if perSessionAmount OR amount is set (backwards compat) */}
                  {(meetup.billing.perSessionAmount > 0 || (meetup.billing.amount > 0 && !meetup.billing.perSessionAmount)) && (
                    <button
                      onClick={() => {
                        setJoinModalType('pick_and_pay');
                        setShowJoinModal(true);
                      }}
                      className="w-full bg-gray-700/50 hover:bg-gray-700 border border-gray-600 rounded-xl p-4 text-left transition-all group"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-blue-400 text-lg">🎯</span>
                            <span className="text-white font-semibold">Pay Per Session</span>
                          </div>
                          <p className="text-gray-400 text-sm mt-1">
                            Select specific weeks to attend
                          </p>
                          <p className="text-white font-bold text-lg mt-1">
                            {formatCurrency(meetup.billing.perSessionAmount || meetup.billing.amount)}
                            <span className="text-gray-500 text-sm font-normal ml-1">/session</span>
                          </p>
                        </div>
                        <svg className="w-6 h-6 text-gray-400 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>
                  )}

                  {/* No payment options configured */}
                  {!meetup.billing.amount && !meetup.billing.perSessionAmount && (
                    <div className="bg-gray-700/50 rounded-lg p-4 text-center">
                      <p className="text-gray-400">Registration not available yet</p>
                      <p className="text-gray-500 text-sm">Contact the organizer for details</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Pending Bank Transfer Payments (Admin only) */}
      {isAdmin && pendingPaymentItems.length > 0 && (
        <PendingPaymentsList
          items={pendingPaymentItems}
          onMarkAsPaid={handleMarkAsPaid}
          markingPaidId={markingPaidId}
          formatCurrency={formatCurrency}
          title="Pending Bank Transfer Registrations"
        />
      )}

      {/* Upcoming Sessions */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold text-white">Upcoming Sessions</h3>
            {/* Select All checkbox for admins */}
            {isAdmin && upcomingOccurrences.length > 0 && (
              <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedSessionIds.size === upcomingOccurrences.length && upcomingOccurrences.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedSessionIds(new Set(upcomingOccurrences.map(o => o.id)));
                    } else {
                      setSelectedSessionIds(new Set());
                    }
                  }}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-lime-500 focus:ring-lime-500 focus:ring-offset-0"
                />
                Select All
              </label>
            )}
          </div>
          <span className="text-sm text-gray-400">
            {selectedSessionIds.size > 0
              ? `${selectedSessionIds.size} selected`
              : `${upcomingOccurrences.length} sessions`}
          </span>
        </div>

        {upcomingOccurrences.length === 0 ? (
          <div className="text-center py-8">
            <svg className="w-12 h-12 text-gray-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-gray-400">No upcoming sessions scheduled</p>
            <p className="text-gray-500 text-sm mt-1">Sessions will be generated automatically</p>
          </div>
        ) : (
          <div className="space-y-3">
            {upcomingOccurrences.map((occurrence) => (
              <div key={occurrence.id}>
                <div
                  onClick={() => {
                    // Players can click to expand and see who's registered
                    if (!isAdmin) {
                      setExpandedSessionId(expandedSessionId === occurrence.id ? null : occurrence.id);
                    }
                  }}
                  className={`flex items-center justify-between p-4 bg-gray-900/50 rounded-lg border transition-colors ${
                    selectedSessionIds.has(occurrence.id)
                      ? 'border-lime-500/50 bg-lime-500/5'
                      : expandedSessionId === occurrence.id
                      ? 'border-lime-500/50 bg-gray-800 rounded-b-none'
                      : 'border-gray-700 hover:border-gray-600'
                  } ${!isAdmin ? 'cursor-pointer' : ''}`}
                >
                  <div className="flex items-center gap-4">
                    {/* Checkbox for multi-select (admin only) */}
                    {isAdmin && (
                      <input
                        type="checkbox"
                        checked={selectedSessionIds.has(occurrence.id)}
                        onChange={(e) => {
                          const newSet = new Set(selectedSessionIds);
                          if (e.target.checked) {
                            newSet.add(occurrence.id);
                          } else {
                            newSet.delete(occurrence.id);
                          }
                          setSelectedSessionIds(newSet);
                        }}
                        className="w-5 h-5 rounded border-gray-600 bg-gray-700 text-lime-500 focus:ring-lime-500 focus:ring-offset-0 cursor-pointer"
                      />
                    )}
                    <div className="text-center min-w-[60px]">
                      <p className="text-white font-bold text-lg">
                        {new Date(occurrence.date + 'T00:00:00').getDate()}
                      </p>
                      <p className="text-gray-400 text-xs uppercase">
                        {new Date(occurrence.date + 'T00:00:00').toLocaleDateString('en-NZ', { month: 'short' })}
                      </p>
                    </div>
                    <div>
                      <p className="text-white font-medium">
                        {formatOccurrenceDate(occurrence)}
                      </p>
                      <p className="text-gray-400 text-sm">
                        {formatTime(occurrence.startTime)} - {formatTime(occurrence.endTime)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* Attendance counts - different display for admin vs player */}
                    <div className="text-right">
                      {isAdmin ? (
                        <>
                          <p className="text-white text-sm">
                            <span className="text-green-400">{occurrence.checkedInCount}</span>
                            {' / '}
                            <span className="text-gray-400">{occurrence.expectedCount}</span>
                          </p>
                          <p className="text-gray-500 text-xs">checked in</p>
                        </>
                      ) : (
                        <>
                          <p className="text-white text-sm">
                            <span className="text-lime-400">{occurrence.expectedCount}</span>
                            {' / '}
                            <span className="text-gray-400">{meetup?.maxPlayers || 16}</span>
                          </p>
                          <p className="text-gray-500 text-xs">players</p>
                        </>
                      )}
                    </div>

                    {/* User registration badge (for players) */}
                    {!isAdmin && getUserRegistrationBadge(occurrence.id)}

                    {/* Status badge */}
                    {getStatusBadge(occurrence.status)}

                    {/* Expand indicator for players */}
                    {!isAdmin && (
                      <svg
                        className={`w-5 h-5 text-gray-400 transition-transform ${
                          expandedSessionId === occurrence.id ? 'rotate-180' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    )}

                    {/* Manage button for admins */}
                    {isAdmin && (
                      <button
                        onClick={() => setSelectedOccurrence(occurrence)}
                        className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        Manage
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Player List (for players only) */}
                {!isAdmin && expandedSessionId === occurrence.id && (
                  <div className="bg-gray-800 border border-t-0 border-lime-500/50 rounded-b-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium text-white">
                        Players ({expandedSessionPlayers.length}/{meetup?.maxPlayers || 16})
                      </h4>
                      <span className="text-xs text-gray-500">
                        {(meetup?.maxPlayers || 16) - expandedSessionPlayers.length} spots available
                      </span>
                    </div>
                    {expandedSessionPlayers.length === 0 ? (
                      <p className="text-gray-500 text-sm">No players registered yet</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {expandedSessionPlayers.map((participant) => (
                          <div
                            key={participant.odUserId}
                            className="flex items-center gap-2 p-2 bg-gray-900/50 rounded-lg"
                          >
                            <div className="w-7 h-7 bg-lime-600/30 rounded-full flex items-center justify-center flex-shrink-0">
                              <span className="text-lime-400 font-medium text-xs">
                                {participant.userName.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <span className="text-white text-sm truncate">{participant.userName}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Withdraw button - only show if user is registered for this session */}
                    {getUserSessionStatus(occurrence.id) === 'paid' && occurrence.startAt > Date.now() && (
                      <div className="mt-4 pt-4 border-t border-gray-700">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setWithdrawOccurrence(occurrence);
                            setShowWithdrawModal(true);
                            setWithdrawError(null);
                          }}
                          className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-sm font-medium transition-colors border border-red-600/30"
                        >
                          Withdraw from this session
                        </button>
                        {meetup?.credits.enabled && (
                          <p className="text-gray-500 text-xs mt-2">
                            {getWithdrawCreditInfo(occurrence).canGetCredit
                              ? `Cancel before ${getWithdrawCreditInfo(occurrence).cutoffTime.toLocaleString('en-NZ', { dateStyle: 'short', timeStyle: 'short' })} to receive a credit.`
                              : 'Cancellation cutoff has passed. No credit will be issued.'}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Admin Actions */}
      {isAdmin && (
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Admin Actions</h3>

          {/* Generate message feedback */}
          {generateMessage && (
            <div className={`mb-4 p-3 rounded-lg text-sm ${
              generateMessage.type === 'success'
                ? 'bg-green-900/30 border border-green-700 text-green-400'
                : 'bg-red-900/30 border border-red-700 text-red-400'
            }`}>
              {generateMessage.text}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleGenerateSessions}
              disabled={generatingsessions}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-green-600/50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              {generatingsessions ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              )}
              {generatingsessions ? 'Generating...' : 'Generate Weekly Sessions'}
            </button>
            <button
              onClick={() => {/* TODO: View subscribers */}}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              View Subscribers
            </button>
            <button
              onClick={() => setShowHistory(!showHistory)}
              aria-expanded={showHistory}
              className={`px-4 py-2 ${showHistory ? 'bg-lime-600 hover:bg-lime-500' : 'bg-gray-700 hover:bg-gray-600'} text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {showHistory ? 'Hide History' : 'Session History'}
            </button>
            {meetup.status === 'active' ? (
              <button
                onClick={() => {/* TODO: Archive meetup */}}
                className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
                Archive Meetup
              </button>
            ) : (
              <span className="px-4 py-2 bg-gray-700/50 text-gray-500 rounded-lg text-sm">
                Status: {meetup.status}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Session History (admin only, lazy loaded) */}
      {isAdmin && showHistory && meetup && (
        <SessionHistory
          standingMeetupId={standingMeetupId}
          meetupTitle={meetup.title}
          currency={meetup.billing.currency}
          perSessionAmount={meetup.billing.perSessionAmount}
          onSelectOccurrence={(occurrence) => setSelectedOccurrence(occurrence)}
        />
      )}

      {/* Edit Modal */}
      {showEditModal && meetup && (
        <EditStandingMeetup
          meetup={meetup}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => {
            setShowEditModal(false);
            // Meetup will auto-update via subscription
          }}
        />
      )}

      {/* Bulk Actions Bar - Fixed at bottom when sessions selected */}
      {selectedSessionIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700 p-4 z-40">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <span className="text-white font-medium">
              {selectedSessionIds.size} session{selectedSessionIds.size !== 1 ? 's' : ''} selected
            </span>
            <div className="flex gap-3">
              <button
                onClick={() => setSelectedSessionIds(new Set())}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Clear Selection
              </button>
              <button
                onClick={() => setShowBulkCancelModal(true)}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Cancel {selectedSessionIds.size} Session{selectedSessionIds.size !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Cancel Modal */}
      {showBulkCancelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">
              Cancel {selectedSessionIds.size} Session{selectedSessionIds.size !== 1 ? 's' : ''}
            </h3>
            <p className="text-gray-400 mb-4">
              Are you sure you want to cancel these sessions?
            </p>
            <ul className="mb-4 max-h-40 overflow-y-auto space-y-1 bg-gray-900/50 rounded-lg p-3">
              {upcomingOccurrences
                .filter(o => selectedSessionIds.has(o.id))
                .map(o => (
                  <li key={o.id} className="text-sm text-gray-300 flex justify-between">
                    <span>{formatOccurrenceDate(o)}</span>
                    <span className="text-gray-500">{o.expectedCount} participants</span>
                  </li>
                ))}
            </ul>
            <p className="text-yellow-400 text-sm mb-4">
              This will notify all expected participants and may issue credits.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Reason (optional)
              </label>
              <textarea
                value={bulkCancelReason}
                onChange={(e) => setBulkCancelReason(e.target.value)}
                placeholder="e.g., School holidays, venue closed..."
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-lime-500"
                rows={2}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowBulkCancelModal(false);
                  setBulkCancelReason('');
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Keep Sessions
              </button>
              <button
                onClick={handleBulkCancel}
                disabled={bulkCancelling}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {bulkCancelling ? 'Cancelling...' : `Cancel ${selectedSessionIds.size} Sessions`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Player Withdraw Modal */}
      {showWithdrawModal && withdrawOccurrence && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full border border-gray-700">
            <h3 className="text-lg font-semibold text-white mb-4">
              Withdraw from Session
            </h3>
            <p className="text-gray-400 mb-2">
              Are you sure you want to withdraw from this session?
            </p>
            <div className="bg-gray-900/50 rounded-lg p-3 mb-4">
              <p className="text-white font-medium">{formatOccurrenceDate(withdrawOccurrence)}</p>
              <p className="text-gray-400 text-sm">
                {formatTime(withdrawOccurrence.startTime)} - {formatTime(withdrawOccurrence.endTime)}
              </p>
            </div>

            {meetup?.credits.enabled ? (
              getWithdrawCreditInfo(withdrawOccurrence).canGetCredit ? (
                <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-3 mb-4">
                  <p className="text-green-400 text-sm">
                    You will receive a credit to your wallet that can be used for future sessions.
                  </p>
                </div>
              ) : (
                <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3 mb-4">
                  <p className="text-yellow-400 text-sm">
                    The cancellation cutoff has passed. No credit will be issued.
                  </p>
                  <p className="text-gray-500 text-xs mt-1">
                    Cutoff was: {getWithdrawCreditInfo(withdrawOccurrence).cutoffTime.toLocaleString('en-NZ', { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                </div>
              )
            ) : (
              <div className="bg-gray-900/50 rounded-lg p-3 mb-4">
                <p className="text-gray-400 text-sm">
                  Credits are not enabled for this meetup. No refund will be issued.
                </p>
              </div>
            )}

            {withdrawError && (
              <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 mb-4">
                <p className="text-red-400 text-sm">{withdrawError}</p>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowWithdrawModal(false);
                  setWithdrawOccurrence(null);
                  setWithdrawError(null);
                }}
                disabled={withdrawing}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleWithdraw}
                disabled={withdrawing}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {withdrawing ? 'Withdrawing...' : 'Withdraw'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Join Meetup Modal */}
      {showJoinModal && meetup && (
        <JoinMeetupModal
          meetup={meetup}
          occurrences={upcomingOccurrences}
          registrationType={joinModalType}
          onClose={() => setShowJoinModal(false)}
          onSuccess={() => {
            // Registration submitted - modal will show success or redirect to Stripe
          }}
          existingRegistration={userRegistration}
        />
      )}
    </div>
  );
};

export default StandingMeetupDetail;

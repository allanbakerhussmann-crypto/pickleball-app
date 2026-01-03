/**
 * PlayerMatchCard Component
 *
 * Shows a player's current/upcoming match with full player flow:
 * - "We're Ready" button to start match (any player can tap)
 * - "Propose Score" button opens ScoreEntryModal (DUPR-compliant label)
 * - "Sign to Acknowledge" / "Dispute Score" buttons for score verification
 * - "Report No-Show" button after 10 min timeout
 *
 * DUPR-COMPLIANT LABELS (V07.04):
 * - "Propose Score" (not "Enter Score")
 * - "Sign to Acknowledge" (not "Confirm")
 * - "Dispute Score" (not just "Dispute")
 * - "Awaiting organiser approval" (after opponent signs)
 *
 * FILE LOCATION: components/tournament/PlayerMatchCard.tsx
 * VERSION: V07.04 - DUPR-Compliant Labels
 */

import React, { useState, useEffect, useMemo } from 'react';
import type { Match, GameScore } from '../../types/game/match';
import type { GameSettings } from '../../types/game/gameSettings';
import type { DisputeReason, MatchVerificationData } from '../../types';
import { updateMatchScore } from '../../services/firebase';
import { ScoreEntryModal } from '../shared/ScoreEntryModal';

interface PlayerMatchCardProps {
  match: Match;
  tournamentId: string;
  currentUserId: string;
  gameSettings?: GameSettings;
  onMatchStarted?: () => void;
  onScoreSubmitted?: () => void;
  onScoreConfirmed?: () => void;
  onScoreDisputed?: () => void;
  onNoShowReported?: () => void;
}

// Default game settings
const DEFAULT_GAME_SETTINGS: GameSettings = {
  playType: 'doubles',
  pointsPerGame: 11,
  winBy: 2,
  bestOf: 1,
};

// No-show timeout in milliseconds (10 minutes)
const NO_SHOW_TIMEOUT_MS = 10 * 60 * 1000;

export const PlayerMatchCard: React.FC<PlayerMatchCardProps> = ({
  match,
  tournamentId,
  currentUserId,
  gameSettings = DEFAULT_GAME_SETTINGS,
  onMatchStarted,
  onScoreSubmitted,
  onScoreConfirmed,
  onScoreDisputed,
  onNoShowReported,
}) => {
  const [isStarting, setIsStarting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [showNoShowTimeout, setShowNoShowTimeout] = useState(false);

  // Check if current user is a participant in this match
  const isParticipant =
    match.sideA?.playerIds?.includes(currentUserId) ||
    match.sideB?.playerIds?.includes(currentUserId);

  // Determine which side the user is on
  const userSide = match.sideA?.playerIds?.includes(currentUserId)
    ? 'sideA'
    : match.sideB?.playerIds?.includes(currentUserId)
    ? 'sideB'
    : null;

  // Check if user is on the opponent's side (for confirm/dispute)
  const isOpponentOfSubmitter = useMemo(() => {
    if (!match.submittedByUserId) return false;
    // If the current user did NOT submit, they are the opponent
    return match.submittedByUserId !== currentUserId && isParticipant;
  }, [match.submittedByUserId, currentUserId, isParticipant]);

  // Check for no-show timeout (10 minutes after court assignment)
  useEffect(() => {
    if (!match.court || match.status !== 'scheduled') {
      setShowNoShowTimeout(false);
      return;
    }

    // Use match.scheduledDate or createdAt as reference for when court was assigned
    // Note: scheduledDate is a timestamp, scheduledTime is HH:MM string
    const assignedAt = match.scheduledDate || match.createdAt || Date.now();
    const now = Date.now();
    const timeOnCourt = now - assignedAt;

    if (timeOnCourt >= NO_SHOW_TIMEOUT_MS) {
      setShowNoShowTimeout(true);
    } else {
      // Set timer for when timeout will occur
      const timeUntilTimeout = NO_SHOW_TIMEOUT_MS - timeOnCourt;
      const timer = setTimeout(() => {
        setShowNoShowTimeout(true);
      }, timeUntilTimeout);
      return () => clearTimeout(timer);
    }
  }, [match.court, match.status, match.scheduledDate, match.createdAt]);

  // Get team names
  const sideAName = match.sideA?.name || 'Team A';
  const sideBName = match.sideB?.name || 'Team B';

  // Determine match status display
  const isOnCourt = !!match.court;
  const isWaitingToStart = isOnCourt && match.status === 'scheduled';
  const isInProgress = match.status === 'in_progress';
  const isPendingConfirmation = match.status === 'pending_confirmation';
  const isDisputed = match.status === 'disputed';
  const isCompleted = match.status === 'completed';

  // Handle "We're Ready" - starts match for all players
  const handleWeAreReady = async () => {
    if (!isParticipant || !isWaitingToStart) return;

    setIsStarting(true);
    try {
      await updateMatchScore(tournamentId, match.id, {
        status: 'in_progress',
        startedAt: Date.now(),
      });
      onMatchStarted?.();
    } catch (error) {
      console.error('Failed to start match:', error);
      alert('Failed to start match. Please try again.');
    } finally {
      setIsStarting(false);
    }
  };

  // Handle score submission from modal
  const handleScoreSubmit = async (scores: GameScore[], winnerId: string) => {
    setIsSubmitting(true);
    try {
      // Cast to any to support winnerName field (types.ts Match doesn't have it yet)
      await updateMatchScore(tournamentId, match.id, {
        scores,
        winnerId,
        winnerName: winnerId === match.sideA?.id ? sideAName : sideBName,
        status: 'pending_confirmation',
        submittedByUserId: currentUserId,
        submittedAt: Date.now(),
      } as any);
      setShowScoreModal(false);
      onScoreSubmitted?.();
    } catch (error) {
      console.error('Failed to submit score:', error);
      alert('Failed to submit score. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle score confirmation
  const handleConfirmScore = async () => {
    if (!isOpponentOfSubmitter) return;

    setIsSubmitting(true);
    try {
      await updateMatchScore(tournamentId, match.id, {
        status: 'completed',
        completedAt: Date.now(),
        // Clear court assignment so it becomes available
        court: undefined,
      });
      onScoreConfirmed?.();
    } catch (error) {
      console.error('Failed to confirm score:', error);
      alert('Failed to confirm score. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle score dispute
  const handleDisputeScore = async () => {
    if (!isOpponentOfSubmitter) return;

    const reason = prompt('Why are you disputing this score? (optional)');

    setIsSubmitting(true);
    try {
      // Build verification data with proper typing
      const verificationUpdate: MatchVerificationData = {
        verificationStatus: 'disputed',
        confirmations: match.verification?.confirmations || [],
        requiredConfirmations: match.verification?.requiredConfirmations || 1,
        disputedByUserId: currentUserId,
        disputeReason: reason ? 'other' as DisputeReason : undefined,
        disputeNotes: reason || undefined,
        disputedAt: Date.now(),
      };

      await updateMatchScore(tournamentId, match.id, {
        status: 'disputed',
        // Clear court assignment so it becomes available (dispute resolved offline)
        court: undefined,
        verification: verificationUpdate,
      });
      onScoreDisputed?.();
    } catch (error) {
      console.error('Failed to dispute score:', error);
      alert('Failed to dispute score. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle no-show report
  const handleReportNoShow = async () => {
    if (!confirm('Report opponent as no-show? This will record a forfeit win for you.')) {
      return;
    }

    setIsSubmitting(true);
    try {
      // Determine winner (the reporting player's side wins)
      const winnerId = userSide === 'sideA' ? match.sideA?.id : match.sideB?.id;
      const winnerName = userSide === 'sideA' ? sideAName : sideBName;

      // Cast to any to support winnerName field (types.ts Match doesn't have it yet)
      await updateMatchScore(tournamentId, match.id, {
        status: 'forfeit',
        winnerId,
        winnerName,
        completedAt: Date.now(),
        // Clear court assignment
        court: undefined,
      } as any);
      onNoShowReported?.();
    } catch (error) {
      console.error('Failed to report no-show:', error);
      alert('Failed to report no-show. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Format score for display
  const formatScore = (scores: GameScore[]) => {
    if (!scores || scores.length === 0) return '-';
    return scores.map(g => `${g.scoreA}-${g.scoreB}`).join(', ');
  };

  // Status badge
  const renderStatusBadge = () => {
    const base = 'inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold';

    if (isCompleted) {
      return <span className={`${base} bg-gray-600 text-white`}>Completed</span>;
    }
    if (isDisputed) {
      return <span className={`${base} bg-red-500 text-white`}>Disputed</span>;
    }
    if (isPendingConfirmation) {
      return <span className={`${base} bg-yellow-500 text-gray-900`}>Score Proposed</span>;
    }
    if (isInProgress) {
      return <span className={`${base} bg-emerald-500 text-gray-900`}>In Progress</span>;
    }
    if (isWaitingToStart) {
      return <span className={`${base} bg-blue-500 text-white`}>Ready to Start</span>;
    }
    if (isOnCourt) {
      return <span className={`${base} bg-amber-500 text-gray-900`}>Assigned</span>;
    }
    return <span className={`${base} bg-gray-700 text-gray-300`}>Waiting</span>;
  };

  if (!isParticipant) return null;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 shadow-lg">
      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="text-lg font-semibold text-white">Your Match</h3>
          {match.poolGroup && (
            <span className="text-xs text-gray-400">{match.poolGroup}</span>
          )}
        </div>
        {renderStatusBadge()}
      </div>

      {/* Match Info */}
      <div className="space-y-2 mb-4">
        <div
          className={`flex items-center justify-between p-2 rounded ${
            userSide === 'sideA' ? 'bg-lime-900/30 border border-lime-600' : 'bg-gray-900'
          }`}
        >
          <span className="text-white font-medium">{sideAName}</span>
          {userSide === 'sideA' && (
            <span className="text-xs text-lime-400 font-semibold">YOU</span>
          )}
        </div>

        <div className="text-center text-gray-500 text-xs">vs</div>

        <div
          className={`flex items-center justify-between p-2 rounded ${
            userSide === 'sideB' ? 'bg-lime-900/30 border border-lime-600' : 'bg-gray-900'
          }`}
        >
          <span className="text-white font-medium">{sideBName}</span>
          {userSide === 'sideB' && (
            <span className="text-xs text-lime-400 font-semibold">YOU</span>
          )}
        </div>
      </div>

      {/* Court Assignment */}
      {isOnCourt && (
        <div className="mb-4 p-3 bg-gray-900 rounded border border-gray-700">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-lime-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-white font-semibold">{match.court}</span>
          </div>
          {isWaitingToStart && (
            <p className="text-sm text-gray-400 mt-1">
              Head to your court and tap Start when both teams are ready.
            </p>
          )}
        </div>
      )}

      {/* Score Display (if in progress or completed) */}
      {(isInProgress || isCompleted) && match.scores && match.scores.length > 0 && (
        <div className="mb-4 p-3 bg-gray-900 rounded">
          <div className="text-sm text-gray-400 mb-1">Score</div>
          <div className="flex items-center justify-center gap-4 text-2xl font-bold">
            <span className={userSide === 'sideA' ? 'text-lime-400' : 'text-white'}>
              {match.scores[0]?.scoreA ?? 0}
            </span>
            <span className="text-gray-500">-</span>
            <span className={userSide === 'sideB' ? 'text-lime-400' : 'text-white'}>
              {match.scores[0]?.scoreB ?? 0}
            </span>
          </div>
        </div>
      )}

      {/* Pending Acknowledgement Info - DUPR-compliant language */}
      {isPendingConfirmation && (
        <div className="mb-4 p-3 bg-yellow-900/30 border border-yellow-600 rounded-lg">
          <p className="text-sm text-yellow-400">
            {isOpponentOfSubmitter ? (
              <>Score proposed: <strong>{formatScore(match.scores || [])}</strong>. Please sign to acknowledge or dispute.</>
            ) : (
              <>Score proposed: <strong>{formatScore(match.scores || [])}</strong>. Awaiting opponent acknowledgement.</>
            )}
          </p>
        </div>
      )}

      {/* Disputed Info - DUPR-compliant language */}
      {isDisputed && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-600 rounded-lg">
          <p className="text-sm text-red-400">
            Score disputed. Awaiting organiser to finalise official result.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2">
        {/* "We're Ready" button - Court assigned, waiting to start */}
        {isWaitingToStart && !showNoShowTimeout && (
          <button
            onClick={handleWeAreReady}
            disabled={isStarting || isSubmitting}
            className="w-full py-3 px-4 bg-lime-600 hover:bg-lime-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {isStarting ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Starting...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                We're Ready
              </>
            )}
          </button>
        )}

        {/* No-show timeout - show both buttons */}
        {isWaitingToStart && showNoShowTimeout && (
          <div className="space-y-2">
            <button
              onClick={handleWeAreReady}
              disabled={isStarting || isSubmitting}
              className="w-full py-3 px-4 bg-lime-600 hover:bg-lime-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              We're Ready
            </button>
            <button
              onClick={handleReportNoShow}
              disabled={isSubmitting}
              className="w-full py-2 px-4 bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Report No-Show
            </button>
          </div>
        )}

        {/* "Propose Score" button - Match in progress (DUPR-compliant label) */}
        {isInProgress && (
          <button
            onClick={() => setShowScoreModal(true)}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            Propose Score
          </button>
        )}

        {/* Sign/Dispute buttons - Pending confirmation (opponent's view) - DUPR-compliant labels */}
        {isPendingConfirmation && isOpponentOfSubmitter && (
          <div className="flex gap-2">
            <button
              onClick={handleConfirmScore}
              disabled={isSubmitting}
              className="flex-1 py-3 px-4 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Sign to Acknowledge
            </button>
            <button
              onClick={handleDisputeScore}
              disabled={isSubmitting}
              className="flex-1 py-3 px-4 bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Dispute Score
            </button>
          </div>
        )}

        {/* Waiting state - Pending confirmation (submitter's view) - DUPR-compliant label */}
        {isPendingConfirmation && !isOpponentOfSubmitter && (
          <div className="w-full py-3 px-4 bg-yellow-900/50 border border-yellow-600 text-yellow-400 font-medium rounded-lg text-center">
            Awaiting opponent acknowledgement...
          </div>
        )}

        {/* Waiting for court assignment */}
        {!isOnCourt && !isCompleted && !isPendingConfirmation && !isDisputed && (
          <div className="w-full py-3 px-4 bg-gray-700 text-gray-400 rounded-lg text-center">
            Waiting for court assignment...
          </div>
        )}
      </div>

      {/* Score Entry Modal */}
      <ScoreEntryModal
        isOpen={showScoreModal}
        onClose={() => setShowScoreModal(false)}
        match={{
          ...match,
          gameSettings: gameSettings || match.gameSettings || {
            playType: 'doubles',
            pointsPerGame: 11,
            winBy: 2,
            bestOf: 1,
          },
        }}
        onSubmit={handleScoreSubmit}
        isLoading={isSubmitting}
      />
    </div>
  );
};

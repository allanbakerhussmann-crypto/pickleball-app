/**
 * EventScoreEntryModal Component
 *
 * UNIFIED score entry modal for ALL event types (tournaments, leagues, meetups).
 * This is a THIN WRAPPER that composes shared pieces:
 * - useEventScoringState() for all permission/state logic
 * - ScoreHeader, ScoreStatusBanner, ScoreActions for UI
 *
 * ## ARCHITECTURE - READ BEFORE MODIFYING
 *
 * 1. **Don't copy this file** - If you need changes, modify the shared pieces
 * 2. **Use ScorableMatch adapter** - Never use Match | LeagueMatch union
 * 3. **Use confirmScore() wrapper** - Don't call signScore() directly
 * 4. **Firestore is truth** - UI reflects match document only
 *
 * ## Score State Machine
 * none -> proposed -> signed -> official -> submittedToDupr
 *                 \-> disputed -/
 *
 * ## Where to Make Changes
 * - Permission logic: hooks/useEventScoringState.ts
 * - UI components: components/shared/scoring/*.tsx
 * - Confirmation routing: services/firebase/confirmScore.ts
 * - Match normalization: types/game/scorableMatch.ts
 *
 * @see docs/SCORING_ARCHITECTURE.md for full documentation
 * @version V07.53
 * @file components/shared/EventScoreEntryModal.tsx
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useEventScoringState } from '../../hooks/useEventScoringState';
import { confirmScore } from '../../services/firebase/confirmScore';
import {
  proposeScore,
  finaliseResult,
  disputeScore,
} from '../../services/firebase/duprScoring';
import { rebuildAllStandingsById } from '../../services/firebase';
import type { ScorableMatch } from '../../types/game/scorableMatch';
import type { GameScore, ScoreVerificationSettings } from '../../types';
import type { EventType } from '../../types/game/match';

// Shared components
import { ScoreHeader } from './scoring/ScoreHeader';
import { MatchInfo } from './scoring/MatchInfo';
import { ScoreStatusBanner, ScoreStatusFooter } from './scoring/ScoreStatusBanner';
import {
  GameScoreEntry,
  validateGame,
  calculateWinner,
  type GameInput,
} from './scoring/GameScoreEntry';
import { ScoreSummary } from './scoring/ScoreSummary';

// ============================================
// TYPES
// ============================================

interface EventScoreEntryModalProps {
  /** Event type (tournament, league, meetup) */
  eventType: EventType;
  /** Parent event ID */
  eventId: string;
  /** Event name for notifications */
  eventName?: string;
  /** The match to score (use toScorableMatch adapter) */
  match: ScorableMatch;
  /** Best of 1, 3, or 5 games */
  bestOf: 1 | 3 | 5;
  /** Points per game (11, 15, 21) */
  pointsPerGame: 11 | 15 | 21;
  /** Win by 1 or 2 points */
  winBy: 1 | 2;
  /** Whether user is organizer for this event */
  isOrganizer?: boolean;
  /** Whether this is a DUPR-enabled event */
  isDuprEvent?: boolean;
  /** Verification settings (for legacy support) */
  verificationSettings?: ScoreVerificationSettings;
  /** Close handler */
  onClose: () => void;
  /** Success handler (called after successful action) */
  onSuccess: () => void;
}

// ============================================
// COMPONENT
// ============================================

export const EventScoreEntryModal: React.FC<EventScoreEntryModalProps> = ({
  eventType,
  eventId,
  eventName: _eventName, // Reserved for future SMS notifications
  match,
  bestOf,
  pointsPerGame,
  winBy,
  isOrganizer = false,
  isDuprEvent = false,
  verificationSettings,
  onClose,
  onSuccess,
}) => {
  const { currentUser } = useAuth();

  // Local state
  const [games, setGames] = useState<GameInput[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeReason, setDisputeReason] = useState('');

  // Get scoring state from hook
  const state = useEventScoringState(
    match,
    currentUser,
    isOrganizer,
    isDuprEvent,
    isEditMode
  );

  // Initialize games from existing scores
  useEffect(() => {
    const existingScores = match.scores || match.scoreProposal?.scores || [];
    if (existingScores.length > 0) {
      setGames(existingScores.map(s => ({
        scoreA: (s.scoreA ?? 0).toString(),
        scoreB: (s.scoreB ?? 0).toString(),
      })));
    } else {
      setGames([{ scoreA: '', scoreB: '' }]);
    }
  }, [match.scores, match.scoreProposal?.scores]);

  // ============================================
  // VALIDATION
  // ============================================

  const validateAllGames = (): { valid: boolean; error?: string } => {
    const filledGames = games.filter(g => g.scoreA !== '' || g.scoreB !== '');

    if (filledGames.length === 0) {
      return { valid: false, error: 'Please enter at least one game score' };
    }

    for (let i = 0; i < filledGames.length; i++) {
      const scoreA = parseInt(filledGames[i].scoreA);
      const scoreB = parseInt(filledGames[i].scoreB);
      const validation = validateGame(scoreA, scoreB, pointsPerGame, winBy);

      if (!validation.valid) {
        return { valid: false, error: `Game ${i + 1}: ${validation.error}` };
      }
    }

    const { winnerId, gamesA, gamesB } = calculateWinner(
      games,
      bestOf,
      match.sideA.id,
      match.sideB.id
    );

    if (!winnerId) {
      return {
        valid: false,
        error: `Match not complete. Current: ${gamesA}-${gamesB}. Need ${Math.ceil(bestOf / 2)} games to win.`,
      };
    }

    return { valid: true };
  };

  // ============================================
  // HANDLERS
  // ============================================

  /**
   * Submit (propose or finalize) the score
   */
  const handleSubmit = async () => {
    if (!currentUser) return;

    const validation = validateAllGames();
    if (!validation.valid) {
      setError(validation.error || 'Invalid scores');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Convert to GameScore format
      const scores: GameScore[] = games
        .filter(g => g.scoreA !== '' && g.scoreB !== '')
        .map((g, i) => ({
          gameNumber: i + 1,
          scoreA: parseInt(g.scoreA),
          scoreB: parseInt(g.scoreB),
        }));

      const { winnerId } = calculateWinner(
        games,
        bestOf,
        match.sideA.id,
        match.sideB.id
      );

      if (state.effectiveIsOrganizer) {
        // Organizer directly finalizes the result
        await finaliseResult(
          eventType,
          eventId,
          match.id,
          scores,
          winnerId!,
          currentUser.uid,
          isDuprEvent
        );
      } else {
        // Player proposes score, awaiting opponent acknowledgement
        await proposeScore(
          eventType,
          eventId,
          match.id,
          scores,
          winnerId!,
          currentUser.uid
        );
      }

      onSuccess();
    } catch (e: any) {
      console.error('Failed to submit score:', e);
      setError(e.message || 'Failed to submit score');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Confirm/Sign the proposed score
   */
  const handleConfirm = async () => {
    if (!currentUser) return;

    setConfirming(true);
    setError(null);

    try {
      // Use the confirmScore wrapper (fetches fresh state from DB)
      const result = await confirmScore(
        eventType,
        eventId,
        match.id,
        currentUser.uid,
        verificationSettings
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to confirm score');
      }

      onSuccess();
    } catch (e: any) {
      console.error('Failed to confirm score:', e);
      setError(e.message || 'Failed to confirm score');
    } finally {
      setConfirming(false);
    }
  };

  /**
   * Finalize a signed match (organizer action)
   */
  const handleOrganizerFinalize = async () => {
    if (!currentUser) return;

    setLoading(true);
    setError(null);

    try {
      const scores = match.scores || match.scoreProposal?.scores || [];

      if (scores.length === 0) {
        setError('No scores to finalize');
        return;
      }

      // Calculate winner from scores
      let gamesA = 0, gamesB = 0;
      for (const score of scores) {
        if ((score.scoreA ?? 0) > (score.scoreB ?? 0)) gamesA++;
        else if ((score.scoreB ?? 0) > (score.scoreA ?? 0)) gamesB++;
      }

      const winnerId = gamesA > gamesB ? match.sideA.id : match.sideB.id;

      await finaliseResult(
        eventType,
        eventId,
        match.id,
        scores,
        winnerId,
        currentUser.uid,
        isDuprEvent
      );

      onSuccess();
    } catch (e: any) {
      console.error('Failed to finalize score:', e);
      setError(e.message || 'Failed to finalize score');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Save edited scores (organizer correction)
   */
  const handleSaveEditedScore = async () => {
    if (!currentUser) return;

    const validation = validateAllGames();
    if (!validation.valid) {
      setError(validation.error || 'Invalid scores');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const scores: GameScore[] = games.map((g, idx) => ({
        gameNumber: idx + 1,
        scoreA: parseInt(g.scoreA) || 0,
        scoreB: parseInt(g.scoreB) || 0,
      }));

      let gamesWonA = 0, gamesWonB = 0;
      for (const score of scores) {
        const sA = score.scoreA ?? 0;
        const sB = score.scoreB ?? 0;
        if (sA > sB) gamesWonA++;
        else if (sB > sA) gamesWonB++;
      }

      const winnerId = gamesWonA > gamesWonB ? match.sideA.id : match.sideB.id;

      await finaliseResult(
        eventType,
        eventId,
        match.id,
        scores,
        winnerId,
        currentUser.uid,
        isDuprEvent
      );

      // Recalculate standings for leagues
      if (eventType === 'league') {
        try {
          await rebuildAllStandingsById(eventId);
        } catch (standingsError) {
          console.error('Failed to recalculate standings:', standingsError);
        }
      }

      setIsEditMode(false);
      onSuccess();
    } catch (e: any) {
      console.error('Failed to save edited score:', e);
      setError(e.message || 'Failed to save changes');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Submit a dispute
   */
  const handleDispute = async () => {
    if (!currentUser || !disputeReason.trim()) return;

    setLoading(true);
    setError(null);

    try {
      await disputeScore(
        eventType,
        eventId,
        match.id,
        currentUser.uid,
        disputeReason
      );

      setShowDisputeModal(false);
      onSuccess();
    } catch (e: any) {
      console.error('Failed to dispute score:', e);
      setError(e.message || 'Failed to dispute score');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Cancel edit mode
   */
  const handleCancelEdit = () => {
    setIsEditMode(false);
    // Reset games to original scores
    const existingScores = match.scores || match.scoreProposal?.scores || [];
    if (existingScores.length > 0) {
      setGames(existingScores.map(s => ({
        scoreA: (s.scoreA ?? 0).toString(),
        scoreB: (s.scoreB ?? 0).toString(),
      })));
    }
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 w-full max-w-md rounded-xl border border-gray-700 overflow-hidden">
        {/* Header */}
        <ScoreHeader
          state={state}
          onClose={onClose}
          legacyVerification={match.verification ? {
            confirmations: match.verification.confirmations,
            requiredConfirmations: match.verification.requiredConfirmations,
          } : undefined}
        />

        {/* Match Info */}
        <MatchInfo
          match={match}
          isPlayerA={state.isInSideA}
          isPlayerB={state.isInSideB}
        />

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Error message */}
          {error && (
            <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Status banner (DUPR compliance, etc.) */}
          <ScoreStatusBanner state={state} />

          {/* Dispute Modal Content */}
          {showDisputeModal ? (
            <div className="space-y-4">
              <div className="text-sm text-gray-400">
                Please provide a reason for disputing this score:
              </div>
              <textarea
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                placeholder="Enter your reason..."
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-lime-500"
                rows={3}
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDisputeModal(false)}
                  className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDispute}
                  disabled={loading || !disputeReason.trim()}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white rounded-lg font-semibold"
                >
                  {loading ? 'Submitting...' : 'Submit Dispute'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Score Entry */}
              <GameScoreEntry
                games={games}
                setGames={setGames}
                bestOf={bestOf}
                pointsPerGame={pointsPerGame}
                winBy={winBy}
                disabled={state.hasScore && !isEditMode}
                sideAName={match.sideA.name}
                sideBName={match.sideB.name}
              />

              {/* Score Summary */}
              <ScoreSummary
                games={games}
                bestOf={bestOf}
                sideAName={match.sideA.name}
                sideBName={match.sideB.name}
              />
            </>
          )}
        </div>

        {/* Footer */}
        {!showDisputeModal && (
          <div className="bg-gray-900 px-6 py-4 border-t border-gray-700">
            {/* Status footer message */}
            <ScoreStatusFooter state={state} />

            <div className="flex gap-3">
              {/* Cancel/Close button */}
              <button
                onClick={isEditMode ? handleCancelEdit : onClose}
                disabled={loading || confirming}
                className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg disabled:opacity-50"
              >
                {isEditMode ? 'Cancel Edit' : (state.isFinal || state.isDisputed ? 'Close' : 'Cancel')}
              </button>

              {/* Dispute button */}
              {state.userCanDispute && !state.isFinal && !isEditMode && (
                <button
                  onClick={() => setShowDisputeModal(true)}
                  className="flex-1 py-2 bg-red-600/20 border border-red-600 text-red-400 rounded-lg font-semibold hover:bg-red-600/30"
                >
                  Dispute
                </button>
              )}

              {/* Sign to Acknowledge button */}
              {state.userCanConfirm && !isEditMode && (
                <button
                  onClick={handleConfirm}
                  disabled={confirming}
                  className="flex-1 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white rounded-lg font-semibold"
                >
                  {confirming ? 'Signing...' : 'Sign to Acknowledge'}
                </button>
              )}

              {/* Organizer Finalize button (for signed matches) */}
              {state.hasScore && state.isSigned && state.effectiveIsOrganizer && !state.isFinal && !isEditMode && (
                <button
                  onClick={handleOrganizerFinalize}
                  disabled={loading}
                  className="flex-1 py-2 bg-lime-600 hover:bg-lime-500 disabled:bg-gray-600 text-white rounded-lg font-semibold"
                >
                  {loading ? 'Finalizing...' : 'Finalize Score'}
                </button>
              )}

              {/* Edit Score button (organizer correction) */}
              {state.canEdit && !isEditMode && (
                <button
                  onClick={() => setIsEditMode(true)}
                  className="flex-1 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-semibold"
                >
                  Edit Score
                </button>
              )}

              {/* Save Changes button (when editing) */}
              {isEditMode && (
                <button
                  onClick={handleSaveEditedScore}
                  disabled={loading}
                  className="flex-1 py-2 bg-lime-600 hover:bg-lime-500 disabled:bg-gray-600 text-white rounded-lg font-semibold"
                >
                  {loading ? 'Saving...' : 'Save Changes'}
                </button>
              )}

              {/* Propose/Finalize button */}
              {!state.hasScore && !isEditMode && (
                <button
                  onClick={handleSubmit}
                  disabled={loading || !state.canSubmitScore}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded-lg font-semibold"
                >
                  {loading
                    ? (state.effectiveIsOrganizer ? 'Finalising...' : 'Proposing...')
                    : (state.effectiveIsOrganizer ? 'Finalise Official Score' : 'Propose Score')
                  }
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EventScoreEntryModal;

/**
 * LeagueScoreEntryModal Component V05.44
 *
 * Modal for entering league match scores with game-by-game entry.
 * Supports best of 1, 3, or 5 games with validation.
 * Includes score verification (confirm/dispute) workflow.
 *
 * FILE LOCATION: components/leagues/LeagueScoreEntryModal.tsx
 * VERSION: V05.44
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  submitLeagueMatchResult,
  confirmMatchScore,
  notifyScoreConfirmation,
  DEFAULT_VERIFICATION_SETTINGS,
} from '../../services/firebase';
import type { LeagueMatch, GameScore, ScoreVerificationSettings } from '../../types';
import {
  ScoreVerificationBadge,
  DisputeScoreModal,
} from './verification';

// ============================================
// TYPES
// ============================================

interface LeagueScoreEntryModalProps {
  leagueId: string;
  leagueName?: string;
  match: LeagueMatch;
  bestOf: 1 | 3 | 5;
  pointsPerGame: 11 | 15 | 21;
  winBy: 1 | 2;
  verificationSettings?: ScoreVerificationSettings;
  isOrganizer?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface GameInput {
  scoreA: string;
  scoreB: string;
}

// ============================================
// COMPONENT
// ============================================

export const LeagueScoreEntryModal: React.FC<LeagueScoreEntryModalProps> = ({
  leagueId,
  leagueName,
  match,
  bestOf,
  pointsPerGame,
  winBy,
  verificationSettings = DEFAULT_VERIFICATION_SETTINGS,
  isOrganizer = false,
  onClose,
  onSuccess,
}) => {
  const { currentUser } = useAuth();

  const [games, setGames] = useState<GameInput[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDisputeModal, setShowDisputeModal] = useState(false);

  // Determine user's role in this match
  const isPlayerA = currentUser?.uid === match.userAId;
  const isPlayerB = currentUser?.uid === match.userBId;
  const isParticipant = isPlayerA || isPlayerB;

  // Get all player IDs
  const matchPlayerIds = [match.userAId, match.userBId];
  if (match.partnerAId) matchPlayerIds.push(match.partnerAId);
  if (match.partnerBId) matchPlayerIds.push(match.partnerBId);

  // Check verification status (use new verification system or fall back to legacy)
  const verification = match.verification;
  const hasScore = match.status === 'completed' || match.status === 'pending_confirmation' || match.scores?.length > 0;
  const verificationStatus = verification?.verificationStatus ||
    (match.status === 'pending_confirmation' ? 'pending' :
     match.status === 'completed' ? 'final' : undefined);
  const isPending = verificationStatus === 'pending' || verificationStatus === 'confirmed';
  const isFinal = verificationStatus === 'final';
  const isDisputed = verificationStatus === 'disputed';

  // Check if user can confirm
  const userCanConfirm = isParticipant &&
    hasScore &&
    isPending &&
    match.submittedByUserId !== currentUser?.uid &&
    !(verification?.confirmations || []).includes(currentUser?.uid || '');

  // Check if user can dispute
  const userCanDispute = isParticipant &&
    hasScore &&
    !isFinal &&
    !isDisputed &&
    verificationSettings.allowDisputes;

  // Check if user can submit scores (participants or organizers)
  const canSubmitScore = isParticipant || isOrganizer;

  // Initialize games from existing scores or empty
  useEffect(() => {
    if (match.scores && match.scores.length > 0) {
      setGames(match.scores.map(s => ({
        scoreA: (s.scoreA ?? 0).toString(),
        scoreB: (s.scoreB ?? 0).toString(),
      })));
    } else {
      // Initialize with one empty game
      setGames([{ scoreA: '', scoreB: '' }]);
    }
  }, [match.scores]);

  // ============================================
  // VALIDATION
  // ============================================

  const validateGame = (scoreA: number, scoreB: number): { valid: boolean; error?: string } => {
    if (isNaN(scoreA) || isNaN(scoreB)) {
      return { valid: false, error: 'Please enter valid scores' };
    }

    if (scoreA < 0 || scoreB < 0) {
      return { valid: false, error: 'Scores cannot be negative' };
    }

    const maxScore = Math.max(scoreA, scoreB);
    const minScore = Math.min(scoreA, scoreB);
    const target = pointsPerGame;

    // Check for tie
    if (scoreA === scoreB) {
      return { valid: false, error: 'Games cannot end in a tie' };
    }

    // Check if someone won (reached target)
    if (maxScore < target) {
      return { valid: false, error: `Game must be won by reaching ${target} points` };
    }

    // Validate win-by requirement
    if (winBy === 2) {
      // Must win by 2 points
      if (maxScore - minScore < 2) {
        return { valid: false, error: `Must win by ${winBy} points` };
      }

      // If winner scored exactly the target, loser must have scored at most target-2
      // e.g., 11-9 is valid, 11-10 is not (would need to go to 12-10)
      if (maxScore === target && minScore > target - 2) {
        return { valid: false, error: `Must win by ${winBy} points (score would be ${target}-${target - 2} or less)` };
      }

      // If winner scored more than target, it must be a deuce situation
      // e.g., 12-10, 13-11, 14-12 are valid (deuce scenarios)
      // but 15-9 is invalid (game would have ended at 11-9)
      if (maxScore > target) {
        // In deuce, winner is exactly 2 points ahead and loser must have at least target-1
        // Valid: 12-10, 13-11, 14-12... (loser >= target-1, diff = 2)
        // Invalid: 15-9 (loser < target-1)
        if (minScore < target - 1) {
          return { valid: false, error: `Invalid score - game would have ended at ${target}-${minScore}` };
        }
        // In extended play, winner must be exactly 2 ahead
        if (maxScore - minScore !== 2) {
          return { valid: false, error: `In deuce, winner must be exactly 2 points ahead` };
        }
      }
    } else {
      // Win by 1: winner just needs to reach target
      if (maxScore > target) {
        return { valid: false, error: `Invalid score - game ends at ${target} points (win by 1)` };
      }
    }

    return { valid: true };
  };

  const calculateWinner = (): { winnerId: string | null; gamesA: number; gamesB: number } => {
    let gamesA = 0;
    let gamesB = 0;

    for (const game of games) {
      const scoreA = parseInt(game.scoreA) || 0;
      const scoreB = parseInt(game.scoreB) || 0;
      if (scoreA > scoreB) gamesA++;
      if (scoreB > scoreA) gamesB++;
    }

    const winThreshold = Math.ceil(bestOf / 2);
    
    if (gamesA >= winThreshold) {
      return { winnerId: match.memberAId, gamesA, gamesB };
    }
    if (gamesB >= winThreshold) {
      return { winnerId: match.memberBId, gamesA, gamesB };
    }

    return { winnerId: null, gamesA, gamesB };
  };

  const validateAllGames = (): { valid: boolean; error?: string } => {
    const filledGames = games.filter(g => g.scoreA !== '' || g.scoreB !== '');
    
    if (filledGames.length === 0) {
      return { valid: false, error: 'Please enter at least one game score' };
    }

    for (let i = 0; i < filledGames.length; i++) {
      const scoreA = parseInt(filledGames[i].scoreA);
      const scoreB = parseInt(filledGames[i].scoreB);
      const validation = validateGame(scoreA, scoreB);
      
      if (!validation.valid) {
        return { valid: false, error: `Game ${i + 1}: ${validation.error}` };
      }
    }

    const { winnerId, gamesA, gamesB } = calculateWinner();
    
    if (!winnerId) {
      return { valid: false, error: `Match not complete. Current: ${gamesA}-${gamesB}. Need ${Math.ceil(bestOf / 2)} games to win.` };
    }

    return { valid: true };
  };

  // ============================================
  // HANDLERS
  // ============================================

  const handleGameChange = (index: number, field: 'scoreA' | 'scoreB', value: string) => {
    // Only allow numbers
    if (value !== '' && !/^\d+$/.test(value)) return;

    const newGames = [...games];
    newGames[index] = { ...newGames[index], [field]: value };
    setGames(newGames);
    setError(null);
  };

  // V07.03: Quick score button handler - sets winner to clicked score, loser to score - 2
  const handleQuickScore = (index: number, score: number, winner: 'A' | 'B') => {
    const loserScore = Math.max(0, score - 2);
    const newGames = [...games];
    if (winner === 'A') {
      newGames[index] = { scoreA: String(score), scoreB: String(loserScore) };
    } else {
      newGames[index] = { scoreA: String(loserScore), scoreB: String(score) };
    }
    setGames(newGames);
    setError(null);
  };

  // V07.03: Progressive reveal - auto-add next game when current is valid
  useEffect(() => {
    if (bestOf === 1 || hasScore) return;
    if (games.length >= bestOf) return;

    const lastGame = games[games.length - 1];
    if (!lastGame || lastGame.scoreA === '' || lastGame.scoreB === '') return;

    const scoreA = parseInt(lastGame.scoreA) || 0;
    const scoreB = parseInt(lastGame.scoreB) || 0;
    const validation = validateGame(scoreA, scoreB);

    // If last game is valid and match not decided yet
    if (validation.valid) {
      // Calculate win threshold inline to avoid dependency issues
      const localWinThreshold = Math.ceil(bestOf / 2);
      let gamesA = 0, gamesB = 0;
      games.forEach(g => {
        const sa = parseInt(g.scoreA) || 0;
        const sb = parseInt(g.scoreB) || 0;
        if (sa > sb) gamesA++;
        else if (sb > sa) gamesB++;
      });

      if (gamesA < localWinThreshold && gamesB < localWinThreshold) {
        // Auto-add next game
        setGames(prev => [...prev, { scoreA: '', scoreB: '' }]);
      }
    }
  }, [games, bestOf, hasScore, validateGame]);

  const removeGame = (index: number) => {
    if (games.length > 1) {
      setGames(games.filter((_, i) => i !== index));
    }
  };

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

      const { winnerId, gamesA, gamesB } = calculateWinner();

      // Submit match result - if organizer, auto-finalize
      await submitLeagueMatchResult(
        leagueId,
        match.id,
        scores,
        winnerId!,
        currentUser.uid,
        isOrganizer  // Auto-finalize if organizer submits
      );

      // Send notification to opponent to confirm the score (skip if organizer auto-finalized)
      if (!isOrganizer) {
        const submitterName = isPlayerA ? match.memberAName : match.memberBName;
        const opponentUserId = isPlayerA ? match.userBId : match.userAId;
        const scoreDisplay = `${gamesA}-${gamesB}`;

        // Collect all opponent user IDs (for doubles, include partner)
        const opponentUserIds = [opponentUserId];
        if (isPlayerA && match.partnerBId) {
          opponentUserIds.push(match.partnerBId);
        } else if (isPlayerB && match.partnerAId) {
          opponentUserIds.push(match.partnerAId);
        }

        // Send notification (fire and forget - don't block on this)
        notifyScoreConfirmation(
          opponentUserIds,
          leagueId,
          match.id,
          submitterName,
          scoreDisplay,
          leagueName
        ).catch(err => {
          console.warn('Failed to send score confirmation notification:', err);
        });
      }

      onSuccess();
    } catch (e: any) {
      console.error('Failed to submit score:', e);
      setError(e.message || 'Failed to submit score');
    } finally {
      setLoading(false);
    }
  };

  // Handle confirm using new verification service
  const handleConfirm = async () => {
    if (!currentUser) return;

    setConfirming(true);
    setError(null);

    try {
      const result = await confirmMatchScore(
        'league',
        leagueId,
        match.id,
        currentUser.uid,
        verificationSettings
      );

      if (result.success) {
        onSuccess();
        if (result.newStatus === 'final') {
          onClose();
        }
      } else {
        setError(result.error || result.message || 'Failed to confirm');
      }
    } catch (e: any) {
      console.error('Failed to confirm score:', e);
      setError(e.message || 'Failed to confirm score');
    } finally {
      setConfirming(false);
    }
  };

  // ============================================
  // RENDER
  // ============================================

  const { gamesA, gamesB } = calculateWinner();
  const winThreshold = Math.ceil(bestOf / 2);

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 w-full max-w-md rounded-xl border border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="bg-gray-900 px-6 py-4 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">
                {hasScore && !isFinal ? 'Confirm Score' : hasScore ? 'Match Score' : 'Enter Match Score'}
              </h2>
              {/* Verification Badge */}
              {verificationStatus && (
                <div className="mt-1">
                  <ScoreVerificationBadge
                    status={verificationStatus}
                    confirmationCount={verification?.confirmations?.length || 0}
                    requiredConfirmations={verification?.requiredConfirmations || 1}
                    showCount={isPending}
                  />
                </div>
              )}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Match Info */}
        <div className="px-6 py-4 bg-gray-900/50 border-b border-gray-700">
          <div className="flex items-center justify-between text-center">
            <div className="flex-1">
              <div className={`font-semibold ${isPlayerA ? 'text-blue-400' : 'text-white'}`}>
                {match.memberAName}
              </div>
              {isPlayerA && <div className="text-xs text-blue-400">(You)</div>}
            </div>
            <div className="px-4 text-gray-500 text-sm">vs</div>
            <div className="flex-1">
              <div className={`font-semibold ${isPlayerB ? 'text-blue-400' : 'text-white'}`}>
                {match.memberBName}
              </div>
              {isPlayerB && <div className="text-xs text-blue-400">(You)</div>}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Score Entry */}
          {!showDisputeModal && (
            <>
              <div className="text-sm text-gray-400 text-center mb-2">
                Best of {bestOf} • First to {winThreshold} games • Games to {pointsPerGame}
              </div>

              {/* Game Scores - V07.03: Added quick score buttons */}
              <div className="space-y-4">
                {games.map((game, index) => {
                  const hasGameScore = game.scoreA !== '' || game.scoreB !== '';
                  return (
                    <div key={index} className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/50">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="text-xs text-gray-500 font-medium">Game {index + 1}</div>
                        <div className="flex-1 flex items-center gap-2 justify-center">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={game.scoreA}
                            onChange={(e) => handleGameChange(index, 'scoreA', e.target.value)}
                            disabled={hasScore}
                            placeholder="0"
                            className="w-16 bg-gray-900 border border-gray-700 text-white text-center py-2 rounded-lg focus:outline-none focus:border-lime-500 disabled:opacity-50 font-bold"
                          />
                          <span className="text-gray-500 font-bold">-</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={game.scoreB}
                            onChange={(e) => handleGameChange(index, 'scoreB', e.target.value)}
                            disabled={hasScore}
                            placeholder="0"
                            className="w-16 bg-gray-900 border border-gray-700 text-white text-center py-2 rounded-lg focus:outline-none focus:border-lime-500 disabled:opacity-50 font-bold"
                          />
                        </div>
                        {games.length > 1 && !hasScore && (
                          <button
                            onClick={() => removeGame(index)}
                            className="text-gray-500 hover:text-red-400"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>

                      {/* V07.03: Quick score buttons */}
                      {!hasScore && !hasGameScore && (
                        <div className="flex items-center justify-center gap-2 pt-2 border-t border-gray-700/30">
                          <span className="text-xs text-gray-500 mr-1">{match.memberAName?.split(' ')[0]}:</span>
                          {[11, 15, 21].map(score => (
                            <button
                              key={`A-${score}`}
                              type="button"
                              onClick={() => handleQuickScore(index, score, 'A')}
                              className="px-2 py-1 text-xs bg-gray-700 hover:bg-lime-600 hover:text-gray-900 rounded transition-colors"
                            >
                              {score}
                            </button>
                          ))}
                          <span className="mx-2 text-gray-600">|</span>
                          <span className="text-xs text-gray-500 mr-1">{match.memberBName?.split(' ')[0]}:</span>
                          {[11, 15, 21].map(score => (
                            <button
                              key={`B-${score}`}
                              type="button"
                              onClick={() => handleQuickScore(index, score, 'B')}
                              className="px-2 py-1 text-xs bg-gray-700 hover:bg-lime-600 hover:text-gray-900 rounded transition-colors"
                            >
                              {score}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* V07.03: Progressive reveal - no manual Add Game button needed */}
              {/* Game is auto-added when previous game is valid */}

              {/* Current Score Summary */}
              <div className="bg-gray-900 rounded-lg p-3 text-center">
                <div className="text-sm text-gray-400 mb-1">Match Score</div>
                <div className="text-2xl font-bold">
                  <span className={gamesA > gamesB ? 'text-green-400' : 'text-white'}>{gamesA}</span>
                  <span className="text-gray-500 mx-2">-</span>
                  <span className={gamesB > gamesA ? 'text-green-400' : 'text-white'}>{gamesB}</span>
                </div>
                {gamesA >= winThreshold && (
                  <div className="text-sm text-green-400 mt-1">{match.memberAName} wins!</div>
                )}
                {gamesB >= winThreshold && (
                  <div className="text-sm text-green-400 mt-1">{match.memberBName} wins!</div>
                )}
              </div>
            </>
          )}

        </div>

        {/* Footer */}
        <div className="bg-gray-900 px-6 py-4 border-t border-gray-700">
          {/* Waiting for confirmation message */}
          {hasScore && isPending && !userCanConfirm && match.submittedByUserId === currentUser?.uid && (
            <div className="text-sm text-yellow-400 text-center mb-3">
              ⏳ Waiting for opponent to confirm this score...
            </div>
          )}

          {/* Disputed message */}
          {isDisputed && (
            <div className="text-sm text-red-400 text-center mb-3">
              ⚠️ This match is disputed and awaiting organizer review.
            </div>
          )}

          {/* Confirm prompt */}
          {userCanConfirm && (
            <div className="text-sm text-yellow-400 text-center mb-3">
              ⚠️ Your opponent submitted this score. Please confirm or dispute.
            </div>
          )}

          <div className="flex gap-3">
            {/* Cancel/Close button */}
            <button
              onClick={onClose}
              disabled={loading || confirming}
              className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg disabled:opacity-50"
            >
              {isFinal || isDisputed ? 'Close' : 'Cancel'}
            </button>

            {/* Dispute button - only show when user can dispute */}
            {userCanDispute && !isFinal && (
              <button
                onClick={() => setShowDisputeModal(true)}
                className="flex-1 py-2 bg-red-600/20 border border-red-600 text-red-400 rounded-lg font-semibold hover:bg-red-600/30"
              >
                Dispute
              </button>
            )}

            {/* Confirm button - only show when user can confirm */}
            {userCanConfirm && (
              <button
                onClick={handleConfirm}
                disabled={confirming}
                className="flex-1 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white rounded-lg font-semibold"
              >
                {confirming ? 'Confirming...' : 'Confirm Score'}
              </button>
            )}

            {/* Submit button - only show when entering new score */}
            {!hasScore && (
              <button
                onClick={handleSubmit}
                disabled={loading || !canSubmitScore}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded-lg font-semibold"
              >
                {loading ? 'Submitting...' : 'Submit Score'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Dispute Modal */}
      <DisputeScoreModal
        isOpen={showDisputeModal}
        onClose={() => setShowDisputeModal(false)}
        eventType="league"
        eventId={leagueId}
        matchId={match.id}
        userId={currentUser?.uid || ''}
        matchDescription={`${match.memberAName} vs ${match.memberBName}`}
        currentScore={match.scores?.length
          ? match.scores.map(s => `${s.scoreA}-${s.scoreB}`).join(', ')
          : undefined
        }
        onDisputed={() => {
          onSuccess();
          setShowDisputeModal(false);
        }}
      />
    </div>
  );
};

export default LeagueScoreEntryModal;
/**
 * LeagueScoreEntryModal Component
 * 
 * Modal for entering league match scores with game-by-game entry.
 * Supports best of 1, 3, or 5 games with validation.
 * 
 * FILE LOCATION: components/leagues/LeagueScoreEntryModal.tsx
 * VERSION: V05.17
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { submitLeagueMatchResult, confirmLeagueMatchResult, disputeLeagueMatchResult } from '../../services/firebase';
import type { LeagueMatch, GameScore } from '../../types';

// ============================================
// TYPES
// ============================================

interface LeagueScoreEntryModalProps {
  leagueId: string;
  match: LeagueMatch;
  bestOf: 1 | 3 | 5;
  pointsPerGame: 11 | 15 | 21;
  winBy: 1 | 2;
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
  match,
  bestOf,
  pointsPerGame,
  winBy,
  onClose,
  onSuccess,
}) => {
  const { currentUser } = useAuth();
  
  const [games, setGames] = useState<GameInput[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [showDispute, setShowDispute] = useState(false);

  // Determine user's role in this match
  const isPlayerA = currentUser?.uid === match.userAId;
  const isPlayerB = currentUser?.uid === match.userBId;
  const isParticipant = isPlayerA || isPlayerB;
  const isPendingConfirmation = match.status === 'pending_confirmation';
  const canConfirm = isPendingConfirmation && match.submittedByUserId !== currentUser?.uid && isParticipant;

  // Initialize games from existing scores or empty
  useEffect(() => {
    if (match.scores && match.scores.length > 0) {
      setGames(match.scores.map(s => ({
        scoreA: s.scoreA.toString(),
        scoreB: s.scoreB.toString(),
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

    // Check if someone won
    if (maxScore < target) {
      return { valid: false, error: `Game must be won by reaching ${target} points` };
    }

    // Check win by requirement
    if (winBy === 2) {
      if (maxScore === target && minScore > target - 2) {
        return { valid: false, error: `Must win by ${winBy} points` };
      }
      if (maxScore > target && maxScore - minScore < 2) {
        return { valid: false, error: `Must win by ${winBy} points` };
      }
    }

    // Check for tie
    if (scoreA === scoreB) {
      return { valid: false, error: 'Games cannot end in a tie' };
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

  const addGame = () => {
    if (games.length < bestOf) {
      setGames([...games, { scoreA: '', scoreB: '' }]);
    }
  };

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

      const { winnerId } = calculateWinner();

      // submitLeagueMatchResult(leagueId, matchId, scores, winnerMemberId, submittedByUserId)
      await submitLeagueMatchResult(
        leagueId, 
        match.id, 
        scores, 
        winnerId!, 
        currentUser.uid
      );

      onSuccess();
    } catch (e: any) {
      console.error('Failed to submit score:', e);
      setError(e.message || 'Failed to submit score');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!currentUser) return;

    setLoading(true);
    setError(null);

    try {
      // confirmLeagueMatchResult(leagueId, matchId, confirmedByUserId)
      await confirmLeagueMatchResult(leagueId, match.id, currentUser.uid);
      onSuccess();
    } catch (e: any) {
      console.error('Failed to confirm score:', e);
      setError(e.message || 'Failed to confirm score');
    } finally {
      setLoading(false);
    }
  };

  const handleDispute = async () => {
    if (!currentUser || !disputeReason.trim()) {
      setError('Please provide a reason for the dispute');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // disputeLeagueMatchResult(leagueId, matchId, reason)
      await disputeLeagueMatchResult(leagueId, match.id, disputeReason);
      onSuccess();
    } catch (e: any) {
      console.error('Failed to dispute score:', e);
      setError(e.message || 'Failed to dispute score');
    } finally {
      setLoading(false);
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
            <h2 className="text-lg font-bold text-white">
              {isPendingConfirmation ? 'Confirm Score' : 'Enter Match Score'}
            </h2>
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
          {!showDispute && (
            <>
              <div className="text-sm text-gray-400 text-center mb-2">
                Best of {bestOf} • First to {winThreshold} games • Games to {pointsPerGame}
              </div>

              {/* Game Scores */}
              <div className="space-y-3">
                {games.map((game, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <div className="text-xs text-gray-500 w-16">Game {index + 1}</div>
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={game.scoreA}
                        onChange={(e) => handleGameChange(index, 'scoreA', e.target.value)}
                        disabled={isPendingConfirmation && !canConfirm}
                        placeholder="0"
                        className="w-16 bg-gray-900 border border-gray-700 text-white text-center py-2 rounded-lg focus:outline-none focus:border-blue-500 disabled:opacity-50"
                      />
                      <span className="text-gray-500">-</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={game.scoreB}
                        onChange={(e) => handleGameChange(index, 'scoreB', e.target.value)}
                        disabled={isPendingConfirmation && !canConfirm}
                        placeholder="0"
                        className="w-16 bg-gray-900 border border-gray-700 text-white text-center py-2 rounded-lg focus:outline-none focus:border-blue-500 disabled:opacity-50"
                      />
                    </div>
                    {games.length > 1 && !isPendingConfirmation && (
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
                ))}
              </div>

              {/* Add Game Button */}
              {games.length < bestOf && !isPendingConfirmation && (
                <button
                  onClick={addGame}
                  className="w-full py-2 border border-dashed border-gray-600 text-gray-400 rounded-lg hover:border-gray-500 hover:text-gray-300 transition-colors text-sm"
                >
                  + Add Game {games.length + 1}
                </button>
              )}

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

          {/* Dispute Form */}
          {showDispute && (
            <div className="space-y-3">
              <label className="block text-sm text-gray-400">
                Reason for dispute:
              </label>
              <textarea
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                placeholder="Please describe what is incorrect about this score..."
                className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500 min-h-[100px]"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDispute(false)}
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
          )}
        </div>

        {/* Footer */}
        {!showDispute && (
          <div className="bg-gray-900 px-6 py-4 border-t border-gray-700">
            {isPendingConfirmation && canConfirm ? (
              <div className="space-y-3">
                <div className="text-sm text-yellow-400 text-center">
                  ⚠️ Your opponent submitted this score. Please confirm or dispute.
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDispute(true)}
                    className="flex-1 py-2 bg-red-600/20 border border-red-600 text-red-400 rounded-lg font-semibold hover:bg-red-600/30"
                  >
                    Dispute
                  </button>
                  <button
                    onClick={handleConfirm}
                    disabled={loading}
                    className="flex-1 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white rounded-lg font-semibold"
                  >
                    {loading ? 'Confirming...' : 'Confirm Score'}
                  </button>
                </div>
              </div>
            ) : isPendingConfirmation ? (
              <div className="text-sm text-yellow-400 text-center">
                Waiting for opponent to confirm this score...
              </div>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading || !isParticipant}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded-lg font-semibold"
                >
                  {loading ? 'Submitting...' : 'Submit Score'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LeagueScoreEntryModal;
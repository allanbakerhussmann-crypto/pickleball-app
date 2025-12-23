/**
 * Score Entry Modal Component
 *
 * Universal score entry modal for all match types.
 * Uses scoreValidation service for validation.
 * Supports best of 1, 3, or 5 games.
 *
 * FILE LOCATION: components/shared/ScoreEntryModal.tsx
 * VERSION: V06.00
 */

import React, { useState, useEffect, useMemo } from 'react';
import type { Match, GameScore } from '../../types/game/match';
import type { GameSettings } from '../../types/game/gameSettings';
import {
  validateGameScore,
  validateMatchScores,
  calculateMatchWinner,
  isMatchComplete,
  getQuickScoreButtons,
  createEmptyGameScore,
} from '../../services/game';

// ============================================
// TYPES
// ============================================

interface ScoreEntryModalProps {
  /** Match to score */
  match: Match;
  /** Whether modal is open */
  isOpen: boolean;
  /** Close modal handler */
  onClose: () => void;
  /** Submit scores handler */
  onSubmit: (scores: GameScore[], winnerId: string) => Promise<void>;
  /** Loading state */
  isLoading?: boolean;
}

// ============================================
// COMPONENT
// ============================================

export const ScoreEntryModal: React.FC<ScoreEntryModalProps> = ({
  match,
  isOpen,
  onClose,
  onSubmit,
  isLoading = false,
}) => {
  const settings = match.gameSettings;
  const { bestOf } = settings;

  // Initialize scores state
  const [scores, setScores] = useState<GameScore[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeGame, setActiveGame] = useState(0);

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      // Initialize with existing scores or empty
      if (match.scores && match.scores.length > 0) {
        setScores([...match.scores]);
        setActiveGame(Math.min(match.scores.length - 1, bestOf - 1));
      } else {
        setScores([createEmptyGameScore(1)]);
        setActiveGame(0);
      }
      setError(null);
    }
  }, [isOpen, match.scores, bestOf]);

  // Quick score buttons
  const quickScores = useMemo(() => getQuickScoreButtons(settings), [settings]);

  // Calculate current winner state
  const winnerState = useMemo(() => {
    if (scores.length === 0) return { winnerId: null, gamesA: 0, gamesB: 0 };
    return calculateMatchWinner(scores, settings);
  }, [scores, settings]);

  // Check if match is complete
  const matchComplete = useMemo(() => {
    if (scores.length === 0) return false;
    return isMatchComplete(scores, settings);
  }, [scores, settings]);

  // Update a game score
  const updateScore = (gameIndex: number, side: 'scoreA' | 'scoreB', value: number) => {
    setScores(prev => {
      const updated = [...prev];
      updated[gameIndex] = {
        ...updated[gameIndex],
        [side]: Math.max(0, value),
      };
      return updated;
    });
    setError(null);
  };

  // Apply quick score
  const applyQuickScore = (gameIndex: number, side: 'scoreA' | 'scoreB', score: number) => {
    const game = scores[gameIndex];
    const otherSide = side === 'scoreA' ? 'scoreB' : 'scoreA';

    // Set winning score and calculate losing score
    // If win by 2 and score > pointsPerGame, loser must be score - 2
    let losingScore = 0;
    if (score > settings.pointsPerGame) {
      losingScore = score - 2;
    } else {
      // Could be various losing scores, default to a common one
      losingScore = score - 2;
      if (losingScore < 0) losingScore = 0;
    }

    setScores(prev => {
      const updated = [...prev];
      updated[gameIndex] = {
        ...updated[gameIndex],
        [side]: score,
        [otherSide]: losingScore,
      };
      return updated;
    });
    setError(null);
  };

  // Add next game
  const addGame = () => {
    if (scores.length < bestOf && !matchComplete) {
      const newGame = createEmptyGameScore(scores.length + 1);
      setScores(prev => [...prev, newGame]);
      setActiveGame(scores.length);
    }
  };

  // Remove last game
  const removeGame = () => {
    if (scores.length > 1) {
      setScores(prev => prev.slice(0, -1));
      setActiveGame(Math.max(0, scores.length - 2));
    }
  };

  // Handle submit
  const handleSubmit = async () => {
    // Validate each game
    for (let i = 0; i < scores.length; i++) {
      const game = scores[i];
      const validation = validateGameScore(game.scoreA, game.scoreB, settings);
      if (!validation.valid) {
        setError(`Game ${i + 1}: ${validation.error}`);
        setActiveGame(i);
        return;
      }
    }

    // Validate complete match
    const matchValidation = validateMatchScores(scores, settings);
    if (!matchValidation.valid) {
      setError(matchValidation.error || 'Invalid match scores');
      return;
    }

    // Determine winner
    const { winnerId: winnerSide } = calculateMatchWinner(scores, settings);
    if (!winnerSide) {
      setError('Could not determine winner');
      return;
    }

    const winnerId = winnerSide === 'sideA' ? match.sideA.id : match.sideB.id;

    try {
      await onSubmit(scores, winnerId);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save scores');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Enter Score</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Match Info */}
        <div className="px-4 py-3 bg-gray-50 border-b">
          <div className="flex items-center justify-between">
            <div className="text-center flex-1">
              <p className="font-medium text-gray-900">{match.sideA.name}</p>
              {match.sideA.duprRating && (
                <p className="text-xs text-gray-500">DUPR: {match.sideA.duprRating.toFixed(2)}</p>
              )}
            </div>
            <div className="px-3 text-gray-400">vs</div>
            <div className="text-center flex-1">
              <p className="font-medium text-gray-900">{match.sideB.name}</p>
              {match.sideB.duprRating && (
                <p className="text-xs text-gray-500">DUPR: {match.sideB.duprRating.toFixed(2)}</p>
              )}
            </div>
          </div>

          {/* Current score summary */}
          <div className="mt-2 text-center">
            <span className={`text-2xl font-bold ${winnerState.gamesA > winnerState.gamesB ? 'text-green-600' : ''}`}>
              {winnerState.gamesA}
            </span>
            <span className="text-xl text-gray-400 mx-2">-</span>
            <span className={`text-2xl font-bold ${winnerState.gamesB > winnerState.gamesA ? 'text-green-600' : ''}`}>
              {winnerState.gamesB}
            </span>
            <p className="text-xs text-gray-500 mt-1">
              Best of {bestOf} • {settings.pointsPerGame} points • Win by {settings.winBy}
            </p>
          </div>
        </div>

        {/* Game Tabs */}
        {bestOf > 1 && (
          <div className="px-4 py-2 border-b flex gap-2">
            {scores.map((_, index) => (
              <button
                key={index}
                onClick={() => setActiveGame(index)}
                className={`
                  px-3 py-1 text-sm rounded
                  ${activeGame === index
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }
                `}
              >
                Game {index + 1}
              </button>
            ))}
            {scores.length < bestOf && !matchComplete && (
              <button
                onClick={addGame}
                className="px-3 py-1 text-sm text-green-600 hover:bg-green-50 rounded"
              >
                + Add Game
              </button>
            )}
          </div>
        )}

        {/* Score Entry */}
        <div className="p-4">
          {scores.map((game, index) => (
            <div
              key={index}
              className={`${index !== activeGame ? 'hidden' : ''}`}
            >
              {/* Side A Score */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {match.sideA.name}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="99"
                    value={game.scoreA}
                    onChange={e => updateScore(index, 'scoreA', parseInt(e.target.value) || 0)}
                    className="w-20 px-3 py-2 text-center text-xl font-bold border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                  <div className="flex gap-1">
                    {quickScores.map(score => (
                      <button
                        key={score}
                        onClick={() => applyQuickScore(index, 'scoreA', score)}
                        className="px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
                      >
                        {score}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Side B Score */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {match.sideB.name}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="99"
                    value={game.scoreB}
                    onChange={e => updateScore(index, 'scoreB', parseInt(e.target.value) || 0)}
                    className="w-20 px-3 py-2 text-center text-xl font-bold border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                  <div className="flex gap-1">
                    {quickScores.map(score => (
                      <button
                        key={score}
                        onClick={() => applyQuickScore(index, 'scoreB', score)}
                        className="px-2 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
                      >
                        {score}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Game validation */}
              {game.scoreA > 0 || game.scoreB > 0 ? (
                <div className="mb-2">
                  {(() => {
                    const validation = validateGameScore(game.scoreA, game.scoreB, settings);
                    if (validation.valid) {
                      return (
                        <p className="text-sm text-green-600 flex items-center gap-1">
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          Valid score
                        </p>
                      );
                    }
                    return (
                      <p className="text-sm text-red-600 flex items-center gap-1">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        {validation.error}
                      </p>
                    );
                  })()}
                </div>
              ) : null}
            </div>
          ))}

          {/* Match complete indicator */}
          {matchComplete && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg mb-4">
              <p className="text-sm text-green-700 font-medium">
                Match complete! Winner: {winnerState.winnerId === 'sideA' ? match.sideA.name : match.sideB.name}
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-4 py-3 border-t flex justify-between items-center">
          {scores.length > 1 && (
            <button
              onClick={removeGame}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Remove last game
            </button>
          )}
          <div className="flex gap-2 ml-auto">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!matchComplete || isLoading}
              className={`
                px-4 py-2 text-sm font-medium text-white rounded-lg
                ${matchComplete && !isLoading
                  ? 'bg-green-500 hover:bg-green-600'
                  : 'bg-gray-300 cursor-not-allowed'
                }
              `}
            >
              {isLoading ? 'Saving...' : 'Save Score'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScoreEntryModal;

/**
 * GameScoreEntry Component
 *
 * Game-by-game score entry with +/- stepper buttons.
 * Supports best of 1, 3, or 5 games with validation.
 *
 * @version V07.53
 * @file components/shared/scoring/GameScoreEntry.tsx
 */

import React, { useEffect } from 'react';

// ============================================
// TYPES
// ============================================

export interface GameInput {
  scoreA: string;
  scoreB: string;
}

interface GameScoreEntryProps {
  /** Current game scores */
  games: GameInput[];
  /** Update games array */
  setGames: React.Dispatch<React.SetStateAction<GameInput[]>>;
  /** Best of 1, 3, or 5 */
  bestOf: 1 | 3 | 5;
  /** Points per game (11, 15, 21) */
  pointsPerGame: 11 | 15 | 21;
  /** Win by 1 or 2 points */
  winBy: 1 | 2;
  /** Disable editing (score already entered) */
  disabled?: boolean;
  /** Side A display name */
  sideAName?: string;
  /** Side B display name */
  sideBName?: string;
}

// ============================================
// VALIDATION
// ============================================

export function validateGame(
  scoreA: number,
  scoreB: number,
  pointsPerGame: number,
  winBy: number
): { valid: boolean; error?: string } {
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
    if (maxScore === target && minScore > target - 2) {
      return { valid: false, error: `Must win by ${winBy} points (score would be ${target}-${target - 2} or less)` };
    }

    // If winner scored more than target, it must be a deuce situation
    if (maxScore > target) {
      if (minScore < target - 1) {
        return { valid: false, error: `Invalid score - game would have ended at ${target}-${minScore}` };
      }
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
}

export function calculateWinner(
  games: GameInput[],
  bestOf: number,
  sideAId: string,
  sideBId: string
): { winnerId: string | null; gamesA: number; gamesB: number } {
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
    return { winnerId: sideAId, gamesA, gamesB };
  }
  if (gamesB >= winThreshold) {
    return { winnerId: sideBId, gamesA, gamesB };
  }

  return { winnerId: null, gamesA, gamesB };
}

// ============================================
// COMPONENT
// ============================================

export const GameScoreEntry: React.FC<GameScoreEntryProps> = ({
  games,
  setGames,
  bestOf,
  pointsPerGame,
  winBy,
  disabled = false,
  sideAName = 'Team A',
  sideBName = 'Team B',
}) => {
  const winThreshold = Math.ceil(bestOf / 2);

  // Handle game change
  const handleGameChange = (index: number, field: 'scoreA' | 'scoreB', value: string) => {
    // Only allow numbers
    if (value !== '' && !/^\d+$/.test(value)) return;

    const newGames = [...games];
    newGames[index] = { ...newGames[index], [field]: value };
    setGames(newGames);
  };

  // Quick score button handler
  const handleQuickScore = (index: number, score: number, winner: 'A' | 'B') => {
    const loserScore = Math.max(0, score - 2);
    const newGames = [...games];
    if (winner === 'A') {
      newGames[index] = { scoreA: String(score), scoreB: String(loserScore) };
    } else {
      newGames[index] = { scoreA: String(loserScore), scoreB: String(score) };
    }
    setGames(newGames);
  };

  // Remove a game
  const removeGame = (index: number) => {
    if (games.length > 1) {
      setGames(games.filter((_, i) => i !== index));
    }
  };

  // Auto-add next game when current is valid (progressive reveal)
  useEffect(() => {
    if (bestOf === 1 || disabled) return;
    if (games.length >= bestOf) return;

    const lastGame = games[games.length - 1];
    if (!lastGame || lastGame.scoreA === '' || lastGame.scoreB === '') return;

    const scoreA = parseInt(lastGame.scoreA) || 0;
    const scoreB = parseInt(lastGame.scoreB) || 0;
    const validation = validateGame(scoreA, scoreB, pointsPerGame, winBy);

    if (validation.valid) {
      // Calculate if match is decided
      let gamesA = 0, gamesB = 0;
      games.forEach(g => {
        const sa = parseInt(g.scoreA) || 0;
        const sb = parseInt(g.scoreB) || 0;
        if (sa > sb) gamesA++;
        else if (sb > sa) gamesB++;
      });

      if (gamesA < winThreshold && gamesB < winThreshold) {
        // Auto-add next game
        setGames(prev => [...prev, { scoreA: '', scoreB: '' }]);
      }
    }
  }, [games, bestOf, disabled, pointsPerGame, winBy, winThreshold, setGames]);

  return (
    <div className="space-y-4">
      {/* Game Settings Info */}
      <div className="text-sm text-gray-400 text-center mb-2">
        Best of {bestOf} {'\u2022'} First to {winThreshold} games {'\u2022'} Games to {pointsPerGame}
      </div>

      {/* Game Scores */}
      {games.map((game, index) => {
        const hasGameScore = game.scoreA !== '' || game.scoreB !== '';
        return (
          <div key={index} className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/50">
            <div className="flex items-center gap-3 mb-2">
              <div className="text-xs text-gray-500 font-medium">Game {index + 1}</div>
              <div className="flex-1 flex items-center gap-4 justify-center">
                {/* Score A with +/- steppers */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      const current = parseInt(game.scoreA) || 0;
                      if (current > 0) handleGameChange(index, 'scoreA', String(current - 1));
                    }}
                    disabled={disabled || (parseInt(game.scoreA) || 0) <= 0}
                    className="w-9 h-9 flex items-center justify-center bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg text-xl font-bold transition-colors"
                  >
                    -
                  </button>
                  <div className="w-12 h-11 bg-gray-900 border border-gray-700 text-white text-center flex items-center justify-center rounded-lg font-bold text-xl">
                    {game.scoreA || '0'}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const current = parseInt(game.scoreA) || 0;
                      handleGameChange(index, 'scoreA', String(current + 1));
                    }}
                    disabled={disabled}
                    className="w-9 h-9 flex items-center justify-center bg-gray-700 hover:bg-lime-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg text-xl font-bold transition-colors"
                  >
                    +
                  </button>
                </div>

                <span className="text-gray-500 font-bold text-lg">-</span>

                {/* Score B with +/- steppers */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      const current = parseInt(game.scoreB) || 0;
                      if (current > 0) handleGameChange(index, 'scoreB', String(current - 1));
                    }}
                    disabled={disabled || (parseInt(game.scoreB) || 0) <= 0}
                    className="w-9 h-9 flex items-center justify-center bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg text-xl font-bold transition-colors"
                  >
                    -
                  </button>
                  <div className="w-12 h-11 bg-gray-900 border border-gray-700 text-white text-center flex items-center justify-center rounded-lg font-bold text-xl">
                    {game.scoreB || '0'}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const current = parseInt(game.scoreB) || 0;
                      handleGameChange(index, 'scoreB', String(current + 1));
                    }}
                    disabled={disabled}
                    className="w-9 h-9 flex items-center justify-center bg-gray-700 hover:bg-lime-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-lg text-xl font-bold transition-colors"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Remove game button */}
              {games.length > 1 && !disabled && (
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

            {/* Quick score buttons */}
            {!disabled && !hasGameScore && (
              <div className="flex items-center justify-center gap-2 pt-2 border-t border-gray-700/30">
                <span className="text-xs text-gray-500 mr-1">{sideAName?.split(' ')[0]}:</span>
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
                <span className="text-xs text-gray-500 mr-1">{sideBName?.split(' ')[0]}:</span>
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
  );
};

export default GameScoreEntry;

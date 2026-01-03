/**
 * Score Entry Modal Component
 *
 * Universal score entry modal for all match types.
 * Uses scoreValidation service for validation.
 * Supports best of 1, 3, or 5 games.
 *
 * V06.44: Redesigned with sports-tech scoreboard aesthetic
 * - Dark theme (gray-950) with lime/green accents
 * - Stadium scoreboard-inspired score display
 * - Game progress indicator with glow effects
 * - Stepper controls for intuitive score entry
 *
 * FILE LOCATION: components/shared/ScoreEntryModal.tsx
 * VERSION: V06.44
 */

import React, { useState, useEffect, useMemo } from 'react';
import type { Match, GameScore } from '../../types/game/match';
import type { GameSettings } from '../../types/game/gameSettings';
import {
  validateGameScore,
  validateMatchScores,
  calculateMatchWinner,
  isMatchComplete,
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
// SUB-COMPONENTS
// ============================================

/** Stepper control for score input */
const ScoreStepper: React.FC<{
  value: number;
  onChange: (value: number) => void;
  label: string;
  isWinning: boolean;
  quickScores: number[];
  onQuickScore: (score: number) => void;
}> = ({ value, onChange, label, isWinning, quickScores, onQuickScore }) => (
  <div className="relative">
    {/* Player/Team Label */}
    <div className="flex items-center justify-between mb-2">
      <span className={`text-sm font-medium truncate max-w-[200px] ${isWinning ? 'text-lime-400' : 'text-gray-300'}`}>
        {label}
      </span>
      {isWinning && (
        <span className="text-xs text-lime-500 font-semibold uppercase tracking-wider">Leading</span>
      )}
    </div>

    {/* Score Input Row */}
    <div className="flex items-center gap-3">
      {/* Decrement Button */}
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        className="w-10 h-10 flex items-center justify-center rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 hover:bg-gray-700 transition-all active:scale-95"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
        </svg>
      </button>

      {/* Score Display - Stadium Style */}
      <div className={`
        relative flex-1 h-16 flex items-center justify-center rounded-lg
        bg-gray-900 border-2 transition-all
        ${isWinning
          ? 'border-lime-500/50 shadow-[0_0_20px_rgba(132,204,22,0.15)]'
          : 'border-gray-700'
        }
      `}>
        {/* Scan line effect */}
        <div className="absolute inset-0 rounded-lg overflow-hidden pointer-events-none opacity-30">
          <div className="absolute inset-0" style={{
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.1) 2px, rgba(0,0,0,0.1) 4px)'
          }} />
        </div>

        <input
          type="number"
          min="0"
          max="99"
          value={value}
          onChange={e => onChange(Math.max(0, parseInt(e.target.value) || 0))}
          className={`
            w-full h-full text-center text-4xl font-bold bg-transparent
            focus:outline-none appearance-none
            [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none
            ${isWinning ? 'text-lime-400' : 'text-white'}
          `}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        />
      </div>

      {/* Increment Button */}
      <button
        type="button"
        onClick={() => onChange(Math.min(99, value + 1))}
        className="w-10 h-10 flex items-center justify-center rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-lime-400 hover:border-lime-500/50 hover:bg-gray-700 transition-all active:scale-95"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>

    {/* Quick Score Buttons */}
    <div className="flex gap-1.5 mt-2">
      {quickScores.map(score => (
        <button
          key={score}
          type="button"
          onClick={() => onQuickScore(score)}
          className={`
            flex-1 py-1.5 text-xs font-semibold rounded transition-all
            ${value === score
              ? 'bg-lime-500/20 text-lime-400 border border-lime-500/30'
              : 'bg-gray-800 text-gray-400 border border-gray-700 hover:text-white hover:border-gray-600'
            }
          `}
        >
          {score}
        </button>
      ))}
    </div>
  </div>
);

/** Game tab component */
const GameTab: React.FC<{
  gameNumber: number;
  isActive: boolean;
  isComplete: boolean;
  scoreA: number;
  scoreB: number;
  onClick: () => void;
}> = ({ gameNumber, isActive, isComplete, scoreA, scoreB, onClick }) => {
  const hasScore = scoreA > 0 || scoreB > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        relative flex flex-col items-center justify-center px-4 py-2 rounded-lg transition-all
        ${isActive
          ? 'bg-lime-500/20 border-2 border-lime-500 shadow-[0_0_15px_rgba(132,204,22,0.2)]'
          : isComplete
            ? 'bg-gray-800 border-2 border-gray-600'
            : 'bg-gray-800/50 border-2 border-gray-700/50 hover:border-gray-600'
        }
      `}
    >
      <span className={`text-[10px] uppercase tracking-wider font-semibold ${isActive ? 'text-lime-400' : 'text-gray-500'}`}>
        Game {gameNumber}
      </span>
      {hasScore ? (
        <span className={`text-sm font-bold mt-0.5 ${isActive ? 'text-white' : 'text-gray-300'}`}>
          {scoreA}-{scoreB}
        </span>
      ) : (
        <span className="text-xs text-gray-600 mt-0.5">--</span>
      )}

      {/* Active indicator glow */}
      {isActive && (
        <div className="absolute -bottom-px left-1/2 -translate-x-1/2 w-8 h-0.5 bg-lime-500 rounded-full shadow-[0_0_8px_rgba(132,204,22,0.8)]" />
      )}

      {/* Completion checkmark */}
      {isComplete && !isActive && (
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-lime-500 rounded-full flex items-center justify-center">
          <svg className="w-2.5 h-2.5 text-gray-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
    </button>
  );
};

// ============================================
// MAIN COMPONENT
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

  // Quick score buttons - standard pickleball game point options
  const quickScores = [11, 15, 21];

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

  // Check if current game is valid/complete
  const currentGameValidation = useMemo(() => {
    const game = scores[activeGame];
    if (!game) return { valid: false, error: 'No game' };
    return validateGameScore(game.scoreA, game.scoreB, settings);
  }, [scores, activeGame, settings]);

  // Calculate how many games should be visible based on progressive reveal
  const getVisibleGamesCount = (): number => {
    // Best of 1: always just 1 game
    if (bestOf === 1) return 1;

    // Start with at least 1 game visible
    let visibleCount = 1;

    // Check each completed game to see if next should be visible
    for (let i = 0; i < scores.length && i < bestOf - 1; i++) {
      const game = scores[i];
      const gameValid = validateGameScore(game.scoreA, game.scoreB, settings).valid;

      if (gameValid) {
        // Check if match is decided
        const gamesWonA = scores.slice(0, i + 1).filter(g => g.scoreA > g.scoreB).length;
        const gamesWonB = scores.slice(0, i + 1).filter(g => g.scoreB > g.scoreA).length;
        const gamesNeededToWin = Math.ceil(bestOf / 2);

        // If match not decided, next game should be visible
        if (gamesWonA < gamesNeededToWin && gamesWonB < gamesNeededToWin) {
          visibleCount = i + 2; // Show next game
        }
      }
    }

    return Math.min(visibleCount, bestOf);
  };

  // Auto-create next game when previous is complete (progressive reveal)
  useEffect(() => {
    if (bestOf === 1) return; // No progressive reveal for best of 1

    const visibleCount = getVisibleGamesCount();

    // Auto-add next game if needed and match not complete
    if (visibleCount > scores.length && scores.length < bestOf && !matchComplete) {
      const newGame = createEmptyGameScore(scores.length + 1);
      setScores(prev => [...prev, newGame]);
      setActiveGame(scores.length); // Focus new game
    }
  }, [scores, bestOf, matchComplete]);

  // Update a game score
  const updateScore = (gameIndex: number, side: 'scoreA' | 'scoreB', value: number) => {
    setScores(prev => {
      const updated = [...prev];
      updated[gameIndex] = {
        ...updated[gameIndex],
        [side]: Math.max(0, Math.min(99, value)),
      };
      return updated;
    });
    setError(null);
  };

  // Apply quick score (sets winner score and calculates loser)
  const applyQuickScore = (gameIndex: number, side: 'scoreA' | 'scoreB', score: number) => {
    const otherSide = side === 'scoreA' ? 'scoreB' : 'scoreA';

    // Calculate appropriate losing score
    let losingScore = 0;
    if (score > settings.pointsPerGame) {
      losingScore = score - 2;
    } else {
      losingScore = Math.max(0, score - 2);
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

  const currentGame = scores[activeGame] || { scoreA: 0, scoreB: 0 };
  const gamesNeeded = Math.ceil(bestOf / 2);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-gray-950 rounded-2xl shadow-2xl border border-gray-800 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Decorative top accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-lime-500 via-green-500 to-lime-500" />

        {/* Header */}
        <div className="relative px-5 py-4 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white">Enter Score</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Best of {bestOf} • {settings.pointsPerGame} pts • Win by {settings.winBy}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Match Score Header - Stadium Style */}
        <div className="relative px-5 py-4 bg-gray-900/50">
          {/* Subtle grid pattern */}
          <div className="absolute inset-0 opacity-5" style={{
            backgroundImage: 'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
            backgroundSize: '20px 20px'
          }} />

          <div className="relative flex items-center justify-center gap-6">
            {/* Side A */}
            <div className="flex-1 text-right">
              <p className={`text-sm font-medium truncate ${winnerState.gamesA > winnerState.gamesB ? 'text-lime-400' : 'text-gray-300'}`}>
                {match.sideA.name}
              </p>
              {match.sideA.duprRating && (
                <p className="text-[10px] text-gray-600 uppercase tracking-wider">
                  DUPR {match.sideA.duprRating.toFixed(2)}
                </p>
              )}
            </div>

            {/* Games Won Display */}
            <div className="flex items-center gap-3">
              <div className={`
                w-14 h-14 flex items-center justify-center rounded-lg text-3xl font-black
                ${winnerState.gamesA >= gamesNeeded
                  ? 'bg-lime-500/20 text-lime-400 border-2 border-lime-500/50'
                  : winnerState.gamesA > winnerState.gamesB
                    ? 'bg-gray-800 text-lime-400 border-2 border-gray-700'
                    : 'bg-gray-800 text-white border-2 border-gray-700'
                }
              `} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {winnerState.gamesA}
              </div>
              <span className="text-gray-600 text-xl font-light">-</span>
              <div className={`
                w-14 h-14 flex items-center justify-center rounded-lg text-3xl font-black
                ${winnerState.gamesB >= gamesNeeded
                  ? 'bg-lime-500/20 text-lime-400 border-2 border-lime-500/50'
                  : winnerState.gamesB > winnerState.gamesA
                    ? 'bg-gray-800 text-lime-400 border-2 border-gray-700'
                    : 'bg-gray-800 text-white border-2 border-gray-700'
                }
              `} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {winnerState.gamesB}
              </div>
            </div>

            {/* Side B */}
            <div className="flex-1 text-left">
              <p className={`text-sm font-medium truncate ${winnerState.gamesB > winnerState.gamesA ? 'text-lime-400' : 'text-gray-300'}`}>
                {match.sideB.name}
              </p>
              {match.sideB.duprRating && (
                <p className="text-[10px] text-gray-600 uppercase tracking-wider">
                  DUPR {match.sideB.duprRating.toFixed(2)}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Game Tabs */}
        {bestOf > 1 && (
          <div className="px-5 py-3 border-b border-gray-800 bg-gray-900/30">
            <div className="flex items-center gap-2">
              {scores.map((game, index) => {
                const gameValidation = validateGameScore(game.scoreA, game.scoreB, settings);
                return (
                  <GameTab
                    key={index}
                    gameNumber={index + 1}
                    isActive={activeGame === index}
                    isComplete={gameValidation.valid}
                    scoreA={game.scoreA}
                    scoreB={game.scoreB}
                    onClick={() => setActiveGame(index)}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Score Entry Area */}
        <div className="px-5 py-5 space-y-5">
          {/* Side A Score */}
          <ScoreStepper
            value={currentGame.scoreA}
            onChange={(v) => updateScore(activeGame, 'scoreA', v)}
            label={match.sideA.name}
            isWinning={currentGame.scoreA > currentGame.scoreB}
            quickScores={quickScores}
            onQuickScore={(score) => applyQuickScore(activeGame, 'scoreA', score)}
          />

          {/* VS Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent" />
            <span className="text-xs font-bold text-gray-600 uppercase tracking-widest">vs</span>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent" />
          </div>

          {/* Side B Score */}
          <ScoreStepper
            value={currentGame.scoreB}
            onChange={(v) => updateScore(activeGame, 'scoreB', v)}
            label={match.sideB.name}
            isWinning={currentGame.scoreB > currentGame.scoreA}
            quickScores={quickScores}
            onQuickScore={(score) => applyQuickScore(activeGame, 'scoreB', score)}
          />

          {/* Validation Status */}
          {(currentGame.scoreA > 0 || currentGame.scoreB > 0) && (
            <div className={`
              flex items-center gap-2 px-3 py-2 rounded-lg text-sm
              ${currentGameValidation.valid
                ? 'bg-lime-500/10 text-lime-400'
                : 'bg-red-500/10 text-red-400'
              }
            `}>
              {currentGameValidation.valid ? (
                <>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Valid score</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <span>{currentGameValidation.error}</span>
                </>
              )}
            </div>
          )}

          {/* Match Complete Banner */}
          {matchComplete && (
            <div className="relative overflow-hidden p-4 bg-gradient-to-r from-lime-500/20 via-green-500/20 to-lime-500/20 border border-lime-500/30 rounded-xl">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(132,204,22,0.15),transparent_70%)]" />
              <div className="relative flex items-center justify-center gap-3">
                <div className="w-8 h-8 bg-lime-500 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-gray-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-lime-400">Match Complete!</p>
                  <p className="text-xs text-gray-400">
                    Winner: {winnerState.winnerId === 'sideA' ? match.sideA.name : match.sideB.name}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-800 bg-gray-900/30 flex items-center justify-between">
          {scores.length > 1 ? (
            <button
              type="button"
              onClick={removeGame}
              className="text-sm text-gray-500 hover:text-red-400 transition-colors"
            >
              Remove last game
            </button>
          ) : (
            <div />
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!matchComplete || isLoading}
              className={`
                relative px-6 py-2.5 text-sm font-bold rounded-lg transition-all overflow-hidden
                ${matchComplete && !isLoading
                  ? 'bg-lime-500 text-gray-900 hover:bg-lime-400 shadow-[0_0_20px_rgba(132,204,22,0.3)] hover:shadow-[0_0_25px_rgba(132,204,22,0.4)]'
                  : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                }
              `}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Saving...
                </span>
              ) : (
                'Save Score'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScoreEntryModal;

/**
 * Live Scoring Interface
 *
 * Visual court-tap interface for scoring pickleball matches.
 * Tap team color to record rally winner. Handles side-out scoring.
 *
 * FILE: components/scoring/LiveScoringInterface.tsx
 * VERSION: V06.03
 */

import React, { useState, useCallback, useEffect } from 'react';
import type { LiveScore, ScoringActionResult } from '../../types/scoring';
import {
  processRally,
  undoLastRally,
  startGame,
  pauseGame,
  resumeGame,
  startNextGame,
  endMatchEarly,
  formatCurrentScore,
  formatMatchScore,
  applyResult,
} from '../../services/scoring/scoringLogic';

// =============================================================================
// PROPS
// =============================================================================

interface LiveScoringInterfaceProps {
  /** Initial live score state */
  initialState: LiveScore;
  /** Called when score changes (for Firebase sync) */
  onScoreChange?: (state: LiveScore) => void;
  /** Called when match completes */
  onMatchComplete?: (state: LiveScore) => void;
  /** Enable fullscreen mode */
  fullscreen?: boolean;
  /** Show debug info */
  debug?: boolean;
}

// =============================================================================
// COMPONENT
// =============================================================================

export const LiveScoringInterface: React.FC<LiveScoringInterfaceProps> = ({
  initialState,
  onScoreChange,
  onMatchComplete,
  fullscreen = false,
  debug = false,
}) => {
  // State
  const [state, setState] = useState<LiveScore>(initialState);
  const [showEndMatchModal, setShowEndMatchModal] = useState(false);
  const [hapticEnabled, setHapticEnabled] = useState(true);

  // Sync state changes
  useEffect(() => {
    onScoreChange?.(state);
  }, [state, onScoreChange]);

  // Check for match completion
  useEffect(() => {
    if (state.status === 'completed' && state.winnerId) {
      onMatchComplete?.(state);
    }
  }, [state.status, state.winnerId, onMatchComplete]);

  // Haptic feedback
  const triggerHaptic = useCallback(() => {
    if (hapticEnabled && 'vibrate' in navigator) {
      navigator.vibrate(50);
    }
  }, [hapticEnabled]);

  // ==========================================================================
  // ACTIONS
  // ==========================================================================

  const handleRallyWin = useCallback((team: 'A' | 'B') => {
    if (state.status !== 'in_progress') return;

    triggerHaptic();
    const result = processRally(state, team);
    if (result.success) {
      setState(applyResult(state, result));
    }
  }, [state, triggerHaptic]);

  const handleUndo = useCallback(() => {
    triggerHaptic();
    const result = undoLastRally(state);
    if (result.success) {
      setState(applyResult(state, result));
    }
  }, [state, triggerHaptic]);

  const handleStart = useCallback(() => {
    const result = startGame(state);
    if (result.success) {
      setState(applyResult(state, result));
    }
  }, [state]);

  const handlePause = useCallback(() => {
    const result = pauseGame(state);
    if (result.success) {
      setState(applyResult(state, result));
    }
  }, [state]);

  const handleResume = useCallback(() => {
    const result = resumeGame(state);
    if (result.success) {
      setState(applyResult(state, result));
    }
  }, [state]);

  const handleNextGame = useCallback(() => {
    const result = startNextGame(state);
    if (result.success) {
      setState(applyResult(state, result));
    }
  }, [state]);

  const handleEndMatch = useCallback((winnerId: 'A' | 'B', reason: string) => {
    const result = endMatchEarly(state, winnerId, reason);
    if (result.success) {
      setState(applyResult(state, result));
    }
    setShowEndMatchModal(false);
  }, [state]);

  // ==========================================================================
  // RENDER HELPERS
  // ==========================================================================

  const { teamA, teamB, scoreA, scoreB, servingTeam, serverNumber, settings, status, gamesWon, currentGame } = state;

  const isPlaying = status === 'in_progress';
  const isPaused = status === 'paused';
  const isBetweenGames = status === 'between_games';
  const isCompleted = status === 'completed';
  const isNotStarted = status === 'not_started';

  // Format score display
  const getScoreDisplay = () => {
    if (settings.sideOutScoring && settings.playType === 'doubles') {
      // Traditional: ServingScore - ReceivingScore - ServerNumber
      const servingScore = servingTeam === 'A' ? scoreA : scoreB;
      const receivingScore = servingTeam === 'A' ? scoreB : scoreA;
      return (
        <div className="text-center">
          <div className="text-6xl sm:text-8xl font-bold text-white tracking-wider">
            {servingScore} - {receivingScore} - {serverNumber}
          </div>
          <div className="text-gray-400 text-sm mt-2">
            Serving - Receiving - Server#
          </div>
        </div>
      );
    }

    return (
      <div className="text-6xl sm:text-8xl font-bold text-white tracking-wider text-center">
        {scoreA} - {scoreB}
      </div>
    );
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div className={`bg-gray-900 text-white ${fullscreen ? 'fixed inset-0 z-50' : 'min-h-screen'} flex flex-col`}>
      {/* Header */}
      <div className="bg-gray-800 px-4 py-3 flex items-center justify-between border-b border-gray-700">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏓</span>
          <div>
            <div className="font-semibold">{teamA.name} vs {teamB.name}</div>
            <div className="text-xs text-gray-400">
              Game {currentGame} of {settings.bestOf} • {settings.pointsPerGame} pts • Win by {settings.winBy}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Games Won */}
          <div className="bg-gray-700 rounded-lg px-3 py-1 text-sm">
            Games: {gamesWon.A} - {gamesWon.B}
          </div>
          {/* Status Badge */}
          <div className={`px-3 py-1 rounded-full text-xs font-medium ${
            isPlaying ? 'bg-green-600' :
            isPaused ? 'bg-yellow-600' :
            isBetweenGames ? 'bg-blue-600' :
            isCompleted ? 'bg-purple-600' :
            'bg-gray-600'
          }`}>
            {isPlaying ? 'LIVE' :
             isPaused ? 'PAUSED' :
             isBetweenGames ? 'BETWEEN GAMES' :
             isCompleted ? 'COMPLETED' :
             'NOT STARTED'}
          </div>
        </div>
      </div>

      {/* Score Display */}
      <div className="py-6 bg-gray-800/50">
        {getScoreDisplay()}
      </div>

      {/* Court Tap Area */}
      <div className="flex-1 flex">
        {/* Team A Side */}
        <button
          onClick={() => handleRallyWin('A')}
          disabled={!isPlaying}
          className={`flex-1 flex flex-col items-center justify-center p-4 transition-all ${
            isPlaying
              ? 'hover:brightness-110 active:brightness-90 cursor-pointer'
              : 'opacity-50 cursor-not-allowed'
          }`}
          style={{ backgroundColor: teamA.color }}
        >
          {/* Serving Indicator */}
          {servingTeam === 'A' && (
            <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/30 rounded-full px-3 py-1">
              <span className="w-3 h-3 bg-yellow-400 rounded-full animate-pulse" />
              <span className="text-sm font-medium">
                {settings.playType === 'doubles' ? `Server ${serverNumber}` : 'Serving'}
              </span>
            </div>
          )}

          <div className="text-white">
            <div className="text-3xl sm:text-5xl font-bold mb-2">{teamA.name}</div>
            {teamA.players && teamA.players.length > 0 && (
              <div className="text-white/80 text-sm sm:text-base">
                {teamA.players.join(' & ')}
              </div>
            )}
            <div className="mt-6 text-7xl sm:text-9xl font-bold">{scoreA}</div>
          </div>

          {/* Tap instruction */}
          {isPlaying && (
            <div className="absolute bottom-4 text-white/60 text-sm">
              Tap if {teamA.name} wins rally
            </div>
          )}
        </button>

        {/* Divider */}
        <div className="w-1 bg-white/20" />

        {/* Team B Side */}
        <button
          onClick={() => handleRallyWin('B')}
          disabled={!isPlaying}
          className={`flex-1 flex flex-col items-center justify-center p-4 transition-all ${
            isPlaying
              ? 'hover:brightness-110 active:brightness-90 cursor-pointer'
              : 'opacity-50 cursor-not-allowed'
          }`}
          style={{ backgroundColor: teamB.color }}
        >
          {/* Serving Indicator */}
          {servingTeam === 'B' && (
            <div className="absolute top-4 right-4 flex items-center gap-2 bg-black/30 rounded-full px-3 py-1">
              <span className="w-3 h-3 bg-yellow-400 rounded-full animate-pulse" />
              <span className="text-sm font-medium">
                {settings.playType === 'doubles' ? `Server ${serverNumber}` : 'Serving'}
              </span>
            </div>
          )}

          <div className="text-white">
            <div className="text-3xl sm:text-5xl font-bold mb-2">{teamB.name}</div>
            {teamB.players && teamB.players.length > 0 && (
              <div className="text-white/80 text-sm sm:text-base">
                {teamB.players.join(' & ')}
              </div>
            )}
            <div className="mt-6 text-7xl sm:text-9xl font-bold">{scoreB}</div>
          </div>

          {/* Tap instruction */}
          {isPlaying && (
            <div className="absolute bottom-4 text-white/60 text-sm">
              Tap if {teamB.name} wins rally
            </div>
          )}
        </button>
      </div>

      {/* Controls */}
      <div className="bg-gray-800 px-4 py-4 border-t border-gray-700">
        <div className="flex items-center justify-between gap-4 max-w-2xl mx-auto">
          {/* Undo */}
          <button
            onClick={handleUndo}
            disabled={state.rallyHistory.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            <span>↩️</span>
            <span>Undo</span>
          </button>

          {/* Main Action Button */}
          <div className="flex-1 flex justify-center">
            {isNotStarted && (
              <button
                onClick={handleStart}
                className="px-8 py-3 bg-green-600 hover:bg-green-500 rounded-lg font-semibold text-lg transition-colors"
              >
                Start Game
              </button>
            )}
            {isPlaying && (
              <button
                onClick={handlePause}
                className="px-8 py-3 bg-yellow-600 hover:bg-yellow-500 rounded-lg font-semibold text-lg transition-colors"
              >
                Pause
              </button>
            )}
            {isPaused && (
              <button
                onClick={handleResume}
                className="px-8 py-3 bg-green-600 hover:bg-green-500 rounded-lg font-semibold text-lg transition-colors"
              >
                Resume
              </button>
            )}
            {isBetweenGames && (
              <button
                onClick={handleNextGame}
                className="px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-semibold text-lg transition-colors"
              >
                Start Game {currentGame}
              </button>
            )}
            {isCompleted && (
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400 mb-1">
                  {state.winnerId === 'A' ? teamA.name : teamB.name} Wins!
                </div>
                <div className="text-gray-400">{formatMatchScore(state)}</div>
              </div>
            )}
          </div>

          {/* End Match */}
          <button
            onClick={() => setShowEndMatchModal(true)}
            disabled={isCompleted}
            className="flex items-center gap-2 px-4 py-2 bg-red-900/50 hover:bg-red-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
          >
            <span>🏁</span>
            <span>End</span>
          </button>
        </div>

        {/* Game History */}
        {state.completedGames.length > 0 && (
          <div className="mt-4 text-center text-sm text-gray-400">
            Games: {state.completedGames.map((g, i) => (
              <span key={i} className="mx-1">
                <span className={g.winnerId === 'A' ? 'text-blue-400' : 'text-orange-400'}>
                  {g.scoreA}-{g.scoreB}
                </span>
                {i < state.completedGames.length - 1 && ','}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* End Match Modal */}
      {showEndMatchModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-xl font-bold mb-4">End Match Early?</h3>
            <p className="text-gray-400 mb-6">Select the winner to end the match immediately.</p>

            <div className="space-y-3">
              <button
                onClick={() => handleEndMatch('A', 'Forfeit')}
                className="w-full py-3 rounded-lg font-semibold"
                style={{ backgroundColor: teamA.color }}
              >
                {teamA.name} Wins
              </button>
              <button
                onClick={() => handleEndMatch('B', 'Forfeit')}
                className="w-full py-3 rounded-lg font-semibold"
                style={{ backgroundColor: teamB.color }}
              >
                {teamB.name} Wins
              </button>
              <button
                onClick={() => setShowEndMatchModal(false)}
                className="w-full py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Debug Panel */}
      {debug && (
        <div className="fixed bottom-0 left-0 right-0 bg-black/90 text-xs text-green-400 p-2 font-mono max-h-40 overflow-auto">
          <pre>{JSON.stringify(state, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};

export default LiveScoringInterface;

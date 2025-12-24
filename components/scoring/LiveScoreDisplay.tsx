/**
 * Live Score Display
 *
 * Spectator view for watching a single match in real-time.
 * Shows score, serving indicator, and game history.
 *
 * FILE: components/scoring/LiveScoreDisplay.tsx
 * VERSION: V06.03
 */

import React, { useEffect, useState } from 'react';
import type { LiveScore } from '../../types/scoring';
import { subscribeToLiveScore, subscribeToStandaloneGame } from '../../services/firebase/liveScores';
import { formatMatchScore } from '../../services/scoring/scoringLogic';

// =============================================================================
// PROPS
// =============================================================================

interface LiveScoreDisplayProps {
  /** Live score ID to display */
  scoreId: string;
  /** Is this a standalone game (different collection) */
  isStandalone?: boolean;
  /** Compact mode for smaller displays */
  compact?: boolean;
  /** Show detailed game history */
  showHistory?: boolean;
  /** Custom className */
  className?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export const LiveScoreDisplay: React.FC<LiveScoreDisplayProps> = ({
  scoreId,
  isStandalone = false,
  compact = false,
  showHistory = true,
  className = '',
}) => {
  const [score, setScore] = useState<LiveScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to real-time updates
  useEffect(() => {
    setLoading(true);
    setError(null);

    const unsubscribe = isStandalone
      ? subscribeToStandaloneGame(scoreId, (game) => {
          setScore(game);
          setLoading(false);
          if (!game) setError('Game not found');
        })
      : subscribeToLiveScore(scoreId, (liveScore) => {
          setScore(liveScore);
          setLoading(false);
          if (!liveScore) setError('Match not found');
        });

    return () => unsubscribe();
  }, [scoreId, isStandalone]);

  // Loading state
  if (loading) {
    return (
      <div className={`bg-gray-800 rounded-xl p-6 flex items-center justify-center ${className}`}>
        <div className="animate-pulse text-gray-400">Loading score...</div>
      </div>
    );
  }

  // Error state
  if (error || !score) {
    return (
      <div className={`bg-gray-800 rounded-xl p-6 text-center ${className}`}>
        <div className="text-red-400">{error || 'Score not found'}</div>
      </div>
    );
  }

  const {
    teamA,
    teamB,
    scoreA,
    scoreB,
    servingTeam,
    serverNumber,
    settings,
    status,
    gamesWon,
    completedGames,
    currentGame,
    winnerId,
  } = score;

  const isCompleted = status === 'completed';
  const isLive = status === 'in_progress';
  const isPaused = status === 'paused';

  // ==========================================================================
  // COMPACT VIEW
  // ==========================================================================

  if (compact) {
    return (
      <div className={`bg-gray-800 rounded-lg p-4 ${className}`}>
        {/* Status Badge */}
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs text-gray-400">
            Game {currentGame} of {settings.bestOf}
          </div>
          <div className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            isLive ? 'bg-green-600' :
            isPaused ? 'bg-yellow-600' :
            isCompleted ? 'bg-purple-600' :
            'bg-gray-600'
          }`}>
            {isLive ? 'LIVE' :
             isPaused ? 'PAUSED' :
             isCompleted ? 'FINAL' :
             status.toUpperCase().replace('_', ' ')}
          </div>
        </div>

        {/* Teams & Scores */}
        <div className="space-y-2">
          <div className={`flex items-center justify-between ${
            isCompleted && winnerId === 'A' ? 'font-bold' : ''
          }`}>
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: teamA.color }}
              />
              <span className="text-white">{teamA.name}</span>
              {servingTeam === 'A' && !isCompleted && (
                <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-gray-400 text-sm">{gamesWon.A}</span>
              <span className="text-2xl font-bold text-white w-8 text-right">{scoreA}</span>
            </div>
          </div>

          <div className={`flex items-center justify-between ${
            isCompleted && winnerId === 'B' ? 'font-bold' : ''
          }`}>
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: teamB.color }}
              />
              <span className="text-white">{teamB.name}</span>
              {servingTeam === 'B' && !isCompleted && (
                <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-gray-400 text-sm">{gamesWon.B}</span>
              <span className="text-2xl font-bold text-white w-8 text-right">{scoreB}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // FULL VIEW
  // ==========================================================================

  return (
    <div className={`bg-gray-800 rounded-xl overflow-hidden ${className}`}>
      {/* Header */}
      <div className="bg-gray-900 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏓</span>
          <div>
            <div className="text-sm text-gray-400">
              {score.courtNumber ? `Court ${score.courtNumber}` : 'Live Match'}
            </div>
            <div className="text-xs text-gray-500">
              Game {currentGame} of {settings.bestOf} • {settings.pointsPerGame} pts • Win by {settings.winBy}
            </div>
          </div>
        </div>
        <div className={`px-3 py-1 rounded-full text-sm font-medium ${
          isLive ? 'bg-green-600 animate-pulse' :
          isPaused ? 'bg-yellow-600' :
          isCompleted ? 'bg-purple-600' :
          'bg-gray-600'
        }`}>
          {isLive ? 'LIVE' :
           isPaused ? 'PAUSED' :
           isCompleted ? 'FINAL' :
           status.toUpperCase().replace('_', ' ')}
        </div>
      </div>

      {/* Score Display */}
      <div className="p-6">
        {/* Traditional Score Format */}
        {settings.sideOutScoring && settings.playType === 'doubles' && !isCompleted && (
          <div className="text-center mb-6">
            <div className="text-5xl sm:text-6xl font-bold text-white tracking-wider">
              {servingTeam === 'A' ? scoreA : scoreB} - {servingTeam === 'A' ? scoreB : scoreA} - {serverNumber}
            </div>
            <div className="text-gray-400 text-sm mt-2">
              Serving - Receiving - Server#
            </div>
          </div>
        )}

        {/* Team Cards */}
        <div className="flex gap-4">
          {/* Team A */}
          <div
            className={`flex-1 rounded-xl p-4 relative ${
              isCompleted && winnerId === 'A' ? 'ring-2 ring-yellow-400' : ''
            }`}
            style={{ backgroundColor: teamA.color }}
          >
            {servingTeam === 'A' && !isCompleted && (
              <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/30 rounded-full px-2 py-1">
                <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                <span className="text-xs">S{serverNumber}</span>
              </div>
            )}
            {isCompleted && winnerId === 'A' && (
              <div className="absolute top-2 right-2 text-xl">🏆</div>
            )}
            <div className="text-center">
              <div className="font-semibold text-white text-lg mb-1">{teamA.name}</div>
              {teamA.players && teamA.players.length > 0 && (
                <div className="text-white/70 text-xs mb-3">
                  {teamA.players.join(' & ')}
                </div>
              )}
              <div className="text-5xl sm:text-6xl font-bold text-white">{scoreA}</div>
              <div className="text-white/60 text-sm mt-2">
                Games: {gamesWon.A}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="flex flex-col items-center justify-center">
            <div className="text-gray-500 text-2xl font-light">vs</div>
          </div>

          {/* Team B */}
          <div
            className={`flex-1 rounded-xl p-4 relative ${
              isCompleted && winnerId === 'B' ? 'ring-2 ring-yellow-400' : ''
            }`}
            style={{ backgroundColor: teamB.color }}
          >
            {servingTeam === 'B' && !isCompleted && (
              <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/30 rounded-full px-2 py-1">
                <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                <span className="text-xs">S{serverNumber}</span>
              </div>
            )}
            {isCompleted && winnerId === 'B' && (
              <div className="absolute top-2 right-2 text-xl">🏆</div>
            )}
            <div className="text-center">
              <div className="font-semibold text-white text-lg mb-1">{teamB.name}</div>
              {teamB.players && teamB.players.length > 0 && (
                <div className="text-white/70 text-xs mb-3">
                  {teamB.players.join(' & ')}
                </div>
              )}
              <div className="text-5xl sm:text-6xl font-bold text-white">{scoreB}</div>
              <div className="text-white/60 text-sm mt-2">
                Games: {gamesWon.B}
              </div>
            </div>
          </div>
        </div>

        {/* Winner Banner */}
        {isCompleted && winnerId && (
          <div className="mt-6 text-center">
            <div className="text-2xl font-bold text-green-400">
              {winnerId === 'A' ? teamA.name : teamB.name} Wins!
            </div>
            <div className="text-gray-400">{formatMatchScore(score)}</div>
          </div>
        )}

        {/* Game History */}
        {showHistory && completedGames.length > 0 && (
          <div className="mt-6 pt-4 border-t border-gray-700">
            <div className="text-sm text-gray-400 mb-2">Game History</div>
            <div className="flex flex-wrap gap-2">
              {completedGames.map((game, index) => (
                <div
                  key={index}
                  className={`px-3 py-1 rounded-lg text-sm ${
                    game.winnerId === 'A'
                      ? 'bg-blue-900/50 text-blue-300'
                      : 'bg-orange-900/50 text-orange-300'
                  }`}
                >
                  Game {game.gameNumber}: {game.scoreA}-{game.scoreB}
                  <span className="ml-1 opacity-60">
                    ({game.winnerId === 'A' ? teamA.name : teamB.name})
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Scorer Info */}
        {score.scorerName && (
          <div className="mt-4 text-center text-xs text-gray-500">
            Scored by: {score.scorerName}
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveScoreDisplay;

/**
 * ScoreSummary Component
 *
 * Shows current match score summary with game-by-game breakdown.
 *
 * @version V07.53
 * @file components/shared/scoring/ScoreSummary.tsx
 */

import React from 'react';
import type { GameInput } from './GameScoreEntry';

interface ScoreSummaryProps {
  /** Current game scores */
  games: GameInput[];
  /** Best of 1, 3, or 5 */
  bestOf: 1 | 3 | 5;
  /** Side A display name */
  sideAName: string;
  /** Side B display name */
  sideBName: string;
}

export const ScoreSummary: React.FC<ScoreSummaryProps> = ({
  games,
  bestOf,
  sideAName,
  sideBName,
}) => {
  // Calculate game wins
  let gamesA = 0;
  let gamesB = 0;

  games.forEach(game => {
    const scoreA = parseInt(game.scoreA) || 0;
    const scoreB = parseInt(game.scoreB) || 0;
    if (scoreA > scoreB) gamesA++;
    if (scoreB > scoreA) gamesB++;
  });

  const winThreshold = Math.ceil(bestOf / 2);
  const matchWinner = gamesA >= winThreshold ? sideAName :
    gamesB >= winThreshold ? sideBName : null;

  const filledGames = games.filter(g => g.scoreA !== '' || g.scoreB !== '');

  return (
    <div className="bg-gray-900 rounded-lg p-3 text-center">
      <div className="text-sm text-gray-400 mb-1">Match Score</div>

      {/* Game-by-game scores */}
      <div className="text-xl font-bold space-x-3">
        {filledGames.map((game, idx) => (
          <span key={idx} className="inline-block">
            <span className={parseInt(game.scoreA) > parseInt(game.scoreB) ? 'text-green-400' : 'text-white'}>
              {game.scoreA || '0'}
            </span>
            <span className="text-gray-500">-</span>
            <span className={parseInt(game.scoreB) > parseInt(game.scoreA) ? 'text-green-400' : 'text-white'}>
              {game.scoreB || '0'}
            </span>
            {idx < filledGames.length - 1 && (
              <span className="text-gray-600 ml-3">,</span>
            )}
          </span>
        ))}
      </div>

      {/* Game win count for best of 3/5 */}
      {bestOf > 1 && (
        <div className="text-sm text-gray-400 mt-1">
          Games: {gamesA} - {gamesB}
        </div>
      )}

      {/* Winner announcement */}
      {matchWinner && (
        <div className="text-sm text-green-400 mt-1">{matchWinner} wins!</div>
      )}
    </div>
  );
};

export default ScoreSummary;

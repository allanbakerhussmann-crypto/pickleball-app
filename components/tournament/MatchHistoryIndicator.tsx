/**
 * MatchHistoryIndicator
 *
 * Displays a team's recent match results as colored W/L boxes.
 * Similar to Challonge's match history column.
 *
 * V06.08 Changes:
 * - Added score-based winner calculation fallback when winnerId is not set
 * - Now correctly shows W/L even if match was completed without winnerId
 *
 * @version 06.08
 * @file components/tournament/MatchHistoryIndicator.tsx
 */

import React from 'react';
import type { Match } from '../../types';

interface MatchHistoryIndicatorProps {
  teamId: string;
  matches: Match[];
  maxResults?: number;
}

/**
 * Calculate winner from scores if winnerId is not set
 */
const calculateWinnerFromScores = (match: Match): string | null => {
  let pointsA = 0;
  let pointsB = 0;

  // Handle scores array (GameScore format)
  if (match.scores && Array.isArray(match.scores)) {
    match.scores.forEach((game) => {
      pointsA += game.scoreA || 0;
      pointsB += game.scoreB || 0;
    });
  }

  // Handle legacy scoreTeamAGames / scoreTeamBGames
  if (match.scoreTeamAGames && Array.isArray(match.scoreTeamAGames)) {
    pointsA += match.scoreTeamAGames.reduce((sum: number, s: number) => sum + s, 0);
  }
  if (match.scoreTeamBGames && Array.isArray(match.scoreTeamBGames)) {
    pointsB += match.scoreTeamBGames.reduce((sum: number, s: number) => sum + s, 0);
  }

  // Determine winner from points
  if (pointsA > pointsB) {
    return match.teamAId || match.sideA?.id || null;
  } else if (pointsB > pointsA) {
    return match.teamBId || match.sideB?.id || null;
  }

  // It's a tie (equal points)
  return null;
};

/**
 * Get match results for a team (W/L/T)
 */
const getMatchResults = (
  teamId: string,
  matches: Match[],
  maxResults: number
): ('W' | 'L' | 'T')[] => {
  // Filter to completed matches involving this team
  const teamMatches = matches
    .filter((m) => {
      const isInMatch =
        m.teamAId === teamId ||
        m.teamBId === teamId ||
        m.sideA?.id === teamId ||
        m.sideB?.id === teamId;
      return isInMatch && m.status === 'completed';
    })
    .sort((a, b) => {
      // Sort by completion time (most recent first)
      const timeA = a.endTime || a.lastUpdatedAt || 0;
      const timeB = b.endTime || b.lastUpdatedAt || 0;
      return timeB - timeA;
    })
    .slice(0, maxResults);

  return teamMatches.map((match) => {
    // Get winnerId from match, or calculate from scores if not set
    let winnerId: string | null | undefined = match.winnerTeamId || match.winnerId;

    // If winnerId is empty/falsy, calculate from scores
    if (!winnerId) {
      winnerId = calculateWinnerFromScores(match);
    }

    // Still no winner means it's a tie
    if (!winnerId) {
      return 'T';
    }

    if (winnerId === teamId) {
      return 'W';
    }

    // Otherwise it's a loss
    return 'L';
  });
};

export const MatchHistoryIndicator: React.FC<MatchHistoryIndicatorProps> = ({
  teamId,
  matches,
  maxResults = 5,
}) => {
  const results = getMatchResults(teamId, matches, maxResults);

  if (results.length === 0) {
    return <span className="text-gray-500 text-xs">-</span>;
  }

  // Reverse so oldest is first (left to right chronological)
  const chronologicalResults = [...results].reverse();

  return (
    <div className="flex gap-0.5">
      {chronologicalResults.map((result, index) => (
        <span
          key={index}
          className={`
            w-5 h-5 flex items-center justify-center text-xs font-bold rounded
            ${result === 'W' ? 'bg-green-600 text-white' : ''}
            ${result === 'L' ? 'bg-red-600 text-white' : ''}
            ${result === 'T' ? 'bg-gray-600 text-white' : ''}
          `}
        >
          {result}
        </span>
      ))}
    </div>
  );
};

export default MatchHistoryIndicator;

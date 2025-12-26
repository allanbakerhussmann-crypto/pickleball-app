/**
 * MatchHistoryIndicator
 *
 * Displays a team's recent match results as colored W/L boxes.
 * Similar to Challonge's match history column.
 *
 * @version 06.04
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
    const isTeamA = match.teamAId === teamId || match.sideA?.id === teamId;
    const winnerId = match.winnerTeamId || match.winnerId;

    if (!winnerId) {
      // Tie or no winner recorded
      return 'T';
    }

    if (winnerId === teamId) {
      return 'W';
    }

    // Check if the winner is the opponent
    if (isTeamA && (winnerId === match.teamBId || winnerId === match.sideB?.id)) {
      return 'L';
    }
    if (!isTeamA && (winnerId === match.teamAId || winnerId === match.sideA?.id)) {
      return 'L';
    }

    // Shouldn't reach here, but default to tie
    return 'T';
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

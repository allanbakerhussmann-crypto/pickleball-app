/**
 * MeetupResults Component
 *
 * Displays final results for a completed meetup competition.
 * Shows podium, final standings, and match summary.
 *
 * FILE LOCATION: components/meetups/MeetupResults.tsx
 * VERSION: V06.16
 */

import React, { useMemo } from 'react';
import type { MeetupMatch, MeetupStanding } from '../../services/firebase/meetupMatches';

// ============================================
// TYPES
// ============================================

interface MeetupResultsProps {
  standings: MeetupStanding[];
  matches: MeetupMatch[];
  competitionType: string;
  meetupTitle?: string;
}

// ============================================
// COMPONENT
// ============================================

export const MeetupResults: React.FC<MeetupResultsProps> = ({
  standings,
  matches,
  competitionType,
  meetupTitle,
}) => {
  // Get top 3 finishers
  const podium = useMemo(() => {
    return standings.slice(0, 3);
  }, [standings]);

  // Match stats
  const matchStats = useMemo(() => {
    const completed = matches.filter((m) => m.status === 'completed');
    const duprSubmitted = matches.filter((m) => m.duprSubmitted);

    return {
      total: matches.length,
      completed: completed.length,
      duprSubmitted: duprSubmitted.length,
    };
  }, [matches]);

  if (standings.length === 0 && matches.length === 0) {
    return (
      <div className="text-center py-8 bg-gray-800/50 rounded-lg">
        <p className="text-gray-400">No results yet</p>
        <p className="text-gray-500 text-sm mt-1">
          Complete matches to see final results
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white">
          {meetupTitle || 'Meetup'} Results
        </h2>
        <p className="text-gray-400 text-sm mt-1">
          {competitionType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
        </p>
      </div>

      {/* Podium */}
      {podium.length > 0 && (
        <div className="bg-gradient-to-b from-gray-800 to-gray-900 rounded-xl p-6">
          <h3 className="text-center text-lg font-bold text-white mb-6">
            Final Standings
          </h3>

          <div className="flex items-end justify-center gap-4 mb-6">
            {/* 2nd Place */}
            {podium[1] && (
              <div className="flex flex-col items-center">
                <div className="text-4xl mb-2">🥈</div>
                <div className="w-24 bg-gray-600 rounded-t-lg p-3 text-center h-24 flex flex-col justify-end">
                  <p className="text-white font-semibold text-sm truncate">
                    {podium[1].name}
                  </p>
                  <p className="text-gray-400 text-xs">
                    {podium[1].wins}W - {podium[1].losses}L
                  </p>
                </div>
              </div>
            )}

            {/* 1st Place */}
            {podium[0] && (
              <div className="flex flex-col items-center">
                <div className="text-5xl mb-2">🥇</div>
                <div className="w-28 bg-yellow-600/30 border-2 border-yellow-500 rounded-t-lg p-3 text-center h-32 flex flex-col justify-end">
                  <p className="text-yellow-400 font-bold text-sm truncate">
                    {podium[0].name}
                  </p>
                  <p className="text-yellow-500/70 text-xs">
                    {podium[0].wins}W - {podium[0].losses}L
                  </p>
                </div>
              </div>
            )}

            {/* 3rd Place */}
            {podium[2] && (
              <div className="flex flex-col items-center">
                <div className="text-4xl mb-2">🥉</div>
                <div className="w-24 bg-orange-800/30 rounded-t-lg p-3 text-center h-20 flex flex-col justify-end">
                  <p className="text-orange-300 font-semibold text-sm truncate">
                    {podium[2].name}
                  </p>
                  <p className="text-orange-400/60 text-xs">
                    {podium[2].wins}W - {podium[2].losses}L
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Full Standings */}
      {standings.length > 0 && (
        <div className="bg-gray-800 rounded-xl p-4">
          <h3 className="text-lg font-bold text-white mb-4">Complete Standings</h3>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-700">
                  <th className="py-2 px-2 w-12">#</th>
                  <th className="py-2 px-2">Player</th>
                  <th className="py-2 px-2 text-center">P</th>
                  <th className="py-2 px-2 text-center">W</th>
                  <th className="py-2 px-2 text-center">L</th>
                  <th className="py-2 px-2 text-center">GD</th>
                  <th className="py-2 px-2 text-center font-bold">Pts</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((player, index) => (
                  <tr
                    key={player.odUserId}
                    className="border-b border-gray-800"
                  >
                    <td className="py-2 px-2">
                      {index === 0 && '🥇'}
                      {index === 1 && '🥈'}
                      {index === 2 && '🥉'}
                      {index > 2 && <span className="text-gray-500">{index + 1}</span>}
                    </td>
                    <td className="py-2 px-2 font-medium text-white">
                      {player.name}
                      {player.duprId && (
                        <span className="ml-1 text-xs text-[#00B4D8]">●</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-center text-gray-400">
                      {player.played}
                    </td>
                    <td className="py-2 px-2 text-center text-green-400">
                      {player.wins}
                    </td>
                    <td className="py-2 px-2 text-center text-red-400">
                      {player.losses}
                    </td>
                    <td className="py-2 px-2 text-center">
                      <span
                        className={
                          player.gameDiff > 0
                            ? 'text-green-400'
                            : player.gameDiff < 0
                            ? 'text-red-400'
                            : 'text-gray-400'
                        }
                      >
                        {player.gameDiff > 0 ? '+' : ''}
                        {player.gameDiff}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-center font-bold text-white">
                      {player.points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Match Summary */}
      <div className="bg-gray-800 rounded-xl p-4">
        <h3 className="text-lg font-bold text-white mb-4">Match Summary</h3>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-900 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-white">{matchStats.total}</p>
            <p className="text-xs text-gray-500">Total Matches</p>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-green-400">{matchStats.completed}</p>
            <p className="text-xs text-gray-500">Completed</p>
          </div>
          <div className="bg-gray-900 rounded-lg p-4 text-center">
            <p className="text-3xl font-bold text-[#00B4D8]">{matchStats.duprSubmitted}</p>
            <p className="text-xs text-gray-500">DUPR Submitted</p>
          </div>
        </div>
      </div>

      {/* Recent Matches */}
      {matches.filter((m) => m.status === 'completed').length > 0 && (
        <div className="bg-gray-800 rounded-xl p-4">
          <h3 className="text-lg font-bold text-white mb-4">Match Results</h3>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {matches
              .filter((m) => m.status === 'completed')
              .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))
              .map((match) => (
                <div
                  key={match.id}
                  className="bg-gray-900 rounded-lg p-3 flex items-center justify-between"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          match.winnerId === match.player1Id
                            ? 'text-green-400 font-semibold'
                            : 'text-gray-400'
                        }
                      >
                        {match.player1Name}
                        {match.winnerId === match.player1Id && ' 🏆'}
                      </span>
                      <span className="text-gray-600">vs</span>
                      <span
                        className={
                          match.winnerId === match.player2Id
                            ? 'text-green-400 font-semibold'
                            : 'text-gray-400'
                        }
                      >
                        {match.player2Name}
                        {match.winnerId === match.player2Id && ' 🏆'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-white font-mono">
                      {match.games.map((g) => `${g.player1}-${g.player2}`).join(', ')}
                    </span>
                    {match.duprSubmitted && (
                      <span className="text-[#00B4D8] text-xs">DUPR ✓</span>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MeetupResults;

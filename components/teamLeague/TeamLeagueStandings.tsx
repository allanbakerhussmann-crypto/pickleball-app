/**
 * TeamLeagueStandings Component
 *
 * Displays team standings in a table format with stats.
 * Shows rank, team name, played, wins, losses, draws,
 * boards won/lost, board diff, and total points.
 *
 * FILE LOCATION: components/teamLeague/TeamLeagueStandings.tsx
 * VERSION: V07.53
 */

import React from 'react';
import type {
  InterclubTeam,
  TeamLeagueStanding,
  TeamLeagueSettings,
} from '../../types/teamLeague';

// ============================================
// TYPES
// ============================================

interface TeamLeagueStandingsProps {
  standings: TeamLeagueStanding[];
  teams: InterclubTeam[];
  settings: TeamLeagueSettings;
  isOrganizer: boolean;
  onRecalculate: () => Promise<void>;
  recalculating: boolean;
}

// ============================================
// COMPONENT
// ============================================

export const TeamLeagueStandings: React.FC<TeamLeagueStandingsProps> = ({
  standings,
  teams,
  settings,
  isOrganizer,
  onRecalculate,
  recalculating,
}) => {
  // Get team info by ID
  const getTeamInfo = (teamId: string) => {
    return teams.find(t => t.id === teamId);
  };

  // Format board differential with color
  const formatBoardDiff = (diff: number) => {
    if (diff > 0) {
      return <span className="text-lime-400">+{diff}</span>;
    } else if (diff < 0) {
      return <span className="text-red-400">{diff}</span>;
    }
    return <span className="text-gray-400">0</span>;
  };

  // Render empty state
  if (standings.length === 0) {
    return (
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-8 text-center">
        <div className="text-5xl mb-4">🏆</div>
        <h3 className="text-lg font-semibold text-white mb-2">No Standings Yet</h3>
        <p className="text-gray-400">
          Standings will appear once fixtures have been completed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with recalculate button */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <span>🏆</span>
          League Standings
        </h2>
        {isOrganizer && (
          <button
            onClick={onRecalculate}
            disabled={recalculating}
            className={`
              px-3 py-1.5 rounded-lg text-sm font-medium
              flex items-center gap-2 transition-colors
              ${recalculating
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-gray-700 hover:bg-gray-600 text-white'
              }
            `}
          >
            {recalculating ? (
              <>
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Recalculating...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Recalculate
              </>
            )}
          </button>
        )}
      </div>

      {/* Tiebreaker info */}
      <div className="bg-gray-800/30 rounded-lg px-4 py-2 border border-gray-700/30">
        <span className="text-gray-400 text-sm">
          Tiebreakers: {settings.tieBreakerOrder.map(t => {
            switch (t) {
              case 'matchWins': return 'Match Wins';
              case 'boardDiff': return 'Board Diff';
              case 'headToHead': return 'Head-to-Head';
              case 'pointDiff': return 'Point Diff';
              default: return t;
            }
          }).join(' → ')}
        </span>
      </div>

      {/* Standings table */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-900/50 text-gray-400 text-xs uppercase tracking-wide">
                <th className="px-4 py-3 text-left font-semibold">#</th>
                <th className="px-4 py-3 text-left font-semibold">Team</th>
                <th className="px-4 py-3 text-center font-semibold">P</th>
                <th className="px-4 py-3 text-center font-semibold">W</th>
                <th className="px-4 py-3 text-center font-semibold">L</th>
                <th className="px-4 py-3 text-center font-semibold">D</th>
                <th className="px-4 py-3 text-center font-semibold">BW</th>
                <th className="px-4 py-3 text-center font-semibold">BL</th>
                <th className="px-4 py-3 text-center font-semibold">+/-</th>
                <th className="px-4 py-3 text-center font-semibold">Pts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {standings.map((standing, index) => {
                const team = getTeamInfo(standing.teamId);
                const isWithdrawn = standing.withdrawn || team?.status === 'withdrawn';

                return (
                  <tr
                    key={standing.teamId}
                    className={`
                      transition-colors
                      ${isWithdrawn ? 'opacity-50' : 'hover:bg-gray-700/30'}
                      ${index === 0 ? 'bg-lime-600/10' : ''}
                      ${index === 1 ? 'bg-gray-600/10' : ''}
                      ${index === 2 ? 'bg-amber-600/10' : ''}
                    `}
                  >
                    {/* Rank */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {index === 0 && <span className="text-lg">🥇</span>}
                        {index === 1 && <span className="text-lg">🥈</span>}
                        {index === 2 && <span className="text-lg">🥉</span>}
                        {index > 2 && (
                          <span className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-sm text-gray-300">
                            {standing.rank}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Team Name */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div>
                          <div className={`font-medium ${isWithdrawn ? 'text-gray-500 line-through' : 'text-white'}`}>
                            {standing.teamName}
                          </div>
                          {team?.clubName && (
                            <div className="text-xs text-gray-500">{team.clubName}</div>
                          )}
                          {isWithdrawn && (
                            <div className="text-xs text-red-400">Withdrawn</div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Played */}
                    <td className="px-4 py-3 text-center text-gray-300">
                      {standing.stats.played}
                    </td>

                    {/* Wins */}
                    <td className="px-4 py-3 text-center">
                      <span className="text-lime-400 font-medium">{standing.stats.wins}</span>
                    </td>

                    {/* Losses */}
                    <td className="px-4 py-3 text-center">
                      <span className="text-red-400">{standing.stats.losses}</span>
                    </td>

                    {/* Draws */}
                    <td className="px-4 py-3 text-center text-gray-400">
                      {standing.stats.draws}
                    </td>

                    {/* Boards Won */}
                    <td className="px-4 py-3 text-center text-gray-300">
                      {standing.stats.boardsWon}
                    </td>

                    {/* Boards Lost */}
                    <td className="px-4 py-3 text-center text-gray-300">
                      {standing.stats.boardsLost}
                    </td>

                    {/* Board Diff */}
                    <td className="px-4 py-3 text-center font-medium">
                      {formatBoardDiff(standing.stats.boardDiff)}
                    </td>

                    {/* Points */}
                    <td className="px-4 py-3 text-center">
                      <span className="text-xl font-bold text-white">
                        {standing.stats.points}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
        <span>P = Played</span>
        <span>W = Won</span>
        <span>L = Lost</span>
        <span>D = Draw</span>
        <span>BW = Boards Won</span>
        <span>BL = Boards Lost</span>
        <span>+/- = Board Diff</span>
        <span>Pts = Points</span>
      </div>
    </div>
  );
};

export default TeamLeagueStandings;

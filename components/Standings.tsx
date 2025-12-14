
/* ---- START Standings.tsx ---- */
import React from 'react';
import type { StandingsEntry } from '../types';

type H2HMatrix = Record<string, Record<string, number>>;

interface StandingsTeam {
  id: string;
  name: string;
  players?: string[];
  pendingInvitedUserId?: string | null;
  pendingInvitedUserDisplayName?: string | null;
}

type StandingsRow = StandingsEntry & {
  team?: StandingsTeam;
};

interface StandingsProps {
  standings: StandingsRow[];
  tieBreakers?: string[];
  h2hLookup?: H2HMatrix;
}

export const Standings: React.FC<StandingsProps> = ({ standings, tieBreakers, h2hLookup }) => {
  const showPlayer2 = standings.some(row => row.team?.players && row.team.players.length > 1 || row.team?.pendingInvitedUserId);

  if (!standings || standings.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-bold mb-4 text-green-400">Standings</h2>
        <p className="text-gray-400 text-sm italic">No standings available yet. Play some matches first.</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-1 sm:p-6 border border-gray-700 overflow-hidden shadow-lg">
      <h2 className="text-xl font-bold m-4 text-green-400 hidden sm:block">Standings</h2>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead>
            <tr className="bg-gray-900/50 text-xs uppercase text-gray-500 border-b border-gray-700/50 font-bold tracking-wider">
              <th className="py-3 px-3 text-center w-14">Rank</th>
              <th className="py-3 px-3 min-w-[120px]">Team</th>
              <th className="py-3 px-3 text-center">PLD</th>
              <th className="py-3 px-3 text-center">W</th>
              <th className="py-3 px-3 text-center">L</th>
              <th className="py-3 px-3 text-center hidden sm:table-cell">PF</th>
              <th className="py-3 px-3 text-center hidden sm:table-cell">PA</th>
              <th className="py-3 px-3 text-center font-bold">Diff</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row, index) => {
              const players = row.team?.players || [];
              const p1 = players[0] || '-';
              const p2 = players[1] || row.team?.pendingInvitedUserDisplayName || row.team?.pendingInvitedUserId || '-';
              const pd = row.pointDifference ?? 0;
              const rank = index + 1;

              // Rank styling
              let rankBadge = <span className="font-mono text-gray-500 text-sm">#{rank}</span>;
              if (rank === 1) rankBadge = <span className="bg-yellow-500 text-yellow-950 font-black px-2.5 py-0.5 rounded text-xs shadow-lg shadow-yellow-500/20 border border-yellow-400">1st</span>;
              if (rank === 2) rankBadge = <span className="bg-gray-300 text-gray-800 font-black px-2 py-0.5 rounded text-xs border border-gray-400">2nd</span>;
              if (rank === 3) rankBadge = <span className="bg-orange-700 text-orange-100 font-black px-2 py-0.5 rounded text-xs border border-orange-600">3rd</span>;

              return (
                <tr key={row.teamId} className="border-b border-gray-800 hover:bg-gray-700/30 transition-colors">
                  <td className="py-3 px-3 text-center">
                      {rankBadge}
                  </td>
                  <td className="py-3 px-3">
                      <div className="font-bold text-white text-base truncate max-w-[150px] sm:max-w-none">{row.team?.name || row.teamName}</div>
                      <div className="text-xs text-gray-500 flex gap-1 mt-0.5 font-medium truncate max-w-[150px] sm:max-w-none">
                          <span>{p1}</span>
                          {showPlayer2 && <><span className="text-gray-600">/</span><span>{p2}</span></>}
                      </div>
                  </td>
                  <td className="py-3 px-3 text-center text-gray-400 font-mono">{row.played}</td>
                  <td className="py-3 px-3 text-center">
                      <span className="bg-green-900/30 text-green-400 font-bold px-2 py-1 rounded border border-green-900/50">{row.wins}</span>
                  </td>
                  <td className="py-3 px-3 text-center text-gray-500 font-mono">{row.losses}</td>
                  <td className="py-3 px-3 text-center text-gray-600 hidden sm:table-cell font-mono text-xs">{row.pointsFor}</td>
                  <td className="py-3 px-3 text-center text-gray-600 hidden sm:table-cell font-mono text-xs">{row.pointsAgainst}</td>
                  <td className="py-3 px-3 text-center">
                      <span className={`font-bold ${pd > 0 ? 'text-green-400' : pd < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                        {pd > 0 ? `+${pd}` : pd}
                      </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {tieBreakers && tieBreakers.length > 0 && (
        <div className="p-4 bg-gray-900/30 border-t border-gray-700/50 text-[10px] text-gray-500">
          <span className="font-bold text-gray-400 uppercase tracking-wider">Ordering Rule:</span>{' '}
          {tieBreakers.filter(Boolean).map(t => t.replace('_', ' ')).join(' → ')}
        </div>
      )}
    </div>
  );
};
/* ---- END Standings.tsx ---- */

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
    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h2 className="text-xl font-bold mb-4 text-green-400">3. Standings</h2>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          <thead>
            <tr className="bg-gray-900 text-xs uppercase text-gray-400 border-b border-gray-700">
              <th className="py-2 px-3 text-center w-10">#</th>
              <th className="py-2 px-3">Team</th>
              <th className="py-2 px-3">Player 1</th>
              {showPlayer2 && <th className="py-2 px-3">Player 2</th>}
              <th className="py-2 px-3 text-center">PLD</th>
              <th className="py-2 px-3 text-center">W</th>
              <th className="py-2 px-3 text-center">L</th>
              <th className="py-2 px-3 text-center">PF</th>
              <th className="py-2 px-3 text-center">PA</th>
              <th className="py-2 px-3 text-center">PD</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row, index) => {
              const players = row.team?.players || [];
              const p1 = players[0] || '-';
              const p2 = players[1] || row.team?.pendingInvitedUserDisplayName || row.team?.pendingInvitedUserId || '-';
              const pd = row.pointDifference ?? 0;

              return (
                <tr key={row.teamId} className="border-b border-gray-800 hover:bg-gray-900/60">
                  <td className="py-2 px-3 text-center text-gray-300 text-xs">{index + 1}</td>
                  <td className="py-2 px-3 font-semibold text-white">{row.team?.name || row.teamName}</td>
                  <td className="py-2 px-3 text-gray-200">{p1}</td>
                  {showPlayer2 && <td className="py-2 px-3 text-gray-200">{p2}</td>}
                  <td className="py-2 px-3 text-center text-gray-200">{row.played}</td>
                  <td className="py-2 px-3 text-center text-green-400 font-semibold">{row.wins}</td>
                  <td className="py-2 px-3 text-center text-red-400">{row.losses}</td>
                  <td className="py-2 px-3 text-center text-gray-200">{row.pointsFor}</td>
                  <td className="py-2 px-3 text-center text-gray-200">{row.pointsAgainst}</td>
                  <td className={`py-2 px-3 text-center font-semibold ${pd > 0 ? 'text-green-400' : pd < 0 ? 'text-red-400' : 'text-gray-300'}`}>
                    {pd > 0 ? `+${pd}` : pd}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {tieBreakers && tieBreakers.length > 0 && (
        <div className="mt-4 text-[11px] text-gray-500">
          <span className="font-semibold text-gray-400">Tie-breakers order:</span>{' '}
          {tieBreakers.filter(Boolean).join(' → ')}
        </div>
      )}
    </div>
  );
};
/* ---- END Standings.tsx ---- */

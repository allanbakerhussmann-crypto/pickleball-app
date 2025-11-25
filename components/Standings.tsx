
import React from 'react';
import type { StandingsEntry, TieBreaker } from '../types';

interface StandingsEntryWithTeam extends StandingsEntry {
    team: {
        id: string;
        name: string;
        players?: string[];
    };
}

interface StandingsProps {
  standings: StandingsEntryWithTeam[];
  tieBreakers?: [TieBreaker, TieBreaker?, TieBreaker?]; // Ordered list
  h2hLookup?: Record<string, Record<string, number>>; // Map of teamId -> opponentId -> wins
}

export const Standings: React.FC<StandingsProps> = ({ standings, tieBreakers, h2hLookup }) => {
  // Default breakers if not provided
  const breakers = tieBreakers || ['match_wins', 'point_diff', 'head_to_head'];

  const sortedStandings = [...standings].sort((a, b) => {
    // Iterate through tie breakers
    for (const criteria of breakers) {
        if (!criteria) continue;

        if (criteria === 'match_wins') {
            if (b.wins !== a.wins) return b.wins - a.wins;
        } else if (criteria === 'point_diff') {
            if (b.pointDifference !== a.pointDifference) return b.pointDifference - a.pointDifference;
        } else if (criteria === 'head_to_head') {
            // Check if one team beat the other
            const aWinsAgainstB = h2hLookup?.[a.team.id]?.[b.team.id] || 0;
            const bWinsAgainstA = h2hLookup?.[b.team.id]?.[a.team.id] || 0;
            
            if (aWinsAgainstB > bWinsAgainstA) return -1; // A comes first
            if (bWinsAgainstA > aWinsAgainstB) return 1;  // B comes first
        }
    }
    // Fallback alphabetical
    return a.teamName.localeCompare(b.teamName);
  });

  return (
    <div className="bg-gray-800 rounded-lg p-6 shadow-lg">
      <h2 className="text-2xl font-bold mb-4 text-green-400">3. Standings</h2>
      {standings.length === 0 ? (
        <div className="text-center text-gray-400 italic py-10">
            <p>Standings will appear here once the tournament starts.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-gray-300">
            <thead className="text-xs text-green-400 uppercase bg-gray-700">
              <tr>
                <th scope="col" className="px-3 py-3 text-center">#</th>
                <th scope="col" className="px-4 py-3">Team</th>
                <th scope="col" className="px-4 py-3">Player 1</th>
                <th scope="col" className="px-4 py-3">Player 2</th>
                <th scope="col" className="px-2 py-3 text-center">Pld</th>
                <th scope="col" className="px-2 py-3 text-center">W</th>
                <th scope="col" className="px-2 py-3 text-center">L</th>
                <th scope="col" className="px-2 py-3 text-center">PF</th>
                <th scope="col" className="px-2 py-3 text-center">PA</th>
                <th scope="col" className="px-2 py-3 text-center">PD</th>
              </tr>
            </thead>
            <tbody>
              {sortedStandings.map((entry, index) => (
                <tr key={entry.team.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                  <td className="px-3 py-3 font-medium text-center">{index + 1}</td>
                  <td className="px-4 py-3 font-medium text-white truncate max-w-[150px]">{entry.team.name}</td>
                  <td className="px-4 py-3 text-gray-400 truncate max-w-[120px]">{entry.team.players?.[0] || '-'}</td>
                  <td className="px-4 py-3 text-gray-400 truncate max-w-[120px]">{entry.team.players?.[1] || '-'}</td>
                  <td className="px-2 py-3 text-center">{entry.played}</td>
                  <td className="px-2 py-3 text-center font-bold text-white">{entry.wins}</td>
                  <td className="px-2 py-3 text-center">{entry.losses}</td>
                  <td className="px-2 py-3 text-center">{entry.pointsFor}</td>
                  <td className="px-2 py-3 text-center">{entry.pointsAgainst}</td>
                  <td className={`px-2 py-3 text-center font-bold ${entry.pointDifference > 0 ? 'text-green-400' : entry.pointDifference < 0 ? 'text-red-400' : ''}`}>
                    {entry.pointDifference > 0 ? '+' : ''}{entry.pointDifference}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

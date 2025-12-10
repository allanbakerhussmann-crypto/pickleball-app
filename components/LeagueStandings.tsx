
import React from 'react';
import type { StandingsEntry } from '../types';

interface LeagueStandingsProps {
    standings: StandingsEntry[];
}

export const LeagueStandings: React.FC<LeagueStandingsProps> = ({ standings }) => {
    // Sort: Points DESC, then Diff DESC, then Wins DESC
    const sorted = [...standings].sort((a, b) => {
        if ((b.points || 0) !== (a.points || 0)) return (b.points || 0) - (a.points || 0);
        if (b.pointDifference !== a.pointDifference) return b.pointDifference - a.pointDifference;
        return b.wins - a.wins;
    });

    return (
        <div className="bg-gray-800 rounded-lg p-4 sm:p-6 border border-gray-700 overflow-hidden">
            <h2 className="text-xl font-bold mb-4 text-green-400">League Table</h2>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-gray-900 text-xs uppercase text-gray-400 border-b border-gray-700">
                        <tr>
                            <th className="py-3 px-4 w-12 text-center">Pos</th>
                            <th className="py-3 px-4">Team / Player</th>
                            <th className="py-3 px-4 text-center">P</th>
                            <th className="py-3 px-4 text-center">W</th>
                            <th className="py-3 px-4 text-center">D</th>
                            <th className="py-3 px-4 text-center">L</th>
                            <th className="py-3 px-4 text-center hidden sm:table-cell">PF</th>
                            <th className="py-3 px-4 text-center hidden sm:table-cell">PA</th>
                            <th className="py-3 px-4 text-center">Diff</th>
                            <th className="py-3 px-4 text-center font-bold text-white">Pts</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {sorted.map((row, index) => {
                            const draws = row.played - row.wins - row.losses;
                            return (
                                <tr key={row.teamId} className="hover:bg-gray-700/50 transition-colors">
                                    <td className="py-3 px-4 text-center font-mono text-gray-500">{index + 1}</td>
                                    <td className="py-3 px-4 font-semibold text-white">{row.teamName}</td>
                                    <td className="py-3 px-4 text-center text-gray-300">{row.played}</td>
                                    <td className="py-3 px-4 text-center text-green-400">{row.wins}</td>
                                    <td className="py-3 px-4 text-center text-gray-400">{draws > 0 ? draws : '-'}</td>
                                    <td className="py-3 px-4 text-center text-red-400">{row.losses}</td>
                                    <td className="py-3 px-4 text-center text-gray-500 hidden sm:table-cell">{row.pointsFor}</td>
                                    <td className="py-3 px-4 text-center text-gray-500 hidden sm:table-cell">{row.pointsAgainst}</td>
                                    <td className="py-3 px-4 text-center font-mono">{row.pointDifference > 0 ? `+${row.pointDifference}` : row.pointDifference}</td>
                                    <td className="py-3 px-4 text-center font-bold text-lg text-white bg-gray-900/30">{row.points || 0}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

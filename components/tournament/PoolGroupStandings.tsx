/**
 * PoolGroupStandings
 *
 * Displays pool play standings grouped by pool (Group A, Group B, etc.)
 * with collapsible sections, advancement badges, and match history.
 *
 * V06.39 Changes:
 * - Added plateSettings prop to display plate bracket indicator
 * - Shows consolation bracket info when plateEnabled is true
 *
 * V06.37 Changes:
 * - Now uses configurable tiebreakers from poolSettings.tiebreakers
 * - Added head-to-head tiebreaker support
 * - UI now matches bracket generation tiebreaker logic
 *
 * V06.08 Changes:
 * - Fixed wins/losses calculation to derive winner from scores when winnerId is not set
 * - Now correctly counts W/L even for matches completed without winnerId
 *
 * @version 06.39
 * @file components/tournament/PoolGroupStandings.tsx
 */

import React, { useState, useMemo } from 'react';
import type { Match, Team } from '../../types';
import type { PoolPlayMedalsSettings } from '../../types/formats/formatTypes';
import { MatchHistoryIndicator } from './MatchHistoryIndicator';

// ============================================
// TYPES
// ============================================

// V06.39: Plate bracket settings from DivisionFormat
interface PlateSettings {
  plateEnabled?: boolean;
  plateThirdPlace?: boolean;
  plateName?: string;
}

interface PoolGroupStandingsProps {
  matches: Match[];
  teams: Team[];
  poolSettings?: PoolPlayMedalsSettings;
  plateSettings?: PlateSettings;  // V06.39: For displaying plate bracket indicator
  getTeamPlayers?: (teamId: string) => { displayName: string }[];
}

interface PoolStandingRow {
  teamId: string;
  teamName: string;
  players: string[];
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDifference: number;
  rank: number;
  isAdvancing: boolean;
}

interface PoolGroup {
  poolName: string;
  standings: PoolStandingRow[];
  matches: Match[];
  isComplete: boolean;
}

// ============================================
// HELPERS
// ============================================

/**
 * Extract unique pool names from matches
 * Also handles legacy matches with stage='Pool Play' but no poolGroup
 */
function getPoolNames(matches: Match[]): string[] {
  const poolSet = new Set<string>();
  let hasLegacyPoolMatches = false;

  (matches || []).forEach((m) => {
    if (m.poolGroup) {
      poolSet.add(m.poolGroup);
    } else if (m.stage === 'Pool Play' || m.stage === 'pool') {
      // Legacy match without poolGroup - mark for default pool
      hasLegacyPoolMatches = true;
    }
  });

  // If we have legacy pool matches without poolGroup, add a default pool
  if (hasLegacyPoolMatches && poolSet.size === 0) {
    poolSet.add('Pool A');
  }

  // Sort alphabetically (Pool A, Pool B, etc.)
  return Array.from(poolSet).sort();
}

type TiebreakerKey = 'wins' | 'head_to_head' | 'point_diff' | 'points_scored';

/**
 * Calculate standings for a single pool
 *
 * V06.37: Now uses configurable tiebreakers from poolSettings
 */
function calculatePoolStandings(
  poolMatches: Match[],
  teams: Team[],
  advancementCount: number,
  tiebreakers: TiebreakerKey[] = ['wins', 'head_to_head', 'point_diff', 'points_scored']
): PoolStandingRow[] {
  // Get all team IDs involved in this pool
  const teamIds = new Set<string>();
  (poolMatches || []).forEach((m) => {
    if (m.teamAId) teamIds.add(m.teamAId);
    if (m.teamBId) teamIds.add(m.teamBId);
    if (m.sideA?.id) teamIds.add(m.sideA.id);
    if (m.sideB?.id) teamIds.add(m.sideB.id);
  });

  // Build standings map
  const standingsMap = new Map<string, PoolStandingRow>();

  teamIds.forEach((teamId) => {
    const team = (teams || []).find((t) => t.id === teamId);
    // Extract player names from team.players array (which are objects with name property)
    const playerNames: string[] = team?.players?.map(p => p.name) || [];
    standingsMap.set(teamId, {
      teamId,
      teamName: team?.teamName || team?.name || 'Unknown Team',
      players: playerNames,
      played: 0,
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDifference: 0,
      rank: 0,
      isAdvancing: false,
    });
  });

  // Process completed matches
  (poolMatches || [])
    .filter((m) => m.status === 'completed')
    .forEach((match) => {
      const teamAId = match.teamAId || match.sideA?.id;
      const teamBId = match.teamBId || match.sideB?.id;
      if (!teamAId || !teamBId) return;

      const rowA = standingsMap.get(teamAId);
      const rowB = standingsMap.get(teamBId);
      if (!rowA || !rowB) return;

      // Calculate total points from scores - use modern format OR legacy, not both
      let pointsA = 0;
      let pointsB = 0;

      if (match.scores && Array.isArray(match.scores) && match.scores.length > 0) {
        // Use modern scores array
        match.scores.forEach((game) => {
          pointsA += game.scoreA || 0;
          pointsB += game.scoreB || 0;
        });
      } else if (match.scoreTeamAGames?.length && match.scoreTeamBGames?.length) {
        // Fallback to legacy format ONLY if modern is empty
        pointsA = match.scoreTeamAGames.reduce((sum: number, s: number) => sum + s, 0);
        pointsB = match.scoreTeamBGames.reduce((sum: number, s: number) => sum + s, 0);
      }

      // Update played
      rowA.played += 1;
      rowB.played += 1;

      // Update points
      rowA.pointsFor += pointsA;
      rowA.pointsAgainst += pointsB;
      rowB.pointsFor += pointsB;
      rowB.pointsAgainst += pointsA;

      // Determine winner - use winnerId if set, otherwise calculate from scores
      let winnerId = match.winnerTeamId || match.winnerId;

      // If winnerId is not set, determine winner from scores
      if (!winnerId && (pointsA !== 0 || pointsB !== 0)) {
        if (pointsA > pointsB) {
          winnerId = teamAId;
        } else if (pointsB > pointsA) {
          winnerId = teamBId;
        }
        // If pointsA === pointsB, it's a tie - winnerId stays undefined
      }

      // Update wins/losses
      if (winnerId === teamAId) {
        rowA.wins += 1;
        rowB.losses += 1;
      } else if (winnerId === teamBId) {
        rowB.wins += 1;
        rowA.losses += 1;
      }
      // If winnerId is still undefined, it's a tie - no wins/losses recorded
    });

  // Calculate point difference and sort
  const standings = Array.from(standingsMap.values());
  standings.forEach((row) => {
    row.pointDifference = row.pointsFor - row.pointsAgainst;
  });

  // V06.37: Sort using configurable tiebreakers
  // Completed matches for head-to-head lookup
  const completedMatches = (poolMatches || []).filter(m => m.status === 'completed');

  standings.sort((a, b) => {
    for (const tiebreaker of tiebreakers) {
      let comparison = 0;

      switch (tiebreaker) {
        case 'wins':
          comparison = b.wins - a.wins;
          break;

        case 'head_to_head':
          // Find direct match between these two teams
          const directMatch = completedMatches.find(m => {
            const teamAId = m.teamAId || m.sideA?.id;
            const teamBId = m.teamBId || m.sideB?.id;
            return (
              (teamAId === a.teamId && teamBId === b.teamId) ||
              (teamAId === b.teamId && teamBId === a.teamId)
            );
          });
          if (directMatch) {
            const winnerId = directMatch.winnerTeamId || directMatch.winnerId;
            if (winnerId === a.teamId) comparison = -1;
            else if (winnerId === b.teamId) comparison = 1;
          }
          break;

        case 'point_diff':
          comparison = b.pointDifference - a.pointDifference;
          break;

        case 'points_scored':
          comparison = b.pointsFor - a.pointsFor;
          break;
      }

      if (comparison !== 0) return comparison;
    }
    return 0;
  });

  // Assign ranks and advancement
  standings.forEach((row, index) => {
    row.rank = index + 1;
    row.isAdvancing = index < advancementCount;
  });

  return standings;
}

// ============================================
// SUB-COMPONENTS
// ============================================

interface PoolSectionProps {
  pool: PoolGroup;
  getTeamPlayers?: (teamId: string) => { displayName: string }[];
  defaultExpanded?: boolean;
}

const PoolSection: React.FC<PoolSectionProps> = ({
  pool,
  getTeamPlayers,
  defaultExpanded = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [activeSubTab, setActiveSubTab] = useState<'standings' | 'matches'>('standings');

  const completedMatches = (pool.matches || []).filter((m) => m.status === 'completed').length;
  const totalMatches = (pool.matches || []).length;
  const progressPercent = totalMatches > 0 ? (completedMatches / totalMatches) * 100 : 0;

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden mb-4">
      {/* Pool Header (Collapsible) */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-900/50 hover:bg-gray-900/70 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-white">{pool.poolName}</span>
          <span className="text-xs text-gray-500">
            {pool.standings.length} teams
          </span>
          {pool.isComplete && (
            <span className="bg-green-600/20 text-green-400 text-xs px-2 py-0.5 rounded border border-green-600/30">
              Complete
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Progress bar */}
          <div className="w-24 h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="text-xs text-gray-500">
            {completedMatches}/{totalMatches}
          </span>
          {/* Expand/Collapse Icon */}
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Pool Content */}
      {isExpanded && (
        <div className="p-4">
          {/* Sub-tabs: Standings | Matches */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setActiveSubTab('standings')}
              className={`px-3 py-1.5 text-sm rounded transition-colors ${
                activeSubTab === 'standings'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Standings
            </button>
            <button
              onClick={() => setActiveSubTab('matches')}
              className={`px-3 py-1.5 text-sm rounded transition-colors ${
                activeSubTab === 'matches'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Matches
            </button>
          </div>

          {/* Standings Table */}
          {activeSubTab === 'standings' && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase text-gray-500 border-b border-gray-700">
                    <th className="py-2 px-2 text-center w-12">Rank</th>
                    <th className="py-2 px-2 text-left">Team</th>
                    <th className="py-2 px-2 text-center">PLD</th>
                    <th className="py-2 px-2 text-center">W</th>
                    <th className="py-2 px-2 text-center">L</th>
                    <th className="py-2 px-2 text-center hidden sm:table-cell">PF</th>
                    <th className="py-2 px-2 text-center hidden sm:table-cell">PA</th>
                    <th className="py-2 px-2 text-center">Diff</th>
                    <th className="py-2 px-2 text-center hidden sm:table-cell">History</th>
                  </tr>
                </thead>
                <tbody>
                  {(pool.standings || []).map((row) => {
                    const players = getTeamPlayers
                      ? getTeamPlayers(row.teamId).map((p) => p.displayName)
                      : row.players;
                    const p1 = players[0] || '-';
                    const p2 = players[1] || '-';
                    const pd = row.pointDifference;

                    return (
                      <tr
                        key={row.teamId}
                        className={`border-b border-gray-800 hover:bg-gray-700/30 transition-colors ${
                          row.isAdvancing ? 'bg-green-900/10' : ''
                        }`}
                      >
                        <td className="py-2 px-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {row.isAdvancing && (
                              <span className="bg-green-600 text-white text-[10px] px-1.5 py-0.5 rounded font-bold">
                                Advancing to Finals
                              </span>
                            )}
                            {!row.isAdvancing && (
                              <span className="text-gray-500 font-mono">#{row.rank}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-2">
                          <div className="font-bold text-white truncate max-w-[120px] sm:max-w-none">
                            {row.teamName}
                          </div>
                          <div className="text-xs text-gray-500">
                            {p1} {players.length > 1 && `/ ${p2}`}
                          </div>
                        </td>
                        <td className="py-2 px-2 text-center text-gray-400 font-mono">
                          {row.played}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <span className="bg-green-900/30 text-green-400 font-bold px-2 py-0.5 rounded">
                            {row.wins}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-center text-gray-500 font-mono">
                          {row.losses}
                        </td>
                        <td className="py-2 px-2 text-center text-gray-600 hidden sm:table-cell font-mono text-xs">
                          {row.pointsFor}
                        </td>
                        <td className="py-2 px-2 text-center text-gray-600 hidden sm:table-cell font-mono text-xs">
                          {row.pointsAgainst}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <span
                            className={`font-bold ${
                              pd > 0 ? 'text-green-400' : pd < 0 ? 'text-red-400' : 'text-gray-500'
                            }`}
                          >
                            {pd > 0 ? `+${pd}` : pd}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-center hidden sm:table-cell">
                          <MatchHistoryIndicator teamId={row.teamId} matches={pool.matches} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Matches List */}
          {activeSubTab === 'matches' && (
            <div className="space-y-2">
              {(pool.matches || []).length === 0 ? (
                <p className="text-gray-500 text-sm italic">No matches scheduled yet.</p>
              ) : (
                (pool.matches || []).map((match) => {
                  const teamAName =
                    match.sideA?.name ||
                    match.teamAId ||
                    'TBD';
                  const teamBName =
                    match.sideB?.name ||
                    match.teamBId ||
                    'TBD';
                  const isCompleted = match.status === 'completed';
                  const winnerId = match.winnerTeamId || match.winnerId;

                  // Get scores - check both modern and legacy formats
                  let scoreDisplay = '-';
                  if (isCompleted) {
                    if (match.scores && (match.scores || []).length > 0) {
                      // Modern format: scores[] array
                      scoreDisplay = (match.scores || [])
                        .map((g) => `${g.scoreA}-${g.scoreB}`)
                        .join(', ');
                    } else if ((match.scoreTeamAGames || []).length && (match.scoreTeamBGames || []).length) {
                      // Legacy format: scoreTeamAGames[] and scoreTeamBGames[]
                      scoreDisplay = (match.scoreTeamAGames || [])
                        .map((a: number, i: number) => `${a}-${(match.scoreTeamBGames || [])[i]}`)
                        .join(', ');
                    }
                  }

                  return (
                    <div
                      key={match.id}
                      className={`flex items-center justify-between p-3 rounded border ${
                        isCompleted
                          ? 'bg-gray-900/30 border-gray-700'
                          : 'bg-gray-800 border-gray-600'
                      }`}
                    >
                      <div className="flex-1">
                        <div
                          className={`font-medium ${
                            winnerId === (match.teamAId || match.sideA?.id)
                              ? 'text-green-400'
                              : 'text-white'
                          }`}
                        >
                          {teamAName}
                        </div>
                        <div className="text-xs text-gray-500">vs</div>
                        <div
                          className={`font-medium ${
                            winnerId === (match.teamBId || match.sideB?.id)
                              ? 'text-green-400'
                              : 'text-white'
                          }`}
                        >
                          {teamBName}
                        </div>
                      </div>
                      <div className="text-right">
                        {isCompleted ? (
                          <span className="text-sm text-gray-300 font-mono">{scoreDisplay}</span>
                        ) : (
                          <span
                            className={`text-xs px-2 py-1 rounded ${
                              match.status === 'in_progress'
                                ? 'bg-yellow-600/20 text-yellow-400'
                                : 'bg-gray-700 text-gray-400'
                            }`}
                          >
                            {match.status === 'in_progress' ? 'In Progress' : 'Scheduled'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

export const PoolGroupStandings: React.FC<PoolGroupStandingsProps> = ({
  matches,
  teams,
  poolSettings,
  plateSettings,  // V06.39
  getTeamPlayers,
}) => {
  // Determine advancement count from settings
  const advancementCount = useMemo(() => {
    if (!poolSettings) return 2; // Default: top 2 advance
    switch (poolSettings.advancementRule) {
      case 'top_1':
        return 1;
      case 'top_2':
        return 2;
      case 'top_n_plus_best':
        return poolSettings.advancementCount || 2;
      default:
        return 2;
    }
  }, [poolSettings]);

  // Group matches by pool and calculate standings
  const poolGroups = useMemo<PoolGroup[]>(() => {
    const poolNames = getPoolNames(matches);

    return poolNames.map((poolName) => {
      // Filter matches for this pool
      // Include matches with matching poolGroup OR legacy matches (stage='Pool Play'/'pool' without poolGroup)
      const poolMatches = (matches || []).filter((m) => {
        if (m.poolGroup === poolName) return true;
        // For legacy matches without poolGroup, assign to 'Pool A' (the default)
        if (!m.poolGroup && (m.stage === 'Pool Play' || m.stage === 'pool') && poolName === 'Pool A') {
          return true;
        }
        return false;
      });
      // V06.37: Pass tiebreakers from poolSettings (or use default order)
      const tiebreakers = poolSettings?.tiebreakers || ['wins', 'head_to_head', 'point_diff', 'points_scored'];
      const standings = calculatePoolStandings(poolMatches, teams, advancementCount, tiebreakers as TiebreakerKey[]);
      const completedCount = (poolMatches || []).filter((m) => m.status === 'completed').length;
      const isComplete = poolMatches.length > 0 && completedCount === poolMatches.length;

      return {
        poolName,
        standings,
        matches: poolMatches,
        isComplete,
      };
    });
  }, [matches, teams, advancementCount, poolSettings?.tiebreakers]);

  // Overall progress - include both modern (poolGroup) and legacy (stage='Pool Play'/'pool') matches
  const isPoolMatch = (m: Match) => m.poolGroup || m.stage === 'Pool Play' || m.stage === 'pool';
  const totalMatches = (matches || []).filter(isPoolMatch).length;
  const completedMatches = (matches || []).filter(
    (m) => isPoolMatch(m) && m.status === 'completed'
  ).length;
  const poolStageComplete = totalMatches > 0 && completedMatches === totalMatches;

  if (poolGroups.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-bold mb-4 text-green-400">Pool Stage</h2>
        <p className="text-gray-400 text-sm italic">
          No pool matches found. Generate a schedule to create pool matches.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-green-400">Pool Stage</h2>
        <div className="flex items-center gap-2">
          {poolStageComplete ? (
            <span className="bg-green-600/20 text-green-400 text-sm px-3 py-1 rounded border border-green-600/30">
              Pool Stage Complete
            </span>
          ) : (
            <span className="text-sm text-gray-500">
              {completedMatches} / {totalMatches} matches
            </span>
          )}
        </div>
      </div>

      {/* Pool advancement info */}
      <div className="bg-gray-900/50 rounded p-3 mb-4 text-sm text-gray-400">
        <div className="mb-1">
          <span className="text-gray-300 font-medium">Advancement Rule:</span>{' '}
          {poolSettings?.advancementRule === 'top_1' && 'Top 1 from each pool advances'}
          {poolSettings?.advancementRule === 'top_2' && 'Top 2 from each pool advance'}
          {poolSettings?.advancementRule === 'top_n_plus_best' &&
            `Top ${advancementCount} from each pool advance`}
          {!poolSettings && 'Top 2 from each pool advance'}
        </div>
        {/* V06.38: Always show tiebreakers with fallback to defaults */}
        <div>
          <span className="text-gray-300 font-medium">Tiebreakers:</span>{' '}
          {(poolSettings?.tiebreakers || ['wins', 'head_to_head', 'point_diff', 'points_scored']).map((tb, i) => {
            const labels: Record<string, string> = {
              wins: 'Wins',
              head_to_head: 'Head-to-Head',
              point_diff: 'Point Diff',
              points_scored: 'Points Scored',
            };
            return (
              <span key={tb}>
                {i > 0 && ' → '}
                {labels[tb] || tb}
              </span>
            );
          })}
        </div>
        {/* V06.39: Show plate bracket indication if enabled */}
        {plateSettings?.plateEnabled && (
          <div className="mt-1 text-amber-400">
            <span className="font-medium">Consolation:</span>{' '}
            Non-advancing teams play in {plateSettings?.plateName || 'Plate'} bracket
            {plateSettings?.plateThirdPlace && ' (with 3rd place match)'}
          </div>
        )}
      </div>

      {/* Pool Sections */}
      {poolGroups.map((pool) => (
        <PoolSection
          key={pool.poolName}
          pool={pool}
          getTeamPlayers={getTeamPlayers}
          defaultExpanded={true}
        />
      ))}
    </div>
  );
};

export default PoolGroupStandings;

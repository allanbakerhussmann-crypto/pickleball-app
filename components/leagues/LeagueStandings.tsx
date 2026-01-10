/**
 * LeagueStandings Component V07.33
 *
 * Enhanced standings display with rankings, stats, and visual improvements.
 * Supports ladder challenge buttons for ladder format leagues.
 * V07.33: Replaced Streak/Form columns with DIFF (point differential) for tiebreaker visibility.
 * V07.11: Added tiebreaker-based sorting for weekly round robin mode.
 * V07.13: Added showPointsForAgainst prop for displaying PF/PA columns.
 *
 * FILE LOCATION: components/leagues/LeagueStandings.tsx
 */

import React, { useState, useMemo } from 'react';
import type { LeagueMember, LeagueFormat, LeagueType, LeagueTiebreaker } from '../../types';

// ============================================
// TYPES
// ============================================

interface LeagueStandingsProps {
  members: LeagueMember[];
  format: LeagueFormat;
  leagueType: LeagueType;
  currentUserId?: string;
  onChallenge?: (member: LeagueMember) => void;
  onViewProfile?: (member: LeagueMember) => void;
  myMembership?: LeagueMember | null;
  challengeRange?: number;
  compact?: boolean;
  // V07.11: Tiebreaker support for weekly round robin
  tiebreakers?: LeagueTiebreaker[];
  isWeeklyFullRR?: boolean;
  // V07.13: Show Points For/Against columns (for Overall view)
  showPointsForAgainst?: boolean;
}

type SortField = 'rank' | 'points' | 'wins' | 'played' | 'winRate';
type SortDirection = 'asc' | 'desc';

// ============================================
// HELPERS
// ============================================

const getRankDisplay = (rank: number): { emoji: string; color: string } => {
  switch (rank) {
    case 1: return { emoji: '🥇', color: 'text-yellow-400' };
    case 2: return { emoji: '🥈', color: 'text-gray-300' };
    case 3: return { emoji: '🥉', color: 'text-orange-400' };
    default: return { emoji: '', color: 'text-white' };
  }
};

const calculateWinRate = (wins: number, played: number): number => {
  if (played === 0) return 0;
  return Math.round((wins / played) * 100);
};

// V07.11: Compare two members by a single tiebreaker (higher is better, returns negative if a > b)
const compareTiebreaker = (a: LeagueMember, b: LeagueMember, tb: LeagueTiebreaker): number => {
  const aStats = a.stats || {};
  const bStats = b.stats || {};

  switch (tb) {
    case 'league_points':
      return (bStats.points || 0) - (aStats.points || 0);
    case 'wins':
      return (bStats.wins || 0) - (aStats.wins || 0);
    case 'point_diff':
      const aDiff = (aStats.pointsFor || 0) - (aStats.pointsAgainst || 0);
      const bDiff = (bStats.pointsFor || 0) - (bStats.pointsAgainst || 0);
      return bDiff - aDiff;
    case 'points_for':
      return (bStats.pointsFor || 0) - (aStats.pointsFor || 0);
    case 'points_against':
      return (aStats.pointsAgainst || 0) - (bStats.pointsAgainst || 0); // Lower is better
    case 'game_diff':
      const aGDiff = (aStats.gamesWon || 0) - (aStats.gamesLost || 0);
      const bGDiff = (bStats.gamesWon || 0) - (bStats.gamesLost || 0);
      return bGDiff - aGDiff;
    case 'games_won':
      return (bStats.gamesWon || 0) - (aStats.gamesWon || 0);
    case 'games_lost':
      return (aStats.gamesLost || 0) - (bStats.gamesLost || 0); // Lower is better
    case 'head_to_head':
      // Head-to-head requires match lookup - not implemented, return 0 (tie)
      return 0;
    case 'recent_form':
      // Recent form comparison - count recent wins
      const aWins = (aStats.recentForm || []).filter((r: string) => r === 'W').length;
      const bWins = (bStats.recentForm || []).filter((r: string) => r === 'W').length;
      return bWins - aWins;
    default:
      return 0;
  }
};

// ============================================
// COMPONENT
// ============================================

export const LeagueStandings: React.FC<LeagueStandingsProps> = ({
  members,
  format,
  leagueType,
  currentUserId,
  onChallenge,
  onViewProfile,
  myMembership,
  challengeRange = 3,
  compact = false,
  tiebreakers,
  isWeeklyFullRR = false,
  showPointsForAgainst = false,
}) => {
  const [sortField, setSortField] = useState<SortField>('rank');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [searchTerm, setSearchTerm] = useState('');

  // Labels based on league type
  const isTeamBased = leagueType === 'doubles' || leagueType === 'mixed_doubles' || leagueType === 'team';
  const entityLabel = isTeamBased ? 'Team' : 'Player';

  // V07.11: Default tiebreakers for weekly RR mode
  const effectiveTiebreakers = tiebreakers || (isWeeklyFullRR
    ? ['league_points', 'wins', 'point_diff', 'points_for', 'head_to_head'] as LeagueTiebreaker[]
    : ['wins', 'game_diff', 'games_won'] as LeagueTiebreaker[]);

  // Sort and filter members
  const sortedMembers = useMemo(() => {
    // V07.27: Include pending_partner members for doubles leagues
    let filtered = (members || []).filter(m => m.status === 'active' || m.status === 'pending_partner');

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(m =>
        m.displayName.toLowerCase().includes(term) ||
        (m.partnerDisplayName && m.partnerDisplayName.toLowerCase().includes(term))
      );
    }

    // Sort
    return [...filtered].sort((a, b) => {
      // V07.11: When sorting by rank in weekly RR mode, use tiebreakers
      if (sortField === 'rank' && isWeeklyFullRR) {
        for (const tb of effectiveTiebreakers) {
          const diff = compareTiebreaker(a, b, tb);
          if (diff !== 0) return diff;
        }
        return 0;
      }

      let aVal: number, bVal: number;

      switch (sortField) {
        case 'rank':
          aVal = a.currentRank || 999;
          bVal = b.currentRank || 999;
          break;
        case 'points':
          aVal = a.stats?.points || 0;
          bVal = b.stats?.points || 0;
          break;
        case 'wins':
          aVal = a.stats?.wins || 0;
          bVal = b.stats?.wins || 0;
          break;
        case 'played':
          aVal = a.stats?.played || 0;
          bVal = b.stats?.played || 0;
          break;
        case 'winRate':
          aVal = calculateWinRate(a.stats?.wins || 0, a.stats?.played || 0);
          bVal = calculateWinRate(b.stats?.wins || 0, b.stats?.played || 0);
          break;
        default:
          aVal = a.currentRank || 999;
          bVal = b.currentRank || 999;
      }

      const diff = sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
      // Secondary sort by rank if equal
      if (diff === 0) {
        return (a.currentRank || 999) - (b.currentRank || 999);
      }
      return diff;
    });
  }, [members, searchTerm, sortField, sortDirection, isWeeklyFullRR, effectiveTiebreakers]);

  // Handle sort toggle
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'rank' ? 'asc' : 'desc');
    }
  };

  // Check if user can challenge this member (ladder only)
  const canChallenge = (member: LeagueMember): boolean => {
    if (!myMembership || !onChallenge) return false;
    if (member.userId === currentUserId) return false;
    if (format !== 'ladder') return false;
    
    const myRank = myMembership.currentRank;
    const theirRank = member.currentRank;
    
    // Can only challenge players ranked higher (lower number)
    if (theirRank >= myRank) return false;
    
    // Check challenge range
    return (myRank - theirRank) <= challengeRange;
  };

  // Sort indicator component
  const SortIcon: React.FC<{ field: SortField }> = ({ field }) => {
    if (sortField !== field) return <span className="text-gray-600 ml-1">↕</span>;
    return <span className="text-blue-400 ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>;
  };

  // ============================================
  // COMPACT VIEW (for sidebar/widget)
  // ============================================
  if (compact) {
    return (
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="bg-gray-900/50 px-4 py-3 border-b border-gray-700">
          <h3 className="font-semibold text-white">🏆 Standings</h3>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {sortedMembers.length === 0 ? (
            <div className="py-8 text-center text-gray-500">No players yet</div>
          ) : (
            sortedMembers.slice(0, 10).map((member) => {
              const isMe = member.userId === currentUserId;
              const rank = getRankDisplay(member.currentRank);
              
              return (
                <div
                  key={member.id}
                  onClick={() => onViewProfile?.(member)}
                  className={`flex items-center justify-between px-4 py-3 border-b border-gray-700/50 last:border-b-0 cursor-pointer transition-colors ${
                    isMe ? 'bg-blue-900/30' : 'hover:bg-gray-700/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`font-bold w-8 ${rank.color}`}>
                      {rank.emoji}{member.currentRank}
                    </span>
                    <div>
                      <span className={`font-medium ${isMe ? 'text-blue-400' : 'text-white'}`}>
                        {member.displayName}
                      </span>
                      {member.partnerDisplayName && (
                        <span className="text-gray-500 text-sm"> / {member.partnerDisplayName}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-white">{member.stats?.points || 0} pts</div>
                    <div className="text-xs text-gray-500">
                      {member.stats?.wins || 0}W-{member.stats?.losses || 0}L
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        {members.length > 10 && (
          <div className="px-4 py-2 text-center text-xs text-gray-500 bg-gray-900/30 border-t border-gray-700">
            +{members.length - 10} more
          </div>
        )}
      </div>
    );
  }

  // ============================================
  // FULL VIEW
  // ============================================
  return (
    <div className="space-y-4">
      {/* Search & Stats Bar */}
      {members.length > 5 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={`Search ${entityLabel.toLowerCase()}s...`}
              className="w-full bg-gray-800 border border-gray-700 text-white pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:border-blue-500 text-sm"
            />
            <span className="absolute left-3 top-2.5 text-gray-500">🔍</span>
          </div>
          <div className="text-sm text-gray-400">
            {sortedMembers.length} {entityLabel.toLowerCase()}{sortedMembers.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* Empty State */}
      {sortedMembers.length === 0 ? (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-12 text-center">
          <div className="text-4xl mb-3">🏆</div>
          <h3 className="text-lg font-semibold text-white mb-2">No Standings Yet</h3>
          <p className="text-gray-400 text-sm">
            {searchTerm 
              ? `No ${entityLabel.toLowerCase()}s match your search`
              : `Be the first to join and claim the #1 spot!`
            }
          </p>
        </div>
      ) : (
        /* Standings Table */
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-900/70 text-xs uppercase text-gray-500">
                <tr>
                  <th 
                    className="py-3 px-4 text-center w-16 cursor-pointer hover:bg-gray-800 transition-colors"
                    onClick={() => handleSort('rank')}
                  >
                    Rank <SortIcon field="rank" />
                  </th>
                  <th className="py-3 px-4 text-left">{entityLabel}</th>
                  <th 
                    className="py-3 px-4 text-center cursor-pointer hover:bg-gray-800 transition-colors"
                    onClick={() => handleSort('played')}
                  >
                    P <SortIcon field="played" />
                  </th>
                  <th 
                    className="py-3 px-4 text-center cursor-pointer hover:bg-gray-800 transition-colors"
                    onClick={() => handleSort('wins')}
                  >
                    W <SortIcon field="wins" />
                  </th>
                  <th className="py-3 px-4 text-center">L</th>
                  <th
                    className="py-3 px-4 text-center hidden sm:table-cell cursor-pointer hover:bg-gray-800 transition-colors"
                    onClick={() => handleSort('winRate')}
                  >
                    Win% <SortIcon field="winRate" />
                  </th>
                  {showPointsForAgainst && (
                    <>
                      <th className="py-3 px-4 text-center hidden md:table-cell">PF</th>
                      <th className="py-3 px-4 text-center hidden md:table-cell">PA</th>
                    </>
                  )}
                  <th className="py-3 px-4 text-center hidden md:table-cell">GD</th>
                  <th 
                    className="py-3 px-4 text-center cursor-pointer hover:bg-gray-800 transition-colors"
                    onClick={() => handleSort('points')}
                  >
                    Pts <SortIcon field="points" />
                  </th>
                  <th className="py-3 px-4 text-center hidden md:table-cell">DIFF</th>
                  {format === 'ladder' && onChallenge && (
                    <th className="py-3 px-4 text-center w-24">Action</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {sortedMembers.map((member) => {
                  const isMe = member.userId === currentUserId;
                  const rank = getRankDisplay(member.currentRank);
                  const winRate = calculateWinRate(member.stats?.wins || 0, member.stats?.played || 0);
                  const gameDiff = (member.stats?.gamesWon || 0) - (member.stats?.gamesLost || 0);
                  const showChallenge = canChallenge(member);
                  
                  return (
                    <tr
                      key={member.id}
                      className={`transition-colors ${
                        isMe ? 'bg-blue-900/20' : 'hover:bg-gray-700/30'
                      }`}
                    >
                      {/* Rank */}
                      <td className="py-3 px-4 text-center">
                        <span className={`font-bold ${rank.color}`}>
                          {rank.emoji}
                          <span className="ml-0.5">#{member.currentRank}</span>
                        </span>
                        {member.previousRank && member.previousRank !== member.currentRank && (
                          <span className={`ml-1 text-xs ${
                            member.previousRank > member.currentRank ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {member.previousRank > member.currentRank ? '▲' : '▼'}
                          </span>
                        )}
                      </td>
                      
                      {/* Name */}
                      <td className="py-3 px-4">
                        <div
                          className="flex items-center gap-2 cursor-pointer hover:opacity-80"
                          onClick={() => onViewProfile?.(member)}
                        >
                          <div>
                            <span className={`font-semibold ${isMe ? 'text-blue-400' : 'text-white'}`}>
                              {member.displayName}
                            </span>
                            {member.partnerDisplayName && (
                              <span className="text-gray-400"> / {member.partnerDisplayName}</span>
                            )}
                            {isMe && (
                              <span className="ml-2 text-xs bg-blue-600/30 text-blue-400 px-1.5 py-0.5 rounded">
                                You
                              </span>
                            )}
                            {/* V07.27: Show pending partner indicator for doubles leagues */}
                            {member.status === 'pending_partner' && (
                              <span className="ml-2 text-xs bg-amber-600/30 text-amber-400 px-1.5 py-0.5 rounded">
                                {member.pendingRequesterName
                                  ? `Request from ${member.pendingRequesterName}`
                                  : member.pendingInvitedUserId
                                  ? 'Pending Partner'
                                  : member.isLookingForPartner
                                  ? 'Looking for Partner'
                                  : 'Pending Partner'}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      
                      {/* Played */}
                      <td className="py-3 px-4 text-center text-gray-300">
                        {member.stats?.played || 0}
                      </td>
                      
                      {/* Wins */}
                      <td className="py-3 px-4 text-center">
                        <span className="text-green-400 font-semibold">{member.stats?.wins || 0}</span>
                      </td>
                      
                      {/* Losses */}
                      <td className="py-3 px-4 text-center">
                        <span className="text-red-400">{member.stats?.losses || 0}</span>
                      </td>
                      
                      {/* Win Rate */}
                      <td className="py-3 px-4 text-center hidden sm:table-cell">
                        <span className={`font-medium ${
                          winRate >= 60 ? 'text-green-400' :
                          winRate >= 40 ? 'text-gray-300' :
                          'text-red-400'
                        }`}>
                          {winRate}%
                        </span>
                      </td>

                      {/* Points For (PF) - Only show when showPointsForAgainst is true */}
                      {showPointsForAgainst && (
                        <td className="py-3 px-4 text-center hidden md:table-cell">
                          <span className="text-green-400">{member.stats?.pointsFor || 0}</span>
                        </td>
                      )}

                      {/* Points Against (PA) - Only show when showPointsForAgainst is true */}
                      {showPointsForAgainst && (
                        <td className="py-3 px-4 text-center hidden md:table-cell">
                          <span className="text-red-400">{member.stats?.pointsAgainst || 0}</span>
                        </td>
                      )}

                      {/* Game Difference */}
                      <td className="py-3 px-4 text-center hidden md:table-cell">
                        <span className={
                          gameDiff > 0 ? 'text-green-400' : 
                          gameDiff < 0 ? 'text-red-400' : 
                          'text-gray-500'
                        }>
                          {gameDiff > 0 ? '+' : ''}{gameDiff}
                        </span>
                      </td>
                      
                      {/* Points */}
                      <td className="py-3 px-4 text-center">
                        <span className="text-white font-bold text-base">
                          {member.stats?.points || 0}
                        </span>
                      </td>
                      
                      {/* DIFF - Point Differential (tiebreaker) */}
                      <td className="py-3 px-4 text-center hidden md:table-cell">
                        {(() => {
                          const pointDiff = (member.stats?.pointsFor || 0) - (member.stats?.pointsAgainst || 0);
                          return (
                            <span className={`font-medium ${
                              pointDiff > 0 ? 'text-green-400' :
                              pointDiff < 0 ? 'text-red-400' :
                              'text-gray-500'
                            }`}>
                              {pointDiff > 0 ? '+' : ''}{pointDiff}
                            </span>
                          );
                        })()}
                      </td>
                      
                      {/* Challenge Button (Ladder only) */}
                      {format === 'ladder' && onChallenge && (
                        <td className="py-3 px-4 text-center">
                          {showChallenge ? (
                            <button
                              onClick={() => onChallenge(member)}
                              className="bg-orange-600 hover:bg-orange-500 text-white px-3 py-1 rounded text-xs font-semibold transition-colors"
                            >
                              ⚔️ Challenge
                            </button>
                          ) : isMe ? (
                            <span className="text-gray-600 text-xs">-</span>
                          ) : (
                            <span className="text-gray-600 text-xs">-</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* My Position Summary (if not in top 10) */}
      {myMembership && myMembership.currentRank > 10 && (
        <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold text-blue-400">#{myMembership.currentRank}</span>
              <div>
                <div className="font-semibold text-white">{myMembership.displayName}</div>
                <div className="text-sm text-gray-400">
                  {myMembership.stats?.wins || 0}W - {myMembership.stats?.losses || 0}L • {myMembership.stats?.points || 0} pts
                </div>
              </div>
            </div>
            {myMembership.currentRank > 1 && (
              <div className="text-sm text-gray-400">
                {myMembership.currentRank - 1} {entityLabel.toLowerCase()}{myMembership.currentRank > 2 ? 's' : ''} ahead
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LeagueStandings;
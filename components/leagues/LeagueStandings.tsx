/**
 * LeagueStandings Component
 * 
 * Displays league standings table with rankings, stats, and form.
 * Supports different sorting modes for different league formats.
 * 
 * FILE LOCATION: components/leagues/LeagueStandings.tsx
 * VERSION: V05.17
 */

import React, { useState, useMemo } from 'react';
import type { LeagueMember, LeagueFormat, LeagueType } from '../../types';

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
  challengeRange?: { up: number; down: number };
  compact?: boolean;
}

type SortField = 'rank' | 'points' | 'wins' | 'played' | 'winRate' | 'streak';
type SortDirection = 'asc' | 'desc';

// ============================================
// HELPERS
// ============================================

const getFormBadge = (result: 'W' | 'L' | 'D' | 'F'): { label: string; className: string } => {
  switch (result) {
    case 'W':
      return { label: 'W', className: 'bg-green-600 text-white' };
    case 'L':
      return { label: 'L', className: 'bg-red-600 text-white' };
    case 'D':
      return { label: 'D', className: 'bg-gray-600 text-white' };
    case 'F':
      return { label: 'F', className: 'bg-orange-600 text-white' };
    default:
      return { label: '-', className: 'bg-gray-700 text-gray-400' };
  }
};

const getRankBadge = (rank: number): { emoji: string; className: string } => {
  switch (rank) {
    case 1:
      return { emoji: '🥇', className: 'text-yellow-400' };
    case 2:
      return { emoji: '🥈', className: 'text-gray-300' };
    case 3:
      return { emoji: '🥉', className: 'text-orange-400' };
    default:
      return { emoji: '', className: 'text-white' };
  }
};

const calculateWinRate = (wins: number, played: number): number => {
  if (played === 0) return 0;
  return Math.round((wins / played) * 100);
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
  challengeRange = { up: 3, down: 2 },
  compact = false,
}) => {
  const [sortField, setSortField] = useState<SortField>('rank');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [searchTerm, setSearchTerm] = useState('');

  // Determine display labels based on league type
  const isTeamBased = leagueType === 'doubles' || leagueType === 'mixed_doubles' || leagueType === 'team';
  const entityLabel = isTeamBased ? 'Team' : 'Player';

  // Sort members
  const sortedMembers = useMemo(() => {
    let filtered = [...members];

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(m => 
        m.displayName.toLowerCase().includes(term) ||
        (m.partnerDisplayName && m.partnerDisplayName.toLowerCase().includes(term)) ||
        (m.teamName && m.teamName.toLowerCase().includes(term))
      );
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal: number;
      let bVal: number;

      switch (sortField) {
        case 'rank':
          aVal = a.currentRank;
          bVal = b.currentRank;
          break;
        case 'points':
          aVal = a.stats.points;
          bVal = b.stats.points;
          break;
        case 'wins':
          aVal = a.stats.wins;
          bVal = b.stats.wins;
          break;
        case 'played':
          aVal = a.stats.played;
          bVal = b.stats.played;
          break;
        case 'winRate':
          aVal = calculateWinRate(a.stats.wins, a.stats.played);
          bVal = calculateWinRate(b.stats.wins, b.stats.played);
          break;
        case 'streak':
          aVal = a.stats.currentStreak;
          bVal = b.stats.currentStreak;
          break;
        default:
          aVal = a.currentRank;
          bVal = b.currentRank;
      }

      if (sortDirection === 'asc') {
        return aVal - bVal;
      }
      return bVal - aVal;
    });

    return filtered;
  }, [members, sortField, sortDirection, searchTerm]);

  // Handle sort click
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      // Default to desc for most fields except rank
      setSortDirection(field === 'rank' ? 'asc' : 'desc');
    }
  };

  // Sort indicator
  const SortIndicator: React.FC<{ field: SortField }> = ({ field }) => {
    if (sortField !== field) return null;
    return (
      <span className="ml-1">
        {sortDirection === 'asc' ? '↑' : '↓'}
      </span>
    );
  };

  // Check if user can challenge this member
  const canChallenge = (member: LeagueMember): boolean => {
    if (!myMembership || !onChallenge) return false;
    if (member.userId === currentUserId) return false;
    if (format !== 'ladder') return false;
    
    const myRank = myMembership.currentRank;
    const theirRank = member.currentRank;
    
    // Can only challenge players ranked higher (lower number)
    if (theirRank >= myRank) return false;
    
    // Check challenge range
    const rankDiff = myRank - theirRank;
    return rankDiff <= challengeRange.up;
  };

  // Compact view
  if (compact) {
    return (
      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <div className="max-h-96 overflow-y-auto">
          {sortedMembers.slice(0, 10).map((member, index) => {
            const isMe = member.userId === currentUserId;
            const rankBadge = getRankBadge(member.currentRank);

            return (
              <div
                key={member.id}
                className={`flex items-center justify-between px-4 py-2 border-b border-gray-700 last:border-b-0 ${
                  isMe ? 'bg-blue-900/20' : 'hover:bg-gray-700/50'
                }`}
                onClick={() => onViewProfile?.(member)}
              >
                <div className="flex items-center gap-3">
                  <span className={`font-bold w-8 ${rankBadge.className}`}>
                    {rankBadge.emoji}#{member.currentRank}
                  </span>
                  <div>
                    <span className={`font-semibold ${isMe ? 'text-blue-400' : 'text-white'}`}>
                      {member.displayName}
                    </span>
                    {member.partnerDisplayName && (
                      <span className="text-gray-400 text-sm"> / {member.partnerDisplayName}</span>
                    )}
                  </div>
                </div>
                <div className="text-sm text-gray-400">
                  {member.stats.wins}W - {member.stats.losses}L
                </div>
              </div>
            );
          })}
        </div>
        {members.length > 10 && (
          <div className="px-4 py-2 text-center text-sm text-gray-400 bg-gray-900/50">
            +{members.length - 10} more
          </div>
        )}
      </div>
    );
  }

  // Full standings table
  return (
    <div className="space-y-4">
      {/* Search */}
      {members.length > 10 && (
        <div className="flex items-center gap-4">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={`Search ${entityLabel.toLowerCase()}s...`}
            className="flex-1 max-w-xs bg-gray-800 border border-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:border-blue-500"
          />
          <span className="text-sm text-gray-400">
            {sortedMembers.length} {entityLabel.toLowerCase()}s
          </span>
        </div>
      )}

      {/* Table */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-900/70">
              <tr>
                <th 
                  className="py-3 px-4 text-left cursor-pointer hover:bg-gray-800"
                  onClick={() => handleSort('rank')}
                >
                  Rank <SortIndicator field="rank" />
                </th>
                <th className="py-3 px-4 text-left">{entityLabel}</th>
                <th 
                  className="py-3 px-4 text-center cursor-pointer hover:bg-gray-800"
                  onClick={() => handleSort('played')}
                >
                  P <SortIndicator field="played" />
                </th>
                <th 
                  className="py-3 px-4 text-center cursor-pointer hover:bg-gray-800"
                  onClick={() => handleSort('wins')}
                >
                  W <SortIndicator field="wins" />
                </th>
                <th className="py-3 px-4 text-center">L</th>
                {format !== 'ladder' && (
                  <th 
                    className="py-3 px-4 text-center cursor-pointer hover:bg-gray-800 hidden sm:table-cell"
                    onClick={() => handleSort('points')}
                  >
                    Pts <SortIndicator field="points" />
                  </th>
                )}
                <th className="py-3 px-4 text-center hidden sm:table-cell">GD</th>
                <th 
                  className="py-3 px-4 text-center cursor-pointer hover:bg-gray-800 hidden md:table-cell"
                  onClick={() => handleSort('winRate')}
                >
                  Win% <SortIndicator field="winRate" />
                </th>
                <th className="py-3 px-4 text-center hidden md:table-cell">Form</th>
                {format === 'ladder' && onChallenge && myMembership && (
                  <th className="py-3 px-4 w-28"></th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {sortedMembers.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-gray-400">
                    {searchTerm 
                      ? `No ${entityLabel.toLowerCase()}s found matching "${searchTerm}"`
                      : `No ${entityLabel.toLowerCase()}s yet. Be the first to join!`
                    }
                  </td>
                </tr>
              ) : (
                sortedMembers.map(member => {
                  const isMe = member.userId === currentUserId;
                  const gameDiff = (member.stats.gamesWon || 0) - (member.stats.gamesLost || 0);
                  const winRate = calculateWinRate(member.stats.wins, member.stats.played);
                  const rankBadge = getRankBadge(member.currentRank);
                  const showChallenge = canChallenge(member);

                  return (
                    <tr
                      key={member.id}
                      className={`${isMe ? 'bg-blue-900/20' : 'hover:bg-gray-700/50'} transition-colors`}
                    >
                      {/* Rank */}
                      <td className="py-3 px-4">
                        <span className={`font-bold ${rankBadge.className}`}>
                          {rankBadge.emoji} #{member.currentRank}
                        </span>
                        {member.previousRank && member.previousRank !== member.currentRank && (
                          <span className={`ml-2 text-xs ${
                            member.currentRank < member.previousRank ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {member.currentRank < member.previousRank ? '↑' : '↓'}
                            {Math.abs(member.currentRank - member.previousRank)}
                          </span>
                        )}
                      </td>

                      {/* Name */}
                      <td className="py-3 px-4">
                        <div 
                          className={`cursor-pointer ${onViewProfile ? 'hover:underline' : ''}`}
                          onClick={() => onViewProfile?.(member)}
                        >
                          <span className={`font-semibold ${isMe ? 'text-blue-400' : 'text-white'}`}>
                            {member.displayName}
                          </span>
                          {member.partnerDisplayName && (
                            <span className="text-gray-400"> / {member.partnerDisplayName}</span>
                          )}
                          {isMe && <span className="text-blue-400 text-xs ml-2">(You)</span>}
                        </div>
                        {member.teamName && (
                          <div className="text-xs text-gray-500">{member.teamName}</div>
                        )}
                      </td>

                      {/* Played */}
                      <td className="py-3 px-4 text-center text-gray-300">
                        {member.stats.played}
                      </td>

                      {/* Wins */}
                      <td className="py-3 px-4 text-center text-green-400 font-semibold">
                        {member.stats.wins}
                      </td>

                      {/* Losses */}
                      <td className="py-3 px-4 text-center text-red-400">
                        {member.stats.losses}
                      </td>

                      {/* Points (for non-ladder) */}
                      {format !== 'ladder' && (
                        <td className="py-3 px-4 text-center font-bold text-white hidden sm:table-cell">
                          {member.stats.points}
                        </td>
                      )}

                      {/* Game Difference */}
                      <td className="py-3 px-4 text-center hidden sm:table-cell">
                        <span className={
                          gameDiff > 0 ? 'text-green-400' : 
                          gameDiff < 0 ? 'text-red-400' : 
                          'text-gray-400'
                        }>
                          {gameDiff > 0 ? '+' : ''}{gameDiff}
                        </span>
                      </td>

                      {/* Win Rate */}
                      <td className="py-3 px-4 text-center hidden md:table-cell">
                        <span className={
                          winRate >= 60 ? 'text-green-400' :
                          winRate >= 40 ? 'text-gray-300' :
                          'text-red-400'
                        }>
                          {winRate}%
                        </span>
                      </td>

                      {/* Form */}
                      <td className="py-3 px-4 hidden md:table-cell">
                        <div className="flex justify-center gap-1">
                          {member.stats.recentForm.slice(-5).map((result, i) => {
                            const badge = getFormBadge(result);
                            return (
                              <span 
                                key={i} 
                                className={`w-5 h-5 text-xs flex items-center justify-center rounded ${badge.className}`}
                              >
                                {badge.label}
                              </span>
                            );
                          })}
                          {member.stats.recentForm.length === 0 && (
                            <span className="text-gray-500 text-xs">-</span>
                          )}
                        </div>
                      </td>

                      {/* Challenge Button (Ladder only) */}
                      {format === 'ladder' && onChallenge && myMembership && (
                        <td className="py-3 px-4">
                          {showChallenge && (
                            <button
                              onClick={() => onChallenge(member)}
                              className="px-3 py-1 bg-orange-600 hover:bg-orange-500 text-white text-xs rounded font-semibold transition-colors"
                            >
                              Challenge
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
        <span>P = Played</span>
        <span>W = Wins</span>
        <span>L = Losses</span>
        {format !== 'ladder' && <span>Pts = Points</span>}
        <span>GD = Game Difference</span>
        <div className="flex items-center gap-1">
          <span>Form:</span>
          <span className="w-4 h-4 bg-green-600 text-white text-[10px] flex items-center justify-center rounded">W</span>
          <span className="w-4 h-4 bg-red-600 text-white text-[10px] flex items-center justify-center rounded">L</span>
          <span className="w-4 h-4 bg-gray-600 text-white text-[10px] flex items-center justify-center rounded">D</span>
        </div>
      </div>
    </div>
  );
};

export default LeagueStandings;
/**
 * TeamLeagueTeamsList Component
 *
 * Displays list of teams in the league with roster info.
 * Shows team status, captain, roster size, and club affiliation.
 *
 * FILE LOCATION: components/teamLeague/TeamLeagueTeamsList.tsx
 * VERSION: V07.53
 */

import React, { useState } from 'react';
import type {
  InterclubTeam,
  TeamLeagueSettings,
  TeamRosterPlayer,
} from '../../types/teamLeague';

// ============================================
// TYPES
// ============================================

interface TeamLeagueTeamsListProps {
  teams: InterclubTeam[];
  settings: TeamLeagueSettings;
  leagueId: string;
  isOrganizer: boolean;
}

// ============================================
// HELPERS
// ============================================

const getStatusBadge = (status: InterclubTeam['status']) => {
  switch (status) {
    case 'pending_approval':
      return { label: 'Pending', color: 'bg-amber-600/80 text-amber-100' };
    case 'approved':
      return { label: 'Approved', color: 'bg-blue-600/80 text-blue-100' };
    case 'approved_pending_payment':
      return { label: 'Awaiting Payment', color: 'bg-orange-600/80 text-orange-100' };
    case 'approved_paid':
      return { label: 'Active', color: 'bg-lime-600/80 text-lime-100' };
    case 'withdrawn':
      return { label: 'Withdrawn', color: 'bg-red-600/80 text-red-100' };
    case 'rejected':
      return { label: 'Rejected', color: 'bg-red-800/80 text-red-200' };
    default:
      return { label: status, color: 'bg-gray-600 text-gray-200' };
  }
};

// ============================================
// TEAM CARD COMPONENT
// ============================================

interface TeamCardProps {
  team: InterclubTeam;
  settings: TeamLeagueSettings;
  isOrganizer: boolean;
}

const TeamCard: React.FC<TeamCardProps> = ({ team, settings, isOrganizer: _isOrganizer }) => {
  const [expanded, setExpanded] = useState(false);
  const statusBadge = getStatusBadge(team.status);

  const eligiblePlayers = team.roster.filter(p => p.eligibleForLineup);
  const rosteredPlayers = team.roster.filter(p => p.playerType === 'rostered');
  const substitutes = team.roster.filter(p => p.playerType === 'substitute');

  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden">
      {/* Team header */}
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-white">{team.name}</h3>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge.color}`}>
                {statusBadge.label}
              </span>
            </div>
            {team.clubName && (
              <p className="text-sm text-gray-400 mt-0.5">{team.clubName}</p>
            )}
          </div>

          {/* Stats */}
          <div className="text-right">
            <div className="text-2xl font-bold text-white">{team.stats.points}</div>
            <div className="text-xs text-gray-500">points</div>
          </div>
        </div>

        {/* Captain info */}
        <div className="mt-3 flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2 text-gray-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span>Captain: <span className="text-white">{team.captainName}</span></span>
          </div>
          <div className="flex items-center gap-2 text-gray-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span>Roster: <span className="text-white">{rosteredPlayers.length}</span>/{settings.maxPlayersPerTeam}</span>
          </div>
          {eligiblePlayers.length < rosteredPlayers.length && (
            <div className="flex items-center gap-1 text-amber-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-xs">{rosteredPlayers.length - eligiblePlayers.length} pending waivers</span>
            </div>
          )}
        </div>

        {/* Record summary */}
        <div className="mt-3 flex gap-4 text-sm">
          <div className="flex items-center gap-1">
            <span className="text-gray-500">W</span>
            <span className="text-lime-400 font-medium">{team.stats.wins}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-500">L</span>
            <span className="text-red-400 font-medium">{team.stats.losses}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-500">D</span>
            <span className="text-gray-400 font-medium">{team.stats.draws}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-500">Boards</span>
            <span className="text-white font-medium">{team.stats.boardsWon}-{team.stats.boardsLost}</span>
          </div>
        </div>
      </div>

      {/* Expand roster button */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2 flex items-center justify-between text-gray-400 hover:text-white transition-colors border-t border-gray-700/50"
      >
        <span className="text-sm">
          {expanded ? 'Hide' : 'View'} Roster ({team.roster.length} players)
        </span>
        <svg
          className={`w-5 h-5 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded roster */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-700/50">
          {/* Rostered players */}
          <div className="mt-3">
            <h4 className="text-xs uppercase text-gray-500 font-semibold mb-2">
              Rostered Players ({rosteredPlayers.length})
            </h4>
            <div className="space-y-2">
              {rosteredPlayers.map((player) => (
                <PlayerRow key={player.playerId} player={player} />
              ))}
            </div>
          </div>

          {/* Substitutes */}
          {substitutes.length > 0 && (
            <div className="mt-4">
              <h4 className="text-xs uppercase text-gray-500 font-semibold mb-2">
                Substitutes ({substitutes.length})
              </h4>
              <div className="space-y-2">
                {substitutes.map((player) => (
                  <PlayerRow key={player.playerId} player={player} isSub />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ============================================
// PLAYER ROW COMPONENT
// ============================================

interface PlayerRowProps {
  player: TeamRosterPlayer;
  isSub?: boolean;
}

const PlayerRow: React.FC<PlayerRowProps> = ({ player, isSub }) => {
  return (
    <div className={`
      flex items-center justify-between py-2 px-3 rounded-lg
      ${player.eligibleForLineup ? 'bg-gray-700/30' : 'bg-gray-800/50 opacity-60'}
    `}>
      <div className="flex items-center gap-3">
        {/* Seed number */}
        {!isSub && player.seedNumber && (
          <span className="w-6 h-6 rounded-full bg-gray-600 text-gray-300 flex items-center justify-center text-xs font-bold">
            {player.seedNumber}
          </span>
        )}

        {/* Player info */}
        <div>
          <div className="flex items-center gap-2">
            <span className="text-white text-sm font-medium">{player.playerName}</span>
            {player.gender && (
              <span className="text-xs text-gray-500">
                ({player.gender === 'male' ? 'M' : 'F'})
              </span>
            )}
            {!player.eligibleForLineup && (
              <span className="text-xs text-amber-400">Pending waivers</span>
            )}
          </div>
          {player.duprRatingAtRegistration && (
            <span className="text-xs text-gray-500">
              DUPR: {player.duprRatingAtRegistration.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {/* Sub stats */}
      {isSub && player.subAppearanceCount !== undefined && (
        <div className="text-xs text-gray-400">
          {player.subAppearanceCount}/{player.maxSubAppearances || '∞'} appearances
        </div>
      )}
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

export const TeamLeagueTeamsList: React.FC<TeamLeagueTeamsListProps> = ({
  teams,
  settings,
  leagueId: _leagueId,
  isOrganizer,
}) => {
  const [filter, setFilter] = useState<'all' | 'active' | 'pending'>('all');

  // Filter teams
  const filteredTeams = teams.filter(team => {
    switch (filter) {
      case 'active':
        return team.status === 'approved_paid' || team.status === 'approved';
      case 'pending':
        return team.status === 'pending_approval' || team.status === 'approved_pending_payment';
      default:
        return team.status !== 'rejected';
    }
  });

  // Sort by points (descending), then by name
  const sortedTeams = [...filteredTeams].sort((a, b) => {
    if (b.stats.points !== a.stats.points) {
      return b.stats.points - a.stats.points;
    }
    return a.name.localeCompare(b.name);
  });

  // Render empty state
  if (teams.length === 0) {
    return (
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-8 text-center">
        <div className="text-5xl mb-4">👥</div>
        <h3 className="text-lg font-semibold text-white mb-2">No Teams Yet</h3>
        <p className="text-gray-400">
          Teams will appear once they register for this league.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with filter */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <span>👥</span>
          Teams ({filteredTeams.length})
        </h2>

        <div className="flex gap-2">
          {['all', 'active', 'pending'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f as typeof filter)}
              className={`
                px-3 py-1.5 rounded-lg text-sm font-medium
                transition-colors
                ${filter === f
                  ? 'bg-lime-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }
              `}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Teams grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {sortedTeams.map(team => (
          <TeamCard
            key={team.id}
            team={team}
            settings={settings}
            isOrganizer={isOrganizer}
          />
        ))}
      </div>

      {/* Empty filter state */}
      {filteredTeams.length === 0 && (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-6 text-center">
          <p className="text-gray-400">No teams match your filter criteria.</p>
        </div>
      )}
    </div>
  );
};

export default TeamLeagueTeamsList;

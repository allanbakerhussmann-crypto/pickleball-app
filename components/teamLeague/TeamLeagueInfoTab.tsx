/**
 * TeamLeagueInfoTab Component
 *
 * Displays league information including:
 * - Description
 * - Organizer contact
 * - Board configuration
 * - Scoring rules
 * - Important dates
 *
 * FILE LOCATION: components/teamLeague/TeamLeagueInfoTab.tsx
 * VERSION: V07.53
 */

import React from 'react';
import type { League } from '../../types';
import type {
  TeamLeagueSettings,
  InterclubTeam,
} from '../../types/teamLeague';

// ============================================
// TYPES
// ============================================

interface TeamLeagueInfoTabProps {
  league: League;
  settings: TeamLeagueSettings;
  organizerProfile: {
    displayName?: string;
    email?: string;
    phone?: string;
  } | null;
  teams: InterclubTeam[];
}

// ============================================
// HELPERS
// ============================================

const formatDate = (dateVal?: string | number | null): string => {
  if (!dateVal) return 'TBD';
  const date = typeof dateVal === 'number' ? new Date(dateVal) : new Date(dateVal);
  return date.toLocaleDateString('en-NZ', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

// ============================================
// COMPONENT
// ============================================

export const TeamLeagueInfoTab: React.FC<TeamLeagueInfoTabProps> = ({
  league,
  settings,
  organizerProfile,
  teams,
}) => {
  const approvedTeams = teams.filter(t =>
    t.status === 'approved_paid' || t.status === 'approved'
  );

  return (
    <div className="space-y-6">
      {/* Description */}
      {league.description && (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5">
          <h3 className="text-lg font-semibold text-white mb-3">About This League</h3>
          <p className="text-gray-300 whitespace-pre-wrap">{league.description}</p>
        </div>
      )}

      {/* Key Info Grid */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Organizer Contact */}
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5">
          <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <span>👤</span> Organizer
          </h3>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-lime-600/20 text-lime-400 rounded-full flex items-center justify-center text-lg font-bold">
                {organizerProfile?.displayName?.charAt(0) || 'O'}
              </div>
              <div>
                <div className="text-white font-medium">
                  {organizerProfile?.displayName || 'League Organizer'}
                </div>
                {organizerProfile?.email && (
                  <a
                    href={`mailto:${organizerProfile.email}`}
                    className="text-sm text-lime-400 hover:underline"
                  >
                    {organizerProfile.email}
                  </a>
                )}
              </div>
            </div>
            {organizerProfile?.phone && (
              <div className="flex items-center gap-2 text-gray-400 text-sm mt-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                {organizerProfile.phone}
              </div>
            )}
          </div>
        </div>

        {/* Location */}
        {league.location && (
          <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5">
            <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <span>📍</span> Location
            </h3>
            <div className="text-gray-300">{league.location}</div>
            {settings.venues.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="text-sm text-gray-400">Venues:</div>
                {settings.venues.map(venue => (
                  <div key={venue.id} className="bg-gray-700/30 rounded-lg p-2">
                    <div className="text-white text-sm">{venue.name}</div>
                    {venue.address && (
                      <div className="text-xs text-gray-400">{venue.address}</div>
                    )}
                    {venue.courts.length > 0 && (
                      <div className="text-xs text-gray-500 mt-1">
                        {venue.courts.length} court{venue.courts.length !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Important Dates */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5">
        <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <span>📅</span> Important Dates
        </h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <div className="text-gray-400 text-sm">Registration Opens</div>
            <div className="text-white">{formatDate(league.registrationOpens)}</div>
          </div>
          <div>
            <div className="text-gray-400 text-sm">Registration Deadline</div>
            <div className="text-white">{formatDate(league.registrationDeadline)}</div>
          </div>
          <div>
            <div className="text-gray-400 text-sm">Season Start</div>
            <div className="text-white">{formatDate(league.seasonStart)}</div>
          </div>
          <div>
            <div className="text-gray-400 text-sm">Season End</div>
            <div className="text-white">{formatDate(league.seasonEnd)}</div>
          </div>
        </div>
      </div>

      {/* Board Configuration */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5">
        <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <span>🎯</span> Board Configuration
        </h3>
        <p className="text-gray-400 text-sm mb-4">
          Each fixture consists of {settings.boards.length} board{settings.boards.length !== 1 ? 's' : ''} played between teams.
        </p>
        <div className="space-y-2">
          {settings.boards.map((board, idx) => (
            <div
              key={board.id}
              className="flex items-center justify-between bg-gray-700/30 rounded-lg p-3"
            >
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 bg-lime-600/20 text-lime-400 rounded-full flex items-center justify-center text-sm font-bold">
                  {idx + 1}
                </span>
                <div>
                  <div className="text-white font-medium">{board.name}</div>
                  <div className="text-xs text-gray-500 capitalize">
                    {board.format}
                    {board.gender && ` • ${board.gender}`}
                  </div>
                </div>
              </div>
              <div className="text-sm text-gray-400">
                {board.pointValue || 1} point{(board.pointValue || 1) !== 1 ? 's' : ''}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Scoring Rules */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5">
        <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <span>📊</span> Scoring & Points
        </h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-gray-700/30 rounded-lg p-3">
            <div className="text-gray-400 text-sm">Points per Board Win</div>
            <div className="text-2xl font-bold text-white">{settings.pointsPerBoardWin}</div>
          </div>
          <div className="bg-gray-700/30 rounded-lg p-3">
            <div className="text-gray-400 text-sm">Bonus for Fixture Win</div>
            <div className="text-2xl font-bold text-lime-400">{settings.pointsPerMatchWin}</div>
          </div>
        </div>

        <div className="mt-4">
          <div className="text-gray-400 text-sm mb-2">Tiebreaker Order</div>
          <div className="flex flex-wrap gap-2">
            {settings.tieBreakerOrder.map((tb, idx) => (
              <span key={tb} className="flex items-center gap-1.5">
                <span className="w-5 h-5 bg-gray-600 rounded-full flex items-center justify-center text-xs text-gray-300">
                  {idx + 1}
                </span>
                <span className="text-white text-sm">
                  {tb === 'matchWins' ? 'Match Wins' :
                   tb === 'boardDiff' ? 'Board Differential' :
                   tb === 'headToHead' ? 'Head-to-Head' :
                   tb === 'pointDiff' ? 'Point Differential' : tb}
                </span>
                {idx < settings.tieBreakerOrder.length - 1 && (
                  <span className="text-gray-600 mx-1">→</span>
                )}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Roster Rules */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5">
        <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <span>👥</span> Roster Rules
        </h3>
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <div className="text-gray-400 text-sm">Min Players per Team</div>
            <div className="text-white font-medium">{settings.minPlayersPerTeam}</div>
          </div>
          <div>
            <div className="text-gray-400 text-sm">Max Players per Team</div>
            <div className="text-white font-medium">{settings.maxPlayersPerTeam}</div>
          </div>
          <div>
            <div className="text-gray-400 text-sm">Lineup Lock</div>
            <div className="text-white font-medium">{settings.lineupLockMinutesBeforeMatch} min before</div>
          </div>
        </div>

        {settings.substituteRules && (
          <div className="mt-4 pt-4 border-t border-gray-700/50">
            <div className="text-gray-400 text-sm mb-2">Substitute Rules</div>
            <div className="grid md:grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-2">
                <span className={settings.substituteRules.allowExternalSubs ? 'text-lime-400' : 'text-red-400'}>
                  {settings.substituteRules.allowExternalSubs ? '✓' : '✗'}
                </span>
                <span className="text-gray-300">External substitutes allowed</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={settings.substituteRules.requireSubApproval ? 'text-amber-400' : 'text-lime-400'}>
                  {settings.substituteRules.requireSubApproval ? '!' : '✓'}
                </span>
                <span className="text-gray-300">
                  {settings.substituteRules.requireSubApproval
                    ? 'Substitutes require approval'
                    : 'No approval required'
                  }
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* DUPR Settings */}
      {settings.duprMode && settings.duprMode !== 'none' && (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5">
          <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <span>📊</span> DUPR Integration
          </h3>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-blue-600/20 text-blue-400 rounded-full text-sm font-medium capitalize">
              {settings.duprMode}
            </span>
            <span className="text-gray-400 text-sm">
              {settings.duprMode === 'required'
                ? 'All players must have linked DUPR accounts'
                : 'DUPR accounts are optional but recommended'
              }
            </span>
          </div>

          {settings.duprRestrictions?.enabled && (
            <div className="mt-3 bg-gray-700/30 rounded-lg p-3">
              <div className="text-amber-400 text-sm font-medium mb-2">Rating Restrictions</div>
              <div className="text-sm text-gray-300">
                Maximum DUPR rating: {settings.duprRestrictions.maxDoublesRating || settings.duprRestrictions.maxSinglesRating}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick Stats */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5">
        <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <span>📈</span> Quick Stats
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-3xl font-bold text-white">{approvedTeams.length}</div>
            <div className="text-xs text-gray-400">Teams</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-white">
              {approvedTeams.reduce((sum, t) => sum + t.roster.length, 0)}
            </div>
            <div className="text-xs text-gray-400">Players</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-white">{settings.boards.length}</div>
            <div className="text-xs text-gray-400">Boards per Fixture</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-lime-400">
              {Math.max(0, settings.pointsPerBoardWin * settings.boards.length + settings.pointsPerMatchWin)}
            </div>
            <div className="text-xs text-gray-400">Max Points per Fixture</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeamLeagueInfoTab;

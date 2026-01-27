/**
 * TeamLeaguesList Component
 *
 * Displays a grid of team league cards with filtering options.
 * Similar to LeaguesList but specific to team leagues.
 *
 * FILE LOCATION: components/teamLeague/TeamLeaguesList.tsx
 * VERSION: V07.54
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { subscribeToTeamLeagues } from '../../services/firebase';
import type { TeamLeague } from '../../types/teamLeague';

// ============================================
// TYPES
// ============================================

interface TeamLeaguesListProps {
  onSelectLeague: (leagueId: string) => void;
  onCreateLeague?: () => void;
}

type FilterType = 'all' | 'active' | 'registration';

// ============================================
// HELPERS
// ============================================

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'active':
      return { label: 'Active', color: 'bg-lime-600/80 text-lime-100' };
    case 'published':
      return { label: 'Published', color: 'bg-cyan-600/80 text-cyan-100' };
    case 'registration':
      return { label: 'Registration Open', color: 'bg-blue-600/80 text-blue-100' };
    case 'registration_closed':
      return { label: 'Registration Closed', color: 'bg-amber-600/80 text-amber-100' };
    case 'completed':
      return { label: 'Completed', color: 'bg-gray-600 text-gray-200' };
    case 'draft':
      return { label: 'Draft', color: 'bg-gray-600/80 text-gray-200' };
    default:
      return { label: status, color: 'bg-gray-600 text-gray-200' };
  }
};

const formatDate = (dateStr?: string): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-NZ', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

// ============================================
// LEAGUE CARD COMPONENT
// ============================================

interface LeagueCardProps {
  league: TeamLeague;
  onClick: () => void;
}

const LeagueCard: React.FC<LeagueCardProps> = ({ league, onClick }) => {
  const statusBadge = getStatusBadge(league.status);

  return (
    <button
      onClick={onClick}
      className="bg-gray-800 rounded-xl p-4 border border-gray-700 hover:border-amber-500 transition-colors text-left w-full"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-bold text-white text-lg truncate flex-1 mr-2">
          {league.name}
        </h3>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${statusBadge.color}`}>
          {statusBadge.label}
        </span>
      </div>

      {/* Info rows */}
      <div className="space-y-2 text-sm text-gray-400">
        {/* Teams & Weeks */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>
              Max {league.maxTeams || '?'} teams
            </span>
          </div>
          {league.numberOfWeeks && (
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>{league.numberOfWeeks} weeks</span>
            </div>
          )}
        </div>

        {/* Boards */}
        {league.boards && league.boards.length > 0 && (
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span>{league.boards.length} boards per fixture</span>
          </div>
        )}

        {/* Season dates */}
        {league.seasonStart && (
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              {formatDate(league.seasonStart)}
              {league.seasonEnd && ` - ${formatDate(league.seasonEnd)}`}
            </span>
          </div>
        )}

        {/* Location */}
        {league.venue && (
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="truncate">{league.venue}</span>
          </div>
        )}
      </div>

      {/* Schedule type badge */}
      {league.scheduleType && (
        <div className="mt-3 pt-3 border-t border-gray-700">
          <span className="text-xs text-gray-500 capitalize">
            {league.scheduleType.replace('_', ' ')}
          </span>
        </div>
      )}
    </button>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

export const TeamLeaguesList: React.FC<TeamLeaguesListProps> = ({
  onSelectLeague,
  onCreateLeague,
}) => {
  const { isOrganizer } = useAuth();
  const [leagues, setLeagues] = useState<TeamLeague[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');

  useEffect(() => {
    const unsubscribe = subscribeToTeamLeagues((data) => {
      // Cast to TeamLeague to include teamLeague settings
      setLeagues(data as TeamLeague[]);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Filter leagues
  const filteredLeagues = leagues.filter(league => {
    switch (filter) {
      case 'active':
        return league.status === 'active';
      case 'registration':
        return league.status === 'registration';
      default:
        return league.status !== 'cancelled';
    }
  });

  // Loading state
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Team Leagues</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="bg-gray-800 rounded-xl p-4 border border-gray-700 animate-pulse">
              <div className="h-6 bg-gray-700 rounded w-3/4 mb-3"></div>
              <div className="h-4 bg-gray-700 rounded w-1/2 mb-2"></div>
              <div className="h-4 bg-gray-700 rounded w-2/3 mb-2"></div>
              <div className="h-4 bg-gray-700 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Team Leagues</h1>
          <p className="text-gray-400 text-sm">Club vs Club competitions</p>
        </div>

        {isOrganizer && onCreateLeague && (
          <button
            onClick={onCreateLeague}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium flex items-center gap-2 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Team League
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['all', 'active', 'registration'] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`
              px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
              ${filter === f
                ? 'bg-amber-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }
            `}
          >
            {f === 'all' ? 'All' : f === 'active' ? 'Active' : 'Registration Open'}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {filteredLeagues.length === 0 ? (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-8 text-center">
          <div className="text-5xl mb-4">🏆</div>
          <h3 className="text-lg font-semibold text-white mb-2">
            {filter === 'all' ? 'No Team Leagues Yet' : `No ${filter === 'active' ? 'Active' : 'Open'} Team Leagues`}
          </h3>
          <p className="text-gray-400 mb-4">
            {filter === 'all'
              ? 'Be the first to create a team league competition!'
              : 'Check back later or browse all leagues.'}
          </p>
          {isOrganizer && onCreateLeague && filter === 'all' && (
            <button
              onClick={onCreateLeague}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium"
            >
              Create Team League
            </button>
          )}

          {/* How Team Leagues Work - Info Section */}
          <div className="mt-8 pt-8 border-t border-gray-700 text-left max-w-2xl mx-auto">
            <h4 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              How Team Leagues Work
            </h4>
            <div className="space-y-4 text-sm text-gray-400">
              <div className="flex gap-3">
                <div className="w-8 h-8 bg-amber-600/20 text-amber-400 rounded-lg flex items-center justify-center font-bold shrink-0">1</div>
                <div>
                  <p className="text-white font-medium">Organizer Creates the League</p>
                  <p>Set up boards (e.g., Men's Doubles, Women's Doubles, Mixed), configure roster rules, and define the season schedule.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-8 h-8 bg-amber-600/20 text-amber-400 rounded-lg flex items-center justify-center font-bold shrink-0">2</div>
                <div>
                  <p className="text-white font-medium">Teams Register</p>
                  <p>Captains register their teams and build rosters. The organizer reviews and approves team registrations.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-8 h-8 bg-amber-600/20 text-amber-400 rounded-lg flex items-center justify-center font-bold shrink-0">3</div>
                <div>
                  <p className="text-white font-medium">Schedule is Generated</p>
                  <p>Once teams are approved, the organizer generates a round-robin schedule. Each week, teams play fixtures against each other.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-8 h-8 bg-amber-600/20 text-amber-400 rounded-lg flex items-center justify-center font-bold shrink-0">4</div>
                <div>
                  <p className="text-white font-medium">Play & Track Scores</p>
                  <p>Captains submit lineups and enter scores for each board. Standings update automatically based on results.</p>
                </div>
              </div>
            </div>

            {isOrganizer && (
              <div className="mt-6 p-4 bg-lime-900/20 border border-lime-700/50 rounded-lg">
                <p className="text-lime-400 font-medium flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  You're an Organizer
                </p>
                <p className="text-lime-300/70 text-sm mt-1">
                  Click "Create Team League" to set up a new club vs club competition. You'll configure boards, roster rules, and scheduling through a guided wizard.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Leagues grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredLeagues.map(league => (
            <LeagueCard
              key={league.id}
              league={league}
              onClick={() => onSelectLeague(league.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default TeamLeaguesList;

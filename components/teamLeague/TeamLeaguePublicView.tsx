/**
 * TeamLeaguePublicView Component
 *
 * Public-facing view for team league results and standings.
 * Accessible without authentication for sharing results.
 *
 * FILE LOCATION: components/teamLeague/TeamLeaguePublicView.tsx
 * VERSION: V07.55
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getLeague,
  getUserProfile,
  getInterclubTeams,
  getFixtures,
  calculateTeamLeagueStandings,
} from '../../services/firebase';
import type { League } from '../../types';
import type {
  InterclubTeam,
  TeamLeagueFixture,
  TeamLeagueStanding,
  TeamLeagueSettings,
} from '../../types/teamLeague';

// ============================================
// TYPES
// ============================================

type TabType = 'standings' | 'fixtures' | 'teams';

// ============================================
// HELPERS
// ============================================

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-NZ', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
};

// ============================================
// COMPONENT
// ============================================

export const TeamLeaguePublicView: React.FC = () => {
  const { leagueId } = useParams<{ leagueId: string }>();
  const navigate = useNavigate();

  // Data state
  const [league, setLeague] = useState<League | null>(null);
  const [teams, setTeams] = useState<InterclubTeam[]>([]);
  const [fixtures, setFixtures] = useState<TeamLeagueFixture[]>([]);
  const [standings, setStandings] = useState<TeamLeagueStanding[]>([]);
  const [organizerProfile, setOrganizerProfile] = useState<{
    displayName?: string;
  } | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('standings');
  const [error, setError] = useState<string | null>(null);

  // Derived state
  const settings = useMemo<TeamLeagueSettings | null>(() => {
    if (!league?.settings) return null;
    // Settings are stored under settings.teamLeague
    const teamLeagueSettings = (league.settings as { teamLeague?: TeamLeagueSettings }).teamLeague;
    return teamLeagueSettings || null;
  }, [league]);

  const approvedTeams = useMemo(() => {
    return teams.filter(t => t.status === 'approved_paid' || t.status === 'approved');
  }, [teams]);

  const completedFixtures = useMemo(() => {
    return fixtures
      .filter(f => f.status === 'completed')
      .sort((a, b) => b.weekNumber - a.weekNumber);
  }, [fixtures]);

  // ============================================
  // DATA LOADING
  // ============================================

  useEffect(() => {
    const loadData = async () => {
      if (!leagueId) {
        setError('League ID not provided');
        setLoading(false);
        return;
      }

      try {
        // Load league
        const leagueData = await getLeague(leagueId);
        if (!leagueData) {
          setError('League not found');
          setLoading(false);
          return;
        }

        // Check if it's a team league
        if (leagueData.competitionFormat !== 'team_league_interclub') {
          setError('This is not a team league');
          setLoading(false);
          return;
        }

        // Check visibility
        if (leagueData.visibility === 'private') {
          setError('This league is private');
          setLoading(false);
          return;
        }

        setLeague(leagueData);

        // Load organizer profile
        if (leagueData.createdByUserId) {
          const profile = await getUserProfile(leagueData.createdByUserId);
          setOrganizerProfile(profile);
        }

        // Load teams
        const teamsData = await getInterclubTeams(leagueId);
        setTeams(teamsData);

        // Load fixtures
        const fixturesData = await getFixtures(leagueId);
        setFixtures(fixturesData);

        // Calculate standings
        try {
          const standingsData = await calculateTeamLeagueStandings(leagueId);
          setStandings(standingsData);
        } catch (err) {
          console.error('Error calculating standings:', err);
        }

        setLoading(false);
      } catch (err) {
        console.error('Error loading league:', err);
        setError('Failed to load league data');
        setLoading(false);
      }
    };

    loadData();
  }, [leagueId]);

  // ============================================
  // RENDER HELPERS
  // ============================================

  const renderStandings = () => {
    if (standings.length === 0) {
      return (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-8 text-center">
          <p className="text-gray-400">No standings available yet.</p>
        </div>
      );
    }

    return (
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-700/50 text-left">
                <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">#</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Team</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider text-center">P</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider text-center">W</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider text-center">D</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider text-center">L</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider text-center">Boards</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider text-center">Pts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {standings.map((standing, idx) => (
                <tr key={standing.teamId} className="hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3">
                    <span className={`
                      w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold
                      ${idx === 0 ? 'bg-yellow-500/20 text-yellow-400' :
                        idx === 1 ? 'bg-gray-400/20 text-gray-300' :
                        idx === 2 ? 'bg-amber-600/20 text-amber-500' :
                        'bg-gray-700/50 text-gray-400'}
                    `}>
                      {idx + 1}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-white font-medium">{standing.teamName}</div>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-300">{standing.stats.played}</td>
                  <td className="px-4 py-3 text-center text-lime-400">{standing.stats.wins}</td>
                  <td className="px-4 py-3 text-center text-gray-400">{standing.stats.draws}</td>
                  <td className="px-4 py-3 text-center text-red-400">{standing.stats.losses}</td>
                  <td className="px-4 py-3 text-center text-gray-300">
                    {standing.stats.boardsWon}-{standing.stats.boardsLost}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-xl font-bold text-white">{standing.stats.points}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderFixtures = () => {
    if (completedFixtures.length === 0) {
      return (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-8 text-center">
          <p className="text-gray-400">No completed fixtures yet.</p>
        </div>
      );
    }

    // Group by week
    const byWeek: Record<number, TeamLeagueFixture[]> = {};
    completedFixtures.forEach(f => {
      if (!byWeek[f.weekNumber]) byWeek[f.weekNumber] = [];
      byWeek[f.weekNumber].push(f);
    });

    return (
      <div className="space-y-6">
        {Object.entries(byWeek)
          .sort(([a], [b]) => Number(b) - Number(a))
          .map(([weekNum, weekFixtures]) => (
            <div key={weekNum}>
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <span className="w-8 h-8 bg-lime-600/20 text-lime-400 rounded-full flex items-center justify-center text-sm font-bold">
                  {weekNum}
                </span>
                Week {weekNum}
              </h3>
              <div className="space-y-3">
                {weekFixtures.map(fixture => (
                  <div
                    key={fixture.id}
                    className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-400">
                        {formatDate(fixture.scheduledDate)}
                      </span>
                      <span className="px-2 py-0.5 bg-lime-600/20 text-lime-400 text-xs rounded-full">
                        Completed
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <span className={`text-lg font-semibold ${
                          fixture.result?.winnerId === 'home' ? 'text-lime-400' : 'text-white'
                        }`}>
                          {fixture.homeTeamName}
                        </span>
                      </div>

                      <div className="px-4 flex items-center gap-2">
                        <span className={`text-2xl font-bold ${
                          (fixture.result?.homeBoardsWon || 0) > (fixture.result?.awayBoardsWon || 0)
                            ? 'text-lime-400' : 'text-white'
                        }`}>
                          {fixture.result?.homeBoardsWon || 0}
                        </span>
                        <span className="text-gray-500">-</span>
                        <span className={`text-2xl font-bold ${
                          (fixture.result?.awayBoardsWon || 0) > (fixture.result?.homeBoardsWon || 0)
                            ? 'text-lime-400' : 'text-white'
                        }`}>
                          {fixture.result?.awayBoardsWon || 0}
                        </span>
                      </div>

                      <div className="flex-1 text-right">
                        <span className={`text-lg font-semibold ${
                          fixture.result?.winnerId === 'away' ? 'text-lime-400' : 'text-white'
                        }`}>
                          {fixture.awayTeamName}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
      </div>
    );
  };

  const renderTeams = () => {
    if (approvedTeams.length === 0) {
      return (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-8 text-center">
          <p className="text-gray-400">No teams registered yet.</p>
        </div>
      );
    }

    return (
      <div className="grid gap-4 md:grid-cols-2">
        {approvedTeams.map(team => (
          <div
            key={team.id}
            className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">{team.name}</h3>
                {team.clubName && (
                  <p className="text-sm text-gray-400">{team.clubName}</p>
                )}
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-white">{team.stats.points}</div>
                <div className="text-xs text-gray-500">points</div>
              </div>
            </div>

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
                <span className="text-gray-500">Players</span>
                <span className="text-white font-medium">{team.roster.length}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ============================================
  // LOADING AND ERROR STATES
  // ============================================

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-lime-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4 p-4">
        <div className="text-red-400 text-lg text-center">{error}</div>
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white"
        >
          Go Home
        </button>
      </div>
    );
  }

  if (!league || !settings) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4 p-4">
        <div className="text-gray-400 text-lg">League not found</div>
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white"
        >
          Go Home
        </button>
      </div>
    );
  }

  // ============================================
  // MAIN RENDER
  // ============================================

  return (
    <div className="min-h-screen bg-gray-950 pb-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 border-b border-gray-700">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">🏢</span>
            <h1 className="text-2xl font-bold text-white">{league.name}</h1>
          </div>
          {league.location && (
            <p className="text-gray-400 text-sm">{league.location}</p>
          )}
          {organizerProfile?.displayName && (
            <p className="text-gray-500 text-sm mt-1">
              Organized by {organizerProfile.displayName}
            </p>
          )}

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50 text-center">
              <div className="text-xl font-bold text-white">{approvedTeams.length}</div>
              <div className="text-xs text-gray-400">Teams</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50 text-center">
              <div className="text-xl font-bold text-white">{fixtures.length}</div>
              <div className="text-xs text-gray-400">Fixtures</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50 text-center">
              <div className="text-xl font-bold text-lime-400">{completedFixtures.length}</div>
              <div className="text-xs text-gray-400">Completed</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-4xl mx-auto px-4 mt-6">
        <div className="flex gap-2 border-b border-gray-700/50 pb-2 mb-4">
          {(['standings', 'fixtures', 'teams'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`
                px-4 py-2 rounded-lg text-sm font-medium transition-colors
                ${activeTab === tab
                  ? 'bg-lime-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                }
              `}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'standings' && renderStandings()}
        {activeTab === 'fixtures' && renderFixtures()}
        {activeTab === 'teams' && renderTeams()}

        {/* Footer */}
        <div className="mt-8 text-center text-gray-500 text-sm">
          <p>Powered by Pickleball Director</p>
        </div>
      </div>
    </div>
  );
};

export default TeamLeaguePublicView;

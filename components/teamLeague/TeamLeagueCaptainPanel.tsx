/**
 * TeamLeagueCaptainPanel Component
 *
 * Captain-only panel for managing their team.
 * Sub-tabs: Management, Player, Scoring, Roster
 *
 * FILE LOCATION: components/teamLeague/TeamLeagueCaptainPanel.tsx
 * VERSION: V07.57
 */

import React, { useState } from 'react';
import { formatTime } from '../../utils/timeFormat';
import type { League } from '../../types';
import type {
  InterclubTeam,
  TeamLeagueFixture,
  TeamLeagueSettings,
} from '../../types/teamLeague';

// ============================================
// TYPES
// ============================================

interface TeamLeagueCaptainPanelProps {
  team: InterclubTeam;
  fixtures: TeamLeagueFixture[];
  settings: TeamLeagueSettings;
  leagueId: string;
  league: League;
}

type CaptainSubTab = 'management' | 'player' | 'scoring' | 'roster';

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

export const TeamLeagueCaptainPanel: React.FC<TeamLeagueCaptainPanelProps> = ({
  team,
  fixtures,
  settings,
  leagueId: _leagueId,
  league: _league,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<CaptainSubTab>('management');

  // Get eligible players
  const eligiblePlayers = team.roster.filter(p => p.eligibleForLineup);
  const pendingWaivers = team.roster.filter(p => !p.eligibleForLineup);

  // Separate upcoming and completed fixtures
  const upcomingFixtures = fixtures
    .filter(f => f.status === 'scheduled' || f.status === 'lineups_submitted' || f.status === 'in_progress')
    .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());

  const completedFixtures = fixtures
    .filter(f => f.status === 'completed')
    .sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime());

  // ============================================
  // SUB-TAB: MANAGEMENT
  // ============================================

  const renderManagementTab = () => (
    <div className="space-y-6">
      {/* Team Info Card */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <span>🏢</span> Team Information
        </h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Team Name</label>
              <p className="text-white font-medium">{team.name}</p>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Status</label>
              <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                team.status === 'approved_paid' ? 'bg-lime-600/20 text-lime-400' :
                team.status === 'approved' ? 'bg-blue-600/20 text-blue-400' :
                team.status === 'pending_approval' ? 'bg-amber-600/20 text-amber-400' :
                'bg-gray-600/20 text-gray-400'
              }`}>
                {team.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </span>
            </div>
          </div>
          {team.clubName && (
            <div>
              <label className="block text-sm text-gray-400 mb-1">Club Affiliation</label>
              <p className="text-white">{team.clubName}</p>
            </div>
          )}
        </div>
      </div>

      {/* Team Stats */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <span>📊</span> Team Statistics
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-gray-700/30 rounded-lg">
            <div className="text-3xl font-bold text-white">{team.stats.points}</div>
            <div className="text-xs text-gray-400 uppercase">Points</div>
          </div>
          <div className="text-center p-3 bg-gray-700/30 rounded-lg">
            <div className="text-3xl font-bold text-lime-400">{team.stats.wins}</div>
            <div className="text-xs text-gray-400 uppercase">Wins</div>
          </div>
          <div className="text-center p-3 bg-gray-700/30 rounded-lg">
            <div className="text-3xl font-bold text-red-400">{team.stats.losses}</div>
            <div className="text-xs text-gray-400 uppercase">Losses</div>
          </div>
          <div className="text-center p-3 bg-gray-700/30 rounded-lg">
            <div className="text-3xl font-bold text-white">{team.stats.boardDiff > 0 ? '+' : ''}{team.stats.boardDiff}</div>
            <div className="text-xs text-gray-400 uppercase">Board Diff</div>
          </div>
        </div>
      </div>

      {/* Next Fixture */}
      {upcomingFixtures.length > 0 && (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <span>📅</span> Next Fixture
          </h3>
          <div className="bg-gray-700/30 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400">Week {upcomingFixtures[0].weekNumber}</span>
              <span className="text-sm text-gray-400">
                {formatDate(upcomingFixtures[0].scheduledDate)}
                {upcomingFixtures[0].scheduledTime && ` @ ${formatTime(upcomingFixtures[0].scheduledTime)}`}
              </span>
            </div>
            <div className="flex items-center justify-between text-lg">
              <span className={`font-semibold ${upcomingFixtures[0].homeTeamId === team.id ? 'text-lime-400' : 'text-white'}`}>
                {upcomingFixtures[0].homeTeamName}
              </span>
              <span className="text-gray-500 mx-4">vs</span>
              <span className={`font-semibold ${upcomingFixtures[0].awayTeamId === team.id ? 'text-lime-400' : 'text-white'}`}>
                {upcomingFixtures[0].awayTeamName}
              </span>
            </div>
            {upcomingFixtures[0].venueName && (
              <div className="text-sm text-gray-500 mt-2">
                📍 {upcomingFixtures[0].venueName}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // ============================================
  // SUB-TAB: PLAYER (Add/Invite Players)
  // ============================================

  const renderPlayerTab = () => (
    <div className="space-y-6">
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <span>👥</span> Add Players
          </h3>
        </div>

        <p className="text-gray-400 text-sm mb-4">
          Add players to your team roster. They will need to accept the waiver before being eligible for lineups.
        </p>

        {/* Add player form placeholder */}
        <div className="space-y-4">
          <button className="w-full px-4 py-3 bg-lime-600 hover:bg-lime-500 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Search & Add Player
          </button>
          <button className="w-full px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Invite by Email
          </button>
        </div>
      </div>

      {/* Roster Summary */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <span>📋</span> Roster Summary
        </h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="p-3 bg-gray-700/30 rounded-lg">
            <div className="text-2xl font-bold text-white">{team.roster.length}</div>
            <div className="text-xs text-gray-400">Total</div>
          </div>
          <div className="p-3 bg-gray-700/30 rounded-lg">
            <div className="text-2xl font-bold text-lime-400">{eligiblePlayers.length}</div>
            <div className="text-xs text-gray-400">Eligible</div>
          </div>
          <div className="p-3 bg-gray-700/30 rounded-lg">
            <div className="text-2xl font-bold text-amber-400">{pendingWaivers.length}</div>
            <div className="text-xs text-gray-400">Pending</div>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Required: {settings.minPlayersPerTeam} - {settings.maxPlayersPerTeam} players
        </p>
      </div>
    </div>
  );

  // ============================================
  // SUB-TAB: SCORING
  // ============================================

  const renderScoringTab = () => (
    <div className="space-y-6">
      {/* Upcoming fixtures that need scores */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <span>🏆</span> Submit Scores
        </h3>

        {upcomingFixtures.length > 0 ? (
          <div className="space-y-3">
            {upcomingFixtures.map(fixture => (
              <div key={fixture.id} className="bg-gray-700/30 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-400">Week {fixture.weekNumber}</span>
                  <span className="text-sm text-gray-400">{formatDate(fixture.scheduledDate)}</span>
                </div>
                <div className="flex items-center justify-between mb-3">
                  <span className={fixture.homeTeamId === team.id ? 'text-lime-400 font-medium' : 'text-white'}>
                    {fixture.homeTeamName}
                  </span>
                  <span className="text-gray-500">vs</span>
                  <span className={fixture.awayTeamId === team.id ? 'text-lime-400 font-medium' : 'text-white'}>
                    {fixture.awayTeamName}
                  </span>
                </div>
                <button className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded-lg transition-colors">
                  Enter Scores
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400 text-center py-4">No upcoming fixtures to score.</p>
        )}
      </div>

      {/* Completed fixtures */}
      {completedFixtures.length > 0 && (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <span>✓</span> Completed ({completedFixtures.length})
          </h3>
          <div className="space-y-3">
            {completedFixtures.slice(0, 5).map(fixture => {
              const isHome = fixture.homeTeamId === team.id;
              const won = fixture.result?.winnerId === (isHome ? 'home' : 'away');
              const lost = fixture.result?.winnerId === (isHome ? 'away' : 'home');

              return (
                <div key={fixture.id} className={`bg-gray-700/30 rounded-lg p-4 border-l-4 ${
                  won ? 'border-lime-500' : lost ? 'border-red-500' : 'border-gray-500'
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm text-gray-400">Week {fixture.weekNumber}</span>
                      <div className="text-white mt-1">
                        {fixture.homeTeamName} vs {fixture.awayTeamName}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-white">
                        {fixture.result?.homeBoardsWon || 0} - {fixture.result?.awayBoardsWon || 0}
                      </div>
                      <span className={`text-sm font-medium ${
                        won ? 'text-lime-400' : lost ? 'text-red-400' : 'text-gray-400'
                      }`}>
                        {won ? 'Won' : lost ? 'Lost' : 'Draw'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  // ============================================
  // SUB-TAB: ROSTER
  // ============================================

  const renderRosterTab = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Team Roster</h3>
        <span className="text-sm text-gray-400">
          {team.roster.length}/{settings.maxPlayersPerTeam} players
        </span>
      </div>

      {/* Players list */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 divide-y divide-gray-700/50">
        {team.roster.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-400">No players on roster yet.</p>
            <button
              onClick={() => setActiveSubTab('player')}
              className="mt-4 px-4 py-2 bg-lime-600 hover:bg-lime-500 text-white text-sm rounded-lg transition-colors"
            >
              Add Players
            </button>
          </div>
        ) : (
          team.roster.map((player) => (
            <div key={player.playerId} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Seed badge */}
                {player.seedNumber && (
                  <span className="w-8 h-8 rounded-full bg-lime-600/20 text-lime-400 flex items-center justify-center text-sm font-bold">
                    {player.seedNumber}
                  </span>
                )}

                {/* Player info */}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">{player.playerName}</span>
                    {player.isCaptain && (
                      <span className="px-2 py-0.5 bg-amber-600/20 text-amber-400 text-xs rounded-full">
                        Captain
                      </span>
                    )}
                    {player.playerType === 'substitute' && (
                      <span className="px-2 py-0.5 bg-blue-600/20 text-blue-400 text-xs rounded-full">
                        Sub
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                    {player.gender && <span>{player.gender === 'male' ? 'Male' : 'Female'}</span>}
                    {player.duprRatingAtRegistration && (
                      <span>DUPR: {player.duprRatingAtRegistration.toFixed(2)}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Status and actions */}
              <div className="flex items-center gap-3">
                {player.eligibleForLineup ? (
                  <span className="px-2 py-1 bg-lime-600/20 text-lime-400 text-xs rounded-full">
                    Eligible
                  </span>
                ) : (
                  <span className="px-2 py-1 bg-amber-600/20 text-amber-400 text-xs rounded-full">
                    Pending Waivers
                  </span>
                )}

                {player.playerId !== team.captainId && (
                  <button className="p-2 text-gray-400 hover:text-white transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  // ============================================
  // MAIN RENDER
  // ============================================

  const subTabs: { id: CaptainSubTab; label: string; icon: string }[] = [
    { id: 'management', label: 'Management', icon: '⚙️' },
    { id: 'player', label: 'Player', icon: '👤' },
    { id: 'scoring', label: 'Scoring', icon: '🏆' },
    { id: 'roster', label: 'Roster', icon: '📋' },
  ];

  return (
    <div className="space-y-4">
      {/* Team header */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              👑 Captain Dashboard
            </h2>
            <p className="text-gray-400 mt-1">{team.name}</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-white">{team.stats.points}</div>
            <div className="text-xs text-gray-500 uppercase">Points</div>
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 border-b border-gray-700/50 pb-2 overflow-x-auto">
        {subTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors
              ${activeSubTab === tab.id
                ? 'bg-amber-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }
            `}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      {activeSubTab === 'management' && renderManagementTab()}
      {activeSubTab === 'player' && renderPlayerTab()}
      {activeSubTab === 'scoring' && renderScoringTab()}
      {activeSubTab === 'roster' && renderRosterTab()}
    </div>
  );
};

export default TeamLeagueCaptainPanel;

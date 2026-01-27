/**
 * TeamLeagueFixtureList Component
 *
 * Displays list of fixtures organized by week with filtering options.
 * Allows navigation between weeks and shows fixture cards.
 *
 * FILE LOCATION: components/teamLeague/TeamLeagueFixtureList.tsx
 * VERSION: V07.53
 */

import React, { useState, useMemo } from 'react';
import type {
  TeamLeagueFixture,
  InterclubTeam,
  TeamLeagueSettings,
} from '../../types/teamLeague';
import { TeamLeagueFixtureCard } from './TeamLeagueFixtureCard';

// ============================================
// TYPES
// ============================================

interface TeamLeagueFixtureListProps {
  fixtures: TeamLeagueFixture[];
  teams: InterclubTeam[];
  settings: TeamLeagueSettings;
  leagueId: string;
  isOrganizer: boolean;
  myTeam?: InterclubTeam | null;
}

type FilterType = 'all' | 'upcoming' | 'completed' | 'my_fixtures';

// ============================================
// COMPONENT
// ============================================

export const TeamLeagueFixtureList: React.FC<TeamLeagueFixtureListProps> = ({
  fixtures,
  teams,
  settings,
  leagueId: _leagueId,
  isOrganizer,
  myTeam,
}) => {
  const [selectedWeek, setSelectedWeek] = useState<number | 'all'>('all');
  const [filter, setFilter] = useState<FilterType>('all');

  // Get unique weeks from fixtures
  const weeks = useMemo(() => {
    const weekSet = new Set(fixtures.map(f => f.weekNumber));
    return Array.from(weekSet).sort((a, b) => a - b);
  }, [fixtures]);

  // Filter fixtures
  const filteredFixtures = useMemo(() => {
    let result = [...fixtures];

    // Filter by week
    if (selectedWeek !== 'all') {
      result = result.filter(f => f.weekNumber === selectedWeek);
    }

    // Apply additional filters
    switch (filter) {
      case 'upcoming':
        result = result.filter(f => f.status === 'scheduled' || f.status === 'lineups_submitted');
        break;
      case 'completed':
        result = result.filter(f => f.status === 'completed');
        break;
      case 'my_fixtures':
        if (myTeam) {
          result = result.filter(f =>
            f.homeTeamId === myTeam.id || f.awayTeamId === myTeam.id
          );
        }
        break;
    }

    // Sort by week number, then scheduled date
    result.sort((a, b) => {
      if (a.weekNumber !== b.weekNumber) {
        return a.weekNumber - b.weekNumber;
      }
      return new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime();
    });

    return result;
  }, [fixtures, selectedWeek, filter, myTeam]);

  // Group fixtures by week for display
  const fixturesByWeek = useMemo(() => {
    const grouped: Record<number, TeamLeagueFixture[]> = {};
    for (const fixture of filteredFixtures) {
      if (!grouped[fixture.weekNumber]) {
        grouped[fixture.weekNumber] = [];
      }
      grouped[fixture.weekNumber].push(fixture);
    }
    return grouped;
  }, [filteredFixtures]);

  // Render empty state
  if (fixtures.length === 0) {
    return (
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-8 text-center">
        <div className="text-5xl mb-4">📅</div>
        <h3 className="text-lg font-semibold text-white mb-2">No Fixtures Yet</h3>
        <p className="text-gray-400">
          Fixtures will appear once the schedule has been generated.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        {/* Week selector */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          <button
            onClick={() => setSelectedWeek('all')}
            className={`
              px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap
              transition-colors
              ${selectedWeek === 'all'
                ? 'bg-lime-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }
            `}
          >
            All Weeks
          </button>
          {weeks.map(week => (
            <button
              key={week}
              onClick={() => setSelectedWeek(week)}
              className={`
                px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap
                transition-colors
                ${selectedWeek === week
                  ? 'bg-lime-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }
              `}
            >
              Week {week}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <div className="flex gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterType)}
            className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:ring-2 focus:ring-lime-500 focus:border-transparent"
          >
            <option value="all">All Fixtures</option>
            <option value="upcoming">Upcoming</option>
            <option value="completed">Completed</option>
            {myTeam && <option value="my_fixtures">My Fixtures</option>}
          </select>
        </div>
      </div>

      {/* Fixtures list */}
      {filteredFixtures.length === 0 ? (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-6 text-center">
          <p className="text-gray-400">No fixtures match your filter criteria.</p>
        </div>
      ) : selectedWeek === 'all' ? (
        // Grouped by week
        <div className="space-y-6">
          {Object.entries(fixturesByWeek).map(([weekNum, weekFixtures]) => (
            <div key={weekNum}>
              <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                <span className="w-8 h-8 bg-lime-600/20 text-lime-400 rounded-full flex items-center justify-center text-sm font-bold">
                  {weekNum}
                </span>
                Week {weekNum}
                <span className="text-sm text-gray-500 font-normal">
                  ({weekFixtures.length} fixture{weekFixtures.length !== 1 ? 's' : ''})
                </span>
              </h3>
              <div className="space-y-3">
                {weekFixtures.map(fixture => (
                  <TeamLeagueFixtureCard
                    key={fixture.id}
                    fixture={fixture}
                    teams={teams}
                    settings={settings}
                    isOrganizer={isOrganizer}
                    isMyTeam={myTeam ? (fixture.homeTeamId === myTeam.id || fixture.awayTeamId === myTeam.id) : false}
                    onViewDetails={(f) => console.log('View details:', f.id)}
                    onEnterScore={(f) => console.log('Enter score:', f.id)}
                    onSubmitLineup={(f, teamId) => console.log('Submit lineup:', f.id, teamId)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Single week
        <div className="space-y-3">
          {filteredFixtures.map(fixture => (
            <TeamLeagueFixtureCard
              key={fixture.id}
              fixture={fixture}
              teams={teams}
              settings={settings}
              isOrganizer={isOrganizer}
              isMyTeam={myTeam ? (fixture.homeTeamId === myTeam.id || fixture.awayTeamId === myTeam.id) : false}
              onViewDetails={(f) => console.log('View details:', f.id)}
              onEnterScore={(f) => console.log('Enter score:', f.id)}
              onSubmitLineup={(f, teamId) => console.log('Submit lineup:', f.id, teamId)}
            />
          ))}
        </div>
      )}

      {/* Summary stats */}
      <div className="bg-gray-800/30 rounded-lg px-4 py-3 flex flex-wrap gap-4 text-sm text-gray-400">
        <span>
          Total: <span className="text-white font-medium">{fixtures.length}</span> fixtures
        </span>
        <span>
          Completed: <span className="text-lime-400 font-medium">
            {fixtures.filter(f => f.status === 'completed').length}
          </span>
        </span>
        <span>
          In Progress: <span className="text-amber-400 font-medium">
            {fixtures.filter(f => f.status === 'in_progress').length}
          </span>
        </span>
        <span>
          Scheduled: <span className="text-gray-300 font-medium">
            {fixtures.filter(f => f.status === 'scheduled' || f.status === 'lineups_submitted').length}
          </span>
        </span>
      </div>
    </div>
  );
};

export default TeamLeagueFixtureList;

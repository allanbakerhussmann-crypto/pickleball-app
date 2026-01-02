/**
 * EventResults - Main results/standings display component
 *
 * Routes to appropriate standings component based on event type and format.
 * Handles tournaments (pools, brackets, standings), leagues, and meetups.
 *
 * V06.45: Added public bracket view with multi-game score display
 *
 * @version V06.45
 * @file components/results/EventResults.tsx
 */

import React from 'react';
import { PoolGroupStandings } from '../tournament/PoolGroupStandings';
import { Standings } from '../Standings';
import { LeagueStandings } from '../leagues/LeagueStandings';
import { MeetupResults } from '../meetups/MeetupResults';
import { BracketViewer } from '../BracketViewer';
import type { MeetupMatch, MeetupStanding } from '../../services/firebase/meetupMatches';
import type { EventData, EventType } from '../../hooks/useEventResultsData';
import type { Division, Team, Match, LeagueMember, StandingsEntry } from '../../types';

interface EventResultsProps {
  eventType: EventType;
  event: EventData;
  divisions: Division[];
  teams: Team[];
  matches: Match[];
  activeDivisionId: string | null;
  leagueMembers: LeagueMember[];
  meetupMatches: MeetupMatch[];
  meetupStandings: MeetupStanding[];
}

// Calculate standings from matches - returns StandingsEntry format
const calculateStandings = (matches: Match[], teams: Team[]): (StandingsEntry & { team?: { id: string; name: string; players?: string[] } })[] => {
  const teamStats: Record<string, {
    odTeamId: string;
    teamName: string;
    played: number;
    won: number;
    lost: number;
    pointsFor: number;
    pointsAgainst: number;
    pointDifferential: number;
    leaguePoints: number;
    team?: { id: string; name: string; players?: string[] };
  }> = {};

  // Initialize stats for all teams
  teams.forEach(team => {
    if (!team.id) return; // Skip teams without ID
    teamStats[team.id] = {
      odTeamId: team.id,
      teamName: team.name || 'Team',
      played: 0,
      won: 0,
      lost: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDifferential: 0,
      leaguePoints: 0,
      team: { id: team.id, name: team.name || 'Team', players: team.playerIds },
    };
  });

  // Calculate from completed matches
  matches
    .filter(m => m.status === 'completed')
    .forEach(m => {
      const teamAId = m.sideA?.id || m.teamAId;
      const teamBId = m.sideB?.id || m.teamBId;

      if (!teamAId || !teamBId) return;

      // Initialize if not exists
      if (!teamStats[teamAId]) {
        teamStats[teamAId] = {
          odTeamId: teamAId,
          teamName: m.sideA?.name || 'Team A',
          played: 0, won: 0, lost: 0, pointsFor: 0, pointsAgainst: 0, pointDifferential: 0, leaguePoints: 0,
          team: { id: teamAId, name: m.sideA?.name || 'Team A' },
        };
      }
      if (!teamStats[teamBId]) {
        teamStats[teamBId] = {
          odTeamId: teamBId,
          teamName: m.sideB?.name || 'Team B',
          played: 0, won: 0, lost: 0, pointsFor: 0, pointsAgainst: 0, pointDifferential: 0, leaguePoints: 0,
          team: { id: teamBId, name: m.sideB?.name || 'Team B' },
        };
      }

      // Update played count
      teamStats[teamAId].played++;
      teamStats[teamBId].played++;

      // Calculate total points
      let totalA = 0;
      let totalB = 0;
      (m.scores || []).forEach(game => {
        totalA += game.scoreA || 0;
        totalB += game.scoreB || 0;
      });

      teamStats[teamAId].pointsFor += totalA;
      teamStats[teamAId].pointsAgainst += totalB;
      teamStats[teamBId].pointsFor += totalB;
      teamStats[teamBId].pointsAgainst += totalA;

      // Determine winner
      const winnerId = m.winnerId;
      if (winnerId === teamAId) {
        teamStats[teamAId].won++;
        teamStats[teamAId].leaguePoints += 3; // 3 points for win
        teamStats[teamBId].lost++;
      } else if (winnerId === teamBId) {
        teamStats[teamBId].won++;
        teamStats[teamBId].leaguePoints += 3;
        teamStats[teamAId].lost++;
      }
    });

  // Calculate point differential and convert to array
  const standings = Object.values(teamStats)
    .map(s => ({
      ...s,
      pointDifferential: s.pointsFor - s.pointsAgainst,
    }))
    .sort((a, b) => {
      if (b.won !== a.won) return b.won - a.won;
      return b.pointDifferential - a.pointDifferential;
    });

  return standings;
};

// Check if division has pool play matches
const hasPoolPlayMatches = (matches: Match[]): boolean => {
  return matches.some(m => m.poolGroup || m.stage === 'Pool Play' || m.stage === 'pool');
};

export const EventResults: React.FC<EventResultsProps> = ({
  eventType,
  event,
  teams,
  matches,
  activeDivisionId,
  leagueMembers,
  meetupMatches,
  meetupStandings,
}) => {
  // Tournament Results
  if (eventType === 'tournament') {
    // Filter matches for active division
    const divisionMatches = activeDivisionId
      ? matches.filter(m => m.divisionId === activeDivisionId)
      : matches;

    const divisionTeams = activeDivisionId
      ? teams.filter(t => t.divisionId === activeDivisionId)
      : teams;

    // No matches yet
    if (divisionMatches.length === 0) {
      return (
        <section className="bg-gray-900/60 rounded-xl border border-white/10 p-8 text-center">
          <svg className="w-12 h-12 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-gray-400">No matches scheduled yet</p>
          <p className="text-gray-500 text-sm mt-1">Check back when the tournament begins</p>
        </section>
      );
    }

    // Check if this is pool play format
    if (hasPoolPlayMatches(divisionMatches)) {
      // V06.45: Separate bracket matches from pool matches
      const bracketMatches = divisionMatches.filter(m =>
        m.stage === 'bracket' || m.bracketType === 'main' || m.bracketType === 'plate'
      );
      const poolMatches = divisionMatches.filter(m =>
        !m.stage || m.stage === 'pool' || m.stage === 'Pool Play' || m.poolGroup
      );

      // Convert bracket matches to UI format
      const bracketUiMatches = bracketMatches.map(m => ({
        id: m.id,
        team1: {
          id: m.sideA?.id || m.teamAId || '',
          name: m.sideA?.name || 'TBD',
          players: [],
        },
        team2: {
          id: m.sideB?.id || m.teamBId || '',
          name: m.sideB?.name || 'TBD',
          players: [],
        },
        scores: m.scores,
        score1: m.scores?.[0]?.scoreA ?? null,
        score2: m.scores?.[0]?.scoreB ?? null,
        gameSettings: m.gameSettings,
        status: m.status || 'scheduled',
        roundNumber: m.roundNumber,
        bracketPosition: m.bracketPosition,
        isThirdPlace: m.isThirdPlace,
      }));

      return (
        <div className="space-y-6">
          {/* Pool Standings */}
          <section className="bg-gray-900/60 rounded-xl border border-white/10 overflow-hidden">
            <div className="px-4 py-3 bg-gray-800/50 border-b border-white/5">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
                Pool Standings
              </h2>
            </div>
            <div className="p-4">
              <PoolGroupStandings
                matches={poolMatches.length > 0 ? poolMatches : divisionMatches}
                teams={divisionTeams}
              />
            </div>
          </section>

          {/* V06.45: Medal Bracket (public view) */}
          {bracketUiMatches.length > 0 && (
            <section className="bg-gray-900/60 rounded-xl border border-white/10 overflow-hidden">
              <div className="px-4 py-3 bg-gray-800/50 border-b border-white/5">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                  Medal Bracket
                </h2>
              </div>
              <div className="p-4 overflow-x-auto">
                <BracketViewer
                  matches={bracketUiMatches}
                  onUpdateScore={() => {}}
                  isVerified={false}
                  isOrganizer={false}
                  bracketTitle="Medal Bracket"
                />
              </div>
            </section>
          )}
        </div>
      );
    }

    // Regular standings
    const standings = calculateStandings(divisionMatches, divisionTeams);

    return (
      <section className="bg-gray-900/60 rounded-xl border border-white/10 overflow-hidden">
        <div className="px-4 py-3 bg-gray-800/50 border-b border-white/5">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Standings
          </h2>
        </div>
        <div className="p-4">
          <Standings standings={standings} />
        </div>
      </section>
    );
  }

  // League Results
  if (eventType === 'league') {
    if (leagueMembers.length === 0) {
      return (
        <section className="bg-gray-900/60 rounded-xl border border-white/10 p-8 text-center">
          <svg className="w-12 h-12 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <p className="text-gray-400">No league members yet</p>
          <p className="text-gray-500 text-sm mt-1">Check back when players have joined</p>
        </section>
      );
    }

    return (
      <section className="bg-gray-900/60 rounded-xl border border-white/10 overflow-hidden">
        <div className="px-4 py-3 bg-gray-800/50 border-b border-white/5">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            League Standings
          </h2>
        </div>
        <div className="p-4">
          <LeagueStandings
            members={leagueMembers}
            format="round_robin"
            leagueType="singles"
            compact={false}
          />
        </div>
      </section>
    );
  }

  // Meetup Results
  if (eventType === 'meetup') {
    if (meetupMatches.length === 0) {
      return (
        <section className="bg-gray-900/60 rounded-xl border border-white/10 p-8 text-center">
          <svg className="w-12 h-12 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-gray-400">No matches played yet</p>
          <p className="text-gray-500 text-sm mt-1">Results will appear here once games are completed</p>
        </section>
      );
    }

    return (
      <section className="bg-gray-900/60 rounded-xl border border-white/10 overflow-hidden">
        <div className="p-4">
          <MeetupResults
            standings={meetupStandings}
            matches={meetupMatches}
            competitionType={event.status || 'round_robin'}
            meetupTitle={event.name}
          />
        </div>
      </section>
    );
  }

  return null;
};

export default EventResults;

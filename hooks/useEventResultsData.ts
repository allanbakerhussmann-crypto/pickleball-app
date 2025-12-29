/**
 * useEventResultsData - Data hook for public event results page
 *
 * Generic hook that works for tournaments, leagues, and meetups.
 * Provides real-time subscriptions to matches and standings data.
 *
 * @version V06.19
 * @file hooks/useEventResultsData.ts
 */

import { useState, useEffect, useMemo } from 'react';
import { getTournament } from '../services/firebase/tournaments';
import { subscribeToDivisions } from '../services/firebase/tournaments';
import { subscribeToTeams } from '../services/firebase/teams';
import { subscribeToMatches } from '../services/firebase/matches';
import { getLeague, subscribeToLeagueMatches, subscribeToLeagueMembers } from '../services/firebase/leagues';
import { getMeetupById, getMeetupRSVPs } from '../services/firebase/meetups';
import { subscribeToMeetupMatches, subscribeToMeetupStandings } from '../services/firebase/meetupMatches';
import type { MeetupMatch, MeetupStanding } from '../services/firebase/meetupMatches';
import type {
  Division,
  Team,
  Match,
  LeagueMatch,
  LeagueMember,
  MeetupRSVP,
  TournamentSponsor,
} from '../types';

// ============================================
// Types
// ============================================

export type EventType = 'tournament' | 'league' | 'meetup';

export interface EventData {
  id: string;
  name: string;
  status: string;
  startDate?: number;
  endDate?: number;
  location?: string;
  venue?: string;
  clubId?: string;
  clubName?: string;
  sponsors?: TournamentSponsor[];
  organizerName?: string;
}

export interface QueueMatch {
  id: string;
  sideAName: string;
  sideBName: string;
  sideAId?: string;
  sideBId?: string;
  court?: string;
  divisionName?: string;
  roundNumber?: number;
  status: string;
  scores?: { scoreA: number; scoreB: number }[];
  currentGame?: number;
}

export interface UseEventResultsDataReturn {
  // Event data
  event: EventData | null;
  eventType: EventType;
  loading: boolean;
  error: string | null;

  // Tournament-specific
  divisions: Division[];
  teams: Team[];
  matches: Match[];

  // League-specific
  leagueMembers: LeagueMember[];
  leagueMatches: LeagueMatch[];

  // Meetup-specific
  meetupRSVPs: MeetupRSVP[];
  meetupMatches: MeetupMatch[];
  meetupStandings: MeetupStanding[];

  // Division/category selection
  activeDivisionId: string | null;
  setActiveDivisionId: (id: string | null) => void;

  // Computed queues
  onCourtNow: QueueMatch[];
  nextUp: QueueMatch[];
}

// ============================================
// Queue Logic
// ============================================

function getOnCourtNow(matches: Match[], teams: Team[], divisions: Division[]): QueueMatch[] {
  // Matches currently being played (have court assigned, in progress or scheduled on court)
  const onCourt = matches.filter(m =>
    m.court &&
    (m.status === 'in_progress' || m.status === 'scheduled')
  );

  return onCourt
    .sort((a, b) => {
      // Sort by court number
      const courtA = parseInt(a.court?.replace(/\D/g, '') || '0');
      const courtB = parseInt(b.court?.replace(/\D/g, '') || '0');
      return courtA - courtB;
    })
    .map(m => {
      const teamA = teams.find(t => t.id === m.sideA?.id || t.id === m.teamAId);
      const teamB = teams.find(t => t.id === m.sideB?.id || t.id === m.teamBId);
      const division = divisions.find(d => d.id === m.divisionId);

      return {
        id: m.id,
        sideAName: m.sideA?.name || teamA?.name || 'TBD',
        sideBName: m.sideB?.name || teamB?.name || 'TBD',
        sideAId: m.sideA?.id || m.teamAId,
        sideBId: m.sideB?.id || m.teamBId,
        court: m.court || undefined,
        divisionName: division?.name,
        roundNumber: m.roundNumber,
        status: m.status || 'scheduled',
        scores: m.scores,
        currentGame: m.scores?.length || 1,
      } as QueueMatch;
    });
}

function getNextUpQueue(matches: Match[], teams: Team[], divisions: Division[]): QueueMatch[] {
  // 1. Filter: not completed, not in_progress, no court assigned
  const waiting = matches.filter(m =>
    m.status !== 'completed' &&
    m.status !== 'in_progress' &&
    !m.court
  );

  // 2. Get busy teams (currently on court)
  const busyTeamIds = new Set<string>();
  matches.forEach(m => {
    if (m.court && m.status !== 'completed') {
      if (m.sideA?.id) busyTeamIds.add(m.sideA.id);
      if (m.sideB?.id) busyTeamIds.add(m.sideB.id);
      if (m.teamAId) busyTeamIds.add(m.teamAId);
      if (m.teamBId) busyTeamIds.add(m.teamBId);
    }
  });

  // 3. Filter out matches where teams are busy
  const eligible = waiting.filter(m => {
    const teamAId = m.sideA?.id || m.teamAId;
    const teamBId = m.sideB?.id || m.teamBId;
    return !busyTeamIds.has(teamAId || '') && !busyTeamIds.has(teamBId || '');
  });

  // 4. Sort by round, then match number
  return eligible
    .sort((a, b) =>
      (a.roundNumber || 0) - (b.roundNumber || 0) ||
      (a.matchNumber || 0) - (b.matchNumber || 0)
    )
    .slice(0, 5)
    .map(m => {
      const teamA = teams.find(t => t.id === m.sideA?.id || t.id === m.teamAId);
      const teamB = teams.find(t => t.id === m.sideB?.id || t.id === m.teamBId);
      const division = divisions.find(d => d.id === m.divisionId);

      return {
        id: m.id,
        sideAName: m.sideA?.name || teamA?.name || 'TBD',
        sideBName: m.sideB?.name || teamB?.name || 'TBD',
        sideAId: m.sideA?.id || m.teamAId,
        sideBId: m.sideB?.id || m.teamBId,
        court: undefined,
        divisionName: division?.name,
        roundNumber: m.roundNumber,
        status: 'waiting',
        scores: undefined,
      } as QueueMatch;
    });
}

// League queue logic
function getLeagueOnCourtNow(matches: LeagueMatch[], members: LeagueMember[]): QueueMatch[] {
  const onCourt = matches.filter(m =>
    m.court &&
    (m.status === 'scheduled' || m.status === 'pending_confirmation')
  );

  return onCourt
    .sort((a, b) => {
      const courtA = parseInt(a.court?.replace(/\D/g, '') || '0');
      const courtB = parseInt(b.court?.replace(/\D/g, '') || '0');
      return courtA - courtB;
    })
    .map(m => {
      const memberA = members.find(mem => mem.userId === m.userAId);
      const memberB = members.find(mem => mem.userId === m.userBId);

      return {
        id: m.id,
        sideAName: memberA?.displayName || m.memberAName || 'TBD',
        sideBName: memberB?.displayName || m.memberBName || 'TBD',
        sideAId: m.memberAId,
        sideBId: m.memberBId,
        court: m.court || undefined,
        roundNumber: m.roundNumber || undefined,
        status: m.status || 'scheduled',
        scores: m.scores,
      } as QueueMatch;
    });
}

function getLeagueNextUp(matches: LeagueMatch[], members: LeagueMember[]): QueueMatch[] {
  const waiting = matches.filter(m =>
    m.status !== 'completed' &&
    m.status !== 'pending_confirmation' &&
    !m.court
  );

  const busyMemberIds = new Set<string>();
  matches.forEach(m => {
    if (m.court && m.status !== 'completed') {
      if (m.memberAId) busyMemberIds.add(m.memberAId);
      if (m.memberBId) busyMemberIds.add(m.memberBId);
    }
  });

  const eligible = waiting.filter(m => {
    return !busyMemberIds.has(m.memberAId) && !busyMemberIds.has(m.memberBId);
  });

  return eligible
    .slice(0, 5)
    .map(m => {
      const memberA = members.find(mem => mem.userId === m.userAId);
      const memberB = members.find(mem => mem.userId === m.userBId);

      return {
        id: m.id,
        sideAName: memberA?.displayName || m.memberAName || 'TBD',
        sideBName: memberB?.displayName || m.memberBName || 'TBD',
        sideAId: m.memberAId,
        sideBId: m.memberBId,
        court: undefined,
        roundNumber: m.roundNumber || undefined,
        status: 'waiting',
      } as QueueMatch;
    });
}

// Meetup queue logic
function getMeetupOnCourtNow(matches: MeetupMatch[]): QueueMatch[] {
  const onCourt = matches.filter(m =>
    m.court &&
    (m.status === 'in_progress' || m.status === 'scheduled')
  );

  return onCourt
    .sort((a, b) => {
      const courtA = parseInt(a.court?.replace(/\D/g, '') || '0');
      const courtB = parseInt(b.court?.replace(/\D/g, '') || '0');
      return courtA - courtB;
    })
    .map(m => ({
      id: m.id,
      sideAName: m.player1Name || 'Player 1',
      sideBName: m.player2Name || 'Player 2',
      sideAId: m.player1Id,
      sideBId: m.player2Id,
      court: m.court || undefined,
      roundNumber: m.round,
      status: m.status || 'scheduled',
      scores: m.games?.map(g => ({ scoreA: g.player1, scoreB: g.player2 })),
    } as QueueMatch));
}

function getMeetupNextUp(matches: MeetupMatch[]): QueueMatch[] {
  const waiting = matches.filter(m =>
    m.status !== 'completed' &&
    m.status !== 'in_progress' &&
    !m.court
  );

  return waiting
    .slice(0, 5)
    .map(m => ({
      id: m.id,
      sideAName: m.player1Name || 'Player 1',
      sideBName: m.player2Name || 'Player 2',
      sideAId: m.player1Id,
      sideBId: m.player2Id,
      court: undefined,
      roundNumber: m.round,
      status: 'waiting',
    } as QueueMatch));
}

// ============================================
// Main Hook
// ============================================

export function useEventResultsData(
  eventId: string,
  eventType: EventType
): UseEventResultsDataReturn {
  // State
  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tournament-specific state
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);

  // League-specific state
  const [leagueMembers, setLeagueMembers] = useState<LeagueMember[]>([]);
  const [leagueMatches, setLeagueMatches] = useState<LeagueMatch[]>([]);

  // Meetup-specific state
  const [meetupRSVPs, setMeetupRSVPs] = useState<MeetupRSVP[]>([]);
  const [meetupMatches, setMeetupMatches] = useState<MeetupMatch[]>([]);
  const [meetupStandings, setMeetupStandings] = useState<MeetupStanding[]>([]);

  // Division selection
  const [activeDivisionId, setActiveDivisionId] = useState<string | null>(null);

  // Load event data based on type
  useEffect(() => {
    if (!eventId) return;

    setLoading(true);
    setError(null);

    const loadEvent = async () => {
      try {
        if (eventType === 'tournament') {
          const tournament = await getTournament(eventId);
          if (!tournament) {
            setError('Tournament not found');
            setLoading(false);
            return;
          }
          setEvent({
            id: tournament.id,
            name: tournament.name,
            status: tournament.status,
            startDate: tournament.startDate,
            endDate: tournament.endDate,
            location: tournament.location,
            venue: tournament.venue,
            clubId: tournament.clubId,
            clubName: tournament.clubName,
            sponsors: tournament.sponsors,
            organizerName: tournament.organizerName,
          });
        } else if (eventType === 'league') {
          const league = await getLeague(eventId);
          if (!league) {
            setError('League not found');
            setLoading(false);
            return;
          }
          setEvent({
            id: league.id,
            name: league.name,
            status: league.status,
            startDate: league.seasonStart,
            endDate: league.seasonEnd,
            location: league.location || undefined,
            venue: league.venue || undefined,
            clubId: league.clubId || undefined,
            clubName: league.clubName || undefined,
            organizerName: league.organizerName,
          });
        } else if (eventType === 'meetup') {
          const meetup = await getMeetupById(eventId);
          if (!meetup) {
            setError('Meetup not found');
            setLoading(false);
            return;
          }
          // Load RSVPs
          const rsvps = await getMeetupRSVPs(eventId);
          setMeetupRSVPs(rsvps);

          setEvent({
            id: meetup.id,
            name: meetup.title,
            status: meetup.status,
            startDate: meetup.date,
            endDate: meetup.endDate,
            location: meetup.location,
            venue: meetup.venueDetails,
            clubId: meetup.clubId,
            clubName: meetup.clubName,
            organizerName: meetup.hostName,
          });
        }
        setLoading(false);
      } catch (err) {
        console.error('Error loading event:', err);
        setError('Failed to load event');
        setLoading(false);
      }
    };

    loadEvent();
  }, [eventId, eventType]);

  // Set up real-time subscriptions based on event type
  useEffect(() => {
    if (!eventId || !event) return;

    const unsubscribes: (() => void)[] = [];

    if (eventType === 'tournament') {
      // Subscribe to divisions
      const unsubDivisions = subscribeToDivisions(eventId, (divs) => {
        setDivisions(divs);
        // Set first division as active if none selected
        if (!activeDivisionId && divs.length > 0) {
          setActiveDivisionId(divs[0].id);
        }
      });
      unsubscribes.push(unsubDivisions);

      // Subscribe to teams
      const unsubTeams = subscribeToTeams(eventId, setTeams);
      unsubscribes.push(unsubTeams);

      // Subscribe to matches
      const unsubMatches = subscribeToMatches(eventId, setMatches);
      unsubscribes.push(unsubMatches);

    } else if (eventType === 'league') {
      // Subscribe to league members
      const unsubMembers = subscribeToLeagueMembers(eventId, setLeagueMembers);
      unsubscribes.push(unsubMembers);

      // Subscribe to league matches
      const unsubMatches = subscribeToLeagueMatches(eventId, setLeagueMatches);
      unsubscribes.push(unsubMatches);

    } else if (eventType === 'meetup') {
      // Subscribe to meetup matches
      const unsubMatches = subscribeToMeetupMatches(eventId, setMeetupMatches);
      unsubscribes.push(unsubMatches);

      // Subscribe to meetup standings
      const unsubStandings = subscribeToMeetupStandings(eventId, setMeetupStandings);
      unsubscribes.push(unsubStandings);
    }

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [eventId, eventType, event, activeDivisionId]);

  // Compute queues based on event type
  const onCourtNow = useMemo(() => {
    if (eventType === 'tournament') {
      return getOnCourtNow(matches, teams, divisions);
    } else if (eventType === 'league') {
      return getLeagueOnCourtNow(leagueMatches, leagueMembers);
    } else if (eventType === 'meetup') {
      return getMeetupOnCourtNow(meetupMatches);
    }
    return [];
  }, [eventType, matches, teams, divisions, leagueMatches, leagueMembers, meetupMatches]);

  const nextUp = useMemo(() => {
    if (eventType === 'tournament') {
      return getNextUpQueue(matches, teams, divisions);
    } else if (eventType === 'league') {
      return getLeagueNextUp(leagueMatches, leagueMembers);
    } else if (eventType === 'meetup') {
      return getMeetupNextUp(meetupMatches);
    }
    return [];
  }, [eventType, matches, teams, divisions, leagueMatches, leagueMembers, meetupMatches]);

  return {
    event,
    eventType,
    loading,
    error,
    divisions,
    teams,
    matches,
    leagueMembers,
    leagueMatches,
    meetupRSVPs,
    meetupMatches,
    meetupStandings,
    activeDivisionId,
    setActiveDivisionId,
    onCourtNow,
    nextUp,
  };
}

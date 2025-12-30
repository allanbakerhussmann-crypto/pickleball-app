/**
 * useLiveMatches - Hook for homepage live matches feed
 *
 * Subscribes to all active tournaments, leagues, and meetups
 * and aggregates their live (on court) matches.
 *
 * @version V06.19
 * @file hooks/useLiveMatches.ts
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { subscribeToTournaments } from '../services/firebase/tournaments';
import { subscribeToMatches } from '../services/firebase/matches';
import { subscribeToLeagues, subscribeToLeagueMatches } from '../services/firebase/leagues';
import { getMeetups } from '../services/firebase/meetups';
import { subscribeToMeetupMatches } from '../services/firebase/meetupMatches';
import type { Tournament, League, Meetup, Match, LeagueMatch } from '../types';
import type { MeetupMatch } from '../services/firebase/meetupMatches';

// ============================================
// Types
// ============================================

export interface LiveMatch {
  id: string;
  eventType: 'tournament' | 'league' | 'meetup';
  eventId: string;
  eventName: string;
  court: string;
  sideAName: string;
  sideBName: string;
  currentScore: { a: number; b: number };
  gameNumber: number;
  divisionName?: string;
}

interface LiveMatchesState {
  matches: LiveMatch[];
  loading: boolean;
  totalCount: number;
}

// ============================================
// Helpers
// ============================================

function isToday(timestamp: number): boolean {
  const date = new Date(timestamp);
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

function getCurrentScore(scores?: { scoreA?: number; scoreB?: number }[]): { a: number; b: number } {
  if (!scores || scores.length === 0) {
    return { a: 0, b: 0 };
  }
  const lastGame = scores[scores.length - 1];
  return {
    a: lastGame?.scoreA || 0,
    b: lastGame?.scoreB || 0,
  };
}

// Convert tournament match to LiveMatch
function tournamentMatchToLive(
  match: Match,
  tournament: Tournament
): LiveMatch | null {
  if (!match.court || match.status === 'completed') {
    return null;
  }

  return {
    id: match.id,
    eventType: 'tournament',
    eventId: tournament.id,
    eventName: tournament.name,
    court: match.court,
    sideAName: match.sideA?.name || 'TBD',
    sideBName: match.sideB?.name || 'TBD',
    currentScore: getCurrentScore(match.scores),
    gameNumber: match.scores?.length || 1,
    divisionName: match.divisionName,
  };
}

// Convert league match to LiveMatch
function leagueMatchToLive(
  match: LeagueMatch,
  league: League
): LiveMatch | null {
  if (!match.court || match.status === 'completed') {
    return null;
  }

  return {
    id: match.id,
    eventType: 'league',
    eventId: league.id,
    eventName: league.name,
    court: match.court,
    sideAName: match.memberAName || 'TBD',
    sideBName: match.memberBName || 'TBD',
    currentScore: getCurrentScore(match.scores),
    gameNumber: match.scores?.length || 1,
  };
}

// Convert meetup match to LiveMatch
function meetupMatchToLive(
  match: MeetupMatch,
  meetup: Meetup
): LiveMatch | null {
  if (!match.court || match.status === 'completed') {
    return null;
  }

  const games = match.games || [];
  const lastGame = games[games.length - 1];

  return {
    id: match.id,
    eventType: 'meetup',
    eventId: meetup.id,
    eventName: meetup.title,
    court: match.court,
    sideAName: match.player1Name || 'Player 1',
    sideBName: match.player2Name || 'Player 2',
    currentScore: {
      a: lastGame?.player1 || 0,
      b: lastGame?.player2 || 0,
    },
    gameNumber: games.length || 1,
  };
}

// ============================================
// Main Hook
// ============================================

export function useLiveMatches(): LiveMatchesState {
  const [allLiveMatches, setAllLiveMatches] = useState<Map<string, LiveMatch[]>>(new Map());
  const [loading, setLoading] = useState(true);

  // Track subscriptions
  const matchSubscriptionsRef = useRef<Map<string, () => void>>(new Map());
  const activeTournamentsRef = useRef<Tournament[]>([]);
  const activeLeaguesRef = useRef<League[]>([]);
  const activeMeetupsRef = useRef<Meetup[]>([]);

  // Update matches for a specific event
  const updateEventMatches = useCallback((eventKey: string, matches: LiveMatch[]) => {
    setAllLiveMatches((prev) => {
      const next = new Map(prev);
      if (matches.length > 0) {
        next.set(eventKey, matches);
      } else {
        next.delete(eventKey);
      }
      return next;
    });
  }, []);

  // Subscribe to tournament matches
  const subscribeToTournamentMatches = useCallback(
    (tournament: Tournament) => {
      const eventKey = `tournament-${tournament.id}`;

      // Skip if already subscribed
      if (matchSubscriptionsRef.current.has(eventKey)) return;

      const unsub = subscribeToMatches(tournament.id, (matches) => {
        const liveMatches = matches
          .map((m) => tournamentMatchToLive(m, tournament))
          .filter((m): m is LiveMatch => m !== null);
        updateEventMatches(eventKey, liveMatches);
      });

      matchSubscriptionsRef.current.set(eventKey, unsub);
    },
    [updateEventMatches]
  );

  // Subscribe to league matches
  const subscribeToLeagueMatchesFn = useCallback(
    (league: League) => {
      const eventKey = `league-${league.id}`;

      if (matchSubscriptionsRef.current.has(eventKey)) return;

      const unsub = subscribeToLeagueMatches(league.id, (matches) => {
        const liveMatches = matches
          .map((m) => leagueMatchToLive(m, league))
          .filter((m): m is LiveMatch => m !== null);
        updateEventMatches(eventKey, liveMatches);
      });

      matchSubscriptionsRef.current.set(eventKey, unsub);
    },
    [updateEventMatches]
  );

  // Subscribe to meetup matches
  const subscribeToMeetupMatchesFn = useCallback(
    (meetup: Meetup) => {
      const eventKey = `meetup-${meetup.id}`;

      if (matchSubscriptionsRef.current.has(eventKey)) return;

      const unsub = subscribeToMeetupMatches(meetup.id, (matches) => {
        const liveMatches = matches
          .map((m) => meetupMatchToLive(m, meetup))
          .filter((m): m is LiveMatch => m !== null);
        updateEventMatches(eventKey, liveMatches);
      });

      matchSubscriptionsRef.current.set(eventKey, unsub);
    },
    [updateEventMatches]
  );

  // Cleanup subscription for an event
  const cleanupEventSubscription = useCallback((eventKey: string) => {
    const unsub = matchSubscriptionsRef.current.get(eventKey);
    if (unsub) {
      unsub();
      matchSubscriptionsRef.current.delete(eventKey);
    }
    setAllLiveMatches((prev) => {
      const next = new Map(prev);
      next.delete(eventKey);
      return next;
    });
  }, []);

  // Main effect - subscribe to events
  useEffect(() => {
    const unsubscribes: (() => void)[] = [];

    // Subscribe to tournaments
    const unsubTournaments = subscribeToTournaments('', (tournaments) => {
      const active = tournaments.filter((t) => t.status === 'active');

      // Find removed tournaments
      const currentIds = new Set(active.map((t) => t.id));
      activeTournamentsRef.current.forEach((t) => {
        if (!currentIds.has(t.id)) {
          cleanupEventSubscription(`tournament-${t.id}`);
        }
      });

      // Subscribe to new active tournaments
      active.forEach((t) => subscribeToTournamentMatches(t));
      activeTournamentsRef.current = active;
      setLoading(false);
    });
    unsubscribes.push(unsubTournaments);

    // Subscribe to leagues
    const unsubLeagues = subscribeToLeagues((leagues) => {
      const active = leagues.filter((l) => l.status === 'active');

      const currentIds = new Set(active.map((l) => l.id));
      activeLeaguesRef.current.forEach((l) => {
        if (!currentIds.has(l.id)) {
          cleanupEventSubscription(`league-${l.id}`);
        }
      });

      active.forEach((l) => subscribeToLeagueMatchesFn(l));
      activeLeaguesRef.current = active;
    });
    unsubscribes.push(unsubLeagues);

    // Load meetups (one-time, then subscribe to matches)
    const loadMeetups = async () => {
      try {
        const meetups = await getMeetups();
        const todayActive = meetups.filter(
          (m) => isToday(m.when) && m.status !== 'cancelled'
        );

        const currentIds = new Set(todayActive.map((m) => m.id));
        activeMeetupsRef.current.forEach((m) => {
          if (!currentIds.has(m.id)) {
            cleanupEventSubscription(`meetup-${m.id}`);
          }
        });

        todayActive.forEach((m) => subscribeToMeetupMatchesFn(m));
        activeMeetupsRef.current = todayActive;
      } catch (e) {
        console.error('Error loading meetups for live matches:', e);
      }
    };
    loadMeetups();

    // Cleanup all subscriptions on unmount
    return () => {
      unsubscribes.forEach((unsub) => unsub());
      matchSubscriptionsRef.current.forEach((unsub) => unsub());
      matchSubscriptionsRef.current.clear();
    };
  }, [
    subscribeToTournamentMatches,
    subscribeToLeagueMatchesFn,
    subscribeToMeetupMatchesFn,
    cleanupEventSubscription,
  ]);

  // Flatten all live matches
  const flatMatches: LiveMatch[] = [];
  allLiveMatches.forEach((matches) => {
    flatMatches.push(...matches);
  });

  // Sort by court number
  flatMatches.sort((a, b) => {
    const courtA = parseInt(a.court.replace(/\D/g, '') || '0');
    const courtB = parseInt(b.court.replace(/\D/g, '') || '0');
    return courtA - courtB;
  });

  return {
    matches: flatMatches.slice(0, 4), // Max 4 matches on homepage
    loading,
    totalCount: flatMatches.length,
  };
}

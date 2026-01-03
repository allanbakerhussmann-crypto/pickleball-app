/**
 * Round Robin Format Generator
 *
 * Generates all match pairings for round robin tournaments.
 * Every participant plays every other participant once (or multiple times
 * if configured for multiple rounds).
 *
 * FILE LOCATION: services/formats/roundRobin.ts
 * VERSION: V06.00
 */

import type { Match } from '../../types';
import type { GameSettings } from '../../types/game/gameSettings';
import type { RoundRobinSettings } from '../../types/formats/formatTypes';
import {
  matchCountsForStandings,
  getMatchWinner,
  getMatchScores,
} from '../../utils/matchHelpers';

// ============================================
// TYPES
// ============================================

export interface RoundRobinParticipant {
  id: string;
  name: string;
  playerIds: string[];
  duprIds?: string[];
  duprRating?: number;
}

export interface RoundRobinConfig {
  eventType: 'tournament' | 'league' | 'meetup';
  eventId: string;
  participants: RoundRobinParticipant[];
  gameSettings: GameSettings;
  formatSettings: RoundRobinSettings;
  startDate?: number;
}

export interface RoundRobinResult {
  matches: Omit<Match, 'id' | 'createdAt' | 'updatedAt'>[];
  schedule: RoundRobinRound[];
  totalRounds: number;
  matchesPerRound: number;
}

export interface RoundRobinRound {
  roundNumber: number;
  pairings: Array<{
    sideA: RoundRobinParticipant;
    sideB: RoundRobinParticipant | null; // null = bye
  }>;
}

// ============================================
// ROUND ROBIN ALGORITHM
// ============================================

/**
 * Generate round robin pairings using the circle method
 *
 * For n participants:
 * - If n is odd, add a "bye" slot to make it even
 * - Fix position 0, rotate all others
 * - n-1 rounds are needed for everyone to play everyone once
 *
 * @param participants - Array of participants
 * @returns Array of rounds with pairings
 */
export function generateRoundRobinPairings(
  participants: RoundRobinParticipant[]
): RoundRobinRound[] {
  const n = participants.length;

  if (n < 2) {
    return [];
  }

  // Copy participants to avoid mutation
  const slots: (RoundRobinParticipant | null)[] = [...participants];

  // Add bye slot if odd number of participants
  if (n % 2 === 1) {
    slots.push(null);
  }

  const numSlots = slots.length;
  const numRounds = numSlots - 1;
  const rounds: RoundRobinRound[] = [];

  for (let round = 0; round < numRounds; round++) {
    const pairings: RoundRobinRound['pairings'] = [];

    // Pair slots: (0, n-1), (1, n-2), (2, n-3), etc.
    for (let i = 0; i < numSlots / 2; i++) {
      const sideA = slots[i];
      const sideB = slots[numSlots - 1 - i];

      // Skip if both are bye (shouldn't happen) or either is null for a valid pairing
      if (sideA !== null || sideB !== null) {
        pairings.push({
          sideA: sideA!,
          sideB: sideB,
        });
      }
    }

    rounds.push({
      roundNumber: round + 1,
      pairings,
    });

    // Rotate: keep slot 0 fixed, rotate others clockwise
    // [0, 1, 2, 3, 4, 5] -> [0, 5, 1, 2, 3, 4]
    const last = slots.pop()!;
    slots.splice(1, 0, last);
  }

  return rounds;
}

/**
 * Generate matches for a round robin tournament/league/meetup
 *
 * @param config - Configuration for the round robin
 * @returns Generated matches and schedule
 */
export function generateRoundRobinMatches(config: RoundRobinConfig): RoundRobinResult {
  const { eventType, eventId, participants, gameSettings, formatSettings } = config;
  const { rounds: numIterations } = formatSettings;

  // Sort participants by DUPR rating for seeding (highest first)
  const sortedParticipants = [...participants].sort((a, b) => {
    const ratingA = a.duprRating ?? 0;
    const ratingB = b.duprRating ?? 0;
    return ratingB - ratingA;
  });

  // Assign seeds based on DUPR ranking
  sortedParticipants.forEach((p, index) => {
    (p as RoundRobinParticipant & { seed: number }).seed = index + 1;
  });

  // Generate single round robin pairings
  const baseRounds = generateRoundRobinPairings(sortedParticipants);

  // Expand for multiple iterations if configured
  const allRounds: RoundRobinRound[] = [];
  for (let iteration = 0; iteration < numIterations; iteration++) {
    for (const round of baseRounds) {
      allRounds.push({
        roundNumber: iteration * baseRounds.length + round.roundNumber,
        pairings: round.pairings,
      });
    }
  }

  // Convert rounds to matches
  const matches: Omit<Match, 'id' | 'createdAt' | 'updatedAt'>[] = [];
  let matchNumber = 1;

  for (const round of allRounds) {
    for (const pairing of round.pairings) {
      // Skip byes
      if (!pairing.sideA || !pairing.sideB) {
        continue;
      }

      const match: Omit<Match, 'id' | 'createdAt' | 'updatedAt'> = {
        eventType,
        eventId,
        format: 'round_robin',
        gameSettings,
        sideA: {
          id: pairing.sideA.id,
          name: pairing.sideA.name,
          playerIds: pairing.sideA.playerIds,
          duprIds: pairing.sideA.duprIds,
          duprRating: pairing.sideA.duprRating,
        },
        sideB: {
          id: pairing.sideB.id,
          name: pairing.sideB.name,
          playerIds: pairing.sideB.playerIds,
          duprIds: pairing.sideB.duprIds,
          duprRating: pairing.sideB.duprRating,
        },
        roundNumber: round.roundNumber,
        matchNumber,
        status: 'scheduled',
        scores: [],
      };

      matches.push(match);
      matchNumber++;
    }
  }

  return {
    matches,
    schedule: allRounds,
    totalRounds: allRounds.length,
    matchesPerRound: Math.floor(participants.length / 2),
  };
}

// ============================================
// STANDINGS CALCULATION
// ============================================

export interface RoundRobinStanding {
  participant: RoundRobinParticipant;
  rank: number;
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDifferential: number;
  matchesPlayed: number;
}

/**
 * Calculate standings from completed matches
 *
 * @param participants - All participants
 * @param matches - Completed matches
 * @returns Sorted standings
 */
export function calculateRoundRobinStandings(
  participants: RoundRobinParticipant[],
  matches: Match[]
): RoundRobinStanding[] {
  // Initialize standings map
  const standingsMap = new Map<string, RoundRobinStanding>();

  for (const participant of participants) {
    standingsMap.set(participant.id, {
      participant,
      rank: 0,
      wins: 0,
      losses: 0,
      gamesWon: 0,
      gamesLost: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDifferential: 0,
      matchesPlayed: 0,
    });
  }

  // Process completed matches - V07.04: Use officialResult only via matchHelpers
  for (const match of matches) {
    // Skip matches that don't count for standings (no officialResult)
    if (!matchCountsForStandings(match)) {
      continue;
    }

    // Get winner from officialResult (or legacy fallback for migrated matches)
    const winnerId = getMatchWinner(match);
    if (!winnerId) {
      continue;
    }

    // Skip if match doesn't have both sides defined
    if (!match.sideA?.id || !match.sideB?.id) continue;

    const standingA = standingsMap.get(match.sideA.id);
    const standingB = standingsMap.get(match.sideB.id);

    if (!standingA || !standingB) continue;

    // Update matches played
    standingA.matchesPlayed++;
    standingB.matchesPlayed++;

    // Update wins/losses
    if (winnerId === match.sideA.id) {
      standingA.wins++;
      standingB.losses++;
    } else {
      standingB.wins++;
      standingA.losses++;
    }

    // Calculate games and points from official scores
    let gamesA = 0;
    let gamesB = 0;
    let pointsA = 0;
    let pointsB = 0;

    // Get scores from officialResult (or legacy for migrated matches)
    const scores = getMatchScores(match);
    for (const game of scores) {
      const scoreA = game.scoreA ?? 0;
      const scoreB = game.scoreB ?? 0;
      pointsA += scoreA;
      pointsB += scoreB;

      if (scoreA > scoreB) {
        gamesA++;
      } else if (scoreB > scoreA) {
        gamesB++;
      }
    }

    standingA.gamesWon += gamesA;
    standingA.gamesLost += gamesB;
    standingA.pointsFor += pointsA;
    standingA.pointsAgainst += pointsB;

    standingB.gamesWon += gamesB;
    standingB.gamesLost += gamesA;
    standingB.pointsFor += pointsB;
    standingB.pointsAgainst += pointsA;
  }

  // Calculate point differential
  for (const standing of standingsMap.values()) {
    standing.pointDifferential = standing.pointsFor - standing.pointsAgainst;
  }

  // Sort standings: wins desc, then point differential desc, then points for desc
  const standings = Array.from(standingsMap.values()).sort((a, b) => {
    // 1. Wins
    if (b.wins !== a.wins) return b.wins - a.wins;

    // 2. Point differential
    if (b.pointDifferential !== a.pointDifferential) {
      return b.pointDifferential - a.pointDifferential;
    }

    // 3. Points for
    return b.pointsFor - a.pointsFor;
  });

  // Assign ranks
  standings.forEach((standing, index) => {
    standing.rank = index + 1;
  });

  return standings;
}

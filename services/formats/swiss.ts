/**
 * Swiss System Format Generator
 *
 * Generates pairings for Swiss system tournaments.
 * Players are paired with opponents of similar records each round.
 * No rematches allowed.
 *
 * FILE LOCATION: services/formats/swiss.ts
 * VERSION: V06.00
 */

import type { Match } from '../../types/game/match';
import type { GameSettings } from '../../types/game/gameSettings';
import type { SwissSettings } from '../../types/formats/formatTypes';

// ============================================
// TYPES
// ============================================

export interface SwissParticipant {
  id: string;
  name: string;
  playerIds: string[];
  duprIds?: string[];
  duprRating?: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  opponents: string[]; // IDs of previous opponents
}

export interface SwissConfig {
  eventType: 'tournament' | 'league' | 'meetup';
  eventId: string;
  participants: SwissParticipant[];
  gameSettings: GameSettings;
  formatSettings: SwissSettings;
  roundNumber: number;
}

export interface SwissRoundResult {
  matches: Omit<Match, 'id' | 'createdAt' | 'updatedAt'>[];
  pairings: SwissPairing[];
  byeParticipant?: SwissParticipant;
}

export interface SwissPairing {
  sideA: SwissParticipant;
  sideB: SwissParticipant;
  matchNumber: number;
}

// ============================================
// SWISS PAIRING METHODS
// ============================================

/**
 * Group participants by their current score (wins)
 *
 * @param participants - All participants with records
 * @returns Map of score -> participants
 */
function groupByScore(participants: SwissParticipant[]): Map<number, SwissParticipant[]> {
  const groups = new Map<number, SwissParticipant[]>();

  for (const p of participants) {
    const score = p.wins;
    if (!groups.has(score)) {
      groups.set(score, []);
    }
    groups.get(score)!.push(p);
  }

  return groups;
}

/**
 * Sort participants within a score group by DUPR rating
 *
 * @param participants - Participants in same score group
 * @returns Sorted by DUPR (highest first)
 */
function sortByRating(participants: SwissParticipant[]): SwissParticipant[] {
  return [...participants].sort((a, b) => {
    const ratingA = a.duprRating ?? 0;
    const ratingB = b.duprRating ?? 0;
    return ratingB - ratingA;
  });
}

/**
 * Check if two participants have already played
 *
 * @param p1 - First participant
 * @param p2 - Second participant
 * @returns True if they've already played
 */
function havePlayed(p1: SwissParticipant, p2: SwissParticipant): boolean {
  return p1.opponents.includes(p2.id) || p2.opponents.includes(p1.id);
}

/**
 * Adjacent pairing method
 * Pair 1st with 2nd, 3rd with 4th, etc. within each score group
 *
 * @param participants - Sorted participants in a score group
 * @returns Pairings (may have issues with rematches)
 */
function adjacentPairing(
  participants: SwissParticipant[]
): Array<[SwissParticipant, SwissParticipant]> {
  const pairings: Array<[SwissParticipant, SwissParticipant]> = [];
  const unpaired = [...participants];

  while (unpaired.length >= 2) {
    const p1 = unpaired.shift()!;

    // Find first valid opponent (no rematch)
    let opponentIndex = 0;
    while (opponentIndex < unpaired.length && havePlayed(p1, unpaired[opponentIndex])) {
      opponentIndex++;
    }

    if (opponentIndex < unpaired.length) {
      const p2 = unpaired.splice(opponentIndex, 1)[0];
      pairings.push([p1, p2]);
    } else {
      // Can't find valid opponent, will need to float down
      unpaired.push(p1);
      break;
    }
  }

  return pairings;
}

/**
 * Slide pairing method
 * Split group in half, pair top of first half with top of second half
 * 1st vs mid+1, 2nd vs mid+2, etc.
 *
 * @param participants - Sorted participants in a score group
 * @returns Pairings
 */
function slidePairing(
  participants: SwissParticipant[]
): Array<[SwissParticipant, SwissParticipant]> {
  const pairings: Array<[SwissParticipant, SwissParticipant]> = [];
  const n = participants.length;
  const mid = Math.ceil(n / 2);

  const topHalf = participants.slice(0, mid);
  const bottomHalf = participants.slice(mid);

  const paired = new Set<string>();

  for (const top of topHalf) {
    // Find best opponent in bottom half
    for (const bottom of bottomHalf) {
      if (paired.has(bottom.id)) continue;
      if (havePlayed(top, bottom)) continue;

      pairings.push([top, bottom]);
      paired.add(top.id);
      paired.add(bottom.id);
      break;
    }
  }

  return pairings;
}

// ============================================
// ROUND GENERATION
// ============================================

/**
 * Generate pairings for a Swiss round
 *
 * Algorithm:
 * 1. Group by score
 * 2. Within each group, sort by DUPR
 * 3. Pair using configured method (adjacent or slide)
 * 4. Handle floaters (unpaired from higher groups)
 * 5. Assign bye if odd number
 *
 * @param config - Swiss configuration
 * @returns Pairings for this round
 */
export function generateSwissRound(config: SwissConfig): SwissRoundResult {
  const { eventType, eventId, participants, gameSettings, formatSettings, roundNumber } = config;

  if (participants.length < 2) {
    return { matches: [], pairings: [] };
  }

  // Handle bye for odd number of participants
  let activeParticipants = [...participants];
  let byeParticipant: SwissParticipant | undefined;

  if (activeParticipants.length % 2 === 1) {
    // Give bye to lowest-ranked player who hasn't had a bye
    // For simplicity, give to participant with most losses
    activeParticipants.sort((a, b) => {
      // Most losses first
      if (b.losses !== a.losses) return b.losses - a.losses;
      // Then by rating (lowest first)
      return (a.duprRating ?? 0) - (b.duprRating ?? 0);
    });

    byeParticipant = activeParticipants.pop();
  }

  // Group by score
  const scoreGroups = groupByScore(activeParticipants);

  // Sort scores descending
  const sortedScores = Array.from(scoreGroups.keys()).sort((a, b) => b - a);

  // Generate pairings
  const allPairings: Array<[SwissParticipant, SwissParticipant]> = [];
  let floaters: SwissParticipant[] = [];

  for (const score of sortedScores) {
    const group = scoreGroups.get(score)!;

    // Add floaters from higher score group
    const combined = [...floaters, ...sortByRating(group)];
    floaters = [];

    // Pair using configured method
    let pairings: Array<[SwissParticipant, SwissParticipant]>;

    if (formatSettings.pairingMethod === 'adjacent') {
      pairings = adjacentPairing(combined);
    } else {
      pairings = slidePairing(combined);
    }

    allPairings.push(...pairings);

    // Collect unpaired as floaters for next group
    const pairedIds = new Set(pairings.flatMap(([a, b]) => [a.id, b.id]));
    floaters = combined.filter(p => !pairedIds.has(p.id));
  }

  // Convert to pairings format
  const swissPairings: SwissPairing[] = allPairings.map(([sideA, sideB], index) => ({
    sideA,
    sideB,
    matchNumber: index + 1,
  }));

  // Convert to matches
  const matches: Omit<Match, 'id' | 'createdAt' | 'updatedAt'>[] = swissPairings.map(pairing => ({
    eventType,
    eventId,
    format: 'swiss' as const,
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
    roundNumber,
    matchNumber: pairing.matchNumber,
    status: 'scheduled' as const,
    scores: [],
  }));

  return {
    matches,
    pairings: swissPairings,
    byeParticipant,
  };
}

// ============================================
// STANDINGS
// ============================================

export interface SwissStanding {
  participant: SwissParticipant;
  rank: number;
  wins: number;
  losses: number;
  buchholz: number; // Sum of opponents' wins (tiebreaker)
  pointDifferential: number;
}

/**
 * Calculate Swiss standings with Buchholz tiebreaker
 *
 * Buchholz = sum of all opponents' wins
 * Higher Buchholz means you played stronger opponents
 *
 * @param participants - All participants with records
 * @returns Sorted standings
 */
export function calculateSwissStandings(participants: SwissParticipant[]): SwissStanding[] {
  // Create lookup for quick access
  const lookup = new Map(participants.map(p => [p.id, p]));

  // Calculate Buchholz for each participant
  const standings: SwissStanding[] = participants.map(p => {
    // Sum opponents' wins
    const buchholz = p.opponents.reduce((sum, oppId) => {
      const opponent = lookup.get(oppId);
      return sum + (opponent?.wins ?? 0);
    }, 0);

    return {
      participant: p,
      rank: 0,
      wins: p.wins,
      losses: p.losses,
      buchholz,
      pointDifferential: p.pointsFor - p.pointsAgainst,
    };
  });

  // Sort: wins desc, buchholz desc, point differential desc
  standings.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
    return b.pointDifferential - a.pointDifferential;
  });

  // Assign ranks
  standings.forEach((s, i) => {
    s.rank = i + 1;
  });

  return standings;
}

/**
 * Recommended number of rounds for Swiss tournament
 *
 * General rule: log2(n) rounded up gives good pairing quality
 * Common recommendations:
 * - 4-8 players: 3 rounds
 * - 9-16 players: 4 rounds
 * - 17-32 players: 5 rounds
 * - 33-64 players: 6 rounds
 *
 * @param participantCount - Number of participants
 * @returns Recommended number of rounds
 */
export function recommendedSwissRounds(participantCount: number): number {
  if (participantCount <= 4) return 2;
  if (participantCount <= 8) return 3;
  if (participantCount <= 16) return 4;
  if (participantCount <= 32) return 5;
  if (participantCount <= 64) return 6;
  return 7;
}

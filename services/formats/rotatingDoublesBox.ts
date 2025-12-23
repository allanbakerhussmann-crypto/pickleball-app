/**
 * Rotating Doubles Box Generator
 *
 * Generates matches for box league format where partners rotate each match.
 * Each player partners with every other player in their box exactly once.
 *
 * Example: 4-player box (A, B, C, D)
 * Match 1: A+B vs C+D
 * Match 2: A+C vs B+D
 * Match 3: A+D vs B+C
 *
 * FILE LOCATION: services/formats/rotatingDoublesBox.ts
 * VERSION: V06.00
 */

import type { Match } from '../../types/game/match';
import type { GameSettings } from '../../types/game/gameSettings';
import type { BoxSettings } from '../../types/formats/formatTypes';

// ============================================
// TYPES
// ============================================

export interface BoxPlayer {
  id: string;
  name: string;
  duprId?: string;
  duprRating?: number;
}

export interface BoxConfig {
  eventType: 'tournament' | 'league' | 'meetup';
  eventId: string;
  boxNumber: number;
  players: BoxPlayer[];
  gameSettings: GameSettings;
  weekNumber?: number;
}

export interface BoxMatch {
  team1: [BoxPlayer, BoxPlayer];
  team2: [BoxPlayer, BoxPlayer];
  matchNumber: number;
}

export interface BoxResult {
  matches: Omit<Match, 'id' | 'createdAt' | 'updatedAt'>[];
  pairings: BoxMatch[];
  totalMatches: number;
}

// ============================================
// ROTATING PARTNER GENERATION
// ============================================

/**
 * Generate all unique team pairings for a rotating doubles box
 *
 * For n players, there are n*(n-1)/2 possible pairs.
 * We need to group these into matches where each pair plays against another pair,
 * and no player appears on both teams.
 *
 * @param players - Players in the box (4-8 players)
 * @returns Array of matches with rotating partners
 */
export function generateRotatingPairings(players: BoxPlayer[]): BoxMatch[] {
  const n = players.length;

  if (n < 4) {
    console.warn('Rotating doubles box requires at least 4 players');
    return [];
  }

  // Generate all possible pairs
  const allPairs: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      allPairs.push([i, j]);
    }
  }

  // Track which partnerships have been used
  const usedPartnerships = new Set<string>();
  const matches: BoxMatch[] = [];

  // For each pair of teams that can play against each other
  for (let p1 = 0; p1 < allPairs.length; p1++) {
    for (let p2 = p1 + 1; p2 < allPairs.length; p2++) {
      const pair1 = allPairs[p1];
      const pair2 = allPairs[p2];

      // Check no player overlap
      const players1 = new Set(pair1);
      const hasOverlap = pair2.some(p => players1.has(p));
      if (hasOverlap) continue;

      // Check partnerships not already used
      const key1 = `${pair1[0]}-${pair1[1]}`;
      const key2 = `${pair2[0]}-${pair2[1]}`;

      if (usedPartnerships.has(key1) || usedPartnerships.has(key2)) continue;

      // Valid match found
      usedPartnerships.add(key1);
      usedPartnerships.add(key2);

      matches.push({
        team1: [players[pair1[0]], players[pair1[1]]],
        team2: [players[pair2[0]], players[pair2[1]]],
        matchNumber: matches.length + 1,
      });
    }
  }

  return matches;
}

/**
 * Generate matches for a rotating doubles box
 *
 * @param config - Box configuration
 * @returns Generated matches
 */
export function generateRotatingDoublesBoxMatches(config: BoxConfig): BoxResult {
  const { eventType, eventId, boxNumber, players, gameSettings, weekNumber } = config;

  const pairings = generateRotatingPairings(players);

  const matches: Omit<Match, 'id' | 'createdAt' | 'updatedAt'>[] = pairings.map(pairing => {
    const [player1A, player1B] = pairing.team1;
    const [player2A, player2B] = pairing.team2;

    // Create composite IDs and names for teams
    const sideAId = `${player1A.id}_${player1B.id}`;
    const sideBId = `${player2A.id}_${player2B.id}`;
    const sideAName = `${player1A.name} & ${player1B.name}`;
    const sideBName = `${player2A.name} & ${player2B.name}`;

    // Average DUPR for team rating
    const sideARating =
      player1A.duprRating && player1B.duprRating
        ? (player1A.duprRating + player1B.duprRating) / 2
        : undefined;
    const sideBRating =
      player2A.duprRating && player2B.duprRating
        ? (player2A.duprRating + player2B.duprRating) / 2
        : undefined;

    return {
      eventType,
      eventId,
      format: 'rotating_doubles_box' as const,
      gameSettings,
      sideA: {
        id: sideAId,
        name: sideAName,
        playerIds: [player1A.id, player1B.id],
        duprIds: [player1A.duprId, player1B.duprId].filter(Boolean) as string[],
        duprRating: sideARating,
      },
      sideB: {
        id: sideBId,
        name: sideBName,
        playerIds: [player2A.id, player2B.id],
        duprIds: [player2A.duprId, player2B.duprId].filter(Boolean) as string[],
        duprRating: sideBRating,
      },
      boxNumber,
      weekNumber,
      matchNumber: pairing.matchNumber,
      status: 'scheduled' as const,
      scores: [],
    };
  });

  return {
    matches,
    pairings,
    totalMatches: matches.length,
  };
}

// ============================================
// BOX STANDINGS
// ============================================

export interface BoxPlayerStanding {
  player: BoxPlayer;
  rank: number;
  wins: number;
  losses: number;
  gamesWon: number;
  gamesLost: number;
  pointsFor: number;
  pointsAgainst: number;
  matchesPlayed: number;
}

/**
 * Calculate individual player standings within a rotating doubles box
 *
 * In rotating doubles, each player is credited with wins/losses
 * based on their team's performance in each match.
 *
 * @param players - Players in the box
 * @param matches - Completed matches
 * @returns Sorted standings
 */
export function calculateBoxPlayerStandings(
  players: BoxPlayer[],
  matches: Match[]
): BoxPlayerStanding[] {
  // Initialize standings
  const standingsMap = new Map<string, BoxPlayerStanding>();

  for (const player of players) {
    standingsMap.set(player.id, {
      player,
      rank: 0,
      wins: 0,
      losses: 0,
      gamesWon: 0,
      gamesLost: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      matchesPlayed: 0,
    });
  }

  // Process each completed match
  for (const match of matches) {
    if (match.status !== 'completed' || !match.winnerId) continue;

    const sideAPlayerIds = match.sideA.playerIds;
    const sideBPlayerIds = match.sideB.playerIds;
    const sideAWon = match.winnerId === match.sideA.id;

    // Calculate games and points
    let gamesA = 0;
    let gamesB = 0;
    let pointsA = 0;
    let pointsB = 0;

    for (const game of match.scores) {
      pointsA += game.scoreA;
      pointsB += game.scoreB;
      if (game.scoreA > game.scoreB) gamesA++;
      else if (game.scoreB > game.scoreA) gamesB++;
    }

    // Credit each player on side A
    for (const playerId of sideAPlayerIds) {
      const standing = standingsMap.get(playerId);
      if (!standing) continue;

      standing.matchesPlayed++;
      standing.gamesWon += gamesA;
      standing.gamesLost += gamesB;
      standing.pointsFor += pointsA;
      standing.pointsAgainst += pointsB;

      if (sideAWon) {
        standing.wins++;
      } else {
        standing.losses++;
      }
    }

    // Credit each player on side B
    for (const playerId of sideBPlayerIds) {
      const standing = standingsMap.get(playerId);
      if (!standing) continue;

      standing.matchesPlayed++;
      standing.gamesWon += gamesB;
      standing.gamesLost += gamesA;
      standing.pointsFor += pointsB;
      standing.pointsAgainst += pointsA;

      if (!sideAWon) {
        standing.wins++;
      } else {
        standing.losses++;
      }
    }
  }

  // Sort standings
  const standings = Array.from(standingsMap.values()).sort((a, b) => {
    // 1. Wins
    if (b.wins !== a.wins) return b.wins - a.wins;

    // 2. Point differential
    const diffA = a.pointsFor - a.pointsAgainst;
    const diffB = b.pointsFor - b.pointsAgainst;
    if (diffB !== diffA) return diffB - diffA;

    // 3. Points for
    return b.pointsFor - a.pointsFor;
  });

  // Assign ranks
  standings.forEach((s, i) => {
    s.rank = i + 1;
  });

  return standings;
}

// ============================================
// EXPECTED MATCH COUNTS
// ============================================

/**
 * Calculate expected number of matches for a rotating doubles box
 *
 * With n players, each player partners with (n-1) others exactly once.
 * Total unique partnerships = n*(n-1)/2
 * Each match uses 2 partnerships, so matches = partnerships / 2.
 * But we also need partnerships to not overlap within a match.
 *
 * For 4 players: 3 matches
 * For 5 players: 5 matches (with one bye per match)
 * For 6 players: 6-7 matches (depending on algorithm)
 *
 * @param playerCount - Number of players in box
 * @returns Expected number of matches
 */
export function getExpectedMatchCount(playerCount: number): number {
  // This is a simplified calculation
  // Actual match count depends on the pairing algorithm
  const totalPairs = (playerCount * (playerCount - 1)) / 2;
  return Math.floor(totalPairs / 2);
}

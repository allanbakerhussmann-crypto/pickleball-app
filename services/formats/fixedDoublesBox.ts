/**
 * Fixed Doubles Box Generator
 *
 * Generates matches for box league format with fixed doubles teams.
 * Each team plays every other team in their box once (round robin within box).
 *
 * FILE LOCATION: services/formats/fixedDoublesBox.ts
 * VERSION: V06.00
 */

import type { Match } from '../../types/game/match';
import type { GameSettings } from '../../types/game/gameSettings';
import type { BoxSettings } from '../../types/formats/formatTypes';

// ============================================
// TYPES
// ============================================

export interface DoublesTeam {
  id: string;
  name: string;
  player1Id: string;
  player1Name: string;
  player2Id: string;
  player2Name: string;
  duprIds?: string[];
  duprRating?: number; // Average of both players
}

export interface FixedBoxConfig {
  eventType: 'tournament' | 'league' | 'meetup';
  eventId: string;
  boxNumber: number;
  teams: DoublesTeam[];
  gameSettings: GameSettings;
  weekNumber?: number;
}

export interface FixedBoxResult {
  matches: Omit<Match, 'id' | 'createdAt' | 'updatedAt'>[];
  schedule: FixedBoxRound[];
  totalMatches: number;
}

export interface FixedBoxRound {
  roundNumber: number;
  pairings: Array<{
    teamA: DoublesTeam;
    teamB: DoublesTeam | null; // null = bye
  }>;
}

// ============================================
// ROUND ROBIN FOR FIXED TEAMS
// ============================================

/**
 * Generate round robin pairings for fixed doubles teams
 * Uses circle method (same as regular round robin)
 *
 * @param teams - Array of fixed doubles teams
 * @returns Array of rounds with team pairings
 */
export function generateFixedTeamPairings(teams: DoublesTeam[]): FixedBoxRound[] {
  const n = teams.length;

  if (n < 2) {
    return [];
  }

  // Copy teams to avoid mutation
  const slots: (DoublesTeam | null)[] = [...teams];

  // Add bye slot if odd number of teams
  if (n % 2 === 1) {
    slots.push(null);
  }

  const numSlots = slots.length;
  const numRounds = numSlots - 1;
  const rounds: FixedBoxRound[] = [];

  for (let round = 0; round < numRounds; round++) {
    const pairings: FixedBoxRound['pairings'] = [];

    // Pair slots: (0, n-1), (1, n-2), etc.
    for (let i = 0; i < numSlots / 2; i++) {
      const teamA = slots[i];
      const teamB = slots[numSlots - 1 - i];

      if (teamA !== null || teamB !== null) {
        pairings.push({
          teamA: teamA!,
          teamB: teamB,
        });
      }
    }

    rounds.push({
      roundNumber: round + 1,
      pairings,
    });

    // Rotate: keep slot 0 fixed, rotate others
    const last = slots.pop()!;
    slots.splice(1, 0, last);
  }

  return rounds;
}

/**
 * Generate matches for a fixed doubles box
 *
 * @param config - Box configuration
 * @returns Generated matches and schedule
 */
export function generateFixedDoublesBoxMatches(config: FixedBoxConfig): FixedBoxResult {
  const { eventType, eventId, boxNumber, teams, gameSettings, weekNumber } = config;

  // Sort teams by average DUPR rating for seeding
  const sortedTeams = [...teams].sort((a, b) => {
    const ratingA = a.duprRating ?? 0;
    const ratingB = b.duprRating ?? 0;
    return ratingB - ratingA;
  });

  // Generate round robin schedule
  const schedule = generateFixedTeamPairings(sortedTeams);

  // Convert to matches
  const matches: Omit<Match, 'id' | 'createdAt' | 'updatedAt'>[] = [];
  let matchNumber = 1;

  for (const round of schedule) {
    for (const pairing of round.pairings) {
      // Skip byes
      if (!pairing.teamA || !pairing.teamB) {
        continue;
      }

      const match: Omit<Match, 'id' | 'createdAt' | 'updatedAt'> = {
        eventType,
        eventId,
        format: 'fixed_doubles_box',
        gameSettings,
        sideA: {
          id: pairing.teamA.id,
          name: pairing.teamA.name,
          playerIds: [pairing.teamA.player1Id, pairing.teamA.player2Id],
          duprIds: pairing.teamA.duprIds,
          duprRating: pairing.teamA.duprRating,
        },
        sideB: {
          id: pairing.teamB.id,
          name: pairing.teamB.name,
          playerIds: [pairing.teamB.player1Id, pairing.teamB.player2Id],
          duprIds: pairing.teamB.duprIds,
          duprRating: pairing.teamB.duprRating,
        },
        boxNumber,
        weekNumber,
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
    schedule,
    totalMatches: matches.length,
  };
}

// ============================================
// BOX STANDINGS (TEAM-BASED)
// ============================================

export interface BoxTeamStanding {
  team: DoublesTeam;
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
 * Calculate team standings within a fixed doubles box
 *
 * @param teams - Teams in the box
 * @param matches - Completed matches
 * @returns Sorted standings
 */
export function calculateFixedBoxTeamStandings(
  teams: DoublesTeam[],
  matches: Match[]
): BoxTeamStanding[] {
  // Initialize standings
  const standingsMap = new Map<string, BoxTeamStanding>();

  for (const team of teams) {
    standingsMap.set(team.id, {
      team,
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

  // Process completed matches
  for (const match of matches) {
    if (match.status !== 'completed' || !match.winnerId) continue;

    const standingA = standingsMap.get(match.sideA.id);
    const standingB = standingsMap.get(match.sideB.id);

    if (!standingA || !standingB) continue;

    // Update matches played
    standingA.matchesPlayed++;
    standingB.matchesPlayed++;

    // Update wins/losses
    if (match.winnerId === match.sideA.id) {
      standingA.wins++;
      standingB.losses++;
    } else {
      standingB.wins++;
      standingA.losses++;
    }

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

    standingA.gamesWon += gamesA;
    standingA.gamesLost += gamesB;
    standingA.pointsFor += pointsA;
    standingA.pointsAgainst += pointsB;

    standingB.gamesWon += gamesB;
    standingB.gamesLost += gamesA;
    standingB.pointsFor += pointsB;
    standingB.pointsAgainst += pointsA;
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
// PROMOTION/RELEGATION
// ============================================

export interface PromotionRelegationResult {
  promoting: DoublesTeam[];
  staying: DoublesTeam[];
  relegating: DoublesTeam[];
}

/**
 * Determine promotion and relegation based on standings
 *
 * @param standings - Sorted team standings
 * @param settings - Box settings with promotion/relegation counts
 * @returns Teams grouped by promotion/relegation status
 */
export function determinePromotionRelegation(
  standings: BoxTeamStanding[],
  settings: BoxSettings
): PromotionRelegationResult {
  const { promotionCount, relegationCount } = settings;

  const promoting = standings.slice(0, promotionCount).map(s => s.team);
  const relegating = standings.slice(-relegationCount).map(s => s.team);
  const staying = standings
    .slice(promotionCount, standings.length - relegationCount)
    .map(s => s.team);

  return { promoting, staying, relegating };
}

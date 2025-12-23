/**
 * Ladder Format Generator
 *
 * Manages ladder-style competition where players challenge others
 * ranked above them. Winners swap positions.
 *
 * FILE LOCATION: services/formats/ladder.ts
 * VERSION: V06.00
 */

import type { Match } from '../../types/game/match';
import type { GameSettings } from '../../types/game/gameSettings';
import type { LadderSettings } from '../../types/formats/formatTypes';

// ============================================
// TYPES
// ============================================

export interface LadderPlayer {
  id: string;
  name: string;
  playerIds: string[];
  duprIds?: string[];
  duprRating?: number;
  rank: number;
  wins: number;
  losses: number;
  activeChallenges: number;
  lastChallengeDate?: number;
}

export interface LadderChallenge {
  id: string;
  challengerId: string;
  challengerName: string;
  challengerRank: number;
  defenderId: string;
  defenderName: string;
  defenderRank: number;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'completed';
  createdAt: number;
  responseDeadline: number;
  matchId?: string;
}

export interface LadderConfig {
  eventType: 'tournament' | 'league' | 'meetup';
  eventId: string;
  players: LadderPlayer[];
  gameSettings: GameSettings;
  formatSettings: LadderSettings;
}

// ============================================
// LADDER INITIALIZATION
// ============================================

/**
 * Initialize ladder rankings from participants
 * Rankings based on DUPR rating (highest = rank 1)
 *
 * @param players - Unranked players
 * @returns Players with initial rankings
 */
export function initializeLadderRankings(
  players: Omit<LadderPlayer, 'rank' | 'wins' | 'losses' | 'activeChallenges'>[]
): LadderPlayer[] {
  // Sort by DUPR (highest first)
  const sorted = [...players].sort((a, b) => {
    const ratingA = a.duprRating ?? 0;
    const ratingB = b.duprRating ?? 0;
    return ratingB - ratingA;
  });

  // Assign ranks
  return sorted.map((player, index) => ({
    ...player,
    rank: index + 1,
    wins: 0,
    losses: 0,
    activeChallenges: 0,
  }));
}

// ============================================
// CHALLENGE VALIDATION
// ============================================

export interface ChallengeValidation {
  valid: boolean;
  error?: string;
}

/**
 * Validate if a challenge can be issued
 *
 * Rules:
 * - Can only challenge players ranked above you
 * - Must be within challenge range
 * - Can't exceed max active challenges
 * - Cooldown period between challenging same player
 *
 * @param challenger - Player issuing challenge
 * @param defender - Player being challenged
 * @param settings - Ladder settings
 * @param existingChallenges - Current active challenges
 * @returns Validation result
 */
export function validateChallenge(
  challenger: LadderPlayer,
  defender: LadderPlayer,
  settings: LadderSettings,
  existingChallenges: LadderChallenge[]
): ChallengeValidation {
  const { challengeRange, maxActiveChallenges, rechallengeCooldownDays } = settings;

  // Can't challenge yourself
  if (challenger.id === defender.id) {
    return { valid: false, error: "You can't challenge yourself" };
  }

  // Can only challenge higher ranked players
  if (challenger.rank <= defender.rank) {
    return { valid: false, error: 'You can only challenge players ranked above you' };
  }

  // Check challenge range
  const rankDifference = challenger.rank - defender.rank;
  if (rankDifference > challengeRange) {
    return {
      valid: false,
      error: `You can only challenge players within ${challengeRange} ranks above you`,
    };
  }

  // Check max active challenges for challenger
  const challengerActiveChallenges = existingChallenges.filter(
    c => c.challengerId === challenger.id && (c.status === 'pending' || c.status === 'accepted')
  );
  if (challengerActiveChallenges.length >= maxActiveChallenges) {
    return {
      valid: false,
      error: `You already have ${maxActiveChallenges} active challenges`,
    };
  }

  // Check if defender already has pending challenge
  const defenderPending = existingChallenges.some(
    c => c.defenderId === defender.id && c.status === 'pending'
  );
  if (defenderPending) {
    return { valid: false, error: 'This player already has a pending challenge' };
  }

  // Check rechallenge cooldown
  const recentChallenge = existingChallenges.find(
    c =>
      c.challengerId === challenger.id &&
      c.defenderId === defender.id &&
      c.status === 'completed' &&
      c.createdAt > Date.now() - rechallengeCooldownDays * 24 * 60 * 60 * 1000
  );
  if (recentChallenge) {
    return {
      valid: false,
      error: `You must wait ${rechallengeCooldownDays} days before rechallenging this player`,
    };
  }

  return { valid: true };
}

// ============================================
// CHALLENGE CREATION
// ============================================

/**
 * Create a new challenge
 *
 * @param challenger - Player issuing challenge
 * @param defender - Player being challenged
 * @param settings - Ladder settings
 * @returns New challenge object
 */
export function createChallenge(
  challenger: LadderPlayer,
  defender: LadderPlayer,
  settings: LadderSettings
): Omit<LadderChallenge, 'id'> {
  const now = Date.now();
  const responseDeadline = now + settings.responseDeadlineDays * 24 * 60 * 60 * 1000;

  return {
    challengerId: challenger.id,
    challengerName: challenger.name,
    challengerRank: challenger.rank,
    defenderId: defender.id,
    defenderName: defender.name,
    defenderRank: defender.rank,
    status: 'pending',
    createdAt: now,
    responseDeadline,
  };
}

// ============================================
// MATCH CREATION
// ============================================

/**
 * Create a match from an accepted challenge
 *
 * @param challenge - Accepted challenge
 * @param config - Ladder configuration
 * @returns Match object
 */
export function createChallengeMatch(
  challenge: LadderChallenge,
  config: LadderConfig
): Omit<Match, 'id' | 'createdAt' | 'updatedAt'> {
  const { eventType, eventId, players, gameSettings } = config;

  const challenger = players.find(p => p.id === challenge.challengerId);
  const defender = players.find(p => p.id === challenge.defenderId);

  if (!challenger || !defender) {
    throw new Error('Challenge participants not found');
  }

  return {
    eventType,
    eventId,
    format: 'ladder',
    gameSettings,
    sideA: {
      id: challenger.id,
      name: challenger.name,
      playerIds: challenger.playerIds,
      duprIds: challenger.duprIds,
      duprRating: challenger.duprRating,
    },
    sideB: {
      id: defender.id,
      name: defender.name,
      playerIds: defender.playerIds,
      duprIds: defender.duprIds,
      duprRating: defender.duprRating,
    },
    status: 'scheduled',
    scores: [],
  };
}

// ============================================
// RANK ADJUSTMENT
// ============================================

export interface RankAdjustment {
  playerId: string;
  oldRank: number;
  newRank: number;
}

/**
 * Process match result and adjust rankings
 *
 * If challenger wins: They take defender's rank, everyone between shifts down
 * If defender wins: No rank changes
 *
 * @param winner - Winner of the match
 * @param loser - Loser of the match
 * @param players - All ladder players
 * @param challengerWon - Did the challenger win?
 * @returns Updated players and rank adjustments
 */
export function processLadderResult(
  winner: LadderPlayer,
  loser: LadderPlayer,
  players: LadderPlayer[],
  challengerWon: boolean
): { updatedPlayers: LadderPlayer[]; adjustments: RankAdjustment[] } {
  const adjustments: RankAdjustment[] = [];

  // Update win/loss records
  const updated = players.map(p => {
    if (p.id === winner.id) {
      return { ...p, wins: p.wins + 1 };
    }
    if (p.id === loser.id) {
      return { ...p, losses: p.losses + 1 };
    }
    return { ...p };
  });

  // If defender won, no rank changes
  if (!challengerWon) {
    return { updatedPlayers: updated, adjustments: [] };
  }

  // Challenger won - they take defender's rank
  const challengerOldRank = winner.rank;
  const defenderRank = loser.rank;

  // Adjust ranks
  const result = updated.map(p => {
    if (p.id === winner.id) {
      // Challenger moves up to defender's rank
      adjustments.push({
        playerId: p.id,
        oldRank: challengerOldRank,
        newRank: defenderRank,
      });
      return { ...p, rank: defenderRank };
    }

    // Players between defender and challenger shift down by 1
    if (p.rank >= defenderRank && p.rank < challengerOldRank) {
      const oldRank = p.rank;
      const newRank = p.rank + 1;
      adjustments.push({
        playerId: p.id,
        oldRank,
        newRank,
      });
      return { ...p, rank: newRank };
    }

    return p;
  });

  return { updatedPlayers: result, adjustments };
}

// ============================================
// LADDER QUERIES
// ============================================

/**
 * Get valid challenge targets for a player
 *
 * @param player - Player looking to challenge
 * @param allPlayers - All ladder players
 * @param settings - Ladder settings
 * @param existingChallenges - Current challenges
 * @returns List of valid targets
 */
export function getValidChallengeTargets(
  player: LadderPlayer,
  allPlayers: LadderPlayer[],
  settings: LadderSettings,
  existingChallenges: LadderChallenge[]
): LadderPlayer[] {
  return allPlayers.filter(target => {
    const validation = validateChallenge(player, target, settings, existingChallenges);
    return validation.valid;
  });
}

/**
 * Get ladder standings sorted by rank
 *
 * @param players - All ladder players
 * @returns Sorted by rank ascending
 */
export function getLadderStandings(players: LadderPlayer[]): LadderPlayer[] {
  return [...players].sort((a, b) => a.rank - b.rank);
}

/**
 * Check and expire old challenges
 *
 * @param challenges - All challenges
 * @param now - Current timestamp
 * @returns Updated challenges with expired status
 */
export function expireOldChallenges(
  challenges: LadderChallenge[],
  now: number = Date.now()
): LadderChallenge[] {
  return challenges.map(c => {
    if (c.status === 'pending' && c.responseDeadline < now) {
      return { ...c, status: 'expired' as const };
    }
    return c;
  });
}

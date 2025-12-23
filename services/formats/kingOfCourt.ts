/**
 * King of the Court Format Generator
 *
 * Manages king of the court style play where winners stay on
 * and challengers rotate through.
 *
 * FILE LOCATION: services/formats/kingOfCourt.ts
 * VERSION: V06.00
 */

import type { Match } from '../../types/game/match';
import type { GameSettings } from '../../types/game/gameSettings';
import type { KingOfCourtSettings } from '../../types/formats/formatTypes';

// ============================================
// TYPES
// ============================================

export interface KingPlayer {
  id: string;
  name: string;
  playerIds: string[];
  duprIds?: string[];
  duprRating?: number;
  gamesPlayed: number;
  gamesWon: number;
  pointsScored: number;
  consecutiveWins: number;
  isOnCourt: boolean;
  queuePosition?: number;
}

export interface CourtState {
  courtId: string;
  king: KingPlayer | null;
  challenger: KingPlayer | null;
  matchInProgress: boolean;
  matchNumber: number;
}

export interface KingOfCourtConfig {
  eventType: 'tournament' | 'league' | 'meetup';
  eventId: string;
  players: KingPlayer[];
  gameSettings: GameSettings;
  formatSettings: KingOfCourtSettings;
  courts: string[];
}

export interface KingOfCourtState {
  courts: CourtState[];
  queue: KingPlayer[];
  matchHistory: Match[];
  totalMatchesPlayed: number;
}

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize King of the Court state
 *
 * @param config - Configuration
 * @returns Initial state
 */
export function initializeKingOfCourt(config: KingOfCourtConfig): KingOfCourtState {
  const { players, formatSettings, courts } = config;

  // Sort by DUPR rating for initial placement
  const sortedPlayers = [...players]
    .sort((a, b) => (b.duprRating ?? 0) - (a.duprRating ?? 0))
    .map(p => ({
      ...p,
      gamesPlayed: 0,
      gamesWon: 0,
      pointsScored: 0,
      consecutiveWins: 0,
      isOnCourt: false,
    }));

  // Initialize courts
  const courtStates: CourtState[] = courts.map(courtId => ({
    courtId,
    king: null,
    challenger: null,
    matchInProgress: false,
    matchNumber: 0,
  }));

  // Create queue (everyone starts in queue)
  const queue: KingPlayer[] = sortedPlayers.map((p, i) => ({
    ...p,
    queuePosition: i + 1,
  }));

  return {
    courts: courtStates,
    queue,
    matchHistory: [],
    totalMatchesPlayed: 0,
  };
}

// ============================================
// MATCH MANAGEMENT
// ============================================

/**
 * Start next match on an available court
 *
 * @param state - Current state
 * @param courtId - Court to use
 * @param config - Configuration
 * @returns Updated state and new match (if started)
 */
export function startNextMatch(
  state: KingOfCourtState,
  courtId: string,
  config: KingOfCourtConfig
): { state: KingOfCourtState; match?: Omit<Match, 'id' | 'createdAt' | 'updatedAt'> } {
  const court = state.courts.find(c => c.courtId === courtId);
  if (!court || court.matchInProgress) {
    return { state };
  }

  // Need at least 2 players in queue (or 1 if there's already a king)
  const neededFromQueue = court.king ? 1 : 2;
  if (state.queue.length < neededFromQueue) {
    return { state };
  }

  // Get players for this match
  let king: KingPlayer;
  let challenger: KingPlayer;

  if (court.king) {
    // King stays, challenger from queue
    king = court.king;
    challenger = state.queue[0];
  } else {
    // Both from queue
    king = state.queue[0];
    challenger = state.queue[1];
  }

  // Update queue
  const newQueue = court.king ? state.queue.slice(1) : state.queue.slice(2);

  // Update queue positions
  newQueue.forEach((p, i) => {
    p.queuePosition = i + 1;
  });

  // Update player states
  king.isOnCourt = true;
  king.queuePosition = undefined;
  challenger.isOnCourt = true;
  challenger.queuePosition = undefined;

  // Update court
  const matchNumber = state.totalMatchesPlayed + 1;
  const updatedCourt: CourtState = {
    ...court,
    king,
    challenger,
    matchInProgress: true,
    matchNumber,
  };

  // Create match
  const match: Omit<Match, 'id' | 'createdAt' | 'updatedAt'> = {
    eventType: config.eventType,
    eventId: config.eventId,
    format: 'king_of_court',
    gameSettings: {
      ...config.gameSettings,
      // King of court usually uses shorter games
      pointsPerGame: config.formatSettings.pointsToWin as 11 | 15 | 21,
      bestOf: 1,
    },
    sideA: {
      id: king.id,
      name: king.name,
      playerIds: king.playerIds,
      duprIds: king.duprIds,
      duprRating: king.duprRating,
    },
    sideB: {
      id: challenger.id,
      name: challenger.name,
      playerIds: challenger.playerIds,
      duprIds: challenger.duprIds,
      duprRating: challenger.duprRating,
    },
    court: courtId,
    matchNumber,
    status: 'in_progress',
    scores: [],
  };

  return {
    state: {
      ...state,
      courts: state.courts.map(c => (c.courtId === courtId ? updatedCourt : c)),
      queue: newQueue,
      totalMatchesPlayed: matchNumber,
    },
    match,
  };
}

/**
 * Record match result
 *
 * @param state - Current state
 * @param courtId - Court where match was played
 * @param winnerId - ID of winning player
 * @param scores - Game scores
 * @param config - Configuration
 * @returns Updated state
 */
export function recordMatchResult(
  state: KingOfCourtState,
  courtId: string,
  winnerId: string,
  scores: { scoreA: number; scoreB: number }[],
  config: KingOfCourtConfig
): KingOfCourtState {
  const court = state.courts.find(c => c.courtId === courtId);
  if (!court || !court.king || !court.challenger) {
    return state;
  }

  const king = court.king;
  const challenger = court.challenger;
  const kingWon = winnerId === king.id;

  // Calculate points scored
  const kingPoints = scores.reduce((sum, g) => sum + g.scoreA, 0);
  const challengerPoints = scores.reduce((sum, g) => sum + g.scoreB, 0);

  // Update player stats
  king.gamesPlayed++;
  king.pointsScored += kingPoints;
  challenger.gamesPlayed++;
  challenger.pointsScored += challengerPoints;

  let newKing: KingPlayer;
  let loser: KingPlayer;

  if (kingWon) {
    king.gamesWon++;
    king.consecutiveWins++;
    newKing = king;
    loser = challenger;
    loser.consecutiveWins = 0;
  } else {
    challenger.gamesWon++;
    challenger.consecutiveWins = 1;
    newKing = challenger;
    loser = king;
    loser.consecutiveWins = 0;
  }

  // Check if king should rotate out (max consecutive wins)
  const { maxConsecutiveWins } = config.formatSettings;
  if (maxConsecutiveWins && newKing.consecutiveWins >= maxConsecutiveWins) {
    // King rotates out, goes to back of queue
    loser.isOnCourt = false;
    loser.queuePosition = state.queue.length + 2;
    newKing.isOnCourt = false;
    newKing.queuePosition = state.queue.length + 1;
    newKing.consecutiveWins = 0;

    return {
      ...state,
      courts: state.courts.map(c =>
        c.courtId === courtId
          ? {
              ...c,
              king: null,
              challenger: null,
              matchInProgress: false,
            }
          : c
      ),
      queue: [...state.queue, newKing, loser],
    };
  }

  // Normal case: loser goes to back of queue
  loser.isOnCourt = false;
  loser.queuePosition = state.queue.length + 1;

  return {
    ...state,
    courts: state.courts.map(c =>
      c.courtId === courtId
        ? {
            ...c,
            king: newKing,
            challenger: null,
            matchInProgress: false,
          }
        : c
    ),
    queue: [...state.queue, loser],
  };
}

// ============================================
// STANDINGS
// ============================================

export interface KingOfCourtStanding {
  player: KingPlayer;
  rank: number;
  gamesPlayed: number;
  gamesWon: number;
  winRate: number;
  pointsScored: number;
  pointsPerGame: number;
}

/**
 * Calculate King of the Court standings
 *
 * Ranked by: wins, then win rate, then points per game
 *
 * @param players - All players
 * @returns Sorted standings
 */
export function calculateKingOfCourtStandings(players: KingPlayer[]): KingOfCourtStanding[] {
  const standings: KingOfCourtStanding[] = players.map(player => ({
    player,
    rank: 0,
    gamesPlayed: player.gamesPlayed,
    gamesWon: player.gamesWon,
    winRate: player.gamesPlayed > 0 ? player.gamesWon / player.gamesPlayed : 0,
    pointsScored: player.pointsScored,
    pointsPerGame: player.gamesPlayed > 0 ? player.pointsScored / player.gamesPlayed : 0,
  }));

  // Sort
  standings.sort((a, b) => {
    // 1. Games won
    if (b.gamesWon !== a.gamesWon) return b.gamesWon - a.gamesWon;

    // 2. Win rate
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;

    // 3. Points per game
    return b.pointsPerGame - a.pointsPerGame;
  });

  // Assign ranks
  standings.forEach((s, i) => {
    s.rank = i + 1;
  });

  return standings;
}

// ============================================
// HELPERS
// ============================================

/**
 * Get current queue order
 *
 * @param state - Current state
 * @returns Queue sorted by position
 */
export function getQueue(state: KingOfCourtState): KingPlayer[] {
  return [...state.queue].sort((a, b) => (a.queuePosition ?? 0) - (b.queuePosition ?? 0));
}

/**
 * Get active matches on all courts
 *
 * @param state - Current state
 * @returns Courts with active matches
 */
export function getActiveMatches(state: KingOfCourtState): CourtState[] {
  return state.courts.filter(c => c.matchInProgress);
}

/**
 * Check if all matches are complete
 *
 * @param state - Current state
 * @returns True if no active matches
 */
export function isSessionComplete(state: KingOfCourtState): boolean {
  return state.courts.every(c => !c.matchInProgress);
}

/**
 * Score Validation Service
 *
 * Universal score validation for ALL match types.
 * Replaces duplicate validation logic in BoxLeagueScoreModal,
 * LeagueScoreEntryModal, and MeetupScoring.
 *
 * FILE LOCATION: services/game/scoreValidation.ts
 * VERSION: V06.00
 */

import type { GameSettings } from '../../types/game/gameSettings';
import type { GameScore } from '../../types/game/match';

// ============================================
// TYPES
// ============================================

export interface ValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
}

export interface MatchWinnerResult {
  /** Winner: 'sideA', 'sideB', or null if no winner yet */
  winnerId: 'sideA' | 'sideB' | null;
  /** Games won by Side A */
  gamesA: number;
  /** Games won by Side B */
  gamesB: number;
  /** Total points scored by Side A */
  pointsA: number;
  /** Total points scored by Side B */
  pointsB: number;
}

// ============================================
// SINGLE GAME VALIDATION
// ============================================

/**
 * Validate a single game score
 *
 * @param scoreA - Score for Side A
 * @param scoreB - Score for Side B
 * @param settings - Game settings (pointsPerGame, winBy, capAt)
 * @returns Validation result with valid flag and optional error message
 */
export function validateGameScore(
  scoreA: number,
  scoreB: number,
  settings: GameSettings
): ValidationResult {
  const { pointsPerGame, winBy, capAt } = settings;

  // Basic validation - non-negative integers
  if (scoreA < 0 || scoreB < 0) {
    return { valid: false, error: 'Scores cannot be negative' };
  }

  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB)) {
    return { valid: false, error: 'Scores must be whole numbers' };
  }

  // No ties allowed
  if (scoreA === scoreB) {
    return { valid: false, error: 'Game cannot end in a tie' };
  }

  const maxScore = Math.max(scoreA, scoreB);
  const minScore = Math.min(scoreA, scoreB);
  const margin = maxScore - minScore;

  // Check if someone reached the target
  if (maxScore < pointsPerGame) {
    return {
      valid: false,
      error: `Winner must reach at least ${pointsPerGame} points`,
    };
  }

  // Win-by validation
  if (winBy === 2) {
    // Standard case: winner reaches target with required margin
    if (maxScore === pointsPerGame && margin < 2) {
      return {
        valid: false,
        error: `Score ${maxScore}-${minScore} invalid. At ${pointsPerGame} points, must win by 2 (e.g., ${pointsPerGame}-${pointsPerGame - 2})`
      };
    }

    // Deuce scenario: if over target, margin must be exactly 2
    // Unless we hit the cap
    if (maxScore > pointsPerGame) {
      const isAtCap = capAt && maxScore === capAt;
      if (!isAtCap && margin !== 2) {
        // Provide helpful examples based on the loser's score
        const validWinnerScore = minScore + 2;
        const validLoserScore = maxScore - 2;
        return {
          valid: false,
          error: `Score ${maxScore}-${minScore} invalid. In deuce (past ${pointsPerGame}), must win by exactly 2. Valid: ${validWinnerScore}-${minScore} or ${maxScore}-${validLoserScore}`
        };
      }
    }
  }

  // Cap validation
  if (capAt && maxScore > capAt) {
    return { valid: false, error: `Score cannot exceed cap of ${capAt}` };
  }

  // Check for impossible scores (too high without reaching win condition earlier)
  if (winBy === 1 && maxScore > pointsPerGame) {
    return {
      valid: false,
      error: `Game should have ended at ${pointsPerGame} with win-by-1`,
    };
  }

  return { valid: true };
}

// ============================================
// MATCH VALIDATION (MULTIPLE GAMES)
// ============================================

/**
 * Validate all games in a match
 *
 * @param scores - Array of game scores
 * @param settings - Game settings
 * @returns Validation result
 */
export function validateMatchScores(
  scores: GameScore[],
  settings: GameSettings
): ValidationResult {
  // At least one game required
  if (!scores || scores.length === 0) {
    return { valid: false, error: 'At least one game score is required' };
  }

  // Validate each game individually
  for (let i = 0; i < scores.length; i++) {
    const game = scores[i];
    const result = validateGameScore(game.scoreA, game.scoreB, settings);
    if (!result.valid) {
      return { valid: false, error: `Game ${i + 1}: ${result.error}` };
    }
  }

  // Check if match is complete (someone won enough games)
  const { winnerId, gamesA, gamesB } = calculateMatchWinner(scores, settings);
  const gamesNeeded = Math.ceil(settings.bestOf / 2);

  if (!winnerId) {
    return {
      valid: false,
      error: `Match not complete. Score: ${gamesA}-${gamesB}, need ${gamesNeeded} games to win`,
    };
  }

  // Check for extra games played after match was decided
  const maxGames = settings.bestOf;
  if (scores.length > maxGames) {
    return {
      valid: false,
      error: `Too many games. Best of ${settings.bestOf} allows maximum ${maxGames} games`,
    };
  }

  // Check if games were played after match was already decided
  const warnings: string[] = [];
  let aWins = 0;
  let bWins = 0;
  for (let i = 0; i < scores.length; i++) {
    const game = scores[i];
    if (game.scoreA > game.scoreB) aWins++;
    else bWins++;

    // Check if match was decided before this game
    if (i < scores.length - 1) {
      if (aWins >= gamesNeeded || bWins >= gamesNeeded) {
        warnings.push(`Match was decided after game ${i + 1}, but more games were recorded`);
        break;
      }
    }
  }

  return { valid: true, warnings: warnings.length > 0 ? warnings : undefined };
}

// ============================================
// WINNER CALCULATION
// ============================================

/**
 * Calculate the match winner from game scores
 *
 * @param scores - Array of game scores
 * @param settings - Game settings (for bestOf)
 * @returns Winner result with game counts and point totals
 */
export function calculateMatchWinner(
  scores: GameScore[],
  settings: GameSettings
): MatchWinnerResult {
  if (!scores || scores.length === 0) {
    return { winnerId: null, gamesA: 0, gamesB: 0, pointsA: 0, pointsB: 0 };
  }

  let gamesA = 0;
  let gamesB = 0;
  let pointsA = 0;
  let pointsB = 0;

  for (const game of scores) {
    pointsA += game.scoreA;
    pointsB += game.scoreB;

    if (game.scoreA > game.scoreB) {
      gamesA++;
    } else if (game.scoreB > game.scoreA) {
      gamesB++;
    }
  }

  const gamesNeeded = Math.ceil(settings.bestOf / 2);

  let winnerId: 'sideA' | 'sideB' | null = null;
  if (gamesA >= gamesNeeded) {
    winnerId = 'sideA';
  } else if (gamesB >= gamesNeeded) {
    winnerId = 'sideB';
  }

  return { winnerId, gamesA, gamesB, pointsA, pointsB };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if a match needs more games to be complete
 *
 * @param scores - Current game scores
 * @param settings - Game settings
 * @returns True if more games are needed
 */
export function matchNeedsMoreGames(
  scores: GameScore[],
  settings: GameSettings
): boolean {
  const { winnerId, gamesA, gamesB } = calculateMatchWinner(scores, settings);

  // If there's already a winner, no more games needed
  if (winnerId) return false;

  // If we've played all possible games, no more needed
  if (scores.length >= settings.bestOf) return false;

  // Check if either side can still win
  const gamesNeeded = Math.ceil(settings.bestOf / 2);
  const gamesRemaining = settings.bestOf - scores.length;

  const aCanWin = gamesA + gamesRemaining >= gamesNeeded;
  const bCanWin = gamesB + gamesRemaining >= gamesNeeded;

  return aCanWin || bCanWin;
}

/**
 * Check if a match is complete
 * Requires all game scores to be valid AND someone has won enough games
 *
 * @param scores - Current game scores
 * @param settings - Game settings
 * @returns True if match is complete with valid scores
 */
export function isMatchComplete(
  scores: GameScore[],
  settings: GameSettings
): boolean {
  if (!scores || scores.length === 0) return false;

  // First, validate all game scores
  for (const game of scores) {
    const validation = validateGameScore(game.scoreA, game.scoreB, settings);
    if (!validation.valid) {
      return false; // Can't be complete if any game score is invalid
    }
  }

  // Then check if someone has won enough games
  const { winnerId } = calculateMatchWinner(scores, settings);
  return winnerId !== null;
}

/**
 * Get the number of games needed to win the match
 *
 * @param settings - Game settings
 * @returns Number of games needed to win
 */
export function getGamesNeededToWin(settings: GameSettings): number {
  return Math.ceil(settings.bestOf / 2);
}

/**
 * Calculate point differential
 *
 * @param scores - Game scores
 * @returns Point differential (positive favors Side A)
 */
export function calculatePointDifferential(scores: GameScore[]): number {
  if (!scores || scores.length === 0) return 0;

  let totalA = 0;
  let totalB = 0;

  for (const game of scores) {
    totalA += game.scoreA;
    totalB += game.scoreB;
  }

  return totalA - totalB;
}

/**
 * Format a match score for display
 * e.g., "2-1 (11-8, 9-11, 11-6)"
 *
 * @param scores - Game scores
 * @param settings - Game settings
 * @returns Formatted score string
 */
export function formatMatchScore(
  scores: GameScore[],
  settings: GameSettings
): string {
  if (!scores || scores.length === 0) return 'No score';

  const { gamesA, gamesB } = calculateMatchWinner(scores, settings);
  const gameScores = scores.map(g => `${g.scoreA}-${g.scoreB}`).join(', ');

  return `${gamesA}-${gamesB} (${gameScores})`;
}

/**
 * Create an empty game score
 *
 * @param gameNumber - The game number (1-based)
 * @returns Empty game score
 */
export function createEmptyGameScore(gameNumber: number): GameScore {
  return {
    gameNumber,
    scoreA: 0,
    scoreB: 0,
  };
}

/**
 * Get quick score buttons based on game settings
 * Returns common winning scores for easy entry
 *
 * @param settings - Game settings
 * @returns Array of common winning scores
 */
export function getQuickScoreButtons(settings: GameSettings): number[] {
  const { pointsPerGame, winBy } = settings;

  const scores: number[] = [pointsPerGame];

  // Add deuce scores if win-by-2
  if (winBy === 2) {
    scores.push(pointsPerGame + 2);
    scores.push(pointsPerGame + 4);
    if (settings.capAt) {
      scores.push(settings.capAt);
    }
  }

  return [...new Set(scores)].sort((a, b) => a - b);
}

/**
 * Game Services Index
 *
 * Re-exports all game-related services for easy importing.
 *
 * Usage:
 *   import { validateGameScore, calculateMatchWinner } from '../services/game';
 *
 * FILE LOCATION: services/game/index.ts
 * VERSION: V06.00
 */

export {
  // Types
  type ValidationResult,
  type MatchWinnerResult,

  // Single game validation
  validateGameScore,

  // Match validation
  validateMatchScores,

  // Winner calculation
  calculateMatchWinner,

  // Helper functions
  matchNeedsMoreGames,
  isMatchComplete,
  getGamesNeededToWin,
  calculatePointDifferential,
  formatMatchScore,
  createEmptyGameScore,
  getQuickScoreButtons,
} from './scoreValidation';

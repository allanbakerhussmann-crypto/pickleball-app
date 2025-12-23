/**
 * Game Types Index
 *
 * Re-exports all game-related types for easy importing.
 *
 * Usage:
 *   import { GameSettings, Match, GameScore } from '../types/game';
 *
 * FILE LOCATION: types/game/index.ts
 * VERSION: V06.00
 */

// Game settings
export {
  type PlayType,
  type PointsPerGame,
  type WinBy,
  type BestOf,
  type GameSettings,
  DEFAULT_GAME_SETTINGS,
  GAME_SETTINGS_PRESETS,
  POINTS_PER_GAME_OPTIONS,
  WIN_BY_OPTIONS,
  BEST_OF_OPTIONS,
  PLAY_TYPE_OPTIONS,
} from './gameSettings';

// Match types
export {
  type GameScore,
  type MatchStatus,
  type MatchParticipant,
  type EventType,
  type Match,
  isMatchCompleted,
  hasWinner,
  isBye,
  isParticipant,
  getUserSide,
} from './match';

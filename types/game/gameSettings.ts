/**
 * Game Settings Types
 *
 * Universal game/match settings that apply to ALL pickleball matches
 * regardless of event type (Tournament, League, Meetup) or format.
 *
 * FILE LOCATION: types/game/gameSettings.ts
 * VERSION: V06.00
 */

// ============================================
// PLAY TYPE
// ============================================

/**
 * Type of play
 * - singles: 1v1 (any gender)
 * - doubles: 2v2 (same gender pairs)
 * - mixed: 2v2 (one male + one female per team)
 * - open: 2v2 (any gender combination)
 */
export type PlayType = 'singles' | 'doubles' | 'mixed' | 'open';

// ============================================
// SCORING OPTIONS
// ============================================

/**
 * Points needed to win a game
 * Standard pickleball is 11, but 15 and 21 are also common
 */
export type PointsPerGame = 11 | 15 | 21;

/**
 * Win-by margin
 * Must win by 1 or 2 points
 */
export type WinBy = 1 | 2;

/**
 * Best-of series format
 * Single game, best of 3, or best of 5
 */
export type BestOf = 1 | 3 | 5;

// ============================================
// GAME SETTINGS INTERFACE
// ============================================

/**
 * Universal game settings - applies to ALL matches
 *
 * This interface defines how a pickleball game/match is scored.
 * Used by tournaments, leagues, and meetups.
 */
export interface GameSettings {
  /** Singles (1v1) or Doubles (2v2) */
  playType: PlayType;

  /** Points needed to win a game (11, 15, or 21) */
  pointsPerGame: PointsPerGame;

  /** Win-by margin (1 or 2) */
  winBy: WinBy;

  /** Number of games in a match (1, 3, or 5) */
  bestOf: BestOf;

  /**
   * Optional hard cap for deuce scenarios
   * e.g., if capAt is 15, the game ends at 15-14 even with winBy: 2
   */
  capAt?: number;
}

// ============================================
// DEFAULTS & PRESETS
// ============================================

/**
 * Default game settings (most common format)
 */
export const DEFAULT_GAME_SETTINGS: GameSettings = {
  playType: 'doubles',
  pointsPerGame: 11,
  winBy: 2,
  bestOf: 1,
};

/**
 * Preset configurations for quick selection
 */
export const GAME_SETTINGS_PRESETS = {
  /** Casual play - single game to 11 */
  casual: {
    playType: 'doubles' as PlayType,
    pointsPerGame: 11 as PointsPerGame,
    winBy: 2 as WinBy,
    bestOf: 1 as BestOf,
  },

  /** Competitive - best of 3 to 11 */
  competitive: {
    playType: 'doubles' as PlayType,
    pointsPerGame: 11 as PointsPerGame,
    winBy: 2 as WinBy,
    bestOf: 3 as BestOf,
  },

  /** Tournament finals - best of 3 to 15 */
  finals: {
    playType: 'doubles' as PlayType,
    pointsPerGame: 15 as PointsPerGame,
    winBy: 2 as WinBy,
    bestOf: 3 as BestOf,
  },

  /** Championship - best of 5 to 11 */
  championship: {
    playType: 'doubles' as PlayType,
    pointsPerGame: 11 as PointsPerGame,
    winBy: 2 as WinBy,
    bestOf: 5 as BestOf,
  },
} as const;

/**
 * UI options for dropdowns
 */
export const POINTS_PER_GAME_OPTIONS: { value: PointsPerGame; label: string }[] = [
  { value: 11, label: 'Game to 11' },
  { value: 15, label: 'Game to 15' },
  { value: 21, label: 'Game to 21' },
];

export const WIN_BY_OPTIONS: { value: WinBy; label: string }[] = [
  { value: 2, label: 'Win by 2' },
  { value: 1, label: 'Win by 1' },
];

export const BEST_OF_OPTIONS: { value: BestOf; label: string }[] = [
  { value: 1, label: 'Single Game' },
  { value: 3, label: 'Best of 3' },
  { value: 5, label: 'Best of 5' },
];

export const PLAY_TYPE_OPTIONS: { value: PlayType; label: string; description?: string }[] = [
  { value: 'singles', label: 'Singles', description: '1v1 - Any gender' },
  { value: 'doubles', label: 'Doubles', description: '2v2 - Same gender pairs' },
  { value: 'mixed', label: 'Mixed Doubles', description: '2v2 - One male + one female per team' },
  { value: 'open', label: 'Open Doubles', description: '2v2 - Any gender combination' },
];

/**
 * Format Types Index
 *
 * Re-exports all format-related types for easy importing.
 *
 * Usage:
 *   import { CompetitionFormat, COMPETITION_FORMATS } from '../types/formats';
 *
 * FILE LOCATION: types/formats/index.ts
 * VERSION: V06.00
 */

export {
  // Main format type
  type CompetitionFormat,

  // Format metadata
  type FormatOption,
  COMPETITION_FORMATS,

  // Format-specific settings
  type PoolPlayMedalsSettings,
  type RoundRobinSettings,
  type BoxSettings,
  type EliminationSettings,
  type SwissSettings,
  type LadderSettings,
  type KingOfCourtSettings,
  type TeamLeagueSettings,
  type FormatSettings,

  // Default settings
  DEFAULT_POOL_PLAY_MEDALS_SETTINGS,
  DEFAULT_ROUND_ROBIN_SETTINGS,
  DEFAULT_BOX_SETTINGS,
  DEFAULT_ELIMINATION_SETTINGS,
  DEFAULT_SWISS_SETTINGS,
  DEFAULT_LADDER_SETTINGS,
  DEFAULT_KING_OF_COURT_SETTINGS,
  DEFAULT_TEAM_LEAGUE_SETTINGS,

  // Helper functions
  getFormatOption,
  getFormatsForPlayType,
  formatRequiresTeams,
  formatGeneratesMatchesUpfront,
  getDefaultFormatSettings,
} from './formatTypes';

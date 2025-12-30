/**
 * Competition Format Types
 *
 * Defines all competition formats that can be used across
 * Tournaments, Leagues, and Meetups.
 *
 * FILE LOCATION: types/formats/formatTypes.ts
 * VERSION: V06.00
 */

import type { PlayType } from '../game/gameSettings';

// ============================================
// COMPETITION FORMAT ENUM
// ============================================

/**
 * All available competition formats
 *
 * These formats are SHARED across Tournament, League, and Meetup.
 * The same dropdown appears in all event creation wizards.
 */
export type CompetitionFormat =
  | 'pool_play_medals'
  | 'round_robin'
  | 'rotating_doubles_box'
  | 'fixed_doubles_box'
  | 'singles_elimination'
  | 'doubles_elimination'
  | 'king_of_court'
  | 'team_league_interclub'
  | 'swiss'
  | 'ladder';

// ============================================
// FORMAT METADATA
// ============================================

/**
 * Metadata for each format (used in UI dropdowns)
 */
export interface FormatOption {
  /** Format identifier */
  value: CompetitionFormat;

  /** Display label */
  label: string;

  /** Short description */
  description: string;

  /** Which play types this format supports */
  supportsPlayType: PlayType[];

  /** Does this format require pre-formed teams? */
  requiresTeams?: boolean;

  /** Are all matches known at the start? */
  generatesMatchesUpfront: boolean;

  /** Icon for UI (optional) */
  icon?: string;
}

/**
 * All competition formats with metadata
 *
 * This array is used to populate format selection dropdowns
 * in CreateTournament, CreateLeague, and CreateMeetup wizards.
 */
export const COMPETITION_FORMATS: FormatOption[] = [
  {
    value: 'pool_play_medals',
    label: 'Pool Play → Medals',
    description: 'Pools then bracket with medals 🥇🥈🥉',
    supportsPlayType: ['singles', 'doubles', 'mixed', 'open'],
    generatesMatchesUpfront: false, // Bracket generated after pools complete
    icon: '🏅',
  },
  {
    value: 'round_robin',
    label: 'Round Robin',
    description: 'Everyone plays everyone',
    supportsPlayType: ['singles', 'doubles', 'mixed', 'open'],
    generatesMatchesUpfront: true,
    icon: '🔄',
  },
  {
    value: 'rotating_doubles_box',
    label: 'Rotating Doubles Box',
    description: 'Small groups, partners rotate each match',
    supportsPlayType: ['doubles', 'mixed', 'open'],
    generatesMatchesUpfront: true,
    icon: '📦',
  },
  {
    value: 'fixed_doubles_box',
    label: 'Fixed Doubles Box',
    description: 'Small groups with fixed doubles teams',
    supportsPlayType: ['doubles', 'mixed', 'open'],
    requiresTeams: true,
    generatesMatchesUpfront: true,
    icon: '📦',
  },
  {
    value: 'singles_elimination',
    label: 'Singles Elimination',
    description: 'Bracket tournament, one loss = out',
    supportsPlayType: ['singles'],
    generatesMatchesUpfront: true,
    icon: '🏆',
  },
  {
    value: 'doubles_elimination',
    label: 'Doubles Elimination',
    description: 'Bracket tournament for doubles teams',
    supportsPlayType: ['doubles', 'mixed', 'open'],
    requiresTeams: true,
    generatesMatchesUpfront: true,
    icon: '🏆',
  },
  {
    value: 'king_of_court',
    label: 'King of the Court',
    description: 'Winners stay on, challengers rotate',
    supportsPlayType: ['singles', 'doubles', 'mixed', 'open'],
    generatesMatchesUpfront: false,
    icon: '👑',
  },
  {
    value: 'team_league_interclub',
    label: 'Team League (Interclub)',
    description: 'Club vs club team matches',
    supportsPlayType: ['doubles', 'mixed', 'open'],
    requiresTeams: true,
    generatesMatchesUpfront: true,
    icon: '🏢',
  },
  {
    value: 'swiss',
    label: 'Swiss System',
    description: 'Paired by similar records each round',
    supportsPlayType: ['singles', 'doubles', 'mixed', 'open'],
    generatesMatchesUpfront: false,
    icon: '🎯',
  },
  {
    value: 'ladder',
    label: 'Ladder',
    description: 'Challenge players ranked above you',
    supportsPlayType: ['singles', 'doubles', 'mixed', 'open'],
    generatesMatchesUpfront: false,
    icon: '🪜',
  },
];

// ============================================
// FORMAT-SPECIFIC SETTINGS
// ============================================

/**
 * Settings for Round Robin format
 */
export interface RoundRobinSettings {
  /** How many times everyone plays everyone (default: 1) */
  rounds: number;

  /** Number of pools (0 = no pools, everyone together) */
  poolCount?: number;

  /** Do pools play each other after pool play? */
  crossPoolPlay?: boolean;

  /** How many advance from each pool (for playoffs) */
  advancingPerPool?: number;
}

export const DEFAULT_ROUND_ROBIN_SETTINGS: RoundRobinSettings = {
  rounds: 1,
  poolCount: 0,
  crossPoolPlay: false,
};

/**
 * Settings for Box formats (rotating & fixed doubles)
 */
export interface BoxSettings {
  /** Number of players/teams per box */
  boxSize: 4 | 5 | 6 | 7 | 8;

  /** Number of weeks in the season */
  weeksPerSeason: number;

  /** How many promote from each box */
  promotionCount: 0 | 1 | 2;

  /** How many relegate from each box */
  relegationCount: 0 | 1 | 2;
}

export const DEFAULT_BOX_SETTINGS: BoxSettings = {
  boxSize: 4,
  weeksPerSeason: 8,
  promotionCount: 1,
  relegationCount: 1,
};

/**
 * Settings for Elimination formats
 */
export interface EliminationSettings {
  /** Include a third place match? */
  thirdPlaceMatch: boolean;

  /** Include consolation bracket for first-round losers? */
  consolationBracket: boolean;

  // Note: Seeding always uses DUPR rating (no manual/random option)
}

export const DEFAULT_ELIMINATION_SETTINGS: EliminationSettings = {
  thirdPlaceMatch: false,
  consolationBracket: false,
};

/**
 * Settings for Swiss format
 */
export interface SwissSettings {
  /** Total number of rounds */
  totalRounds: number;

  /** Pairing method for similar records */
  pairingMethod: 'adjacent' | 'slide';
}

export const DEFAULT_SWISS_SETTINGS: SwissSettings = {
  totalRounds: 4,
  pairingMethod: 'slide',
};

/**
 * Settings for Ladder format
 */
export interface LadderSettings {
  /** How many positions above can you challenge? */
  challengeRange: number;

  /** Days to respond to a challenge */
  responseDeadlineDays: number;

  /** Max active challenges per player */
  maxActiveChallenges: number;

  /** Days before you can re-challenge same player */
  rechallengeCooldownDays: number;
}

export const DEFAULT_LADDER_SETTINGS: LadderSettings = {
  challengeRange: 3,
  responseDeadlineDays: 7,
  maxActiveChallenges: 2,
  rechallengeCooldownDays: 14,
};

/**
 * Settings for King of the Court format
 */
export interface KingOfCourtSettings {
  /** Points needed to win (short games) */
  pointsToWin: number;

  /** How many games as king before rotating out */
  maxConsecutiveWins?: number;

  /** Number of courts in play */
  numberOfCourts: number;
}

export const DEFAULT_KING_OF_COURT_SETTINGS: KingOfCourtSettings = {
  pointsToWin: 11,
  numberOfCourts: 1,
};

/**
 * Settings for Team League (Interclub) format
 */
export interface TeamLeagueSettings {
  /** Number of matches per team matchup */
  matchesPerTeamMatchup: number;

  /** Minimum players per team roster */
  minPlayersPerTeam: number;

  /** Maximum players per team roster */
  maxPlayersPerTeam: number;
}

export const DEFAULT_TEAM_LEAGUE_SETTINGS: TeamLeagueSettings = {
  matchesPerTeamMatchup: 5,
  minPlayersPerTeam: 4,
  maxPlayersPerTeam: 8,
};

/**
 * Settings for Pool Play → Medals format
 * The most common tournament format in pickleball
 *
 * Qualifier rules:
 * - mainQualifiersPerPool: How many from each pool go to main bracket (e.g., 2 = 1st + 2nd)
 * - plateQualifiersPerPool: How many from each pool go to plate bracket (e.g., 1 = 3rd place)
 * - includePlate: Explicit flag to enable plate bracket
 *
 * Example for 4-team pools:
 *   1st + 2nd → main bracket (mainQualifiersPerPool: 2)
 *   3rd       → plate bracket (plateQualifiersPerPool: 1, includePlate: true)
 *   4th       → eliminated
 */
export interface PoolPlayMedalsSettings {
  /** Number of participants per pool (3-6) */
  poolSize: 3 | 4 | 5 | 6;

  /** How many advance from each pool to main bracket */
  advancementRule: 'top_1' | 'top_2' | 'top_n_plus_best';

  /** For 'top_n_plus_best', how many total advance */
  advancementCount?: number;

  /** Bronze medal handling */
  bronzeMatch: 'yes' | 'shared' | 'no';

  /** Tiebreaker order for pool standings */
  tiebreakers: ('wins' | 'head_to_head' | 'point_diff' | 'points_scored')[];

  // ============================================
  // EXPLICIT QUALIFIER CONFIGURATION (V06.21)
  // ============================================

  /**
   * How many qualifiers per pool advance to main bracket.
   * E.g., 2 means 1st + 2nd from each pool → main bracket.
   * @default 2
   */
  mainQualifiersPerPool?: number;

  /**
   * How many qualifiers per pool advance to plate bracket.
   * E.g., 1 means 3rd place from each pool → plate bracket.
   * Set to 0 or omit to disable plate bracket.
   * @default 0
   */
  plateQualifiersPerPool?: number;

  /**
   * Explicit flag to include plate bracket for non-advancing teams.
   * When true, teams that don't qualify for main bracket can play for plate.
   * @default false
   */
  includePlate?: boolean;
}

export const DEFAULT_POOL_PLAY_MEDALS_SETTINGS: PoolPlayMedalsSettings = {
  poolSize: 4,
  advancementRule: 'top_2',
  bronzeMatch: 'yes',
  tiebreakers: ['wins', 'head_to_head', 'point_diff', 'points_scored'],
  // Explicit qualifier configuration
  mainQualifiersPerPool: 2,   // 1st + 2nd → main bracket
  plateQualifiersPerPool: 0,  // No plate bracket by default
  includePlate: false,
};

// ============================================
// UNION TYPE FOR ALL FORMAT SETTINGS
// ============================================

/**
 * Union of all format-specific settings
 */
export type FormatSettings =
  | { format: 'pool_play_medals'; settings: PoolPlayMedalsSettings }
  | { format: 'round_robin'; settings: RoundRobinSettings }
  | { format: 'rotating_doubles_box'; settings: BoxSettings }
  | { format: 'fixed_doubles_box'; settings: BoxSettings }
  | { format: 'singles_elimination'; settings: EliminationSettings }
  | { format: 'doubles_elimination'; settings: EliminationSettings }
  | { format: 'king_of_court'; settings: KingOfCourtSettings }
  | { format: 'team_league_interclub'; settings: TeamLeagueSettings }
  | { format: 'swiss'; settings: SwissSettings }
  | { format: 'ladder'; settings: LadderSettings };

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get format option by value
 */
export function getFormatOption(format: CompetitionFormat): FormatOption | undefined {
  return COMPETITION_FORMATS.find(f => f.value === format);
}

/**
 * Get formats that support a specific play type
 */
export function getFormatsForPlayType(playType: PlayType): FormatOption[] {
  return COMPETITION_FORMATS.filter(f => f.supportsPlayType.includes(playType));
}

/**
 * Check if format requires pre-formed teams
 */
export function formatRequiresTeams(format: CompetitionFormat): boolean {
  const option = getFormatOption(format);
  return option?.requiresTeams ?? false;
}

/**
 * Check if format generates all matches upfront
 */
export function formatGeneratesMatchesUpfront(format: CompetitionFormat): boolean {
  const option = getFormatOption(format);
  return option?.generatesMatchesUpfront ?? false;
}

/**
 * Get default settings for a format
 */
export function getDefaultFormatSettings(format: CompetitionFormat): FormatSettings {
  switch (format) {
    case 'pool_play_medals':
      return { format, settings: DEFAULT_POOL_PLAY_MEDALS_SETTINGS };
    case 'round_robin':
      return { format, settings: DEFAULT_ROUND_ROBIN_SETTINGS };
    case 'rotating_doubles_box':
    case 'fixed_doubles_box':
      return { format, settings: DEFAULT_BOX_SETTINGS };
    case 'singles_elimination':
    case 'doubles_elimination':
      return { format, settings: DEFAULT_ELIMINATION_SETTINGS };
    case 'king_of_court':
      return { format, settings: DEFAULT_KING_OF_COURT_SETTINGS };
    case 'team_league_interclub':
      return { format, settings: DEFAULT_TEAM_LEAGUE_SETTINGS };
    case 'swiss':
      return { format, settings: DEFAULT_SWISS_SETTINGS };
    case 'ladder':
      return { format, settings: DEFAULT_LADDER_SETTINGS };
  }
}

/**
 * Box League Types V05.38
 * 
 * Types for Individual Rotating Doubles Box League format.
 * 
 * KEY CONCEPT:
 * - Players are tracked as INDIVIDUALS, not teams
 * - Partners ROTATE within each box each week
 * - Each individual player's wins/points determine their rank
 * - Top players promote, bottom players relegate INDIVIDUALLY
 * 
 * FILE LOCATION: types/boxLeague.ts
 * VERSION: V05.38
 */

// ============================================
// BOX LEAGUE CONFIGURATION
// ============================================

/**
 * Box League specific settings
 */
export interface BoxLeagueSettings {
  // Box configuration
  boxSize: 4 | 5 | 6;
  
  // Match format
  gamesTo: 11 | 15 | 21;
  winBy: 1 | 2;
  
  // Promotion/Relegation
  promotionCount: 1 | 2;
  relegationCount: 1 | 2;
  
  // Seeding
  initialSeeding: 'dupr' | 'manual';
  useDuprDoublesRating: boolean;  // true for doubles rating, false for singles
  
  // Score entry
  scoreEntryMode: 'any_player' | 'winner_only' | 'organizer_only';
  confirmationRequired: boolean;
  
  // Tie-breaker order (1 = highest priority)
  tiebreakers: BoxLeagueTiebreaker[];
}

/**
 * Tie-breaker options for Box League
 */
export type BoxLeagueTiebreaker = 
  | 'wins'              // Total matches won
  | 'head_to_head'      // Head-to-head result
  | 'points_diff'       // Points for - points against
  | 'points_for'        // Total points scored
  | 'points_against';   // Least points conceded

/**
 * Default tie-breaker order
 */
/**
 * Default tie-breaker order
 */
export const DEFAULT_BOX_TIEBREAKERS: BoxLeagueTiebreaker[] = [
  'wins',
  'head_to_head',
  'points_diff',
  'points_for',
  'points_against',
];


// ============================================
// BOX LEAGUE PLAYER (INDIVIDUAL)
// ============================================

/**
 * Individual player stats for a single week
 */
export interface BoxLeagueWeeklyStats {
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  pointsFor: number;
  pointsAgainst: number;
  pointsDiff: number;
  hadBye: boolean;
}

/**
 * Individual player in the Box League
 * 
 * NOTE: This is an INDIVIDUAL player, NOT a team.
 * For doubles, the same player plays with different partners each match.
 */
export interface BoxLeaguePlayer {
  id: string;
  odUserId: string;
  displayName: string;
  email?: string;
  
  // DUPR info
  duprId?: string | null;
  duprDoublesRating?: number | null;
  duprSinglesRating?: number | null;
  
  // Current ladder position
  ladderPosition: number;      // Overall rank (1 = top of entire ladder)
  currentBoxNumber: number;    // Which box they're in (1 = top box)
  positionInBox: number;       // Rank within their box (1 = top of box)
  
  // Manual seeding (if not using DUPR)
  manualSeed?: number | null;
  
  // Cumulative stats (entire season)
  totalStats: {
    matchesPlayed: number;
    matchesWon: number;
    matchesLost: number;
    pointsFor: number;
    pointsAgainst: number;
    pointsDiff: number;
    byeCount: number;
    weeksPlayed: number;
    promotionCount: number;
    relegationCount: number;
  };
  
  // Current week stats (reset each week)
  weekStats: BoxLeagueWeeklyStats;
  
  // Status
  isActive: boolean;
  status: 'active' | 'inactive' | 'suspended' | 'withdrawn';
  
  // Payment (if paid league)
  paymentStatus: 'pending' | 'paid' | 'waived' | 'refunded';
  amountPaid?: number;
  paidAt?: number;
  
  // Timestamps
  joinedAt: number;
  lastActiveAt: number;
  updatedAt: number;
}

// ============================================
// BOX LEAGUE MATCH (ROTATING DOUBLES)
// ============================================

/**
 * Match status for Box League
 */
export type BoxLeagueMatchStatus = 
  | 'scheduled'
  | 'completed'
  | 'postponed'
  | 'cancelled'
  | 'bye';

/**
 * Individual player result within a match
 */
export interface BoxLeaguePlayerResult {
  playerId: string;
  playerName: string;
  won: boolean;
  pointsFor: number;
  pointsAgainst: number;
}

/**
 * Box League Match
 * 
 * NOTE: This is a DOUBLES match with ROTATING partners.
 * Each match has 4 individual players (2 per team).
 * All 4 players get their individual stats updated.
 */
export interface BoxLeagueMatch {
  id: string;
  leagueId: string;
  
  // Week/Box info
  weekNumber: number;
  boxNumber: number;
  matchNumberInBox: number;  // Which match within the box (1, 2, 3, etc.)
  
  // Team 1 (two individual players)
  team1Player1Id: string;
  team1Player1Name: string;
  team1Player2Id: string;
  team1Player2Name: string;
  
  // Team 2 (two individual players)
  team2Player1Id: string;
  team2Player1Name: string;
  team2Player2Id: string;
  team2Player2Name: string;
  
  // Result
  status: BoxLeagueMatchStatus;
  team1Score?: number | null;     // e.g., 11
  team2Score?: number | null;     // e.g., 7
  winningTeam?: 1 | 2 | null;
  
  // Individual player results (auto-calculated from score)
  playerResults?: BoxLeaguePlayerResult[];
  
  // Scheduling
  scheduledDate?: number | null;
  court?: string | null;
  startTime?: string | null;
  
  // Score entry tracking
  enteredByUserId?: string | null;
  enteredByName?: string | null;
  enteredAt?: number | null;
  confirmedByUserId?: string | null;
  confirmedAt?: number | null;
  
  // Postpone info
  postponedAt?: number | null;
  postponedReason?: string | null;
  rescheduledTo?: number | null;
  
  // Timestamps
  createdAt: number;
  playedAt?: number | null;
  updatedAt: number;
}

// ============================================
// BOX LEAGUE WEEK
// ============================================

/**
 * Box assignment for a week
 */
export interface BoxAssignment {
  boxNumber: number;
  playerIds: string[];
  playerNames: string[];
}

/**
 * Player movement (promotion/relegation)
 */
export interface PlayerMovement {
  playerId: string;
  playerName: string;
  fromBox: number;
  toBox: number;
  fromPosition: number;  // Position in old box
  newPosition: number;   // New ladder position
  reason: 'promotion' | 'relegation' | 'stayed';
}

/**
 * Player standing within a box for a specific week
 */
export interface BoxStanding {
  playerId: string;
  playerName: string;
  boxNumber: number;
  positionInBox: number;  // 1 = top of box
  
  // Week stats
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  pointsFor: number;
  pointsAgainst: number;
  pointsDiff: number;
  hadBye: boolean;
  
  // Movement indicator
  willPromote: boolean;
  willRelegate: boolean;
  willStay: boolean;
}

/**
 * Box League Week
 * 
 * Represents one week of play including:
 * - Box assignments at start of week
 * - All matches for the week
 * - Standings at end of week
 * - Promotions/Relegations
 */
export interface BoxLeagueWeek {
  id: string;
  leagueId: string;
  weekNumber: number;
  
  // Status
  status: 'upcoming' | 'in_progress' | 'completed' | 'postponed';
  
  // Dates
  weekStartDate: number;
  weekEndDate?: number | null;
  matchDeadline?: number | null;
  
  // Box assignments at START of week
  boxAssignments: BoxAssignment[];
  
  // Match IDs for this week (for quick lookup)
  matchIds: string[];
  totalMatches: number;
  completedMatches: number;
  
  // Standings at END of week (calculated after all matches)
  standings?: BoxStanding[];
  
  // Movements AFTER week ends
  movements?: PlayerMovement[];
  
  // Postpone info
  postponedAt?: number | null;
  postponedReason?: string | null;
  rescheduledTo?: number | null;
  
  // Processing
  processedAt?: number | null;
  processedByUserId?: string | null;
  
  // Timestamps
  createdAt: number;
  updatedAt: number;
}

// ============================================
// BOX LEAGUE MATCH PATTERNS
// ============================================

/**
 * Pre-defined rotating partner patterns for different box sizes
 * 
 * For each box size, defines which players team up for each match.
 * Players are identified by their position in the box (0-indexed).
 */
export interface RotatingPartnerPattern {
  boxSize: 4 | 5 | 6;
  matches: {
    team1: [number, number];  // Player indices for team 1
    team2: [number, number];  // Player indices for team 2
    bye?: number;             // Player index who has bye (for 5-player box)
  }[];
}

/**
 * 4-Player Box Pattern
 * 3 matches, everyone plays 3 times, with each other player exactly once as partner
 */
export const BOX_PATTERN_4: RotatingPartnerPattern = {
  boxSize: 4,
  matches: [
    { team1: [0, 1], team2: [2, 3] },  // A+B vs C+D
    { team1: [0, 2], team2: [1, 3] },  // A+C vs B+D
    { team1: [0, 3], team2: [1, 2] },  // A+D vs B+C
  ],
};

/**
 * 5-Player Box Pattern
 * 5 matches, everyone plays 4 times, sits out once
 */
export const BOX_PATTERN_5: RotatingPartnerPattern = {
  boxSize: 5,
  matches: [
    { team1: [0, 1], team2: [2, 3], bye: 4 },  // A+B vs C+D, E bye
    { team1: [0, 2], team2: [1, 4], bye: 3 },  // A+C vs B+E, D bye
    { team1: [0, 3], team2: [2, 4], bye: 1 },  // A+D vs C+E, B bye
    { team1: [0, 4], team2: [1, 3], bye: 2 },  // A+E vs B+D, C bye
    { team1: [1, 2], team2: [3, 4], bye: 0 },  // B+C vs D+E, A bye
  ],
};

/**
 * 6-Player Box Pattern
 * 15 possible pairings - typically split across 2-3 weeks
 * This is ONE week's worth (5 matches)
 */
export const BOX_PATTERN_6: RotatingPartnerPattern = {
  boxSize: 6,
  matches: [
    { team1: [0, 1], team2: [2, 3] },  // A+B vs C+D
    { team1: [4, 5], team2: [0, 2] },  // E+F vs A+C
    { team1: [1, 3], team2: [4, 0] },  // B+D vs E+A (adjusted)
    { team1: [2, 5], team2: [1, 4] },  // C+F vs B+E
    { team1: [3, 0], team2: [5, 1] },  // D+A vs F+B (adjusted)
  ],
};

// ============================================
// SCORE ENTRY TYPES
// ============================================

/**
 * Input for entering a match score
 */
export interface BoxLeagueScoreInput {
  matchId: string;
  team1Score: number;
  team2Score: number;
  enteredByUserId: string;
  enteredByName: string;
  playedAt?: number;
}

/**
 * Result of processing a score entry
 */
export interface BoxLeagueScoreResult {
  success: boolean;
  matchId: string;
  winningTeam: 1 | 2;
  playerUpdates: {
    playerId: string;
    won: boolean;
    pointsFor: number;
    pointsAgainst: number;
  }[];
  error?: string;
}

// ============================================
// WEEK PROCESSING TYPES
// ============================================

/**
 * Input for processing end of week
 */
export interface ProcessWeekInput {
  leagueId: string;
  weekNumber: number;
  processedByUserId: string;
}

/**
 * Result of processing end of week
 */
export interface ProcessWeekResult {
  success: boolean;
  weekNumber: number;
  standings: BoxStanding[];
  movements: PlayerMovement[];
  nextWeekCreated: boolean;
  error?: string;
}

// ============================================
// GENERATION TYPES
// ============================================

/**
 * Input for generating box league schedule
 */
export interface GenerateBoxLeagueInput {
  leagueId: string;
  players: BoxLeaguePlayer[];
  settings: BoxLeagueSettings;
  numberOfWeeks: number;
  startDate: number;
}

/**
 * Result of schedule generation
 */
export interface GenerateBoxLeagueResult {
  success: boolean;
  weeksCreated: number;
  matchesCreated: number;
  boxAssignments: BoxAssignment[];
  error?: string;
}

// ============================================
// UTILITY TYPES
// ============================================

/**
 * Get box pattern for a given size
 */
export function getBoxPattern(boxSize: 4 | 5 | 6): RotatingPartnerPattern {
  switch (boxSize) {
    case 4: return BOX_PATTERN_4;
    case 5: return BOX_PATTERN_5;
    case 6: return BOX_PATTERN_6;
  }
}

/**
 * Calculate number of matches per week for a box size
 */
export function getMatchesPerBox(boxSize: 4 | 5 | 6): number {
  switch (boxSize) {
    case 4: return 3;
    case 5: return 5;
    case 6: return 5;  // Per week (full round robin = 15 matches over 3 weeks)
  }
}

/**
 * Calculate matches per player per week
 */
export function getMatchesPerPlayer(boxSize: 4 | 5 | 6): number {
  switch (boxSize) {
    case 4: return 3;  // No byes
    case 5: return 4;  // 1 bye
    case 6: return 5;  // No byes in single week
  }
}
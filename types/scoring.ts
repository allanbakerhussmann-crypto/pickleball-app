/**
 * Universal Scoring System Types
 *
 * Supports traditional side-out scoring for pickleball.
 * Used for tournaments, leagues, meetups, and standalone games.
 *
 * FILE: types/scoring.ts
 * VERSION: V06.03
 */

// =============================================================================
// GAME SETTINGS
// =============================================================================

export type PlayType = 'singles' | 'doubles';
export type PointsPerGame = 11 | 15 | 21;
export type WinBy = 1 | 2;
export type BestOf = 1 | 3 | 5;

export interface ScoringSettings {
  playType: PlayType;
  pointsPerGame: PointsPerGame;
  winBy: WinBy;
  bestOf: BestOf;
  /** Switch sides at this score (default: halfway point) */
  switchSidesAt?: number;
  /** Use traditional side-out scoring (only serving team scores) */
  sideOutScoring: boolean;
}

export const DEFAULT_SCORING_SETTINGS: ScoringSettings = {
  playType: 'doubles',
  pointsPerGame: 11,
  winBy: 2,
  bestOf: 1,
  sideOutScoring: true,
};

// =============================================================================
// TEAM / PLAYER
// =============================================================================

export interface ScoringTeam {
  id?: string;
  name: string;
  color: string;
  /** Player names for display */
  players?: string[];
  /** Player user IDs if logged in */
  playerIds?: string[];
}

// =============================================================================
// GAME SCORE
// =============================================================================

export interface GameScore {
  gameNumber: number;
  scoreA: number;
  scoreB: number;
  winnerId: 'A' | 'B';
  /** Duration in seconds */
  duration?: number;
}

// =============================================================================
// RALLY EVENT (for history/undo)
// =============================================================================

export type RallyEventType =
  | 'point'           // Serving team won rally, scored a point
  | 'sideout'         // Receiving team won rally, side out occurs
  | 'game_end'        // Game ended
  | 'match_end'       // Match ended
  | 'switch_sides'    // Teams switched sides
  | 'timeout'         // Timeout called
  | 'undo';           // Previous action was undone

export interface RallyEvent {
  id: string;
  timestamp: number;
  type: RallyEventType;
  /** Which team won the rally */
  rallyWinner: 'A' | 'B';
  /** Score after this event */
  scoreAfter: { A: number; B: number };
  /** Which team is serving after this event */
  servingTeam: 'A' | 'B';
  /** Server number (1 or 2) for doubles */
  serverNumber: 1 | 2;
  /** Current game number */
  gameNumber: number;
  /** Optional note (e.g., timeout reason) */
  note?: string;
}

// =============================================================================
// LIVE SCORE STATE
// =============================================================================

export type LiveScoreStatus =
  | 'not_started'
  | 'in_progress'
  | 'paused'
  | 'between_games'
  | 'completed'
  | 'cancelled';

export interface LiveScore {
  // Identifiers
  id: string;
  matchId?: string;        // If linked to an event match
  eventId?: string;        // Tournament/League/Meetup ID
  eventType?: 'tournament' | 'league' | 'meetup' | 'standalone';
  courtNumber?: number;

  // Teams
  teamA: ScoringTeam;
  teamB: ScoringTeam;

  // Current game state
  currentGame: number;
  scoreA: number;
  scoreB: number;
  servingTeam: 'A' | 'B';
  serverNumber: 1 | 2;

  // Match settings
  settings: ScoringSettings;

  // Completed games
  completedGames: GameScore[];

  // Match state
  status: LiveScoreStatus;
  winnerId?: 'A' | 'B';
  /** Games won by each team */
  gamesWon: { A: number; B: number };

  // Scoring tracking
  scorerId?: string;
  scorerName?: string;
  scorerRole?: 'organizer' | 'referee' | 'helper' | 'player' | 'self';

  // Rally history (for undo functionality)
  rallyHistory: RallyEvent[];

  // Side switching
  sidesSwitched: boolean;

  // Timestamps
  createdAt: number;
  startedAt?: number;
  updatedAt: number;
  completedAt?: number;

  // Game start times (for duration tracking)
  currentGameStartedAt?: number;
}

// =============================================================================
// SCORER ASSIGNMENT
// =============================================================================

export type ScorerRole = 'organizer' | 'referee' | 'helper' | 'player';

export interface AssignedScorer {
  userId: string;
  name: string;
  role: ScorerRole;
  assignedAt: number;
  assignedBy?: string;
}

export interface EventScoringRole {
  userId: string;
  name: string;
  role: ScorerRole;
  /** Courts this person can score (or 'all') */
  courts: number[] | 'all';
  assignedAt: number;
}

// =============================================================================
// SCOREBOARD CONFIG
// =============================================================================

export type ScoreboardLayout = 'grid' | 'carousel' | 'single' | 'list';

export interface ScoreboardConfig {
  eventId: string;
  eventName: string;
  /** Which courts to display */
  courts: number[];
  layout: ScoreboardLayout;
  /** Show "Up Next" queue */
  showUpNext: boolean;
  /** Dark or light theme */
  theme: 'dark' | 'light';
  /** Custom branding */
  logoUrl?: string;
  /** Auto-rotate through courts (for carousel) */
  autoRotateSeconds?: number;
  /** Last updated */
  updatedAt: number;
}

// =============================================================================
// STANDALONE GAME
// =============================================================================

export interface StandaloneGame extends LiveScore {
  eventType: 'standalone';
  /** Owner user ID */
  ownerId: string;
  /** Save to match history */
  saveToHistory: boolean;
  /** Submit to DUPR */
  submitToDupr: boolean;
  /** Share link enabled */
  shareEnabled: boolean;
  /** Share code (short URL) */
  shareCode?: string;
}

// =============================================================================
// ACTION RESULTS
// =============================================================================

export interface ScoringActionResult {
  success: boolean;
  /** New state after action */
  newState?: Partial<LiveScore>;
  /** Event that was created */
  event?: RallyEvent;
  /** Error message if failed */
  error?: string;
  /** Game ended this rally */
  gameEnded?: boolean;
  /** Match ended this rally */
  matchEnded?: boolean;
  /** Winner if match ended */
  matchWinner?: 'A' | 'B';
  /** Should switch sides */
  shouldSwitchSides?: boolean;
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  DEFAULT_SCORING_SETTINGS,
};

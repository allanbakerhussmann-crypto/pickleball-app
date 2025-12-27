/**
 * Scoring Logic Service
 *
 * Implements traditional side-out scoring rules for pickleball.
 * Handles server tracking, side switching, game/match completion.
 *
 * FILE: services/scoring/scoringLogic.ts
 * VERSION: V06.04
 */

import type {
  LiveScore,
  ScoringSettings,
  RallyEvent,
  GameScore,
  ScoringActionResult,
  ScoringTeam,
  PlayerPositions,
} from '../../types/scoring';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Colors for teams */
export const TEAM_COLORS = {
  A: '#3B82F6', // Blue
  B: '#F97316', // Orange
};

/** Default team names */
export const DEFAULT_TEAM_NAMES = {
  A: 'Team 1',
  B: 'Team 2',
};

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Generate a unique ID for events
 */
const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Create initial live score state
 */
export const createInitialLiveScore = (
  teamA: Partial<ScoringTeam>,
  teamB: Partial<ScoringTeam>,
  settings: Partial<ScoringSettings> = {},
  options: {
    matchId?: string;
    eventId?: string;
    eventType?: 'tournament' | 'league' | 'meetup' | 'standalone';
    courtNumber?: number;
    scorerId?: string;
    scorerName?: string;
  } = {}
): LiveScore => {
  const now = Date.now();

  return {
    id: generateId(),
    matchId: options.matchId,
    eventId: options.eventId,
    eventType: options.eventType || 'standalone',
    courtNumber: options.courtNumber,

    teamA: {
      name: teamA.name || DEFAULT_TEAM_NAMES.A,
      color: teamA.color || TEAM_COLORS.A,
      players: teamA.players,
      playerIds: teamA.playerIds,
      id: teamA.id,
    },
    teamB: {
      name: teamB.name || DEFAULT_TEAM_NAMES.B,
      color: teamB.color || TEAM_COLORS.B,
      players: teamB.players,
      playerIds: teamB.playerIds,
      id: teamB.id,
    },

    currentGame: 1,
    scoreA: 0,
    scoreB: 0,

    // First game: Starting team begins as Server 2 (only gets 1 serve)
    servingTeam: 'A',
    serverNumber: 2,

    settings: {
      playType: settings.playType || 'doubles',
      pointsPerGame: settings.pointsPerGame || 11,
      winBy: settings.winBy || 2,
      bestOf: settings.bestOf || 1,
      sideOutScoring: settings.sideOutScoring !== false, // Default true
      switchSidesAt: settings.switchSidesAt,
    },

    completedGames: [],
    status: 'not_started',
    gamesWon: { A: 0, B: 0 },

    scorerId: options.scorerId,
    scorerName: options.scorerName,

    rallyHistory: [],
    sidesSwitched: false,
    positionsLocked: false, // Positions can be edited until first rally

    createdAt: now,
    updatedAt: now,
  };
};

// =============================================================================
// SCORING LOGIC
// =============================================================================

/**
 * Calculate switch sides score (halfway point)
 */
export const getSwitchSidesScore = (settings: ScoringSettings): number => {
  if (settings.switchSidesAt !== undefined) {
    return settings.switchSidesAt;
  }
  // Default: switch at halfway (rounded down)
  return Math.floor(settings.pointsPerGame / 2);
};

/**
 * Check if teams should switch sides
 */
export const shouldSwitchSides = (
  scoreA: number,
  scoreB: number,
  settings: ScoringSettings,
  alreadySwitched: boolean
): boolean => {
  if (alreadySwitched) return false;

  const switchAt = getSwitchSidesScore(settings);
  const maxScore = Math.max(scoreA, scoreB);

  return maxScore >= switchAt;
};

/**
 * Check if a game is won
 */
export const isGameWon = (
  scoreA: number,
  scoreB: number,
  settings: ScoringSettings
): { won: boolean; winner?: 'A' | 'B' } => {
  const { pointsPerGame, winBy } = settings;

  // Check if either team has reached minimum points
  if (scoreA < pointsPerGame && scoreB < pointsPerGame) {
    return { won: false };
  }

  // Check win-by margin
  const diff = Math.abs(scoreA - scoreB);
  if (diff >= winBy) {
    if (scoreA > scoreB && scoreA >= pointsPerGame) {
      return { won: true, winner: 'A' };
    }
    if (scoreB > scoreA && scoreB >= pointsPerGame) {
      return { won: true, winner: 'B' };
    }
  }

  return { won: false };
};

/**
 * Check if a match is won
 */
export const isMatchWon = (
  gamesWonA: number,
  gamesWonB: number,
  bestOf: BestOf
): { won: boolean; winner?: 'A' | 'B' } => {
  const gamesToWin = Math.ceil(bestOf / 2);

  if (gamesWonA >= gamesToWin) {
    return { won: true, winner: 'A' };
  }
  if (gamesWonB >= gamesToWin) {
    return { won: true, winner: 'B' };
  }

  return { won: false };
};

type BestOf = 1 | 3 | 5;

/**
 * Process a rally result (the core scoring function)
 *
 * @param state Current live score state
 * @param rallyWinner Which team won the rally ('A' or 'B')
 * @returns Result with new state and any events
 */
export const processRally = (
  state: LiveScore,
  rallyWinner: 'A' | 'B'
): ScoringActionResult => {
  const { settings, servingTeam, serverNumber, scoreA, scoreB, sidesSwitched } = state;

  let newScoreA = scoreA;
  let newScoreB = scoreB;
  let newServingTeam = servingTeam;
  let newServerNumber = serverNumber;
  let newSidesSwitched = sidesSwitched;

  const eventType: RallyEvent['type'] = rallyWinner === servingTeam ? 'point' : 'sideout';

  // SIDE-OUT SCORING LOGIC
  if (settings.sideOutScoring) {
    if (rallyWinner === servingTeam) {
      // Serving team won - they score a point
      if (servingTeam === 'A') {
        newScoreA++;
      } else {
        newScoreB++;
      }
    } else {
      // Receiving team won - side out
      if (settings.playType === 'doubles') {
        // Doubles: Server 1 → Server 2 → Side out
        if (serverNumber === 1) {
          // Switch to server 2 (same team)
          newServerNumber = 2;
        } else {
          // Server 2 lost - full side out
          newServingTeam = servingTeam === 'A' ? 'B' : 'A';
          newServerNumber = 1;
        }
      } else {
        // Singles: Direct side out
        newServingTeam = servingTeam === 'A' ? 'B' : 'A';
        newServerNumber = 1;
      }
    }
  } else {
    // RALLY SCORING (either team can score)
    if (rallyWinner === 'A') {
      newScoreA++;
    } else {
      newScoreB++;
    }
    // In rally scoring, server changes on side out (when receiver wins)
    if (rallyWinner !== servingTeam) {
      newServingTeam = rallyWinner;
      newServerNumber = 1;
    }
  }

  // Check for side switch
  const switchSides = shouldSwitchSides(newScoreA, newScoreB, settings, newSidesSwitched);
  if (switchSides) {
    newSidesSwitched = true;
  }

  // Check if game is won
  const gameResult = isGameWon(newScoreA, newScoreB, settings);

  // Handle position swapping when serving team scores
  let newTeamA = state.teamA;
  let newTeamB = state.teamB;

  if (settings.playType === 'doubles' && settings.sideOutScoring) {
    // If serving team scored, they swap positions
    if (rallyWinner === servingTeam) {
      if (servingTeam === 'A' && state.teamA.playerPositions) {
        newTeamA = {
          ...state.teamA,
          playerPositions: {
            left: state.teamA.playerPositions.right,
            right: state.teamA.playerPositions.left,
          },
        };
      } else if (servingTeam === 'B' && state.teamB.playerPositions) {
        newTeamB = {
          ...state.teamB,
          playerPositions: {
            left: state.teamB.playerPositions.right,
            right: state.teamB.playerPositions.left,
          },
        };
      }
    }
  }

  // Create rally event (store positions before this rally for undo)
  const event: RallyEvent = {
    id: generateId(),
    timestamp: Date.now(),
    type: eventType,
    rallyWinner,
    scoreAfter: { A: newScoreA, B: newScoreB },
    servingTeam: newServingTeam,
    serverNumber: newServerNumber,
    gameNumber: state.currentGame,
    teamAPositionsBefore: state.teamA.playerPositions,
    teamBPositionsBefore: state.teamB.playerPositions,
  };

  // Build result
  const result: ScoringActionResult = {
    success: true,
    event,
    newState: {
      scoreA: newScoreA,
      scoreB: newScoreB,
      servingTeam: newServingTeam,
      serverNumber: newServerNumber,
      sidesSwitched: newSidesSwitched,
      teamA: newTeamA,
      teamB: newTeamB,
      positionsLocked: true, // Lock positions after first rally
      updatedAt: Date.now(),
    },
    shouldSwitchSides: switchSides,
    gameEnded: gameResult.won,
  };

  // If game ended, handle game completion
  if (gameResult.won && gameResult.winner) {
    const newGamesWon = {
      A: state.gamesWon.A + (gameResult.winner === 'A' ? 1 : 0),
      B: state.gamesWon.B + (gameResult.winner === 'B' ? 1 : 0),
    };

    const completedGame: GameScore = {
      gameNumber: state.currentGame,
      scoreA: newScoreA,
      scoreB: newScoreB,
      winnerId: gameResult.winner,
      duration: state.currentGameStartedAt
        ? Math.floor((Date.now() - state.currentGameStartedAt) / 1000)
        : undefined,
    };

    // Check if match is won
    const matchResult = isMatchWon(newGamesWon.A, newGamesWon.B, settings.bestOf);

    result.newState = {
      ...result.newState,
      gamesWon: newGamesWon,
      completedGames: [...state.completedGames, completedGame],
    };

    if (matchResult.won && matchResult.winner) {
      // Match complete
      result.matchEnded = true;
      result.matchWinner = matchResult.winner;
      result.newState = {
        ...result.newState,
        status: 'completed',
        winnerId: matchResult.winner,
        completedAt: Date.now(),
      };
    } else {
      // More games to play
      result.newState = {
        ...result.newState,
        status: 'between_games',
        currentGame: state.currentGame + 1,
        scoreA: 0,
        scoreB: 0,
        sidesSwitched: false,
        // Loser of previous game serves first in next game
        // They start as Server 2 (only 1 serve at start)
        servingTeam: gameResult.winner === 'A' ? 'B' : 'A',
        serverNumber: 2,
      };
    }
  }

  return result;
};

/**
 * Undo the last rally
 */
export const undoLastRally = (state: LiveScore): ScoringActionResult => {
  if (state.rallyHistory.length === 0) {
    return {
      success: false,
      error: 'No actions to undo',
    };
  }

  // Get the event to undo
  const lastEvent = state.rallyHistory[state.rallyHistory.length - 1];
  const previousEvents = state.rallyHistory.slice(0, -1);

  // If this was a game-ending event and we have completed games, we need to restore
  if (lastEvent.type === 'game_end' && state.completedGames.length > 0) {
    const lastGame = state.completedGames[state.completedGames.length - 1];
    return {
      success: true,
      newState: {
        currentGame: lastGame.gameNumber,
        scoreA: lastGame.scoreA,
        scoreB: lastGame.scoreB,
        completedGames: state.completedGames.slice(0, -1),
        gamesWon: {
          A: state.gamesWon.A - (lastGame.winnerId === 'A' ? 1 : 0),
          B: state.gamesWon.B - (lastGame.winnerId === 'B' ? 1 : 0),
        },
        status: 'in_progress',
        winnerId: undefined,
        completedAt: undefined,
        rallyHistory: previousEvents,
        updatedAt: Date.now(),
      },
    };
  }

  // Find the previous event to restore state from
  if (previousEvents.length > 0) {
    const previousEvent = previousEvents[previousEvents.length - 1];

    // Restore positions from before this event
    const newState: Partial<LiveScore> = {
      scoreA: previousEvent.scoreAfter.A,
      scoreB: previousEvent.scoreAfter.B,
      servingTeam: previousEvent.servingTeam,
      serverNumber: previousEvent.serverNumber,
      rallyHistory: previousEvents,
      updatedAt: Date.now(),
    };

    // Restore team positions if stored
    if (lastEvent.teamAPositionsBefore) {
      newState.teamA = {
        ...state.teamA,
        playerPositions: lastEvent.teamAPositionsBefore,
      };
    }
    if (lastEvent.teamBPositionsBefore) {
      newState.teamB = {
        ...state.teamB,
        playerPositions: lastEvent.teamBPositionsBefore,
      };
    }

    return {
      success: true,
      newState,
    };
  }

  // Undo to initial state
  const initialState: Partial<LiveScore> = {
    scoreA: 0,
    scoreB: 0,
    servingTeam: 'A',
    serverNumber: 2,
    rallyHistory: [],
    positionsLocked: false, // Unlock positions when undoing to start
    updatedAt: Date.now(),
  };

  // Restore initial positions if stored in the first event
  if (lastEvent.teamAPositionsBefore) {
    initialState.teamA = {
      ...state.teamA,
      playerPositions: lastEvent.teamAPositionsBefore,
    };
  }
  if (lastEvent.teamBPositionsBefore) {
    initialState.teamB = {
      ...state.teamB,
      playerPositions: lastEvent.teamBPositionsBefore,
    };
  }

  return {
    success: true,
    newState: initialState,
  };
};

/**
 * Start a game (changes status from not_started to in_progress)
 */
export const startGame = (state: LiveScore): ScoringActionResult => {
  if (state.status !== 'not_started' && state.status !== 'between_games') {
    return {
      success: false,
      error: 'Game already in progress',
    };
  }

  const now = Date.now();

  return {
    success: true,
    newState: {
      status: 'in_progress',
      startedAt: state.startedAt || now,
      currentGameStartedAt: now,
      updatedAt: now,
    },
  };
};

/**
 * Pause the game
 */
export const pauseGame = (state: LiveScore): ScoringActionResult => {
  if (state.status !== 'in_progress') {
    return {
      success: false,
      error: 'Game is not in progress',
    };
  }

  return {
    success: true,
    newState: {
      status: 'paused',
      updatedAt: Date.now(),
    },
  };
};

/**
 * Resume a paused game
 */
export const resumeGame = (state: LiveScore): ScoringActionResult => {
  if (state.status !== 'paused') {
    return {
      success: false,
      error: 'Game is not paused',
    };
  }

  return {
    success: true,
    newState: {
      status: 'in_progress',
      updatedAt: Date.now(),
    },
  };
};

/**
 * Continue to next game (after between_games)
 */
export const startNextGame = (state: LiveScore): ScoringActionResult => {
  if (state.status !== 'between_games') {
    return {
      success: false,
      error: 'Not between games',
    };
  }

  return {
    success: true,
    newState: {
      status: 'in_progress',
      currentGameStartedAt: Date.now(),
      updatedAt: Date.now(),
    },
  };
};

/**
 * End match early (forfeit, injury, etc.)
 */
export const endMatchEarly = (
  state: LiveScore,
  winnerId: 'A' | 'B',
  reason: string
): ScoringActionResult => {
  return {
    success: true,
    newState: {
      status: 'completed',
      winnerId,
      completedAt: Date.now(),
      updatedAt: Date.now(),
    },
    event: {
      id: generateId(),
      timestamp: Date.now(),
      type: 'match_end',
      rallyWinner: winnerId,
      scoreAfter: { A: state.scoreA, B: state.scoreB },
      servingTeam: state.servingTeam,
      serverNumber: state.serverNumber,
      gameNumber: state.currentGame,
      note: reason,
    },
    matchEnded: true,
    matchWinner: winnerId,
  };
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Format score for display (e.g., "4-2-1" for side-out or "4-2" for rally)
 */
export const formatCurrentScore = (state: LiveScore): string => {
  const { scoreA, scoreB, servingTeam, serverNumber, settings } = state;

  if (settings.sideOutScoring && settings.playType === 'doubles') {
    // Traditional format: ServingScore-ReceivingScore-ServerNumber
    if (servingTeam === 'A') {
      return `${scoreA}-${scoreB}-${serverNumber}`;
    } else {
      return `${scoreB}-${scoreA}-${serverNumber}`;
    }
  }

  // Simple format
  return `${scoreA}-${scoreB}`;
};

/**
 * Format match score (e.g., "2-1 (11-8, 9-11, 11-6)")
 */
export const formatMatchScore = (state: LiveScore): string => {
  const { gamesWon, completedGames } = state;

  if (completedGames.length === 0) {
    return `${gamesWon.A}-${gamesWon.B}`;
  }

  const gameScores = completedGames
    .map((g) => `${g.scoreA}-${g.scoreB}`)
    .join(', ');

  return `${gamesWon.A}-${gamesWon.B} (${gameScores})`;
};

/**
 * Get the score announcement (for screen readers / audio)
 */
export const getScoreAnnouncement = (state: LiveScore): string => {
  const { scoreA, scoreB, servingTeam, serverNumber, teamA, teamB, settings } = state;

  const servingTeamName = servingTeam === 'A' ? teamA.name : teamB.name;

  if (settings.sideOutScoring && settings.playType === 'doubles') {
    const servingScore = servingTeam === 'A' ? scoreA : scoreB;
    const receivingScore = servingTeam === 'A' ? scoreB : scoreA;
    return `${servingScore}-${receivingScore}-${serverNumber}. ${servingTeamName} serving.`;
  }

  return `${scoreA}-${scoreB}. ${servingTeamName} serving.`;
};

/**
 * Apply a scoring action result to the current state
 */
export const applyResult = (
  state: LiveScore,
  result: ScoringActionResult
): LiveScore => {
  if (!result.success || !result.newState) {
    return state;
  }

  const newState = {
    ...state,
    ...result.newState,
  };

  // Add event to history if present
  if (result.event) {
    newState.rallyHistory = [...state.rallyHistory, result.event];
  }

  return newState;
};

// =============================================================================
// PLAYER POSITION FUNCTIONS
// =============================================================================

/**
 * Get server's court position based on score
 * Even score (0, 2, 4, 6, 8, 10) → Server on RIGHT
 * Odd score (1, 3, 5, 7, 9, 11) → Server on LEFT
 */
export const getServerPosition = (servingTeamScore: number): 'left' | 'right' => {
  return servingTeamScore % 2 === 0 ? 'right' : 'left';
};

/**
 * Get the name of the current server based on score and positions
 */
export const getCurrentServerName = (state: LiveScore): string | null => {
  const { servingTeam, scoreA, scoreB, teamA, teamB, settings } = state;

  const team = servingTeam === 'A' ? teamA : teamB;
  const score = servingTeam === 'A' ? scoreA : scoreB;

  // For singles, just return the single player name
  if (settings.playType === 'singles') {
    return team.players?.[0] || team.name;
  }

  // For doubles, use position to determine who is serving
  if (!team.playerPositions) {
    // If positions not set, fall back to players array
    return team.players?.join(' & ') || team.name;
  }

  const position = getServerPosition(score);
  return team.playerPositions[position];
};

/**
 * Get receiving player's position based on serving team's score
 * Receiver is on the same side as server (diagonal from each other)
 */
export const getReceiverPosition = (servingTeamScore: number): 'left' | 'right' => {
  // Receiver is on the SAME side as server (they face each other diagonally)
  return getServerPosition(servingTeamScore);
};

/**
 * Get the name of the current receiver
 */
export const getCurrentReceiverName = (state: LiveScore): string | null => {
  const { servingTeam, scoreA, scoreB, teamA, teamB, settings } = state;

  const receivingTeam = servingTeam === 'A' ? teamB : teamA;
  const servingScore = servingTeam === 'A' ? scoreA : scoreB;

  // For singles, just return the single player name
  if (settings.playType === 'singles') {
    return receivingTeam.players?.[0] || receivingTeam.name;
  }

  // For doubles, receiver is on the same side as server
  if (!receivingTeam.playerPositions) {
    return receivingTeam.players?.join(' & ') || receivingTeam.name;
  }

  const position = getReceiverPosition(servingScore);
  return receivingTeam.playerPositions[position];
};

/**
 * Swap team positions (left ↔ right)
 * Called when serving team scores a point
 */
export const swapTeamPositions = (team: ScoringTeam): ScoringTeam => {
  if (!team.playerPositions) {
    return team;
  }

  return {
    ...team,
    playerPositions: {
      left: team.playerPositions.right,
      right: team.playerPositions.left,
    },
  };
};

/**
 * Initialize player positions based on players array and server selection
 * Server 1 starts on the right (for even score = 0)
 */
export const initializePlayerPositions = (
  team: ScoringTeam,
  server1Index: 0 | 1
): ScoringTeam => {
  if (!team.players || team.players.length < 2) {
    return team;
  }

  // Server 1 starts on the right (since game starts at score 0 = even)
  const server1Name = team.players[server1Index];
  const server2Name = team.players[1 - server1Index];

  return {
    ...team,
    playerPositions: {
      right: server1Name,  // Server 1 on right at start (even score)
      left: server2Name,   // Server 2 on left at start
    },
  };
};

/**
 * Check if player positions need to be swapped based on score change
 * Positions swap when serving team scores (they switch sides)
 */
export const shouldSwapPositions = (
  oldScore: number,
  newScore: number,
  rallyWinner: 'A' | 'B',
  servingTeam: 'A' | 'B'
): boolean => {
  // Only swap when serving team scored (newScore > oldScore and rallyWinner === servingTeam)
  return rallyWinner === servingTeam && newScore > oldScore;
};

/**
 * Get detailed server info including position
 */
export const getServerInfo = (
  state: LiveScore
): {
  team: 'A' | 'B';
  teamName: string;
  playerName: string | null;
  position: 'left' | 'right';
  serverNumber: 1 | 2;
} => {
  const { servingTeam, serverNumber, teamA, teamB, scoreA, scoreB } = state;

  const team = servingTeam === 'A' ? teamA : teamB;
  const score = servingTeam === 'A' ? scoreA : scoreB;
  const position = getServerPosition(score);

  return {
    team: servingTeam,
    teamName: team.name,
    playerName: team.playerPositions?.[position] || null,
    position,
    serverNumber,
  };
};

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  createInitialLiveScore,
  processRally,
  undoLastRally,
  startGame,
  pauseGame,
  resumeGame,
  startNextGame,
  endMatchEarly,
  formatCurrentScore,
  formatMatchScore,
  getScoreAnnouncement,
  applyResult,
  isGameWon,
  isMatchWon,
  shouldSwitchSides,
  getSwitchSidesScore,
  // Position functions
  getServerPosition,
  getCurrentServerName,
  getReceiverPosition,
  getCurrentReceiverName,
  swapTeamPositions,
  initializePlayerPositions,
  shouldSwapPositions,
  getServerInfo,
  TEAM_COLORS,
  DEFAULT_TEAM_NAMES,
};

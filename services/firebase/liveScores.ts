/**
 * Live Scores Firebase Service
 *
 * Real-time scoring operations for tournaments, leagues, meetups, and standalone games.
 * Handles live score syncing, scorer assignments, and scoreboard displays.
 *
 * FILE: services/firebase/liveScores.ts
 * VERSION: V06.03
 */

import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  writeBatch,
  serverTimestamp,
  Timestamp,
  getDocs,
  orderBy,
  limit,
} from '@firebase/firestore';
import { db } from './config';
import type {
  LiveScore,
  ScoringTeam,
  ScoringSettings,
  RallyEvent,
  GameScore,
  AssignedScorer,
  EventScoringRole,
  ScoreboardConfig,
  StandaloneGame,
  LiveScoreStatus,
} from '../../types/scoring';

// =============================================================================
// COLLECTION REFERENCES
// =============================================================================

const LIVE_SCORES_COLLECTION = 'liveScores';
const STANDALONE_GAMES_COLLECTION = 'standaloneGames';
const SCOREBOARD_CONFIGS_COLLECTION = 'scoreboardConfigs';

// =============================================================================
// CREATE / INITIALIZE
// =============================================================================

/**
 * Create a new live score session for an event match
 */
export const createLiveScore = async (
  liveScore: LiveScore
): Promise<string> => {
  const docRef = doc(collection(db, LIVE_SCORES_COLLECTION));
  const id = liveScore.id || docRef.id;

  await setDoc(doc(db, LIVE_SCORES_COLLECTION, id), {
    ...liveScore,
    id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  return id;
};

/**
 * Create a standalone game (not tied to any event)
 */
export const createStandaloneGame = async (
  ownerId: string,
  teamA: ScoringTeam,
  teamB: ScoringTeam,
  settings: ScoringSettings,
  options?: {
    saveToHistory?: boolean;
    submitToDupr?: boolean;
    shareEnabled?: boolean;
  }
): Promise<string> => {
  const docRef = doc(collection(db, STANDALONE_GAMES_COLLECTION));
  const id = docRef.id;
  const now = Date.now();

  // Generate short share code
  const shareCode = options?.shareEnabled
    ? generateShareCode()
    : undefined;

  const game: StandaloneGame = {
    id,
    eventType: 'standalone',
    teamA,
    teamB,
    settings,
    currentGame: 1,
    scoreA: 0,
    scoreB: 0,
    servingTeam: 'A',
    serverNumber: 2, // First serve starts as Server 2
    completedGames: [],
    status: 'not_started',
    gamesWon: { A: 0, B: 0 },
    rallyHistory: [],
    sidesSwitched: false,
    ownerId,
    saveToHistory: options?.saveToHistory ?? true,
    submitToDupr: options?.submitToDupr ?? false,
    shareEnabled: options?.shareEnabled ?? false,
    shareCode,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(docRef, game);
  return id;
};

/**
 * Generate a short share code for standalone games
 */
const generateShareCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

// =============================================================================
// READ / SUBSCRIBE
// =============================================================================

/**
 * Get a live score by ID
 */
export const getLiveScore = async (id: string): Promise<LiveScore | null> => {
  const docSnap = await getDoc(doc(db, LIVE_SCORES_COLLECTION, id));
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() } as LiveScore;
};

/**
 * Subscribe to a single live score (real-time updates)
 */
export const subscribeToLiveScore = (
  id: string,
  callback: (score: LiveScore | null) => void
): (() => void) => {
  return onSnapshot(
    doc(db, LIVE_SCORES_COLLECTION, id),
    (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      callback({ id: snap.id, ...snap.data() } as LiveScore);
    },
    (error) => {
      console.error('Error subscribing to live score:', error);
      callback(null);
    }
  );
};

/**
 * Subscribe to all live scores for an event (multi-court view)
 */
export const subscribeToEventLiveScores = (
  eventId: string,
  eventType: 'tournament' | 'league' | 'meetup',
  callback: (scores: LiveScore[]) => void
): (() => void) => {
  const q = query(
    collection(db, LIVE_SCORES_COLLECTION),
    where('eventId', '==', eventId),
    where('eventType', '==', eventType),
    where('status', 'in', ['not_started', 'in_progress', 'paused', 'between_games'])
  );

  return onSnapshot(
    q,
    (snap) => {
      const scores = snap.docs.map(d => ({ id: d.id, ...d.data() } as LiveScore));
      // Sort by court number
      scores.sort((a, b) => (a.courtNumber || 0) - (b.courtNumber || 0));
      callback(scores);
    },
    (error) => {
      console.error('Error subscribing to event live scores:', error);
      callback([]);
    }
  );
};

/**
 * Get live score by match ID (for event matches)
 */
export const getLiveScoreByMatchId = async (
  matchId: string
): Promise<LiveScore | null> => {
  const q = query(
    collection(db, LIVE_SCORES_COLLECTION),
    where('matchId', '==', matchId),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as LiveScore;
};

/**
 * Get standalone game by share code
 */
export const getGameByShareCode = async (
  shareCode: string
): Promise<StandaloneGame | null> => {
  const q = query(
    collection(db, STANDALONE_GAMES_COLLECTION),
    where('shareCode', '==', shareCode.toUpperCase()),
    where('shareEnabled', '==', true),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() } as StandaloneGame;
};

/**
 * Subscribe to a standalone game
 */
export const subscribeToStandaloneGame = (
  id: string,
  callback: (game: StandaloneGame | null) => void
): (() => void) => {
  return onSnapshot(
    doc(db, STANDALONE_GAMES_COLLECTION, id),
    (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      callback({ id: snap.id, ...snap.data() } as StandaloneGame);
    },
    (error) => {
      console.error('Error subscribing to standalone game:', error);
      callback(null);
    }
  );
};

/**
 * Get user's recent standalone games
 */
export const getUserStandaloneGames = async (
  userId: string,
  limitCount: number = 20
): Promise<StandaloneGame[]> => {
  const q = query(
    collection(db, STANDALONE_GAMES_COLLECTION),
    where('ownerId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as StandaloneGame));
};

// =============================================================================
// UPDATE
// =============================================================================

/**
 * Update live score state (optimistic update pattern)
 */
export const updateLiveScore = async (
  id: string,
  updates: Partial<LiveScore>
): Promise<void> => {
  await updateDoc(doc(db, LIVE_SCORES_COLLECTION, id), {
    ...updates,
    updatedAt: Date.now(),
  });
};

/**
 * Update standalone game
 */
export const updateStandaloneGame = async (
  id: string,
  updates: Partial<StandaloneGame>
): Promise<void> => {
  await updateDoc(doc(db, STANDALONE_GAMES_COLLECTION, id), {
    ...updates,
    updatedAt: Date.now(),
  });
};

/**
 * Sync full live score state to Firebase
 * Used after processing a rally locally
 */
export const syncLiveScoreState = async (
  id: string,
  state: LiveScore,
  isStandalone: boolean = false
): Promise<void> => {
  const collectionName = isStandalone
    ? STANDALONE_GAMES_COLLECTION
    : LIVE_SCORES_COLLECTION;

  await updateDoc(doc(db, collectionName, id), {
    scoreA: state.scoreA,
    scoreB: state.scoreB,
    servingTeam: state.servingTeam,
    serverNumber: state.serverNumber,
    currentGame: state.currentGame,
    completedGames: state.completedGames,
    gamesWon: state.gamesWon,
    status: state.status,
    winnerId: state.winnerId ?? null,
    sidesSwitched: state.sidesSwitched,
    rallyHistory: state.rallyHistory,
    updatedAt: Date.now(),
    ...(state.startedAt && { startedAt: state.startedAt }),
    ...(state.completedAt && { completedAt: state.completedAt }),
    ...(state.currentGameStartedAt && { currentGameStartedAt: state.currentGameStartedAt }),
  });
};

/**
 * Assign a scorer to a match
 */
export const assignScorer = async (
  liveScoreId: string,
  scorer: AssignedScorer
): Promise<void> => {
  await updateDoc(doc(db, LIVE_SCORES_COLLECTION, liveScoreId), {
    scorerId: scorer.userId,
    scorerName: scorer.name,
    scorerRole: scorer.role,
    updatedAt: Date.now(),
  });
};

/**
 * Remove scorer from a match
 */
export const removeScorer = async (liveScoreId: string): Promise<void> => {
  await updateDoc(doc(db, LIVE_SCORES_COLLECTION, liveScoreId), {
    scorerId: null,
    scorerName: null,
    scorerRole: null,
    updatedAt: Date.now(),
  });
};

// =============================================================================
// DELETE
// =============================================================================

/**
 * Delete a live score session
 */
export const deleteLiveScore = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, LIVE_SCORES_COLLECTION, id));
};

/**
 * Delete a standalone game
 */
export const deleteStandaloneGame = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, STANDALONE_GAMES_COLLECTION, id));
};

// =============================================================================
// SCOREBOARD CONFIG
// =============================================================================

/**
 * Get or create scoreboard config for an event
 */
export const getScoreboardConfig = async (
  eventId: string
): Promise<ScoreboardConfig | null> => {
  const docSnap = await getDoc(doc(db, SCOREBOARD_CONFIGS_COLLECTION, eventId));
  if (!docSnap.exists()) return null;
  return docSnap.data() as ScoreboardConfig;
};

/**
 * Save scoreboard config
 */
export const saveScoreboardConfig = async (
  config: ScoreboardConfig
): Promise<void> => {
  await setDoc(doc(db, SCOREBOARD_CONFIGS_COLLECTION, config.eventId), {
    ...config,
    updatedAt: Date.now(),
  });
};

/**
 * Subscribe to scoreboard config changes
 */
export const subscribeToScoreboardConfig = (
  eventId: string,
  callback: (config: ScoreboardConfig | null) => void
): (() => void) => {
  return onSnapshot(
    doc(db, SCOREBOARD_CONFIGS_COLLECTION, eventId),
    (snap) => {
      if (!snap.exists()) {
        callback(null);
        return;
      }
      callback(snap.data() as ScoreboardConfig);
    }
  );
};

// =============================================================================
// BATCH OPERATIONS
// =============================================================================

/**
 * Create multiple live score sessions (for tournament setup)
 */
export const batchCreateLiveScores = async (
  liveScores: LiveScore[]
): Promise<void> => {
  const batch = writeBatch(db);
  const now = Date.now();

  liveScores.forEach((score) => {
    const id = score.id || doc(collection(db, LIVE_SCORES_COLLECTION)).id;
    batch.set(doc(db, LIVE_SCORES_COLLECTION, id), {
      ...score,
      id,
      createdAt: now,
      updatedAt: now,
    });
  });

  await batch.commit();
};

/**
 * Complete a match and finalize the live score
 */
export const completeLiveScore = async (
  id: string,
  winnerId: 'A' | 'B',
  finalState: LiveScore,
  isStandalone: boolean = false
): Promise<void> => {
  const collectionName = isStandalone
    ? STANDALONE_GAMES_COLLECTION
    : LIVE_SCORES_COLLECTION;

  await updateDoc(doc(db, collectionName, id), {
    status: 'completed',
    winnerId,
    completedAt: Date.now(),
    updatedAt: Date.now(),
    scoreA: finalState.scoreA,
    scoreB: finalState.scoreB,
    completedGames: finalState.completedGames,
    gamesWon: finalState.gamesWon,
  });
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if user can score a match
 */
export const canUserScore = (
  userId: string,
  liveScore: LiveScore,
  userRoles?: EventScoringRole[]
): boolean => {
  // Organizer can always score
  // This would need to be checked separately with event data

  // Assigned scorer for this match
  if (liveScore.scorerId === userId) return true;

  // Player in match can score their own game
  const teamAPlayerIds = liveScore.teamA.playerIds || [];
  const teamBPlayerIds = liveScore.teamB.playerIds || [];
  if (teamAPlayerIds.includes(userId) || teamBPlayerIds.includes(userId)) {
    return true;
  }

  // Check event-level scoring roles
  if (userRoles) {
    const userRole = userRoles.find(r => r.userId === userId);
    if (userRole) {
      if (userRole.courts === 'all') return true;
      if (liveScore.courtNumber && userRole.courts.includes(liveScore.courtNumber)) {
        return true;
      }
    }
  }

  return false;
};

/**
 * Get active matches count for an event
 */
export const getActiveMatchesCount = async (
  eventId: string,
  eventType: 'tournament' | 'league' | 'meetup'
): Promise<number> => {
  const q = query(
    collection(db, LIVE_SCORES_COLLECTION),
    where('eventId', '==', eventId),
    where('eventType', '==', eventType),
    where('status', 'in', ['in_progress', 'paused'])
  );
  const snap = await getDocs(q);
  return snap.size;
};

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  // Create
  createLiveScore,
  createStandaloneGame,
  // Read
  getLiveScore,
  subscribeToLiveScore,
  subscribeToEventLiveScores,
  getLiveScoreByMatchId,
  getGameByShareCode,
  subscribeToStandaloneGame,
  getUserStandaloneGames,
  // Update
  updateLiveScore,
  updateStandaloneGame,
  syncLiveScoreState,
  assignScorer,
  removeScorer,
  // Delete
  deleteLiveScore,
  deleteStandaloneGame,
  // Scoreboard
  getScoreboardConfig,
  saveScoreboardConfig,
  subscribeToScoreboardConfig,
  // Batch
  batchCreateLiveScores,
  completeLiveScore,
  // Helpers
  canUserScore,
  getActiveMatchesCount,
};

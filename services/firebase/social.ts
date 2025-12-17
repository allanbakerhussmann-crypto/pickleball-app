/**
 * Social Events & Game Sessions
 * 
 * Manages social play events and game sessions.
 * 
 * FILE LOCATION: services/firebase/social.ts
 */

import { 
  doc, 
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection, 
  query, 
  orderBy,
  onSnapshot,
  arrayUnion,
  arrayRemove,
} from '@firebase/firestore';
import { db } from './config';
import type { SocialEvent, GameSession } from '../../types';

// ============================================
// COLLECTIONS
// ============================================

const SOCIAL_EVENTS_COLLECTION = 'social_events';
const GAME_SESSIONS_COLLECTION = 'game_sessions';

// ============================================
// Social Event CRUD (Legacy)
// ============================================

export const createSocialEvent = async (event: Omit<SocialEvent, 'id'>) => {
  const ref = doc(collection(db, SOCIAL_EVENTS_COLLECTION));
  await setDoc(ref, { ...event, id: ref.id });
};

export const subscribeToSocialEvents = (
  callback: (events: SocialEvent[]) => void
) => {
  const q = query(
    collection(db, SOCIAL_EVENTS_COLLECTION), 
    orderBy('date', 'asc'), 
    orderBy('startTime', 'asc')
  );
  return onSnapshot(q, (snap) => {
    const events = snap.docs.map(d => d.data() as SocialEvent);
    callback(events);
  });
};

export const joinSocialEvent = async (eventId: string, userId: string) => {
  const ref = doc(db, SOCIAL_EVENTS_COLLECTION, eventId);
  await updateDoc(ref, {
    attendees: arrayUnion(userId)
  });
};

export const leaveSocialEvent = async (eventId: string, userId: string) => {
  const ref = doc(db, SOCIAL_EVENTS_COLLECTION, eventId);
  await updateDoc(ref, {
    attendees: arrayRemove(userId)
  });
};

export const deleteSocialEvent = async (eventId: string) => {
  await deleteDoc(doc(db, SOCIAL_EVENTS_COLLECTION, eventId));
};

// ============================================
// Game Session CRUD
// ============================================

/**
 * Create a new game session
 */
export const createGameSession = async (session: GameSession): Promise<string> => {
  const ref = doc(collection(db, GAME_SESSIONS_COLLECTION));
  const sessionWithId = { ...session, id: ref.id };
  await setDoc(ref, sessionWithId);
  return ref.id;
};

/**
 * Get a game session by ID
 */
export const getGameSession = async (sessionId: string): Promise<GameSession | null> => {
  const snap = await getDoc(doc(db, GAME_SESSIONS_COLLECTION, sessionId));
  return snap.exists() ? (snap.data() as GameSession) : null;
};

/**
 * Subscribe to all game sessions
 */
export const subscribeToGameSessions = (
  callback: (sessions: GameSession[]) => void
) => {
  const q = query(
    collection(db, GAME_SESSIONS_COLLECTION), 
    orderBy('startDatetime', 'asc')
  );
  return onSnapshot(q, (snap) => {
    const sessions = snap.docs.map(d => d.data() as GameSession);
    callback(sessions);
  });
};

/**
 * Join a game session
 */
export const joinGameSession = async (sessionId: string, userId: string): Promise<void> => {
  const ref = doc(db, GAME_SESSIONS_COLLECTION, sessionId);
  await updateDoc(ref, {
    playerIds: arrayUnion(userId)
  });
};

/**
 * Leave a game session
 */
export const leaveGameSession = async (sessionId: string, userId: string): Promise<void> => {
  const ref = doc(db, GAME_SESSIONS_COLLECTION, sessionId);
  await updateDoc(ref, {
    playerIds: arrayRemove(userId)
  });
};

/**
 * Update game session status
 */
export const updateGameSessionStatus = async (
  sessionId: string, 
  status: GameSession['status']
): Promise<void> => {
  const ref = doc(db, GAME_SESSIONS_COLLECTION, sessionId);
  await updateDoc(ref, { status });
};

/**
 * Delete a game session
 */
export const deleteGameSession = async (sessionId: string): Promise<void> => {
  await deleteDoc(doc(db, GAME_SESSIONS_COLLECTION, sessionId));
};
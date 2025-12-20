/**
 * Meetup Matches Service
 * 
 * Firebase functions for managing meetup matches and scoring.
 * 
 * FILE LOCATION: services/firebase/meetupMatches.ts
 * VERSION: V05.17
 */

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  onSnapshot,
} from '@firebase/firestore';
import { db } from './index';

// ============================================
// TYPES
// ============================================

export interface GameScore {
  player1: number;
  player2: number;
}

export type MeetupMatchStatus = 
  | 'scheduled' 
  | 'in_progress' 
  | 'pending_confirmation' 
  | 'completed' 
  | 'disputed'
  | 'cancelled';

export interface MeetupMatch {
  id: string;
  meetupId: string;
  
  // Players
  player1Id: string;
  player1Name: string;
  player2Id: string;
  player2Name: string;
  
  // Scores - array of games (for best of 1/3/5)
  games: GameScore[];
  
  // Result
  winnerId: string | null;
  winnerName: string | null;
  isDraw: boolean;
  
  // Status
  status: MeetupMatchStatus;
  
  // Submission tracking
  submittedBy: string | null;
  submittedByName: string | null;
  submittedAt: number | null;
  confirmedBy: string | null;
  confirmedAt: number | null;
  
  // Dispute
  disputedBy: string | null;
  disputeReason: string | null;
  resolvedBy: string | null;
  resolvedAt: number | null;
  
  // Optional scheduling
  round?: number;
  court?: string;
  scheduledTime?: number;
  
  // Timestamps
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

export interface CreateMatchInput {
  meetupId: string;
  player1Id: string;
  player1Name: string;
  player2Id: string;
  player2Name: string;
  round?: number;
  court?: string;
  scheduledTime?: number;
}

export interface SubmitScoreInput {
  odUserId: string;
  odUserName: string;
  games: GameScore[];
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Determine winner from game scores
 * Returns { winnerId, winnerName, isDraw }
 */
export function determineWinner(
  games: GameScore[],
  player1Id: string,
  player1Name: string,
  player2Id: string,
  player2Name: string,
  gamesPerMatch: number = 1
): { winnerId: string | null; winnerName: string | null; isDraw: boolean } {
  let player1Wins = 0;
  let player2Wins = 0;

  games.forEach((game) => {
    if (game.player1 > game.player2) player1Wins++;
    else if (game.player2 > game.player1) player2Wins++;
  });

  const winsNeeded = Math.ceil(gamesPerMatch / 2);

  if (player1Wins >= winsNeeded) {
    return { winnerId: player1Id, winnerName: player1Name, isDraw: false };
  } else if (player2Wins >= winsNeeded) {
    return { winnerId: player2Id, winnerName: player2Name, isDraw: false };
  } else if (player1Wins === player2Wins && games.length === gamesPerMatch) {
    // Draw (rare but possible)
    return { winnerId: null, winnerName: null, isDraw: true };
  }

  // Match not yet decided
  return { winnerId: null, winnerName: null, isDraw: false };
}

// ============================================
// MATCH CRUD OPERATIONS
// ============================================

/**
 * Create a new match between two players
 */
export async function createMeetupMatch(input: CreateMatchInput): Promise<string> {
  const matchesRef = collection(db, 'meetups', input.meetupId, 'matches');

  const matchData = {
    meetupId: input.meetupId,
    player1Id: input.player1Id,
    player1Name: input.player1Name,
    player2Id: input.player2Id,
    player2Name: input.player2Name,
    games: [],
    winnerId: null,
    winnerName: null,
    isDraw: false,
    status: 'scheduled' as MeetupMatchStatus,
    submittedBy: null,
    submittedByName: null,
    submittedAt: null,
    confirmedBy: null,
    confirmedAt: null,
    disputedBy: null,
    disputeReason: null,
    resolvedBy: null,
    resolvedAt: null,
    round: input.round || null,
    court: input.court || null,
    scheduledTime: input.scheduledTime || null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    completedAt: null,
  };

  const docRef = await addDoc(matchesRef, matchData);
  return docRef.id;
}

/**
 * Get a single match by ID
 */
export async function getMeetupMatch(
  meetupId: string,
  matchId: string
): Promise<MeetupMatch | null> {
  const matchRef = doc(db, 'meetups', meetupId, 'matches', matchId);
  const matchSnap = await getDoc(matchRef);

  if (!matchSnap.exists()) return null;

  return { id: matchSnap.id, ...matchSnap.data() } as MeetupMatch;
}

/**
 * Get all matches for a meetup
 */
export async function getMeetupMatches(meetupId: string): Promise<MeetupMatch[]> {
  const matchesRef = collection(db, 'meetups', meetupId, 'matches');
  const q = query(matchesRef, orderBy('createdAt', 'asc'));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as MeetupMatch[];
}

/**
 * Subscribe to matches for real-time updates
 */
export function subscribeToMeetupMatches(
  meetupId: string,
  callback: (matches: MeetupMatch[]) => void
): () => void {
  const matchesRef = collection(db, 'meetups', meetupId, 'matches');
  const q = query(matchesRef, orderBy('createdAt', 'asc'));

  return onSnapshot(q, (snapshot) => {
    const matches = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as MeetupMatch[];
    callback(matches);
  });
}

/**
 * Delete a match
 */
export async function deleteMeetupMatch(
  meetupId: string,
  matchId: string
): Promise<void> {
  const matchRef = doc(db, 'meetups', meetupId, 'matches', matchId);
  await deleteDoc(matchRef);
}

// ============================================
// SCORE SUBMISSION & CONFIRMATION
// ============================================

/**
 * Submit score for a match
 * - If submitted by a player, requires opponent confirmation
 * - If submitted by organizer, completes immediately
 */
export async function submitMeetupMatchScore(
  meetupId: string,
  matchId: string,
  input: SubmitScoreInput,
  isOrganizer: boolean,
  gamesPerMatch: number = 1
): Promise<void> {
  const matchRef = doc(db, 'meetups', meetupId, 'matches', matchId);
  const matchSnap = await getDoc(matchRef);

  if (!matchSnap.exists()) {
    throw new Error('Match not found');
  }

  const match = { id: matchSnap.id, ...matchSnap.data() } as MeetupMatch;

  // Validate submitter is participant or organizer
  const isPlayer = input.odUserId === match.player1Id || input.odUserId === match.player2Id;
  if (!isPlayer && !isOrganizer) {
    throw new Error('Only match participants or organizer can submit scores');
  }

  // Calculate winner
  const result = determineWinner(
    input.games,
    match.player1Id,
    match.player1Name,
    match.player2Id,
    match.player2Name,
    gamesPerMatch
  );

  const now = Date.now();

  if (isOrganizer) {
    // Organizer submission - complete immediately
    await updateDoc(matchRef, {
      games: input.games,
      winnerId: result.winnerId,
      winnerName: result.winnerName,
      isDraw: result.isDraw,
      status: 'completed',
      submittedBy: input.odUserId,
      submittedByName: input.odUserName,
      submittedAt: now,
      confirmedBy: input.odUserId, // Organizer confirms their own submission
      confirmedAt: now,
      completedAt: now,
      updatedAt: now,
    });
  } else {
    // Player submission - requires opponent confirmation
    await updateDoc(matchRef, {
      games: input.games,
      winnerId: result.winnerId,
      winnerName: result.winnerName,
      isDraw: result.isDraw,
      status: 'pending_confirmation',
      submittedBy: input.odUserId,
      submittedByName: input.odUserName,
      submittedAt: now,
      updatedAt: now,
    });
  }
}

/**
 * Confirm a submitted score (by opponent)
 */
export async function confirmMeetupMatchScore(
  meetupId: string,
  matchId: string,
  confirmerId: string,
  isOrganizer: boolean
): Promise<void> {
  const matchRef = doc(db, 'meetups', meetupId, 'matches', matchId);
  const matchSnap = await getDoc(matchRef);

  if (!matchSnap.exists()) {
    throw new Error('Match not found');
  }

  const match = { id: matchSnap.id, ...matchSnap.data() } as MeetupMatch;

  if (match.status !== 'pending_confirmation') {
    throw new Error('Match is not pending confirmation');
  }

  // Validate confirmer is opponent or organizer
  const isOpponent =
    (confirmerId === match.player1Id && match.submittedBy === match.player2Id) ||
    (confirmerId === match.player2Id && match.submittedBy === match.player1Id);

  if (!isOpponent && !isOrganizer) {
    throw new Error('Only the opponent or organizer can confirm scores');
  }

  const now = Date.now();

  await updateDoc(matchRef, {
    status: 'completed',
    confirmedBy: confirmerId,
    confirmedAt: now,
    completedAt: now,
    updatedAt: now,
  });
}

/**
 * Dispute a submitted score (by opponent)
 */
export async function disputeMeetupMatchScore(
  meetupId: string,
  matchId: string,
  odUserId: string,
  reason?: string
): Promise<void> {
  const matchRef = doc(db, 'meetups', meetupId, 'matches', matchId);
  const matchSnap = await getDoc(matchRef);

  if (!matchSnap.exists()) {
    throw new Error('Match not found');
  }

  const match = { id: matchSnap.id, ...matchSnap.data() } as MeetupMatch;

  if (match.status !== 'pending_confirmation') {
    throw new Error('Match is not pending confirmation');
  }

  // Validate disputer is opponent
  const isOpponent =
    (odUserId === match.player1Id && match.submittedBy === match.player2Id) ||
    (odUserId === match.player2Id && match.submittedBy === match.player1Id);

  if (!isOpponent) {
    throw new Error('Only the opponent can dispute scores');
  }

  await updateDoc(matchRef, {
    status: 'disputed',
    disputedBy: odUserId,
    disputeReason: reason || null,
    updatedAt: Date.now(),
  });
}

/**
 * Resolve a disputed match (organizer only)
 */
export async function resolveMeetupMatchDispute(
  meetupId: string,
  matchId: string,
  organizerId: string,
  games: GameScore[],
  gamesPerMatch: number = 1
): Promise<void> {
  const matchRef = doc(db, 'meetups', meetupId, 'matches', matchId);
  const matchSnap = await getDoc(matchRef);

  if (!matchSnap.exists()) {
    throw new Error('Match not found');
  }

  const match = { id: matchSnap.id, ...matchSnap.data() } as MeetupMatch;

  // Calculate winner with new scores
  const result = determineWinner(
    games,
    match.player1Id,
    match.player1Name,
    match.player2Id,
    match.player2Name,
    gamesPerMatch
  );

  const now = Date.now();

  await updateDoc(matchRef, {
    games,
    winnerId: result.winnerId,
    winnerName: result.winnerName,
    isDraw: result.isDraw,
    status: 'completed',
    resolvedBy: organizerId,
    resolvedAt: now,
    completedAt: now,
    updatedAt: now,
  });
}

/**
 * Cancel a match
 */
export async function cancelMeetupMatch(
  meetupId: string,
  matchId: string
): Promise<void> {
  const matchRef = doc(db, 'meetups', meetupId, 'matches', matchId);

  await updateDoc(matchRef, {
    status: 'cancelled',
    updatedAt: Date.now(),
  });
}

// ============================================
// ROUND ROBIN SCHEDULE GENERATION
// ============================================

/**
 * Generate round robin matches for all attendees
 * Uses circle method for balanced scheduling
 */
export async function generateRoundRobinMatches(
  meetupId: string,
  attendees: { odUserId: string; odUserName: string }[]
): Promise<string[]> {
  const players = [...attendees];
  
  // Add bye player if odd number
  if (players.length % 2 !== 0) {
    players.push({ odUserId: 'BYE', odUserName: 'BYE' });
  }

  const n = players.length;
  const rounds = n - 1;
  const matchesPerRound = n / 2;
  const matchIds: string[] = [];

  // Circle method: fix first player, rotate rest
  for (let round = 0; round < rounds; round++) {
    for (let match = 0; match < matchesPerRound; match++) {
      const home = match === 0 ? 0 : (round + match) % (n - 1) + 1;
      const away = (round + n - 1 - match) % (n - 1) + 1;

      const player1 = players[home];
      const player2 = players[away === 0 ? n - 1 : away];

      // Skip bye matches
      if (player1.odUserId === 'BYE' || player2.odUserId === 'BYE') {
        continue;
      }

      const matchId = await createMeetupMatch({
        meetupId,
        player1Id: player1.odUserId,
        player1Name: player1.odUserName,
        player2Id: player2.odUserId,
        player2Name: player2.odUserName,
        round: round + 1,
      });

      matchIds.push(matchId);
    }
  }

  return matchIds;
}

/**
 * Clear all matches for a meetup (use with caution!)
 */
export async function clearMeetupMatches(meetupId: string): Promise<void> {
  const matches = await getMeetupMatches(meetupId);
  
  const deletePromises = matches.map((match) =>
    deleteMeetupMatch(meetupId, match.id)
  );

  await Promise.all(deletePromises);
}
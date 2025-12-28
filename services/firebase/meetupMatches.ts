/**
 * Meetup Matches Service
 *
 * Firebase functions for managing meetup matches and scoring.
 * Includes match generation for all formats and standings persistence.
 *
 * FILE LOCATION: services/firebase/meetupMatches.ts
 * VERSION: V06.16
 */

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  setDoc,
  query,
  orderBy,
  onSnapshot,
  increment,
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
  
  // Players (for singles - player1 vs player2)
  player1Id: string;
  player1Name: string;
  player1DuprId?: string;  // DUPR ID for submission
  player2Id: string;
  player2Name: string;
  player2DuprId?: string;  // DUPR ID for submission
  
  // For doubles matches (optional partner info)
  player1PartnerId?: string;
  player1PartnerName?: string;
  player1PartnerDuprId?: string;
  player2PartnerId?: string;
  player2PartnerName?: string;
  player2PartnerDuprId?: string;
  
  // Match type (required for DUPR)
  matchType: 'SINGLES' | 'DOUBLES';
  
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
  
  // DUPR submission tracking
  duprSubmitted: boolean;
  duprMatchId?: string;
  duprSubmittedAt?: number;
  duprSubmittedBy?: string;
  duprError?: string;
  
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
  matchType: 'SINGLES' | 'DOUBLES';
  
  // Player 1 / Team 1
  player1Id: string;
  player1Name: string;
  player1DuprId?: string;
  player1PartnerId?: string;      // For doubles
  player1PartnerName?: string;    // For doubles
  player1PartnerDuprId?: string;  // For doubles
  
  // Player 2 / Team 2
  player2Id: string;
  player2Name: string;
  player2DuprId?: string;
  player2PartnerId?: string;      // For doubles
  player2PartnerName?: string;    // For doubles
  player2PartnerDuprId?: string;  // For doubles
  
  // Optional scheduling
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
    matchType: input.matchType || 'SINGLES',
    
    // Player 1 / Team 1
    player1Id: input.player1Id,
    player1Name: input.player1Name,
    player1DuprId: input.player1DuprId || null,
    player1PartnerId: input.player1PartnerId || null,
    player1PartnerName: input.player1PartnerName || null,
    player1PartnerDuprId: input.player1PartnerDuprId || null,
    
    // Player 2 / Team 2
    player2Id: input.player2Id,
    player2Name: input.player2Name,
    player2DuprId: input.player2DuprId || null,
    player2PartnerId: input.player2PartnerId || null,
    player2PartnerName: input.player2PartnerName || null,
    player2PartnerDuprId: input.player2PartnerDuprId || null,
    
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
    
    // DUPR tracking
    duprSubmitted: false,
    duprMatchId: null,
    duprSubmittedAt: null,
    duprSubmittedBy: null,
    duprError: null,
    
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

    // Update standings
    const completedMatch: MeetupMatch = {
      ...match,
      games: input.games,
      winnerId: result.winnerId,
      winnerName: result.winnerName,
      isDraw: result.isDraw,
      status: 'completed',
    };
    await updateMeetupStandings(meetupId, completedMatch);
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

  // Update standings with the confirmed match
  const completedMatch: MeetupMatch = {
    ...match,
    status: 'completed',
  };
  await updateMeetupStandings(meetupId, completedMatch);
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

  // Update standings with the resolved match
  const completedMatch: MeetupMatch = {
    ...match,
    games,
    winnerId: result.winnerId,
    winnerName: result.winnerName,
    isDraw: result.isDraw,
    status: 'completed',
  };
  await updateMeetupStandings(meetupId, completedMatch);
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
  attendees: { odUserId: string; odUserName: string; duprId?: string }[]
): Promise<string[]> {
  const players = [...attendees];
  
  // Add bye player if odd number
  if (players.length % 2 !== 0) {
    players.push({ odUserId: 'BYE', odUserName: 'BYE', duprId: undefined });
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
        matchType: 'SINGLES', // Default to singles for round robin
        player1Id: player1.odUserId,
        player1Name: player1.odUserName,
        player1DuprId: player1.duprId,
        player2Id: player2.odUserId,
        player2Name: player2.odUserName,
        player2DuprId: player2.duprId,
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

// ============================================
// DUPR SUBMISSION HELPERS
// ============================================

/**
 * Check if a match is eligible for DUPR submission
 * Requirements:
 * - Match must be completed
 * - All players must have DUPR IDs
 * - At least one side scored 6+ points in a game
 * - Match not already submitted
 */
export function isDuprEligible(match: MeetupMatch): { 
  eligible: boolean; 
  reason?: string 
} {
  // Must be completed
  if (match.status !== 'completed') {
    return { eligible: false, reason: 'Match not completed' };
  }
  
  // Already submitted
  if (match.duprSubmitted) {
    return { eligible: false, reason: 'Already submitted to DUPR' };
  }
  
  // Check DUPR IDs based on match type
  if (match.matchType === 'SINGLES') {
    if (!match.player1DuprId || !match.player2DuprId) {
      return { eligible: false, reason: 'All players must have linked DUPR accounts' };
    }
  } else {
    // Doubles - all 4 players need DUPR IDs
    if (!match.player1DuprId || !match.player2DuprId || 
        !match.player1PartnerDuprId || !match.player2PartnerDuprId) {
      return { eligible: false, reason: 'All players must have linked DUPR accounts' };
    }
  }
  
  // Check minimum score (at least one side scored 6+)
  const hasMinScore = match.games.some(
    game => game.player1 >= 6 || game.player2 >= 6
  );
  
  if (!hasMinScore) {
    return { eligible: false, reason: 'At least one side must score 6+ points' };
  }
  
  return { eligible: true };
}

/**
 * Mark a match as submitted to DUPR
 */
export async function markMatchDuprSubmitted(
  meetupId: string,
  matchId: string,
  duprMatchId: string,
  submittedBy: string
): Promise<void> {
  const matchRef = doc(db, 'meetups', meetupId, 'matches', matchId);
  
  await updateDoc(matchRef, {
    duprSubmitted: true,
    duprMatchId,
    duprSubmittedAt: Date.now(),
    duprSubmittedBy: submittedBy,
    duprError: null,
    updatedAt: Date.now(),
  });
}

/**
 * Mark a match DUPR submission as failed
 */
export async function markMatchDuprFailed(
  meetupId: string,
  matchId: string,
  error: string
): Promise<void> {
  const matchRef = doc(db, 'meetups', meetupId, 'matches', matchId);
  
  await updateDoc(matchRef, {
    duprSubmitted: false,
    duprError: error,
    updatedAt: Date.now(),
  });
}

/**
 * Get all DUPR-eligible matches for a meetup
 */
export async function getDuprEligibleMatches(meetupId: string): Promise<MeetupMatch[]> {
  const matches = await getMeetupMatches(meetupId);
  return matches.filter(m => isDuprEligible(m).eligible);
}

/**
 * Get count of matches by DUPR status
 */
export function getDuprMatchStats(matches: MeetupMatch[]): {
  total: number;
  completed: number;
  eligible: number;
  submitted: number;
  pending: number;
} {
  const completed = matches.filter(m => m.status === 'completed');
  const eligible = completed.filter(m => isDuprEligible(m).eligible);
  const submitted = matches.filter(m => m.duprSubmitted);

  return {
    total: matches.length,
    completed: completed.length,
    eligible: eligible.length,
    submitted: submitted.length,
    pending: eligible.length - submitted.length,
  };
}

// ============================================
// STANDINGS TYPES & PERSISTENCE
// ============================================

export interface MeetupStanding {
  odUserId: string;
  name: string;
  duprId?: string;
  rank: number;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  gamesWon: number;
  gamesLost: number;
  gameDiff: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
  points: number; // Standings points (e.g., 2 per win, 1 per draw)
  updatedAt: number;
}

export interface StandingsSettings {
  pointsPerWin?: number;
  pointsPerDraw?: number;
  pointsPerLoss?: number;
}

/**
 * Initialize standings for all confirmed attendees
 */
export async function initializeMeetupStandings(
  meetupId: string,
  attendees: { odUserId: string; odUserName: string; duprId?: string }[]
): Promise<void> {
  const standingsRef = collection(db, 'meetups', meetupId, 'standings');
  const now = Date.now();

  const promises = attendees.map((attendee, index) =>
    setDoc(doc(standingsRef, attendee.odUserId), {
      odUserId: attendee.odUserId,
      name: attendee.odUserName,
      duprId: attendee.duprId || null,
      rank: index + 1,
      played: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      gamesWon: 0,
      gamesLost: 0,
      gameDiff: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDiff: 0,
      points: 0,
      updatedAt: now,
    })
  );

  await Promise.all(promises);
}

/**
 * Update standings after a match is completed
 */
export async function updateMeetupStandings(
  meetupId: string,
  match: MeetupMatch,
  settings: StandingsSettings = {}
): Promise<void> {
  const pointsPerWin = settings.pointsPerWin ?? 2;
  const pointsPerDraw = settings.pointsPerDraw ?? 1;
  const pointsPerLoss = settings.pointsPerLoss ?? 0;

  const standingsRef = collection(db, 'meetups', meetupId, 'standings');
  const now = Date.now();

  // Calculate game stats
  let p1GamesWon = 0;
  let p2GamesWon = 0;
  let p1PointsFor = 0;
  let p2PointsFor = 0;

  match.games.forEach((game) => {
    if (game.player1 > game.player2) p1GamesWon++;
    else if (game.player2 > game.player1) p2GamesWon++;
    p1PointsFor += game.player1;
    p2PointsFor += game.player2;
  });

  // Determine points based on result
  let p1Points = 0;
  let p2Points = 0;
  let p1WinInc = 0;
  let p2WinInc = 0;
  let p1LossInc = 0;
  let p2LossInc = 0;
  let p1DrawInc = 0;
  let p2DrawInc = 0;

  if (match.isDraw) {
    p1Points = pointsPerDraw;
    p2Points = pointsPerDraw;
    p1DrawInc = 1;
    p2DrawInc = 1;
  } else if (match.winnerId === match.player1Id) {
    p1Points = pointsPerWin;
    p2Points = pointsPerLoss;
    p1WinInc = 1;
    p2LossInc = 1;
  } else if (match.winnerId === match.player2Id) {
    p1Points = pointsPerLoss;
    p2Points = pointsPerWin;
    p1LossInc = 1;
    p2WinInc = 1;
  }

  // Update player 1 standings
  const p1Ref = doc(standingsRef, match.player1Id);
  await updateDoc(p1Ref, {
    played: increment(1),
    wins: increment(p1WinInc),
    losses: increment(p1LossInc),
    draws: increment(p1DrawInc),
    gamesWon: increment(p1GamesWon),
    gamesLost: increment(p2GamesWon),
    pointsFor: increment(p1PointsFor),
    pointsAgainst: increment(p2PointsFor),
    points: increment(p1Points),
    updatedAt: now,
  }).catch(async () => {
    // If doc doesn't exist, create it
    await setDoc(p1Ref, {
      odUserId: match.player1Id,
      name: match.player1Name,
      duprId: match.player1DuprId || null,
      rank: 0,
      played: 1,
      wins: p1WinInc,
      losses: p1LossInc,
      draws: p1DrawInc,
      gamesWon: p1GamesWon,
      gamesLost: p2GamesWon,
      gameDiff: p1GamesWon - p2GamesWon,
      pointsFor: p1PointsFor,
      pointsAgainst: p2PointsFor,
      pointDiff: p1PointsFor - p2PointsFor,
      points: p1Points,
      updatedAt: now,
    });
  });

  // Update player 2 standings
  const p2Ref = doc(standingsRef, match.player2Id);
  await updateDoc(p2Ref, {
    played: increment(1),
    wins: increment(p2WinInc),
    losses: increment(p2LossInc),
    draws: increment(p2DrawInc),
    gamesWon: increment(p2GamesWon),
    gamesLost: increment(p1GamesWon),
    pointsFor: increment(p2PointsFor),
    pointsAgainst: increment(p1PointsFor),
    points: increment(p2Points),
    updatedAt: now,
  }).catch(async () => {
    // If doc doesn't exist, create it
    await setDoc(p2Ref, {
      odUserId: match.player2Id,
      name: match.player2Name,
      duprId: match.player2DuprId || null,
      rank: 0,
      played: 1,
      wins: p2WinInc,
      losses: p2LossInc,
      draws: p2DrawInc,
      gamesWon: p2GamesWon,
      gamesLost: p1GamesWon,
      gameDiff: p2GamesWon - p1GamesWon,
      pointsFor: p2PointsFor,
      pointsAgainst: p1PointsFor,
      pointDiff: p2PointsFor - p1PointsFor,
      points: p2Points,
      updatedAt: now,
    });
  });
}

/**
 * Get standings for a meetup
 */
export async function getMeetupStandings(meetupId: string): Promise<MeetupStanding[]> {
  const standingsRef = collection(db, 'meetups', meetupId, 'standings');
  const snapshot = await getDocs(standingsRef);

  const standings = snapshot.docs.map((doc) => ({
    ...doc.data(),
    gameDiff: (doc.data().gamesWon || 0) - (doc.data().gamesLost || 0),
    pointDiff: (doc.data().pointsFor || 0) - (doc.data().pointsAgainst || 0),
  })) as MeetupStanding[];

  // Sort by points, then wins, then game diff, then point diff
  standings.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.gameDiff !== a.gameDiff) return b.gameDiff - a.gameDiff;
    return b.pointDiff - a.pointDiff;
  });

  // Assign ranks
  standings.forEach((s, index) => {
    s.rank = index + 1;
  });

  return standings;
}

/**
 * Subscribe to standings for real-time updates
 */
export function subscribeToMeetupStandings(
  meetupId: string,
  callback: (standings: MeetupStanding[]) => void
): () => void {
  const standingsRef = collection(db, 'meetups', meetupId, 'standings');

  return onSnapshot(standingsRef, (snapshot) => {
    const standings = snapshot.docs.map((doc) => ({
      ...doc.data(),
      gameDiff: (doc.data().gamesWon || 0) - (doc.data().gamesLost || 0),
      pointDiff: (doc.data().pointsFor || 0) - (doc.data().pointsAgainst || 0),
    })) as MeetupStanding[];

    // Sort by points, then wins, then game diff, then point diff
    standings.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.gameDiff !== a.gameDiff) return b.gameDiff - a.gameDiff;
      return b.pointDiff - a.pointDiff;
    });

    // Assign ranks
    standings.forEach((s, index) => {
      s.rank = index + 1;
    });

    callback(standings);
  });
}

/**
 * Clear all standings for a meetup
 */
export async function clearMeetupStandings(meetupId: string): Promise<void> {
  const standingsRef = collection(db, 'meetups', meetupId, 'standings');
  const snapshot = await getDocs(standingsRef);

  const promises = snapshot.docs.map((doc) => deleteDoc(doc.ref));
  await Promise.all(promises);
}

// ============================================
// ELIMINATION BRACKET GENERATION
// ============================================

export interface EliminationAttendee {
  odUserId: string;
  odUserName: string;
  duprId?: string;
  duprRating?: number;
}

/**
 * Calculate bracket size (power of 2)
 */
function calculateBracketSize(numParticipants: number): number {
  if (numParticipants <= 2) return 2;
  return Math.pow(2, Math.ceil(Math.log2(numParticipants)));
}

/**
 * Generate seed positions for bracket placement
 * Places top seeds to meet as late as possible
 */
function generateSeedPositions(bracketSize: number): number[] {
  if (bracketSize === 2) return [1, 2];

  const halfSize = bracketSize / 2;
  const topHalf = generateSeedPositions(halfSize);
  const bottomHalf = topHalf.map(seed => bracketSize + 1 - seed);

  const result: number[] = [];
  for (let i = 0; i < halfSize; i++) {
    result.push(topHalf[i], bottomHalf[i]);
  }

  return result;
}

/**
 * Seed attendees by DUPR rating (highest first)
 */
function seedByDupr(attendees: EliminationAttendee[]): EliminationAttendee[] {
  const withRating = attendees.filter(a => a.duprRating != null);
  const withoutRating = attendees.filter(a => a.duprRating == null);

  withRating.sort((a, b) => (b.duprRating ?? 0) - (a.duprRating ?? 0));

  return [...withRating, ...withoutRating];
}

/**
 * Generate single elimination bracket matches
 */
export async function generateSingleEliminationMatches(
  meetupId: string,
  attendees: EliminationAttendee[]
): Promise<{ matchIds: string[]; rounds: number; bracketSize: number }> {
  if (attendees.length < 2) {
    throw new Error('Need at least 2 players to generate bracket');
  }

  // Seed by DUPR rating
  const seededAttendees = seedByDupr([...attendees]);

  // Calculate bracket structure
  const bracketSize = calculateBracketSize(attendees.length);
  const numRounds = Math.log2(bracketSize);
  const seedPositions = generateSeedPositions(bracketSize);

  // Place attendees in bracket positions (null for byes)
  const placement: (EliminationAttendee | null)[] = new Array(bracketSize).fill(null);
  seedPositions.forEach((seed, index) => {
    if (seed <= seededAttendees.length) {
      placement[index] = seededAttendees[seed - 1];
    }
  });

  const matchIds: string[] = [];

  // Track match IDs by round and position for linking
  const matchIdsByRoundPos: Map<string, string> = new Map();

  // Generate first round matches
  const firstRoundMatches = bracketSize / 2;

  for (let i = 0; i < firstRoundMatches; i++) {
    const player1 = placement[i * 2];
    const player2 = placement[i * 2 + 1];

    // Skip pure bye matches (both null - shouldn't happen)
    // For single bye, still create match but mark status appropriately
    const isBye = !player1 || !player2;

    const matchId = await createMeetupMatch({
      meetupId,
      matchType: 'SINGLES',
      player1Id: player1?.odUserId || 'BYE',
      player1Name: player1?.odUserName || 'BYE',
      player1DuprId: player1?.duprId,
      player2Id: player2?.odUserId || 'BYE',
      player2Name: player2?.odUserName || 'BYE',
      player2DuprId: player2?.duprId,
      round: 1,
    });

    matchIds.push(matchId);
    matchIdsByRoundPos.set(`1-${i}`, matchId);

    // Auto-complete bye matches
    if (isBye) {
      const winnerId = player1 ? player1.odUserId : player2?.odUserId;
      const winnerName = player1 ? player1.odUserName : player2?.odUserName;

      if (winnerId && winnerName) {
        const matchRef = doc(db, 'meetups', meetupId, 'matches', matchId);
        await updateDoc(matchRef, {
          winnerId,
          winnerName,
          status: 'completed',
          completedAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }
  }

  // Generate subsequent rounds (placeholders)
  let prevRoundMatches = firstRoundMatches;
  for (let round = 2; round <= numRounds; round++) {
    const thisRoundMatches = prevRoundMatches / 2;

    for (let i = 0; i < thisRoundMatches; i++) {
      const matchId = await createMeetupMatch({
        meetupId,
        matchType: 'SINGLES',
        player1Id: 'TBD',
        player1Name: 'TBD',
        player2Id: 'TBD',
        player2Name: 'TBD',
        round,
      });

      matchIds.push(matchId);
      matchIdsByRoundPos.set(`${round}-${i}`, matchId);
    }

    prevRoundMatches = thisRoundMatches;
  }

  return { matchIds, rounds: numRounds, bracketSize };
}

/**
 * Get round name for display
 */
export function getEliminationRoundName(roundNumber: number, totalRounds: number): string {
  const roundsFromEnd = totalRounds - roundNumber;

  switch (roundsFromEnd) {
    case 0:
      return 'Finals';
    case 1:
      return 'Semi-Finals';
    case 2:
      return 'Quarter-Finals';
    default:
      return `Round ${roundNumber}`;
  }
}

/**
 * Advance winner to next round in elimination bracket
 */
export async function advanceEliminationWinner(
  meetupId: string,
  completedMatch: MeetupMatch,
  allMatches: MeetupMatch[]
): Promise<void> {
  if (!completedMatch.winnerId || !completedMatch.round) return;

  // Find the next round match
  const currentRound = completedMatch.round;
  const nextRound = currentRound + 1;

  // Find matches in next round
  const nextRoundMatches = allMatches
    .filter(m => m.round === nextRound)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  if (nextRoundMatches.length === 0) return;

  // Find which position this match feeds into
  // Matches in current round are paired: 0,1 -> 0; 2,3 -> 1; etc.
  const currentRoundMatches = allMatches
    .filter(m => m.round === currentRound)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  const matchIndex = currentRoundMatches.findIndex(m => m.id === completedMatch.id);
  if (matchIndex === -1) return;

  const nextMatchIndex = Math.floor(matchIndex / 2);
  const slot = matchIndex % 2 === 0 ? 'player1' : 'player2';

  const nextMatch = nextRoundMatches[nextMatchIndex];
  if (!nextMatch) return;

  // Get winner info
  const winnerIsPlayer1 = completedMatch.winnerId === completedMatch.player1Id;
  const winnerId = completedMatch.winnerId;
  const winnerName = winnerIsPlayer1 ? completedMatch.player1Name : completedMatch.player2Name;
  const winnerDuprId = winnerIsPlayer1 ? completedMatch.player1DuprId : completedMatch.player2DuprId;

  // Update next match
  const matchRef = doc(db, 'meetups', meetupId, 'matches', nextMatch.id);
  const updateData: any = {
    updatedAt: Date.now(),
  };

  if (slot === 'player1') {
    updateData.player1Id = winnerId;
    updateData.player1Name = winnerName;
    updateData.player1DuprId = winnerDuprId || null;
  } else {
    updateData.player2Id = winnerId;
    updateData.player2Name = winnerName;
    updateData.player2DuprId = winnerDuprId || null;
  }

  await updateDoc(matchRef, updateData);
}
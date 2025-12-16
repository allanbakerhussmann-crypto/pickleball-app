/**
 * League Firebase Services
 * 
 * Database operations for the Leagues feature.
 * 
 * FILE LOCATION: services/firebase/leagues.ts
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  updateDoc,
  deleteDoc,
  writeBatch,
  increment,
  collectionGroup,
} from '@firebase/firestore';
import { db } from './config';
import type {
  League,
  LeagueMember,
  LeagueMatch,
  LeagueChallenge,
  LeagueSettings,
  LeagueStatus,
  LeagueType,
  MemberStats,
  GameScore,
} from '../../types';

// ============================================
// LEAGUE CRUD
// ============================================

/**
 * Create a new league
 */
export const createLeague = async (
  league: Omit<League, 'id' | 'createdAt' | 'updatedAt' | 'memberCount' | 'matchesPlayed'>
): Promise<string> => {
  const leagueRef = doc(collection(db, 'leagues'));
  const now = Date.now();
  
  const newLeague: League = {
    ...league,
    id: leagueRef.id,
    memberCount: 0,
    matchesPlayed: 0,
    createdAt: now,
    updatedAt: now,
  };
  
  await setDoc(leagueRef, newLeague);
  return leagueRef.id;
};

/**
 * Get a single league by ID
 */
export const getLeague = async (leagueId: string): Promise<League | null> => {
  const docSnap = await getDoc(doc(db, 'leagues', leagueId));
  if (!docSnap.exists()) return null;
  return docSnap.data() as League;
};

/**
 * Update league details
 */
export const updateLeague = async (
  leagueId: string,
  updates: Partial<League>
): Promise<void> => {
  await updateDoc(doc(db, 'leagues', leagueId), {
    ...updates,
    updatedAt: Date.now(),
  });
};

/**
 * Delete a league (and all its data)
 */
export const deleteLeague = async (leagueId: string): Promise<void> => {
  const batch = writeBatch(db);
  
  // Delete league document
  batch.delete(doc(db, 'leagues', leagueId));
  
  // Delete all members
  const membersSnap = await getDocs(collection(db, 'leagues', leagueId, 'members'));
  membersSnap.forEach(docSnap => batch.delete(docSnap.ref));
  
  // Delete all matches
  const matchesSnap = await getDocs(collection(db, 'leagues', leagueId, 'matches'));
  matchesSnap.forEach(docSnap => batch.delete(docSnap.ref));
  
  // Delete all challenges
  const challengesSnap = await getDocs(collection(db, 'leagues', leagueId, 'challenges'));
  challengesSnap.forEach(docSnap => batch.delete(docSnap.ref));
  
  await batch.commit();
};

/**
 * Get all leagues (with optional filters)
 */
export const getLeagues = async (filters?: {
  type?: LeagueType;
  status?: LeagueStatus;
  clubId?: string;
  createdByUserId?: string;
  limit?: number;
}): Promise<League[]> => {
  let q = query(collection(db, 'leagues'), orderBy('createdAt', 'desc'));
  
  if (filters?.limit) {
    q = query(q, limit(filters.limit));
  }
  
  const snap = await getDocs(q);
  let leagues = snap.docs.map(d => d.data() as League);
  
  // Apply filters in memory (Firestore has limitations on compound queries)
  if (filters?.type) {
    leagues = leagues.filter(l => l.type === filters.type);
  }
  if (filters?.status) {
    leagues = leagues.filter(l => l.status === filters.status);
  }
  if (filters?.clubId) {
    leagues = leagues.filter(l => l.clubId === filters.clubId);
  }
  if (filters?.createdByUserId) {
    leagues = leagues.filter(l => l.createdByUserId === filters.createdByUserId);
  }
  
  return leagues;
};

/**
 * Subscribe to leagues list
 */
export const subscribeToLeagues = (
  callback: (leagues: League[]) => void,
  filters?: { status?: LeagueStatus }
): (() => void) => {
  const q = query(collection(db, 'leagues'), orderBy('createdAt', 'desc'));
  
  return onSnapshot(q, (snap) => {
    let leagues = snap.docs.map(d => d.data() as League);
    
    if (filters?.status) {
      leagues = leagues.filter(l => l.status === filters.status);
    }
    
    callback(leagues);
  });
};

// ============================================
// LEAGUE MEMBERSHIP
// ============================================

/**
 * Join a league
 */
export const joinLeague = async (
  leagueId: string,
  userId: string,
  displayName: string,
  partnerUserId?: string,
  partnerDisplayName?: string
): Promise<string> => {
  const memberRef = doc(collection(db, 'leagues', leagueId, 'members'));
  const now = Date.now();
  
  // Get current member count for initial rank
  const league = await getLeague(leagueId);
  const initialRank = (league?.memberCount || 0) + 1;
  
  const emptyStats: MemberStats = {
    played: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    points: 0,
    gamesWon: 0,
    gamesLost: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    currentStreak: 0,
    bestWinStreak: 0,
    recentForm: [],
  };
  
  const newMember: LeagueMember = {
    id: memberRef.id,
    leagueId,
    userId,
    partnerUserId: partnerUserId || null,
    displayName,
    partnerDisplayName: partnerDisplayName || null,
    status: 'active',
    role: 'member',
    currentRank: initialRank,
    stats: emptyStats,
    joinedAt: now,
    lastActiveAt: now,
  };
  
  await setDoc(memberRef, newMember);
  
  // Increment league member count
  await updateDoc(doc(db, 'leagues', leagueId), {
    memberCount: increment(1),
    updatedAt: now,
  });
  
  return memberRef.id;
};

/**
 * Leave a league
 */
export const leaveLeague = async (
  leagueId: string,
  memberId: string
): Promise<void> => {
  await updateDoc(doc(db, 'leagues', leagueId, 'members', memberId), {
    status: 'withdrawn',
  });
  
  // Decrement member count
  await updateDoc(doc(db, 'leagues', leagueId), {
    memberCount: increment(-1),
    updatedAt: Date.now(),
  });
};

/**
 * Get league member by user ID
 */
export const getLeagueMemberByUserId = async (
  leagueId: string,
  userId: string
): Promise<LeagueMember | null> => {
  const q = query(
    collection(db, 'leagues', leagueId, 'members'),
    where('userId', '==', userId),
    where('status', '==', 'active'),
    limit(1)
  );
  
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].data() as LeagueMember;
};

/**
 * Get all members of a league
 */
export const getLeagueMembers = async (
  leagueId: string,
  sortBy: 'rank' | 'points' | 'joined' = 'rank'
): Promise<LeagueMember[]> => {
  const q = query(
    collection(db, 'leagues', leagueId, 'members'),
    where('status', '==', 'active'),
    orderBy('currentRank', 'asc')
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as LeagueMember);
};

/**
 * Subscribe to league members (for real-time standings)
 */
export const subscribeToLeagueMembers = (
  leagueId: string,
  callback: (members: LeagueMember[]) => void
): (() => void) => {
  const q = query(
    collection(db, 'leagues', leagueId, 'members'),
    where('status', '==', 'active'),
    orderBy('currentRank', 'asc')
  );
  
  return onSnapshot(q, (snap) => {
    const members = snap.docs.map(d => d.data() as LeagueMember);
    callback(members);
  });
};

/**
 * Update member stats after a match
 */
export const updateMemberStats = async (
  leagueId: string,
  memberId: string,
  statsUpdate: Partial<MemberStats>,
  newRank?: number
): Promise<void> => {
  const memberRef = doc(db, 'leagues', leagueId, 'members', memberId);
  const updates: Record<string, any> = {
    lastActiveAt: Date.now(),
  };
  
  // Update individual stats fields
  Object.entries(statsUpdate).forEach(([key, value]) => {
    updates[`stats.${key}`] = value;
  });
  
  if (newRank !== undefined) {
    const memberDoc = await getDoc(memberRef);
    if (memberDoc.exists()) {
      updates.previousRank = memberDoc.data()?.currentRank;
    }
    updates.currentRank = newRank;
  }
  
  await updateDoc(memberRef, updates);
};

// ============================================
// LEAGUE MATCHES
// ============================================

/**
 * Create a league match
 */
export const createLeagueMatch = async (
  leagueId: string,
  match: Omit<LeagueMatch, 'id' | 'createdAt'>
): Promise<string> => {
  const matchRef = doc(collection(db, 'leagues', leagueId, 'matches'));
  
  const newMatch: LeagueMatch = {
    ...match,
    id: matchRef.id,
    createdAt: Date.now(),
  };
  
  await setDoc(matchRef, newMatch);
  return matchRef.id;
};

/**
 * Get league matches
 */
export const getLeagueMatches = async (
  leagueId: string,
  filters?: {
    memberId?: string;
    status?: string;
    weekNumber?: number;
    limit?: number;
  }
): Promise<LeagueMatch[]> => {
  let q = query(
    collection(db, 'leagues', leagueId, 'matches'),
    orderBy('createdAt', 'desc')
  );
  
  if (filters?.limit) {
    q = query(q, limit(filters.limit));
  }
  
  const snap = await getDocs(q);
  let matches = snap.docs.map(d => d.data() as LeagueMatch);
  
  // Apply filters in memory
  if (filters?.status) {
    matches = matches.filter(m => m.status === filters.status);
  }
  if (filters?.weekNumber) {
    matches = matches.filter(m => m.weekNumber === filters.weekNumber);
  }
  if (filters?.memberId) {
    matches = matches.filter(m => 
      m.memberAId === filters.memberId || m.memberBId === filters.memberId
    );
  }
  
  return matches;
};

/**
 * Subscribe to league matches
 */
export const subscribeToLeagueMatches = (
  leagueId: string,
  callback: (matches: LeagueMatch[]) => void
): (() => void) => {
  const q = query(
    collection(db, 'leagues', leagueId, 'matches'),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  
  return onSnapshot(q, (snap) => {
    const matches = snap.docs.map(d => d.data() as LeagueMatch);
    callback(matches);
  });
};

/**
 * Submit match result
 */
export const submitLeagueMatchResult = async (
  leagueId: string,
  matchId: string,
  submittedByUserId: string,
  scores: GameScore[],
  winnerMemberId: string
): Promise<void> => {
  const league = await getLeague(leagueId);
  const requireConfirmation = league?.settings.requireConfirmation ?? true;
  
  await updateDoc(doc(db, 'leagues', leagueId, 'matches', matchId), {
    scores,
    winnerMemberId,
    submittedByUserId,
    status: requireConfirmation ? 'pending_confirmation' : 'completed',
    playedAt: Date.now(),
    ...(requireConfirmation ? {} : { completedAt: Date.now() }),
  });
  
  // If no confirmation required, update stats immediately
  if (!requireConfirmation) {
    await processMatchCompletion(leagueId, matchId);
  }
};

/**
 * Confirm match result
 */
export const confirmLeagueMatchResult = async (
  leagueId: string,
  matchId: string,
  confirmedByUserId: string
): Promise<void> => {
  await updateDoc(doc(db, 'leagues', leagueId, 'matches', matchId), {
    status: 'completed',
    confirmedByUserId,
    completedAt: Date.now(),
  });
  
  await processMatchCompletion(leagueId, matchId);
};

/**
 * Dispute match result
 */
export const disputeLeagueMatchResult = async (
  leagueId: string,
  matchId: string,
  disputeReason: string
): Promise<void> => {
  await updateDoc(doc(db, 'leagues', leagueId, 'matches', matchId), {
    status: 'disputed',
    disputeReason,
  });
};

/**
 * Process completed match - update stats and rankings
 */
const processMatchCompletion = async (
  leagueId: string,
  matchId: string
): Promise<void> => {
  const matchDoc = await getDoc(doc(db, 'leagues', leagueId, 'matches', matchId));
  if (!matchDoc.exists()) return;
  
  const match = matchDoc.data() as LeagueMatch;
  const league = await getLeague(leagueId);
  if (!league) return;
  
  const winnerId = match.winnerMemberId;
  const loserId = match.memberAId === winnerId ? match.memberBId : match.memberAId;
  
  // Calculate points from scores
  let pointsForA = 0, pointsForB = 0, gamesWonA = 0, gamesWonB = 0;
  match.scores.forEach(game => {
    pointsForA += game.scoreA;
    pointsForB += game.scoreB;
    if (game.scoreA > game.scoreB) gamesWonA++;
    else if (game.scoreB > game.scoreA) gamesWonB++;
  });
  
  // Get current stats for both members
  const [memberADoc, memberBDoc] = await Promise.all([
    getDoc(doc(db, 'leagues', leagueId, 'members', match.memberAId)),
    getDoc(doc(db, 'leagues', leagueId, 'members', match.memberBId)),
  ]);
  
  const memberA = memberADoc.data() as LeagueMember;
  const memberB = memberBDoc.data() as LeagueMember;
  
  // Determine winner/loser stats
  const isAWinner = winnerId === match.memberAId;
  const winnerStats = isAWinner ? memberA.stats : memberB.stats;
  const loserStats = isAWinner ? memberB.stats : memberA.stats;
  
  const winnerPointsFor = isAWinner ? pointsForA : pointsForB;
  const winnerPointsAgainst = isAWinner ? pointsForB : pointsForA;
  const winnerGamesWon = isAWinner ? gamesWonA : gamesWonB;
  const winnerGamesLost = isAWinner ? gamesWonB : gamesWonA;
  
  const loserPointsFor = isAWinner ? pointsForB : pointsForA;
  const loserPointsAgainst = isAWinner ? pointsForA : pointsForB;
  const loserGamesWon = isAWinner ? gamesWonB : gamesWonA;
  const loserGamesLost = isAWinner ? gamesWonA : gamesWonB;
  
  // Update winner
  const newWinnerForm = [...winnerStats.recentForm.slice(-4), 'W'] as ('W' | 'L' | 'D')[];
  const newWinnerStreak = winnerStats.currentStreak >= 0 ? winnerStats.currentStreak + 1 : 1;
  
  await updateMemberStats(leagueId, winnerId!, {
    played: winnerStats.played + 1,
    wins: winnerStats.wins + 1,
    points: winnerStats.points + league.settings.pointsForWin,
    gamesWon: winnerStats.gamesWon + winnerGamesWon,
    gamesLost: winnerStats.gamesLost + winnerGamesLost,
    pointsFor: winnerStats.pointsFor + winnerPointsFor,
    pointsAgainst: winnerStats.pointsAgainst + winnerPointsAgainst,
    currentStreak: newWinnerStreak,
    bestWinStreak: Math.max(winnerStats.bestWinStreak, newWinnerStreak),
    recentForm: newWinnerForm,
  });
  
  // Update loser
  const newLoserForm = [...loserStats.recentForm.slice(-4), 'L'] as ('W' | 'L' | 'D')[];
  const newLoserStreak = loserStats.currentStreak <= 0 ? loserStats.currentStreak - 1 : -1;
  
  await updateMemberStats(leagueId, loserId, {
    played: loserStats.played + 1,
    losses: loserStats.losses + 1,
    points: loserStats.points + league.settings.pointsForLoss,
    gamesWon: loserStats.gamesWon + loserGamesWon,
    gamesLost: loserStats.gamesLost + loserGamesLost,
    pointsFor: loserStats.pointsFor + loserPointsFor,
    pointsAgainst: loserStats.pointsAgainst + loserPointsAgainst,
    currentStreak: newLoserStreak,
    recentForm: newLoserForm,
  });
  
  // For ladder format: swap ranks if lower ranked player wins
  if (league.format === 'ladder') {
    const winnerRank = isAWinner ? memberA.currentRank : memberB.currentRank;
    const loserRank = isAWinner ? memberB.currentRank : memberA.currentRank;
    
    // If winner was ranked lower (higher number), they take loser's position
    if (winnerRank > loserRank) {
      await updateMemberStats(leagueId, winnerId!, {}, loserRank);
      await updateMemberStats(leagueId, loserId, {}, winnerRank);
    }
  }
  
  // Increment league matches count
  await updateDoc(doc(db, 'leagues', leagueId), {
    matchesPlayed: increment(1),
    updatedAt: Date.now(),
  });
};

// ============================================
// CHALLENGES (Ladder format)
// ============================================

/**
 * Create a challenge
 */
export const createChallenge = async (
  leagueId: string,
  challengerMemberId: string,
  challengerUserId: string,
  challengerRank: number,
  defenderId: string,
  defenderUserId: string,
  defenderRank: number,
  daysToRespond: number = 3
): Promise<string> => {
  const challengeRef = doc(collection(db, 'leagues', leagueId, 'challenges'));
  const now = Date.now();
  
  const challenge: LeagueChallenge = {
    id: challengeRef.id,
    leagueId,
    challengerMemberId,
    challengerUserId,
    challengerRank,
    defenderId,
    defenderUserId,
    defenderRank,
    status: 'pending',
    respondByDate: now + (daysToRespond * 24 * 60 * 60 * 1000),
    createdAt: now,
  };
  
  await setDoc(challengeRef, challenge);
  return challengeRef.id;
};

/**
 * Respond to a challenge
 */
export const respondToChallenge = async (
  leagueId: string,
  challengeId: string,
  accept: boolean,
  declineReason?: string
): Promise<string | null> => {
  const challengeDoc = await getDoc(doc(db, 'leagues', leagueId, 'challenges', challengeId));
  if (!challengeDoc.exists()) throw new Error('Challenge not found');
  
  const challenge = challengeDoc.data() as LeagueChallenge;
  
  if (accept) {
    // Create a match
    const matchId = await createLeagueMatch(leagueId, {
      leagueId,
      memberAId: challenge.challengerMemberId,
      memberBId: challenge.defenderId,
      userAId: challenge.challengerUserId,
      userBId: challenge.defenderUserId,
      memberAName: '',
      memberBName: '',
      matchType: 'challenge',
      memberARankAtMatch: challenge.challengerRank,
      memberBRankAtMatch: challenge.defenderRank,
      status: 'scheduled',
      scores: [],
    });
    
    await updateDoc(doc(db, 'leagues', leagueId, 'challenges', challengeId), {
      status: 'accepted',
      matchId,
      respondedAt: Date.now(),
    });
    
    return matchId;
  } else {
    await updateDoc(doc(db, 'leagues', leagueId, 'challenges', challengeId), {
      status: 'declined',
      declineReason,
      respondedAt: Date.now(),
    });
    
    return null;
  }
};

/**
 * Get pending challenges for a user
 */
export const getPendingChallenges = async (
  leagueId: string,
  userId: string
): Promise<LeagueChallenge[]> => {
  const q = query(
    collection(db, 'leagues', leagueId, 'challenges'),
    where('status', '==', 'pending'),
    where('defenderUserId', '==', userId)
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as LeagueChallenge);
};

// ============================================
// USER'S LEAGUES
// ============================================

/**
 * Get leagues where user is a member
 */
export const getUserLeagues = async (userId: string): Promise<League[]> => {
  // This requires a collection group query on 'members'
  const q = query(
    collectionGroup(db, 'members'),
    where('userId', '==', userId),
    where('status', '==', 'active')
  );
  
  const snap = await getDocs(q);
  const leagueIds = [...new Set(snap.docs.map(d => d.data().leagueId))];
  
  if (leagueIds.length === 0) return [];
  
  const leagues = await Promise.all(
    leagueIds.map(id => getLeague(id))
  );
  
  return leagues.filter((l): l is League => l !== null);
};
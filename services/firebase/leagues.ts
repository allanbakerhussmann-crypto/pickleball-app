/**
 * League Firebase Services
 * 
 * Database operations for the Leagues feature.
 * 
 * FILE LOCATION: src/services/firebase/leagues.ts
 * VERSION: V05.17
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
} from '@firebase/firestore';
import { db } from './config';
import type {
  League,
  LeagueMember,
  LeagueMatch,
  LeagueChallenge,
  LeagueDivision,
  LeagueTeam,
  LeaguePartnerInvite,
  LeagueRegistration,
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
  
  // Delete all divisions
  const divisionsSnap = await getDocs(collection(db, 'leagues', leagueId, 'divisions'));
  divisionsSnap.forEach(docSnap => batch.delete(docSnap.ref));
  
  // Delete all teams
  const teamsSnap = await getDocs(collection(db, 'leagues', leagueId, 'teams'));
  teamsSnap.forEach(docSnap => batch.delete(docSnap.ref));
  
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
  
  if (filters?.type) {
    q = query(q, where('type', '==', filters.type));
  }
  if (filters?.status) {
    q = query(q, where('status', '==', filters.status));
  }
  if (filters?.clubId) {
    q = query(q, where('clubId', '==', filters.clubId));
  }
  if (filters?.createdByUserId) {
    q = query(q, where('createdByUserId', '==', filters.createdByUserId));
  }
  if (filters?.limit) {
    q = query(q, limit(filters.limit));
  }
  
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as League);
};

/**
 * Subscribe to leagues (real-time)
 */
export const subscribeToLeagues = (
  callback: (leagues: League[]) => void,
  filters?: { status?: LeagueStatus; clubId?: string }
): (() => void) => {
  let q = query(collection(db, 'leagues'), orderBy('createdAt', 'desc'));
  
  if (filters?.status) {
    q = query(q, where('status', '==', filters.status));
  }
  if (filters?.clubId) {
    q = query(q, where('clubId', '==', filters.clubId));
  }
  
  return onSnapshot(q, (snap) => {
    const leagues = snap.docs.map(d => d.data() as League);
    callback(leagues);
  });
};

/**
 * Get leagues for a specific user (as member)
 */
export const getUserLeagues = async (userId: string): Promise<League[]> => {
  // First get all member records for this user
  const memberQuery = query(
    collection(db, 'leagues'),
    where('status', 'in', ['registration', 'active', 'playoffs'])
  );
  
  const snap = await getDocs(memberQuery);
  const leagues: League[] = [];
  
  for (const docSnap of snap.docs) {
    const league = docSnap.data() as League;
    // Check if user is a member
    const memberCheck = await getLeagueMemberByUserId(league.id, userId);
    if (memberCheck) {
      leagues.push(league);
    }
  }
  
  return leagues;
};

// ============================================
// LEAGUE DIVISIONS
// ============================================

/**
 * Create a league division
 */
export const createLeagueDivision = async (
  leagueId: string,
  division: Omit<LeagueDivision, 'id' | 'leagueId' | 'createdAt' | 'updatedAt'>
): Promise<string> => {
  const divRef = doc(collection(db, 'leagues', leagueId, 'divisions'));
  const now = Date.now();
  
  const newDiv: LeagueDivision = {
    ...division,
    id: divRef.id,
    leagueId,
    createdAt: now,
    updatedAt: now,
  };
  
  await setDoc(divRef, newDiv);
  return divRef.id;
};

/**
 * Get all divisions for a league
 */
export const getLeagueDivisions = async (leagueId: string): Promise<LeagueDivision[]> => {
  const q = query(
    collection(db, 'leagues', leagueId, 'divisions'),
    orderBy('order', 'asc')
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as LeagueDivision);
};

/**
 * Subscribe to league divisions
 */
export const subscribeToLeagueDivisions = (
  leagueId: string,
  callback: (divisions: LeagueDivision[]) => void
): (() => void) => {
  const q = query(
    collection(db, 'leagues', leagueId, 'divisions'),
    orderBy('order', 'asc')
  );
  
  return onSnapshot(q, (snap) => {
    const divisions = snap.docs.map(d => d.data() as LeagueDivision);
    callback(divisions);
  });
};

/**
 * Update a division
 */
export const updateLeagueDivision = async (
  leagueId: string,
  divisionId: string,
  updates: Partial<LeagueDivision>
): Promise<void> => {
  await updateDoc(doc(db, 'leagues', leagueId, 'divisions', divisionId), {
    ...updates,
    updatedAt: Date.now(),
  });
};

/**
 * Delete a division
 */
export const deleteLeagueDivision = async (
  leagueId: string,
  divisionId: string
): Promise<void> => {
  await deleteDoc(doc(db, 'leagues', leagueId, 'divisions', divisionId));
};

// ============================================
// LEAGUE MEMBERS
// ============================================

/**
 * Join a league (creates a member record)
 */
export const joinLeague = async (
  leagueId: string,
  userId: string,
  displayName: string,
  divisionId?: string | null,
  partnerUserId?: string | null,
  partnerDisplayName?: string | null
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
    forfeits: 0,
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
    divisionId: divisionId || null,
    userId,
    displayName,
    partnerUserId: partnerUserId || null,
    partnerDisplayName: partnerDisplayName || null,
    status: 'active',
    role: 'member',
    paymentStatus: 'not_required',
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
  divisionId?: string | null
): Promise<LeagueMember[]> => {
  let q = query(
    collection(db, 'leagues', leagueId, 'members'),
    where('status', '==', 'active'),
    orderBy('currentRank', 'asc')
  );
  
  if (divisionId) {
    q = query(q, where('divisionId', '==', divisionId));
  }
  
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as LeagueMember);
};

/**
 * Subscribe to league members (for real-time standings)
 */
export const subscribeToLeagueMembers = (
  leagueId: string,
  callback: (members: LeagueMember[]) => void,
  divisionId?: string | null
): (() => void) => {
  let q = query(
    collection(db, 'leagues', leagueId, 'members'),
    where('status', '==', 'active'),
    orderBy('currentRank', 'asc')
  );
  
  // Note: Can't combine where with orderBy on different fields in Firestore
  // If divisionId filter needed, would need composite index
  
  return onSnapshot(q, (snap) => {
    let members = snap.docs.map(d => d.data() as LeagueMember);
    if (divisionId) {
      members = members.filter(m => m.divisionId === divisionId);
    }
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
  const updates: any = {
    lastActiveAt: Date.now(),
  };
  
  // Update stats fields
  Object.keys(statsUpdate).forEach(key => {
    updates[`stats.${key}`] = (statsUpdate as any)[key];
  });
  
  if (newRank !== undefined) {
    updates.currentRank = newRank;
  }
  
  await updateDoc(doc(db, 'leagues', leagueId, 'members', memberId), updates);
};

/**
 * Update member payment status
 */
export const updateMemberPaymentStatus = async (
  leagueId: string,
  memberId: string,
  paymentStatus: 'pending' | 'paid' | 'refunded' | 'waived',
  amountPaid?: number,
  stripeSessionId?: string
): Promise<void> => {
  const updates: any = {
    paymentStatus,
  };
  
  if (paymentStatus === 'paid') {
    updates.amountPaid = amountPaid;
    updates.paidAt = Date.now();
    if (stripeSessionId) {
      updates.stripeSessionId = stripeSessionId;
    }
  }
  
  await updateDoc(doc(db, 'leagues', leagueId, 'members', memberId), updates);
  
  // Update league paid count
  if (paymentStatus === 'paid') {
    await updateDoc(doc(db, 'leagues', leagueId), {
      paidMemberCount: increment(1),
      totalCollected: increment(amountPaid || 0),
      updatedAt: Date.now(),
    });
  }
};

// ============================================
// LEAGUE TEAMS (for doubles/mixed)
// ============================================

/**
 * Create a league team
 */
export const createLeagueTeam = async (
  leagueId: string,
  team: Omit<LeagueTeam, 'id' | 'leagueId' | 'createdAt' | 'updatedAt'>
): Promise<string> => {
  const teamRef = doc(collection(db, 'leagues', leagueId, 'teams'));
  const now = Date.now();
  
  const newTeam: LeagueTeam = {
    ...team,
    id: teamRef.id,
    leagueId,
    createdAt: now,
    updatedAt: now,
  };
  
  await setDoc(teamRef, newTeam);
  return teamRef.id;
};

/**
 * Get open teams (looking for partner)
 */
export const getOpenLeagueTeams = async (
  leagueId: string,
  divisionId?: string | null
): Promise<LeagueTeam[]> => {
  let q = query(
    collection(db, 'leagues', leagueId, 'teams'),
    where('isLookingForPartner', '==', true),
    where('status', '==', 'pending_partner')
  );
  
  const snap = await getDocs(q);
  let teams = snap.docs.map(d => d.data() as LeagueTeam);
  
  if (divisionId) {
    teams = teams.filter(t => t.divisionId === divisionId);
  }
  
  return teams;
};

/**
 * Update league team
 */
export const updateLeagueTeam = async (
  leagueId: string,
  teamId: string,
  updates: Partial<LeagueTeam>
): Promise<void> => {
  await updateDoc(doc(db, 'leagues', leagueId, 'teams', teamId), {
    ...updates,
    updatedAt: Date.now(),
  });
};

// ============================================
// LEAGUE PARTNER INVITES
// ============================================

/**
 * Create partner invite
 */
export const createLeaguePartnerInvite = async (
  invite: Omit<LeaguePartnerInvite, 'id' | 'createdAt'>
): Promise<string> => {
  const inviteRef = doc(collection(db, 'leaguePartnerInvites'));
  const now = Date.now();
  
  const newInvite: LeaguePartnerInvite = {
    ...invite,
    id: inviteRef.id,
    createdAt: now,
    expiresAt: now + (7 * 24 * 60 * 60 * 1000), // 7 days
  };
  
  await setDoc(inviteRef, newInvite);
  return inviteRef.id;
};

/**
 * Get pending invites for a user
 */
export const getPendingLeagueInvites = async (
  userId: string
): Promise<LeaguePartnerInvite[]> => {
  const q = query(
    collection(db, 'leaguePartnerInvites'),
    where('invitedUserId', '==', userId),
    where('status', '==', 'pending')
  );
  
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as LeaguePartnerInvite);
};

/**
 * Respond to partner invite
 */
export const respondToLeaguePartnerInvite = async (
  inviteId: string,
  response: 'accepted' | 'declined'
): Promise<void> => {
  await updateDoc(doc(db, 'leaguePartnerInvites', inviteId), {
    status: response,
    respondedAt: Date.now(),
  });
};

// ============================================
// LEAGUE MATCHES
// ============================================

/**
 * Create a league match
 */
export const createLeagueMatch = async (
  leagueId: string,
  match: Omit<LeagueMatch, 'id' | 'leagueId' | 'createdAt'>
): Promise<string> => {
  const matchRef = doc(collection(db, 'leagues', leagueId, 'matches'));
  const now = Date.now();
  
  const newMatch: LeagueMatch = {
    ...match,
    id: matchRef.id,
    leagueId,
    createdAt: now,
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
    divisionId?: string;
  }
): Promise<LeagueMatch[]> => {
  let q = query(
    collection(db, 'leagues', leagueId, 'matches'),
    orderBy('createdAt', 'desc')
  );
  
  const snap = await getDocs(q);
  let matches = snap.docs.map(d => d.data() as LeagueMatch);
  
  // Apply filters (client-side due to Firestore limitations)
  if (filters?.memberId) {
    matches = matches.filter(m => m.memberAId === filters.memberId || m.memberBId === filters.memberId);
  }
  if (filters?.status) {
    matches = matches.filter(m => m.status === filters.status);
  }
  if (filters?.weekNumber) {
    matches = matches.filter(m => m.weekNumber === filters.weekNumber);
  }
  if (filters?.divisionId) {
    matches = matches.filter(m => m.divisionId === filters.divisionId);
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
    orderBy('createdAt', 'desc')
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
  scores: GameScore[],
  winnerMemberId: string,
  submittedByUserId: string
): Promise<void> => {
  await updateDoc(doc(db, 'leagues', leagueId, 'matches', matchId), {
    scores,
    winnerMemberId,
    status: 'pending_confirmation',
    submittedByUserId,
    playedAt: Date.now(),
  });
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
  
  // Increment matches played
  await updateDoc(doc(db, 'leagues', leagueId), {
    matchesPlayed: increment(1),
    updatedAt: Date.now(),
  });
};

/**
 * Dispute match result
 */
export const disputeLeagueMatchResult = async (
  leagueId: string,
  matchId: string,
  reason: string
): Promise<void> => {
  await updateDoc(doc(db, 'leagues', leagueId, 'matches', matchId), {
    status: 'disputed',
    disputeReason: reason,
  });
};

// ============================================
// LEAGUE CHALLENGES (Ladder format)
// ============================================

/**
 * Create a challenge
 */
export const createChallenge = async (
  leagueId: string,
  challenge: Omit<LeagueChallenge, 'id' | 'leagueId' | 'createdAt'>
): Promise<string> => {
  const challengeRef = doc(collection(db, 'leagues', leagueId, 'challenges'));
  const now = Date.now();
  
  const newChallenge: LeagueChallenge = {
    ...challenge,
    id: challengeRef.id,
    leagueId,
    createdAt: now,
  };
  
  await setDoc(challengeRef, newChallenge);
  return challengeRef.id;
};

/**
 * Get pending challenges for a user
 */
export const getPendingChallenges = async (
  leagueId: string,
  userId: string
): Promise<LeagueChallenge[]> => {
  // Get challenges where user is either challenger or challenged
  const q = query(
    collection(db, 'leagues', leagueId, 'challenges'),
    where('status', '==', 'pending')
  );
  
  const snap = await getDocs(q);
  const challenges = snap.docs.map(d => d.data() as LeagueChallenge);
  
  return challenges.filter(
    c => c.challengerUserId === userId || c.challengedUserId === userId
  );
};

/**
 * Respond to a challenge
 */
export const respondToChallenge = async (
  leagueId: string,
  challengeId: string,
  response: 'accepted' | 'declined'
): Promise<void> => {
  const updates: any = {
    status: response,
    respondedAt: Date.now(),
  };
  
  if (response === 'accepted') {
    // Set completion deadline (7 days from acceptance)
    updates.completionDeadline = Date.now() + (7 * 24 * 60 * 60 * 1000);
  }
  
  await updateDoc(doc(db, 'leagues', leagueId, 'challenges', challengeId), updates);
};

/**
 * Complete a challenge (after match is played)
 */
export const completeChallenge = async (
  leagueId: string,
  challengeId: string,
  matchId: string,
  winnerId: string
): Promise<void> => {
  await updateDoc(doc(db, 'leagues', leagueId, 'challenges', challengeId), {
    status: 'completed',
    matchId,
    winnerId,
    completedAt: Date.now(),
  });
};

/**
 * Subscribe to user's challenges
 */
export const subscribeToUserChallenges = (
  leagueId: string,
  userId: string,
  callback: (challenges: LeagueChallenge[]) => void
): (() => void) => {
  const q = query(
    collection(db, 'leagues', leagueId, 'challenges'),
    where('status', 'in', ['pending', 'accepted'])
  );
  
  return onSnapshot(q, (snap) => {
    const challenges = snap.docs
      .map(d => d.data() as LeagueChallenge)
      .filter(c => c.challengerUserId === userId || c.challengedUserId === userId);
    callback(challenges);
  });
};

// ============================================
// LADDER RANKING UPDATES
// ============================================

/**
 * Swap positions after a successful challenge
 */
export const swapLadderPositions = async (
  leagueId: string,
  winnerId: string,
  loserId: string,
  winnerOldRank: number,
  loserOldRank: number
): Promise<void> => {
  const batch = writeBatch(db);
  
  // If winner was lower ranked (higher number) and beat someone above them
  if (winnerOldRank > loserOldRank) {
    // Winner takes loser's position
    batch.update(doc(db, 'leagues', leagueId, 'members', winnerId), {
      previousRank: winnerOldRank,
      currentRank: loserOldRank,
      lastActiveAt: Date.now(),
    });
    
    // Loser drops one position
    batch.update(doc(db, 'leagues', leagueId, 'members', loserId), {
      previousRank: loserOldRank,
      currentRank: loserOldRank + 1,
      lastActiveAt: Date.now(),
    });
    
    // Shift everyone between them down by 1
    const membersQuery = query(
      collection(db, 'leagues', leagueId, 'members'),
      where('currentRank', '>', loserOldRank),
      where('currentRank', '<', winnerOldRank),
      where('status', '==', 'active')
    );
    
    const membersSnap = await getDocs(membersQuery);
    membersSnap.forEach(docSnap => {
      const member = docSnap.data() as LeagueMember;
      if (member.id !== winnerId && member.id !== loserId) {
        batch.update(docSnap.ref, {
          previousRank: member.currentRank,
          currentRank: member.currentRank + 1,
        });
      }
    });
  }
  
  await batch.commit();
};

// ============================================
// LEAGUE REGISTRATION
// ============================================

/**
 * Create or update league registration
 */
export const saveLeagueRegistration = async (
  registration: Omit<LeagueRegistration, 'createdAt' | 'updatedAt'>
): Promise<void> => {
  const regRef = doc(db, 'leagueRegistrations', registration.id);
  const now = Date.now();
  
  const existingSnap = await getDoc(regRef);
  
  if (existingSnap.exists()) {
    await updateDoc(regRef, {
      ...registration,
      updatedAt: now,
    });
  } else {
    await setDoc(regRef, {
      ...registration,
      createdAt: now,
      updatedAt: now,
    });
  }
};

/**
 * Get league registration
 */
export const getLeagueRegistration = async (
  leagueId: string,
  userId: string
): Promise<LeagueRegistration | null> => {
  const regRef = doc(db, 'leagueRegistrations', `${userId}_${leagueId}`);
  const snap = await getDoc(regRef);
  
  if (!snap.exists()) return null;
  return snap.data() as LeagueRegistration;
};

// ============================================
// STATUS TRANSITIONS
// ============================================

/**
 * Open league for registration
 */
export const openLeagueRegistration = async (leagueId: string): Promise<void> => {
  await updateLeague(leagueId, { status: 'registration' });
};

/**
 * Start the league (close registration, begin play)
 */
export const startLeague = async (leagueId: string): Promise<void> => {
  await updateLeague(leagueId, { status: 'active' });
};

/**
 * End the league
 */
export const completeLeague = async (leagueId: string): Promise<void> => {
  await updateLeague(leagueId, { status: 'completed' });
};

/**
 * Cancel a league
 */
export const cancelLeague = async (leagueId: string): Promise<void> => {
  await updateLeague(leagueId, { status: 'cancelled' });
};
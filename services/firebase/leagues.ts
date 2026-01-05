/**
 * League Firebase Services
 *
 * Database operations for the Leagues feature.
 *
 * UPDATED V05.44:
 * - Added auto-registration check functions
 *
 * FILE LOCATION: src/services/firebase/leagues.ts
 * VERSION: V05.44
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
  runTransaction,
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
 * Note: Simple query without filters to avoid index requirements
 */
export const subscribeToLeagues = (
  callback: (leagues: League[]) => void,
  filters?: { status?: LeagueStatus; clubId?: string }
): (() => void) => {
  // Simple query - just get all leagues, sort client-side
  const q = query(collection(db, 'leagues'));
  
  return onSnapshot(q, (snap) => {
    let leagues = snap.docs.map(d => d.data() as League);
    
    // Apply filters client-side
    if (filters?.status) {
      leagues = leagues.filter(l => l.status === filters.status);
    }
    if (filters?.clubId) {
      leagues = leagues.filter(l => l.clubId === filters.clubId);
    }
    
    // Sort by createdAt descending (newest first)
    leagues.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    
    callback(leagues);
  }, (error) => {
    console.error('Error subscribing to leagues:', error);
    callback([]);
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
 * V07.15: Uses transaction for atomic max members check
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
  const leagueRef = doc(db, 'leagues', leagueId);
  const now = Date.now();

  // Use transaction for atomic check-and-join
  return await runTransaction(db, async (transaction) => {
    // Read league data within transaction
    const leagueSnap = await transaction.get(leagueRef);
    if (!leagueSnap.exists()) {
      throw new Error('League not found');
    }
    const league = leagueSnap.data() as League;
    const currentCount = league.memberCount || 0;
    const initialRank = currentCount + 1;

    // V07.15: Enforce max members limit (atomic check)
    if (league.maxMembers && currentCount >= league.maxMembers) {
      throw new Error(`League is full (${currentCount}/${league.maxMembers} players)`);
    }

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

    // Write member and update count atomically
    transaction.set(memberRef, newMember);
    transaction.update(leagueRef, {
      memberCount: increment(1),
      updatedAt: now,
    });

    return memberRef.id;
  });
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
 * Note: Simple query to avoid index requirements
 */
export const getLeagueMemberByUserId = async (
  leagueId: string,
  userId: string
): Promise<LeagueMember | null> => {
  // Get all members and filter client-side
  const q = query(collection(db, 'leagues', leagueId, 'members'));
  
  const snap = await getDocs(q);
  const members = snap.docs.map(d => d.data() as LeagueMember);
  
  // Find active member with matching userId
  const member = members.find(m => m.userId === userId && m.status === 'active');
  return member || null;
};

/**
 * Get all members of a league
 * Note: Filtering and sorting done client-side to avoid index requirements
 */
export const getLeagueMembers = async (
  leagueId: string,
  divisionId?: string | null
): Promise<LeagueMember[]> => {
  // Simple query - get all members
  const q = query(collection(db, 'leagues', leagueId, 'members'));
  
  const snap = await getDocs(q);
  let members = snap.docs.map(d => d.data() as LeagueMember);
  
  // Filter to active members only
  members = members.filter(m => m.status === 'active');
  
  // Filter by division if specified
  if (divisionId) {
    members = members.filter(m => m.divisionId === divisionId);
  }
  
  // Sort by currentRank ascending
  members.sort((a, b) => (a.currentRank || 999) - (b.currentRank || 999));
  
  return members;
};

/**
 * Subscribe to league members (for real-time standings)
 * Note: Filtering and sorting done client-side to avoid index requirements
 */
export const subscribeToLeagueMembers = (
  leagueId: string,
  callback: (members: LeagueMember[]) => void,
  divisionId?: string | null
): (() => void) => {
  // Simple query - get all members, filter/sort client-side
  const q = query(collection(db, 'leagues', leagueId, 'members'));
  
  return onSnapshot(q, (snap) => {
    let members = snap.docs.map(d => d.data() as LeagueMember);
    
    // Filter to active members only
    members = members.filter(m => m.status === 'active');
    
    // Filter by division if specified
    if (divisionId) {
      members = members.filter(m => m.divisionId === divisionId);
    }
    
    // Sort by currentRank ascending
    members.sort((a, b) => (a.currentRank || 999) - (b.currentRank || 999));
    
    callback(members);
  }, (error) => {
    console.error('Error subscribing to league members:', error);
    callback([]);
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
 * @param isOrganizer - If true, auto-finalize the match (skip confirmation) and update stats
 */
export const submitLeagueMatchResult = async (
  leagueId: string,
  matchId: string,
  scores: GameScore[],
  winnerMemberId: string,
  submittedByUserId: string,
  isOrganizer: boolean = false
): Promise<void> => {
  const now = Date.now();

  // V07.11: Get league settings for points calculation
  const leagueDoc = await getDoc(doc(db, 'leagues', leagueId));
  const leagueData = leagueDoc.data() as League | undefined;
  const pointsForWin = leagueData?.settings?.pointsForWin ?? 1;
  const pointsForLoss = leagueData?.settings?.pointsForLoss ?? 0;

  // If organizer submits, auto-finalize the match
  if (isOrganizer) {
    // First get the match to find both member IDs
    const matchDoc = await getDoc(doc(db, 'leagues', leagueId, 'matches', matchId));
    const matchData = matchDoc.data() as LeagueMatch | undefined;

    await updateDoc(doc(db, 'leagues', leagueId, 'matches', matchId), {
      scores,
      winnerMemberId,
      status: 'completed',
      submittedByUserId,
      confirmedByUserId: submittedByUserId,
      playedAt: now,
      completedAt: now,
    });

    // Increment matches played
    await updateDoc(doc(db, 'leagues', leagueId), {
      matchesPlayed: increment(1),
      updatedAt: now,
    });

    // Update member stats for both players
    if (matchData) {
      const memberAId = matchData.memberAId;
      const memberBId = matchData.memberBId;
      const loserMemberId = winnerMemberId === memberAId ? memberBId : memberAId;

      // Calculate games won/lost and points from scores
      let gamesWonA = 0, gamesWonB = 0, pointsForA = 0, pointsForB = 0;
      scores.forEach(game => {
        pointsForA += game.scoreA;
        pointsForB += game.scoreB;
        if (game.scoreA > game.scoreB) gamesWonA++;
        else if (game.scoreB > game.scoreA) gamesWonB++;
      });

      const isAWinner = winnerMemberId === memberAId;

      // Helper to update member stats (ensures stats object exists)
      const updateMemberStatsAfterMatch = async (
        memberId: string,
        isWinner: boolean,
        gamesWon: number,
        gamesLost: number,
        pointsFor: number,
        pointsAgainst: number
      ) => {
        const memberRef = doc(db, 'leagues', leagueId, 'members', memberId);
        const memberDoc = await getDoc(memberRef);
        const memberData = memberDoc.data();

        // Get current stats or initialize empty
        const currentStats = memberData?.stats || {
          played: 0, wins: 0, losses: 0, draws: 0, forfeits: 0, points: 0,
          gamesWon: 0, gamesLost: 0, pointsFor: 0, pointsAgainst: 0,
          currentStreak: 0, bestWinStreak: 0, recentForm: [],
        };

        // Calculate new stats
        const newPlayed = (currentStats.played || 0) + 1;
        const newWins = (currentStats.wins || 0) + (isWinner ? 1 : 0);
        const newLosses = (currentStats.losses || 0) + (isWinner ? 0 : 1);
        const newGamesWon = (currentStats.gamesWon || 0) + gamesWon;
        const newGamesLost = (currentStats.gamesLost || 0) + gamesLost;
        const newPointsFor = (currentStats.pointsFor || 0) + pointsFor;
        const newPointsAgainst = (currentStats.pointsAgainst || 0) + pointsAgainst;
        // V07.11: Use league settings for points
        const newPoints = (currentStats.points || 0) + (isWinner ? pointsForWin : pointsForLoss);

        // Update streak
        let newStreak = currentStats.currentStreak || 0;
        if (isWinner) {
          newStreak = newStreak >= 0 ? newStreak + 1 : 1;
        } else {
          newStreak = newStreak <= 0 ? newStreak - 1 : -1;
        }
        const newBestStreak = Math.max(currentStats.bestWinStreak || 0, newStreak > 0 ? newStreak : 0);

        // Update recent form (last 5)
        const newForm = [...(currentStats.recentForm || []), isWinner ? 'W' : 'L'].slice(-5);

        await updateDoc(memberRef, {
          stats: {
            played: newPlayed,
            wins: newWins,
            losses: newLosses,
            draws: currentStats.draws || 0,
            forfeits: currentStats.forfeits || 0,
            points: newPoints,
            gamesWon: newGamesWon,
            gamesLost: newGamesLost,
            pointsFor: newPointsFor,
            pointsAgainst: newPointsAgainst,
            currentStreak: newStreak,
            bestWinStreak: newBestStreak,
            recentForm: newForm,
          },
          lastActiveAt: now,
        });
      };

      // Update winner stats
      await updateMemberStatsAfterMatch(
        winnerMemberId,
        true,
        isAWinner ? gamesWonA : gamesWonB,
        isAWinner ? gamesWonB : gamesWonA,
        isAWinner ? pointsForA : pointsForB,
        isAWinner ? pointsForB : pointsForA
      );

      // Update loser stats
      await updateMemberStatsAfterMatch(
        loserMemberId,
        false,
        isAWinner ? gamesWonB : gamesWonA,
        isAWinner ? gamesWonA : gamesWonB,
        isAWinner ? pointsForB : pointsForA,
        isAWinner ? pointsForA : pointsForB
      );
    }
  } else {
    // Normal flow: require confirmation from opponent
    await updateDoc(doc(db, 'leagues', leagueId, 'matches', matchId), {
      scores,
      winnerMemberId,
      status: 'pending_confirmation',
      submittedByUserId,
      playedAt: now,
    });
  }
};

/**
 * Confirm match result
 * Also updates member stats for both players
 */
export const confirmLeagueMatchResult = async (
  leagueId: string,
  matchId: string,
  confirmedByUserId: string
): Promise<void> => {
  const now = Date.now();

  // V07.11: Get league settings for points calculation
  const leagueDoc = await getDoc(doc(db, 'leagues', leagueId));
  const leagueData = leagueDoc.data() as League | undefined;
  const pointsForWin = leagueData?.settings?.pointsForWin ?? 1;
  const pointsForLoss = leagueData?.settings?.pointsForLoss ?? 0;

  // Get match data to find both members and scores
  const matchDoc = await getDoc(doc(db, 'leagues', leagueId, 'matches', matchId));
  const matchData = matchDoc.data() as LeagueMatch | undefined;

  await updateDoc(doc(db, 'leagues', leagueId, 'matches', matchId), {
    status: 'completed',
    confirmedByUserId,
    completedAt: now,
  });

  // Increment matches played
  await updateDoc(doc(db, 'leagues', leagueId), {
    matchesPlayed: increment(1),
    updatedAt: now,
  });

  // Update member stats for both players
  if (matchData && matchData.winnerMemberId && matchData.scores) {
    const memberAId = matchData.memberAId;
    const memberBId = matchData.memberBId;
    const winnerMemberId = matchData.winnerMemberId;
    const loserMemberId = winnerMemberId === memberAId ? memberBId : memberAId;
    const scores = matchData.scores;

    // Calculate games won/lost and points from scores
    let gamesWonA = 0, gamesWonB = 0, pointsForA = 0, pointsForB = 0;
    scores.forEach(game => {
      pointsForA += game.scoreA;
      pointsForB += game.scoreB;
      if (game.scoreA > game.scoreB) gamesWonA++;
      else if (game.scoreB > game.scoreA) gamesWonB++;
    });

    const isAWinner = winnerMemberId === memberAId;

    // Helper to update member stats (ensures stats object exists)
    const updateMemberStatsAfterMatch = async (
      memberId: string,
      isWinner: boolean,
      gamesWon: number,
      gamesLost: number,
      pointsFor: number,
      pointsAgainst: number
    ) => {
      const memberRef = doc(db, 'leagues', leagueId, 'members', memberId);
      const memberDoc2 = await getDoc(memberRef);
      const memberData = memberDoc2.data();

      // Get current stats or initialize empty
      const currentStats = memberData?.stats || {
        played: 0, wins: 0, losses: 0, draws: 0, forfeits: 0, points: 0,
        gamesWon: 0, gamesLost: 0, pointsFor: 0, pointsAgainst: 0,
        currentStreak: 0, bestWinStreak: 0, recentForm: [],
      };

      // Calculate new stats
      const newPlayed = (currentStats.played || 0) + 1;
      const newWins = (currentStats.wins || 0) + (isWinner ? 1 : 0);
      const newLosses = (currentStats.losses || 0) + (isWinner ? 0 : 1);
      const newGamesWon = (currentStats.gamesWon || 0) + gamesWon;
      const newGamesLost = (currentStats.gamesLost || 0) + gamesLost;
      const newPointsFor = (currentStats.pointsFor || 0) + pointsFor;
      const newPointsAgainst = (currentStats.pointsAgainst || 0) + pointsAgainst;
      // V07.11: Use league settings for points
      const newPoints = (currentStats.points || 0) + (isWinner ? pointsForWin : pointsForLoss);

      // Update streak
      let newStreak = currentStats.currentStreak || 0;
      if (isWinner) {
        newStreak = newStreak >= 0 ? newStreak + 1 : 1;
      } else {
        newStreak = newStreak <= 0 ? newStreak - 1 : -1;
      }
      const newBestStreak = Math.max(currentStats.bestWinStreak || 0, newStreak > 0 ? newStreak : 0);

      // Update recent form (last 5)
      const newForm = [...(currentStats.recentForm || []), isWinner ? 'W' : 'L'].slice(-5);

      await updateDoc(memberRef, {
        stats: {
          played: newPlayed,
          wins: newWins,
          losses: newLosses,
          draws: currentStats.draws || 0,
          forfeits: currentStats.forfeits || 0,
          points: newPoints,
          gamesWon: newGamesWon,
          gamesLost: newGamesLost,
          pointsFor: newPointsFor,
          pointsAgainst: newPointsAgainst,
          currentStreak: newStreak,
          bestWinStreak: newBestStreak,
          recentForm: newForm,
        },
        lastActiveAt: now,
      });
    };

    // Update winner stats
    await updateMemberStatsAfterMatch(
      winnerMemberId,
      true,
      isAWinner ? gamesWonA : gamesWonB,
      isAWinner ? gamesWonB : gamesWonA,
      isAWinner ? pointsForA : pointsForB,
      isAWinner ? pointsForB : pointsForA
    );

    // Update loser stats
    await updateMemberStatsAfterMatch(
      loserMemberId,
      false,
      isAWinner ? gamesWonB : gamesWonA,
      isAWinner ? gamesWonA : gamesWonB,
      isAWinner ? pointsForB : pointsForA,
      isAWinner ? pointsForA : pointsForB
    );
  }
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

// ============================================
// AUTO-REGISTRATION CHECK (NEW V05.44)
// ============================================

/**
 * Check if league status should be auto-updated based on dates
 *
 * This function checks:
 * 1. If 'draft' and registrationOpens has passed → change to 'registration'
 * 2. If 'registration' and registrationDeadline has passed → change to 'active'
 *
 * Called on page load to automatically open registration or start leagues
 * based on the dates set by the organizer.
 *
 * @param league - The league to check
 * @returns Object with newStatus (if changed) and wasUpdated boolean
 */
export const checkAndUpdateLeagueStatus = async (
  league: League
): Promise<{ newStatus: LeagueStatus | null; wasUpdated: boolean }> => {
  const now = Date.now();

  // Only check draft or registration status leagues
  if (league.status !== 'draft' && league.status !== 'registration') {
    return { newStatus: null, wasUpdated: false };
  }

  // Check Draft → Registration transition
  if (
    league.status === 'draft' &&
    league.registrationOpens &&
    now >= league.registrationOpens
  ) {
    await updateLeague(league.id, { status: 'registration' });
    return { newStatus: 'registration', wasUpdated: true };
  }

  // Check Registration → Active transition
  if (
    league.status === 'registration' &&
    league.registrationDeadline &&
    now >= league.registrationDeadline
  ) {
    await updateLeague(league.id, { status: 'active' });
    return { newStatus: 'active', wasUpdated: true };
  }

  return { newStatus: null, wasUpdated: false };
};

/**
 * Get the expected status for a league based on current dates
 * (for display purposes, doesn't update the database)
 *
 * @param league - The league to check
 * @returns The expected status based on dates
 */
export const getExpectedLeagueStatus = (league: League): LeagueStatus => {
  const now = Date.now();

  // If already completed/cancelled, don't change
  if (league.status === 'completed' || league.status === 'cancelled') {
    return league.status;
  }

  // Check if should be active
  if (
    league.registrationDeadline &&
    now >= league.registrationDeadline
  ) {
    return 'active';
  }

  // Check if should be in registration
  if (
    league.registrationOpens &&
    now >= league.registrationOpens
  ) {
    return 'registration';
  }

  // Default to draft
  return league.status;
};
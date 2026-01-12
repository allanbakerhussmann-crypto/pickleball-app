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
  LeagueJoinRequest,
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

  // Filter out undefined values (Firestore doesn't accept them)
  const cleanedLeague = Object.fromEntries(
    Object.entries(newLeague).filter(([_, v]) => v !== undefined)
  ) as League;

  await setDoc(leagueRef, cleanedLeague);
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
/**
 * V07.27: Count members toward capacity (active + pending_partner)
 * For doubles leagues, pending_partner counts as they occupy a slot
 */
const countMembersTowardCapacity = async (
  leagueId: string,
  divisionId?: string | null
): Promise<number> => {
  const q = query(collection(db, 'leagues', leagueId, 'members'));
  const snap = await getDocs(q);

  let count = 0;
  snap.docs.forEach(d => {
    const member = d.data() as LeagueMember;
    // Count active and pending_partner toward capacity
    if (member.status === 'active' || member.status === 'pending_partner') {
      // Filter by division if specified
      if (!divisionId || member.divisionId === divisionId) {
        count++;
      }
    }
  });

  return count;
};

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
 * V07.27: Updated to handle partners leaving differently than primary members
 * - If partner leaves: Clears partner fields, reverts team to pending_partner
 * - If primary member leaves: Withdraws the entire team
 */
export const leaveLeague = async (
  leagueId: string,
  memberId: string,
  userId?: string
): Promise<void> => {
  const memberRef = doc(db, 'leagues', leagueId, 'members', memberId);
  const memberSnap = await getDoc(memberRef);
  const member = memberSnap.exists() ? memberSnap.data() as LeagueMember : null;

  if (!member) {
    throw new Error('Member not found');
  }

  const now = Date.now();

  // V07.27: Check if the user leaving is the partner (not the primary member)
  const isPartner = userId && member.partnerUserId === userId && member.userId !== userId;

  if (isPartner) {
    // Partner is leaving - clear partner fields and revert to looking for partner
    await updateDoc(memberRef, {
      partnerUserId: null,
      partnerDisplayName: null,
      partnerDuprId: null,
      partnerLockedAt: null,
      teamName: member.displayName, // Revert to just primary member's name
      status: 'pending_partner',
      isLookingForPartner: true,
      // Clear invite tracking since the original invite was already accepted
      pendingInviteId: null,
      pendingInvitedUserId: null,
      lastActiveAt: now,
    });
    // Note: Don't decrement member count - the team still exists, just without a partner
  } else {
    // Primary member is leaving - withdraw the entire team
    await updateDoc(memberRef, {
      status: 'withdrawn',
      lastActiveAt: now,
    });

    // Decrement member count
    await updateDoc(doc(db, 'leagues', leagueId), {
      memberCount: increment(-1),
      updatedAt: now,
    });

    // Cancel any pending invites this member sent
    // V07.27: Only cancel if pendingInviteId is set AND we have userId for security rules
    // Also include inviterId filter to satisfy Firestore security rules
    if (member.pendingInviteId && userId) {
      try {
        // Cancel the specific pending invite by ID
        const inviteRef = doc(db, 'leaguePartnerInvites', member.pendingInviteId);
        const inviteSnap = await getDoc(inviteRef);
        if (inviteSnap.exists() && inviteSnap.data().status === 'pending') {
          await updateDoc(inviteRef, {
            status: 'cancelled',
            cancelledAt: now,
          });
        }
      } catch (error) {
        // Silently ignore permission errors - invite may have been handled already
        console.warn('Could not cancel pending invite:', error);
      }
    }
  }
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

  // V07.27: Find member where user is EITHER the primary member OR the partner
  // For doubles leagues, partners join an existing team rather than creating their own member doc
  const member = members.find(m =>
    (m.status === 'active' || m.status === 'pending_partner') &&
    (m.userId === userId || m.partnerUserId === userId)
  );
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

    // V07.27: Include active AND pending_partner members
    // pending_partner members are teams waiting for partner acceptance (doubles leagues)
    members = members.filter(m => m.status === 'active' || m.status === 'pending_partner');

    // Filter by division if specified
    if (divisionId) {
      members = members.filter(m => m.divisionId === divisionId);
    }

    // Sort by currentRank ascending (pending_partner members sort to end with rank 999)
    members.sort((a, b) => {
      // Active members before pending_partner members
      if (a.status === 'active' && b.status === 'pending_partner') return -1;
      if (a.status === 'pending_partner' && b.status === 'active') return 1;
      // Then by rank
      return (a.currentRank || 999) - (b.currentRank || 999);
    });

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

// ============================================
// DOUBLES PARTNER INVITE SYSTEM (V07.26)
// ============================================

/**
 * Subscribe to pending partner invites for a user
 * Real-time subscription for the invites page
 */
export const subscribeToUserLeaguePartnerInvites = (
  userId: string,
  callback: (invites: LeaguePartnerInvite[]) => void
): (() => void) => {
  const q = query(
    collection(db, 'leaguePartnerInvites'),
    where('invitedUserId', '==', userId),
    where('status', '==', 'pending')
  );

  return onSnapshot(q, (snap) => {
    const invites = snap.docs.map(d => d.data() as LeaguePartnerInvite);
    callback(invites);
  });
};

/**
 * Subscribe to join requests for open teams owned by the user
 * Real-time subscription for users who have open teams
 */
export const subscribeToMyOpenTeamRequests = (
  userId: string,
  callback: (requests: LeagueJoinRequest[]) => void
): (() => void) => {
  const q = query(
    collection(db, 'leagueJoinRequests'),
    where('openTeamOwnerUserId', '==', userId),
    where('status', '==', 'pending')
  );

  return onSnapshot(q, (snap) => {
    const requests = snap.docs.map(d => d.data() as LeagueJoinRequest);
    callback(requests);
  });
};

/**
 * Get open league members (teams looking for partners)
 */
export const getOpenLeagueMembers = async (
  leagueId: string,
  divisionId?: string | null
): Promise<LeagueMember[]> => {
  let q = query(
    collection(db, 'leagues', leagueId, 'members'),
    where('isLookingForPartner', '==', true),
    where('status', '==', 'pending_partner')
  );

  const snap = await getDocs(q);
  let members = snap.docs.map(d => d.data() as LeagueMember);

  // Filter by division if specified
  if (divisionId) {
    members = members.filter(m => m.divisionId === divisionId);
  }

  return members;
};

/**
 * Join league with partner invite (atomic operation)
 * Creates member with pending_partner status and partner invite in one transaction
 */
export const joinLeagueWithPartnerInvite = async (
  leagueId: string,
  userId: string,
  displayName: string,
  duprId: string | null,
  partnerId: string,
  partnerName: string,
  partnerDuprId: string | null,
  divisionId?: string | null,
  leagueName?: string
): Promise<{ memberId: string; inviteId: string }> => {
  return runTransaction(db, async (transaction) => {
    const memberRef = doc(collection(db, 'leagues', leagueId, 'members'));
    const inviteRef = doc(collection(db, 'leaguePartnerInvites'));
    const leagueRef = doc(db, 'leagues', leagueId);
    const now = Date.now();

    // Generate deterministic teamKey (sorted user IDs)
    const teamKey = [userId, partnerId].sort().join('_');

    // Check for existing team with same teamKey
    const existingTeamQuery = query(
      collection(db, 'leagues', leagueId, 'members'),
      where('teamKey', '==', teamKey),
      where('status', 'in', ['active', 'pending_partner'])
    );
    const existingTeamSnap = await getDocs(existingTeamQuery);
    if (!existingTeamSnap.empty) {
      throw new Error('A team with these players already exists in this league');
    }

    // V07.27: Check venue-based capacity if configured
    const leagueSnap = await transaction.get(leagueRef);
    if (leagueSnap.exists()) {
      const league = leagueSnap.data() as League;
      const maxTeams = league.maxTeamsPerDivision;
      if (maxTeams) {
        // Count current teams (active + pending_partner toward capacity)
        const membersQuery = query(collection(db, 'leagues', leagueId, 'members'));
        const membersSnap = await getDocs(membersQuery);
        let currentTeamCount = 0;
        membersSnap.docs.forEach(d => {
          const m = d.data() as LeagueMember;
          if ((m.status === 'active' || m.status === 'pending_partner') &&
              (!divisionId || m.divisionId === divisionId)) {
            currentTeamCount++;
          }
        });

        if (currentTeamCount >= maxTeams) {
          throw new Error(`This division is full (${currentTeamCount}/${maxTeams} teams). No more teams can join.`);
        }
      }
    }

    // Create member with pending_partner status
    const newMember: LeagueMember = {
      id: memberRef.id,
      leagueId,
      divisionId: divisionId || null,
      userId,
      displayName,
      duprId: duprId || null,
      partnerUserId: null,
      partnerDisplayName: null,
      partnerDuprId: null,
      teamId: null,
      teamName: `${displayName} (Pending Partner)`,
      isLookingForPartner: false,
      pendingInviteId: inviteRef.id,
      pendingInvitedUserId: partnerId,
      partnerLockedAt: null,
      teamKey,
      status: 'pending_partner',
      role: 'member',
      paymentStatus: 'unpaid',
      currentRank: 0,
      stats: {
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
      },
      joinedAt: now,
      lastActiveAt: now,
    };

    // Create partner invite
    const newInvite: LeaguePartnerInvite = {
      id: inviteRef.id,
      leagueId,
      leagueName: leagueName || undefined,
      divisionId: divisionId || null,
      teamId: null,
      memberId: memberRef.id,
      inviterId: userId,
      inviterName: displayName,
      inviterDuprId: duprId || null,
      invitedUserId: partnerId,
      invitedUserName: partnerName,
      invitedUserDuprId: partnerDuprId || null,
      status: 'pending',
      createdAt: now,
      expiresAt: now + (7 * 24 * 60 * 60 * 1000), // 7 days
    };

    // Execute transaction
    transaction.set(memberRef, newMember);
    transaction.set(inviteRef, newInvite);
    transaction.update(leagueRef, {
      memberCount: increment(1),
      updatedAt: now,
    });

    return { memberId: memberRef.id, inviteId: inviteRef.id };
  });
};

/**
 * Join league as open team (looking for partner)
 * Creates member with pending_partner status and isLookingForPartner=true
 */
export const joinLeagueAsOpenTeam = async (
  leagueId: string,
  userId: string,
  displayName: string,
  duprId: string | null,
  divisionId?: string | null
): Promise<string> => {
  return runTransaction(db, async (transaction) => {
    const memberRef = doc(collection(db, 'leagues', leagueId, 'members'));
    const leagueRef = doc(db, 'leagues', leagueId);
    const now = Date.now();

    // Check for existing membership
    const existingMemberQuery = query(
      collection(db, 'leagues', leagueId, 'members'),
      where('userId', '==', userId),
      where('status', 'in', ['active', 'pending_partner'])
    );
    const existingSnap = await getDocs(existingMemberQuery);
    if (!existingSnap.empty) {
      throw new Error('You are already registered in this league');
    }

    // V07.27: Check venue-based capacity if configured
    const leagueSnap = await transaction.get(leagueRef);
    if (leagueSnap.exists()) {
      const league = leagueSnap.data() as League;
      const maxTeams = league.maxTeamsPerDivision;
      if (maxTeams) {
        // Count current teams (active + pending_partner toward capacity)
        const membersQuery = query(collection(db, 'leagues', leagueId, 'members'));
        const membersSnap = await getDocs(membersQuery);
        let currentTeamCount = 0;
        membersSnap.docs.forEach(d => {
          const m = d.data() as LeagueMember;
          if ((m.status === 'active' || m.status === 'pending_partner') &&
              (!divisionId || m.divisionId === divisionId)) {
            currentTeamCount++;
          }
        });

        if (currentTeamCount >= maxTeams) {
          throw new Error(`This division is full (${currentTeamCount}/${maxTeams} teams). No more teams can join.`);
        }
      }
    }

    // Create member with open team status
    const newMember: LeagueMember = {
      id: memberRef.id,
      leagueId,
      divisionId: divisionId || null,
      userId,
      displayName,
      duprId: duprId || null,
      partnerUserId: null,
      partnerDisplayName: null,
      partnerDuprId: null,
      teamId: null,
      teamName: `${displayName} (Looking for Partner)`,
      isLookingForPartner: true,
      pendingInviteId: null,
      pendingInvitedUserId: null,
      partnerLockedAt: null,
      teamKey: null,
      status: 'pending_partner',
      role: 'member',
      paymentStatus: 'unpaid',
      currentRank: 0,
      stats: {
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
      },
      joinedAt: now,
      lastActiveAt: now,
    };

    // Execute transaction
    transaction.set(memberRef, newMember);
    transaction.update(leagueRef, {
      memberCount: increment(1),
      updatedAt: now,
    });

    return memberRef.id;
  });
};

/**
 * Join an open team directly (no request/approval needed)
 * V07.27: Simplified flow - joining an open team automatically makes you the partner
 * The team owner consented to this by creating an "open team"
 *
 * @returns The member ID of the updated team
 */
export const joinOpenTeamDirect = async (
  leagueId: string,
  openTeamMemberId: string,
  joinerId: string,
  joinerName: string,
  joinerDuprId: string | null
): Promise<{ memberId: string; teamName: string }> => {
  // Check if joiner is already a member of this league (as primary)
  const existingMembership = await getLeagueMemberByUserId(leagueId, joinerId);
  if (existingMembership && existingMembership.userId === joinerId) {
    throw new Error('You already have a team in this league. Leave your current team first to join another.');
  }

  return runTransaction(db, async (transaction) => {
    const memberRef = doc(db, 'leagues', leagueId, 'members', openTeamMemberId);
    const memberSnap = await transaction.get(memberRef);

    if (!memberSnap.exists()) {
      throw new Error('Team not found');
    }

    const member = memberSnap.data() as LeagueMember;

    // Verify the team is still open
    if (member.status !== 'pending_partner' || !member.isLookingForPartner) {
      throw new Error('This team is no longer looking for a partner');
    }

    // Check for partner lock (someone else is joining at the same time)
    if (member.partnerLockedAt) {
      throw new Error('Someone else is already joining this team. Please try another team.');
    }

    // Check if team already has a partner
    if (member.partnerUserId) {
      throw new Error('This team already has a partner');
    }

    const now = Date.now();
    const teamKey = [member.userId, joinerId].sort().join('_');
    const teamName = `${member.displayName} / ${joinerName}`;

    // Update member with the new partner
    transaction.update(memberRef, {
      partnerLockedAt: now,
      partnerUserId: joinerId,
      partnerDisplayName: joinerName,
      partnerDuprId: joinerDuprId || null,
      teamName,
      teamKey,
      status: 'active',
      isLookingForPartner: false,
      // Clear any pending request tracking
      pendingJoinRequestId: null,
      pendingRequesterId: null,
      pendingRequesterName: null,
      lastActiveAt: now,
    });

    // Cancel any pending join requests for this team (from other players)
    // Note: We do this outside the transaction to avoid the read-after-write issue
    // The requests will be cleaned up, but the transaction ensures atomicity of the join

    return { memberId: openTeamMemberId, teamName };
  });
};

/**
 * Clean up pending join requests for a team that is now complete
 * Called after joinOpenTeamDirect succeeds
 */
export const cancelPendingRequestsForTeam = async (
  openTeamMemberId: string
): Promise<void> => {
  const requestsQuery = query(
    collection(db, 'leagueJoinRequests'),
    where('openTeamMemberId', '==', openTeamMemberId),
    where('status', '==', 'pending')
  );
  const requestsSnap = await getDocs(requestsQuery);

  const batch = writeBatch(db);
  const now = Date.now();

  requestsSnap.docs.forEach(reqDoc => {
    batch.update(reqDoc.ref, {
      status: 'cancelled',
      respondedAt: now,
      cancelReason: 'team_filled',
    });
  });

  if (requestsSnap.docs.length > 0) {
    await batch.commit();
  }
};

/**
 * Create a join request for an open team
 * @deprecated Use joinOpenTeamDirect instead - open teams now auto-accept joiners
 * V07.27: Also updates member document to track pending request for standings display
 */
export const createLeagueJoinRequest = async (
  leagueId: string,
  openTeamMemberId: string,
  openTeamOwnerUserId: string,
  openTeamOwnerName: string,
  requesterId: string,
  requesterName: string,
  requesterDuprId: string | null,
  divisionId?: string | null,
  leagueName?: string
): Promise<string> => {
  const requestRef = doc(collection(db, 'leagueJoinRequests'));
  const now = Date.now();

  // V07.27: Check if requester is already a member of this league (as primary)
  // They must leave their team first before joining someone else's team
  const existingMembership = await getLeagueMemberByUserId(leagueId, requesterId);
  if (existingMembership && existingMembership.userId === requesterId) {
    // User is already a primary member - they can't join another team
    throw new Error('You already have a team in this league. Leave your current team first to join another.');
  }

  // Check for existing pending request
  const existingQuery = query(
    collection(db, 'leagueJoinRequests'),
    where('openTeamMemberId', '==', openTeamMemberId),
    where('requesterId', '==', requesterId),
    where('status', '==', 'pending')
  );
  const existingSnap = await getDocs(existingQuery);
  if (!existingSnap.empty) {
    throw new Error('You already have a pending request for this team');
  }

  const newRequest: LeagueJoinRequest = {
    id: requestRef.id,
    leagueId,
    leagueName: leagueName || undefined,
    divisionId: divisionId || null,
    openTeamMemberId,
    openTeamOwnerUserId,
    openTeamOwnerName,
    requesterId,
    requesterName,
    requesterDuprId: requesterDuprId || null,
    status: 'pending',
    createdAt: now,
    expiresAt: now + (7 * 24 * 60 * 60 * 1000), // 7 days
  };

  await setDoc(requestRef, newRequest);

  // V07.27: Update member document to track pending request (for standings display)
  const memberRef = doc(db, 'leagues', leagueId, 'members', openTeamMemberId);
  await updateDoc(memberRef, {
    pendingJoinRequestId: requestRef.id,
    pendingRequesterId: requesterId,
    pendingRequesterName: requesterName,
    lastActiveAt: now,
  });

  return requestRef.id;
};

/**
 * Respond to league partner invite (atomic operation)
 * On accept: Updates member with partner info, cancels other invites
 */
export const respondToLeaguePartnerInviteAtomic = async (
  inviteId: string,
  response: 'accepted' | 'declined'
): Promise<{ leagueId: string; memberId: string } | null> => {
  // V07.27: First, get the invite to know what queries we need
  const inviteRef = doc(db, 'leaguePartnerInvites', inviteId);
  const invitePreSnap = await getDoc(inviteRef);

  if (!invitePreSnap.exists()) {
    throw new Error('Invite not found');
  }

  const inviteData = invitePreSnap.data() as LeaguePartnerInvite;

  return runTransaction(db, async (transaction) => {
    const now = Date.now();

    // ===== PHASE 1: ALL TRANSACTION READS FIRST =====
    const inviteSnap = await transaction.get(inviteRef);

    if (!inviteSnap.exists()) {
      throw new Error('Invite not found');
    }

    const invite = inviteSnap.data() as LeaguePartnerInvite;

    if (invite.status !== 'pending') {
      throw new Error('Invite is no longer pending');
    }

    // Read member document if needed for acceptance
    let member: LeagueMember | null = null;
    let memberRef: ReturnType<typeof doc> | null = null;

    if (response === 'accepted') {
      if (!invite.memberId) {
        throw new Error('Invite has no associated member');
      }
      memberRef = doc(db, 'leagues', invite.leagueId, 'members', invite.memberId);
      const memberSnap = await transaction.get(memberRef);

      if (!memberSnap.exists()) {
        throw new Error('Member not found');
      }

      member = memberSnap.data() as LeagueMember;

      // Check if member is still pending_partner
      if (member.status !== 'pending_partner') {
        throw new Error('Member already has a partner');
      }

      // Check partner lock
      if (member.partnerLockedAt) {
        throw new Error('Partner is already being assigned');
      }
    }

    // ===== PHASE 2: ALL WRITES =====

    // Update invite status
    transaction.update(inviteRef, {
      status: response,
      respondedAt: now,
    });

    if (response === 'declined') {
      // Just update the invite status and member to allow re-invite
      if (invite.memberId) {
        const declineMemberRef = doc(db, 'leagues', invite.leagueId, 'members', invite.memberId);
        transaction.update(declineMemberRef, {
          pendingInviteId: null,
          pendingInvitedUserId: null,
          lastActiveAt: now,
        });
      }
      return null;
    }

    // ACCEPTED - Update member with partner info
    if (memberRef && member) {
      transaction.update(memberRef, {
        partnerLockedAt: now,
        partnerUserId: invite.invitedUserId,
        partnerDisplayName: invite.invitedUserName || null,
        partnerDuprId: invite.invitedUserDuprId || null,
        teamName: `${member.displayName} / ${invite.invitedUserName || 'Partner'}`,
        status: 'active',
        pendingInviteId: null,
        pendingInvitedUserId: null,
        isLookingForPartner: false,
        lastActiveAt: now,
      });
    }

    // Note: Other pending invites from the same inviter will expire naturally
    // We don't cancel them here because the accepting user doesn't have permission
    // to modify invites they didn't send or receive

    return { leagueId: invite.leagueId, memberId: invite.memberId! };
  });
};

/**
 * Respond to join request (atomic operation)
 * On accept: Updates open team member with requester info
 * V07.27: Clears pending request tracking fields on member
 */
export const respondToLeagueJoinRequest = async (
  requestId: string,
  response: 'accepted' | 'declined'
): Promise<{ leagueId: string; memberId: string } | null> => {
  // V07.27: Get the request first to know what queries we need
  const requestRef = doc(db, 'leagueJoinRequests', requestId);
  const requestPreSnap = await getDoc(requestRef);

  if (!requestPreSnap.exists()) {
    throw new Error('Request not found');
  }

  const requestData = requestPreSnap.data() as LeagueJoinRequest;

  // For accepted: pre-fetch other requests and requester memberships OUTSIDE transaction
  let otherRequestDocs: { ref: any; id: string }[] = [];
  let requesterPendingDocs: { ref: any }[] = [];

  if (response === 'accepted') {
    // Get other pending requests for this team
    const otherRequestsQuery = query(
      collection(db, 'leagueJoinRequests'),
      where('openTeamMemberId', '==', requestData.openTeamMemberId),
      where('status', '==', 'pending')
    );
    const otherRequestsSnap = await getDocs(otherRequestsQuery);
    otherRequestDocs = otherRequestsSnap.docs.map(d => ({ ref: d.ref, id: d.id }));

    // Get requester's pending memberships in this league
    const requesterPendingQuery = query(
      collection(db, 'leagues', requestData.leagueId, 'members'),
      where('userId', '==', requestData.requesterId),
      where('status', '==', 'pending_partner')
    );
    const requesterPendingSnap = await getDocs(requesterPendingQuery);
    requesterPendingDocs = requesterPendingSnap.docs.map(d => ({ ref: d.ref }));
  }

  return runTransaction(db, async (transaction) => {
    // ===== PHASE 1: ALL READS FIRST =====
    const requestSnap = await transaction.get(requestRef);

    if (!requestSnap.exists()) {
      throw new Error('Request not found');
    }

    const request = requestSnap.data() as LeagueJoinRequest;

    if (request.status !== 'pending') {
      throw new Error('Request is no longer pending');
    }

    const memberRef = doc(db, 'leagues', request.leagueId, 'members', request.openTeamMemberId);
    const memberSnap = await transaction.get(memberRef);

    if (!memberSnap.exists()) {
      throw new Error('Open team member not found');
    }

    const member = memberSnap.data() as LeagueMember;

    // ===== PHASE 2: VALIDATION =====
    const now = Date.now();

    if (response === 'accepted') {
      // Check if member is still looking for partner
      if (member.status !== 'pending_partner' || !member.isLookingForPartner) {
        throw new Error('This team is no longer looking for a partner');
      }

      // Check partner lock
      if (member.partnerLockedAt) {
        throw new Error('Partner is already being assigned');
      }
    }

    // ===== PHASE 3: ALL WRITES =====

    // Update request status
    transaction.update(requestRef, {
      status: response,
      respondedAt: now,
    });

    if (response === 'declined') {
      // V07.27: Clear pending request tracking on member when declined
      transaction.update(memberRef, {
        pendingJoinRequestId: null,
        pendingRequesterId: null,
        pendingRequesterName: null,
        lastActiveAt: now,
      });
      return null;
    }

    // ACCEPTED - Update open team member with requester info
    const teamKey = [member.userId, request.requesterId].sort().join('_');

    transaction.update(memberRef, {
      partnerLockedAt: now,
      partnerUserId: request.requesterId,
      partnerDisplayName: request.requesterName,
      partnerDuprId: request.requesterDuprId || null,
      teamName: `${member.displayName} / ${request.requesterName}`,
      teamKey,
      status: 'active',
      isLookingForPartner: false,
      pendingJoinRequestId: null,
      pendingRequesterId: null,
      pendingRequesterName: null,
      lastActiveAt: now,
    });

    // Cancel other pending join requests for this open team
    otherRequestDocs.forEach(reqDoc => {
      if (reqDoc.id !== requestId) {
        transaction.update(reqDoc.ref, {
          status: 'cancelled',
          respondedAt: now,
        });
      }
    });

    // Withdraw any pending_partner memberships the requester has in this league
    requesterPendingDocs.forEach(memberDoc => {
      transaction.update(memberDoc.ref, {
        status: 'withdrawn',
        lastActiveAt: now,
      });
    });

    return { leagueId: request.leagueId, memberId: request.openTeamMemberId };
  });
};

/**
 * Get pending join requests for current user's open teams
 */
export const getMyOpenTeamRequests = async (
  userId: string
): Promise<LeagueJoinRequest[]> => {
  const q = query(
    collection(db, 'leagueJoinRequests'),
    where('openTeamOwnerUserId', '==', userId),
    where('status', '==', 'pending')
  );

  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as LeagueJoinRequest);
};

// ============================================
// WEEK STATE MANAGEMENT (V07.29)
// Three states: 'closed' (not started), 'open' (scoring enabled), 'locked' (finalized)
// ============================================

export type WeekState = 'closed' | 'open' | 'locked';

/**
 * Get the state of a week
 * Returns 'open' if weekStates not set (backwards compat)
 */
export const getWeekState = (
  league: League,
  weekNumber: number
): WeekState => {
  if (!league.weekStates) return 'open'; // Backwards compat
  return league.weekStates[weekNumber] || 'open';
};

/**
 * Check if a week allows scoring (state is 'open')
 */
export const isWeekUnlocked = (
  league: League,
  weekNumber: number
): boolean => {
  return getWeekState(league, weekNumber) === 'open';
};

/**
 * Set the state of a week
 */
export const setWeekState = async (
  leagueId: string,
  weekNumber: number,
  state: WeekState
): Promise<void> => {
  const leagueRef = doc(db, 'leagues', leagueId);
  await updateDoc(leagueRef, {
    [`weekStates.${weekNumber}`]: state,
    updatedAt: Date.now(),
  });
};

/**
 * Open a week for scoring (state: 'closed' -> 'open')
 */
export const openLeagueWeek = async (
  leagueId: string,
  weekNumber: number
): Promise<void> => {
  await setWeekState(leagueId, weekNumber, 'open');
};

/**
 * Close a week (state: 'open' -> 'closed')
 * Used when week hasn't started yet
 */
export const closeLeagueWeek = async (
  leagueId: string,
  weekNumber: number
): Promise<void> => {
  await setWeekState(leagueId, weekNumber, 'closed');
};

/**
 * Lock a week (state: 'open' -> 'locked')
 * Used after all matches are finalized, triggers standings generation
 */
export const lockLeagueWeek = async (
  leagueId: string,
  weekNumber: number
): Promise<void> => {
  await setWeekState(leagueId, weekNumber, 'locked');
};

// Keep unlockLeagueWeek for backwards compat (same as openLeagueWeek)
export const unlockLeagueWeek = openLeagueWeek;

/**
 * Initialize weekStates for a league after matches are generated
 * All weeks start as 'closed' except Week 1 which is 'open'
 *
 * @param leagueId - League ID
 * @param totalWeeks - Total number of weeks in the schedule
 */
export const initializeWeekStates = async (
  leagueId: string,
  totalWeeks: number
): Promise<void> => {
  if (totalWeeks < 1) return;

  const weekStates: Record<number, WeekState> = {};

  // All weeks start closed except Week 1 which is open
  for (let week = 1; week <= totalWeeks; week++) {
    weekStates[week] = week === 1 ? 'open' : 'closed';
  }

  const leagueRef = doc(db, 'leagues', leagueId);
  await updateDoc(leagueRef, {
    weekStates,
    updatedAt: Date.now(),
  });
};
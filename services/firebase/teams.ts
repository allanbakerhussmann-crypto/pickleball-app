/**
 * Team and Partner Invite Management
 */

import { 
  doc, 
  getDoc, 
  getDocs, 
  setDoc,
  updateDoc,
  deleteDoc,
  collection, 
  query, 
  where,
  onSnapshot,
  writeBatch,
  runTransaction,
} from '@firebase/firestore';
import { httpsCallable } from '@firebase/functions';
import { db, functions } from './config';
import { getUserProfile } from './users';
import type { Team, PartnerInvite, UserProfile } from '../../types';

// ============================================
// Team CRUD
// ============================================

export const subscribeToTeams = (
  tournamentId: string, 
  callback: (teams: Team[]) => void
) => {
  return onSnapshot(
    collection(db, 'tournaments', tournamentId, 'teams'), 
    (snap) => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Team)));
    }
  );
};

export const createTeam = async (tournamentId: string, team: Team) => {
  await setDoc(doc(db, 'tournaments', tournamentId, 'teams', team.id), team);
};

export const deleteTeam = async (tournamentId: string, teamId: string) => {
  await deleteDoc(doc(db, 'tournaments', tournamentId, 'teams', teamId));
};

// ============================================
// Team Server Functions
// ============================================

export const createTeamServer = async (opts: {
  tournamentId: string;
  divisionId: string;
  playerIds: string[];
  teamName?: string | null;
}) => {
  if (!functions) {
    throw new Error('Firebase functions not initialized');
  }
  const { tournamentId, divisionId, playerIds, teamName } = opts;
  const callable = httpsCallable(functions, 'createTeam');
  const resp = await callable({ tournamentId, divisionId, playerIds, teamName });
  return resp.data;
};

export const ensureTeamExists = async (
  tournamentId: string,
  divisionId: string,
  playerIds: string[],
  teamName: string | null,
  createdByUserId: string,
  options?: { status?: string }
): Promise<{ existed: boolean; teamId: string; team: any | null }> => {
  const normalizedPlayers = Array.from(new Set(playerIds.map(String))).sort();

  // Check if team already exists
  try {
    if (!tournamentId) throw new Error('Missing tournamentId for ensureTeamExists');
    const firstPlayer = normalizedPlayers[0];
    const q = query(
      collection(db, 'tournaments', tournamentId, 'teams'),
      where('divisionId', '==', divisionId),
      where('players', 'array-contains', firstPlayer)
    );
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      const t = d.data();
      const tPlayers = (t.players || []).map(String).sort();
      if (tPlayers.length === normalizedPlayers.length && 
          normalizedPlayers.every((p, i) => p === tPlayers[i])) {
        return { existed: true, teamId: d.id, team: { id: d.id, ...t } };
      }
    }
  } catch (err) {
    console.error('ensureTeamExists: initial lookup failed', err);
  }

  const teamRef = doc(collection(db, 'tournaments', tournamentId, 'teams'));
  const now = Date.now();

  try {
    await runTransaction(db, async (tx) => {
      const firstPlayer = normalizedPlayers[0];
      const q = query(
        collection(db, 'tournaments', tournamentId, 'teams'),
        where('divisionId', '==', divisionId),
        where('players', 'array-contains', firstPlayer)
      );
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        const t = d.data();
        const tPlayers = (t.players || []).map(String).sort();
        if (tPlayers.length === normalizedPlayers.length && 
            normalizedPlayers.every((p, i) => p === tPlayers[i])) {
          throw { alreadyExists: true, teamId: d.id, team: { id: d.id, ...t } };
        }
      }

      const teamDoc: any = {
        id: teamRef.id,
        tournamentId,
        divisionId,
        players: normalizedPlayers,
        teamName: teamName || null,
        createdByUserId,
        captainPlayerId: normalizedPlayers[0] || createdByUserId,
        isLookingForPartner: (options?.status === 'pending_partner') || (normalizedPlayers.length === 1),
        status: options?.status || (normalizedPlayers.length === 1 ? 'pending_partner' : 'active'),
        createdAt: now,
        updatedAt: now
      };
      tx.set(teamRef, teamDoc);

      const auditRef = doc(collection(db, 'team_creation_audit'));
      tx.set(auditRef, {
        teamId: teamRef.id,
        action: 'create',
        createdByUserId,
        timestamp: now,
        payload: { tournamentId, divisionId, players: normalizedPlayers, teamName }
      });
    });

    const createdSnap = await getDoc(teamRef);
    return { 
      existed: false, 
      teamId: teamRef.id, 
      team: createdSnap.exists() ? { id: createdSnap.id, ...createdSnap.data() } : null 
    };
  } catch (err: any) {
    if (err && err.alreadyExists) {
      return { existed: true, teamId: err.teamId, team: err.team };
    }
    console.error('ensureTeamExists transaction error', err);
    throw err;
  }
};

// ============================================
// Team Queries
// ============================================

export const getUserTeamsForTournament = async (
  tournamentId: string,
  userId: string
): Promise<Team[]> => {
  if (!tournamentId || !userId) return [];

  const qTeams = query(
    collection(db, 'tournaments', tournamentId, 'teams'),
    where('players', 'array-contains', userId)
  );
  const snap = await getDocs(qTeams);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as Team))
    .filter(t => t.status === 'active' || t.status === 'pending_partner');
};

export const getOpenTeamsForDivision = async (
  tournamentId: string,
  divisionId: string
): Promise<Team[]> => {
  const q = query(
    collection(db, 'tournaments', tournamentId, 'teams'),
    where('divisionId', '==', divisionId),
    where('isLookingForPartner', '==', true)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as Team))
    .filter(t => t.status === 'pending_partner');
};

export const getTeamsForDivision = async (
  tournamentId: string, 
  divisionId: string
): Promise<Team[]> => {
  const q = query(
    collection(db, 'tournaments', tournamentId, 'teams'),
    where('divisionId', '==', divisionId)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Team));
};

// ============================================
// Withdraw Player
// ============================================

export const withdrawPlayerFromDivision = async (
  tournamentId: string,
  divisionId: string,
  userId: string
): Promise<void> => {
  const teams = await getUserTeamsForTournament(tournamentId, userId);
  const team = teams.find(t => t.divisionId === divisionId);

  const batch = writeBatch(db);

  if (team) {
    const newPlayers = team.players.filter(p => p !== userId);
    const teamRef = doc(db, 'tournaments', tournamentId, 'teams', team.id);

    if (newPlayers.length === 0) {
      batch.update(teamRef, {
        status: 'withdrawn',
        isLookingForPartner: false,
        players: [],
        updatedAt: Date.now()
      });
    } else {
      const remainingUserId = newPlayers[0];
      const remainingUserDoc = await getDoc(doc(db, 'users', remainingUserId));
      const remainingUserData = remainingUserDoc.exists() 
        ? remainingUserDoc.data() as UserProfile 
        : null;
      
      const newTeamName = remainingUserData?.displayName 
        ? `${remainingUserData.displayName} (Looking for partner)` 
        : 'Player (Looking for partner)';

      batch.update(teamRef, {
        status: 'pending_partner',
        players: newPlayers,
        teamName: newTeamName,
        isLookingForPartner: true,
        pendingInvitedUserId: null,
        updatedAt: Date.now()
      });
    }
  }

  const regRef = doc(db, 'tournament_registrations', `${userId}_${tournamentId}`);
  const regSnap = await getDoc(regRef);
  if (regSnap.exists()) {
    const data = regSnap.data();
    const newSelectedIds = (data.selectedEventIds || []).filter((id: string) => id !== divisionId);
    const newPartnerDetails = { ...(data.partnerDetails || {}) };
    delete newPartnerDetails[divisionId];

    batch.update(regRef, {
      selectedEventIds: newSelectedIds,
      partnerDetails: newPartnerDetails,
      updatedAt: Date.now()
    });
  }

  await batch.commit();
};

// ============================================
// Partner Invites
// ============================================

export const subscribeToUserPartnerInvites = (
  userId: string,
  callback: (invites: PartnerInvite[]) => void
) => {
  if (!userId) {
    callback([]);
    return () => {};
  }

  const q = query(
    collection(db, 'partnerInvites'),
    where('invitedUserId', '==', userId)
  );

  return onSnapshot(
    q,
    (snap) => {
      const invites: PartnerInvite[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as PartnerInvite) }))
        .filter(invite => invite.status === 'pending');
      
      callback(invites);
    },
    (err) => {
      console.error('Error subscribing to partner invites', err);
      callback([]);
    }
  );
};

export const getPendingInvitesForDivision = async (
  tournamentId: string,
  divisionId: string,
  inviterId: string
): Promise<PartnerInvite[]> => {
  const q = query(
    collection(db, 'partnerInvites'),
    where('tournamentId', '==', tournamentId),
    where('divisionId', '==', divisionId),
    where('inviterId', '==', inviterId),
    where('status', '==', 'pending')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as PartnerInvite));
};

export const respondToPartnerInvite = async (
  invite: PartnerInvite,
  response: 'accepted' | 'declined'
): Promise<{ tournamentId: string; divisionId: string } | null> => {

  let existingTeams: Team[] = [];

  if (response === 'accepted') {
    existingTeams = await getUserTeamsForTournament(invite.tournamentId, invite.invitedUserId);

    const blockingTeams = existingTeams.filter(t =>
      t.divisionId === invite.divisionId &&
      t.status !== 'withdrawn' &&
      t.status !== 'cancelled' &&
      !(
        t.status === 'pending_partner' &&
        (t.players?.length || 0) === 1 &&
        t.players?.[0] === invite.invitedUserId
      )
    );

    if (blockingTeams.length > 0) {
      throw new Error('You are already registered in a team for this division.');
    }
  }

  const batch = writeBatch(db);

  const inviteRef = doc(db, 'partnerInvites', invite.id);
  batch.update(inviteRef, {
    status: response,
    respondedAt: Date.now(),
  });

  const teamRef = doc(
    db,
    'tournaments',
    invite.tournamentId,
    'teams',
    invite.teamId
  );

  if (response === 'accepted') {
    const teamSnap = await getDoc(teamRef);
    if (teamSnap.exists()) {
      const team = teamSnap.data() as Team;

      if (team.status !== 'pending_partner') {
        throw new Error('This team is not accepting partners anymore.');
      }

      const currentPlayers = team.players || [];

      if (currentPlayers.length >= 2) {
        throw new Error('This team is already full.');
      }

      if (currentPlayers.includes(invite.invitedUserId)) {
        throw new Error('You are already on this team.');
      }

      const players = [...currentPlayers, invite.invitedUserId];

      const inviterProfile = await getUserProfile(invite.inviterId);
      const invitedProfile = await getUserProfile(invite.invitedUserId);

      let teamName = team.teamName || '';
      if (inviterProfile && invitedProfile) {
        const inviterName = inviterProfile.displayName || 'Player 1';
        const invitedName = invitedProfile.displayName || 'Player 2';
        const nameLower = teamName.toLowerCase();
        if (!teamName || teamName === inviterName || 
            teamName.endsWith('(Pending)') || 
            nameLower.includes('looking for partner')) {
          teamName = `${inviterName} & ${invitedName}`;
        }
      }

      batch.update(teamRef, {
        status: 'active',
        players,
        teamName,
        isLookingForPartner: false,
        pendingInvitedUserId: null,
        updatedAt: Date.now(),
      });

      // Withdraw solo teams
      const soloTeamsToWithdraw = existingTeams.filter(t =>
        t.divisionId === invite.divisionId &&
        t.id !== invite.teamId &&
        t.status === 'pending_partner' &&
        (t.players?.length || 0) === 1 &&
        t.players?.[0] === invite.invitedUserId
      );

      for (const solo of soloTeamsToWithdraw) {
        const soloRef = doc(
          db,
          'tournaments',
          invite.tournamentId,
          'teams',
          solo.id
        );
        batch.update(soloRef, {
          status: 'withdrawn',
          isLookingForPartner: false,
          updatedAt: Date.now(),
        });
      }

      // Cancel other pending invites from same inviter for same division
      const otherInvitesSnap = await getDocs(
        query(
          collection(db, 'partnerInvites'),
          where('tournamentId', '==', invite.tournamentId),
          where('divisionId', '==', invite.divisionId),
          where('inviterId', '==', invite.inviterId),
          where('status', '==', 'pending')
        )
      );

      otherInvitesSnap.forEach(docSnap => {
        if (docSnap.id === invite.id) return;
        const otherInvite = docSnap.data() as PartnerInvite;
        const otherInviteRef = doc(db, 'partnerInvites', docSnap.id);
        batch.update(otherInviteRef, {
          status: 'cancelled',
          respondedAt: Date.now(),
        });
        const otherTeamRef = doc(
          db,
          'tournaments',
          otherInvite.tournamentId,
          'teams',
          otherInvite.teamId
        );
        batch.update(otherTeamRef, {
          status: 'withdrawn',
          isLookingForPartner: false,
          updatedAt: Date.now(),
        });
      });
    }
  } else {
    // Declined
    const teamSnap = await getDoc(teamRef);
    if (teamSnap.exists()) {
      const team = teamSnap.data() as Team;
      const currentPlayers = team.players || [];
      const players = currentPlayers.filter(p => p !== invite.invitedUserId);

      const captainProfile = await getUserProfile(team.captainPlayerId);
      const newName = captainProfile 
        ? `${captainProfile.displayName || 'Player'} (Looking for partner)` 
        : 'Player (Looking for partner)';

      batch.update(teamRef, {
        status: 'pending_partner',
        players,
        teamName: newName,
        isLookingForPartner: true,
        pendingInvitedUserId: null,
        updatedAt: Date.now(),
      });
    }
  }

  await batch.commit();

  if (response === 'accepted') {
    return { tournamentId: invite.tournamentId, divisionId: invite.divisionId };
  }

  return null;
};
/**
 * Tournament Registration Management
 */

import { 
  doc, 
  getDoc, 
  getDocs, 
  setDoc,
  collection, 
  query, 
  limit,
} from '@firebase/firestore';
import { db } from './config';
import { getUserProfile } from './users';
import { getTournament } from './tournaments';
import { ensureTeamExists } from './teams';
import type { TournamentRegistration } from '../../types';

// ============================================
// Registration CRUD
// ============================================

export const getRegistration = async (
  tournamentId: string,
  playerId: string
): Promise<TournamentRegistration | null> => {
  const id = `${playerId}_${tournamentId}`;
  const snap = await getDoc(doc(db, 'tournament_registrations', id));
  return snap.exists() ? snap.data() as TournamentRegistration : null;
};

export const saveRegistration = async (reg: TournamentRegistration) => {
  const id = reg.id || `${reg.playerId}_${reg.tournamentId}`;
  await setDoc(
    doc(db, 'tournament_registrations', id), 
    { ...reg, id, updatedAt: Date.now() }, 
    { merge: true }
  );
};

export const getAllRegistrations = async (limitCount = 100): Promise<TournamentRegistration[]> => {
  const snap = await getDocs(
    query(collection(db, 'tournament_registrations'), limit(limitCount))
  );
  return snap.docs.map(d => d.data() as TournamentRegistration);
};

// ============================================
// Registration Finalization
// ============================================

export const finalizeRegistration = async (
  payload: Partial<TournamentRegistration> & {
    tournamentId: string;
    playerId: string;
  }
): Promise<{ teamsCreated: number }> => {
  const { tournamentId, playerId, selectedEventIds = [], partnerDetails = {} } = payload;

  const tournament = await getTournament(tournamentId);
  if (!tournament) throw new Error('Tournament not found');

  const userProfile = await getUserProfile(playerId);
  if (!userProfile) throw new Error('User profile not found');

  const regRef = doc(db, 'tournament_registrations', `${playerId}_${tournamentId}`);
  const now = Date.now();

  let teamsCreated = 0;

  for (const divisionId of selectedEventIds) {
    const partnerInfo = partnerDetails[divisionId];
    
    if (partnerInfo?.partnerId) {
      const result = await ensureTeamExists(
        tournamentId,
        divisionId,
        [playerId, partnerInfo.partnerId],
        null,
        playerId
      );
      if (!result.existed) teamsCreated++;
    } else {
      const result = await ensureTeamExists(
        tournamentId,
        divisionId,
        [playerId],
        null,
        playerId,
        { status: 'pending_partner' }
      );
      if (!result.existed) teamsCreated++;
    }
  }

  const updatedReg: TournamentRegistration = {
    ...payload,
    id: `${playerId}_${tournamentId}`,
    playerId: payload.playerId || userProfile.id,
    tournamentId: payload.tournamentId || tournament.id,
    partnerDetails,
    selectedEventIds: payload.selectedEventIds || [],
    status: 'completed',
    waiverAccepted: !!payload.waiverAccepted,
    updatedAt: Date.now(),
    completedAt: Date.now(),
    createdAt: payload.createdAt || now,
  } as TournamentRegistration;

  await setDoc(regRef, updatedReg, { merge: true });

  return { teamsCreated };
};

// ============================================
// Ensure Registration Exists
// ============================================

export const ensureRegistrationForUser = async (
  tournamentId: string,
  playerId: string,
  divisionId: string
): Promise<TournamentRegistration> => {
  const id = `${playerId}_${tournamentId}`;
  const regRef = doc(db, 'tournament_registrations', id);
  const snap = await getDoc(regRef);

  if (snap.exists()) {
    const existing = snap.data() as TournamentRegistration;
    const selectedEventIds = Array.from(
      new Set([...(existing.selectedEventIds || []), divisionId])
    );
    const updated: TournamentRegistration = {
      ...existing,
      selectedEventIds,
      updatedAt: Date.now()
    };
    await setDoc(regRef, updated, { merge: true });
    return updated;
  }

  const reg: TournamentRegistration = {
    id,
    tournamentId,
    playerId,
    status: 'in_progress',
    waiverAccepted: false,
    selectedEventIds: [divisionId],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  await setDoc(regRef, reg);
  return reg;
};
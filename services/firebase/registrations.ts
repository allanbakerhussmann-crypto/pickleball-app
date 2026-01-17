/**
 * Tournament Registration Management
 *
 * FILE LOCATION: services/firebase/registrations.ts
 * VERSION: V06.05 - Added check-in functions
 */

import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  limit,
} from '@firebase/firestore';
import { db } from './config';
import { getUserProfile } from './users';
import { getTournament, getDivision } from './tournaments';
import { ensureTeamExists, reserveDivisionCapacity } from './teams';
import type { TournamentRegistration, Tournament, Division } from '../../types';

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
    paymentMethod?: 'stripe' | 'manual';
  }
): Promise<{ teamsCreated: number }> => {
  const { tournamentId, playerId, selectedEventIds = [], partnerDetails = {}, paymentMethod } = payload;

  const tournament = await getTournament(tournamentId);
  if (!tournament) throw new Error('Tournament not found');

  const userProfile = await getUserProfile(playerId);
  if (!userProfile) throw new Error('User profile not found');

  const regRef = doc(db, 'tournament_registrations', `${playerId}_${tournamentId}`);
  const now = Date.now();

  let teamsCreated = 0;

  // Determine payment status based on method and fee
  const isFreeEvent = tournament.isFreeEvent || tournament.entryFee === 0;
  const paymentStatus = isFreeEvent ? 'paid' : (paymentMethod === 'stripe' ? 'processing' : 'pending');

  // V07.51: Reserve capacity and validate DUPR ratings for each division FIRST
  for (const divisionId of selectedEventIds) {
    const division = await getDivision(tournamentId, divisionId);
    if (!division) throw new Error(`Division ${divisionId} not found`);

    // Check DUPR rating requirements (if division has rating limits)
    const playerRating = userProfile.duprDoublesRating || userProfile.duprSinglesRating || 0;
    if (division.minRating && playerRating < division.minRating) {
      throw new Error(`Your DUPR rating (${playerRating.toFixed(2)}) is below the minimum (${division.minRating}) for "${division.name}"`);
    }
    if (division.maxRating && playerRating > division.maxRating) {
      throw new Error(`Your DUPR rating (${playerRating.toFixed(2)}) exceeds the maximum (${division.maxRating}) for "${division.name}"`);
    }

    // Reserve capacity (transactional - prevents overbooking)
    await reserveDivisionCapacity(tournamentId, divisionId, 1);
  }

  // Now create teams (capacity already reserved)
  for (const divisionId of selectedEventIds) {
    const partnerInfo = partnerDetails[divisionId];

    if (partnerInfo?.partnerId) {
      const result = await ensureTeamExists(
        tournamentId,
        divisionId,
        [playerId, partnerInfo.partnerId],
        null,
        playerId,
        { paymentStatus, paymentMethod: isFreeEvent ? null : paymentMethod }
      );
      if (!result.existed) teamsCreated++;
    } else {
      const result = await ensureTeamExists(
        tournamentId,
        divisionId,
        [playerId],
        null,
        playerId,
        { status: 'pending_partner', paymentStatus, paymentMethod: isFreeEvent ? null : paymentMethod }
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

// ============================================
// Tournament Check-in (V06.05)
// ============================================

/**
 * Check in a player for a tournament
 */
export const checkInPlayer = async (
  tournamentId: string,
  playerId: string
): Promise<{ success: boolean; message: string }> => {
  const regId = `${playerId}_${tournamentId}`;
  const regRef = doc(db, 'tournament_registrations', regId);
  const regSnap = await getDoc(regRef);

  if (!regSnap.exists()) {
    return { success: false, message: 'Registration not found' };
  }

  const registration = regSnap.data() as TournamentRegistration;

  if (registration.checkedIn) {
    return { success: false, message: 'Player already checked in' };
  }

  if (registration.status !== 'completed') {
    return { success: false, message: 'Registration not completed' };
  }

  await updateDoc(regRef, {
    checkedIn: true,
    checkedInAt: Date.now(),
    updatedAt: Date.now(),
  });

  return { success: true, message: 'Check-in successful' };
};

/**
 * Check if player is checked in
 */
export const isPlayerCheckedIn = async (
  tournamentId: string,
  playerId: string
): Promise<boolean> => {
  const regId = `${playerId}_${tournamentId}`;
  const regSnap = await getDoc(doc(db, 'tournament_registrations', regId));

  if (!regSnap.exists()) return false;

  const registration = regSnap.data() as TournamentRegistration;
  return registration.checkedIn === true;
};

/**
 * Get check-in stats for a tournament
 */
export const getCheckInStats = async (
  tournamentId: string
): Promise<{ total: number; checkedIn: number }> => {
  const q = query(
    collection(db, 'tournament_registrations'),
    where('tournamentId', '==', tournamentId),
    where('status', '==', 'completed')
  );

  const snap = await getDocs(q);
  let checkedIn = 0;

  snap.docs.forEach(d => {
    const reg = d.data() as TournamentRegistration;
    if (reg.checkedIn) checkedIn++;
  });

  return { total: snap.size, checkedIn };
};

/**
 * Check if check-in is within allowed window
 */
export const isWithinCheckInWindow = (
  tournament: Tournament,
  checkInWindowMinutes: number = 60
): boolean => {
  if (!tournament.startDate) return false;

  const now = Date.now();
  const tournamentStart = tournament.startDate;

  // Check-in opens X minutes before start
  const checkInOpens = tournamentStart - (checkInWindowMinutes * 60 * 1000);

  // Check-in closes 15 minutes after start
  const checkInCloses = tournamentStart + (15 * 60 * 1000);

  return now >= checkInOpens && now <= checkInCloses;
};

/**
 * Get all registrations for a tournament with check-in status
 */
export const getTournamentRegistrations = async (
  tournamentId: string
): Promise<TournamentRegistration[]> => {
  const q = query(
    collection(db, 'tournament_registrations'),
    where('tournamentId', '==', tournamentId)
  );

  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as TournamentRegistration);
};
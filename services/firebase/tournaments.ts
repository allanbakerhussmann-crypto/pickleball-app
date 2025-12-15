/**
 * Tournament and Division Management
 */

import { 
  doc, 
  getDoc, 
  getDocs, 
  setDoc,
  updateDoc,
  collection, 
  query, 
  orderBy,
  limit,
  onSnapshot,
  writeBatch,
} from '@firebase/firestore';
import { db } from './config';
import type { Tournament, Division } from '../../types';

// ============================================
// Tournament CRUD
// ============================================

export const saveTournament = async (tournament: Tournament, divisions?: Division[]) => {
  const now = Date.now();
  const tournamentRef = tournament.id 
    ? doc(db, 'tournaments', tournament.id) 
    : doc(collection(db, 'tournaments'));
  
  const tournamentData = {
    ...tournament,
    id: tournamentRef.id,
    updatedAt: now,
    createdAt: tournament.createdAt || now
  };

  await setDoc(tournamentRef, tournamentData);

  if (divisions) {
    const batch = writeBatch(db);
    divisions.forEach(div => {
      const divRef = doc(db, 'tournaments', tournamentRef.id, 'divisions', div.id);
      batch.set(divRef, { ...div, updatedAt: now });
    });
    await batch.commit();
  }

  return tournamentRef.id;
};

export const subscribeToTournaments = (
  _userId: string, 
  callback: (tournaments: Tournament[]) => void
) => {
  const q = query(
    collection(db, 'tournaments'), 
    orderBy('startDatetime', 'desc'), 
    limit(50)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Tournament)));
  });
};

export const getAllTournaments = async (limitCount = 50): Promise<Tournament[]> => {
  const snap = await getDocs(
    query(
      collection(db, 'tournaments'), 
      orderBy('startDatetime', 'desc'), 
      limit(limitCount)
    )
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Tournament));
};

export const getTournament = async (id: string): Promise<Tournament | null> => {
  const snap = await getDoc(doc(db, 'tournaments', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } as Tournament : null;
};

// ============================================
// Division Management
// ============================================

export const subscribeToDivisions = (
  tournamentId: string, 
  callback: (divisions: Division[]) => void
) => {
  return onSnapshot(
    collection(db, 'tournaments', tournamentId, 'divisions'), 
    (snap) => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Division)));
    }
  );
};

export const updateDivision = async (
  tournamentId: string,
  divisionId: string,
  updates: Partial<Division>
): Promise<void> => {
  const divRef = doc(db, 'tournaments', tournamentId, 'divisions', divisionId);
  await updateDoc(divRef, { ...updates, updatedAt: Date.now() });
};
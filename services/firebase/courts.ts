/**
 * Tournament Court Management
 * 
 * Courts for tournaments (not club court bookings)
 * 
 * FILE LOCATION: services/firebase/courts.ts
 */

import { 
  doc, 
  setDoc,
  updateDoc,
  deleteDoc,
  collection, 
  query, 
  orderBy,
  onSnapshot,
} from '@firebase/firestore';
import { db } from './config';
import type { Court } from '../../types';

// ============================================
// Tournament Court CRUD
// ============================================

export const subscribeToCourts = (
  tournamentId: string, 
  callback: (courts: Court[]) => void
) => {
  const q = query(
    collection(db, 'tournaments', tournamentId, 'courts'), 
    orderBy('order', 'asc')
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Court)));
  });
};

export const addCourt = async (
  tournamentId: string, 
  name: string, 
  order: number
) => {
  const ref = doc(collection(db, 'tournaments', tournamentId, 'courts'));
  await setDoc(ref, { 
    id: ref.id, 
    tournamentId,
    name, 
    order,
    active: true,
    createdAt: Date.now() 
  });
};

export const updateCourt = async (
  tournamentId: string, 
  courtId: string, 
  data: Partial<Court>
) => {
  await updateDoc(
    doc(db, 'tournaments', tournamentId, 'courts', courtId), 
    { ...data, updatedAt: Date.now() }
  );
};

export const deleteCourt = async (tournamentId: string, courtId: string) => {
  await deleteDoc(doc(db, 'tournaments', tournamentId, 'courts', courtId));
};
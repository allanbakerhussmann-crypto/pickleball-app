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
  arrayUnion,
} from '@firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from '@firebase/storage';
import { db, storage } from './config';
import type { Tournament, Division, TournamentSponsor, TournamentDay } from '../../types';

// ============================================
// Tournament CRUD
// ============================================

export const saveTournament = async (tournament: Tournament, divisions?: Division[]) => {
  const now = Date.now();
  const tournamentRef = tournament.id
    ? doc(db, 'tournaments', tournament.id)
    : doc(collection(db, 'tournaments'));

  // Remove undefined values (Firestore rejects undefined)
  const cleanData = (obj: Record<string, any>): Record<string, any> => {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = value;
      }
    }
    return cleaned;
  };

  const tournamentData = cleanData({
    ...tournament,
    id: tournamentRef.id,
    updatedAt: now,
    createdAt: tournament.createdAt || now
  });

  await setDoc(tournamentRef, tournamentData);

  if (divisions) {
    const batch = writeBatch(db);
    divisions.forEach(div => {
      const divRef = doc(db, 'tournaments', tournamentRef.id, 'divisions', div.id);
      // V06.36 FIX: Always set tournamentId on division (was sometimes empty string)
      batch.set(divRef, cleanData({ ...div, tournamentId: tournamentRef.id, updatedAt: now }));
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

  // Filter out undefined values - Firestore rejects them
  // This prevents crashes when form fields are empty (e.g., skillMin: undefined)
  // V06.36 FIX: Always ensure tournamentId is set correctly (was sometimes empty string)
  // Note: null values ARE allowed (used to clear fields like tournamentDayId)
  const filteredUpdates: { [key: string]: any } = {
    updatedAt: Date.now(),
    tournamentId,
  };
  for (const [key, value] of Object.entries(updates)) {
    // Allow null (to clear fields) but filter out undefined
    if (value !== undefined) {
      filteredUpdates[key] = value;
    }
  }

  await updateDoc(divRef, filteredUpdates);
};

// ============================================
// Sponsor Management
// ============================================

/**
 * Upload sponsor logo to Firebase Storage
 */
export const uploadSponsorLogo = async (
  tournamentId: string,
  sponsorId: string,
  file: File
): Promise<string> => {
  const ext = file.name.split('.').pop() || 'png';
  const path = `sponsor_logos/${tournamentId}/${sponsorId}.${ext}`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, file);
  return await getDownloadURL(storageRef);
};

/**
 * Delete sponsor logo from Firebase Storage
 */
export const deleteSponsorLogo = async (logoUrl: string): Promise<void> => {
  try {
    const storageRef = ref(storage, logoUrl);
    await deleteObject(storageRef);
  } catch (error) {
    // Ignore if file doesn't exist
    console.warn('Could not delete sponsor logo:', error);
  }
};

/**
 * Add a new sponsor to a tournament
 */
export const addTournamentSponsor = async (
  tournamentId: string,
  sponsor: Omit<TournamentSponsor, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> => {
  const tournament = await getTournament(tournamentId);
  if (!tournament) throw new Error('Tournament not found');

  const now = Date.now();
  const sponsorId = `sponsor_${now}`;

  const newSponsor: TournamentSponsor = {
    ...sponsor,
    id: sponsorId,
    createdAt: now,
    updatedAt: now,
  };

  const existingSponsors = tournament.sponsors || [];

  await updateDoc(doc(db, 'tournaments', tournamentId), {
    sponsors: [...existingSponsors, newSponsor],
    updatedAt: now,
  });

  return sponsorId;
};

/**
 * Update an existing sponsor
 */
export const updateTournamentSponsor = async (
  tournamentId: string,
  sponsorId: string,
  updates: Partial<TournamentSponsor>
): Promise<void> => {
  const tournament = await getTournament(tournamentId);
  if (!tournament) throw new Error('Tournament not found');

  const existingSponsors = tournament.sponsors || [];
  const sponsorIndex = existingSponsors.findIndex(s => s.id === sponsorId);

  if (sponsorIndex === -1) throw new Error('Sponsor not found');

  const now = Date.now();
  existingSponsors[sponsorIndex] = {
    ...existingSponsors[sponsorIndex],
    ...updates,
    updatedAt: now,
  };

  await updateDoc(doc(db, 'tournaments', tournamentId), {
    sponsors: existingSponsors,
    updatedAt: now,
  });
};

/**
 * Remove a sponsor from a tournament
 */
export const removeTournamentSponsor = async (
  tournamentId: string,
  sponsorId: string,
  deleteLogoFile = true
): Promise<void> => {
  const tournament = await getTournament(tournamentId);
  if (!tournament) throw new Error('Tournament not found');

  const existingSponsors = tournament.sponsors || [];
  const sponsor = existingSponsors.find(s => s.id === sponsorId);

  if (!sponsor) throw new Error('Sponsor not found');

  // Optionally delete the logo file
  if (deleteLogoFile && sponsor.logoUrl) {
    await deleteSponsorLogo(sponsor.logoUrl);
  }

  const filteredSponsors = existingSponsors.filter(s => s.id !== sponsorId);

  await updateDoc(doc(db, 'tournaments', tournamentId), {
    sponsors: filteredSponsors,
    updatedAt: Date.now(),
  });
};

/**
 * Reorder sponsors (after drag-drop)
 */
export const reorderTournamentSponsors = async (
  tournamentId: string,
  reorderedSponsors: TournamentSponsor[]
): Promise<void> => {
  // Update displayOrder based on array position
  const sponsorsWithOrder = reorderedSponsors.map((sponsor, index) => ({
    ...sponsor,
    displayOrder: index,
    updatedAt: Date.now(),
  }));

  await updateDoc(doc(db, 'tournaments', tournamentId), {
    sponsors: sponsorsWithOrder,
    updatedAt: Date.now(),
  });
};

/**
 * Update sponsor display settings
 */
export const updateSponsorDisplaySettings = async (
  tournamentId: string,
  settings: Partial<Tournament['sponsorSettings']>
): Promise<void> => {
  const tournament = await getTournament(tournamentId);
  if (!tournament) throw new Error('Tournament not found');

  await updateDoc(doc(db, 'tournaments', tournamentId), {
    sponsorSettings: {
      ...(tournament.sponsorSettings || {
        showOnCards: true,
        showOnHeader: true,
        showOnRegistration: true,
        showOnScoreboard: true,
      }),
      ...settings,
    },
    updatedAt: Date.now(),
  });
};

// ============================================
// Tournament Staff Management
// ============================================

/** Staff member details for display */
export interface TournamentStaffMember {
  userId: string;
  displayName: string;
  email: string;
  photoURL?: string;
}

/**
 * Add a user as tournament staff
 */
export const addTournamentStaff = async (
  tournamentId: string,
  userId: string
): Promise<void> => {
  const tournamentRef = doc(db, 'tournaments', tournamentId);
  await updateDoc(tournamentRef, {
    staffIds: arrayUnion(userId),
    updatedAt: Date.now(),
  });
};

/**
 * Remove a user from tournament staff
 */
export const removeTournamentStaff = async (
  tournamentId: string,
  userId: string
): Promise<void> => {
  const tournament = await getTournament(tournamentId);
  if (!tournament) throw new Error('Tournament not found');

  const updatedStaff = (tournament.staffIds || []).filter(id => id !== userId);

  await updateDoc(doc(db, 'tournaments', tournamentId), {
    staffIds: updatedStaff,
    updatedAt: Date.now(),
  });
};

/**
 * Get staff member details with user profiles
 */
export const getTournamentStaffDetails = async (
  staffIds: string[]
): Promise<TournamentStaffMember[]> => {
  if (!staffIds.length) return [];

  const staffDetails = await Promise.all(
    staffIds.map(async (userId) => {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (!userDoc.exists()) return null;
      const data = userDoc.data();
      return {
        userId,
        displayName: data.displayName || 'Unknown',
        email: data.email || '',
        photoURL: data.photoURL || data.photoData,
      };
    })
  );

  return staffDetails.filter((s): s is NonNullable<typeof s> => s !== null) as TournamentStaffMember[];
};

// ============================================
// Tournament Day Management
// ============================================

/**
 * Add a new day to a tournament
 */
export const addTournamentDay = async (
  tournamentId: string,
  day: Omit<TournamentDay, 'id'>
): Promise<string> => {
  const tournament = await getTournament(tournamentId);
  if (!tournament) throw new Error('Tournament not found');

  const dayId = `day-${Date.now()}`;
  const newDay: TournamentDay = {
    ...day,
    id: dayId,
  };

  const existingDays = tournament.days || [];
  existingDays.push(newDay);

  // Sort by date
  existingDays.sort((a, b) => a.date.localeCompare(b.date));

  await updateDoc(doc(db, 'tournaments', tournamentId), {
    days: existingDays,
    updatedAt: Date.now(),
  });

  return dayId;
};

/**
 * Update an existing tournament day
 */
export const updateTournamentDay = async (
  tournamentId: string,
  dayId: string,
  updates: Partial<TournamentDay>
): Promise<void> => {
  const tournament = await getTournament(tournamentId);
  if (!tournament) throw new Error('Tournament not found');

  const existingDays = tournament.days || [];
  const dayIndex = existingDays.findIndex(d => d.id === dayId);

  if (dayIndex === -1) throw new Error('Day not found');

  existingDays[dayIndex] = {
    ...existingDays[dayIndex],
    ...updates,
  };

  // Re-sort by date in case date was changed
  existingDays.sort((a, b) => a.date.localeCompare(b.date));

  await updateDoc(doc(db, 'tournaments', tournamentId), {
    days: existingDays,
    updatedAt: Date.now(),
  });
};

/**
 * Remove a tournament day
 */
export const removeTournamentDay = async (
  tournamentId: string,
  dayId: string
): Promise<void> => {
  const tournament = await getTournament(tournamentId);
  if (!tournament) throw new Error('Tournament not found');

  const filteredDays = (tournament.days || []).filter(d => d.id !== dayId);

  await updateDoc(doc(db, 'tournaments', tournamentId), {
    days: filteredDays,
    updatedAt: Date.now(),
  });
};

/**
 * Start a tournament day (mark it as the active day)
 */
export const startTournamentDay = async (
  tournamentId: string,
  dayId: string
): Promise<void> => {
  await updateDoc(doc(db, 'tournaments', tournamentId), {
    activeDayId: dayId,
    updatedAt: Date.now(),
  });
};
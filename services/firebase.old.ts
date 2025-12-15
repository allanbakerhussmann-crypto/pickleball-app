// FIREBASE SERVICE - HARDCODED CONFIG VERSION
// All functions preserved from original - only config section changed
import { initializeApp, getApps } from '@firebase/app';
import { getAuth as getFirebaseAuth, type Auth } from '@firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  onSnapshot,
  updateDoc,
  writeBatch,
  limit,
  collectionGroup,
  runTransaction,
  deleteDoc,
  orderBy, 
  arrayUnion,
  arrayRemove,
  type Firestore
} from '@firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from '@firebase/storage';
import { getFunctions, httpsCallable } from '@firebase/functions';
import type { Tournament, UserProfile, TournamentRegistration, Team, Division, Match, PartnerInvite, Club, UserRole, ClubJoinRequest, Court, StandingsEntry, SeedingMethod, TieBreaker, GenderCategory, SocialEvent, Meetup, MeetupRSVP } from '../types';

// ============================================
// 🔥 HARDCODED FIREBASE CONFIG
// ============================================
// This bypasses all cookie/localStorage/env issues in AI Studio

const firebaseConfig = {
  apiKey: "AIzaSyBPeYXnPobCZ7bPH0g_2IYOP55-1PFTWTE",
  authDomain: "pickleball-app-dev.firebaseapp.com",
  projectId: "pickleball-app-dev",
  storageBucket: "pickleball-app-dev.firebasestorage.app",
  messagingSenderId: "906655677998",
  appId: "1:906655677998:web:b7fe4bb2f479ba79c069bf",
  measurementId: "G-WWLE6K6J7Z"
};

console.log('🔥 Firebase: Using HARDCODED config for pickleball-app-dev');

// ✅ HMR / refresh-safe Firebase initialization
let app;
const existingApps = getApps();
if (existingApps.length > 0) {
  app = existingApps[0];
} else {
  app = initializeApp(firebaseConfig);
}

const authInstance: Auth = getFirebaseAuth(app);
export const db: Firestore = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app);

export const getAuth = (): Auth => authInstance;

// Config helper functions - always return true since config is hardcoded
export const saveFirebaseConfig = (configJson: string) => {
  console.log('ℹ️ Config is hardcoded - saveFirebaseConfig is a no-op');
  return { success: true };
};

export const hasCustomConfig = () => true;
export const isFirebaseConfigured = () => true;

// --- Social Play / Meetups ---

export const createMeetup = async (meetupData: Omit<Meetup, "id"|"createdAt"|"updatedAt">): Promise<string> => {
    const meetupsRef = collection(db, 'meetups');
    const newDocRef = doc(meetupsRef);
    const now = Date.now();
    const meetup: Meetup = {
        ...meetupData,
        id: newDocRef.id,
        createdAt: now,
        updatedAt: now
    };
    await setDoc(newDocRef, meetup);
    return newDocRef.id;
};

export const getMeetups = async (): Promise<Meetup[]> => {
    const q = query(collection(db, 'meetups'), orderBy('when', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Meetup);
};

export const getMeetupById = async (meetupId: string): Promise<Meetup | null> => {
    const snap = await getDoc(doc(db, 'meetups', meetupId));
    return snap.exists() ? (snap.data() as Meetup) : null;
};

export const setMeetupRSVP = async (meetupId: string, userId: string, status: "going"|"maybe"): Promise<void> => {
    const rsvpRef = doc(db, 'meetups', meetupId, 'rsvps', userId);
    await setDoc(rsvpRef, {
        userId,
        status,
        createdAt: Date.now()
    });
};

export const getMeetupRSVPs = async (meetupId: string): Promise<MeetupRSVP[]> => {
    const rsvpsRef = collection(db, 'meetups', meetupId, 'rsvps');
    const snap = await getDocs(rsvpsRef);
    const rsvps = snap.docs.map(d => d.data() as MeetupRSVP);
    
    if (rsvps.length > 0) {
        const userIds = rsvps.map(r => r.userId);
        const users = await getUsersByIds(userIds); 
        const userMap = new Map(users.map(u => [u.id, u]));
        return rsvps.map(r => ({
            ...r,
            userProfile: userMap.get(r.userId)
        }));
    }
    return rsvps;
};

// --- Legacy Social Play ---
export const createSocialEvent = async (event: Omit<SocialEvent, 'id'>) => {
    const ref = doc(collection(db, 'social_events'));
    await setDoc(ref, { ...event, id: ref.id });
};

export const subscribeToSocialEvents = (callback: (events: SocialEvent[]) => void) => {
    const q = query(collection(db, 'social_events'), orderBy('date', 'asc'), orderBy('startTime', 'asc'));
    return onSnapshot(q, (snap) => {
        const events = snap.docs.map(d => d.data() as SocialEvent);
        callback(events);
    });
};

export const joinSocialEvent = async (eventId: string, userId: string) => {
    const ref = doc(db, 'social_events', eventId);
    await updateDoc(ref, {
        attendees: arrayUnion(userId)
    });
};

export const leaveSocialEvent = async (eventId: string, userId: string) => {
    const ref = doc(db, 'social_events', eventId);
    await updateDoc(ref, {
        attendees: arrayRemove(userId)
    });
};

export const deleteSocialEvent = async (eventId: string) => {
    await deleteDoc(doc(db, 'social_events', eventId));
};

// --- Team Functions ---

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
      if (tPlayers.length === normalizedPlayers.length && normalizedPlayers.every((p, i) => p === tPlayers[i])) {
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
        if (tPlayers.length === normalizedPlayers.length && normalizedPlayers.every((p, i) => p === tPlayers[i])) {
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
    return { existed: false, teamId: teamRef.id, team: createdSnap.exists() ? { id: createdSnap.id, ...createdSnap.data() } : null };
  } catch (err: any) {
    if (err && err.alreadyExists) {
      return { existed: true, teamId: err.teamId, team: err.team };
    }
    console.error('ensureTeamExists transaction error', err);
    throw err;
  }
};

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
      const remainingUserData = remainingUserDoc.exists() ? remainingUserDoc.data() as UserProfile : null;
      
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
    const data = regSnap.data() as TournamentRegistration;
    const newSelectedIds = (data.selectedEventIds || []).filter(id => id !== divisionId);
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

// --- User Profile Functions ---

export const createUserProfile = async (userId: string, data: Partial<UserProfile>) => {
  const userRef = doc(db, 'users', userId);
  await setDoc(userRef, { ...data, id: userId, createdAt: Date.now(), updatedAt: Date.now() }, { merge: true });
};

export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  const snap = await getDoc(doc(db, 'users', userId));
  return snap.exists() ? { id: snap.id, ...snap.data() } as UserProfile : null;
};

export const updateUserProfileDoc = async (userId: string, data: Partial<UserProfile>) => {
  await updateDoc(doc(db, 'users', userId), { ...data, updatedAt: Date.now() });
};

export const searchUsers = async (searchTerm: string): Promise<UserProfile[]> => {
  const usersRef = collection(db, 'users');
  const term = searchTerm.toLowerCase().trim();
  if (!term) return [];

  const allUsersSnap = await getDocs(query(usersRef, limit(200)));
  const users: UserProfile[] = allUsersSnap.docs.map(d => ({ id: d.id, ...d.data() } as UserProfile));

  return users.filter(u => {
    const displayNameLower = (u.displayName || '').toLowerCase();
    const emailLower = (u.email || '').toLowerCase();
    const firstNameLower = (u.firstName || '').toLowerCase();
    const lastNameLower = (u.lastName || '').toLowerCase();
    const fullName = `${firstNameLower} ${lastNameLower}`;

    return (
      displayNameLower.includes(term) ||
      emailLower.includes(term) ||
      firstNameLower.includes(term) ||
      lastNameLower.includes(term) ||
      fullName.includes(term)
    );
  });
};

export const searchEligiblePartners = async (
  searchTerm: string,
  tournamentId: string,
  divisionId: string,
  currentUserId: string
): Promise<UserProfile[]> => {
  const matchedUsers = await searchUsers(searchTerm);
  if (!matchedUsers.length) return [];

  const teamsSnap = await getDocs(
    query(
      collection(db, 'tournaments', tournamentId, 'teams'),
      where('divisionId', '==', divisionId)
    )
  );

  const playersInDivision = new Set<string>();
  teamsSnap.docs.forEach(d => {
    const t = d.data();
    if (t.status === 'active' || t.status === 'pending_partner') {
      (t.players || []).forEach((p: string) => playersInDivision.add(p));
    }
  });

  return matchedUsers.filter(u => u.id !== currentUserId && !playersInDivision.has(u.id));
};

export const getAllUsers = async (limitCount = 100): Promise<UserProfile[]> => {
  const snap = await getDocs(query(collection(db, 'users'), limit(limitCount)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as UserProfile));
};

export const getUsersByIds = async (userIds: string[]): Promise<UserProfile[]> => {
  if (!userIds.length) return [];
  const promises = userIds.map(id => getDoc(doc(db, 'users', id)));
  const snaps = await Promise.all(promises);
  return snaps.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() } as UserProfile));
};

export const uploadProfileImage = async (userId: string, file: File): Promise<string> => {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `profile_images/${userId}.${ext}`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, file);
  const downloadURL = await getDownloadURL(storageRef);

  await updateDoc(doc(db, 'users', userId), {
    photoURL: downloadURL,
    updatedAt: Date.now()
  });

  return downloadURL;
};

// --- Role Management ---

const addRole = async (userId: string, role: UserRole) => {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, { roles: arrayUnion(role), updatedAt: Date.now() });
};

const removeRole = async (userId: string, role: UserRole) => {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, { roles: arrayRemove(role), updatedAt: Date.now() });
};

export const promoteToAppAdmin = async (targetUserId: string) => {
  const userRef = doc(db, 'users', targetUserId);
  await updateDoc(userRef, {
    roles: arrayUnion('app_admin'),
    isAppAdmin: true,
    updatedAt: Date.now()
  });
};

export const demoteFromAppAdmin = async (targetUserId: string, currentUserId: string) => {
  if (targetUserId === currentUserId) {
    throw new Error("You cannot demote yourself from App Admin.");
  }
  const userRef = doc(db, 'users', targetUserId);
  await updateDoc(userRef, {
    roles: arrayRemove('app_admin'),
    isAppAdmin: false,
    updatedAt: Date.now()
  });
};

export const promoteToOrganizer = async (userId: string) => addRole(userId, 'organizer');
export const demoteFromOrganizer = async (userId: string) => removeRole(userId, 'organizer');
export const promoteToPlayer = async (userId: string) => addRole(userId, 'player');
export const demoteFromPlayer = async (userId: string) => removeRole(userId, 'player');

// --- Club Functions ---

export const createClub = async (clubData: Partial<Club>): Promise<string> => {
  const clubRef = doc(collection(db, 'clubs'));
  const now = Date.now();
  const club: Club = {
    id: clubRef.id,
    name: clubData.name || 'Unnamed Club',
    description: clubData.description || '',
    location: clubData.location || '',
    adminIds: clubData.adminIds || [],
    memberIds: clubData.memberIds || [],
    courtCount: clubData.courtCount || 0,
    isPublic: clubData.isPublic ?? true,
    createdAt: now,
    updatedAt: now,
    ...clubData
  };
  await setDoc(clubRef, club);
  return clubRef.id;
};

export const getAllClubs = async (): Promise<Club[]> => {
  const snap = await getDocs(collection(db, 'clubs'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Club));
};

export const getUserClubs = async (userId: string): Promise<Club[]> => {
  const allClubs = await getAllClubs();
  return allClubs.filter(c => 
    c.adminIds?.includes(userId) || 
    c.memberIds?.includes(userId)
  );
};

export const subscribeToClub = (clubId: string, callback: (club: Club) => void) => {
  return onSnapshot(doc(db, 'clubs', clubId), (snap) => {
    if (snap.exists()) callback({ id: snap.id, ...snap.data() } as Club);
  });
};

export const subscribeToClubRequests = (clubId: string, callback: (reqs: ClubJoinRequest[]) => void) => {
  const q = query(collection(db, 'clubs', clubId, 'joinRequests'), where('status', '==', 'pending'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as ClubJoinRequest)));
  });
};

export const subscribeToMyClubJoinRequest = (clubId: string, userId: string, callback: (hasPending: boolean) => void) => {
  const q = query(collection(db, 'clubs', clubId, 'joinRequests'), where('userId', '==', userId), where('status', '==', 'pending'));
  return onSnapshot(q, (snap) => callback(!snap.empty));
};

export const requestJoinClub = async (clubId: string, userId: string) => {
  const existingQ = query(
    collection(db, 'clubs', clubId, 'joinRequests'),
    where('userId', '==', userId),
    where('status', '==', 'pending')
  );
  const existingSnap = await getDocs(existingQ);
  if (!existingSnap.empty) return;

  const reqRef = doc(collection(db, 'clubs', clubId, 'joinRequests'));
  await setDoc(reqRef, {
    id: reqRef.id,
    clubId,
    userId,
    status: 'pending',
    createdAt: Date.now()
  });
};

export const approveClubJoinRequest = async (clubId: string, requestId: string, userId: string) => {
  const batch = writeBatch(db);
  
  const reqRef = doc(db, 'clubs', clubId, 'joinRequests', requestId);
  batch.update(reqRef, { status: 'approved', updatedAt: Date.now() });

  const clubRef = doc(db, 'clubs', clubId);
  batch.update(clubRef, { memberIds: arrayUnion(userId), updatedAt: Date.now() });

  await batch.commit();
};

export const declineClubJoinRequest = async (clubId: string, requestId: string) => {
  await updateDoc(doc(db, 'clubs', clubId, 'joinRequests', requestId), { status: 'declined', updatedAt: Date.now() });
};

export const bulkImportClubMembers = async (params: any): Promise<any[]> => {
  console.log('bulkImportClubMembers called', params);
  return [];
};

// --- Court Functions ---

export const subscribeToCourts = (tournamentId: string, callback: (courts: Court[]) => void) => {
  const q = query(collection(db, 'tournaments', tournamentId, 'courts'), orderBy('order', 'asc'));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Court)));
  });
};

export const addCourt = async (tournamentId: string, name: string, order: number) => {
  const ref = doc(collection(db, 'tournaments', tournamentId, 'courts'));
  await setDoc(ref, { id: ref.id, name, order, createdAt: Date.now() });
};

export const updateCourt = async (tournamentId: string, courtId: string, data: Partial<Court>) => {
  await updateDoc(doc(db, 'tournaments', tournamentId, 'courts', courtId), { ...data, updatedAt: Date.now() });
};

export const deleteCourt = async (tournamentId: string, courtId: string) => {
  await deleteDoc(doc(db, 'tournaments', tournamentId, 'courts', courtId));
};

// --- Schedule Generation ---

export const generatePoolsSchedule = async (tournamentId: string, division: Division, teams: Team[], playersCache: Record<string, UserProfile>) => {
  const matches: Match[] = [];
  const now = Date.now();

  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const matchRef = doc(collection(db, 'tournaments', tournamentId, 'matches'));
      const match: Match = {
        id: matchRef.id,
        tournamentId,
        divisionId: division.id,
        round: 1,
        matchNumber: matches.length + 1,
        team1Id: teams[i].id,
        team2Id: teams[j].id,
        status: 'scheduled',
        scores: [],
        createdAt: now,
        updatedAt: now
      };
      matches.push(match);
    }
  }

  const batch = writeBatch(db);
  matches.forEach(m => {
    batch.set(doc(db, 'tournaments', tournamentId, 'matches', m.id), m);
  });
  await batch.commit();

  return matches;
};

export const generateBracketSchedule = async (
  tournamentId: string,
  division: Division,
  teams: Team[],
  playersCache: Record<string, UserProfile>
) => {
  const matches: Match[] = [];
  const now = Date.now();
  const numTeams = teams.length;
  
  const nextPowerOf2 = Math.pow(2, Math.ceil(Math.log2(numTeams)));
  const numByes = nextPowerOf2 - numTeams;
  const numRounds = Math.ceil(Math.log2(nextPowerOf2));

  let matchNumber = 1;
  for (let round = 1; round <= numRounds; round++) {
    const matchesInRound = nextPowerOf2 / Math.pow(2, round);
    for (let i = 0; i < matchesInRound; i++) {
      const matchRef = doc(collection(db, 'tournaments', tournamentId, 'matches'));
      const match: Match = {
        id: matchRef.id,
        tournamentId,
        divisionId: division.id,
        round,
        matchNumber: matchNumber++,
        team1Id: round === 1 && i < teams.length ? teams[i * 2]?.id : undefined,
        team2Id: round === 1 && i * 2 + 1 < teams.length ? teams[i * 2 + 1]?.id : undefined,
        status: 'scheduled',
        scores: [],
        createdAt: now,
        updatedAt: now
      };
      matches.push(match);
    }
  }

  const batch = writeBatch(db);
  matches.forEach(m => {
    batch.set(doc(db, 'tournaments', tournamentId, 'matches', m.id), m);
  });
  await batch.commit();

  return matches;
};

export const generateFinalsFromPools = async (
  tournamentId: string,
  division: Division,
  teams: Team[],
  playersCache: Record<string, UserProfile>,
  standings: StandingsEntry[]
) => {
  const qualifyingTeams = standings.slice(0, division.advanceCount || 4);
  return generateBracketSchedule(tournamentId, division, qualifyingTeams.map(s => teams.find(t => t.id === s.teamId)!).filter(Boolean), playersCache);
};

// --- Tournament Functions ---

export const saveTournament = async (tournament: Tournament, divisions?: Division[]) => {
  const now = Date.now();
  const tournamentRef = tournament.id ? doc(db, 'tournaments', tournament.id) : doc(collection(db, 'tournaments'));
  
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

export const subscribeToTournaments = (userId: string, callback: (tournaments: Tournament[]) => void) => {
  const q = query(collection(db, 'tournaments'), orderBy('startDate', 'desc'), limit(50));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Tournament)));
  });
};

export const getAllTournaments = async (limitCount = 50): Promise<Tournament[]> => {
  const snap = await getDocs(query(collection(db, 'tournaments'), orderBy('startDate', 'desc'), limit(limitCount)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Tournament));
};

export const getTournament = async (id: string): Promise<Tournament | null> => {
  const snap = await getDoc(doc(db, 'tournaments', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } as Tournament : null;
};

export const subscribeToDivisions = (tournamentId: string, callback: (divisions: Division[]) => void) => {
  return onSnapshot(collection(db, 'tournaments', tournamentId, 'divisions'), (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Division)));
  });
};

export const updateDivision = async (
  tournamentId: string,
  divisionId: string,
  updates: Partial<Division>
): Promise<void> => {
  const divRef = doc(db, 'tournaments', tournamentId, 'divisions', divisionId);
  await updateDoc(divRef, { ...updates, updatedAt: Date.now() });
};

export const subscribeToTeams = (tournamentId: string, callback: (teams: Team[]) => void) => {
  return onSnapshot(collection(db, 'tournaments', tournamentId, 'teams'), (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Team)));
  });
};

export const subscribeToMatches = (tournamentId: string, callback: (matches: Match[]) => void) => {
  return onSnapshot(collection(db, 'tournaments', tournamentId, 'matches'), (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Match)));
  });
};

export const createTeam = async (tournamentId: string, team: Team) => {
  await setDoc(doc(db, 'tournaments', tournamentId, 'teams', team.id), team);
};

export const deleteTeam = async (tournamentId: string, teamId: string) => {
  await deleteDoc(doc(db, 'tournaments', tournamentId, 'teams', teamId));
};

export const createMatch = async (tournamentId: string, match: Match) => {
  await setDoc(doc(db, 'tournaments', tournamentId, 'matches', match.id), match);
};

export const updateMatchScore = async (tournamentId: string, matchId: string, updates: Partial<Match>) => {
  await updateDoc(doc(db, 'tournaments', tournamentId, 'matches', matchId), { ...updates, updatedAt: Date.now() });
};

export const batchCreateMatches = async (tournamentId: string, matches: Match[]) => {
  const batch = writeBatch(db);
  matches.forEach(m => {
    batch.set(doc(db, 'tournaments', tournamentId, 'matches', m.id), m);
  });
  await batch.commit();
};

// --- Registration Functions ---

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
  await setDoc(doc(db, 'tournament_registrations', id), { ...reg, id, updatedAt: Date.now() }, { merge: true });
};

export const getAllRegistrations = async (limitCount = 100): Promise<TournamentRegistration[]> => {
  const snap = await getDocs(query(collection(db, 'tournament_registrations'), limit(limitCount)));
  return snap.docs.map(d => d.data() as TournamentRegistration);
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
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Team)).filter(t => t.status === 'pending_partner');
};

export const getTeamsForDivision = async (tournamentId: string, divisionId: string): Promise<Team[]> => {
  const q = query(
    collection(db, 'tournaments', tournamentId, 'teams'),
    where('divisionId', '==', divisionId)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Team));
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
    playerId: payload.playerId || userProfile.id,
    tournamentId: payload.tournamentId || tournament.id,
    partnerDetails,
    selectedEventIds: payload.selectedEventIds || [],
    status: 'completed',
    waiverAccepted: !!payload.waiverAccepted,
    updatedAt: Date.now(),
    completedAt: Date.now(),
    createdAt: payload.createdAt || now,
  };

  await setDoc(regRef, updatedReg, { merge: true });

  return { teamsCreated };
};

// --- Partner Invite Functions ---

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
        if (!teamName || teamName === inviterName || teamName.endsWith('(Pending)') || nameLower.includes('looking for partner')) {
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
    const teamSnap = await getDoc(teamRef);
    if (teamSnap.exists()) {
      const team = teamSnap.data() as Team;
      const currentPlayers = team.players || [];
      const players = currentPlayers.filter(p => p !== invite.invitedUserId);

      const captainProfile = await getUserProfile(team.captainPlayerId);
      const newName = captainProfile ? captainProfile.displayName || 'Player' : 'Player';

      batch.update(teamRef, {
        status: 'pending_partner',
        players,
        teamName: newName,
        isLookingForPartner: false,
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
    const selectedEventIds = Array.from(new Set([...(existing.selectedEventIds || []), divisionId]));
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

console.log('✅ Firebase initialized - pickleball-app-dev');
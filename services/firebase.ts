import { initializeApp } from 'firebase/app';
import { getAuth as getFirebaseAuth, type Auth } from 'firebase/auth';
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
  runTransaction,
  deleteDoc,
  orderBy,
  addDoc,
  type Firestore
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import type {
  Tournament, UserProfile, Registration, Team, Division, Match, PartnerInvite, Club,
  UserRole, ClubJoinRequest, Court, StandingsEntry, SeedingMethod, TieBreaker,
  GenderCategory, TeamPlayer, MatchTeam, Competition, CompetitionEntry, CompetitionType,
  Notification, AuditLog, TeamRoster
} from '../types';

/* ---------------------- Config helpers with validation ---------------------- */

const STORAGE_KEY = 'pickleball_firebase_config';

const requiredFields = ['apiKey', 'projectId', 'appId'];

function isValidConfig(cfg: any) {
  if (!cfg || typeof cfg !== 'object') return false;
  return requiredFields.every(k => typeof cfg[k] === 'string' && cfg[k].length > 0);
}

const getStoredConfig = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (isValidConfig(parsed)) return parsed;
    }
  } catch (e) {
    console.warn("Failed to parse stored config", e);
  }
  return null;
};

const getEnvConfig = () => {
  if (process.env.FIREBASE_API_KEY) {
    const cfg = {
      apiKey: process.env.FIREBASE_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN,
      projectId: process.env.FIREBASE_PROJECT_ID,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.FIREBASE_APP_ID,
      measurementId: process.env.FIREBASE_MEASUREMENT_ID
    };
    if (isValidConfig(cfg)) return cfg;
  }
  return null;
};

const defaultConfig = {
  apiKey: "AIzaSyBPeYXnPobCZ7bPH0g_2IYOP55-1PFTWTE",
  authDomain: "pickleball-app-dev.firebaseapp.com",
  projectId: "pickleball-app-dev",
  storageBucket: "pickleball-app-dev.firebasestorage.app",
  messagingSenderId: "906655677998",
  appId: "1:906655677998:web:b7fe4bb2f479ba79c069bf",
  measurementId: "G-WWLE6K6J7Z"
};

const firebaseConfig = (() => {
  const stored = getStoredConfig();
  if (stored) return stored;
  const env = getEnvConfig();
  if (env) return env;
  // fallback to default AND ensure it's valid
  if (!isValidConfig(defaultConfig)) {
    throw new Error("Default firebase config is invalid or missing required fields.");
  }
  return defaultConfig;
})();

/* ---------------------- Initialize App ---------------------- */

let app;
try {
  app = initializeApp(firebaseConfig);
} catch (e: any) {
  console.error("Firebase initialization failed.", e);
  throw new Error("Firebase initialization failed: " + (e?.message || String(e)));
}

/* ---------------------- Exports (client) ---------------------- */

const authInstance: Auth = getFirebaseAuth(app);
export const db: Firestore = getFirestore(app);
const storage = getStorage(app);

export const getAuth = (): Auth => {
  if (!authInstance) throw new Error("Auth not initialized");
  return authInstance;
};

export function assertFirestore() {
  if (!db) throw new Error('Firestore not initialized - cannot call collection/doc APIs');
  return db;
}

/* ---------------------- Helpers (unchanged, but use safe db/auth) ---------------------- */

export const hasCustomConfig = () => !!localStorage.getItem(STORAGE_KEY);

export const saveFirebaseConfig = (configJson: string) => {
    try {
        JSON.parse(configJson); // Validate
        localStorage.setItem(STORAGE_KEY, configJson);
        window.location.reload(); // Reload to apply
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};

export const callCloudFunction = async (name: string, data: any): Promise<any> => {
  const auth = getAuth();
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error("You must be logged in to perform this action.");
  }

  const projectId = firebaseConfig.projectId || defaultConfig.projectId;
  const region = "us-central1";
  const url = `https://${region}-${projectId}.cloudfunctions.net/${name}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });

    const json = await response.json();
    if (!response.ok) {
      throw new Error(json.error?.message || json.error || `Function ${name} failed with status ${response.status}`);
    }
    return json.result || json;
  } catch (e: any) {
    console.error(`Error calling ${name}:`, e);
    throw e;
  }
};

// ... Users ...
export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
    if (!userId) return null;
    const snap = await getDoc(doc(db, 'users', userId));
    return snap.exists() ? snap.data() as UserProfile : null;
};

export const createUserProfile = async (userId: string, data: UserProfile) => {
    await setDoc(doc(db, 'users', userId), { ...data, createdAt: Date.now(), updatedAt: Date.now() }, { merge: true });
};

export const updateUserProfileDoc = async (userId: string, data: Partial<UserProfile>) => {
    await updateDoc(doc(db, 'users', userId), { ...data, updatedAt: Date.now() });
};

export const getAllUsers = async (limitCount = 100): Promise<UserProfile[]> => {
    const q = query(collection(db, 'users'), limit(limitCount));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as UserProfile);
};

export const getUsersByIds = async (ids: string[]): Promise<UserProfile[]> => {
    if (!ids || !ids.length) return [];
    // Firestore 'in' limit is 10
    const chunks = [];
    for (let i = 0; i < ids.length; i += 10) {
        chunks.push(ids.slice(i, i + 10));
    }
    const results = await Promise.all(chunks.map(chunk => 
        getDocs(query(collection(db, 'users'), where('id', 'in', chunk)))
    ));
    return results.flatMap(r => r.docs.map(d => d.data() as UserProfile));
};

export const searchUsers = async (term: string): Promise<UserProfile[]> => {
    // Client-side filtering for demo
    const all = await getAllUsers(200); 
    const lower = term.toLowerCase();
    return all.filter(u => 
        (u.displayName?.toLowerCase().includes(lower)) || 
        (u.email?.toLowerCase().includes(lower))
    );
};

// ... Admin Roles ...
const updateRole = async (uid: string, role: string, action: 'add'|'remove') => {
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return;
    const currentRoles = (snap.data() as UserProfile).roles || [];
    let newRoles = [...currentRoles];
    if (action === 'add' && !newRoles.includes(role as any)) newRoles.push(role as any);
    if (action === 'remove') newRoles = newRoles.filter(r => r !== role);
    await updateDoc(userRef, { roles: newRoles });
};

export const promoteToAppAdmin = (uid: string) => updateRole(uid, 'admin', 'add');
export const demoteFromAppAdmin = (uid: string, byUid: string) => updateRole(uid, 'admin', 'remove');
export const promoteToOrganizer = (uid: string) => updateRole(uid, 'organizer', 'add');
export const demoteFromOrganizer = (uid: string) => updateRole(uid, 'organizer', 'remove');
export const promoteToPlayer = (uid: string) => updateRole(uid, 'player', 'add');
export const demoteFromPlayer = (uid: string) => updateRole(uid, 'player', 'remove');

// ... Tournaments ...
export const subscribeToTournaments = (userId: string, callback: (t: Tournament[]) => void) => {
    const q = query(collection(db, 'tournaments'));
    return onSnapshot(q, (snap) => {
        const tours = snap.docs.map(d => d.data() as Tournament);
        callback(tours);
    });
};

export const getAllTournaments = async (limitCount = 100): Promise<Tournament[]> => {
    const q = query(collection(db, 'tournaments'), limit(limitCount));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Tournament);
};

export const getTournament = async (id: string): Promise<Tournament | null> => {
    if (!id) return null;
    const snap = await getDoc(doc(db, 'tournaments', id));
    return snap.exists() ? snap.data() as Tournament : null;
};

export const saveTournament = async (tournament: Tournament, divisions?: Division[]) => {
    const batch = writeBatch(db);
    batch.set(doc(db, 'tournaments', tournament.id), { ...tournament, updatedAt: Date.now() }, { merge: true });
    
    if (divisions) {
        divisions.forEach(div => {
            batch.set(doc(db, 'divisions', div.id), { ...div, tournamentId: tournament.id, updatedAt: Date.now() }, { merge: true });
        });
    }
    await batch.commit();
};

// ... Divisions ...
export const subscribeToDivisions = (tournamentId: string, callback: (d: Division[]) => void) => {
    const q = query(collection(db, 'divisions'), where('tournamentId', '==', tournamentId));
    return onSnapshot(q, (snap) => callback(snap.docs.map(d => d.data() as Division)));
};

export const updateDivision = async (tournamentId: string, divisionId: string, data: Partial<Division>) => {
    await updateDoc(doc(db, 'divisions', divisionId), { ...data, updatedAt: Date.now() });
};

// ... Teams ...
export const subscribeToTeams = (tournamentId: string, callback: (t: Team[]) => void) => {
    const q = query(collection(db, 'teams'), where('tournamentId', '==', tournamentId));
    return onSnapshot(q, (snap) => callback(snap.docs.map(d => d.data() as Team)));
};

export const deleteTeam = async (tournamentId: string, teamId: string) => {
    await deleteDoc(doc(db, 'teams', teamId));
};

export const createTeamServer = async (data: any) => {
    return callCloudFunction('createTeam', data);
};

export const getUserTeamsForTournament = async (eventId: string, userId: string, type: 'tournament'|'competition'): Promise<Team[]> => {
    const field = type === 'tournament' ? 'tournamentId' : 'competitionId';
    const q = query(collection(db, 'teams'), where(field, '==', eventId));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Team).filter(t => t.players.includes(userId));
};

export const getOpenTeamsForDivision = async (eventId: string, divisionId: string, type: 'tournament'|'competition') => {
    const field = type === 'tournament' ? 'tournamentId' : 'competitionId';
    const q = query(
        collection(db, 'teams'), 
        where(field, '==', eventId),
        where('divisionId', '==', divisionId),
        where('status', '==', 'pending_partner')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Team);
};

export const getTeamsForDivision = async (eventId: string, divisionId: string, type: 'tournament'|'competition') => {
    const field = type === 'tournament' ? 'tournamentId' : 'competitionId';
    const q = query(
        collection(db, 'teams'), 
        where(field, '==', eventId),
        where('divisionId', '==', divisionId)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Team);
};

// ... Matches ...
export const subscribeToMatches = (tournamentId: string, callback: (m: Match[]) => void) => {
    const q = query(collection(db, 'matches'), where('tournamentId', '==', tournamentId));
    return onSnapshot(q, (snap) => callback(snap.docs.map(d => d.data() as Match)));
};

export const updateMatchScore = async (tournamentId: string, matchId: string, updates: Partial<Match>) => {
    await updateDoc(doc(db, 'matches', matchId), { ...updates, lastUpdatedAt: Date.now() });
};

// ... Courts ...
export const subscribeToCourts = (tournamentId: string, callback: (c: Court[]) => void) => {
    const q = query(collection(db, 'courts'), where('tournamentId', '==', tournamentId));
    return onSnapshot(q, (snap) => callback(snap.docs.map(d => d.data() as Court)));
};

export const addCourt = async (tournamentId: string, name: string, order: number) => {
    const newId = `court_${Date.now()}`;
    await setDoc(doc(db, 'courts', newId), {
        id: newId, tournamentId, name, order, active: true
    });
};

export const updateCourt = async (tournamentId: string, courtId: string, data: Partial<Court>) => {
    await updateDoc(doc(db, 'courts', courtId), data);
};

export const deleteCourt = async (tournamentId: string, courtId: string) => {
    await deleteDoc(doc(db, 'courts', courtId));
};

// ... Invites ...
export const subscribeToUserPartnerInvites = (userId: string, callback: (i: PartnerInvite[]) => void) => {
    const q = query(collection(db, 'partnerInvites'), where('invitedUserId', '==', userId), where('status', '==', 'pending'));
    return onSnapshot(q, (snap) => callback(snap.docs.map(d => d.data() as PartnerInvite)));
};

export const respondToPartnerInvite = async (invite: PartnerInvite, status: 'accepted'|'declined') => {
    await updateDoc(doc(db, 'partnerInvites', invite.id), { status, respondedAt: Date.now() });
    
    if (status === 'accepted') {
        const teamData = {
            tournamentId: invite.tournamentId,
            competitionId: invite.competitionId,
            divisionId: invite.divisionId,
            playerIds: [invite.inviterId, invite.invitedUserId],
            teamName: null 
        };
        await callCloudFunction('createTeam', teamData);
        return { tournamentId: invite.tournamentId, divisionId: invite.divisionId };
    }
    return null;
};

export const getPendingInvitesForDivision = async (eventId: string, divisionId: string, type: 'tournament'|'competition') => {
    const field = type === 'tournament' ? 'tournamentId' : 'competitionId';
    const q = query(
        collection(db, 'partnerInvites'),
        where(field, '==', eventId),
        where('divisionId', '==', divisionId),
        where('status', '==', 'pending')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as PartnerInvite);
};

export const searchEligiblePartners = async (term: string, gender: string, currentUser: UserProfile): Promise<UserProfile[]> => {
    const users = await searchUsers(term);
    return users.filter(u => u.id !== currentUser.id); 
};

// ... Registration ...
export const getRegistration = async (tournamentId: string, userId: string): Promise<Registration | null> => {
    const id = `${userId}_${tournamentId}`;
    const snap = await getDoc(doc(db, 'registrations', id));
    return snap.exists() ? snap.data() as Registration : null;
};

export const saveRegistration = async (reg: Registration) => {
    await setDoc(doc(db, 'registrations', reg.id), { ...reg, updatedAt: Date.now() }, { merge: true });
};

export const finalizeRegistration = async (reg: Registration, tournament: Tournament, user: UserProfile) => {
    await saveRegistration({ ...reg, status: 'completed' });
};

export const ensureRegistrationForUser = async (tournamentId: string, userId: string, divisionId?: string) => {
    const reg = await getRegistration(tournamentId, userId);
    if (!reg) {
        await saveRegistration({
            id: `${userId}_${tournamentId}`,
            tournamentId,
            playerId: userId,
            status: 'completed', 
            waiverAccepted: true,
            selectedEventIds: divisionId ? [divisionId] : [],
            createdAt: Date.now(),
            updatedAt: Date.now()
        });
    } else if (divisionId && !reg.selectedEventIds.includes(divisionId)) {
        await saveRegistration({
            ...reg,
            selectedEventIds: [...reg.selectedEventIds, divisionId]
        });
    }
};

export const withdrawPlayerFromDivision = async (tournamentId: string, divisionId: string, userId: string) => {
    const teams = await getUserTeamsForTournament(tournamentId, userId, 'tournament');
    const team = teams.find(t => t.divisionId === divisionId);
    if (team) {
        await deleteTeam(tournamentId, team.id);
    }
    const reg = await getRegistration(tournamentId, userId);
    if (reg) {
        const newEvents = reg.selectedEventIds.filter(id => id !== divisionId);
        await saveRegistration({ ...reg, selectedEventIds: newEvents });
    }
};

// ... Clubs ...
export const getAllClubs = async (): Promise<Club[]> => {
    const q = query(collection(db, 'clubs'));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Club);
};

export const getUserClubs = async (userId: string): Promise<Club[]> => {
    const q = query(collection(db, 'clubs'), where('admins', 'array-contains', userId));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Club);
};

export const createClub = async (clubData: Partial<Club>) => {
    const clubId = `club_${Date.now()}`;
    const newClub = { 
        id: clubId, 
        ...clubData, 
        createdAt: Date.now(), 
        updatedAt: Date.now() 
    } as Club;
    await setDoc(doc(db, 'clubs', clubId), newClub);
    return newClub;
};

export const subscribeToClub = (clubId: string, callback: (c: Club) => void) => {
    return onSnapshot(doc(db, 'clubs', clubId), (snap) => callback(snap.data() as Club));
};

export const subscribeToClubRequests = (clubId: string, callback: (r: ClubJoinRequest[]) => void) => {
    const q = query(collection(db, 'clubJoinRequests'), where('clubId', '==', clubId), where('status', '==', 'pending'));
    return onSnapshot(q, (snap) => callback(snap.docs.map(d => d.data() as ClubJoinRequest)));
};

export const subscribeToMyClubJoinRequest = (clubId: string, userId: string, callback: (hasPending: boolean) => void) => {
    const q = query(collection(db, 'clubJoinRequests'), where('clubId', '==', clubId), where('userId', '==', userId), where('status', '==', 'pending'));
    return onSnapshot(q, (snap) => callback(!snap.empty));
};

export const requestJoinClub = async (clubId: string, userId: string) => {
    const id = `req_${clubId}_${userId}`;
    await setDoc(doc(db, 'clubJoinRequests', id), {
        id, clubId, userId, status: 'pending', createdAt: Date.now()
    });
};

export const approveClubJoinRequest = async (clubId: string, requestId: string, userId: string) => {
    const batch = writeBatch(db);
    batch.update(doc(db, 'clubJoinRequests', requestId), { status: 'approved' });
    const clubRef = doc(db, 'clubs', clubId);
    const clubSnap = await getDoc(clubRef);
    if (clubSnap.exists()) {
        const members = (clubSnap.data() as Club).members || [];
        if (!members.includes(userId)) {
            batch.update(clubRef, { members: [...members, userId] });
        }
    }
    await batch.commit();
};

export const declineClubJoinRequest = async (clubId: string, requestId: string) => {
    await updateDoc(doc(db, 'clubJoinRequests', requestId), { status: 'declined' });
};

export const bulkImportClubMembers = async (data: any) => {
    return callCloudFunction('bulkImportClubMembers', data);
};

// ... Competitions ...
export const createCompetition = async (comp: Competition) => {
    await callCloudFunction('createCompetition', { competition: comp });
};

export const listCompetitions = async (filter?: { organiserId?: string }): Promise<Competition[]> => {
    let q = query(collection(db, 'competitions'));
    if (filter?.organiserId) {
        q = query(q, where('organiserId', '==', filter.organiserId));
    }
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Competition);
};

export const getCompetition = async (id: string): Promise<Competition | null> => {
    const snap = await getDoc(doc(db, 'competitions', id));
    return snap.exists() ? snap.data() as Competition : null;
};

export const updateCompetition = async (comp: Competition) => {
    await updateDoc(doc(db, 'competitions', comp.id), { ...comp, updatedAt: Date.now() });
};

export const subscribeToCompetitions = (callback: (c: Competition[]) => void) => {
    const q = query(collection(db, 'competitions'));
    return onSnapshot(q, (snap) => callback(snap.docs.map(d => d.data() as Competition)));
};

export const subscribeToCompetitionMatches = (compId: string, callback: (m: Match[]) => void) => {
    const q = query(collection(db, 'matches'), where('competitionId', '==', compId));
    return onSnapshot(q, (snap) => callback(snap.docs.map(d => d.data() as Match)));
};

export const subscribeToCompetitionEntries = (compId: string, callback: (e: CompetitionEntry[]) => void) => {
    const q = query(collection(db, 'competitionEntries'), where('competitionId', '==', compId));
    return onSnapshot(q, (snap) => callback(snap.docs.map(d => d.data() as CompetitionEntry)));
};

export const createCompetitionEntry = async (entry: CompetitionEntry) => {
    await setDoc(doc(db, 'competitionEntries', entry.id), entry);
};

export const getCompetitionEntry = async (compId: string, userId: string): Promise<CompetitionEntry | null> => {
    const q = query(collection(db, 'competitionEntries'), where('competitionId', '==', compId), where('playerId', '==', userId));
    const snap = await getDocs(q);
    return snap.empty ? null : snap.docs[0].data() as CompetitionEntry;
};

export const finalizeCompetitionRegistration = async (comp: Competition, user: UserProfile, divisionId: string, partnerDetails: any, teamId?: string) => {
    const entryId = `entry_${comp.id}_${user.id}`;
    const entry: CompetitionEntry = {
        id: entryId,
        competitionId: comp.id,
        entryType: teamId ? 'team' : 'individual',
        playerId: user.id,
        teamId: teamId,
        divisionId,
        status: 'active',
        createdAt: Date.now(),
        partnerDetails
    };
    await createCompetitionEntry(entry);
};

// ... Standings ...
export const subscribeToStandings = (compId: string, callback: (s: StandingsEntry[]) => void) => {
    const q = query(collection(db, 'standings'), where('competitionId', '==', compId));
    return onSnapshot(q, (snap) => callback(snap.docs.map(d => d.data() as StandingsEntry)));
};

export const saveStandings = async (tournamentId: string, divisionId: string, standings: StandingsEntry[]) => {
    const batch = writeBatch(db);
    standings.forEach(s => {
        const ref = doc(db, 'standings', `${tournamentId}_${divisionId}_${s.teamId}`);
        batch.set(ref, { ...s, tournamentId, divisionId }, { merge: true });
    });
    await batch.commit();
};

// ... Scheduling ...
export const generatePoolsSchedule = async (tournamentId: string, division: Division, teams: Team[], playersCache: any) => {
    const batch = writeBatch(db);
    if (teams.length < 2) return;
    for (let i=0; i<teams.length; i++) {
        for (let j=i+1; j<teams.length; j++) {
            const matchId = `match_${Date.now()}_${i}_${j}`;
            const m: Match = {
                id: matchId,
                tournamentId,
                divisionId: division.id,
                teamAId: teams[i].id,
                teamBId: teams[j].id,
                status: 'scheduled',
                scoreTeamAGames: [],
                scoreTeamBGames: [],
                roundNumber: 1
            };
            batch.set(doc(db, 'matches', matchId), m);
        }
    }
    await batch.commit();
};

export const generateBracketSchedule = async (tournamentId: string, division: Division, teams: Team[], name: string, cache: any) => {
    await generatePoolsSchedule(tournamentId, division, teams, cache);
};

export const generateFinalsFromPools = async (tournamentId: string, division: Division, standings: StandingsEntry[], teams: Team[], cache: any) => {
    // Mock implementation
    console.log("Generating finals...");
};

export const generateLeagueSchedule = async (competitionId: string) => {
    return callCloudFunction('generateLeagueSchedule', { competitionId });
};

// ... Team Rosters ...
export const getTeamRoster = async (teamId: string): Promise<TeamRoster | null> => {
    const snap = await getDoc(doc(db, 'teamRosters', teamId));
    return snap.exists() ? snap.data() as TeamRoster : null;
};

export const manageTeamRoster = async (data: { teamId: string, action: 'add'|'remove', playerId: string }) => {
    return callCloudFunction('manageTeamRoster', data);
};

export const submitLineup = async (matchId: string, teamId: string, boards: any[]) => {
    return callCloudFunction('submitLineup', { matchId, teamId, boards });
};

export const syncPlayerRatings = async (playerIds: string[]) => {
    return callCloudFunction('syncPlayerRatings', { playerIds });
};

// ... Notifications ...
export const sendNotification = async (userId: string, title: string, message: string, type: string) => {
    await addDoc(collection(db, 'notifications'), {
        userId, title, message, type, read: false, createdAt: Date.now()
    });
};

export const subscribeToNotifications = (userId: string, callback: (n: Notification[]) => void) => {
    const q = query(collection(db, 'notifications'), where('userId', '==', userId), orderBy('createdAt', 'desc'), limit(20));
    return onSnapshot(q, (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Notification))));
};

export const markNotificationAsRead = async (userId: string, notifId: string) => {
    await updateDoc(doc(db, 'notifications', notifId), { read: true });
};

// ... Audit ...
export const logAudit = async (actorId: string, action: string, entityId: string, details: any) => {
    await addDoc(collection(db, 'auditLogs'), {
        actorId, action, entityId, details, timestamp: Date.now()
    });
};

export { initializeApp };
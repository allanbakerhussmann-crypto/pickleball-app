import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { 
    getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, 
    addDoc, deleteDoc, query, where, orderBy, limit, onSnapshot, 
    arrayUnion, arrayRemove, writeBatch, increment, serverTimestamp,
    type Firestore
} from 'firebase/firestore';

// Re-export firestore functions for usage in other services/components
export { 
    collection, doc, getDoc, getDocs, setDoc, updateDoc, 
    addDoc, deleteDoc, query, where, orderBy, limit, onSnapshot, 
    arrayUnion, arrayRemove, writeBatch, increment, serverTimestamp
};

export type { Firestore };

import { getAuth as getFirebaseAuth } from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { 
    Tournament, Division, Team, Match, Court, UserProfile, 
    Club, Registration, PartnerInvite, Notification, GameSession,
    Competition, CompetitionEntry, StandingsEntry, TeamRoster,
    ClubJoinRequest, AuditLog, UserRole
} from '../types';

const STORAGE_KEY = 'pickleball_firebase_config';

// --- CONFIGURATION & INIT ---

export const hasCustomConfig = () => !!localStorage.getItem(STORAGE_KEY);
export const isFirebaseConfigured = hasCustomConfig();

let app: FirebaseApp;
let db: Firestore | undefined;
let auth: Auth | undefined;
let functions: any;

const initFirebase = () => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
      // Console warn only once or suppress to avoid noise during render
      return;
  }
  
  try {
      const config = JSON.parse(stored);
      if (!getApps().length) {
        app = initializeApp(config);
      } else {
        app = getApp();
      }

      db = getFirestore(app);
      auth = getFirebaseAuth(app);
      functions = getFunctions(app);
  } catch (e) {
      console.error("Failed to initialize Firebase", e);
  }
};

if (hasCustomConfig()) {
    initFirebase();
}

export const saveFirebaseConfig = (json: string) => {
    try {
        const parsed = JSON.parse(json);
        if (!parsed.apiKey || !parsed.authDomain) return { success: false, error: 'Invalid config' };
        localStorage.setItem(STORAGE_KEY, json);
        window.location.reload();
        return { success: true };
    } catch (e) {
        return { success: false, error: 'Parse error' };
    }
};

export const getAuth = () => {
    if (!auth && hasCustomConfig()) initFirebase(); 
    return auth;
};

// Export db for direct usage in other services if needed
export { db };

// Helper to remove undefined fields for Firestore compatibility
const removeUndefined = (obj: any) => {
    if (obj === null || typeof obj !== 'object') return obj;
    const newObj: any = Array.isArray(obj) ? [] : {};
    Object.keys(obj).forEach(key => {
        if (obj[key] !== undefined) {
            newObj[key] = removeUndefined(obj[key]);
        }
    });
    return newObj;
};

/* -------------------------------------------------------------------------- */
/*                                USER PROFILES                               */
/* -------------------------------------------------------------------------- */

export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
    if (!db || !userId) return null;
    const snap = await getDoc(doc(db, 'users', userId));
    return snap.exists() ? snap.data() as UserProfile : null;
};

export const createUserProfile = async (userId: string, data: UserProfile) => {
    if (!db) return;
    await setDoc(doc(db, 'users', userId), removeUndefined(data), { merge: true });
};

export const updateUserProfileDoc = async (userId: string, data: Partial<UserProfile>) => {
    if (!db) return;
    await setDoc(doc(db, 'users', userId), removeUndefined(data), { merge: true });
};

export const getAllUsers = async (limitCount = 100): Promise<UserProfile[]> => {
    if (!db) return [];
    const q = query(collection(db, 'users'), limit(limitCount));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as UserProfile);
};

export const getUsersByIds = async (ids: string[]): Promise<UserProfile[]> => {
    if (!db || !ids || ids.length === 0) return [];
    // Firestore 'in' query is limited to 10. For larger lists, batch or simple loop.
    // Simple loop for now to be safe against limits
    const promises = ids.map(id => getDoc(doc(db!, 'users', id)));
    const snapshots = await Promise.all(promises);
    return snapshots.map(s => s.exists() ? s.data() as UserProfile : null).filter(u => u !== null) as UserProfile[];
};

export const searchUsers = async (term: string): Promise<UserProfile[]> => {
    if (!db) return [];
    // Simple client-side filtering for small datasets or assume 'getAllUsers' style search
    // In production, use Algolia or a dedicated search index.
    const all = await getAllUsers(500); 
    const lower = term.toLowerCase();
    return all.filter(u => 
        (u.displayName?.toLowerCase().includes(lower) || u.email?.toLowerCase().includes(lower))
    );
};

/* -------------------------------------------------------------------------- */
/*                                TOURNAMENTS                                 */
/* -------------------------------------------------------------------------- */

export const subscribeToTournaments = (userId: string | undefined, callback: (data: Tournament[]) => void) => {
    if (!db) return () => {};
    const q = query(collection(db, 'tournaments'), orderBy('startDatetime', 'desc'));
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Tournament)));
    });
};

export const getAllTournaments = async (limitCount = 50): Promise<Tournament[]> => {
    if (!db) return [];
    const q = query(collection(db, 'tournaments'), orderBy('startDatetime', 'desc'), limit(limitCount));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Tournament));
};

export const getTournament = async (id: string): Promise<Tournament | null> => {
    if (!db) return null;
    const snap = await getDoc(doc(db, 'tournaments', id));
    return snap.exists() ? { id: snap.id, ...snap.data() } as Tournament : null;
};

export const saveTournament = async (tournament: Tournament, divisions: Division[] = []) => {
    if (!db) return;
    const batch = writeBatch(db);
    const tRef = doc(db, 'tournaments', tournament.id);
    batch.set(tRef, removeUndefined(tournament), { merge: true });

    divisions.forEach(div => {
        const dRef = doc(db!, 'divisions', div.id);
        const divData = { ...div, tournamentId: tournament.id };
        batch.set(dRef, removeUndefined(divData), { merge: true });
    });

    await batch.commit();
};

/* -------------------------------------------------------------------------- */
/*                                DIVISIONS                                   */
/* -------------------------------------------------------------------------- */

export const subscribeToDivisions = (tournamentId: string, callback: (data: Division[]) => void) => {
    if (!db) return () => {};
    const q = query(collection(db, 'divisions'), where('tournamentId', '==', tournamentId));
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Division)));
    });
};

export const updateDivision = async (tournamentId: string, divisionId: string, updates: Partial<Division>) => {
    if (!db) return;
    await updateDoc(doc(db, 'divisions', divisionId), removeUndefined(updates));
};

/* -------------------------------------------------------------------------- */
/*                                TEAMS                                       */
/* -------------------------------------------------------------------------- */

export const subscribeToTeams = (tournamentId: string, callback: (teams: Team[]) => void) => {
    if (!db) return () => {};
    const q = query(collection(db, 'teams'), where('tournamentId', '==', tournamentId));
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Team)));
    });
};

export const createTeamServer = async (data: { tournamentId: string, divisionId: string, playerIds: string[], teamName?: string | null }) => {
    if (!functions) throw new Error("Firebase functions not initialized");
    const fn = httpsCallable(functions, 'createTeam');
    await fn(data);
};

export const deleteTeam = async (tournamentId: string, teamId: string) => {
    if (!db) return;
    await deleteDoc(doc(db, 'teams', teamId));
};

export const getUserTeamsForTournament = async (tournamentId: string, userId: string, context: 'tournament' | 'competition' = 'tournament'): Promise<Team[]> => {
    if (!db) return [];
    const field = context === 'competition' ? 'competitionId' : 'tournamentId';
    const q = query(collection(db, 'teams'), where(field, '==', tournamentId), where('players', 'array-contains', userId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Team));
};

export const getTeamsForDivision = async (eventId: string, divisionId: string, context: 'tournament' | 'competition'): Promise<Team[]> => {
    if (!db) return [];
    const field = context === 'competition' ? 'competitionId' : 'tournamentId';
    const q = query(collection(db, 'teams'), where(field, '==', eventId), where('divisionId', '==', divisionId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Team));
};

export const getOpenTeamsForDivision = async (eventId: string, divisionId: string, context: 'tournament' | 'competition'): Promise<Team[]> => {
    if (!db) return [];
    const field = context === 'competition' ? 'competitionId' : 'tournamentId';
    // looking for teams with pending_partner status
    const q = query(
        collection(db, 'teams'), 
        where(field, '==', eventId), 
        where('divisionId', '==', divisionId),
        where('status', '==', 'pending_partner')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Team));
};

/* -------------------------------------------------------------------------- */
/*                                MATCHES                                     */
/* -------------------------------------------------------------------------- */

export const subscribeToMatches = (tournamentId: string, callback: (matches: Match[]) => void) => {
    if (!db) return () => {};
    const q = query(collection(db, 'matches'), where('tournamentId', '==', tournamentId));
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Match)));
    });
};

export const updateMatchScore = async (tournamentId: string, matchId: string, updates: Partial<Match>) => {
    if (!db) return;
    await updateDoc(doc(db, 'matches', matchId), removeUndefined(updates));
};

export const generatePoolsSchedule = async (tournamentId: string, division: Division, teams: Team[], playersCache: any) => {
    console.log("Generating Pools Schedule (Stub)");
};

export const generateBracketSchedule = async (tournamentId: string, division: Division, teams: Team[], name: string, playersCache: any) => {
    console.log("Generating Bracket Schedule (Stub)");
};

export const generateFinalsFromPools = async (tournamentId: string, division: Division, standings: StandingsEntry[], teams: Team[], playersCache: any) => {
    console.log("Generating Finals (Stub)");
};

/* -------------------------------------------------------------------------- */
/*                                COURTS                                      */
/* -------------------------------------------------------------------------- */

export const subscribeToCourts = (tournamentId: string, callback: (courts: Court[]) => void) => {
    if (!db) return () => {};
    const q = query(collection(db, 'courts'), where('tournamentId', '==', tournamentId), orderBy('order'));
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Court)));
    });
};

export const addCourt = async (tournamentId: string, name: string, order: number) => {
    if (!db) return;
    const ref = doc(collection(db, 'courts'));
    await setDoc(ref, { id: ref.id, tournamentId, name, order, active: true });
};

export const updateCourt = async (tournamentId: string, courtId: string, updates: Partial<Court>) => {
    if (!db) return;
    await updateDoc(doc(db, 'courts', courtId), updates);
};

export const deleteCourt = async (tournamentId: string, courtId: string) => {
    if (!db) return;
    await deleteDoc(doc(db, 'courts', courtId));
};

/* -------------------------------------------------------------------------- */
/*                                STANDINGS                                   */
/* -------------------------------------------------------------------------- */

export const saveStandings = async (tournamentId: string, divisionId: string, standings: StandingsEntry[]) => {
    if (!db) return;
    const batch = writeBatch(db);
    standings.forEach(s => {
        const ref = doc(db!, 'standings', `${tournamentId}_${divisionId}_${s.teamId}`);
        batch.set(ref, { ...s, tournamentId, divisionId }, { merge: true });
    });
    await batch.commit();
};

export const subscribeToStandings = (contextId: string, callback: (standings: StandingsEntry[]) => void) => {
    if (!db) return () => {};
    // Handles both tournamentId and competitionId queries if using same collection
    const q = query(collection(db, 'standings'), where('competitionId', '==', contextId));
    // Fallback for tournaments
    const q2 = query(collection(db, 'standings'), where('tournamentId', '==', contextId));
    
    return onSnapshot(q, (snap) => {
        if (!snap.empty) callback(snap.docs.map(d => d.data() as StandingsEntry));
        else {
             // Try tournament query
             onSnapshot(q2, (snap2) => {
                 callback(snap2.docs.map(d => d.data() as StandingsEntry));
             });
        }
    });
};

/* -------------------------------------------------------------------------- */
/*                                PARTNER INVITES                             */
/* -------------------------------------------------------------------------- */

export const subscribeToUserPartnerInvites = (userId: string, callback: (invites: PartnerInvite[]) => void) => {
    if (!db) return () => {};
    const q = query(collection(db, 'partnerInvites'), where('invitedUserId', '==', userId), where('status', '==', 'pending'));
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as PartnerInvite)));
    });
};

export const respondToPartnerInvite = async (invite: PartnerInvite, response: 'accepted' | 'declined') => {
    if (!db) return invite;
    await updateDoc(doc(db, 'partnerInvites', invite.id), { status: response, respondedAt: Date.now() });
    return invite; // Return original invite for context
};

export const getPendingInvitesForDivision = async (eventId: string, divisionId: string, context: 'tournament' | 'competition'): Promise<PartnerInvite[]> => {
    if (!db) return [];
    const field = context === 'competition' ? 'competitionId' : 'tournamentId';
    const q = query(collection(db, 'partnerInvites'), where(field, '==', eventId), where('divisionId', '==', divisionId), where('status', '==', 'pending'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as PartnerInvite));
};

export const searchEligiblePartners = async (term: string, gender: string, currentUser: UserProfile): Promise<UserProfile[]> => {
    const users = await searchUsers(term);
    return users.filter(u => u.id !== currentUser.id);
};

/* -------------------------------------------------------------------------- */
/*                                REGISTRATIONS                               */
/* -------------------------------------------------------------------------- */

export const getRegistration = async (tournamentId: string, userId: string): Promise<Registration | null> => {
    if (!db) return null;
    const snap = await getDoc(doc(db, 'registrations', `${userId}_${tournamentId}`));
    return snap.exists() ? { id: snap.id, ...snap.data() } as Registration : null;
};

export const saveRegistration = async (reg: Registration) => {
    if (!db) return;
    await setDoc(doc(db, 'registrations', reg.id), removeUndefined(reg), { merge: true });
};

export const finalizeRegistration = async (reg: Registration, tournament: Tournament, user: UserProfile) => {
    if (!db) return;
    const batch = writeBatch(db);
    const regRef = doc(db, 'registrations', reg.id);
    batch.set(regRef, removeUndefined(reg), { merge: true });
    
    // Logic to create teams based on partner details would go here or in a cloud function
    // For now we just save the registration
    await batch.commit();
};

export const subscribeToRegistrations = (tournamentId: string, callback: (regs: Registration[]) => void) => {
    if (!db) return () => {};
    const q = query(collection(db, 'registrations'), where('tournamentId', '==', tournamentId));
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Registration)));
    });
};

export const ensureRegistrationForUser = async (tournamentId: string, userId: string, divisionId: string) => {
    if (!db) return;
    const regId = `${userId}_${tournamentId}`;
    const regRef = doc(db, 'registrations', regId);
    await setDoc(regRef, {
        id: regId,
        tournamentId,
        playerId: userId,
        status: 'in_progress',
        selectedEventIds: arrayUnion(divisionId),
        updatedAt: Date.now()
    }, { merge: true });
};

export const withdrawPlayerFromDivision = async (tournamentId: string, divisionId: string, userId: string) => {
    if (!db) return;
    const regId = `${userId}_${tournamentId}`;
    await updateDoc(doc(db, 'registrations', regId), {
        selectedEventIds: arrayRemove(divisionId)
    });
};

export const checkInPlayer = async (tournamentId: string, userId: string) => {
    if (!db) return;
    const regId = `${userId}_${tournamentId}`;
    await updateDoc(doc(db, 'registrations', regId), {
        checkedIn: true,
        checkedInAt: Date.now()
    });
};

/* -------------------------------------------------------------------------- */
/*                                CLUBS                                       */
/* -------------------------------------------------------------------------- */

export const getAllClubs = async (): Promise<Club[]> => {
    if (!db) return [];
    const snap = await getDocs(collection(db, 'clubs'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Club));
};

export const getUserClubs = async (userId: string): Promise<Club[]> => {
    if (!db) return [];
    const q = query(collection(db, 'clubs'), where('admins', 'array-contains', userId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Club));
};

export const createClub = async (clubData: Partial<Club>) => {
    if (!db) return;
    const ref = doc(collection(db, 'clubs'));
    const club = { ...clubData, id: ref.id, createdAt: Date.now(), updatedAt: Date.now() };
    await setDoc(ref, removeUndefined(club));
};

export const subscribeToClub = (clubId: string, callback: (club: Club) => void) => {
    if (!db) return () => {};
    return onSnapshot(doc(db, 'clubs', clubId), (snap) => {
        if (snap.exists()) callback({ id: snap.id, ...snap.data() } as Club);
    });
};

export const subscribeToClubRequests = (clubId: string, callback: (reqs: ClubJoinRequest[]) => void) => {
    if (!db) return () => {};
    const q = query(collection(db, 'clubJoinRequests'), where('clubId', '==', clubId), where('status', '==', 'pending'));
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as ClubJoinRequest)));
    });
};

export const subscribeToMyClubJoinRequest = (clubId: string, userId: string, callback: (exists: boolean) => void) => {
    if (!db) return () => {};
    const q = query(collection(db, 'clubJoinRequests'), where('clubId', '==', clubId), where('userId', '==', userId), where('status', '==', 'pending'));
    return onSnapshot(q, (snap) => {
        callback(!snap.empty);
    });
};

export const requestJoinClub = async (clubId: string, userId: string) => {
    if (!db) return;
    const ref = doc(collection(db, 'clubJoinRequests'));
    await setDoc(ref, { id: ref.id, clubId, userId, status: 'pending', createdAt: Date.now() });
};

export const approveClubJoinRequest = async (clubId: string, requestId: string, userId: string) => {
    if (!db) return;
    const batch = writeBatch(db);
    batch.update(doc(db, 'clubJoinRequests', requestId), { status: 'approved' });
    batch.update(doc(db, 'clubs', clubId), { members: arrayUnion(userId) });
    await batch.commit();
};

export const declineClubJoinRequest = async (clubId: string, requestId: string) => {
    if (!db) return;
    await updateDoc(doc(db, 'clubJoinRequests', requestId), { status: 'declined' });
};

export const bulkImportClubMembers = async (data: any) => {
    if (!functions) throw new Error("Functions not initialized");
    const fn = httpsCallable(functions, 'bulkImportClubMembers');
    const result = await fn(data);
    return (result.data as any).results;
};

/* -------------------------------------------------------------------------- */
/*                                NOTIFICATIONS                               */
/* -------------------------------------------------------------------------- */

export const subscribeToNotifications = (userId: string, callback: (notes: Notification[]) => void) => {
    if (!db) return () => {};
    const q = query(collection(db, 'notifications'), where('userId', '==', userId), orderBy('createdAt', 'desc'), limit(20));
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Notification)));
    });
};

export const sendNotification = async (userId: string, title: string, message: string, type: 'info' | 'action_required' = 'info') => {
    if (!db) return;
    const ref = doc(collection(db, 'notifications'));
    await setDoc(ref, {
        id: ref.id,
        userId,
        title,
        message,
        type,
        read: false,
        createdAt: Date.now()
    });
};

export const markNotificationAsRead = async (userId: string, notificationId: string) => {
    if (!db) return;
    await updateDoc(doc(db, 'notifications', notificationId), { read: true });
};

export const logAudit = async (actorId: string, action: string, entityId: string, details: any) => {
    if (!db) return;
    await addDoc(collection(db, 'auditLogs'), {
        actorId, action, entityId, details, timestamp: Date.now()
    });
};

/* -------------------------------------------------------------------------- */
/*                                COMPETITIONS                                */
/* -------------------------------------------------------------------------- */

export const createCompetition = async (competition: Competition) => {
    if (!functions) throw new Error("Functions not initialized");
    const fn = httpsCallable(functions, 'createCompetition');
    await fn({ competition });
};

export const listCompetitions = async (filters: any): Promise<Competition[]> => {
    if (!db) return [];
    const q = query(collection(db, 'competitions'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Competition));
};

export const getCompetition = async (id: string): Promise<Competition | null> => {
    if (!db) return null;
    const snap = await getDoc(doc(db, 'competitions', id));
    return snap.exists() ? { id: snap.id, ...snap.data() } as Competition : null;
};

export const updateCompetition = async (updates: Partial<Competition>) => {
    if (!db || !updates.id) return;
    await updateDoc(doc(db, 'competitions', updates.id), removeUndefined(updates));
};

export const subscribeToCompetitions = (callback: (comps: Competition[]) => void) => {
    if (!db) return () => {};
    const q = query(collection(db, 'competitions'), orderBy('startDate', 'desc'));
    return onSnapshot(q, (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Competition))));
};

export const subscribeToCompetitionMatches = (competitionId: string, callback: (matches: Match[]) => void) => {
    if (!db) return () => {};
    const q = query(collection(db, 'matches'), where('competitionId', '==', competitionId));
    return onSnapshot(q, (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Match))));
};

export const subscribeToCompetitionEntries = (competitionId: string, callback: (entries: CompetitionEntry[]) => void) => {
    if (!db) return () => {};
    const q = query(collection(db, 'competitionEntries'), where('competitionId', '==', competitionId));
    return onSnapshot(q, (snap) => callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as CompetitionEntry))));
};

export const createCompetitionEntry = async (entry: CompetitionEntry) => {
    if (!db) return;
    await setDoc(doc(db, 'competitionEntries', entry.id), removeUndefined(entry));
};

export const getCompetitionEntry = async (competitionId: string, playerId: string): Promise<CompetitionEntry | null> => {
    if (!db) return null;
    const q = query(collection(db, 'competitionEntries'), where('competitionId', '==', competitionId), where('playerId', '==', playerId));
    const snap = await getDocs(q);
    return !snap.empty ? { id: snap.docs[0].id, ...snap.docs[0].data() } as CompetitionEntry : null;
};

export const finalizeCompetitionRegistration = async (competition: Competition, user: UserProfile, divisionId: string, partnerDetails: any) => {
    const entry: CompetitionEntry = {
        id: `entry_${user.id}_${competition.id}`,
        competitionId: competition.id,
        entryType: 'individual',
        playerId: user.id,
        divisionId,
        status: 'active',
        createdAt: Date.now(),
        partnerDetails
    };
    await createCompetitionEntry(entry);
};

export const generateLeagueSchedule = async (competitionId: string) => {
    if (!functions) throw new Error("Functions not initialized");
    const fn = httpsCallable(functions, 'generateLeagueSchedule');
    await fn({ competitionId });
};

/* -------------------------------------------------------------------------- */
/*                                TEAM ROSTERS                                */
/* -------------------------------------------------------------------------- */

export const getTeamRoster = async (teamId: string): Promise<TeamRoster | null> => {
    if (!db) return null;
    const snap = await getDoc(doc(db, 'teamRosters', teamId));
    return snap.exists() ? { id: snap.id, ...snap.data() } as TeamRoster : null;
};

export const updateTeamRoster = async (teamId: string, updates: Partial<TeamRoster>) => {
    if (!db) return;
    await setDoc(doc(db, 'teamRosters', teamId), { ...updates, updatedAt: Date.now() }, { merge: true });
};

export const submitLineup = async (matchId: string, teamId: string, boards: any[]) => {
    if (!functions) throw new Error("Functions not initialized");
    const fn = httpsCallable(functions, 'submitLineup');
    await fn({ matchId, teamId, boards });
};

/* -------------------------------------------------------------------------- */
/*                                GAME SESSIONS (SOCIAL)                      */
/* -------------------------------------------------------------------------- */

export const createGameSession = async (session: GameSession): Promise<void> => {
    if (!db) return;
    const ref = doc(collection(db, 'gameSessions'));
    const newSession = { ...session, id: ref.id, createdAt: Date.now() };
    await setDoc(ref, removeUndefined(newSession));
};

export const getGameSession = async (sessionId: string): Promise<GameSession | null> => {
    if (!db) return null;
    const snap = await getDoc(doc(db, 'gameSessions', sessionId));
    return snap.exists() ? { id: snap.id, ...snap.data() } as GameSession : null;
};

export const joinGameSession = async (sessionId: string, userId: string): Promise<void> => {
    if (!db) return;
    await updateDoc(doc(db, 'gameSessions', sessionId), {
        playerIds: arrayUnion(userId)
    });
};

export const leaveGameSession = async (sessionId: string, userId: string): Promise<void> => {
    if (!db) return;
    await updateDoc(doc(db, 'gameSessions', sessionId), {
        playerIds: arrayRemove(userId)
    });
};

export const subscribeToGameSessions = (callback: (sessions: GameSession[]) => void) => {
    if (!db) return () => {};
    const q = query(collection(db, 'gameSessions'), orderBy('startDatetime', 'desc'), limit(50));
    return onSnapshot(q, (snap) => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as GameSession));
        callback(all);
    });
};

/* -------------------------------------------------------------------------- */
/*                                ADMIN ACTIONS                               */
/* -------------------------------------------------------------------------- */

const updateUserRole = async (userId: string, action: 'add' | 'remove', role: UserRole) => {
    if (!db) return;
    const userRef = doc(db, 'users', userId);
    if (action === 'add') await updateDoc(userRef, { roles: arrayUnion(role) });
    else await updateDoc(userRef, { roles: arrayRemove(role) });
};

export const promoteToAppAdmin = (uid: string) => updateUserRole(uid, 'add', 'admin');
export const demoteFromAppAdmin = (uid: string, byUid: string) => updateUserRole(uid, 'remove', 'admin');
export const promoteToOrganizer = (uid: string) => updateUserRole(uid, 'add', 'organizer');
export const demoteFromOrganizer = (uid: string) => updateUserRole(uid, 'remove', 'organizer');
export const promoteToPlayer = (uid: string) => updateUserRole(uid, 'add', 'player');
export const demoteFromPlayer = (uid: string) => updateUserRole(uid, 'remove', 'player');
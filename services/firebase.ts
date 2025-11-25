

import { initializeApp } from '@firebase/app';
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
  orderBy, // Added
  type Firestore,
  DocumentReference,
  DocumentSnapshot
} from '@firebase/firestore';
import { 
    getStorage, 
    ref, 
    uploadBytes, 
    getDownloadURL 
} from '@firebase/storage';
import { getFunctions, httpsCallable } from '@firebase/functions';
import type { Tournament, UserProfile, TournamentRegistration, Team, Division, Match, PartnerInvite, Club, UserRole, ClubJoinRequest, Court, StandingsEntry, SeedingMethod, TieBreaker, GenderCategory } from '../types';

const STORAGE_KEY = 'pickleball_firebase_config';

const getStoredConfig = () => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) return JSON.parse(stored);
    } catch (e) {
        console.error("Failed to parse stored config", e);
    }
    return null;
};

const getEnvConfig = () => {
    if (process.env.FIREBASE_API_KEY) {
        return {
            apiKey: process.env.FIREBASE_API_KEY,
            authDomain: process.env.FIREBASE_AUTH_DOMAIN,
            projectId: process.env.FIREBASE_PROJECT_ID,
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
            messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
            appId: process.env.FIREBASE_APP_ID,
            measurementId: process.env.FIREBASE_MEASUREMENT_ID
        };
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

const firebaseConfig = getStoredConfig() || getEnvConfig() || defaultConfig;

let app;
try {
    app = initializeApp(firebaseConfig);
} catch (e) {
    console.error("Firebase initialization failed.", e);
    app = initializeApp(defaultConfig);
}

const authInstance: Auth = getFirebaseAuth(app);
const db: Firestore = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app);

export const getAuth = (): Auth => authInstance;
export const saveFirebaseConfig = (configJson: string) => {
    try {
        const parsed = JSON.parse(configJson);
        if (!parsed.apiKey || !parsed.authDomain) return { success: false, error: 'Invalid config' };
        localStorage.setItem(STORAGE_KEY, configJson);
        window.location.reload();
        return { success: true };
    } catch (e) {
        return { success: false, error: 'Invalid JSON' };
    }
};
export const hasCustomConfig = () => !!getStoredConfig() || !!getEnvConfig();

// --- User Profiles ---
export const createUserProfile = async (userId: string, data: Partial<UserProfile>) => {
  const userRef = doc(db, 'users', userId);
  await setDoc(userRef, { ...data, id: userId, createdAt: Date.now(), updatedAt: Date.now() }, { merge: true });
};

export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  const docSnap = await getDoc(doc(db, 'users', userId));
  return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } as UserProfile : null;
};

export const updateUserProfileDoc = async (userId: string, data: Partial<UserProfile>) => {
  const userRef = doc(db, 'users', userId);
  await updateDoc(userRef, { ...data, updatedAt: Date.now() });
};

export const getAllUsers = async (limitCount = 100): Promise<UserProfile[]> => {
    const q = query(collection(db, 'users'), limit(limitCount));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as UserProfile));
};

export const getUsersByIds = async (userIds: string[]): Promise<UserProfile[]> => {
    if (userIds.length === 0) return [];
    // Firestore "in" query limited to 10
    const chunks = [];
    for (let i = 0; i < userIds.length; i += 10) {
        chunks.push(userIds.slice(i, i + 10));
    }
    
    const results: UserProfile[] = [];
    for (const chunk of chunks) {
        const q = query(collection(db, 'users'), where('id', 'in', chunk));
        const snap = await getDocs(q);
        snap.forEach(d => results.push({ id: d.id, ...d.data() } as UserProfile));
    }
    return results;
};

export const searchUsers = async (searchTerm: string): Promise<UserProfile[]> => {
    // Simple client-side search simulation for now as Firestore doesn't do full text search natively
    // In production, use Algolia or Typesense.
    // For MVP: Fetch last 100 users and filter? Or use >= startAt.
    // Using a simpler approach: get recent users and filter in memory.
    const q = query(collection(db, 'users'), limit(50));
    const snap = await getDocs(q);
    const term = searchTerm.toLowerCase();
    
    return snap.docs
        .map(d => ({ id: d.id, ...d.data() } as UserProfile))
        .filter(u => 
            (u.displayName && u.displayName.toLowerCase().includes(term)) || 
            (u.email && u.email.toLowerCase().includes(term))
        );
};

// --- Roles ---
export const promoteToAppAdmin = async (userId: string) => {
    const ref = doc(db, 'users', userId);
    await updateDoc(ref, { roles: ['player', 'organizer', 'admin'] }); // Overwrite or union
};
export const demoteFromAppAdmin = async (userId: string, currentAdminId: string) => {
    const ref = doc(db, 'users', userId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const user = snap.data() as UserProfile;
    if (user.isRootAdmin) throw new Error("Cannot demote Root Admin");
    
    // Remove 'admin' from roles
    const newRoles = (user.roles || []).filter(r => r !== 'admin');
    await updateDoc(ref, { roles: newRoles });
};
export const promoteToOrganizer = async (userId: string) => {
    const ref = doc(db, 'users', userId);
    const snap = await getDoc(ref);
    const roles = (snap.data() as UserProfile).roles || [];
    if (!roles.includes('organizer')) {
        await updateDoc(ref, { roles: [...roles, 'organizer'] });
    }
};
export const demoteFromOrganizer = async (userId: string) => {
    const ref = doc(db, 'users', userId);
    const snap = await getDoc(ref);
    const roles = (snap.data() as UserProfile).roles || [];
    await updateDoc(ref, { roles: roles.filter(r => r !== 'organizer') });
};
export const promoteToPlayer = async (userId: string) => {
    const ref = doc(db, 'users', userId);
    const snap = await getDoc(ref);
    const roles = (snap.data() as UserProfile).roles || [];
    if (!roles.includes('player')) {
        await updateDoc(ref, { roles: [...roles, 'player'] });
    }
};
export const demoteFromPlayer = async (userId: string) => {
    const ref = doc(db, 'users', userId);
    const snap = await getDoc(ref);
    const roles = (snap.data() as UserProfile).roles || [];
    await updateDoc(ref, { roles: roles.filter(r => r !== 'player') });
};


// --- Clubs ---
export const createClub = async (clubData: Partial<Club>) => {
    const clubRef = doc(collection(db, 'clubs'));
    const club = { ...clubData, id: clubRef.id, createdAt: Date.now(), updatedAt: Date.now() };
    await setDoc(clubRef, club);
    return club;
};
export const getAllClubs = async (): Promise<Club[]> => {
    const q = query(collection(db, 'clubs'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Club));
};
export const getUserClubs = async (userId: string): Promise<Club[]> => {
    const q = query(collection(db, 'clubs'), where('admins', 'array-contains', userId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Club));
};
export const getClub = async (clubId: string): Promise<Club | null> => {
    const snap = await getDoc(doc(db, 'clubs', clubId));
    return snap.exists() ? { id: snap.id, ...snap.data() } as Club : null;
};
export const subscribeToClub = (clubId: string, callback: (c: Club | null) => void) => {
    return onSnapshot(doc(db, 'clubs', clubId), (snap) => {
        callback(snap.exists() ? { id: snap.id, ...snap.data() } as Club : null);
    });
};

// Club Requests
export const requestJoinClub = async (clubId: string, userId: string) => {
    const reqRef = doc(collection(db, `clubs/${clubId}/joinRequests`));
    await setDoc(reqRef, { 
        id: reqRef.id, clubId, userId, status: 'pending', createdAt: Date.now(), updatedAt: Date.now() 
    });
};
export const subscribeToClubRequests = (clubId: string, callback: (reqs: ClubJoinRequest[]) => void) => {
    const q = query(collection(db, `clubs/${clubId}/joinRequests`), where('status', '==', 'pending'));
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as ClubJoinRequest)));
    });
};
export const subscribeToMyClubJoinRequest = (clubId: string, userId: string, callback: (hasPending: boolean) => void) => {
    const q = query(
        collection(db, `clubs/${clubId}/joinRequests`), 
        where('userId', '==', userId),
        where('status', '==', 'pending')
    );
    return onSnapshot(q, (snap) => {
        callback(!snap.empty);
    });
};
export const approveClubJoinRequest = async (clubId: string, requestId: string, userId: string) => {
    const batch = writeBatch(db);
    batch.update(doc(db, `clubs/${clubId}/joinRequests`, requestId), { status: 'approved', updatedAt: Date.now() });
    batch.update(doc(db, 'clubs', clubId), { members: (await getDoc(doc(db, 'clubs', clubId))).data()?.members.concat(userId) || [userId] });
    await batch.commit();
};
export const declineClubJoinRequest = async (clubId: string, requestId: string) => {
    await updateDoc(doc(db, `clubs/${clubId}/joinRequests`, requestId), { status: 'declined', updatedAt: Date.now() });
};
export const bulkImportClubMembers = async (data: any) => {
    const fn = httpsCallable(functions, 'bulkImportClubMembers');
    const result = await fn(data);
    return (result.data as any).results;
};


// --- Tournaments ---
export const saveTournament = async (tournament: Tournament, divisions?: Division[]) => {
    const tRef = doc(db, 'tournaments', tournament.id);
    const batch = writeBatch(db);
    
    batch.set(tRef, { ...tournament, updatedAt: Date.now() }, { merge: true });
    
    if (divisions) {
        divisions.forEach(div => {
            const dRef = doc(db, `tournaments/${tournament.id}/divisions`, div.id);
            batch.set(dRef, div, { merge: true });
        });
    }
    
    await batch.commit();
};

export const updateDivision = async (tournamentId: string, divisionId: string, updates: Partial<Division>) => {
    const dRef = doc(db, `tournaments/${tournamentId}/divisions`, divisionId);
    await updateDoc(dRef, { ...updates, updatedAt: Date.now() });
};

export const getTournament = async (id: string): Promise<Tournament | null> => {
    const snap = await getDoc(doc(db, 'tournaments', id));
    return snap.exists() ? { id: snap.id, ...snap.data() } as Tournament : null;
};

export const getAllTournaments = async (limitCount = 50): Promise<Tournament[]> => {
    const q = query(collection(db, 'tournaments'), limit(limitCount)); // Simplified
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Tournament));
};

export const subscribeToTournaments = (userId: string, callback: (tournaments: Tournament[]) => void) => {
    const q = query(collection(db, 'tournaments'));
    return onSnapshot(q, (snap) => {
        const tours = snap.docs.map(d => ({ id: d.id, ...d.data() } as Tournament));
        callback(tours);
    });
};

// --- Divisions ---
export const subscribeToDivisions = (tournamentId: string, callback: (divisions: Division[]) => void) => {
    const q = query(collection(db, `tournaments/${tournamentId}/divisions`));
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Division)));
    });
};

export const getDivisions = async (tournamentId: string): Promise<Division[]> => {
    const q = query(collection(db, `tournaments/${tournamentId}/divisions`));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Division));
};


// --- Teams ---
export const createTeam = async (tournamentId: string, team: Team) => {
    const ref = doc(db, 'teams', team.id);
    await setDoc(ref, team);
};

export const deleteTeam = async (tournamentId: string, teamId: string) => {
    await deleteDoc(doc(db, 'teams', teamId));
};

export const subscribeToTeams = (tournamentId: string, callback: (teams: Team[]) => void) => {
    const q = query(collection(db, 'teams'), where('tournamentId', '==', tournamentId));
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Team)));
    });
};

export const getTeamsForDivision = async (tournamentId: string, divisionId: string): Promise<Team[]> => {
    const q = query(collection(db, 'teams'), where('tournamentId', '==', tournamentId), where('divisionId', '==', divisionId));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Team));
};

export const getOpenTeamsForDivision = async (tournamentId: string, divisionId: string): Promise<Team[]> => {
    const q = query(
        collection(db, 'teams'), 
        where('tournamentId', '==', tournamentId), 
        where('divisionId', '==', divisionId),
        where('isLookingForPartner', '==', true),
        where('status', '==', 'pending_partner')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Team));
};

export const getUserTeamsForTournament = async (tournamentId: string, userId: string): Promise<Team[]> => {
    const q = query(
        collection(db, 'teams'),
        where('tournamentId', '==', tournamentId),
        where('players', 'array-contains', userId)
    );
    const snap = await getDocs(q);
    // Return all teams the user is part of, regardless of status, so we can manage withdrawals correctly
    return snap.docs.map(d => d.data() as Team);
};

// --- Registrations ---
export const getRegistration = async (tournamentId: string, userId: string): Promise<TournamentRegistration | null> => {
    const ref = doc(db, 'registrations', `${userId}_${tournamentId}`);
    const snap = await getDoc(ref);
    return snap.exists() ? { id: snap.id, ...snap.data() } as TournamentRegistration : null;
};

export const getAllRegistrations = async (): Promise<TournamentRegistration[]> => {
    const snap = await getDocs(collection(db, 'registrations'));
    return snap.docs.map(d => d.data() as TournamentRegistration);
};

export const saveRegistration = async (reg: TournamentRegistration) => {
    const ref = doc(db, 'registrations', reg.id);
    await setDoc(ref, reg, { merge: true });
};

// --- Invite Helper ---
export const getPendingInvitesForDivision = async (tournamentId: string, divisionId: string): Promise<PartnerInvite[]> => {
    const q = query(
        collection(db, 'partnerInvites'),
        where('tournamentId', '==', tournamentId),
        where('divisionId', '==', divisionId),
        where('status', '==', 'pending')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as PartnerInvite);
};

// IMPORTANT: Transactional Finalization
export const finalizeRegistration = async (
    regData: TournamentRegistration,
    tournament: Tournament,
    userProfile: UserProfile
) => {
    // 1. PRE-FETCHING (Outside Transaction)
    const divs = await getDivisions(tournament.id); 
    const divMap = new Map(divs.map(d => [d.id, d]));

    // Fetch existing teams (active, pending, or withdrawn)
    const existingTeams = await getUserTeamsForTournament(tournament.id, userProfile.id);
    
    // Fetch invites to cancel if withdrawing
    const myInvitesQ = query(
        collection(db, 'partnerInvites'), 
        where('inviterId', '==', userProfile.id),
        where('tournamentId', '==', tournament.id),
        where('status', '==', 'pending')
    );
    const myInvitesSnap = await getDocs(myInvitesQ);
    const invitesToCancelIds = myInvitesSnap.docs
        .filter(d => !regData.selectedEventIds.includes(d.data().divisionId)) // Invites for divisions we are leaving
        .map(d => d.id);

    // 2. TRANSACTION
    await runTransaction(db, async (t) => {
        // --- READ PHASE ---
        const regRef = doc(db, 'registrations', regData.id);
        const regSnap = await t.get(regRef); 

        const teamRefsToRead = new Set<string>();

        // A. Identify teams to read for joining (Open Team requests)
        regData.selectedEventIds.forEach(divId => {
             const details = regData.partnerDetails?.[divId];
             if (details?.mode === 'join_open' && details.openTeamId) {
                 teamRefsToRead.add(details.openTeamId);
             }
        });

        // B. Identify teams to read for withdrawal or modification
        existingTeams.forEach(team => {
            // If not in selected list, we are withdrawing.
            // If in selected list, we might be keeping it (so we don't strictly need to write, but reading ensures existence)
            if (!regData.selectedEventIds.includes(team.divisionId)) {
                teamRefsToRead.add(team.id);
            }
        });

        // Execute Batch Reads
        const uniqueTeamIds = Array.from(teamRefsToRead);
        const teamDocsMap = new Map<string, DocumentSnapshot>();
        
        if (uniqueTeamIds.length > 0) {
            const teamDocsRefs = uniqueTeamIds.map(id => doc(db, 'teams', id));
            const teamDocsSnaps = await Promise.all(teamDocsRefs.map(ref => t.get(ref)));
            teamDocsSnaps.forEach(d => { 
                if(d.exists()) teamDocsMap.set(d.id, d); 
            });
        }

        // --- WRITE PHASE ---
        // CRITICAL: No reads (t.get) allowed after this point!
        
        // 1. Process Withdrawals
        for (const team of existingTeams) {
            // If we are no longer selected for this division, withdraw.
            if (!regData.selectedEventIds.includes(team.divisionId)) {
                // If already withdrawn, skip
                if (team.status === 'withdrawn') continue;

                const teamSnap = teamDocsMap.get(team.id);
                // Must ensure document exists
                if (!teamSnap || !teamSnap.exists()) continue; 
                
                const teamData = teamSnap.data() as Team;
                // Remove user from players list
                const newPlayers = teamData.players.filter(uid => uid !== userProfile.id);
                
                if (newPlayers.length === 0) {
                    // Empty team -> Withdrawn
                    t.update(teamSnap.ref, { 
                        status: 'withdrawn', 
                        players: [], 
                        updatedAt: Date.now() 
                    });
                } else {
                    // Downgrade to pending partner if it was active
                    // The remaining player is now "Looking for Partner"
                    t.update(teamSnap.ref, { 
                        players: newPlayers,
                        captainPlayerId: newPlayers[0],
                        status: 'pending_partner',
                        isLookingForPartner: true, 
                        // We reset name so it regenerates properly in UI (e.g. "Player (looking)")
                        // Or we could keep it if custom name? Safer to reset for consistency.
                        teamName: null, 
                        updatedAt: Date.now()
                    });
                }
            }
        }

        // 2. Cancellations of Invites (Blind Updates)
        for (const invId of invitesToCancelIds) {
            t.update(doc(db, 'partnerInvites', invId), { status: 'cancelled' });
        }

        // 3. New Registrations / Updates
        for (const divId of regData.selectedEventIds) {
             const div = divMap.get(divId);
             if (!div) continue;
             
             // Check if we already have an active/pending team for this division
             const existingTeam = existingTeams.find(t => 
                t.divisionId === divId && t.status !== 'withdrawn' && t.status !== 'cancelled'
             );
             
             // If we already have a team, we assume no changes needed (status quo)
             // Unless we want to support switching partners? 
             // For this MVP, if you are in, you are in. You must withdraw first to switch.
             if (existingTeam) continue; 

             if (div.type === 'singles') {
                 // Create Singles Team
                 const newTeamRef = doc(collection(db, 'teams'));
                 t.set(newTeamRef, {
                     id: newTeamRef.id,
                     tournamentId: tournament.id,
                     divisionId: divId,
                     type: 'singles',
                     captainPlayerId: userProfile.id,
                     players: [userProfile.id],
                     status: 'active',
                     createdAt: Date.now(),
                     updatedAt: Date.now()
                 });
             } else {
                 // Doubles Logic
                 const details = regData.partnerDetails?.[divId];
                 
                 if (details?.mode === 'join_open' && details.openTeamId) {
                      const targetSnap = teamDocsMap.get(details.openTeamId);
                      if (targetSnap && targetSnap.exists()) {
                          const targetData = targetSnap.data() as Team;
                          const players = targetData.players || [];
                          // Validate not full and not already in
                          if (!players.includes(userProfile.id) && players.length < 2) {
                              t.update(targetSnap.ref, {
                                  players: [...players, userProfile.id],
                                  status: 'active',
                                  isLookingForPartner: false,
                                  updatedAt: Date.now()
                              });
                          }
                      }
                 } else if (details?.mode === 'invite' && details.partnerUserId) {
                     // Create Team + Invite
                     const newTeamRef = doc(collection(db, 'teams'));
                     const inviteRef = doc(collection(db, 'partnerInvites'));
                     
                     t.set(newTeamRef, {
                         id: newTeamRef.id,
                         tournamentId: tournament.id,
                         divisionId: divId,
                         type: 'doubles',
                         captainPlayerId: userProfile.id,
                         players: [userProfile.id],
                         status: 'pending_partner',
                         createdAt: Date.now(),
                         updatedAt: Date.now()
                     });
                     
                     t.set(inviteRef, {
                         id: inviteRef.id,
                         tournamentId: tournament.id,
                         divisionId: divId,
                         teamId: newTeamRef.id,
                         inviterId: userProfile.id,
                         invitedUserId: details.partnerUserId,
                         status: 'pending',
                         createdAt: Date.now()
                     });
                 } else {
                     // Open Team (Default if no partner selected)
                     const newTeamRef = doc(collection(db, 'teams'));
                     t.set(newTeamRef, {
                         id: newTeamRef.id,
                         tournamentId: tournament.id,
                         divisionId: divId,
                         type: 'doubles',
                         captainPlayerId: userProfile.id,
                         players: [userProfile.id],
                         status: 'pending_partner',
                         isLookingForPartner: true,
                         createdAt: Date.now(),
                         updatedAt: Date.now()
                     });
                 }
             }
        }

        // 4. Save Registration Doc
        // Determine status based on active selections
        const newStatus = regData.selectedEventIds.length === 0 ? 'withdrawn' : 'completed';
        t.set(regRef, { ...regData, status: newStatus, updatedAt: Date.now() }, { merge: true });
    });
};

export const ensureRegistrationForUser = async (tournamentId: string, userId: string, divisionId?: string) => {
    const regRef = doc(db, 'registrations', `${userId}_${tournamentId}`);
    const snap = await getDoc(regRef);
    
    if (!snap.exists()) {
        await setDoc(regRef, {
            id: `${userId}_${tournamentId}`,
            tournamentId,
            playerId: userId,
            status: 'completed',
            waiverAccepted: true, // Implied by accept? Or prompt? For now, assume yes for invites.
            selectedEventIds: divisionId ? [divisionId] : [],
            createdAt: Date.now(),
            updatedAt: Date.now()
        });
    } else {
        const data = snap.data() as TournamentRegistration;
        if (divisionId && !data.selectedEventIds.includes(divisionId)) {
            await updateDoc(regRef, {
                selectedEventIds: [...data.selectedEventIds, divisionId],
                updatedAt: Date.now()
            });
        }
    }
};


// --- Invites ---
export const subscribeToUserPartnerInvites = (userId: string, callback: (invites: PartnerInvite[]) => void) => {
    const q = query(
        collection(db, 'partnerInvites'), 
        where('invitedUserId', '==', userId), 
        where('status', '==', 'pending')
    );
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as PartnerInvite)));
    });
};

export const respondToPartnerInvite = async (invite: PartnerInvite, response: 'accepted' | 'declined') => {
    const batch = writeBatch(db);
    
    // 1. Update Invite
    const inviteRef = doc(db, 'partnerInvites', invite.id);
    // Note: We prepare a batch but don't commit it if we use transaction for 'accepted'.
    // If 'declined', we use batch.

    if (response === 'accepted') {
        const teamRef = doc(db, 'teams', invite.teamId);
        
        await runTransaction(db, async (t) => {
             const tInvite = await t.get(inviteRef);
             if (!tInvite.exists() || tInvite.data().status !== 'pending') {
                 throw new Error("Invite no longer valid");
             }
             const tTeam = await t.get(teamRef);
             if (!tTeam.exists()) throw new Error("Team not found");
             
             const teamData = tTeam.data() as Team;
             
             // Update Invite
             t.update(inviteRef, { status: response, respondedAt: Date.now() });
             
             // Update Team
             const newPlayers = [...teamData.players, invite.invitedUserId];
             t.update(teamRef, { 
                 players: newPlayers,
                 status: 'active',
                 isLookingForPartner: false,
                 updatedAt: Date.now()
             });
        });
        
        return invite;
    } else {
        batch.update(inviteRef, { status: response, respondedAt: Date.now() });
        await batch.commit();
        return null;
    }
};

// --- Matches ---
export const subscribeToMatches = (tournamentId: string, callback: (matches: Match[]) => void) => {
    const q = query(collection(db, 'matches'), where('tournamentId', '==', tournamentId));
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Match)));
    });
};

export const updateMatchScore = async (tournamentId: string, matchId: string, updates: Partial<Match>) => {
    const ref = doc(db, 'matches', matchId);
    await updateDoc(ref, { ...updates, lastUpdatedAt: Date.now() });
};

export const batchCreateMatches = async (tournamentId: string, matches: Match[]) => {
    const batch = writeBatch(db);
    matches.forEach(m => {
        const ref = doc(db, 'matches', m.id);
        batch.set(ref, m);
    });
    await batch.commit();
};


// --- Courts ---
export const subscribeToCourts = (tournamentId: string, callback: (courts: Court[]) => void) => {
    const q = query(collection(db, `tournaments/${tournamentId}/courts`), orderBy('order'));
    return onSnapshot(q, (snap) => {
        callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Court)));
    });
};

export const addCourt = async (tournamentId: string, name: string, order: number) => {
    const ref = doc(collection(db, `tournaments/${tournamentId}/courts`));
    await setDoc(ref, { id: ref.id, tournamentId, name, order, active: true });
};

export const updateCourt = async (tournamentId: string, courtId: string, updates: Partial<Court>) => {
    await updateDoc(doc(db, `tournaments/${tournamentId}/courts`, courtId), updates);
};

export const deleteCourt = async (tournamentId: string, courtId: string) => {
    await deleteDoc(doc(db, `tournaments/${tournamentId}/courts`, courtId));
};


// --- Scheduler Proxies ---
export const generatePoolsSchedule = async (tournamentId: string, division: Division, teams: Team[], playersCache: any) => {
     // Usually this would call a Cloud Function for heavy lifting
     // For this demo, we assume the logic is imported from a local service or similar.
     // Since this file is 'services/firebase.ts', and we are separating logic...
     // We will dynamic import or just assume the caller handles logic and calls batchCreateMatches.
     // To keep this clean, we export the logic from a scheduler service and use it in the UI component.
     // BUT the UI component calls `generatePoolsSchedule` from here.
     // Let's import the local scheduler service.
     
     const { generatePools } = await import('./scheduler');
     const matches = generatePools(tournamentId, division, teams);
     await batchCreateMatches(tournamentId, matches);
};

export const generateBracketSchedule = async (tournamentId: string, division: Division, teams: Team[], stageName: string, playersCache: any) => {
    const { generateBracket } = await import('./scheduler');
    const matches = generateBracket(tournamentId, division, teams, stageName);
    await batchCreateMatches(tournamentId, matches);
};

export const generateFinalsFromPools = async (tournamentId: string, division: Division, standings: StandingsEntry[], teams: Team[], playersCache: any) => {
    const { generateFinals } = await import('./scheduler');
    const matches = generateFinals(tournamentId, division, standings, teams);
    await batchCreateMatches(tournamentId, matches);
};
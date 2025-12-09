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
  type Firestore
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
export const db: Firestore = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app);

export const getAuth = (): Auth => authInstance;

/**
 * Client wrapper to call the createTeam Cloud Function.
 * Returns { existed: boolean, teamId, team } on success.
 */
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

  // Call function
  const resp = await callable({ tournamentId, divisionId, playerIds, teamName });
  return resp.data; // { existed, teamId, team }
};

/**
 * Ensure a team exists for the given tournament/division + players.
 * Creates / queries teams under tournaments/{tournamentId}/teams so the UI
 * can see them. Uses a transaction fallback to avoid duplicates.
 *
 * Returns: { existed: boolean, teamId: string, team: Team|null }
 */
export const ensureTeamExists = async (
  tournamentId: string,
  divisionId: string,
  playerIds: string[],
  teamName: string | null,
  createdByUserId: string,
  options?: { status?: string } // optional flags, e.g. 'pending_partner'
): Promise<{ existed: boolean; teamId: string; team: any | null }> => {
  // Normalize players to sorted unique array
  const normalizedPlayers = Array.from(new Set(playerIds.map(String))).sort();

  // 1) Look for an exact-match team (by players) to avoid creating duplicates
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

  // 2) Transactional create (ensures only one writer wins)
  const teamRef = doc(collection(db, 'tournaments', tournamentId, 'teams'));
  const now = Date.now();

  try {
    await runTransaction(db, async (tx) => {
      // Re-check inside transaction for exact-match by players
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
          // Another writer created it — abort by throwing a special object
          throw { alreadyExists: true, teamId: d.id, team: { id: d.id, ...t } };
        }
      }

      // Create a new team doc under tournaments/{tournamentId}/teams
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

      // Audit record
      const auditRef = doc(collection(db, 'team_creation_audit'));
      tx.set(auditRef, {
        teamId: teamRef.id,
        action: 'create',
        createdByUserId,
        timestamp: now,
        payload: { tournamentId, divisionId, players: normalizedPlayers, teamName }
      });
    });

    // Fetch created doc
    const createdSnap = await getDoc(teamRef);
    return { existed: false, teamId: teamRef.id, team: createdSnap.exists() ? { id: createdSnap.id, ...createdSnap.data() } : null };
  } catch (err: any) {
    // If transaction reported alreadyExists, return the existing team
    if (err && err.alreadyExists) {
      return { existed: true, teamId: err.teamId, team: err.team };
    }
    console.error('ensureTeamExists transaction error', err);
    throw err;
  }
};

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
    await setDoc(doc(db, 'users', userId), { ...data, updatedAt: Date.now() }, { merge: true });
};

export const searchUsers = async (searchTerm: string): Promise<UserProfile[]> => {
    if (!searchTerm || searchTerm.length < 2) return [];
    
    const term = searchTerm.trim();
    const capitalizedTerm = term.charAt(0).toUpperCase() + term.slice(1).toLowerCase();

    try {
        const queries = [
            query(
                collection(db, 'users'),
                where('displayName', '>=', term),
                where('displayName', '<=', term + '\uf8ff'),
                limit(20)
            ),
            query(
                collection(db, 'users'),
                where('email', '>=', term),
                where('email', '<=', term + '\uf8ff'),
                limit(20)
            )
        ];

        if (term !== capitalizedTerm) {
            queries.push(
                query(
                    collection(db, 'users'),
                    where('displayName', '>=', capitalizedTerm),
                    where('displayName', '<=', capitalizedTerm + '\uf8ff'),
                    limit(20)
                )
            );
        }

        const snapshots = await Promise.all(queries.map(q => getDocs(q)));

        const results = new Map<string, UserProfile>();
        snapshots.forEach(snap => {
            snap.docs.forEach(d => {
                results.set(d.id, { id: d.id, ...d.data() } as UserProfile);
            });
        });

        const sorted = Array.from(results.values()).sort((a, b) => {
            const nameA = (a.displayName || a.email || '').toLowerCase();
            const nameB = (b.displayName || b.email || '').toLowerCase();
            if (nameA < nameB) return -1;
            if (nameA > nameB) return 1;
            return 0;
        });

        return sorted;
    } catch (e) {
        console.error('searchUsers failed', e);
        return [];
    }
};

export const searchEligiblePartners = async (
  searchTerm: string,
  divisionGender: GenderCategory,
  currentUser: UserProfile
): Promise<UserProfile[]> => {
  if (!searchTerm || searchTerm.length < 2) return [];

  const baseResults = await searchUsers(searchTerm);
  let filtered = baseResults.filter(p => p.id !== currentUser.id);

  if (divisionGender === 'mixed' && currentUser.gender) {
    const wantGender = currentUser.gender === 'female' ? 'male' : 'female';
    filtered = filtered.filter(p => p.gender === wantGender);
  } else if (divisionGender === 'men') {
    filtered = filtered.filter(p => p.gender === 'male');
  } else if (divisionGender === 'women') {
    filtered = filtered.filter(p => p.gender === 'female');
  }

  const getRating = (u: UserProfile): number =>
    u.duprDoublesRating ??
    u.ratingDoubles ??
    u.duprSinglesRating ??
    u.ratingSingles ??
    0;

  const myRating = getRating(currentUser);

  filtered.sort((a, b) => {
    const diffA = Math.abs(getRating(a) - myRating);
    const diffB = Math.abs(getRating(b) - myRating);

    if (diffA !== diffB) {
      return diffA - diffB;
    }

    const nameA = (a.displayName || a.email || '').toLowerCase();
    const nameB = (b.displayName || b.email || '').toLowerCase();
    if (nameA < nameB) return -1;
    if (nameA > nameB) return 1;
    return 0;
  });

  return filtered;
};

export const getAllUsers = async (limitCount = 100): Promise<UserProfile[]> => {
    const snapshot = await getDocs(query(collection(db, 'users'), limit(limitCount)));
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as UserProfile));
};

export const getUsersByIds = async (userIds: string[]): Promise<UserProfile[]> => {
    if (!userIds || userIds.length === 0) return [];
    const promises = userIds.map(id => getDoc(doc(db, 'users', id)));
    const docs = await Promise.all(promises);
    return docs.filter(d => d.exists()).map(d => ({ id: d.id, ...d.data() } as UserProfile));
};

export const uploadProfileImage = async (userId: string, file: File): Promise<string> => {
    const snapshot = await uploadBytes(ref(storage, `profile_pictures/${userId}`), file);
    return getDownloadURL(snapshot.ref);
};

// --- Admin Role Management ---
const addRole = async (userId: string, role: UserRole) => {
  const ref = doc(db, 'users', userId);
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('User not found');
    const data = snap.data() as UserProfile;
    const roles = new Set(data.roles ?? []);
    roles.add(role);
    tx.update(ref, { roles: Array.from(roles) });
  });
};
const removeRole = async (userId: string, role: UserRole) => {
  const ref = doc(db, 'users', userId);
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('User not found');
    const data = snap.data() as UserProfile;
    const roles = new Set(data.roles ?? []);
    if (!roles.has(role)) return;
    roles.delete(role);
    tx.update(ref, { roles: Array.from(roles) });
  });
};
export const promoteToAppAdmin = async (targetUserId: string) => {
  const ref = doc(db, 'users', targetUserId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('User not found');
    const data = snap.data() as UserProfile;
    const roles = new Set(data.roles ?? []);
    roles.add('admin');
    roles.add('organizer');
    tx.update(ref, { roles: Array.from(roles) });
  });
};
export const demoteFromAppAdmin = async (targetUserId: string, currentUserId: string) => {
  const ref = doc(db, 'users', targetUserId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('User not found');
    const data = snap.data() as UserProfile;
    if (data.isRootAdmin === true) throw new Error('The root admin cannot be demoted.');
    const roles = new Set(data.roles ?? []);
    if (targetUserId === currentUserId && roles.has('admin')) throw new Error('You cannot remove your own admin role.');
    if (!roles.has('admin')) return;
    roles.delete('admin');
    tx.update(ref, { roles: Array.from(roles) });
  });
};
export const promoteToOrganizer = async (userId: string) => addRole(userId, 'organizer');
export const demoteFromOrganizer = async (userId: string) => removeRole(userId, 'organizer');
export const promoteToPlayer = async (userId: string) => addRole(userId, 'player');
export const demoteFromPlayer = async (userId: string) => removeRole(userId, 'player');

// --- Clubs ---
export const createClub = async (clubData: Partial<Club>): Promise<string> => {
    const clubRef = doc(collection(db, 'clubs'));
    const id = clubRef.id;
    const club: Club = {
        id,
        name: clubData.name || 'Unnamed Club',
        slug: clubData.slug || id,
        description: clubData.description || '',
        logoUrl: clubData.logoUrl || null,
        region: clubData.region || null,
        country: clubData.country || 'New Zealand',
        createdByUserId: clubData.createdByUserId!,
        admins: clubData.admins || [],
        members: clubData.members || [],
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
    await setDoc(clubRef, club);
    return id;
};

export const getAllClubs = async (): Promise<Club[]> => {
    const snapshot = await getDocs(query(collection(db, 'clubs')));
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Club));
}

export const getUserClubs = async (userId: string): Promise<Club[]> => {
    try {
        const q = query(collection(db, 'clubs'), where('admins', 'array-contains', userId));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Club));
    } catch (e) {
        console.error("Error fetching user clubs:", e);
        return [];
    }
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
    return onSnapshot(q, (snap) => {
        callback(!snap.empty);
    });
};

export const requestJoinClub = async (clubId: string, userId: string) => {
    const q = query(collection(db, 'clubs', clubId, 'joinRequests'), where('userId', '==', userId), where('status', '==', 'pending'));
    const snap = await getDocs(q);
    if (!snap.empty) return; 

    const reqRef = doc(collection(db, 'clubs', clubId, 'joinRequests'));
    const joinReq: ClubJoinRequest = {
        id: reqRef.id,
        clubId,
        userId,
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
    await setDoc(reqRef, joinReq);
};

export const approveClubJoinRequest = async (clubId: string, requestId: string, userId: string) => {
    const clubRef = doc(db, 'clubs', clubId);
    const reqRef = doc(db, 'clubs', clubId, 'joinRequests', requestId);

    await runTransaction(db, async tx => {
        const clubSnap = await tx.get(clubRef);
        if (!clubSnap.exists()) throw new Error('Club not found');
        const club = clubSnap.data() as Club;
        const members = new Set(club.members ?? []);
        members.add(userId);
        tx.update(clubRef, { members: Array.from(members), updatedAt: Date.now() });
        tx.update(reqRef, { status: 'approved', updatedAt: Date.now() });
    });
};

export const declineClubJoinRequest = async (clubId: string, requestId: string) => {
    const reqRef = doc(db, 'clubs', clubId, 'joinRequests', requestId);
    await updateDoc(reqRef, { status: 'declined', updatedAt: Date.now() });
};

export const bulkImportClubMembers = async (params: any): Promise<any[]> => {
    const func = httpsCallable(functions, 'bulkImportClubMembers');
    const result = await func(params);
    return result.data as any[];
};

// --- COURTS ---

export const subscribeToCourts = (tournamentId: string, callback: (courts: Court[]) => void) => {
    return onSnapshot(query(collection(db, 'tournaments', tournamentId, 'courts')), (snap) => {
        const courts = snap.docs.map(d => ({ id: d.id, ...d.data() } as Court));
        callback(courts.sort((a,b) => a.order - b.order));
    });
};

export const addCourt = async (tournamentId: string, name: string, order: number) => {
    const ref = doc(collection(db, 'tournaments', tournamentId, 'courts'));
    await setDoc(ref, { id: ref.id, tournamentId, name, order, active: true });
};

export const updateCourt = async (tournamentId: string, courtId: string, data: Partial<Court>) => {
    await updateDoc(doc(db, 'tournaments', tournamentId, 'courts', courtId), data);
};

export const deleteCourt = async (tournamentId: string, courtId: string) => {
    await deleteDoc(doc(db, 'tournaments', tournamentId, 'courts', courtId));
};


// --- SCHEDULING LOGIC ---

const getSeededTeams = (teams: Team[], method: SeedingMethod = 'random', playersCache: Record<string, UserProfile>): Team[] => {
    if (method === 'manual') {
        return [...teams];
    }
    
    if (method === 'random') {
         return [...teams].sort(() => Math.random() - 0.5);
    }
    
    if (method === 'rating') {
        const getRating = (t: Team) => {
            if (t.players.length === 1) {
                const p = playersCache[t.players[0]];
                return p?.duprSinglesRating ?? p?.ratingSingles ?? 0;
            } else {
                const p1 = playersCache[t.players[0]];
                const p2 = playersCache[t.players[1]];
                const r1 = p1?.duprDoublesRating ?? p1?.ratingDoubles ?? 0;
                const r2 = p2?.duprDoublesRating ?? p2?.ratingDoubles ?? 0;
                return (r1 + r2) / 2;
            }
        };

        const rated = teams.map(t => ({ t, rating: getRating(t) }));
        const hasAnyRating = rated.some(r => r.rating > 0);

        if (!hasAnyRating) {
            return [...teams].sort(() => Math.random() - 0.5);
        }

        return rated.sort((a, b) => b.rating - a.rating).map(r => r.t);
    }
    
    return [...teams].sort(() => Math.random() - 0.5);
};

export const generatePoolsSchedule = async (tournamentId: string, division: Division, teams: Team[], playersCache: Record<string, UserProfile>) => {
    const poolsCount = division.format.numberOfPools ?? 1;
    if (poolsCount < 1) throw new Error("Invalid pool configuration");
    
    const seededTeams = getSeededTeams(teams, division.format.seedingMethod, playersCache);
    
    const pools: Team[][] = Array.from({ length: poolsCount }, () => []);
    
    seededTeams.forEach((team, i) => {
        const isZig = Math.floor(i / poolsCount) % 2 === 0;
        const poolIndex = isZig ? (i % poolsCount) : (poolsCount - 1 - (i % poolsCount));
        pools[poolIndex].push(team);
    });

    const matches: Match[] = [];
    
    pools.forEach((poolTeams, poolIdx) => {
        const poolName = poolsCount === 1 ? 'Pool A' : `Pool ${String.fromCharCode(65 + poolIdx)}`; 
        
        for (let i = 0; i < poolTeams.length; i++) {
            for (let j = i + 1; j < poolTeams.length; j++) {
                matches.push({
                    id: crypto.randomUUID ? crypto.randomUUID() : `m_${Date.now()}_${Math.random()}`,
                    tournamentId,
                    divisionId: division.id,
                    roundNumber: 1, 
                    stage: poolName,
                    teamAId: poolTeams[i].id,
                    teamBId: poolTeams[j].id,
                    scoreTeamAGames: [],
                    scoreTeamBGames: [],
                    winnerTeamId: null,
                    court: null,
                    startTime: null,
                    endTime: null,
                    status: 'pending',
                    lastUpdatedBy: 'system',
                    lastUpdatedAt: Date.now()
                });
            }
        }
    });

    await batchCreateMatches(tournamentId, matches);
    await updateDoc(doc(db, 'tournaments', tournamentId), { status: 'scheduled' });
};

export const generateBracketSchedule = async (
    tournamentId: string, 
    division: Division, 
    teams: Team[], 
    stageName: string = "Main Bracket",
    playersCache: Record<string, UserProfile>
) => {
    const seeded = getSeededTeams(teams, division.format.seedingMethod, playersCache);
    const n = seeded.length;
    
    let size = 2;
    while (size < n) size *= 2;
    
    const matches: Match[] = [];
    
    const getBracketOrder = (num: number): number[] => {
        if (num === 2) return [1, 2];
        const prev = getBracketOrder(num / 2);
        const next: number[] = [];
        for (let i = 0; i < prev.length; i++) {
            next.push(prev[i]);
            next.push(num + 1 - prev[i]);
        }
        return next;
    };
    
    const seedOrder = getBracketOrder(size);
    const firstRoundMatches = size / 2;
    
    for (let i = 0; i < firstRoundMatches; i++) {
        const rankA = seedOrder[i * 2];     
        const rankB = seedOrder[i * 2 + 1]; 
        
        const teamA = seeded[rankA - 1]; 
        const teamB = seeded[rankB - 1]; 
        
        if (teamA && teamB) {
            matches.push({
                id: crypto.randomUUID ? crypto.randomUUID() : `m_${Date.now()}_${Math.random()}`,
                tournamentId,
                divisionId: division.id,
                roundNumber: 1,
                stage: stageName,
                teamAId: teamA.id,
                teamBId: teamB.id,
                scoreTeamAGames: [],
                scoreTeamBGames: [],
                winnerTeamId: null,
                court: null,
                startTime: null,
                endTime: null,
                status: 'pending',
                lastUpdatedBy: 'system',
                lastUpdatedAt: Date.now()
            });
        }
    }
    
    if (division.format.hasBronzeMatch) {
        matches.push({
            id: `bronze_${Date.now()}`,
            tournamentId,
            divisionId: division.id,
            roundNumber: 99, 
            stage: 'Bronze Match',
            teamAId: 'tbd_loser_semi_1',
            teamBId: 'tbd_loser_semi_2',
            scoreTeamAGames: [],
            scoreTeamBGames: [],
            winnerTeamId: null,
            court: null,
            startTime: null,
            endTime: null,
            status: 'pending',
            lastUpdatedBy: 'system',
            lastUpdatedAt: Date.now()
        });
    }

    await batchCreateMatches(tournamentId, matches);
    await updateDoc(doc(db, 'tournaments', tournamentId), { status: 'scheduled' });
};

export const generateFinalsFromPools = async (
    tournamentId: string, 
    division: Division, 
    standings: StandingsEntry[],
    teams: Team[],
    playersCache: Record<string, UserProfile>
) => {
    const matchesSnap = await getDocs(query(collection(db, 'tournaments', tournamentId, 'matches'), where('divisionId', '==', division.id)));
    const matches = matchesSnap.docs.map(d => d.data() as Match).filter(m => m.stage?.startsWith('Pool'));
    
    const teamPoolMap: Record<string, string> = {};
    matches.forEach(m => {
        if (m.stage) {
            teamPoolMap[m.teamAId] = m.stage;
            teamPoolMap[m.teamBId] = m.stage;
        }
    });

    const poolStandings: Record<string, StandingsEntry[]> = {};
    standings.forEach(s => {
        const pool = teamPoolMap[s.teamId];
        if (pool) {
            if (!poolStandings[pool]) poolStandings[pool] = [];
            poolStandings[pool].push(s);
        }
    });

    const sortPool = (entries: StandingsEntry[], poolMatches: Match[]) => {
        return entries.sort((a, b) => {
            const breakers = [
                division.format.tieBreakerPrimary,
                division.format.tieBreakerSecondary,
                division.format.tieBreakerTertiary
            ].filter(Boolean) as TieBreaker[];

            if (breakers.length === 0) breakers.push('match_wins', 'point_diff', 'head_to_head');

            for (const criteria of breakers) {
                 if (criteria === 'match_wins') {
                     if (b.wins !== a.wins) return b.wins - a.wins;
                 } else if (criteria === 'point_diff') {
                     if (b.pointDifference !== a.pointDifference) return b.pointDifference - a.pointDifference;
                 } else if (criteria === 'head_to_head') {
                     const match = poolMatches.find(m => 
                        (m.teamAId === a.teamId && m.teamBId === b.teamId) || 
                        (m.teamAId === b.teamId && m.teamBId === a.teamId)
                     );
                     
                     if (match && match.winnerTeamId) {
                         if (match.winnerTeamId === a.teamId) return -1;
                         if (match.winnerTeamId === b.teamId) return 1;
                     }
                 }
            }
            return 0; 
        });
    };

    Object.keys(poolStandings).forEach(pool => {
        poolStandings[pool] = sortPool(poolStandings[pool], matches);
    });

    const mainAdvancers: Team[] = [];
    const plateAdvancers: Team[] = [];

    const advMainCount = division.format.advanceToMainPerPool || 1;
    const advPlateCount = division.format.advanceToPlatePerPool || 0;

    Object.keys(poolStandings).sort().forEach(pool => {
        const ranked = poolStandings[pool];
        
        for (let i = 0; i < advMainCount; i++) {
            if (ranked[i]) {
                const team = teams.find(t => t.id === ranked[i].teamId);
                if (team) mainAdvancers.push(team);
            }
        }
        
        if (division.format.plateEnabled) {
            for (let i = advMainCount; i < advMainCount + advPlateCount; i++) {
                 if (ranked[i]) {
                    const team = teams.find(t => t.id === ranked[i].teamId);
                    if (team) plateAdvancers.push(team);
                }
            }
        }
    });

    await generateBracketSchedule(tournamentId, division, mainAdvancers, "Main Bracket", playersCache);

    if (division.format.plateEnabled && plateAdvancers.length > 1) {
         await generateBracketSchedule(tournamentId, division, plateAdvancers, "Plate Bracket", playersCache);
    }
};

// --- General ---

export const saveTournament = async (tournament: Tournament, divisions?: Division[]) => {
    const { ...tData } = tournament; 
    
    if (tData.clubId) {
        try {
            const clubSnap = await getDoc(doc(db, 'clubs', tData.clubId));
            if (clubSnap.exists()) {
                const club = clubSnap.data() as Club;
                tData.clubName = club.name;
                tData.clubLogoUrl = club.logoUrl || undefined;
            }
        } catch (e) { console.error(e); }
    }

    const tRef = doc(db, 'tournaments', tournament.id);
    const cleanData = JSON.parse(JSON.stringify(tData));
    delete cleanData.events;
    delete cleanData.participants;
    delete cleanData.matches;
    
    await setDoc(tRef, cleanData, { merge: true });

    if (divisions && divisions.length > 0) {
        const batch = writeBatch(db);
        divisions.forEach(div => {
            const divRef = doc(db, 'tournaments', tournament.id, 'divisions', div.id);
            batch.set(divRef, { ...div, tournamentId: tournament.id });
        });
        await batch.commit();
    }
};

export const subscribeToTournaments = (userId: string, callback: (tournaments: Tournament[]) => void) => {
    let owned: Tournament[] = [];
    let publicComps: Tournament[] = [];
    const emit = () => {
        const allMap = new Map<string, Tournament>();
        publicComps.forEach(c => allMap.set(c.id, c));
        owned.forEach(c => allMap.set(c.id, c));
        callback(Array.from(allMap.values()));
    };
    const unsubOwned = onSnapshot(query(collection(db, 'tournaments'), where('createdByUserId', '==', userId)), (snap) => {
        owned = snap.docs.map(d => ({ id: d.id, ...d.data() } as Tournament));
        emit();
    });
    const unsubPublic = onSnapshot(query(collection(db, 'tournaments'), where('visibility', '==', 'public')), (snap) => {
        publicComps = snap.docs.map(d => ({ id: d.id, ...d.data() } as Tournament));
        emit();
    });
    return () => { unsubOwned(); unsubPublic(); };
};

export const getAllTournaments = async (limitCount = 50): Promise<Tournament[]> => {
    const snapshot = await getDocs(query(collection(db, 'tournaments'), limit(limitCount)));
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Tournament));
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
    data: Partial<Division>
) => {
    const divRef = doc(db, 'tournaments', tournamentId, 'divisions', divisionId);
    await setDoc(
        divRef,
        { 
            ...data,
            updatedAt: Date.now(),
        },
        { merge: true }
    );
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
    await setDoc(doc(db, 'tournaments', tournamentId, 'teams', teamId), { status: 'withdrawn' }, { merge: true });
};

export const createMatch = async (tournamentId: string, match: Match) => {
    await setDoc(doc(db, 'tournaments', tournamentId, 'matches', match.id), match);
};

export const updateMatchScore = async (tournamentId: string, matchId: string, updates: Partial<Match>) => {
    await setDoc(doc(db, 'tournaments', tournamentId, 'matches', matchId), { ...updates, lastUpdatedAt: Date.now() }, { merge: true });
};

export const batchCreateMatches = async (tournamentId: string, matches: Match[]) => {
    const batch = writeBatch(db);
    matches.forEach(m => {
        const ref = doc(db, 'tournaments', tournamentId, 'matches', m.id);
        batch.set(ref, m);
    });
    await batch.commit();
};

export const getRegistration = async (
  tournamentId: string,
  playerId: string
): Promise<TournamentRegistration | null> => {
  if (!tournamentId || !playerId) return null;
  const docRef = doc(db, 'tournament_registrations', `${playerId}_${tournamentId}`);
  const snap = await getDoc(docRef);
  return snap.exists()
    ? ({ id: snap.id, ...(snap.data() as any) } as TournamentRegistration)
    : null;
};

export const saveRegistration = async (reg: TournamentRegistration) => {
  await setDoc(
    doc(db, 'tournament_registrations', reg.id),
    JSON.parse(JSON.stringify(reg)),
    { merge: true }
  );
};

export const getAllRegistrations = async (limitCount = 100): Promise<TournamentRegistration[]> => {
    const snapshot = await getDocs(query(collection(db, 'tournament_registrations'), limit(limitCount)));
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as TournamentRegistration));
};

export const getOpenTeamsForDivision = async (
  tournamentId: string,
  divisionId: string
): Promise<Team[]> => {
  const q = query(
    collection(db, 'tournaments', tournamentId, 'teams'),
    where('divisionId', '==', divisionId),
    where('status', '==', 'pending_partner'),
    where('isLookingForPartner', '==', true) 
  );
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as Team))
    .filter(t => (t.players?.length || 0) === 1); 
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
  divisionId: string
): Promise<PartnerInvite[]> => {
  const q = query(
    collection(db, 'partnerInvites'),
    where('tournamentId', '==', tournamentId),
    where('divisionId', '==', divisionId),
    where('status', '==', 'pending')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as PartnerInvite));
};

// --- Helper: Get User Teams (Moved up for use in finalizeRegistration) ---
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

/**
 * Finalize a tournament registration:
 * - Persist the registration payload
 * - For each selected event/division, ensure teams exist using ensureTeamExists()
 * - For invite mode, create a partnerInvites doc referencing the new team
 * - Update registration to completed and attach team ids to partnerDetails when applicable
 */
export const finalizeRegistration = async (
  payload: TournamentRegistration,
  tournament: Tournament,
  userProfile: UserProfile
): Promise<{ teamsCreated: Record<string, any> }> => {
  if (!payload || !tournament || !userProfile) {
    throw new Error('Invalid args to finalizeRegistration');
  }

  const regRef = doc(db, 'tournament_registrations', payload.id);
  const now = Date.now();

  // Persist the incoming registration early (merge so partial updates don't clobber)
  await setDoc(regRef, { ...payload, updatedAt: now }, { merge: true });

  const teamsCreated: Record<string, any> = {};
  const partnerDetails = payload.partnerDetails || {};

  // Pre-fetch user's existing teams to prevent creating duplicates (e.g. if they just accepted an invite)
  const userTeams = await getUserTeamsForTournament(tournament.id, userProfile.id);

  // Iterate selected event/divisions (safe for undefined)
  for (const divId of payload.selectedEventIds || []) {
    try {
      const details: any = partnerDetails[divId] || {};
      const mode = details.mode || 'open_team';

      // 1) Join an existing open team
      if (mode === 'join_open') {
        const openTeamId = details.openTeamId;
        if (!openTeamId) continue;
        const teamRef = doc(db, 'tournaments', tournament.id, 'teams', openTeamId);
        const teamSnap = await getDoc(teamRef);
        if (!teamSnap.exists()) {
          console.warn('open team not found', openTeamId);
          continue;
        }
        const teamData = teamSnap.data() || {};
        const players = Array.from(new Set([...(teamData.players || []).map(String), userProfile.id]));
        if (!teamData.players || !teamData.players.includes(userProfile.id)) {
          await updateDoc(teamRef, { players, updatedAt: Date.now() });
        }
        teamsCreated[divId] = { existed: true, teamId: openTeamId, team: { id: openTeamId, ...teamData } };
        partnerDetails[divId] = { ...details, teamId: openTeamId, mode: 'join_open' };
        continue;
      }

      // 2) Invite flow - create a solo pending team for inviter + create partnerInvite
      if (mode === 'invite') {
        const partnerUserId = details.partnerUserId;
        if (!partnerUserId && !details.teamId) continue; 

        // If trying to invite someone new
        if (partnerUserId) {
            const blockingTeam = userTeams.find(t =>
                t.divisionId === divId &&
                t.status !== 'withdrawn' &&
                t.status !== 'cancelled' &&
                !(
                    t.status === 'pending_partner' &&
                    (t.players?.length || 0) === 1 &&
                    t.players?.[0] === userProfile.id
                )
            );

            if (blockingTeam) {
                teamsCreated[divId] = { existed: true, teamId: blockingTeam.id, team: blockingTeam };
                partnerDetails[divId] = { ...details, teamId: blockingTeam.id };
                continue;
            }

            const teamName = details.teamName || null;

            const resp = await ensureTeamExists(
                tournament.id,
                divId,
                [userProfile.id],
                teamName,
                userProfile.id,
                { status: 'pending_partner' }
            );
            teamsCreated[divId] = resp;
            partnerDetails[divId] = { ...details, teamId: resp.teamId, mode: 'invite' };

            try {
                const inviteRef = doc(collection(db, 'partnerInvites'));
                const invite: PartnerInvite = {
                    id: inviteRef.id,
                    tournamentId: tournament.id,
                    divisionId: divId,
                    teamId: resp.teamId,
                    inviterId: userProfile.id,
                    invitedUserId: partnerUserId,
                    status: 'pending',
                    inviteToken: null,
                    createdAt: Date.now(),
                    respondedAt: null,
                    expiresAt: null,
                };
                await setDoc(inviteRef, invite);
            } catch (err) {
                console.error('Failed to create partner invite', err);
            }

            try {
                const inviterProfile = await getUserProfile(userProfile.id);
                const invitedProfile = await getUserProfile(partnerUserId);
                let pendingTeamName = resp.team?.teamName || (inviterProfile?.displayName || userProfile.id);
                if (invitedProfile && inviterProfile) {
                    pendingTeamName = `${inviterProfile.displayName || inviterProfile.id} & ${invitedProfile.displayName || invitedProfile.id} (Pending)`;
                } else if (!resp.team?.teamName) {
                    pendingTeamName = `${inviterProfile?.displayName || userProfile.id} (Pending)`;
                }

                const teamRef = doc(db, 'tournaments', tournament.id, 'teams', resp.teamId);
                await updateDoc(teamRef, {
                    teamName: pendingTeamName,
                    pendingInvitedUserId: partnerUserId,
                    isLookingForPartner: true,
                    status: 'pending_partner',
                    updatedAt: Date.now(),
                });
            } catch (err) {
                console.warn('Could not update team with pending invite metadata', err);
            }
        }
        continue;
      }

      // 3) Open team (I don't have a partner yet)
      if (mode === 'open_team' || !mode) {
        
        // CHECK IF USER IS ALREADY IN A TEAM FOR THIS DIVISION
        // This prevents duplicate solo teams if the user just accepted an invite
        const existingTeam = userTeams.find(t => t.divisionId === divId);
        
        if (existingTeam) {
             console.log(`User already has a team (${existingTeam.id}) for division ${divId}. Skipping new team creation.`);
             teamsCreated[divId] = { existed: true, teamId: existingTeam.id, team: existingTeam };
             
             // Update the payload to point to the existing team, but keep 'open_team' or existing mode
             partnerDetails[divId] = { 
                 mode: 'open_team', 
                 teamId: existingTeam.id,
                 teamName: existingTeam.teamName || undefined,
                 ...details // Keep other details if present
             };
             continue;
        }

        const teamName = details.teamName || `${userProfile.displayName || userProfile.id} (Looking for partner)`;
        const resp = await ensureTeamExists(tournament.id, divId, [userProfile.id], teamName, userProfile.id, { status: 'pending_partner' });
        teamsCreated[divId] = resp;
        partnerDetails[divId] = { ...details, teamId: resp.teamId, mode: 'open_team' };
        continue;
      }
    } catch (err) {
      console.error('finalizeRegistration: failed for division', divId, err);
    }
  }

  // Build the registration object that the UI expects and mark completed
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

  // Persist the final registration
  await setDoc(regRef, updatedReg, { merge: true });

  return { teamsCreated };
};

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
        if (!teamName || teamName === inviterName || teamName.endsWith('(Pending)')) {
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
/**
 * Match Management and Schedule Generation
 *
 * FILE LOCATION: services/firebase/matches.ts
 * VERSION: V06.06 - Added pool play schedule generation using new format generator
 */

import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  onSnapshot,
  writeBatch,
} from '@firebase/firestore';
import { db } from './config';
import type { Match, Division, Team, UserProfile, StandingsEntry, GameScore, PoolAssignment } from '../../types';
import type { GameSettings } from '../../types/game/gameSettings';
import type { PoolPlayMedalsSettings } from '../../types/formats/formatTypes';
import { DEFAULT_GAME_SETTINGS } from '../../types/game/gameSettings';
import { DEFAULT_POOL_PLAY_MEDALS_SETTINGS } from '../../types/formats/formatTypes';
import {
  generatePoolStage,
  type PoolParticipant,
  type Pool,
  type PoolStanding,
  calculatePoolStandings,
  determineQualifiers,
  getQualifiedParticipants,
  getPlateParticipants,
  generateMedalBracket,
  generatePlateBracket,
} from '../formats/poolPlayMedals';

// ============================================
// Match CRUD
// ============================================

export const subscribeToMatches = (
  tournamentId: string, 
  callback: (matches: Match[]) => void
) => {
  return onSnapshot(
    collection(db, 'tournaments', tournamentId, 'matches'), 
    (snap) => {
      callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Match)));
    }
  );
};

export const createMatch = async (tournamentId: string, match: Match) => {
  await setDoc(doc(db, 'tournaments', tournamentId, 'matches', match.id), match);
};

export const updateMatchScore = async (
  tournamentId: string, 
  matchId: string, 
  updates: Partial<Match>
) => {
  await updateDoc(
    doc(db, 'tournaments', tournamentId, 'matches', matchId), 
    { ...updates, updatedAt: Date.now() }
  );
};

export const batchCreateMatches = async (tournamentId: string, matches: Match[]) => {
  const batch = writeBatch(db);
  matches.forEach(m => {
    batch.set(doc(db, 'tournaments', tournamentId, 'matches', m.id), m);
  });
  await batch.commit();
};

// ============================================
// Match Completion with Bracket Advancement
// ============================================

/**
 * Complete a match and automatically advance the winner to the next bracket match.
 * This handles:
 * 1. Updating the current match with scores and winner
 * 2. If it's a bracket match with nextMatchId, advancing the winner
 * 3. Handling bye matches (auto-advance if opponent is empty)
 */
export const completeMatchWithAdvancement = async (
  tournamentId: string,
  matchId: string,
  winnerId: string,
  scores: GameScore[],
  userId?: string
): Promise<void> => {
  // Get current match data
  const matchRef = doc(db, 'tournaments', tournamentId, 'matches', matchId);
  const matchSnap = await getDoc(matchRef);

  if (!matchSnap.exists()) {
    throw new Error('Match not found');
  }

  const match = { id: matchSnap.id, ...matchSnap.data() } as Match;
  const now = Date.now();

  // Use batch for atomic updates
  const batch = writeBatch(db);

  // Build modern scores array
  const scoresModern = scores.map((s, i) => ({
    gameNumber: i + 1,
    scoreA: s.team1Score ?? s.teamAScore ?? 0,
    scoreB: s.team2Score ?? s.teamBScore ?? 0,
  }));

  // Update current match with BOTH legacy and modern formats
  batch.update(matchRef, {
    status: 'completed',
    completedAt: now,
    winnerId: winnerId,
    winnerTeamId: winnerId,
    scores: scoresModern,
    scoreTeamAGames: scores.map(s => s.team1Score ?? s.teamAScore ?? 0),
    scoreTeamBGames: scores.map(s => s.team2Score ?? s.teamBScore ?? 0),
    endTime: now,
    lastUpdatedBy: userId || null,
    lastUpdatedAt: now,
  });

  // Advance winner to next match if this is a bracket match
  if (match.nextMatchId && match.nextMatchSlot) {
    const nextMatchRef = doc(db, 'tournaments', tournamentId, 'matches', match.nextMatchId);
    const nextMatchField = match.nextMatchSlot === 'teamA' || match.nextMatchSlot === 'sideA'
      ? 'teamAId'
      : 'teamBId';

    batch.update(nextMatchRef, {
      [nextMatchField]: winnerId,
      lastUpdatedAt: now,
    });
  }

  await batch.commit();
};

/**
 * Get a single match by ID
 */
export const getMatch = async (
  tournamentId: string,
  matchId: string
): Promise<Match | null> => {
  const matchSnap = await getDoc(doc(db, 'tournaments', tournamentId, 'matches', matchId));
  if (!matchSnap.exists()) return null;
  return { id: matchSnap.id, ...matchSnap.data() } as Match;
};

/**
 * Check if a match is a bye (one team is empty) and auto-advance if so
 */
export const processMatchBye = async (
  tournamentId: string,
  matchId: string
): Promise<boolean> => {
  const match = await getMatch(tournamentId, matchId);
  if (!match) return false;

  const teamAEmpty = !match.teamAId || match.teamAId === '';
  const teamBEmpty = !match.teamBId || match.teamBId === '';

  // If exactly one team is empty, it's a bye
  if (teamAEmpty !== teamBEmpty) {
    const winnerId = teamAEmpty ? match.teamBId : match.teamAId;

    await completeMatchWithAdvancement(
      tournamentId,
      matchId,
      winnerId,
      [], // No scores for bye
      'system'
    );

    return true;
  }

  return false;
};

// ============================================
// Schedule Generation
// ============================================

export const generatePoolsSchedule = async (
  tournamentId: string, 
  division: Division, 
  teams: Team[], 
  _playersCache: Record<string, UserProfile>
) => {
  const matches: Match[] = [];
  const now = Date.now();

  // Round robin: every team plays every other team
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const matchRef = doc(collection(db, 'tournaments', tournamentId, 'matches'));
      const match: Match = {
        id: matchRef.id,
        tournamentId,
        divisionId: division.id,
        teamAId: teams[i].id,
        teamBId: teams[j].id,
        roundNumber: 1,
        matchNumber: matches.length + 1,
        stage: 'Pool Play',
        status: 'scheduled',
        court: null,
        startTime: null,
        endTime: null,
        scoreTeamAGames: [],
        scoreTeamBGames: [],
        winnerTeamId: null,
        lastUpdatedBy: null,
        lastUpdatedAt: now,
      } as Match;
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
  _playersCache: Record<string, UserProfile>
) => {
  const now = Date.now();
  const numTeams = teams.length;

  // Calculate bracket size (next power of 2)
  const nextPowerOf2 = Math.pow(2, Math.ceil(Math.log2(numTeams)));
  const numRounds = Math.ceil(Math.log2(nextPowerOf2));

  // First pass: create all matches and store by round
  const matchesByRound: Match[][] = [];
  let matchNumber = 1;

  for (let round = 1; round <= numRounds; round++) {
    const matchesInRound = nextPowerOf2 / Math.pow(2, round);
    const roundMatches: Match[] = [];

    for (let i = 0; i < matchesInRound; i++) {
      const matchRef = doc(collection(db, 'tournaments', tournamentId, 'matches'));

      // Only assign teams in round 1
      let teamAId: string | null = null;
      let teamBId: string | null = null;

      if (round === 1) {
        const seedA = i * 2;
        const seedB = i * 2 + 1;
        teamAId = seedA < teams.length ? teams[seedA].id : null;
        teamBId = seedB < teams.length ? teams[seedB].id : null;
      }

      const match: Match = {
        id: matchRef.id,
        tournamentId,
        divisionId: division.id,
        teamAId: teamAId || '',
        teamBId: teamBId || '',
        roundNumber: round,
        matchNumber: matchNumber++,
        stage: round === numRounds ? 'Finals' :
               round === numRounds - 1 ? 'Semi-Finals' :
               `Round ${round}`,
        status: 'scheduled',
        court: null,
        startTime: null,
        endTime: null,
        scoreTeamAGames: [],
        scoreTeamBGames: [],
        winnerTeamId: null,
        nextMatchId: null,
        nextMatchSlot: null,
        lastUpdatedBy: null,
        lastUpdatedAt: now,
      } as Match;

      roundMatches.push(match);
    }

    matchesByRound.push(roundMatches);
  }

  // Second pass: link matches to next round
  for (let roundIndex = 0; roundIndex < matchesByRound.length - 1; roundIndex++) {
    const currentRoundMatches = matchesByRound[roundIndex];
    const nextRoundMatches = matchesByRound[roundIndex + 1];

    for (let i = 0; i < currentRoundMatches.length; i++) {
      const nextMatchIndex = Math.floor(i / 2);
      const slot = i % 2 === 0 ? 'teamA' : 'teamB';

      if (nextRoundMatches[nextMatchIndex]) {
        currentRoundMatches[i].nextMatchId = nextRoundMatches[nextMatchIndex].id;
        currentRoundMatches[i].nextMatchSlot = slot;
      }
    }
  }

  // Flatten matches
  const matches = matchesByRound.flat();

  // Save all matches
  const batch = writeBatch(db);
  matches.forEach(m => {
    batch.set(doc(db, 'tournaments', tournamentId, 'matches', m.id), m);
  });
  await batch.commit();

  // Process bye matches (auto-advance teams with no opponent)
  for (const match of matches) {
    if (match.roundNumber === 1) {
      const teamAEmpty = !match.teamAId || match.teamAId === '';
      const teamBEmpty = !match.teamBId || match.teamBId === '';

      if (teamAEmpty !== teamBEmpty) {
        // One team is empty - this is a bye
        await processMatchBye(tournamentId, match.id);
      }
    }
  }

  return matches;
};

export const generateFinalsFromPools = async (
  tournamentId: string,
  division: Division,
  teams: Team[],
  playersCache: Record<string, UserProfile>,
  standings: StandingsEntry[]
) => {
  // Get top teams from standings
  const advanceCount = (division as any).advanceCount || 4;
  const qualifyingTeams = standings.slice(0, advanceCount);

  // Map standings back to teams
  const teamsForBracket = qualifyingTeams
    .map(s => teams.find(t => (t.id || t.odTeamId) === s.odTeamId))
    .filter((t): t is Team => t !== undefined);

  return generateBracketSchedule(tournamentId, division, teamsForBracket, playersCache);
};

// ============================================
// Pool Play Medals Schedule Generation (NEW)
// ============================================

/**
 * Generate pool play schedule using the new format generator.
 *
 * This is the bridge function that connects the UI to the new poolPlayMedals generator.
 * It uses the NEW Match structure (sideA, sideB, poolGroup, scores[], etc.)
 *
 * @param tournamentId - Tournament ID
 * @param divisionId - Division ID
 * @param teams - Teams to distribute into pools
 * @param poolSettings - Pool play settings (pool size, advancement rules)
 * @param gameSettings - Game scoring settings
 * @param poolAssignments - Optional manual pool assignments (from drag-drop editor)
 * @returns Match IDs and pool count
 */
export const generatePoolPlaySchedule = async (
  tournamentId: string,
  divisionId: string,
  teams: Team[],
  poolSettings?: PoolPlayMedalsSettings,
  gameSettings?: GameSettings,
  poolAssignments?: PoolAssignment[]
): Promise<{ matchIds: string[]; poolCount: number }> => {
  if (teams.length < 2) {
    return { matchIds: [], poolCount: 0 };
  }

  // Use defaults if not provided
  const settings = poolSettings || DEFAULT_POOL_PLAY_MEDALS_SETTINGS;
  const gameCfg = gameSettings || DEFAULT_GAME_SETTINGS;

  // Convert teams to pool participants
  console.log('[generatePoolPlaySchedule] Teams input:', teams.length, teams.map(t => ({ id: t.id, odTeamId: t.odTeamId, name: t.teamName })));

  const participants: PoolParticipant[] = teams
    .filter(t => t.id || t.odTeamId)  // Ensure we have an ID
    .map(t => {
      const teamId = t.id || t.odTeamId || '';
      return {
        id: teamId,
        name: t.teamName || t.name || `Team ${teamId.slice(0, 4)}`,
        playerIds: t.players?.map(p => typeof p === 'string' ? p : p.odUserId || p.id || '') || t.playerIds || [],
        duprRating: t.seed,  // Use seed as rating proxy
      };
    });

  console.log('[generatePoolPlaySchedule] Participants:', participants.length);

  // Build config for the generator
  const config = {
    eventType: 'tournament' as const,
    eventId: tournamentId,
    participants,
    gameSettings: gameCfg,
    formatSettings: settings,
  };

  // If we have manual pool assignments, convert them to the generator's Pool format
  let poolResult;
  console.log('[generatePoolPlaySchedule] Pool assignments:', poolAssignments?.length || 0);
  console.log('[generatePoolPlaySchedule] Settings:', settings);

  if (poolAssignments && poolAssignments.length > 0) {
    console.log('[generatePoolPlaySchedule] Using manual pool assignments');
    // Build pools from manual assignments
    const manualPools: Pool[] = poolAssignments.map((pa, index) => ({
      poolNumber: index + 1,
      poolName: pa.poolName,
      participants: pa.teamIds
        .map(teamId => participants.find(p => p.id === teamId))
        .filter((p): p is PoolParticipant => p !== undefined),
    }));
    console.log('[generatePoolPlaySchedule] Manual pools:', manualPools.map(p => ({ name: p.poolName, count: p.participants.length })));

    // Generate matches manually from manual pools
    poolResult = generatePoolMatchesFromPools(manualPools, config);
  } else {
    console.log('[generatePoolPlaySchedule] Using auto-seeding via generatePoolStage');
    // Use auto-seeding via the generator
    // generatePoolStage returns PoolPlayResult with { pools, poolMatches }
    poolResult = generatePoolStage(config);
  }

  console.log('[generatePoolPlaySchedule] Pool result:', poolResult.pools.length, 'pools,', poolResult.poolMatches.length, 'matches');

  // Save all pool matches to Firestore
  const batch = writeBatch(db);
  const matchIds: string[] = [];
  const now = Date.now();

  // Helper to remove undefined values (Firestore rejects undefined)
  const removeUndefined = (obj: Record<string, unknown>): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined) continue;
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = removeUndefined(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }
    return result;
  };

  for (const matchData of poolResult.poolMatches) {
    const matchRef = doc(collection(db, 'tournaments', tournamentId, 'matches'));
    matchIds.push(matchRef.id);

    const match = {
      ...matchData,
      id: matchRef.id,
      tournamentId,
      divisionId,
      stage: 'pool',
      createdAt: now,
      updatedAt: now,
    };

    // Clean undefined values before saving to Firestore
    const cleanedMatch = removeUndefined(match as Record<string, unknown>);
    batch.set(matchRef, cleanedMatch);
  }

  await batch.commit();

  return { matchIds, poolCount: poolResult.pools.length };
};

/**
 * Helper function to generate pool matches from manually assigned pools.
 * Uses the same round robin logic as the main generator.
 */
function generatePoolMatchesFromPools(
  pools: Pool[],
  config: {
    eventType: 'tournament' | 'league' | 'meetup';
    eventId: string;
    gameSettings: GameSettings;
    formatSettings: PoolPlayMedalsSettings;
  }
): { pools: Pool[]; poolMatches: Omit<Match, 'id' | 'createdAt' | 'updatedAt'>[] } {
  const { eventType, eventId, gameSettings } = config;
  const allPoolMatches: Omit<Match, 'id' | 'createdAt' | 'updatedAt'>[] = [];
  let globalMatchNumber = 1;

  for (const pool of pools) {
    // Generate round robin matches within each pool
    const n = pool.participants.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const pA = pool.participants[i];
        const pB = pool.participants[j];

        // CRITICAL: Validate teams are different (prevent data corruption)
        if (pA.id === pB.id) {
          console.error(`[Pool Matches] Skipping invalid pairing: same team ID: ${pA.id}`);
          continue;
        }
        if (pA.name.toLowerCase() === pB.name.toLowerCase()) {
          console.error(`[Pool Matches] Skipping invalid pairing: same team name: ${pA.name}`);
          continue;
        }

        // Build sideA - only include duprRating if defined (Firestore rejects undefined)
        const sideA: any = {
          id: pA.id,
          name: pA.name,
          playerIds: pA.playerIds,
        };
        if (pA.duprRating !== undefined) sideA.duprRating = pA.duprRating;

        // Build sideB - only include duprRating if defined
        const sideB: any = {
          id: pB.id,
          name: pB.name,
          playerIds: pB.playerIds,
        };
        if (pB.duprRating !== undefined) sideB.duprRating = pB.duprRating;

        const match: Omit<Match, 'id' | 'createdAt' | 'updatedAt'> = {
          eventType,
          eventId,
          format: 'pool_play_medals',
          gameSettings,
          sideA,
          sideB,
          roundNumber: 1,
          matchNumber: globalMatchNumber++,
          poolGroup: pool.poolName,
          status: 'scheduled',
          scores: [],
        };

        allPoolMatches.push(match);
      }
    }
  }

  return { pools, poolMatches: allPoolMatches };
}

/**
 * Generate finals bracket from completed pool standings.
 *
 * Called when all pool matches are complete to create the medal bracket.
 *
 * @param tournamentId - Tournament ID
 * @param divisionId - Division ID
 * @param poolMatches - Completed pool matches
 * @param teams - All division teams
 * @param settings - Pool play settings with advancement rules
 * @returns Main bracket IDs and optional plate bracket IDs
 */
export const generateFinalsFromPoolStandings = async (
  tournamentId: string,
  divisionId: string,
  poolMatches: Match[],
  teams: Team[],
  settings: PoolPlayMedalsSettings & {
    plateEnabled?: boolean;
    plateFormat?: 'single_elim' | 'round_robin';
    plateThirdPlace?: boolean;
    plateName?: string;
    gameSettings?: GameSettings;
  }
): Promise<{ mainBracketIds: string[]; plateBracketIds: string[] }> => {
  // 1. Group matches by pool
  const poolGroups = new Map<string, Match[]>();
  for (const match of poolMatches) {
    if (!match.poolGroup) continue;
    const group = poolGroups.get(match.poolGroup) || [];
    group.push(match);
    poolGroups.set(match.poolGroup, group);
  }

  // 2. Build pools from match data
  const pools: Pool[] = [];
  const sortedPoolNames = Array.from(poolGroups.keys()).sort();

  for (let i = 0; i < sortedPoolNames.length; i++) {
    const poolName = sortedPoolNames[i];
    const matches = poolGroups.get(poolName) || [];

    // Extract unique participant IDs from matches
    const participantIds = new Set<string>();
    for (const m of matches) {
      if (m.sideA?.id) participantIds.add(m.sideA.id);
      if (m.sideB?.id) participantIds.add(m.sideB.id);
      // Also support legacy format
      if ((m as any).teamAId) participantIds.add((m as any).teamAId);
      if ((m as any).teamBId) participantIds.add((m as any).teamBId);
    }

    // Map to PoolParticipants
    const participants: PoolParticipant[] = [];
    for (const id of participantIds) {
      const team = teams.find(t => (t.id || t.odTeamId) === id);
      if (team) {
        const teamId = team.id || team.odTeamId || id;
        participants.push({
          id: teamId,
          name: team.teamName || team.name || `Team ${teamId.slice(0, 4)}`,
          playerIds: team.players?.map(p => typeof p === 'string' ? p : p.odUserId || p.id || '') || team.playerIds || [],
          duprRating: team.seed,
        });
      }
    }

    pools.push({
      poolNumber: i + 1,
      poolName,
      participants,
    });
  }

  // 3. Calculate standings for each pool
  // Note: Cast to any to bridge legacy Match type from types.ts with new Match from types/game/match
  const allPoolStandings: PoolStanding[][] = pools.map(pool =>
    calculatePoolStandings(pool, poolMatches as any, settings.tiebreakers)
  );

  // 4. Determine qualifiers
  const updatedStandings = determineQualifiers(allPoolStandings, settings);

  // 5. Get qualified participants for main bracket
  const mainParticipants = getQualifiedParticipants(updatedStandings);

  // 6. Generate main medal bracket
  const gameCfg = settings.gameSettings || DEFAULT_GAME_SETTINGS;
  const medalBracket = generateMedalBracket({
    eventType: 'tournament',
    eventId: tournamentId,
    qualifiedParticipants: mainParticipants,
    gameSettings: gameCfg,
    formatSettings: settings,
  });

  // 7. Save main bracket matches
  const batch = writeBatch(db);
  const mainBracketIds: string[] = [];
  const now = Date.now();

  for (const matchData of medalBracket.bracketMatches) {
    const matchRef = doc(collection(db, 'tournaments', tournamentId, 'matches'));
    mainBracketIds.push(matchRef.id);

    const match: Match = {
      ...matchData,
      id: matchRef.id,
      tournamentId,
      divisionId,
      stage: 'bracket',
      createdAt: now,
      updatedAt: now,
    } as Match;

    batch.set(matchRef, match);
  }

  // 8. Generate plate bracket if enabled
  const plateBracketIds: string[] = [];
  if (settings.plateEnabled) {
    const plateParticipants = getPlateParticipants(updatedStandings);

    if (plateParticipants.length >= 2) {
      const plateBracket = generatePlateBracket(
        { eventType: 'tournament', eventId: tournamentId, gameSettings: gameCfg, formatSettings: settings },
        plateParticipants,
        {
          plateFormat: settings.plateFormat || 'single_elim',
          plateThirdPlace: settings.plateThirdPlace || false,
          plateName: settings.plateName || 'Plate',
        }
      );

      for (const matchData of plateBracket.plateMatches) {
        const matchRef = doc(collection(db, 'tournaments', tournamentId, 'matches'));
        plateBracketIds.push(matchRef.id);

        const match: Match = {
          ...matchData,
          id: matchRef.id,
          tournamentId,
          divisionId,
          stage: 'plate',
          bracketType: 'plate',
          createdAt: now,
          updatedAt: now,
        } as Match;

        batch.set(matchRef, match);
      }
    }
  }

  await batch.commit();

  return { mainBracketIds, plateBracketIds };
};

// ============================================
// Schedule Publishing (V06.05)
// ============================================

interface ScheduleTimeUpdate {
  matchId: string;
  courtName: string;
  startTime: number; // timestamp
  endTime?: number;  // timestamp
}

/**
 * Save scheduled times and court assignments to matches in batch
 */
export const publishScheduleTimes = async (
  tournamentId: string,
  scheduleUpdates: ScheduleTimeUpdate[]
): Promise<void> => {
  if (scheduleUpdates.length === 0) return;

  const batch = writeBatch(db);
  const now = Date.now();

  scheduleUpdates.forEach(update => {
    const matchRef = doc(db, 'tournaments', tournamentId, 'matches', update.matchId);
    batch.update(matchRef, {
      court: update.courtName,
      startTime: update.startTime,
      endTime: update.endTime || null,
      lastUpdatedAt: now,
    });
  });

  await batch.commit();
};

// ============================================
// Test Mode Functions (V06.03)
// ============================================

/**
 * Clear all test data from matches in a division
 * Resets test-flagged matches back to scheduled status
 */
export const clearTestData = async (
  tournamentId: string,
  divisionId: string
): Promise<number> => {
  // Get all matches for the division
  const matchesSnap = await getDoc(doc(db, 'tournaments', tournamentId));
  if (!matchesSnap.exists()) return 0;

  // Get matches from subcollection
  const matchesRef = collection(db, 'tournaments', tournamentId, 'matches');
  const { getDocs, query, where } = await import('@firebase/firestore');

  // Query for matches with testData: true (legacy) OR isTestData: true (new format)
  const divisionMatchesSnapshot = await getDocs(
    query(matchesRef, where('divisionId', '==', divisionId))
  );

  if (divisionMatchesSnapshot.empty) return 0;

  // Filter for test data matches (check both field names)
  const testMatches = divisionMatchesSnapshot.docs.filter(docSnap => {
    const data = docSnap.data();
    return data.testData === true || data.isTestData === true;
  });

  if (testMatches.length === 0) return 0;

  const batch = writeBatch(db);
  const now = Date.now();

  testMatches.forEach(docSnap => {
    batch.update(docSnap.ref, {
      scores: [],
      scoreTeamAGames: [],
      scoreTeamBGames: [],
      status: 'scheduled',
      winnerId: null,
      winnerTeamId: null,
      testData: null,
      isTestData: null,
      updatedAt: now,
    });
  });

  await batch.commit();
  return testMatches.length;
};

/**
 * Delete corrupted matches where same team is on both sides
 * This can happen due to data generation bugs
 */
export const deleteCorruptedSelfMatches = async (
  tournamentId: string,
  divisionId: string
): Promise<number> => {
  const { getDocs, query, where, deleteDoc } = await import('@firebase/firestore');

  // Get all matches for the division
  const matchesRef = collection(db, 'tournaments', tournamentId, 'matches');
  const snapshot = await getDocs(query(matchesRef, where('divisionId', '==', divisionId)));

  if (snapshot.empty) return 0;

  let deletedCount = 0;
  const batch = writeBatch(db);
  const batchSize = 450; // Firestore batch limit is 500
  let batchCount = 0;

  for (const docSnap of snapshot.docs) {
    const match = docSnap.data() as Match;

    // Check if it's a self-match (same team on both sides)
    const teamAId = match.teamAId || match.sideA?.id;
    const teamBId = match.teamBId || match.sideB?.id;
    const teamAName = match.sideA?.name || '';
    const teamBName = match.sideB?.name || '';

    const isSelfMatch =
      (teamAId && teamBId && teamAId === teamBId) ||
      (teamAName && teamBName && teamAName.toLowerCase() === teamBName.toLowerCase());

    if (isSelfMatch) {
      batch.delete(docSnap.ref);
      deletedCount++;
      batchCount++;

      // Commit if batch is full
      if (batchCount >= batchSize) {
        await batch.commit();
        batchCount = 0;
      }
    }
  }

  // Commit remaining
  if (batchCount > 0) {
    await batch.commit();
  }

  console.log(`[deleteCorruptedSelfMatches] Deleted ${deletedCount} corrupted matches from division ${divisionId}`);
  return deletedCount;
};

/**
 * Quick score a match (for test mode)
 * Sets the score directly without going through the normal scoring flow
 */
export const quickScoreMatch = async (
  tournamentId: string,
  matchId: string,
  scoreA: number,
  scoreB: number,
  isTestMode: boolean = false
): Promise<void> => {
  const matchRef = doc(db, 'tournaments', tournamentId, 'matches', matchId);
  const now = Date.now();

  // Determine winner
  const winnerId = scoreA > scoreB ? 'team1' : scoreA < scoreB ? 'team2' : null;

  const gameScore: GameScore = {
    scoreA,
    scoreB,
    completedAt: now,
  };

  await updateDoc(matchRef, {
    scores: [gameScore],
    status: 'completed',
    winnerId,
    completedAt: now,
    updatedAt: now,
    ...(isTestMode && { testData: true }),
  });
};

/**
 * Simulate completing all matches in a pool with random scores
 */
// ============================================
// DUPR Submission Status (V06.15)
// ============================================

export interface DuprStatusUpdate {
  duprSubmitted: boolean;
  duprMatchId?: string | null;
  duprSubmittedAt?: number | null;
  duprSubmittedBy?: string | null;
  duprError?: string | null;
}

/**
 * Update a match with DUPR submission status.
 * Works for both tournament matches and league matches.
 *
 * @param matchId - Match document ID
 * @param collectionPath - Firestore collection path (e.g., 'leagues/123/matches' or 'tournaments/456/matches')
 * @param status - DUPR submission status to update
 */
export const updateMatchDuprStatus = async (
  matchId: string,
  collectionPath: string,
  status: DuprStatusUpdate
): Promise<void> => {
  const matchRef = doc(db, collectionPath, matchId);
  const now = Date.now();

  await updateDoc(matchRef, {
    ...status,
    updatedAt: now,
  });
};

/**
 * Update a league match with DUPR submission status.
 *
 * @param leagueId - League ID
 * @param matchId - Match document ID
 * @param status - DUPR submission status to update
 */
export const updateLeagueMatchDuprStatus = async (
  leagueId: string,
  matchId: string,
  status: DuprStatusUpdate
): Promise<void> => {
  await updateMatchDuprStatus(matchId, `leagues/${leagueId}/matches`, status);
};

/**
 * Update a tournament match with DUPR submission status.
 *
 * @param tournamentId - Tournament ID
 * @param matchId - Match document ID
 * @param status - DUPR submission status to update
 */
export const updateTournamentMatchDuprStatus = async (
  tournamentId: string,
  matchId: string,
  status: DuprStatusUpdate
): Promise<void> => {
  await updateMatchDuprStatus(matchId, `tournaments/${tournamentId}/matches`, status);
};

export const simulatePoolCompletion = async (
  tournamentId: string,
  divisionId: string,
  poolName: string | 'all'
): Promise<number> => {
  const matchesRef = collection(db, 'tournaments', tournamentId, 'matches');

  // Query matches
  const { getDocs, query, where } = await import('@firebase/firestore');
  let q;
  if (poolName === 'all') {
    q = query(
      matchesRef,
      where('divisionId', '==', divisionId),
      where('status', '==', 'scheduled')
    );
  } else {
    q = query(
      matchesRef,
      where('divisionId', '==', divisionId),
      where('poolGroup', '==', poolName),
      where('status', '==', 'scheduled')
    );
  }

  const snapshot = await getDocs(q);
  if (snapshot.empty) return 0;

  const batch = writeBatch(db);
  const now = Date.now();

  snapshot.docs.forEach(docSnap => {
    // Generate random but realistic scores
    const winnerScore = Math.random() > 0.3 ? 11 : (Math.random() > 0.5 ? 15 : 21);
    const loserScore = Math.floor(Math.random() * (winnerScore - 2)); // Loser gets 0 to winnerScore-2
    const teamAWins = Math.random() > 0.5;

    const scoreA = teamAWins ? winnerScore : loserScore;
    const scoreB = teamAWins ? loserScore : winnerScore;

    const gameScore: GameScore = {
      scoreA,
      scoreB,
      completedAt: now,
    };

    batch.update(docSnap.ref, {
      scores: [gameScore],
      status: 'completed',
      winnerId: teamAWins ? 'team1' : 'team2',
      completedAt: now,
      updatedAt: now,
      testData: true,
    });
  });

  await batch.commit();
  return snapshot.size;
};
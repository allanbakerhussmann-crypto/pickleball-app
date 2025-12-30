/**
 * Match Management and Schedule Generation
 *
 * FILE LOCATION: services/firebase/matches.ts
 * VERSION: V06.21 - Idempotent pool match generation with canonical IDs
 *
 * Key changes in V06.21:
 * - Canonical match IDs (deterministic, not random) for idempotency
 * - Pre-generation and post-generation validation
 * - Firestore transaction lock to prevent race conditions
 * - poolKey (normalized) stored on matches for validation/queries
 */

import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  onSnapshot,
  writeBatch,
  runTransaction,
} from '@firebase/firestore';
import { db } from './config';
import type { Match, Division, Team, UserProfile, StandingsEntry, GameScore, PoolAssignment } from '../../types';
import {
  generatePoolMatchId,
  generateBracketMatchId,
  normalizePoolKey,
} from '../formats/poolMatchUtils';
import {
  validateMatchesBeforeWrite,
  assertValidPools,
  type PoolForValidation,
} from '../formats/roundRobinValidator';
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

// ============================================
// LOCK TIMEOUT FOR CRASH SAFETY
// ============================================

const GENERATION_LOCK_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Generate pool play schedule using the new format generator.
 *
 * This is the bridge function that connects the UI to the new poolPlayMedals generator.
 * It uses the NEW Match structure (sideA, sideB, poolGroup, scores[], etc.)
 *
 * V06.21 Changes:
 * - Uses canonical match IDs for idempotency (regenerating overwrites, not duplicates)
 * - Pre-validates pools before generation
 * - Post-validates matches before writing to Firestore
 * - Uses Firestore transaction lock to prevent race conditions
 * - Stores poolKey (normalized) on each match for validation/queries
 *
 * @param tournamentId - Tournament ID
 * @param divisionId - Division ID
 * @param teams - Teams to distribute into pools
 * @param poolSettings - Pool play settings (pool size, advancement rules)
 * @param gameSettings - Game scoring settings
 * @param poolAssignments - Optional manual pool assignments (from drag-drop editor)
 * @param userId - User ID who is generating the schedule (for audit)
 * @returns Match IDs and pool count
 */
export const generatePoolPlaySchedule = async (
  tournamentId: string,
  divisionId: string,
  teams: Team[],
  poolSettings?: PoolPlayMedalsSettings,
  gameSettings?: GameSettings,
  poolAssignments?: PoolAssignment[],
  userId?: string
): Promise<{ matchIds: string[]; poolCount: number }> => {
  if (teams.length < 2) {
    return { matchIds: [], poolCount: 0 };
  }

  const divisionRef = doc(db, 'tournaments', tournamentId, 'divisions', divisionId);

  // ============================================
  // STEP 1: Acquire generation lock atomically
  // ============================================
  let currentVersion = 0;

  try {
    const lockResult = await runTransaction(db, async (transaction) => {
      const divisionSnap = await transaction.get(divisionRef);
      const division = divisionSnap.data() as Division | undefined;

      // Check for active lock (with timeout for crash recovery)
      if (division?.scheduleStatus === 'generating') {
        const lockAge = Date.now() - (division.updatedAt ?? 0);
        if (lockAge < GENERATION_LOCK_TIMEOUT_MS) {
          throw new Error('Schedule generation already in progress. Please wait.');
        }
        // Lock is stale (browser crashed) - allow takeover
        console.warn(`[generatePoolPlaySchedule] Stale lock detected (${lockAge}ms old), taking over`);
      }

      // Atomically set generating status
      transaction.update(divisionRef, {
        scheduleStatus: 'generating',
        updatedAt: Date.now(),
      });

      return {
        currentVersion: division?.scheduleVersion || 0,
      };
    });

    currentVersion = lockResult.currentVersion;
  } catch (error) {
    // Re-throw lock errors as-is
    throw error;
  }

  try {
    // ============================================
    // STEP 2: Prepare participants and config
    // ============================================
    const settings = poolSettings || DEFAULT_POOL_PLAY_MEDALS_SETTINGS;
    const gameCfg = gameSettings || DEFAULT_GAME_SETTINGS;

    console.log('[generatePoolPlaySchedule] Teams input:', teams.length, teams.map(t => ({ id: t.id, odTeamId: t.odTeamId, name: t.teamName })));

    // Deduplicate teams by ID to prevent duplicate participants
    const seenTeamIds = new Set<string>();
    const uniqueTeams = teams.filter(t => {
      const teamId = t.id || t.odTeamId || '';
      if (!teamId || seenTeamIds.has(teamId)) {
        if (teamId) {
          console.warn(`[generatePoolPlaySchedule] Skipping duplicate team ID: ${teamId}`);
        }
        return false;
      }
      seenTeamIds.add(teamId);
      return true;
    });

    console.log(`[generatePoolPlaySchedule] Unique teams: ${uniqueTeams.length} (from ${teams.length} input)`);

    const participants: PoolParticipant[] = uniqueTeams.map(t => {
      const teamId = t.id || t.odTeamId || '';
      return {
        id: teamId,
        name: t.teamName || t.name || `Team ${teamId.slice(0, 4)}`,
        playerIds: t.players?.map(p => typeof p === 'string' ? p : p.odUserId || p.id || '') || t.playerIds || [],
        duprRating: t.seed,
      };
    });

    console.log('[generatePoolPlaySchedule] Participants:', participants.length);

    const config = {
      eventType: 'tournament' as const,
      eventId: tournamentId,
      participants,
      gameSettings: gameCfg,
      formatSettings: settings,
    };

    // ============================================
    // STEP 3: Build pools and validate
    // ============================================
    let poolResult!: { pools: Pool[]; poolMatches: Match[] };
    console.log('[generatePoolPlaySchedule] Pool assignments:', poolAssignments?.length || 0);

    // Check if we should use manual pool assignments
    let useManualPools = poolAssignments && poolAssignments.length > 0;

    if (useManualPools) {
      console.log('[generatePoolPlaySchedule] Checking manual pool assignments...');

      // SAFEGUARD: Check for duplicate teamIds across pools BEFORE mapping
      const allTeamIdsInAssignments = poolAssignments!.flatMap(pa => pa.teamIds);
      const duplicateTeamIds = allTeamIdsInAssignments.filter((id, i) => allTeamIdsInAssignments.indexOf(id) !== i);

      if (duplicateTeamIds.length > 0) {
        const uniqueDupes = [...new Set(duplicateTeamIds)];
        console.error(`[generatePoolPlaySchedule] CRITICAL: Duplicate teams in poolAssignments: ${uniqueDupes.join(', ')}. Falling back to auto-seeding.`);
        useManualPools = false;
      }
    }

    if (useManualPools) {
      const manualPools: Pool[] = poolAssignments!.map((pa, index) => ({
        poolNumber: index + 1,
        poolName: pa.poolName,
        participants: pa.teamIds
          .map(teamId => participants.find(p => p.id === teamId))
          .filter((p): p is PoolParticipant => p !== undefined),
      }));

      // SAFEGUARD: If saved poolAssignments map to 0 teams (stale data), fallback to auto-assign
      const totalMappedTeams = manualPools.reduce((sum, p) => sum + p.participants.length, 0);
      if (totalMappedTeams === 0) {
        console.warn('[generatePoolPlaySchedule] Saved poolAssignments are stale (0 teams mapped). Falling back to auto-seeding.');
        useManualPools = false;
      } else {
        console.log('[generatePoolPlaySchedule] Manual pools:', manualPools.map(p => ({ name: p.poolName, count: p.participants.length })));

        // Pre-validate pools (FAIL CLOSED)
        const poolsForValidation: PoolForValidation[] = manualPools.map(p => ({
          poolName: p.poolName,
          participants: p.participants.map(pt => ({ id: pt.id, name: pt.name })),
        }));
        assertValidPools(poolsForValidation);

        poolResult = generatePoolMatchesFromPools(manualPools, config, divisionId);
      }
    }

    if (!useManualPools) {
      console.log('[generatePoolPlaySchedule] Using auto-seeding via generatePoolStage');
      poolResult = generatePoolStage(config);

      // Pre-validate auto-generated pools
      const poolsForValidation: PoolForValidation[] = poolResult.pools.map(p => ({
        poolName: p.poolName,
        participants: p.participants.map(pt => ({ id: pt.id, name: pt.name })),
      }));
      assertValidPools(poolsForValidation);
    }

    console.log('[generatePoolPlaySchedule] Pool result:', poolResult.pools.length, 'pools,', poolResult.poolMatches.length, 'matches');

    // ============================================
    // STEP 4: Post-validate matches (FAIL CLOSED)
    // ============================================
    const poolsForValidation: PoolForValidation[] = poolResult.pools.map(p => ({
      poolName: p.poolName,
      participants: p.participants.map(pt => ({ id: pt.id, name: pt.name })),
    }));

    const matchesForValidation = poolResult.poolMatches.map(m => ({
      poolGroup: m.poolGroup,
      poolKey: (m as any).poolKey || normalizePoolKey(m.poolGroup || ''),
      divisionId,
      stage: 'pool' as const,
      sideA: { id: m.sideA?.id || '', name: m.sideA?.name || '' },
      sideB: { id: m.sideB?.id || '', name: m.sideB?.name || '' },
    }));

    const validation = validateMatchesBeforeWrite(matchesForValidation, poolsForValidation);
    if (!validation.valid) {
      console.error('[generatePoolPlaySchedule] Match validation failed:', validation);
      throw new Error(`Schedule generation failed: ${validation.errors.join('; ')}`);
    }

    if (validation.warnings && validation.warnings.length > 0) {
      console.warn('[generatePoolPlaySchedule] Validation warnings:', validation.warnings);
    }

    // ============================================
    // STEP 5: Write matches with canonical IDs
    // ============================================
    const batch = writeBatch(db);
    const matchIds: string[] = [];
    const now = Date.now();

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
      // Generate canonical ID (deterministic, not random)
      const poolKey = (matchData as any).poolKey || normalizePoolKey(matchData.poolGroup || '');
      const sideAId = matchData.sideA?.id || '';
      const sideBId = matchData.sideB?.id || '';
      const canonicalId = generatePoolMatchId(divisionId, poolKey, sideAId, sideBId);

      // Use canonical ID for the document
      const matchRef = doc(db, 'tournaments', tournamentId, 'matches', canonicalId);
      matchIds.push(canonicalId);

      const match = {
        ...matchData,
        id: canonicalId,
        poolKey, // Store normalized key for queries/validation
        tournamentId,
        divisionId,
        stage: 'pool',
        createdAt: now,
        updatedAt: now,
      };

      const cleanedMatch = removeUndefined(match as Record<string, unknown>);
      batch.set(matchRef, cleanedMatch); // set() overwrites if exists - idempotent!
    }

    await batch.commit();

    // ============================================
    // STEP 6: Build poolAssignments for storage
    // ============================================
    const poolAssignmentsToSave: PoolAssignment[] = poolResult.pools.map(pool => {
      const teamIds = pool.participants.map(p => {
        const id = p.id;
        if (!id || id.trim() === '') {
          throw new Error(`Pool "${pool.poolName}" contains participant with missing/empty ID`);
        }
        return id;
      });
      return {
        poolName: pool.poolName,
        teamIds,
      };
    });

    // Validate we have at least one pool with teams
    if (poolAssignmentsToSave.length === 0) {
      throw new Error('No pools generated - cannot save empty poolAssignments');
    }
    const totalTeams = poolAssignmentsToSave.reduce((sum, pa) => sum + pa.teamIds.length, 0);
    if (totalTeams === 0) {
      throw new Error('All pools are empty - cannot save poolAssignments with no teams');
    }

    console.log(`[generatePoolPlaySchedule] Saving ${poolAssignmentsToSave.length} pools with ${totalTeams} total teams`);

    // ============================================
    // STEP 7: Update division with success status + poolAssignments
    // ============================================
    await updateDoc(divisionRef, {
      scheduleStatus: 'generated',
      scheduleVersion: currentVersion + 1,
      scheduleGeneratedAt: now,
      scheduleGeneratedBy: userId || null,
      poolAssignments: poolAssignmentsToSave,
      updatedAt: now,
    });

    console.log(`[generatePoolPlaySchedule] Successfully generated ${matchIds.length} matches (version ${currentVersion + 1})`);

    return { matchIds, poolCount: poolResult.pools.length };

  } catch (error) {
    // ============================================
    // CLEANUP: Reset status on failure
    // ============================================
    console.error('[generatePoolPlaySchedule] Generation failed, resetting lock:', error);
    try {
      await updateDoc(divisionRef, {
        scheduleStatus: 'idle',
        updatedAt: Date.now(),
      });
    } catch (resetError) {
      console.error('[generatePoolPlaySchedule] Failed to reset lock:', resetError);
    }
    throw error;
  }
};

/**
 * Helper function to generate pool matches from manually assigned pools.
 * Uses the same round robin logic as the main generator.
 *
 * V06.21 Changes:
 * - Removed name-based identity check (only use team.id)
 * - Added poolKey (normalized) to each match
 * - Added divisionId parameter for canonical ID generation
 */
function generatePoolMatchesFromPools(
  pools: Pool[],
  config: {
    eventType: 'tournament' | 'league' | 'meetup';
    eventId: string;
    gameSettings: GameSettings;
    formatSettings: PoolPlayMedalsSettings;
  },
  divisionId?: string
): { pools: Pool[]; poolMatches: Omit<Match, 'id' | 'createdAt' | 'updatedAt'>[] } {
  const { eventType, eventId, gameSettings } = config;
  const allPoolMatches: Omit<Match, 'id' | 'createdAt' | 'updatedAt'>[] = [];
  let globalMatchNumber = 1;

  for (const pool of pools) {
    // Normalize pool name to poolKey for consistent validation/queries
    const poolKey = normalizePoolKey(pool.poolName);

    // Generate round robin matches within each pool
    const n = pool.participants.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const pA = pool.participants[i];
        const pB = pool.participants[j];

        // CRITICAL: Validate teams are different by ID ONLY (not by name)
        // Two teams with the same name but different IDs are valid opponents
        if (pA.id === pB.id) {
          console.error(`[Pool Matches] Skipping invalid pairing: same team ID: ${pA.id}`);
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
          poolGroup: pool.poolName, // Display name
          poolKey,                   // Normalized key for queries/validation
          divisionId,               // For canonical ID generation
          status: 'scheduled',
          scores: [],
        };

        allPoolMatches.push(match);
      }
    }
  }

  return { pools, poolMatches: allPoolMatches };
}

// ============================================
// BRACKET LOCK TIMEOUT (for crash safety)
// ============================================

const BRACKET_LOCK_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

// ============================================
// BRACKET ID MAPPING HELPERS (V06.21)
// ============================================

interface BracketMatchData {
  matchId?: string;  // Temp ID from generator
  bracketPosition: number;
  isThirdPlace?: boolean;
  nextMatchId?: string;  // Temp ID reference
}

/**
 * Build maps for temp→position and position→canonical.
 * Single pass each, O(n) total.
 *
 * @param bracket - Array of bracket matches from generator
 * @param divisionId - Division ID for canonical ID generation
 * @param bracketType - Type of bracket ('main' or 'plate')
 * @returns Maps for converting temp IDs to canonical IDs
 */
function buildBracketIdMaps(
  bracket: BracketMatchData[],
  divisionId: string,
  bracketType: 'main' | 'plate'
): {
  tempToPosition: Map<string, number>;
  positionToCanonical: Map<number, string>;
} {
  const tempToPosition = new Map<string, number>();
  const positionToCanonical = new Map<number, string>();

  for (const m of bracket) {
    // Map temp ID to position
    if (m.matchId) {
      tempToPosition.set(m.matchId, m.bracketPosition);
    }

    // Generate canonical ID for this position
    const canonicalId = m.isThirdPlace
      ? `${divisionId}__bracket__${bracketType}__bronze`
      : generateBracketMatchId(divisionId, bracketType, m.bracketPosition);
    positionToCanonical.set(m.bracketPosition, canonicalId);
  }

  return { tempToPosition, positionToCanonical };
}

/**
 * Convert a temp nextMatchId to canonical using the ID maps.
 *
 * @param tempNextMatchId - The temp ID reference (or undefined)
 * @param tempToPosition - Map from temp ID to bracket position
 * @param positionToCanonical - Map from position to canonical ID
 * @returns The canonical nextMatchId (or undefined)
 */
function mapNextMatchIdToCanonical(
  tempNextMatchId: string | undefined,
  tempToPosition: Map<string, number>,
  positionToCanonical: Map<number, string>
): string | undefined {
  if (!tempNextMatchId) return undefined;

  const nextPosition = tempToPosition.get(tempNextMatchId);
  if (nextPosition === undefined) {
    console.warn(`[mapNextMatchIdToCanonical] Unknown temp ID: ${tempNextMatchId}`);
    return undefined;
  }

  return positionToCanonical.get(nextPosition);
}

/**
 * Generate finals bracket from completed pool standings.
 *
 * Called when all pool matches are complete to create the medal bracket.
 *
 * V06.21 Changes:
 * - Transaction lock to prevent race conditions
 * - Fail-closed check if bracket already exists
 * - Success tracking for proper lock release
 *
 * @param tournamentId - Tournament ID
 * @param divisionId - Division ID
 * @param poolMatches - Completed pool matches
 * @param teams - All division teams
 * @param settings - Pool play settings with advancement rules
 * @param userId - Optional user ID for audit trail
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
  },
  userId?: string
): Promise<{ mainBracketIds: string[]; plateBracketIds: string[] }> => {
  const divisionRef = doc(db, 'tournaments', tournamentId, 'divisions', divisionId);
  const matchesRef = collection(db, 'tournaments', tournamentId, 'matches');

  // ============================================
  // STEP 1: Acquire lock atomically
  // ============================================
  await runTransaction(db, async (transaction) => {
    const divisionSnap = await transaction.get(divisionRef);
    const division = divisionSnap.data() as Division | undefined;

    // Check for active lock (with timeout for crash recovery)
    if (division?.bracketStatus === 'generating') {
      const lockAge = Date.now() - (division.bracketGeneratedAt ?? 0);
      if (lockAge < BRACKET_LOCK_TIMEOUT_MS) {
        throw new Error('Bracket generation already in progress. Please wait.');
      }
      // Lock is stale (browser crashed) - allow takeover
      console.warn(`[generateFinalsFromPoolStandings] Stale lock detected (${lockAge}ms old), taking over`);
    }

    // Set lock atomically
    transaction.update(divisionRef, {
      bracketStatus: 'generating',
      bracketGeneratedAt: Date.now(),
    });
  });

  // Track success for proper lock release
  let success = false;

  try {
    // ============================================
    // STEP 2: Check for existing bracket (fail closed)
    // ============================================
    // MUST catch both legacy 'plate' stage and new 'bracket' stage
    const { getDocs, query, where } = await import('@firebase/firestore');
    const existingBracket = await getDocs(query(
      matchesRef,
      where('divisionId', '==', divisionId),
      where('stage', 'in', ['bracket', 'plate'])
    ));

    if (!existingBracket.empty) {
      throw new Error(
        `Bracket already exists for division ${divisionId} (${existingBracket.size} matches). ` +
        `Delete existing bracket first to regenerate.`
      );
    }

    // ============================================
    // STEP 3: Fetch division to get poolAssignments
    // ============================================
    const { getDoc } = await import('@firebase/firestore');
    const divisionSnap = await getDoc(divisionRef);
    const division = divisionSnap.data() as Division | undefined;
    const savedPoolAssignments = division?.poolAssignments;

    // ============================================
    // STEP 3a: Upfront validation logging
    // ============================================
    console.log('[generateFinalsFromPoolStandings] Starting validation:', {
      tournamentId,
      divisionId,
      hasPoolAssignments: !!savedPoolAssignments,
      poolAssignmentsCount: savedPoolAssignments?.length || 0,
      formatNumberOfPools: division?.format?.numberOfPools,
      totalPoolMatches: poolMatches.length,
    });

    // ============================================
    // STEP 3b: HARD GATE - Pool stage must be complete
    // ============================================
    const incompleteMatches = poolMatches.filter(m =>
      m.status !== 'completed' && m.status !== 'forfeit' && m.status !== 'bye'
    );
    if (incompleteMatches.length > 0) {
      console.error('[generateFinalsFromPoolStandings] Pool stage not complete:', {
        totalMatches: poolMatches.length,
        incompleteCount: incompleteMatches.length,
        incompleteStatuses: incompleteMatches.map(m => ({ id: m.id, status: m.status })),
      });
      throw new Error(
        `Pool stage not complete (${incompleteMatches.length} remaining). ` +
        `Complete all pool matches before generating the medal bracket.`
      );
    }

    // ============================================
    // STEP 3c: Validate pool consistency
    // ============================================
    const formatNumberOfPools = division?.format?.numberOfPools;
    if (savedPoolAssignments && formatNumberOfPools && formatNumberOfPools !== savedPoolAssignments.length) {
      console.warn('[generateFinalsFromPoolStandings] Pool count mismatch:', {
        formatNumberOfPools,
        poolAssignmentsLength: savedPoolAssignments.length,
        decision: 'Using poolAssignments as source of truth',
      });
      // Use poolAssignments as the source of truth (actual data > format config)
    }

    // ============================================
    // STEP 4: Group matches by pool
    // ============================================
    const poolGroups = new Map<string, Match[]>();
    for (const match of poolMatches) {
      if (!match.poolGroup) continue;
      const group = poolGroups.get(match.poolGroup) || [];
      group.push(match);
      poolGroups.set(match.poolGroup, group);
    }

    // ============================================
    // STEP 5: Build pools - prefer poolAssignments, fallback to match data
    // ============================================
    const pools: Pool[] = [];

    // Helper to get participant from team ID
    const getParticipantFromId = (id: string): PoolParticipant => {
      // Try to find in teams array
      const team = teams.find(t => (t.id || t.odTeamId) === id);
      if (team) {
        return {
          id: team.id || team.odTeamId || id,
          name: team.teamName || team.name || `Team ${id.slice(0, 4)}`,
          playerIds: team.players?.map(p => typeof p === 'string' ? p : p.odUserId || p.id || '') || team.playerIds || [],
          duprRating: team.seed,
        };
      }

      // Try to find info from match sides
      for (const match of poolMatches) {
        if (match.sideA?.id === id && match.sideA?.name) {
          return {
            id,
            name: match.sideA.name,
            playerIds: match.sideA.playerIds || [],
            duprRating: undefined,
          };
        }
        if (match.sideB?.id === id && match.sideB?.name) {
          return {
            id,
            name: match.sideB.name,
            playerIds: match.sideB.playerIds || [],
            duprRating: undefined,
          };
        }
      }

      // Last resort: use ID as name
      return {
        id,
        name: `Team ${id.slice(0, 6)}`,
        playerIds: [],
        duprRating: undefined,
      };
    };

    // Pool assignments are REQUIRED - no fallback to deriving from matches
    if (!savedPoolAssignments || savedPoolAssignments.length === 0) {
      console.error('[generateFinalsFromPoolStandings] poolAssignments is missing or empty');
      throw new Error('Pool assignments missing. Please regenerate the pool schedule.');
    }

    // Use saved pool assignments as the canonical source of truth
    console.log(`[generateFinalsFromPoolStandings] Using saved poolAssignments (${savedPoolAssignments.length} pools)`);

    for (let i = 0; i < savedPoolAssignments.length; i++) {
      const pa = savedPoolAssignments[i];
      const participants: PoolParticipant[] = pa.teamIds
        .filter(id => id) // Filter empty IDs
        .map(id => getParticipantFromId(id));

      pools.push({
        poolNumber: i + 1,
        poolName: pa.poolName,
        participants,
      });
    }

    // Log pool info for debugging
    console.log(`[generateFinalsFromPoolStandings] Built ${pools.length} pools:`);
    pools.forEach(p => console.log(`  ${p.poolName}: ${p.participants.length} participants`));

    // ============================================
    // STEP 6: Validate pools have participants
    // ============================================
    const totalParticipants = pools.reduce((sum, p) => sum + p.participants.length, 0);
    if (totalParticipants === 0) {
      throw new Error(
        'No participants found in pools. Check that pool assignments exist and team IDs match.'
      );
    }

    // ============================================
    // STEP 7: Calculate standings for each pool
    // ============================================
    // Note: Cast to any to bridge legacy Match type from types.ts with new Match from types/game/match
    const allPoolStandings: PoolStanding[][] = pools.map(pool =>
      calculatePoolStandings(pool, poolMatches as any, settings.tiebreakers)
    );

    // ============================================
    // STEP 8: Determine qualifiers
    // ============================================
    // Default to top_2 if advancementRule is missing
    const effectiveSettings = {
      ...settings,
      advancementRule: settings.advancementRule || 'top_2',
    };
    const updatedStandings = determineQualifiers(allPoolStandings, effectiveSettings);

    // ============================================
    // STEP 9: Get qualified participants for main bracket
    // ============================================
    const mainParticipants = getQualifiedParticipants(updatedStandings);

    // Safety check: ensure we have qualifiers
    if (mainParticipants.length === 0) {
      console.error('[generateFinalsFromPoolStandings] 0 qualifiers found!', {
        poolCount: pools.length,
        standingsPerPool: allPoolStandings.map(s => s.length),
        advancementRule: effectiveSettings.advancementRule,
      });
      throw new Error(
        `No qualified participants found. Check pool standings and advancement rules. ` +
        `(${pools.length} pools, advancementRule: ${effectiveSettings.advancementRule})`
      );
    }

    console.log(`[generateFinalsFromPoolStandings] ${mainParticipants.length} qualifiers for main bracket`);

    // ============================================
    // STEP 10: Generate main medal bracket
    // ============================================
    const gameCfg = settings.gameSettings || DEFAULT_GAME_SETTINGS;
    const medalBracket = generateMedalBracket({
      eventType: 'tournament',
      eventId: tournamentId,
      qualifiedParticipants: mainParticipants,
      gameSettings: gameCfg,
      formatSettings: settings,
    });

    // ============================================
    // STEP 9: Build canonical ID maps for main bracket
    // ============================================
    const batch = writeBatch(db);
    const mainBracketIds: string[] = [];
    const now = Date.now();

    // Build maps for temp→position and position→canonical (O(n) total)
    const { tempToPosition: mainTempToPosition, positionToCanonical: mainPosToCanonical } =
      buildBracketIdMaps(
        medalBracket.bracketMatches as BracketMatchData[],
        divisionId,
        'main'
      );

    // ============================================
    // STEP 9b: Save main bracket matches with canonical IDs
    // ============================================
    for (const matchData of medalBracket.bracketMatches) {
      // Get canonical ID for this match position
      const canonicalId = mainPosToCanonical.get(matchData.bracketPosition!)!;
      mainBracketIds.push(canonicalId);

      // Map nextMatchId from temp to canonical
      const canonicalNextMatchId = mapNextMatchIdToCanonical(
        matchData.nextMatchId,
        mainTempToPosition,
        mainPosToCanonical
      );

      // Use canonical ID for the document
      const matchRef = doc(db, 'tournaments', tournamentId, 'matches', canonicalId);

      const match: Match = {
        ...matchData,
        id: canonicalId,
        nextMatchId: canonicalNextMatchId,  // Now canonical, not temp
        tournamentId,
        divisionId,
        stage: 'bracket',
        bracketType: 'main',  // Standardized: always set bracketType
        createdAt: now,
        updatedAt: now,
      } as Match;

      batch.set(matchRef, match);  // Idempotent: overwrites if exists
    }

    // ============================================
    // STEP 10: Generate plate bracket if enabled
    // ============================================
    const plateBracketIds: string[] = [];
    if (settings.plateEnabled || settings.includePlate) {
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

        // Build canonical ID maps for plate bracket
        const { tempToPosition: plateTempToPosition, positionToCanonical: platePosToCanonical } =
          buildBracketIdMaps(
            plateBracket.plateMatches as BracketMatchData[],
            divisionId,
            'plate'
          );

        for (const matchData of plateBracket.plateMatches) {
          // Get canonical ID for this match position
          const canonicalId = platePosToCanonical.get(matchData.bracketPosition!)!;
          plateBracketIds.push(canonicalId);

          // Map nextMatchId from temp to canonical
          const canonicalNextMatchId = mapNextMatchIdToCanonical(
            matchData.nextMatchId,
            plateTempToPosition,
            platePosToCanonical
          );

          // Use canonical ID for the document
          const matchRef = doc(db, 'tournaments', tournamentId, 'matches', canonicalId);

          const match: Match = {
            ...matchData,
            id: canonicalId,
            nextMatchId: canonicalNextMatchId,  // Now canonical, not temp
            tournamentId,
            divisionId,
            stage: 'bracket',       // Standardized: use 'bracket' not 'plate'
            bracketType: 'plate',   // Distinguish via bracketType
            createdAt: now,
            updatedAt: now,
          } as Match;

          batch.set(matchRef, match);  // Idempotent: overwrites if exists
        }
      }
    }

    // ============================================
    // STEP 11: Commit batch and mark success
    // ============================================
    await batch.commit();
    success = true;  // Only set AFTER successful commit

    // ============================================
    // STEP 12: Update division with success status
    // ============================================
    await updateDoc(divisionRef, {
      bracketStatus: 'generated',
      bracketGeneratedAt: Date.now(),
      bracketGeneratedBy: userId || null,
    });

    console.log(`[generateFinalsFromPoolStandings] Successfully generated bracket: ${mainBracketIds.length} main + ${plateBracketIds.length} plate matches`);

    return { mainBracketIds, plateBracketIds };

  } finally {
    // ============================================
    // CLEANUP: Release lock (status depends on success)
    // ============================================
    if (!success) {
      try {
        await updateDoc(divisionRef, {
          bracketStatus: 'idle',
          bracketGeneratedAt: Date.now(),
        });
        console.log('[generateFinalsFromPoolStandings] Lock released after failure');
      } catch (unlockError) {
        console.error('[generateFinalsFromPoolStandings] Failed to release lock:', unlockError);
      }
    }
  }
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
 * Also clears poolAssignments on the division to allow fresh pool generation
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

  // Always clear poolAssignments to allow fresh pool generation
  const divisionRef = doc(db, 'tournaments', tournamentId, 'divisions', divisionId);

  if (divisionMatchesSnapshot.empty) {
    // Still clear poolAssignments even if no matches
    await updateDoc(divisionRef, {
      poolAssignments: null,
      updatedAt: Date.now(),
    });
    return 0;
  }

  // Filter for test data matches (check both field names)
  const testMatches = divisionMatchesSnapshot.docs.filter(docSnap => {
    const data = docSnap.data();
    return data.testData === true || data.isTestData === true;
  });

  if (testMatches.length === 0) {
    // Still clear poolAssignments even if no test matches
    await updateDoc(divisionRef, {
      poolAssignments: null,
      updatedAt: Date.now(),
    });
    return 0;
  }

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

  // Also clear poolAssignments on the division
  batch.update(divisionRef, {
    poolAssignments: null,
    updatedAt: now,
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
 * Delete all pool matches for a division
 * Used when organizer wants to regenerate schedule after editing pools
 *
 * @param tournamentId - Tournament ID
 * @param divisionId - Division ID
 * @returns Number of matches deleted
 */
export const deletePoolMatches = async (
  tournamentId: string,
  divisionId: string
): Promise<number> => {
  const { getDocs, query, where } = await import('@firebase/firestore');

  // Get all pool matches for the division
  const matchesRef = collection(db, 'tournaments', tournamentId, 'matches');
  const snapshot = await getDocs(query(matchesRef, where('divisionId', '==', divisionId)));

  if (snapshot.empty) return 0;

  let deletedCount = 0;
  const batch = writeBatch(db);
  const batchSize = 450; // Firestore batch limit is 500
  let batchCount = 0;

  for (const docSnap of snapshot.docs) {
    const match = docSnap.data() as Match;

    // Only delete pool matches (not bracket matches)
    const isPoolMatch =
      match.stage === 'pool' ||
      match.poolGroup ||
      (!match.stage && !match.bracketType); // Legacy matches without stage

    if (isPoolMatch) {
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

  console.log(`[deletePoolMatches] Deleted ${deletedCount} pool matches from division ${divisionId}`);
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
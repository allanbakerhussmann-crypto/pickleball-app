/**
 * Match Management and Schedule Generation
 *
 * FILE LOCATION: services/firebase/matches.ts
 * VERSION: V07.04 - DUPR-Compliant teamSnapshot
 *
 * Key changes in V07.04:
 * - Added teamSnapshot to pool matches (sideAPlayerIds, sideBPlayerIds, snapshotAt)
 * - Added teamSnapshot to bracket matches (populated empty, updated on advancement)
 * - completeMatchWithAdvancement now updates teamSnapshot when advancing to next match
 * - teamSnapshot used by Firestore rules to validate signer is on opposing team
 *
 * Key changes in V06.39:
 * - generateBracketFromSeeds() now creates bronze/3rd place match when configured
 * - Main bracket: bronzeMatch from poolPlayMedalsSettings
 * - Plate bracket: thirdPlaceMatch from BracketSeedsDoc
 * - Links semi-final losers to bronze match via loserNextMatchId
 *
 * Key changes in V06.36:
 * - simulatePoolCompletion now calls updatePoolResultsOnMatchComplete() after batch commit
 * - Fixes "Complete Pool A/B/C/D" and "Complete All Pools" buttons in Test Mode
 *
 * Key changes in V06.35:
 * - quickScoreMatch now calls updatePoolResultsOnMatchComplete() after scoring
 * - clearTestData() now deletes ALL poolResults/bracketSeeds (Fix F)
 *
 * Key changes in V06.33:
 * - Added generateBracketFromSeeds() to generate bracket matches from canonical bracketSeeds
 * - Updated clearTestData() to delete poolResults and bracketSeeds subcollections
 * - FIX A: No orphan BYEs - remaining seeds pair with each other
 * - FIX B: BYE auto-advance with overwrite protection
 * - FIX C: Uses canonical subcollections as source of truth
 *
 * Key changes in V06.31:
 * - simulatePoolCompletion now reads match.gameSettings (pointsPerGame/pointsToWin, winBy, bestOf, capAt)
 * - Generates correct number of games for bestOf 1/3/5 matches
 * - Uses proper GameScore structure with gameNumber
 * - Enforces winBy and capAt rules for valid scores
 * - quickScoreMatch updated to use gameNumber in scores
 *
 * Key changes in V06.29:
 * - Fixed completeMatchWithAdvancement to update sideA/sideB objects (not just legacy teamAId/teamBId)
 * - Added loser advancement for bronze/third-place matches via loserNextMatchId/loserNextMatchSlot
 * - Full side objects include { id, name, playerIds } for proper UI display
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
import type { Match, Division, DivisionFormat, Team, UserProfile, StandingsEntry, GameScore, PoolAssignment, BracketSeedsDoc } from '../../types';
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
import { updatePoolResultsOnMatchComplete } from './poolResults';
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
 * 2. If it's a bracket match with nextMatchId, advancing the winner to the next match
 * 3. If loserNextMatchId exists (bronze match), advancing the loser
 * 4. Handling bye matches (auto-advance if opponent is empty)
 *
 * V06.29 Changes:
 * - Fixed winner advancement to update sideA/sideB objects (not just legacy teamAId/teamBId)
 * - Added loser advancement for bronze/third-place matches
 * - Full side objects include { id, name, playerIds } for UI display
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
    scoreA: s.team1Score ?? s.teamAScore ?? s.scoreA ?? 0,
    scoreB: s.team2Score ?? s.teamBScore ?? s.scoreB ?? 0,
  }));

  // Get winner name for officialResult
  const sideAId = match.sideA?.id || match.teamAId || '';
  const sideBId = match.sideB?.id || match.teamBId || '';
  const isWinnerSideA = winnerId === sideAId;
  const winnerName = isWinnerSideA ? match.sideA?.name : match.sideB?.name;

  // V07.10: DUPR Compliance Guardrail
  // ALL match completions MUST write officialResult + scoreLocked in same batch
  // This ensures standings/brackets only count officially finalized matches
  const officialResult = {
    scores: scoresModern,
    winnerId,
    winnerName: winnerName || `Team ${winnerId.slice(0, 4)}`,
    finalisedByUserId: userId || 'system',
    finalisedAt: now,
    version: 1,
  };

  // Update current match with BOTH legacy and modern formats + officialResult
  batch.update(matchRef, {
    // DUPR-compliant official result (guardrail)
    officialResult,
    scoreState: 'official',
    scoreLocked: true,
    scoreLockedAt: now,
    scoreLockedByUserId: userId || 'system',
    // Standard completion fields
    status: 'completed',
    completedAt: now,
    winnerId: winnerId,
    winnerTeamId: winnerId,
    scores: scoresModern,
    // Legacy fields for backward compatibility
    scoreTeamAGames: scores.map(s => s.team1Score ?? s.teamAScore ?? s.scoreA ?? 0),
    scoreTeamBGames: scores.map(s => s.team2Score ?? s.teamBScore ?? s.scoreB ?? 0),
    endTime: now,
    lastUpdatedBy: userId || null,
    lastUpdatedAt: now,
  });

  // ============================================
  // Determine winner and loser side data
  // ============================================
  // Note: sideAId, sideBId, isWinnerSideA already declared above for officialResult
  const winnerSide = isWinnerSideA ? match.sideA : match.sideB;
  const loserSide = isWinnerSideA ? match.sideB : match.sideA;

  // Build full side objects for advancement (UI needs name and playerIds)
  const winnerData = winnerSide ? {
    id: winnerSide.id || winnerId,
    name: winnerSide.name || `Team ${(winnerSide.id || winnerId).slice(0, 4)}`,
    playerIds: winnerSide.playerIds || [],
    ...(winnerSide.duprRating !== undefined && { duprRating: winnerSide.duprRating }),
  } : {
    id: winnerId,
    name: `Team ${winnerId.slice(0, 4)}`,
    playerIds: [],
  };

  const loserId = isWinnerSideA ? sideBId : sideAId;
  const loserData = loserSide ? {
    id: loserSide.id || loserId,
    name: loserSide.name || `Team ${(loserSide.id || loserId).slice(0, 4)}`,
    playerIds: loserSide.playerIds || [],
    ...(loserSide.duprRating !== undefined && { duprRating: loserSide.duprRating }),
  } : {
    id: loserId,
    name: `Team ${loserId.slice(0, 4)}`,
    playerIds: [],
  };

  // ============================================
  // Advance WINNER to next match
  // ============================================
  if (match.nextMatchId && match.nextMatchSlot) {
    const nextMatchRef = doc(db, 'tournaments', tournamentId, 'matches', match.nextMatchId);

    // Determine which slot to update based on nextMatchSlot
    const isSideA = match.nextMatchSlot === 'teamA' || match.nextMatchSlot === 'sideA';

    if (isSideA) {
      // Update sideA (modern) + teamAId (legacy) + teamSnapshot (V07.04)
      batch.update(nextMatchRef, {
        sideA: winnerData,
        teamAId: winnerId,
        'teamSnapshot.sideAPlayerIds': winnerData.playerIds || [],
        'teamSnapshot.snapshotAt': now,
        lastUpdatedAt: now,
      });
    } else {
      // Update sideB (modern) + teamBId (legacy) + teamSnapshot (V07.04)
      batch.update(nextMatchRef, {
        sideB: winnerData,
        teamBId: winnerId,
        'teamSnapshot.sideBPlayerIds': winnerData.playerIds || [],
        'teamSnapshot.snapshotAt': now,
        lastUpdatedAt: now,
      });
    }
  }

  // ============================================
  // Advance LOSER to bronze/third-place match
  // ============================================
  const loserNextMatchId = (match as any).loserNextMatchId;
  const loserNextMatchSlot = (match as any).loserNextMatchSlot;

  if (loserNextMatchId && loserNextMatchSlot && loserId) {
    const loserMatchRef = doc(db, 'tournaments', tournamentId, 'matches', loserNextMatchId);

    // Determine which slot to update based on loserNextMatchSlot
    const isLoserSideA = loserNextMatchSlot === 'teamA' || loserNextMatchSlot === 'sideA';

    if (isLoserSideA) {
      // Update sideA (modern) + teamAId (legacy) + teamSnapshot (V07.04)
      batch.update(loserMatchRef, {
        sideA: loserData,
        teamAId: loserId,
        'teamSnapshot.sideAPlayerIds': loserData.playerIds || [],
        'teamSnapshot.snapshotAt': now,
        lastUpdatedAt: now,
      });
    } else {
      // Update sideB (modern) + teamBId (legacy) + teamSnapshot (V07.04)
      batch.update(loserMatchRef, {
        sideB: loserData,
        teamBId: loserId,
        'teamSnapshot.sideBPlayerIds': loserData.playerIds || [],
        'teamSnapshot.snapshotAt': now,
        lastUpdatedAt: now,
      });
    }
  }

  await batch.commit();

  // Update pool results if this is a pool match
  if (match.divisionId && match.poolGroup) {
    try {
      const completedMatch: Match = {
        ...match,
        status: 'completed',
        winnerId,
        scores: scoresModern,
        completedAt: now,
        updatedAt: now,
      };
      await updatePoolResultsOnMatchComplete(tournamentId, match.divisionId, completedMatch);
    } catch (err) {
      console.error('[completeMatchWithAdvancement] Failed to update pool results:', err);
      // Don't throw - match is already completed, pool update is secondary
    }
  }
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
        // V07.04: Team snapshot for score verification (signer must be on opposing team)
        teamSnapshot: {
          sideAPlayerIds: matchData.sideA?.playerIds || [],
          sideBPlayerIds: matchData.sideB?.playerIds || [],
          snapshotAt: now,
        },
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
    // Reconcile format.numberOfPools with actual pool count
    // ============================================
    const divisionSnap = await getDoc(divisionRef);
    const divisionData = divisionSnap.data() as Division | undefined;
    const currentFormat = divisionData?.format || {};

    await updateDoc(divisionRef, {
      scheduleStatus: 'generated',
      scheduleVersion: currentVersion + 1,
      scheduleGeneratedAt: now,
      scheduleGeneratedBy: userId || null,
      poolAssignments: poolAssignmentsToSave,
      format: {
        ...currentFormat,
        numberOfPools: poolAssignmentsToSave.length,  // Reconcile with actual pool count
      },
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
    // Log all available temp IDs for debugging and throw clear error
    const availableTempIds = Array.from(tempToPosition.keys());
    console.error(`[mapNextMatchIdToCanonical] Unknown temp ID: ${tempNextMatchId}`, {
      availableTempIds,
      tempToPositionSize: tempToPosition.size,
    });
    throw new Error(
      `Bracket generation failed: Unknown temp ID "${tempNextMatchId}". ` +
      `Available IDs: [${availableTempIds.join(', ')}]. ` +
      `This is a bug in bracket generation - please report it.`
    );
  }

  return positionToCanonical.get(nextPosition);
}

/**
 * Get game settings for a specific bracket round based on division format.
 *
 * Round numbering convention:
 * - roundNumber increases toward finals
 * - fromFinal = totalRounds - roundNumber gives:
 *   - 0 → Finals
 *   - 1 → Semi-Finals
 *   - 2 → Quarter-Finals
 *
 * @param roundNumber - The round number of the match
 * @param totalRounds - Total number of rounds in the bracket
 * @param isThirdPlace - Whether this is a bronze/3rd place match
 * @param divisionFormat - The division format containing medal round settings
 * @param defaultSettings - Fallback game settings (pool play settings)
 * @returns Game settings for this round
 */
function getGameSettingsForRound(
  roundNumber: number,
  totalRounds: number,
  isThirdPlace: boolean,
  divisionFormat: DivisionFormat | undefined,
  defaultSettings: GameSettings,
  bracketType: 'main' | 'plate' = 'main'  // V06.40: Support plate bracket settings
): GameSettings {
  // If not using separate medal settings or no format provided, use defaults
  if (!divisionFormat?.useSeparateMedalSettings) {
    return defaultSettings;
  }

  // Preserve playType from defaults (or use 'doubles' if not set)
  const playType = defaultSettings.playType || 'doubles';

  // V06.40: For plate bracket, use plateRoundSettings if available
  if (bracketType === 'plate') {
    const plateSettings = (divisionFormat as any)?.plateRoundSettings;
    if (plateSettings) {
      const fromFinal = totalRounds - roundNumber;

      // Plate Bronze/3rd place match
      if (isThirdPlace && plateSettings.plateBronze) {
        return {
          playType,
          bestOf: plateSettings.plateBronze.bestOf,
          pointsPerGame: plateSettings.plateBronze.pointsToWin,
          winBy: plateSettings.plateBronze.winBy,
        };
      }

      // Plate Finals
      if (fromFinal === 0 && plateSettings.plateFinals) {
        return {
          playType,
          bestOf: plateSettings.plateFinals.bestOf,
          pointsPerGame: plateSettings.plateFinals.pointsToWin,
          winBy: plateSettings.plateFinals.winBy,
        };
      }
    }
    // Fall through to default settings for plate bracket
    return defaultSettings;
  }

  // Main bracket - use medalRoundSettings
  if (!divisionFormat.medalRoundSettings) {
    return defaultSettings;
  }

  const settings = divisionFormat.medalRoundSettings;
  const fromFinal = totalRounds - roundNumber;

  // Bronze/3rd place match
  if (isThirdPlace) {
    if (settings.bronze) {
      return {
        playType,
        bestOf: settings.bronze.bestOf,
        pointsPerGame: settings.bronze.pointsToWin,
        winBy: settings.bronze.winBy,
      };
    }
    return defaultSettings;
  }

  // Determine round type based on fromFinal
  switch (fromFinal) {
    case 0: // Finals
      if (settings.finals) {
        return {
          playType,
          bestOf: settings.finals.bestOf,
          pointsPerGame: settings.finals.pointsToWin,
          winBy: settings.finals.winBy,
        };
      }
      break;
    case 1: // Semi-Finals
      if (settings.semiFinals) {
        return {
          playType,
          bestOf: settings.semiFinals.bestOf,
          pointsPerGame: settings.semiFinals.pointsToWin,
          winBy: settings.semiFinals.winBy,
        };
      }
      break;
    case 2: // Quarter-Finals
      if (settings.quarterFinals) {
        return {
          playType,
          bestOf: settings.quarterFinals.bestOf,
          pointsPerGame: settings.quarterFinals.pointsToWin,
          winBy: settings.quarterFinals.winBy,
        };
      }
      break;
    default:
      // R16, R32, etc. - use pool defaults
      break;
  }

  // Fallback to default settings
  return defaultSettings;
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
    // V06.30: Calculate qualifiersPerPool from advancement rule for cross-pool seeding
    // ============================================
    let qualifiersPerPool = 2;  // default
    switch (effectiveSettings.advancementRule) {
      case 'top_1': qualifiersPerPool = 1; break;
      case 'top_2': qualifiersPerPool = 2; break;
      case 'top_n_plus_best': qualifiersPerPool = 1; break;
    }
    const mainParticipants = getQualifiedParticipants(updatedStandings, qualifiersPerPool);

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
    console.log('[generateFinalsFromPoolStandings] Calling generateMedalBracket...');
    const medalBracket = generateMedalBracket({
      eventType: 'tournament',
      eventId: tournamentId,
      qualifiedParticipants: mainParticipants,
      gameSettings: gameCfg,
      formatSettings: settings,
    });
    console.log('[generateFinalsFromPoolStandings] Medal bracket generated:', {
      bracketMatchCount: medalBracket.bracketMatches.length,
      bracketSize: medalBracket.bracketSize,
      rounds: medalBracket.rounds,
      matchIds: medalBracket.bracketMatches.map(m => (m as any).matchId),
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
    console.log('[generateFinalsFromPoolStandings] ID maps built:', {
      tempToPositionKeys: Array.from(mainTempToPosition.keys()),
      positionToCanonicalSize: mainPosToCanonical.size,
    });

    // ============================================
    // STEP 9b: Save main bracket matches with canonical IDs
    // ============================================
    const totalRounds = medalBracket.rounds;
    const divisionFormat = division?.format;

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

      // V06.22: Map loserNextMatchId from temp to canonical (for bronze match advancement)
      const canonicalLoserNextMatchId = mapNextMatchIdToCanonical(
        (matchData as any).loserNextMatchId,
        mainTempToPosition,
        mainPosToCanonical
      );

      // Use canonical ID for the document
      const matchRef = doc(db, 'tournaments', tournamentId, 'matches', canonicalId);

      // Destructure to remove temp matchId field, then build clean object
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { matchId: _tempId, ...matchDataWithoutTempId } = matchData as Record<string, unknown>;

      // Get per-round game settings based on round number and match type
      // Cast to access isThirdPlace which may be set by elimination generator
      const isThirdPlace = (matchData as unknown as { isThirdPlace?: boolean }).isThirdPlace || false;
      const roundGameSettings = getGameSettingsForRound(
        matchData.roundNumber || 1,
        totalRounds,
        isThirdPlace,
        divisionFormat,
        gameCfg
      );

      const match: Match = {
        ...matchDataWithoutTempId,
        id: canonicalId,
        nextMatchId: canonicalNextMatchId,  // Now canonical, not temp
        loserNextMatchId: canonicalLoserNextMatchId,  // V06.22: For bronze match advancement
        loserNextMatchSlot: (matchData as any).loserNextMatchSlot,  // V06.22
        tournamentId,
        divisionId,
        stage: 'bracket',
        bracketType: 'main',  // Standardized: always set bracketType
        gameSettings: roundGameSettings,  // Apply per-round settings
        createdAt: now,
        updatedAt: now,
      } as Match;

      // Remove any undefined values before saving (Firestore rejects undefined)
      const cleanMatch = Object.fromEntries(
        Object.entries(match).filter(([, v]) => v !== undefined)
      ) as Match;

      batch.set(matchRef, cleanMatch);  // Idempotent: overwrites if exists
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

        // Calculate total rounds for plate bracket
        // Cast to access isThirdPlace which may be set by elimination generator
        const plateTotalRounds = plateBracket.plateMatches.length > 0
          ? Math.max(...plateBracket.plateMatches.filter(m =>
              !(m as unknown as { isThirdPlace?: boolean }).isThirdPlace
            ).map(m => m.roundNumber || 1))
          : 1;

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

          // V06.29: Map loserNextMatchId from temp to canonical (for plate 3rd place match)
          const canonicalLoserNextMatchId = mapNextMatchIdToCanonical(
            (matchData as unknown as { loserNextMatchId?: string }).loserNextMatchId,
            plateTempToPosition,
            platePosToCanonical
          );

          // Use canonical ID for the document
          const matchRef = doc(db, 'tournaments', tournamentId, 'matches', canonicalId);

          // Destructure to remove temp matchId field, then build clean object
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { matchId: _tempId, ...plateMatchDataWithoutTempId } = matchData as Record<string, unknown>;

          // Get per-round game settings for plate bracket
          // V06.40: Plate bracket now uses plateRoundSettings if available
          const plateIsThirdPlace = (matchData as unknown as { isThirdPlace?: boolean }).isThirdPlace || false;
          const plateRoundGameSettings = getGameSettingsForRound(
            matchData.roundNumber || 1,
            plateTotalRounds,
            plateIsThirdPlace,
            divisionFormat,
            gameCfg,
            'plate'  // V06.40: Use plate bracket settings
          );

          // V06.29: Extract loserNextMatchSlot before spreading (gets overwritten by spread otherwise)
          const loserNextMatchSlot = (matchData as unknown as { loserNextMatchSlot?: 'sideA' | 'sideB' }).loserNextMatchSlot;

          const match: Match = {
            ...plateMatchDataWithoutTempId,
            id: canonicalId,
            nextMatchId: canonicalNextMatchId,  // Now canonical, not temp
            loserNextMatchId: canonicalLoserNextMatchId,  // V06.29: Canonical plate 3rd place ID
            loserNextMatchSlot: loserNextMatchSlot,       // V06.29: Which slot loser goes to
            tournamentId,
            divisionId,
            stage: 'bracket',       // Standardized: use 'bracket' not 'plate'
            bracketType: 'plate',   // Distinguish via bracketType
            gameSettings: plateRoundGameSettings,  // Apply per-round settings
            createdAt: now,
            updatedAt: now,
          } as Match;

          // Remove any undefined values before saving (Firestore rejects undefined)
          const cleanMatch = Object.fromEntries(
            Object.entries(match).filter(([, v]) => v !== undefined)
          ) as Match;

          batch.set(matchRef, cleanMatch);  // Idempotent: overwrites if exists
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
// V06.33 Results Table Architecture
// Generate bracket directly from canonical bracketSeeds subcollection
// ============================================

/**
 * Generate bracket matches from canonical bracketSeeds document.
 *
 * This function:
 * 1. Reads bracketSeeds from tournaments/{tId}/divisions/{dId}/bracketSeeds/{bracketType}
 * 2. Creates Round 1 matches directly from round1Pairs (NO placementBracket, NO reseeding)
 * 3. Creates later round matches and links them
 * 4. Auto-advances BYE winners to their next matches (FIX C: with overwrite protection)
 *
 * V06.33: Part of Results Table Architecture
 *
 * @param tournamentId - Tournament ID
 * @param divisionId - Division ID
 * @param bracketType - 'main' or 'plate'
 * @param gameSettings - Game settings for matches
 * @param testData - Whether this is test data (for cleanup)
 * @returns Array of created match IDs
 */
/**
 * Remove undefined values from an object for Firestore compatibility.
 * Firestore rejects undefined values - must be null or omitted.
 */
function sanitizeForFirestore<T extends object>(obj: T): T {
  const result = {} as T;
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      (result as any)[key] = value;
    }
  }
  return result;
}

export const generateBracketFromSeeds = async (
  tournamentId: string,
  divisionId: string,
  bracketType: 'main' | 'plate',
  defaultGameSettings: GameSettings,
  testData: boolean = false,
  divisionFormat?: DivisionFormat  // V06.36: Pass division format for medal round settings
): Promise<string[]> => {
  // Read bracketSeeds from subcollection
  const seedsRef = doc(
    db,
    'tournaments',
    tournamentId,
    'divisions',
    divisionId,
    'bracketSeeds',
    bracketType
  );

  const seedsSnap = await getDoc(seedsRef);
  if (!seedsSnap.exists()) {
    throw new Error(`No bracketSeeds found for ${bracketType}. Run buildBracketSeeds() first.`);
  }
  const seeds = seedsSnap.data() as BracketSeedsDoc;

  const matchesCollection = collection(db, 'tournaments', tournamentId, 'matches');
  const matchIds: string[] = [];
  const round1MatchRefs: Map<number, { ref: ReturnType<typeof doc>; id: string }> = new Map();
  const now = Date.now();

  // Track BYE matches for auto-advance after all matches are created
  const byeMatches: {
    matchId: string;
    winner: BracketSeedsDoc['slots'][string];
  }[] = [];

  console.log(`[generateBracketFromSeeds] Creating ${seeds.round1MatchCount} R1 matches for ${bracketType} bracket (totalRounds: ${seeds.rounds})`);

  // ============================================
  // Round 1: Create matches directly from round1Pairs
  // NO placementBracket(), NO DUPR reseeding
  // V06.36: Use per-round game settings from medalRoundSettings
  // ============================================
  for (const pair of seeds.round1Pairs) {
    const sideASlot = pair.sideA ? seeds.slots[pair.sideA] : null;
    const sideBSlot = pair.sideB ? seeds.slots[pair.sideB] : null;

    if (!sideASlot && !sideBSlot) {
      console.warn(`[generateBracketFromSeeds] Match ${pair.matchNum} has no participants, skipping`);
      continue;
    }

    // Generate canonical ID for this match position
    const canonicalId = generateBracketMatchId(divisionId, bracketType, pair.matchNum);
    const matchRef = doc(matchesCollection, canonicalId);
    round1MatchRefs.set(pair.matchNum, { ref: matchRef, id: canonicalId });
    matchIds.push(canonicalId);

    const isBye = !sideASlot || !sideBSlot;
    const byeWinner = isBye ? (sideASlot || sideBSlot) : null;

    // V06.36: Get game settings for this round (respects medalRoundSettings)
    // V06.40: Pass bracketType so plate bracket uses plateRoundSettings
    const roundGameSettings = getGameSettingsForRound(
      1, // roundNumber
      seeds.rounds, // totalRounds
      false, // isThirdPlace
      divisionFormat,
      defaultGameSettings,
      bracketType  // V06.40
    );

    const match: Partial<Match> = {
      id: canonicalId,
      eventType: 'tournament',
      eventId: tournamentId,
      tournamentId,
      divisionId,
      format: 'pool_play_medals',
      gameSettings: roundGameSettings,
      stage: 'bracket',
      bracketType,
      roundNumber: 1,
      matchNumber: pair.matchNum,
      bracketPosition: pair.matchNum,
      sideA: sideASlot
        ? {
            id: sideASlot.teamId,
            name: sideASlot.name,
            playerIds: [],
            poolKey: sideASlot.poolKey,
            poolRank: sideASlot.rank,
          }
        : {
            id: 'BYE',
            name: 'BYE',
            playerIds: [],
          },
      sideB: sideBSlot
        ? {
            id: sideBSlot.teamId,
            name: sideBSlot.name,
            playerIds: [],
            poolKey: sideBSlot.poolKey,
            poolRank: sideBSlot.rank,
          }
        : {
            id: 'BYE',
            name: 'BYE',
            playerIds: [],
          },
      // BYE matches are immediately 'completed' with winner set
      status: isBye ? 'completed' : 'scheduled',
      scores: [],
      testData,
      createdAt: now,
      updatedAt: now,
      // V07.04: Team snapshot for score verification
      // Note: playerIds empty here, populated when teams are looked up or on advancement
      teamSnapshot: {
        sideAPlayerIds: [],
        sideBPlayerIds: [],
        snapshotAt: now,
      },
    };

    // Only add winnerId/winnerTeamId/completedAt for BYE matches
    // Firestore rejects undefined values
    if (isBye && byeWinner) {
      (match as any).winnerId = byeWinner.teamId;
      (match as any).winnerTeamId = byeWinner.teamId;
      (match as any).completedAt = now;
    }

    await setDoc(matchRef, sanitizeForFirestore(match));

    // Track BYE matches for auto-advance
    if (isBye && byeWinner) {
      byeMatches.push({ matchId: canonicalId, winner: byeWinner });
    }

    console.log(
      `[generateBracketFromSeeds] R1 M${pair.matchNum}: ${sideASlot?.name || 'BYE'} vs ${sideBSlot?.name || 'BYE'}${isBye ? ' (BYE → ' + byeWinner?.name + ')' : ''}`
    );
  }

  // ============================================
  // Later rounds: Create matches and link winners
  // Use seeds.rounds (from bracketSeeds doc)
  // ============================================
  let prevRoundRefs = round1MatchRefs;
  let prevRoundMatchCount = seeds.round1MatchCount;
  let cumulativeMatchCount = seeds.round1MatchCount; // V06.36 FIX: Track total matches for bracketPosition

  for (let round = 2; round <= seeds.rounds; round++) {
    const thisRoundMatchCount = prevRoundMatchCount / 2;
    const thisRoundRefs: Map<number, { ref: ReturnType<typeof doc>; id: string }> = new Map();

    // V06.36: Get game settings for this round (respects medalRoundSettings)
    // V06.40: Pass bracketType so plate bracket uses plateRoundSettings
    const roundGameSettings = getGameSettingsForRound(
      round,
      seeds.rounds,
      false, // isThirdPlace - main bracket matches
      divisionFormat,
      defaultGameSettings,
      bracketType  // V06.40
    );

    console.log(`[generateBracketFromSeeds] Round ${round} settings:`, {
      bestOf: roundGameSettings.bestOf,
      pointsPerGame: roundGameSettings.pointsPerGame,
      winBy: roundGameSettings.winBy,
    });

    for (let i = 0; i < thisRoundMatchCount; i++) {
      const matchNum = i + 1;
      const bracketPosition = cumulativeMatchCount + i + 1; // V06.36 FIX: Use cumulative count

      // Generate canonical ID for this match position
      const canonicalId = generateBracketMatchId(divisionId, bracketType, bracketPosition);
      const matchRef = doc(matchesCollection, canonicalId);
      thisRoundRefs.set(matchNum, { ref: matchRef, id: canonicalId });
      matchIds.push(canonicalId);

      const match: Partial<Match> = {
        id: canonicalId,
        eventType: 'tournament',
        eventId: tournamentId,
        tournamentId,
        divisionId,
        format: 'pool_play_medals',
        gameSettings: roundGameSettings,
        stage: 'bracket',
        bracketType,
        roundNumber: round,
        matchNumber: matchNum,
        bracketPosition,
        sideA: { id: 'TBD', name: 'TBD', playerIds: [] },
        sideB: { id: 'TBD', name: 'TBD', playerIds: [] },
        status: 'scheduled',
        scores: [],
        testData,
        createdAt: now,
        updatedAt: now,
        // V07.04: Team snapshot - empty for TBD matches, populated on advancement
        teamSnapshot: {
          sideAPlayerIds: [],
          sideBPlayerIds: [],
          snapshotAt: now,
        },
      };

      await setDoc(matchRef, sanitizeForFirestore(match));

      // Link previous round matches to this one
      const prevMatch1Num = i * 2 + 1;
      const prevMatch2Num = i * 2 + 2;
      const prevMatch1 = prevRoundRefs.get(prevMatch1Num);
      const prevMatch2 = prevRoundRefs.get(prevMatch2Num);

      if (prevMatch1) {
        await updateDoc(prevMatch1.ref, {
          nextMatchId: canonicalId,
          nextMatchSlot: 'sideA',
        });
      }
      if (prevMatch2) {
        await updateDoc(prevMatch2.ref, {
          nextMatchId: canonicalId,
          nextMatchSlot: 'sideB',
        });
      }
    }

    cumulativeMatchCount += thisRoundMatchCount; // V06.36 FIX: Update cumulative AFTER this round's loop
    prevRoundRefs = thisRoundRefs;
    prevRoundMatchCount = thisRoundMatchCount;
  }

  // ============================================
  // V06.39: Create bronze/3rd place match if configured
  // Main bracket: controlled by poolPlayMedalsSettings.bronzeMatch === 'yes'
  // Plate bracket: controlled by seeds.thirdPlaceMatch
  // ============================================
  const poolSettings = (divisionFormat as any)?.poolPlayMedalsSettings || {};
  const shouldCreateBronze = (
    (bracketType === 'main' && poolSettings.bronzeMatch === 'yes' && seeds.rounds >= 2) ||
    (bracketType === 'plate' && seeds.thirdPlaceMatch && seeds.rounds >= 2)
  );

  if (shouldCreateBronze) {
    const bronzePosition = cumulativeMatchCount + 1;
    const bronzeId = generateBracketMatchId(divisionId, bracketType, bronzePosition);
    const bronzeRef = doc(matchesCollection, bronzeId);
    matchIds.push(bronzeId);

    // Get game settings for bronze match (use thirdPlace settings if available)
    // V06.40: Pass bracketType so plate bracket uses plateRoundSettings
    const bronzeGameSettings = getGameSettingsForRound(
      seeds.rounds,
      seeds.rounds,
      true,  // isThirdPlace
      divisionFormat,
      defaultGameSettings,
      bracketType  // V06.40: Pass bracket type for plate settings
    );

    const bronzeMatch: Partial<Match> = {
      id: bronzeId,
      eventType: 'tournament',
      eventId: tournamentId,
      tournamentId,
      divisionId,
      format: 'pool_play_medals',
      gameSettings: bronzeGameSettings,
      stage: 'bracket',
      bracketType,
      roundNumber: seeds.rounds,
      matchNumber: 2,  // Finals is match 1, bronze is match 2
      bracketPosition: bronzePosition,
      sideA: { id: 'TBD', name: 'TBD', playerIds: [] },
      sideB: { id: 'TBD', name: 'TBD', playerIds: [] },
      status: 'scheduled',
      scores: [],
      isThirdPlace: true,
      testData,
      createdAt: now,
      updatedAt: now,
      // V07.04: Team snapshot - empty for TBD matches, populated on advancement
      teamSnapshot: {
        sideAPlayerIds: [],
        sideBPlayerIds: [],
        snapshotAt: now,
      },
    };

    await setDoc(bronzeRef, sanitizeForFirestore(bronzeMatch));

    // Link semi-final losers to bronze match
    // Semi-finals are the two matches that feed into the final
    // For an 8-team bracket: R1 = 4 matches (1-4), R2 = 2 (5-6), R3 = 1 (7)
    // After all rounds, cumulativeMatchCount = 7
    // Final at position 7, semi-finals at positions 5 and 6
    // Semi-final positions = cumulativeMatchCount - 2 and cumulativeMatchCount - 1
    if (seeds.rounds >= 2) {
      for (let i = 0; i < 2; i++) {
        const sfPosition = cumulativeMatchCount - 2 + i; // e.g., 5 and 6 for 8-team
        const sfId = generateBracketMatchId(divisionId, bracketType, sfPosition);
        const sfRef = doc(matchesCollection, sfId);

        await updateDoc(sfRef, {
          loserNextMatchId: bronzeId,
          loserNextMatchSlot: i === 0 ? 'sideA' : 'sideB',
        });

        console.log(`[generateBracketFromSeeds] Linked SF at pos ${sfPosition} loser -> bronze match`);
      }
    }

    console.log(`[generateBracketFromSeeds] Created ${bracketType} bronze/3rd-place match: ${bronzeId}`);
  }

  // ============================================
  // FIX C: AUTO-ADVANCE BYE winners into their next matches
  // This happens AFTER all matches are created and linked
  // OVERWRITE PROTECTION: Only update if slot is still TBD
  // ============================================
  for (const { matchId, winner } of byeMatches) {
    const matchRef = doc(matchesCollection, matchId);
    const matchSnap = await getDoc(matchRef);
    const matchData = matchSnap.data();

    if (matchData?.nextMatchId && matchData?.nextMatchSlot) {
      const nextMatchRef = doc(matchesCollection, matchData.nextMatchId);
      const nextMatchSnap = await getDoc(nextMatchRef);
      const nextMatchData = nextMatchSnap.data();

      // OVERWRITE PROTECTION: Only update if slot is still TBD
      const currentSlot = nextMatchData?.[matchData.nextMatchSlot];
      if (currentSlot?.id === 'TBD') {
        await updateDoc(nextMatchRef, {
          [matchData.nextMatchSlot]: {
            id: winner.teamId,
            name: winner.name,
            playerIds: [],
            poolKey: winner.poolKey,
            poolRank: winner.rank,
          },
          updatedAt: now,
        });
        console.log(
          `[generateBracketFromSeeds] Auto-advanced ${winner.name} to ${matchData.nextMatchSlot}`
        );
      } else {
        console.warn(
          `[generateBracketFromSeeds] Skipped auto-advance: ${matchData.nextMatchSlot} already has ${currentSlot?.name}`
        );
      }
    }
  }

  console.log(
    `[generateBracketFromSeeds] Created ${matchIds.length} bracket matches (${byeMatches.length} BYE auto-advances)`
  );
  return matchIds;
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
// Test Mode Functions (V06.35)
// ============================================

/**
 * Clear all test data from matches in a division
 *
 * V06.35 Changes (Fix F):
 * - DELETE ALL poolResults and bracketSeeds documents (not just testData=true)
 * - These are derived data that can always be regenerated from matches
 * - Fixes bug where poolResults created with testData=false weren't deleted
 *
 * V06.33 Changes:
 * - Also DELETE poolResults and bracketSeeds subcollections
 * - These are derived data and should be deleted, not reset
 *
 * Previous behavior (still applies):
 * - Resets test-flagged matches back to scheduled status
 * - Clears poolAssignments on the division to allow fresh pool generation
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
  const { getDocs, query, where, deleteDoc } = await import('@firebase/firestore');

  // Query for matches with testData: true (legacy) OR isTestData: true (new format)
  const divisionMatchesSnapshot = await getDocs(
    query(matchesRef, where('divisionId', '==', divisionId))
  );

  // Always clear poolAssignments to allow fresh pool generation
  const divisionRef = doc(db, 'tournaments', tournamentId, 'divisions', divisionId);

  const batch = writeBatch(db);
  const now = Date.now();

  // ============================================
  // FIX F: DELETE ALL poolResults (not just testData=true)
  // These are derived data, always regenerated from matches
  // ============================================
  const poolResultsRef = collection(
    db,
    'tournaments',
    tournamentId,
    'divisions',
    divisionId,
    'poolResults'
  );
  const poolResultsSnap = await getDocs(poolResultsRef);  // NO WHERE CLAUSE
  poolResultsSnap.docs.forEach(docSnap => {
    batch.delete(docSnap.ref);
  });
  if (poolResultsSnap.size > 0) {
    console.log(`[clearTestData] Deleting ALL ${poolResultsSnap.size} poolResults documents`);
  }

  // ============================================
  // FIX F: DELETE ALL bracketSeeds (not just testData=true)
  // These are derived data, always regenerated from poolResults
  // ============================================
  const bracketSeedsRef = collection(
    db,
    'tournaments',
    tournamentId,
    'divisions',
    divisionId,
    'bracketSeeds'
  );
  const bracketSeedsSnap = await getDocs(bracketSeedsRef);  // NO WHERE CLAUSE
  bracketSeedsSnap.docs.forEach(docSnap => {
    batch.delete(docSnap.ref);
  });
  if (bracketSeedsSnap.size > 0) {
    console.log(`[clearTestData] Deleting ALL ${bracketSeedsSnap.size} bracketSeeds documents`);
  }

  if (divisionMatchesSnapshot.empty) {
    // Still clear poolAssignments even if no matches
    batch.update(divisionRef, {
      poolAssignments: null,
      updatedAt: now,
    });
    await batch.commit();
    return 0;
  }

  // Filter for test data matches (check both field names)
  const testMatches = divisionMatchesSnapshot.docs.filter(docSnap => {
    const data = docSnap.data();
    return data.testData === true || data.isTestData === true;
  });

  if (testMatches.length === 0) {
    // Still clear poolAssignments even if no test matches
    batch.update(divisionRef, {
      poolAssignments: null,
      updatedAt: now,
    });
    await batch.commit();
    return 0;
  }

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
  console.log(`[clearTestData] Reset ${testMatches.length} test matches`);
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
 *
 * V06.35: Now calls updatePoolResultsOnMatchComplete() after scoring
 * V06.31: Updated to use proper GameScore structure with gameNumber
 * V06.30: Fixed to use actual team IDs (sideA.id/sideB.id) for winnerId
 * instead of placeholder 'team1'/'team2' which corrupts standings calculations.
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

  // V06.30: Read match to get actual team IDs
  const matchSnap = await getDoc(matchRef);
  const match = matchSnap.data() as Match | undefined;
  const sideAId = match?.sideA?.id || match?.teamAId || '';
  const sideBId = match?.sideB?.id || match?.teamBId || '';

  // V06.30: Use actual team IDs, not placeholder 'team1'/'team2'
  const winnerId = scoreA > scoreB ? sideAId : scoreA < scoreB ? sideBId : null;

  // V06.31: Use proper GameScore structure with gameNumber
  const scores = [{
    gameNumber: 1,
    scoreA,
    scoreB,
  }];

  await updateDoc(matchRef, {
    scores,
    status: 'completed',
    winnerId,
    winnerTeamId: winnerId,  // V06.30: Also set winnerTeamId for legacy compatibility
    completedAt: now,
    updatedAt: now,
    ...(isTestMode && { testData: true }),
  });

  // V06.35: Update pool results if this is a pool match
  // DEBUG: Log match data to trace why pool results might not be created
  console.log('[quickScoreMatch] Match data for pool results:', {
    matchId,
    divisionId: match?.divisionId,
    poolGroup: match?.poolGroup,
    stage: match?.stage,
    hasDivisionId: !!match?.divisionId,
  });

  if (match?.divisionId) {
    const completedMatch: Match = {
      ...match,
      id: matchId,
      status: 'completed',
      winnerId: winnerId || undefined,
      scores,
      completedAt: now,
      updatedAt: now,
    } as Match;
    console.log('[quickScoreMatch] Calling updatePoolResultsOnMatchComplete...');
    await updatePoolResultsOnMatchComplete(tournamentId, match.divisionId, completedMatch);
  } else {
    console.warn('[quickScoreMatch] SKIPPING pool results - no divisionId on match');
  }
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

/**
 * Generate a valid single game score that respects game settings
 * V06.31: Helper for simulatePoolCompletion
 *
 * @param settings - Game settings (pointsPerGame/pointsToWin, winBy, capAt)
 * @param aWins - Whether side A wins this game
 * @returns Valid scoreA and scoreB
 */
function generateValidGameScore(
  settings: { pointsPerGame?: number; pointsToWin?: number; winBy?: number; capAt?: number },
  aWins: boolean
): { scoreA: number; scoreB: number } {
  // V06.31: Support both field names (pointsPerGame and pointsToWin)
  const pointsPerGame = settings.pointsPerGame ?? settings.pointsToWin ?? 11;
  const winBy = settings.winBy ?? 2;
  const capAt = settings.capAt;

  // Winner reaches target or goes to deuce
  let winScore = pointsPerGame;

  // 30% chance of deuce scenario (only meaningful with winBy: 2)
  if (winBy === 2 && Math.random() < 0.3) {
    // Deuce: add 2, 4, or 6 points beyond target
    const deuceExtra = (Math.floor(Math.random() * 3) + 1) * 2; // 2, 4, or 6
    winScore = pointsPerGame + deuceExtra;
    // Clamp to capAt if set
    if (capAt && winScore > capAt) {
      winScore = capAt;
    }
  }

  // Calculate loser score
  let loseScore: number;

  if (winScore > pointsPerGame) {
    // Deuce game: loser is exactly winBy behind (e.g., 13-11, 15-13)
    loseScore = winScore - winBy;
  } else {
    // Non-deuce game: loser randomly between 0 and (pointsPerGame - winBy)
    const maxLoser = pointsPerGame - winBy;
    loseScore = Math.floor(Math.random() * (maxLoser + 1));
  }

  // V06.31: After capAt clamp, ensure loser remains winScore - winBy in deuce
  if (capAt && winScore === capAt && loseScore > winScore - winBy) {
    loseScore = winScore - winBy;
  }

  // Ensure non-negative
  loseScore = Math.max(0, loseScore);

  return {
    scoreA: aWins ? winScore : loseScore,
    scoreB: aWins ? loseScore : winScore,
  };
}

/**
 * Simulate completing all matches in a pool with random scores
 *
 * V06.31: Now respects match.gameSettings (pointsPerGame/pointsToWin, winBy, bestOf, capAt)
 * - Reads game settings from each match
 * - Generates correct number of games for bestOf 1/3/5
 * - Uses proper GameScore structure with gameNumber
 * - Enforces winBy and capAt rules
 *
 * V06.30: Fixed to use actual team IDs (sideA.id/sideB.id) for winnerId
 */
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
    const match = docSnap.data();

    // V06.30: Get actual team IDs from match data
    const sideAId = match?.sideA?.id || match?.teamAId || '';
    const sideBId = match?.sideB?.id || match?.teamBId || '';

    // V06.31: Read game settings from match (support both field naming conventions)
    const gs = match.gameSettings || {};
    const pointsPerGame = gs.pointsPerGame ?? gs.pointsToWin ?? 11;
    const winBy = gs.winBy ?? 2;
    const bestOf = gs.bestOf ?? 1;
    const capAt = gs.capAt;

    const gamesNeeded = Math.ceil(bestOf / 2); // 1 for Bo1, 2 for Bo3, 3 for Bo5

    // Generate games until someone wins the match
    const scores: { gameNumber: number; scoreA: number; scoreB: number }[] = [];
    let gamesWonA = 0;
    let gamesWonB = 0;

    for (let gameNum = 1; gameNum <= bestOf; gameNum++) {
      // Randomly decide game winner (roughly 50/50)
      const aWinsThisGame = Math.random() > 0.5;

      const gameScore = generateValidGameScore(
        { pointsPerGame, winBy, capAt },
        aWinsThisGame
      );

      scores.push({
        gameNumber: gameNum,
        scoreA: gameScore.scoreA,
        scoreB: gameScore.scoreB,
      });

      // Track game wins
      if (gameScore.scoreA > gameScore.scoreB) {
        gamesWonA++;
      } else {
        gamesWonB++;
      }

      // Stop when someone wins the match
      if (gamesWonA >= gamesNeeded || gamesWonB >= gamesNeeded) {
        break;
      }
    }

    // V06.30/V06.31: Determine match winner based on games won, using actual team IDs
    const winnerId = gamesWonA >= gamesNeeded ? sideAId : sideBId;

    // V07.29: Get winner name from match data for officialResult
    const sideAName = match.sideA?.name || match.teamAName || 'Team A';
    const sideBName = match.sideB?.name || match.teamBName || 'Team B';
    const winnerName = winnerId === sideAId ? sideAName : sideBName;

    // V07.29: Create officialResult for standings calculation compatibility
    // Without this, matchCountsForStandings() returns false and standings show zeros
    const officialResult = {
      scores,
      winnerId,
      winnerName,
      finalisedByUserId: 'test-simulation',
      finalisedAt: now,
      version: 1,
    };

    batch.update(docSnap.ref, {
      scores,
      status: 'completed',
      winnerId,
      winnerTeamId: winnerId,  // Legacy compatibility
      winnerName,              // Add for consistency
      completedAt: now,
      updatedAt: now,
      testData: true,
      // V07.29: Add officialResult for standings calculation
      officialResult,
      scoreState: 'official',
      scoreLocked: true,
    });
  });

  await batch.commit();

  // V06.36: Update pool results for each affected pool
  // Collect unique pool names from the simulated matches
  const affectedPools = new Set<string>();
  snapshot.docs.forEach(docSnap => {
    const match = docSnap.data();
    if (match.poolGroup) {
      affectedPools.add(match.poolGroup);
    }
  });

  // Call updatePoolResultsOnMatchComplete for one match per pool
  // (the function recalculates the entire pool's standings)
  for (const pool of affectedPools) {
    const poolMatch = snapshot.docs.find(d => d.data().poolGroup === pool);
    if (poolMatch) {
      const matchData = poolMatch.data();
      // V07.29: Explicitly include poolKey and divisionId for robust pool results update
      const completedMatch: Match = {
        id: poolMatch.id,
        ...matchData,
        poolKey: matchData.poolKey,        // EXPLICIT: include poolKey
        poolGroup: matchData.poolGroup,    // Keep for backwards compat
        divisionId: divisionId,            // EXPLICIT: include divisionId
        status: 'completed',
        completedAt: now,
        updatedAt: now,
      } as Match;

      console.log(`[simulatePoolCompletion] Updating pool results for ${pool} (poolKey: ${matchData.poolKey})`);
      await updatePoolResultsOnMatchComplete(tournamentId, divisionId, completedMatch);
    }
  }

  console.log(`[simulatePoolCompletion] Completed ${snapshot.size} matches, updated ${affectedPools.size} pool results`);
  return snapshot.size;
};
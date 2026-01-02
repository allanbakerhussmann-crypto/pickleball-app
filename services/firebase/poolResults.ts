/**
 * Pool Results Service - V06.35
 *
 * Builds and persists canonical pool standings to Firestore subcollections.
 * These results are the SOURCE OF TRUTH for bracket generation.
 *
 * V06.35 Changes:
 * - Added updatePoolResultsOnMatchComplete() for real-time pool standings
 * - Pool results now update automatically when ANY pool match completes
 * - No longer need to wait for "Generate Medal Bracket" button
 *
 * Path: tournaments/{tId}/divisions/{dId}/poolResults/{poolKey}
 *
 * @file services/firebase/poolResults.ts
 */

import { db } from './config';
import { doc, setDoc, getDocs, getDoc, collection, query, where } from '@firebase/firestore';
import type { Match, PoolResultDoc, PoolResultRow } from '../../types';
import { calculatePoolStandings as calculateStandings } from '../formats/poolPlayMedals';
import type { Pool, PoolStanding } from '../formats/poolPlayMedals';
import type { PoolPlayMedalsSettings } from '../../types/formats';

/**
 * Group matches by their pool (poolGroup field)
 */
function groupMatchesByPool(matches: Match[]): Map<string, Match[]> {
  const groups = new Map<string, Match[]>();

  for (const match of matches) {
    const poolName = match.poolGroup;
    if (!poolName) continue;

    const existing = groups.get(poolName) || [];
    existing.push(match);
    groups.set(poolName, existing);
  }

  return groups;
}

/**
 * Convert pool name to key (lowercase, hyphenated)
 * "Pool A" -> "pool-a"
 */
function poolNameToKey(poolName: string): string {
  return poolName.toLowerCase().replace(/\s+/g, '-');
}

/**
 * Build and persist pool results to Firestore
 *
 * This function:
 * 1. Groups matches by pool
 * 2. Calculates standings for each pool using existing tiebreaker logic
 * 3. Writes PoolResultDoc to tournaments/{tId}/divisions/{dId}/poolResults/{poolKey}
 *
 * @param tournamentId - Tournament ID
 * @param divisionId - Division ID
 * @param poolMatches - All pool matches (completed or not)
 * @param pools - Pool definitions with participants
 * @param tiebreakers - Tiebreaker order from division settings
 * @param testData - Whether this is test data (for cleanup)
 */
export async function buildPoolResults(
  tournamentId: string,
  divisionId: string,
  poolMatches: Match[],
  pools: Pool[],
  tiebreakers: PoolPlayMedalsSettings['tiebreakers'],
  testData: boolean = false
): Promise<void> {
  // Group matches by pool
  const matchesByPool = groupMatchesByPool(poolMatches);

  console.log(`[buildPoolResults] Building results for ${pools.length} pools`);

  for (const pool of pools) {
    const poolKey = poolNameToKey(pool.poolName);
    const matches = matchesByPool.get(pool.poolName) || [];

    // Calculate standings using existing logic
    // Cast to any to bridge types.ts Match with types/game/match Match
    const standings = calculateStandings(pool, matches as any, tiebreakers);

    // Find max updatedAt for watermark
    const matchesUpdatedAtMax = matches.length > 0
      ? Math.max(...matches.map(m => m.updatedAt || m.completedAt || 0))
      : 0;

    // Build rows
    const rows: PoolResultRow[] = standings.map(s => ({
      rank: s.rank,
      teamId: s.participant.id,
      name: s.participant.name,
      wins: s.wins,
      losses: s.losses,
      pf: s.pointsFor,
      pa: s.pointsAgainst,
      diff: s.pointDifferential,
    }));

    const poolResult: PoolResultDoc = {
      poolKey,
      poolName: pool.poolName,
      divisionId,
      tournamentId,
      generatedAt: Date.now(),
      calculationVersion: 'v06.33',
      testData,
      matchesUpdatedAtMax,
      rows,
    };

    // Write to Firestore subcollection under division
    // CORRECT PATH: tournaments/{tId}/divisions/{dId}/poolResults/{poolKey}
    const docRef = doc(
      db,
      'tournaments',
      tournamentId,
      'divisions',
      divisionId,
      'poolResults',
      poolKey
    );

    await setDoc(docRef, poolResult);

    // Log standings for debugging
    console.log(
      `[buildPoolResults] ${pool.poolName}: ${rows.map(r => `${r.name} (${r.rank})`).join(', ')}`
    );
  }

  console.log(`[buildPoolResults] Wrote ${pools.length} pool results to Firestore`);
}

/**
 * Read all pool results for a division
 *
 * @param tournamentId - Tournament ID
 * @param divisionId - Division ID
 * @returns Array of PoolResultDoc sorted by pool name
 */
export async function getPoolResults(
  tournamentId: string,
  divisionId: string
): Promise<PoolResultDoc[]> {
  const poolResultsRef = collection(
    db,
    'tournaments',
    tournamentId,
    'divisions',
    divisionId,
    'poolResults'
  );

  const snapshot = await getDocs(poolResultsRef);
  const results = snapshot.docs.map(d => d.data() as PoolResultDoc);

  // Sort by pool name for consistent ordering
  results.sort((a, b) => a.poolName.localeCompare(b.poolName));

  return results;
}

/**
 * Convert PoolResultDoc rows back to PoolStanding format
 * for use with existing medal bracket generation code
 *
 * @param poolResult - Pool result document from Firestore
 * @returns Array of PoolStanding objects
 */
export function poolResultToStandings(poolResult: PoolResultDoc): PoolStanding[] {
  return poolResult.rows.map(row => ({
    participant: {
      id: row.teamId,
      name: row.name,
      playerIds: [] as string[],
    },
    rank: row.rank,
    wins: row.wins,
    losses: row.losses,
    pointsFor: row.pf,
    pointsAgainst: row.pa,
    pointDifferential: row.diff,
    gamesWon: 0,
    gamesLost: 0,
    matchesPlayed: row.wins + row.losses,
    poolNumber: parseInt(poolResult.poolName.replace('Pool ', '').charCodeAt(0) - 64 + '') || 1,
    poolName: poolResult.poolName,
    qualified: false,
    qualifiedAs: null as 'top' | 'best_remaining' | null,
  }));
}

// ============================================
// V06.35: Automatic Pool Results on Match Completion
// ============================================

/**
 * Update pool results when a pool match completes.
 *
 * This function is called automatically from match completion points
 * (submitMatchScore, confirmMatchScore, quickScoreMatch) to keep
 * pool standings up-to-date in real-time.
 *
 * V06.35: Automatic pool results - no need to wait for bracket generation
 *
 * @param tournamentId - Tournament ID
 * @param divisionId - Division ID
 * @param completedMatch - The match that just completed
 */
export async function updatePoolResultsOnMatchComplete(
  tournamentId: string,
  divisionId: string,
  completedMatch: Match
): Promise<void> {
  // DEBUG: Log entry point FIRST before any checks
  console.log('[updatePoolResultsOnMatchComplete] ENTRY:', {
    tournamentId,
    divisionId,
    matchId: completedMatch.id,
    poolGroup: completedMatch.poolGroup,
    stage: completedMatch.stage,
  });

  // Only process pool matches
  const poolName = completedMatch.poolGroup;
  const isPoolMatch = poolName || completedMatch.stage === 'pool' || completedMatch.stage === 'Pool Play';

  if (!isPoolMatch || !poolName) {
    // Not a pool match, skip
    console.log('[updatePoolResultsOnMatchComplete] SKIPPING - not a pool match:', {
      isPoolMatch,
      poolName,
      stage: completedMatch.stage,
    });
    return;
  }

  console.log(`[updatePoolResultsOnMatchComplete] Processing pool match completion: ${completedMatch.id} in ${poolName}`);

  try {
    // Fetch ALL matches for this pool (fresh from Firestore)
    const matchesRef = collection(db, 'tournaments', tournamentId, 'matches');
    const poolMatchesSnap = await getDocs(
      query(matchesRef, where('poolGroup', '==', poolName))
    );
    const poolMatches = poolMatchesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Match));

    // Get division to build Pool object and tiebreaker settings
    const divRef = doc(db, 'tournaments', tournamentId, 'divisions', divisionId);
    const divSnap = await getDoc(divRef);
    const division = divSnap.data();

    if (!division) {
      console.warn(`[updatePoolResultsOnMatchComplete] Division not found: ${divisionId}`);
      return;
    }

    // DEBUG: Log division data
    console.log('[updatePoolResultsOnMatchComplete] Division data:', {
      found: !!division,
      hasPoolAssignments: !!division.poolAssignments,
      poolAssignmentCount: division.poolAssignments?.length || 0,
      poolNames: division.poolAssignments?.map((pa: any) => pa.poolName) || [],
    });

    // Find this pool's assignment
    const poolAssignment = division.poolAssignments?.find(
      (pa: any) => pa.poolName === poolName
    );

    if (!poolAssignment) {
      console.warn(`[updatePoolResultsOnMatchComplete] Pool assignment not found for: ${poolName}. Available pools:`,
        division.poolAssignments?.map((pa: any) => pa.poolName) || 'none');
      return;
    }

    // Build Pool object for calculatePoolStandings
    const poolIndex = division.poolAssignments?.findIndex((pa: any) => pa.poolName === poolName) || 0;
    const pool: Pool = {
      poolNumber: poolIndex + 1,
      poolName,
      participants: poolAssignment.teamIds
        .filter((id: string) => id)
        .map((teamId: string) => {
          // Try to find team name from matches
          const matchWithTeam = poolMatches.find(
            m => m.sideA?.id === teamId || m.sideB?.id === teamId
          );
          const name = matchWithTeam?.sideA?.id === teamId
            ? matchWithTeam.sideA.name
            : matchWithTeam?.sideB?.id === teamId
              ? matchWithTeam.sideB.name
              : `Team ${teamId.slice(0, 4)}`;

          return {
            id: teamId,
            name: name || `Team ${teamId.slice(0, 4)}`,
            playerIds: [],
          };
        }),
    };

    // Get tiebreaker settings
    const tiebreakers: PoolPlayMedalsSettings['tiebreakers'] =
      division.format?.poolPlayMedalsSettings?.tiebreakers ||
      ['wins', 'head_to_head', 'point_diff', 'points_scored'];

    // Calculate standings for this pool
    const standings = calculateStandings(pool, poolMatches as any, tiebreakers);

    // Find max updatedAt for watermark
    const matchesUpdatedAtMax = poolMatches.length > 0
      ? Math.max(...poolMatches.map(m => m.updatedAt || m.completedAt || 0))
      : 0;

    // Build rows
    const rows: PoolResultRow[] = standings.map(s => ({
      rank: s.rank,
      teamId: s.participant.id,
      name: s.participant.name,
      wins: s.wins,
      losses: s.losses,
      pf: s.pointsFor,
      pa: s.pointsAgainst,
      diff: s.pointDifferential,
    }));

    const poolKey = poolNameToKey(poolName);
    const poolResult: PoolResultDoc = {
      poolKey,
      poolName,
      divisionId,
      tournamentId,
      generatedAt: Date.now(),
      calculationVersion: 'v06.35',
      testData: false,  // Real match data
      matchesUpdatedAtMax,
      rows,
    };

    // Write to Firestore
    const docRef = doc(
      db,
      'tournaments',
      tournamentId,
      'divisions',
      divisionId,
      'poolResults',
      poolKey
    );

    console.log('[updatePoolResultsOnMatchComplete] Writing to Firestore:', {
      path: `tournaments/${tournamentId}/divisions/${divisionId}/poolResults/${poolKey}`,
      rowCount: rows.length,
    });

    await setDoc(docRef, poolResult);

    const completedCount = poolMatches.filter(m => m.status === 'completed').length;
    console.log(
      `[updatePoolResultsOnMatchComplete] SUCCESS - Updated ${poolName}: ${completedCount}/${poolMatches.length} matches complete. ` +
      `Standings: ${rows.map(r => `${r.name} (${r.wins}W)`).join(', ')}`
    );
  } catch (err) {
    // Log error details - this helps debug issues
    console.error('[updatePoolResultsOnMatchComplete] Failed to update pool results:', err);
  }
}

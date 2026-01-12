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
import {
  calculatePoolStandings as calculatePoolStandingsShared,
  type TiebreakerKey,
} from '../standings/poolStandings';

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
// V07.30: Robust Pool Results on Match Completion
// Uses shared calculatePoolStandings from services/standings/poolStandings.ts
// This ensures UI and database use identical tiebreaker logic
// ============================================

/**
 * Update pool results when a pool match completes.
 *
 * V07.29 ROBUST VERSION:
 * - Uses poolKey as canonical identifier (not poolGroup)
 * - Queries by divisionId + poolKey + matchType to prevent contamination
 * - Uses lenient standings calculation (matches UI behavior)
 * - Throws errors instead of swallowing them
 * - Supports idempotency via matchesUpdatedAtMax check
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
  console.log('[updatePoolResultsOnMatchComplete] ENTRY:', {
    tournamentId,
    divisionId,
    matchId: completedMatch.id,
    poolKey: (completedMatch as any).poolKey,
    poolGroup: completedMatch.poolGroup,
    stage: completedMatch.stage,
    status: completedMatch.status,
  });

  // 1. Use poolKey as canonical (prefer poolKey, fallback to derived from poolGroup)
  const poolKey =
    (completedMatch as any).poolKey ||
    (completedMatch.poolGroup ? poolNameToKey(completedMatch.poolGroup) : null);

  if (!poolKey) {
    throw new Error(
      `[updatePoolResultsOnMatchComplete] Missing poolKey (and poolGroup) on match ${completedMatch.id}`
    );
  }

  // 2. Check if this is a pool match (be lenient)
  const isPoolMatch =
    (completedMatch as any).matchType === 'pool' ||
    completedMatch.stage === 'pool' ||
    completedMatch.stage === 'Pool Play' ||
    Boolean((completedMatch as any).poolKey) ||
    Boolean(completedMatch.poolGroup);

  if (!isPoolMatch) {
    console.log('[updatePoolResultsOnMatchComplete] SKIPPING - not a pool match:', {
      matchId: completedMatch.id,
      matchType: (completedMatch as any).matchType,
      stage: completedMatch.stage,
    });
    return;
  }

  try {
    // 3. Fetch division (tiebreakers + pool assignments)
    const divRef = doc(db, 'tournaments', tournamentId, 'divisions', divisionId);
    const divSnap = await getDoc(divRef);
    const division = divSnap.data();

    if (!division) {
      throw new Error(`[updatePoolResultsOnMatchComplete] Division not found: ${divisionId}`);
    }

    // 4. Find pool assignment - support poolKey OR derived from poolName
    const poolAssignment =
      division.poolAssignments?.find((pa: any) => pa.poolKey === poolKey) ||
      division.poolAssignments?.find((pa: any) => poolNameToKey(pa.poolName) === poolKey);

    if (!poolAssignment) {
      throw new Error(
        `[updatePoolResultsOnMatchComplete] Pool assignment not found for poolKey=${poolKey} (division=${divisionId}). ` +
        `Available pools: ${division.poolAssignments?.map((pa: any) => pa.poolName || pa.poolKey).join(', ') || 'none'}`
      );
    }

    // 5. Get poolName from poolAssignment (canonical source)
    const poolName = poolAssignment.poolName || completedMatch.poolGroup || `Pool ${poolKey}`;

    // 6. Query matches by divisionId + poolKey (try poolKey first, fallback to poolGroup)
    const matchesRef = collection(db, 'tournaments', tournamentId, 'matches');
    let poolMatchesSnap = await getDocs(
      query(
        matchesRef,
        where('divisionId', '==', divisionId),
        where('poolKey', '==', poolKey)
      )
    );

    // Fallback: if no matches found by poolKey, try poolGroup
    if (poolMatchesSnap.empty && poolName) {
      console.log(`[updatePoolResultsOnMatchComplete] No matches found by poolKey=${poolKey}, trying poolGroup=${poolName}`);
      poolMatchesSnap = await getDocs(
        query(
          matchesRef,
          where('divisionId', '==', divisionId),
          where('poolGroup', '==', poolName)
        )
      );
    }

    const poolMatches = poolMatchesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Match));

    console.log(`[updatePoolResultsOnMatchComplete] Found ${poolMatches.length} matches for pool ${poolName} (${poolKey})`);

    // 7. Compute matchesUpdatedAtMax for idempotency check
    const matchesUpdatedAtMax = poolMatches.reduce((max, m: any) => {
      const v = typeof m.updatedAt === 'number' ? m.updatedAt : 0;
      return Math.max(max, v);
    }, 0);

    // 8. Prepare docRef for idempotency check and final write
    const docRef = doc(
      db,
      'tournaments',
      tournamentId,
      'divisions',
      divisionId,
      'poolResults',
      poolKey
    );

    // 9. Idempotency: skip if nothing changed
    const existingDoc = await getDoc(docRef);
    if (existingDoc.exists()) {
      const existing = existingDoc.data();
      if (existing.matchesUpdatedAtMax >= matchesUpdatedAtMax) {
        console.log(
          `[updatePoolResultsOnMatchComplete] SKIP - no changes (existing=${existing.matchesUpdatedAtMax}, new=${matchesUpdatedAtMax})`
        );
        return;
      }
    }

    // 10. Build participants list from assignment
    const participants = (poolAssignment.teamIds || [])
      .filter((id: string) => id)
      .map((teamId: string) => {
        const matchWithTeam = poolMatches.find(
          m => m.sideA?.id === teamId || m.sideB?.id === teamId
        );
        const name =
          matchWithTeam?.sideA?.id === teamId
            ? matchWithTeam.sideA?.name
            : matchWithTeam?.sideB?.id === teamId
              ? matchWithTeam.sideB?.name
              : `Team ${teamId.slice(0, 4)}`;

        return { id: teamId, name: name || `Team ${teamId.slice(0, 4)}` };
      });

    // 11. Get tiebreaker settings (cast to TiebreakerKey[])
    const tiebreakers: TiebreakerKey[] =
      (division.format?.poolPlayMedalsSettings?.tiebreakers as TiebreakerKey[]) ||
      ['wins', 'head_to_head', 'point_diff', 'points_scored'];

    // 12. V07.30: Use shared standings calculation (matches UI behavior)
    // This uses proper multi-way H2H via mini-standings
    const standings = calculatePoolStandingsShared(participants, poolMatches, tiebreakers);

    // 13. Build rows (shared function already calculates rank and diff)
    const rows: PoolResultRow[] = standings.map((s) => ({
      rank: s.rank || 0,
      teamId: s.teamId,
      name: s.name,
      wins: s.wins,
      losses: s.losses,
      pf: s.pf,
      pa: s.pa,
      diff: s.diff,
    }));

    // 14. Count completed matches for debugging
    const completedMatchCount = poolMatches.filter(m => m.status === 'completed').length;

    const poolResult: PoolResultDoc = {
      poolKey,
      poolName,
      divisionId,
      tournamentId,
      generatedAt: Date.now(),
      calculationVersion: 'v07.30',
      testData: false,
      matchesUpdatedAtMax,
      rows,
    };

    // 15. Write with merge: true for safety
    console.log('[updatePoolResultsOnMatchComplete] Writing to Firestore:', {
      path: `tournaments/${tournamentId}/divisions/${divisionId}/poolResults/${poolKey}`,
      rowCount: rows.length,
      completedMatchCount,
      matchesUpdatedAtMax,
    });

    await setDoc(docRef, poolResult, { merge: true });

    console.log(
      `[updatePoolResultsOnMatchComplete] SUCCESS - Updated ${poolName} (${poolKey}): ${completedMatchCount}/${poolMatches.length} matches complete. ` +
      `Standings: ${rows.map(r => `${r.name} (${r.wins}W)`).join(', ')}`
    );
  } catch (err) {
    // Log and RE-THROW - don't swallow errors
    console.error('[updatePoolResultsOnMatchComplete] Failed:', err);
    throw err;
  }
}

/**
 * Safe wrapper for updatePoolResultsOnMatchComplete.
 *
 * V07.30: Use this wrapper in callers (matchService, useCourtManagement)
 * to ensure match scoring never fails due to pool results errors.
 * Pool results are secondary - match should always be scored successfully.
 *
 * @param tournamentId - Tournament ID
 * @param divisionId - Division ID
 * @param completedMatch - The match that just completed
 */
export async function updatePoolResultsOnMatchCompleteSafe(
  tournamentId: string,
  divisionId: string,
  completedMatch: Match
): Promise<void> {
  try {
    await updatePoolResultsOnMatchComplete(tournamentId, divisionId, completedMatch);
  } catch (err) {
    console.error('[updatePoolResultsOnMatchCompleteSafe] Pool results failed (non-fatal):', err);
    // Don't rethrow - match scoring should not fail due to pool results
  }
}

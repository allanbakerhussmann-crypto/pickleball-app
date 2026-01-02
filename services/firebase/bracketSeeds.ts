/**
 * Bracket Seeds Service - V06.39
 *
 * Builds and persists bracket seeding to Firestore subcollections.
 * These seeds are the SOURCE OF TRUTH for bracket generation.
 *
 * Path: tournaments/{tId}/divisions/{dId}/bracketSeeds/{bracketType}
 *
 * V06.39 Changes:
 * - Added buildPlateBracketSeeds() for consolation/plate bracket generation
 * - Plate bracket contains non-qualifying teams (rank > K)
 * - Supports plateThirdPlace for plate bracket 3rd place match
 *
 * THREE CRITICAL FIXES (V06.33):
 * Fix A: No orphan BYEs - remaining seeds count must be EVEN
 * Fix B: Remaining seeds pair with each other - no additional BYEs after byeRecipients
 * Fix C: BYE auto-advance happens in generateBracketFromSeeds() with overwrite protection
 *
 * @file services/firebase/bracketSeeds.ts
 */

import { db } from './config';
import { doc, setDoc, getDoc, getDocs, collection } from '@firebase/firestore';
import type { PoolResultDoc, BracketSeedsDoc, BracketSlot, Round1Pair } from '../../types';

/**
 * Calculate next power of 2 >= n
 */
function nextPow2(n: number): number {
  if (n <= 1) return 2;
  return Math.pow(2, Math.ceil(Math.log2(n)));
}

/**
 * Build and persist bracket seeds to Firestore
 *
 * This function:
 * 1. Reads poolResults from Firestore
 * 2. Builds slots with full metadata for each qualifier
 * 3. Calculates bracket structure (size, rounds, round1MatchCount)
 * 4. Allocates BYEs to top seeds first
 * 5. Pairs remaining seeds using cross-pool mirror logic
 * 6. Writes BracketSeedsDoc to tournaments/{tId}/divisions/{dId}/bracketSeeds/{bracketType}
 *
 * @param tournamentId - Tournament ID
 * @param divisionId - Division ID
 * @param qualifiersPerPool - K value (how many advance per pool)
 * @param testData - Whether this is test data (for cleanup)
 * @returns The BracketSeedsDoc that was written
 */
export async function buildBracketSeeds(
  tournamentId: string,
  divisionId: string,
  qualifiersPerPool: number,
  testData: boolean = false
): Promise<BracketSeedsDoc> {
  // Read poolResults from subcollection
  const poolResultsRef = collection(
    db,
    'tournaments',
    tournamentId,
    'divisions',
    divisionId,
    'poolResults'
  );

  const poolResultsSnap = await getDocs(poolResultsRef);
  const poolResults = poolResultsSnap.docs.map(d => d.data() as PoolResultDoc);
  poolResults.sort((a, b) => a.poolName.localeCompare(b.poolName));

  if (poolResults.length === 0) {
    throw new Error('No poolResults found. Run buildPoolResults() first.');
  }

  const P = poolResults.length;
  const K = qualifiersPerPool;

  console.log(`[buildBracketSeeds] Building seeds: ${P} pools, K=${K}`);

  // ============================================
  // GUARDRAIL: Only support K=1 or K=2 for now
  // K>2 requires generalized cross-pool pairing logic
  // ============================================
  if (K !== 1 && K !== 2) {
    throw new Error(`Unsupported qualifiersPerPool K=${K}. Only K=1 or K=2 supported.`);
  }

  // ============================================
  // Build slots with FULL metadata - HARD FAIL if rank > K
  // ============================================
  const slots: { [slotKey: string]: BracketSlot } = {};
  const poolLetters: string[] = [];

  for (const pool of poolResults) {
    const poolLetter = pool.poolName.replace('Pool ', '');
    poolLetters.push(poolLetter);

    for (let rank = 1; rank <= K; rank++) {
      const row = pool.rows.find(r => r.rank === rank);
      if (row) {
        // GUARDRAIL: Fail if rank > K (shouldn't happen but be safe)
        if (row.rank > K) {
          throw new Error(`INVALID: ${row.name} has rank ${row.rank} > K=${K}`);
        }
        const slotKey = `${poolLetter}${rank}`;
        slots[slotKey] = {
          teamId: row.teamId,
          name: row.name,
          poolKey: pool.poolKey,
          poolName: pool.poolName,
          rank: row.rank,
          wins: row.wins,
          losses: row.losses,
          pf: row.pf,
          pa: row.pa,
          diff: row.diff,
        };
      }
    }
  }

  // ============================================
  // Calculate actual slot count (not P*K assumption)
  // A pool might have fewer teams, a rank might be missing (DQ/no-show)
  // ============================================
  const actualSlotCount = Object.keys(slots).length;
  const bracketSize = nextPow2(actualSlotCount);
  const rounds = Math.log2(bracketSize);
  const round1MatchCount = bracketSize / 2;

  console.log('[buildBracketSeeds] Structure:', {
    P,
    K,
    actualSlotCount,
    bracketSize,
    rounds,
    round1MatchCount,
  });

  // ============================================
  // STEP A1: Build seedPriority list for BYE allocation
  // All pool winners (*1) first, then runners-up (*2), sorted by pool letter
  // ============================================
  const seedPriority: string[] = [];
  for (let rank = 1; rank <= K; rank++) {
    for (const letter of poolLetters) {
      const slotKey = `${letter}${rank}`;
      if (slots[slotKey]) {
        seedPriority.push(slotKey);
      }
    }
  }
  console.log('[buildBracketSeeds] Seed priority:', seedPriority);

  // ============================================
  // STEP A2: Allocate BYEs to top seeds first
  // byeCount = bracketSize - actualSlotCount
  // Top seeds get BYE matches (sideA vs null)
  // ============================================
  const byeCount = bracketSize - actualSlotCount;
  const byeRecipients = seedPriority.slice(0, byeCount);
  const remainingSeeds = seedPriority.slice(byeCount);

  console.log('[buildBracketSeeds] BYE recipients:', byeRecipients);
  console.log('[buildBracketSeeds] Remaining seeds for cross-pool:', remainingSeeds);

  // ============================================
  // FIX A: GUARDRAIL - Remaining seeds must be EVEN
  // If odd, something is wrong (missing team, corrupt data)
  // We cannot create a bracket with an unpaired team
  // ============================================
  if (remainingSeeds.length % 2 !== 0) {
    throw new Error(
      `Cannot pair remaining seeds: ${remainingSeeds.length} is odd. ` +
      `Expected even number after removing ${byeRecipients.length} BYE recipients from ${actualSlotCount} total slots. ` +
      `This indicates missing pool results or data corruption.`
    );
  }

  // Build explicit cross-pool pairs from remaining seeds
  const crossPoolPairs: { sideA: string; sideB: string }[] = [];

  // ============================================
  // FIX B: Pair remaining seeds with EACH OTHER
  // No additional BYEs - everyone gets a real opponent
  // ============================================

  // Separate remaining seeds by rank
  const remaining1s: string[] = [];
  const remaining2s: string[] = [];

  for (const slotKey of remainingSeeds) {
    const rank = parseInt(slotKey.slice(-1));
    if (rank === 1) remaining1s.push(slotKey);
    else remaining2s.push(slotKey);
  }

  // Sort by pool letter for consistent ordering
  remaining1s.sort();
  remaining2s.sort();

  console.log('[buildBracketSeeds] Remaining 1s:', remaining1s);
  console.log('[buildBracketSeeds] Remaining 2s:', remaining2s);

  if (K === 1) {
    // For K=1: Pool winners face each other (A1 vs D1, B1 vs C1)
    // Pair first with last among remaining 1s
    const toMatch = [...remaining1s];
    while (toMatch.length >= 2) {
      const first = toMatch.shift()!;
      const last = toMatch.pop()!;
      crossPoolPairs.push({ sideA: first, sideB: last });
    }
    // If odd number (shouldn't happen due to FIX A guardrail)
    if (toMatch.length === 1) {
      console.error(`[buildBracketSeeds] ERROR: Unpaired seed ${toMatch[0]} - this indicates a BYE calculation error`);
    }
  } else {
    // K=2: Try to pair 1s with 2s from different pools
    // Strategy: Build preferred pairings using mirror logic,
    // but fall back to any available opponent if mirror partner is gone

    const available1s = new Set(remaining1s);
    const available2s = new Set(remaining2s);

    // Build mirror pairs from pool letters for ordering preference
    const sortedLetters = [...poolLetters].sort();
    const mirrorMap = new Map<string, string>();
    const half = Math.floor(sortedLetters.length / 2);

    for (let i = 0; i < half; i++) {
      const left = sortedLetters[i];
      const right = sortedLetters[sortedLetters.length - 1 - i];
      mirrorMap.set(left, right);
      mirrorMap.set(right, left);
    }
    // Middle pool (odd P) has no mirror - we'll handle orphans below

    console.log('[buildBracketSeeds] Mirror map:', Object.fromEntries(mirrorMap));

    // First pass: Create cross-pool pairs where mirror partner is available
    for (const slot1 of [...available1s]) {
      const poolLetter = slot1.slice(0, -1); // e.g., "A" from "A1"
      const mirrorPool = mirrorMap.get(poolLetter);

      if (mirrorPool) {
        const mirrorSlot2 = `${mirrorPool}2`;
        if (available2s.has(mirrorSlot2)) {
          // Ideal: 1 vs mirror pool's 2
          crossPoolPairs.push({ sideA: slot1, sideB: mirrorSlot2 });
          available1s.delete(slot1);
          available2s.delete(mirrorSlot2);
        }
      }
    }

    // Second pass: Pair remaining 1s with any available 2 (prefer cross-pool)
    for (const slot1 of [...available1s]) {
      const poolLetter = slot1.slice(0, -1);

      // Find any 2 from a different pool
      let opponent: string | null = null;
      for (const slot2 of available2s) {
        const oppPool = slot2.slice(0, -1);
        if (oppPool !== poolLetter) {
          opponent = slot2;
          break;
        }
      }

      // If no cross-pool 2 available, take any 2
      if (!opponent && available2s.size > 0) {
        opponent = [...available2s][0];
      }

      if (opponent) {
        crossPoolPairs.push({ sideA: slot1, sideB: opponent });
        available1s.delete(slot1);
        available2s.delete(opponent);
      }
    }

    // Third pass: Pair remaining 1s with each other (if any)
    const leftover1s = [...available1s];
    while (leftover1s.length >= 2) {
      const a = leftover1s.shift()!;
      const b = leftover1s.pop()!;
      crossPoolPairs.push({ sideA: a, sideB: b });
      available1s.delete(a);
      available1s.delete(b);
    }

    // Fourth pass: Pair remaining 2s with each other (if any)
    const leftover2s = [...available2s];
    while (leftover2s.length >= 2) {
      const a = leftover2s.shift()!;
      const b = leftover2s.pop()!;
      crossPoolPairs.push({ sideA: a, sideB: b });
      available2s.delete(a);
      available2s.delete(b);
    }

    // If anything remains unpaired, it's a logic error
    if (available1s.size > 0 || available2s.size > 0) {
      console.error('[buildBracketSeeds] ERROR: Unpaired seeds remain:', {
        available1s: [...available1s],
        available2s: [...available2s],
      });
    }
  }

  // ============================================
  // OPTIONAL: Swap to avoid same-pool matches
  // ============================================
  for (let i = 0; i < crossPoolPairs.length; i++) {
    const pairA = crossPoolPairs[i];
    const poolA1 = pairA.sideA.slice(0, -1);
    const poolA2 = pairA.sideB.slice(0, -1);

    if (poolA1 === poolA2) {
      // Same-pool match found, try to swap with another pair
      for (let j = i + 1; j < crossPoolPairs.length; j++) {
        const pairB = crossPoolPairs[j];
        const poolB1 = pairB.sideA.slice(0, -1);
        const poolB2 = pairB.sideB.slice(0, -1);

        // Try swapping sideB values
        // New pairs would be: (A.sideA vs B.sideB), (B.sideA vs A.sideB)
        const newPoolA2 = poolB2;
        const newPoolB2 = poolA2;

        // Check if swap improves (removes same-pool match without creating new one)
        if (poolA1 !== newPoolA2 && poolB1 !== newPoolB2) {
          // Swap!
          const temp = pairA.sideB;
          pairA.sideB = pairB.sideB;
          pairB.sideB = temp;
          console.log(
            `[buildBracketSeeds] Swapped to avoid same-pool: ${pairA.sideA} vs ${pairA.sideB}, ${pairB.sideA} vs ${pairB.sideB}`
          );
          break;
        }
      }
    }
  }

  console.log(
    '[buildBracketSeeds] Cross-pool pairs:',
    crossPoolPairs.map((p, i) => `${i + 1}: ${p.sideA} vs ${p.sideB}`)
  );

  // ============================================
  // STEP B: Build round1Pairs
  // 1. BYE recipients first (top seeds get BYEs)
  // 2. Then cross-pool pairs
  // ============================================
  const round1Pairs: Round1Pair[] = [];

  // Add BYE matches for top seeds first
  byeRecipients.forEach((slotKey, idx) => {
    round1Pairs.push({
      matchNum: idx + 1,
      sideA: slotKey,
      sideB: null, // BYE - top seed advances automatically
    });
  });

  // Add cross-pool pairs
  crossPoolPairs.forEach((pair, idx) => {
    round1Pairs.push({
      matchNum: byeRecipients.length + idx + 1,
      sideA: pair.sideA,
      sideB: pair.sideB,
    });
  });

  // ============================================
  // GUARDRAIL: Ensure round1Pairs count matches expected
  // If this fails, bracket linking in generateBracketFromSeeds() will break
  // ============================================
  if (round1Pairs.length !== round1MatchCount) {
    throw new Error(
      `round1Pairs length ${round1Pairs.length} != expected ${round1MatchCount}. ` +
      `byeRecipients=${byeRecipients.length}, crossPoolPairs=${crossPoolPairs.length}. ` +
      `Bracket linking will fail.`
    );
  }

  // Validate: every referenced slot exists
  for (const pair of round1Pairs) {
    if (pair.sideA && !slots[pair.sideA]) {
      throw new Error(`Missing slot ${pair.sideA} in bracketSeeds`);
    }
    if (pair.sideB && !slots[pair.sideB]) {
      throw new Error(`Missing slot ${pair.sideB} in bracketSeeds`);
    }
  }

  const seedsDoc: BracketSeedsDoc = {
    bracketType: 'main',
    generatedAt: Date.now(),
    qualifiersPerPool: K,
    poolCount: P,
    method: 'mirror',
    testData,
    bracketSize,
    rounds,
    round1MatchCount,
    slots,
    round1Pairs,
  };

  // Write to Firestore subcollection under division
  const docRef = doc(
    db,
    'tournaments',
    tournamentId,
    'divisions',
    divisionId,
    'bracketSeeds',
    'main'
  );

  await setDoc(docRef, seedsDoc);

  console.log(
    `[buildBracketSeeds] Wrote bracket seeds: ${round1Pairs.length} R1 matches (${byeRecipients.length} BYEs, ${crossPoolPairs.length} real matches)`
  );

  return seedsDoc;
}

/**
 * Read bracket seeds for a division
 *
 * @param tournamentId - Tournament ID
 * @param divisionId - Division ID
 * @param bracketType - 'main' or 'plate'
 * @returns BracketSeedsDoc or null if not found
 */
export async function getBracketSeeds(
  tournamentId: string,
  divisionId: string,
  bracketType: 'main' | 'plate' = 'main'
): Promise<BracketSeedsDoc | null> {
  const docRef = doc(
    db,
    'tournaments',
    tournamentId,
    'divisions',
    divisionId,
    'bracketSeeds',
    bracketType
  );

  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.data() as BracketSeedsDoc;
}

/**
 * Build and persist PLATE bracket seeds to Firestore
 *
 * Plate bracket contains NON-qualifying teams (those who didn't advance to main bracket).
 * For K=2 advancement: plate gets rank 3+ from each pool
 * For K=1 advancement: plate gets rank 2+ from each pool
 *
 * V06.39: New function for consolation/plate bracket support
 *
 * @param tournamentId - Tournament ID
 * @param divisionId - Division ID
 * @param qualifiersPerPool - K value (teams per pool advancing to MAIN bracket)
 * @param plateThirdPlace - Whether plate bracket has its own 3rd place match
 * @param testData - Whether this is test data
 * @returns The BracketSeedsDoc that was written
 */
export async function buildPlateBracketSeeds(
  tournamentId: string,
  divisionId: string,
  qualifiersPerPool: number,
  plateThirdPlace: boolean = false,
  testData: boolean = false
): Promise<BracketSeedsDoc> {
  // Read poolResults from subcollection
  const poolResultsRef = collection(
    db,
    'tournaments',
    tournamentId,
    'divisions',
    divisionId,
    'poolResults'
  );

  const poolResultsSnap = await getDocs(poolResultsRef);
  const poolResults = poolResultsSnap.docs.map(d => d.data() as PoolResultDoc);
  poolResults.sort((a, b) => a.poolName.localeCompare(b.poolName));

  if (poolResults.length === 0) {
    throw new Error('No poolResults found. Run buildPoolResults() first.');
  }

  const P = poolResults.length;
  const K = qualifiersPerPool; // Teams advancing to MAIN bracket

  console.log(`[buildPlateBracketSeeds] Building plate seeds: ${P} pools, K=${K} (plate gets rank > ${K})`);

  // Build slots for NON-qualifying teams (rank > K)
  const slots: { [slotKey: string]: BracketSlot } = {};
  const poolLetters: string[] = [];

  for (const pool of poolResults) {
    const poolLetter = pool.poolName.replace('Pool ', '');
    poolLetters.push(poolLetter);

    // Get teams ranked AFTER qualifiers (rank > K)
    for (const row of pool.rows) {
      if (row.rank > K) {
        const slotKey = `${poolLetter}${row.rank}`;
        slots[slotKey] = {
          teamId: row.teamId,
          name: row.name,
          poolKey: pool.poolKey,
          poolName: pool.poolName,
          rank: row.rank,
          wins: row.wins,
          losses: row.losses,
          pf: row.pf,
          pa: row.pa,
          diff: row.diff,
        };
      }
    }
  }

  const actualSlotCount = Object.keys(slots).length;

  // Handle case where not enough teams for plate bracket
  if (actualSlotCount < 2) {
    console.log('[buildPlateBracketSeeds] Not enough teams for plate bracket:', actualSlotCount);

    // Return empty seeds doc - caller should check bracketSize > 0
    const emptySeedsDoc: BracketSeedsDoc = {
      bracketType: 'plate',
      generatedAt: Date.now(),
      qualifiersPerPool: K,
      poolCount: P,
      method: 'mirror',
      testData,
      bracketSize: 0,
      rounds: 0,
      round1MatchCount: 0,
      slots: {},
      round1Pairs: [],
      thirdPlaceMatch: false,
    };

    // Still write to Firestore so we know plate was attempted
    const docRef = doc(db, 'tournaments', tournamentId, 'divisions', divisionId, 'bracketSeeds', 'plate');
    await setDoc(docRef, emptySeedsDoc);

    return emptySeedsDoc;
  }

  const bracketSize = nextPow2(actualSlotCount);
  const rounds = Math.log2(bracketSize);
  const round1MatchCount = bracketSize / 2;

  console.log('[buildPlateBracketSeeds] Structure:', {
    P,
    K,
    actualSlotCount,
    bracketSize,
    rounds,
    round1MatchCount,
    plateThirdPlace,
  });

  // Build seed priority for plate (sorted by pool rank, then pool letter)
  // Lower rank = higher seed within plate (e.g., rank 3 > rank 4)
  const seedPriority: string[] = Object.keys(slots).sort((a, b) => {
    const rankA = parseInt(a.slice(-1));
    const rankB = parseInt(b.slice(-1));
    if (rankA !== rankB) return rankA - rankB; // Lower rank first
    return a.localeCompare(b); // Then by pool letter
  });

  console.log('[buildPlateBracketSeeds] Seed priority:', seedPriority);

  // Allocate BYEs to top plate seeds
  const byeCount = bracketSize - actualSlotCount;
  const byeRecipients = seedPriority.slice(0, byeCount);
  const remainingSeeds = seedPriority.slice(byeCount);

  console.log('[buildPlateBracketSeeds] BYE recipients:', byeRecipients);
  console.log('[buildPlateBracketSeeds] Remaining seeds:', remainingSeeds);

  // Pair remaining seeds (first with last for cross-pool matching)
  const crossPoolPairs: { sideA: string; sideB: string }[] = [];
  const toMatch = [...remainingSeeds];

  while (toMatch.length >= 2) {
    const first = toMatch.shift()!;
    const last = toMatch.pop()!;
    crossPoolPairs.push({ sideA: first, sideB: last });
  }

  // Build round1Pairs
  const round1Pairs: Round1Pair[] = [];

  // Add BYE matches for top seeds first
  byeRecipients.forEach((slotKey, idx) => {
    round1Pairs.push({
      matchNum: idx + 1,
      sideA: slotKey,
      sideB: null, // BYE
    });
  });

  // Add cross-pool pairs
  crossPoolPairs.forEach((pair, idx) => {
    round1Pairs.push({
      matchNum: byeRecipients.length + idx + 1,
      sideA: pair.sideA,
      sideB: pair.sideB,
    });
  });

  const seedsDoc: BracketSeedsDoc = {
    bracketType: 'plate',
    generatedAt: Date.now(),
    qualifiersPerPool: K,
    poolCount: P,
    method: 'mirror',
    testData,
    bracketSize,
    rounds,
    round1MatchCount,
    slots,
    round1Pairs,
    thirdPlaceMatch: plateThirdPlace, // V06.39: Track if plate has 3rd place match
  };

  // Write to Firestore
  const docRef = doc(db, 'tournaments', tournamentId, 'divisions', divisionId, 'bracketSeeds', 'plate');
  await setDoc(docRef, seedsDoc);

  console.log(
    `[buildPlateBracketSeeds] Wrote plate seeds: ${round1Pairs.length} R1 matches (${byeRecipients.length} BYEs, ${crossPoolPairs.length} real matches)` +
    (plateThirdPlace ? ' with 3rd place match' : '')
  );

  return seedsDoc;
}

/**
 * Round Robin Validator
 *
 * Validation functions for pool/round-robin match generation.
 * All validation follows "fail closed" principle - any integrity
 * issue stops generation and writes NOTHING to Firestore.
 *
 * @version 06.21
 * @file services/formats/roundRobinValidator.ts
 */

import { normalizePoolKey } from './poolMatchUtils';

// ============================================
// TYPES
// ============================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

export interface MatchValidationStats {
  totalMatches: number;
  expectedMatches: number;
  matchesPerPool: Record<string, { actual: number; expected: number }>;
  duplicates: string[];
  selfMatches: string[];
  missedPairings: string[];
}

export interface MatchValidationResult extends ValidationResult {
  stats: MatchValidationStats;
}

/**
 * Pool structure for validation
 */
export interface PoolForValidation {
  poolName: string;
  participants: Array<{
    id: string;
    name?: string;
  }>;
}

/**
 * Match structure for validation
 */
export interface MatchForValidation {
  id?: string;
  poolGroup?: string;
  poolKey?: string;
  divisionId?: string;
  stage?: string;
  sideA: {
    id: string;
    name?: string;
  };
  sideB: {
    id: string;
    name?: string;
  };
}

// ============================================
// PRE-GENERATION VALIDATION
// ============================================

/**
 * Validate pools BEFORE generating matches
 *
 * This is a "fail closed" validation - if ANY check fails,
 * match generation should NOT proceed.
 *
 * @param pools - Array of pools to validate
 * @returns ValidationResult with errors and warnings
 */
export function validatePoolsBeforeGeneration(
  pools: PoolForValidation[]
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check 1: At least one pool
  if (pools.length === 0) {
    errors.push('No pools provided for match generation');
    return { valid: false, errors, warnings };
  }

  // Check 2: Every team appears in exactly ONE pool
  const allTeamIds = pools.flatMap(p => p.participants.map(t => t.id));
  const duplicates = allTeamIds.filter((id, i) => allTeamIds.indexOf(id) !== i);
  if (duplicates.length > 0) {
    const uniqueDuplicates = [...new Set(duplicates)];
    errors.push(`Teams appear in multiple pools: ${uniqueDuplicates.join(', ')}`);
  }

  // Check 3: No duplicate team IDs within a pool
  for (const pool of pools) {
    const poolIds = pool.participants.map(t => t.id);
    const poolDupes = poolIds.filter((id, i) => poolIds.indexOf(id) !== i);
    if (poolDupes.length > 0) {
      errors.push(`${pool.poolName} has duplicate teams: ${poolDupes.join(', ')}`);
    }
  }

  // Check 4: Every pool has a stable poolGroup label
  for (const pool of pools) {
    if (!pool.poolName || pool.poolName.trim() === '') {
      errors.push(`Pool at index ${pools.indexOf(pool)} has no name`);
    }
  }

  // Check 5: Pools are non-empty (need at least 2 for a match)
  for (const pool of pools) {
    if (pool.participants.length === 0) {
      errors.push(`${pool.poolName} is empty`);
    } else if (pool.participants.length === 1) {
      // Single team = all byes, no matches - warning only
      warnings.push(`${pool.poolName} has only 1 team (no matches will be generated)`);
    }
  }

  // Check 6 (warning): Pool sizes within expected range
  for (const pool of pools) {
    if (pool.participants.length > 1 && (pool.participants.length < 3 || pool.participants.length > 6)) {
      warnings.push(`${pool.poolName} has ${pool.participants.length} teams (typical: 3-6)`);
    }
  }

  // Check 7: No empty team IDs
  const emptyIds = allTeamIds.filter(id => !id);
  if (emptyIds.length > 0) {
    errors.push(`${emptyIds.length} teams have empty IDs`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ============================================
// POST-GENERATION VALIDATION
// ============================================

/**
 * Validate generated matches BEFORE writing to Firestore
 *
 * This is a "fail closed" validation - if ANY check fails,
 * NO matches should be written.
 *
 * Uses poolKey (normalized) for validation logic.
 *
 * @param matches - Array of generated matches
 * @param pools - Array of pools (for expected count calculation)
 * @returns MatchValidationResult with errors, warnings, and stats
 */
export function validateMatchesBeforeWrite(
  matches: MatchForValidation[],
  pools: PoolForValidation[]
): MatchValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const stats: MatchValidationStats = {
    totalMatches: matches.length,
    expectedMatches: 0,
    matchesPerPool: {},
    duplicates: [],
    selfMatches: [],
    missedPairings: [],
  };

  // Calculate expected matches per pool (excludes BYEs)
  for (const pool of pools) {
    const poolKey = normalizePoolKey(pool.poolName);
    // Only count non-BYE participants (those with valid IDs)
    const nonByeParticipants = pool.participants.filter(p => p && p.id);
    const n = nonByeParticipants.length;
    const expected = n >= 2 ? (n * (n - 1)) / 2 : 0;
    stats.expectedMatches += expected;
    stats.matchesPerPool[poolKey] = { actual: 0, expected };
  }

  // Track match signatures for duplicate detection
  const signatures = new Set<string>();

  // Track pairings per pool for completeness check
  const pairingsPerPool = new Map<string, Set<string>>();
  pools.forEach(p => {
    const poolKey = normalizePoolKey(p.poolName);
    pairingsPerPool.set(poolKey, new Set());
  });

  for (const match of matches) {
    // Get poolKey (use stored poolKey or normalize poolGroup)
    const poolKey = match.poolKey || normalizePoolKey(match.poolGroup || '');

    // Check 1: Self-match detection (ID only - NOT by name)
    if (match.sideA.id === match.sideB.id) {
      stats.selfMatches.push(`${poolKey}: ${match.sideA.name || match.sideA.id} vs itself`);
      errors.push(`Self-match detected in ${poolKey}: team ID ${match.sideA.id}`);
      continue;
    }

    // Check 2: Duplicate detection (using poolKey)
    const sig = [
      poolKey,
      [match.sideA.id, match.sideB.id].sort().join('-')
    ].join('|');

    if (signatures.has(sig)) {
      stats.duplicates.push(`${poolKey}: ${match.sideA.name || match.sideA.id} vs ${match.sideB.name || match.sideB.id}`);
      errors.push(`Duplicate match in ${poolKey}: ${match.sideA.id} vs ${match.sideB.id}`);
    } else {
      signatures.add(sig);
    }

    // Track for pool stats
    if (stats.matchesPerPool[poolKey]) {
      stats.matchesPerPool[poolKey].actual++;
    } else {
      // Match belongs to unknown pool
      warnings.push(`Match has unknown poolKey: ${poolKey}`);
    }

    // Track pairing for completeness check
    const pairingKey = [match.sideA.id, match.sideB.id].sort().join('-');
    pairingsPerPool.get(poolKey)?.add(pairingKey);
  }

  // Check 3: Match count per pool
  for (const [poolKey, counts] of Object.entries(stats.matchesPerPool)) {
    if (counts.actual !== counts.expected) {
      errors.push(
        `${poolKey}: ${counts.actual} matches generated, expected ${counts.expected}`
      );
    }
  }

  // Check 4: All pairings generated (completeness)
  for (const pool of pools) {
    const poolKey = normalizePoolKey(pool.poolName);
    const poolPairings = pairingsPerPool.get(poolKey) || new Set();
    const participants = pool.participants.filter(p => p && p.id);

    for (let i = 0; i < participants.length; i++) {
      for (let j = i + 1; j < participants.length; j++) {
        const expectedPairing = [participants[i].id, participants[j].id].sort().join('-');
        if (!poolPairings.has(expectedPairing)) {
          const nameA = participants[i].name || participants[i].id;
          const nameB = participants[j].name || participants[j].id;
          stats.missedPairings.push(`${poolKey}: ${nameA} vs ${nameB}`);
          errors.push(
            `Missing match in ${poolKey}: ${participants[i].id} vs ${participants[j].id}`
          );
        }
      }
    }
  }

  // Check 5: All matches have required fields
  for (const match of matches) {
    if (!match.poolGroup && !match.poolKey) {
      errors.push(`Match missing poolGroup/poolKey: ${match.sideA.id} vs ${match.sideB.id}`);
    }
    if (!match.divisionId) {
      errors.push(`Match missing divisionId: ${match.sideA.id} vs ${match.sideB.id}`);
    }
    if (match.stage && match.stage !== 'pool') {
      errors.push(`Pool match has wrong stage: ${match.stage} (expected 'pool')`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats,
  };
}

// ============================================
// ASSERTION HELPER
// ============================================

/**
 * Assert that matches are valid, throwing an error if not
 *
 * Use this as a guard before writing to Firestore.
 *
 * @param matches - Array of generated matches
 * @param pools - Array of pools
 * @throws Error if validation fails
 */
export function assertValidMatches(
  matches: MatchForValidation[],
  pools: PoolForValidation[]
): void {
  const result = validateMatchesBeforeWrite(matches, pools);

  if (!result.valid) {
    console.error('[Match Validation Failed]', {
      errors: result.errors,
      stats: result.stats,
    });
    throw new Error(
      `Match generation validation failed:\n${result.errors.join('\n')}`
    );
  }

  if (result.warnings && result.warnings.length > 0) {
    console.warn('[Match Validation Warnings]', result.warnings);
  }
}

/**
 * Assert that pools are valid before generation
 *
 * @param pools - Array of pools to validate
 * @throws Error if validation fails
 */
export function assertValidPools(pools: PoolForValidation[]): void {
  const result = validatePoolsBeforeGeneration(pools);

  if (!result.valid) {
    console.error('[Pool Validation Failed]', result.errors);
    throw new Error(
      `Pool validation failed:\n${result.errors.join('\n')}`
    );
  }

  if (result.warnings && result.warnings.length > 0) {
    console.warn('[Pool Validation Warnings]', result.warnings);
  }
}

// ============================================
// POOL FAIRNESS CHECK (Warning Only)
// ============================================

/**
 * Check pool fairness based on DUPR ratings
 *
 * This is a NON-BLOCKING warning - pools that are imbalanced
 * will still be allowed, but a warning will be logged.
 *
 * @param pools - Array of pools with participant ratings
 * @returns Fairness assessment
 */
export function checkPoolFairness(
  pools: Array<{
    poolName: string;
    participants: Array<{
      id: string;
      duprRating?: number;
    }>;
  }>
): {
  isBalanced: boolean;
  poolStrengths: Record<string, number>;
  warning?: string;
} {
  const poolStrengths: Record<string, number> = {};

  for (const pool of pools) {
    const ratings = pool.participants
      .map(p => p.duprRating)
      .filter((r): r is number => r !== undefined && r > 0);

    if (ratings.length > 0) {
      const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
      poolStrengths[pool.poolName] = Math.round(avgRating * 100) / 100;
    }
  }

  const strengths = Object.values(poolStrengths);
  if (strengths.length < 2) {
    return { isBalanced: true, poolStrengths };
  }

  const maxStrength = Math.max(...strengths);
  const minStrength = Math.min(...strengths);
  const difference = maxStrength - minStrength;

  // Warn if pools differ by more than 0.5 DUPR points on average
  const isBalanced = difference <= 0.5;

  return {
    isBalanced,
    poolStrengths,
    warning: isBalanced
      ? undefined
      : `Pools may be imbalanced: strength range ${minStrength.toFixed(2)} - ${maxStrength.toFixed(2)} (${difference.toFixed(2)} diff)`,
  };
}

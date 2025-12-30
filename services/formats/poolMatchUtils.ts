/**
 * Pool Match Utilities
 *
 * Utility functions for idempotent pool match generation:
 * - Canonical match ID generation (deterministic, not random)
 * - Pool key normalization (poolGroup → poolKey)
 * - Team ID sorting for consistent ordering
 *
 * @version 06.21
 * @file services/formats/poolMatchUtils.ts
 */

// ============================================
// POOL KEY NORMALIZATION
// ============================================

/**
 * Normalize pool name to a stable key for validation and canonical IDs
 *
 * poolGroup: "Pool A" (display) → poolKey: "pool-a" (internal)
 *
 * @param poolGroup - Display name of the pool (e.g., "Pool A", "Pool B")
 * @returns Normalized pool key (e.g., "pool-a", "pool-b")
 */
export function normalizePoolKey(poolGroup: string): string {
  if (!poolGroup) {
    console.warn('[normalizePoolKey] Empty poolGroup provided');
    return 'unknown';
  }
  return poolGroup.toLowerCase().trim().replace(/\s+/g, '-');
}

// ============================================
// TEAM ID SORTING
// ============================================

/**
 * Sort two team IDs alphabetically for consistent ordering
 *
 * This ensures that "teamA vs teamB" and "teamB vs teamA"
 * produce the same canonical ID.
 *
 * @param teamAId - First team ID
 * @param teamBId - Second team ID
 * @returns Tuple of [smallerId, largerId] sorted alphabetically
 */
export function sortTeamIds(teamAId: string, teamBId: string): [string, string] {
  return teamAId <= teamBId ? [teamAId, teamBId] : [teamBId, teamAId];
}

// ============================================
// CANONICAL MATCH ID GENERATION
// ============================================

/**
 * Generate a deterministic canonical ID for a pool match
 *
 * Format: {divisionId}__pool__{poolKey}__{teamId1}_{teamId2}
 *
 * Where teamId1 and teamId2 are sorted alphabetically to ensure
 * the same pairing always produces the same ID regardless of order.
 *
 * @param divisionId - Division ID
 * @param poolKey - Normalized pool key (use normalizePoolKey() first!)
 * @param teamAId - First team ID
 * @param teamBId - Second team ID
 * @returns Canonical match ID
 *
 * @example
 * // Both produce the same ID:
 * generatePoolMatchId('div123', 'pool-a', 'teamX', 'teamY')
 * generatePoolMatchId('div123', 'pool-a', 'teamY', 'teamX')
 * // Result: 'div123__pool__pool-a__teamX_teamY'
 */
export function generatePoolMatchId(
  divisionId: string,
  poolKey: string,
  teamAId: string,
  teamBId: string
): string {
  // Validate inputs
  if (!divisionId) {
    throw new Error('[generatePoolMatchId] divisionId is required');
  }
  if (!poolKey) {
    throw new Error('[generatePoolMatchId] poolKey is required');
  }
  if (!teamAId || !teamBId) {
    throw new Error('[generatePoolMatchId] Both team IDs are required');
  }
  if (teamAId === teamBId) {
    throw new Error(`[generatePoolMatchId] Self-match detected: ${teamAId} vs itself`);
  }

  // Sort team IDs alphabetically for consistent ordering
  const [id1, id2] = sortTeamIds(teamAId, teamBId);

  // Format: {divisionId}__pool__{poolKey}__{teamId1}_{teamId2}
  return `${divisionId}__pool__${poolKey}__${id1}_${id2}`;
}

// ============================================
// BRACKET MATCH ID GENERATION (Future Use)
// ============================================

/**
 * Generate a deterministic canonical ID for a bracket match
 *
 * Format: {divisionId}__bracket__{bracketType}__{bracketPosition}
 *
 * Bracket matches use position-based IDs since the participants
 * may change as the bracket progresses (winner advancement).
 *
 * @param divisionId - Division ID
 * @param bracketType - Type of bracket ('main', 'plate', 'consolation')
 * @param bracketPosition - Position in the bracket (1, 2, 3, etc.)
 * @returns Canonical match ID
 */
export function generateBracketMatchId(
  divisionId: string,
  bracketType: 'main' | 'plate' | 'consolation',
  bracketPosition: number
): string {
  if (!divisionId) {
    throw new Error('[generateBracketMatchId] divisionId is required');
  }
  if (bracketPosition < 1) {
    throw new Error('[generateBracketMatchId] bracketPosition must be >= 1');
  }

  return `${divisionId}__bracket__${bracketType}__${bracketPosition}`;
}

// ============================================
// ID PARSING (For Debugging)
// ============================================

/**
 * Parse a canonical pool match ID to extract its components
 *
 * @param canonicalId - The canonical match ID
 * @returns Parsed components or null if invalid format
 */
export function parsePoolMatchId(canonicalId: string): {
  divisionId: string;
  poolKey: string;
  teamId1: string;
  teamId2: string;
} | null {
  const regex = /^(.+)__pool__(.+)__(.+)_(.+)$/;
  const match = canonicalId.match(regex);

  if (!match) {
    return null;
  }

  return {
    divisionId: match[1],
    poolKey: match[2],
    teamId1: match[3],
    teamId2: match[4],
  };
}

/**
 * Check if a match ID is a canonical pool match ID
 *
 * @param matchId - The match ID to check
 * @returns True if it matches the canonical pool match ID format
 */
export function isCanonicalPoolMatchId(matchId: string): boolean {
  return /^.+__pool__.+__.+_.+$/.test(matchId);
}

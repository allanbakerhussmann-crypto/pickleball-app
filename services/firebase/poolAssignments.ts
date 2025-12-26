/**
 * Pool Assignments Service
 *
 * Handles saving and loading pool assignments for tournament divisions.
 * Supports drag-and-drop pool editing by organizers.
 *
 * @version 06.04
 * @file services/firebase/poolAssignments.ts
 */

import { doc, updateDoc, getDoc } from '@firebase/firestore';
import { db } from './config';
import type { Division, Team, PoolAssignment } from '../../types';
import { getPoolName } from '../formats/poolPlayMedals';

// ============================================
// TYPES
// ============================================

export interface GeneratePoolsOptions {
  teams: Team[];
  poolSize: number;
  seedingMethod?: 'rating' | 'random';
}

export interface PoolLockStatus {
  poolName: string;
  isLocked: boolean;
  reason?: string;
}

// ============================================
// POOL ASSIGNMENT CRUD
// ============================================

/**
 * Save pool assignments to a division
 */
export async function savePoolAssignments(
  tournamentId: string,
  divisionId: string,
  assignments: PoolAssignment[]
): Promise<void> {
  const divisionRef = doc(db, 'tournaments', tournamentId, 'divisions', divisionId);
  await updateDoc(divisionRef, {
    poolAssignments: assignments,
    updatedAt: Date.now(),
  });
}

/**
 * Get pool assignments from a division
 */
export async function getPoolAssignments(
  tournamentId: string,
  divisionId: string
): Promise<PoolAssignment[] | null> {
  const divisionRef = doc(db, 'tournaments', tournamentId, 'divisions', divisionId);
  const snap = await getDoc(divisionRef);
  if (!snap.exists()) return null;
  const data = snap.data() as Division;
  return data.poolAssignments || null;
}

/**
 * Clear pool assignments (revert to auto-seeding)
 */
export async function clearPoolAssignments(
  tournamentId: string,
  divisionId: string
): Promise<void> {
  const divisionRef = doc(db, 'tournaments', tournamentId, 'divisions', divisionId);
  await updateDoc(divisionRef, {
    poolAssignments: null,
    updatedAt: Date.now(),
  });
}

// ============================================
// AUTO-SEEDING
// ============================================

/**
 * Generate pool assignments using snake draft seeding
 *
 * Snake draft ensures balanced pools:
 * - Pool A gets seeds 1, 4, 5, 8, ...
 * - Pool B gets seeds 2, 3, 6, 7, ...
 *
 * @param options - Teams and pool configuration
 * @returns Array of pool assignments
 */
export function generatePoolAssignments(options: GeneratePoolsOptions): PoolAssignment[] {
  const { teams, poolSize, seedingMethod = 'rating' } = options;

  if (teams.length === 0) return [];

  // Sort teams by seeding method
  const sortedTeams = [...teams].sort((a, b) => {
    if (seedingMethod === 'rating') {
      // Sort by DUPR rating (highest first)
      const ratingA = a.avgDuprRating || a.seed || 0;
      const ratingB = b.avgDuprRating || b.seed || 0;
      return ratingB - ratingA;
    }
    // Random seeding
    return Math.random() - 0.5;
  });

  // Calculate number of pools
  const poolCount = Math.ceil(teams.length / poolSize);

  // Initialize pools
  const pools: PoolAssignment[] = [];
  for (let i = 0; i < poolCount; i++) {
    pools.push({
      poolName: getPoolName(i + 1),
      teamIds: [],
    });
  }

  // Snake draft assignment
  let direction = 1; // 1 = forward, -1 = backward
  let poolIndex = 0;

  for (const team of sortedTeams) {
    pools[poolIndex].teamIds.push(team.id);

    // Move to next pool
    poolIndex += direction;

    // Reverse direction at ends
    if (poolIndex >= poolCount) {
      poolIndex = poolCount - 1;
      direction = -1;
    } else if (poolIndex < 0) {
      poolIndex = 0;
      direction = 1;
    }
  }

  return pools;
}

// ============================================
// POOL OPERATIONS
// ============================================

/**
 * Move a team from one pool to another
 */
export function moveTeamBetweenPools(
  assignments: PoolAssignment[],
  teamId: string,
  fromPoolName: string,
  toPoolName: string
): PoolAssignment[] {
  return assignments.map((pool) => {
    if (pool.poolName === fromPoolName) {
      // Remove from source pool
      return {
        ...pool,
        teamIds: pool.teamIds.filter((id) => id !== teamId),
      };
    }
    if (pool.poolName === toPoolName) {
      // Add to target pool
      return {
        ...pool,
        teamIds: [...pool.teamIds, teamId],
      };
    }
    return pool;
  });
}

/**
 * Reorder teams within a pool
 */
export function reorderTeamsInPool(
  assignments: PoolAssignment[],
  poolName: string,
  newTeamOrder: string[]
): PoolAssignment[] {
  return assignments.map((pool) => {
    if (pool.poolName === poolName) {
      return {
        ...pool,
        teamIds: newTeamOrder,
      };
    }
    return pool;
  });
}

/**
 * Swap two teams between pools
 */
export function swapTeamsBetweenPools(
  assignments: PoolAssignment[],
  teamId1: string,
  poolName1: string,
  teamId2: string,
  poolName2: string
): PoolAssignment[] {
  return assignments.map((pool) => {
    if (pool.poolName === poolName1) {
      return {
        ...pool,
        teamIds: pool.teamIds.map((id) => (id === teamId1 ? teamId2 : id)),
      };
    }
    if (pool.poolName === poolName2) {
      return {
        ...pool,
        teamIds: pool.teamIds.map((id) => (id === teamId2 ? teamId1 : id)),
      };
    }
    return pool;
  });
}

// ============================================
// POOL LOCKING
// ============================================

/**
 * Check which pools are locked (have started/completed matches)
 */
export function getPoolLockStatus(
  assignments: PoolAssignment[],
  matches: { poolGroup?: string; status?: string }[]
): PoolLockStatus[] {
  return assignments.map((pool) => {
    const poolMatches = matches.filter((m) => m.poolGroup === pool.poolName);
    const hasStartedMatches = poolMatches.some(
      (m) => m.status === 'in_progress' || m.status === 'completed'
    );

    return {
      poolName: pool.poolName,
      isLocked: hasStartedMatches,
      reason: hasStartedMatches ? 'Matches have started in this pool' : undefined,
    };
  });
}

/**
 * Check if any pool is locked
 */
export function hasLockedPools(
  assignments: PoolAssignment[],
  matches: { poolGroup?: string; status?: string }[]
): boolean {
  const lockStatus = getPoolLockStatus(assignments, matches);
  return lockStatus.some((s) => s.isLocked);
}

// ============================================
// VALIDATION
// ============================================

/**
 * Validate pool balance (check for imbalanced pool sizes)
 */
export function validatePoolBalance(
  assignments: PoolAssignment[]
): { isBalanced: boolean; message?: string } {
  if (assignments.length === 0) {
    return { isBalanced: true };
  }

  const sizes = assignments.map((p) => p.teamIds.length);
  const maxSize = Math.max(...sizes);
  const minSize = Math.min(...sizes);

  // Allow at most 1 team difference between pools
  if (maxSize - minSize > 1) {
    return {
      isBalanced: false,
      message: `Pools are imbalanced: sizes range from ${minSize} to ${maxSize} teams`,
    };
  }

  // Check for empty pools
  if (minSize === 0) {
    const emptyPools = assignments.filter((p) => p.teamIds.length === 0);
    return {
      isBalanced: false,
      message: `${emptyPools.length} pool(s) are empty`,
    };
  }

  return { isBalanced: true };
}

/**
 * Get pool for a team
 */
export function getTeamPool(
  assignments: PoolAssignment[],
  teamId: string
): string | null {
  for (const pool of assignments) {
    if (pool.teamIds.includes(teamId)) {
      return pool.poolName;
    }
  }
  return null;
}

/**
 * Delete an empty pool from assignments
 * @throws Error if pool has teams or minimum pools not met
 */
export function deleteEmptyPool(
  assignments: PoolAssignment[],
  poolName: string,
  minPools: number = 2
): PoolAssignment[] {
  const pool = assignments.find(p => p.poolName === poolName);

  if (!pool) {
    throw new Error(`Pool "${poolName}" not found`);
  }

  if (pool.teamIds.length > 0) {
    throw new Error('Cannot delete pool with teams');
  }

  if (assignments.length <= minPools) {
    throw new Error(`Cannot delete - minimum ${minPools} pools required`);
  }

  return assignments.filter(p => p.poolName !== poolName);
}

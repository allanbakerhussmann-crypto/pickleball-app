/**
 * usePlayerName Hook
 *
 * Hook to get a player's display name with caching and batching.
 * Checks league members first (instant), falls back to users collection (batched).
 *
 * Features:
 * - Uses module-level cache from playerNameCache service
 * - Checks members array first for instant resolution
 * - Falls back to snapshot name during loading
 * - Auto re-renders when cache updates
 *
 * FILE LOCATION: hooks/usePlayerName.ts
 * VERSION: V07.48
 */

import { useState, useEffect, useMemo } from 'react';
import {
  getCachedName,
  subscribeToCacheUpdates,
  populateCacheFromMembers,
} from '../services/playerNameCache';
import type { LeagueMember } from '../types';

/**
 * Hook to get a player's display name with caching/batching.
 *
 * @param playerId - The player's user ID
 * @param members - Optional array of league members for instant lookup
 * @param snapshotName - Optional fallback name during loading (from absence record etc)
 * @returns Display name string
 */
export function usePlayerName(
  playerId: string,
  members?: LeagueMember[],
  snapshotName?: string
): string {
  // Force re-render counter when cache updates
  const [, forceUpdate] = useState(0);

  // Pre-populate cache from members on mount/change
  useEffect(() => {
    if (members && members.length > 0) {
      populateCacheFromMembers(members);
    }
  }, [members]);

  // Subscribe to cache updates for re-render
  useEffect(() => {
    const unsubscribe = subscribeToCacheUpdates(() => {
      forceUpdate((n) => n + 1);
    });
    return unsubscribe;
  }, []);

  // Fast path: check members array first (no async needed)
  const memberName = useMemo(() => {
    if (!playerId || !members) return null;
    const member = members.find(
      (m) => m.userId === playerId || m.id === playerId
    );
    return member?.displayName || null;
  }, [playerId, members]);

  if (memberName) {
    return memberName;
  }

  // Get from cache (may trigger batch fetch)
  const cachedName = getCachedName(playerId);

  // Use snapshot as fallback during loading
  if (cachedName === 'Loading...' && snapshotName) {
    return snapshotName;
  }

  return cachedName;
}

/**
 * Hook to get multiple player names at once.
 * More efficient than calling usePlayerName multiple times.
 *
 * @param playerIds - Array of player IDs
 * @param members - Optional array of league members for instant lookup
 * @returns Map of playerId → displayName
 */
export function usePlayerNames(
  playerIds: string[],
  members?: LeagueMember[]
): Map<string, string> {
  const [, forceUpdate] = useState(0);

  // Pre-populate cache from members on mount/change
  useEffect(() => {
    if (members && members.length > 0) {
      populateCacheFromMembers(members);
    }
  }, [members]);

  // Subscribe to cache updates for re-render
  useEffect(() => {
    const unsubscribe = subscribeToCacheUpdates(() => {
      forceUpdate((n) => n + 1);
    });
    return unsubscribe;
  }, []);

  // Build result map
  return useMemo(() => {
    const result = new Map<string, string>();
    const memberMap = members
      ? new Map(members.map((m) => [m.userId || m.id, m.displayName]))
      : new Map<string, string>();

    for (const id of playerIds) {
      if (!id) continue;

      // Check members first
      const memberName = memberMap.get(id);
      if (memberName) {
        result.set(id, memberName);
        continue;
      }

      // Fall back to cache
      result.set(id, getCachedName(id));
    }

    return result;
  }, [playerIds, members]);
}

export default usePlayerName;

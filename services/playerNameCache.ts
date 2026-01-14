/**
 * Player Name Cache Service
 *
 * Module-level cache with batched Firestore queries for player names.
 * Prevents excessive reads during drag/drop operations.
 *
 * Features:
 * - Module-level cache shared across all components
 * - 50ms batch delay to collect IDs before fetching
 * - Uses Firestore 'in' query for batched fetches (up to 10 IDs per query)
 * - Subscribe/notify pattern for React re-renders
 *
 * FILE LOCATION: services/playerNameCache.ts
 * VERSION: V07.48
 */

import {
  collection,
  query,
  where,
  getDocs,
  documentId,
} from '@firebase/firestore';
import { db } from './firebase/config';
import type { LeagueMember } from '../types';

// ============================================
// MODULE-LEVEL STATE
// ============================================

/** Cache of playerId → displayName */
const nameCache = new Map<string, string>();

/** Pending fetch promises (prevents duplicate requests) */
const pendingFetches = new Map<string, Promise<string>>();

/** Queue of IDs waiting for batch fetch */
let batchQueue: string[] = [];

/** Batch fetch timeout handle */
let batchTimeout: ReturnType<typeof setTimeout> | null = null;

/** Delay before executing batch fetch (ms) */
const BATCH_DELAY = 50;

/** Listeners for cache updates (React re-renders) */
const listeners = new Set<() => void>();

// ============================================
// PUBLIC API
// ============================================

/**
 * Get a player name from cache, or queue for batch fetch.
 * Returns immediately with cached value or 'Loading...'
 *
 * @param playerId - The player's user ID
 * @returns Display name or 'Loading...' if not yet cached
 */
export function getCachedName(playerId: string): string {
  if (!playerId) return 'Unknown';

  if (nameCache.has(playerId)) {
    return nameCache.get(playerId)!;
  }

  // Queue for batch fetch if not already pending
  if (!pendingFetches.has(playerId)) {
    queueForBatch(playerId);
  }

  return 'Loading...';
}

/**
 * Pre-populate cache from league members array.
 * Call once when league loads for instant name resolution.
 *
 * @param members - Array of league members with userId and displayName
 */
export function populateCacheFromMembers(members: LeagueMember[]): void {
  let count = 0;
  for (const m of members) {
    const id = m.userId || m.id;
    const name = m.displayName;
    if (id && name && !nameCache.has(id)) {
      nameCache.set(id, name);
      count++;
    }
  }
  if (count > 0) {
    console.log(`[PlayerNameCache] Pre-populated ${count} names from members`);
    notifyListeners();
  }
}

/**
 * Pre-populate cache from a map of playerId → name.
 * Useful for bulk loading from any source.
 *
 * @param names - Map of playerId to displayName
 */
export function populateCacheFromMap(names: Map<string, string>): void {
  let count = 0;
  for (const [id, name] of names) {
    if (id && name && !nameCache.has(id)) {
      nameCache.set(id, name);
      count++;
    }
  }
  if (count > 0) {
    console.log(`[PlayerNameCache] Pre-populated ${count} names from map`);
    notifyListeners();
  }
}

/**
 * Clear entire cache (e.g., on logout)
 */
export function clearNameCache(): void {
  nameCache.clear();
  pendingFetches.clear();
  batchQueue = [];
  if (batchTimeout) {
    clearTimeout(batchTimeout);
    batchTimeout = null;
  }
  console.log('[PlayerNameCache] Cache cleared');
}

/**
 * Subscribe to cache updates for React re-renders.
 *
 * @param listener - Callback function when cache updates
 * @returns Unsubscribe function
 */
export function subscribeToCacheUpdates(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Get cache stats for debugging
 */
export function getCacheStats(): {
  size: number;
  pendingCount: number;
  queueLength: number;
} {
  return {
    size: nameCache.size,
    pendingCount: pendingFetches.size,
    queueLength: batchQueue.length,
  };
}

// ============================================
// INTERNAL FUNCTIONS
// ============================================

/**
 * Queue a player ID for batch fetching
 */
function queueForBatch(playerId: string): void {
  if (!batchQueue.includes(playerId)) {
    batchQueue.push(playerId);
  }
  // Reset the batch timer
  if (batchTimeout) {
    clearTimeout(batchTimeout);
  }
  batchTimeout = setTimeout(executeBatch, BATCH_DELAY);
}

/**
 * Execute batch fetch for all queued player IDs
 */
async function executeBatch(): Promise<void> {
  const idsToFetch = [...batchQueue];
  batchQueue = [];
  batchTimeout = null;

  if (idsToFetch.length === 0) return;

  console.log(`[PlayerNameCache] Fetching ${idsToFetch.length} player names`);

  // Create a single promise for this batch
  const batchPromise = fetchBatch(idsToFetch);

  // Register all IDs as pending
  for (const id of idsToFetch) {
    pendingFetches.set(
      id,
      batchPromise.then(() => nameCache.get(id) || 'Unknown')
    );
  }

  await batchPromise;

  // Clear pending status
  for (const id of idsToFetch) {
    pendingFetches.delete(id);
  }

  // Notify listeners that cache has been updated
  notifyListeners();
}

/**
 * Batch fetch player names from Firestore users collection
 */
async function fetchBatch(playerIds: string[]): Promise<void> {
  // Split into chunks of 10 (Firestore 'in' query limit)
  const chunks: string[][] = [];
  for (let i = 0; i < playerIds.length; i += 10) {
    chunks.push(playerIds.slice(i, i + 10));
  }

  for (const chunk of chunks) {
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where(documentId(), 'in', chunk));
      const snapshot = await getDocs(q);

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const displayName =
          data.displayName || data.email?.split('@')[0] || 'Unknown';
        nameCache.set(docSnap.id, displayName);
      }

      // Mark any not found as Unknown
      for (const id of chunk) {
        if (!nameCache.has(id)) {
          nameCache.set(id, 'Unknown');
        }
      }
    } catch (e) {
      console.warn('[PlayerNameCache] Batch fetch failed:', e);
      // Mark all as Unknown on error
      for (const id of chunk) {
        if (!nameCache.has(id)) {
          nameCache.set(id, 'Unknown');
        }
      }
    }
  }
}

/**
 * Notify all subscribed listeners that cache has been updated
 */
function notifyListeners(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch (e) {
      console.warn('[PlayerNameCache] Listener error:', e);
    }
  }
}

/**
 * Migration Script: Migrate Completed Matches to officialResult
 *
 * One-time migration to write officialResult to all completed matches
 * that don't already have it. This is a write-back migration, not
 * auto-migrate on read.
 *
 * Run via: firebase functions:call migrate_toOfficialResult
 *
 * FILE LOCATION: functions/src/migrations/migrateToOfficialResult.ts
 * VERSION: V07.04
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ============================================
// Types
// ============================================

interface MigrationResult {
  success: boolean;
  migratedCount: number;
  skippedCount: number;
  errorCount: number;
  errors: string[];
  duration: number;
}

interface Match {
  id: string;
  status: string;
  winnerId?: string;
  winnerName?: string;
  scores?: { gameNumber?: number; scoreA?: number; scoreB?: number }[];
  completedAt?: number;
  updatedAt?: number;
  officialResult?: object;
  scoreState?: string;
  scoreLocked?: boolean;
  migratedAt?: number;
  migratedFromLegacy?: boolean;
}

// ============================================
// Migration Functions
// ============================================

/**
 * Migrate a batch of matches to officialResult format
 */
async function migrateMatchBatch(
  matchRefs: admin.firestore.DocumentReference[],
  matchDocs: Match[]
): Promise<{ migrated: number; skipped: number; errors: string[] }> {
  const batch = db.batch();
  let migrated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < matchRefs.length; i++) {
    const ref = matchRefs[i];
    const match = matchDocs[i];

    try {
      // Skip if already has officialResult
      if (match.officialResult) {
        skipped++;
        continue;
      }

      // Skip if not completed or no winner
      if (match.status !== 'completed' || !match.winnerId) {
        skipped++;
        continue;
      }

      // Create officialResult from existing data
      const officialResult = {
        scores: match.scores || [],
        winnerId: match.winnerId,
        winnerName: match.winnerName || null,
        finalisedByUserId: 'system_migration_v07.04',
        finalisedAt: match.completedAt || match.updatedAt || Date.now(),
        version: 1,
      };

      // Update match with migration data
      batch.update(ref, {
        officialResult,
        scoreState: 'official',
        scoreLocked: true,
        scoreLockedAt: Date.now(),
        scoreLockedByUserId: 'system_migration_v07.04',
        migratedAt: Date.now(),
        migratedFromLegacy: true,
      });

      migrated++;
    } catch (error) {
      errors.push(`${ref.path}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Commit batch
  if (migrated > 0) {
    await batch.commit();
  }

  return { migrated, skipped, errors };
}

/**
 * Migrate all completed matches in a collection
 */
async function migrateCollection(
  collectionPath: string,
  matchesSubpath: string
): Promise<{ migrated: number; skipped: number; errors: string[] }> {
  let totalMigrated = 0;
  let totalSkipped = 0;
  const allErrors: string[] = [];

  // Get all documents in the collection
  const docs = await db.collection(collectionPath).get();

  for (const doc of docs.docs) {
    // Get all completed matches without officialResult
    const matchesRef = db.collection(`${collectionPath}/${doc.id}/${matchesSubpath}`);
    const matchesSnapshot = await matchesRef
      .where('status', '==', 'completed')
      .get();

    if (matchesSnapshot.empty) continue;

    // Filter to those without officialResult (can't do this in query)
    const matchesToMigrate: admin.firestore.DocumentReference[] = [];
    const matchDocs: Match[] = [];

    for (const matchDoc of matchesSnapshot.docs) {
      const data = matchDoc.data() as Match;
      if (!data.officialResult && data.winnerId) {
        matchesToMigrate.push(matchDoc.ref);
        matchDocs.push({ id: matchDoc.id, ...data });
      }
    }

    if (matchesToMigrate.length === 0) continue;

    // Process in batches of 500 (Firestore limit)
    for (let i = 0; i < matchesToMigrate.length; i += 500) {
      const batchRefs = matchesToMigrate.slice(i, i + 500);
      const batchDocs = matchDocs.slice(i, i + 500);

      const result = await migrateMatchBatch(batchRefs, batchDocs);
      totalMigrated += result.migrated;
      totalSkipped += result.skipped;
      allErrors.push(...result.errors);
    }
  }

  return {
    migrated: totalMigrated,
    skipped: totalSkipped,
    errors: allErrors,
  };
}

// ============================================
// Callable Function
// ============================================

/**
 * Migrate all completed matches to officialResult format
 *
 * This is a one-time migration that should be run once after deploying V07.04.
 * It writes officialResult to all completed matches that don't have it.
 *
 * Callable via: firebase functions:call migrate_toOfficialResult
 * Or via Admin SDK: functions.httpsCallable('migrate_toOfficialResult')
 */
export const migrate_toOfficialResult = functions
  .runWith({
    timeoutSeconds: 540, // 9 minutes (max for callable)
    memory: '1GB',
  })
  .https.onCall(async (_data, context): Promise<MigrationResult> => {
    const startTime = Date.now();

    // Verify caller is admin
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    // Check if user is app admin
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const userData = userDoc.data();

    if (!userData?.isAppAdmin) {
      throw new functions.https.HttpsError('permission-denied', 'Only app admins can run migrations');
    }

    console.log('[Migration] Starting officialResult migration...');

    let totalMigrated = 0;
    let totalSkipped = 0;
    const allErrors: string[] = [];

    try {
      // Migrate tournament matches
      console.log('[Migration] Processing tournaments...');
      const tournamentResult = await migrateCollection('tournaments', 'matches');
      totalMigrated += tournamentResult.migrated;
      totalSkipped += tournamentResult.skipped;
      allErrors.push(...tournamentResult.errors);
      console.log(`[Migration] Tournaments: ${tournamentResult.migrated} migrated, ${tournamentResult.skipped} skipped`);

      // Migrate league matches
      console.log('[Migration] Processing leagues...');
      const leagueResult = await migrateCollection('leagues', 'matches');
      totalMigrated += leagueResult.migrated;
      totalSkipped += leagueResult.skipped;
      allErrors.push(...leagueResult.errors);
      console.log(`[Migration] Leagues: ${leagueResult.migrated} migrated, ${leagueResult.skipped} skipped`);

      // Migrate meetup matches
      console.log('[Migration] Processing meetups...');
      const meetupResult = await migrateCollection('meetups', 'matches');
      totalMigrated += meetupResult.migrated;
      totalSkipped += meetupResult.skipped;
      allErrors.push(...meetupResult.errors);
      console.log(`[Migration] Meetups: ${meetupResult.migrated} migrated, ${meetupResult.skipped} skipped`);

    } catch (error) {
      console.error('[Migration] Error:', error);
      allErrors.push(`Global error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    const duration = Date.now() - startTime;

    console.log(`[Migration] Complete. Migrated: ${totalMigrated}, Skipped: ${totalSkipped}, Errors: ${allErrors.length}`);
    console.log(`[Migration] Duration: ${duration}ms`);

    return {
      success: allErrors.length === 0,
      migratedCount: totalMigrated,
      skippedCount: totalSkipped,
      errorCount: allErrors.length,
      errors: allErrors.slice(0, 100), // Limit error messages returned
      duration,
    };
  });

/**
 * Dry run migration to see what would be migrated
 */
export const migrate_dryRun = functions
  .runWith({
    timeoutSeconds: 300,
    memory: '512MB',
  })
  .https.onCall(async (_data, context): Promise<{ wouldMigrate: number; byCollection: Record<string, number> }> => {
    // Verify caller is admin
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const userData = userDoc.data();

    if (!userData?.isAppAdmin) {
      throw new functions.https.HttpsError('permission-denied', 'Only app admins can run migrations');
    }

    console.log('[Migration] Running dry run...');

    const byCollection: Record<string, number> = {
      tournaments: 0,
      leagues: 0,
      meetups: 0,
    };

    // Count tournament matches needing migration
    const tournaments = await db.collection('tournaments').get();
    for (const doc of tournaments.docs) {
      const matches = await db.collection(`tournaments/${doc.id}/matches`)
        .where('status', '==', 'completed')
        .get();

      for (const matchDoc of matches.docs) {
        const data = matchDoc.data();
        if (!data.officialResult && data.winnerId) {
          byCollection.tournaments++;
        }
      }
    }

    // Count league matches needing migration
    const leagues = await db.collection('leagues').get();
    for (const doc of leagues.docs) {
      const matches = await db.collection(`leagues/${doc.id}/matches`)
        .where('status', '==', 'completed')
        .get();

      for (const matchDoc of matches.docs) {
        const data = matchDoc.data();
        if (!data.officialResult && data.winnerId) {
          byCollection.leagues++;
        }
      }
    }

    // Count meetup matches needing migration
    const meetups = await db.collection('meetups').get();
    for (const doc of meetups.docs) {
      const matches = await db.collection(`meetups/${doc.id}/matches`)
        .where('status', '==', 'completed')
        .get();

      for (const matchDoc of matches.docs) {
        const data = matchDoc.data();
        if (!data.officialResult && data.winnerId) {
          byCollection.meetups++;
        }
      }
    }

    const total = byCollection.tournaments + byCollection.leagues + byCollection.meetups;

    console.log(`[Migration] Dry run complete. Would migrate: ${total}`);
    console.log(`[Migration] By collection:`, byCollection);

    return {
      wouldMigrate: total,
      byCollection,
    };
  });

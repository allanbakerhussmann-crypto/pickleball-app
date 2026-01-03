/**
 * Migration: Mark Organizers for Agreement Re-acceptance
 *
 * One-time migration to mark existing organizers as needing
 * to accept the V1.7 Organiser Agreement.
 *
 * V07.05 Organizer Agreement System
 *
 * FILE LOCATION: functions/src/migrations/markOrganizersForAgreement.ts
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Current agreement version
const CURRENT_ORGANIZER_AGREEMENT_VERSION = 'V1.7';

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if the calling user is an app admin
 */
async function isAppAdmin(userId: string): Promise<boolean> {
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) return false;

  const userData = userDoc.data();
  return userData?.isAppAdmin === true ||
         userData?.isRootAdmin === true ||
         (userData?.roles && (userData.roles.includes('app_admin') || userData.roles.includes('admin')));
}

/**
 * Check if a user's agreement is current
 */
function isAgreementCurrent(agreement: any): boolean {
  if (!agreement) return false;
  if (agreement.version !== CURRENT_ORGANIZER_AGREEMENT_VERSION) return false;
  const { mainAcceptance, integrityConfirmation, privacyConfirmation } = agreement.acceptedCheckboxes || {};
  return mainAcceptance && integrityConfirmation && privacyConfirmation;
}

// ============================================
// MIGRATION FUNCTIONS
// ============================================

/**
 * Mark all existing organizers as needing agreement re-acceptance
 * Only callable by app admins
 */
export const migrate_markOrganizersForAgreement = functions.https.onCall(
  async (data: { dryRun?: boolean }, context) => {
    // Verify caller is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'You must be logged in to perform this action.'
      );
    }

    const callerId = context.auth.uid;

    // Verify caller is an admin
    const callerIsAdmin = await isAppAdmin(callerId);
    if (!callerIsAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only app admins can run migrations.'
      );
    }

    const isDryRun = data?.dryRun ?? false;
    const now = Date.now();

    // Query all users with organizer role
    const usersRef = db.collection('users');
    const snapshot = await usersRef
      .where('roles', 'array-contains', 'organizer')
      .get();

    const results = {
      totalOrganizers: snapshot.docs.length,
      alreadyCurrent: 0,
      markedForReacceptance: 0,
      skipped: 0,
      errors: [] as string[],
    };

    // Process in batches of 500 (Firestore limit)
    const batchSize = 500;
    let batch = db.batch();
    let batchCount = 0;

    for (const doc of snapshot.docs) {
      const user = doc.data();

      // Skip if already has current agreement
      if (isAgreementCurrent(user.organizerAgreement)) {
        results.alreadyCurrent++;
        continue;
      }

      // Skip app admins (they'll still be blocked but we don't force-mark them)
      // Actually, we should mark them too for consistency
      // if (user.isAppAdmin || user.isRootAdmin) {
      //   results.skipped++;
      //   continue;
      // }

      if (!isDryRun) {
        try {
          batch.update(doc.ref, {
            organizerAgreementRequired: true,
            updatedAt: now,
          });
          batchCount++;

          // Commit batch if we hit the limit
          if (batchCount >= batchSize) {
            await batch.commit();
            batch = db.batch();
            batchCount = 0;
          }
        } catch (err: any) {
          results.errors.push(`Failed to update ${doc.id}: ${err.message}`);
        }
      }

      results.markedForReacceptance++;
    }

    // Commit any remaining updates
    if (batchCount > 0 && !isDryRun) {
      await batch.commit();
    }

    // Log the migration
    if (!isDryRun) {
      await db.collection('admin_audit_logs').add({
        action: 'migration_mark_organizers_for_agreement',
        performedBy: callerId,
        results: {
          totalOrganizers: results.totalOrganizers,
          alreadyCurrent: results.alreadyCurrent,
          markedForReacceptance: results.markedForReacceptance,
          errorCount: results.errors.length,
        },
        timestamp: now,
      });
    }

    return {
      success: true,
      dryRun: isDryRun,
      ...results,
    };
  }
);

/**
 * Get statistics on organizer agreement status
 * Only callable by app admins
 */
export const migrate_getOrganizerAgreementStats = functions.https.onCall(
  async (_data, context) => {
    // Verify caller is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'You must be logged in to perform this action.'
      );
    }

    const callerId = context.auth.uid;

    // Verify caller is an admin
    const callerIsAdmin = await isAppAdmin(callerId);
    if (!callerIsAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only app admins can view migration stats.'
      );
    }

    // Query all organizers
    const snapshot = await db.collection('users')
      .where('roles', 'array-contains', 'organizer')
      .get();

    const stats = {
      totalOrganizers: snapshot.docs.length,
      withCurrentAgreement: 0,
      withOutdatedAgreement: 0,
      withNoAgreement: 0,
      markedAsRequired: 0,
      byVersion: {} as Record<string, number>,
    };

    for (const doc of snapshot.docs) {
      const user = doc.data();
      const agreement = user.organizerAgreement;

      if (!agreement) {
        stats.withNoAgreement++;
      } else if (agreement.version === CURRENT_ORGANIZER_AGREEMENT_VERSION) {
        stats.withCurrentAgreement++;
      } else {
        stats.withOutdatedAgreement++;
      }

      // Track by version
      const version = agreement?.version || 'none';
      stats.byVersion[version] = (stats.byVersion[version] || 0) + 1;

      // Track required flag
      if (user.organizerAgreementRequired) {
        stats.markedAsRequired++;
      }
    }

    return stats;
  }
);

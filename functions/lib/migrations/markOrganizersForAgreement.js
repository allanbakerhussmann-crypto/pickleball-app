"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrate_getOrganizerAgreementStats = exports.migrate_markOrganizersForAgreement = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
// Current agreement version
const CURRENT_ORGANIZER_AGREEMENT_VERSION = 'V1.7';
// ============================================
// HELPER FUNCTIONS
// ============================================
/**
 * Check if the calling user is an app admin
 */
async function isAppAdmin(userId) {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists)
        return false;
    const userData = userDoc.data();
    return (userData === null || userData === void 0 ? void 0 : userData.isAppAdmin) === true ||
        (userData === null || userData === void 0 ? void 0 : userData.isRootAdmin) === true ||
        ((userData === null || userData === void 0 ? void 0 : userData.roles) && (userData.roles.includes('app_admin') || userData.roles.includes('admin')));
}
/**
 * Check if a user's agreement is current
 */
function isAgreementCurrent(agreement) {
    if (!agreement)
        return false;
    if (agreement.version !== CURRENT_ORGANIZER_AGREEMENT_VERSION)
        return false;
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
exports.migrate_markOrganizersForAgreement = functions.https.onCall(async (data, context) => {
    var _a;
    // Verify caller is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'You must be logged in to perform this action.');
    }
    const callerId = context.auth.uid;
    // Verify caller is an admin
    const callerIsAdmin = await isAppAdmin(callerId);
    if (!callerIsAdmin) {
        throw new functions.https.HttpsError('permission-denied', 'Only app admins can run migrations.');
    }
    const isDryRun = (_a = data === null || data === void 0 ? void 0 : data.dryRun) !== null && _a !== void 0 ? _a : false;
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
        errors: [],
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
            }
            catch (err) {
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
    return Object.assign({ success: true, dryRun: isDryRun }, results);
});
/**
 * Get statistics on organizer agreement status
 * Only callable by app admins
 */
exports.migrate_getOrganizerAgreementStats = functions.https.onCall(async (_data, context) => {
    // Verify caller is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'You must be logged in to perform this action.');
    }
    const callerId = context.auth.uid;
    // Verify caller is an admin
    const callerIsAdmin = await isAppAdmin(callerId);
    if (!callerIsAdmin) {
        throw new functions.https.HttpsError('permission-denied', 'Only app admins can view migration stats.');
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
        byVersion: {},
    };
    for (const doc of snapshot.docs) {
        const user = doc.data();
        const agreement = user.organizerAgreement;
        if (!agreement) {
            stats.withNoAgreement++;
        }
        else if (agreement.version === CURRENT_ORGANIZER_AGREEMENT_VERSION) {
            stats.withCurrentAgreement++;
        }
        else {
            stats.withOutdatedAgreement++;
        }
        // Track by version
        const version = (agreement === null || agreement === void 0 ? void 0 : agreement.version) || 'none';
        stats.byVersion[version] = (stats.byVersion[version] || 0) + 1;
        // Track required flag
        if (user.organizerAgreementRequired) {
            stats.markedAsRequired++;
        }
    }
    return stats;
});
//# sourceMappingURL=markOrganizersForAgreement.js.map
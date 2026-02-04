"use strict";
/**
 * User Account Cloud Functions
 *
 * Server-side functions for user account operations including:
 * - Account deletion (with cascade data cleanup)
 *
 * FILE LOCATION: functions/src/userAccount.ts
 * VERSION: V07.53
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
exports.user_deleteAccount = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const db = admin.firestore();
const auth = admin.auth();
const storage = admin.storage();
// ============================================
// ACCOUNT DELETION
// ============================================
/**
 * Delete user account and all associated data
 *
 * This function:
 * 1. Deletes the user's Firestore profile document
 * 2. Deletes tournament registrations
 * 3. Deletes league memberships (subcollections)
 * 4. Deletes meetup RSVPs (subcollections)
 * 5. Deletes court bookings
 * 6. Deletes profile images from Storage
 * 7. Deletes the Firebase Auth account
 *
 * User must be authenticated and can only delete their own account.
 */
exports.user_deleteAccount = functions.https.onCall(async (_data, context) => {
    // Verify caller is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'You must be logged in to delete your account.');
    }
    const userId = context.auth.uid;
    const result = {
        success: false,
        message: '',
        deletedData: {
            profile: false,
            registrations: 0,
            leagueMemberships: 0,
            meetupRsvps: 0,
            courtBookings: 0,
            profileImage: false,
        },
    };
    try {
        // Use a batch for atomic Firestore operations
        const batch = db.batch();
        // 1. Delete user profile
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'User profile not found.');
        }
        batch.delete(userRef);
        result.deletedData.profile = true;
        // 2. Delete tournament registrations
        const registrationsSnap = await db.collection('registrations')
            .where('userId', '==', userId)
            .get();
        registrationsSnap.docs.forEach((doc) => {
            batch.delete(doc.ref);
            result.deletedData.registrations++;
        });
        // 3. Delete league memberships (across all leagues)
        const leaguesSnap = await db.collection('leagues').get();
        for (const leagueDoc of leaguesSnap.docs) {
            const membersSnap = await db.collection('leagues')
                .doc(leagueDoc.id)
                .collection('members')
                .where('userId', '==', userId)
                .get();
            membersSnap.docs.forEach((doc) => {
                batch.delete(doc.ref);
                result.deletedData.leagueMemberships++;
            });
        }
        // 4. Delete meetup RSVPs (across all meetups)
        const meetupsSnap = await db.collection('meetups').get();
        for (const meetupDoc of meetupsSnap.docs) {
            const rsvpsSnap = await db.collection('meetups')
                .doc(meetupDoc.id)
                .collection('rsvps')
                .where('userId', '==', userId)
                .get();
            rsvpsSnap.docs.forEach((doc) => {
                batch.delete(doc.ref);
                result.deletedData.meetupRsvps++;
            });
        }
        // 5. Delete court bookings
        const bookingsSnap = await db.collection('courtBookings')
            .where('userId', '==', userId)
            .get();
        bookingsSnap.docs.forEach((doc) => {
            batch.delete(doc.ref);
            result.deletedData.courtBookings++;
        });
        // Commit all Firestore deletions
        await batch.commit();
        // 6. Delete profile images from Storage
        try {
            const bucket = storage.bucket();
            const [files] = await bucket.getFiles({ prefix: `profile_images/${userId}` });
            for (const file of files) {
                await file.delete();
                result.deletedData.profileImage = true;
            }
        }
        catch (storageError) {
            // Storage deletion is non-critical, continue even if it fails
            console.warn('Could not delete profile image:', storageError);
        }
        // 7. Delete Firebase Auth account
        try {
            await auth.deleteUser(userId);
        }
        catch (authError) {
            // If auth deletion fails, the data is already deleted
            // Log this for investigation but don't fail the entire operation
            console.error('Failed to delete auth account:', authError);
            // Log for admin review
            await db.collection('admin_audit_logs').add({
                action: 'account_deletion_auth_failed',
                userId,
                error: authError.message || 'Unknown auth deletion error',
                timestamp: Date.now(),
            });
        }
        // Log successful deletion
        await db.collection('admin_audit_logs').add({
            action: 'account_deleted',
            userId,
            deletedData: result.deletedData,
            timestamp: Date.now(),
        });
        result.success = true;
        result.message = 'Account and all data deleted successfully';
        return result;
    }
    catch (error) {
        console.error('Error deleting user account:', error);
        // Log failed deletion attempt
        await db.collection('admin_audit_logs').add({
            action: 'account_deletion_failed',
            userId,
            error: error.message || 'Unknown error',
            timestamp: Date.now(),
        });
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', error.message || 'Failed to delete account. Please contact support.');
    }
});
//# sourceMappingURL=userAccount.js.map
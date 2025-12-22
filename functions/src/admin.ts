/**
 * Admin Cloud Functions
 *
 * Secure server-side functions for admin operations.
 * These functions verify the caller is an admin before executing.
 *
 * FILE LOCATION: functions/src/admin.ts
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

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
  // Check for both 'app_admin' (new) and 'admin' (legacy) role names
  return userData?.isAppAdmin === true ||
         userData?.isRootAdmin === true ||
         (userData?.roles && (userData.roles.includes('app_admin') || userData.roles.includes('admin')));
}

/**
 * Check if the calling user is a root admin (cannot be demoted)
 */
async function isRootAdmin(userId: string): Promise<boolean> {
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) return false;

  const userData = userDoc.data();
  return userData?.isRootAdmin === true;
}

// ============================================
// ADMIN ROLE MANAGEMENT
// ============================================

/**
 * Promote a user to App Admin
 * Only callable by existing app admins
 */
export const admin_promoteToAppAdmin = functions.https.onCall(
  async (data: { targetUserId: string }, context) => {
    // Verify caller is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'You must be logged in to perform this action.'
      );
    }

    const callerId = context.auth.uid;
    const { targetUserId } = data;

    if (!targetUserId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Target user ID is required.'
      );
    }

    // Verify caller is an admin
    const callerIsAdmin = await isAppAdmin(callerId);
    if (!callerIsAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only app admins can promote users to admin.'
      );
    }

    // Check if target user exists
    const targetUserRef = db.collection('users').doc(targetUserId);
    const targetUserDoc = await targetUserRef.get();

    if (!targetUserDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Target user not found.'
      );
    }

    // Promote the user
    await targetUserRef.update({
      roles: admin.firestore.FieldValue.arrayUnion('app_admin'),
      isAppAdmin: true,
      promotedBy: callerId,
      promotedAt: Date.now(),
      updatedAt: Date.now()
    });

    // Log the action
    await db.collection('admin_audit_logs').add({
      action: 'promote_to_admin',
      targetUserId,
      performedBy: callerId,
      timestamp: Date.now()
    });

    return { success: true, message: 'User promoted to admin successfully.' };
  }
);

/**
 * Demote a user from App Admin
 * Only callable by existing app admins
 * Cannot demote root admins or yourself
 */
export const admin_demoteFromAppAdmin = functions.https.onCall(
  async (data: { targetUserId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'You must be logged in to perform this action.'
      );
    }

    const callerId = context.auth.uid;
    const { targetUserId } = data;

    if (!targetUserId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Target user ID is required.'
      );
    }

    // Cannot demote yourself
    if (callerId === targetUserId) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'You cannot demote yourself from admin.'
      );
    }

    // Verify caller is an admin
    const callerIsAdmin = await isAppAdmin(callerId);
    if (!callerIsAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only app admins can demote users from admin.'
      );
    }

    // Check if target is a root admin (cannot be demoted)
    const targetIsRoot = await isRootAdmin(targetUserId);
    if (targetIsRoot) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Root admins cannot be demoted.'
      );
    }

    // Demote the user
    const targetUserRef = db.collection('users').doc(targetUserId);
    await targetUserRef.update({
      roles: admin.firestore.FieldValue.arrayRemove('app_admin'),
      isAppAdmin: false,
      demotedBy: callerId,
      demotedAt: Date.now(),
      updatedAt: Date.now()
    });

    // Log the action
    await db.collection('admin_audit_logs').add({
      action: 'demote_from_admin',
      targetUserId,
      performedBy: callerId,
      timestamp: Date.now()
    });

    return { success: true, message: 'User demoted from admin successfully.' };
  }
);

/**
 * Promote a user to Organizer role
 * Only callable by app admins
 */
export const admin_promoteToOrganizer = functions.https.onCall(
  async (data: { targetUserId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'You must be logged in to perform this action.'
      );
    }

    const callerId = context.auth.uid;
    const { targetUserId } = data;

    if (!targetUserId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Target user ID is required.'
      );
    }

    // Verify caller is an admin
    const callerIsAdmin = await isAppAdmin(callerId);
    if (!callerIsAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only app admins can promote users to organizer.'
      );
    }

    // Promote the user
    const targetUserRef = db.collection('users').doc(targetUserId);
    await targetUserRef.update({
      roles: admin.firestore.FieldValue.arrayUnion('organizer'),
      updatedAt: Date.now()
    });

    // Log the action
    await db.collection('admin_audit_logs').add({
      action: 'promote_to_organizer',
      targetUserId,
      performedBy: callerId,
      timestamp: Date.now()
    });

    return { success: true, message: 'User promoted to organizer successfully.' };
  }
);

/**
 * Demote a user from Organizer role
 * Only callable by app admins
 */
export const admin_demoteFromOrganizer = functions.https.onCall(
  async (data: { targetUserId: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'You must be logged in to perform this action.'
      );
    }

    const callerId = context.auth.uid;
    const { targetUserId } = data;

    if (!targetUserId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Target user ID is required.'
      );
    }

    // Verify caller is an admin
    const callerIsAdmin = await isAppAdmin(callerId);
    if (!callerIsAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only app admins can demote users from organizer.'
      );
    }

    // Demote the user
    const targetUserRef = db.collection('users').doc(targetUserId);
    await targetUserRef.update({
      roles: admin.firestore.FieldValue.arrayRemove('organizer'),
      updatedAt: Date.now()
    });

    // Log the action
    await db.collection('admin_audit_logs').add({
      action: 'demote_from_organizer',
      targetUserId,
      performedBy: callerId,
      timestamp: Date.now()
    });

    return { success: true, message: 'User demoted from organizer successfully.' };
  }
);

/**
 * Get admin audit logs
 * Only callable by app admins
 */
export const admin_getAuditLogs = functions.https.onCall(
  async (data: { limit?: number }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'You must be logged in to perform this action.'
      );
    }

    const callerId = context.auth.uid;
    const callerIsAdmin = await isAppAdmin(callerId);

    if (!callerIsAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only app admins can view audit logs.'
      );
    }

    const logsLimit = data.limit || 100;
    const logsSnap = await db.collection('admin_audit_logs')
      .orderBy('timestamp', 'desc')
      .limit(logsLimit)
      .get();

    return logsSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  }
);

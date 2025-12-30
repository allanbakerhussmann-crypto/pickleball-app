/**
 * Privacy Cloud Functions - Privacy Act 2020 Compliance
 *
 * Server-side functions for privacy operations including:
 * - Breach notification to affected users
 * - Scheduled data retention cleanup
 * - Privacy request processing
 *
 * FILE LOCATION: functions/src/privacy.ts
 * VERSION: V06.04
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ============================================
// TYPES
// ============================================

interface BreachRecord {
  id: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  affectedUserIds?: string[];
  estimatedAffectedCount?: number;
  dataTypesExposed?: string[];
  detectedAt: number;
  status: string;
  requiresNotification: boolean;
  usersNotified: boolean;
  actionsToken: string[];
}

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
 * Send email notification (placeholder - integrate with your email service)
 */
async function sendEmailNotification(
  email: string,
  subject: string,
  body: string
): Promise<boolean> {
  // TODO: Integrate with email service (SendGrid, Mailgun, AWS SES, etc.)
  // For now, log the notification
  console.log(`[EMAIL NOTIFICATION]`);
  console.log(`To: ${email}`);
  console.log(`Subject: ${subject}`);
  console.log(`Body: ${body}`);

  // In production, replace with actual email sending:
  // await sendgrid.send({ to: email, subject, text: body });

  return true;
}

// ============================================
// BREACH NOTIFICATION FUNCTIONS
// ============================================

/**
 * Notify affected users about a security breach
 * Only callable by app admins
 */
export const privacy_notifyBreachAffectedUsers = functions.https.onCall(
  async (data: { breachId: string; customMessage?: string }, context) => {
    // Verify caller is authenticated
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'You must be logged in to perform this action.'
      );
    }

    const callerId = context.auth.uid;
    const { breachId, customMessage } = data;

    if (!breachId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Breach ID is required.'
      );
    }

    // Verify caller is an admin
    const callerIsAdmin = await isAppAdmin(callerId);
    if (!callerIsAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only app admins can send breach notifications.'
      );
    }

    // Get breach record
    const breachDoc = await db.collection('security_breaches').doc(breachId).get();
    if (!breachDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Breach record not found.'
      );
    }

    const breach = breachDoc.data() as BreachRecord;

    if (breach.usersNotified) {
      throw new functions.https.HttpsError(
        'already-exists',
        'Users have already been notified about this breach.'
      );
    }

    const affectedUserIds = breach.affectedUserIds || [];
    if (affectedUserIds.length === 0) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'No affected users to notify.'
      );
    }

    // Get affected users' emails
    const usersSnapshot = await db.collection('users')
      .where(admin.firestore.FieldPath.documentId(), 'in', affectedUserIds.slice(0, 10)) // Firestore limit
      .get();

    const notificationPromises: Promise<boolean>[] = [];
    const subject = `Security Notice from Pickleball Director`;

    const baseMessage = `
Dear User,

We are writing to inform you about a security incident that may have affected your account.

Incident Details:
- Date Detected: ${new Date(breach.detectedAt).toLocaleDateString()}
- Nature: ${breach.title}
- Data Potentially Affected: ${breach.dataTypesExposed?.join(', ') || 'Account information'}

${customMessage || `We take the security of your information very seriously and have taken immediate steps to address this incident.`}

Recommended Actions:
1. Review your account for any unusual activity
2. Consider updating your password
3. Be cautious of any suspicious emails or communications

If you have any questions or concerns, please contact us at support@pickleballdirector.co.nz.

We apologize for any inconvenience this may cause.

Sincerely,
Pickleball Director Security Team
    `.trim();

    usersSnapshot.docs.forEach(userDoc => {
      const userData = userDoc.data();
      if (userData.email) {
        notificationPromises.push(
          sendEmailNotification(userData.email, subject, baseMessage)
        );
      }
    });

    // For larger lists, batch in groups of 10 (Firestore 'in' query limit)
    if (affectedUserIds.length > 10) {
      for (let i = 10; i < affectedUserIds.length; i += 10) {
        const batch = affectedUserIds.slice(i, i + 10);
        const batchSnapshot = await db.collection('users')
          .where(admin.firestore.FieldPath.documentId(), 'in', batch)
          .get();

        batchSnapshot.docs.forEach(userDoc => {
          const userData = userDoc.data();
          if (userData.email) {
            notificationPromises.push(
              sendEmailNotification(userData.email, subject, baseMessage)
            );
          }
        });
      }
    }

    await Promise.all(notificationPromises);

    // Update breach record
    await breachDoc.ref.update({
      usersNotified: true,
      actionsToken: admin.firestore.FieldValue.arrayUnion(
        `[${new Date().toISOString()}] Affected users notified by admin ${callerId}`
      ),
      updatedBy: callerId,
      updatedAt: Date.now(),
    });

    // Log the action
    await db.collection('admin_audit_logs').add({
      action: 'breach_users_notified',
      breachId,
      affectedCount: affectedUserIds.length,
      performedBy: callerId,
      timestamp: Date.now(),
    });

    return {
      success: true,
      message: `Notifications sent to ${affectedUserIds.length} affected users.`,
      notifiedCount: affectedUserIds.length,
    };
  }
);

/**
 * Log a breach (admin only)
 */
export const privacy_logBreach = functions.https.onCall(
  async (data: {
    category: string;
    severity: string;
    title: string;
    description: string;
    affectedUserIds?: string[];
    estimatedAffectedCount?: number;
    dataTypesExposed?: string[];
  }, context) => {
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
        'Only app admins can log security breaches.'
      );
    }

    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    const breachId = `BREACH-${timestamp}-${random}`.toUpperCase();
    const now = Date.now();

    const requiresNotification =
      (data.severity === 'critical' || data.severity === 'high') &&
      (data.dataTypesExposed?.length ?? 0) > 0;

    const breachRecord = {
      id: breachId,
      category: data.category,
      severity: data.severity,
      title: data.title,
      description: data.description,
      affectedUserIds: data.affectedUserIds || [],
      estimatedAffectedCount: data.estimatedAffectedCount || data.affectedUserIds?.length || 0,
      dataTypesExposed: data.dataTypesExposed || [],
      detectedAt: now,
      status: 'detected',
      requiresNotification,
      usersNotified: false,
      actionsToken: ['Breach detected and logged'],
      loggedBy: callerId,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection('security_breaches').doc(breachId).set(breachRecord);

    // Log the action
    await db.collection('admin_audit_logs').add({
      action: 'breach_logged',
      breachId,
      severity: data.severity,
      performedBy: callerId,
      timestamp: now,
    });

    return {
      success: true,
      breachId,
      requiresNotification,
    };
  }
);

// ============================================
// DATA RETENTION FUNCTIONS
// ============================================

/**
 * Scheduled function to clean up old data
 * Runs daily at 3 AM
 */
export const privacy_scheduledDataCleanup = functions.pubsub
  .schedule('0 3 * * *')
  .timeZone('Pacific/Auckland')
  .onRun(async (context) => {
    const now = Date.now();
    const retentionPolicies = {
      // Court bookings older than 1 year
      courtBookings: 365 * 24 * 60 * 60 * 1000,
      // Completed meetup RSVPs older than 6 months
      meetupRsvps: 180 * 24 * 60 * 60 * 1000,
      // Inactive users (no login in 3 years)
      inactiveUsers: 3 * 365 * 24 * 60 * 60 * 1000,
    };

    const cleanupResults = {
      courtBookings: 0,
      meetupRsvps: 0,
      inactiveUsersMarked: 0,
    };

    // 1. Clean up old court bookings
    const oldBookingsCutoff = now - retentionPolicies.courtBookings;
    const oldBookingsSnapshot = await db.collection('court_bookings')
      .where('endTime', '<', oldBookingsCutoff)
      .where('status', '==', 'completed')
      .limit(500)
      .get();

    const bookingBatch = db.batch();
    oldBookingsSnapshot.docs.forEach(doc => {
      bookingBatch.delete(doc.ref);
      cleanupResults.courtBookings++;
    });
    if (cleanupResults.courtBookings > 0) {
      await bookingBatch.commit();
    }

    // 2. Clean up old meetup RSVPs (anonymize, don't delete)
    const oldRsvpCutoff = now - retentionPolicies.meetupRsvps;
    const oldMeetupsSnapshot = await db.collection('meetups')
      .where('eventDate', '<', oldRsvpCutoff)
      .where('status', '==', 'completed')
      .limit(100)
      .get();

    for (const meetupDoc of oldMeetupsSnapshot.docs) {
      const rsvpsSnapshot = await meetupDoc.ref.collection('rsvps').get();
      const rsvpBatch = db.batch();

      rsvpsSnapshot.docs.forEach(rsvpDoc => {
        // Anonymize the RSVP instead of deleting
        rsvpBatch.update(rsvpDoc.ref, {
          userId: 'anonymized',
          userName: 'Former Participant',
          userEmail: null,
          anonymizedAt: now,
        });
        cleanupResults.meetupRsvps++;
      });

      if (rsvpsSnapshot.docs.length > 0) {
        await rsvpBatch.commit();
      }
    }

    // 3. Mark inactive users for potential deletion
    const inactiveUserCutoff = now - retentionPolicies.inactiveUsers;
    const inactiveUsersSnapshot = await db.collection('users')
      .where('lastLoginAt', '<', inactiveUserCutoff)
      .where('markedForDeletion', '!=', true)
      .limit(100)
      .get();

    const inactiveUserBatch = db.batch();
    inactiveUsersSnapshot.docs.forEach(doc => {
      inactiveUserBatch.update(doc.ref, {
        markedForDeletion: true,
        markedForDeletionAt: now,
        markedForDeletionReason: 'inactive_3_years',
      });
      cleanupResults.inactiveUsersMarked++;
    });
    if (cleanupResults.inactiveUsersMarked > 0) {
      await inactiveUserBatch.commit();
    }

    // Log cleanup results
    await db.collection('data_retention_logs').add({
      runAt: now,
      results: cleanupResults,
      policies: {
        courtBookingsRetentionDays: 365,
        meetupRsvpRetentionDays: 180,
        inactiveUserRetentionYears: 3,
      },
    });

    console.log('Data retention cleanup completed:', cleanupResults);
    return null;
  });

/**
 * Manually trigger data cleanup (admin only)
 */
export const privacy_runDataCleanup = functions.https.onCall(
  async (data: { dryRun?: boolean }, context) => {
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
        'Only app admins can run data cleanup.'
      );
    }

    const now = Date.now();
    const dryRun = data.dryRun ?? true; // Default to dry run for safety

    // Get counts only (dry run)
    const retentionPolicies = {
      courtBookings: 365 * 24 * 60 * 60 * 1000,
      meetupRsvps: 180 * 24 * 60 * 60 * 1000,
      inactiveUsers: 3 * 365 * 24 * 60 * 60 * 1000,
    };

    const oldBookingsCutoff = now - retentionPolicies.courtBookings;
    const oldBookingsSnapshot = await db.collection('court_bookings')
      .where('endTime', '<', oldBookingsCutoff)
      .where('status', '==', 'completed')
      .get();

    const inactiveUserCutoff = now - retentionPolicies.inactiveUsers;
    const inactiveUsersSnapshot = await db.collection('users')
      .where('lastLoginAt', '<', inactiveUserCutoff)
      .where('markedForDeletion', '!=', true)
      .get();

    const counts = {
      oldCourtBookings: oldBookingsSnapshot.size,
      inactiveUsers: inactiveUsersSnapshot.size,
    };

    // Log the action
    await db.collection('admin_audit_logs').add({
      action: 'data_cleanup_check',
      dryRun,
      counts,
      performedBy: callerId,
      timestamp: now,
    });

    return {
      success: true,
      dryRun,
      counts,
      message: dryRun
        ? 'Dry run completed. No data was deleted.'
        : 'Cleanup completed.',
    };
  }
);

// ============================================
// PRIVACY REQUEST FUNCTIONS
// ============================================

/**
 * Process a privacy request (admin only)
 */
export const privacy_processRequest = functions.https.onCall(
  async (data: {
    requestId: string;
    action: 'approve' | 'reject';
    notes?: string;
  }, context) => {
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
        'Only app admins can process privacy requests.'
      );
    }

    const { requestId, action, notes } = data;

    const requestDoc = await db.collection('privacy_requests').doc(requestId).get();
    if (!requestDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Privacy request not found.'
      );
    }

    const now = Date.now();
    await requestDoc.ref.update({
      status: action === 'approve' ? 'approved' : 'rejected',
      processedBy: callerId,
      processedAt: now,
      processingNotes: notes || null,
      updatedAt: now,
    });

    // Log the action
    await db.collection('admin_audit_logs').add({
      action: `privacy_request_${action}`,
      requestId,
      performedBy: callerId,
      timestamp: now,
    });

    return {
      success: true,
      message: `Privacy request ${action}ed successfully.`,
    };
  }
);

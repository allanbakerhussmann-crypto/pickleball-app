/**
 * League Cloud Functions
 *
 * Server-side enforcement for league operations.
 *
 * Functions:
 * - league_join: Join a league with server-side DUPR+ gate enforcement
 * - league_markMemberAsPaid: Mark a league member's payment as paid (organizer only)
 *
 * FILE LOCATION: functions/src/leagues.ts
 * VERSION: V07.53
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const logger = functions.logger;
const db = admin.firestore();

// ============================================
// Types
// ============================================

interface JoinLeagueRequest {
  leagueId: string;
  divisionId?: string | null;
  displayName: string;
}

interface JoinLeagueResponse {
  success: boolean;
  memberId: string;
}

interface LeagueStats {
  played: number;
  wins: number;
  losses: number;
  draws: number;
  forfeits: number;
  points: number;
  gamesWon: number;
  gamesLost: number;
  pointsFor: number;
  pointsAgainst: number;
  currentStreak: number;
  bestWinStreak: number;
  recentForm: string[];
}

// ============================================
// Callable Function: Join League
// ============================================

/**
 * Join a league with server-side enforcement
 *
 * This function:
 * 1. Validates authentication
 * 2. Checks DUPR+ gate if enabled
 * 3. Checks capacity
 * 4. Creates member document atomically
 *
 * Uses Firestore transaction for atomic check + write.
 */
export const league_join = functions.https.onCall(
  async (data: JoinLeagueRequest, context): Promise<JoinLeagueResponse> => {
    // Verify authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { leagueId, divisionId, displayName } = data;
    const uid = context.auth.uid;

    logger.info('[League Join] Called', { leagueId, divisionId, uid });

    // Validate input
    if (!leagueId) {
      throw new functions.https.HttpsError('invalid-argument', 'leagueId is required');
    }

    const leagueRef = db.collection('leagues').doc(leagueId);
    const memberRef = db.collection('leagues').doc(leagueId).collection('members').doc();

    // Use transaction for atomic check + write
    const result = await db.runTransaction(async (transaction) => {
      // Read league
      const leagueSnap = await transaction.get(leagueRef);
      if (!leagueSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'League not found');
      }
      const league = leagueSnap.data()!;

      // Read user
      const userSnap = await transaction.get(db.collection('users').doc(uid));
      const user = userSnap.data() || {};

      // === ENFORCE DUPR+ GATE ===
      // Note: duprSettings is nested inside settings in Firestore
      const duprSettings = league.settings?.duprSettings || league.duprSettings;
      if (duprSettings?.plusGate === 'required') {
        // Check if user has DUPR linked
        if (!user.duprId) {
          throw new functions.https.HttpsError(
            'failed-precondition',
            'DUPR account required to join this league'
          );
        }

        // Check if DUPR+ is active
        if (!user.duprPlusActive) {
          throw new functions.https.HttpsError(
            'failed-precondition',
            'DUPR+ subscription required to join this league'
          );
        }

        logger.info('[League Join] DUPR+ gate passed', { uid, duprId: user.duprId });
      }

      // Check capacity
      const currentCount = league.memberCount || 0;
      if (league.maxMembers && currentCount >= league.maxMembers) {
        throw new functions.https.HttpsError(
          'resource-exhausted',
          `League is full (${currentCount}/${league.maxMembers})`
        );
      }

      // Check for existing membership (idempotency)
      const existingQuery = await db
        .collection('leagues')
        .doc(leagueId)
        .collection('members')
        .where('userId', '==', uid)
        .where('status', 'in', ['active', 'pending_partner'])
        .get();

      if (!existingQuery.empty) {
        throw new functions.https.HttpsError(
          'already-exists',
          'You are already a member of this league'
        );
      }

      const now = Date.now();
      const initialRank = currentCount + 1;

      // Initial stats object
      const stats: LeagueStats = {
        played: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        forfeits: 0,
        points: 0,
        gamesWon: 0,
        gamesLost: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        currentStreak: 0,
        bestWinStreak: 0,
        recentForm: [],
      };

      // Create member document
      const newMember = {
        id: memberRef.id,
        leagueId,
        divisionId: divisionId || null,
        userId: uid,
        displayName: displayName || user.displayName || '',
        partnerUserId: null,
        partnerDisplayName: null,
        status: 'active',
        role: 'member',
        paymentStatus: 'not_required',
        currentRank: initialRank,
        stats,
        joinedAt: now,
        lastActiveAt: now,
      };

      transaction.set(memberRef, newMember);
      transaction.update(leagueRef, {
        memberCount: admin.firestore.FieldValue.increment(1),
        updatedAt: now,
      });

      logger.info('[League Join] Member created', {
        memberId: memberRef.id,
        leagueId,
        uid,
      });

      return { memberId: memberRef.id };
    });

    return { success: true, memberId: result.memberId };
  }
);

// ============================================
// Types for Mark as Paid
// ============================================

interface MarkMemberAsPaidRequest {
  leagueId: string;
  memberId: string;
  slot?: 'primary' | 'partner';  // Defaults to 'primary'
  amount: number;                 // In cents - the entry fee amount
}

interface MarkMemberAsPaidResponse {
  success: boolean;
}

// ============================================
// Callable Function: Mark Member as Paid
// ============================================

/**
 * Mark a league member's payment as paid (manual/bank transfer)
 *
 * Server-authoritative - only organizers can mark payments as paid.
 * This prevents players from marking their own payments.
 *
 * @param leagueId - The league ID
 * @param memberId - The member document ID
 * @param slot - 'primary' (default) or 'partner' for per-player doubles
 * @param amount - The entry fee amount in cents
 */
export const league_markMemberAsPaid = functions.https.onCall(
  async (data: MarkMemberAsPaidRequest, context): Promise<MarkMemberAsPaidResponse> => {
    // Verify authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { leagueId, memberId, amount } = data;
    const slot = data.slot || 'primary';  // Default to 'primary'
    const organizerId = context.auth.uid;

    logger.info('[League Mark Paid] Called', { leagueId, memberId, slot, amount, organizerId });

    // Validate input
    if (!leagueId) {
      throw new functions.https.HttpsError('invalid-argument', 'leagueId is required');
    }
    if (!memberId) {
      throw new functions.https.HttpsError('invalid-argument', 'memberId is required');
    }
    if (typeof amount !== 'number' || amount < 0) {
      throw new functions.https.HttpsError('invalid-argument', 'amount must be a non-negative number');
    }

    // Verify caller is league organizer
    const leagueDoc = await db.collection('leagues').doc(leagueId).get();
    if (!leagueDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'League not found');
    }
    const league = leagueDoc.data()!;

    // Check if user is authorized to mark payments
    // TODO: Support league admins/delegates when that feature exists
    // For now, only the creator can mark payments
    const isOrganizer = league.createdByUserId === organizerId;
    // Future: || league.admins?.includes(organizerId) || league.delegates?.includes(organizerId)

    if (!isOrganizer) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only league organizers can mark payments as paid'
      );
    }

    // Verify member exists
    const memberRef = db.collection('leagues').doc(leagueId).collection('members').doc(memberId);
    const memberDoc = await memberRef.get();
    if (!memberDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Member not found');
    }

    const now = Date.now();

    // Update the correct payment slot
    if (slot === 'partner') {
      // Partner payment - only nested (no flat equivalent for partner)
      await memberRef.update({
        'partnerPayment.status': 'paid',
        'partnerPayment.method': 'bank_transfer',
        'partnerPayment.amountPaid': amount,
        'partnerPayment.paidAt': now,
        'partnerPayment.paidMarkedBy': organizerId,
        updatedAt: now,
      });
    } else {
      // Primary payment - write BOTH nested AND flat for backwards compat
      await memberRef.update({
        // Nested format (new)
        'payment.status': 'paid',
        'payment.method': 'bank_transfer',
        'payment.amountPaid': amount,
        'payment.paidAt': now,
        'payment.paidMarkedBy': organizerId,
        // Flat format (backwards compat)
        paymentStatus: 'paid',
        amountPaid: amount,
        paidAt: now,
        updatedAt: now,
      });
    }

    logger.info('[League Mark Paid] Success', {
      leagueId,
      memberId,
      slot,
      amount,
      markedBy: organizerId,
    });

    return { success: true };
  }
);

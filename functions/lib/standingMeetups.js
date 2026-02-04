"use strict";
/**
 * Standing Meetups Cloud Functions
 *
 * Server-side functions for standing meetup management:
 * - Subscription creation/cancellation
 * - Occurrence generation
 * - Participant status updates
 * - Check-in
 * - Credit issuance
 *
 * NOTE: Using 1st Gen functions for reliable deployment
 * (2nd Gen has Container Healthcheck issues in australia-southeast1)
 *
 * @version 07.59
 * @file functions/src/standingMeetups.ts
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.standingMeetup_checkInPlayer = exports.standingMeetup_closeSession = exports.standingMeetup_addCashGuest = exports.standingMeetup_checkInSelf = exports.onOccurrenceDeleted = exports.standingMeetup_markNoShow = exports.standingMeetup_manualCheckIn = exports.standingMeetup_cancelOccurrence = exports.standingMeetup_cancelAttendance = exports.standingMeetup_generateCheckInToken = exports.standingMeetup_checkIn = exports.standingMeetup_ensureOccurrences = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
const crypto = __importStar(require("crypto"));
const stripe_1 = __importDefault(require("stripe"));
const db = admin.firestore();
// Constants
const OCCURRENCE_LOOKAHEAD_DAYS = 112; // 16 weeks
const PLATFORM_FEE_PERCENT = 0.015; // 1.5% standard rate - same as stripe.ts
const STRIPE_FEE_PERCENT = 0.027; // NZ Stripe rate: 2.7% + $0.30
const STRIPE_FIXED_FEE_CENTS = 30;
// Status to counter field mapping
const STATUS_TO_COUNTER_FIELD = {
    expected: 'expectedCount',
    cancelled: 'cancelledCount',
    checked_in: 'checkedInCount',
    no_show: 'noShowCount',
};
// Stripe initialization
function getStripeSecretKey() {
    var _a;
    try {
        return (_a = functions.config().stripe) === null || _a === void 0 ? void 0 : _a.secret_key;
    }
    catch (_b) {
        return undefined;
    }
}
const stripeSecretKey = getStripeSecretKey();
const stripe = stripeSecretKey ? new stripe_1.default(stripeSecretKey, { apiVersion: '2024-11-20.acacia' }) : null;
// =============================================================================
// Helper Functions
// =============================================================================
function calculateCreditAmount(billingAmount, feesPaidBy) {
    const stripeFee = Math.round(billingAmount * STRIPE_FEE_PERCENT) + STRIPE_FIXED_FEE_CENTS;
    const platformFee = Math.round(billingAmount * PLATFORM_FEE_PERCENT);
    if (feesPaidBy === 'organizer') {
        return billingAmount - stripeFee - platformFee;
    }
    else {
        return billingAmount;
    }
}
function parseTime(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return { hours, minutes };
}
function getNextDayOfWeek(fromDate, dayOfWeek, _timezone) {
    const date = new Date(fromDate);
    const currentDay = date.getDay();
    const daysUntilNext = (dayOfWeek - currentDay + 7) % 7;
    if (daysUntilNext === 0) {
        return date;
    }
    date.setDate(date.getDate() + daysUntilNext);
    return date;
}
function calculateOccurrenceDates(meetup, endTimestamp) {
    const dates = [];
    const intervalCount = meetup.recurrence.intervalCount || 1;
    const msPerWeek = 7 * 24 * 60 * 60 * 1000 * intervalCount;
    const startDate = new Date(meetup.recurrence.startDate);
    const today = new Date();
    let currentDate = startDate > today ? startDate : today;
    currentDate = getNextDayOfWeek(currentDate, meetup.recurrence.dayOfWeek, meetup.timezone);
    while (currentDate.getTime() < endTimestamp) {
        if (meetup.recurrence.endDate) {
            const endDate = new Date(meetup.recurrence.endDate);
            if (currentDate > endDate)
                break;
        }
        const dateStr = currentDate.toISOString().split('T')[0];
        dates.push(dateStr);
        currentDate = new Date(currentDate.getTime() + msPerWeek);
    }
    return dates;
}
function calculateTimestamp(dateStr, timeStr, _timezone) {
    const { hours, minutes } = parseTime(timeStr);
    const date = new Date(dateStr);
    date.setHours(hours, minutes, 0, 0);
    return date.getTime();
}
async function updateParticipantStatus(standingMeetupId, dateId, userId, toStatus, additionalData) {
    const occurrenceRef = db
        .collection('standingMeetups')
        .doc(standingMeetupId)
        .collection('occurrences')
        .doc(dateId);
    const participantRef = occurrenceRef.collection('participants').doc(userId);
    await db.runTransaction(async (transaction) => {
        var _a;
        const participantSnap = await transaction.get(participantRef);
        const occurrenceSnap = await transaction.get(occurrenceRef);
        if (!occurrenceSnap.exists) {
            throw new functions.https.HttpsError('not-found', `Occurrence ${standingMeetupId}/${dateId} not found`);
        }
        const fromStatus = participantSnap.exists
            ? (_a = participantSnap.data()) === null || _a === void 0 ? void 0 : _a.status
            : null;
        if (fromStatus === toStatus)
            return;
        const counterDeltas = {};
        if (fromStatus && STATUS_TO_COUNTER_FIELD[fromStatus]) {
            counterDeltas[STATUS_TO_COUNTER_FIELD[fromStatus]] = -1;
        }
        counterDeltas[STATUS_TO_COUNTER_FIELD[toStatus]] = 1;
        const occData = occurrenceSnap.data();
        for (const [key, delta] of Object.entries(counterDeltas)) {
            if (delta < 0 && (occData[key] || 0) + delta < 0) {
                throw new functions.https.HttpsError('failed-precondition', `Counter ${key} would go negative`);
            }
        }
        transaction.set(participantRef, Object.assign(Object.assign({}, additionalData), { status: toStatus, updatedAt: Date.now() }), { merge: true });
        const counterUpdates = {};
        for (const [key, delta] of Object.entries(counterDeltas)) {
            counterUpdates[key] = firestore_1.FieldValue.increment(delta);
        }
        counterUpdates['updatedAt'] = admin.firestore.FieldValue.serverTimestamp();
        transaction.update(occurrenceRef, counterUpdates);
    });
}
async function addToWallet(userId, clubId, amount, metadata) {
    const walletId = `${userId}_${clubId}`;
    const walletRef = db.collection('wallets').doc(walletId);
    const transactionRef = db.collection('walletTransactions').doc();
    await db.runTransaction(async (transaction) => {
        const walletSnap = await transaction.get(walletRef);
        if (!walletSnap.exists) {
            transaction.set(walletRef, {
                userId,
                clubId,
                balance: amount,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
        }
        else {
            transaction.update(walletRef, {
                balance: firestore_1.FieldValue.increment(amount),
                updatedAt: Date.now(),
            });
        }
        transaction.set(transactionRef, {
            walletId,
            userId,
            clubId,
            amount,
            type: 'credit',
            referenceType: 'standing_meetup_credit',
            metadata,
            createdAt: Date.now(),
        });
    });
    return transactionRef.id;
}
// =============================================================================
// Occurrence Generation (1st Gen - australia-southeast1)
// =============================================================================
exports.standingMeetup_ensureOccurrences = functions
    .region('australia-southeast1')
    .https.onCall(async (data, context) => {
    var _a;
    const { standingMeetupId } = data;
    if (!standingMeetupId) {
        throw new functions.https.HttpsError('invalid-argument', 'standingMeetupId is required');
    }
    const meetupRef = db.collection('standingMeetups').doc(standingMeetupId);
    const meetupSnap = await meetupRef.get();
    if (!meetupSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Standing meetup not found');
    }
    const meetup = Object.assign({ id: meetupSnap.id }, meetupSnap.data());
    const endTimestamp = Date.now() + OCCURRENCE_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000;
    const expectedDates = calculateOccurrenceDates(meetup, endTimestamp);
    if (expectedDates.length === 0) {
        return { created: [], existing: 0 };
    }
    const occurrenceRefs = expectedDates.map((date) => meetupRef.collection('occurrences').doc(date));
    const snapshots = await db.getAll(...occurrenceRefs);
    const existingActiveSet = new Set();
    const cancelledSet = new Set();
    snapshots.forEach((snap) => {
        if (snap.exists) {
            const snapData = snap.data();
            if ((snapData === null || snapData === void 0 ? void 0 : snapData.status) === 'cancelled') {
                cancelledSet.add(snap.id);
            }
            else {
                existingActiveSet.add(snap.id);
            }
        }
    });
    const created = [];
    const skippedCancelled = [];
    const batch = db.batch();
    for (const date of expectedDates) {
        // SAFEGUARD: Skip cancelled sessions - don't auto-revive them
        // Organizers must explicitly revive cancelled sessions if needed
        // This prevents accidentally resetting registrations/participants
        if (cancelledSet.has(date)) {
            skippedCancelled.push(date);
            continue;
        }
        if (!existingActiveSet.has(date)) {
            const occRef = meetupRef.collection('occurrences').doc(date);
            const indexRef = db
                .collection('meetupOccurrencesIndex')
                .doc(`${standingMeetupId}_${date}`);
            const startAt = calculateTimestamp(date, meetup.recurrence.startTime, meetup.timezone);
            const endAt = calculateTimestamp(date, meetup.recurrence.endTime, meetup.timezone);
            const occurrence = {
                standingMeetupId,
                clubId: meetup.clubId,
                date,
                startTime: meetup.recurrence.startTime,
                endTime: meetup.recurrence.endTime,
                when: startAt,
                startAt,
                endAt,
                isModified: false,
                status: 'scheduled',
                expectedCount: 0,
                checkedInCount: 0,
                cancelledCount: 0,
                noShowCount: 0,
                creditsIssued: false,
                checkInEnabled: false,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };
            batch.set(occRef, Object.assign({ id: date }, occurrence));
            batch.set(indexRef, {
                id: `${standingMeetupId}_${date}`,
                standingMeetupId,
                occurrenceDate: date,
                clubId: meetup.clubId,
                when: startAt,
                status: 'scheduled',
                title: meetup.title,
                clubName: meetup.clubName,
                locationName: meetup.locationName,
                startTime: meetup.recurrence.startTime,
                endTime: meetup.recurrence.endTime,
                venueGeo: meetup.lat && meetup.lng ? { lat: meetup.lat, lng: meetup.lng } : null,
                maxPlayers: meetup.maxPlayers,
                expectedCount: 0,
                spotsLeft: meetup.maxPlayers,
                billingAmount: meetup.billing.amount,
                billingInterval: meetup.billing.interval,
                billingIntervalCount: (_a = meetup.billing.intervalCount) !== null && _a !== void 0 ? _a : 1,
                updatedAt: Date.now(),
            });
            created.push(date);
        }
    }
    if (created.length > 0) {
        await batch.commit();
    }
    return {
        created,
        skippedCancelled,
        existing: existingActiveSet.size,
    };
});
// =============================================================================
// Check-In (1st Gen - australia-southeast1)
// =============================================================================
exports.standingMeetup_checkIn = functions
    .region('australia-southeast1')
    .https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { standingMeetupId, dateId, token } = data;
    const userId = context.auth.uid;
    if (!standingMeetupId || !dateId || !token) {
        throw new functions.https.HttpsError('invalid-argument', 'standingMeetupId, dateId, and token are required');
    }
    const occurrenceRef = db
        .collection('standingMeetups')
        .doc(standingMeetupId)
        .collection('occurrences')
        .doc(dateId);
    const occurrenceSnap = await occurrenceRef.get();
    if (!occurrenceSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'OCCURRENCE_NOT_FOUND');
    }
    const occurrence = occurrenceSnap.data();
    if (!['scheduled', 'in_progress'].includes(occurrence.status)) {
        throw new functions.https.HttpsError('failed-precondition', 'SESSION_NOT_ACTIVE');
    }
    if (!occurrence.checkInEnabled || !occurrence.checkInTokenHash) {
        throw new functions.https.HttpsError('failed-precondition', 'Check-in not enabled');
    }
    if (occurrence.checkInTokenExpiresAt && Date.now() > occurrence.checkInTokenExpiresAt) {
        throw new functions.https.HttpsError('failed-precondition', 'TOKEN_EXPIRED');
    }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    if (tokenHash !== occurrence.checkInTokenHash) {
        throw new functions.https.HttpsError('permission-denied', 'TOKEN_INVALID');
    }
    const participantRef = occurrenceRef.collection('participants').doc(userId);
    const participantSnap = await participantRef.get();
    if (!participantSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'NOT_PARTICIPANT');
    }
    const participant = participantSnap.data();
    if (participant.status === 'checked_in') {
        throw new functions.https.HttpsError('already-exists', 'ALREADY_CHECKED_IN');
    }
    const checkedInAt = Date.now();
    await updateParticipantStatus(standingMeetupId, dateId, userId, 'checked_in', {
        checkedInAt,
        checkInMethod: 'qr',
    });
    return {
        success: true,
        checkedInAt,
    };
});
// =============================================================================
// Generate Check-In Token (1st Gen - australia-southeast1)
// =============================================================================
exports.standingMeetup_generateCheckInToken = functions
    .region('australia-southeast1')
    .https.onCall(async (data, context) => {
    var _a;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { standingMeetupId, dateId, expiresInMinutes = 30 } = data;
    const userId = context.auth.uid;
    const meetupRef = db.collection('standingMeetups').doc(standingMeetupId);
    const meetupSnap = await meetupRef.get();
    if (!meetupSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Standing meetup not found');
    }
    const meetup = meetupSnap.data();
    if (meetup.createdByUserId !== userId) {
        const clubMemberSnap = await db
            .collection('clubs')
            .doc(meetup.clubId)
            .collection('members')
            .doc(userId)
            .get();
        if (!clubMemberSnap.exists) {
            throw new functions.https.HttpsError('permission-denied', 'NOT_AUTHORIZED');
        }
        const memberRole = (_a = clubMemberSnap.data()) === null || _a === void 0 ? void 0 : _a.role;
        if (!['owner', 'admin'].includes(memberRole)) {
            throw new functions.https.HttpsError('permission-denied', 'NOT_AUTHORIZED');
        }
    }
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = Date.now() + expiresInMinutes * 60 * 1000;
    const occurrenceRef = meetupRef.collection('occurrences').doc(dateId);
    await occurrenceRef.update({
        checkInEnabled: true,
        checkInTokenHash: tokenHash,
        checkInTokenExpiresAt: expiresAt,
        checkInLastRotatedAt: Date.now(),
        updatedAt: Date.now(),
    });
    return {
        token,
        expiresAt,
    };
});
// =============================================================================
// Cancel Attendance (1st Gen - australia-southeast1)
// =============================================================================
exports.standingMeetup_cancelAttendance = functions
    .region('australia-southeast1')
    .https.onCall(async (data, context) => {
    var _a;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { standingMeetupId, dateId, odUserId } = data;
    const callerUid = context.auth.uid;
    if (!standingMeetupId || !dateId) {
        throw new functions.https.HttpsError('invalid-argument', 'standingMeetupId and dateId are required');
    }
    const meetupRef = db.collection('standingMeetups').doc(standingMeetupId);
    const occurrenceRef = meetupRef.collection('occurrences').doc(dateId);
    const [meetupSnap, occurrenceSnap] = await Promise.all([
        meetupRef.get(),
        occurrenceRef.get(),
    ]);
    if (!meetupSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'MEETUP_NOT_FOUND');
    }
    if (!occurrenceSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'OCCURRENCE_NOT_FOUND');
    }
    const meetup = meetupSnap.data();
    const occurrence = occurrenceSnap.data();
    // Determine target user: if odUserId provided, verify caller is admin
    let userId = callerUid;
    if (odUserId && odUserId !== callerUid) {
        // Admin trying to remove another player - verify permissions
        const isCreator = meetup.createdByUserId === callerUid;
        let isClubAdmin = false;
        if (!isCreator) {
            const clubMemberSnap = await db
                .collection('clubs')
                .doc(meetup.clubId)
                .collection('members')
                .doc(callerUid)
                .get();
            if (clubMemberSnap.exists) {
                const memberRole = (_a = clubMemberSnap.data()) === null || _a === void 0 ? void 0 : _a.role;
                isClubAdmin = ['owner', 'admin'].includes(memberRole);
            }
        }
        if (!isCreator && !isClubAdmin) {
            throw new functions.https.HttpsError('permission-denied', 'NOT_AUTHORIZED');
        }
        userId = odUserId;
    }
    if (occurrence.startAt < Date.now()) {
        throw new functions.https.HttpsError('failed-precondition', 'OCCURRENCE_PASSED');
    }
    const participantRef = occurrenceRef.collection('participants').doc(userId);
    const participantSnap = await participantRef.get();
    if (!participantSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'NOT_PARTICIPANT');
    }
    const participant = participantSnap.data();
    if (participant.status === 'cancelled') {
        throw new functions.https.HttpsError('already-exists', 'ALREADY_CANCELLED');
    }
    const cutoffTimestamp = occurrence.startAt - meetup.credits.cancellationCutoffHours * 60 * 60 * 1000;
    const isBeforeCutoff = Date.now() <= cutoffTimestamp;
    const shouldIssueCredit = meetup.credits.enabled && isBeforeCutoff;
    let creditAmount;
    let walletTransactionId;
    if (shouldIssueCredit) {
        creditAmount = calculateCreditAmount(meetup.billing.amount, meetup.billing.feesPaidBy);
        walletTransactionId = await addToWallet(userId, meetup.clubId, creditAmount, {
            type: 'standing_meetup_credit',
            standingMeetupId,
            occurrenceId: dateId,
            reason: 'player_cancelled_before_cutoff',
        });
    }
    // Build update object without undefined values (Firestore doesn't allow undefined)
    const participantUpdate = {
        creditIssued: shouldIssueCredit,
    };
    if (shouldIssueCredit) {
        participantUpdate.creditIssuedAt = Date.now();
        participantUpdate.creditReason = 'player_cancelled_before_cutoff';
        if (creditAmount !== undefined) {
            participantUpdate.creditAmount = creditAmount;
        }
        if (walletTransactionId !== undefined) {
            participantUpdate.walletTransactionId = walletTransactionId;
        }
    }
    await updateParticipantStatus(standingMeetupId, dateId, userId, 'cancelled', participantUpdate);
    if (shouldIssueCredit && creditAmount) {
        // Try to update subscription (old model) - skip if doesn't exist (MVP hybrid model uses registrations)
        const subscriptionId = `${standingMeetupId}_${userId}`;
        const subscriptionRef = db
            .collection('standingMeetupSubscriptions')
            .doc(subscriptionId);
        const subscriptionSnap = await subscriptionRef.get();
        if (subscriptionSnap.exists) {
            await subscriptionRef.update({
                totalCreditsReceived: firestore_1.FieldValue.increment(creditAmount),
                updatedAt: Date.now(),
            });
        }
    }
    return {
        credited: shouldIssueCredit,
        creditAmount,
        reason: isBeforeCutoff ? 'before_cutoff' : 'after_cutoff',
    };
});
// =============================================================================
// Cancel Occurrence (1st Gen - australia-southeast1)
// =============================================================================
exports.standingMeetup_cancelOccurrence = functions
    .region('australia-southeast1')
    .https.onCall(async (data, context) => {
    var _a;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { standingMeetupId, dateId, reason } = data;
    const userId = context.auth.uid;
    const meetupRef = db.collection('standingMeetups').doc(standingMeetupId);
    const meetupSnap = await meetupRef.get();
    if (!meetupSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Standing meetup not found');
    }
    const meetup = meetupSnap.data();
    if (meetup.createdByUserId !== userId) {
        const clubMemberSnap = await db
            .collection('clubs')
            .doc(meetup.clubId)
            .collection('members')
            .doc(userId)
            .get();
        if (!clubMemberSnap.exists) {
            throw new functions.https.HttpsError('permission-denied', 'NOT_AUTHORIZED');
        }
        const memberRole = (_a = clubMemberSnap.data()) === null || _a === void 0 ? void 0 : _a.role;
        if (!['owner', 'admin'].includes(memberRole)) {
            throw new functions.https.HttpsError('permission-denied', 'NOT_AUTHORIZED');
        }
    }
    const occurrenceRef = meetupRef.collection('occurrences').doc(dateId);
    const occurrenceSnap = await occurrenceRef.get();
    if (!occurrenceSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Occurrence not found');
    }
    const occurrence = occurrenceSnap.data();
    if (occurrence.status === 'cancelled') {
        throw new functions.https.HttpsError('already-exists', 'Occurrence already cancelled');
    }
    if (occurrence.creditsIssued) {
        throw new functions.https.HttpsError('already-exists', 'Credits already issued');
    }
    const participantsSnap = await occurrenceRef.collection('participants').get();
    const eligibleParticipants = [];
    participantsSnap.forEach((doc) => {
        const docData = doc.data();
        if (['expected', 'checked_in'].includes(docData.status) && !docData.creditIssued) {
            eligibleParticipants.push({ id: doc.id, data: docData });
        }
    });
    const creditAmount = meetup.credits.enabled
        ? calculateCreditAmount(meetup.billing.amount, meetup.billing.feesPaidBy)
        : 0;
    let totalCreditsIssued = 0;
    const creditResults = [];
    for (const participant of eligibleParticipants) {
        if (creditAmount > 0) {
            const walletTxId = await addToWallet(participant.id, meetup.clubId, creditAmount, {
                type: 'standing_meetup_credit',
                standingMeetupId,
                occurrenceId: dateId,
                reason: 'organizer_cancelled',
            });
            await occurrenceRef.collection('participants').doc(participant.id).update({
                creditIssued: true,
                creditIssuedAt: Date.now(),
                creditAmount,
                creditReason: 'organizer_cancelled',
                walletTransactionId: walletTxId,
                updatedAt: Date.now(),
            });
            const subscriptionId = `${standingMeetupId}_${participant.id}`;
            const subscriptionRef = db
                .collection('standingMeetupSubscriptions')
                .doc(subscriptionId);
            const subscriptionSnap = await subscriptionRef.get();
            if (subscriptionSnap.exists) {
                await subscriptionRef.update({
                    totalCreditsReceived: firestore_1.FieldValue.increment(creditAmount),
                    updatedAt: Date.now(),
                });
            }
            totalCreditsIssued += creditAmount;
            creditResults.push({ odUserId: participant.id, creditAmount });
        }
    }
    await occurrenceRef.update({
        status: 'cancelled',
        cancelledAt: Date.now(),
        cancelReason: reason || null,
        creditsIssued: true,
        creditsIssuedAt: Date.now(),
        updatedAt: Date.now(),
    });
    const indexRef = db
        .collection('meetupOccurrencesIndex')
        .doc(`${standingMeetupId}_${dateId}`);
    await indexRef.update({
        status: 'cancelled',
        updatedAt: Date.now(),
    });
    return {
        cancelled: true,
        participantsAffected: eligibleParticipants.length,
        totalCreditsIssued,
        creditResults,
    };
});
// =============================================================================
// Manual Check-In (1st Gen - australia-southeast1)
// =============================================================================
exports.standingMeetup_manualCheckIn = functions
    .region('australia-southeast1')
    .https.onCall(async (data, context) => {
    var _a;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { standingMeetupId, dateId, targetUserId } = data;
    const userId = context.auth.uid;
    const meetupRef = db.collection('standingMeetups').doc(standingMeetupId);
    const meetupSnap = await meetupRef.get();
    if (!meetupSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Standing meetup not found');
    }
    const meetup = meetupSnap.data();
    if (meetup.createdByUserId !== userId) {
        const clubMemberSnap = await db
            .collection('clubs')
            .doc(meetup.clubId)
            .collection('members')
            .doc(userId)
            .get();
        if (!clubMemberSnap.exists || !['owner', 'admin'].includes((_a = clubMemberSnap.data()) === null || _a === void 0 ? void 0 : _a.role)) {
            throw new functions.https.HttpsError('permission-denied', 'NOT_AUTHORIZED');
        }
    }
    const checkedInAt = Date.now();
    await updateParticipantStatus(standingMeetupId, dateId, targetUserId, 'checked_in', {
        checkedInAt,
        checkInMethod: 'organizer',
    });
    return {
        success: true,
        checkedInAt,
    };
});
// =============================================================================
// Mark No-Show (1st Gen - australia-southeast1)
// =============================================================================
exports.standingMeetup_markNoShow = functions
    .region('australia-southeast1')
    .https.onCall(async (data, context) => {
    var _a;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { standingMeetupId, dateId, targetUserId } = data;
    const userId = context.auth.uid;
    const meetupRef = db.collection('standingMeetups').doc(standingMeetupId);
    const meetupSnap = await meetupRef.get();
    if (!meetupSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Standing meetup not found');
    }
    const meetup = meetupSnap.data();
    if (meetup.createdByUserId !== userId) {
        const clubMemberSnap = await db
            .collection('clubs')
            .doc(meetup.clubId)
            .collection('members')
            .doc(userId)
            .get();
        if (!clubMemberSnap.exists || !['owner', 'admin'].includes((_a = clubMemberSnap.data()) === null || _a === void 0 ? void 0 : _a.role)) {
            throw new functions.https.HttpsError('permission-denied', 'NOT_AUTHORIZED');
        }
    }
    await updateParticipantStatus(standingMeetupId, dateId, targetUserId, 'no_show');
    return {
        success: true,
    };
});
// =============================================================================
// Index Sync Trigger (1st Gen - australia-southeast1)
// =============================================================================
exports.onOccurrenceDeleted = functions
    .region('australia-southeast1')
    .firestore.document('standingMeetups/{standingMeetupId}/occurrences/{dateId}')
    .onDelete(async (snap, context) => {
    const { standingMeetupId, dateId } = context.params;
    const indexRef = db
        .collection('meetupOccurrencesIndex')
        .doc(`${standingMeetupId}_${dateId}`);
    try {
        await indexRef.delete();
        console.log(`Deleted index entry for ${standingMeetupId}_${dateId}`);
    }
    catch (error) {
        console.error(`Failed to delete index entry: ${error}`);
    }
});
// =============================================================================
// Registration Helper Functions
// =============================================================================
async function addPlayerToAllFutureOccurrences(standingMeetupId, userId, userName, maxPlayers) {
    const now = Date.now();
    const eightWeeksLater = now + 8 * 7 * 24 * 60 * 60 * 1000;
    const occurrencesSnap = await db
        .collection('standingMeetups')
        .doc(standingMeetupId)
        .collection('occurrences')
        .where('startAt', '>=', now)
        .where('startAt', '<', eightWeeksLater)
        .where('status', '==', 'scheduled')
        .get();
    if (occurrencesSnap.empty) {
        console.log(`No future occurrences found for meetup ${standingMeetupId}`);
        return { addedTo: [], skippedFull: [] };
    }
    const addedTo = [];
    const skippedFull = [];
    const batch = db.batch();
    for (const occDoc of occurrencesSnap.docs) {
        const occData = occDoc.data();
        const spotsLeft = maxPlayers - (occData.expectedCount || 0);
        if (spotsLeft <= 0) {
            skippedFull.push(occDoc.id);
            continue;
        }
        const participantRef = occDoc.ref.collection('participants').doc(userId);
        const participantSnap = await participantRef.get();
        if (!participantSnap.exists) {
            batch.set(participantRef, {
                userName,
                status: 'expected',
                creditIssued: false,
                updatedAt: Date.now(),
            });
            batch.update(occDoc.ref, {
                expectedCount: firestore_1.FieldValue.increment(1),
                updatedAt: Date.now(),
            });
            const indexRef = db
                .collection('meetupOccurrencesIndex')
                .doc(`${standingMeetupId}_${occDoc.id}`);
            batch.update(indexRef, {
                expectedCount: firestore_1.FieldValue.increment(1),
                spotsLeft: firestore_1.FieldValue.increment(-1),
                updatedAt: Date.now(),
            });
            addedTo.push(occDoc.id);
        }
    }
    await batch.commit();
    console.log(`Season Pass: Added ${userId} to ${addedTo.length} occurrences, skipped ${skippedFull.length} full`);
    return { addedTo, skippedFull };
}
async function addPlayerToSelectedOccurrences(standingMeetupId, userId, userName, sessionIds, maxPlayers) {
    if (!sessionIds || sessionIds.length === 0) {
        throw new functions.https.HttpsError('invalid-argument', 'No sessions selected');
    }
    const addedTo = [];
    const failedFull = [];
    for (const dateId of sessionIds) {
        const occRef = db
            .collection('standingMeetups')
            .doc(standingMeetupId)
            .collection('occurrences')
            .doc(dateId);
        try {
            await db.runTransaction(async (transaction) => {
                const occSnap = await transaction.get(occRef);
                if (!occSnap.exists) {
                    console.warn(`Occurrence ${dateId} not found, skipping`);
                    return;
                }
                const occData = occSnap.data();
                const spotsLeft = maxPlayers - (occData.expectedCount || 0);
                if (spotsLeft <= 0) {
                    failedFull.push(dateId);
                    return;
                }
                const participantRef = occRef.collection('participants').doc(userId);
                const participantSnap = await transaction.get(participantRef);
                if (!participantSnap.exists) {
                    transaction.set(participantRef, {
                        userName,
                        status: 'expected',
                        creditIssued: false,
                        updatedAt: Date.now(),
                    });
                    transaction.update(occRef, {
                        expectedCount: firestore_1.FieldValue.increment(1),
                        updatedAt: Date.now(),
                    });
                    const indexRef = db
                        .collection('meetupOccurrencesIndex')
                        .doc(`${standingMeetupId}_${dateId}`);
                    transaction.update(indexRef, {
                        expectedCount: firestore_1.FieldValue.increment(1),
                        spotsLeft: firestore_1.FieldValue.increment(-1),
                        updatedAt: Date.now(),
                    });
                    addedTo.push(dateId);
                }
            });
        }
        catch (err) {
            console.error(`Failed to add to occurrence ${dateId}:`, err);
            failedFull.push(dateId);
        }
    }
    if (failedFull.length > 0) {
        console.warn(`Pick-and-Pay: ${failedFull.length} sessions were full: ${failedFull.join(', ')}`);
    }
    console.log(`Pick-and-Pay: Added ${userId} to ${addedTo.length} selected occurrences`);
    return { addedTo, failedFull };
}
async function removePlayerFromFutureOccurrences(standingMeetupId, userId) {
    var _a;
    const now = Date.now();
    const occurrencesSnap = await db
        .collection('standingMeetups')
        .doc(standingMeetupId)
        .collection('occurrences')
        .where('startAt', '>=', now)
        .where('status', '==', 'scheduled')
        .get();
    const batch = db.batch();
    for (const occDoc of occurrencesSnap.docs) {
        const participantRef = occDoc.ref.collection('participants').doc(userId);
        const participantSnap = await participantRef.get();
        if (participantSnap.exists && ((_a = participantSnap.data()) === null || _a === void 0 ? void 0 : _a.status) === 'expected') {
            batch.delete(participantRef);
            batch.update(occDoc.ref, {
                expectedCount: firestore_1.FieldValue.increment(-1),
                updatedAt: Date.now(),
            });
            const indexRef = db
                .collection('meetupOccurrencesIndex')
                .doc(`${standingMeetupId}_${occDoc.id}`);
            batch.update(indexRef, {
                expectedCount: firestore_1.FieldValue.increment(-1),
                spotsLeft: firestore_1.FieldValue.increment(1),
                updatedAt: Date.now(),
            });
        }
    }
    await batch.commit();
}
async function removePlayerFromSelectedOccurrences(standingMeetupId, userId, sessionIds) {
    var _a;
    const now = Date.now();
    const batch = db.batch();
    let removedCount = 0;
    for (const dateId of sessionIds) {
        const occRef = db
            .collection('standingMeetups')
            .doc(standingMeetupId)
            .collection('occurrences')
            .doc(dateId);
        const occSnap = await occRef.get();
        if (!occSnap.exists)
            continue;
        const occData = occSnap.data();
        if (occData.startAt < now)
            continue;
        const participantRef = occRef.collection('participants').doc(userId);
        const participantSnap = await participantRef.get();
        if (participantSnap.exists && ((_a = participantSnap.data()) === null || _a === void 0 ? void 0 : _a.status) === 'expected') {
            batch.delete(participantRef);
            batch.update(occRef, {
                expectedCount: firestore_1.FieldValue.increment(-1),
                updatedAt: Date.now(),
            });
            const indexRef = db
                .collection('meetupOccurrencesIndex')
                .doc(`${standingMeetupId}_${dateId}`);
            batch.update(indexRef, {
                expectedCount: firestore_1.FieldValue.increment(-1),
                spotsLeft: firestore_1.FieldValue.increment(1),
                updatedAt: Date.now(),
            });
            removedCount++;
        }
    }
    await batch.commit();
    console.log(`Removed ${userId} from ${removedCount} selected occurrences`);
}
// =============================================================================
// Helper: Format Session Date for Display
// =============================================================================
function formatSessionDate(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayName = days[date.getDay()];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    return `${dayName} ${day} ${month} ${year}`;
}
// =============================================================================
// Helper: Check if User is Club Admin or Meetup Organizer
// =============================================================================
async function isOrganizerOrClubAdmin(userId, meetup) {
    var _a;
    // Check if user is the meetup creator
    if (meetup.createdByUserId === userId) {
        return true;
    }
    // Check if user is a club admin/owner
    const clubMemberSnap = await db
        .collection('clubs')
        .doc(meetup.clubId)
        .collection('members')
        .doc(userId)
        .get();
    if (clubMemberSnap.exists) {
        const memberRole = (_a = clubMemberSnap.data()) === null || _a === void 0 ? void 0 : _a.role;
        if (['owner', 'admin'].includes(memberRole)) {
            return true;
        }
    }
    return false;
}
// =============================================================================
// Self Check-In (Auth-based, no token - player scans static session QR)
// =============================================================================
exports.standingMeetup_checkInSelf = functions
    .region('australia-southeast1')
    .https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { standingMeetupId, occurrenceId } = data;
    const userId = context.auth.uid;
    if (!standingMeetupId || !occurrenceId) {
        throw new functions.https.HttpsError('invalid-argument', 'standingMeetupId and occurrenceId are required');
    }
    // Get the meetup for title
    const meetupRef = db.collection('standingMeetups').doc(standingMeetupId);
    const meetupSnap = await meetupRef.get();
    if (!meetupSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'MEETUP_NOT_FOUND');
    }
    const meetup = meetupSnap.data();
    // Get the occurrence
    const occurrenceRef = meetupRef.collection('occurrences').doc(occurrenceId);
    const occurrenceSnap = await occurrenceRef.get();
    if (!occurrenceSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'OCCURRENCE_NOT_FOUND');
    }
    const occurrence = occurrenceSnap.data();
    // Check occurrence status is valid for check-in
    if (!['scheduled', 'in_progress'].includes(occurrence.status)) {
        throw new functions.https.HttpsError('failed-precondition', 'SESSION_NOT_ACTIVE');
    }
    // Check session is not closed
    if (occurrence.closedAt) {
        throw new functions.https.HttpsError('failed-precondition', 'SESSION_ALREADY_CLOSED');
    }
    // Check user is a participant
    const participantRef = occurrenceRef.collection('participants').doc(userId);
    const participantSnap = await participantRef.get();
    if (!participantSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'NOT_PARTICIPANT');
    }
    const participant = participantSnap.data();
    // Check not already checked in
    if (participant.status === 'checked_in') {
        throw new functions.https.HttpsError('already-exists', 'ALREADY_CHECKED_IN');
    }
    // Perform check-in using existing helper
    const checkedInAt = Date.now();
    await updateParticipantStatus(standingMeetupId, occurrenceId, userId, 'checked_in', {
        checkedInAt,
        checkInMethod: 'qr',
    });
    return {
        success: true,
        checkedInAt,
        sessionDate: formatSessionDate(occurrence.date),
        meetupTitle: meetup.title,
    };
});
exports.standingMeetup_addCashGuest = functions
    .region('australia-southeast1')
    .https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { standingMeetupId, occurrenceId, name, email, amount, notes, emailConsent } = data;
    const userId = context.auth.uid;
    // Validate required fields
    if (!standingMeetupId || !occurrenceId) {
        throw new functions.https.HttpsError('invalid-argument', 'standingMeetupId and occurrenceId are required');
    }
    if (!name || name.trim().length === 0) {
        throw new functions.https.HttpsError('invalid-argument', 'GUEST_NAME_REQUIRED');
    }
    if (typeof amount !== 'number' || amount < 0) {
        throw new functions.https.HttpsError('invalid-argument', 'INVALID_AMOUNT');
    }
    // Get the meetup
    const meetupRef = db.collection('standingMeetups').doc(standingMeetupId);
    const meetupSnap = await meetupRef.get();
    if (!meetupSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'MEETUP_NOT_FOUND');
    }
    const meetup = meetupSnap.data();
    // Check authorization
    const isAuthorized = await isOrganizerOrClubAdmin(userId, meetup);
    if (!isAuthorized) {
        throw new functions.https.HttpsError('permission-denied', 'NOT_CLUB_ADMIN');
    }
    // Get the occurrence
    const occurrenceRef = meetupRef.collection('occurrences').doc(occurrenceId);
    const occurrenceSnap = await occurrenceRef.get();
    if (!occurrenceSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'OCCURRENCE_NOT_FOUND');
    }
    const occurrence = occurrenceSnap.data();
    // Check session is not closed
    if (occurrence.closedAt) {
        throw new functions.https.HttpsError('failed-precondition', 'SESSION_ALREADY_CLOSED');
    }
    // Create guest document and update counters atomically
    const guestRef = occurrenceRef.collection('guests').doc();
    const guestId = guestRef.id;
    // Build guest data, omitting optional fields that are empty
    // Firestore rejects undefined values, so we only add fields that have values
    const guestData = Object.assign(Object.assign(Object.assign({ id: guestId, name: name.trim(), amount, paymentMethod: 'cash', receivedBy: userId, createdAt: Date.now(), createdBy: userId }, ((email === null || email === void 0 ? void 0 : email.trim()) && { email: email.trim() })), ((notes === null || notes === void 0 ? void 0 : notes.trim()) && { notes: notes.trim() })), (typeof emailConsent === 'boolean' && { emailConsent }));
    // Use transaction to atomically create guest and update counters
    const result = await db.runTransaction(async (transaction) => {
        // Re-read occurrence in transaction
        const occSnap = await transaction.get(occurrenceRef);
        if (!occSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'OCCURRENCE_NOT_FOUND');
        }
        const occData = occSnap.data();
        // Check again session is not closed (in transaction)
        if (occData.closedAt) {
            throw new functions.https.HttpsError('failed-precondition', 'SESSION_ALREADY_CLOSED');
        }
        // Create guest document
        transaction.set(guestRef, guestData);
        // Update occurrence counters
        const newGuestCount = (occData.guestCount || 0) + 1;
        const newGuestRevenue = (occData.guestRevenue || 0) + amount;
        transaction.update(occurrenceRef, {
            guestCount: firestore_1.FieldValue.increment(1),
            guestRevenue: firestore_1.FieldValue.increment(amount),
            updatedAt: Date.now(),
        });
        return { guestCount: newGuestCount };
    });
    return {
        success: true,
        guestId,
        guestCount: result.guestCount,
    };
});
// =============================================================================
// Close Session (Organizer only)
// =============================================================================
exports.standingMeetup_closeSession = functions
    .region('australia-southeast1')
    .https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { standingMeetupId, occurrenceId } = data;
    const userId = context.auth.uid;
    if (!standingMeetupId || !occurrenceId) {
        throw new functions.https.HttpsError('invalid-argument', 'standingMeetupId and occurrenceId are required');
    }
    // Get the meetup
    const meetupRef = db.collection('standingMeetups').doc(standingMeetupId);
    const meetupSnap = await meetupRef.get();
    if (!meetupSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'MEETUP_NOT_FOUND');
    }
    const meetup = meetupSnap.data();
    // Check authorization
    const isAuthorized = await isOrganizerOrClubAdmin(userId, meetup);
    if (!isAuthorized) {
        throw new functions.https.HttpsError('permission-denied', 'NOT_CLUB_ADMIN');
    }
    // Get the occurrence
    const occurrenceRef = meetupRef.collection('occurrences').doc(occurrenceId);
    const occurrenceSnap = await occurrenceRef.get();
    if (!occurrenceSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'OCCURRENCE_NOT_FOUND');
    }
    const occurrence = occurrenceSnap.data();
    // Check session is not already closed
    if (occurrence.closedAt) {
        throw new functions.https.HttpsError('failed-precondition', 'SESSION_ALREADY_CLOSED');
    }
    // Get all participants with status='expected' and mark them as no-show
    const participantsSnap = await occurrenceRef
        .collection('participants')
        .where('status', '==', 'expected')
        .get();
    const noShowCount = participantsSnap.size;
    const closedAt = Date.now();
    // Use batch for atomic updates
    const batch = db.batch();
    // Update each expected participant to no_show
    for (const participantDoc of participantsSnap.docs) {
        batch.update(participantDoc.ref, {
            status: 'no_show',
            updatedAt: closedAt,
        });
    }
    // Update occurrence: counters, closedAt, closedBy
    batch.update(occurrenceRef, {
        noShowCount: firestore_1.FieldValue.increment(noShowCount),
        expectedCount: 0, // All expected are now no_shows
        closedAt,
        closedBy: userId,
        status: 'completed',
        updatedAt: closedAt,
    });
    // Update index
    const indexRef = db
        .collection('meetupOccurrencesIndex')
        .doc(`${standingMeetupId}_${occurrenceId}`);
    batch.update(indexRef, {
        status: 'completed',
        updatedAt: closedAt,
    });
    await batch.commit();
    // Calculate final counts
    const finalCounts = {
        checkedIn: occurrence.checkedInCount || 0,
        guests: occurrence.guestCount || 0,
        noShows: (occurrence.noShowCount || 0) + noShowCount,
        totalPlayed: (occurrence.checkedInCount || 0) + (occurrence.guestCount || 0),
    };
    return {
        success: true,
        closedAt,
        finalCounts,
    };
});
// =============================================================================
// Check-In Player via QR Scan (Organizer Only)
// =============================================================================
/**
 * Check in a player by scanning their QR code (organizer action)
 * This is different from standingMeetup_checkInSelf (player self-check-in)
 * and standingMeetup_manualCheckIn (organizer selects from list)
 *
 * Input: { standingMeetupId, occurrenceId, playerUserId }
 * - Verifies caller is organizer/admin of the meetup
 * - Checks the player is registered for this occurrence
 * - Updates their registration to checked_in status
 * - Increments checkedInCount on the occurrence
 */
exports.standingMeetup_checkInPlayer = functions
    .region('australia-southeast1')
    .https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { standingMeetupId, occurrenceId, playerUserId } = data;
    const callerUserId = context.auth.uid;
    // Validate required fields
    if (!standingMeetupId || !occurrenceId || !playerUserId) {
        throw new functions.https.HttpsError('invalid-argument', 'standingMeetupId, occurrenceId, and playerUserId are required');
    }
    // Get the meetup
    const meetupRef = db.collection('standingMeetups').doc(standingMeetupId);
    const meetupSnap = await meetupRef.get();
    if (!meetupSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'MEETUP_NOT_FOUND');
    }
    const meetup = meetupSnap.data();
    // Check authorization - must be organizer or club admin
    const isAuthorized = await isOrganizerOrClubAdmin(callerUserId, meetup);
    if (!isAuthorized) {
        throw new functions.https.HttpsError('permission-denied', 'NOT_AUTHORIZED');
    }
    // Get the occurrence
    const occurrenceRef = meetupRef.collection('occurrences').doc(occurrenceId);
    const occurrenceSnap = await occurrenceRef.get();
    if (!occurrenceSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'OCCURRENCE_NOT_FOUND');
    }
    const occurrence = occurrenceSnap.data();
    // Check occurrence status is valid for check-in
    if (!['scheduled', 'in_progress'].includes(occurrence.status)) {
        throw new functions.https.HttpsError('failed-precondition', 'SESSION_NOT_ACTIVE');
    }
    // Check session is not closed
    if (occurrence.closedAt) {
        throw new functions.https.HttpsError('failed-precondition', 'SESSION_ALREADY_CLOSED');
    }
    // Check user is a participant
    const participantRef = occurrenceRef.collection('participants').doc(playerUserId);
    const participantSnap = await participantRef.get();
    if (!participantSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'NOT_PARTICIPANT');
    }
    const participant = participantSnap.data();
    // Check not already checked in
    if (participant.status === 'checked_in') {
        throw new functions.https.HttpsError('already-exists', 'ALREADY_CHECKED_IN');
    }
    // Perform check-in using existing helper
    const checkedInAt = Date.now();
    await updateParticipantStatus(standingMeetupId, occurrenceId, playerUserId, 'checked_in', {
        checkedInAt,
        checkInMethod: 'qr', // Via QR scan
        checkedInBy: callerUserId, // Track who scanned
    });
    // Get player name for response
    const playerName = participant.userName || 'Player';
    return {
        success: true,
        checkedInAt,
        playerUserId,
        playerName,
    };
});
//# sourceMappingURL=standingMeetups.js.map
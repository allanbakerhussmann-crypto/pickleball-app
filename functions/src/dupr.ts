/**
 * DUPR Submission Cloud Functions
 *
 * Server-side DUPR API integration for match result submission.
 * Implements batch submission with retry logic.
 *
 * Functions:
 * - dupr_submitMatches: Callable function for organizers to request submission
 * - dupr_processQueue: Scheduled function to process pending submissions
 * - dupr_submitCorrections: Process matches needing correction
 *
 * FILE LOCATION: functions/src/dupr.ts
 * VERSION: V07.04
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ============================================
// Configuration
// ============================================

const CONFIG = {
  // DUPR API configuration
  // NOTE: Replace with real credentials from DUPR
  DUPR_API_URL: 'https://api.mydupr.com/api/v1.0',
  DUPR_UAT_URL: 'https://uat.mydupr.com/api/v1.0',

  // Retry configuration
  MAX_RETRIES: 3,
  RETRY_DELAYS: [60000, 120000, 180000], // 1min, 2min, 3min

  // Batch configuration
  BATCH_SIZE: 50,
  PROCESS_INTERVAL_MINUTES: 5,
};

// ============================================
// Types
// ============================================

interface DuprSubmissionBatch {
  id: string;
  eventId: string;
  eventType: 'tournament' | 'league';
  matchIds: string[];
  status: 'pending' | 'processing' | 'completed' | 'partial_failure';
  createdAt: number;
  createdByUserId: string;
  processedAt?: number;
  results: {
    matchId: string;
    success: boolean;
    duprMatchId?: string;
    error?: string;
  }[];
  retryCount: number;
  nextRetryAt?: number;
}

interface Match {
  id: string;
  eventType: 'tournament' | 'league' | 'meetup';
  eventId: string;
  status: string;
  scoreState?: string;
  sideA?: {
    id: string;
    name: string;
    playerIds: string[];
    duprIds?: string[];
  };
  sideB?: {
    id: string;
    name: string;
    playerIds: string[];
    duprIds?: string[];
  };
  officialResult?: {
    scores: { gameNumber: number; scoreA: number; scoreB: number }[];
    winnerId: string;
    finalisedAt: number;
  };
  dupr?: {
    eligible: boolean;
    submitted: boolean;
    submittedAt?: number;
    submissionId?: string;
    submissionError?: string;
    pendingSubmission?: boolean;
    pendingSubmissionAt?: number;
    batchId?: string;
    retryCount?: number;
    lastRetryAt?: number;
    nextRetryAt?: number;
    needsCorrection?: boolean;
    correctionSubmitted?: boolean;
  };
  gameSettings?: {
    playType?: string;
  };
  completedAt?: number;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Get DUPR API token
 * NOTE: This is a placeholder - implement actual token generation
 */
async function getDuprToken(): Promise<string | null> {
  // Get credentials from Firebase config or Secret Manager
  const config = functions.config();
  const clientKey = config.dupr?.client_key;
  const clientSecret = config.dupr?.client_secret;

  if (!clientKey || !clientSecret) {
    console.error('[DUPR] Missing API credentials in config');
    return null;
  }

  try {
    // Base64 encode credentials
    const credentials = Buffer.from(`${clientKey}:${clientSecret}`).toString('base64');

    // Request token from DUPR API
    const response = await fetch(`${CONFIG.DUPR_API_URL}/token`, {
      method: 'POST',
      headers: {
        'x-authorization': credentials,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('[DUPR] Token request failed:', response.status);
      return null;
    }

    const data = await response.json();
    return data.token || data.access_token;
  } catch (error) {
    console.error('[DUPR] Token request error:', error);
    return null;
  }
}

/**
 * Convert match to DUPR submission format
 */
function convertMatchToDuprFormat(match: Match, eventName: string): object | null {
  if (!match.officialResult || !match.sideA || !match.sideB) {
    return null;
  }

  // Check all players have DUPR IDs
  const sideADuprIds = match.sideA.duprIds || [];
  const sideBDuprIds = match.sideB.duprIds || [];

  if (sideADuprIds.length === 0 || sideBDuprIds.length === 0) {
    console.log(`[DUPR] Match ${match.id} missing DUPR IDs`);
    return null;
  }

  // Determine match type (singles or doubles)
  const isDoubles = match.gameSettings?.playType !== 'singles';

  // Build player arrays
  const team1 = sideADuprIds.map(id => ({ duprId: id }));
  const team2 = sideBDuprIds.map(id => ({ duprId: id }));

  // Build games array from scores
  const games = match.officialResult.scores.map((score, index) => ({
    gameNumber: index + 1,
    team1Score: score.scoreA,
    team2Score: score.scoreB,
  }));

  // Determine winner (1 or 2)
  const winnerTeam = match.officialResult.winnerId === match.sideA.id ? 1 : 2;

  return {
    eventName,
    matchDate: new Date(match.officialResult.finalisedAt).toISOString().split('T')[0],
    matchType: isDoubles ? 'DOUBLES' : 'SINGLES',
    team1,
    team2,
    games,
    winnerTeam,
    // Optional fields
    matchFormat: 'REGULAR',
    location: null,
  };
}

/**
 * Submit a single match to DUPR API
 */
async function submitMatchToDupr(
  match: Match,
  eventName: string,
  token: string
): Promise<{ success: boolean; duprMatchId?: string; error?: string }> {
  const duprMatch = convertMatchToDuprFormat(match, eventName);

  if (!duprMatch) {
    return { success: false, error: 'Invalid match data for DUPR submission' };
  }

  try {
    const response = await fetch(`${CONFIG.DUPR_API_URL}/result/submit`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(duprMatch),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[DUPR] Submit failed for ${match.id}:`, response.status, errorText);
      return { success: false, error: `API error: ${response.status}` };
    }

    const data = await response.json();
    return {
      success: true,
      duprMatchId: data.matchId || data.id,
    };
  } catch (error) {
    console.error(`[DUPR] Submit error for ${match.id}:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Get match document path based on event type
 */
function getMatchPath(eventType: string, eventId: string, matchId: string): string {
  switch (eventType) {
    case 'tournament':
      return `tournaments/${eventId}/matches/${matchId}`;
    case 'league':
      return `leagues/${eventId}/matches/${matchId}`;
    case 'meetup':
      return `meetups/${eventId}/matches/${matchId}`;
    default:
      throw new Error(`Unknown event type: ${eventType}`);
  }
}

/**
 * Get event name for DUPR submission
 */
async function getEventName(eventType: string, eventId: string): Promise<string> {
  try {
    const collection = eventType === 'tournament' ? 'tournaments' :
                       eventType === 'league' ? 'leagues' : 'meetups';
    const doc = await db.collection(collection).doc(eventId).get();
    const data = doc.data();
    return data?.name || data?.title || `${eventType}-${eventId}`;
  } catch {
    return `${eventType}-${eventId}`;
  }
}

// ============================================
// Callable Function: Request DUPR Submission
// ============================================

interface SubmitMatchesRequest {
  eventType: 'tournament' | 'league';
  eventId: string;
  matchIds: string[];
}

interface SubmitMatchesResponse {
  success: boolean;
  batchId?: string;
  message: string;
  eligibleCount?: number;
  ineligibleCount?: number;
}

/**
 * Request DUPR submission for completed matches
 *
 * Called by organizers to queue matches for DUPR submission.
 * Creates a batch record and queues matches for processing.
 */
export const dupr_submitMatches = functions.https.onCall(
  async (data: SubmitMatchesRequest, context): Promise<SubmitMatchesResponse> => {
    // Verify authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { eventType, eventId, matchIds } = data;
    const userId = context.auth.uid;

    // Validate input
    if (!eventType || !eventId || !matchIds || matchIds.length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
    }

    // Verify user is organizer for this event
    const eventCollection = eventType === 'tournament' ? 'tournaments' : 'leagues';
    const eventDoc = await db.collection(eventCollection).doc(eventId).get();

    if (!eventDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Event not found');
    }

    const eventData = eventDoc.data();
    const isOrganizer = eventData?.organizerId === userId ||
                        eventData?.organizerIds?.includes(userId) ||
                        eventData?.createdBy === userId;

    if (!isOrganizer) {
      throw new functions.https.HttpsError('permission-denied', 'Only organizers can submit to DUPR');
    }

    // Validate matches are eligible
    const eligibleMatchIds: string[] = [];
    const ineligibleMatchIds: string[] = [];

    for (const matchId of matchIds) {
      const matchPath = getMatchPath(eventType, eventId, matchId);
      const matchDoc = await db.doc(matchPath).get();

      if (!matchDoc.exists) {
        ineligibleMatchIds.push(matchId);
        continue;
      }

      const match = { id: matchDoc.id, ...matchDoc.data() } as Match;

      // Check eligibility
      if (
        match.officialResult &&
        match.status === 'completed' &&
        match.scoreState === 'official' &&
        match.dupr?.eligible !== false &&
        !match.dupr?.submitted
      ) {
        eligibleMatchIds.push(matchId);
      } else {
        ineligibleMatchIds.push(matchId);
      }
    }

    if (eligibleMatchIds.length === 0) {
      return {
        success: false,
        message: 'No eligible matches for DUPR submission',
        eligibleCount: 0,
        ineligibleCount: ineligibleMatchIds.length,
      };
    }

    // Create batch record
    const batchId = db.collection('dupr_submission_batches').doc().id;
    const batch: DuprSubmissionBatch = {
      id: batchId,
      eventId,
      eventType,
      matchIds: eligibleMatchIds,
      status: 'pending',
      createdAt: Date.now(),
      createdByUserId: userId,
      results: [],
      retryCount: 0,
    };

    await db.collection('dupr_submission_batches').doc(batchId).set(batch);

    // Mark matches as pending submission
    const updateBatch = db.batch();
    for (const matchId of eligibleMatchIds) {
      const matchPath = getMatchPath(eventType, eventId, matchId);
      updateBatch.update(db.doc(matchPath), {
        'dupr.pendingSubmission': true,
        'dupr.pendingSubmissionAt': Date.now(),
        'dupr.batchId': batchId,
        updatedAt: Date.now(),
      });
    }
    await updateBatch.commit();

    console.log(`[DUPR] Created batch ${batchId} with ${eligibleMatchIds.length} matches`);

    return {
      success: true,
      batchId,
      message: `Queued ${eligibleMatchIds.length} matches for DUPR submission`,
      eligibleCount: eligibleMatchIds.length,
      ineligibleCount: ineligibleMatchIds.length,
    };
  }
);

// ============================================
// Scheduled Function: Process Submission Queue
// ============================================

/**
 * Process pending DUPR submissions
 *
 * Runs every 5 minutes to process queued batches.
 * Implements retry logic with exponential backoff.
 */
export const dupr_processQueue = functions.pubsub
  .schedule(`every ${CONFIG.PROCESS_INTERVAL_MINUTES} minutes`)
  .onRun(async () => {
    console.log('[DUPR] Processing submission queue...');

    // Get DUPR token
    const token = await getDuprToken();
    if (!token) {
      console.error('[DUPR] Failed to get API token, skipping processing');
      return;
    }

    // Find pending batches
    const pendingBatches = await db.collection('dupr_submission_batches')
      .where('status', '==', 'pending')
      .limit(10)
      .get();

    // Also find batches ready for retry
    const retryBatches = await db.collection('dupr_submission_batches')
      .where('status', '==', 'partial_failure')
      .where('nextRetryAt', '<=', Date.now())
      .where('retryCount', '<', CONFIG.MAX_RETRIES)
      .limit(5)
      .get();

    const allBatches = [...pendingBatches.docs, ...retryBatches.docs];

    if (allBatches.length === 0) {
      console.log('[DUPR] No pending batches to process');
      return;
    }

    console.log(`[DUPR] Processing ${allBatches.length} batches`);

    for (const batchDoc of allBatches) {
      const batch = batchDoc.data() as DuprSubmissionBatch;

      // Mark as processing
      await batchDoc.ref.update({ status: 'processing' });

      try {
        // Get event name
        const eventName = await getEventName(batch.eventType, batch.eventId);

        // Process each match
        const results: DuprSubmissionBatch['results'] = [];
        let successCount = 0;
        let failureCount = 0;

        for (const matchId of batch.matchIds) {
          // Skip if already successfully submitted in previous attempt
          const previousResult = batch.results.find(r => r.matchId === matchId);
          if (previousResult?.success) {
            results.push(previousResult);
            successCount++;
            continue;
          }

          // Get match
          const matchPath = getMatchPath(batch.eventType, batch.eventId, matchId);
          const matchDoc = await db.doc(matchPath).get();

          if (!matchDoc.exists) {
            results.push({ matchId, success: false, error: 'Match not found' });
            failureCount++;
            continue;
          }

          const match = { id: matchDoc.id, ...matchDoc.data() } as Match;

          // Submit to DUPR
          const result = await submitMatchToDupr(match, eventName, token);

          results.push({
            matchId,
            success: result.success,
            duprMatchId: result.duprMatchId,
            error: result.error,
          });

          if (result.success) {
            successCount++;

            // Update match with submission result
            await db.doc(matchPath).update({
              'dupr.submitted': true,
              'dupr.submittedAt': Date.now(),
              'dupr.submissionId': result.duprMatchId,
              'dupr.pendingSubmission': false,
              'dupr.submissionError': null,
              scoreState: 'submittedToDupr',
              updatedAt: Date.now(),
            });
          } else {
            failureCount++;

            // Update match with error
            await db.doc(matchPath).update({
              'dupr.submissionError': result.error,
              'dupr.lastRetryAt': Date.now(),
              'dupr.retryCount': admin.firestore.FieldValue.increment(1),
              updatedAt: Date.now(),
            });
          }

          // Small delay between submissions to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Update batch status
        const allSuccess = failureCount === 0;
        const allFailed = successCount === 0;

        const updateData: Partial<DuprSubmissionBatch> & { processedAt: number } = {
          results,
          processedAt: Date.now(),
          status: allSuccess ? 'completed' : allFailed ? 'partial_failure' : 'partial_failure',
        };

        if (!allSuccess && batch.retryCount < CONFIG.MAX_RETRIES) {
          updateData.retryCount = batch.retryCount + 1;
          updateData.nextRetryAt = Date.now() + CONFIG.RETRY_DELAYS[batch.retryCount];
        }

        await batchDoc.ref.update(updateData);

        console.log(`[DUPR] Batch ${batch.id}: ${successCount} success, ${failureCount} failed`);
      } catch (error) {
        console.error(`[DUPR] Batch ${batch.id} processing error:`, error);

        await batchDoc.ref.update({
          status: 'partial_failure',
          retryCount: batch.retryCount + 1,
          nextRetryAt: Date.now() + CONFIG.RETRY_DELAYS[Math.min(batch.retryCount, 2)],
        });
      }
    }

    console.log('[DUPR] Queue processing complete');
  });

// ============================================
// Scheduled Function: Process Corrections
// ============================================

/**
 * Process matches needing DUPR correction
 *
 * Runs hourly to handle matches where officialResult was changed
 * after initial DUPR submission.
 */
export const dupr_processCorrections = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async () => {
    console.log('[DUPR] Processing corrections...');

    // Get DUPR token
    const token = await getDuprToken();
    if (!token) {
      console.error('[DUPR] Failed to get API token, skipping corrections');
      return;
    }

    // Find matches needing correction across all event types
    const collections = ['tournaments', 'leagues'];

    for (const collection of collections) {
      // Get all events
      const events = await db.collection(collection).get();

      for (const eventDoc of events.docs) {
        // Find matches needing correction
        const matchesNeedingCorrection = await db
          .collection(collection)
          .doc(eventDoc.id)
          .collection('matches')
          .where('dupr.needsCorrection', '==', true)
          .where('dupr.correctionSubmitted', '==', false)
          .limit(20)
          .get();

        if (matchesNeedingCorrection.empty) continue;

        const eventName = await getEventName(
          collection === 'tournaments' ? 'tournament' : 'league',
          eventDoc.id
        );

        for (const matchDoc of matchesNeedingCorrection.docs) {
          const match = { id: matchDoc.id, ...matchDoc.data() } as Match;

          // Submit correction (same as regular submission but with correction flag)
          const result = await submitMatchToDupr(match, eventName, token);

          if (result.success) {
            await matchDoc.ref.update({
              'dupr.correctionSubmitted': true,
              'dupr.correctionSubmittedAt': Date.now(),
              'dupr.needsCorrection': false,
              updatedAt: Date.now(),
            });
            console.log(`[DUPR] Correction submitted for ${match.id}`);
          } else {
            console.error(`[DUPR] Correction failed for ${match.id}:`, result.error);
          }

          // Small delay between submissions
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }

    console.log('[DUPR] Correction processing complete');
  });

// ============================================
// Callable Function: Get Batch Status
// ============================================

interface GetBatchStatusRequest {
  batchId: string;
}

interface GetBatchStatusResponse {
  success: boolean;
  batch?: DuprSubmissionBatch;
  message?: string;
}

/**
 * Get status of a DUPR submission batch
 */
export const dupr_getBatchStatus = functions.https.onCall(
  async (data: GetBatchStatusRequest, context): Promise<GetBatchStatusResponse> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { batchId } = data;

    if (!batchId) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing batchId');
    }

    const batchDoc = await db.collection('dupr_submission_batches').doc(batchId).get();

    if (!batchDoc.exists) {
      return { success: false, message: 'Batch not found' };
    }

    return {
      success: true,
      batch: batchDoc.data() as DuprSubmissionBatch,
    };
  }
);

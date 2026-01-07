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

const logger = functions.logger;
const db = admin.firestore();

// ============================================
// Configuration
// ============================================

const CONFIG = {
  // DUPR API configuration
  // Using UAT environment for testing
  // Switch to production URLs after DUPR approval
  ENVIRONMENT: 'uat' as 'uat' | 'production',

  // UAT URLs (testing)
  UAT_BASE_URL: 'https://uat.mydupr.com/api',
  UAT_TOKEN_URL: 'https://uat.mydupr.com/api/auth/v1.0/token',
  UAT_MATCH_URL: 'https://uat.mydupr.com/api/match/v1.0/create',

  // Production URLs (after approval)
  PROD_BASE_URL: 'https://prod.mydupr.com/api',
  PROD_TOKEN_URL: 'https://prod.mydupr.com/api/auth/v1.0/token',
  PROD_MATCH_URL: 'https://prod.mydupr.com/api/match/v1.0/create',

  // Retry configuration
  MAX_RETRIES: 3,
  RETRY_DELAYS: [60000, 120000, 180000], // 1min, 2min, 3min

  // Batch configuration
  BATCH_SIZE: 50,
  PROCESS_INTERVAL_MINUTES: 5,
};

// Get URL based on environment
const getTokenUrl = () => CONFIG.ENVIRONMENT === 'uat' ? CONFIG.UAT_TOKEN_URL : CONFIG.PROD_TOKEN_URL;
const getMatchUrl = () => CONFIG.ENVIRONMENT === 'uat' ? CONFIG.UAT_MATCH_URL : CONFIG.PROD_MATCH_URL;

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
 * Get DUPR API token using client credentials
 * Per DUPR RaaS docs: https://dupr.gitbook.io/dupr-raas/quick-start-and-token-generation
 */
async function getDuprToken(): Promise<string | null> {
  // Get credentials from Firebase config
  const config = functions.config();
  const clientKey = config.dupr?.client_key;
  const clientSecret = config.dupr?.client_secret;

  if (!clientKey || !clientSecret) {
    logger.error('[DUPR] Missing API credentials in config', {
      hasClientKey: !!clientKey,
      hasClientSecret: !!clientSecret,
    });
    return null;
  }

  try {
    // Base64 encode clientKey:clientSecret as per DUPR docs
    const credentials = Buffer.from(`${clientKey}:${clientSecret}`).toString('base64');
    const tokenUrl = getTokenUrl();

    logger.info('[DUPR] Requesting token from:', tokenUrl);

    // Request token from DUPR API
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'x-authorization': credentials,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      logger.error('[DUPR] Token request failed:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText.substring(0, 500),
      });
      return null;
    }

    const data = await response.json();
    const token = data.token || data.accessToken || data.result?.token;

    if (!token) {
      logger.error('[DUPR] No token in response:', data);
      return null;
    }

    logger.info('[DUPR] Token obtained successfully');
    return token;
  } catch (error) {
    logger.error('[DUPR] Token request error:', error);
    return null;
  }
}

/**
 * Fetch DUPR IDs for player IDs from user profiles
 */
async function fetchDuprIdsForPlayers(playerIds: string[]): Promise<string[]> {
  const duprIds: string[] = [];

  for (const playerId of playerIds) {
    if (!playerId) continue;

    try {
      const userDoc = await db.collection('users').doc(playerId).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        if (userData?.duprId) {
          duprIds.push(userData.duprId);
        }
      }
    } catch (error) {
      logger.warn(`[DUPR] Failed to fetch user ${playerId}:`, error);
    }
  }

  return duprIds;
}

/**
 * Convert match to DUPR submission format
 *
 * Per DUPR RaaS API documentation:
 * - identifier: unique match ID (required) - deterministic: ${eventType}_${eventId}_${matchId}
 * - matchSource: CLUB or PARTNER (required)
 * - teamA/teamB: { player1, player2?, game1, game2, ... } format
 * - Game counts MUST match between teamA and teamB
 *
 * VALIDATION RULES:
 * - No tied games (HARD BLOCK)
 * - Game count 1-5 (HARD BLOCK)
 * - Min 6+ score (WARNING only, unless DUPR rejects)
 * - PARTNER: strip clubId entirely
 * - CLUB: require clubId as number
 */
async function convertMatchToDuprFormat(
  match: Match,
  eventName: string,
  eventType: string,
  eventId: string
): Promise<{ payload: object | null; warnings: string[]; error?: string }> {
  const warnings: string[] = [];

  if (!match.officialResult || !match.sideA || !match.sideB) {
    logger.warn(`[DUPR] Match ${match.id} missing officialResult or sides`);
    return { payload: null, warnings: [], error: 'Missing official result or team data' };
  }

  const scores = match.officialResult.scores;

  // VALIDATION 1: Check game count (1-5 games allowed)
  if (!scores || scores.length < 1 || scores.length > 5) {
    logger.error(`[DUPR] Match ${match.id} invalid game count: ${scores?.length || 0}`);
    return { payload: null, warnings: [], error: `Invalid game count: ${scores?.length || 0} (must be 1-5)` };
  }

  // VALIDATION 2: Check for tied games (HARD BLOCK)
  for (const score of scores) {
    if (score.scoreA === score.scoreB) {
      logger.error(`[DUPR] Match ${match.id} has tied game: ${score.scoreA}-${score.scoreB}`);
      return { payload: null, warnings: [], error: `Tied game not allowed: ${score.scoreA}-${score.scoreB}` };
    }
  }

  // VALIDATION 3: Check minimum score (WARNING only)
  const hasMinScore = scores.some(s => s.scoreA >= 6 || s.scoreB >= 6);
  if (!hasMinScore) {
    warnings.push('No game with minimum 6 points - DUPR may reject');
    logger.warn(`[DUPR] Match ${match.id} warning: no game with 6+ points`);
  }

  // Get player IDs from match
  const sideAPlayerIds = match.sideA.playerIds || [];
  const sideBPlayerIds = match.sideB.playerIds || [];

  // Determine if this is a doubles match BEFORE checking DUPR IDs
  // Doubles = more than 1 player per side, or playType is not 'singles'
  const isDoubles = sideAPlayerIds.length > 1 || sideBPlayerIds.length > 1 ||
    (match.gameSettings?.playType && match.gameSettings.playType !== 'singles');

  // First check if DUPR IDs are already on the match
  let sideADuprIds = match.sideA.duprIds || [];
  let sideBDuprIds = match.sideB.duprIds || [];

  // If not on match, fetch from user profiles
  if (sideADuprIds.length === 0 && sideAPlayerIds.length > 0) {
    sideADuprIds = await fetchDuprIdsForPlayers(sideAPlayerIds);
  }
  if (sideBDuprIds.length === 0 && sideBPlayerIds.length > 0) {
    sideBDuprIds = await fetchDuprIdsForPlayers(sideBPlayerIds);
  }

  // VALIDATION: For doubles, ALL players must have DUPR IDs
  // For singles, both players must have DUPR IDs
  const expectedPerSide = isDoubles ? 2 : 1;

  if (sideADuprIds.length < expectedPerSide || sideBDuprIds.length < expectedPerSide) {
    const missingCount = (expectedPerSide - sideADuprIds.length) + (expectedPerSide - sideBDuprIds.length);
    const matchType = isDoubles ? 'doubles' : 'singles';

    logger.warn(`[DUPR] Match ${match.id} missing DUPR IDs for ${matchType}`, {
      expected: expectedPerSide,
      sideAPlayerCount: sideAPlayerIds.length,
      sideBPlayerCount: sideBPlayerIds.length,
      sideADuprCount: sideADuprIds.length,
      sideBDuprCount: sideBDuprIds.length,
    });

    // Return specific error message for UI display
    return {
      payload: null,
      warnings: [],
      error: `${missingCount} player(s) missing DUPR link - all ${isDoubles ? '4' : '2'} players must link DUPR accounts`,
    };
  }

  // Build teamA object - MUST have same game fields as teamB
  const teamA: Record<string, string | number> = {
    player1: sideADuprIds[0],
  };
  if (isDoubles && sideADuprIds[1]) {
    teamA.player2 = sideADuprIds[1];
  }

  // Build teamB object
  const teamB: Record<string, string | number> = {
    player1: sideBDuprIds[0],
  };
  if (isDoubles && sideBDuprIds[1]) {
    teamB.player2 = sideBDuprIds[1];
  }

  // Add SAME game fields to BOTH teams (critical: must match)
  scores.forEach((score, index) => {
    const gameNum = `game${index + 1}`;
    teamA[gameNum] = score.scoreA;
    teamB[gameNum] = score.scoreB;
  });

  // Deterministic identifier for stable retries
  const identifier = `${eventType}_${eventId}_${match.id}`;

  // Get club ID from config
  const config = functions.config();
  const clubId = config.dupr?.club_id;

  // HARD RULE: matchSource determines clubId handling
  const matchSource: 'CLUB' | 'PARTNER' = clubId ? 'CLUB' : 'PARTNER';

  // Build submission payload
  const submission: Record<string, unknown> = {
    identifier,
    event: eventName,
    format: isDoubles ? 'DOUBLES' : 'SINGLES',
    matchDate: new Date(match.officialResult.finalisedAt).toISOString().split('T')[0],
    matchSource,
    teamA,
    teamB,
  };

  // HARD RULE: Only add clubId if CLUB source, strip entirely if PARTNER
  if (matchSource === 'CLUB') {
    const parsedClubId = parseInt(clubId, 10);
    if (isNaN(parsedClubId)) {
      logger.error(`[DUPR] Invalid clubId: ${clubId}`);
      return { payload: null, warnings, error: 'Invalid club ID configuration' };
    }
    submission.clubId = parsedClubId;
  }
  // If PARTNER, clubId is NOT added (not even null)

  // Safe logging - no player IDs, no credentials
  logger.info(`[DUPR] Formatted match ${match.id}:`, {
    identifier,
    matchSource,
    format: submission.format,
    gameCount: scores.length,
    hasClubId: !!submission.clubId,
    warnings: warnings.length > 0 ? warnings : undefined,
  });

  return { payload: submission, warnings };
}

/**
 * Submit a single match to DUPR API
 */
async function submitMatchToDupr(
  match: Match,
  eventName: string,
  eventType: string,
  eventId: string,
  token: string
): Promise<{ success: boolean; duprMatchId?: string; error?: string; warnings?: string[] }> {
  const result = await convertMatchToDuprFormat(match, eventName, eventType, eventId);

  if (!result || !result.payload) {
    // Use specific error from validation if available, otherwise generic
    const errorMsg = result?.error || 'Invalid match data - missing scores or validation failed';
    return { success: false, error: errorMsg, warnings: result?.warnings };
  }

  const { payload: duprMatch, warnings } = result;

  try {
    const matchUrl = getMatchUrl();

    // Safe logging - no full payload with player IDs
    logger.info('[DUPR] Submitting match:', {
      url: matchUrl,
      identifier: (duprMatch as any).identifier,
      matchSource: (duprMatch as any).matchSource,
      format: (duprMatch as any).format,
      gameCount: Object.keys((duprMatch as any).teamA || {}).filter(k => k.startsWith('game')).length,
      hasClubId: !!(duprMatch as any).clubId,
    });

    const response = await fetch(matchUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(duprMatch),
    });

    if (!response.ok) {
      const errorText = await response.text();
      // Parse error for better message
      let errorMessage = `API error: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.message || errorJson.error || errorJson.errors?.[0]?.message || errorText;
      } catch {
        errorMessage = errorText || `API error: ${response.status}`;
      }

      // SPECIAL CASE: If DUPR says "already exists", treat as success
      // This happens when match was submitted before but local DB wasn't updated
      if (errorMessage.includes('already exists') || errorMessage.includes('Object identifiers must be universally unique')) {
        logger.info(`[DUPR] Match already exists in DUPR, marking as submitted:`, {
          identifier: (duprMatch as any).identifier,
        });
        return {
          success: true,
          duprMatchId: 'already-submitted',
          warnings: [...(warnings || []), 'Match was already in DUPR database'],
        };
      }

      logger.error(`[DUPR] Submit failed:`, {
        status: response.status,
        error: errorMessage,
      });

      return { success: false, error: errorMessage, warnings };
    }

    const data = await response.json();
    logger.info(`[DUPR] Submit success:`, { duprMatchId: data.matchId || data.id });

    return {
      success: true,
      duprMatchId: data.matchId || data.id,
      warnings,
    };
  } catch (error) {
    logger.error(`[DUPR] Submit exception:`, { error: error instanceof Error ? error.message : 'Unknown' });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error', warnings };
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
 * Submit matches to DUPR immediately
 *
 * Called by organizers to submit matches to DUPR.
 * Submits immediately and returns results.
 */
export const dupr_submitMatches = functions
  .runWith({ timeoutSeconds: 300 }) // 5 minute timeout for bulk submissions
  .https.onCall(
  async (data: SubmitMatchesRequest, context): Promise<SubmitMatchesResponse> => {
    // Verify authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { eventType, eventId, matchIds: providedMatchIds } = data;
    const userId = context.auth.uid;

    logger.info('[DUPR] dupr_submitMatches called', { eventType, eventId, matchIdsCount: providedMatchIds?.length || 0, userId });

    // Validate input
    if (!eventType || !eventId) {
      logger.error('[DUPR] Missing required fields', { eventType, eventId });
      throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
    }

    // If matchIds not provided, we'll query all eligible matches below
    let matchIds = providedMatchIds || [];

    // Verify user is organizer for this event
    const eventCollection = eventType === 'tournament' ? 'tournaments' : 'leagues';
    const eventDoc = await db.collection(eventCollection).doc(eventId).get();

    if (!eventDoc.exists) {
      logger.error('[DUPR] Event not found', { eventType, eventId });
      throw new functions.https.HttpsError('not-found', 'Event not found');
    }

    const eventData = eventDoc.data();
    logger.info('[DUPR] Event data', {
      organizerId: eventData?.organizerId,
      organizerIds: eventData?.organizerIds,
      createdBy: eventData?.createdBy,
      createdByUserId: eventData?.createdByUserId,
      userId
    });

    // Check various organizer field names (tournaments use organizerId, leagues use createdByUserId)
    const isOrganizer = eventData?.organizerId === userId ||
                        eventData?.organizerIds?.includes(userId) ||
                        eventData?.createdBy === userId ||
                        eventData?.createdByUserId === userId;

    if (!isOrganizer) {
      logger.error('[DUPR] User is not organizer', { userId, eventData });
      throw new functions.https.HttpsError('permission-denied', 'Only organizers can submit to DUPR');
    }

    logger.info('[DUPR] User verified as organizer');

    // Get DUPR API token
    const token = await getDuprToken();
    if (!token) {
      logger.error('[DUPR] Failed to get API token');
      throw new functions.https.HttpsError('unavailable', 'DUPR API unavailable - missing credentials');
    }

    // Get event name for DUPR submission
    const eventName = eventData?.name || eventData?.title || `${eventType}-${eventId}`;

    // If no matchIds provided, query all eligible matches
    if (matchIds.length === 0) {
      logger.info('[DUPR] No matchIds provided, querying all eligible matches...');
      const matchesCollection = db.collection(eventType === 'tournament' ? 'tournaments' : 'leagues')
        .doc(eventId)
        .collection('matches');

      const allMatches = await matchesCollection
        .where('status', '==', 'completed')
        .where('scoreState', '==', 'official')
        .get();

      logger.info('[DUPR] Query returned matches', { count: allMatches.docs.length });

      for (const doc of allMatches.docs) {
        const match = doc.data();
        // Additional eligibility checks
        if (
          match.officialResult &&
          match.dupr?.eligible !== false &&
          !match.dupr?.submitted
        ) {
          matchIds.push(doc.id);
        }
      }

      logger.info(`[DUPR] Found ${matchIds.length} eligible matches after filtering`);
    }

    // Collect eligible matches and submit immediately
    const results: { matchId: string; success: boolean; duprMatchId?: string; error?: string }[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const matchId of matchIds) {
      const matchPath = getMatchPath(eventType, eventId, matchId);
      const matchDoc = await db.doc(matchPath).get();

      if (!matchDoc.exists) {
        results.push({ matchId, success: false, error: 'Match not found' });
        failureCount++;
        continue;
      }

      const match = { id: matchDoc.id, ...matchDoc.data() } as Match;

      // Check eligibility
      if (
        !match.officialResult ||
        match.status !== 'completed' ||
        match.scoreState !== 'official' ||
        match.dupr?.eligible === false ||
        match.dupr?.submitted
      ) {
        // Skip ineligible matches silently
        continue;
      }

      // Submit to DUPR immediately
      logger.info(`[DUPR] Submitting match ${matchId} to DUPR...`);
      const result = await submitMatchToDupr(match, eventName, eventType, eventId, token);

      // Only include defined values to avoid Firestore undefined error
      const resultEntry: { matchId: string; success: boolean; duprMatchId?: string; error?: string } = {
        matchId,
        success: result.success,
      };
      if (result.duprMatchId) resultEntry.duprMatchId = result.duprMatchId;
      if (result.error) resultEntry.error = result.error;
      results.push(resultEntry);

      if (result.success) {
        successCount++;

        // Update match with successful submission
        await db.doc(matchPath).update({
          'dupr.submitted': true,
          'dupr.submittedAt': Date.now(),
          'dupr.submissionId': result.duprMatchId,
          'dupr.pendingSubmission': false,
          'dupr.submissionError': null,
          scoreState: 'submittedToDupr',
          updatedAt: Date.now(),
        });

        logger.info(`[DUPR] Match ${matchId} submitted successfully: ${result.duprMatchId}`);
      } else {
        failureCount++;

        // Update match with error
        await db.doc(matchPath).update({
          'dupr.submissionError': result.error,
          'dupr.lastAttemptAt': Date.now(),
          updatedAt: Date.now(),
        });

        logger.error(`[DUPR] Match ${matchId} submission failed: ${result.error}`);
      }

      // Small delay between submissions to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Create batch record for history tracking
    const batchId = db.collection('dupr_submission_batches').doc().id;
    const batch: DuprSubmissionBatch = {
      id: batchId,
      eventId,
      eventType,
      matchIds: results.map(r => r.matchId),
      status: failureCount === 0 ? 'completed' : successCount === 0 ? 'partial_failure' : 'partial_failure',
      createdAt: Date.now(),
      createdByUserId: userId,
      results,
      retryCount: 0,
      processedAt: Date.now(),
    };

    await db.collection('dupr_submission_batches').doc(batchId).set(batch);

    logger.info(`[DUPR] Batch ${batchId} complete: ${successCount} success, ${failureCount} failed`);

    return {
      success: successCount > 0,
      batchId,
      message: failureCount === 0
        ? `Successfully submitted ${successCount} matches to DUPR`
        : successCount > 0
        ? `Submitted ${successCount} matches, ${failureCount} failed`
        : `Failed to submit ${failureCount} matches to DUPR`,
      eligibleCount: successCount,
      ineligibleCount: failureCount,
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
          const result = await submitMatchToDupr(match, eventName, batch.eventType, batch.eventId, token);

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
          const correctionEventType = collection === 'tournaments' ? 'tournament' : 'league';

          // Submit correction (same as regular submission but with correction flag)
          const result = await submitMatchToDupr(match, eventName, correctionEventType, eventDoc.id, token);

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

// ============================================
// Scheduled Function: Daily DUPR Rating Sync
// ============================================

/**
 * Sync DUPR ratings for all linked users
 *
 * Runs daily at 3 AM NZ time (14:00 UTC previous day / 15:00 UTC during DST)
 * Fetches latest ratings from DUPR and updates user profiles
 */
export const dupr_syncRatings = functions.pubsub
  .schedule('0 3 * * *')  // 3 AM daily
  .timeZone('Pacific/Auckland')
  .onRun(async () => {
    logger.info('[DUPR] Starting daily rating sync...');

    // Get DUPR API token
    const token = await getDuprToken();
    if (!token) {
      logger.error('[DUPR] Failed to get API token, skipping rating sync');
      return;
    }

    // Find all users with linked DUPR accounts
    const usersWithDupr = await db.collection('users')
      .where('duprId', '!=', null)
      .get();

    if (usersWithDupr.empty) {
      logger.info('[DUPR] No users with linked DUPR accounts');
      return;
    }

    logger.info(`[DUPR] Found ${usersWithDupr.docs.length} users with linked DUPR accounts`);

    let successCount = 0;
    let failureCount = 0;
    const baseUrl = CONFIG.ENVIRONMENT === 'uat' ? CONFIG.UAT_BASE_URL : CONFIG.PROD_BASE_URL;

    for (const userDoc of usersWithDupr.docs) {
      const userData = userDoc.data();
      const duprId = userData.duprId;

      if (!duprId) continue;

      try {
        // Fetch player data from DUPR
        const response = await fetch(`${baseUrl}/player/v1.0/${duprId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          logger.warn(`[DUPR] Failed to fetch ratings for user ${userDoc.id} (DUPR: ${duprId}): ${response.status}`);
          failureCount++;
          continue;
        }

        const data = await response.json();
        const result = data.result || data;

        // Extract ratings
        const doublesRating = result.ratings?.doubles || result.doublesRating;
        const singlesRating = result.ratings?.singles || result.singlesRating;
        const doublesReliability = result.ratings?.doublesReliability;
        const singlesReliability = result.ratings?.singlesReliability;

        // Only update if we got valid data
        if (doublesRating !== undefined || singlesRating !== undefined) {
          const updateData: Record<string, unknown> = {
            duprLastSyncAt: Date.now(),
          };

          if (doublesRating !== undefined) {
            updateData.duprDoubles = doublesRating;
            updateData.duprDoublesReliability = doublesReliability;
          }
          if (singlesRating !== undefined) {
            updateData.duprSingles = singlesRating;
            updateData.duprSinglesReliability = singlesReliability;
          }

          await userDoc.ref.update(updateData);
          successCount++;

          logger.info(`[DUPR] Updated ratings for user ${userDoc.id}: doubles=${doublesRating}, singles=${singlesRating}`);
        }

        // Rate limiting - small delay between requests
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error) {
        logger.error(`[DUPR] Error syncing ratings for user ${userDoc.id}:`, error);
        failureCount++;
      }
    }

    logger.info(`[DUPR] Daily rating sync complete: ${successCount} updated, ${failureCount} failed`);
  });

// ============================================
// Callable Function: Manual Rating Refresh
// ============================================

/**
 * Manually refresh DUPR rating for current user
 * Can be called from profile page
 */
export const dupr_refreshMyRating = functions.https.onCall(
  async (_data: unknown, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const userId = context.auth.uid;

    // Get user document
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }

    const userData = userDoc.data();
    const duprId = userData?.duprId;

    if (!duprId) {
      throw new functions.https.HttpsError('failed-precondition', 'No DUPR account linked');
    }

    // Get DUPR API token
    const token = await getDuprToken();
    if (!token) {
      throw new functions.https.HttpsError('unavailable', 'DUPR API unavailable');
    }

    const baseUrl = CONFIG.ENVIRONMENT === 'uat' ? CONFIG.UAT_BASE_URL : CONFIG.PROD_BASE_URL;

    try {
      // Fetch player data from DUPR
      const response = await fetch(`${baseUrl}/player/v1.0/${duprId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new functions.https.HttpsError('unavailable', `Failed to fetch DUPR data: ${response.status}`);
      }

      const data = await response.json();
      const result = data.result || data;

      // Extract ratings
      const doublesRating = result.ratings?.doubles || result.doublesRating;
      const singlesRating = result.ratings?.singles || result.singlesRating;
      const doublesReliability = result.ratings?.doublesReliability;
      const singlesReliability = result.ratings?.singlesReliability;

      // Update user profile
      const updateData: Record<string, unknown> = {
        duprLastSyncAt: Date.now(),
      };

      if (doublesRating !== undefined) {
        updateData.duprDoubles = doublesRating;
        updateData.duprDoublesReliability = doublesReliability;
      }
      if (singlesRating !== undefined) {
        updateData.duprSingles = singlesRating;
        updateData.duprSinglesReliability = singlesReliability;
      }

      await userDoc.ref.update(updateData);

      return {
        success: true,
        doublesRating,
        singlesRating,
        doublesReliability,
        singlesReliability,
        syncedAt: Date.now(),
      };
    } catch (error) {
      logger.error('[DUPR] Error refreshing rating:', error);
      throw new functions.https.HttpsError('internal', 'Failed to refresh rating');
    }
  }
);

// ============================================
// Callable Function: Test Single Match Submission
// ============================================

interface TestSubmitOneMatchRequest {
  matchId: string;
  eventType: 'tournament' | 'league' | 'meetup';
  eventId: string;
}

interface TestSubmitOneMatchResponse {
  ok: boolean;
  stage: 'auth' | 'permission' | 'token' | 'load' | 'convert' | 'submit';
  error?: string;
  matchMetadata?: {
    hasOfficialResult: boolean;
    scoreCount: number;
    hasSideA: boolean;
    hasSideB: boolean;
    gameCount: number;
  };
  payloadMetadata?: {
    identifier: string;
    matchSource: string;
    format: string;
    gameCount: number;
    hasClubId: boolean;
  };
  warnings?: string[];
  duprResponse?: {
    status: number;
    statusText: string;
    body: string;
  };
}

/**
 * Test submitting a single match to DUPR
 *
 * This diagnostic function:
 * - Requires admin or organizer permission
 * - Loads ONE match from Firestore
 * - Builds payload with full validation
 * - Submits to DUPR
 * - Returns DUPR response (no player IDs exposed to client)
 *
 * Use this to debug submission issues before bulk operations.
 */
export const dupr_testSubmitOneMatch = functions.https.onCall(
  async (data: TestSubmitOneMatchRequest, context): Promise<TestSubmitOneMatchResponse> => {
    // STEP 1: Verify authentication
    if (!context.auth) {
      return { ok: false, stage: 'auth', error: 'Must be logged in' };
    }

    const { matchId, eventType, eventId } = data;
    const userId = context.auth.uid;

    if (!matchId || !eventType || !eventId) {
      return { ok: false, stage: 'auth', error: 'Missing required fields: matchId, eventType, eventId' };
    }

    // STEP 2: Verify admin or organizer permission
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const isAppAdmin = userData?.role === 'app_admin';

    if (!isAppAdmin) {
      // Check if user is organizer for this event
      const eventCollection = eventType === 'tournament' ? 'tournaments' :
                              eventType === 'league' ? 'leagues' : 'meetups';
      const eventDoc = await db.collection(eventCollection).doc(eventId).get();

      if (!eventDoc.exists) {
        return { ok: false, stage: 'permission', error: 'Event not found' };
      }

      const eventData = eventDoc.data();
      const isOrganizer = eventData?.organizerId === userId ||
                          eventData?.organizerIds?.includes(userId) ||
                          eventData?.createdBy === userId ||
                          eventData?.createdByUserId === userId;

      if (!isOrganizer) {
        return { ok: false, stage: 'permission', error: 'Must be admin or event organizer' };
      }
    }

    logger.info('[DUPR TEST] Starting single match test:', { matchId, eventType, eventId, userId });

    // STEP 3: Get DUPR token
    const token = await getDuprToken();
    if (!token) {
      return { ok: false, stage: 'token', error: 'Failed to get DUPR API token - check credentials config' };
    }

    // STEP 4: Load match from Firestore
    const matchPath = getMatchPath(eventType, eventId, matchId);
    const matchDoc = await db.doc(matchPath).get();

    if (!matchDoc.exists) {
      return { ok: false, stage: 'load', error: `Match not found at path: ${matchPath}` };
    }

    const match = { id: matchDoc.id, ...matchDoc.data() } as Match;

    // Return match metadata (safe, no player IDs)
    const matchMetadata = {
      hasOfficialResult: !!match.officialResult,
      scoreCount: match.officialResult?.scores?.length || 0,
      hasSideA: !!match.sideA,
      hasSideB: !!match.sideB,
      gameCount: match.officialResult?.scores?.length || 0,
    };

    // STEP 5: Get event name and convert to DUPR format
    const eventName = await getEventName(eventType, eventId);
    const conversionResult = await convertMatchToDuprFormat(match, eventName, eventType, eventId);

    if (!conversionResult) {
      return {
        ok: false,
        stage: 'convert',
        error: 'Failed to build DUPR payload - check match data',
        matchMetadata,
      };
    }

    const { payload: duprPayload, warnings } = conversionResult;

    // Payload metadata (safe, no player IDs)
    const payloadMetadata = {
      identifier: (duprPayload as any).identifier,
      matchSource: (duprPayload as any).matchSource,
      format: (duprPayload as any).format,
      gameCount: Object.keys((duprPayload as any).teamA || {}).filter(k => k.startsWith('game')).length,
      hasClubId: !!(duprPayload as any).clubId,
    };

    // Log payload to Cloud Functions logs (for debugging, not exposed to client)
    logger.info('[DUPR TEST] Payload to submit:', JSON.stringify(duprPayload, null, 2));

    // STEP 6: Submit to DUPR
    const matchUrl = getMatchUrl();

    try {
      const response = await fetch(matchUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(duprPayload),
      });

      const responseText = await response.text();

      logger.info('[DUPR TEST] Response:', {
        status: response.status,
        ok: response.ok,
        body: responseText.substring(0, 1000),
      });

      return {
        ok: response.ok,
        stage: 'submit',
        matchMetadata,
        payloadMetadata,
        warnings: warnings.length > 0 ? warnings : undefined,
        duprResponse: {
          status: response.status,
          statusText: response.statusText,
          body: responseText,
        },
      };
    } catch (error) {
      logger.error('[DUPR TEST] Exception:', error);
      return {
        ok: false,
        stage: 'submit',
        error: error instanceof Error ? error.message : 'Network error',
        matchMetadata,
        payloadMetadata,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    }
  }
);

// ============================================
// Callable Function: Retry Failed DUPR Submissions
// ============================================

interface RetryFailedRequest {
  eventType: 'tournament' | 'league';
  eventId: string;
}

interface RetryFailedResponse {
  success: boolean;
  retriedCount: number;
  successCount: number;
  failureCount: number;
  results: Array<{ matchId: string; success: boolean; error?: string }>;
}

/**
 * dupr_retryFailed
 *
 * Retries all failed DUPR submissions for an event.
 * Called by organizers to retry matches that previously failed.
 */
export const dupr_retryFailed = functions
  .runWith({ timeoutSeconds: 300 })
  .https.onCall(
  async (data: RetryFailedRequest, context): Promise<RetryFailedResponse> => {
    // Verify authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { eventType, eventId } = data;
    const userId = context.auth.uid;

    logger.info('[DUPR] dupr_retryFailed called', { eventType, eventId, userId });

    // Validate input
    if (!eventType || !eventId) {
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
                        eventData?.createdBy === userId ||
                        eventData?.createdByUserId === userId;

    // Also check for app admin
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const isAppAdmin = userData?.role === 'app_admin' || userData?.isAppAdmin === true;

    if (!isOrganizer && !isAppAdmin) {
      throw new functions.https.HttpsError('permission-denied', 'Only organizers can retry DUPR submissions');
    }

    // Get DUPR API token
    const token = await getDuprToken();
    if (!token) {
      throw new functions.https.HttpsError('unavailable', 'DUPR API unavailable');
    }

    const eventName = eventData?.name || eventData?.title || `${eventType}-${eventId}`;

    // Query failed matches (have submissionError or dupr.submitted is false with previous attempt)
    const matchesCollection = db.collection(eventCollection).doc(eventId).collection('matches');
    const failedMatches = await matchesCollection
      .where('status', '==', 'completed')
      .where('scoreState', '==', 'official')
      .get();

    const matchIds: string[] = [];
    for (const doc of failedMatches.docs) {
      const match = doc.data();
      // Include matches that have a submission error OR were queued but not submitted
      if (
        match.officialResult &&
        match.dupr?.eligible !== false &&
        !match.dupr?.submitted &&
        (match.dupr?.submissionError || match.dupr?.pendingSubmission)
      ) {
        matchIds.push(doc.id);
      }
    }

    logger.info(`[DUPR] Found ${matchIds.length} failed matches to retry`);

    // Retry each failed match
    const results: Array<{ matchId: string; success: boolean; error?: string }> = [];
    let successCount = 0;
    let failureCount = 0;

    for (const matchId of matchIds) {
      const matchPath = getMatchPath(eventType, eventId, matchId);
      const matchDoc = await db.doc(matchPath).get();

      if (!matchDoc.exists) {
        results.push({ matchId, success: false, error: 'Match not found' });
        failureCount++;
        continue;
      }

      const match = { id: matchDoc.id, ...matchDoc.data() } as Match;

      // Clear previous error and retry
      logger.info(`[DUPR] Retrying match ${matchId}...`);
      const result = await submitMatchToDupr(match, eventName, eventType, eventId, token);

      results.push({
        matchId,
        success: result.success,
        error: result.error,
      });

      if (result.success) {
        successCount++;
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
        await db.doc(matchPath).update({
          'dupr.submissionError': result.error,
          'dupr.lastRetryAt': Date.now(),
          updatedAt: Date.now(),
        });
      }
    }

    logger.info(`[DUPR] Retry complete: ${successCount} success, ${failureCount} failed`);

    return {
      success: true,
      retriedCount: matchIds.length,
      successCount,
      failureCount,
      results,
    };
  }
);

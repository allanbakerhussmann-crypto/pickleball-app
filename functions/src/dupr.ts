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
import * as crypto from 'crypto';

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

  // NOTE: Credentials (client_key, client_secret) come from functions.config().dupr
  // Never store secrets in source code

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
  // Wrap in try/catch to return error instead of throwing
  try {
    if (sideADuprIds.length === 0 && sideAPlayerIds.length > 0) {
      sideADuprIds = await fetchDuprIdsForPlayers(sideAPlayerIds);
    }
    if (sideBDuprIds.length === 0 && sideBPlayerIds.length > 0) {
      sideBDuprIds = await fetchDuprIdsForPlayers(sideBPlayerIds);
    }
  } catch (fetchError) {
    logger.error(`[DUPR] Failed to fetch DUPR IDs for match ${match.id}:`, {
      error: fetchError instanceof Error ? fetchError.message : 'Unknown',
    });
    return {
      payload: null,
      warnings: [],
      error: 'Failed to fetch player DUPR IDs: ' + (fetchError instanceof Error ? fetchError.message : 'Unknown'),
    };
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
  skippedCount?: number;
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

      // Query all completed matches first (simpler query, no composite index needed)
      // Then filter in memory for scoreState and eligibility
      try {
        const allMatches = await matchesCollection
          .where('status', '==', 'completed')
          .get();

        logger.info('[DUPR] Query returned completed matches', { count: allMatches.docs.length });

        for (const doc of allMatches.docs) {
          const match = doc.data();
          // Filter for official scores and eligibility in memory
          if (
            match.scoreState === 'official' &&
            match.officialResult &&
            match.dupr?.eligible !== false &&
            !match.dupr?.submitted
          ) {
            matchIds.push(doc.id);
          }
        }

        logger.info(`[DUPR] Found ${matchIds.length} eligible matches after filtering`);
      } catch (queryError) {
        logger.error('[DUPR] Query failed:', { error: queryError instanceof Error ? queryError.message : 'Unknown' });
        throw new functions.https.HttpsError('internal', 'Failed to query matches: ' + (queryError instanceof Error ? queryError.message : 'Unknown error'));
      }
    }

    // Collect eligible matches and submit immediately
    const results: { matchId: string; success: boolean; duprMatchId?: string; error?: string }[] = [];
    let successCount = 0;
    let failureCount = 0;
    let skippedCount = 0;

    for (const matchId of matchIds) {
      // CRITICAL: Wrap entire per-match processing in try/catch
      // so one match failure doesn't abort the entire batch
      try {
        const matchPath = getMatchPath(eventType, eventId, matchId);
        const matchDoc = await db.doc(matchPath).get();

        if (!matchDoc.exists) {
          results.push({ matchId, success: false, error: 'Match not found' });
          failureCount++;
          continue;
        }

        const match = { id: matchDoc.id, ...matchDoc.data() } as Match;

        // Check if already submitted (skip gracefully)
        if (match.dupr?.submitted) {
          skippedCount++;
          continue;
        }

        // Check other eligibility
        if (
          !match.officialResult ||
          match.status !== 'completed' ||
          match.scoreState !== 'official' ||
          match.dupr?.eligible === false
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
          // Build update object with only defined values (Firestore doesn't allow undefined)
          try {
            const updateData: Record<string, unknown> = {
              'dupr.submitted': true,
              'dupr.submittedAt': Date.now(),
              'dupr.pendingSubmission': false,
              scoreState: 'submittedToDupr',
              updatedAt: Date.now(),
            };
            // Only include submissionId if it's defined
            if (result.duprMatchId) {
              updateData['dupr.submissionId'] = result.duprMatchId;
            }
            // Use FieldValue.delete() to remove error field instead of null
            updateData['dupr.submissionError'] = admin.firestore.FieldValue.delete();

            await db.doc(matchPath).update(updateData);
          } catch (updateError) {
            logger.error(`[DUPR] Failed to update success state for ${matchId}:`, {
              error: updateError instanceof Error ? updateError.message : 'Unknown',
            });
            // Don't fail the submission just because DB update failed
          }

          logger.info(`[DUPR] Match ${matchId} submitted successfully: ${result.duprMatchId || 'no-id-returned'}`);
        } else {
          failureCount++;

          // Update match with error (ensure error message is never undefined)
          const errorMessage = result.error || 'Unknown submission error';
          try {
            await db.doc(matchPath).update({
              'dupr.submissionError': errorMessage,
              'dupr.lastAttemptAt': Date.now(),
              'dupr.attemptCount': admin.firestore.FieldValue.increment(1),
              updatedAt: Date.now(),
            });
          } catch (updateError) {
            logger.error(`[DUPR] Failed to update error state for ${matchId}:`, {
              error: updateError instanceof Error ? updateError.message : 'Unknown',
            });
          }

          logger.error(`[DUPR] Match ${matchId} submission failed: ${errorMessage}`);
        }

      } catch (matchError) {
        // Capture error and CONTINUE to next match - never abort batch
        logger.error(`[DUPR] Match ${matchId} threw exception:`, {
          error: matchError instanceof Error ? matchError.message : 'Unknown',
          stack: matchError instanceof Error ? matchError.stack?.substring(0, 500) : undefined,
        });

        results.push({
          matchId,
          success: false,
          error: matchError instanceof Error ? matchError.message : 'Unknown error',
        });
        failureCount++;

        // Try to update match with error state (nested try/catch so this doesn't throw either)
        try {
          await db.doc(getMatchPath(eventType, eventId, matchId)).update({
            'dupr.submissionError': matchError instanceof Error ? matchError.message : 'Unknown error',
            'dupr.lastAttemptAt': Date.now(),
            'dupr.attemptCount': admin.firestore.FieldValue.increment(1),
            updatedAt: Date.now(),
          });
        } catch (updateError) {
          logger.error(`[DUPR] Failed to update error state for ${matchId} after exception`);
        }

        // Continue to next match - DO NOT throw
        continue;
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

    logger.info(`[DUPR] Batch ${batchId} complete: ${successCount} success, ${failureCount} failed, ${skippedCount} skipped`);

    return {
      success: successCount > 0 || skippedCount > 0,
      batchId,
      message: failureCount === 0
        ? `Successfully submitted ${successCount} matches to DUPR${skippedCount > 0 ? `, ${skippedCount} already submitted` : ''}`
        : successCount > 0
        ? `Submitted ${successCount}, failed ${failureCount}${skippedCount > 0 ? `, skipped ${skippedCount}` : ''}`
        : `Failed to submit ${failureCount} matches to DUPR`,
      eligibleCount: successCount,
      ineligibleCount: failureCount,
      skippedCount,
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
        // Fetch player data from DUPR via POST /v1.0/player (verified via Swagger)
        const response = await fetch(`${baseUrl}/v1.0/player`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            duprIds: [duprId],
            sortBy: '',
          }),
        });

        if (!response.ok) {
          logger.warn(`[DUPR] Failed to fetch ratings for user ${userDoc.id} (DUPR: ${duprId}): ${response.status}`);
          failureCount++;
          continue;
        }

        const data = await response.json();

        // Response structure: { status: "SUCCESS", results: [{ ratings: { singles, doubles } }] }
        if (data.status !== 'SUCCESS' || !data.results?.length) {
          logger.warn(`[DUPR] No results for user ${userDoc.id} (DUPR: ${duprId})`);
          failureCount++;
          continue;
        }

        const player = data.results[0];
        const singlesStr = player.ratings?.singles;
        const doublesStr = player.ratings?.doubles;

        // Convert string ratings to numbers (handle "NR" as null)
        const singlesRating = singlesStr && singlesStr !== 'NR' ? parseFloat(singlesStr) : null;
        const doublesRating = doublesStr && doublesStr !== 'NR' ? parseFloat(doublesStr) : null;

        // Only update if we got valid data
        if (doublesRating !== null || singlesRating !== null) {
          const updateData: Record<string, unknown> = {
            duprLastSyncAt: Date.now(),
          };

          if (doublesRating !== null) {
            updateData.duprDoublesRating = doublesRating;
          }
          if (singlesRating !== null) {
            updateData.duprSinglesRating = singlesRating;
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
// Callable Function: Manual Rating Refresh (v2 - client credentials)
// ============================================

/**
 * Manually refresh DUPR rating for current user
 * V2: Uses server-side client credentials (identical to dupr_syncRatings)
 * NO SSO tokens, NO session refresh - pure client-credential flow
 */
export const dupr_refreshMyRating = functions.https.onCall(
  async (_data: unknown, context) => {
    // Auth check
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const uid = context.auth.uid;

    // Signature log to prove v2 is executing
    logger.info('[DUPR] refreshMyRating v2 (client-credentials) starting', { uid });

    // Load user document and read duprId
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }

    const userData = userDoc.data();
    const duprId = userData?.duprId;

    if (!duprId) {
      throw new functions.https.HttpsError('failed-precondition', 'No DUPR account linked');
    }

    // Rate limit: 60 seconds between refreshes
    const lastSync = userData?.duprLastSyncAt;
    if (lastSync && Date.now() - lastSync < 60000) {
      const secondsRemaining = Math.ceil((60000 - (Date.now() - lastSync)) / 1000);
      return {
        success: false,
        rateLimited: true,
        message: `Please wait ${secondsRemaining} seconds before refreshing again`,
      };
    }

    // Get bearer token via client credentials (same as dupr_syncRatings)
    const token = await getDuprToken();
    if (!token) {
      logger.error('[DUPR] refreshMyRating v2: failed to get API token');
      throw new functions.https.HttpsError('unavailable', 'DUPR API unavailable');
    }

    const baseUrl = CONFIG.ENVIRONMENT === 'uat' ? CONFIG.UAT_BASE_URL : CONFIG.PROD_BASE_URL;

    // Fetch player ratings via POST /v1.0/player (verified via Swagger)
    const response = await fetch(`${baseUrl}/v1.0/player`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        duprIds: [duprId],
        sortBy: '',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      logger.error('[DUPR] refreshMyRating v2: player lookup failed', {
        duprId,
        status: response.status,
        errorText,
      });
      throw new functions.https.HttpsError(
        'unavailable',
        'Unable to fetch DUPR rating. Please try again later.'
      );
    }

    // Parse response - structure: { status: "SUCCESS", results: [{ ratings: { singles, doubles } }] }
    const data = await response.json();

    if (data.status !== 'SUCCESS' || !data.results?.length) {
      logger.error('[DUPR] refreshMyRating v2: unexpected response', { data });
      throw new functions.https.HttpsError('unavailable', 'No player data returned from DUPR');
    }

    const player = data.results[0];
    const singlesStr = player.ratings?.singles;
    const doublesStr = player.ratings?.doubles;

    // Convert string ratings to numbers (handle "NR" as null)
    const singlesRating = singlesStr && singlesStr !== 'NR' ? parseFloat(singlesStr) : null;
    const doublesRating = doublesStr && doublesStr !== 'NR' ? parseFloat(doublesStr) : null;

    // Note: reliability fields not in this endpoint response
    const singlesReliability = null;
    const doublesReliability = null;

    logger.info('[DUPR] refreshMyRating v2: ratings fetched', {
      duprId,
      doublesRating,
      singlesRating,
    });

    // Update user doc (same field names as UI expects)
    const updateData: Record<string, unknown> = {
      duprLastSyncAt: Date.now(),
      updatedAt: Date.now(),
    };

    if (doublesRating !== undefined && doublesRating !== null) {
      updateData.duprDoublesRating = doublesRating;
    }
    if (doublesReliability !== undefined && doublesReliability !== null) {
      updateData.duprDoublesReliability = doublesReliability;
    }
    if (singlesRating !== undefined && singlesRating !== null) {
      updateData.duprSinglesRating = singlesRating;
    }
    if (singlesReliability !== undefined && singlesReliability !== null) {
      updateData.duprSinglesReliability = singlesReliability;
    }

    await userDoc.ref.update(updateData);

    logger.info('[DUPR] refreshMyRating v2: complete', { uid, duprId });

    return {
      success: true,
      doublesRating: doublesRating ?? null,
      singlesRating: singlesRating ?? null,
      doublesReliability: doublesReliability ?? null,
      singlesReliability: singlesReliability ?? null,
      syncedAt: Date.now(),
    };
  }
);

// ============================================
// Callable Function: Update DUPR+ Subscriptions
// ============================================

/**
 * Update user's DUPR+ subscription status from Premium Login iframe
 *
 * Called after user completes DUPR Premium Login flow.
 * Persists subscription data and derives duprPlusActive status.
 *
 * Validation rules (strict):
 * - status === 'active' OR
 * - expiresAt exists AND is in future
 */
interface UpdateSubscriptionsRequest {
  subscriptions: Array<{
    productId?: string;
    promotionId?: string;
    status?: string;
    expiresAt?: number;
  }>;
}

interface UpdateSubscriptionsResponse {
  success: boolean;
  duprPlusActive: boolean;
}

export const dupr_updateMySubscriptions = functions.https.onCall(
  async (data: UpdateSubscriptionsRequest, context): Promise<UpdateSubscriptionsResponse> => {
    // Auth check
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const uid = context.auth.uid;
    const { subscriptions } = data;

    logger.info('[DUPR+] updateMySubscriptions called', { uid, subscriptionCount: subscriptions?.length || 0 });

    // Strict validation: require status === 'active' OR (expiresAt exists AND is in future)
    const duprPlusActive = subscriptions?.some((s) => {
      // Safe logging for debugging (no secrets)
      logger.info('[DUPR+] Evaluating subscription:', {
        hasProductId: !!s.productId,
        hasStatus: !!s.status,
        status: s.status,
        hasExpiresAt: !!s.expiresAt,
      });

      // Check status first
      if (s.status === 'active') return true;

      // Check expiresAt only if it exists and is in future
      if (s.expiresAt && s.expiresAt > Date.now()) return true;

      return false;
    }) ?? false;

    logger.info('[DUPR+] Subscription validation result', { uid, duprPlusActive });

    // Update user profile
    try {
      await db.collection('users').doc(uid).update({
        duprSubscriptions: subscriptions || [],
        duprPlusActive,
        duprPlusVerifiedAt: Date.now(),
        updatedAt: Date.now(),
      });

      logger.info('[DUPR+] User profile updated', { uid, duprPlusActive });
    } catch (updateError) {
      logger.error('[DUPR+] Failed to update user profile', {
        uid,
        error: updateError instanceof Error ? updateError.message : 'Unknown',
      });
      throw new functions.https.HttpsError('internal', 'Failed to update subscription status');
    }

    return { success: true, duprPlusActive };
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

// ============================================
// HTTP Function: DUPR Webhook Handler
// ============================================

/**
 * Generate deterministic dedupe key for webhook event
 * Uses SHA-256 hash of normalized payload fields
 */
function generateWebhookDedupeKey(payload: Record<string, unknown>, rawBody?: string): string {
  // Extract stable fields for hashing
  const eventType = (payload?.event ?? payload?.topic ?? 'UNKNOWN') as string;
  const clientId = (payload?.clientId ?? '') as string;
  const message = payload?.message as Record<string, unknown> | undefined;
  const duprId = (message?.duprId ?? '') as string;
  const rating = message?.rating as Record<string, unknown> | undefined;
  const matchId = (rating?.matchId ?? '') as string;
  const singles = (rating?.singles ?? '') as string;
  const doubles = (rating?.doubles ?? '') as string;

  // Build normalized string for hashing
  let hashInput = `${eventType}|${clientId}|${duprId}|${matchId}|${singles}|${doubles}`;

  // Fallback: if no meaningful fields, hash the entire raw body
  if (!duprId && !matchId && rawBody) {
    hashInput = rawBody;
  }

  return crypto.createHash('sha256').update(hashInput).digest('hex').substring(0, 32);
}

/**
 * Process DUPR rating change event
 * Updates both duprPlayers/{duprId} snapshot and users/{uid} profile
 */
async function processWebhookRatingChange(payload: Record<string, unknown>): Promise<void> {
  const message = payload?.message as Record<string, unknown> | undefined;
  if (!message?.duprId) {
    logger.info('[DUPR Webhook] No duprId in rating change event');
    return;
  }

  const duprId = message.duprId as string;
  const name = message.name as string | undefined;
  const rating = message.rating as Record<string, unknown> | undefined;

  // Parse ratings - handle "NR" (Not Rated) as null
  const doublesRating = rating?.doubles && rating.doubles !== 'NR'
    ? parseFloat(rating.doubles as string)
    : null;
  const singlesRating = rating?.singles && rating.singles !== 'NR'
    ? parseFloat(rating.singles as string)
    : null;
  const doublesReliability = rating?.doublesReliability
    ? parseFloat(rating.doublesReliability as string)
    : null;
  const singlesReliability = rating?.singlesReliability
    ? parseFloat(rating.singlesReliability as string)
    : null;
  const matchId = rating?.matchId as number | undefined;

  // 1. Upsert duprPlayers/{duprId} snapshot collection
  const playerSnapshot: Record<string, unknown> = {
    duprId,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    source: 'webhook',
  };
  if (name) playerSnapshot.name = name;
  if (doublesRating !== null) playerSnapshot.doublesRating = doublesRating;
  if (singlesRating !== null) playerSnapshot.singlesRating = singlesRating;
  if (doublesReliability !== null) playerSnapshot.doublesReliability = doublesReliability;
  if (singlesReliability !== null) playerSnapshot.singlesReliability = singlesReliability;
  if (matchId !== undefined) playerSnapshot.lastMatchId = matchId;

  await db.collection('duprPlayers').doc(duprId).set(playerSnapshot, { merge: true });
  logger.info('[DUPR Webhook] Updated duprPlayers snapshot', { duprId });

  // 2. Find and update user with this DUPR ID
  const usersSnapshot = await db.collection('users')
    .where('duprId', '==', duprId)
    .limit(1)
    .get();

  if (usersSnapshot.empty) {
    logger.info('[DUPR Webhook] No user found with duprId:', duprId);
    return;
  }

  const userDoc = usersSnapshot.docs[0];

  // IMPORTANT: duprLastSyncAt must be a number (milliseconds) for compatibility
  // with rate limiting in dupr_refreshMyRating which does Date.now() - lastSync
  const nowMs = Date.now();
  const userUpdates: Record<string, unknown> = {
    duprLastSyncAt: nowMs,
    duprLastSyncSource: 'webhook',
    updatedAt: nowMs,
  };

  if (doublesRating !== null) userUpdates.duprDoublesRating = doublesRating;
  if (singlesRating !== null) userUpdates.duprSinglesRating = singlesRating;
  if (doublesReliability !== null) userUpdates.duprDoublesReliability = doublesReliability;
  if (singlesReliability !== null) userUpdates.duprSinglesReliability = singlesReliability;

  await userDoc.ref.update(userUpdates);
  logger.info('[DUPR Webhook] Updated user ratings', {
    userId: userDoc.id,
    duprId,
    doublesRating,
    singlesRating,
  });
}

/**
 * DUPR Webhook Handler
 *
 * Receives webhook events from DUPR for rating changes.
 * - GET: DUPR validation ping (returns 200)
 * - POST: Webhook event (stores + processes, always returns 200)
 *
 * Key behaviors:
 * - Deterministic dedupe via SHA-256 hash of payload
 * - Always returns 200 quickly (never blocks on processing)
 * - Stores raw events for auditing in duprWebhookEvents
 * - Updates duprPlayers/{duprId} snapshot + users/{uid} profile
 */
export const duprWebhook = functions.https.onRequest(async (req, res) => {
  // Handle OPTIONS (harmless, not needed for server-to-server)
  if (req.method === 'OPTIONS') {
    res.status(200).send('');
    return;
  }

  // GET = DUPR validation ping (happens when registering webhook)
  if (req.method === 'GET') {
    logger.info('[DUPR Webhook] Validation ping received');
    res.status(200).send('ok');
    return;
  }

  // POST = webhook event
  if (req.method === 'POST') {
    // Get raw body for stable hashing (req.rawBody is the actual bytes received)
    // Do NOT use JSON.stringify(payload) as fallback - key order is not stable
    const rawBody = req.rawBody
      ? req.rawBody.toString('utf8')
      : undefined;

    // Parse payload (may be already parsed or raw string)
    let payload: Record<string, unknown>;

    try {
      if (typeof req.body === 'string') {
        payload = JSON.parse(req.body);
      } else {
        payload = req.body || {};
      }
    } catch {
      logger.error('[DUPR Webhook] Failed to parse request body');
      res.status(200).send('ok'); // Still return 200 to prevent retries
      return;
    }

    // Generate deterministic dedupe key using raw body for stable hashing
    const dedupeKey = generateWebhookDedupeKey(payload, rawBody);

    // Extract event type (DUPR uses 'event' field, but support 'topic' as fallback)
    const request = payload?.request as Record<string, unknown> | undefined;
    const eventType = (payload?.event ?? payload?.topic ?? request?.event ?? 'UNKNOWN') as string;

    logger.info('[DUPR Webhook] Event received', {
      dedupeKey,
      eventType,
      clientId: payload?.clientId,
    });

    // Best-effort: Store raw event for auditing + dedupe
    try {
      const eventRef = db.collection('duprWebhookEvents').doc(dedupeKey);
      const existingEvent = await eventRef.get();

      if (existingEvent.exists) {
        logger.info('[DUPR Webhook] Duplicate event, skipping processing', { dedupeKey });
        res.status(200).send('ok');
        return;
      }

      // Store the event
      await eventRef.set({
        ...payload,
        dedupeKey,
        eventType,
        receivedAt: admin.firestore.FieldValue.serverTimestamp(),
        processed: false,
      });
    } catch (storeError) {
      logger.error('[DUPR Webhook] Failed to store event (continuing anyway)', {
        error: storeError instanceof Error ? storeError.message : 'Unknown',
      });
      // Continue processing even if storage fails
    }

    // Best-effort: Process based on event type
    try {
      if (eventType === 'RATING') {
        await processWebhookRatingChange(payload);

        // Mark as processed
        try {
          await db.collection('duprWebhookEvents').doc(dedupeKey).update({
            processed: true,
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } catch {
          // Ignore update failure
        }
      } else if (eventType === 'REGISTRATION') {
        // Validation event from DUPR when webhook is first registered
        logger.info('[DUPR Webhook] Registration validation received');
        try {
          await db.collection('duprWebhookEvents').doc(dedupeKey).update({
            processed: true,
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } catch {
          // Ignore update failure
        }
      } else {
        logger.info('[DUPR Webhook] Unknown event type, stored for review', { eventType });
      }
    } catch (processError) {
      logger.error('[DUPR Webhook] Error processing event (still returning 200)', {
        error: processError instanceof Error ? processError.message : 'Unknown',
        dedupeKey,
        eventType,
      });
      // Continue to return 200 - never let processing errors cause retries
    }

    res.status(200).send('ok');
    return;
  }

  // Unknown method - still return 200 to be safe
  res.status(200).send('ok');
});

// ============================================
// Callable Function: Subscribe to DUPR Rating Changes
// ============================================

/**
 * Subscribe user(s) to DUPR rating change notifications
 *
 * After registering the webhook with DUPR, call this to subscribe
 * specific users (by DUPR ID) to receive rating notifications.
 *
 * Endpoint: POST /v1.0/subscribe/rating-changes
 */
export const dupr_subscribeToRatings = functions.https.onCall(
  async (data: { duprIds: string[] }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const { duprIds } = data;
    if (!duprIds || !Array.isArray(duprIds) || duprIds.length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'duprIds array required');
    }

    const token = await getDuprToken();
    if (!token) {
      throw new functions.https.HttpsError('unavailable', 'Failed to get DUPR token');
    }

    const baseUrl = CONFIG.ENVIRONMENT === 'production'
      ? CONFIG.PROD_BASE_URL
      : CONFIG.UAT_BASE_URL;

    try {
      const response = await fetch(`${baseUrl}/v1.0/subscribe/rating-changes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ duprIds }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        logger.error('[DUPR Subscribe] Failed', {
          status: response.status,
          response: responseData,
        });
        throw new functions.https.HttpsError(
          'internal',
          responseData.message || 'Subscription failed'
        );
      }

      logger.info('[DUPR Subscribe] Success', {
        duprIds,
        response: responseData,
      });

      return {
        success: true,
        subscribedCount: duprIds.length,
        response: responseData,
      };
    } catch (error) {
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      logger.error('[DUPR Subscribe] Exception', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      throw new functions.https.HttpsError('internal', 'Subscription request failed');
    }
  }
);

// ============================================
// Callable Function: Get DUPR Subscriptions
// ============================================

/**
 * Helper function to subscribe a single DUPR ID to rating notifications
 * DUPR API expects body to be an array of DUPR IDs: ["GGEGNM"]
 */
async function subscribeSingleDuprId(
  duprId: string,
  token: string,
  baseUrl: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${baseUrl}/v1.0/subscribe/rating-changes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      // Body is just the array: ["GGEGNM"]
      body: JSON.stringify([duprId]),
    });

    const responseData = await response.json();

    if (response.ok && responseData?.status !== 'FAILURE') {
      return { success: true };
    } else {
      const errorMsg = responseData?.message || responseData?.error || JSON.stringify(responseData);
      return { success: false, error: errorMsg };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Subscribe ALL users with linked DUPR accounts to rating notifications
 *
 * This batch function:
 * 1. Queries all users with a duprId
 * 2. Subscribes them ONE BY ONE (DUPR doesn't support batch)
 * 3. Returns count of subscribed users
 *
 * Run this once after registering your webhook, then new users
 * will be auto-subscribed when they link their DUPR account.
 */
export const dupr_subscribeAllUsers = functions
  .runWith({ timeoutSeconds: 540 }) // 9 min timeout for one-at-a-time calls
  .https.onCall(async (_data: unknown, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    // Check if user is admin (supports multiple field patterns)
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const userData = userDoc.data();
    const isAdmin = userData?.role === 'app_admin' ||
                    userData?.roles?.includes('app_admin') ||
                    userData?.isAppAdmin === true ||
                    userData?.isRootAdmin === true;
    if (!isAdmin) {
      throw new functions.https.HttpsError('permission-denied', 'Only admins can bulk subscribe');
    }

    logger.info('[DUPR] Starting bulk subscription of all users with DUPR IDs');

    // Get all users with DUPR IDs
    const usersWithDupr = await db.collection('users')
      .where('duprId', '!=', null)
      .get();

    if (usersWithDupr.empty) {
      return { success: true, message: 'No users with DUPR IDs found', subscribedCount: 0 };
    }

    // Collect all DUPR IDs
    const duprIds: string[] = [];
    for (const doc of usersWithDupr.docs) {
      const duprId = doc.data().duprId;
      if (duprId && typeof duprId === 'string') {
        duprIds.push(duprId);
      }
    }

    logger.info(`[DUPR] Found ${duprIds.length} users with DUPR IDs`, { duprIds });

    if (duprIds.length === 0) {
      return { success: true, message: 'No valid DUPR IDs found', subscribedCount: 0 };
    }

    // Get DUPR token
    const token = await getDuprToken();
    if (!token) {
      throw new functions.https.HttpsError('unavailable', 'Failed to get DUPR token');
    }

    const baseUrl = CONFIG.ENVIRONMENT === 'production'
      ? CONFIG.PROD_BASE_URL
      : CONFIG.UAT_BASE_URL;

    // Subscribe ONE BY ONE (DUPR API doesn't accept arrays)
    let subscribedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < duprIds.length; i++) {
      const duprId = duprIds[i];

      const result = await subscribeSingleDuprId(duprId, token, baseUrl);

      if (result.success) {
        subscribedCount++;
        logger.info(`[DUPR] Subscribed ${i + 1}/${duprIds.length}: ${duprId}`);
      } else {
        logger.error(`[DUPR] Failed to subscribe ${duprId}:`, { error: result.error });
        errors.push(`${duprId}: ${result.error}`);
      }

      // Small delay between requests to avoid rate limiting
      if (i < duprIds.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    logger.info(`[DUPR] Bulk subscription complete: ${subscribedCount}/${duprIds.length} subscribed`);

    return {
      success: errors.length === 0,
      message: `Subscribed ${subscribedCount} of ${duprIds.length} users`,
      subscribedCount,
      totalUsers: duprIds.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  });

/**
 * Get current DUPR rating subscriptions
 *
 * Returns list of users currently subscribed to rating notifications.
 * Endpoint: GET /v1.0/subscribe/rating-changes
 */
export const dupr_getSubscriptions = functions.https.onCall(
  async (_data: unknown, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }

    const token = await getDuprToken();
    if (!token) {
      throw new functions.https.HttpsError('unavailable', 'Failed to get DUPR token');
    }

    const baseUrl = CONFIG.ENVIRONMENT === 'production'
      ? CONFIG.PROD_BASE_URL
      : CONFIG.UAT_BASE_URL;

    try {
      const response = await fetch(`${baseUrl}/v1.0/subscribe/rating-changes`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new functions.https.HttpsError('internal', 'Failed to fetch subscriptions');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      logger.error('[DUPR Subscriptions] Exception', {
        error: error instanceof Error ? error.message : 'Unknown',
      });
      throw new functions.https.HttpsError('internal', 'Failed to fetch subscriptions');
    }
  }
);

// ============================================
// Firestore Trigger: Auto-Subscribe on DUPR Link
// ============================================

/**
 * Auto-subscribe user to DUPR rating notifications when they link their account
 *
 * Triggers when a user document is updated and:
 * - duprId is added (didn't exist before, exists now)
 * - duprId is changed (different value)
 *
 * This ensures new users get webhook notifications automatically.
 */
export const dupr_onUserDuprLinked = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    const oldDuprId = before?.duprId;
    const newDuprId = after?.duprId;

    // Only trigger if duprId was added or changed
    if (!newDuprId || newDuprId === oldDuprId) {
      return;
    }

    logger.info('[DUPR] User linked DUPR account, auto-subscribing', {
      userId: context.params.userId,
      duprId: newDuprId,
    });

    // Get DUPR token
    const token = await getDuprToken();
    if (!token) {
      logger.error('[DUPR] Auto-subscribe failed: could not get token');
      return;
    }

    const baseUrl = CONFIG.ENVIRONMENT === 'production'
      ? CONFIG.PROD_BASE_URL
      : CONFIG.UAT_BASE_URL;

    // Subscribe this user to rating notifications
    const result = await subscribeSingleDuprId(newDuprId, token, baseUrl);

    if (result.success) {
      logger.info('[DUPR] Auto-subscribed user to rating notifications', {
        userId: context.params.userId,
        duprId: newDuprId,
      });

      // Mark user as subscribed
      await change.after.ref.update({
        duprSubscribed: true,
        duprSubscribedAt: Date.now(),
      });
    } else {
      logger.error('[DUPR] Auto-subscribe failed', {
        userId: context.params.userId,
        duprId: newDuprId,
        error: result.error,
      });
    }
  });

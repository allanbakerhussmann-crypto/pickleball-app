"use strict";
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
 * V07.54: Migrated from deprecated functions.config() to Firebase Parameters + Secret Manager
 * - DUPR_ENV: Environment param ('uat' | 'production'), defaults to 'production'
 * - DUPR_CLIENT_KEY: Client key param for API authentication
 * - DUPR_CLIENT_SECRET: Secret Manager secret for client secret
 * - DUPR_CLUB_ID: Optional club ID param for CLUB source submissions
 *
 * FILE LOCATION: functions/src/dupr.ts
 * VERSION: V07.54
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
exports.dupr_onUserDuprLinked = exports.dupr_getSubscriptions = exports.dupr_subscribeAllUsers = exports.dupr_subscribeToRatings = exports.duprWebhook = exports.dupr_retryFailed = exports.dupr_testSubmitOneMatch = exports.dupr_testConnection = exports.dupr_updateMySubscriptions = exports.dupr_refreshMyRating = exports.dupr_syncRatings = exports.dupr_getBatchStatus = exports.dupr_processCorrections = exports.dupr_processQueue = exports.dupr_submitMatches = void 0;
const functions = __importStar(require("firebase-functions"));
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
const crypto = __importStar(require("crypto"));
const logger = functions.logger;
const db = admin.firestore();
// ============================================
// Firebase Parameters (replaces deprecated functions.config())
// ============================================
// Environment: 'uat' or 'production' - defaults to production
const DUPR_ENV = (0, params_1.defineString)('DUPR_ENV', {
    default: 'production',
    description: 'DUPR API environment (uat or production)',
});
// Client key for API authentication
const DUPR_CLIENT_KEY = (0, params_1.defineString)('DUPR_CLIENT_KEY', {
    description: 'DUPR API client key',
});
// Client secret (stored in Secret Manager)
const DUPR_CLIENT_SECRET = (0, params_1.defineSecret)('DUPR_CLIENT_SECRET');
// Optional: Club ID for CLUB source submissions
const DUPR_CLUB_ID = (0, params_1.defineString)('DUPR_CLUB_ID', {
    default: '',
    description: 'DUPR Club ID for CLUB source submissions (optional)',
});
// ============================================
// Configuration (static URLs only)
// ============================================
const CONFIG = {
    // UAT URLs (testing)
    UAT_BASE_URL: 'https://uat.mydupr.com/api',
    UAT_TOKEN_URL: 'https://uat.mydupr.com/api/auth/v1.0/token',
    UAT_MATCH_URL: 'https://uat.mydupr.com/api/match/v1.0/create',
    // Production URLs
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
// Get URL based on environment param
const getEnvironment = () => DUPR_ENV.value();
const getTokenUrl = () => getEnvironment() === 'uat' ? CONFIG.UAT_TOKEN_URL : CONFIG.PROD_TOKEN_URL;
const getMatchUrl = () => getEnvironment() === 'uat' ? CONFIG.UAT_MATCH_URL : CONFIG.PROD_MATCH_URL;
const getBaseUrl = () => getEnvironment() === 'uat' ? CONFIG.UAT_BASE_URL : CONFIG.PROD_BASE_URL;
// ============================================
// Helper Functions
// ============================================
/**
 * Get DUPR API token using client credentials
 * Per DUPR RaaS docs: https://dupr.gitbook.io/dupr-raas/quick-start-and-token-generation
 *
 * V07.54: Uses Firebase Parameters instead of deprecated functions.config()
 */
async function getDuprToken() {
    var _a;
    // Get credentials from Firebase Parameters and Secret Manager
    // IMPORTANT: .trim() to remove any trailing whitespace from Secret Manager
    const clientKey = DUPR_CLIENT_KEY.value().trim();
    const clientSecret = DUPR_CLIENT_SECRET.value().trim();
    if (!clientKey || !clientSecret) {
        logger.error('[DUPR] Missing API credentials', {
            hasClientKey: !!clientKey,
            hasClientSecret: !!clientSecret,
            environment: getEnvironment(),
        });
        return null;
    }
    try {
        // Base64 encode clientKey:clientSecret as per DUPR docs
        const credentials = Buffer.from(`${clientKey}:${clientSecret}`).toString('base64');
        const tokenUrl = getTokenUrl();
        // Debug: Log credential format (masked)
        const keyPrefix = clientKey.substring(0, 8);
        const secretPrefix = clientSecret.substring(0, 8);
        logger.info('[DUPR] Requesting token:', {
            url: tokenUrl,
            environment: getEnvironment(),
            keyFormat: `${keyPrefix}...(len=${clientKey.length})`,
            secretFormat: `${secretPrefix}...(len=${clientSecret.length})`,
            credentialsBase64Len: credentials.length,
        });
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
        const token = data.token || data.accessToken || ((_a = data.result) === null || _a === void 0 ? void 0 : _a.token);
        if (!token) {
            logger.error('[DUPR] No token in response:', data);
            return null;
        }
        logger.info('[DUPR] Token obtained successfully');
        return token;
    }
    catch (error) {
        logger.error('[DUPR] Token request error:', error);
        return null;
    }
}
/**
 * Fetch DUPR IDs for player IDs from user profiles
 */
async function fetchDuprIdsForPlayers(playerIds) {
    const duprIds = [];
    for (const playerId of playerIds) {
        if (!playerId)
            continue;
        try {
            const userDoc = await db.collection('users').doc(playerId).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                if (userData === null || userData === void 0 ? void 0 : userData.duprId) {
                    duprIds.push(userData.duprId);
                }
            }
        }
        catch (error) {
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
async function convertMatchToDuprFormat(match, eventName, eventType, eventId) {
    const warnings = [];
    if (!match.officialResult || !match.sideA || !match.sideB) {
        logger.warn(`[DUPR] Match ${match.id} missing officialResult or sides`);
        return { payload: null, warnings: [], error: 'Missing official result or team data' };
    }
    const scores = match.officialResult.scores;
    // VALIDATION 1: Check game count (1-5 games allowed)
    if (!scores || scores.length < 1 || scores.length > 5) {
        logger.error(`[DUPR] Match ${match.id} invalid game count: ${(scores === null || scores === void 0 ? void 0 : scores.length) || 0}`);
        return { payload: null, warnings: [], error: `Invalid game count: ${(scores === null || scores === void 0 ? void 0 : scores.length) || 0} (must be 1-5)` };
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
    // V07.55: Use ACTUAL player count as primary indicator, not playType setting
    // This handles cases where playType is "doubles" but teams have only 1 player each
    const isDoubles = sideAPlayerIds.length > 1 || sideBPlayerIds.length > 1;
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
    }
    catch (fetchError) {
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
    const teamA = {
        player1: sideADuprIds[0],
    };
    if (isDoubles && sideADuprIds[1]) {
        teamA.player2 = sideADuprIds[1];
    }
    // Build teamB object
    const teamB = {
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
    // Get club ID from Firebase Parameter
    const clubId = DUPR_CLUB_ID.value();
    // HARD RULE: matchSource determines clubId handling
    const matchSource = clubId ? 'CLUB' : 'PARTNER';
    // Build submission payload
    const submission = {
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
async function submitMatchToDupr(match, eventName, eventType, eventId, token) {
    var _a, _b;
    const result = await convertMatchToDuprFormat(match, eventName, eventType, eventId);
    if (!result || !result.payload) {
        // Use specific error from validation if available, otherwise generic
        const errorMsg = (result === null || result === void 0 ? void 0 : result.error) || 'Invalid match data - missing scores or validation failed';
        return { success: false, error: errorMsg, warnings: result === null || result === void 0 ? void 0 : result.warnings };
    }
    const { payload: duprMatch, warnings } = result;
    try {
        const matchUrl = getMatchUrl();
        // Safe logging - no full payload with player IDs
        logger.info('[DUPR] Submitting match:', {
            url: matchUrl,
            identifier: duprMatch.identifier,
            matchSource: duprMatch.matchSource,
            format: duprMatch.format,
            gameCount: Object.keys(duprMatch.teamA || {}).filter(k => k.startsWith('game')).length,
            hasClubId: !!duprMatch.clubId,
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
                errorMessage = errorJson.message || errorJson.error || ((_b = (_a = errorJson.errors) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) || errorText;
            }
            catch (_c) {
                errorMessage = errorText || `API error: ${response.status}`;
            }
            // SPECIAL CASE: If DUPR says "already exists", treat as success
            // This happens when match was submitted before but local DB wasn't updated
            if (errorMessage.includes('already exists') || errorMessage.includes('Object identifiers must be universally unique')) {
                logger.info(`[DUPR] Match already exists in DUPR, marking as submitted:`, {
                    identifier: duprMatch.identifier,
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
    }
    catch (error) {
        logger.error(`[DUPR] Submit exception:`, { error: error instanceof Error ? error.message : 'Unknown' });
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error', warnings };
    }
}
/**
 * Get match document path based on event type
 */
function getMatchPath(eventType, eventId, matchId) {
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
async function getEventName(eventType, eventId) {
    try {
        const collection = eventType === 'tournament' ? 'tournaments' :
            eventType === 'league' ? 'leagues' : 'meetups';
        const doc = await db.collection(collection).doc(eventId).get();
        const data = doc.data();
        return (data === null || data === void 0 ? void 0 : data.name) || (data === null || data === void 0 ? void 0 : data.title) || `${eventType}-${eventId}`;
    }
    catch (_a) {
        return `${eventType}-${eventId}`;
    }
}
/**
 * Submit matches to DUPR immediately
 *
 * Called by organizers to submit matches to DUPR.
 * Submits immediately and returns results.
 *
 * V07.54: Added secrets for Secret Manager access
 */
exports.dupr_submitMatches = functions
    .runWith({
    timeoutSeconds: 300, // 5 minute timeout for bulk submissions
    secrets: [DUPR_CLIENT_SECRET],
})
    .https.onCall(async (data, context) => {
    var _a, _b, _c, _d, _e, _f;
    // Verify authentication
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const { eventType, eventId, matchIds: providedMatchIds } = data;
    const userId = context.auth.uid;
    logger.info('[DUPR] dupr_submitMatches called', { eventType, eventId, matchIdsCount: (providedMatchIds === null || providedMatchIds === void 0 ? void 0 : providedMatchIds.length) || 0, userId });
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
        organizerId: eventData === null || eventData === void 0 ? void 0 : eventData.organizerId,
        organizerIds: eventData === null || eventData === void 0 ? void 0 : eventData.organizerIds,
        createdBy: eventData === null || eventData === void 0 ? void 0 : eventData.createdBy,
        createdByUserId: eventData === null || eventData === void 0 ? void 0 : eventData.createdByUserId,
        userId
    });
    // Check various organizer field names (tournaments use organizerId, leagues use createdByUserId)
    const isOrganizer = (eventData === null || eventData === void 0 ? void 0 : eventData.organizerId) === userId ||
        ((_a = eventData === null || eventData === void 0 ? void 0 : eventData.organizerIds) === null || _a === void 0 ? void 0 : _a.includes(userId)) ||
        (eventData === null || eventData === void 0 ? void 0 : eventData.createdBy) === userId ||
        (eventData === null || eventData === void 0 ? void 0 : eventData.createdByUserId) === userId;
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
    const eventName = (eventData === null || eventData === void 0 ? void 0 : eventData.name) || (eventData === null || eventData === void 0 ? void 0 : eventData.title) || `${eventType}-${eventId}`;
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
                if (match.scoreState === 'official' &&
                    match.officialResult &&
                    ((_b = match.dupr) === null || _b === void 0 ? void 0 : _b.eligible) !== false &&
                    !((_c = match.dupr) === null || _c === void 0 ? void 0 : _c.submitted)) {
                    matchIds.push(doc.id);
                }
            }
            logger.info(`[DUPR] Found ${matchIds.length} eligible matches after filtering`);
        }
        catch (queryError) {
            logger.error('[DUPR] Query failed:', { error: queryError instanceof Error ? queryError.message : 'Unknown' });
            throw new functions.https.HttpsError('internal', 'Failed to query matches: ' + (queryError instanceof Error ? queryError.message : 'Unknown error'));
        }
    }
    // Collect eligible matches and submit immediately
    const results = [];
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
            const match = Object.assign({ id: matchDoc.id }, matchDoc.data());
            // Check if already submitted (skip gracefully)
            if ((_d = match.dupr) === null || _d === void 0 ? void 0 : _d.submitted) {
                skippedCount++;
                continue;
            }
            // Check other eligibility
            if (!match.officialResult ||
                match.status !== 'completed' ||
                match.scoreState !== 'official' ||
                ((_e = match.dupr) === null || _e === void 0 ? void 0 : _e.eligible) === false) {
                // Skip ineligible matches silently
                continue;
            }
            // Submit to DUPR immediately
            logger.info(`[DUPR] Submitting match ${matchId} to DUPR...`);
            const result = await submitMatchToDupr(match, eventName, eventType, eventId, token);
            // Only include defined values to avoid Firestore undefined error
            const resultEntry = {
                matchId,
                success: result.success,
            };
            if (result.duprMatchId)
                resultEntry.duprMatchId = result.duprMatchId;
            if (result.error)
                resultEntry.error = result.error;
            results.push(resultEntry);
            if (result.success) {
                successCount++;
                // Update match with successful submission
                // Build update object with only defined values (Firestore doesn't allow undefined)
                try {
                    const updateData = {
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
                }
                catch (updateError) {
                    logger.error(`[DUPR] Failed to update success state for ${matchId}:`, {
                        error: updateError instanceof Error ? updateError.message : 'Unknown',
                    });
                    // Don't fail the submission just because DB update failed
                }
                logger.info(`[DUPR] Match ${matchId} submitted successfully: ${result.duprMatchId || 'no-id-returned'}`);
            }
            else {
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
                }
                catch (updateError) {
                    logger.error(`[DUPR] Failed to update error state for ${matchId}:`, {
                        error: updateError instanceof Error ? updateError.message : 'Unknown',
                    });
                }
                logger.error(`[DUPR] Match ${matchId} submission failed: ${errorMessage}`);
            }
        }
        catch (matchError) {
            // Capture error and CONTINUE to next match - never abort batch
            logger.error(`[DUPR] Match ${matchId} threw exception:`, {
                error: matchError instanceof Error ? matchError.message : 'Unknown',
                stack: matchError instanceof Error ? (_f = matchError.stack) === null || _f === void 0 ? void 0 : _f.substring(0, 500) : undefined,
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
            }
            catch (updateError) {
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
    const batch = {
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
});
// ============================================
// Scheduled Function: Process Submission Queue
// ============================================
/**
 * Process pending DUPR submissions
 *
 * Runs every 5 minutes to process queued batches.
 * Implements retry logic with exponential backoff.
 *
 * V07.54: Added secrets for Secret Manager access
 */
exports.dupr_processQueue = functions
    .runWith({ secrets: [DUPR_CLIENT_SECRET] })
    .pubsub
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
        const batch = batchDoc.data();
        // Mark as processing
        await batchDoc.ref.update({ status: 'processing' });
        try {
            // Get event name
            const eventName = await getEventName(batch.eventType, batch.eventId);
            // Process each match
            const results = [];
            let successCount = 0;
            let failureCount = 0;
            for (const matchId of batch.matchIds) {
                // Skip if already successfully submitted in previous attempt
                const previousResult = batch.results.find(r => r.matchId === matchId);
                if (previousResult === null || previousResult === void 0 ? void 0 : previousResult.success) {
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
                const match = Object.assign({ id: matchDoc.id }, matchDoc.data());
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
                }
                else {
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
            const updateData = {
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
        }
        catch (error) {
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
 *
 * V07.54: Added secrets for Secret Manager access
 */
exports.dupr_processCorrections = functions
    .runWith({ secrets: [DUPR_CLIENT_SECRET] })
    .pubsub
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
            if (matchesNeedingCorrection.empty)
                continue;
            const eventName = await getEventName(collection === 'tournaments' ? 'tournament' : 'league', eventDoc.id);
            for (const matchDoc of matchesNeedingCorrection.docs) {
                const match = Object.assign({ id: matchDoc.id }, matchDoc.data());
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
                }
                else {
                    console.error(`[DUPR] Correction failed for ${match.id}:`, result.error);
                }
                // Small delay between submissions
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
    }
    console.log('[DUPR] Correction processing complete');
});
/**
 * Get status of a DUPR submission batch
 */
exports.dupr_getBatchStatus = functions.https.onCall(async (data, context) => {
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
        batch: batchDoc.data(),
    };
});
// ============================================
// Scheduled Function: Daily DUPR Rating Sync
// ============================================
/**
 * Sync DUPR ratings for all linked users
 *
 * Runs daily at 3 AM NZ time (14:00 UTC previous day / 15:00 UTC during DST)
 * Fetches latest ratings from DUPR and updates user profiles
 *
 * V07.54: Added secrets for Secret Manager access
 */
exports.dupr_syncRatings = functions
    .runWith({ secrets: [DUPR_CLIENT_SECRET] })
    .pubsub
    .schedule('0 3 * * *') // 3 AM daily
    .timeZone('Pacific/Auckland')
    .onRun(async () => {
    var _a, _b, _c;
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
    const baseUrl = getBaseUrl();
    for (const userDoc of usersWithDupr.docs) {
        const userData = userDoc.data();
        const duprId = userData.duprId;
        if (!duprId)
            continue;
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
            if (data.status !== 'SUCCESS' || !((_a = data.results) === null || _a === void 0 ? void 0 : _a.length)) {
                logger.warn(`[DUPR] No results for user ${userDoc.id} (DUPR: ${duprId})`);
                failureCount++;
                continue;
            }
            const player = data.results[0];
            const singlesStr = (_b = player.ratings) === null || _b === void 0 ? void 0 : _b.singles;
            const doublesStr = (_c = player.ratings) === null || _c === void 0 ? void 0 : _c.doubles;
            // Convert string ratings to numbers (handle "NR" as null)
            const singlesRating = singlesStr && singlesStr !== 'NR' ? parseFloat(singlesStr) : null;
            const doublesRating = doublesStr && doublesStr !== 'NR' ? parseFloat(doublesStr) : null;
            // Only update if we got valid data
            if (doublesRating !== null || singlesRating !== null) {
                const updateData = {
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
        }
        catch (error) {
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
 *
 * V07.54: Added secrets for Secret Manager access
 */
exports.dupr_refreshMyRating = functions
    .runWith({ secrets: [DUPR_CLIENT_SECRET] })
    .https.onCall(async (_data, context) => {
    var _a, _b, _c;
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
    const duprId = userData === null || userData === void 0 ? void 0 : userData.duprId;
    if (!duprId) {
        throw new functions.https.HttpsError('failed-precondition', 'No DUPR account linked');
    }
    // Rate limit: 60 seconds between refreshes
    const lastSync = userData === null || userData === void 0 ? void 0 : userData.duprLastSyncAt;
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
    const baseUrl = getBaseUrl();
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
        throw new functions.https.HttpsError('unavailable', 'Unable to fetch DUPR rating. Please try again later.');
    }
    // Parse response - structure: { status: "SUCCESS", results: [{ ratings: { singles, doubles } }] }
    const data = await response.json();
    if (data.status !== 'SUCCESS' || !((_a = data.results) === null || _a === void 0 ? void 0 : _a.length)) {
        logger.error('[DUPR] refreshMyRating v2: unexpected response', { data });
        throw new functions.https.HttpsError('unavailable', 'No player data returned from DUPR');
    }
    const player = data.results[0];
    const singlesStr = (_b = player.ratings) === null || _b === void 0 ? void 0 : _b.singles;
    const doublesStr = (_c = player.ratings) === null || _c === void 0 ? void 0 : _c.doubles;
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
    const updateData = {
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
        doublesRating: doublesRating !== null && doublesRating !== void 0 ? doublesRating : null,
        singlesRating: singlesRating !== null && singlesRating !== void 0 ? singlesRating : null,
        doublesReliability: doublesReliability !== null && doublesReliability !== void 0 ? doublesReliability : null,
        singlesReliability: singlesReliability !== null && singlesReliability !== void 0 ? singlesReliability : null,
        syncedAt: Date.now(),
    };
});
exports.dupr_updateMySubscriptions = functions.https.onCall(async (data, context) => {
    var _a;
    // Auth check
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const uid = context.auth.uid;
    const { subscriptions } = data;
    logger.info('[DUPR+] updateMySubscriptions called', { uid, subscriptionCount: (subscriptions === null || subscriptions === void 0 ? void 0 : subscriptions.length) || 0 });
    // Strict validation: require status === 'active' OR (expiresAt exists AND is in future)
    const duprPlusActive = (_a = subscriptions === null || subscriptions === void 0 ? void 0 : subscriptions.some((s) => {
        // Safe logging for debugging (no secrets)
        logger.info('[DUPR+] Evaluating subscription:', {
            hasProductId: !!s.productId,
            hasStatus: !!s.status,
            status: s.status,
            hasExpiresAt: !!s.expiresAt,
        });
        // Check status first
        if (s.status === 'active')
            return true;
        // Check expiresAt only if it exists and is in future
        if (s.expiresAt && s.expiresAt > Date.now())
            return true;
        return false;
    })) !== null && _a !== void 0 ? _a : false;
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
    }
    catch (updateError) {
        logger.error('[DUPR+] Failed to update user profile', {
            uid,
            error: updateError instanceof Error ? updateError.message : 'Unknown',
        });
        throw new functions.https.HttpsError('internal', 'Failed to update subscription status');
    }
    return { success: true, duprPlusActive };
});
/**
 * Test DUPR API connection
 *
 * Diagnostic function for admins to verify DUPR credentials are working.
 * Attempts to get a token from the DUPR API.
 *
 * V07.54: Added for admin dashboard connection testing
 */
exports.dupr_testConnection = functions
    .runWith({ secrets: [DUPR_CLIENT_SECRET] })
    .https.onCall(async (_data, context) => {
    var _a;
    // Only admins can test connection
    if (!context.auth) {
        return { success: false, environment: getEnvironment(), error: 'Must be logged in' };
    }
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const userData = userDoc.data();
    // Check for admin using all known patterns (isAppAdmin, role, roles array)
    const isAdmin = (userData === null || userData === void 0 ? void 0 : userData.isAppAdmin) === true ||
        (userData === null || userData === void 0 ? void 0 : userData.role) === 'app_admin' ||
        ((_a = userData === null || userData === void 0 ? void 0 : userData.roles) === null || _a === void 0 ? void 0 : _a.includes('app_admin'));
    if (!isAdmin) {
        return { success: false, environment: getEnvironment(), error: 'Admin access required' };
    }
    const env = getEnvironment();
    try {
        const token = await getDuprToken();
        if (token) {
            return { success: true, environment: env };
        }
        else {
            return { success: false, environment: env, error: 'Failed to get token - check credentials' };
        }
    }
    catch (err) {
        logger.error('[DUPR] Connection test failed:', err);
        return {
            success: false,
            environment: env,
            error: err instanceof Error ? err.message : 'Unknown error',
        };
    }
});
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
 *
 * V07.54: Added secrets for Secret Manager access
 */
exports.dupr_testSubmitOneMatch = functions
    .runWith({ secrets: [DUPR_CLIENT_SECRET] })
    .https.onCall(async (data, context) => {
    var _a, _b, _c, _d, _e;
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
    const isAppAdmin = (userData === null || userData === void 0 ? void 0 : userData.role) === 'app_admin';
    if (!isAppAdmin) {
        // Check if user is organizer for this event
        const eventCollection = eventType === 'tournament' ? 'tournaments' :
            eventType === 'league' ? 'leagues' : 'meetups';
        const eventDoc = await db.collection(eventCollection).doc(eventId).get();
        if (!eventDoc.exists) {
            return { ok: false, stage: 'permission', error: 'Event not found' };
        }
        const eventData = eventDoc.data();
        const isOrganizer = (eventData === null || eventData === void 0 ? void 0 : eventData.organizerId) === userId ||
            ((_a = eventData === null || eventData === void 0 ? void 0 : eventData.organizerIds) === null || _a === void 0 ? void 0 : _a.includes(userId)) ||
            (eventData === null || eventData === void 0 ? void 0 : eventData.createdBy) === userId ||
            (eventData === null || eventData === void 0 ? void 0 : eventData.createdByUserId) === userId;
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
    const match = Object.assign({ id: matchDoc.id }, matchDoc.data());
    // Return match metadata (safe, no player IDs)
    const matchMetadata = {
        hasOfficialResult: !!match.officialResult,
        scoreCount: ((_c = (_b = match.officialResult) === null || _b === void 0 ? void 0 : _b.scores) === null || _c === void 0 ? void 0 : _c.length) || 0,
        hasSideA: !!match.sideA,
        hasSideB: !!match.sideB,
        gameCount: ((_e = (_d = match.officialResult) === null || _d === void 0 ? void 0 : _d.scores) === null || _e === void 0 ? void 0 : _e.length) || 0,
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
        identifier: duprPayload.identifier,
        matchSource: duprPayload.matchSource,
        format: duprPayload.format,
        gameCount: Object.keys(duprPayload.teamA || {}).filter(k => k.startsWith('game')).length,
        hasClubId: !!duprPayload.clubId,
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
    }
    catch (error) {
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
});
/**
 * dupr_retryFailed
 *
 * Retries all failed DUPR submissions for an event.
 * Called by organizers to retry matches that previously failed.
 *
 * V07.54: Added secrets for Secret Manager access
 */
exports.dupr_retryFailed = functions
    .runWith({
    timeoutSeconds: 300,
    secrets: [DUPR_CLIENT_SECRET],
})
    .https.onCall(async (data, context) => {
    var _a, _b, _c, _d, _e;
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
    const isOrganizer = (eventData === null || eventData === void 0 ? void 0 : eventData.organizerId) === userId ||
        ((_a = eventData === null || eventData === void 0 ? void 0 : eventData.organizerIds) === null || _a === void 0 ? void 0 : _a.includes(userId)) ||
        (eventData === null || eventData === void 0 ? void 0 : eventData.createdBy) === userId ||
        (eventData === null || eventData === void 0 ? void 0 : eventData.createdByUserId) === userId;
    // Also check for app admin
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    const isAppAdmin = (userData === null || userData === void 0 ? void 0 : userData.role) === 'app_admin' || (userData === null || userData === void 0 ? void 0 : userData.isAppAdmin) === true;
    if (!isOrganizer && !isAppAdmin) {
        throw new functions.https.HttpsError('permission-denied', 'Only organizers can retry DUPR submissions');
    }
    // Get DUPR API token
    const token = await getDuprToken();
    if (!token) {
        throw new functions.https.HttpsError('unavailable', 'DUPR API unavailable');
    }
    const eventName = (eventData === null || eventData === void 0 ? void 0 : eventData.name) || (eventData === null || eventData === void 0 ? void 0 : eventData.title) || `${eventType}-${eventId}`;
    // Query failed matches (have submissionError or dupr.submitted is false with previous attempt)
    const matchesCollection = db.collection(eventCollection).doc(eventId).collection('matches');
    const failedMatches = await matchesCollection
        .where('status', '==', 'completed')
        .where('scoreState', '==', 'official')
        .get();
    const matchIds = [];
    for (const doc of failedMatches.docs) {
        const match = doc.data();
        // Include matches that have a submission error OR were queued but not submitted
        if (match.officialResult &&
            ((_b = match.dupr) === null || _b === void 0 ? void 0 : _b.eligible) !== false &&
            !((_c = match.dupr) === null || _c === void 0 ? void 0 : _c.submitted) &&
            (((_d = match.dupr) === null || _d === void 0 ? void 0 : _d.submissionError) || ((_e = match.dupr) === null || _e === void 0 ? void 0 : _e.pendingSubmission))) {
            matchIds.push(doc.id);
        }
    }
    logger.info(`[DUPR] Found ${matchIds.length} failed matches to retry`);
    // Retry each failed match
    const results = [];
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
        const match = Object.assign({ id: matchDoc.id }, matchDoc.data());
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
        }
        else {
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
});
// ============================================
// HTTP Function: DUPR Webhook Handler
// ============================================
/**
 * Generate deterministic dedupe key for webhook event
 * Uses SHA-256 hash of normalized payload fields
 */
function generateWebhookDedupeKey(payload, rawBody) {
    var _a, _b, _c, _d, _e, _f, _g;
    // Extract stable fields for hashing
    const eventType = ((_b = (_a = payload === null || payload === void 0 ? void 0 : payload.event) !== null && _a !== void 0 ? _a : payload === null || payload === void 0 ? void 0 : payload.topic) !== null && _b !== void 0 ? _b : 'UNKNOWN');
    const clientId = ((_c = payload === null || payload === void 0 ? void 0 : payload.clientId) !== null && _c !== void 0 ? _c : '');
    const message = payload === null || payload === void 0 ? void 0 : payload.message;
    const duprId = ((_d = message === null || message === void 0 ? void 0 : message.duprId) !== null && _d !== void 0 ? _d : '');
    const rating = message === null || message === void 0 ? void 0 : message.rating;
    const matchId = ((_e = rating === null || rating === void 0 ? void 0 : rating.matchId) !== null && _e !== void 0 ? _e : '');
    const singles = ((_f = rating === null || rating === void 0 ? void 0 : rating.singles) !== null && _f !== void 0 ? _f : '');
    const doubles = ((_g = rating === null || rating === void 0 ? void 0 : rating.doubles) !== null && _g !== void 0 ? _g : '');
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
async function processWebhookRatingChange(payload) {
    const message = payload === null || payload === void 0 ? void 0 : payload.message;
    if (!(message === null || message === void 0 ? void 0 : message.duprId)) {
        logger.info('[DUPR Webhook] No duprId in rating change event');
        return;
    }
    const duprId = message.duprId;
    const name = message.name;
    const rating = message.rating;
    // Parse ratings - handle "NR" (Not Rated) as null
    const doublesRating = (rating === null || rating === void 0 ? void 0 : rating.doubles) && rating.doubles !== 'NR'
        ? parseFloat(rating.doubles)
        : null;
    const singlesRating = (rating === null || rating === void 0 ? void 0 : rating.singles) && rating.singles !== 'NR'
        ? parseFloat(rating.singles)
        : null;
    const doublesReliability = (rating === null || rating === void 0 ? void 0 : rating.doublesReliability)
        ? parseFloat(rating.doublesReliability)
        : null;
    const singlesReliability = (rating === null || rating === void 0 ? void 0 : rating.singlesReliability)
        ? parseFloat(rating.singlesReliability)
        : null;
    const matchId = rating === null || rating === void 0 ? void 0 : rating.matchId;
    // 1. Upsert duprPlayers/{duprId} snapshot collection
    const playerSnapshot = {
        duprId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        source: 'webhook',
    };
    if (name)
        playerSnapshot.name = name;
    if (doublesRating !== null)
        playerSnapshot.doublesRating = doublesRating;
    if (singlesRating !== null)
        playerSnapshot.singlesRating = singlesRating;
    if (doublesReliability !== null)
        playerSnapshot.doublesReliability = doublesReliability;
    if (singlesReliability !== null)
        playerSnapshot.singlesReliability = singlesReliability;
    if (matchId !== undefined)
        playerSnapshot.lastMatchId = matchId;
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
    const userUpdates = {
        duprLastSyncAt: nowMs,
        duprLastSyncSource: 'webhook',
        updatedAt: nowMs,
    };
    if (doublesRating !== null)
        userUpdates.duprDoublesRating = doublesRating;
    if (singlesRating !== null)
        userUpdates.duprSinglesRating = singlesRating;
    if (doublesReliability !== null)
        userUpdates.duprDoublesReliability = doublesReliability;
    if (singlesReliability !== null)
        userUpdates.duprSinglesReliability = singlesReliability;
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
exports.duprWebhook = functions.https.onRequest(async (req, res) => {
    var _a, _b, _c;
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
        let payload;
        try {
            if (typeof req.body === 'string') {
                payload = JSON.parse(req.body);
            }
            else {
                payload = req.body || {};
            }
        }
        catch (_d) {
            logger.error('[DUPR Webhook] Failed to parse request body');
            res.status(200).send('ok'); // Still return 200 to prevent retries
            return;
        }
        // Generate deterministic dedupe key using raw body for stable hashing
        const dedupeKey = generateWebhookDedupeKey(payload, rawBody);
        // Extract event type (DUPR uses 'event' field, but support 'topic' as fallback)
        const request = payload === null || payload === void 0 ? void 0 : payload.request;
        const eventType = ((_c = (_b = (_a = payload === null || payload === void 0 ? void 0 : payload.event) !== null && _a !== void 0 ? _a : payload === null || payload === void 0 ? void 0 : payload.topic) !== null && _b !== void 0 ? _b : request === null || request === void 0 ? void 0 : request.event) !== null && _c !== void 0 ? _c : 'UNKNOWN');
        logger.info('[DUPR Webhook] Event received', {
            dedupeKey,
            eventType,
            clientId: payload === null || payload === void 0 ? void 0 : payload.clientId,
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
            await eventRef.set(Object.assign(Object.assign({}, payload), { dedupeKey,
                eventType, receivedAt: admin.firestore.FieldValue.serverTimestamp(), processed: false }));
        }
        catch (storeError) {
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
                }
                catch (_e) {
                    // Ignore update failure
                }
            }
            else if (eventType === 'REGISTRATION') {
                // Validation event from DUPR when webhook is first registered
                logger.info('[DUPR Webhook] Registration validation received');
                try {
                    await db.collection('duprWebhookEvents').doc(dedupeKey).update({
                        processed: true,
                        processedAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                }
                catch (_f) {
                    // Ignore update failure
                }
            }
            else {
                logger.info('[DUPR Webhook] Unknown event type, stored for review', { eventType });
            }
        }
        catch (processError) {
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
 *
 * V07.54: Added secrets for Secret Manager access
 */
exports.dupr_subscribeToRatings = functions
    .runWith({ secrets: [DUPR_CLIENT_SECRET] })
    .https.onCall(async (data, context) => {
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
    const baseUrl = getBaseUrl();
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
            throw new functions.https.HttpsError('internal', responseData.message || 'Subscription failed');
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
    }
    catch (error) {
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        logger.error('[DUPR Subscribe] Exception', {
            error: error instanceof Error ? error.message : 'Unknown',
        });
        throw new functions.https.HttpsError('internal', 'Subscription request failed');
    }
});
// ============================================
// Callable Function: Get DUPR Subscriptions
// ============================================
/**
 * Helper function to subscribe a single DUPR ID to rating notifications
 * DUPR API expects body to be an array of DUPR IDs: ["GGEGNM"]
 */
async function subscribeSingleDuprId(duprId, token, baseUrl) {
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
        if (response.ok && (responseData === null || responseData === void 0 ? void 0 : responseData.status) !== 'FAILURE') {
            return { success: true };
        }
        else {
            const errorMsg = (responseData === null || responseData === void 0 ? void 0 : responseData.message) || (responseData === null || responseData === void 0 ? void 0 : responseData.error) || JSON.stringify(responseData);
            return { success: false, error: errorMsg };
        }
    }
    catch (error) {
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
 *
 * V07.54: Added secrets for Secret Manager access
 */
exports.dupr_subscribeAllUsers = functions
    .runWith({
    timeoutSeconds: 540, // 9 min timeout for one-at-a-time calls
    secrets: [DUPR_CLIENT_SECRET],
})
    .https.onCall(async (_data, context) => {
    var _a;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    // Check if user is admin (supports multiple field patterns)
    const userDoc = await db.collection('users').doc(context.auth.uid).get();
    const userData = userDoc.data();
    const isAdmin = (userData === null || userData === void 0 ? void 0 : userData.role) === 'app_admin' ||
        ((_a = userData === null || userData === void 0 ? void 0 : userData.roles) === null || _a === void 0 ? void 0 : _a.includes('app_admin')) ||
        (userData === null || userData === void 0 ? void 0 : userData.isAppAdmin) === true ||
        (userData === null || userData === void 0 ? void 0 : userData.isRootAdmin) === true;
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
    const duprIds = [];
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
    const baseUrl = getBaseUrl();
    // Subscribe ONE BY ONE (DUPR API doesn't accept arrays)
    let subscribedCount = 0;
    const errors = [];
    for (let i = 0; i < duprIds.length; i++) {
        const duprId = duprIds[i];
        const result = await subscribeSingleDuprId(duprId, token, baseUrl);
        if (result.success) {
            subscribedCount++;
            logger.info(`[DUPR] Subscribed ${i + 1}/${duprIds.length}: ${duprId}`);
        }
        else {
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
 *
 * V07.54: Added secrets for Secret Manager access
 */
exports.dupr_getSubscriptions = functions
    .runWith({ secrets: [DUPR_CLIENT_SECRET] })
    .https.onCall(async (_data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const token = await getDuprToken();
    if (!token) {
        throw new functions.https.HttpsError('unavailable', 'Failed to get DUPR token');
    }
    const baseUrl = getBaseUrl();
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
    }
    catch (error) {
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        logger.error('[DUPR Subscriptions] Exception', {
            error: error instanceof Error ? error.message : 'Unknown',
        });
        throw new functions.https.HttpsError('internal', 'Failed to fetch subscriptions');
    }
});
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
 *
 * V07.54: Added secrets for Secret Manager access
 */
exports.dupr_onUserDuprLinked = functions
    .runWith({ secrets: [DUPR_CLIENT_SECRET] })
    .firestore
    .document('users/{userId}')
    .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const oldDuprId = before === null || before === void 0 ? void 0 : before.duprId;
    const newDuprId = after === null || after === void 0 ? void 0 : after.duprId;
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
    const baseUrl = getBaseUrl();
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
    }
    else {
        logger.error('[DUPR] Auto-subscribe failed', {
            userId: context.params.userId,
            duprId: newDuprId,
            error: result.error,
        });
    }
});
//# sourceMappingURL=dupr.js.map
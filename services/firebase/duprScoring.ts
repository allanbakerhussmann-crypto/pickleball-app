/**
 * DUPR-Compliant Scoring Service
 *
 * Implements the three-tier scoring model:
 * 1. scoreProposal - Player-submitted score claims
 * 2. officialResult - Organizer-finalized official result
 * 3. dupr - DUPR submission tracking (server-side only)
 *
 * Key Rules:
 * - Match status ONLY becomes 'completed' when officialResult is written
 * - scoreLocked blocks ALL player writes after organizer finalizes
 * - Signer must be on opposing team (validated via teamSnapshot)
 * - Proposal immutable once signed/disputed (except organizer override)
 * - V07.52: In DUPR tournaments, organizers CANNOT propose scores (anti-self-reporting)
 *
 * @version V07.52
 * @file services/firebase/duprScoring.ts
 */

import {
  doc,
  getDoc,
  updateDoc,
  runTransaction,
} from '@firebase/firestore';
import { httpsCallable } from '@firebase/functions';
import { db, functions } from './config';
import type {
  Match,
  GameScore,
  ScoreProposal,
  OfficialResult,
  OfficialResultVersion,
  ScoreState,
  TeamSnapshot,
} from '../../types';
import {
  canProposeScore,
  canSignProposal,
  canDisputeProposal,
  canFinalizeResult,
  canCorrectResult,
  validateSignerIsOpposingTeam,
  type DuprContext,
} from '../../utils/scorePermissions';
import { updatePoolResultsOnMatchComplete } from './poolResults';

// ============================================
// ERROR TYPES
// ============================================

export class DuprScoringError extends Error {
  constructor(
    message: string,
    public code:
      | 'PERMISSION_DENIED'
      | 'SCORE_LOCKED'
      | 'INVALID_STATE'
      | 'NOT_FOUND'
      | 'VALIDATION_FAILED'
  ) {
    super(message);
    this.name = 'DuprScoringError';
  }
}

// ============================================
// MATCH PATH HELPERS
// ============================================

type EventType = 'tournament' | 'league' | 'meetup';

function getMatchDocPath(
  eventType: EventType,
  eventId: string,
  matchId: string
): string {
  switch (eventType) {
    case 'tournament':
      return `tournaments/${eventId}/matches/${matchId}`;
    case 'league':
      return `leagues/${eventId}/matches/${matchId}`;
    case 'meetup':
      return `meetups/${eventId}/matches/${matchId}`;
    default:
      throw new DuprScoringError(
        `Unknown event type: ${eventType}`,
        'VALIDATION_FAILED'
      );
  }
}

// ============================================
// PLAYER ACTIONS
// ============================================

/**
 * Propose a score for a match (player action)
 *
 * Creates a scoreProposal with status 'proposed'.
 * Can only be called by match participants.
 * Will fail if scoreLocked or proposal already locked.
 *
 * V07.52: In DUPR tournaments, organizers CANNOT propose scores (anti-self-reporting).
 * Pass duprContext to enable this check.
 *
 * @param eventType - 'tournament', 'league', or 'meetup'
 * @param eventId - The event ID
 * @param matchId - The match ID
 * @param scores - Array of game scores
 * @param winnerId - ID of the winning side
 * @param userId - ID of the user proposing the score
 * @param duprContext - Optional DUPR context for DUPR tournament rules
 */
export async function proposeScore(
  eventType: EventType,
  eventId: string,
  matchId: string,
  scores: GameScore[],
  winnerId: string,
  userId: string,
  duprContext?: DuprContext
): Promise<void> {
  const matchPath = getMatchDocPath(eventType, eventId, matchId);
  const matchRef = doc(db, matchPath);

  await runTransaction(db, async (transaction) => {
    const matchSnap = await transaction.get(matchRef);
    if (!matchSnap.exists()) {
      throw new DuprScoringError('Match not found', 'NOT_FOUND');
    }

    const match = { id: matchSnap.id, ...matchSnap.data() } as Match;

    // Check permission (V07.52: Pass duprContext for DUPR-specific rules)
    const permission = canProposeScore(match, userId, duprContext);
    if (!permission.allowed) {
      throw new DuprScoringError(
        permission.reason || 'Cannot propose score',
        'PERMISSION_DENIED'
      );
    }

    // Validate winnerId is one of the sides
    // Support both tournament format (sideA.id/sideB.id) and league format (memberAId/memberBId)
    const leagueMatch = match as any;
    const sideAId = match.sideA?.id || leagueMatch.memberAId;
    const sideBId = match.sideB?.id || leagueMatch.memberBId;

    if (winnerId !== sideAId && winnerId !== sideBId) {
      throw new DuprScoringError(
        'Winner must be sideA or sideB',
        'VALIDATION_FAILED'
      );
    }

    // Validate scores array
    if (!scores || scores.length === 0) {
      throw new DuprScoringError('Scores are required', 'VALIDATION_FAILED');
    }

    // Get winner name
    const sideAName = match.sideA?.name || leagueMatch.memberAName;
    const sideBName = match.sideB?.name || leagueMatch.memberBName;
    const winnerName = winnerId === sideAId ? sideAName : sideBName;

    // Create score proposal
    const scoreProposal: ScoreProposal = {
      scores,
      winnerId,
      winnerName,
      enteredByUserId: userId,
      enteredAt: Date.now(),
      status: 'proposed',
      locked: false,
    };

    // Create or update team snapshot if not exists
    let teamSnapshot = match.teamSnapshot;
    if (!teamSnapshot) {
      // Build player IDs from tournament format or league format
      const sideAPlayerIds = match.sideA?.playerIds ||
        [leagueMatch.userAId, leagueMatch.partnerAId].filter(Boolean);
      const sideBPlayerIds = match.sideB?.playerIds ||
        [leagueMatch.userBId, leagueMatch.partnerBId].filter(Boolean);

      teamSnapshot = {
        sideAPlayerIds,
        sideBPlayerIds,
        snapshotAt: Date.now(),
      };
    }

    // V07.10: Ensure sideA/sideB exist for Firestore rules compatibility
    // This populates them on existing league matches that were created before V07.10
    const sideA = match.sideA || {
      id: sideAId,
      name: sideAName,
      playerIds: teamSnapshot.sideAPlayerIds,
    };
    const sideB = match.sideB || {
      id: sideBId,
      name: sideBName,
      playerIds: teamSnapshot.sideBPlayerIds,
    };

    // Update match
    transaction.update(matchRef, {
      scoreProposal,
      scoreState: 'proposed' as ScoreState,
      teamSnapshot,
      sideA,
      sideB,
      // Also update legacy fields for compatibility
      scores,
      status: 'pending_confirmation',
      submittedByUserId: userId,  // V07.40: Also set legacy field for consistency
      submittedAt: Date.now(),
      updatedAt: Date.now(),
    });
  });
}

/**
 * Sign (acknowledge) a score proposal (player action)
 *
 * Sets proposal status to 'signed' and locks it.
 * Can only be called by a player on the OPPOSING team.
 * Notifies organizer that proposal is ready for finalization.
 */
export async function signScore(
  eventType: EventType,
  eventId: string,
  matchId: string,
  userId: string
): Promise<void> {
  const matchPath = getMatchDocPath(eventType, eventId, matchId);
  const matchRef = doc(db, matchPath);

  await runTransaction(db, async (transaction) => {
    const matchSnap = await transaction.get(matchRef);
    if (!matchSnap.exists()) {
      throw new DuprScoringError('Match not found', 'NOT_FOUND');
    }

    const match = { id: matchSnap.id, ...matchSnap.data() } as Match;

    // Check basic permission
    const permission = canSignProposal(match, userId);
    if (!permission.allowed) {
      throw new DuprScoringError(
        permission.reason || 'Cannot sign proposal',
        'PERMISSION_DENIED'
      );
    }

    // Additional validation: signer must be on opposing team
    const proposerUserId = match.scoreProposal!.enteredByUserId;
    const signerValidation = validateSignerIsOpposingTeam(
      match,
      proposerUserId,
      userId
    );
    if (!signerValidation.allowed) {
      throw new DuprScoringError(
        signerValidation.reason || 'Invalid signer',
        'PERMISSION_DENIED'
      );
    }

    // Update proposal to signed and lock it
    const updatedProposal: ScoreProposal = {
      ...match.scoreProposal!,
      status: 'signed',
      signedByUserId: userId,
      signedAt: Date.now(),
      locked: true,
    };

    transaction.update(matchRef, {
      scoreProposal: updatedProposal,
      scoreState: 'signed' as ScoreState,
      updatedAt: Date.now(),
    });
  });
}

/**
 * Dispute a score proposal (player action)
 *
 * Sets proposal status to 'disputed' and locks it.
 * Can only be called by a player on the OPPOSING team.
 * Notifies organizer to resolve the dispute.
 */
export async function disputeScore(
  eventType: EventType,
  eventId: string,
  matchId: string,
  userId: string,
  disputeReason: string
): Promise<void> {
  const matchPath = getMatchDocPath(eventType, eventId, matchId);
  const matchRef = doc(db, matchPath);

  await runTransaction(db, async (transaction) => {
    const matchSnap = await transaction.get(matchRef);
    if (!matchSnap.exists()) {
      throw new DuprScoringError('Match not found', 'NOT_FOUND');
    }

    const match = { id: matchSnap.id, ...matchSnap.data() } as Match;

    // Check basic permission
    const permission = canDisputeProposal(match, userId);
    if (!permission.allowed) {
      throw new DuprScoringError(
        permission.reason || 'Cannot dispute proposal',
        'PERMISSION_DENIED'
      );
    }

    // Additional validation: disputer must be on opposing team
    const proposerUserId = match.scoreProposal!.enteredByUserId;
    const signerValidation = validateSignerIsOpposingTeam(
      match,
      proposerUserId,
      userId
    );
    if (!signerValidation.allowed) {
      throw new DuprScoringError(
        signerValidation.reason || 'Invalid disputer',
        'PERMISSION_DENIED'
      );
    }

    // Update proposal to disputed and lock it
    const updatedProposal: ScoreProposal = {
      ...match.scoreProposal!,
      status: 'disputed',
      disputedByUserId: userId,
      disputedAt: Date.now(),
      disputeReason: disputeReason || 'No reason provided',
      locked: true,
    };

    transaction.update(matchRef, {
      scoreProposal: updatedProposal,
      scoreState: 'disputed' as ScoreState,
      status: 'disputed',
      updatedAt: Date.now(),
    });
  });
}

// ============================================
// ORGANIZER ACTIONS
// ============================================

/**
 * Finalise the official result (organizer action)
 *
 * Creates officialResult, sets status to 'completed', and locks score.
 * Can accept proposal scores or use organizer-provided scores.
 * This is THE ONLY way to make a match count for standings.
 */
export async function finaliseResult(
  eventType: EventType,
  eventId: string,
  matchId: string,
  scores: GameScore[],
  winnerId: string,
  organizerUserId: string,
  duprEligible: boolean = true
): Promise<void> {
  const matchPath = getMatchDocPath(eventType, eventId, matchId);
  const matchRef = doc(db, matchPath);

  await runTransaction(db, async (transaction) => {
    const matchSnap = await transaction.get(matchRef);
    if (!matchSnap.exists()) {
      throw new DuprScoringError('Match not found', 'NOT_FOUND');
    }

    const match = { id: matchSnap.id, ...matchSnap.data() } as Match;

    // Check permission (caller must verify isOrganizer before calling)
    const permission = canFinalizeResult(match, true);
    if (!permission.allowed) {
      throw new DuprScoringError(
        permission.reason || 'Cannot finalize result',
        'PERMISSION_DENIED'
      );
    }

    // Support both tournament format (sideA.id/sideB.id) and league format (memberAId/memberBId)
    const leagueMatch = match as any;
    const sideAId = match.sideA?.id || leagueMatch.memberAId;
    const sideBId = match.sideB?.id || leagueMatch.memberBId;
    const sideAName = match.sideA?.name || leagueMatch.memberAName || leagueMatch.userAName;
    const sideBName = match.sideB?.name || leagueMatch.memberBName || leagueMatch.userBName;

    // Validate winnerId
    if (winnerId !== sideAId && winnerId !== sideBId) {
      throw new DuprScoringError(
        'Winner must be sideA or sideB',
        'VALIDATION_FAILED'
      );
    }

    // Validate scores
    if (!scores || scores.length === 0) {
      throw new DuprScoringError('Scores are required', 'VALIDATION_FAILED');
    }

    // Get winner name
    const winnerName = winnerId === sideAId ? sideAName : sideBName;

    // Create official result
    const officialResult: OfficialResult = {
      scores,
      winnerId,
      winnerName,
      finalisedByUserId: organizerUserId,
      finalisedAt: Date.now(),
      version: 1,
    };

    const now = Date.now();

    // Build update object
    const updates: Partial<Match> & { updatedAt: number; winnerMemberId?: string } = {
      officialResult,
      scoreState: 'official' as ScoreState,
      status: 'completed',
      scoreLocked: true,
      scoreLockedAt: now,
      scoreLockedByUserId: organizerUserId,
      // Update canonical fields
      winnerId,
      winnerName,
      scores,
      completedAt: now,
      updatedAt: now,
      // DUPR eligibility
      dupr: {
        eligible: duprEligible,
        submitted: false,
      },
    };

    // V07.16: For league matches, also write winnerMemberId for compatibility
    // with standings calculation and legacy code
    if (eventType === 'league') {
      updates.winnerMemberId = winnerId;
    }

    transaction.update(matchRef, updates);

    // Return match data for pool results update (can't do async inside transaction)
    return { match, updates, now };
  });

  // Update pool results after transaction completes (for tournament pool matches)
  if (eventType === 'tournament') {
    // Re-fetch the match to get divisionId and poolGroup
    const matchSnap = await getDoc(matchRef);
    if (matchSnap.exists()) {
      const completedMatch = { id: matchSnap.id, ...matchSnap.data() } as Match;
      if (completedMatch.divisionId && completedMatch.poolGroup) {
        try {
          await updatePoolResultsOnMatchComplete(eventId, completedMatch.divisionId, completedMatch);
        } catch (err) {
          console.error('Failed to update pool results:', err);
          // Don't throw - match is already finalized, pool update is secondary
        }
      }
    }
  }
}

/**
 * Correct an existing official result (organizer action)
 *
 * Creates a new version of officialResult, archiving the previous.
 * If already submitted to DUPR, sets needsCorrection flag.
 */
export async function correctResult(
  eventType: EventType,
  eventId: string,
  matchId: string,
  scores: GameScore[],
  winnerId: string,
  organizerUserId: string,
  correctionReason?: string
): Promise<void> {
  const matchPath = getMatchDocPath(eventType, eventId, matchId);
  const matchRef = doc(db, matchPath);

  await runTransaction(db, async (transaction) => {
    const matchSnap = await transaction.get(matchRef);
    if (!matchSnap.exists()) {
      throw new DuprScoringError('Match not found', 'NOT_FOUND');
    }

    const match = { id: matchSnap.id, ...matchSnap.data() } as Match;

    // Check permission
    const permission = canCorrectResult(match, true);
    if (!permission.allowed) {
      throw new DuprScoringError(
        permission.reason || 'Cannot correct result',
        'PERMISSION_DENIED'
      );
    }

    // Support both tournament format (sideA.id/sideB.id) and league format (memberAId/memberBId)
    const leagueMatch = match as any;
    const sideAId = match.sideA?.id || leagueMatch.memberAId;
    const sideBId = match.sideB?.id || leagueMatch.memberBId;
    const sideAName = match.sideA?.name || leagueMatch.memberAName || leagueMatch.userAName;
    const sideBName = match.sideB?.name || leagueMatch.memberBName || leagueMatch.userBName;

    // Validate winnerId
    if (winnerId !== sideAId && winnerId !== sideBId) {
      throw new DuprScoringError(
        'Winner must be sideA or sideB',
        'VALIDATION_FAILED'
      );
    }

    // Get winner name
    const winnerName = winnerId === sideAId ? sideAName : sideBName;

    // Archive current officialResult
    const currentResult = match.officialResult!;
    const previousVersion: OfficialResultVersion = {
      version: currentResult.version,
      scores: currentResult.scores,
      winnerId: currentResult.winnerId,
      finalisedByUserId: currentResult.finalisedByUserId,
      finalisedAt: currentResult.finalisedAt,
      supersededAt: Date.now(),
      supersededByUserId: organizerUserId,
      correctionReason,
    };

    // Collect previous versions
    const previousVersions = [
      ...(currentResult.previousVersions || []),
      previousVersion,
    ];

    // Create new official result
    const newOfficialResult: OfficialResult = {
      scores,
      winnerId,
      winnerName,
      finalisedByUserId: organizerUserId,
      finalisedAt: Date.now(),
      version: currentResult.version + 1,
      previousVersions,
    };

    // Check if already submitted to DUPR
    const wasSubmittedToDupr = match.dupr?.submitted === true;

    // Build update object
    const updates: Partial<Match> & { updatedAt: number; winnerMemberId?: string } = {
      officialResult: newOfficialResult,
      // Update canonical fields
      winnerId,
      winnerName,
      scores,
      updatedAt: Date.now(),
    };

    // V07.16: For league matches, also write winnerMemberId for compatibility
    if (eventType === 'league') {
      updates.winnerMemberId = winnerId;
    }

    // If already submitted to DUPR, flag for correction
    if (wasSubmittedToDupr && match.dupr) {
      updates.dupr = {
        eligible: match.dupr.eligible,
        submitted: match.dupr.submitted,
        submittedAt: match.dupr.submittedAt,
        submissionId: match.dupr.submissionId,
        submissionError: match.dupr.submissionError,
        batchId: match.dupr.batchId,
        retryCount: match.dupr.retryCount,
        lastRetryAt: match.dupr.lastRetryAt,
        nextRetryAt: match.dupr.nextRetryAt,
        needsCorrection: true,
        correctionSubmitted: false,
        correctionSubmittedAt: undefined,
        correctionBatchId: undefined,
      };
    }

    transaction.update(matchRef, updates);
  });
}

// ============================================
// ORGANIZER DUPR ACTIONS
// ============================================

/**
 * Set DUPR eligibility for a match (organizer action)
 *
 * Marks whether the match can be submitted to DUPR.
 */
export async function setDuprEligibility(
  eventType: EventType,
  eventId: string,
  matchId: string,
  eligible: boolean,
  _organizerUserId: string
): Promise<void> {
  const matchPath = getMatchDocPath(eventType, eventId, matchId);
  const matchRef = doc(db, matchPath);

  const matchSnap = await getDoc(matchRef);
  if (!matchSnap.exists()) {
    throw new DuprScoringError('Match not found', 'NOT_FOUND');
  }

  const match = { id: matchSnap.id, ...matchSnap.data() } as Match;

  // Cannot change if already submitted
  if (match.dupr?.submitted) {
    throw new DuprScoringError(
      'Cannot change eligibility after DUPR submission',
      'INVALID_STATE'
    );
  }

  await updateDoc(matchRef, {
    'dupr.eligible': eligible,
    updatedAt: Date.now(),
  });
}

/**
 * Request DUPR submission for a match (organizer action)
 *
 * Calls the Cloud Function to immediately submit to DUPR.
 * The actual API call happens server-side only.
 */
export async function requestDuprSubmission(
  eventType: EventType,
  eventId: string,
  matchId: string,
  _organizerUserId: string
): Promise<{ success: boolean; message: string }> {
  const submitMatches = httpsCallable<
    { eventType: string; eventId: string; matchIds: string[] },
    { success: boolean; batchId?: string; message: string; eligibleCount?: number; ineligibleCount?: number }
  >(functions, 'dupr_submitMatches');

  try {
    const result = await submitMatches({
      eventType,
      eventId,
      matchIds: [matchId],
    });

    if (!result.data.success) {
      throw new DuprScoringError(
        result.data.message || 'Failed to submit match to DUPR',
        'VALIDATION_FAILED'
      );
    }

    return {
      success: true,
      message: result.data.message || 'Match submitted to DUPR',
    };
  } catch (error: any) {
    // If it's already a DuprScoringError, rethrow
    if (error instanceof DuprScoringError) {
      throw error;
    }
    throw new DuprScoringError(
      error.message || 'Failed to submit match to DUPR',
      'VALIDATION_FAILED'
    );
  }
}

/**
 * Bulk submission result - matches Cloud Function response
 */
export interface BulkSubmissionResult {
  batchId: string;
  successCount: number;
  failedCount: number;
  message: string;
}

/**
 * Request bulk DUPR submission for all eligible matches (organizer action)
 *
 * This calls the Cloud Function to submit all eligible matches immediately.
 * The actual API calls happen server-side only.
 *
 * @returns Object with batchId and submission counts
 */
export async function requestBulkDuprSubmission(
  eventType: EventType,
  eventId: string,
  _organizerUserId: string
): Promise<BulkSubmissionResult> {
  const submitMatches = httpsCallable<
    { eventType: string; eventId: string; matchIds?: string[] },
    { success: boolean; batchId?: string; eligibleCount?: number; ineligibleCount?: number; message?: string; error?: string }
  >(functions, 'dupr_submitMatches');

  try {
    // Call Cloud Function without specific matchIds to submit all eligible
    const result = await submitMatches({
      eventType,
      eventId,
    });

    // Cloud Function returns success=true if at least one match succeeded
    // eligibleCount = successful submissions
    // ineligibleCount = failed submissions
    return {
      batchId: result.data.batchId || '',
      successCount: result.data.eligibleCount || 0,
      failedCount: result.data.ineligibleCount || 0,
      message: result.data.message || (result.data.success ? 'Submission complete' : 'Submission failed'),
    };
  } catch (error: any) {
    throw new DuprScoringError(
      error.message || 'Failed to request bulk DUPR submission',
      'VALIDATION_FAILED'
    );
  }
}

/**
 * Retry result - matches Cloud Function response
 */
export interface RetrySubmissionResult {
  retriedCount: number;
  successCount: number;
  failedCount: number;
}

/**
 * Retry failed DUPR submissions (organizer action)
 *
 * This calls the Cloud Function to retry all failed submissions.
 * Returns detailed counts of retry results.
 */
export async function retryFailedDuprSubmissions(
  eventType: EventType,
  eventId: string,
  _organizerUserId: string
): Promise<RetrySubmissionResult> {
  const retryFailed = httpsCallable<
    { eventType: string; eventId: string },
    { success: boolean; retriedCount?: number; successCount?: number; failureCount?: number; error?: string }
  >(functions, 'dupr_retryFailed');

  try {
    const result = await retryFailed({
      eventType,
      eventId,
    });

    if (!result.data.success) {
      throw new DuprScoringError(
        result.data.error || 'Failed to retry failed submissions',
        'VALIDATION_FAILED'
      );
    }

    return {
      retriedCount: result.data.retriedCount || 0,
      successCount: result.data.successCount || 0,
      failedCount: result.data.failureCount || 0,
    };
  } catch (error: any) {
    throw new DuprScoringError(
      error.message || 'Failed to retry failed DUPR submissions',
      'VALIDATION_FAILED'
    );
  }
}

// ============================================
// TEAM SNAPSHOT HELPERS
// ============================================

/**
 * Create team snapshot for a match (called during match creation)
 *
 * This captures the player IDs at match creation for validation.
 */
export function createTeamSnapshot(match: Match): TeamSnapshot {
  return {
    sideAPlayerIds: match.sideA?.playerIds || [],
    sideBPlayerIds: match.sideB?.playerIds || [],
    snapshotAt: Date.now(),
  };
}

/**
 * Add team snapshot to match if missing
 *
 * Used for retroactive population of existing matches.
 */
export async function ensureTeamSnapshot(
  eventType: EventType,
  eventId: string,
  matchId: string
): Promise<void> {
  const matchPath = getMatchDocPath(eventType, eventId, matchId);
  const matchRef = doc(db, matchPath);

  const matchSnap = await getDoc(matchRef);
  if (!matchSnap.exists()) {
    throw new DuprScoringError('Match not found', 'NOT_FOUND');
  }

  const match = { id: matchSnap.id, ...matchSnap.data() } as Match;

  // Skip if already has snapshot
  if (match.teamSnapshot) {
    return;
  }

  const teamSnapshot = createTeamSnapshot(match);

  await updateDoc(matchRef, {
    teamSnapshot,
    updatedAt: Date.now(),
  });
}

// ============================================
// QUERY HELPERS
// ============================================

/**
 * Get match with full data
 */
export async function getMatch(
  eventType: EventType,
  eventId: string,
  matchId: string
): Promise<Match | null> {
  const matchPath = getMatchDocPath(eventType, eventId, matchId);
  const matchRef = doc(db, matchPath);

  const matchSnap = await getDoc(matchRef);
  if (!matchSnap.exists()) {
    return null;
  }

  return { id: matchSnap.id, ...matchSnap.data() } as Match;
}

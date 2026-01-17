/**
 * Score Permissions for DUPR-Compliant Scoring
 *
 * Enforces the permission model:
 * - Players can ONLY propose scores (not finalize)
 * - Signers must be on the opposing team
 * - Organizers can finalize and submit to DUPR
 * - scoreLocked blocks all player writes
 * - V07.52: In DUPR tournaments, organizers have special rules:
 *   - If organizer is NOT in the match: Can enter scores directly as FINAL (official)
 *   - If organizer IS in the match: CANNOT enter scores at all (anti-self-reporting)
 *
 * @version V07.53
 * @file utils/scorePermissions.ts
 */

import type { Match, DuprMode } from '../types';
import {
  getUserSideFromSnapshot,
  isScoreLocked,
  isProposalLocked,
  areUsersOnOpposingTeams,
} from './matchHelpers';

// ============================================
// DUPR CONTEXT FOR PERMISSION CHECKS
// ============================================

/**
 * DUPR context for permission checks
 * Pass this to permission functions when checking DUPR-specific rules
 */
export interface DuprContext {
  /** DUPR mode: 'none', 'optional', or 'required' */
  mode: DuprMode;
  /** Is the user an organizer for this event? */
  isOrganizer: boolean;
}

// ============================================
// PERMISSION CHECK RESULTS
// ============================================

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}

// ============================================
// PLAYER PERMISSIONS
// ============================================

/**
 * Check if user can propose a score for this match
 *
 * @param match - The match to check
 * @param userId - The user attempting to propose
 * @param duprContext - Optional DUPR context for DUPR tournament rules
 *
 * V07.53: In DUPR tournaments (mode !== 'none'):
 * - If organizer IS a participant in this match: BLOCKED (anti-self-reporting)
 * - If organizer is NOT a participant: Use canOrganizerDirectFinalize() instead
 * - Regular players can always propose (if other conditions met)
 */
export function canProposeScore(
  match: Match,
  userId: string,
  duprContext?: DuprContext
): PermissionResult {
  // V07.53: In DUPR tournaments, organizers who are PARTICIPANTS cannot propose scores
  // (anti-self-reporting). Organizers NOT in the match should use finaliseResult directly.
  if (duprContext && duprContext.mode !== 'none' && duprContext.isOrganizer) {
    const userSide = getUserSideFromSnapshot(match, userId);
    if (userSide) {
      // Organizer IS a participant in this match - BLOCKED
      return {
        allowed: false,
        reason: 'In DUPR tournaments, organizers cannot propose scores for matches they are playing in. Only your opponent can propose.',
      };
    }
    // Organizer is NOT a participant - they should use finaliseResult instead
    // This returns false here because they shouldn't call proposeScore
    return {
      allowed: false,
      reason: 'Organizers should finalize scores directly, not propose them.',
    };
  }

  // Check if score is locked (organizer finalized)
  if (isScoreLocked(match)) {
    return {
      allowed: false,
      reason: 'Score has been finalized by organizer',
    };
  }

  // Check if user is a participant
  const userSide = getUserSideFromSnapshot(match, userId);
  if (!userSide) {
    return {
      allowed: false,
      reason: 'Only match participants can propose scores',
    };
  }

  // Check if proposal is already locked (signed/disputed)
  if (isProposalLocked(match)) {
    return {
      allowed: false,
      reason: 'Score proposal has been signed or disputed',
    };
  }

  // Check match status
  if (match.status === 'completed' || match.status === 'cancelled') {
    return {
      allowed: false,
      reason: 'Match is already completed or cancelled',
    };
  }

  return { allowed: true };
}

/**
 * V07.53: Check if an organizer can directly finalize scores for a match
 *
 * In DUPR tournaments, organizers who are NOT participants can enter scores
 * directly as official results (skipping the propose/sign workflow).
 * This is NOT self-reporting because the organizer isn't in the match.
 *
 * @param match - The match to check
 * @param userId - The organizer's user ID
 * @param duprContext - DUPR context with mode and isOrganizer flag
 * @returns PermissionResult with allowed=true if organizer can directly finalize
 */
export function canOrganizerDirectFinalize(
  match: Match,
  userId: string,
  duprContext?: DuprContext
): PermissionResult {
  // Must be a DUPR tournament
  if (!duprContext || duprContext.mode === 'none') {
    return {
      allowed: false,
      reason: 'Direct finalization is only for DUPR tournaments',
    };
  }

  // Must be an organizer
  if (!duprContext.isOrganizer) {
    return {
      allowed: false,
      reason: 'Only organizers can directly finalize scores',
    };
  }

  // Organizer must NOT be a participant (anti-self-reporting)
  const userSide = getUserSideFromSnapshot(match, userId);
  if (userSide) {
    return {
      allowed: false,
      reason: 'In DUPR tournaments, organizers cannot enter scores for matches they are playing in. Only your opponent can propose the score.',
    };
  }

  // Check if score is already locked (already finalized)
  if (isScoreLocked(match)) {
    return {
      allowed: false,
      reason: 'Score has already been finalized',
    };
  }

  // Check match status - don't finalize completed/cancelled matches
  if (match.status === 'completed' || match.status === 'cancelled') {
    return {
      allowed: false,
      reason: 'Match is already completed or cancelled',
    };
  }

  return { allowed: true };
}

/**
 * Check if user can sign (acknowledge) a score proposal
 */
export function canSignProposal(
  match: Match,
  userId: string
): PermissionResult {
  // Check if score is locked
  if (isScoreLocked(match)) {
    return {
      allowed: false,
      reason: 'Score has been finalized by organizer',
    };
  }

  // Must have a proposal to sign
  if (!match.scoreProposal) {
    return {
      allowed: false,
      reason: 'No score proposal to sign',
    };
  }

  // Proposal must be in 'proposed' status
  if (match.scoreProposal.status !== 'proposed') {
    return {
      allowed: false,
      reason: 'Score proposal has already been signed or disputed',
    };
  }

  // Cannot sign own proposal
  if (match.scoreProposal.enteredByUserId === userId) {
    return {
      allowed: false,
      reason: 'Cannot sign your own score proposal',
    };
  }

  // Must be a participant
  const userSide = getUserSideFromSnapshot(match, userId);
  if (!userSide) {
    return {
      allowed: false,
      reason: 'Only match participants can sign proposals',
    };
  }

  // Must be on opposing team
  const proposerSide = getUserSideFromSnapshot(match, match.scoreProposal.enteredByUserId);
  if (userSide === proposerSide) {
    return {
      allowed: false,
      reason: 'Signer must be on the opposing team',
    };
  }

  return { allowed: true };
}

/**
 * Check if user can dispute a score proposal
 */
export function canDisputeProposal(
  match: Match,
  userId: string
): PermissionResult {
  // Check if score is locked
  if (isScoreLocked(match)) {
    return {
      allowed: false,
      reason: 'Score has been finalized by organizer',
    };
  }

  // Must have a proposal to dispute
  if (!match.scoreProposal) {
    return {
      allowed: false,
      reason: 'No score proposal to dispute',
    };
  }

  // Proposal must be in 'proposed' status
  if (match.scoreProposal.status !== 'proposed') {
    return {
      allowed: false,
      reason: 'Score proposal has already been signed or disputed',
    };
  }

  // Cannot dispute own proposal
  if (match.scoreProposal.enteredByUserId === userId) {
    return {
      allowed: false,
      reason: 'Cannot dispute your own score proposal',
    };
  }

  // Must be a participant
  const userSide = getUserSideFromSnapshot(match, userId);
  if (!userSide) {
    return {
      allowed: false,
      reason: 'Only match participants can dispute proposals',
    };
  }

  // Must be on opposing team
  const proposerSide = getUserSideFromSnapshot(match, match.scoreProposal.enteredByUserId);
  if (userSide === proposerSide) {
    return {
      allowed: false,
      reason: 'Disputer must be on the opposing team',
    };
  }

  return { allowed: true };
}

// ============================================
// ORGANIZER PERMISSIONS
// ============================================

/**
 * Check if user can finalize the official result
 * NOTE: Caller must verify user is organizer
 */
export function canFinalizeResult(
  _match: Match,
  isOrganizer: boolean
): PermissionResult {
  if (!isOrganizer) {
    return {
      allowed: false,
      reason: 'Only organizers can finalize official scores',
    };
  }

  // Can always finalize if organizer (even override existing)
  return { allowed: true };
}

/**
 * Check if user can correct an existing official result
 * NOTE: Caller must verify user is organizer
 */
export function canCorrectResult(
  match: Match,
  isOrganizer: boolean
): PermissionResult {
  if (!isOrganizer) {
    return {
      allowed: false,
      reason: 'Only organizers can correct official scores',
    };
  }

  // Must have an official result to correct
  if (!match.officialResult) {
    return {
      allowed: false,
      reason: 'No official result to correct',
    };
  }

  return { allowed: true };
}

/**
 * Check if user can request DUPR submission
 * NOTE: Caller must verify user is organizer
 */
export function canRequestDuprSubmission(
  match: Match,
  isOrganizer: boolean
): PermissionResult {
  if (!isOrganizer) {
    return {
      allowed: false,
      reason: 'Only organizers can submit to DUPR',
    };
  }

  // Must have official result
  if (!match.officialResult) {
    return {
      allowed: false,
      reason: 'Match must have an official result',
    };
  }

  // Must be completed
  if (match.status !== 'completed') {
    return {
      allowed: false,
      reason: 'Match must be completed',
    };
  }

  // Must have official scoreState
  if (match.scoreState !== 'official' && match.scoreState !== 'submittedToDupr') {
    return {
      allowed: false,
      reason: 'Score must be officially finalized',
    };
  }

  // Cannot resubmit if already submitted (unless needs correction)
  if (match.dupr?.submitted && !match.dupr?.needsCorrection) {
    return {
      allowed: false,
      reason: 'Match has already been submitted to DUPR',
    };
  }

  // Check eligibility flag
  if (match.dupr?.eligible === false) {
    return {
      allowed: false,
      reason: 'Match is not eligible for DUPR submission',
    };
  }

  return { allowed: true };
}

/**
 * Check if user can mark a match as DUPR eligible/ineligible
 * NOTE: Caller must verify user is organizer
 */
export function canSetDuprEligibility(
  match: Match,
  isOrganizer: boolean
): PermissionResult {
  if (!isOrganizer) {
    return {
      allowed: false,
      reason: 'Only organizers can set DUPR eligibility',
    };
  }

  // Cannot change if already submitted
  if (match.dupr?.submitted) {
    return {
      allowed: false,
      reason: 'Cannot change eligibility after DUPR submission',
    };
  }

  return { allowed: true };
}

// ============================================
// SIGNER VALIDATION
// ============================================

/**
 * Validate that a signer is on the opposing team from the proposer
 * This is a critical security check for DUPR compliance
 */
export function validateSignerIsOpposingTeam(
  match: Match,
  proposerUserId: string,
  signerUserId: string
): PermissionResult {
  // Cannot sign own proposal
  if (proposerUserId === signerUserId) {
    return {
      allowed: false,
      reason: 'Cannot sign your own score proposal',
    };
  }

  // Check teams using snapshot
  if (!areUsersOnOpposingTeams(match, proposerUserId, signerUserId)) {
    return {
      allowed: false,
      reason: 'Signer must be on the opposing team',
    };
  }

  return { allowed: true };
}

// ============================================
// UI HELPER: Get Available Actions
// ============================================

export interface AvailableScoreActions {
  canPropose: boolean;
  canSign: boolean;
  canDispute: boolean;
  canFinalize: boolean;
  canCorrect: boolean;
  canSubmitToDupr: boolean;
  /** V07.53: Organizer can directly finalize (not in match, DUPR tournament) */
  canOrganizerDirectFinalize: boolean;
  /** V07.53: Organizer is blocked from entering because they're in the match */
  isOrganizerBlockedAsParticipant: boolean;
  proposeLabel: string;
  signLabel: string;
  disputeLabel: string;
  statusLabel: string;
}

/**
 * Get available score actions for a user
 * Used by UI to show/hide buttons
 *
 * @param match - The match to check
 * @param userId - The user to check permissions for
 * @param isOrganizer - Is the user an organizer?
 * @param duprMode - Optional DUPR mode ('none', 'optional', 'required')
 */
export function getAvailableScoreActions(
  match: Match,
  userId: string,
  isOrganizer: boolean,
  duprMode?: DuprMode
): AvailableScoreActions {
  // Build DUPR context for permission checks
  const duprContext: DuprContext | undefined = duprMode
    ? { mode: duprMode, isOrganizer }
    : undefined;

  // V07.53: Check if organizer can directly finalize
  const directFinalizeResult = canOrganizerDirectFinalize(match, userId, duprContext);

  // V07.53: Check if organizer is blocked because they're a participant
  const isOrganizerBlockedAsParticipant =
    duprContext &&
    duprContext.mode !== 'none' &&
    duprContext.isOrganizer &&
    !!getUserSideFromSnapshot(match, userId);

  return {
    canPropose: canProposeScore(match, userId, duprContext).allowed,
    canSign: canSignProposal(match, userId).allowed,
    canDispute: canDisputeProposal(match, userId).allowed,
    canFinalize: canFinalizeResult(match, isOrganizer).allowed,
    canCorrect: canCorrectResult(match, isOrganizer).allowed,
    canSubmitToDupr: canRequestDuprSubmission(match, isOrganizer).allowed,
    canOrganizerDirectFinalize: directFinalizeResult.allowed,
    isOrganizerBlockedAsParticipant: !!isOrganizerBlockedAsParticipant,

    // DUPR-compliant labels
    proposeLabel: 'Propose Score',
    signLabel: 'Sign to Acknowledge',
    disputeLabel: 'Dispute Score',
    statusLabel: getStatusLabel(match),
  };
}

/**
 * Get the current status label for display
 */
function getStatusLabel(match: Match): string {
  // Check score state first
  switch (match.scoreState) {
    case 'proposed':
      return 'Score proposed - awaiting acknowledgement';
    case 'signed':
      return 'Awaiting organiser approval';
    case 'disputed':
      return 'Score disputed - awaiting organiser';
    case 'official':
      return 'Official result';
    case 'submittedToDupr':
      return 'Submitted to DUPR';
  }

  // Fall back to match status
  switch (match.status) {
    case 'scheduled':
      return 'Scheduled';
    case 'in_progress':
      return 'In progress';
    case 'pending_confirmation':
      return 'Awaiting confirmation';
    case 'completed':
      return match.officialResult ? 'Official result' : 'Completed';
    case 'disputed':
      return 'Disputed';
    case 'cancelled':
      return 'Cancelled';
    case 'forfeit':
      return 'Forfeit';
    case 'bye':
      return 'Bye';
    default:
      return 'Unknown';
  }
}

/**
 * Score Permissions for DUPR-Compliant Scoring
 *
 * Enforces the permission model:
 * - Players can ONLY propose scores (not finalize)
 * - Signers must be on the opposing team
 * - Organizers can finalize and submit to DUPR
 * - scoreLocked blocks all player writes
 *
 * @version V07.04
 * @file utils/scorePermissions.ts
 */

import type { Match } from '../types';
import {
  getUserSideFromSnapshot,
  isScoreLocked,
  isProposalLocked,
  areUsersOnOpposingTeams,
} from './matchHelpers';

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
 */
export function canProposeScore(
  match: Match,
  userId: string
): PermissionResult {
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
  proposeLabel: string;
  signLabel: string;
  disputeLabel: string;
  statusLabel: string;
}

/**
 * Get available score actions for a user
 * Used by UI to show/hide buttons
 */
export function getAvailableScoreActions(
  match: Match,
  userId: string,
  isOrganizer: boolean
): AvailableScoreActions {
  return {
    canPropose: canProposeScore(match, userId).allowed,
    canSign: canSignProposal(match, userId).allowed,
    canDispute: canDisputeProposal(match, userId).allowed,
    canFinalize: canFinalizeResult(match, isOrganizer).allowed,
    canCorrect: canCorrectResult(match, isOrganizer).allowed,
    canSubmitToDupr: canRequestDuprSubmission(match, isOrganizer).allowed,

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

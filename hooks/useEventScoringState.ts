/**
 * useEventScoringState Hook
 *
 * Extracts ALL permission checks and state derivation for unified scoring modal.
 * This is the single source of truth for what actions a user can take on a match.
 *
 * Used by EventScoreEntryModal to determine:
 * - User role (participant, organizer, both)
 * - Score state (none, proposed, signed, official, etc.)
 * - Available actions (propose, sign, dispute, finalize, edit)
 * - UI elements to show (header title, status messages)
 *
 * @see docs/SCORING_ARCHITECTURE.md for full documentation
 * @version V07.53
 * @file hooks/useEventScoringState.ts
 */

import { useMemo } from 'react';
import type { ScorableMatch } from '../types/game/scorableMatch';
import type { ScoreState } from '../types';

// ============================================
// TYPES
// ============================================

export interface EventScoringUser {
  uid: string;
}

export interface EventScoringStateResult {
  // ==========================================
  // Role Information
  // ==========================================

  /** User is a player in this match */
  isParticipant: boolean;

  /** User is on Side A */
  isInSideA: boolean;

  /** User is on Side B */
  isInSideB: boolean;

  /** User is an organizer who can finalize (respects DUPR rules) */
  effectiveIsOrganizer: boolean;

  /** User is both organizer AND participant in DUPR event (blocked from proposing) */
  isOrganizerParticipant: boolean;

  // ==========================================
  // Score State Information
  // ==========================================

  /** Match has score data (proposal or official) */
  hasScore: boolean;

  /** Current verification status for badge display */
  verificationStatus: 'pending' | 'confirmed' | 'disputed' | 'final' | undefined;

  /** Score is pending opponent acknowledgement */
  isPending: boolean;

  /** Score is signed, awaiting organizer */
  isSigned: boolean;

  /** Score is finalized/official */
  isFinal: boolean;

  /** Score is disputed */
  isDisputed: boolean;

  /** Match has been submitted to DUPR (immutable) */
  isSubmittedToDupr: boolean;

  /** Score state from match document */
  scoreState: ScoreState | undefined;

  // ==========================================
  // Proposer Information
  // ==========================================

  /** User ID of the person who proposed the score */
  proposerId: string | undefined;

  /** User's team proposed the score (user or their partner) */
  userTeamProposed: boolean;

  /** User personally proposed the score */
  userProposed: boolean;

  // ==========================================
  // Permissions
  // ==========================================

  /** User can submit/propose a score */
  canSubmitScore: boolean;

  /** User can confirm/sign the proposed score */
  userCanConfirm: boolean;

  /** User can dispute the score */
  userCanDispute: boolean;

  /** User can finalize the score (organizer action) */
  canFinalize: boolean;

  /** User can edit a finalized score (organizer, not submitted to DUPR) */
  canEdit: boolean;

  // ==========================================
  // UI Display Information
  // ==========================================

  /** Modal header title */
  headerTitle: string;

  /** Status message to show in footer */
  statusMessage: string | null;

  /** Status message type for styling */
  statusMessageType: 'warning' | 'info' | 'success' | 'error' | null;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Map scoreState to verification status for badge display
 */
function mapScoreStateToStatus(
  scoreState: ScoreState | undefined,
  matchStatus?: string,
  legacyVerificationStatus?: string
): 'pending' | 'confirmed' | 'disputed' | 'final' | undefined {
  // New flow: use scoreState
  if (scoreState === 'proposed') return 'pending';
  if (scoreState === 'signed') return 'confirmed';
  if (scoreState === 'disputed') return 'disputed';
  if (scoreState === 'official' || scoreState === 'submittedToDupr') return 'final';

  // Legacy fallback
  if (legacyVerificationStatus) {
    return legacyVerificationStatus as any;
  }

  // Status-based fallback
  if (matchStatus === 'pending_confirmation') return 'pending';
  if (matchStatus === 'completed') return 'final';
  if (matchStatus === 'disputed') return 'disputed';

  return undefined;
}

/**
 * Get header title based on state
 */
function getHeaderTitle(
  hasScore: boolean,
  isSigned: boolean,
  userCanConfirm: boolean,
  isFinal: boolean,
  isEditMode: boolean,
  effectiveIsOrganizer: boolean
): string {
  if (isEditMode) return 'Edit Score';
  if (isSigned) return 'Awaiting Organiser';
  if (hasScore && userCanConfirm) return 'Sign to Acknowledge';
  if (hasScore && !isFinal) return 'Score Proposed';
  if (hasScore) return 'Match Score';
  if (effectiveIsOrganizer) return 'Finalise Score';
  return 'Propose Score';
}

/**
 * Get status message for footer
 */
function getStatusMessage(
  hasScore: boolean,
  scoreState: ScoreState | undefined,
  userCanConfirm: boolean,
  userProposed: boolean,
  isSigned: boolean,
  isDisputed: boolean,
  isFinal: boolean,
  isSubmittedToDupr: boolean,
  isOrganizerParticipant: boolean,
  isParticipant: boolean,
  isOrganizer: boolean
): { message: string | null; type: 'warning' | 'info' | 'success' | 'error' | null } {
  // DUPR compliance warning for organizer-participant
  if (isOrganizerParticipant && !hasScore) {
    return {
      message: 'DUPR Compliance: As an organizer playing in this match, you cannot propose the score. Your opponent must propose the score first, then you can confirm it.',
      type: 'warning',
    };
  }

  // Non-participant can't propose
  if (!isParticipant && !isOrganizer && !hasScore) {
    return {
      message: 'Only players in this match can propose a score. Please ask one of the participants to enter the result.',
      type: 'error',
    };
  }

  // DUPR submitted - scores immutable
  if (isFinal && isSubmittedToDupr) {
    return {
      message: 'Score submitted to DUPR and cannot be edited.',
      type: 'info',
    };
  }

  // Disputed
  if (isDisputed) {
    return {
      message: 'This match is disputed and awaiting organizer review.',
      type: 'error',
    };
  }

  // Signed - awaiting organizer
  if (isSigned) {
    return {
      message: 'Score acknowledged. Awaiting organiser approval.',
      type: 'success',
    };
  }

  // Waiting for opponent
  if (hasScore && scoreState === 'proposed' && !userCanConfirm && userProposed) {
    return {
      message: 'Waiting for opponent to sign and acknowledge...',
      type: 'warning',
    };
  }

  // Prompt to sign
  if (userCanConfirm) {
    return {
      message: 'Your opponent proposed this score. Please sign to acknowledge or dispute.',
      type: 'warning',
    };
  }

  return { message: null, type: null };
}

// ============================================
// MAIN HOOK
// ============================================

/**
 * Compute all scoring state and permissions for a match
 *
 * @param match - ScorableMatch (use toScorableMatch adapter)
 * @param currentUser - Current user object (or null)
 * @param isOrganizer - Whether user is an organizer for this event
 * @param isDuprEvent - Whether this is a DUPR-enabled event
 * @param isEditMode - Whether organizer is in edit mode (optional)
 *
 * @example
 * const state = useEventScoringState(
 *   scorableMatch,
 *   currentUser,
 *   isOrganizer,
 *   tournament.duprMode !== 'none'
 * );
 *
 * // Use state for UI rendering
 * <h2>{state.headerTitle}</h2>
 * <button disabled={!state.canSubmitScore}>Submit</button>
 * <button onClick={handleConfirm} disabled={!state.userCanConfirm}>Confirm</button>
 */
export function useEventScoringState(
  match: ScorableMatch,
  currentUser: EventScoringUser | null,
  isOrganizer: boolean,
  isDuprEvent: boolean,
  isEditMode: boolean = false
): EventScoringStateResult {
  return useMemo(() => {
    const userId = currentUser?.uid;

    // ==========================================
    // Role Checks
    // ==========================================

    const isInSideA = userId ? match.sideA.playerIds.includes(userId) : false;
    const isInSideB = userId ? match.sideB.playerIds.includes(userId) : false;
    const isParticipant = isInSideA || isInSideB;

    // DUPR compliance: organizer-as-participant restrictions
    // For DUPR events: organizer can't finalize their own match
    // For non-DUPR events: organizer can always finalize
    const effectiveIsOrganizer = isDuprEvent
      ? (isOrganizer && !isParticipant)
      : isOrganizer;
    const isOrganizerParticipant = isDuprEvent && isOrganizer && isParticipant;

    // ==========================================
    // Score State
    // ==========================================

    const hasScore =
      (match.scores?.length ?? 0) > 0 ||
      (match.scoreProposal?.scores?.length ?? 0) > 0 ||
      match.status === 'completed' ||
      match.status === 'pending_confirmation';

    const scoreState = match.scoreState;
    const verificationStatus = mapScoreStateToStatus(
      scoreState,
      match.status as string,
      match.verification?.verificationStatus
    );

    const isPending = verificationStatus === 'pending' || verificationStatus === 'confirmed';
    const isSigned = scoreState === 'signed';
    const isFinal = verificationStatus === 'final';
    const isDisputed = verificationStatus === 'disputed' || scoreState === 'disputed';

    const isSubmittedToDupr = Boolean(
      match.duprSubmitted ||
      scoreState === 'submittedToDupr'
    );

    // ==========================================
    // Proposer Information
    // ==========================================

    const proposerId = match.scoreProposal?.enteredByUserId;

    // Check if proposer is in Side A
    const proposerInSideA = Boolean(
      proposerId && match.sideA.playerIds.includes(proposerId)
    );

    // Check if proposer is in Side B
    const proposerInSideB = Boolean(
      proposerId && match.sideB.playerIds.includes(proposerId)
    );

    // User's team proposed (user or their teammate)
    const userTeamProposed = (isInSideA && proposerInSideA) || (isInSideB && proposerInSideB);
    const userProposed = proposerId === userId;

    // ==========================================
    // Permissions
    // ==========================================

    // Legacy confirmation tracking
    const legacyConfirmations = match.verification?.confirmations || [];

    // Can submit/propose score
    // - Must be participant (or organizer)
    // - DUPR: organizer-as-participant CANNOT propose
    const canSubmitScore = (isParticipant && !isOrganizerParticipant) || effectiveIsOrganizer;

    // Can confirm/sign
    // - Must be participant
    // - Must have score to confirm
    // - Must be in 'proposed' state
    // - User's team must NOT have proposed (opponent must have)
    // - User hasn't already confirmed (legacy check)
    const userCanConfirm =
      isParticipant &&
      hasScore &&
      (scoreState === 'proposed' || isPending) &&
      !isSigned &&
      !userTeamProposed &&
      !legacyConfirmations.includes(userId || '');

    // Can dispute
    const userCanDispute =
      isParticipant &&
      hasScore &&
      !isFinal &&
      !isDisputed;

    // Can finalize (organizer action)
    const canFinalize =
      effectiveIsOrganizer &&
      hasScore &&
      isSigned &&
      !isFinal;

    // Can edit (organizer correction)
    // - Must be effective organizer
    // - Must be finalized
    // - NOT submitted to DUPR (immutable after)
    const canEdit =
      isFinal &&
      effectiveIsOrganizer &&
      !isSubmittedToDupr;

    // ==========================================
    // UI Display
    // ==========================================

    const headerTitle = getHeaderTitle(
      hasScore,
      isSigned,
      userCanConfirm,
      isFinal,
      isEditMode,
      effectiveIsOrganizer
    );

    const { message: statusMessage, type: statusMessageType } = getStatusMessage(
      hasScore,
      scoreState,
      userCanConfirm,
      userProposed,
      isSigned,
      isDisputed,
      isFinal,
      isSubmittedToDupr,
      isOrganizerParticipant,
      isParticipant,
      isOrganizer
    );

    return {
      // Role
      isParticipant,
      isInSideA,
      isInSideB,
      effectiveIsOrganizer,
      isOrganizerParticipant,

      // State
      hasScore,
      verificationStatus,
      isPending,
      isSigned,
      isFinal,
      isDisputed,
      isSubmittedToDupr,
      scoreState,

      // Proposer
      proposerId,
      userTeamProposed,
      userProposed,

      // Permissions
      canSubmitScore,
      userCanConfirm,
      userCanDispute,
      canFinalize,
      canEdit,

      // UI
      headerTitle,
      statusMessage,
      statusMessageType,
    };
  }, [match, currentUser, isOrganizer, isDuprEvent, isEditMode]);
}

export default useEventScoringState;

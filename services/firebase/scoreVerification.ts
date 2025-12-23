/**
 * Score Verification Service V05.44
 *
 * UNIVERSAL verification service that works across ALL event types:
 * - Leagues (box league, ladder, swiss, round robin)
 * - Tournaments (brackets, pools, playoffs)
 * - Meetups (casual play, round robins)
 *
 * KEY FEATURES:
 * - Calculate required confirmations based on method + player count
 * - Confirm match scores (works for ANY format)
 * - Dispute match scores (works for ANY format)
 * - Resolve disputes (organizer only)
 * - Auto-finalize after timeout
 *
 * FILE LOCATION: services/firebase/scoreVerification.ts
 * VERSION: V05.44
 */

import {
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
} from '@firebase/firestore';
import { db } from './config';
import type {
  ScoreVerificationMethod,
  ScoreVerificationSettings,
  MatchVerificationData,
  MatchVerificationStatus,
  DisputeReason,
  LeagueFormat,
} from '../../types';

// ============================================
// TYPES
// ============================================

/**
 * Supported event types for verification
 */
export type VerifiableEventType = 'league' | 'box_league' | 'tournament' | 'meetup';

/**
 * Result of a verification operation
 */
export interface VerificationResult {
  success: boolean;
  newStatus: MatchVerificationStatus;
  confirmationCount: number;
  requiredConfirmations: number;
  message?: string;
  error?: string;
}

/**
 * Result of a dispute operation
 */
export interface DisputeResult {
  success: boolean;
  matchId: string;
  status: MatchVerificationStatus;
  message?: string;
  error?: string;
}

/**
 * Result of a resolution operation
 */
export interface ResolveResult {
  success: boolean;
  matchId: string;
  action: 'finalize' | 'edit' | 'void';
  message?: string;
  error?: string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Calculate required confirmations based on method and player count
 *
 * @param method - The verification method (auto_confirm, one_opponent, majority, organizer_only)
 * @param playerCount - Number of players (2 for singles, 4 for doubles)
 * @returns Number of confirmations required
 */
export function getRequiredConfirmations(
  method: ScoreVerificationMethod,
  playerCount: number
): number {
  switch (method) {
    case 'auto_confirm':
      return 0; // No confirmation needed
    case 'one_opponent':
      return 1; // One player from opposing side
    case 'majority':
      return Math.ceil(playerCount / 2); // 1 for singles, 2 for doubles
    case 'organizer_only':
      return 1; // Organizer counts as 1
    default:
      return 1; // Default to one_opponent behavior
  }
}

/**
 * Get the collection path for matches based on event type
 */
function getMatchCollectionPath(
  eventType: VerifiableEventType,
  eventId: string,
  matchId: string
): string {
  switch (eventType) {
    case 'league':
      return `leagues/${eventId}/matches/${matchId}`;
    case 'box_league':
      return `leagues/${eventId}/boxMatches/${matchId}`;
    case 'tournament':
      return `tournaments/${eventId}/matches/${matchId}`;
    case 'meetup':
      return `meetups/${eventId}/matches/${matchId}`;
    default:
      return `leagues/${eventId}/matches/${matchId}`;
  }
}

/**
 * Create initial verification data for a new match
 */
export function createInitialVerificationData(
  settings: ScoreVerificationSettings,
  playerCount: number
): MatchVerificationData {
  const requiredConfirmations = getRequiredConfirmations(
    settings.verificationMethod,
    playerCount
  );

  // If auto_confirm, start as final immediately
  const status: MatchVerificationStatus =
    settings.verificationMethod === 'auto_confirm' ? 'final' : 'pending';

  return {
    verificationStatus: status,
    confirmations: [],
    requiredConfirmations,
  };
}

/**
 * Check if a user can confirm the match
 * (must be a player in the match but NOT the one who entered the score)
 */
export function canUserConfirm(
  userId: string,
  enteredByUserId: string | null | undefined,
  matchPlayerIds: string[]
): boolean {
  // User must be a player in the match
  if (!matchPlayerIds.includes(userId)) {
    return false;
  }
  // User cannot confirm their own score entry
  if (enteredByUserId && userId === enteredByUserId) {
    return false;
  }
  return true;
}

// ============================================
// CORE VERIFICATION FUNCTIONS
// ============================================

/**
 * Confirm a match score - works for ANY event type
 *
 * @param eventType - Type of event (league, box_league, tournament, meetup)
 * @param eventId - ID of the event (league ID, tournament ID, etc.)
 * @param matchId - ID of the match
 * @param userId - ID of user confirming
 * @param settings - Score verification settings for this event
 * @returns VerificationResult with status
 */
export async function confirmMatchScore(
  eventType: VerifiableEventType,
  eventId: string,
  matchId: string,
  userId: string,
  settings: ScoreVerificationSettings
): Promise<VerificationResult> {
  try {
    const matchPath = getMatchCollectionPath(eventType, eventId, matchId);
    const matchRef = doc(db, matchPath);
    const matchSnap = await getDoc(matchRef);

    if (!matchSnap.exists()) {
      return {
        success: false,
        newStatus: 'pending',
        confirmationCount: 0,
        requiredConfirmations: 0,
        error: 'Match not found',
      };
    }

    const matchData = matchSnap.data();
    const verification = matchData.verification as MatchVerificationData | undefined;

    // Check current status
    if (verification?.verificationStatus === 'final') {
      return {
        success: false,
        newStatus: 'final',
        confirmationCount: verification.confirmations.length,
        requiredConfirmations: verification.requiredConfirmations,
        message: 'Match is already finalized',
      };
    }

    if (verification?.verificationStatus === 'disputed') {
      return {
        success: false,
        newStatus: 'disputed',
        confirmationCount: verification.confirmations.length,
        requiredConfirmations: verification.requiredConfirmations,
        message: 'Match is disputed - cannot confirm',
      };
    }

    // Check if user already confirmed
    if (verification?.confirmations.includes(userId)) {
      return {
        success: false,
        newStatus: verification.verificationStatus,
        confirmationCount: verification.confirmations.length,
        requiredConfirmations: verification.requiredConfirmations,
        message: 'You have already confirmed this score',
      };
    }

    // Add confirmation
    const currentConfirmations = verification?.confirmations || [];
    const newConfirmations = [...currentConfirmations, userId];
    const requiredConfirmations = verification?.requiredConfirmations ||
      getRequiredConfirmations(settings.verificationMethod, 2);

    // Determine new status
    let newStatus: MatchVerificationStatus = 'pending';
    if (newConfirmations.length >= requiredConfirmations) {
      newStatus = 'final';
    } else if (newConfirmations.length > 0) {
      newStatus = 'confirmed';
    }

    // Update match
    const updateData: Partial<MatchVerificationData> & { updatedAt: number } = {
      updatedAt: Date.now(),
    };

    await updateDoc(matchRef, {
      'verification.confirmations': arrayUnion(userId),
      'verification.verificationStatus': newStatus,
      ...(newStatus === 'final' ? {
        'verification.finalizedAt': Date.now(),
        'verification.finalizedByUserId': userId,
      } : {}),
      updatedAt: Date.now(),
    });

    return {
      success: true,
      newStatus,
      confirmationCount: newConfirmations.length,
      requiredConfirmations,
      message: newStatus === 'final'
        ? 'Score finalized!'
        : `Confirmation recorded (${newConfirmations.length}/${requiredConfirmations})`,
    };
  } catch (error) {
    console.error('Error confirming match score:', error);
    return {
      success: false,
      newStatus: 'pending',
      confirmationCount: 0,
      requiredConfirmations: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Dispute a match score - works for ANY event type
 *
 * @param eventType - Type of event
 * @param eventId - ID of the event
 * @param matchId - ID of the match
 * @param userId - ID of user disputing
 * @param reason - Reason for dispute
 * @param notes - Optional notes
 * @returns DisputeResult with status
 */
export async function disputeMatchScore(
  eventType: VerifiableEventType,
  eventId: string,
  matchId: string,
  userId: string,
  reason: DisputeReason,
  notes?: string
): Promise<DisputeResult> {
  try {
    const matchPath = getMatchCollectionPath(eventType, eventId, matchId);
    const matchRef = doc(db, matchPath);
    const matchSnap = await getDoc(matchRef);

    if (!matchSnap.exists()) {
      return {
        success: false,
        matchId,
        status: 'pending',
        error: 'Match not found',
      };
    }

    const matchData = matchSnap.data();
    const verification = matchData.verification as MatchVerificationData | undefined;

    // Cannot dispute a finalized match
    if (verification?.verificationStatus === 'final') {
      return {
        success: false,
        matchId,
        status: 'final',
        message: 'Cannot dispute a finalized match',
      };
    }

    // Already disputed
    if (verification?.verificationStatus === 'disputed') {
      return {
        success: false,
        matchId,
        status: 'disputed',
        message: 'Match is already disputed',
      };
    }

    // Update match to disputed status
    await updateDoc(matchRef, {
      'verification.verificationStatus': 'disputed',
      'verification.disputedAt': Date.now(),
      'verification.disputedByUserId': userId,
      'verification.disputeReason': reason,
      'verification.disputeNotes': notes || null,
      updatedAt: Date.now(),
    });

    return {
      success: true,
      matchId,
      status: 'disputed',
      message: 'Dispute submitted - organizer will review',
    };
  } catch (error) {
    console.error('Error disputing match score:', error);
    return {
      success: false,
      matchId,
      status: 'pending',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Resolve a dispute (organizer only) - works for ANY event type
 *
 * @param eventType - Type of event
 * @param eventId - ID of the event
 * @param matchId - ID of the match
 * @param organizerId - ID of organizer resolving
 * @param action - Resolution action (finalize, edit, void)
 * @param newScores - New scores if action is 'edit'
 * @returns ResolveResult with status
 */
export async function resolveDispute(
  eventType: VerifiableEventType,
  eventId: string,
  matchId: string,
  organizerId: string,
  action: 'finalize' | 'edit' | 'void',
  newScores?: { team1Score: number; team2Score: number }
): Promise<ResolveResult> {
  try {
    const matchPath = getMatchCollectionPath(eventType, eventId, matchId);
    const matchRef = doc(db, matchPath);
    const matchSnap = await getDoc(matchRef);

    if (!matchSnap.exists()) {
      return {
        success: false,
        matchId,
        action,
        error: 'Match not found',
      };
    }

    const now = Date.now();

    if (action === 'finalize') {
      // Finalize the match as-is (accept current score)
      await updateDoc(matchRef, {
        'verification.verificationStatus': 'final',
        'verification.finalizedAt': now,
        'verification.finalizedByUserId': organizerId,
        status: 'completed',
        updatedAt: now,
      });

      return {
        success: true,
        matchId,
        action,
        message: 'Match finalized by organizer',
      };
    }

    if (action === 'edit' && newScores) {
      // Update scores and finalize
      const winningTeam = newScores.team1Score > newScores.team2Score ? 1 : 2;

      await updateDoc(matchRef, {
        team1Score: newScores.team1Score,
        team2Score: newScores.team2Score,
        winningTeam,
        'verification.verificationStatus': 'final',
        'verification.finalizedAt': now,
        'verification.finalizedByUserId': organizerId,
        status: 'completed',
        updatedAt: now,
      });

      return {
        success: true,
        matchId,
        action,
        message: 'Score updated and finalized by organizer',
      };
    }

    if (action === 'void') {
      // Void the match - reset to scheduled
      await updateDoc(matchRef, {
        team1Score: null,
        team2Score: null,
        winningTeam: null,
        'verification.verificationStatus': 'pending',
        'verification.confirmations': [],
        'verification.disputedAt': null,
        'verification.disputedByUserId': null,
        'verification.disputeReason': null,
        'verification.disputeNotes': null,
        status: 'scheduled',
        playedAt: null,
        completedAt: null,
        updatedAt: now,
      });

      return {
        success: true,
        matchId,
        action,
        message: 'Match voided - can be replayed',
      };
    }

    return {
      success: false,
      matchId,
      action,
      error: 'Invalid action or missing scores',
    };
  } catch (error) {
    console.error('Error resolving dispute:', error);
    return {
      success: false,
      matchId,
      action,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check if a match should be auto-finalized (based on time elapsed)
 *
 * @param matchEnteredAt - When the score was entered
 * @param autoFinalizeHours - Hours after which to auto-finalize (0 = disabled)
 * @returns true if match should be auto-finalized
 */
export function shouldAutoFinalize(
  matchEnteredAt: number | null | undefined,
  autoFinalizeHours: number
): boolean {
  if (!matchEnteredAt || autoFinalizeHours <= 0) {
    return false;
  }

  const hoursElapsed = (Date.now() - matchEnteredAt) / (1000 * 60 * 60);
  return hoursElapsed >= autoFinalizeHours;
}

/**
 * Auto-finalize a match (called by scheduled job or on page load)
 *
 * @param eventType - Type of event
 * @param eventId - ID of the event
 * @param matchId - ID of the match
 * @returns VerificationResult with status
 */
export async function autoFinalizeMatch(
  eventType: VerifiableEventType,
  eventId: string,
  matchId: string
): Promise<VerificationResult> {
  try {
    const matchPath = getMatchCollectionPath(eventType, eventId, matchId);
    const matchRef = doc(db, matchPath);
    const matchSnap = await getDoc(matchRef);

    if (!matchSnap.exists()) {
      return {
        success: false,
        newStatus: 'pending',
        confirmationCount: 0,
        requiredConfirmations: 0,
        error: 'Match not found',
      };
    }

    const matchData = matchSnap.data();
    const verification = matchData.verification as MatchVerificationData | undefined;

    // Only auto-finalize pending or confirmed matches
    if (verification?.verificationStatus !== 'pending' &&
        verification?.verificationStatus !== 'confirmed') {
      return {
        success: false,
        newStatus: verification?.verificationStatus || 'pending',
        confirmationCount: verification?.confirmations.length || 0,
        requiredConfirmations: verification?.requiredConfirmations || 0,
        message: 'Match cannot be auto-finalized in current status',
      };
    }

    // Finalize
    await updateDoc(matchRef, {
      'verification.verificationStatus': 'final',
      'verification.finalizedAt': Date.now(),
      'verification.autoFinalized': true,
      status: 'completed',
      updatedAt: Date.now(),
    });

    return {
      success: true,
      newStatus: 'final',
      confirmationCount: verification?.confirmations.length || 0,
      requiredConfirmations: verification?.requiredConfirmations || 0,
      message: 'Match auto-finalized',
    };
  } catch (error) {
    console.error('Error auto-finalizing match:', error);
    return {
      success: false,
      newStatus: 'pending',
      confirmationCount: 0,
      requiredConfirmations: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================
// UTILITY EXPORTS
// ============================================

export const DEFAULT_VERIFICATION_SETTINGS: ScoreVerificationSettings = {
  entryMode: 'any_player',
  verificationMethod: 'one_opponent',
  autoFinalizeHours: 24,
  allowDisputes: true,
};

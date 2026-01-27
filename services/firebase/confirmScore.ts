/**
 * confirmScore - Canonical score confirmation wrapper
 *
 * This is THE ONLY function UI should call for confirming/signing scores.
 * Routes to correct implementation based on CURRENT DB STATE (not UI state).
 *
 * CRITICAL DESIGN DECISION:
 * - This function fetches the match doc to decide routing
 * - DO NOT accept a match object from UI - it could be stale
 * - All routing decisions are based on fresh Firestore data
 *
 * Routing Logic:
 * - New flow (scoreProposal + scoreState='proposed'): Call signScore()
 * - Legacy flow (no scoreProposal, uses verification): Call confirmMatchScore()
 *
 * @deprecated confirmMatchScore() - DO NOT call directly from UI
 * @deprecated signScore() - DO NOT call directly from UI (use this wrapper)
 *
 * @see docs/SCORING_ARCHITECTURE.md for full documentation
 * @version V07.53
 * @file services/firebase/confirmScore.ts
 */

import { doc, getDoc } from '@firebase/firestore';
import { db } from './config';
import { signScore } from './duprScoring';
import { confirmMatchScore as legacyConfirmMatchScore } from './scoreVerification';
import type { ScoreVerificationSettings } from '../../types';

// ============================================
// TYPES
// ============================================

export type ConfirmScoreEventType = 'tournament' | 'league' | 'meetup';

export interface ConfirmScoreResult {
  success: boolean;
  flow: 'new' | 'legacy';
  message?: string;
  error?: string;
}

// ============================================
// PATH HELPERS
// ============================================

function getMatchDocPath(
  eventType: ConfirmScoreEventType,
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
      throw new Error(`Unknown event type: ${eventType}`);
  }
}

// ============================================
// MAIN WRAPPER
// ============================================

/**
 * Confirm/sign a score - THE canonical entry point for UI
 *
 * This function:
 * 1. Fetches fresh match state from Firestore (NOT UI state)
 * 2. Determines which scoring flow to use based on match data
 * 3. Routes to the correct implementation
 *
 * @param eventType - 'tournament', 'league', or 'meetup'
 * @param eventId - The parent event ID
 * @param matchId - The match ID to confirm
 * @param userId - The user confirming/signing
 * @param verificationSettings - Optional legacy settings (only used for legacy flow)
 *
 * @throws Error if match not found or confirmation fails
 *
 * @example
 * // In UI component - NO match object passed, function fetches fresh state
 * await confirmScore('tournament', tournamentId, matchId, currentUser.uid);
 */
export async function confirmScore(
  eventType: ConfirmScoreEventType,
  eventId: string,
  matchId: string,
  userId: string,
  verificationSettings?: ScoreVerificationSettings
): Promise<ConfirmScoreResult> {
  // ALWAYS fetch fresh match state from Firestore
  // Never trust UI state for routing decisions
  const matchPath = getMatchDocPath(eventType, eventId, matchId);
  const matchRef = doc(db, matchPath);
  const matchSnap = await getDoc(matchRef);

  if (!matchSnap.exists()) {
    throw new Error('Match not found');
  }

  const match = matchSnap.data();

  // ==========================================
  // ROUTING LOGIC
  // ==========================================

  // New flow: match has scoreProposal with proposed state
  // This is the DUPR-compliant flow
  if (match.scoreProposal && match.scoreState === 'proposed') {
    console.log('[confirmScore] Using new DUPR-compliant flow (signScore)');

    try {
      await signScore(eventType, eventId, matchId, userId);
      return {
        success: true,
        flow: 'new',
        message: 'Score signed successfully',
      };
    } catch (error: any) {
      return {
        success: false,
        flow: 'new',
        error: error.message || 'Failed to sign score',
      };
    }
  }

  // Legacy flow: check for verification system (pre-V07.04)
  // Only for old matches that haven't migrated to scoreProposal
  if (match.verification || (!match.scoreProposal && match.status === 'pending_confirmation')) {
    console.warn(
      `[confirmScore] Using legacy verification flow for match ${matchId}. ` +
      `Consider migrating to new scoreProposal flow.`
    );

    // Legacy flow requires verification settings
    const settings = verificationSettings || getDefaultVerificationSettings();

    try {
      // Map eventType to legacy format (which supports 'box_league')
      const legacyEventType = eventType as 'tournament' | 'league' | 'meetup';

      const result = await legacyConfirmMatchScore(
        legacyEventType,
        eventId,
        matchId,
        userId,
        settings
      );

      return {
        success: result.success,
        flow: 'legacy',
        message: result.message,
        error: result.error,
      };
    } catch (error: any) {
      return {
        success: false,
        flow: 'legacy',
        error: error.message || 'Failed to confirm score (legacy)',
      };
    }
  }

  // No valid state to confirm
  const errorMessage =
    `No pending score to confirm. ` +
    `scoreState=${match.scoreState || 'undefined'}, ` +
    `hasProposal=${!!match.scoreProposal}, ` +
    `status=${match.status}`;

  console.error('[confirmScore]', errorMessage);

  throw new Error(errorMessage);
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get default verification settings for legacy flow
 * Used when caller doesn't provide settings
 */
function getDefaultVerificationSettings(): ScoreVerificationSettings {
  return {
    entryMode: 'any_player',
    verificationMethod: 'one_opponent',
    autoFinalizeHours: 48,
    allowDisputes: true,
  };
}

/**
 * Check if a match uses the new scoring flow
 * Can be used by UI to determine which UI to show
 *
 * @param eventType - Event type
 * @param eventId - Event ID
 * @param matchId - Match ID
 * @returns true if match uses new scoreProposal flow
 */
export async function usesNewScoringFlow(
  eventType: ConfirmScoreEventType,
  eventId: string,
  matchId: string
): Promise<boolean> {
  const matchPath = getMatchDocPath(eventType, eventId, matchId);
  const matchRef = doc(db, matchPath);
  const matchSnap = await getDoc(matchRef);

  if (!matchSnap.exists()) {
    return false;
  }

  const match = matchSnap.data();

  // New flow if has scoreProposal or scoreState
  return !!(match.scoreProposal || match.scoreState);
}

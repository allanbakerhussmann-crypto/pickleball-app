/**
 * DUPR Match Status Service
 *
 * Helper functions for categorizing matches in the DUPR Organiser Control Panel.
 * Provides match categorization, eligibility checks, and statistics.
 *
 * @version V07.26
 * @file services/firebase/duprMatchStatus.ts
 */

import type { Match } from '../../types';
import type {
  DuprMatchCategory,
  DuprPanelStats,
  CategorizedMatches,
  DuprMatchRowData,
  DuprEligibilityResult,
  EligibilityToggleState,
} from '../../types/duprPanel';
import { getScoreStateLabel } from '../../utils/matchHelpers';

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if a match has valid participants (not TBD or empty)
 * Matches with "TBD" or missing player names should not be DUPR eligible
 */
export function hasValidParticipants(match: Match): boolean {
  // Get participant names from various formats
  const leagueMatch = match as any;

  const sideAName = match.sideA?.name || leagueMatch.memberAName || leagueMatch.userAName || '';
  const sideBName = match.sideB?.name || leagueMatch.memberBName || leagueMatch.userBName || '';

  // Check if either side is TBD or empty
  const invalidNames = ['tbd', 'tba', 'bye', ''];
  const sideALower = sideAName.toLowerCase().trim();
  const sideBLower = sideBName.toLowerCase().trim();

  if (invalidNames.includes(sideALower) || invalidNames.includes(sideBLower)) {
    return false;
  }

  // Check for "TBD" anywhere in the name (e.g., "TBD vs TBD")
  if (sideALower.includes('tbd') || sideBLower.includes('tbd')) {
    return false;
  }

  return true;
}

/**
 * V07.26: Check if all players in a match have DUPR IDs linked
 * For doubles matches, all 4 players must have DUPR IDs
 * For singles matches, both players must have DUPR IDs
 *
 * IMPORTANT: If duprIds arrays are completely empty, we assume the data wasn't
 * stored at match creation time and skip the check (let backend validate).
 * We only block if duprIds are PARTIALLY filled (some have, some don't).
 */
export function allPlayersHaveDuprIds(match: Match): { valid: boolean; missingCount: number; playerCount: number; noDataStored: boolean } {
  const sideADuprIds = match.sideA?.duprIds || [];
  const sideBDuprIds = match.sideB?.duprIds || [];
  const sideAPlayerIds = match.sideA?.playerIds || [];
  const sideBPlayerIds = match.sideB?.playerIds || [];

  // Determine expected player count
  const expectedSideACount = sideAPlayerIds.length || 1; // Default to 1 for singles
  const expectedSideBCount = sideBPlayerIds.length || 1;
  const playerCount = expectedSideACount + expectedSideBCount;

  // Count valid (non-empty) DUPR IDs
  const validSideADuprIds = sideADuprIds.filter(id => id && id.trim() !== '').length;
  const validSideBDuprIds = sideBDuprIds.filter(id => id && id.trim() !== '').length;
  const totalValidDuprIds = validSideADuprIds + validSideBDuprIds;

  // If NO duprIds were stored at all, we can't validate - skip check
  // This happens when matches were created before DUPR data was available
  const noDataStored = totalValidDuprIds === 0;

  const missingCount = playerCount - totalValidDuprIds;

  return {
    valid: noDataStored || missingCount === 0, // Valid if no data OR all present
    missingCount: noDataStored ? 0 : missingCount,
    playerCount,
    noDataStored,
  };
}

/**
 * V07.26: Get names of players missing DUPR IDs from a match
 *
 * Note: The match factory uses .filter(Boolean) on duprIds, so if a player doesn't have
 * a DUPR ID, the duprIds array is shorter (not padded with empty strings).
 * We compare array lengths and use playerNames to identify who is missing.
 *
 * Returns empty array if no duprIds were stored (can't determine who's missing).
 */
export function getPlayersMissingDuprIds(match: Match): string[] {
  const sideADuprIds = match.sideA?.duprIds || [];
  const sideBDuprIds = match.sideB?.duprIds || [];
  const sideAPlayerIds = match.sideA?.playerIds || [];
  const sideBPlayerIds = match.sideB?.playerIds || [];

  // Count valid DUPR IDs
  const validSideADuprIds = sideADuprIds.filter(id => id && id.trim() !== '').length;
  const validSideBDuprIds = sideBDuprIds.filter(id => id && id.trim() !== '').length;
  const totalValidDuprIds = validSideADuprIds + validSideBDuprIds;

  // If NO duprIds were stored at all, we can't determine who's missing
  if (totalValidDuprIds === 0) {
    return [];
  }

  const missing: string[] = [];
  const sideAPlayerNames = (match.sideA as any)?.playerNames || match.sideA?.name?.split(' & ') || [];
  const sideBPlayerNames = (match.sideB as any)?.playerNames || match.sideB?.name?.split(' & ') || [];

  // Check side A - if we have fewer valid DUPR IDs than players, some are missing
  const missingSideA = sideAPlayerIds.length - validSideADuprIds;
  if (missingSideA > 0) {
    sideAPlayerNames.forEach((name: string, idx: number) => {
      if (idx >= validSideADuprIds) {
        missing.push(name || `Player ${sideAPlayerIds[idx]?.slice(0, 6)}`);
      }
    });
  }

  // Check side B
  const missingSideB = sideBPlayerIds.length - validSideBDuprIds;
  if (missingSideB > 0) {
    sideBPlayerNames.forEach((name: string, idx: number) => {
      if (idx >= validSideBDuprIds) {
        missing.push(name || `Player ${sideBPlayerIds[idx]?.slice(0, 6)}`);
      }
    });
  }

  return missing;
}

// ============================================
// MATCH CATEGORIZATION
// ============================================

/**
 * Categorize a single match for DUPR panel display
 */
export function categorizeMatch(match: Match): DuprMatchCategory {
  // Check if already submitted to DUPR
  if (match.dupr?.submitted || match.scoreState === 'submittedToDupr') {
    return 'submitted';
  }

  // Check if submission failed
  if (match.dupr?.submissionError) {
    return 'failed';
  }

  // Check if needs correction (submitted but officialResult changed)
  if (match.dupr?.needsCorrection) {
    return 'blocked';
  }

  // Check for TBD/placeholder matches - these should be blocked
  if (!hasValidParticipants(match)) {
    return 'blocked';
  }

  // V07.26: Check for missing DUPR IDs - only block if we have partial data
  const duprIdCheck = allPlayersHaveDuprIds(match);
  if (!duprIdCheck.valid && !duprIdCheck.noDataStored) {
    return 'blocked';
  }

  // Check if has official result and is ready for DUPR
  if (match.officialResult) {
    // Check if eligible and ready
    if (
      match.status === 'completed' &&
      match.scoreState === 'official' &&
      match.scoreLocked &&
      match.dupr?.eligible !== false
    ) {
      return 'ready_for_dupr';
    }
    // Has official but not eligible or not locked
    return 'blocked';
  }

  // Check score proposal states
  if (match.scoreProposal) {
    const proposalStatus = match.scoreProposal.status;

    // Signed or disputed - needs organizer review
    if (proposalStatus === 'signed' || proposalStatus === 'disputed') {
      return 'needs_review';
    }

    // Just proposed, waiting for opponent
    if (proposalStatus === 'proposed') {
      return 'proposed';
    }
  }

  // Check legacy scoreState
  switch (match.scoreState) {
    case 'signed':
    case 'disputed':
      return 'needs_review';
    case 'proposed':
      return 'proposed';
    case 'official':
      // Has official state but no officialResult object - blocked
      return 'blocked';
    default:
      return 'none';
  }
}

/**
 * Get all matches grouped by category
 */
export function getMatchesByCategory(matches: Match[]): CategorizedMatches {
  const result: CategorizedMatches = {
    none: [],
    proposed: [],
    needsReview: [],
    readyForDupr: [],
    submitted: [],
    failed: [],
    blocked: [],
  };

  for (const match of matches) {
    const category = categorizeMatch(match);
    result[category === 'needs_review' ? 'needsReview' : category === 'ready_for_dupr' ? 'readyForDupr' : category].push(match);
  }

  return result;
}

/**
 * Get statistics for DUPR panel summary cards
 */
export function getDuprPanelStats(matches: Match[]): DuprPanelStats {
  const categorized = getMatchesByCategory(matches);

  return {
    total: matches.length,
    none: categorized.none.length,
    proposed: categorized.proposed.length,
    needsReview: categorized.needsReview.length,
    readyForDupr: categorized.readyForDupr.length,
    submitted: categorized.submitted.length,
    failed: categorized.failed.length,
    blocked: categorized.blocked.length,
  };
}

// ============================================
// ELIGIBILITY CHECKS
// ============================================

/**
 * Check if a match can be submitted to DUPR
 *
 * Requirements:
 * - Has valid participants (not TBD/BYE)
 * - All players have DUPR IDs linked (V07.26)
 * - Has officialResult
 * - status === 'completed'
 * - scoreState === 'official'
 * - scoreLocked === true
 * - dupr.eligible !== false
 * - dupr.submitted !== true
 * - dupr.needsCorrection !== true
 */
export function canSubmitToDupr(match: Match): DuprEligibilityResult {
  // Must have valid participants (not TBD)
  if (!hasValidParticipants(match)) {
    return { eligible: false, reason: 'Match has TBD or missing participants' };
  }

  // V07.26: All players must have DUPR IDs linked (only check if we have stored data)
  const duprIdCheck = allPlayersHaveDuprIds(match);
  if (!duprIdCheck.valid && !duprIdCheck.noDataStored) {
    const missingNames = getPlayersMissingDuprIds(match);
    const namesList = missingNames.length > 0 ? `: ${missingNames.join(', ')}` : '';
    return { eligible: false, reason: `${duprIdCheck.missingCount} player(s) missing DUPR ID${namesList}` };
  }

  // Must have official result
  if (!match.officialResult) {
    return { eligible: false, reason: 'No official result' };
  }

  // Must be completed
  if (match.status !== 'completed') {
    return { eligible: false, reason: 'Match not completed' };
  }

  // Must be officially finalized
  if (match.scoreState !== 'official') {
    return { eligible: false, reason: 'Score not officially finalized' };
  }

  // Must be locked
  if (!match.scoreLocked) {
    return { eligible: false, reason: 'Score not locked' };
  }

  // Must be marked eligible
  if (match.dupr?.eligible === false) {
    return { eligible: false, reason: 'Not marked as DUPR eligible' };
  }

  // Must not already be submitted
  if (match.dupr?.submitted) {
    return { eligible: false, reason: 'Already submitted to DUPR' };
  }

  // Must not need correction
  if (match.dupr?.needsCorrection) {
    return { eligible: false, reason: 'Awaiting correction workflow' };
  }

  return { eligible: true };
}

/**
 * Get eligibility toggle state for UI
 */
export function getEligibilityToggleState(match: Match): EligibilityToggleState {
  // Cannot toggle if not official yet
  if (!match.officialResult || match.scoreState !== 'official') {
    return {
      canToggle: false,
      isEnabled: false,
      isLocked: false,
      tooltip: 'Finalise official result first',
    };
  }

  // Cannot toggle if already submitted
  if (match.dupr?.submitted) {
    return {
      canToggle: false,
      isEnabled: true,
      isLocked: true,
      tooltip: 'Already submitted to DUPR',
    };
  }

  // Cannot toggle if needs correction
  if (match.dupr?.needsCorrection) {
    return {
      canToggle: false,
      isEnabled: match.dupr?.eligible ?? true,
      isLocked: true,
      tooltip: 'Awaiting correction workflow',
    };
  }

  // Can toggle
  return {
    canToggle: true,
    isEnabled: match.dupr?.eligible ?? true,
    isLocked: false,
    tooltip: match.dupr?.eligible === false
      ? 'Click to mark as DUPR eligible'
      : 'Click to exclude from DUPR',
  };
}

// ============================================
// MATCH ROW DATA
// ============================================

/**
 * Get block reason for a match
 */
export function getBlockReason(match: Match): string | null {
  // Check for TBD/placeholder participants first
  if (!hasValidParticipants(match)) {
    return 'Match has TBD or missing participants';
  }

  // V07.26: Check for missing DUPR IDs (only if we have stored data)
  const duprIdCheck = allPlayersHaveDuprIds(match);
  if (!duprIdCheck.valid && !duprIdCheck.noDataStored) {
    const missingNames = getPlayersMissingDuprIds(match);
    if (missingNames.length > 0) {
      return `Missing DUPR: ${missingNames.join(', ')}`;
    }
    return `${duprIdCheck.missingCount} player(s) missing DUPR ID`;
  }

  if (match.dupr?.needsCorrection) {
    return 'Official result changed after DUPR submission';
  }

  if (match.scoreState === 'disputed' && !match.officialResult) {
    return 'Score disputed - awaiting organizer resolution';
  }

  if (match.status === 'completed' && !match.officialResult) {
    return 'Missing official result';
  }

  if (match.officialResult && !match.scoreLocked) {
    return 'Score not locked';
  }

  return null;
}

/**
 * Build row data for DUPR match table
 */
export function buildMatchRowData(match: Match): DuprMatchRowData {
  const category = categorizeMatch(match);
  const eligibility = canSubmitToDupr(match);
  const toggleState = getEligibilityToggleState(match);
  const blockReason = getBlockReason(match);

  // Determine action availability
  const canReview = category === 'needs_review' || category === 'proposed' || category === 'blocked';
  const canFinalise = !match.officialResult && (
    match.scoreProposal?.status === 'signed' ||
    match.scoreProposal?.status === 'disputed' ||
    match.scoreState === 'signed' ||
    match.scoreState === 'disputed'
  );
  const canSubmit = eligibility.eligible;
  const canToggleEligibility = toggleState.canToggle;

  // Build display summaries
  let proposalSummary: string | undefined;
  if (match.scoreProposal) {
    const proposalScores = match.scoreProposal.scores;
    proposalSummary = proposalScores
      .map(g => `${g.scoreA}-${g.scoreB}`)
      .join(', ');
  }

  let officialSummary: string | undefined;
  if (match.officialResult) {
    const officialScores = match.officialResult.scores;
    officialSummary = officialScores
      .map(g => `${g.scoreA}-${g.scoreB}`)
      .join(', ');
  }

  // DUPR status label
  let duprStatusLabel = 'Not submitted';
  if (match.dupr?.submitted) {
    duprStatusLabel = 'Submitted';
  } else if (match.dupr?.submissionError) {
    duprStatusLabel = 'Failed';
  } else if (match.dupr?.batchId && !match.dupr?.submitted) {
    // Has batchId but not yet submitted = queued for processing
    duprStatusLabel = 'Queued';
  } else if (eligibility.eligible) {
    duprStatusLabel = 'Ready';
  } else if (match.dupr?.eligible === false) {
    duprStatusLabel = 'Not eligible';
  }

  return {
    match,
    category,
    canReview,
    canFinalise,
    canSubmit,
    canToggleEligibility,
    blockReason: blockReason || undefined,
    eligibilityLockReason: !toggleState.canToggle ? toggleState.tooltip : undefined,
    scoreStateLabel: getScoreStateLabel(match),
    duprStatusLabel,
    proposalSummary,
    officialSummary,
  };
}

/**
 * Build row data for all matches
 */
export function buildAllMatchRowData(matches: Match[]): DuprMatchRowData[] {
  return matches.map(buildMatchRowData);
}

// ============================================
// FILTERING
// ============================================

/**
 * Filter matches by category for display
 */
export function filterMatchesByCategory(
  matches: DuprMatchRowData[],
  filter: 'all' | 'needs_review' | 'ready_for_dupr' | 'submitted' | 'failed' | 'blocked'
): DuprMatchRowData[] {
  if (filter === 'all') {
    return matches;
  }

  const categoryMap: Record<string, DuprMatchCategory[]> = {
    needs_review: ['needs_review', 'proposed'],
    ready_for_dupr: ['ready_for_dupr'],
    submitted: ['submitted'],
    failed: ['failed'],
    blocked: ['blocked'],
  };

  const targetCategories = categoryMap[filter] || [];
  return matches.filter(row => targetCategories.includes(row.category));
}

// ============================================
// SORTING
// ============================================

/**
 * Sort matches for DUPR panel display
 * Priority: needs_review > proposed > ready > blocked > failed > submitted > none
 */
export function sortMatchesForDuprPanel(matches: DuprMatchRowData[]): DuprMatchRowData[] {
  const priorityOrder: Record<DuprMatchCategory, number> = {
    needs_review: 0,
    proposed: 1,
    ready_for_dupr: 2,
    blocked: 3,
    failed: 4,
    submitted: 5,
    none: 6,
  };

  return [...matches].sort((a, b) => {
    // First by category priority
    const priorityDiff = priorityOrder[a.category] - priorityOrder[b.category];
    if (priorityDiff !== 0) return priorityDiff;

    // Then by round number
    const roundA = a.match.roundNumber || 0;
    const roundB = b.match.roundNumber || 0;
    if (roundA !== roundB) return roundA - roundB;

    // Then by match number
    const matchNumA = a.match.matchNumber || 0;
    const matchNumB = b.match.matchNumber || 0;
    return matchNumA - matchNumB;
  });
}

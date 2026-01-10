/**
 * Box League Absence Service
 *
 * Handles absence declaration and substitute (ghost player) management.
 *
 * Two separate concepts:
 * 1. Substitute = Ghost Player - fills spot so games can happen
 *    - In DUPR leagues: sub MUST have DUPR ID → matches submitted with sub's DUPR ID
 *    - Absent player's standings determined by absence policy (not sub's results)
 *    - Next week: sub leaves, absent player returns to position per policy
 *
 * 2. Absentee Policy - what happens to absent player's standings:
 *    - freeze: No change, stay in position
 *    - ghost_score: 0 wins, 0 points (ranks last)
 *    - average_points: Use season average stats
 *    - auto_relegate: Always drop one box
 *
 * DUPR Submission Rules:
 * - If substitute has DUPR ID linked → match IS submitted using sub's DUPR ID
 * - Absent player's DUPR ID is NOT used (they didn't play)
 * - If substitute lacks DUPR ID → match NOT submitted (in DUPR-required leagues)
 *
 * FILE LOCATION: services/rotatingDoublesBox/boxLeagueAbsence.ts
 * VERSION: V07.28
 */

import { doc, updateDoc, getDoc, getDocs, collection } from '@firebase/firestore';
import { db } from '../firebase/config';
import type {
  BoxLeagueWeek,
  WeekAbsence,
  BoxLeagueMember,
  AbsencePolicyType,
} from '../../types/rotatingDoublesBox';
import { getWeek } from './boxLeagueWeek';

// ============================================
// ABSENCE DECLARATION
// ============================================

/**
 * Declare absence for a player (pre-declared, before week starts)
 *
 * Player can only declare absence before week is activated.
 * Organizers can declare on behalf of players.
 */
export async function declareAbsence(
  leagueId: string,
  weekNumber: number,
  playerId: string,
  declaredByUserId: string,
  options: {
    reason?: 'travel' | 'injury' | 'personal' | 'other';
    reasonText?: string;
    playerName?: string;
    absencePolicy: AbsencePolicyType;
  }
): Promise<void> {
  const week = await getWeek(leagueId, weekNumber);

  if (!week) {
    throw new Error(`Week ${weekNumber} not found`);
  }

  // Can only declare absence before activation
  if (week.state !== 'draft') {
    throw new Error(
      'Absence can only be declared before the week is activated. Contact the organizer.'
    );
  }

  // Find player's box
  let playerBoxNumber = 0;
  for (const box of week.boxAssignments) {
    if (box.playerIds.includes(playerId)) {
      playerBoxNumber = box.boxNumber;
      break;
    }
  }

  if (playerBoxNumber === 0) {
    throw new Error('Player is not assigned to this week');
  }

  // Check for existing absence
  const existingAbsence = (week.absences || []).find(
    (a) => a.playerId === playerId
  );

  if (existingAbsence) {
    throw new Error('Absence already declared for this player');
  }

  // Add absence
  const now = Date.now();
  const newAbsence: WeekAbsence = {
    playerId,
    playerName: options.playerName,
    boxNumber: playerBoxNumber,
    reason: options.reason,
    reasonText: options.reasonText,
    declaredAt: now,
    declaredByUserId,
    policyApplied: options.absencePolicy,
    isNoShow: false, // Pre-declared, not a no-show
  };

  const updatedAbsences = [...(week.absences || []), newAbsence];

  await updateDoc(getWeekDoc(leagueId, weekNumber), {
    absences: updatedAbsences,
  });
}

/**
 * Mark a player as no-show (night-of absence, not pre-declared)
 *
 * Only organizers can mark no-shows. This is different from pre-declared absences.
 */
export async function recordNoShowAbsence(
  leagueId: string,
  weekNumber: number,
  playerId: string,
  markedByUserId: string,
  options: {
    playerName?: string;
    absencePolicy: AbsencePolicyType;
  }
): Promise<void> {
  const week = await getWeek(leagueId, weekNumber);

  if (!week) {
    throw new Error(`Week ${weekNumber} not found`);
  }

  // Can mark no-show during active state
  if (week.state !== 'active' && week.state !== 'draft') {
    throw new Error('Cannot mark no-show after week is closing or finalized');
  }

  // Find player's box
  let playerBoxNumber = 0;
  for (const box of week.boxAssignments) {
    if (box.playerIds.includes(playerId)) {
      playerBoxNumber = box.boxNumber;
      break;
    }
  }

  if (playerBoxNumber === 0) {
    throw new Error('Player is not assigned to this week');
  }

  // Check for existing absence
  const existingAbsence = (week.absences || []).find(
    (a) => a.playerId === playerId
  );

  if (existingAbsence) {
    throw new Error('Absence already recorded for this player');
  }

  // Add no-show absence
  const now = Date.now();
  const newAbsence: WeekAbsence = {
    playerId,
    playerName: options.playerName,
    boxNumber: playerBoxNumber,
    declaredAt: now,
    declaredByUserId: markedByUserId,
    policyApplied: options.absencePolicy,
    isNoShow: true, // This is a no-show
  };

  const updatedAbsences = [...(week.absences || []), newAbsence];

  await updateDoc(getWeekDoc(leagueId, weekNumber), {
    absences: updatedAbsences,
  });
}

/**
 * Cancel an absence declaration
 */
export async function cancelAbsence(
  leagueId: string,
  weekNumber: number,
  playerId: string
): Promise<void> {
  const week = await getWeek(leagueId, weekNumber);

  if (!week) {
    throw new Error(`Week ${weekNumber} not found`);
  }

  // Can only cancel before activation
  if (week.state !== 'draft') {
    throw new Error('Cannot cancel absence after week is activated');
  }

  const updatedAbsences = (week.absences || []).filter(
    (a) => a.playerId !== playerId
  );

  await updateDoc(getWeekDoc(leagueId, weekNumber), {
    absences: updatedAbsences,
  });
}

// ============================================
// SUBSTITUTE ASSIGNMENT
// ============================================

/**
 * Assign a substitute for an absent player
 */
export async function assignSubstitute(
  leagueId: string,
  weekNumber: number,
  absentPlayerId: string,
  substitutePlayerId: string,
  _assignedByUserId: string
): Promise<void> {
  const week = await getWeek(leagueId, weekNumber);

  if (!week) {
    throw new Error(`Week ${weekNumber} not found`);
  }

  // Can assign sub during draft or early in active
  if (week.state === 'finalized' || week.state === 'closing') {
    throw new Error('Cannot assign substitute after week is closing');
  }

  // Find the absence
  const absences = week.absences || [];
  const absenceIndex = absences.findIndex((a) => a.playerId === absentPlayerId);

  if (absenceIndex === -1) {
    throw new Error('No absence declared for this player');
  }

  // Update absence with substitute
  const updatedAbsences = [...absences];
  updatedAbsences[absenceIndex] = {
    ...updatedAbsences[absenceIndex],
    substituteId: substitutePlayerId,
  };

  await updateDoc(getWeekDoc(leagueId, weekNumber), {
    absences: updatedAbsences,
  });

  // Update member's sub usage count
  await incrementSubUsage(leagueId, absentPlayerId);
}

/**
 * Remove a substitute assignment
 */
export async function removeSubstitute(
  leagueId: string,
  weekNumber: number,
  absentPlayerId: string
): Promise<void> {
  const week = await getWeek(leagueId, weekNumber);

  if (!week) {
    throw new Error(`Week ${weekNumber} not found`);
  }

  // Can only remove during draft
  if (week.state !== 'draft') {
    throw new Error('Cannot remove substitute after week is activated');
  }

  const absences = week.absences || [];
  const absenceIndex = absences.findIndex((a) => a.playerId === absentPlayerId);

  if (absenceIndex === -1) {
    return;
  }

  const updatedAbsences = [...absences];
  delete updatedAbsences[absenceIndex].substituteId;

  await updateDoc(getWeekDoc(leagueId, weekNumber), {
    absences: updatedAbsences,
  });
}

// ============================================
// SUBSTITUTE VALIDATION
// ============================================

/**
 * Check if a player can be a substitute
 */
export async function canBeSubstitute(
  leagueId: string,
  substitutePlayerId: string,
  absentPlayerBoxNumber: number,
  settings: {
    subMustBeMember: boolean;
    subAllowedFromBoxes: 'same_only' | 'same_or_lower' | 'any';
    subMaxRatingGap?: number;
    subMustHaveDuprLinked: boolean;
    subMustHaveDuprConsent: boolean;
  },
  week: BoxLeagueWeek
): Promise<{ eligible: boolean; reason?: string }> {
  // Check if sub is already playing this week
  const isPlaying = week.boxAssignments.some((b) =>
    b.playerIds.includes(substitutePlayerId)
  );

  if (isPlaying) {
    return { eligible: false, reason: 'Player is already assigned this week' };
  }

  // Check if member requirement
  if (settings.subMustBeMember) {
    const member = await getMember(leagueId, substitutePlayerId);
    if (!member || member.status !== 'active') {
      return { eligible: false, reason: 'Substitute must be a league member' };
    }
  }

  // Check box restriction
  if (settings.subAllowedFromBoxes !== 'any') {
    const subBox = await getPlayerBox(leagueId, substitutePlayerId, week);

    if (subBox) {
      if (
        settings.subAllowedFromBoxes === 'same_only' &&
        subBox !== absentPlayerBoxNumber
      ) {
        return {
          eligible: false,
          reason: 'Substitute must be from the same box',
        };
      }

      if (
        settings.subAllowedFromBoxes === 'same_or_lower' &&
        subBox < absentPlayerBoxNumber
      ) {
        return {
          eligible: false,
          reason: 'Substitute cannot be from a higher box',
        };
      }
    }
  }

  // Check DUPR requirements
  if (settings.subMustHaveDuprLinked) {
    const member = await getMember(leagueId, substitutePlayerId);
    if (!member?.duprId) {
      return { eligible: false, reason: 'Substitute must have DUPR ID linked' };
    }
  }

  if (settings.subMustHaveDuprConsent) {
    const member = await getMember(leagueId, substitutePlayerId);
    if (!member?.duprConsent) {
      return {
        eligible: false,
        reason: 'Substitute must have given DUPR consent',
      };
    }
  }

  return { eligible: true };
}

/**
 * Get list of eligible substitutes for an absent player
 */
export async function getEligibleSubstitutes(
  leagueId: string,
  absentPlayerId: string,
  week: BoxLeagueWeek,
  settings: {
    subMustBeMember: boolean;
    subAllowedFromBoxes: 'same_only' | 'same_or_lower' | 'any';
    subMaxRatingGap?: number;
    subMustHaveDuprLinked: boolean;
    subMustHaveDuprConsent: boolean;
  }
): Promise<string[]> {
  // Find absent player's box
  const absentPlayerBox = await getPlayerBox(leagueId, absentPlayerId, week);

  if (!absentPlayerBox) {
    return [];
  }

  // Get all league members
  const members = await getAllMembers(leagueId);
  const eligible: string[] = [];

  for (const member of members) {
    if (member.odUserId === absentPlayerId) {
      continue; // Skip the absent player
    }

    const result = await canBeSubstitute(
      leagueId,
      member.odUserId,
      absentPlayerBox,
      settings,
      week
    );

    if (result.eligible) {
      eligible.push(member.odUserId);
    }
  }

  return eligible;
}

// ============================================
// ABSENCE POLICY HELPERS
// ============================================

/**
 * Check if player has exceeded max subs for season
 */
export async function hasExceededMaxSubs(
  leagueId: string,
  playerId: string,
  maxSubs: 1 | 2 | 3 | 'unlimited'
): Promise<boolean> {
  if (maxSubs === 'unlimited') {
    return false;
  }

  const member = await getMember(leagueId, playerId);
  return (member?.subsUsedThisSeason || 0) >= maxSubs;
}

/**
 * Get absence summary for a player
 */
export async function getPlayerAbsenceSummary(
  leagueId: string,
  playerId: string
): Promise<{
  subsUsed: number;
  maxSubs: number | 'unlimited';
  canUseSub: boolean;
}> {
  const member = await getMember(leagueId, playerId);
  const subsUsed = member?.subsUsedThisSeason || 0;

  // TODO: Get max subs from league settings
  // Default to 2 - will be replaced when we fetch league settings
  const maxSubsSetting = 2 as number | 'unlimited';

  return {
    subsUsed,
    maxSubs: maxSubsSetting,
    canUseSub: maxSubsSetting === 'unlimited' || subsUsed < maxSubsSetting,
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getWeekDoc(leagueId: string, weekNumber: number) {
  return doc(db, 'leagues', leagueId, 'boxWeeks', weekNumber.toString());
}

async function getMember(
  leagueId: string,
  playerId: string
): Promise<BoxLeagueMember | null> {
  const memberDoc = await getDoc(
    doc(db, 'leagues', leagueId, 'members', playerId)
  );

  if (!memberDoc.exists()) {
    return null;
  }

  return memberDoc.data() as BoxLeagueMember;
}

async function getAllMembers(leagueId: string): Promise<BoxLeagueMember[]> {
  const snapshot = await getDocs(collection(db, 'leagues', leagueId, 'members'));
  return snapshot.docs.map((d) => d.data() as BoxLeagueMember);
}

async function getPlayerBox(
  _leagueId: string,
  playerId: string,
  week: BoxLeagueWeek
): Promise<number | null> {
  for (const box of week.boxAssignments) {
    if (box.playerIds.includes(playerId)) {
      return box.boxNumber;
    }
  }
  return null;
}

async function incrementSubUsage(
  leagueId: string,
  playerId: string
): Promise<void> {
  const member = await getMember(leagueId, playerId);
  if (!member) return;

  await updateDoc(doc(db, 'leagues', leagueId, 'members', playerId), {
    subsUsedThisSeason: (member.subsUsedThisSeason || 0) + 1,
  });
}

// ============================================
// DISPLAY HELPERS
// ============================================

/**
 * Get absences for display
 */
export function getAbsencesForDisplay(week: BoxLeagueWeek): {
  playerId: string;
  reason?: string;
  hasSubstitute: boolean;
  substituteId?: string;
}[] {
  return (week.absences || []).map((a) => ({
    playerId: a.playerId,
    reason: a.reason,
    hasSubstitute: !!a.substituteId,
    substituteId: a.substituteId,
  }));
}

/**
 * Format absence for display
 */
export function formatAbsence(
  absence: WeekAbsence,
  playerName: string,
  substituteName?: string
): string {
  let display = `${playerName}: ${absence.isNoShow ? 'No-show' : 'Absent'}`;

  if (absence.reason) {
    display += ` (${absence.reason})`;
  }

  if (absence.substituteId && substituteName) {
    display += ` → Ghost: ${substituteName}`;
  } else {
    display += ' (No substitute)';
  }

  display += ` [Policy: ${formatPolicyName(absence.policyApplied)}]`;

  return display;
}

/**
 * Format policy name for display
 */
export function formatPolicyName(policy: AbsencePolicyType): string {
  switch (policy) {
    case 'freeze':
      return 'Freeze Position';
    case 'ghost_score':
      return 'Ghost Score (0 wins)';
    case 'average_points':
      return 'Average Points';
    case 'auto_relegate':
      return 'Auto-Relegate';
    default:
      return policy;
  }
}

// ============================================
// ABSENTEE POLICY APPLICATION
// ============================================

/**
 * Calculated standing for an absent player based on policy
 */
export interface AbsentPlayerStanding {
  /** Player ID */
  playerId: string;

  /** Matches played (may be 0) */
  matchesPlayed: number;

  /** Wins (may be 0 or calculated average) */
  wins: number;

  /** Points for (may be 0 or calculated average) */
  pointsFor: number;

  /** Points against (may be 0 or calculated average) */
  pointsAgainst: number;

  /** Movement override (if auto_relegate or freeze) */
  movementOverride?: 'stayed' | 'frozen' | 'relegation';

  /** Policy applied */
  policyApplied: AbsencePolicyType;
}

/**
 * Apply absence policy to calculate standing for absent player
 *
 * @param policy - The absentee policy to apply
 * @param seasonAverage - Player's average stats from prior weeks (for 'average_points' policy)
 * @param expectedMatches - Expected matches per player this week
 */
export function applyAbsencePolicy(
  policy: AbsencePolicyType,
  playerId: string,
  seasonAverage?: {
    avgWins: number;
    avgPointsFor: number;
    avgPointsAgainst: number;
  },
  expectedMatches: number = 4
): AbsentPlayerStanding {
  switch (policy) {
    case 'freeze':
      // Freeze position - no stats change, movement frozen
      return {
        playerId,
        matchesPlayed: 0,
        wins: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        movementOverride: 'frozen',
        policyApplied: 'freeze',
      };

    case 'ghost_score':
      // Ghost score - 0 wins, 0 points (ranks last)
      return {
        playerId,
        matchesPlayed: 0,
        wins: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        movementOverride: undefined, // Normal movement rules apply (likely relegate)
        policyApplied: 'ghost_score',
      };

    case 'average_points':
      // Average points - use season average stats
      if (!seasonAverage) {
        // No prior data, fall back to ghost score
        return {
          playerId,
          matchesPlayed: 0,
          wins: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          movementOverride: undefined,
          policyApplied: 'average_points',
        };
      }

      return {
        playerId,
        matchesPlayed: expectedMatches,
        wins: Math.round(seasonAverage.avgWins * expectedMatches),
        pointsFor: Math.round(seasonAverage.avgPointsFor * expectedMatches),
        pointsAgainst: Math.round(seasonAverage.avgPointsAgainst * expectedMatches),
        movementOverride: undefined, // Normal movement rules apply
        policyApplied: 'average_points',
      };

    case 'auto_relegate':
      // Auto-relegate - no stats, always relegate
      return {
        playerId,
        matchesPlayed: 0,
        wins: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        movementOverride: 'relegation',
        policyApplied: 'auto_relegate',
      };

    default:
      // Unknown policy, treat as freeze
      return {
        playerId,
        matchesPlayed: 0,
        wins: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        movementOverride: 'frozen',
        policyApplied: policy,
      };
  }
}

/**
 * Check if a match can be submitted to DUPR based on absence/substitute status
 *
 * DUPR Submission Rules:
 * - If substitute has DUPR ID → match CAN be submitted using sub's DUPR ID
 * - If substitute lacks DUPR ID → match CANNOT be submitted (in DUPR leagues)
 * - Absent player's DUPR ID is NOT used (they didn't play)
 *
 * @param matchPlayerIds - Original player IDs in the match (includes absent player's ID)
 * @param absences - Week absences with substitute info
 * @param memberDuprIds - Map of playerId → duprId for all relevant players
 * @param isDuprLeague - Whether the league requires DUPR submission
 */
export function canSubmitMatchToDupr(
  matchPlayerIds: string[],
  absences: WeekAbsence[],
  memberDuprIds?: Map<string, string | undefined>,
  isDuprLeague: boolean = false
): { canSubmit: boolean; reason?: string; substituteMappings?: Array<{ absentId: string; substituteId: string }> } {
  const substituteMappings: Array<{ absentId: string; substituteId: string }> = [];

  // Check each player in the match
  for (const playerId of matchPlayerIds) {
    const absence = absences.find((a) => a.playerId === playerId);

    if (absence) {
      // This player is absent
      if (!absence.substituteId) {
        // No substitute assigned - cannot submit
        return {
          canSubmit: false,
          reason: `Absent player ${absence.playerName || playerId} has no substitute assigned`,
        };
      }

      // Substitute is assigned - check if they have DUPR ID (required for DUPR leagues)
      if (isDuprLeague && memberDuprIds) {
        const subDuprId = memberDuprIds.get(absence.substituteId);
        if (!subDuprId) {
          return {
            canSubmit: false,
            reason: `Substitute for ${absence.playerName || playerId} does not have DUPR ID linked`,
          };
        }
      }

      // Track the substitution for DUPR submission
      substituteMappings.push({
        absentId: playerId,
        substituteId: absence.substituteId,
      });
    }
  }

  // Also check if any player in match IS a substitute (they played in place of someone)
  for (const absence of absences) {
    if (absence.substituteId && matchPlayerIds.includes(absence.substituteId)) {
      // This player IS a substitute - check DUPR ID
      if (isDuprLeague && memberDuprIds) {
        const subDuprId = memberDuprIds.get(absence.substituteId);
        if (!subDuprId) {
          return {
            canSubmit: false,
            reason: `Substitute player does not have DUPR ID linked`,
          };
        }
      }
      // The substitute played, so the match can be submitted using their DUPR ID
    }
  }

  return { canSubmit: true, substituteMappings };
}

/**
 * Get the actual player IDs to use for DUPR submission
 *
 * Replaces absent player IDs with their substitute's IDs
 * so DUPR submission uses the actual players who played.
 *
 * @param matchPlayerIds - Original player IDs in the match
 * @param absences - Week absences with substitute info
 * @returns Array of player IDs to use for DUPR (with subs replacing absent players)
 */
export function getDuprPlayerIdsForMatch(
  matchPlayerIds: string[],
  absences: WeekAbsence[]
): string[] {
  return matchPlayerIds.map((playerId) => {
    // Check if this player was absent
    const absence = absences.find((a) => a.playerId === playerId);
    if (absence?.substituteId) {
      // Use substitute's ID for DUPR submission
      return absence.substituteId;
    }
    return playerId;
  });
}

/**
 * Get substitute info for a match (for display/reporting)
 */
export function getSubstituteInfoForMatch(
  matchPlayerIds: string[],
  absences: WeekAbsence[]
): Array<{
  absentPlayerId: string;
  absentPlayerName?: string;
  substituteId: string;
  substituteName?: string;
}> {
  const subs: Array<{
    absentPlayerId: string;
    absentPlayerName?: string;
    substituteId: string;
    substituteName?: string;
  }> = [];

  for (const playerId of matchPlayerIds) {
    const absence = absences.find((a) => a.playerId === playerId);
    if (absence?.substituteId) {
      subs.push({
        absentPlayerId: playerId,
        absentPlayerName: absence.playerName,
        substituteId: absence.substituteId,
        substituteName: absence.substituteName,
      });
    }
  }

  return subs;
}

/**
 * Get absences by box for display
 */
export function getAbsencesByBox(
  absences: WeekAbsence[]
): Map<number, WeekAbsence[]> {
  const byBox = new Map<number, WeekAbsence[]>();

  for (const absence of absences) {
    const boxAbsences = byBox.get(absence.boxNumber) || [];
    boxAbsences.push(absence);
    byBox.set(absence.boxNumber, boxAbsences);
  }

  return byBox;
}

/**
 * Check if a box has enough players to run matches
 *
 * Minimum 4 players needed for rotating doubles (one match at a time)
 */
export function canBoxRunMatches(
  boxPlayerCount: number,
  absenceCount: number,
  substituteCount: number
): { canRun: boolean; effectivePlayerCount: number; reason?: string } {
  const effectivePlayerCount = boxPlayerCount - absenceCount + substituteCount;

  if (effectivePlayerCount < 4) {
    return {
      canRun: false,
      effectivePlayerCount,
      reason: `Only ${effectivePlayerCount} players available (need minimum 4)`,
    };
  }

  return {
    canRun: true,
    effectivePlayerCount,
  };
}

/**
 * Get summary of absences for a week
 */
export function getAbsenceSummary(week: BoxLeagueWeek): {
  totalAbsences: number;
  withSubstitutes: number;
  withoutSubstitutes: number;
  noShows: number;
  preDeclared: number;
  byPolicy: Record<AbsencePolicyType, number>;
  byBox: Record<number, number>;
} {
  const absences = week.absences || [];

  const byPolicy: Record<AbsencePolicyType, number> = {
    freeze: 0,
    ghost_score: 0,
    average_points: 0,
    auto_relegate: 0,
  };

  const byBox: Record<number, number> = {};

  let withSubstitutes = 0;
  let noShows = 0;

  for (const absence of absences) {
    if (absence.substituteId) withSubstitutes++;
    if (absence.isNoShow) noShows++;
    byPolicy[absence.policyApplied]++;
    byBox[absence.boxNumber] = (byBox[absence.boxNumber] || 0) + 1;
  }

  return {
    totalAbsences: absences.length,
    withSubstitutes,
    withoutSubstitutes: absences.length - withSubstitutes,
    noShows,
    preDeclared: absences.length - noShows,
    byPolicy,
    byBox,
  };
}

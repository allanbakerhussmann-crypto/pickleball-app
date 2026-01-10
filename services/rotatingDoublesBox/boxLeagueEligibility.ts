/**
 * Box League Eligibility Service
 *
 * Handles join eligibility and substitute eligibility rules.
 *
 * FILE LOCATION: services/rotatingDoublesBox/boxLeagueEligibility.ts
 * VERSION: V07.25
 */

import { doc, getDoc } from '@firebase/firestore';
import { db } from '../firebase/config';
import type {
  BoxLeagueMember,
  SubstituteEligibility,
} from '../../types/rotatingDoublesBox';

// ============================================
// JOIN ELIGIBILITY
// ============================================

/**
 * Eligibility check result
 */
export interface EligibilityResult {
  eligible: boolean;
  blockers: string[];
  warnings: string[];
}

/**
 * Check if a user can join a box league
 */
export async function canJoinLeague(
  leagueId: string,
  userId: string,
  userProfile: {
    dateOfBirth?: number;
    duprId?: string;
    duprDoublesRating?: number;
  },
  leagueSettings: {
    requiresDuprLinked?: boolean;
    minRating?: number;
    maxRating?: number;
    minAge?: number;
    maxAge?: number;
  }
): Promise<EligibilityResult> {
  const blockers: string[] = [];
  const warnings: string[] = [];

  // Check if already a member
  const existingMember = await getMember(leagueId, userId);
  if (existingMember && existingMember.status === 'active') {
    blockers.push('Already a member of this league');
  }

  // Check DUPR requirement
  if (leagueSettings.requiresDuprLinked && !userProfile.duprId) {
    blockers.push('DUPR ID must be linked to join this league');
  }

  // Check rating range
  if (userProfile.duprDoublesRating) {
    if (
      leagueSettings.minRating &&
      userProfile.duprDoublesRating < leagueSettings.minRating
    ) {
      blockers.push(
        `DUPR rating (${userProfile.duprDoublesRating}) is below minimum (${leagueSettings.minRating})`
      );
    }

    if (
      leagueSettings.maxRating &&
      userProfile.duprDoublesRating > leagueSettings.maxRating
    ) {
      blockers.push(
        `DUPR rating (${userProfile.duprDoublesRating}) exceeds maximum (${leagueSettings.maxRating})`
      );
    }
  } else if (leagueSettings.minRating || leagueSettings.maxRating) {
    warnings.push('No DUPR rating on file - rating requirements may apply');
  }

  // Check age eligibility
  if (userProfile.dateOfBirth && (leagueSettings.minAge || leagueSettings.maxAge)) {
    const age = calculateAge(userProfile.dateOfBirth);

    if (leagueSettings.minAge && age < leagueSettings.minAge) {
      blockers.push(
        `Must be at least ${leagueSettings.minAge} years old to join`
      );
    }

    if (leagueSettings.maxAge && age > leagueSettings.maxAge) {
      blockers.push(
        `Must be ${leagueSettings.maxAge} years old or younger to join`
      );
    }
  }

  return {
    eligible: blockers.length === 0,
    blockers,
    warnings,
  };
}

/**
 * Check if a user can join mid-season
 */
export async function canJoinMidSeason(
  _leagueId: string,
  _userId: string,
  seasonSettings: {
    allowMidSeason: boolean;
    currentWeekNumber: number;
    totalWeeks: number;
  }
): Promise<EligibilityResult> {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!seasonSettings.allowMidSeason) {
    blockers.push('This league does not allow mid-season joins');
  }

  // Warn if joining late in season
  const progressPercent =
    (seasonSettings.currentWeekNumber / seasonSettings.totalWeeks) * 100;
  if (progressPercent > 50) {
    warnings.push(
      `Season is ${Math.round(progressPercent)}% complete. New players start at the bottom box.`
    );
  }

  return {
    eligible: blockers.length === 0,
    blockers,
    warnings,
  };
}

// ============================================
// SUBSTITUTE ELIGIBILITY
// ============================================

/**
 * Check if a player can substitute for another
 */
export async function canSubstitute(
  leagueId: string,
  substituteUserId: string,
  _absentPlayerBoxNumber: number,
  settings: SubstituteEligibility,
  currentWeekPlayerIds: string[]
): Promise<EligibilityResult> {
  const blockers: string[] = [];
  const warnings: string[] = [];

  // Check if already playing this week
  if (currentWeekPlayerIds.includes(substituteUserId)) {
    blockers.push('Player is already assigned to play this week');
  }

  // Get substitute's member record
  const subMember = await getMember(leagueId, substituteUserId);

  // Check member requirement
  if (settings.subMustBeMember) {
    if (!subMember) {
      blockers.push('Substitute must be a league member');
    } else if (subMember.status !== 'active') {
      blockers.push(`Substitute has status: ${subMember.status}`);
    }
  }

  // Check DUPR requirements
  if (settings.subMustHaveDuprLinked) {
    if (!subMember?.duprId) {
      blockers.push('Substitute must have DUPR ID linked');
    }
  }

  if (settings.subMustHaveDuprConsent) {
    if (!subMember?.duprConsent) {
      blockers.push('Substitute must have given DUPR consent');
    }
  }

  // Check rating gap if specified
  if (settings.subMaxRatingGap && subMember?.duprDoublesRating) {
    // Would need absent player's rating to compare
    // For now, just warn
    warnings.push(
      `Rating gap limit: ${settings.subMaxRatingGap} - verify manually`
    );
  }

  return {
    eligible: blockers.length === 0,
    blockers,
    warnings,
  };
}

/**
 * Check box restriction for substitute
 */
export function checkBoxRestriction(
  substituteBoxNumber: number | null,
  absentPlayerBoxNumber: number,
  restriction: 'same_only' | 'same_or_lower' | 'any'
): { allowed: boolean; reason?: string } {
  if (restriction === 'any') {
    return { allowed: true };
  }

  if (substituteBoxNumber === null) {
    // Not currently assigned to a box - allow by default
    return { allowed: true };
  }

  if (restriction === 'same_only') {
    if (substituteBoxNumber !== absentPlayerBoxNumber) {
      return {
        allowed: false,
        reason: `Substitute is in Box ${substituteBoxNumber}, must be in Box ${absentPlayerBoxNumber}`,
      };
    }
  }

  if (restriction === 'same_or_lower') {
    if (substituteBoxNumber < absentPlayerBoxNumber) {
      return {
        allowed: false,
        reason: `Substitute is in Box ${substituteBoxNumber} (higher skill), cannot sub for Box ${absentPlayerBoxNumber}`,
      };
    }
  }

  return { allowed: true };
}

// ============================================
// DUPR ELIGIBILITY
// ============================================

/**
 * Check if a match with a substitute is DUPR eligible
 */
export function isMatchDuprEligibleWithSub(
  substituteHasDuprId: boolean,
  substituteHasDuprConsent: boolean,
  leagueRequiresDupr: boolean
): { eligible: boolean; reason?: string } {
  if (!leagueRequiresDupr) {
    return { eligible: true };
  }

  if (!substituteHasDuprId) {
    return {
      eligible: false,
      reason: 'Substitute does not have DUPR ID linked',
    };
  }

  if (!substituteHasDuprConsent) {
    return {
      eligible: false,
      reason: 'Substitute has not given DUPR consent',
    };
  }

  return { eligible: true };
}

// ============================================
// RATING-BASED PLACEMENT
// ============================================

/**
 * Calculate which box a new player should be placed in based on rating
 */
export function calculateInitialBoxPlacement(
  playerRating: number | undefined,
  boxAverages: { boxNumber: number; averageRating: number }[],
  _defaultToBottom: boolean = true
): number {
  if (!playerRating) {
    // No rating - place at bottom
    return Math.max(...boxAverages.map((b) => b.boxNumber));
  }

  // Sort boxes by average rating (highest = Box 1)
  const sorted = [...boxAverages].sort(
    (a, b) => b.averageRating - a.averageRating
  );

  // Find appropriate box
  for (let i = 0; i < sorted.length; i++) {
    // If player's rating is >= this box's average, they belong here or higher
    if (playerRating >= sorted[i].averageRating) {
      return sorted[i].boxNumber;
    }
  }

  // Rating lower than all boxes - place at bottom
  return sorted[sorted.length - 1].boxNumber;
}

/**
 * Calculate box averages from current assignments
 */
export async function calculateBoxAverages(
  leagueId: string,
  boxAssignments: { boxNumber: number; playerIds: string[] }[]
): Promise<{ boxNumber: number; averageRating: number }[]> {
  const averages: { boxNumber: number; averageRating: number }[] = [];

  for (const box of boxAssignments) {
    let totalRating = 0;
    let ratedPlayers = 0;

    for (const playerId of box.playerIds) {
      const member = await getMember(leagueId, playerId);
      if (member?.duprDoublesRating) {
        totalRating += member.duprDoublesRating;
        ratedPlayers++;
      }
    }

    averages.push({
      boxNumber: box.boxNumber,
      averageRating: ratedPlayers > 0 ? totalRating / ratedPlayers : 0,
    });
  }

  return averages;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

async function getMember(
  leagueId: string,
  userId: string
): Promise<BoxLeagueMember | null> {
  const memberDoc = await getDoc(
    doc(db, 'leagues', leagueId, 'members', userId)
  );

  if (!memberDoc.exists()) {
    return null;
  }

  return memberDoc.data() as BoxLeagueMember;
}

function calculateAge(dateOfBirth: number): number {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }

  return age;
}

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Validate all players in a box assignment have required data
 */
export async function validateBoxAssignmentPlayers(
  leagueId: string,
  boxAssignment: { boxNumber: number; playerIds: string[] },
  requireDupr: boolean
): Promise<{
  valid: boolean;
  issues: { playerId: string; issue: string }[];
}> {
  const issues: { playerId: string; issue: string }[] = [];

  for (const playerId of boxAssignment.playerIds) {
    const member = await getMember(leagueId, playerId);

    if (!member) {
      issues.push({ playerId, issue: 'Player not found in league members' });
      continue;
    }

    if (member.status !== 'active') {
      issues.push({ playerId, issue: `Player status is: ${member.status}` });
    }

    if (requireDupr && !member.duprId) {
      issues.push({ playerId, issue: 'Missing DUPR ID' });
    }

    if (requireDupr && !member.duprConsent) {
      issues.push({ playerId, issue: 'Missing DUPR consent' });
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

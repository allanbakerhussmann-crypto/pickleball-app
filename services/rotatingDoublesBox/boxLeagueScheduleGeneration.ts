/**
 * Box League Schedule Generation Service
 *
 * Generates initial box assignments for rotating doubles box leagues.
 * Takes registered members, sorts by DUPR rating, and packs into boxes.
 *
 * FILE LOCATION: services/rotatingDoublesBox/boxLeagueScheduleGeneration.ts
 * VERSION: V07.25
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from '@firebase/firestore';
import { db } from '../firebase/config';
import type { League, LeagueMember, UserProfile } from '../../types';
import type {
  BoxLeagueVenueSettings,
  RotatingDoublesBoxSettings,
  BoxAssignment,
  WeekSession,
} from '../../types/rotatingDoublesBox';
import {
  packPlayersIntoBoxes,
  distributePlayersToBoxes,
  formatPackingForDisplay,
  getPackingAdjustmentSuggestions,
  type BoxPackingResult,
} from './boxLeagueBoxPacking';
import { createSeason, getActiveSeason } from './boxLeagueSeason';
import { createWeekDraft, activateWeek } from './boxLeagueWeek';
import { DEFAULT_ROTATING_DOUBLES_BOX_SETTINGS } from '../../types/rotatingDoublesBox';

// ============================================
// TYPES
// ============================================

/**
 * Member with DUPR rating for sorting
 */
interface MemberWithRating {
  memberId: string;
  odUserId: string;
  displayName: string;
  duprId?: string | null;
  duprSinglesRating?: number | null;
  duprDoublesRating?: number | null;
  effectiveRating: number; // Rating used for sorting
}

/**
 * Schedule generation result
 */
export interface ScheduleGenerationResult {
  success: boolean;
  seasonId?: string;
  weekNumber?: number;
  boxAssignments?: BoxAssignment[];
  packingResult?: BoxPackingResult;
  matchesCreated?: number;
  error?: string;
  suggestions?: string[];
}

/**
 * Input for schedule generation
 */
export interface ScheduleGenerationInput {
  leagueId: string;
  seasonName?: string;
  startDate: Date;
  numberOfWeeks: number;
  weekDates: Date[];
}

// ============================================
// FETCH MEMBERS WITH RATINGS
// ============================================

/**
 * Get all active league members with their DUPR ratings
 */
export async function getLeagueMembersWithRatings(
  leagueId: string,
  leagueType: 'singles' | 'doubles' | 'mixed_doubles'
): Promise<MemberWithRating[]> {
  // Get all active members
  const membersRef = collection(db, 'leagues', leagueId, 'members');
  const q = query(membersRef, where('status', '==', 'active'));
  const snapshot = await getDocs(q);

  const members: MemberWithRating[] = [];

  for (const memberDoc of snapshot.docs) {
    const member = memberDoc.data() as LeagueMember;

    // Get user profile for DUPR ratings
    // Check both new fields (duprSinglesRating/duprDoublesRating) and legacy fields (ratingSingles/ratingDoubles)
    let duprSinglesRating: number | null = null;
    let duprDoublesRating: number | null = null;

    try {
      const userDoc = await getDoc(doc(db, 'users', member.userId));
      if (userDoc.exists()) {
        const user = userDoc.data() as UserProfile;
        // Check new DUPR fields first, fall back to legacy rating fields
        duprSinglesRating = user.duprSinglesRating ?? user.ratingSingles ?? null;
        duprDoublesRating = user.duprDoublesRating ?? user.ratingDoubles ?? null;
      }
    } catch (err) {
      console.warn(`Could not fetch user profile for ${member.userId}:`, err);
    }

    // Determine effective rating based on league type
    let effectiveRating = 0;
    if (leagueType === 'singles') {
      effectiveRating = duprSinglesRating ?? duprDoublesRating ?? 0;
    } else {
      // For doubles/mixed, prefer doubles rating
      effectiveRating = duprDoublesRating ?? duprSinglesRating ?? 0;
    }

    console.log(`[BoxLeague] Member ${member.displayName}: singles=${duprSinglesRating}, doubles=${duprDoublesRating}, effective=${effectiveRating}`)

    members.push({
      memberId: memberDoc.id,
      odUserId: member.userId,
      displayName: member.displayName,
      duprId: member.duprId,
      duprSinglesRating,
      duprDoublesRating,
      effectiveRating,
    });
  }

  return members;
}

/**
 * Sort members by DUPR rating (highest first)
 */
export function sortMembersByRating(members: MemberWithRating[]): MemberWithRating[] {
  const sorted = [...members].sort((a, b) => b.effectiveRating - a.effectiveRating);

  // Log sort result for debugging
  console.log('[BoxLeague] Sorted members by rating (highest first):');
  sorted.forEach((m, i) => {
    console.log(`  ${i + 1}. ${m.displayName}: ${m.effectiveRating}`);
  });

  return sorted;
}

// ============================================
// BOX ASSIGNMENT LOGIC
// ============================================

/**
 * Create box assignments from sorted members
 *
 * @param sortedMembers - Members sorted by rating (highest first)
 * @returns Box assignments with player IDs
 */
export function createBoxAssignments(
  sortedMembers: MemberWithRating[]
): { assignments: BoxAssignment[]; packingResult: BoxPackingResult } {
  const playerCount = sortedMembers.length;

  // Pack players into boxes
  const packingResult = packPlayersIntoBoxes(playerCount);

  if (!packingResult.success) {
    return { assignments: [], packingResult };
  }

  // Get player IDs in order
  const playerIds = sortedMembers.map((m) => m.odUserId);

  // Distribute to boxes
  const distributions = distributePlayersToBoxes(playerIds, packingResult);

  // Convert to BoxAssignment format
  const assignments: BoxAssignment[] = distributions.map((dist) => ({
    boxNumber: dist.boxNumber,
    playerIds: dist.playerIds,
  }));

  return { assignments, packingResult };
}

// ============================================
// COURT & SESSION ASSIGNMENT
// ============================================

/**
 * Assign courts to boxes based on venue configuration
 *
 * With multiple sessions, each session can have its own set of boxes on courts.
 * Example: 5 courts × 2 sessions = 10 boxes possible
 *
 * @param boxCount - Number of boxes needed
 * @param venue - Venue configuration with courts and sessions
 * @returns Court assignments for each box
 */
export function assignCourtsToBoxes(
  boxCount: number,
  venue: BoxLeagueVenueSettings
): { boxNumber: number; courtLabel: string; sessionIndex: number }[] {
  const activeCourts = venue.courts.filter((c) => c.active);
  const sessions = venue.sessions.filter((s) => s.active);

  if (activeCourts.length === 0) {
    throw new Error('No active courts configured');
  }

  if (sessions.length === 0) {
    throw new Error('No active sessions configured');
  }

  const courtAssignments: { boxNumber: number; courtLabel: string; sessionIndex: number }[] = [];

  // Calculate how many boxes can fit per session
  const boxesPerSession = activeCourts.length;
  const totalCapacity = boxesPerSession * sessions.length;

  if (boxCount > totalCapacity) {
    throw new Error(
      `Need ${boxCount} boxes but only have capacity for ${totalCapacity} (${activeCourts.length} courts × ${sessions.length} sessions)`
    );
  }

  // Assign boxes to courts across sessions
  let boxNumber = 1;
  for (let sessionIdx = 0; sessionIdx < sessions.length && boxNumber <= boxCount; sessionIdx++) {
    for (let courtIdx = 0; courtIdx < activeCourts.length && boxNumber <= boxCount; courtIdx++) {
      courtAssignments.push({
        boxNumber,
        courtLabel: activeCourts[courtIdx].name,
        sessionIndex: sessionIdx,
      });
      boxNumber++;
    }
  }

  return courtAssignments;
}

/**
 * Create week sessions from venue configuration
 */
export function createWeekSessions(
  venue: BoxLeagueVenueSettings,
  scheduledDate: number
): WeekSession[] {
  return venue.sessions
    .filter((s) => s.active)
    .map((session, idx) => ({
      sessionId: `session_${idx + 1}`,
      sessionName: session.name,
      startTime: session.startTime,
      endTime: session.endTime,
      date: scheduledDate,
    }));
}

// ============================================
// MAIN SCHEDULE GENERATION
// ============================================

/**
 * Generate initial box league schedule
 *
 * This function:
 * 1. Gets all active members
 * 2. Fetches DUPR ratings for each member
 * 3. Sorts members by rating (highest first)
 * 4. Packs members into boxes (4, 5, or 6 per box)
 * 5. Creates a season if not exists
 * 6. Creates Week 1 draft with box assignments
 * 7. Assigns courts to boxes based on sessions
 *
 * @returns Generation result with season/week IDs and assignments
 */
export async function generateBoxLeagueSchedule(
  input: ScheduleGenerationInput
): Promise<ScheduleGenerationResult> {
  try {
    const { leagueId, seasonName, startDate, numberOfWeeks, weekDates } = input;

    // Get league document
    const leagueDoc = await getDoc(doc(db, 'leagues', leagueId));
    if (!leagueDoc.exists()) {
      return { success: false, error: 'League not found' };
    }
    const league = leagueDoc.data() as League;

    // Get venue settings
    const venueSettings = league.settings?.rotatingDoublesBox?.venue as BoxLeagueVenueSettings | undefined;
    if (!venueSettings) {
      return { success: false, error: 'Venue settings not configured. Go to Courts tab to configure.' };
    }

    // Get box league settings
    const boxSettings = league.settings?.rotatingDoublesBox?.settings as RotatingDoublesBoxSettings | undefined;
    const settings = boxSettings || DEFAULT_ROTATING_DOUBLES_BOX_SETTINGS;

    // Get members with ratings
    // For rotating doubles box leagues, ALWAYS use doubles ratings since matches are doubles
    const ratingType = league.competitionFormat === 'rotating_doubles_box' ? 'doubles' : league.type;
    console.log(`[BoxLeague] Using rating type: ${ratingType} (league.type=${league.type}, format=${league.competitionFormat})`);
    const membersWithRatings = await getLeagueMembersWithRatings(leagueId, ratingType);

    if (membersWithRatings.length < 4) {
      return {
        success: false,
        error: `Need at least 4 players to create boxes. Currently have ${membersWithRatings.length}.`,
      };
    }

    // Sort by rating
    const sortedMembers = sortMembersByRating(membersWithRatings);

    // Create box assignments
    const { assignments, packingResult } = createBoxAssignments(sortedMembers);

    if (!packingResult.success) {
      // Get suggestions for fixing
      const suggestions = getPackingAdjustmentSuggestions(membersWithRatings.length);
      const suggestionMessages = suggestions.map((s) => {
        if (s.type === 'add') {
          return `Add ${s.count} player(s) to have ${s.resultingCount} players (${formatPackingForDisplay(s.packing)})`;
        } else {
          return `Remove ${s.count} player(s) to have ${s.resultingCount} players (${formatPackingForDisplay(s.packing)})`;
        }
      });

      return {
        success: false,
        error: packingResult.error,
        packingResult,
        suggestions: suggestionMessages,
      };
    }

    // Check if we already have an active season
    let season = await getActiveSeason(leagueId);
    let seasonId: string;

    if (!season) {
      // Create new season
      const endDate = weekDates[weekDates.length - 1] || new Date(startDate.getTime() + numberOfWeeks * 7 * 24 * 60 * 60 * 1000);

      season = await createSeason(leagueId, {
        name: seasonName || `Season ${new Date().getFullYear()}`,
        startDate,
        endDate,
        totalWeeks: numberOfWeeks,
        weekDates,
        settings,
      });
      seasonId = season.id;
    } else {
      seasonId = season.id;
    }

    // Assign courts to boxes
    let courtAssignments: { boxNumber: number; courtLabel: string }[] = [];
    try {
      const fullCourtAssignments = assignCourtsToBoxes(assignments.length, venueSettings);
      courtAssignments = fullCourtAssignments.map((ca) => ({
        boxNumber: ca.boxNumber,
        courtLabel: ca.courtLabel,
      }));
    } catch (err: any) {
      return {
        success: false,
        error: err.message,
        packingResult,
      };
    }

    // Create week sessions
    const sessions = createWeekSessions(venueSettings, startDate.getTime());

    // Create Week 1 draft
    await createWeekDraft({
      leagueId,
      seasonId,
      weekNumber: 1,
      scheduledDate: startDate.getTime(),
      boxAssignments: assignments,
      sessions,
      courtAssignments,
      settings,
    });

    // V07.25: Auto-activate Week 1 to generate matches immediately
    // This provides a better UX - matches are available right away
    let matchesCreated = 0;
    try {
      const activationResult = await activateWeek(leagueId, 1, 'system');
      matchesCreated = activationResult.matchIds.length;
      console.log(`[BoxLeague] Auto-activated Week 1, created ${matchesCreated} matches`);
    } catch (activationErr: any) {
      console.warn('[BoxLeague] Could not auto-activate Week 1:', activationErr.message);
      // Don't fail the whole generation - week draft was created successfully
    }

    return {
      success: true,
      seasonId,
      weekNumber: 1,
      boxAssignments: assignments,
      packingResult,
      matchesCreated,
    };
  } catch (err: any) {
    console.error('Box league schedule generation failed:', err);
    return {
      success: false,
      error: err.message || 'Failed to generate schedule',
    };
  }
}

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Validate that schedule can be generated
 */
export async function canGenerateSchedule(leagueId: string): Promise<{
  canGenerate: boolean;
  blockers: string[];
  memberCount: number;
  packingPreview?: BoxPackingResult;
}> {
  const blockers: string[] = [];

  // Get league
  const leagueDoc = await getDoc(doc(db, 'leagues', leagueId));
  if (!leagueDoc.exists()) {
    return { canGenerate: false, blockers: ['League not found'], memberCount: 0 };
  }
  const league = leagueDoc.data() as League;

  // Check venue settings
  const venueSettings = league.settings?.rotatingDoublesBox?.venue as BoxLeagueVenueSettings | undefined;
  if (!venueSettings) {
    blockers.push('Venue settings not configured');
  } else {
    const activeCourts = venueSettings.courts?.filter((c) => c.active) || [];
    const activeSessions = venueSettings.sessions?.filter((s) => s.active) || [];

    if (activeCourts.length === 0) {
      blockers.push('No active courts configured');
    }
    if (activeSessions.length === 0) {
      blockers.push('No active sessions configured');
    }
  }

  // Check member count
  const membersRef = collection(db, 'leagues', leagueId, 'members');
  const q = query(membersRef, where('status', '==', 'active'));
  const snapshot = await getDocs(q);
  const memberCount = snapshot.size;

  if (memberCount < 4) {
    blockers.push(`Need at least 4 players (currently ${memberCount})`);
  }

  // Check packing
  const packingPreview = packPlayersIntoBoxes(memberCount);
  if (!packingPreview.success && memberCount >= 4) {
    blockers.push(packingPreview.error || 'Cannot pack players into valid boxes');
  }

  // Check capacity
  if (venueSettings && packingPreview.success) {
    const activeCourts = venueSettings.courts?.filter((c) => c.active) || [];
    const activeSessions = venueSettings.sessions?.filter((s) => s.active) || [];
    const capacity = activeCourts.length * activeSessions.length;

    if (packingPreview.boxCount > capacity) {
      blockers.push(
        `Need ${packingPreview.boxCount} boxes but only ${capacity} available (${activeCourts.length} courts × ${activeSessions.length} sessions)`
      );
    }
  }

  // Check for existing season
  const activeSeason = await getActiveSeason(leagueId);
  if (activeSeason) {
    blockers.push(`Season "${activeSeason.name}" is already active`);
  }

  return {
    canGenerate: blockers.length === 0,
    blockers,
    memberCount,
    packingPreview: packingPreview.success ? packingPreview : undefined,
  };
}

/**
 * Get a preview of how players would be distributed
 */
export async function getSchedulePreview(leagueId: string): Promise<{
  members: MemberWithRating[];
  boxAssignments: BoxAssignment[];
  packingResult: BoxPackingResult;
  packingDisplay: string;
} | null> {
  const leagueDoc = await getDoc(doc(db, 'leagues', leagueId));
  if (!leagueDoc.exists()) return null;

  const league = leagueDoc.data() as League;
  // For rotating doubles box leagues, ALWAYS use doubles ratings
  const ratingType = league.competitionFormat === 'rotating_doubles_box' ? 'doubles' : league.type;
  const membersWithRatings = await getLeagueMembersWithRatings(leagueId, ratingType);

  if (membersWithRatings.length < 4) return null;

  const sortedMembers = sortMembersByRating(membersWithRatings);
  const { assignments, packingResult } = createBoxAssignments(sortedMembers);

  return {
    members: sortedMembers,
    boxAssignments: assignments,
    packingResult,
    packingDisplay: formatPackingForDisplay(packingResult),
  };
}

/**
 * League Standings Service - V07.14
 *
 * Builds and persists canonical league standings to Firestore subcollections.
 * These standings are DERIVED SNAPSHOTS - matches are the source of truth.
 *
 * Key principles:
 * 1. Matches are truth - standings are calculated from match data
 * 2. Freshness tracking - know when standings are stale
 * 3. Fail loudly - don't guess or auto-fix bad data
 * 4. DUPR aware - exclude rejected matches
 *
 * Path: leagues/{leagueId}/standings/{standingsKey}
 *
 * @file services/firebase/leagueStandings.ts
 */

import { db } from './config';
import { doc, setDoc, getDoc, getDocs, collection } from '@firebase/firestore';
import type { LeagueMatch, LeagueMember, LeagueStandingsDoc, LeagueStandingsRow, LeagueSettings } from '../../types';

// ============================================
// CONSTANTS
// ============================================

const CALCULATION_VERSION = 'v07.14';

// ============================================
// VALIDATION (FAIL LOUDLY)
// ============================================

/**
 * Validate match data before calculation
 * @throws Error with descriptive message if validation fails
 */
function validateMatch(match: LeagueMatch, memberIds: Set<string>): void {
  // 1. Completed match must have winner
  // V07.16: Check both winnerMemberId (LeagueMatch) and winnerId (Match/duprScoring)
  const winnerId = match.winnerMemberId || (match as any).winnerId;
  if (match.status === 'completed' && !winnerId) {
    throw new Error(
      `INVALID DATA: Match ${match.id} is 'completed' but has no winner. ` +
      `Fix the match data before recalculating standings.`
    );
  }

  // 2. Participants must exist
  if (!memberIds.has(match.memberAId)) {
    throw new Error(
      `INVALID DATA: Match ${match.id} references memberAId '${match.memberAId}' ` +
      `which is not in the league members list.`
    );
  }
  if (!memberIds.has(match.memberBId)) {
    throw new Error(
      `INVALID DATA: Match ${match.id} references memberBId '${match.memberBId}' ` +
      `which is not in the league members list.`
    );
  }

  // 3. Winner must be a participant
  if (match.winnerMemberId &&
      match.winnerMemberId !== match.memberAId &&
      match.winnerMemberId !== match.memberBId) {
    throw new Error(
      `INVALID DATA: Match ${match.id} has winnerMemberId '${match.winnerMemberId}' ` +
      `which is neither memberA nor memberB.`
    );
  }

  // 4. Scores should exist for completed match
  if (match.status === 'completed' && (!match.scores || match.scores.length === 0)) {
    throw new Error(
      `INVALID DATA: Match ${match.id} is 'completed' but has no scores.`
    );
  }
}

/**
 * Filter matches for standings calculation
 * Excludes DUPR-rejected matches
 */
function filterMatchesForStandings(matches: LeagueMatch[]): LeagueMatch[] {
  return matches.filter(match => {
    // Exclude DUPR-excluded matches
    if (match.duprExcluded === true) {
      console.log(`[filterMatches] Excluding match ${match.id} - DUPR excluded: ${match.duprExclusionReason || 'no reason'}`);
      return false;
    }
    return true;
  });
}

// ============================================
// CALCULATION LOGIC
// ============================================

interface PointsConfig {
  pointsForWin: number;
  pointsForLoss: number;
  pointsForDraw: number;
  pointsForForfeit: number;
}

const DEFAULT_POINTS_CONFIG: PointsConfig = {
  pointsForWin: 3,
  pointsForLoss: 0,
  pointsForDraw: 1,
  pointsForForfeit: 0,
};

/**
 * Calculate standings from matches
 * @throws Error if validation fails
 */
function calculateStandings(
  members: LeagueMember[],
  matches: LeagueMatch[],
  weekNumber: number | null,
  pointsConfig: PointsConfig = DEFAULT_POINTS_CONFIG
): { rows: LeagueStandingsRow[]; errors: string[]; completedMatches: number } {
  const errors: string[] = [];
  const memberIds = new Set(members.map(m => m.id));

  // Filter matches: by week if specified, and exclude DUPR-excluded
  let eligibleMatches = filterMatchesForStandings(matches);
  if (weekNumber !== null) {
    eligibleMatches = eligibleMatches.filter(m => m.weekNumber === weekNumber);
  }

  // Initialize standings for all members
  const standings = new Map<string, LeagueStandingsRow>();
  members.forEach(m => {
    standings.set(m.id, {
      rank: 0,
      memberId: m.id,
      displayName: m.displayName,
      partnerDisplayName: m.partnerDisplayName || null,
      wins: 0,
      losses: 0,
      played: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      pointDiff: 0,
      gamesWon: 0,
      gamesLost: 0,
      gameDiff: 0,
      leaguePoints: 0,
      winRate: 0,
    });
  });

  // Process completed matches
  let completedMatches = 0;
  for (const match of eligibleMatches) {
    if (match.status !== 'completed') continue;

    // Validate match data (will throw on error)
    try {
      validateMatch(match, memberIds);
    } catch (err) {
      // Record error but continue processing other matches
      errors.push((err as Error).message);
      continue;
    }

    completedMatches++;

    // V07.16: Support both winnerMemberId (LeagueMatch) and winnerId (Match/duprScoring)
    const winnerId = match.winnerMemberId || (match as any).winnerId;
    const loserId = winnerId === match.memberAId ? match.memberBId : match.memberAId;

    // Calculate points from scores
    const totalA = match.scores.reduce((sum, g) => sum + (g.scoreA || 0), 0);
    const totalB = match.scores.reduce((sum, g) => sum + (g.scoreB || 0), 0);

    // Calculate games won (for best-of-3/5)
    const gamesWonA = match.scores.filter(g => (g.scoreA || 0) > (g.scoreB || 0)).length;
    const gamesWonB = match.scores.filter(g => (g.scoreB || 0) > (g.scoreA || 0)).length;

    // Determine which is winner's points/games
    const isAWinner = winnerId === match.memberAId;
    const winnerPoints = isAWinner ? totalA : totalB;
    const loserPoints = isAWinner ? totalB : totalA;
    const winnerGames = isAWinner ? gamesWonA : gamesWonB;
    const loserGames = isAWinner ? gamesWonB : gamesWonA;

    // Update winner
    const winner = standings.get(winnerId);
    if (winner) {
      winner.wins++;
      winner.played++;
      winner.pointsFor += winnerPoints;
      winner.pointsAgainst += loserPoints;
      winner.gamesWon += winnerGames;
      winner.gamesLost += loserGames;

      // Check if forfeit (could be a legacy flag or a separate field)
      const isForfeit = (match as any).forfeit === true;
      winner.leaguePoints += isForfeit ? pointsConfig.pointsForForfeit : pointsConfig.pointsForWin;
    }

    // Update loser
    const loser = standings.get(loserId);
    if (loser) {
      loser.losses++;
      loser.played++;
      loser.pointsFor += loserPoints;
      loser.pointsAgainst += winnerPoints;
      loser.gamesWon += loserGames;
      loser.gamesLost += winnerGames;
      loser.leaguePoints += pointsConfig.pointsForLoss;
    }
  }

  // Calculate derived fields and sort
  const rows = Array.from(standings.values()).map(row => ({
    ...row,
    pointDiff: row.pointsFor - row.pointsAgainst,
    gameDiff: row.gamesWon - row.gamesLost,
    winRate: row.played > 0 ? Math.round((row.wins / row.played) * 100) : 0,
  }));

  // Sort by: league points → wins → point diff → points for
  rows.sort((a, b) => {
    if (b.leaguePoints !== a.leaguePoints) return b.leaguePoints - a.leaguePoints;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
    return b.pointsFor - a.pointsFor;
  });

  // Assign ranks
  rows.forEach((row, index) => {
    row.rank = index + 1;
  });

  return { rows, errors, completedMatches };
}

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Build and persist overall league standings
 *
 * @throws Error if data validation fails (completed match without winner, etc.)
 */
export async function buildLeagueStandings(
  leagueId: string,
  members: LeagueMember[],
  matches: LeagueMatch[],
  settings?: LeagueSettings | null
): Promise<LeagueStandingsDoc> {
  console.log(`[buildLeagueStandings] Building overall standings for league ${leagueId}`);
  console.log(`[buildLeagueStandings] Members: ${members.length}, Matches: ${matches.length}`);

  const pointsConfig: PointsConfig = {
    pointsForWin: settings?.pointsForWin ?? 3,
    pointsForLoss: settings?.pointsForLoss ?? 0,
    pointsForDraw: settings?.pointsForDraw ?? 1,
    pointsForForfeit: settings?.pointsForForfeit ?? 0,
  };

  const { rows, errors, completedMatches } = calculateStandings(
    members,
    matches,
    null, // null = overall (all weeks)
    pointsConfig
  );

  // Find max updatedAt for watermark
  const matchesUpdatedAtMax = matches.length > 0
    ? Math.max(...matches.map(m => m.updatedAt || m.completedAt || 0))
    : 0;

  const standingsDoc: LeagueStandingsDoc = {
    standingsKey: 'overall',
    leagueId,
    weekNumber: null,
    generatedAt: Date.now(),
    matchesUpdatedAtMax,
    calculationVersion: CALCULATION_VERSION,
    totalMatches: matches.length,
    completedMatches,
    rows,
    errors,
  };

  // Write to Firestore
  const docRef = doc(db, 'leagues', leagueId, 'standings', 'overall');
  await setDoc(docRef, standingsDoc);

  console.log(
    `[buildLeagueStandings] SUCCESS - Overall standings: ${completedMatches} completed matches, ` +
    `${rows.length} members ranked, ${errors.length} errors`
  );

  if (errors.length > 0) {
    console.warn('[buildLeagueStandings] Errors encountered:', errors);
  }

  return standingsDoc;
}

/**
 * Build and persist standings for a specific week
 *
 * @throws Error if data validation fails
 */
export async function buildWeekStandings(
  leagueId: string,
  weekNumber: number,
  members: LeagueMember[],
  matches: LeagueMatch[],
  settings?: LeagueSettings | null
): Promise<LeagueStandingsDoc> {
  console.log(`[buildWeekStandings] Building week ${weekNumber} standings for league ${leagueId}`);

  const pointsConfig: PointsConfig = {
    pointsForWin: settings?.pointsForWin ?? 3,
    pointsForLoss: settings?.pointsForLoss ?? 0,
    pointsForDraw: settings?.pointsForDraw ?? 1,
    pointsForForfeit: settings?.pointsForForfeit ?? 0,
  };

  const { rows, errors, completedMatches } = calculateStandings(
    members,
    matches,
    weekNumber,
    pointsConfig
  );

  // Find max updatedAt for week matches
  const weekMatches = matches.filter(m => m.weekNumber === weekNumber);
  const matchesUpdatedAtMax = weekMatches.length > 0
    ? Math.max(...weekMatches.map(m => m.updatedAt || m.completedAt || 0))
    : 0;

  const standingsKey = `week-${weekNumber}`;
  const standingsDoc: LeagueStandingsDoc = {
    standingsKey,
    leagueId,
    weekNumber,
    generatedAt: Date.now(),
    matchesUpdatedAtMax,
    calculationVersion: CALCULATION_VERSION,
    totalMatches: weekMatches.length,
    completedMatches,
    rows,
    errors,
  };

  // Write to Firestore
  const docRef = doc(db, 'leagues', leagueId, 'standings', standingsKey);
  await setDoc(docRef, standingsDoc);

  console.log(
    `[buildWeekStandings] SUCCESS - Week ${weekNumber}: ${completedMatches} completed matches, ` +
    `${rows.length} members ranked`
  );

  return standingsDoc;
}

/**
 * Get standings from Firestore
 * Returns null if not found
 */
export async function getLeagueStandings(
  leagueId: string,
  standingsKey: string // "overall" | "week-1" | etc.
): Promise<LeagueStandingsDoc | null> {
  const docRef = doc(db, 'leagues', leagueId, 'standings', standingsKey);
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.data() as LeagueStandingsDoc;
}

/**
 * Get all standings for a league (overall + all weeks)
 */
export async function getAllLeagueStandings(
  leagueId: string
): Promise<LeagueStandingsDoc[]> {
  const standingsRef = collection(db, 'leagues', leagueId, 'standings');
  const snapshot = await getDocs(standingsRef);

  const results = snapshot.docs.map(d => d.data() as LeagueStandingsDoc);

  // Sort: overall first, then weeks in order
  results.sort((a, b) => {
    if (a.standingsKey === 'overall') return -1;
    if (b.standingsKey === 'overall') return 1;
    return (a.weekNumber || 0) - (b.weekNumber || 0);
  });

  return results;
}

// ============================================
// STALENESS DETECTION
// ============================================

/**
 * Check if standings are stale (need recalculation)
 * Returns true if any match has updatedAt > standings.matchesUpdatedAtMax
 */
export function isStandingsStale(
  standings: LeagueStandingsDoc,
  matches: LeagueMatch[]
): boolean {
  // Filter to relevant matches based on week
  const relevantMatches = standings.weekNumber !== null
    ? matches.filter(m => m.weekNumber === standings.weekNumber)
    : matches;

  // Find the most recent match update
  const latestMatchUpdate = Math.max(
    0,
    ...relevantMatches.map(m => m.updatedAt || m.completedAt || 0)
  );

  // Standings are stale if any match was updated after calculation
  return latestMatchUpdate > standings.matchesUpdatedAtMax;
}

/**
 * Get staleness info for UI display
 */
export function getStandingsStatus(
  standings: LeagueStandingsDoc | null,
  matches: LeagueMatch[]
): { status: 'current' | 'stale' | 'missing'; message: string } {
  if (!standings) {
    return { status: 'missing', message: 'Standings not yet calculated' };
  }

  if (isStandingsStale(standings, matches)) {
    return {
      status: 'stale',
      message: 'Standings may be outdated - a match was edited after calculation'
    };
  }

  return { status: 'current', message: 'Standings are up to date' };
}

// ============================================
// AUTO-UPDATE ON MATCH COMPLETION
// ============================================

/**
 * Update standings when a match completes.
 * Called from match completion handlers.
 *
 * NOTE: This function fetches data internally. Pass the completed match
 * so we know which week standings to update.
 */
export async function updateStandingsOnMatchComplete(
  leagueId: string,
  completedMatch: LeagueMatch,
  members: LeagueMember[],
  allMatches: LeagueMatch[],
  settings?: LeagueSettings | null
): Promise<void> {
  console.log(`[updateStandingsOnMatchComplete] Match ${completedMatch.id} completed in league ${leagueId}`);

  try {
    // Rebuild overall standings
    await buildLeagueStandings(leagueId, members, allMatches, settings);

    // Rebuild week standings if applicable
    if (completedMatch.weekNumber) {
      await buildWeekStandings(
        leagueId,
        completedMatch.weekNumber,
        members,
        allMatches,
        settings
      );
    }

    console.log(`[updateStandingsOnMatchComplete] Standings updated successfully`);
  } catch (err) {
    console.error(`[updateStandingsOnMatchComplete] Failed to update standings:`, err);
    // Don't throw - standings can be rebuilt manually
    // But log error for debugging
  }
}

/**
 * Rebuild all standings for a league (overall + all weeks)
 * Useful for manual recalculation or migration
 */
export async function rebuildAllStandings(
  leagueId: string,
  members: LeagueMember[],
  allMatches: LeagueMatch[],
  settings?: LeagueSettings | null
): Promise<{ overall: LeagueStandingsDoc; weeks: LeagueStandingsDoc[] }> {
  console.log(`[rebuildAllStandings] Rebuilding all standings for league ${leagueId}`);

  // Build overall
  const overall = await buildLeagueStandings(leagueId, members, allMatches, settings);

  // Find all unique week numbers
  const weekNumbers = [...new Set(
    allMatches
      .filter(m => m.weekNumber != null)
      .map(m => m.weekNumber!)
  )].sort((a, b) => a - b);

  // Build week standings
  const weeks: LeagueStandingsDoc[] = [];
  for (const weekNumber of weekNumbers) {
    const weekStandings = await buildWeekStandings(leagueId, weekNumber, members, allMatches, settings);
    weeks.push(weekStandings);
  }

  console.log(`[rebuildAllStandings] Complete: overall + ${weeks.length} weeks`);

  return { overall, weeks };
}

/**
 * Box League Season Stats Service
 *
 * Manages season-wide player statistics and leaderboard.
 * Updated after each week finalization.
 *
 * FILE LOCATION: services/rotatingDoublesBox/boxLeagueSeasonStats.ts
 * VERSION: V07.25
 */

import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  getDocs,
  query,
  orderBy,
} from '@firebase/firestore';
import { db } from '../firebase/config';
import type {
  SeasonPlayerStats,
  BoxStanding,
  PlayerMovement,
  BoxLeagueWeek,
} from '../../types/rotatingDoublesBox';

// ============================================
// FIRESTORE PATHS
// ============================================

/**
 * Get player stats collection for a season
 */
function getPlayerStatsCollection(leagueId: string, seasonId: string) {
  return collection(db, 'leagues', leagueId, 'boxSeasons', seasonId, 'playerStats');
}

/**
 * Get player stats document
 */
function getPlayerStatsDoc(leagueId: string, seasonId: string, playerId: string) {
  return doc(
    db,
    'leagues',
    leagueId,
    'boxSeasons',
    seasonId,
    'playerStats',
    playerId
  );
}

// ============================================
// INITIALIZE STATS
// ============================================

/**
 * Initialize season stats for a player
 */
export async function initializePlayerStats(
  leagueId: string,
  seasonId: string,
  playerId: string,
  initialBox: number
): Promise<SeasonPlayerStats> {
  const stats: SeasonPlayerStats = {
    playerId,
    seasonId,
    weeksPlayed: 0,
    weeksAbsent: 0,
    weeksAsSubstitute: 0,
    totalMatches: 0,
    totalWins: 0,
    totalLosses: 0,
    totalPointsFor: 0,
    totalPointsAgainst: 0,
    winPercentage: 0,
    currentBox: initialBox,
    highestBox: initialBox,
    promotions: 0,
    relegations: 0,
    noShows: 0,
    checkInRate: 0,
  };

  await setDoc(getPlayerStatsDoc(leagueId, seasonId, playerId), stats);

  return stats;
}

/**
 * Initialize stats for all players in a season
 */
export async function initializeSeasonStats(
  leagueId: string,
  seasonId: string,
  initialAssignments: { boxNumber: number; playerIds: string[] }[]
): Promise<void> {
  for (const assignment of initialAssignments) {
    for (const playerId of assignment.playerIds) {
      await initializePlayerStats(
        leagueId,
        seasonId,
        playerId,
        assignment.boxNumber
      );
    }
  }
}

// ============================================
// UPDATE STATS
// ============================================

/**
 * Update player stats after a week is finalized
 */
export async function updateStatsAfterWeek(
  leagueId: string,
  seasonId: string,
  week: BoxLeagueWeek,
  standings: BoxStanding[],
  movements: PlayerMovement[]
): Promise<void> {
  for (const standing of standings) {
    const statsDoc = await getDoc(
      getPlayerStatsDoc(leagueId, seasonId, standing.playerId)
    );

    if (!statsDoc.exists()) {
      // Initialize if player joined mid-season
      await initializePlayerStats(
        leagueId,
        seasonId,
        standing.playerId,
        standing.boxNumber
      );
    }

    const currentStats = statsDoc.data() as SeasonPlayerStats;
    const movement = movements.find((m) => m.playerId === standing.playerId);

    // Calculate updated stats
    const updatedStats: Partial<SeasonPlayerStats> = {
      // Participation
      weeksPlayed: standing.wasAbsent
        ? currentStats.weeksPlayed
        : currentStats.weeksPlayed + 1,
      weeksAbsent: standing.wasAbsent
        ? currentStats.weeksAbsent + 1
        : currentStats.weeksAbsent,

      // Match stats
      totalMatches: currentStats.totalMatches + standing.matchesPlayed,
      totalWins: currentStats.totalWins + standing.wins,
      totalLosses: currentStats.totalLosses + standing.losses,
      totalPointsFor: currentStats.totalPointsFor + standing.pointsFor,
      totalPointsAgainst: currentStats.totalPointsAgainst + standing.pointsAgainst,

      // Box movement
      currentBox: movement?.toBox || standing.boxNumber,
    };

    // Update highest box if promoted to a better box
    if (movement?.toBox && movement.toBox < currentStats.highestBox) {
      updatedStats.highestBox = movement.toBox;
    }

    // Count promotions/relegations
    if (movement?.reason === 'promotion') {
      updatedStats.promotions = currentStats.promotions + 1;
    } else if (movement?.reason === 'relegation') {
      updatedStats.relegations = currentStats.relegations + 1;
    }

    // Track no-shows (absent without declaring)
    const attendance = week.attendance.find(
      (a) => a.playerId === standing.playerId
    );
    if (attendance?.status === 'no_show') {
      updatedStats.noShows = currentStats.noShows + 1;
    }

    // Calculate win percentage
    const totalMatches = updatedStats.totalMatches || currentStats.totalMatches;
    const totalWins = updatedStats.totalWins || currentStats.totalWins;
    updatedStats.winPercentage =
      totalMatches > 0 ? Math.round((totalWins / totalMatches) * 100) : 0;

    // Calculate check-in rate
    const totalWeeks =
      (updatedStats.weeksPlayed || currentStats.weeksPlayed) +
      (updatedStats.weeksAbsent || currentStats.weeksAbsent);
    const checkedInWeeks = updatedStats.weeksPlayed || currentStats.weeksPlayed;
    updatedStats.checkInRate =
      totalWeeks > 0 ? Math.round((checkedInWeeks / totalWeeks) * 100) : 0;

    await updateDoc(
      getPlayerStatsDoc(leagueId, seasonId, standing.playerId),
      updatedStats
    );
  }
}

/**
 * Update stats when player acts as substitute
 */
export async function recordSubstitutePlay(
  leagueId: string,
  seasonId: string,
  substitutePlayerId: string
): Promise<void> {
  const statsDoc = await getDoc(
    getPlayerStatsDoc(leagueId, seasonId, substitutePlayerId)
  );

  if (!statsDoc.exists()) {
    return;
  }

  const currentStats = statsDoc.data() as SeasonPlayerStats;

  await updateDoc(
    getPlayerStatsDoc(leagueId, seasonId, substitutePlayerId),
    {
      weeksAsSubstitute: currentStats.weeksAsSubstitute + 1,
    }
  );
}

// ============================================
// LEADERBOARD
// ============================================

/**
 * Get season leaderboard (all players sorted by performance)
 */
export async function getSeasonLeaderboard(
  leagueId: string,
  seasonId: string
): Promise<SeasonPlayerStats[]> {
  const q = query(
    getPlayerStatsCollection(leagueId, seasonId),
    orderBy('currentBox', 'asc'),
    orderBy('winPercentage', 'desc')
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data() as SeasonPlayerStats);
}

/**
 * Get top performers by win percentage
 */
export async function getTopPerformers(
  leagueId: string,
  seasonId: string,
  limit: number = 10
): Promise<SeasonPlayerStats[]> {
  const allStats = await getSeasonLeaderboard(leagueId, seasonId);

  // Sort by win percentage, filter out players with < 3 matches
  return allStats
    .filter((s) => s.totalMatches >= 3)
    .sort((a, b) => b.winPercentage - a.winPercentage)
    .slice(0, limit);
}

/**
 * Get most improved players (most promotions)
 */
export async function getMostImproved(
  leagueId: string,
  seasonId: string,
  limit: number = 5
): Promise<SeasonPlayerStats[]> {
  const allStats = await getSeasonLeaderboard(leagueId, seasonId);

  return allStats
    .sort((a, b) => b.promotions - a.promotions)
    .slice(0, limit);
}

// ============================================
// FINAL STANDINGS
// ============================================

/**
 * Calculate final standings at end of season
 *
 * Ranking criteria:
 * 1. Final box number (lower = better)
 * 2. Position within final box
 * 3. Season win percentage
 */
export async function calculateFinalStandings(
  leagueId: string,
  seasonId: string,
  finalWeekStandings: BoxStanding[]
): Promise<SeasonPlayerStats[]> {
  const allStats = await getSeasonLeaderboard(leagueId, seasonId);

  // Create position map from final week standings
  const positionMap = new Map<string, { box: number; position: number }>();
  for (const standing of finalWeekStandings) {
    positionMap.set(standing.playerId, {
      box: standing.boxNumber,
      position: standing.positionInBox,
    });
  }

  // Sort by final position
  const sorted = [...allStats].sort((a, b) => {
    const posA = positionMap.get(a.playerId);
    const posB = positionMap.get(b.playerId);

    if (!posA || !posB) return 0;

    // Lower box number = better
    if (posA.box !== posB.box) {
      return posA.box - posB.box;
    }

    // Lower position in box = better
    if (posA.position !== posB.position) {
      return posA.position - posB.position;
    }

    // Higher win percentage = better
    return b.winPercentage - a.winPercentage;
  });

  // Assign final standings
  for (let i = 0; i < sorted.length; i++) {
    await updateDoc(
      getPlayerStatsDoc(leagueId, seasonId, sorted[i].playerId),
      { finalStanding: i + 1 }
    );
    sorted[i].finalStanding = i + 1;
  }

  return sorted;
}

// ============================================
// INDIVIDUAL PLAYER STATS
// ============================================

/**
 * Get stats for a single player
 */
export async function getPlayerSeasonStats(
  leagueId: string,
  seasonId: string,
  playerId: string
): Promise<SeasonPlayerStats | null> {
  const statsDoc = await getDoc(
    getPlayerStatsDoc(leagueId, seasonId, playerId)
  );

  if (!statsDoc.exists()) {
    return null;
  }

  return statsDoc.data() as SeasonPlayerStats;
}

/**
 * Get player's rank on leaderboard
 */
export async function getPlayerRank(
  leagueId: string,
  seasonId: string,
  playerId: string
): Promise<number | null> {
  const leaderboard = await getSeasonLeaderboard(leagueId, seasonId);
  const index = leaderboard.findIndex((s) => s.playerId === playerId);

  return index >= 0 ? index + 1 : null;
}

// ============================================
// DISPLAY HELPERS
// ============================================

/**
 * Format season stats for display
 */
export function formatStatsForDisplay(stats: SeasonPlayerStats): string {
  return `
Box: ${stats.currentBox} (Best: ${stats.highestBox})
Record: ${stats.totalWins}W - ${stats.totalLosses}L (${stats.winPercentage}%)
Points: ${stats.totalPointsFor} for, ${stats.totalPointsAgainst} against
Promotions: ${stats.promotions} | Relegations: ${stats.relegations}
Attendance: ${stats.checkInRate}%
  `.trim();
}

/**
 * Format leaderboard row
 */
export function formatLeaderboardRow(
  stats: SeasonPlayerStats,
  rank: number
): string {
  return `${rank}. Box ${stats.currentBox} | ${stats.totalWins}W-${stats.totalLosses}L (${stats.winPercentage}%) | ↑${stats.promotions} ↓${stats.relegations}`;
}

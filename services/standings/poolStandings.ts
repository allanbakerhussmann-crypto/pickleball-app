/**
 * Pool Standings Calculator
 *
 * Shared module used by both UI (PoolGroupStandings.tsx) and
 * database persistence (poolResults.ts) to ensure consistent rankings.
 *
 * Implements proper multi-way H2H via mini-standings with caching.
 *
 * @version V07.30
 * @file services/standings/poolStandings.ts
 */

export type TiebreakerKey = 'wins' | 'head_to_head' | 'point_diff' | 'points_scored';

export interface PoolStandingRow {
  teamId: string;
  name: string;
  wins: number;
  losses: number;
  pf: number;      // points for
  pa: number;      // points against
  diff: number;    // point differential
  rank?: number;
  // Additional fields for UI compatibility
  pointsFor?: number;
  pointsAgainst?: number;
  pointDifference?: number;
  gamesPlayed?: number;
  isAdvancing?: boolean;
  matchHistory?: Array<{ opponentId: string; won: boolean }>;
}

interface MiniStanding {
  miniWins: number;
  miniDiff: number;
}

// ============================================
// LENIENT HELPERS (work with any match shape)
// ============================================

/**
 * Get winner from match using lenient field precedence.
 * Handles officialResult, winnerTeamId, and winnerId.
 */
function getWinnerLenient(m: any): string | null {
  return (
    m?.officialResult?.winnerId ||
    m?.winnerTeamId ||
    m?.winnerId ||
    null
  );
}

/**
 * Get scores from match using lenient field precedence.
 * Handles officialResult.scores and scores array.
 * Guards against NaN values.
 */
function getScoresLenient(m: any): Array<{ scoreA: number; scoreB: number }> {
  const raw = m?.officialResult?.scores || m?.scores || [];
  return raw
    .filter((g: any) => g && typeof g === 'object')
    .map((g: any) => ({
      scoreA: typeof g.scoreA === 'number' && !isNaN(g.scoreA) ? g.scoreA : 0,
      scoreB: typeof g.scoreB === 'number' && !isNaN(g.scoreB) ? g.scoreB : 0,
    }));
}

/**
 * Get side A team ID from match.
 * Handles both sideA.id and legacy teamAId.
 */
function getSideAId(m: any): string | null {
  return m?.sideA?.id || m?.teamAId || null;
}

/**
 * Get side B team ID from match.
 * Handles both sideB.id and legacy teamBId.
 */
function getSideBId(m: any): string | null {
  return m?.sideB?.id || m?.teamBId || null;
}

// ============================================
// MINI-STANDINGS FOR H2H TIEBREAKER
// ============================================

/**
 * Compute mini-standings for a group of tied teams.
 * Only considers matches BETWEEN the tied teams.
 *
 * For multi-way ties (3+ teams with same wins), this computes:
 * - miniWins: wins in matches only against other tied teams
 * - miniDiff: point differential in matches only against other tied teams
 */
function computeMiniStandings(
  tiedTeamIds: string[],
  completedMatches: any[]
): Map<string, MiniStanding> {
  const mini = new Map<string, MiniStanding>();
  for (const id of tiedTeamIds) {
    mini.set(id, { miniWins: 0, miniDiff: 0 });
  }

  const tiedSet = new Set(tiedTeamIds);

  for (const m of completedMatches) {
    const a = getSideAId(m);
    const b = getSideBId(m);
    // Only consider matches between two tied teams
    if (!a || !b || !tiedSet.has(a) || !tiedSet.has(b)) continue;

    const winner = getWinnerLenient(m);
    if (winner === a) mini.get(a)!.miniWins += 1;
    else if (winner === b) mini.get(b)!.miniWins += 1;

    const scores = getScoresLenient(m);
    for (const g of scores) {
      mini.get(a)!.miniDiff += g.scoreA - g.scoreB;
      mini.get(b)!.miniDiff += g.scoreB - g.scoreA;
    }
  }
  return mini;
}

// ============================================
// MAIN FUNCTION
// ============================================

/**
 * Calculate pool standings with configurable tiebreakers.
 *
 * Used by both UI and database to ensure consistent rankings.
 * Implements proper multi-way H2H via mini-standings.
 *
 * @param participants - Teams in the pool { id, name }
 * @param matches - All matches in the pool (any status)
 * @param tiebreakers - Ordered tiebreaker rules
 * @returns Sorted standings with ranks assigned
 */
export function calculatePoolStandings(
  participants: Array<{ id: string; name: string }>,
  matches: any[],
  tiebreakers: TiebreakerKey[] = ['wins', 'head_to_head', 'point_diff', 'points_scored']
): PoolStandingRow[] {
  // Guard against empty/undefined inputs
  if (!participants || participants.length === 0) {
    return [];
  }

  // 1. Build base standings
  const byId: Record<string, PoolStandingRow> = {};
  for (const p of participants) {
    if (!p.id) continue;
    byId[p.id] = {
      teamId: p.id,
      name: p.name || `Team ${p.id.slice(0, 4)}`,
      wins: 0,
      losses: 0,
      pf: 0,
      pa: 0,
      diff: 0,
      gamesPlayed: 0,
      matchHistory: [],
    };
  }

  const completed = (matches || []).filter(m => m?.status === 'completed');

  for (const m of completed) {
    const a = getSideAId(m);
    const b = getSideBId(m);
    if (!a || !b || !byId[a] || !byId[b]) continue;

    const scores = getScoresLenient(m);
    for (const g of scores) {
      byId[a].pf += g.scoreA;
      byId[a].pa += g.scoreB;
      byId[b].pf += g.scoreB;
      byId[b].pa += g.scoreA;
    }

    const winner = getWinnerLenient(m);
    if (winner === a) {
      byId[a].wins += 1;
      byId[b].losses += 1;
      byId[a].matchHistory?.push({ opponentId: b, won: true });
      byId[b].matchHistory?.push({ opponentId: a, won: false });
    } else if (winner === b) {
      byId[b].wins += 1;
      byId[a].losses += 1;
      byId[a].matchHistory?.push({ opponentId: b, won: false });
      byId[b].matchHistory?.push({ opponentId: a, won: true });
    }

    // Increment games played
    byId[a].gamesPlayed = (byId[a].gamesPlayed || 0) + 1;
    byId[b].gamesPlayed = (byId[b].gamesPlayed || 0) + 1;
  }

  // Calculate diff and add legacy field names for UI compatibility
  const arr = Object.values(byId);
  arr.forEach(row => {
    row.diff = row.pf - row.pa;
    // Add legacy field names for UI compatibility
    row.pointsFor = row.pf;
    row.pointsAgainst = row.pa;
    row.pointDifference = row.diff;
  });

  // 2. CACHE mini-standings per wins-group BEFORE sorting
  //    (avoids recomputing inside comparator - sort calls it many times)
  const miniStandingsCache = new Map<number, Map<string, MiniStanding>>();

  const winsGroups = new Map<number, string[]>();
  for (const row of arr) {
    const group = winsGroups.get(row.wins) || [];
    group.push(row.teamId);
    winsGroups.set(row.wins, group);
  }

  for (const [wins, teamIds] of winsGroups) {
    if (teamIds.length >= 2) {
      miniStandingsCache.set(wins, computeMiniStandings(teamIds, completed));
    }
  }

  // 3. Sort using configurable tiebreakers
  arr.sort((teamA, teamB) => {
    for (const tiebreaker of tiebreakers) {
      let comparison = 0;

      switch (tiebreaker) {
        case 'wins':
          comparison = teamB.wins - teamA.wins;
          break;

        case 'head_to_head':
          // H2H only applies when teams have same wins
          if (teamA.wins !== teamB.wins) break;

          const miniCache = miniStandingsCache.get(teamA.wins);
          if (miniCache) {
            const miniA = miniCache.get(teamA.teamId);
            const miniB = miniCache.get(teamB.teamId);
            if (miniA && miniB) {
              // Compare by mini-wins first, then mini-diff
              if (miniB.miniWins !== miniA.miniWins) {
                comparison = miniB.miniWins - miniA.miniWins;
              } else if (miniB.miniDiff !== miniA.miniDiff) {
                comparison = miniB.miniDiff - miniA.miniDiff;
              }
            }
          }
          break;

        case 'point_diff':
          comparison = teamB.diff - teamA.diff;
          break;

        case 'points_scored':
          comparison = teamB.pf - teamA.pf;
          break;
      }

      if (comparison !== 0) return comparison;
    }
    // Stable sort fallback by teamId
    return teamA.teamId.localeCompare(teamB.teamId);
  });

  // 4. Assign ranks
  arr.forEach((row, idx) => {
    row.rank = idx + 1;
  });

  return arr;
}

/**
 * Default tiebreakers in standard order.
 */
export const DEFAULT_TIEBREAKERS: TiebreakerKey[] = [
  'wins',
  'head_to_head',
  'point_diff',
  'points_scored',
];

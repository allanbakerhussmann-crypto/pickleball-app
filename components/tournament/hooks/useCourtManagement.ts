/**
 * useCourtManagement Hook
 *
 * Manages court allocation, match assignment, and queue management.
 *
 * FILE LOCATION: components/tournament/hooks/useCourtManagement.ts
 * VERSION: V07.02 - Premier Courts & Finals Scheduling
 *
 * V07.02 Changes:
 * - Added courtSettings prop for premier court configuration
 * - Added getPreferredCourtForMatch() helper for matchType-based court assignment
 * - Added canFinalsMatchPlay() helper for finals dependency checking
 * - Finals (gold, bronze, plate_final, plate_bronze) wait for their designated courts
 * - Semi-finals prefer semi courts but fall back to any available court
 * - Pool/bracket matches use any available court (no tier restrictions)
 * - Bronze match only plays after Gold final completes
 * - Plate bronze only plays after Plate final completes
 *
 * V06.36 Changes:
 * - Added updatePoolResultsOnMatchComplete() call to finishMatchOnCourt()
 * - Pool standings now update automatically when matches finish via Live Courts
 * - Previously only quickScoreMatch() and matchService functions triggered pool results
 *
 * V06.27 Changes:
 * - Added testMode option to reduce rest time from 8 minutes to 10 seconds
 * - When tournament.testMode is enabled, players only need 10s rest between matches
 * - This dramatically speeds up testing workflows
 *
 * V06.13 Changes:
 * - Queue size now limited by number of courts (not unlimited)
 * - Shows matches for available courts plus 2 "on deck" buffer
 * - Prevents queue from showing 100+ matches when only 4 courts available
 *
 * V06.12 Changes:
 * - Fixed queue eligibility filter to match CourtAllocation display logic
 * - Now accepts any status that's not 'completed' or 'in_progress' (not just 'scheduled')
 * - Ensures queue shows same matches as "WAITING" in organizer view
 *
 * Court Allocation Rules:
 * - Rule 1: Team/Player cannot be on multiple courts simultaneously
 * - Rule 2: One match per court at a time
 * - Rule 3: Complete Round N before Round N+1 (when possible)
 * - Rule 4: Only waiting/scheduled matches in queue
 * - Rule 5: Inactive courts excluded
 * - Rule 6: Fair distribution - teams with fewer played matches get priority
 * - Rule 7: Matches where a team plays itself are excluded (data corruption protection)
 *
 * V06.11 Changes:
 * - CRITICAL: Added validation to prevent matches where a team plays itself
 * - getEligibleMatches() skips matches with same team on both sides
 * - assignMatchToCourt() blocks assignment of self-match with user alert
 * - Logs console errors for debugging data corruption
 *
 * V06.10 Changes:
 * - Originally added team NAME matching for pool play
 * - V07.29: REMOVED name matching - different players can have same name
 * - Now relies solely on team ID and player ID matching
 *
 * V06.09 Changes:
 * - Added fair match queue distribution algorithm (load balancing)
 * - Queue now sorts by: 1) play count (ascending), 2) round number, 3) match number
 * - Teams with fewer completed/in_progress matches are prioritized
 * - Ensures all players play approximately the same number of matches at any time
 * - Both queue calculation and autoAssignFreeCourts use the same algorithm
 *
 * V06.08 Changes:
 * - Added validation to skip matches with missing team IDs
 * - Fixed short-circuit evaluation bug that allowed double-assignments
 * - Added PLAYER-LEVEL conflict detection (not just team IDs)
 * - Now tracks both busyTeamIds AND busyPlayerIds to prevent a player
 *   appearing on multiple courts even if they're in different teams
 */

import { useMemo, useCallback, useEffect, useRef } from 'react';
import type { Match, Court, Division, TournamentCourtSettings, TournamentMatchType } from '../../../types';
import { updateMatchScore, completeMatchWithAdvancement, notifyCourtAssignment, updatePoolResultsOnMatchCompleteSafe } from '../../../services/firebase';
import { validateGameScore } from '../../../services/game/scoreValidation';
import type { GameSettings } from '../../../types/game/gameSettings';

/**
 * Options for court management hook
 */
interface CourtManagementOptions {
  testMode?: boolean;
  // Future: customRestTimeMs?, autoAssign?, etc.
}

interface UseCourtManagementProps {
  tournamentId: string;
  matches: Match[];
  courts: Court[];
  divisions: Division[];
  autoAssignOnRestComplete?: boolean; // Auto-assign matches when rest time ends
  options?: CourtManagementOptions;   // V06.27: Additional options (testMode, etc.)
  courtSettings?: TournamentCourtSettings;  // V07.02: Premier court settings
}

interface CourtViewModel {
  id: string;
  name: string;
  status: 'AVAILABLE' | 'ASSIGNED' | 'IN_USE' | 'OUT_OF_SERVICE';
  currentMatchId?: string;
}

// FIXED: Changed team1Name/team2Name to teamAName/teamBName
interface CourtMatchModel {
  id: string;
  division: string;
  roundLabel: string;
  matchLabel: string;
  teamAName: string;  // FIXED: was team1Name
  teamBName: string;  // FIXED: was team2Name
  status: 'WAITING' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED';
  courtId?: string;
  courtName?: string;
  // V06.22: Rest timer info for queue display
  restingUntil?: number;  // Timestamp when all players have sufficient rest
  isReady: boolean;       // True if match can be assigned now (no rest needed)
}

/**
 * Generate a descriptive round label for court display
 * Examples: "Gold Final", "Bronze Match", "Plate Semi", "Pool A", "Quarter-Final"
 */
function getMatchRoundLabel(m: Match): string {
  // Use matchType for most descriptive labeling
  switch (m.matchType) {
    case 'final':
      return 'Gold Final';
    case 'bronze':
      return 'Bronze Match';
    case 'plate_final':
      return 'Plate Final';
    case 'plate_bronze':
      return 'Plate 3rd';
    case 'semifinal':
      if (m.bracketType === 'plate') {
        return 'Plate Semi';
      }
      return 'Semi-Final';
    case 'bracket':
      // For bracket matches, try to determine round name
      if (m.stage && m.stage !== 'bracket') {
        return m.stage;
      }
      // Check roundNumber for quarter-finals, etc.
      if (m.roundNumber) {
        const roundNames: Record<number, string> = {
          1: 'Round of 16',
          2: 'Quarter-Final',
          3: 'Semi-Final',
          4: 'Final',
        };
        const label = roundNames[m.roundNumber] || `Round ${m.roundNumber}`;
        const bracketPrefix = m.bracketType === 'plate' ? 'Plate ' : '';
        return `${bracketPrefix}${label}`;
      }
      return m.bracketType === 'plate' ? 'Plate Bracket' : 'Bracket';
    case 'pool':
      if (m.poolGroup) {
        return `Pool ${m.poolGroup}`;
      }
      return 'Pool Play';
    default:
      // Fallback: use stage or round number
      if (m.stage && m.stage !== 'bracket' && m.stage !== 'Unknown') {
        return m.stage;
      }
      if (m.poolGroup) {
        return `Pool ${m.poolGroup}`;
      }
      return `Round ${m.roundNumber || 1}`;
  }
}

interface UseCourtManagementReturn {
  // View models
  courtViewModels: CourtViewModel[];
  courtMatchModels: CourtMatchModel[];
  queueMatchModels: CourtMatchModel[];  // Smart-filtered queue in CourtMatchModel format

  // Queue
  queue: Match[];
  waitTimes: Record<string, number>;

  // Helpers
  getBusyTeamIds: () => Set<string>;
  findActiveConflictMatch: (match: Match) => Match | undefined;

  // Actions
  assignMatchToCourt: (matchId: string, courtName: string) => Promise<void>;
  startMatchOnCourt: (courtId: string) => Promise<void>;
  finishMatchOnCourt: (courtId: string, scoreTeamA?: number, scoreTeamB?: number, scores?: Array<{ gameNumber?: number; scoreA: number; scoreB: number }>) => Promise<void>;
  handleAssignCourt: (matchId: string) => Promise<void>;
  autoAssignFreeCourts: (options?: { silent?: boolean }) => Promise<void>;
}

// Minimum rest time between matches
const REST_TIME_MINIMUM_MS = 8 * 60 * 1000;        // 8 minutes for production
const TEST_REST_TIME_MINIMUM_MS = 10 * 1000;       // 10 seconds for test mode

export const useCourtManagement = ({
  tournamentId,
  matches,
  courts,
  divisions,
  autoAssignOnRestComplete = false,
  options = {},
  courtSettings,
}: UseCourtManagementProps): UseCourtManagementReturn => {

  // V06.27: Use shorter rest time in test mode for faster iteration
  const { testMode = false } = options;
  const effectiveRestTime = testMode ? TEST_REST_TIME_MINIMUM_MS : REST_TIME_MINIMUM_MS;

  // V07.02: Helper to get preferred court for a match based on matchType
  const getPreferredCourtForMatch = useCallback((match: Match): string | string[] | null => {
    if (!courtSettings) return null;

    const matchType = match.matchType as TournamentMatchType | undefined;
    if (!matchType) return null;

    switch (matchType) {
      case 'final':
      case 'bronze':
        return courtSettings.goldCourtId || null;
      case 'plate_final':
      case 'plate_bronze':
        return courtSettings.plateCourtId || null;
      case 'semifinal':
        return courtSettings.semiCourtIds || null;
      default:
        return null;  // Pool/bracket matches can use any court
    }
  }, [courtSettings]);

  // V07.02: Helper to check if a finals match can play (dependency checking)
  const canFinalsMatchPlay = useCallback((match: Match, allMatches: Match[]): boolean => {
    const matchType = match.matchType as TournamentMatchType | undefined;
    if (!matchType) return true;

    // Bronze can only play after Gold final is complete
    if (matchType === 'bronze') {
      const goldFinal = allMatches.find(m => m.matchType === 'final' && m.bracketType !== 'plate');
      return goldFinal?.status === 'completed';
    }

    // Plate bronze can only play after Plate final is complete
    if (matchType === 'plate_bronze') {
      const plateFinal = allMatches.find(m => m.matchType === 'plate_final');
      return plateFinal?.status === 'completed';
    }

    // Finals can only play after all semis are complete
    if (matchType === 'final' || matchType === 'plate_final') {
      const bracketType = match.bracketType || 'main';
      const semis = allMatches.filter(m =>
        m.matchType === 'semifinal' &&
        (m.bracketType || 'main') === bracketType
      );
      return semis.length === 0 || semis.every(s => s.status === 'completed');
    }

    return true;
  }, []);

  // Safeguard: ensure arrays are never undefined
  const safeMatches = matches || [];
  const safeCourts = courts || [];
  const safeDivisions = divisions || [];

  // ============================================
  // Helper: Get player's rest time since last completed match
  // Returns milliseconds since last match completion, or Infinity if never played
  // ============================================

  const getPlayerRestTime = useCallback((playerId: string): number => {
    const completedMatches = safeMatches.filter(m => {
      if (m.status !== 'completed' || !m.completedAt) return false;
      const playerIdsA = m.sideA?.playerIds || [];
      const playerIdsB = m.sideB?.playerIds || [];
      return playerIdsA.includes(playerId) || playerIdsB.includes(playerId);
    });

    if (completedMatches.length === 0) return Infinity;

    // Find most recent match
    const mostRecent = completedMatches.reduce((latest, m) =>
      (m.completedAt || 0) > (latest.completedAt || 0) ? m : latest
    );

    return Date.now() - (mostRecent.completedAt || 0);
  }, [safeMatches]);

  // ============================================
  // Helper: Check if player has sufficient rest (8 min production / 10s test mode)
  // ============================================

  const playerHasSufficientRest = useCallback((playerId: string): boolean => {
    return getPlayerRestTime(playerId) >= effectiveRestTime;
  }, [getPlayerRestTime, effectiveRestTime]);

  // ============================================
  // Helper: Get when a player will have sufficient rest
  // Returns timestamp when player is ready, or 0 if ready now
  // ============================================

  const getPlayerRestingUntil = useCallback((playerId: string): number => {
    const restTime = getPlayerRestTime(playerId);
    if (restTime >= effectiveRestTime) return 0; // Already rested

    // Calculate when they'll be ready
    const completedMatches = safeMatches.filter(m => {
      if (m.status !== 'completed' || !m.completedAt) return false;
      const playerIdsA = m.sideA?.playerIds || [];
      const playerIdsB = m.sideB?.playerIds || [];
      return playerIdsA.includes(playerId) || playerIdsB.includes(playerId);
    });

    if (completedMatches.length === 0) return 0; // Never played

    const mostRecent = completedMatches.reduce((latest, m) =>
      (m.completedAt || 0) > (latest.completedAt || 0) ? m : latest
    );

    return (mostRecent.completedAt || 0) + effectiveRestTime;
  }, [getPlayerRestTime, safeMatches, effectiveRestTime]);

  // ============================================
  // Helper: Get when ALL players in a match will be rested
  // Returns timestamp when match is ready, or 0 if ready now
  // ============================================

  const getMatchRestingUntil = useCallback((match: Match): number => {
    const playerIdsA = match.sideA?.playerIds || [];
    const playerIdsB = match.sideB?.playerIds || [];
    const allPlayerIds = [...playerIdsA, ...playerIdsB].filter(Boolean);

    if (allPlayerIds.length === 0) return 0;

    // Find the latest rest time among all players
    let maxRestingUntil = 0;
    for (const pid of allPlayerIds) {
      const restingUntil = getPlayerRestingUntil(pid);
      if (restingUntil > maxRestingUntil) {
        maxRestingUntil = restingUntil;
      }
    }

    return maxRestingUntil;
  }, [getPlayerRestingUntil]);

  // ============================================
  // Helper: Get pool progress for fair distribution
  // Returns { poolGroup: { total, completed, completionRate } }
  // ============================================

  const getPoolProgress = useCallback((): Map<string, { total: number; completed: number; rate: number }> => {
    const progress = new Map<string, { total: number; completed: number; rate: number }>();

    safeMatches.forEach(m => {
      const poolGroup = m.poolGroup || 'default';
      const current = progress.get(poolGroup) || { total: 0, completed: 0, rate: 0 };
      current.total++;
      if (m.status === 'completed') current.completed++;
      current.rate = current.total > 0 ? current.completed / current.total : 0;
      progress.set(poolGroup, current);
    });

    return progress;
  }, [safeMatches]);

  // ============================================
  // Helper: Get busy team IDs AND player IDs (on court)
  // ============================================

  const getBusyTeamIds = useCallback(() => {
    const busy = new Set<string>();
    safeMatches.forEach(m => {
      if (!m.court) return;
      if (m.status === 'completed') return;
      // Support both OLD (teamAId/teamBId) and NEW (sideA/sideB) match structures
      const teamAId = m.teamAId || m.sideA?.id;
      const teamBId = m.teamBId || m.sideB?.id;
      // Only add valid (non-empty) team IDs to busy set
      if (teamAId && teamAId.trim()) busy.add(teamAId);
      if (teamBId && teamBId.trim()) busy.add(teamBId);
      // ALSO add player IDs to catch player-level conflicts
      (m.sideA?.playerIds || []).forEach(pid => { if (pid) busy.add(pid); });
      (m.sideB?.playerIds || []).forEach(pid => { if (pid) busy.add(pid); });
    });
    return busy;
  }, [safeMatches]);

  // ============================================
  // DYNAMIC Queue calculation with fair distribution + rest time + pool balance
  // Called FRESH each time a court becomes free - not cached!
  // ============================================

  const getEligibleMatches = useCallback((): { eligible: Match[]; scores: Record<string, number> } => {
    // Track busy teams AND busy players (currently on court)
    // V07.29: Removed busyTeamNames - different players can have same name
    const busyTeams = new Set<string>();
    const busyPlayers = new Set<string>();

    // Calculate play counts per team (in_progress + completed safeMatches)
    const teamPlayCount = new Map<string, number>();

    // Get pool progress for balance scoring
    const poolProgress = getPoolProgress();

    safeMatches.forEach(m => {
      const teamAId = m.teamAId || m.sideA?.id;
      const teamBId = m.teamBId || m.sideB?.id;

      // Count matches that are in_progress or completed for fair distribution
      const isPlayed = m.status === 'in_progress' || m.status === 'completed';
      if (isPlayed) {
        if (teamAId) teamPlayCount.set(teamAId, (teamPlayCount.get(teamAId) || 0) + 1);
        if (teamBId) teamPlayCount.set(teamBId, (teamPlayCount.get(teamBId) || 0) + 1);
      }

      // Track busy teams (currently on court - either scheduled or in_progress)
      if (!m.court) return;
      if (m.status === 'completed') return;

      // Mark team IDs as busy
      if (teamAId && teamAId.trim()) busyTeams.add(teamAId);
      if (teamBId && teamBId.trim()) busyTeams.add(teamBId);

      // Mark player IDs as busy (from sideA/sideB.playerIds)
      (m.sideA?.playerIds || []).forEach(pid => { if (pid) busyPlayers.add(pid); });
      (m.sideB?.playerIds || []).forEach(pid => { if (pid) busyPlayers.add(pid); });

      // ALSO add team IDs to busyPlayers as fallback (in case playerIds is empty)
      // This ensures team-level conflict detection even if playerIds aren't populated
      if (teamAId) busyPlayers.add(teamAId);
      if (teamBId) busyPlayers.add(teamBId);
    });

    // Multi-factor scoring: lower score = higher priority
    // Factors: pool progress, play count, rest time bonus, round number
    const scoreMatch = (m: Match): number => {
      let score = 0;
      const teamAId = m.teamAId || m.sideA?.id;
      const teamBId = m.teamBId || m.sideB?.id;

      // Factor 1: Pool balance - behind pools get LOWER score (higher priority)
      // Pool completion rate * 100 (0-100 range)
      const poolGroup = m.poolGroup || 'default';
      const poolInfo = poolProgress.get(poolGroup);
      if (poolInfo) {
        score += poolInfo.rate * 100; // Lower completion = lower score = higher priority
      }

      // Factor 2: Play count fairness - teams with fewer games get priority
      // Range: 0-50 per team
      const countA = teamAId ? (teamPlayCount.get(teamAId) || 0) : 0;
      const countB = teamBId ? (teamPlayCount.get(teamBId) || 0) : 0;
      score += Math.max(countA, countB) * 10;

      // Factor 3: Rest time bonus - players with more rest get slightly lower score
      // This is a tiebreaker, range: 0-10
      const playerIdsA = m.sideA?.playerIds || [];
      const playerIdsB = m.sideB?.playerIds || [];
      const allPlayerIds = [...playerIdsA, ...playerIdsB].filter(Boolean);
      if (allPlayerIds.length > 0) {
        const avgRestTime = allPlayerIds.reduce((sum, pid) => {
          const rest = getPlayerRestTime(pid);
          return sum + (rest === Infinity ? effectiveRestTime * 2 : rest);
        }, 0) / allPlayerIds.length;
        // More rest = lower score (inverted, capped at 10)
        score -= Math.min(10, avgRestTime / effectiveRestTime * 5);
      }

      // Factor 4: Round number - earlier rounds first
      score += (m.roundNumber || 1) * 5;

      return score;
    };

    // Get all waiting matches
    // Match the same logic as courtMatchModels: any match that's not completed,
    // not in_progress, and has no court assigned is considered waiting/eligible
    const candidates = safeMatches.filter(m => {
      const status = m.status ?? 'scheduled';
      const isActive = status === 'completed' || status === 'in_progress';
      // Waiting = NOT completed, NOT in_progress, and no court assigned
      // NOTE: court might be null, undefined, or empty string - all should be considered "no court"
      const hasCourt = m.court && m.court.trim() !== '';
      return !isActive && !hasCourt;
    });

    // Filter for eligibility and score
    const eligible: Match[] = [];
    const scores: Record<string, number> = {};

    candidates.forEach(m => {
      const teamAId = m.teamAId || m.sideA?.id;
      const teamBId = m.teamBId || m.sideB?.id;
      const teamAName = m.sideA?.name || '';
      const teamBName = m.sideB?.name || '';

      // Skip matches with missing team IDs or TBD (bracket matches awaiting opponents)
      // V07.29: Added TBD check - bracket matches have placeholder 'TBD' until winners advance
      if (!teamAId || !teamBId || teamAId === 'TBD' || teamBId === 'TBD') {
        scores[m.id] = -1;
        return;
      }

      // Also check for TBD names (safety check for bracket matches)
      if (teamAName === 'TBD' || teamBName === 'TBD') {
        scores[m.id] = -1;
        return;
      }

      // CRITICAL: Skip matches where team plays itself (data corruption)
      if (teamAId === teamBId) {
        console.error(`[Court Allocation] Match ${m.id} has same team on both sides: ${teamAId}`);
        scores[m.id] = -1;
        return;
      }
      if (teamAName && teamBName && teamAName.toLowerCase() === teamBName.toLowerCase()) {
        console.error(`[Court Allocation] Match ${m.id} has same team name on both sides: ${teamAName}`);
        scores[m.id] = -1;
        return;
      }

      // Check 1: Team/player not currently on court
      const teamBusy = busyTeams.has(teamAId) || busyTeams.has(teamBId);
      const playerIdsA = m.sideA?.playerIds || [];
      const playerIdsB = m.sideB?.playerIds || [];

      // Check player IDs AND team IDs (team IDs are added to busyPlayers as fallback)
      const playerBusy = playerIdsA.some(p => p && busyPlayers.has(p)) ||
                         playerIdsB.some(p => p && busyPlayers.has(p)) ||
                         busyPlayers.has(teamAId) ||
                         busyPlayers.has(teamBId);

      // V07.29: Removed name-based check - different players can have same name
      if (teamBusy || playerBusy) {
        scores[m.id] = scoreMatch(m) + 1000; // High penalty for conflicts
        return;
      }

      // Check 2: All players have sufficient rest (8 min minimum)
      const allPlayerIds = [...playerIdsA, ...playerIdsB].filter(Boolean);
      const hasInsufficientRest = allPlayerIds.some(pid => !playerHasSufficientRest(pid));

      if (hasInsufficientRest) {
        scores[m.id] = scoreMatch(m) + 500; // Penalty for insufficient rest
        return;
      }

      // Match is eligible!
      scores[m.id] = scoreMatch(m);
      eligible.push(m);
    });

    // Sort eligible matches by score (lower = higher priority)
    eligible.sort((a, b) => (scores[a.id] || 0) - (scores[b.id] || 0));

    return { eligible, scores };
  }, [safeMatches, getPlayerRestTime, playerHasSufficientRest, getPoolProgress]);

  // Build a realistic queue where each team can only appear ONCE
  // Queue size is limited by the number of AVAILABLE courts
  // This simulates: once a team is queued, they're blocked until that match completes
  const { queue, waitTimes } = useMemo(() => {
    const { eligible, scores } = getEligibleMatches();

    // Count available courts (active courts not currently in use)
    const activeCourts = safeCourts.filter(c => c.active !== false);
    const occupiedCourts = safeMatches.filter(m =>
      m.court && (m.status === 'in_progress' || (m.status !== 'completed' && m.court))
    ).length;
    const availableCourtCount = Math.max(0, activeCourts.length - occupiedCourts);

    // Queue should show matches for available courts PLUS a buffer for "on deck"
    // If all courts occupied, still show what's coming up next
    const maxQueueSize = Math.max(activeCourts.length, availableCourtCount + 2);

    // Build queue by adding matches one at a time, blocking teams as we go
    // V07.29: Removed queuedTeamNames - different players can have same name
    const queuedTeams = new Set<string>();
    const queuedPlayers = new Set<string>();
    const finalQueue: Match[] = [];

    for (const match of eligible) {
      // Stop if we've reached the max queue size
      if (finalQueue.length >= maxQueueSize) {
        break;
      }

      const teamAId = match.teamAId || match.sideA?.id;
      const teamBId = match.teamBId || match.sideB?.id;
      const playerIdsA = match.sideA?.playerIds || [];
      const playerIdsB = match.sideB?.playerIds || [];

      // Check if any team or player is already queued (by ID or player ID)
      // V07.29: Removed name-based check - different players can have same name
      const teamAlreadyQueued =
        (teamAId && queuedTeams.has(teamAId)) ||
        (teamBId && queuedTeams.has(teamBId)) ||
        playerIdsA.some(p => p && queuedPlayers.has(p)) ||
        playerIdsB.some(p => p && queuedPlayers.has(p));

      if (teamAlreadyQueued) {
        // Skip this match - one of the teams is already in the queue
        continue;
      }

      // Add to queue and mark teams/players as queued
      finalQueue.push(match);
      if (teamAId) queuedTeams.add(teamAId);
      if (teamBId) queuedTeams.add(teamBId);
      playerIdsA.forEach(p => { if (p) queuedPlayers.add(p); });
      playerIdsB.forEach(p => { if (p) queuedPlayers.add(p); });
    }

    return { queue: finalQueue, waitTimes: scores };
  }, [getEligibleMatches, courts, safeMatches]);

  // ============================================
  // Court View Models
  // ============================================

  const courtViewModels = useMemo((): CourtViewModel[] => {
    return safeCourts.map(court => {
      const currentMatch = safeMatches.find(
        m => m.court === court.name && m.status !== 'completed'
      );

      let status: CourtViewModel['status'];

      if (court.active === false) {
        status = 'OUT_OF_SERVICE';
      } else if (!currentMatch) {
        status = 'AVAILABLE';
      } else if (currentMatch.status === 'in_progress') {
        status = 'IN_USE';
      } else {
        status = 'ASSIGNED';
      }

      return {
        id: court.id,
        name: court.name,
        status,
        currentMatchId: currentMatch?.id,
      };
    });
  }, [safeCourts, safeMatches]);

  // ============================================
  // Match View Models for Courts
  // ============================================

  const courtMatchModels = useMemo((): CourtMatchModel[] => {
    return safeMatches.map(m => {
      const division = safeDivisions.find(d => d.id === m.divisionId);
      const court = safeCourts.find(c => c.name === m.court);

      let status: CourtMatchModel['status'];

      if (m.status === 'completed') {
        status = 'COMPLETED';
      } else if (m.status === 'in_progress') {
        status = 'IN_PROGRESS';
      } else if (m.court) {
        status = 'ASSIGNED';
      } else {
        status = 'WAITING';
      }

      // Support both OLD (teamAId/teamBId) and NEW (sideA/sideB) match structures
      const teamAName = m.sideA?.name || m.teamAId || 'TBD';
      const teamBName = m.sideB?.name || m.teamBId || 'TBD';

      return {
        id: m.id,
        division: division?.name || '',
        roundLabel: getMatchRoundLabel(m),
        matchLabel: `Match ${m.matchNumber ?? m.id.slice(-4)}`,
        teamAName,
        teamBName,
        status,
        courtId: court?.id,
        courtName: court?.name,
        isReady: true, // courtMatchModels are all matches, not queue-filtered
      };
    });
  }, [safeMatches, safeDivisions, safeCourts]);

  // ============================================
  // Queue Match Models (smart-filtered queue in CourtMatchModel format)
  // This is the FILTERED queue that accounts for busy teams, rest time, etc.
  // Used by CourtAllocation to show only eligible matches
  // V06.22: Now includes rest timer info (restingUntil, isReady)
  // ============================================

  const queueMatchModels = useMemo((): CourtMatchModel[] => {
    const now = Date.now();

    // Get ALL pending matches (not just eligible ones) so we can show resting matches too
    const pendingMatches = safeMatches.filter(m => {
      const status = m.status ?? 'scheduled';
      const isActive = status === 'completed' || status === 'in_progress';
      const hasCourt = m.court && m.court.trim() !== '';
      return !isActive && !hasCourt;
    });

    // Get busy teams/players (on court)
    // V07.29: Removed busyTeamNames - different players can have same name
    const busyTeams = new Set<string>();
    const busyPlayers = new Set<string>();

    safeMatches.forEach(m => {
      if (!m.court || m.status === 'completed') return;
      const teamAId = m.teamAId || m.sideA?.id;
      const teamBId = m.teamBId || m.sideB?.id;
      if (teamAId) busyTeams.add(teamAId);
      if (teamBId) busyTeams.add(teamBId);
      (m.sideA?.playerIds || []).forEach(pid => { if (pid) busyPlayers.add(pid); });
      (m.sideB?.playerIds || []).forEach(pid => { if (pid) busyPlayers.add(pid); });
    });

    // Map matches with rest info
    const modelsWithRestInfo = pendingMatches.map(m => {
      const division = safeDivisions.find(d => d.id === m.divisionId);
      const teamAId = m.teamAId || m.sideA?.id;
      const teamBId = m.teamBId || m.sideB?.id;
      const teamAName = m.sideA?.name || teamAId || 'TBD';
      const teamBName = m.sideB?.name || teamBId || 'TBD';

      // Check if teams are busy (on court)
      // V07.29: Removed name-based check - different players can have same name
      const isBusy =
        (teamAId && (busyTeams.has(teamAId) || busyPlayers.has(teamAId))) ||
        (teamBId && (busyTeams.has(teamBId) || busyPlayers.has(teamBId))) ||
        (m.sideA?.playerIds || []).some(p => p && busyPlayers.has(p)) ||
        (m.sideB?.playerIds || []).some(p => p && busyPlayers.has(p));

      // Skip matches where teams are on court
      if (isBusy) return null;

      // V07.29: Skip TBD matches (bracket matches awaiting opponents)
      if (!teamAId || !teamBId || teamAId === 'TBD' || teamBId === 'TBD' ||
          teamAName === 'TBD' || teamBName === 'TBD') {
        return null;
      }

      // Skip self-matches
      if (teamAId && teamBId && teamAId === teamBId) return null;
      if (teamAName && teamBName && teamAName.toLowerCase() === teamBName.toLowerCase()) return null;

      // Get rest time info
      const restingUntil = getMatchRestingUntil(m);
      const isReady = restingUntil === 0 || restingUntil <= now;

      return {
        id: m.id,
        division: division?.name || '',
        roundLabel: getMatchRoundLabel(m),
        matchLabel: `Match ${m.matchNumber ?? m.id.slice(-4)}`,
        teamAName,
        teamBName,
        status: 'WAITING' as const,
        courtId: undefined,
        courtName: undefined,
        restingUntil: restingUntil > now ? restingUntil : undefined,
        isReady,
      };
    }).filter((m): m is NonNullable<typeof m> => m !== null);

    // Sort: ready matches first, then by rest time (soonest first)
    modelsWithRestInfo.sort((a, b) => {
      if (a.isReady && !b.isReady) return -1;
      if (!a.isReady && b.isReady) return 1;
      // Both resting: sort by soonest
      if (!a.isReady && !b.isReady) {
        return (a.restingUntil || 0) - (b.restingUntil || 0);
      }
      return 0;
    });

    // Limit to reasonable queue size
    const activeCourts = safeCourts.filter(c => c.active !== false);
    const maxQueueSize = Math.max(activeCourts.length + 3, 6);

    return modelsWithRestInfo.slice(0, maxQueueSize);
  }, [safeMatches, safeDivisions, safeCourts, getMatchRestingUntil]);

  // ============================================
  // Conflict Detection
  // ============================================

  const findActiveConflictMatch = useCallback((match: Match): Match | undefined => {
    // Support both OLD (teamAId/teamBId) and NEW (sideA/sideB) match structures
    const matchTeamAId = match.teamAId || match.sideA?.id;
    const matchTeamBId = match.teamBId || match.sideB?.id;
    const matchPlayerIds = [
      ...(match.sideA?.playerIds || []),
      ...(match.sideB?.playerIds || []),
    ].filter(Boolean);

    // Can't detect conflicts if match has no valid team IDs AND no player IDs
    if (!matchTeamAId && !matchTeamBId && matchPlayerIds.length === 0) {
      console.warn(`[Conflict Check] Match ${match.id} has no team or player IDs, cannot check for conflicts`);
      return undefined;
    }

    return safeMatches.find(m => {
      if (m.id === match.id) return false;
      if (!m.court) return false;
      if (m.status === 'completed') return false;

      const mTeamAId = m.teamAId || m.sideA?.id;
      const mTeamBId = m.teamBId || m.sideB?.id;
      const mPlayerIds = [
        ...(m.sideA?.playerIds || []),
        ...(m.sideB?.playerIds || []),
      ].filter(Boolean);

      // Check for team conflicts - only compare non-empty IDs
      const teamConflict = (
        (matchTeamAId && mTeamAId && mTeamAId === matchTeamAId) ||
        (matchTeamAId && mTeamBId && mTeamBId === matchTeamAId) ||
        (matchTeamBId && mTeamAId && mTeamAId === matchTeamBId) ||
        (matchTeamBId && mTeamBId && mTeamBId === matchTeamBId)
      );

      // Check for player conflicts - any player in common
      const playerConflict = matchPlayerIds.some(pid => mPlayerIds.includes(pid));

      return teamConflict || playerConflict;
    });
  }, [safeMatches]);

  // ============================================
  // Court Actions
  // ============================================

  const assignMatchToCourt = useCallback(async (matchId: string, courtName: string) => {
    const match = safeMatches.find(m => m.id === matchId);
    if (!match) return;

    // V07.29: Block matches with TBD (undetermined) opponents
    const teamAId = match.teamAId || match.sideA?.id;
    const teamBId = match.teamBId || match.sideB?.id;
    const teamAName = match.sideA?.name || '';
    const teamBName = match.sideB?.name || '';

    if (!teamAId || !teamBId || teamAId === 'TBD' || teamBId === 'TBD' ||
        teamAName === 'TBD' || teamBName === 'TBD') {
      alert('Cannot assign this match: one or more opponents have not been determined yet (TBD). Wait for earlier bracket matches to complete.');
      return;
    }

    // CRITICAL: Prevent assigning matches where a team plays itself
    if (teamAId && teamBId && teamAId === teamBId) {
      alert('Cannot assign this match: both teams are the same (data error). Please delete and recreate this match.');
      console.error(`[Court Assignment] Match ${matchId} has same team ID on both sides: ${teamAId}`);
      return;
    }
    if (teamAName && teamBName && teamAName.toLowerCase() === teamBName.toLowerCase()) {
      alert('Cannot assign this match: both teams have the same name (possible data error). Please verify the match data.');
      console.error(`[Court Assignment] Match ${matchId} has same team name on both sides: ${teamAName}`);
      return;
    }

    const conflict = findActiveConflictMatch(match);
    if (conflict) {
      alert(
        `Cannot assign this match: one of the teams is already playing or waiting on court ${conflict.court}. Finish that match first.`
      );
      return;
    }

    await updateMatchScore(tournamentId, matchId, {
      court: courtName,
      status: 'scheduled',
    });

    // Notify all players in the match that they're on court
    const playerIds = [
      ...(match.sideA?.playerIds || []),
      ...(match.sideB?.playerIds || []),
    ].filter(Boolean);

    if (playerIds.length > 0) {
      // Get opponent name for context in notification
      const sideAName = match.sideA?.name || 'Team A';
      const sideBName = match.sideB?.name || 'Team B';

      try {
        await notifyCourtAssignment(
          playerIds,
          tournamentId,
          matchId,
          courtName,
          `${sideAName} vs ${sideBName}`
        );
      } catch (error) {
        console.error('Failed to send court assignment notifications:', error);
        // Don't block the court assignment if notifications fail
      }
    }
  }, [tournamentId, safeMatches, findActiveConflictMatch]);

  const startMatchOnCourt = useCallback(async (courtId: string) => {
    const court = safeCourts.find(c => c.id === courtId);
    if (!court) return;

    const match = safeMatches.find(
      m => m.court === court.name && m.status !== 'completed'
    );
    if (!match) return;

    await updateMatchScore(tournamentId, match.id, {
      status: 'in_progress',
      startTime: Date.now(),
    });
  }, [tournamentId, safeCourts, safeMatches]);

  const finishMatchOnCourt = useCallback(async (
    courtId: string,
    scoreTeamA?: number,
    scoreTeamB?: number,
    scoresFromModal?: Array<{ gameNumber?: number; scoreA: number; scoreB: number }>
  ) => {
    console.log('[finishMatchOnCourt] Called with:', { courtId, scoreTeamA, scoreTeamB, scoresFromModal });
    console.log('[finishMatchOnCourt] Available courts:', safeCourts.map(c => ({ id: c.id, name: c.name })));

    const court = safeCourts.find(c => c.id === courtId);
    if (!court) {
      console.error('[finishMatchOnCourt] Court not found! courtId:', courtId);
      return;
    }
    console.log('[finishMatchOnCourt] Found court:', court.name);

    const currentMatch = safeMatches.find(
      m => m.court === court.name && m.status !== 'completed'
    );
    if (!currentMatch) {
      console.error('[finishMatchOnCourt] No match found on court:', court.name);
      alert('No active match found on this court.');
      return;
    }
    console.log('[finishMatchOnCourt] Found match:', currentMatch.id, 'status:', currentMatch.status);

    // Check if scores were passed from ScoreEntryModal (V07.07: new parameter)
    const hasModalScores =
      Array.isArray(scoresFromModal) &&
      scoresFromModal.length > 0 &&
      scoresFromModal[0]?.scoreA !== undefined &&
      scoresFromModal[0]?.scoreB !== undefined;
    console.log('[finishMatchOnCourt] hasModalScores:', hasModalScores);

    // Support both OLD (scoreTeamAGames) and NEW (scores[]) formats
    const existingHasOldScores =
      Array.isArray(currentMatch.scoreTeamAGames) &&
      currentMatch.scoreTeamAGames.length > 0 &&
      Array.isArray(currentMatch.scoreTeamBGames) &&
      currentMatch.scoreTeamBGames.length > 0;

    const existingHasNewScores =
      Array.isArray(currentMatch.scores) &&
      currentMatch.scores.length > 0 &&
      currentMatch.scores[0]?.scoreA !== undefined &&
      currentMatch.scores[0]?.scoreB !== undefined;

    const existingHasScores = existingHasOldScores || existingHasNewScores;

    const inlineHasScores =
      typeof scoreTeamA === 'number' &&
      !Number.isNaN(scoreTeamA) &&
      typeof scoreTeamB === 'number' &&
      !Number.isNaN(scoreTeamB);

    if (!hasModalScores && !existingHasScores && !inlineHasScores) {
      alert('Please enter scores for both teams before finishing this match.');
      return;
    }

    // Determine winner by counting GAMES WON (not just first game score)
    // This is critical for best-of-3 and best-of-5 matches
    let gamesWonA = 0;
    let gamesWonB = 0;
    let allScores: Array<{ scoreA: number; scoreB: number }> = [];

    // V07.07: Prioritize scores from modal (most reliable source)
    if (hasModalScores) {
      for (const game of scoresFromModal!) {
        const scoreA = game.scoreA ?? 0;
        const scoreB = game.scoreB ?? 0;
        allScores.push({ scoreA, scoreB });
        if (scoreA > scoreB) gamesWonA++;
        else if (scoreB > scoreA) gamesWonB++;
      }
    } else if (existingHasOldScores) {
      // Legacy format: scoreTeamAGames[] and scoreTeamBGames[]
      const scoresA = currentMatch.scoreTeamAGames!;
      const scoresB = currentMatch.scoreTeamBGames!;
      for (let i = 0; i < scoresA.length; i++) {
        const scoreA = scoresA[i];
        const scoreB = scoresB[i] ?? 0;
        allScores.push({ scoreA, scoreB });
        if (scoreA > scoreB) gamesWonA++;
        else if (scoreB > scoreA) gamesWonB++;
      }
    } else if (existingHasNewScores) {
      // Modern format: scores[] array
      for (const game of currentMatch.scores!) {
        const scoreA = game.scoreA ?? 0;
        const scoreB = game.scoreB ?? 0;
        allScores.push({ scoreA, scoreB });
        if (scoreA > scoreB) gamesWonA++;
        else if (scoreB > scoreA) gamesWonB++;
      }
    } else {
      // Inline scores (single game)
      const scoreA = scoreTeamA as number;
      const scoreB = scoreTeamB as number;
      allScores.push({ scoreA, scoreB });
      if (scoreA > scoreB) gamesWonA++;
      else if (scoreB > scoreA) gamesWonB++;
    }

    // Get game settings from division for validation
    // Check multiple possible locations: division.format, division.gameSettings, or direct properties
    const division = safeDivisions.find(d => d.id === currentMatch.divisionId);
    const fmt = division?.format;
    const gs = (division as any)?.gameSettings;

    const gameSettings: GameSettings = {
      playType: (fmt as any)?.playType ?? gs?.playType ?? 'doubles',
      pointsPerGame: fmt?.pointsPerGame ?? gs?.pointsToWin ?? gs?.pointsPerGame ?? 11,
      winBy: fmt?.winBy ?? gs?.winBy ?? 2,
      bestOf: fmt?.bestOfGames ?? gs?.bestOf ?? 1,
    };

    console.log('[finishMatchOnCourt] allScores:', allScores);
    console.log('[finishMatchOnCourt] gameSettings for validation:', gameSettings);

    // Validate all scores against game rules
    for (let i = 0; i < allScores.length; i++) {
      const game = allScores[i];
      const validation = validateGameScore(game.scoreA, game.scoreB, gameSettings);
      console.log('[finishMatchOnCourt] Validation result for game', i + 1, ':', validation);
      if (!validation.valid) {
        alert(`Game ${i + 1} score invalid: ${validation.error}\n\nRules: First to ${gameSettings.pointsPerGame}, win by ${gameSettings.winBy}`);
        return;
      }
    }

    // Support both OLD (teamAId/teamBId) and NEW (sideA/sideB) match structures
    const teamAId = currentMatch.teamAId || currentMatch.sideA?.id || '';
    const teamBId = currentMatch.teamBId || currentMatch.sideB?.id || '';
    console.log('[finishMatchOnCourt] teamAId:', teamAId, 'teamBId:', teamBId);

    // Winner is determined by who won more GAMES, not just first game
    const winnerId = gamesWonA > gamesWonB ? teamAId : teamBId;

    // Build scores in format expected by completeMatchWithAdvancement
    const scoresForAdvancement = allScores.map(s => ({
      team1Score: s.scoreA,
      team2Score: s.scoreB,
    }));

    // Check if this is a bracket match that needs advancement
    if (currentMatch.nextMatchId && currentMatch.nextMatchSlot) {
      // Use completeMatchWithAdvancement for bracket matches
      await completeMatchWithAdvancement(
        tournamentId,
        currentMatch.id,
        winnerId as string,
        scoresForAdvancement
      );

      // Clear the court assignment
      await updateMatchScore(tournamentId, currentMatch.id, { court: '' });
    } else {
      // For pool play or non-bracket safeMatches, use regular update
      // Store BOTH legacy and modern score formats for compatibility
      const scoresModern = allScores.map((s, i) => ({
        gameNumber: i + 1,
        scoreA: s.scoreA,
        scoreB: s.scoreB,
      }));

      const now = Date.now();
      const updates: Partial<Match> = {
        status: 'completed',
        completedAt: now,
        endTime: now,
        court: '',
        winnerId: winnerId,
        winnerTeamId: winnerId,
        scores: scoresModern,
        scoreTeamAGames: allScores.map(s => s.scoreA),
        scoreTeamBGames: allScores.map(s => s.scoreB),
      };

      console.log('[finishMatchOnCourt] Saving updates to match:', currentMatch.id, updates);
      await updateMatchScore(tournamentId, currentMatch.id, updates);
      console.log('[finishMatchOnCourt] Save completed successfully!');

      // V06.36: Update pool results if this is a pool match
      // V07.30: Use safe wrapper - pool results are secondary, match scoring should not fail
      if (currentMatch.divisionId) {
        console.log('[finishMatchOnCourt] Calling updatePoolResultsOnMatchCompleteSafe...');
        const completedMatch: Match = {
          ...currentMatch,
          ...updates,
          status: 'completed',
          completedAt: now,
          updatedAt: now,
        } as Match;
        await updatePoolResultsOnMatchCompleteSafe(tournamentId, currentMatch.divisionId, completedMatch);
      }
    }

    // Auto-assign next match to this court using DYNAMIC eligibility calculation
    // This recalculates fresh considering rest time, pool balance, and current state
    const { eligible } = getEligibleMatches();
    const nextMatch = eligible[0]; // Best eligible match by score

    if (nextMatch) {
      await assignMatchToCourt(nextMatch.id, court.name);
    }
  }, [tournamentId, safeCourts, safeMatches, safeDivisions, assignMatchToCourt, getEligibleMatches]);

  const handleAssignCourt = useCallback(async (matchId: string) => {
    const match = safeMatches.find(m => m.id === matchId);
    if (!match) return;

    const conflict = findActiveConflictMatch(match);
    if (conflict) {
      alert(
        `Cannot assign this match: one of the teams is already playing or waiting on court ${conflict.court}. Finish that match first.`
      );
      return;
    }

    const freeCourt = safeCourts.find(
      c =>
        c.active &&
        !safeMatches.some(m => m.status !== 'completed' && m.court === c.name)
    );
    if (!freeCourt) {
      alert('No active courts available.');
      return;
    }

    await updateMatchScore(tournamentId, matchId, {
      status: 'in_progress',
      court: freeCourt.name,
      startTime: Date.now(),
    });
  }, [tournamentId, safeMatches, safeCourts, findActiveConflictMatch]);

  const autoAssignFreeCourts = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;

    const freeCourts = safeCourts.filter(
      c =>
        c.active !== false &&
        !safeMatches.some(m => m.court === c.name && m.status !== 'completed')
    );

    if (freeCourts.length === 0) {
      if (!silent) alert('No free courts available to auto-assign.');
      return;
    }

    // Use the dynamic eligibility calculation
    const { eligible } = getEligibleMatches();

    if (eligible.length === 0) {
      if (!silent) alert('No waiting matches available for auto-assignment (all players may need rest time or are already on court).');
      return;
    }

    // V07.02: Filter eligible matches to check finals dependencies
    const eligibleWithDependencies = eligible.filter(m => canFinalsMatchPlay(m, safeMatches));

    if (eligibleWithDependencies.length === 0) {
      if (!silent) alert('No waiting matches available for auto-assignment (finals may be waiting for earlier rounds to complete).');
      return;
    }

    const updates: Promise<void>[] = [];
    const notifications: Promise<void>[] = [];
    const assignedMatchIds = new Set<string>();
    const assignedPlayerIds = new Set<string>(); // Track players we've assigned
    // V07.29: Removed assignedTeamNames - different players can have same name
    const assignedCourtIds = new Set<string>();  // V07.02: Track courts we've assigned

    // V07.02: First, try to assign finals/semis to their preferred courts
    const finalsMatches = ['final', 'bronze', 'plate_final', 'plate_bronze', 'semifinal'];
    const priorityMatches = eligibleWithDependencies.filter(m =>
      finalsMatches.includes(m.matchType as string)
    );
    const regularMatches = eligibleWithDependencies.filter(m =>
      !finalsMatches.includes(m.matchType as string)
    );

    // Helper to check if match conflicts with assigned
    // V07.29: Removed name-based check - different players can have same name
    const hasConflict = (m: Match): boolean => {
      if (assignedMatchIds.has(m.id)) return true;

      const teamAId = m.teamAId || m.sideA?.id;
      const teamBId = m.teamBId || m.sideB?.id;
      const playerIdsA = m.sideA?.playerIds || [];
      const playerIdsB = m.sideB?.playerIds || [];
      const allPlayerIds = [...playerIdsA, ...playerIdsB].filter(Boolean);

      return allPlayerIds.some(pid => assignedPlayerIds.has(pid)) ||
             !!(teamAId && assignedPlayerIds.has(teamAId)) ||
             !!(teamBId && assignedPlayerIds.has(teamBId));
    };

    // Helper to mark match as assigned
    // V07.29: Removed name tracking - different players can have same name
    const markAssigned = (m: Match, courtId: string): void => {
      assignedMatchIds.add(m.id);
      assignedCourtIds.add(courtId);

      const teamAId = m.teamAId || m.sideA?.id;
      const teamBId = m.teamBId || m.sideB?.id;
      const playerIdsA = m.sideA?.playerIds || [];
      const playerIdsB = m.sideB?.playerIds || [];

      [...playerIdsA, ...playerIdsB].filter(Boolean).forEach(pid => assignedPlayerIds.add(pid));
      if (teamAId) assignedPlayerIds.add(teamAId);
      if (teamBId) assignedPlayerIds.add(teamBId);
    };

    // V07.02: Process priority matches (finals/semis) first - assign to preferred courts
    for (const match of priorityMatches) {
      if (hasConflict(match)) continue;

      const preferredCourt = getPreferredCourtForMatch(match);
      let assignedCourt: Court | undefined;

      if (preferredCourt) {
        if (Array.isArray(preferredCourt)) {
          // Semi-finals can use any of the preferred courts
          assignedCourt = freeCourts.find(c =>
            preferredCourt.includes(c.id) && !assignedCourtIds.has(c.id)
          );
        } else {
          // Finals/bronze must use their specific court
          assignedCourt = freeCourts.find(c =>
            c.id === preferredCourt && !assignedCourtIds.has(c.id)
          );
        }
      }

      // For non-finals priority matches (semis), fall back to any court if preferred not available
      if (!assignedCourt && match.matchType === 'semifinal') {
        assignedCourt = freeCourts.find(c => !assignedCourtIds.has(c.id));
      }

      // Finals MUST wait for their designated court
      if (!assignedCourt && (match.matchType === 'final' || match.matchType === 'bronze' ||
                             match.matchType === 'plate_final' || match.matchType === 'plate_bronze')) {
        continue;  // Skip - finals must wait for their court
      }

      if (!assignedCourt) continue;

      markAssigned(match, assignedCourt.id);

      updates.push(
        updateMatchScore(tournamentId, match.id, {
          court: assignedCourt.name,
          status: 'scheduled',
        })
      );

      // Queue notification
      const playerIds = [...(match.sideA?.playerIds || []), ...(match.sideB?.playerIds || [])].filter(Boolean);
      if (playerIds.length > 0) {
        notifications.push(
          notifyCourtAssignment(
            playerIds,
            tournamentId,
            match.id,
            assignedCourt.name,
            `${match.sideA?.name || 'Team A'} vs ${match.sideB?.name || 'Team B'}`
          ).catch(err => console.error('Failed to send notification:', err))
        );
      }
    }

    // V07.02: Process regular matches (pools/brackets) - assign to any available court
    for (const court of freeCourts) {
      if (assignedCourtIds.has(court.id)) continue;

      const matchToAssign = regularMatches.find(m => !hasConflict(m));
      if (!matchToAssign) continue;

      markAssigned(matchToAssign, court.id);

      const playerIdsA = matchToAssign.sideA?.playerIds || [];
      const playerIdsB = matchToAssign.sideB?.playerIds || [];

      updates.push(
        updateMatchScore(tournamentId, matchToAssign.id, {
          court: court.name,
          status: 'scheduled',
        })
      );

      // Queue notification for players
      const playerIds = [...playerIdsA, ...playerIdsB].filter(Boolean);

      if (playerIds.length > 0) {
        const sideAName = matchToAssign.sideA?.name || 'Team A';
        const sideBName = matchToAssign.sideB?.name || 'Team B';

        notifications.push(
          notifyCourtAssignment(
            playerIds,
            tournamentId,
            matchToAssign.id,
            court.name,
            `${sideAName} vs ${sideBName}`
          ).catch(err => console.error('Failed to send notification:', err))
        );
      }
    }

    if (updates.length === 0) {
      if (!silent) {
        alert(
          'All waiting matches either conflict with players already on court, need rest time, or have already been assigned.'
        );
      }
      return;
    }

    // Execute court assignments first, then notifications (don't wait for notifications)
    await Promise.all(updates);
    Promise.all(notifications).catch(() => {}); // Fire and forget notifications
  }, [tournamentId, safeCourts, safeMatches, getEligibleMatches, getPreferredCourtForMatch, canFinalsMatchPlay]);

  // ============================================
  // Auto-assign when rest time ends OR ready matches exist
  // Precise setTimeout scheduling - not polling
  // ============================================
  const autoAssignTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAutoAssigningRef = useRef(false);

  useEffect(() => {
    if (autoAssignTimerRef.current) {
      clearTimeout(autoAssignTimerRef.current);
      autoAssignTimerRef.current = null;
    }

    if (!autoAssignOnRestComplete) return;

    const freeCourts = safeCourts.filter(c =>
      c.active !== false &&
      !safeMatches.some(m => m.court === c.name && m.status !== 'completed')
    );
    if (freeCourts.length === 0) return;

    const now = Date.now();
    // Derive readiness from restingUntil, not m.isReady (which may be stale)
    const isReadyNow = (m: CourtMatchModel) => !m.restingUntil || m.restingUntil <= now;

    const readyMatches = queueMatchModels.filter(isReadyNow);
    const restingMatches = queueMatchModels.filter(m => m.restingUntil && m.restingUntil > now);

    const trigger = (delay: number) => {
      autoAssignTimerRef.current = setTimeout(() => {
        if (isAutoAssigningRef.current) return;
        isAutoAssigningRef.current = true;

        autoAssignFreeCourts({ silent: true })
          .catch(err => console.error('[useCourtManagement] Auto-assign failed:', err))
          .finally(() => { isAutoAssigningRef.current = false; });
      }, delay);
    };

    if (readyMatches.length > 0) {
      trigger(100);
      return () => {
        if (autoAssignTimerRef.current) clearTimeout(autoAssignTimerRef.current);
        autoAssignTimerRef.current = null;
      };
    }

    if (restingMatches.length > 0) {
      const nextReadyTime = Math.min(...restingMatches.map(m => m.restingUntil!));
      const delay = Math.max(nextReadyTime - now + 250, 250);
      trigger(delay);
    }

    return () => {
      if (autoAssignTimerRef.current) clearTimeout(autoAssignTimerRef.current);
      autoAssignTimerRef.current = null;
    };
  }, [autoAssignOnRestComplete, queueMatchModels, safeCourts, safeMatches, autoAssignFreeCourts]);

  return {
    courtViewModels,
    courtMatchModels,
    queueMatchModels,
    queue,
    waitTimes,
    getBusyTeamIds,
    findActiveConflictMatch,
    assignMatchToCourt,
    startMatchOnCourt,
    finishMatchOnCourt,
    handleAssignCourt,
    autoAssignFreeCourts,
  };
};
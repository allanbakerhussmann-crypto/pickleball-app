/**
 * useCourtManagement Hook
 * 
 * Manages court allocation, match assignment, and queue management.
 */

import { useMemo, useCallback } from 'react';
import type { Match, Court, Division } from '../../types';
import { updateMatchScore } from '../../services/firebase';

interface UseCourtManagementProps {
  tournamentId: string;
  matches: Match[];
  courts: Court[];
  divisions: Division[];
}

interface CourtViewModel {
  id: string;
  name: string;
  status: 'AVAILABLE' | 'ASSIGNED' | 'IN_USE' | 'OUT_OF_SERVICE';
  currentMatchId?: string;
}

interface CourtMatchModel {
  id: string;
  division: string;
  roundLabel: string;
  matchLabel: string;
  team1Name: string;
  team2Name: string;
  status: 'WAITING' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED';
  courtId?: string;
  courtName?: string;
}

interface UseCourtManagementReturn {
  // View models
  courtViewModels: CourtViewModel[];
  courtMatchModels: CourtMatchModel[];
  
  // Queue
  queue: Match[];
  waitTimes: Record<string, number>;
  
  // Helpers
  getBusyTeamIds: () => Set<string>;
  findActiveConflictMatch: (match: Match) => Match | undefined;
  
  // Actions
  assignMatchToCourt: (matchId: string, courtName: string) => Promise<void>;
  startMatchOnCourt: (courtId: string) => Promise<void>;
  finishMatchOnCourt: (courtId: string, scoreTeamA?: number, scoreTeamB?: number) => Promise<void>;
  handleAssignCourt: (matchId: string) => Promise<void>;
  autoAssignFreeCourts: (options?: { silent?: boolean }) => Promise<void>;
}

export const useCourtManagement = ({
  tournamentId,
  matches,
  courts,
  divisions,
}: UseCourtManagementProps): UseCourtManagementReturn => {

  // ============================================
  // Helper: Get busy team IDs (on court)
  // ============================================

  const getBusyTeamIds = useCallback(() => {
    const busy = new Set<string>();
    matches.forEach(m => {
      if (!m.court) return;
      if (m.status === 'completed') return;
      busy.add(m.teamAId);
      busy.add(m.teamBId);
    });
    return busy;
  }, [matches]);

  // ============================================
  // Queue calculation
  // ============================================

  const { queue, waitTimes } = useMemo(() => {
    const busy = new Set<string>();
    matches.forEach(m => {
      if (!m.court) return;
      if (m.status === 'completed') return;
      busy.add(m.teamAId);
      busy.add(m.teamBId);
    });

    const candidates = matches
      .filter(m => {
        const status = m.status ?? 'scheduled';
        const isWaiting = status === 'scheduled' || status === 'not_started';
        return isWaiting && !m.court;
      })
      .slice()
      .sort((a, b) => (a.roundNumber || 1) - (b.roundNumber || 1));

    const resultQueue: Match[] = [];
    const wt: Record<string, number> = {};

    candidates.forEach(m => {
      const isBusy = busy.has(m.teamAId) || busy.has(m.teamBId);
      if (!isBusy) {
        resultQueue.push(m);
        wt[m.id] = 0;
        busy.add(m.teamAId);
        busy.add(m.teamBId);
      } else {
        wt[m.id] = 0;
      }
    });

    return { queue: resultQueue, waitTimes: wt };
  }, [matches]);

  // ============================================
  // Court View Models
  // ============================================

  const courtViewModels = useMemo((): CourtViewModel[] => {
    return courts.map(court => {
      const currentMatch = matches.find(
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
  }, [courts, matches]);

  // ============================================
  // Match View Models for Courts
  // ============================================

  const courtMatchModels = useMemo((): CourtMatchModel[] => {
    return matches.map(m => {
      const division = divisions.find(d => d.id === m.divisionId);
      const court = courts.find(c => c.name === m.court);

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

      return {
        id: m.id,
        division: division?.name || 'Unknown',
        roundLabel: m.stage || `Round ${m.roundNumber || 1}`,
        matchLabel: `Match ${m.matchNumber ?? m.id.slice(-4)}`,
        team1Name: m.teamAId || 'TBD',
        team2Name: m.teamBId || 'TBD',
        status,
        courtId: court?.id,
        courtName: court?.name,
      };
    });
  }, [matches, divisions, courts]);

  // ============================================
  // Conflict Detection
  // ============================================

  const findActiveConflictMatch = useCallback((match: Match): Match | undefined => {
    return matches.find(m => {
      if (m.id === match.id) return false;
      if (!m.court) return false;
      if (m.status === 'completed') return false;

      return (
        m.teamAId === match.teamAId ||
        m.teamAId === match.teamBId ||
        m.teamBId === match.teamAId ||
        m.teamBId === match.teamBId
      );
    });
  }, [matches]);

  // ============================================
  // Court Actions
  // ============================================

  const assignMatchToCourt = useCallback(async (matchId: string, courtName: string) => {
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

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
  }, [tournamentId, matches, findActiveConflictMatch]);

  const startMatchOnCourt = useCallback(async (courtId: string) => {
    const court = courts.find(c => c.id === courtId);
    if (!court) return;

    const match = matches.find(
      m => m.court === court.name && m.status !== 'completed'
    );
    if (!match) return;

    await updateMatchScore(tournamentId, match.id, {
      status: 'in_progress',
      startTime: Date.now(),
    });
  }, [tournamentId, courts, matches]);

  const finishMatchOnCourt = useCallback(async (
    courtId: string,
    scoreTeamA?: number,
    scoreTeamB?: number
  ) => {
    const court = courts.find(c => c.id === courtId);
    if (!court) return;

    const currentMatch = matches.find(
      m => m.court === court.name && m.status !== 'completed'
    );
    if (!currentMatch) {
      alert('No active match found on this court.');
      return;
    }

    const division = divisions.find(d => d.id === currentMatch.divisionId) || null;

    const existingHasScores =
      Array.isArray(currentMatch.scoreTeamAGames) &&
      currentMatch.scoreTeamAGames.length > 0 &&
      Array.isArray(currentMatch.scoreTeamBGames) &&
      currentMatch.scoreTeamBGames.length > 0;

    const inlineHasScores =
      typeof scoreTeamA === 'number' &&
      !Number.isNaN(scoreTeamA) &&
      typeof scoreTeamB === 'number' &&
      !Number.isNaN(scoreTeamB);

    if (!existingHasScores && !inlineHasScores) {
      alert('Please enter scores for both teams before finishing this match.');
      return;
    }

    const updates: Partial<Match> = {
      status: 'completed',
      endTime: Date.now(),
      court: '',
    };

    if (!existingHasScores && inlineHasScores) {
      const sA = scoreTeamA as number;
      const sB = scoreTeamB as number;

      updates.scoreTeamAGames = [sA];
      updates.scoreTeamBGames = [sB];
      updates.winnerTeamId = sA > sB ? currentMatch.teamAId : currentMatch.teamBId;
    }

    await updateMatchScore(tournamentId, currentMatch.id, updates);

    // Auto-assign next match to this court
    const nextMatch = matches
      .filter(m =>
        (m.status === 'not_started' || m.status === 'scheduled' || !m.status) &&
        !m.court
      )
      .sort((a, b) => (a.roundNumber || 1) - (b.roundNumber || 1))[0];

    if (nextMatch) {
      await assignMatchToCourt(nextMatch.id, court.name);
    }
  }, [tournamentId, courts, matches, divisions, assignMatchToCourt]);

  const handleAssignCourt = useCallback(async (matchId: string) => {
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    const conflict = findActiveConflictMatch(match);
    if (conflict) {
      alert(
        `Cannot assign this match: one of the teams is already playing or waiting on court ${conflict.court}. Finish that match first.`
      );
      return;
    }

    const freeCourt = courts.find(
      c =>
        c.active &&
        !matches.some(m => m.status !== 'completed' && m.court === c.name)
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
  }, [tournamentId, matches, courts, findActiveConflictMatch]);

  const autoAssignFreeCourts = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;

    const freeCourts = courts.filter(
      c =>
        c.active !== false &&
        !matches.some(m => m.court === c.name && m.status !== 'completed')
    );

    if (freeCourts.length === 0) {
      if (!silent) alert('No free courts available to auto-assign.');
      return;
    }

    if (queue.length === 0) {
      if (!silent) alert('No waiting matches available for auto-assignment.');
      return;
    }

    const busy = getBusyTeamIds();
    const updates: Promise<any>[] = [];
    let queueIndex = 0;

    for (const court of freeCourts) {
      let matchToAssign: Match | undefined;

      while (queueIndex < queue.length && !matchToAssign) {
        const candidate = queue[queueIndex++];

        if (!busy.has(candidate.teamAId) && !busy.has(candidate.teamBId)) {
          matchToAssign = candidate;
          busy.add(candidate.teamAId);
          busy.add(candidate.teamBId);
        }
      }

      if (!matchToAssign) break;

      updates.push(
        updateMatchScore(tournamentId, matchToAssign.id, {
          court: court.name,
          status: 'scheduled',
        })
      );
    }

    if (updates.length === 0) {
      if (!silent) {
        alert(
          'All waiting matches either conflict with players already on court or have already been assigned.'
        );
      }
      return;
    }

    await Promise.all(updates);
  }, [tournamentId, courts, matches, queue, getBusyTeamIds]);

  return {
    courtViewModels,
    courtMatchModels,
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
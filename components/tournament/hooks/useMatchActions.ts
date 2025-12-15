/**
 * useMatchActions Hook
 * 
 * Handles match score updates, schedule generation, and team management.
 */

import { useCallback } from 'react';
import type { Division, Team, Match, UserProfile } from '../../types';
import {
  createTeamServer,
  deleteTeam,
  updateMatchScore,
  generatePoolsSchedule,
  generateBracketSchedule,
  generateFinalsFromPools,
} from '../../services/firebase';
import {
  submitMatchScore,
  confirmMatchScore,
  disputeMatchScore,
} from '../../services/matchService';

interface UseMatchActionsProps {
  tournamentId: string;
  activeDivision: Division | undefined;
  divisionTeams: Team[];
  playersCache: Record<string, UserProfile>;
  currentUserId?: string;
  isOrganizer: boolean;
}

interface UseMatchActionsReturn {
  // Team actions
  handleAddTeam: (params: { name: string; playerIds: string[] }) => Promise<void>;
  handleRemoveTeam: (teamId: string) => Promise<void>;
  
  // Schedule actions
  handleGenerateSchedule: () => Promise<void>;
  handleGenerateFinals: (standings: any[]) => Promise<void>;
  
  // Score actions
  handleUpdateScore: (
    matchId: string,
    score1: number,
    score2: number,
    action: 'submit' | 'confirm' | 'dispute',
    reason?: string
  ) => Promise<void>;
}

export const useMatchActions = ({
  tournamentId,
  activeDivision,
  divisionTeams,
  playersCache,
  currentUserId,
  isOrganizer,
}: UseMatchActionsProps): UseMatchActionsReturn => {

  // ============================================
  // Team Actions
  // ============================================

  const handleAddTeam = useCallback(async ({ 
    name, 
    playerIds 
  }: { 
    name: string; 
    playerIds: string[] 
  }) => {
    if (!activeDivision) {
      throw new Error('No active division selected');
    }
    
    try {
      const res = await createTeamServer({
        tournamentId,
        divisionId: activeDivision.id,
        playerIds,
        teamName: name || null,
      });

      const data = res as { existed: boolean; teamId: string };

      if (data?.existed) {
        console.info('Team already existed:', data.teamId);
      } else {
        console.info('Team created:', data.teamId);
      }
    } catch (err) {
      console.error('Failed to add team', err);
      throw err;
    }
  }, [tournamentId, activeDivision]);

  const handleRemoveTeam = useCallback(async (teamId: string) => {
    await deleteTeam(tournamentId, teamId);
  }, [tournamentId]);

  // ============================================
  // Schedule Generation
  // ============================================

  const handleGenerateSchedule = useCallback(async () => {
    if (!activeDivision) return;
    
    if (divisionTeams.length < 2) {
      alert('Need at least 2 teams.');
      return;
    }

    try {
      if (activeDivision.format.stageMode === 'single_stage') {
        if (activeDivision.format.mainFormat === 'round_robin') {
          // Single Pool Round Robin
          await generatePoolsSchedule(
            tournamentId,
            {
              ...activeDivision,
              format: { ...activeDivision.format, numberOfPools: 1 },
            },
            divisionTeams,
            playersCache
          );
        } else {
          // Bracket (Single Elim, etc)
          await generateBracketSchedule(
            tournamentId,
            activeDivision,
            divisionTeams,
            playersCache
          );
        }
      } else {
        // Two Stage - Generate Pools
        await generatePoolsSchedule(
          tournamentId,
          activeDivision,
          divisionTeams,
          playersCache
        );
      }
      
      alert('Schedule Generated!');
    } catch (err) {
      console.error('Failed to generate schedule', err);
      alert('Failed to generate schedule. Please try again.');
    }
  }, [tournamentId, activeDivision, divisionTeams, playersCache]);

  const handleGenerateFinals = useCallback(async (standings: any[]) => {
    if (!activeDivision) return;
    
    try {
      await generateFinalsFromPools(
        tournamentId,
        activeDivision,
        divisionTeams,
        playersCache,
        standings
      );
      
      alert('Finals bracket generated!');
    } catch (err) {
      console.error('Failed to generate finals', err);
      alert('Failed to generate finals. Please try again.');
    }
  }, [tournamentId, activeDivision, divisionTeams, playersCache]);

  // ============================================
  // Score Actions
  // ============================================

  const handleUpdateScore = useCallback(async (
    matchId: string,
    score1: number,
    score2: number,
    action: 'submit' | 'confirm' | 'dispute',
    reason?: string
  ) => {
    if (!currentUserId) {
      alert('You must be logged in to update scores.');
      return;
    }

    try {
      if (action === 'submit') {
        await submitMatchScore(
          tournamentId,
          matchId,
          currentUserId,
          [score1],
          [score2],
          isOrganizer
        );
      } else if (action === 'confirm') {
        await confirmMatchScore(
          tournamentId,
          matchId,
          currentUserId,
          isOrganizer
        );
      } else if (action === 'dispute') {
        await disputeMatchScore(
          tournamentId,
          matchId,
          currentUserId,
          reason || 'Score disputed'
        );
      }
    } catch (err: any) {
      console.error('Failed to update score', err);
      alert(err.message || 'Failed to update score. Please try again.');
    }
  }, [tournamentId, currentUserId, isOrganizer]);

  return {
    handleAddTeam,
    handleRemoveTeam,
    handleGenerateSchedule,
    handleGenerateFinals,
    handleUpdateScore,
  };
};
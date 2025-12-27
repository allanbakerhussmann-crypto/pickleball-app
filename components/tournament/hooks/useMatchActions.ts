/**
 * useMatchActions Hook
 *
 * Handles match score updates, schedule generation, and team management.
 * VERSION: V06.06 - Added pool_play_medals format detection
 */

import { useCallback } from 'react';
import type { Division, Team, UserProfile, PoolAssignment } from '../../../types';
import type { PoolPlayMedalsSettings } from '../../../types/formats/formatTypes';
import type { GameSettings } from '../../../types/game/gameSettings';
import {
  createTeamServer,
  deleteTeam,
  generatePoolsSchedule,
  generateBracketSchedule,
  generateFinalsFromPools,
  generatePoolPlaySchedule,
  generateFinalsFromPoolStandings,
} from '../../../services/firebase';
import {
  submitMatchScore,
  confirmMatchScore,
  disputeMatchScore,
} from '../../../services/matchService';

interface UseMatchActionsProps {
  tournamentId: string;
  activeDivision: Division | undefined;
  divisionTeams: Team[];
  divisionMatches?: any[];  // Pool matches for finals generation
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
  divisionMatches = [],
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
      // Check if this is a pool_play_medals format (two-stage with pools → bracket)
      const isPoolPlayMedals =
        activeDivision.format?.stageMode === 'two_stage' ||
        activeDivision.format?.competitionFormat === 'pool_play_medals' ||
        (activeDivision.format as any)?.poolPlayMedalsSettings;

      if (isPoolPlayMedals) {
        // Use the NEW pool play generator with proper Match structure
        const poolSettings: PoolPlayMedalsSettings = (activeDivision.format as any)?.poolPlayMedalsSettings || {
          poolSize: (activeDivision.format as any)?.numberOfPools
            ? Math.ceil(divisionTeams.length / (activeDivision.format as any).numberOfPools)
            : 4,
          advancementRule: 'top_2',
          bronzeMatch: 'yes',
          tiebreakers: ['wins', 'head_to_head', 'point_diff', 'points_scored'],
        };

        const gameSettings: GameSettings | undefined = (activeDivision.format as any)?.gameSettings;
        const poolAssignments: PoolAssignment[] | undefined = activeDivision.poolAssignments;

        const result = await generatePoolPlaySchedule(
          tournamentId,
          activeDivision.id,
          divisionTeams,
          poolSettings,
          gameSettings,
          poolAssignments
        );

        console.log(`Generated ${result.matchIds.length} pool matches across ${result.poolCount} pools`);
        alert(`Schedule Generated! ${result.poolCount} pools, ${result.matchIds.length} matches.`);
        return;
      }

      // Fall back to legacy generators for other formats
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
        // Two Stage - Legacy path (should not reach here for pool_play_medals)
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
      // Check if this is a pool_play_medals format
      const isPoolPlayMedals =
        activeDivision.format?.stageMode === 'two_stage' ||
        activeDivision.format?.competitionFormat === 'pool_play_medals' ||
        (activeDivision.format as any)?.poolPlayMedalsSettings;

      if (isPoolPlayMedals) {
        // Use the NEW finals generator that works with pool standings
        const poolMatches = divisionMatches.filter(
          (m: any) => m.poolGroup || m.stage === 'pool' || m.stage === 'Pool Play'
        );

        const poolSettings: PoolPlayMedalsSettings = (activeDivision.format as any)?.poolPlayMedalsSettings || {
          poolSize: 4,
          advancementRule: 'top_2',
          bronzeMatch: 'yes',
          tiebreakers: ['wins', 'head_to_head', 'point_diff', 'points_scored'],
        };

        // Include plate settings if enabled
        const formatWithPlate = activeDivision.format as any;
        const settings = {
          ...poolSettings,
          plateEnabled: formatWithPlate?.plateEnabled || false,
          plateFormat: formatWithPlate?.plateFormat || 'single_elim',
          plateThirdPlace: formatWithPlate?.plateThirdPlace || false,
          plateName: formatWithPlate?.plateName || 'Plate',
          gameSettings: formatWithPlate?.gameSettings,
        };

        const result = await generateFinalsFromPoolStandings(
          tournamentId,
          activeDivision.id,
          poolMatches,
          divisionTeams,
          settings
        );

        alert(`Finals bracket generated! ${result.mainBracketIds.length} main bracket matches${
          result.plateBracketIds.length > 0 ? `, ${result.plateBracketIds.length} plate bracket matches` : ''
        }.`);
        return;
      }

      // Fall back to legacy generator
      // Args: tournamentId, division, teams, playersCache, standings
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
  }, [tournamentId, activeDivision, divisionTeams, divisionMatches, playersCache]);

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
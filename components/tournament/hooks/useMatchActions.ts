/**
 * useMatchActions Hook
 *
 * Handles match score updates, schedule generation, and team management.
 * VERSION: V06.41 - Fix Stale Format in Medal Bracket Generation
 *
 * V06.41 Changes:
 * - CRITICAL FIX: handleGenerateFinals() now fetches FRESH division format from Firestore
 * - Before: Used stale activeDivision.format (React state not yet updated after save)
 * - After: Fetches fresh format ensuring medalRoundSettings is used correctly
 * - Finals now correctly use Best of 3, points to 15, etc. as configured
 *
 * V06.39 Changes:
 * - handleGenerateFinals() now generates plate bracket when plateEnabled is true
 * - Plate bracket uses buildPlateBracketSeeds() for non-advancing teams
 * - Bronze match created automatically by generateBracketFromSeeds() when configured
 * - Plate bracket supports its own 3rd place match via plateThirdPlace setting
 *
 * V06.36 Changes:
 * - generateBracketFromSeeds() now receives divisionFormat to use medalRoundSettings
 * - Bracket matches now correctly use finals/semiFinals/quarterFinals settings
 * - Finals match uses bestOf 3, play to 15, etc. instead of pool settings
 *
 * V06.35 Changes:
 * - Pool results now created automatically when pool matches complete
 * - handleGenerateFinals() simplified: buildBracketSeeds() → generateBracketFromSeeds()
 * - Removed buildPoolResults() call from handleGenerateFinals (already done on match completion)
 *
 * V06.34 Changes:
 * - FIX D: sanitizeForFirestore wrapper to remove undefined values before setDoc
 * - FIX E: Fetch fresh matches from Firestore instead of using stale divisionMatches prop
 *
 * V06.33 Changes:
 * - Canonical subcollections as source of truth for bracket generation
 * - FIX A: No orphan BYEs
 * - FIX B: BYE auto-advance with overwrite protection
 * - FIX C: Uses canonical subcollections
 */

import { useCallback, useState } from 'react';
import type { Division, Team, UserProfile, PoolAssignment } from '../../../types';
import type { PoolPlayMedalsSettings } from '../../../types/formats/formatTypes';
import type { GameSettings } from '../../../types/game/gameSettings';
import type { GameScore } from '../../../types/game/match';
import {
  ensureTeamExists,
  deleteTeam,
  generatePoolsSchedule,
  generateBracketSchedule,
  generateFinalsFromPools,
  generatePoolPlaySchedule,
  // V06.35 Results Table Architecture
  buildBracketSeeds,
  generateBracketFromSeeds,
} from '../../../services/firebase';
import {
  submitMatchScore,
  disputeMatchScore,
} from '../../../services/matchService';
// V07.04: DUPR-Compliant Scoring
import {
  proposeScore,
  signScore,
  disputeScore,
  finaliseResult,
} from '../../../services/firebase/duprScoring';
// V07.53: Use confirmScore wrapper (routes to correct flow based on DB state)
import { confirmScore } from '../../../services/firebase/confirmScore';
import type { DuprMode } from '../../../types';

interface UseMatchActionsProps {
  tournamentId: string;
  activeDivision: Division | undefined;
  divisionTeams: Team[];
  divisionMatches?: any[];  // Pool matches for finals generation
  playersCache: Record<string, UserProfile>;
  currentUserId?: string;
  isOrganizer: boolean;
  /** V07.52: DUPR mode for anti-self-reporting compliance */
  duprMode?: DuprMode;
}

interface UseMatchActionsReturn {
  // Team actions
  handleAddTeam: (params: { name: string; playerIds: string[] }) => Promise<void>;
  handleRemoveTeam: (teamId: string) => Promise<void>;

  // Schedule actions
  handleGenerateSchedule: () => Promise<void>;
  handleGenerateFinals: (standings: any[]) => Promise<void>;

  // Score actions (legacy - organizer instant-complete)
  handleUpdateScore: (
    matchId: string,
    score1: number,
    score2: number,
    action: 'submit' | 'confirm' | 'dispute',
    reason?: string
  ) => Promise<void>;

  // V06.42: Multi-game score handler for bracket matches (Best of 3/5)
  handleUpdateMultiGameScore: (
    matchId: string,
    scores: GameScore[],
    winnerId: string
  ) => Promise<void>;

  // V07.04: DUPR-Compliant Scoring
  handleProposeScore: (
    matchId: string,
    scores: GameScore[],
    winnerId: string
  ) => Promise<void>;
  handleSignScore: (matchId: string) => Promise<void>;
  handleDisputeScore: (matchId: string, reason: string) => Promise<void>;
  handleFinaliseResult: (
    matchId: string,
    scores: GameScore[],
    winnerId: string,
    duprEligible?: boolean
  ) => Promise<void>;

  // Loading state (V06.21)
  isGeneratingSchedule: boolean;
}

export const useMatchActions = ({
  tournamentId,
  activeDivision,
  divisionTeams,
  divisionMatches = [],
  playersCache,
  currentUserId,
  isOrganizer,
  duprMode,
}: UseMatchActionsProps): UseMatchActionsReturn => {
  // Loading state for schedule generation (V06.21)
  const [isGeneratingSchedule, setIsGeneratingSchedule] = useState(false);

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
      const data = await ensureTeamExists(
        tournamentId,
        activeDivision.id,
        playerIds,
        name || null,
        currentUserId || playerIds[0],
      );

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

    // Prevent double-clicks (V06.21)
    if (isGeneratingSchedule) {
      console.warn('[handleGenerateSchedule] Already generating, ignoring click');
      return;
    }

    setIsGeneratingSchedule(true);

    try {
      // Check if this is a pool_play_medals format (two-stage with pools → bracket)
      const isPoolPlayMedals =
        activeDivision.format?.stageMode === 'two_stage' ||
        activeDivision.format?.competitionFormat === 'pool_play_medals' ||
        (activeDivision.format as any)?.poolPlayMedalsSettings;

      if (isPoolPlayMedals) {
        // Use the NEW pool play generator with proper Match structure
        // Extract pool size from DivisionFormat.teamsPerPool, falling back to calculation from numberOfPools
        const divFormat = activeDivision.format as any;
        const teamsPerPool = divFormat?.teamsPerPool ||
          (divFormat?.numberOfPools ? Math.ceil(divisionTeams.length / divFormat.numberOfPools) : 4);
        // Ensure poolSize is a valid value (3-6)
        const validPoolSize = Math.max(3, Math.min(6, teamsPerPool)) as 3 | 4 | 5 | 6;

        const poolSettings: PoolPlayMedalsSettings = (activeDivision.format as any)?.poolPlayMedalsSettings || {
          poolSize: validPoolSize,
          advancementRule: divFormat?.advanceToMainPerPool === 1 ? 'top_1' : 'top_2',
          bronzeMatch: divFormat?.hasBronzeMatch !== false ? 'yes' : 'no',
          tiebreakers: ['wins', 'head_to_head', 'point_diff', 'points_scored'],
        };

        // Build GameSettings from DivisionFormat fields
        // Note: Don't include scoreCap if undefined - Firestore rejects undefined values
        const gameSettings: GameSettings | undefined = divFormat?.bestOfGames ? {
          playType: (divFormat.playType || 'doubles') as 'singles' | 'doubles' | 'mixed' | 'open',
          bestOf: divFormat.bestOfGames as 1 | 3 | 5,
          pointsPerGame: (divFormat.pointsPerGame || 11) as 11 | 15 | 21,
          winBy: (divFormat.winBy || 2) as 1 | 2,
        } : undefined;
        const poolAssignments: PoolAssignment[] | undefined = activeDivision.poolAssignments;

        console.log('[handleGenerateSchedule] Pool Play Medals detected', {
          teamsCount: divisionTeams.length,
          poolSettings,
          gameSettings,
          hasPoolAssignments: !!poolAssignments?.length,
        });

        // V06.21: Pass userId for audit trail
        const result = await generatePoolPlaySchedule(
          tournamentId,
          activeDivision.id,
          divisionTeams,
          poolSettings,
          gameSettings,
          poolAssignments,
          currentUserId  // For scheduleGeneratedBy audit
        );

        console.log(`Generated ${result.matchIds.length} pool matches across ${result.poolCount} pools`);
        alert(`Schedule Generated! ${result.poolCount} pools, ${result.matchIds.length} matches.`);
        return;
      }

      // Fall back to legacy generators for other formats
      if (activeDivision.format.stageMode === 'single_stage') {
        if (activeDivision.format.mainFormat === 'round_robin') {
          // V07.52: Use generatePoolPlaySchedule for Round Robin to populate team names
          // This ensures sideA.name/sideB.name are populated with resolved player names
          // Uses same canonical ID scheme as pool_play_medals for consistency
          const divFormat = activeDivision.format as any;

          // Build GameSettings from DivisionFormat fields
          const gameSettings: GameSettings | undefined = divFormat?.bestOfGames ? {
            playType: (divFormat.playType || 'doubles') as 'singles' | 'doubles' | 'mixed' | 'open',
            bestOf: divFormat.bestOfGames as 1 | 3 | 5,
            pointsPerGame: (divFormat.pointsPerGame || 11) as 11 | 15 | 21,
            winBy: (divFormat.winBy || 2) as 1 | 2,
          } : undefined;

          // Pool size = all teams (single pool for round robin)
          // Note: poolSize type is 3|4|5|6, but for round robin we want all teams in one pool
          // Setting poolSize >= teamCount ensures Math.ceil(teams/poolSize) = 1 pool
          // We cast to any to bypass the type restriction since the actual math works correctly
          const effectivePoolSize = Math.max(3, divisionTeams.length);
          const poolSettings: PoolPlayMedalsSettings = {
            poolSize: effectivePoolSize as 3 | 4 | 5 | 6, // Cast for type safety, actual value can be larger
            advancementRule: 'top_2',
            bronzeMatch: 'no',
            tiebreakers: ['wins', 'head_to_head', 'point_diff', 'points_scored'],
          };

          console.log('[handleGenerateSchedule] Round Robin detected', {
            teamsCount: divisionTeams.length,
            poolSettings,
            gameSettings,
          });

          const result = await generatePoolPlaySchedule(
            tournamentId,
            activeDivision.id,
            divisionTeams,
            poolSettings,
            gameSettings,
            undefined, // No manual pool assignments - auto single pool
            currentUserId
          );

          console.log(`Generated ${result.matchIds.length} round robin matches`);
          alert(`Schedule Generated! ${result.matchIds.length} round robin matches.`);
          return;
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
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      alert(`Failed to generate schedule: ${errorMessage}`);
    } finally {
      // Always reset loading state (V06.21)
      setIsGeneratingSchedule(false);
    }
  }, [tournamentId, activeDivision, divisionTeams, playersCache, currentUserId, isGeneratingSchedule]);

  const handleGenerateFinals = useCallback(async (standings: any[]) => {
    if (!activeDivision) return;

    try {
      // ============================================
      // V06.41 FIX: Fetch FRESH division format from Firestore
      // React state (activeDivision) may be stale after updateDivision()
      // was called in the confirmation modal. The save happens, but React
      // hasn't re-rendered yet, so activeDivision.format has OLD values.
      // ============================================
      const { doc, getDoc } = await import('@firebase/firestore');
      const { db } = await import('../../../services/firebase/config');
      const divisionRef = doc(db, 'tournaments', tournamentId, 'divisions', activeDivision.id);
      const divisionSnap = await getDoc(divisionRef);

      if (!divisionSnap.exists()) {
        throw new Error('Division not found');
      }

      const freshDivisionFormat = divisionSnap.data()?.format;

      console.log('[handleGenerateFinals] V06.41 Fresh format from Firestore:', {
        useSeparateMedalSettings: freshDivisionFormat?.useSeparateMedalSettings,
        medalRoundSettings: freshDivisionFormat?.medalRoundSettings,
        plateRoundSettings: freshDivisionFormat?.plateRoundSettings,
      });

      // Check if this is a pool_play_medals format (using FRESH format)
      const isPoolPlayMedals =
        freshDivisionFormat?.stageMode === 'two_stage' ||
        freshDivisionFormat?.competitionFormat === 'pool_play_medals' ||
        freshDivisionFormat?.poolPlayMedalsSettings;

      if (isPoolPlayMedals) {
        // ============================================
        // V06.35 Results Table Architecture
        // Pool results already exist from match completions (V06.35)
        // New flow: buildBracketSeeds → generateBracketFromSeeds
        // ============================================

        const poolSettings: PoolPlayMedalsSettings = freshDivisionFormat?.poolPlayMedalsSettings || {
          poolSize: 4,
          advancementRule: 'top_2',
          bronzeMatch: 'yes',
          tiebreakers: ['wins', 'head_to_head', 'point_diff', 'points_scored'],
        };

        // Determine qualifiersPerPool from advancement rule
        let qualifiersPerPool = 2;  // default for 'top_2'
        switch (poolSettings.advancementRule) {
          case 'top_1': qualifiersPerPool = 1; break;
          case 'top_2': qualifiersPerPool = 2; break;
          case 'top_n_plus_best': qualifiersPerPool = 1; break;
        }

        // Build DEFAULT game settings from division format (used as fallback)
        const divFormat = freshDivisionFormat as any;
        const defaultGameSettings: GameSettings = {
          playType: (divFormat?.playType || 'doubles') as 'singles' | 'doubles' | 'mixed' | 'open',
          bestOf: (divFormat?.bestOfGames || 1) as 1 | 3 | 5,
          pointsPerGame: (divFormat?.pointsPerGame || 11) as 11 | 15 | 21,
          winBy: (divFormat?.winBy || 2) as 1 | 2,
        };

        console.log('[handleGenerateFinals] V06.41 flow with fresh format:', {
          qualifiersPerPool,
          defaultGameSettings,
          useSeparateMedalSettings: divFormat?.useSeparateMedalSettings,
          medalRoundSettings: divFormat?.medalRoundSettings,
        });

        // ============================================
        // STEP 1: Build and persist bracket seeds from existing poolResults
        // V06.35: Pool results already exist from match completions
        // ============================================
        console.log('[handleGenerateFinals] Step 1: buildBracketSeeds (from existing poolResults)');
        const seedsDoc = await buildBracketSeeds(
          tournamentId,
          activeDivision.id,
          qualifiersPerPool,
          false  // testData = false for real finals
        );

        // ============================================
        // STEP 2: Generate bracket from seeds
        // V06.41: Pass FRESH divisionFormat so bracket generation uses medalRoundSettings
        // ============================================
        console.log('[handleGenerateFinals] Step 2: generateBracketFromSeeds');
        const matchIds = await generateBracketFromSeeds(
          tournamentId,
          activeDivision.id,
          'main',
          defaultGameSettings,
          false,  // testData = false for real finals
          freshDivisionFormat  // V06.41: Use FRESH format, not stale activeDivision.format
        );

        console.log('[handleGenerateFinals] Main bracket complete:', {
          bracketSize: seedsDoc.bracketSize,
          rounds: seedsDoc.rounds,
          matchIds: matchIds.length,
        });

        // ============================================
        // V06.39: Generate plate bracket if enabled
        // ============================================
        const plateEnabled = divFormat?.plateEnabled === true;
        const plateThirdPlace = divFormat?.plateThirdPlace === true;
        let plateMatchCount = 0;

        if (plateEnabled) {
          console.log('[handleGenerateFinals] Step 3: Generate plate bracket...');

          // Dynamic import to avoid circular dependency
          const { buildPlateBracketSeeds } = await import('../../../services/firebase/bracketSeeds');

          // Build plate seeds (non-advancing teams)
          const plateSeedsDoc = await buildPlateBracketSeeds(
            tournamentId,
            activeDivision.id,
            qualifiersPerPool,
            plateThirdPlace,
            false  // testData
          );

          if (plateSeedsDoc.bracketSize > 0) {
            // Generate plate bracket matches
            const plateMatchIds = await generateBracketFromSeeds(
              tournamentId,
              activeDivision.id,
              'plate',
              defaultGameSettings,
              false,
              freshDivisionFormat  // V06.41: Use FRESH format
            );

            plateMatchCount = plateMatchIds.length;

            console.log('[handleGenerateFinals] Plate bracket complete:', {
              bracketSize: plateSeedsDoc.bracketSize,
              matchIds: plateMatchCount,
              thirdPlace: plateThirdPlace,
            });
          } else {
            console.log('[handleGenerateFinals] Not enough teams for plate bracket');
          }
        }

        // Build success message
        const bronzeMsg = poolSettings.bronzeMatch === 'yes' ? ' Bronze match included.' : '';
        const plateMsg = plateMatchCount > 0 ? ` Plate bracket: ${plateMatchCount} matches.` : '';
        alert(`Finals bracket generated! ${matchIds.length} main bracket matches (${seedsDoc.bracketSize}-team).${bronzeMsg}${plateMsg}`);
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
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      alert(`Failed to generate finals: ${errorMessage}`);
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
        // V07.53: Use confirmScore wrapper (routes based on fresh DB state)
        const result = await confirmScore(
          'tournament',
          tournamentId,
          matchId,
          currentUserId
        );
        if (!result.success) {
          throw new Error(result.error || 'Failed to confirm score');
        }
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

  // V06.42: Multi-game score handler for bracket matches (Best of 3/5)
  // Opens ScoreEntryModal for multi-game entry, then submits all game scores
  const handleUpdateMultiGameScore = useCallback(async (
    matchId: string,
    scores: GameScore[],
    _winnerId: string  // Winner is calculated from scores in submitMatchScore
  ) => {
    if (!currentUserId) {
      alert('You must be logged in to update scores.');
      return;
    }

    try {
      // Extract scores arrays from GameScore objects
      const scoresA = scores.map(g => g.scoreA);
      const scoresB = scores.map(g => g.scoreB);

      // submitMatchScore now correctly counts games won (V06.42 fix)
      await submitMatchScore(
        tournamentId,
        matchId,
        currentUserId,
        scoresA,
        scoresB,
        isOrganizer
      );
    } catch (err: any) {
      console.error('Failed to update multi-game score', err);
      alert(err.message || 'Failed to update score. Please try again.');
    }
  }, [tournamentId, currentUserId, isOrganizer]);

  // ============================================
  // V07.04: DUPR-Compliant Score Actions
  // ============================================

  /**
   * Propose a score (player action)
   * Creates a scoreProposal, sets status to 'pending_confirmation'
   * Opponent must sign or dispute before organizer can finalize
   *
   * V07.52: In DUPR tournaments, organizers cannot propose scores (anti-self-reporting)
   */
  const handleProposeScore = useCallback(async (
    matchId: string,
    scores: GameScore[],
    winnerId: string
  ) => {
    if (!currentUserId) {
      alert('You must be logged in to propose a score.');
      return;
    }

    // V07.52: Build DUPR context for anti-self-reporting check
    const duprContext = duprMode && duprMode !== 'none'
      ? { mode: duprMode, isOrganizer }
      : undefined;

    try {
      await proposeScore(
        'tournament',
        tournamentId,
        matchId,
        scores,
        winnerId,
        currentUserId,
        duprContext
      );
    } catch (err: any) {
      console.error('Failed to propose score', err);
      alert(err.message || 'Failed to propose score. Please try again.');
    }
  }, [tournamentId, currentUserId, duprMode, isOrganizer]);

  /**
   * Sign (acknowledge) a score proposal (player action)
   * Must be called by player on OPPOSING team
   */
  const handleSignScore = useCallback(async (matchId: string) => {
    if (!currentUserId) {
      alert('You must be logged in to sign a score.');
      return;
    }

    try {
      await signScore('tournament', tournamentId, matchId, currentUserId);
    } catch (err: any) {
      console.error('Failed to sign score', err);
      alert(err.message || 'Failed to sign score. Please try again.');
    }
  }, [tournamentId, currentUserId]);

  /**
   * Dispute a score proposal (player action)
   * Must be called by player on OPPOSING team
   */
  const handleDisputeScore = useCallback(async (matchId: string, reason: string) => {
    if (!currentUserId) {
      alert('You must be logged in to dispute a score.');
      return;
    }

    try {
      await disputeScore('tournament', tournamentId, matchId, currentUserId, reason);
    } catch (err: any) {
      console.error('Failed to dispute score', err);
      alert(err.message || 'Failed to dispute score. Please try again.');
    }
  }, [tournamentId, currentUserId]);

  /**
   * Finalise the official result (organizer action)
   * Creates officialResult, sets status to 'completed', locks score
   * This is THE ONLY way to make a match count for standings
   */
  const handleFinaliseResult = useCallback(async (
    matchId: string,
    scores: GameScore[],
    winnerId: string,
    duprEligible: boolean = true
  ) => {
    if (!currentUserId) {
      alert('You must be logged in to finalize a result.');
      return;
    }

    if (!isOrganizer) {
      alert('Only organizers can finalize match results.');
      return;
    }

    try {
      await finaliseResult(
        'tournament',
        tournamentId,
        matchId,
        scores,
        winnerId,
        currentUserId,
        duprEligible
      );
    } catch (err: any) {
      console.error('Failed to finalize result', err);
      alert(err.message || 'Failed to finalize result. Please try again.');
    }
  }, [tournamentId, currentUserId, isOrganizer]);

  return {
    handleAddTeam,
    handleRemoveTeam,
    handleGenerateSchedule,
    handleGenerateFinals,
    handleUpdateScore,
    handleUpdateMultiGameScore,  // V06.42
    // V07.04: DUPR-Compliant Scoring
    handleProposeScore,
    handleSignScore,
    handleDisputeScore,
    handleFinaliseResult,
    isGeneratingSchedule, // V06.21: Loading state for UI
  };
};
import React, { useState, useEffect, useMemo } from 'react';
import type {
  Tournament,
  Division,
  Match,
  SeedingMethod,
  StandingsEntry,
  TournamentCourtSettings,
} from '../types';
import { getDefaultCourtSettings } from '../types';
import type { GameSettings } from '../types/game/gameSettings';
import { useAuth } from '../contexts/AuthContext';
import {
  updateDivision,
  saveTournament,
  addCourt,
  updateCourt,
  deleteCourt,
  updateMatchScore,
  publishScheduleTimes,
} from '../services/firebase';
import { TeamSetup } from './TeamSetup';
import { CourtAllocation } from './CourtAllocation';
import { Schedule } from './Schedule';
import { BracketViewer } from './BracketViewer';
import { Standings } from './Standings';
import { TournamentRegistrationWizard } from './registration/TournamentRegistrationWizard';
import { useTournamentPhase } from './tournament/hooks/useTournamentPhase';
import { useTournamentData } from './tournament/hooks/useTournamentData';
import { useCourtManagement } from './tournament/hooks/useCourtManagement';
import { useMatchActions } from './tournament/hooks/useMatchActions';
import { ScheduleBuilder } from './tournament/scheduleBuilder';
import { TournamentSeedButton } from './tournament/TournamentSeedButton';
import { PoolGroupStandings } from './tournament/PoolGroupStandings';
import { PoolEditor } from './tournament/PoolEditor';
import { TiebreakerSettings } from './tournament/TiebreakerSettings';
import { DivisionSettingsTab } from './tournament/DivisionSettingsTab';
import { LiveCourtsTab } from './tournament/LiveCourtsTab';
import { PoolStageTab } from './tournament/PoolStageTab';
import { MedalBracketTab } from './tournament/MedalBracketTab';
import { PoolDrawPreview } from './tournament/PoolDrawPreview';
import { generatePoolAssignments, savePoolAssignments } from '../services/firebase/poolAssignments';
import { TestModeWrapper } from './tournament/TestModeWrapper';
import { TestModePanel } from './tournament/TestModePanel';
import { PlayerMatchCard } from './tournament/PlayerMatchCard';
import { SponsorManagement } from './tournament/SponsorManagement';
import { StaffManagement } from './tournament/StaffManagement';
import { SponsorLogoStrip } from './shared/SponsorLogoStrip';
import { ClubBrandingSection } from './shared/ClubBrandingSection';
import { useTournamentPermissions } from '../hooks/useTournamentPermissions';
import { clearTestData, quickScoreMatch, simulatePoolCompletion, deleteCorruptedSelfMatches, deletePoolMatches } from '../services/firebase/matches';
import { getTournament } from '../services/firebase/tournaments';

interface TournamentManagerProps {
  tournament: Tournament;
  onUpdateTournament: (t: Tournament) => Promise<void>;
  isVerified: boolean;
  onBack: () => void;
  initialWizardState?: { isOpen: boolean; mode?: 'full'|'waiver_only'; divisionId?: string } | null;
  clearWizardState?: () => void;
}


// Score validation now handled in MatchCard via gameSettings

export const TournamentManager: React.FC<TournamentManagerProps> = ({
  tournament,
  onUpdateTournament,
  isVerified,
  onBack,
  initialWizardState,
  clearWizardState,
}) => {
  const { currentUser, userProfile, isOrganizer, isAppAdmin } = useAuth();

  // Use centralized permissions hook
  const permissions = useTournamentPermissions(tournament);
  // Full admin = owner OR app admin (can manage settings, teams, staff)
  const canManageTournament = permissions.isFullAdmin;
  // Can see admin view = full admin OR staff
  const canSeeAdminView = permissions.canViewAdminDashboard;
  // Tournament Data (using new hook)
  const {
    divisions,
    teams,
    matches,
    courts,
    playersCache,
    activeDivisionId,
    setActiveDivisionId,
    activeDivision,
    divisionTeams,
    divisionMatches,
    attentionMatches,
    hasCompletedRegistration,
    getTeamDisplayName,
    getTeamPlayers,
  } = useTournamentData({
    tournamentId: tournament.id,
    currentUserId: currentUser?.uid,
  });
    const {
    tournamentPhase,
    tournamentPhaseLabel,
    handleStartTournament,
  } = useTournamentPhase({ matches });

  // Persist auto-allocation setting per tournament in localStorage
  const [autoAllocateCourts, setAutoAllocateCourts] = useState(() => {
    if (typeof window === 'undefined' || !tournament?.id) return false;
    const saved = localStorage.getItem(`autoAllocate_${tournament.id}`);
    return saved === 'true';
  });

  // Save auto-allocation setting when it changes
  useEffect(() => {
    if (tournament?.id) {
      localStorage.setItem(`autoAllocate_${tournament.id}`, String(autoAllocateCourts));
    }
  }, [autoAllocateCourts, tournament?.id]);

  // Court Management (using new hook)
  const {
    courtViewModels,
    courtMatchModels,
    queueMatchModels,
    queue: rawQueue,
    waitTimes,
    assignMatchToCourt,
    startMatchOnCourt,
    finishMatchOnCourt,
    handleAssignCourt,
    autoAssignFreeCourts,
  } = useCourtManagement({
    tournamentId: tournament.id,
    matches,
    courts,
    divisions,
    autoAssignOnRestComplete: autoAllocateCourts,
    options: { testMode: tournament.testMode || false },  // V06.27: 10s rest in test mode
    courtSettings: tournament.courtSettings,  // V07.02: Premier court settings
  });
  // Match Actions (using new hook)
  const {
    handleAddTeam,
    handleRemoveTeam,
    handleGenerateSchedule,
    handleGenerateFinals,
    handleUpdateScore,
    handleUpdateMultiGameScore,  // V06.42: Multi-game score handler
  } = useMatchActions({
    tournamentId: tournament.id,
    activeDivision,
    divisionTeams,
    playersCache,
    currentUserId: currentUser?.uid,
    isOrganizer,
  });


  const [viewMode, setViewMode] = useState<'public' | 'admin'>('public');
  const [adminTab, setAdminTab] = useState<
    'participants' | 'courts' | 'settings' | 'sponsors' | 'staff' | 'livecourts' | 'pools' |
    'pool-stage' | 'medal-bracket' | 'bracket' | 'standings' | 'swiss-rounds' | 'ladder'
  >('livecourts');

  
  // Wizard State
  const [showRegistrationWizard, setShowRegistrationWizard] = useState(false);
  const [wizardProps, setWizardProps] = useState<{
    mode: 'full' | 'waiver_only';
    initialDivisionId?: string;
  }>({ mode: 'full' });

  useEffect(() => {
    if (initialWizardState?.isOpen) {
      setShowRegistrationWizard(true);
      setWizardProps({
        mode: initialWizardState.mode || 'full',
        initialDivisionId: initialWizardState.divisionId,
      });
      if (clearWizardState) clearWizardState();
    }
  }, [initialWizardState, clearWizardState]);

  const handleOpenWizard = () => {
    setWizardProps({ mode: 'full' });
    setShowRegistrationWizard(true);
  };

  // Track if the current user has already completed a registration

  const [showScheduleBuilder, setShowScheduleBuilder] = useState(false);
  /* -------- Active Division / Tabs -------- */

  const [activeTab, setActiveTab] = useState<
    'details' | 'players' | 'bracket' | 'standings' | 'pool-stage' | 'final-stage'
  >('details');

  // Editable division settings (ratings, age, seeding, day assignment)
  const [divisionSettings, setDivisionSettings] = useState<{
    minRating: string;
    maxRating: string;
    minAge: string;
    maxAge: string;
    seedingMethod: SeedingMethod;
    tournamentDayId: string;
  }>({
    minRating: '',
    maxRating: '',
    minAge: '',
    maxAge: '',
    seedingMethod: 'dupr',
    tournamentDayId: '',
  });

  // Medal bracket settings state (moved to top level to follow React hooks rules)
  const [localMedalSettings, setLocalMedalSettings] = useState(() => {
    const format = activeDivision?.format;
    const medalSettings = format?.medalRoundSettings || {};
    const plateSettings = (format as any)?.plateRoundSettings || {};  // V06.40
    return {
      useSeparateMedalSettings: format?.useSeparateMedalSettings ?? false,
      quarterFinals: medalSettings.quarterFinals || { bestOf: 1, pointsToWin: 11, winBy: 2 },
      semiFinals: medalSettings.semiFinals || { bestOf: 1, pointsToWin: 11, winBy: 2 },
      finals: medalSettings.finals || { bestOf: 3, pointsToWin: 11, winBy: 2 },
      bronze: medalSettings.bronze || { bestOf: 3, pointsToWin: 11, winBy: 2 },
      // V06.40: Plate bracket settings
      plateFinals: plateSettings.plateFinals || { bestOf: 1, pointsToWin: 11, winBy: 2 },
      plateBronze: plateSettings.plateBronze || { bestOf: 1, pointsToWin: 11, winBy: 2 },
    };
  });

  // Update local medal settings when division changes
  useEffect(() => {
    const f = activeDivision?.format;
    const ms = f?.medalRoundSettings || {};
    const ps = (f as any)?.plateRoundSettings || {};  // V06.40
    setLocalMedalSettings({
      useSeparateMedalSettings: f?.useSeparateMedalSettings ?? false,
      quarterFinals: ms.quarterFinals || { bestOf: 1, pointsToWin: 11, winBy: 2 },
      semiFinals: ms.semiFinals || { bestOf: 1, pointsToWin: 11, winBy: 2 },
      finals: ms.finals || { bestOf: 3, pointsToWin: 11, winBy: 2 },
      bronze: ms.bronze || { bestOf: 3, pointsToWin: 11, winBy: 2 },
      // V06.40: Plate bracket settings
      plateFinals: ps.plateFinals || { bestOf: 1, pointsToWin: 11, winBy: 2 },
      plateBronze: ps.plateBronze || { bestOf: 1, pointsToWin: 11, winBy: 2 },
    });
  }, [activeDivision?.id, activeDivision?.format?.useSeparateMedalSettings]);

  // V06.26: Medal bracket confirmation modal state
  const [showMedalConfirmModal, setShowMedalConfirmModal] = useState(false);
  const [pendingStandings, setPendingStandings] = useState<StandingsEntry[]>([]);
  const [isSavingMedalSettings, setIsSavingMedalSettings] = useState(false);

  /* -------- Tournament phase derived from matches -------- */

  // Load editable settings when active division changes
  useEffect(() => {
    if (!activeDivision) return;
    setDivisionSettings({
      minRating:
        activeDivision.skillMin != null
          ? activeDivision.skillMin.toString()
          : '',
      maxRating:
        activeDivision.skillMax != null
          ? activeDivision.skillMax.toString()
          : '',
      minAge:
        activeDivision.ageMin != null ? activeDivision.ageMin.toString() : '',
      maxAge:
        activeDivision.ageMax != null ? activeDivision.ageMax.toString() : '',
      seedingMethod: (activeDivision.format.seedingMethod ||
        'dupr') as SeedingMethod,
      tournamentDayId: activeDivision.tournamentDayId || '',
    });

    // Set default tab based on format
    const isPoolPlayMedals = activeDivision.format?.competitionFormat === 'pool_play_medals' ||
      activeDivision.format?.stageMode === 'two_stage';
    if (isPoolPlayMedals && activeTab !== 'pool-stage' && activeTab !== 'final-stage' && activeTab !== 'details' && activeTab !== 'players') {
      setActiveTab('pool-stage');
    }
  }, [activeDivision]);

  /* -------- Per-match flags for confirmation UX -------- */

  const matchFlags = useMemo(() => {
    const flags: Record<
      string,
      { isWaitingOnYou?: boolean; canCurrentUserConfirm?: boolean }
    > = {};

    (divisionMatches || []).forEach(m => {
      // Support both OLD (teamAId/teamBId) and NEW (sideA/sideB) match structures
      const teamAId = m.teamAId || m.sideA?.id;
      const teamBId = m.teamBId || m.sideB?.id;
      const teamA = (teams || []).find(t => t.id === teamAId);
      const teamB = (teams || []).find(t => t.id === teamBId);

      // Get player IDs from team - players can be objects or strings
      const getPlayerIds = (team: typeof teamA): string[] => {
        if (!team?.players) return [];
        return team.players.map(p =>
          typeof p === 'string' ? p : (p.id || p.odUserId || '')
        ).filter(Boolean);
      };
      const teamAPlayerIds = getPlayerIds(teamA);
      const teamBPlayerIds = getPlayerIds(teamB);

      const isUserOnMatch =
        !!userProfile?.id &&
        (teamAPlayerIds.includes(userProfile.id) ||
          teamBPlayerIds.includes(userProfile.id));

      // Note: 'pending_confirmation' is not in MatchStatus - check for 'scheduled' with score
      const hasScores = (m.scoreTeamAGames?.length ?? 0) > 0 || (m.scores?.length ?? 0) > 0;
      const isPendingConfirm = m.status === 'scheduled' && hasScores;

      const isWaitingOnYou =
        !!isPendingConfirm &&
        !!currentUser &&
        isUserOnMatch &&
        !!m.lastUpdatedBy &&
        m.lastUpdatedBy !== currentUser.uid;

      const isOrganiserUser =
        !!userProfile?.roles &&
        (userProfile.roles.includes('organizer') || userProfile.roles.includes('app_admin'));

      const canCurrentUserConfirm =
        !!currentUser &&
        ((isUserOnMatch &&
          !!m.lastUpdatedBy &&
          m.lastUpdatedBy !== currentUser.uid) ||
          isOrganiserUser);

      flags[m.id] = {
        isWaitingOnYou,
        canCurrentUserConfirm,
      };
    });

    return flags;
  }, [divisionMatches, teams, userProfile, currentUser]);

  /* -------- UI match mapping (used by Schedule + BracketViewer) -------- */

  // Helper to build gameSettings from division format
  const buildGameSettings = (division: Division | undefined): GameSettings | undefined => {
    if (!division?.format) return undefined;
    // Map EventType to PlayType (singles, doubles, mixed_doubles -> singles, doubles, mixed)
    const mapEventTypeToPlayType = (eventType?: string): 'singles' | 'doubles' | 'mixed' | 'open' => {
      if (eventType === 'singles') return 'singles';
      if (eventType === 'mixed_doubles') return 'mixed';
      return 'doubles'; // default for doubles and unknown types
    };
    return {
      playType: mapEventTypeToPlayType(division.type),
      pointsPerGame: (division.format.pointsPerGame || 11) as 11 | 15 | 21,
      winBy: (division.format.winBy || 2) as 1 | 2,
      bestOf: (division.format.bestOfGames || 1) as 1 | 3 | 5,
      capAt: undefined, // Division format doesn't have cap, leave undefined
    };
  };

  const uiMatches = useMemo(
    () =>
      (divisionMatches || []).map(m => {
        // Support both OLD (teamAId/teamBId) and NEW (sideA/sideB) match structures
        const teamAId = m.teamAId || m.sideA?.id || '';
        const teamBId = m.teamBId || m.sideB?.id || '';
        const teamAPlayers = teamAId ? getTeamPlayers(teamAId) : [];
        const teamBPlayers = teamBId ? getTeamPlayers(teamBId) : [];
        const flags = matchFlags[m.id] || {};

        // Extract scores - support both old (scoreTeamAGames) and new (scores[]) formats
        let score1 = null;
        let score2 = null;
        if (m.scoreTeamAGames && m.scoreTeamAGames.length > 0) {
          // Old format
          score1 = m.scoreTeamAGames[0] ?? null;
          score2 = m.scoreTeamBGames?.[0] ?? null;
        } else if (m.scores && m.scores.length > 0) {
          // New format - scores is array of { scoreA, scoreB }
          score1 = m.scores[0]?.scoreA ?? null;
          score2 = m.scores[0]?.scoreB ?? null;
        }

        // V06.42: Prefer match-level gameSettings (for bracket matches with custom settings)
        // Fall back to division-level settings
        const gameSettings = m.gameSettings || buildGameSettings(activeDivision);

        return {
          id: m.id,
          team1: {
            id: teamAId,
            name: m.sideA?.name || (teamAId ? getTeamDisplayName(teamAId) : 'TBD'),
            players: teamAPlayers.map(p => ({ name: p.displayName || p.email || 'Unknown' })),
          },
          team2: {
            id: teamBId,
            name: m.sideB?.name || (teamBId ? getTeamDisplayName(teamBId) : 'TBD'),
            players: teamBPlayers.map(p => ({ name: p.displayName || p.email || 'Unknown' })),
          },
          score1,
          score2,
          status: m.status || 'not_started',
          roundNumber: m.roundNumber || 1,
          court: m.court,
          courtName: m.court,
          poolGroup: m.poolGroup,  // Include pool group for pool stage display
          stage: m.stage,  // Include stage (pool, bracket, plate)
          gameSettings,  // V06.42: Uses match-level settings when available (for bracket rounds)
          ...flags,
        };
      }),
    [divisionMatches, getTeamDisplayName, getTeamPlayers, matchFlags, activeDivision]
  );

  // Find current user's active match (assigned to court but not completed)
  const currentUserMatch = useMemo(() => {
    if (!currentUser?.uid || !divisionMatches) return null;

    // Find matches where current user is a participant and match is active
    return (divisionMatches || []).find(m => {
      const isParticipant =
        m.sideA?.playerIds?.includes(currentUser.uid) ||
        m.sideB?.playerIds?.includes(currentUser.uid);

      // Active statuses: scheduled or in_progress
      const isActive =
        m.status === 'scheduled' ||
        m.status === 'in_progress';

      // Prioritize matches assigned to a court
      const isOnCourt = !!m.court;

      return isParticipant && isActive && isOnCourt;
    }) || (divisionMatches || []).find(m => {
      // Fallback: any active match for the user (not yet on court)
      const isParticipant =
        m.sideA?.playerIds?.includes(currentUser.uid) ||
        m.sideB?.playerIds?.includes(currentUser.uid);

      const isActive =
        m.status === 'scheduled' ||
        m.status === 'in_progress';

      return isParticipant && isActive;
    }) || null;
  }, [divisionMatches, currentUser?.uid]);

  const queue = useMemo(
    () =>
      (rawQueue || []).map(m => {
        // Support both OLD (teamAId/teamBId) and NEW (sideA/sideB) match structures
        const teamAId = m.teamAId || m.sideA?.id || '';
        const teamBId = m.teamBId || m.sideB?.id || '';

        // Extract scores - support both old and new formats
        let score1 = null;
        let score2 = null;
        if (m.scoreTeamAGames && m.scoreTeamAGames.length > 0) {
          score1 = m.scoreTeamAGames[0] ?? null;
          score2 = m.scoreTeamBGames?.[0] ?? null;
        } else if (m.scores && m.scores.length > 0) {
          score1 = m.scores[0]?.scoreA ?? null;
          score2 = m.scores[0]?.scoreB ?? null;
        }

        return {
          id: m.id,
          team1: {
            id: teamAId,
            name: m.sideA?.name || (teamAId ? getTeamDisplayName(teamAId) : 'TBD'),
            players: (teamAId ? getTeamPlayers(teamAId) : []).map(p => ({
              name: p.displayName || p.email || 'Unknown',
            })),
          },
          team2: {
            id: teamBId,
            name: m.sideB?.name || (teamBId ? getTeamDisplayName(teamBId) : 'TBD'),
            players: (teamBId ? getTeamPlayers(teamBId) : []).map(p => ({
              name: p.displayName || p.email || 'Unknown',
            })),
          },
          score1,
          score2,
          status: m.status || 'not_started',
          roundNumber: m.roundNumber || 1,
          court: m.court,
          courtName: m.court,
          stage: m.stage,
          poolGroup: m.poolGroup,
        };
      }),
    [rawQueue, getTeamDisplayName, getTeamPlayers]
  );

  // Auto-assign courts when auto-allocation mode is enabled
  useEffect(() => {
    if (autoAllocateCourts && (rawQueue || []).length > 0) {
      // Check if there are free courts and waiting matches
      const freeCourts = (courtViewModels || []).filter(c => c.status === 'AVAILABLE');
      if (freeCourts.length > 0) {
        autoAssignFreeCourts({ silent: true });
      }
    }
  }, [autoAllocateCourts, rawQueue, courtViewModels, autoAssignFreeCourts]);

  /* -------- My matches (for current user in this division) -------- */

  const myDivisionMatches = useMemo(() => {
    if (!currentUser || !activeDivision || !divisionMatches) return [] as Match[];

    // Find teams where current user is a player
    const isUserInTeam = (team: typeof teams[0]): boolean => {
      // Check playerIds array
      if (team.playerIds?.includes(currentUser.uid)) return true;
      // Check players object array
      if (team.players?.some(p =>
        (typeof p === 'string' && p === currentUser.uid) ||
        (typeof p === 'object' && (p.id === currentUser.uid || p.odUserId === currentUser.uid))
      )) return true;
      return false;
    };

    const myTeamIds = (teams || [])
      .filter(t => t.divisionId === activeDivision.id && isUserInTeam(t))
      .map(t => t.id)
      .filter((id): id is string => !!id);

    if (myTeamIds.length === 0) return [] as Match[];

    return (divisionMatches || []).filter(m => {
      // Support both OLD (teamAId/teamBId) and NEW (sideA/sideB) match structures
      const teamAId = m.teamAId || m.sideA?.id;
      const teamBId = m.teamBId || m.sideB?.id;
      return (teamAId && myTeamIds.includes(teamAId)) || (teamBId && myTeamIds.includes(teamBId));
    });
  }, [currentUser, activeDivision, teams, divisionMatches]);

  const myCurrentMatch = useMemo(
    () => (myDivisionMatches || []).find(m => m.status === 'in_progress'),
    [myDivisionMatches]
  );

  const myNextMatch = useMemo(() => {
    const waiting = (myDivisionMatches || []).filter(m => {
      const status = m.status ?? 'scheduled';
      return status === 'scheduled' || status === 'not_started';
    });
    if (waiting.length === 0) return undefined;
    return waiting.sort((a, b) => (a.roundNumber || 1) - (b.roundNumber || 1))[0];
  }, [myDivisionMatches]);

  const myMatchToShow = useMemo(
    () =>
      myCurrentMatch ||
      myNextMatch ||
      // Look for matches with scores but not yet completed (awaiting confirmation)
      (myDivisionMatches || []).find(m =>
        m.status === 'scheduled' && (m.scoreTeamAGames?.length || m.scores?.length)
      ),
    [myCurrentMatch, myNextMatch, myDivisionMatches]
  );

  const myMatchSummary = useMemo(() => {
    if (!currentUser || !myMatchToShow) return null;

    const match = myMatchToShow;

    // Support both OLD (teamAId/teamBId) and NEW (sideA/sideB) match structures
    const teamAId = match.teamAId || match.sideA?.id || '';
    const teamBId = match.teamBId || match.sideB?.id || '';
    const teamA = (teams || []).find(t => t.id === teamAId);

    // Check if user is on team A using playerIds or players array
    const isOnTeamA = teamA?.playerIds?.includes(currentUser.uid) ||
      teamA?.players?.some(p =>
        (typeof p === 'string' && p === currentUser.uid) ||
        (typeof p === 'object' && (p.id === currentUser.uid || p.odUserId === currentUser.uid))
      );

    const mySideName = isOnTeamA
      ? (teamAId ? getTeamDisplayName(teamAId) : 'My Team')
      : (teamBId ? getTeamDisplayName(teamBId) : 'My Team');

    const opponentName = isOnTeamA
      ? (teamBId ? getTeamDisplayName(teamBId) : 'Opponent')
      : (teamAId ? getTeamDisplayName(teamAId) : 'Opponent');

    // Determine status label based on match state
    let statusLabel = '';
    if (match.status === 'in_progress') {
      statusLabel = 'In Progress';
    } else if (!match.status || match.status === 'scheduled') {
      // Check if there are scores (awaiting confirmation)
      if (match.scoreTeamAGames?.length || match.scores?.length) {
        statusLabel = 'Awaiting Score Confirmation';
      } else {
        statusLabel = 'Up Next';
      }
    } else if (match.status === 'completed') {
      statusLabel = 'Completed';
    }

    return {
      mySideName,
      opponentName,
      statusLabel,
      courtName: match.court || 'TBD',
      match,
    };
  }, [currentUser, myMatchToShow, teams, getTeamDisplayName]);

  /* -------- Actions -------- */

  // Standings & H2H
  const { standings, h2hMatrix } = useMemo(() => {
    const stats: Record<string, StandingsEntry> = {};
    const h2h: Record<string, Record<string, number>> = {};

    (divisionTeams || []).forEach(t => {
      const teamId = t.id || '';
      if (!teamId) return;
      stats[teamId] = {
        odTeamId: teamId,
        teamName: getTeamDisplayName(teamId),
        played: 0,
        won: 0,
        lost: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        pointDifferential: 0,
        leaguePoints: 0,
      };
      h2h[teamId] = {};
    });

    (divisionMatches || []).forEach(m => {
      // Support both OLD (teamAId/teamBId, scoreTeamAGames) and NEW (sideA/sideB, scores[]) structures
      const teamAId = m.teamAId || m.sideA?.id;
      const teamBId = m.teamBId || m.sideB?.id;

      // Extract scores from old or new format
      let sA = 0;
      let sB = 0;
      let hasScores = false;

      if (m.scoreTeamAGames && m.scoreTeamAGames.length > 0 && m.scoreTeamBGames && m.scoreTeamBGames.length > 0) {
        // OLD format
        sA = m.scoreTeamAGames.reduce((a: number, b: number) => a + b, 0);
        sB = m.scoreTeamBGames.reduce((a: number, b: number) => a + b, 0);
        hasScores = true;
      } else if (m.scores && m.scores.length > 0) {
        // NEW format - sum all games
        sA = m.scores.reduce((sum: number, g: { scoreA?: number; scoreB?: number }) => sum + (g.scoreA || 0), 0);
        sB = m.scores.reduce((sum: number, g: { scoreA?: number; scoreB?: number }) => sum + (g.scoreB || 0), 0);
        hasScores = true;
      }

      if (m.status === 'completed' && hasScores && teamAId && teamBId) {
        const tA = stats[teamAId];
        const tB = stats[teamBId];

        if (tA && tB) {
          tA.played++;
          tB.played++;
          tA.pointsFor += sA;
          tB.pointsFor += sB;
          tA.pointsAgainst += sB;
          tB.pointsAgainst += sA;

          if (sA > sB) {
            tA.won++;
            tB.lost++;
            h2h[teamAId][teamBId] =
              (h2h[teamAId][teamBId] || 0) + 1;
          } else if (sB > sA) {
            tB.won++;
            tA.lost++;
            h2h[teamBId][teamAId] =
              (h2h[teamBId][teamAId] || 0) + 1;
          }
        }
      }
    });

    Object.values(stats).forEach(
      s => (s.pointDifferential = s.pointsFor - s.pointsAgainst)
    );
    return { standings: Object.values(stats), h2hMatrix: h2h };
  }, [divisionTeams, divisionMatches, getTeamDisplayName]);

  const handleUpdateDivisionSettings = async (updates: Partial<Division>) => {
    if (!activeDivision) return;
    const updatedDiv = { ...activeDivision, ...updates };
    try {
      await saveTournament(tournament, [updatedDiv]);
    } catch (e) {
      console.error('Failed to update division', e);
      alert('Failed to save settings.');
    }
  };

  const handleSaveDivisionSettings = async () => {
    if (!activeDivision) return;

    const skillMin =
      divisionSettings.minRating.trim() !== ''
        ? parseFloat(divisionSettings.minRating)
        : undefined;
    const skillMax =
      divisionSettings.maxRating.trim() !== ''
        ? parseFloat(divisionSettings.maxRating)
        : undefined;
    const ageMin =
      divisionSettings.minAge.trim() !== ''
        ? parseInt(divisionSettings.minAge, 10)
        : undefined;
    const ageMax =
      divisionSettings.maxAge.trim() !== ''
        ? parseInt(divisionSettings.maxAge, 10)
        : undefined;

    await updateDivision(tournament.id, activeDivision.id, {
      skillMin,
      skillMax,
      ageMin,
      ageMax,
      format: {
        ...activeDivision.format,
        seedingMethod: divisionSettings.seedingMethod,
      },
      // Day assignment for multi-day tournaments
      tournamentDayId: divisionSettings.tournamentDayId || undefined,
    });

    alert('Division settings updated');
  };

  /* -------- Court Management -------- */

  const [newCourtName, setNewCourtName] = useState('');

  const handleAddCourt = async () => {
    if (!newCourtName) return;
    await addCourt(tournament.id, newCourtName, (courts || []).length + 1);
    setNewCourtName('');
  };
  
  /* -------- Player Start Match (from sidebar) -------- */

  const handlePlayerStartMatch = async (matchId: string) => {
    const match = (matches || []).find(m => m.id === matchId);
    if (!match) return;

    if (!currentUser) {
      alert('You must be logged in to start the match.');
      return;
    }

    // Support both old (teamAId) and new (sideA) formats
    const teamAId = match.teamAId || match.sideA?.id;
    const teamBId = match.teamBId || match.sideB?.id;
    const teamA = (teams || []).find(t => t.id === teamAId);
    const teamB = (teams || []).find(t => t.id === teamBId);

    // Check if user is on either team (supporting both playerIds and players arrays)
    const isUserOnTeam = (team: typeof teamA): boolean => {
      if (!team) return false;
      if (team.playerIds?.includes(currentUser.uid)) return true;
      if (team.players?.some(p =>
        (typeof p === 'string' && p === currentUser.uid) ||
        (typeof p === 'object' && (p.id === currentUser.uid || p.odUserId === currentUser.uid))
      )) return true;
      return false;
    };

    const isOnTeam = isUserOnTeam(teamA) || isUserOnTeam(teamB);

    if (!isOnTeam && !isOrganizer) {
      alert('Only players in this match (or organisers) can start the match.');
      return;
    }

    if (!match.court) {
      alert('This match has not been assigned to a court yet.');
      return;
    }

    await updateMatchScore(tournament.id, matchId, {
      status: 'in_progress',
      startTime: Date.now(),
    });
  };

  if (!activeDivision)
    return <div className="p-8 text-center">Loading...</div>;

  // Test mode handlers
  const handleClearTestData = async (): Promise<number> => {
    if (!activeDivision) return 0;
    return clearTestData(tournament.id, activeDivision.id);
  };

  const handleQuickScore = async (matchId: string, scoreA: number, scoreB: number): Promise<void> => {
    await quickScoreMatch(tournament.id, matchId, scoreA, scoreB, true);
  };

  const handleSimulatePool = async (poolName: string): Promise<void> => {
    if (!activeDivision) return;
    await simulatePoolCompletion(tournament.id, activeDivision.id, poolName);
  };

  const handleExitTestMode = async () => {
    await onUpdateTournament({ ...tournament, testMode: false });
  };

  const isTestModeActive = tournament.testMode === true && permissions.isFullAdmin;

  return (
    <TestModeWrapper
      isTestMode={isTestModeActive}
      onExitTestMode={handleExitTestMode}
    >
    <div className="animate-fade-in relative">
      {showRegistrationWizard && userProfile && (
        <TournamentRegistrationWizard
          tournament={tournament}
          userProfile={userProfile}
          onClose={() => setShowRegistrationWizard(false)}
          onComplete={() => {
            setShowRegistrationWizard(false);
            // hasCompletedRegistration is automatically updated via useTournamentData hook
          }}
          mode={wizardProps.mode}
          initialDivisionId={wizardProps.initialDivisionId}
        />
      )}

      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors group"
        >
          <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Tournaments
        </button>
        <span className="text-gray-600">/</span>
        <span className="text-gray-300 font-medium truncate">{tournament.name}</span>
      </div>

      {/* Hero Banner */}
      <div className="relative w-full rounded-2xl overflow-hidden mb-6 bg-gradient-to-br from-gray-800 via-gray-900 to-gray-800 border border-white/5">
        {/* Background Image */}
        {tournament.bannerUrl && (
          <img
            src={tournament.bannerUrl}
            className="absolute inset-0 w-full h-full object-cover opacity-30"
            alt=""
          />
        )}

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/80 to-transparent" />

        {/* Content */}
        <div className="relative px-6 py-8 md:px-8 md:py-10">
          {/* Top Row - View Toggle & Share Button */}
          <div className="flex justify-end gap-2 mb-6">
            {/* Share Results Button */}
            <button
              onClick={() => {
                const resultsUrl = `${window.location.origin}/#/results/${tournament.id}?type=tournament`;
                navigator.clipboard.writeText(resultsUrl).then(() => {
                  alert('Results page link copied to clipboard!');
                }).catch(() => {
                  // Fallback: open in new tab
                  window.open(`/#/results/${tournament.id}?type=tournament`, '_blank');
                });
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all bg-lime-500/20 text-lime-300 border border-lime-500/30 hover:bg-lime-500/30"
              title="Copy public results link for spectators"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Share Results
            </button>

            {/* View Toggle - Show for tournament owner, app admin, or staff */}
            {canSeeAdminView && (
              <button
                onClick={() => setViewMode(viewMode === 'public' ? 'admin' : 'public')}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                  ${viewMode === 'admin'
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/30'
                    : 'bg-white/10 text-white border border-white/10 hover:bg-white/20'
                  }
                `}
              >
                {viewMode === 'admin' ? (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    Public View
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Manager View
                  </>
                )}
              </button>
            )}
          </div>

          {/* Tournament Title */}
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight">
            {tournament.name}
          </h1>

          {/* Hosted By / Club Branding */}
          {(tournament.clubId || tournament.clubName || tournament.organizerName) && (
            <ClubBrandingSection
              clubId={tournament.clubId}
              clubName={tournament.clubName}
              organizerName={tournament.organizerName}
              variant="header"
              className="mb-4"
            />
          )}

          {/* Official Sponsors */}
          {tournament.sponsors && tournament.sponsors.filter(s => s.isActive).length > 0 && (
            <div className="mb-6 p-4 rounded-xl bg-gray-900/40 border border-white/5">
              <div className="flex items-center gap-4">
                <span className="text-xs text-gray-500 uppercase tracking-wide">Official Sponsors</span>
                <SponsorLogoStrip
                  sponsors={tournament.sponsors.filter(s => s.isActive)}
                  variant="header"
                />
              </div>
            </div>
          )}


          {/* Tournament Status Management (Manager View Only) */}
          {canManageTournament && viewMode === 'admin' && (
            <div className="mb-6 p-4 rounded-xl bg-gray-900/60 backdrop-blur border border-white/10">
              <div className="flex flex-wrap items-center gap-4">
                {/* Current Status Badge */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 uppercase tracking-wide">Status:</span>
                  <span className={`
                    inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold
                    ${tournament.status === 'draft' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : ''}
                    ${tournament.status === 'published' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : ''}
                    ${tournament.status === 'registration_open' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : ''}
                    ${tournament.status === 'registration_closed' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : ''}
                    ${tournament.status === 'in_progress' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : ''}
                    ${tournament.status === 'completed' ? 'bg-gray-500/20 text-gray-400 border border-gray-500/30' : ''}
                    ${tournament.status === 'cancelled' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : ''}
                  `}>
                    {tournament.status === 'draft' && 'Draft'}
                    {tournament.status === 'published' && 'Published'}
                    {tournament.status === 'registration_open' && 'Registration Open'}
                    {tournament.status === 'registration_closed' && 'Registration Closed'}
                    {tournament.status === 'in_progress' && 'In Progress'}
                    {tournament.status === 'completed' && 'Completed'}
                    {tournament.status === 'cancelled' && 'Cancelled'}
                  </span>
                </div>

                {/* Status Action Buttons */}
                <div className="flex flex-wrap items-center gap-2 ml-auto">
                  {/* Draft → Published */}
                  {tournament.status === 'draft' && (
                    <button
                      onClick={() => onUpdateTournament({ ...tournament, status: 'published' })}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-purple-600 hover:bg-purple-500 text-white transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      Publish
                    </button>
                  )}

                  {/* Published → Registration Open */}
                  {tournament.status === 'published' && (
                    <>
                      <button
                        onClick={() => onUpdateTournament({ ...tournament, status: 'registration_open' })}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-500 text-white transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                        </svg>
                        Open Registration
                      </button>
                      <button
                        onClick={() => onUpdateTournament({ ...tournament, status: 'draft' })}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-600 hover:bg-gray-500 text-white transition-colors"
                      >
                        Back to Draft
                      </button>
                    </>
                  )}

                  {/* Registration Open → Registration Closed */}
                  {tournament.status === 'registration_open' && (
                    <button
                      onClick={() => onUpdateTournament({ ...tournament, status: 'registration_closed' })}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-yellow-600 hover:bg-yellow-500 text-white transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      Close Registration
                    </button>
                  )}

                  {/* Registration Closed → In Progress */}
                  {tournament.status === 'registration_closed' && (
                    <>
                      <button
                        onClick={() => onUpdateTournament({ ...tournament, status: 'in_progress' })}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-orange-600 hover:bg-orange-500 text-white transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Start Tournament
                      </button>
                      <button
                        onClick={() => onUpdateTournament({ ...tournament, status: 'registration_open' })}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-600 hover:bg-gray-500 text-white transition-colors"
                      >
                        Reopen Registration
                      </button>
                    </>
                  )}

                  {/* In Progress → Completed */}
                  {tournament.status === 'in_progress' && (
                    <button
                      onClick={() => {
                        if (confirm('Are you sure you want to mark this tournament as completed?')) {
                          onUpdateTournament({ ...tournament, status: 'completed' });
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-600 hover:bg-gray-500 text-white transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Complete Tournament
                    </button>
                  )}

                  {/* Cancel Option (for draft, published, registration states) */}
                  {['draft', 'published', 'registration_open', 'registration_closed'].includes(tournament.status) && (
                    <button
                      onClick={() => {
                        if (confirm('Are you sure you want to cancel this tournament? This action can be undone.')) {
                          onUpdateTournament({ ...tournament, status: 'cancelled' });
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 transition-colors"
                    >
                      Cancel
                    </button>
                  )}

                  {/* Restore from Cancelled */}
                  {tournament.status === 'cancelled' && (
                    <button
                      onClick={() => onUpdateTournament({ ...tournament, status: 'draft' })}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                    >
                      Restore to Draft
                    </button>
                  )}
                </div>
              </div>

              {/* Status Flow Hint */}
              <div className="mt-3 pt-3 border-t border-white/5">
                <p className="text-xs text-gray-500">
                  {tournament.status === 'draft' && 'Draft tournaments are only visible to you. Publish to make it visible to players.'}
                  {tournament.status === 'published' && 'Tournament is visible but registration is not yet open.'}
                  {tournament.status === 'registration_open' && 'Players can register for this tournament.'}
                  {tournament.status === 'registration_closed' && 'Registration is closed. Generate pools/brackets and start the tournament.'}
                  {tournament.status === 'in_progress' && 'Tournament is live. Matches can be played and scored.'}
                  {tournament.status === 'completed' && 'Tournament has ended. Results are final.'}
                  {tournament.status === 'cancelled' && 'Tournament has been cancelled.'}
                </p>
              </div>
            </div>
          )}

          {/* Stats Row */}
          <div className="flex flex-wrap gap-3 md:gap-4">
            {/* Players Stat */}
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{teams.length}</div>
                <div className="text-xs text-gray-400 uppercase tracking-wide">Teams</div>
              </div>
            </div>

            {/* Divisions Stat */}
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{divisions.length}</div>
                <div className="text-xs text-gray-400 uppercase tracking-wide">Divisions</div>
              </div>
            </div>

            {/* Courts Stat */}
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10">
              <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{(courts || []).filter(c => c.active).length}</div>
                <div className="text-xs text-gray-400 uppercase tracking-wide">Courts</div>
              </div>
            </div>

            {/* Live Status */}
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                tournamentPhase === 'in_progress'
                  ? 'bg-green-500/20'
                  : tournamentPhase === 'registration'
                    ? 'bg-amber-500/20'
                    : 'bg-gray-500/20'
              }`}>
                {tournamentPhase === 'in_progress' ? (
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                  </span>
                ) : (
                  <svg className={`w-5 h-5 ${tournamentPhase === 'registration' ? 'text-amber-400' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </div>
              <div>
                <div className={`text-sm font-bold uppercase tracking-wide ${
                  tournamentPhase === 'in_progress'
                    ? 'text-green-400'
                    : tournamentPhase === 'registration'
                      ? 'text-amber-400'
                      : 'text-gray-400'
                }`}>
                  {tournamentPhaseLabel}
                </div>
                <div className="text-xs text-gray-400">
                  {(matches || []).filter(m => m.status === 'in_progress').length} active
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Division Selector */}
      <div className="mb-6">
        {/* Mobile Dropdown */}
        <div className="md:hidden">
          <label htmlFor="division-select" className="sr-only">Select Division</label>
          <select
            id="division-select"
            value={activeDivisionId}
            onChange={(e) => setActiveDivisionId(e.target.value)}
            className="w-full bg-gray-800/80 text-white border border-white/10 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {(divisions || []).map((div) => {
              const teamCount = (teams || []).filter(t => t.divisionId === div.id).length;
              return (
                <option key={div.id} value={div.id}>
                  {div.name} ({teamCount} teams)
                </option>
              );
            })}
          </select>
        </div>

        {/* Desktop Tabs */}
        <div className="hidden md:flex overflow-x-auto gap-2 pb-2">
          {(divisions || []).map(div => {
            const teamCount = (teams || []).filter(t => t.divisionId === div.id).length;
            const isActive = activeDivisionId === div.id;
            const hasAttention = (attentionMatches || []).some(m => m.divisionId === div.id);
            // Find day label for multi-day tournaments
            const dayInfo = tournament.days?.find(d => d.id === div.tournamentDayId);
            const dayLabel = dayInfo?.label || (dayInfo ? `Day ${tournament.days!.indexOf(dayInfo) + 1}` : null);

            return (
              <button
                key={div.id}
                onClick={() => setActiveDivisionId(div.id)}
                className={`
                  relative flex-shrink-0 px-5 py-3 rounded-xl text-sm font-semibold
                  transition-all duration-200 group
                  ${isActive
                    ? 'bg-white text-gray-900 shadow-lg shadow-white/10'
                    : 'bg-gray-800/50 text-gray-300 border border-white/5 hover:bg-gray-800 hover:border-white/10'
                  }
                `}
              >
                <div className="flex flex-col items-start gap-0.5">
                  <span className="flex items-center gap-2">
                    {div.name}
                    {hasAttention && (
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    )}
                    {dayLabel && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${isActive ? 'bg-indigo-100 text-indigo-700' : 'bg-indigo-900/50 text-indigo-400'}`}>
                        {dayLabel}
                      </span>
                    )}
                  </span>
                  <span className={`text-xs ${isActive ? 'text-gray-600' : 'text-gray-500'}`}>
                    {teamCount} team{teamCount !== 1 ? 's' : ''}
                  </span>
                </div>
                {/* Active Indicator */}
                {isActive && (
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-indigo-500" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ADMIN VIEW */}
      {viewMode === 'admin' ? (
        <div className="space-y-4">
          {/* Admin Header Card */}
          <div className="bg-gradient-to-r from-gray-800 to-gray-800/80 rounded-2xl border border-white/5 overflow-hidden">
            {/* Header Bar */}
            <div className="px-6 py-4 border-b border-white/5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {activeDivision.name}
                  </h2>
                  <p className="text-sm text-gray-400 mt-0.5">
                    {activeDivision.type === 'doubles' ? 'Doubles' : 'Singles'} • {(divisionTeams || []).length} team{(divisionTeams || []).length !== 1 ? 's' : ''} • {(divisionMatches || []).length} match{(divisionMatches || []).length !== 1 ? 'es' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`
                      inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold uppercase
                      ${tournamentPhase === 'in_progress'
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                        : tournamentPhase === 'registration'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                      }
                    `}
                  >
                    {tournamentPhase === 'in_progress' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    )}
                    {tournamentPhaseLabel}
                  </span>
                  {tournamentPhase === 'registration' && (
                    <button
                      onClick={handleStartTournament}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-green-600 hover:bg-green-500 text-white transition-colors shadow-lg shadow-green-600/20"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Start Tournament
                    </button>
                  )}
                  {/* Admin Testing: Seed Button (only in test mode) */}
                  <TournamentSeedButton
                    tournamentId={tournament.id}
                    divisions={divisions}
                    testMode={isTestModeActive}
                    requireTestMode={true}
                  />
                </div>
              </div>
            </div>

            {/* Tab Navigation */}
            <div className="px-6 py-2 bg-gray-900/30">
              {/* Mobile Admin Dropdown */}
              <select
                value={adminTab}
                onChange={(e) => setAdminTab(e.target.value as any)}
                className="md:hidden w-full bg-gray-800 text-white border border-white/10 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-indigo-500"
              >
                {/* Settings first (admin only) */}
                {permissions.isFullAdmin && <option value="settings">⚙️ Settings</option>}
                {/* Live Courts (visible to staff) */}
                <option value="livecourts">📺 Live Courts</option>
                {/* Format-specific tabs (visible to all with admin view) */}
                {(activeDivision?.format?.competitionFormat === 'pool_play_medals' || activeDivision?.format?.stageMode === 'two_stage') && (
                  <>
                    <option value="pool-stage">🏊 Pool Stage</option>
                    <option value="medal-bracket">🏆 Medal Bracket</option>
                  </>
                )}
                {(activeDivision?.format?.competitionFormat === 'singles_elimination' ||
                  (activeDivision?.format?.stageMode === 'single_stage' && activeDivision?.format?.mainFormat === 'single_elim')) && (
                  <option value="bracket">🏆 Bracket</option>
                )}
                {(activeDivision?.format?.competitionFormat === 'round_robin' ||
                  (activeDivision?.format?.stageMode === 'single_stage' && activeDivision?.format?.mainFormat === 'round_robin')) && (
                  <option value="standings">📊 Standings</option>
                )}
                {/* Remaining admin-only tabs */}
                {permissions.isFullAdmin && <option value="participants">👥 Teams</option>}
                {permissions.isFullAdmin && <option value="courts">🏟️ Courts</option>}
                {permissions.isFullAdmin && <option value="sponsors">🏢 Sponsors</option>}
                {permissions.isFullAdmin && <option value="staff">👷 Staff</option>}
              </select>

              {/* Desktop Admin Tabs */}
              <div className="hidden md:flex gap-1">
                {[
                  // Settings first (admin only)
                  { id: 'settings', label: 'Settings', adminOnly: true, icon: (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
                  )},
                  // Live Courts (visible to staff)
                  { id: 'livecourts', label: 'Live Courts', adminOnly: false, icon: (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  )},
                  // FORMAT-SPECIFIC TABS - Pool Play → Medals format (visible to staff)
                  ...((activeDivision?.format?.competitionFormat === 'pool_play_medals' || activeDivision?.format?.stageMode === 'two_stage') ? [
                    { id: 'pool-stage', label: 'Pool Stage', adminOnly: false, icon: (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                      </svg>
                    )},
                    { id: 'medal-bracket', label: 'Medal Bracket', adminOnly: false, icon: (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                      </svg>
                    )},
                  ] : []),
                  // Single Elimination format (visible to staff)
                  ...((activeDivision?.format?.competitionFormat === 'singles_elimination' ||
                       (activeDivision?.format?.stageMode === 'single_stage' && activeDivision?.format?.mainFormat === 'single_elim')) ? [
                    { id: 'bracket', label: 'Bracket', adminOnly: false, icon: (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
                      </svg>
                    )},
                  ] : []),
                  // Round Robin format (visible to staff)
                  ...((activeDivision?.format?.competitionFormat === 'round_robin' ||
                       (activeDivision?.format?.stageMode === 'single_stage' && activeDivision?.format?.mainFormat === 'round_robin')) ? [
                    { id: 'standings', label: 'Standings', adminOnly: false, icon: (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    )},
                  ] : []),
                  // Teams (admin only)
                  { id: 'participants', label: 'Teams', adminOnly: true, icon: (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  )},
                  // Courts (admin only)
                  { id: 'courts', label: 'Courts', adminOnly: true, icon: (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                    </svg>
                  )},
                  // Sponsors (admin only)
                  { id: 'sponsors', label: 'Sponsors', adminOnly: true, icon: (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  )},
                  // Staff (admin only)
                  { id: 'staff', label: 'Staff', adminOnly: true, icon: (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                  )},
                ]
                // Filter tabs: show all for full admin, only non-adminOnly for staff
                .filter(tab => !tab.adminOnly || permissions.isFullAdmin)
                .map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setAdminTab(tab.id as any)}
                    className={`
                      flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all
                      ${adminTab === tab.id
                        ? 'bg-white/10 text-white'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }
                    `}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Tab Content */}
          <div className="bg-gray-800/50 rounded-2xl border border-white/5 p-6">

          {/* Test Mode Panel - shown when test mode is active */}
          {isTestModeActive && activeDivision && (
            <TestModePanel
              tournamentId={tournament.id}
              divisionId={activeDivision.id}
              matches={divisionMatches || []}
              teams={divisionTeams || []}
              onClearTestData={handleClearTestData}
              onQuickScore={handleQuickScore}
              onSimulatePool={handleSimulatePool}
              onDeleteCorruptedMatches={() => deleteCorruptedSelfMatches(tournament.id, activeDivision.id)}
            />
          )}

          {adminTab === 'participants' && (
            <div className="space-y-6">
              <TeamSetup
                teams={divisionTeams}
                playersCache={playersCache}
                activeDivision={activeDivision}
                onAddTeam={handleAddTeam}
                onDeleteTeam={handleRemoveTeam}
                isVerified={isVerified}
                tournamentId={tournament.id}
                entryFee={tournament.entryFee || 0}
                currentUserId={currentUser?.uid}
                canManage={canManageTournament}
                testMode={isTestModeActive}
                divisionName={activeDivision?.name}
              />

              {/* Matches that need organiser attention */}
              {(attentionMatches || []).length > 0 && (
                <div className="bg-gray-900 p-4 rounded border border-red-700/70">
                  <h4 className="text-white font-bold mb-3">
                    Matches Needing Attention
                  </h4>
                  <p className="text-xs text-gray-400 mb-3">
                    These matches are either disputed or waiting for score
                    confirmation. You can resolve them from the public{' '}
                    <span className="font-semibold">Details</span> or{' '}
                    <span className="font-semibold">Bracket</span> tabs by
                    entering or confirming the correct score.
                  </p>

                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {(attentionMatches || []).map(m => {
                      const teamAId = m.teamAId || m.sideA?.id || '';
                      const teamBId = m.teamBId || m.sideB?.id || '';
                      const teamAName = teamAId ? getTeamDisplayName(teamAId) : 'TBD';
                      const teamBName = teamBId ? getTeamDisplayName(teamBId) : 'TBD';
                      // Check if match needs attention: has scores but not completed
                      const hasScores = (m.scoreTeamAGames?.length ?? 0) > 0 || (m.scores?.length ?? 0) > 0;
                      const label = hasScores && m.status !== 'completed'
                        ? 'Pending confirmation'
                        : 'Needs attention';

                      return (
                        <div
                          key={m.id}
                          className="flex justify-between items-center bg-gray-800 border border-gray-700 rounded px-3 py-2 text-xs"
                        >
                          <div>
                            <div className="text-gray-100 font-semibold">
                              {teamAName}{' '}
                              <span className="text-gray-500">vs</span>{' '}
                              {teamBName}
                            </div>
                            <div className="text-[11px] text-gray-400">
                              {m.stage || `Round ${m.roundNumber || 1}`}
                              {m.court ? ` • Court ${m.court}` : ''}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                m.status === 'cancelled'
                                  ? 'bg-red-600 text-white'
                                  : 'bg-amber-400 text-gray-900'
                              }`}
                            >
                              {label}
                            </span>
                            <button
                              type="button"
                              onClick={() => setActiveTab('details')}
                              className="text-[10px] text-blue-300 hover:text-blue-200 underline"
                            >
                              Go to schedule
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {adminTab === 'courts' && (
            <div>
              <div className="flex gap-2 mb-4">
                <input
                  className="bg-gray-900 text-white p-2 rounded border border-gray-700"
                  placeholder="New Court Name (e.g. Court 5)"
                  value={newCourtName}
                  onChange={e => setNewCourtName(e.target.value)}
                />
                <button
                  onClick={handleAddCourt}
                  className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded font-bold"
                >
                  Add
                </button>
              </div>

              <div className="grid gap-2">
                {(courts || []).map(c => (
                  <div
                    key={c.id}
                    className="flex justify-between items-center bg-gray-900 p-3 rounded"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{c.name}</span>
                      <span
                        className={`text-xs px-2 rounded ${
                          c.active
                            ? 'bg-green-900 text-green-300'
                            : 'bg-red-900 text-red-300'
                        }`}
                      >
                        {c.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          updateCourt(tournament.id, c.id, { active: !c.active })
                        }
                        className="text-sm text-blue-400"
                      >
                        Toggle
                      </button>
                      <button
                        onClick={() => deleteCourt(tournament.id, c.id)}
                        className="text-sm text-red-400"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Queue Monitor */}
              <div className="mt-8 pt-4 border-t border-gray-700">
                <h4 className="text-white font-bold mb-2">
                  Pending Match Queue
                </h4>
                {(queue || []).length === 0 ? (
                  <p className="text-gray-500">No pending matches.</p>
                ) : (
                  <div className="bg-gray-900 rounded overflow-hidden">
                    {(queue || []).map((m, i) => (
                      <div
                        key={m.id}
                        className="flex justify-between p-2 border-b border-gray-800 hover:bg-gray-800"
                      >
                        <div className="text-xs text-gray-300">
                          {i + 1}. {m.team1.name} vs {m.team2.name} ({m.stage})
                        </div>
                        <button
                          onClick={() => handleAssignCourt(m.id)}
                          className="text-xs bg-green-700 text-white px-2 py-1 rounded"
                        >
                          Assign
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* V07.02: Premier Courts Settings */}
              <div className="mt-8 pt-4 border-t border-gray-700">
                <div className="flex items-center gap-2 mb-4">
                  <h4 className="text-white font-bold">Premier Courts</h4>
                  <span className="text-xs text-gray-400">Finals will be played on these designated courts</span>
                </div>

                {(courts || []).length === 0 ? (
                  <p className="text-gray-500 text-sm">Add courts above to configure premier court settings.</p>
                ) : (
                  <div className="space-y-4">
                    {/* Gold Court - Finals & Bronze */}
                    <div className="bg-gray-800 p-4 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">🥇</span>
                        <span className="text-white font-semibold">Gold Court</span>
                        <span className="text-xs text-gray-400">(Finals + Bronze Match)</span>
                      </div>
                      <select
                        value={tournament.courtSettings?.goldCourtId || ''}
                        onChange={(e) => {
                          const newSettings: TournamentCourtSettings = {
                            ...tournament.courtSettings,
                            goldCourtId: e.target.value || undefined,
                          };
                          onUpdateTournament({ ...tournament, courtSettings: newSettings });
                        }}
                        className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"
                      >
                        <option value="">Auto (first court)</option>
                        {(courts || []).filter(c => c.active !== false).map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Plate Court - Plate Finals & Plate 3rd */}
                    <div className="bg-gray-800 p-4 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">🥈</span>
                        <span className="text-white font-semibold">Plate Court</span>
                        <span className="text-xs text-gray-400">(Plate Final + Plate 3rd)</span>
                      </div>
                      <select
                        value={tournament.courtSettings?.plateCourtId || ''}
                        onChange={(e) => {
                          const newSettings: TournamentCourtSettings = {
                            ...tournament.courtSettings,
                            plateCourtId: e.target.value || undefined,
                          };
                          onUpdateTournament({ ...tournament, courtSettings: newSettings });
                        }}
                        className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600"
                      >
                        <option value="">Auto (second court)</option>
                        {(courts || []).filter(c => c.active !== false).map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Semi-Final Courts */}
                    <div className="bg-gray-800 p-4 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">⭐</span>
                        <span className="text-white font-semibold">Semi-Final Courts</span>
                        <span className="text-xs text-gray-400">(Preferred for semi-finals)</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {(courts || []).filter(c => c.active !== false).map(c => {
                          const isSelected = (tournament.courtSettings?.semiCourtIds || []).includes(c.id);
                          return (
                            <label
                              key={c.id}
                              className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                                isSelected ? 'bg-lime-900/30 border border-lime-600' : 'bg-gray-900 border border-gray-700 hover:border-gray-500'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  const currentIds = tournament.courtSettings?.semiCourtIds || [];
                                  const newIds = e.target.checked
                                    ? [...currentIds, c.id]
                                    : currentIds.filter(id => id !== c.id);
                                  const newSettings: TournamentCourtSettings = {
                                    ...tournament.courtSettings,
                                    semiCourtIds: newIds.length > 0 ? newIds : undefined,
                                  };
                                  onUpdateTournament({ ...tournament, courtSettings: newSettings });
                                }}
                                className="rounded"
                              />
                              <span className="text-white text-sm">{c.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* Reset to Defaults Button */}
                    <button
                      onClick={() => {
                        const defaults = getDefaultCourtSettings(courts || []);
                        onUpdateTournament({ ...tournament, courtSettings: defaults });
                      }}
                      className="text-sm text-blue-400 hover:text-blue-300"
                    >
                      Reset to Smart Defaults
                    </button>

                    {/* Info Box */}
                    <div className="bg-gray-800/50 rounded-lg p-3 text-xs text-gray-400 space-y-1">
                      <p><strong>How it works:</strong></p>
                      <p>• During pool stage & early brackets: All courts are used equally</p>
                      <p>• Semi-finals: Preferred on selected semi-final courts</p>
                      <p>• Gold Final: Played on Gold Court, then Bronze Match on same court</p>
                      <p>• Plate Final: Played on Plate Court, then Plate 3rd on same court</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pool Stage Tab - for pool_play_medals format */}
          {adminTab === 'pool-stage' && (activeDivision?.format?.competitionFormat === 'pool_play_medals' || activeDivision?.format?.stageMode === 'two_stage') && (
            <PoolStageTab
              tournament={tournament}
              activeDivision={activeDivision}
              divisionTeams={divisionTeams}
              divisionMatches={divisionMatches}
              standings={standings}
              getTeamDisplayName={getTeamDisplayName}
              getTeamPlayers={getTeamPlayers}
              handleGenerateSchedule={handleGenerateSchedule}
              deletePoolMatches={deletePoolMatches}
              savePoolAssignments={savePoolAssignments}
              setPendingStandings={setPendingStandings}
              setShowMedalConfirmModal={setShowMedalConfirmModal}
            />
          )}

          {/* Medal Bracket Tab - for pool_play_medals format */}
          {adminTab === 'medal-bracket' && (activeDivision?.format?.competitionFormat === 'pool_play_medals' || activeDivision?.format?.stageMode === 'two_stage') && (() => {
            // Save medal rules handler
            const handleSaveMedalRulesLocal = async () => {
              if (!activeDivision) return;
              const mainBracketMatches = (divisionMatches || []).filter(m =>
                (m.stage === 'bracket' || m.stage === 'Finals' || m.stage === 'finals' || m.stage === 'Medal' ||
                 m.bracketType === 'main' || (!m.poolGroup && !m.stage?.toLowerCase().includes('pool'))) &&
                m.bracketType !== 'plate'
              );
              const isBracketLocked = mainBracketMatches.length > 0;
              if (isBracketLocked) return;

              try {
                const newMedalRoundSettings: Record<string, any> = {};
                if (localMedalSettings.quarterFinals) newMedalRoundSettings.quarterFinals = localMedalSettings.quarterFinals;
                if (localMedalSettings.semiFinals) newMedalRoundSettings.semiFinals = localMedalSettings.semiFinals;
                if (localMedalSettings.finals) newMedalRoundSettings.finals = localMedalSettings.finals;
                if (localMedalSettings.bronze) newMedalRoundSettings.bronze = localMedalSettings.bronze;

                const newPlateRoundSettings: Record<string, any> = {};
                if ((activeDivision.format as any)?.plateEnabled) {
                  if (localMedalSettings.plateFinals) newPlateRoundSettings.plateFinals = localMedalSettings.plateFinals;
                  if (localMedalSettings.plateBronze) newPlateRoundSettings.plateBronze = localMedalSettings.plateBronze;
                }

                await updateDivision(tournament.id, activeDivision.id, {
                  format: {
                    ...activeDivision.format,
                    useSeparateMedalSettings: localMedalSettings.useSeparateMedalSettings,
                    ...(localMedalSettings.useSeparateMedalSettings && Object.keys(newMedalRoundSettings).length > 0 && {
                      medalRoundSettings: newMedalRoundSettings,
                    }),
                    ...(Object.keys(newPlateRoundSettings).length > 0 && {
                      plateRoundSettings: newPlateRoundSettings,
                    }),
                  },
                });
                alert('Medal rules saved successfully!');
              } catch (err) {
                console.error('Failed to save medal rules:', err);
                alert('Failed to save medal rules');
              }
            };

            return (
              <MedalBracketTab
                tournament={tournament}
                activeDivision={activeDivision}
                divisionMatches={divisionMatches}
                getTeamDisplayName={getTeamDisplayName}
                getTeamPlayers={getTeamPlayers}
                handleUpdateScore={handleUpdateScore}
                handleUpdateMultiGameScore={handleUpdateMultiGameScore}
                isVerified={isVerified}
                isOrganizer={isOrganizer}
                permissions={permissions}
                localMedalSettings={localMedalSettings}
                setLocalMedalSettings={setLocalMedalSettings}
                handleSaveMedalRules={handleSaveMedalRulesLocal}
              />
            );
          })()}

          {/* Bracket Tab - for single elimination format */}
          {adminTab === 'bracket' && (activeDivision?.format?.competitionFormat === 'singles_elimination' ||
            (activeDivision?.format?.stageMode === 'single_stage' && activeDivision?.format?.mainFormat === 'single_elim')) && (
            <div className="bg-gray-900 p-4 rounded border border-gray-700">
              <h3 className="text-white font-bold text-lg mb-4">Elimination Bracket</h3>
              {(() => {
                const bracketMatches = divisionMatches || [];
                if (bracketMatches.length === 0) {
                  return (
                    <p className="text-gray-400 text-center py-8">No bracket matches generated yet. Go to Teams tab to generate schedule.</p>
                  );
                }
                return (
                  <div className="space-y-2">
                    {bracketMatches
                      .sort((a, b) => (a.roundNumber || 0) - (b.roundNumber || 0))
                      .map(match => (
                        <div
                          key={match.id}
                          className={`p-3 rounded border ${
                            match.status === 'completed' ? 'border-green-700 bg-green-900/20' :
                            match.status === 'in_progress' ? 'border-yellow-700 bg-yellow-900/20' :
                            'border-gray-600 bg-gray-800'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="text-xs text-gray-500">Round {match.roundNumber || 1}</span>
                              <div className="text-sm">
                                <span className="text-white">{getTeamDisplayName(match.teamAId || match.sideA?.id)}</span>
                                <span className="text-gray-500"> vs </span>
                                <span className="text-white">{getTeamDisplayName(match.teamBId || match.sideB?.id)}</span>
                              </div>
                            </div>
                            <div className="text-sm">
                              {match.status === 'completed' && (
                                <span className="text-green-400">
                                  {match.scores?.map(s => `${s.scoreA}-${s.scoreB}`).join(', ') ||
                                    `${match.scoreTeamAGames?.[0] || 0}-${match.scoreTeamBGames?.[0] || 0}`}
                                </span>
                              )}
                              {match.status === 'in_progress' && <span className="text-yellow-400">In Progress</span>}
                              {match.status === 'scheduled' && <span className="text-gray-400">Scheduled</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Standings Tab - for round robin format */}
          {adminTab === 'standings' && (activeDivision?.format?.competitionFormat === 'round_robin' ||
            (activeDivision?.format?.stageMode === 'single_stage' && activeDivision?.format?.mainFormat === 'round_robin')) && (
            <div className="space-y-6">
              <div className="bg-gray-900 p-4 rounded border border-gray-700">
                <h3 className="text-white font-bold text-lg mb-4">Round Robin Standings</h3>
                <PoolGroupStandings
                  teams={divisionTeams || []}
                  matches={divisionMatches || []}
                  poolSettings={activeDivision?.format?.poolPlayMedalsSettings}
                  plateSettings={{
                    plateEnabled: (activeDivision?.format as any)?.plateEnabled,
                    plateThirdPlace: (activeDivision?.format as any)?.plateThirdPlace,
                    plateName: (activeDivision?.format as any)?.plateName,
                  }}
                  getTeamPlayers={getTeamPlayers}
                />
              </div>

              {/* Match List - Grouped by Pool */}
              <div className="bg-gray-900 p-4 rounded border border-gray-700">
                <h3 className="text-white font-bold text-lg mb-4">Match List</h3>
                {(() => {
                  // Group matches by pool
                  const poolMatches = (divisionMatches || []).filter(m => m.stage === 'pool' || !m.stage);
                  const bracketMatches = (divisionMatches || []).filter(m => m.stage === 'bracket' || m.stage === 'finals' || m.stage === 'third_place');
                  const plateMatches = (divisionMatches || []).filter(m => m.stage === 'plate');

                  // Get unique pool groups and sort them
                  const poolGroups = [...new Set(poolMatches.map(m => m.poolGroup || 'Pool A'))].sort();

                  // Helper to render a single match
                  const renderMatch = (match: Match) => (
                    <div
                      key={match.id}
                      className={`p-3 rounded border ${
                        match.status === 'completed' ? 'border-green-700 bg-green-900/20' :
                        match.status === 'in_progress' ? 'border-yellow-700 bg-yellow-900/20' :
                        'border-gray-600 bg-gray-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm">
                          <span className="text-white">{getTeamDisplayName(match.teamAId || match.sideA?.id)}</span>
                          <span className="text-gray-500"> vs </span>
                          <span className="text-white">{getTeamDisplayName(match.teamBId || match.sideB?.id)}</span>
                        </div>
                        <div className="text-sm">
                          {match.status === 'completed' && (
                            <span className="text-green-400">
                              {match.scores?.map(s => `${s.scoreA}-${s.scoreB}`).join(', ') ||
                                `${match.scoreTeamAGames?.[0] || 0}-${match.scoreTeamBGames?.[0] || 0}`}
                            </span>
                          )}
                          {match.status === 'in_progress' && <span className="text-yellow-400">In Progress</span>}
                          {match.status === 'scheduled' && <span className="text-gray-400">Scheduled</span>}
                        </div>
                      </div>
                    </div>
                  );

                  if ((divisionMatches || []).length === 0) {
                    return <p className="text-gray-500 text-center py-4">No matches generated yet. Go to Teams tab to generate schedule.</p>;
                  }

                  return (
                    <div className="space-y-6">
                      {/* Pool Stage Matches - Grouped by Pool */}
                      {poolGroups.length > 0 && (
                        <div className="space-y-4">
                          {poolGroups.map(poolName => {
                            const matches = poolMatches
                              .filter(m => (m.poolGroup || 'Pool A') === poolName)
                              .sort((a, b) => (a.matchNumber || 0) - (b.matchNumber || 0));
                            const completedCount = matches.filter(m => m.status === 'completed').length;

                            return (
                              <div key={poolName} className="border border-gray-700 rounded-lg overflow-hidden">
                                {/* Pool Header */}
                                <div className="bg-gray-800 px-4 py-2 flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-lg font-bold text-white">{poolName}</span>
                                    <span className="text-xs text-gray-400">({matches.length} matches)</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {completedCount === matches.length && matches.length > 0 ? (
                                      <span className="text-xs px-2 py-0.5 bg-green-900/50 text-green-400 rounded">Complete</span>
                                    ) : (
                                      <span className="text-xs text-gray-400">{completedCount}/{matches.length} played</span>
                                    )}
                                  </div>
                                </div>
                                {/* Pool Matches */}
                                <div className="p-3 space-y-2">
                                  {matches.map(renderMatch)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Medal Bracket Matches */}
                      {bracketMatches.length > 0 && (
                        <div className="border border-yellow-700/50 rounded-lg overflow-hidden">
                          <div className="bg-yellow-900/30 px-4 py-2 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-lg font-bold text-yellow-400">Medal Bracket</span>
                              <span className="text-xs text-gray-400">({bracketMatches.length} matches)</span>
                            </div>
                          </div>
                          <div className="p-3 space-y-2">
                            {bracketMatches.sort((a, b) => (a.matchNumber || 0) - (b.matchNumber || 0)).map(renderMatch)}
                          </div>
                        </div>
                      )}

                      {/* Plate Bracket Matches */}
                      {plateMatches.length > 0 && (
                        <div className="border border-purple-700/50 rounded-lg overflow-hidden">
                          <div className="bg-purple-900/30 px-4 py-2 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-lg font-bold text-purple-400">Plate Bracket</span>
                              <span className="text-xs text-gray-400">({plateMatches.length} matches)</span>
                            </div>
                          </div>
                          <div className="p-3 space-y-2">
                            {plateMatches.sort((a, b) => (a.matchNumber || 0) - (b.matchNumber || 0)).map(renderMatch)}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {adminTab === 'settings' && (
            <DivisionSettingsTab
              tournament={tournament}
              activeDivision={activeDivision}
              divisionTeams={divisionTeams}
              divisionMatches={divisionMatches as any}
              divisionSettings={divisionSettings}
              setDivisionSettings={setDivisionSettings}
              isAppAdmin={isAppAdmin}
              onUpdateTournament={onUpdateTournament}
              handleSaveDivisionSettings={handleSaveDivisionSettings}
              handleUpdateDivisionSettings={handleUpdateDivisionSettings}
              generatePoolAssignments={generatePoolAssignments}
              savePoolAssignments={savePoolAssignments}
            />
          )}

          {adminTab === 'sponsors' && (
            <SponsorManagement
              tournamentId={tournament.id}
              sponsors={tournament.sponsors || []}
              displaySettings={tournament.sponsorSettings}
              onUpdate={async () => {
                // Refresh tournament data
                const updated = await getTournament(tournament.id);
                if (updated) {
                  await onUpdateTournament(updated);
                }
              }}
            />
          )}

          {adminTab === 'staff' && permissions.isFullAdmin && (
            <StaffManagement
              tournamentId={tournament.id}
              staffIds={tournament.staffIds || []}
              onStaffUpdated={async () => {
                // Refresh tournament data
                const updated = await getTournament(tournament.id);
                if (updated) {
                  await onUpdateTournament(updated);
                }
              }}
            />
          )}

          {adminTab === 'livecourts' && (
            <LiveCourtsTab
              tournament={tournament}
              courts={courts || []}
              matches={matches}  // V07.02: Pass matches for finals detection
              courtViewModels={courtViewModels}
              courtMatchModels={courtMatchModels}
              queueMatchModels={queueMatchModels}
              queue={queue}
              autoAllocateCourts={autoAllocateCourts}
              setAutoAllocateCourts={setAutoAllocateCourts}
              autoAssignFreeCourts={autoAssignFreeCourts}
              assignMatchToCourt={assignMatchToCourt}
              startMatchOnCourt={startMatchOnCourt}
              finishMatchOnCourt={finishMatchOnCourt}
            />
          )}
          </div>
          {/* End Tab Content */}
        </div>
      ) : (
        /* PUBLIC VIEW */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6 min-w-0">
            {/* Player's Current Match Card */}
            {currentUser && currentUserMatch && (
              <PlayerMatchCard
                match={currentUserMatch}
                tournamentId={tournament.id}
                currentUserId={currentUser.uid}
              />
            )}

            {/* View Tabs / Dropdown */}
            <div>
              {/* Determine tabs based on format */}
              {(() => {
                const isPoolPlayMedals = activeDivision?.format?.competitionFormat === 'pool_play_medals' ||
                  activeDivision?.format?.stageMode === 'two_stage';

                const tabs = isPoolPlayMedals
                  ? [
                      { id: 'pool-stage', label: 'Pool Stage' },
                      { id: 'final-stage', label: 'Final Stage' },
                      { id: 'details', label: 'Schedule' },
                      { id: 'players', label: 'Players' },
                    ]
                  : [
                      { id: 'details', label: 'Details' },
                      { id: 'bracket', label: 'Bracket' },
                      { id: 'players', label: 'Players' },
                      { id: 'standings', label: 'Standings' },
                    ];

                return (
                  <>
                    {/* Mobile View Selector */}
                    <div className="md:hidden border-b border-gray-700 pb-2 mb-2">
                      <label htmlFor="view-select" className="sr-only">Select View</label>
                      <select
                        id="view-select"
                        value={activeTab}
                        onChange={(e) => setActiveTab(e.target.value as any)}
                        className="w-full bg-gray-800 text-white border border-gray-700 rounded p-2 focus:ring-2 focus:ring-green-500"
                      >
                        {tabs.map(t => (
                          <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Desktop View Tabs */}
                    <div className="hidden md:flex border-b border-gray-700">
                      {tabs.map(t => (
                        <button
                          key={t.id}
                          onClick={() => setActiveTab(t.id as any)}
                          className={`px-6 py-3 text-sm font-bold uppercase hover:text-gray-300 transition-colors ${
                            activeTab === t.id
                              ? 'text-green-400 border-b-2 border-green-400'
                              : 'text-gray-500'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>

            {activeTab === 'details' && (
              <Schedule
                matches={uiMatches}
                courts={courts}
                queue={queue}
                queueMatchModels={queueMatchModels}
                waitTimes={waitTimes}
                onUpdateScore={handleUpdateScore}
                isVerified={isVerified}
              />
            )}

            {activeTab === 'bracket' && (
              <BracketViewer
                matches={uiMatches}
                onUpdateScore={handleUpdateScore}
                onUpdateMultiGameScore={handleUpdateMultiGameScore}
                isVerified={isVerified}
              />
            )}

            {activeTab === 'players' && (
              <div className="bg-gray-800 rounded-lg p-6 shadow-lg border border-gray-700">
                <h2 className="text-xl font-bold mb-4 text-green-400">
                  Players / Teams
                </h2>

                {(divisionTeams || []).length === 0 ? (
                  <p className="text-gray-400 text-sm italic">
                    No teams registered yet for this division.
                  </p>
                ) : (
                  <table className="w-full text-sm text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-700 text-gray-400 text-xs uppercase">
                        <th className="py-2 pr-4">Team</th>
                        {activeDivision.type === 'doubles' && (
                          <>
                            <th className="py-2 pr-4">Player 1</th>
                            <th className="py-2 pr-4">Player 2</th>
                          </>
                        )}
                        {activeDivision.type === 'singles' && (
                          <th className="py-2 pr-4">Player</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {(divisionTeams || []).map(team => {
                        const teamId = team.id || '';
                        const players = teamId ? getTeamPlayers(teamId) : [];
                        return (
                          <tr
                            key={team.id}
                            className="border-b border-gray-800"
                          >
                            <td className="py-2 pr-4 text-white">
                              {team.teamName ||
                                players
                                  .map(p => p.displayName)
                                  .join(' / ') ||
                                'Unnamed'}
                            </td>

                            {activeDivision.type === 'doubles' && (
                              <>
                                <td className="py-2 pr-4 text-gray-200">
                                  {players[0]?.displayName || '-'}
                                </td>
                                <td className="py-2 pr-4 text-gray-200">
                                  {players[1]?.displayName || '-'}
                                </td>
                              </>
                            )}

                            {activeDivision.type === 'singles' && (
                              <td className="py-2 pr-4 text-gray-200">
                                {players[0]?.displayName || '-'}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {activeTab === 'standings' && (
              <Standings
                standings={(standings || []).map(s => {
                  const teamPlayers = s.odTeamId ? getTeamPlayers(s.odTeamId) : [];
                  return {
                    ...s,
                    team: {
                      id: s.odTeamId,
                      name: s.teamName,
                      players: teamPlayers.map(p => p.displayName || p.email || 'Unknown'),
                    },
                  };
                })}
                tieBreakers={[
                  activeDivision.format.tieBreakerPrimary,
                  activeDivision.format.tieBreakerSecondary,
                  activeDivision.format.tieBreakerTertiary,
                ] as any}
                h2hLookup={h2hMatrix}
              />
            )}

            {/* Pool Stage - grouped pool standings for pool_play_medals format */}
            {activeTab === 'pool-stage' && (
              <PoolGroupStandings
                matches={divisionMatches || []}
                teams={divisionTeams || []}
                poolSettings={activeDivision?.format?.poolPlayMedalsSettings}
                plateSettings={{
                  plateEnabled: (activeDivision?.format as any)?.plateEnabled,
                  plateThirdPlace: (activeDivision?.format as any)?.plateThirdPlace,
                  plateName: (activeDivision?.format as any)?.plateName,
                }}
                getTeamPlayers={getTeamPlayers}
              />
            )}

            {/* Final Stage - bracket view for pool_play_medals format */}
            {activeTab === 'final-stage' && (() => {
              // Filter matches into main bracket and plate bracket
              const bracketMatches = (uiMatches || []).filter(m =>
                (m.stage === 'medal' ||
                m.stage === 'bracket' ||
                m.stage === 'semifinal' ||
                m.stage === 'quarterfinal' ||
                m.stage === 'final' ||
                !m.poolGroup) &&
                (m as any).bracketType !== 'plate'
              );
              const plateMatches = (uiMatches || []).filter(m =>
                (m as any).bracketType === 'plate' ||
                (m as any).stage === 'plate'
              );

              const plateEnabled = activeDivision?.format?.plateEnabled === true;
              const plateName = activeDivision?.format?.plateName || 'Plate';
              const hasMainBracket = bracketMatches.length > 0;
              const hasPlateBracket = plateMatches.length > 0;

              return (
                <div className="space-y-8">
                  {/* Main Bracket */}
                  {hasMainBracket ? (
                    <BracketViewer
                      matches={bracketMatches}
                      onUpdateScore={handleUpdateScore}
                      onUpdateMultiGameScore={handleUpdateMultiGameScore}
                      isVerified={isVerified}
                      bracketTitle="Main Bracket"
                      bracketType="main"
                      finalsLabel="Gold Medal Match"
                    />
                  ) : (
                    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                      <h2 className="text-lg font-bold text-green-400 mb-2">Main Bracket</h2>
                      <p className="text-gray-400 text-sm italic">
                        Main bracket will be generated after pool stage completes.
                      </p>
                    </div>
                  )}

                  {/* Plate Bracket (if enabled) */}
                  {plateEnabled && (
                    hasPlateBracket ? (
                      <BracketViewer
                        matches={plateMatches}
                        onUpdateScore={handleUpdateScore}
                        onUpdateMultiGameScore={handleUpdateMultiGameScore}
                        isVerified={isVerified}
                        bracketTitle={`${plateName} Bracket`}
                        bracketType="plate"
                        finalsLabel={`${plateName} Final`}
                      />
                    ) : (
                      <div className="bg-gray-800 rounded-lg p-6 border border-amber-700/30">
                        <h2 className="text-lg font-bold text-amber-400 mb-2">{plateName} Bracket</h2>
                        <p className="text-gray-400 text-sm italic">
                          {plateName} bracket will be generated after pool stage completes.
                        </p>
                      </div>
                    )
                  )}
                </div>
              );
            })()}
          </div>

          {/* Sidebar */}
          <div className="min-w-0">
            {/* Your Match – BIG and FIRST */}
            {currentUser && myMatchSummary && (
              <div className="bg-gray-800 p-6 rounded border border-green-600 mb-4">
                <h3 className="text-base font-bold text-green-400 mb-3">
                  Your Match
                </h3>

                <div className="text-xs text-gray-300 mb-2">
                  {myMatchSummary.statusLabel}
                </div>

                <div className="text-lg text-white font-semibold mb-1">
                  {myMatchSummary.mySideName}
                </div>
                <div className="text-xs text-gray-400 mb-1">vs</div>
                <div className="text-lg text-white font-semibold mb-3">
                  {myMatchSummary.opponentName}
                </div>

                <div className="text-sm text-gray-100 mb-3">
                  Go to{' '}
                  <span className="font-bold">
                    Court {myMatchSummary.courtName}
                  </span>
                </div>

                {(!myMatchSummary.match.status ||
                  myMatchSummary.match.status === 'scheduled' ||
                  myMatchSummary.match.status === 'not_started') &&
                  myMatchSummary.match.court && (
                    <button
                      onClick={() =>
                        handlePlayerStartMatch(myMatchSummary.match.id)
                      }
                      className="w-full bg-green-600 hover:bg-green-500 text-white text-sm font-bold py-3 rounded shadow-md"
                    >
                      Start Match
                    </button>
                  )}

                {myMatchSummary.match.status === 'in_progress' && (
                  <div className="text-[11px] text-gray-400 mt-2">
                    Match in progress. Enter scores from the schedule when
                    finished.
                  </div>
                )}

                {/* Show pending confirmation message when there are scores but not completed */}
                {myMatchSummary.match.status === 'scheduled' &&
                  ((myMatchSummary.match.scoreTeamAGames?.length ?? 0) > 0 ||
                   (myMatchSummary.match.scores?.length ?? 0) > 0) && (
                  <div className="text-[11px] text-yellow-300 mt-2">
                    Scores pending confirmation.
                  </div>
                )}
              </div>
            )}

            {/* Registration / Tournament Status Card */}
            <div className="bg-gray-800 p-6 rounded border border-gray-700">
              {tournamentPhase === 'registration' ? (
                <button
                  onClick={handleOpenWizard}
                  className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded shadow"
                >
                  {hasCompletedRegistration
                    ? 'Manage Registration'
                    : 'Register for Tournament'}
                </button>
              ) : (
                <button
                  disabled
                  className={`w-full text-white font-bold py-3 rounded shadow opacity-80 cursor-not-allowed ${
                    tournamentPhase === 'in_progress'
                      ? 'bg-blue-700'
                      : 'bg-gray-700'
                  }`}
                >
                  {tournamentPhase === 'completed'
                    ? 'Tournament Completed'
                    : 'Tournament In Progress'}
                </button>
              )}

              <div className="mt-4 text-xs text-gray-400 space-y-2">
                <p>
                  <strong>Format:</strong>{' '}
                  {activeDivision.format.stageMode === 'single_stage'
                    ? activeDivision.format.mainFormat
                    : `${activeDivision.format.numberOfPools} Pools + Finals`}
                </p>
                <p>
                  <strong>Match Rules:</strong> Best of{' '}
                  {activeDivision.format.bestOfGames},{' '}
                  {activeDivision.format.pointsPerGame}
                  pts
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Builder Modal */}
      {showScheduleBuilder && (
        <div className="fixed inset-0 z-50">
          <ScheduleBuilder
            tournamentId={tournament.id}
            tournamentName={tournament.name}
            days={[{
              id: 'day-1',
              date: new Date(tournament.startDate).toISOString().split('T')[0],
              startTime: '09:00',
              endTime: '17:00',
              label: 'Tournament Day',
            }]}
            divisions={(divisions || []).map(d => ({
              id: d.id,
              name: d.name,
              matchCount: (matches || []).filter(m => m.divisionId === d.id).length,
            }))}
            courts={(courts || []).map(c => ({
              courtId: c.id || '',
              courtName: c.name,
              dayId: 'day-1',
              available: c.active ?? true,
              startTime: '09:00',
              endTime: '17:00',
            }))}
            registrations={(teams || [])
              .filter(t => t.id && t.divisionId) // Only include teams with valid IDs
              .map(t => ({
                divisionId: t.divisionId!,
                teamId: t.id!,
                teamName: t.teamName || `Team ${t.id!.slice(0, 4)}`,
                playerIds: t.playerIds || [],
              }))}
            matchups={(matches || [])
              .filter(m => m.divisionId && (m.teamAId || m.sideA?.id) && (m.teamBId || m.sideB?.id)) // Only include valid matches
              .map((m, idx) => ({
                divisionId: m.divisionId!,
                matchId: m.id,
                stage: (m.stage === 'pool' ? 'pool' : m.stage === 'final' || m.stage === 'semifinal' || m.stage === 'quarterfinal' ? 'medal' : 'bracket') as 'pool' | 'bracket' | 'medal',
                roundNumber: m.roundNumber ?? 1,
                matchNumber: idx + 1,
                teamAId: m.teamAId || m.sideA?.id || '',
                teamBId: m.teamBId || m.sideB?.id || '',
              }))}
            onPublish={async (scheduledMatches) => {
              try {
                // Convert scheduled matches to update format
                const updates = scheduledMatches.map(sm => {
                  // Parse time string (e.g., "09:00") to timestamp
                  // Use tournament date as base or today if not set
                  const baseDate = new Date();
                  const [hours, minutes] = sm.scheduledTime.split(':').map(Number);
                  baseDate.setHours(hours, minutes, 0, 0);

                  const startTime = baseDate.getTime();

                  // Calculate end time from duration
                  const endTime = startTime + (sm.durationMinutes * 60 * 1000);

                  return {
                    matchId: sm.matchId,
                    courtName: sm.courtName,
                    startTime,
                    endTime,
                  };
                });

                await publishScheduleTimes(tournament.id, updates);
                console.log('Schedule published successfully:', updates.length, 'matches');
                setShowScheduleBuilder(false);
              } catch (error) {
                console.error('Failed to publish schedule:', error);
                alert('Failed to save schedule. Please try again.');
              }
            }}
            onCancel={() => setShowScheduleBuilder(false)}
          />
        </div>
      )}
    </div>

      {/* V06.26: Medal Bracket Confirmation Modal */}
      {showMedalConfirmModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 border border-gray-600">
            <h3 className="text-white font-bold text-lg mb-4">Confirm Medal Bracket Settings</h3>

            <p className="text-gray-300 text-sm mb-4">
              These settings will be applied to medal matches:
            </p>

            <div className="bg-gray-900 rounded p-3 mb-4 text-sm">
              {localMedalSettings.useSeparateMedalSettings ? (
                <div className="space-y-1">
                  <div className="flex justify-between text-gray-300">
                    <span>Semi-Finals:</span>
                    <span className="text-white">Best of {localMedalSettings.semiFinals?.bestOf || 1}</span>
                  </div>
                  <div className="flex justify-between text-gray-300">
                    <span>Gold Match:</span>
                    <span className="text-white font-bold">Best of {localMedalSettings.finals?.bestOf || 3}</span>
                  </div>
                  <div className="flex justify-between text-gray-300">
                    <span>Bronze Match:</span>
                    <span className="text-white">Best of {localMedalSettings.bronze?.bestOf || 3}</span>
                  </div>
                  {/* V06.40: Plate bracket settings */}
                  {(activeDivision?.format as any)?.plateEnabled && (
                    <>
                      <div className="border-t border-gray-700 my-2 pt-2">
                        <span className="text-amber-400 font-medium text-xs">
                          {(activeDivision?.format as any)?.plateName || 'Plate'} Bracket:
                        </span>
                      </div>
                      <div className="flex justify-between text-amber-400">
                        <span>{(activeDivision?.format as any)?.plateName || 'Plate'} Final:</span>
                        <span className="text-white">Best of {localMedalSettings.plateFinals?.bestOf || 1}</span>
                      </div>
                      {(activeDivision?.format as any)?.plateThirdPlace && (
                        <div className="flex justify-between text-amber-400">
                          <span>{(activeDivision?.format as any)?.plateName || 'Plate'} Bronze:</span>
                          <span className="text-white">Best of {localMedalSettings.plateBronze?.bestOf || 1}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="text-gray-400">
                  Using pool play settings (Best of {activeDivision?.format?.bestOfGames || 1})
                </div>
              )}
            </div>

            <p className="text-amber-400 text-xs mb-4">
              Settings cannot be changed after bracket generation.
            </p>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowMedalConfirmModal(false)}
                disabled={isSavingMedalSettings}
                className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!activeDivision) return;
                  setIsSavingMedalSettings(true);

                  try {
                    // 1. Build medalRoundSettings object (only include defined values)
                    const medalRoundSettings: Record<string, any> = {};
                    if (localMedalSettings.quarterFinals) {
                      medalRoundSettings.quarterFinals = localMedalSettings.quarterFinals;
                    }
                    if (localMedalSettings.semiFinals) {
                      medalRoundSettings.semiFinals = localMedalSettings.semiFinals;
                    }
                    if (localMedalSettings.finals) {
                      medalRoundSettings.finals = localMedalSettings.finals;
                    }
                    if (localMedalSettings.bronze) {
                      medalRoundSettings.bronze = localMedalSettings.bronze;
                    }

                    // V06.40: Build plateRoundSettings if plate bracket is enabled
                    const plateRoundSettings: Record<string, any> = {};
                    if ((activeDivision.format as any)?.plateEnabled) {
                      if (localMedalSettings.plateFinals) {
                        plateRoundSettings.plateFinals = localMedalSettings.plateFinals;
                      }
                      if (localMedalSettings.plateBronze) {
                        plateRoundSettings.plateBronze = localMedalSettings.plateBronze;
                      }
                    }

                    // 2. Save medal settings to division format
                    await updateDivision(tournament.id, activeDivision.id, {
                      format: {
                        ...activeDivision.format,
                        useSeparateMedalSettings: localMedalSettings.useSeparateMedalSettings,
                        ...(Object.keys(medalRoundSettings).length > 0 && {
                          medalRoundSettings,
                        }),
                        // V06.40: Include plate round settings if plate is enabled
                        ...(Object.keys(plateRoundSettings).length > 0 && {
                          plateRoundSettings,
                        }),
                      },
                    });

                    // 3. Generate bracket directly (reads fresh settings from Firestore)
                    await handleGenerateFinals(pendingStandings);

                    setShowMedalConfirmModal(false);
                  } catch (err) {
                    console.error('Failed to save and generate:', err);
                    alert('Failed to generate bracket. Please try again.');
                  } finally {
                    setIsSavingMedalSettings(false);
                  }
                }}
                disabled={isSavingMedalSettings}
                className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded font-bold disabled:bg-gray-600 disabled:cursor-not-allowed"
              >
                {isSavingMedalSettings ? 'Generating...' : 'Save & Generate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </TestModeWrapper>
  );
};
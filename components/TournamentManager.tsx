import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { 
  Tournament, 
  Division, 
  Team, 
  Match, 
  Court, 
  UserProfile, 
  SeedingMethod, 
  StandingsEntry
} from '../types';
import { useAuth } from '../contexts/AuthContext';
import { 
  updateDivision,
  saveTournament,
  addCourt,
  updateCourt,
  deleteCourt,
  updateMatchScore,  
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

interface TournamentManagerProps {
  tournament: Tournament;
  onUpdateTournament: (t: Tournament) => Promise<void>;
  isVerified: boolean;
  onBack: () => void;
  initialWizardState?: { isOpen: boolean; mode?: 'full'|'waiver_only'; divisionId?: string } | null;
  clearWizardState?: () => void;
}


const validateScoreForDivision = (score1: number, score2: number, division: Division): string | null => {
  if (score1 < 0 || score2 < 0) return 'Scores cannot be negative.';
  return null;
};

export const TournamentManager: React.FC<TournamentManagerProps> = ({
  tournament,
  onUpdateTournament,
  isVerified,
  onBack,
  initialWizardState,
  clearWizardState,
}) => {
  const { currentUser, userProfile, isOrganizer } = useAuth();
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
    tournamentPhaseClass,
    handleStartTournament,
  } = useTournamentPhase({ matches });
  // Court Management (using new hook)
  const {
    courtViewModels,
    courtMatchModels,
    queue: rawQueue,
    waitTimes,
    getBusyTeamIds,
    findActiveConflictMatch,
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
  });
  // Match Actions (using new hook)
  const {
    handleAddTeam,
    handleRemoveTeam,
    handleGenerateSchedule,
    handleGenerateFinals,
    handleUpdateScore,
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
    'participants' | 'courts' | 'settings' | 'livecourts'
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
 
    // Tournament Phase (using new hook)

  const [autoAllocateCourts, setAutoAllocateCourts] = useState(false);
  const [showScheduleBuilder, setShowScheduleBuilder] = useState(false);
  /* -------- Active Division / Tabs -------- */

  const [activeTab, setActiveTab] = useState<
    'details' | 'players' | 'bracket' | 'standings'
  >('details');

  // Editable division settings (ratings, age, seeding)
  const [divisionSettings, setDivisionSettings] = useState<{
    minRating: string;
    maxRating: string;
    minAge: string;
    maxAge: string;
    seedingMethod: SeedingMethod;
  }>({
    minRating: '',
    maxRating: '',
    minAge: '',
    maxAge: '',
    seedingMethod: 'rating',
  });

  /* -------- Tournament phase derived from matches -------- */

  // Load editable settings when active division changes
  useEffect(() => {
    if (!activeDivision) return;
    setDivisionSettings({
      minRating:
        activeDivision.minRating != null
          ? activeDivision.minRating.toString()
          : '',
      maxRating:
        activeDivision.maxRating != null
          ? activeDivision.maxRating.toString()
          : '',
      minAge:
        activeDivision.minAge != null ? activeDivision.minAge.toString() : '',
      maxAge:
        activeDivision.maxAge != null ? activeDivision.maxAge.toString() : '',
      seedingMethod: (activeDivision.format.seedingMethod ||
        'rating') as SeedingMethod,
    });
  }, [activeDivision]);

  /* -------- Per-match flags for confirmation UX -------- */

  const matchFlags = useMemo(() => {
    const flags: Record<
      string,
      { isWaitingOnYou?: boolean; canCurrentUserConfirm?: boolean }
    > = {};

    divisionMatches.forEach(m => {
      const teamA = teams.find(t => t.id === m.teamAId);
      const teamB = teams.find(t => t.id === m.teamBId);

      const teamAPlayers = teamA?.players || [];
      const teamBPlayers = teamB?.players || [];

      const isUserOnMatch =
        !!userProfile &&
        (teamAPlayers.includes(userProfile.id) ||
          teamBPlayers.includes(userProfile.id));

      const isWaitingOnYou =
        m.status === 'pending_confirmation' &&
        !!currentUser &&
        isUserOnMatch &&
        !!m.lastUpdatedBy &&
        m.lastUpdatedBy !== currentUser.uid;

      const isOrganiserUser =
        !!userProfile &&
        (userProfile.roles.includes('organizer') || userProfile.roles.includes('admin'));

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

  const uiMatches = useMemo(
    () =>
      divisionMatches.map(m => {
        const teamAPlayers = getTeamPlayers(m.teamAId);
        const teamBPlayers = getTeamPlayers(m.teamBId);
        const flags = matchFlags[m.id] || {};

        return {
          id: m.id,
          team1: {
            id: m.teamAId,
            name: getTeamDisplayName(m.teamAId),
            players: teamAPlayers.map(p => ({ name: p.displayName })),
          },
          team2: {
            id: m.teamBId,
            name: getTeamDisplayName(m.teamBId),
            players: teamBPlayers.map(p => ({ name: p.displayName })),
          },
          score1: m.scoreTeamAGames[0] ?? null,
          score2: m.scoreTeamBGames[0] ?? null,
          status: m.status || 'not_started',
          roundNumber: m.roundNumber || 1,
          court: m.court,
          courtName: m.court,
          ...flags,
        };
      }),
    [divisionMatches, getTeamDisplayName, getTeamPlayers, matchFlags]
  );

  const queue = useMemo(
    () =>
      rawQueue.map(m => ({
        id: m.id,
        team1: {
          id: m.teamAId,
          name: getTeamDisplayName(m.teamAId),
          players: getTeamPlayers(m.teamAId).map(p => ({
            name: p.displayName,
          })),
        },
        team2: {
          id: m.teamBId,
          name: getTeamDisplayName(m.teamBId),
          players: getTeamPlayers(m.teamBId).map(p => ({
            name: p.displayName,
          })),
        },
        score1: m.scoreTeamAGames[0] ?? null,
        score2: m.scoreTeamBGames[0] ?? null,
        status: m.status || 'not_started',
        roundNumber: m.roundNumber || 1,
        court: m.court,
        courtName: m.court,
        stage: m.stage,
      })),
    [rawQueue, getTeamDisplayName, getTeamPlayers]
  );

  /* -------- My matches (for current user in this division) -------- */

  const myDivisionMatches = useMemo(() => {
    if (!currentUser || !activeDivision) return [] as Match[];

    const myTeamIds = teams
      .filter(
        t =>
          t.divisionId === activeDivision.id &&
          t.players.includes(currentUser.uid)
      )
      .map(t => t.id);

    if (myTeamIds.length === 0) return [] as Match[];

    return divisionMatches.filter(
      m => myTeamIds.includes(m.teamAId) || myTeamIds.includes(m.teamBId)
    );
  }, [currentUser, activeDivision, teams, divisionMatches]);

  const myCurrentMatch = useMemo(
    () => myDivisionMatches.find(m => m.status === 'in_progress'),
    [myDivisionMatches]
  );

  const myNextMatch = useMemo(() => {
    const waiting = myDivisionMatches.filter(m => {
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
      myDivisionMatches.find(m => m.status === 'pending_confirmation'),
    [myCurrentMatch, myNextMatch, myDivisionMatches]
  );

  const myMatchSummary = useMemo(() => {
    if (!currentUser || !myMatchToShow) return null;

    const match = myMatchToShow;

    const teamA = teams.find(t => t.id === match.teamAId);
    const teamB = teams.find(t => t.id === match.teamBId);

    const isOnTeamA = teamA?.players?.includes(currentUser.uid);

    const mySideName = isOnTeamA
      ? getTeamDisplayName(match.teamAId)
      : getTeamDisplayName(match.teamBId);

    const opponentName = isOnTeamA
      ? getTeamDisplayName(match.teamBId)
      : getTeamDisplayName(match.teamAId);

    let statusLabel = '';
    if (match.status === 'in_progress') statusLabel = 'In Progress';
    else if (!match.status || match.status === 'scheduled' || match.status === 'not_started')
      statusLabel = 'Up Next';
    else if (match.status === 'pending_confirmation')
      statusLabel = 'Awaiting Score Confirmation';
    else if (match.status === 'disputed') statusLabel = 'Disputed Score';

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

    divisionTeams.forEach(t => {
      stats[t.id] = {
        teamId: t.id,
        teamName: getTeamDisplayName(t.id),
        played: 0,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        pointDifference: 0,
      };
      h2h[t.id] = {};
    });

    divisionMatches.forEach(m => {
      if (
        m.status === 'completed' &&
        m.scoreTeamAGames.length > 0 &&
        m.scoreTeamBGames.length > 0
      ) {
        const sA = m.scoreTeamAGames.reduce((a, b) => a + b, 0);
        const sB = m.scoreTeamBGames.reduce((a, b) => a + b, 0);
        const tA = stats[m.teamAId];
        const tB = stats[m.teamBId];

        if (tA && tB) {
          tA.played++;
          tB.played++;
          tA.pointsFor += sA;
          tB.pointsFor += sB;
          tA.pointsAgainst += sB;
          tB.pointsAgainst += sA;

          if (sA > sB) {
            tA.wins++;
            tB.losses++;
            h2h[m.teamAId][m.teamBId] =
              (h2h[m.teamAId][m.teamBId] || 0) + 1;
          } else if (sB > sA) {
            tB.wins++;
            tA.losses++;
            h2h[m.teamBId][m.teamAId] =
              (h2h[m.teamBId][m.teamAId] || 0) + 1;
          }
        }
      }
    });

    Object.values(stats).forEach(
      s => (s.pointDifference = s.pointsFor - s.pointsAgainst)
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

    const minRating =
      divisionSettings.minRating.trim() !== ''
        ? parseFloat(divisionSettings.minRating)
        : null;
    const maxRating =
      divisionSettings.maxRating.trim() !== ''
        ? parseFloat(divisionSettings.maxRating)
        : null;
    const minAge =
      divisionSettings.minAge.trim() !== ''
        ? parseInt(divisionSettings.minAge, 10)
        : null;
    const maxAge =
      divisionSettings.maxAge.trim() !== ''
        ? parseInt(divisionSettings.maxAge, 10)
        : null;

    await updateDivision(tournament.id, activeDivision.id, {
      minRating,
      maxRating,
      minAge,
      maxAge,
      format: {
        ...activeDivision.format,
        seedingMethod: divisionSettings.seedingMethod,
      },
    });

    alert('Division settings updated');
  };

  /* -------- Court Management -------- */

  const [newCourtName, setNewCourtName] = useState('');

  const handleAddCourt = async () => {
    if (!newCourtName) return;
    await addCourt(tournament.id, newCourtName, courts.length + 1);
    setNewCourtName('');
  };
  
  /* -------- Player Start Match (from sidebar) -------- */

  const handlePlayerStartMatch = async (matchId: string) => {
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    if (!currentUser) {
      alert('You must be logged in to start the match.');
      return;
    }

    const teamA = teams.find(t => t.id === match.teamAId);
    const teamB = teams.find(t => t.id === match.teamBId);

    const isOnTeam =
      teamA?.players?.includes(currentUser.uid) ||
      teamB?.players?.includes(currentUser.uid);

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

  return (
    <div className="animate-fade-in relative">
      {showRegistrationWizard && userProfile && (
        <TournamentRegistrationWizard
          tournament={tournament}
          userProfile={userProfile}
          onClose={() => setShowRegistrationWizard(false)}
          onComplete={() => {
            setShowRegistrationWizard(false);
            setHasCompletedRegistration(true);
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
          {/* Top Row - View Toggle */}
          {isOrganizer && (
            <div className="flex justify-end mb-6">
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
            </div>
          )}

          {/* Tournament Title */}
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-6 tracking-tight">
            {tournament.name}
          </h1>

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
                <div className="text-2xl font-bold text-white">{courts.filter(c => c.active).length}</div>
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
                  {matches.filter(m => m.status === 'in_progress').length} active
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
            {divisions.map((div) => {
              const teamCount = teams.filter(t => t.divisionId === div.id).length;
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
          {divisions.map(div => {
            const teamCount = teams.filter(t => t.divisionId === div.id).length;
            const isActive = activeDivisionId === div.id;
            const hasAttention = attentionMatches.some(m => m.divisionId === div.id);

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
                    {activeDivision.type === 'doubles' ? 'Doubles' : 'Singles'} • {divisionTeams.length} team{divisionTeams.length !== 1 ? 's' : ''} • {divisionMatches.length} match{divisionMatches.length !== 1 ? 'es' : ''}
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
                <option value="livecourts">📺 Live Courts</option>
                <option value="participants">👥 Participants</option>
                <option value="courts">🏟️ Courts</option>
                <option value="settings">⚙️ Settings</option>
              </select>

              {/* Desktop Admin Tabs */}
              <div className="hidden md:flex gap-1">
                {[
                  { id: 'livecourts', label: 'Live Courts', icon: (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  )},
                  { id: 'participants', label: 'Teams', icon: (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  )},
                  { id: 'courts', label: 'Courts', icon: (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                    </svg>
                  )},
                  { id: 'settings', label: 'Settings', icon: (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
                  )},
                ].map(tab => (
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

          {adminTab === 'participants' && (
            <div className="space-y-6">
              <TeamSetup
                teams={divisionTeams}
                playersCache={playersCache}
                activeDivision={activeDivision}
                onAddTeam={handleAddTeam}
                onDeleteTeam={handleRemoveTeam}
                onGenerateSchedule={handleGenerateSchedule}
                scheduleGenerated={divisionMatches.length > 0}
                isVerified={isVerified}
              />

              <div className="bg-gray-900 p-4 rounded border border-gray-700">
                <h4 className="text-white font-bold mb-2">Schedule Actions</h4>
                <div className="flex gap-4">
                  {activeDivision.format.stageMode === 'two_stage' && (
                    <button
                      onClick={() => handleGenerateFinals(standings)}
                      disabled={divisionMatches.length === 0}
                      className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded font-bold disabled:bg-gray-700"
                    >
                      Generate Finals from Pools
                    </button>
                  )}
                  <button
                    onClick={() => setShowScheduleBuilder(true)}
                    disabled={matches.length === 0}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-bold disabled:bg-gray-700 flex items-center gap-2"
                  >
                    <span>📅</span>
                    Build Schedule
                  </button>
                </div>
              </div>

              {/* Matches that need organiser attention */}
              {attentionMatches.length > 0 && (
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
                    {attentionMatches.map(m => {
                      const teamAName = getTeamDisplayName(m.teamAId);
                      const teamBName = getTeamDisplayName(m.teamBId);
                      const label =
                        m.status === 'pending_confirmation'
                          ? 'Pending confirmation'
                          : 'Disputed';

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
                                m.status === 'disputed'
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
                {courts.map(c => (
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
                {queue.length === 0 ? (
                  <p className="text-gray-500">No pending matches.</p>
                ) : (
                  <div className="bg-gray-900 rounded overflow-hidden">
                    {queue.map((m, i) => (
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
            </div>
          )}

          {adminTab === 'settings' && (
            <div className="space-y-6">
              <div className="bg-gray-900 p-4 rounded border border-gray-700">
                <h3 className="text-white font-bold mb-4">
                  Division Settings – {activeDivision.name}
                </h3>

                {/* Rating Limits (DUPR brackets) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      Min Rating (DUPR)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 focus:border-green-500 outline-none"
                      value={divisionSettings.minRating}
                      onChange={e =>
                        setDivisionSettings(prev => ({
                          ...prev,
                          minRating: e.target.value,
                        }))
                      }
                      placeholder="e.g. 3.0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      Max Rating (DUPR)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 focus:border-green-500 outline-none"
                      value={divisionSettings.maxRating}
                      onChange={e =>
                        setDivisionSettings(prev => ({
                          ...prev,
                          maxRating: e.target.value,
                        }))
                      }
                      placeholder="e.g. 4.0 (leave blank for open)"
                    />
                  </div>
                </div>

                {/* Age Limits */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      Min Age (Years)
                    </label>
                    <input
                      type="number"
                      className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 focus:border-green-500 outline-none"
                      value={divisionSettings.minAge}
                      onChange={e =>
                        setDivisionSettings(prev => ({
                          ...prev,
                          minAge: e.target.value,
                        }))
                      }
                      placeholder="e.g. 50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      Max Age (Years)
                    </label>
                    <input
                      type="number"
                      className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 focus:border-green-500 outline-none"
                      value={divisionSettings.maxAge}
                      onChange={e =>
                        setDivisionSettings(prev => ({
                          ...prev,
                          maxAge: e.target.value,
                        }))
                      }
                      placeholder="leave blank for no max"
                    />
                  </div>
                </div>

                {/* Seeding method */}
                <div className="mb-4">
                  <label className="block text-xs text-gray-400 mb-1">
                    Seeding Method
                  </label>
                  <select
                    className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 focus:border-green-500 outline-none"
                    value={divisionSettings.seedingMethod}
                    onChange={e =>
                      setDivisionSettings(prev => ({
                        ...prev,
                        seedingMethod: e.target.value as SeedingMethod,
                      }))
                    }
                  >
                    <option value="rating">Rating Based (DUPR)</option>
                    <option value="random">Random</option>
                  </select>
                  <p className="text-[10px] text-gray-500 mt-1">
                    Used when generating pools/brackets for this division.
                  </p>
                </div>

                <div className="flex justify-end mt-4">
                  <button
                    onClick={handleSaveDivisionSettings}
                    className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded font-bold"
                  >
                    Save Settings
                  </button>
                </div>
              </div>

              {/* General & Match Rules */}
              <div className="bg-gray-900 p-6 rounded border border-gray-700">
                <h4 className="text-white font-bold mb-4 text-lg">
                  General & Match Rules
                </h4>
                <div className="grid grid-cols-1 gap-6">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      Division Name
                    </label>
                    <input
                      className="w-full bg-gray-800 text-white p-3 rounded border border-gray-600 focus:border-green-500 focus:outline-none"
                      defaultValue={activeDivision.name}
                      onBlur={e => {
                        if (e.target.value !== activeDivision.name) {
                          handleUpdateDivisionSettings({ name: e.target.value });
                        }
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        Best Of (Games)
                      </label>
                      <select
                        className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600"
                        value={activeDivision.format.bestOfGames}
                        onChange={e =>
                          handleUpdateDivisionSettings({
                            format: {
                              ...activeDivision.format,
                              bestOfGames: parseInt(e.target.value, 10) as any,
                            },
                          })
                        }
                      >
                        <option value="1">1</option>
                        <option value="3">3</option>
                        <option value="5">5</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        Points
                      </label>
                      <select
                        className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600"
                        value={activeDivision.format.pointsPerGame}
                        onChange={e =>
                          handleUpdateDivisionSettings({
                            format: {
                              ...activeDivision.format,
                              pointsPerGame: parseInt(e.target.value, 10) as any,
                            },
                          })
                        }
                      >
                        <option value="11">11</option>
                        <option value="15">15</option>
                        <option value="21">21</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        Win By
                      </label>
                      <select
                        className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600"
                        value={activeDivision.format.winBy}
                        onChange={e =>
                          handleUpdateDivisionSettings({
                            format: {
                              ...activeDivision.format,
                              winBy: parseInt(e.target.value, 10) as any,
                            },
                          })
                        }
                      >
                        <option value="1">1</option>
                        <option value="2">2</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="mt-4 text-xs text-gray-500 italic">
                  Changes to Name and Match Rules save automatically.
                </div>
              </div>
            </div>
          )}

          {adminTab === 'livecourts' && (
            <div className="space-y-6">
              {/* Live Status Bar */}
              <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl bg-gray-900/50 border border-white/5">
                {/* Live Indicator */}
                <div className="flex items-center gap-2">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                  </span>
                  <span className="text-sm font-semibold text-green-400 uppercase tracking-wide">Live</span>
                </div>

                <div className="h-4 w-px bg-gray-700" />

                {/* Stats */}
                <div className="flex flex-wrap items-center gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    </svg>
                    <span className="text-white font-semibold">
                      {courtMatchModels.filter(m => m.status === 'in_progress').length}
                    </span>
                    <span className="text-gray-400">in progress</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-white font-semibold">{queue.length}</span>
                    <span className="text-gray-400">waiting</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-white font-semibold">
                      {courts.filter(c => c.active && !courtMatchModels.some(m => m.court === c.name && m.status === 'in_progress')).length}
                    </span>
                    <span className="text-gray-400">courts free</span>
                  </div>
                </div>
              </div>

              {/* Mode Toggle & Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                {/* Mode Toggle */}
                <div className="inline-flex rounded-xl bg-gray-900 p-1.5 border border-white/10">
                  <button
                    type="button"
                    onClick={() => setAutoAllocateCourts(false)}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                      !autoAllocateCourts
                        ? 'bg-white/10 text-white shadow-sm'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
                    </svg>
                    Manual
                  </button>
                  <button
                    type="button"
                    onClick={() => setAutoAllocateCourts(true)}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                      autoAllocateCourts
                        ? 'bg-green-600 text-white shadow-sm'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Auto-Allocate
                  </button>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3">
                  {!autoAllocateCourts && (
                    <button
                      type="button"
                      onClick={() => autoAssignFreeCourts()}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors shadow-lg shadow-indigo-600/20"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Fill Free Courts
                    </button>
                  )}
                  {autoAllocateCourts && (
                    <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
                      <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-sm text-green-400">
                        Auto-allocation active
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Court Allocation Component */}
              <CourtAllocation
                courts={courtViewModels}
                matches={courtMatchModels}
                onAssignMatchToCourt={async (matchId, courtId) => {
                  const court = courts.find(c => c.id === courtId);
                  if (!court) return;
                  await assignMatchToCourt(matchId, court.name);
                }}
                onStartMatchOnCourt={async courtId => {
                  await startMatchOnCourt(courtId);
                }}
                onFinishMatchOnCourt={finishMatchOnCourt}
              />
            </div>
          )}
          </div>
          {/* End Tab Content */}
        </div>
      ) : (
        /* PUBLIC VIEW */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6 min-w-0">
            {/* View Tabs / Dropdown */}
            <div>
              {/* Mobile View Selector */}
              <div className="md:hidden border-b border-gray-700 pb-2 mb-2">
                <label htmlFor="view-select" className="sr-only">Select View</label>
                <select
                  id="view-select"
                  value={activeTab}
                  onChange={(e) => setActiveTab(e.target.value as any)}
                  className="w-full bg-gray-800 text-white border border-gray-700 rounded p-2 focus:ring-2 focus:ring-green-500"
                >
                  <option value="details">Details</option>
                  <option value="bracket">Bracket</option>
                  <option value="players">Players</option>
                  <option value="standings">Standings</option>
                </select>
              </div>

              {/* Desktop View Tabs */}
              <div className="hidden md:flex border-b border-gray-700">
                {['details', 'bracket', 'players', 'standings'].map(t => (
                  <button
                    key={t}
                    onClick={() => setActiveTab(t as any)}
                    className={`px-6 py-3 text-sm font-bold uppercase hover:text-gray-300 transition-colors ${
                      activeTab === t
                        ? 'text-green-400 border-b-2 border-green-400'
                        : 'text-gray-500'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {activeTab === 'details' && (
              <Schedule
                matches={uiMatches}
                courts={courts}
                queue={queue}
                waitTimes={waitTimes}
                onUpdateScore={handleUpdateScore}
                isVerified={isVerified}
              />
            )}

            {activeTab === 'bracket' && (
              <BracketViewer
                matches={uiMatches}
                onUpdateScore={handleUpdateScore}
                isVerified={isVerified}
              />
            )}

            {activeTab === 'players' && (
              <div className="bg-gray-800 rounded-lg p-6 shadow-lg border border-gray-700">
                <h2 className="text-xl font-bold mb-4 text-green-400">
                  Players / Teams
                </h2>

                {divisionTeams.length === 0 ? (
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
                      {divisionTeams.map(team => {
                        const players = getTeamPlayers(team.id);
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
                standings={standings.map(s => {
                  const teamPlayers = getTeamPlayers(s.teamId);
                  return {
                    ...s,
                    team: {
                      id: s.teamId,
                      name: s.teamName,
                      players: teamPlayers.map(p => p.displayName),
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

                {myMatchSummary.match.status === 'pending_confirmation' && (
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
            divisions={divisions.map(d => ({
              id: d.id,
              name: d.name,
              matchCount: matches.filter(m => m.divisionId === d.id).length,
            }))}
            courts={courts.map(c => ({
              courtId: c.id,
              courtName: c.name,
              dayId: 'day-1',
              available: c.active,
              startTime: '09:00',
              endTime: '17:00',
            }))}
            registrations={teams.map(t => ({
              divisionId: t.divisionId,
              teamId: t.id,
              teamName: t.teamName || `Team ${t.id.slice(0, 4)}`,
              playerIds: t.playerIds,
            }))}
            matchups={matches.map((m, idx) => ({
              divisionId: m.divisionId,
              matchId: m.id,
              stage: (m.stage === 'pool' ? 'pool' : m.stage === 'final' || m.stage === 'semifinal' || m.stage === 'quarterfinal' ? 'medal' : 'bracket') as 'pool' | 'bracket' | 'medal',
              roundNumber: m.roundNumber,
              matchNumber: idx + 1,
              teamAId: m.teamAId,
              teamBId: m.teamBId,
            }))}
            onPublish={(scheduledMatches) => {
              console.log('Publishing schedule:', scheduledMatches);
              // TODO: Save scheduled times to matches
              setShowScheduleBuilder(false);
            }}
            onCancel={() => setShowScheduleBuilder(false)}
          />
        </div>
      )}
    </div>
  );
};
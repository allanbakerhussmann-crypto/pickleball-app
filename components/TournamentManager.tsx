
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
  getRegistration,
  subscribeToDivisions,
  subscribeToTeams,
  subscribeToMatches,
  subscribeToCourts,
  createTeamServer,
  getUsersByIds,
  deleteTeam,
  updateDivision,
  saveTournament,
  addCourt,
  updateCourt,
  deleteCourt,
  updateMatchScore,
  generatePoolsSchedule,
  generateBracketSchedule,
  generateFinalsFromPools,
  saveStandings
} from '../services/firebase';
import { 
  submitMatchScore, 
  confirmMatchScore, 
  disputeMatchScore 
} from '../services/matchService';
import { TeamSetup } from './TeamSetup';
import { CourtAllocation } from './CourtAllocation';
import { Schedule } from './Schedule';
import { BracketViewer } from './BracketViewer';
import { Standings } from './Standings';
import { TournamentRegistrationWizard } from './registration/TournamentRegistrationWizard';
import { TournamentDesk } from './TournamentDesk'; // Import new component

interface TournamentManagerProps {
  tournament: Tournament;
  onUpdateTournament: (t: Tournament) => Promise<void>;
  isVerified: boolean;
  onBack: () => void;
  initialWizardState?: { isOpen: boolean; mode?: 'full'|'waiver_only'; divisionId?: string } | null;
  clearWizardState?: () => void;
}

type TournamentPhase = 'registration' | 'in_progress' | 'completed';

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

  const [viewMode, setViewMode] = useState<'public' | 'admin'>('public');
  const [adminTab, setAdminTab] = useState<
    'participants' | 'courts' | 'settings' | 'livecourts'
  >('livecourts');

  // Local override for tournament phase (UI only)
  const [phaseOverride, setPhaseOverride] = useState<TournamentPhase | null>(
    null
  );

  // Wizard State
  const [showRegistrationWizard, setShowRegistrationWizard] = useState(false);
  const [showDesk, setShowDesk] = useState(false); // New Desk State
  
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
  const [hasCompletedRegistration, setHasCompletedRegistration] =
    useState(false);

  useEffect(() => {
    const loadRegistration = async () => {
      if (!currentUser) {
        setHasCompletedRegistration(false);
        return;
      }

      try {
        const reg = await getRegistration(tournament.id, currentUser.uid);
        setHasCompletedRegistration(!!reg && reg.status === 'completed');
      } catch (err) {
        console.error('Failed to load registration status', err);
        setHasCompletedRegistration(false);
      }
    };

    loadRegistration();
  }, [tournament.id, currentUser]);

  // Subcollection Data
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [autoAllocateCourts, setAutoAllocateCourts] = useState(false);
  const [playersCache, setPlayersCache] = useState<Record<string, UserProfile>>(
    {}
  );

  /* -------- Active Division / Tabs -------- */

  const [activeDivisionId, setActiveDivisionId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<
    'details' | 'players' | 'bracket' | 'standings'
  >('details');

  const activeDivision = useMemo(
    () => divisions.find(d => d.id === activeDivisionId) || divisions[0],
    [divisions, activeDivisionId]
  );

  useEffect(() => {
    if (!activeDivisionId && divisions.length > 0) {
      setActiveDivisionId(divisions[0].id);
    }
  }, [divisions, activeDivisionId]);

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

  /* -------- Subscriptions (only depend on tournament.id) -------- */
  useEffect(() => {
    const unsubDivs = subscribeToDivisions(tournament.id, setDivisions);
    const unsubTeams = subscribeToTeams(tournament.id, setTeams);
    const unsubMatches = subscribeToMatches(tournament.id, setMatches);
    const unsubCourts = subscribeToCourts(tournament.id, setCourts);

    return () => {
      unsubDivs();
      unsubTeams();
      unsubMatches();
      unsubCourts();
    };
  }, [tournament.id]);

  /* -------- Fetch missing player profiles when teams change -------- */
  useEffect(() => {
    // Explicitly cast to string[] to resolve 'unknown' type error
    const allPlayerIds = Array.from(new Set(teams.flatMap(t => t.players || []))) as string[];
    const missing = allPlayerIds.filter(
      (id: string) => !playersCache[id] && !id.startsWith('invite_') && !id.startsWith('tbd')
    );
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const profiles = await getUsersByIds(missing);
        if (cancelled) return;
        setPlayersCache(prev => {
          const next = { ...prev };
          profiles.forEach(p => (next[p.id] = p));
          return next;
        });
      } catch (err) {
        console.error('Failed to fetch missing player profiles', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [teams]);

  /* -------- Handler to add a team via the server createTeam function -------- */
  const handleAddTeam = useCallback(
    async ({ name, playerIds }: { name: string; playerIds: string[] }) => {
      if (!activeDivision) {
        throw new Error('No active division selected');
      }
      try {
        await createTeamServer({
          tournamentId: tournament.id,
          divisionId: activeDivision.id,
          playerIds,
          teamName: name || null,
        });

        console.info('Team created via transaction');
      } catch (err) {
        console.error('Failed to add team', err);
        throw err;
      }
    },
    [tournament.id, activeDivision]
  );

  /* -------- Tournament phase derived from matches -------- */

  const computedPhase: TournamentPhase = useMemo(() => {
    if (matches.length === 0) return 'registration';
    const anyNotCompleted = matches.some(m => m.status !== 'completed');
    return anyNotCompleted ? 'in_progress' : 'completed';
  }, [matches]);

  useEffect(() => {
    if (computedPhase === 'completed') {
      setPhaseOverride('completed');
    }
  }, [computedPhase]);

  const tournamentPhase: TournamentPhase = phaseOverride ?? computedPhase;

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

  /* -------- Data Filtering -------- */

  const divisionTeams = useMemo(
    () =>
      teams.filter(
        t => t.divisionId === activeDivision?.id && t.status !== 'withdrawn'
      ),
    [teams, activeDivision]
  );

  const divisionMatches = useMemo(
    () => matches.filter(m => m.divisionId === activeDivision?.id),
    [matches, activeDivision]
  );

  // Matches in this division that need organiser attention
  const attentionMatches = useMemo(
    () =>
      divisionMatches.filter(
        m => m.status === 'pending_confirmation' || m.status === 'disputed'
      ),
    [divisionMatches]
  );

  /* -------- Court Allocation Data -------- */
  const { rawQueue, waitTimes } = useMemo(() => {
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
        const isWaiting =
          status === 'scheduled' || status === 'not_started';
        return isWaiting && !m.court;
      })
      .slice()
      .sort((a, b) => (a.roundNumber || 1) - (b.roundNumber || 1));

    const queue: Match[] = [];
    const wt: Record<string, number> = {};

    candidates.forEach(m => {
      const isBusy = busy.has(m.teamAId) || busy.has(m.teamBId);
      if (!isBusy) {
        queue.push(m);
        wt[m.id] = 0;
        busy.add(m.teamAId);
        busy.add(m.teamBId);
      } else {
        wt[m.id] = 0;
      }
    });

    return { rawQueue: queue, waitTimes: wt };
  }, [matches, courts]);

  /* -------- Helpers -------- */

  const getTeamDisplayName = useCallback(
    (teamId: string) => {
      const team = teams.find(t => t.id === teamId);
      if (!team) return 'TBD';
      if (team.teamName) return team.teamName;
      const names = team.players
        .map(pid => playersCache[pid]?.displayName || 'Unknown')
        .join(' / ');
      return names;
    },
    [teams, playersCache]
  );

  const getTeamPlayers = useCallback(
    (teamId: string) => {
      const team = teams.find(t => t.id === teamId);
      if (!team) return [];
      return team.players
        .map(pid => playersCache[pid])
        .filter(Boolean) as UserProfile[];
    },
    [teams, playersCache]
  );

  /* -------- Live Courts View Models -------- */

  const courtViewModels = useMemo(() => {
    return courts.map(court => {
      const currentMatch = matches.find(
        m => m.court === court.name && m.status !== 'completed'
      );

      let status: 'AVAILABLE' | 'ASSIGNED' | 'IN_USE' | 'OUT_OF_SERVICE';

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
        currentMatchId: currentMatch ? currentMatch.id : undefined,
      };
    });
  }, [courts, matches]);

  const courtMatchModels = useMemo(() => {
    return matches.map(m => {
      const division = divisions.find(d => d.id === m.divisionId);
      const court = courts.find(c => c.name === m.court);

      let status: 'WAITING' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED';

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
        matchLabel: `Match ${m.matchNumber ?? ''}`,
        teamAName: getTeamDisplayName(m.teamAId),
        teamBName: getTeamDisplayName(m.teamBId),
        status,
        courtId: court?.id,
      };
    });
  }, [matches, divisions, courts, getTeamDisplayName]);

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

  const handleRemoveTeam = async (id: string) => {
    await deleteTeam(tournament.id, id);
  };

  const handleGenerateSchedule = async () => {
    if (!activeDivision) return;
    if (divisionTeams.length < 2) {
      console.warn('Need at least 2 teams.');
      return;
    }

    try {
      if (activeDivision.format.stageMode === 'single_stage') {
        if (activeDivision.format.mainFormat === 'round_robin') {
          // Single Pool RR
          await generatePoolsSchedule(
            tournament.id,
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
            tournament.id,
            activeDivision,
            divisionTeams,
            'Main Bracket',
            playersCache
          );
        }
      } else {
        // Two Stage - Generate Pools
        await generatePoolsSchedule(
          tournament.id,
          activeDivision,
          divisionTeams,
          playersCache
        );
      }
      console.info('Schedule Generated!');
    } catch (e: any) {
      console.error('Error: ' + e.message);
    }
  };

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

  // EFFECT: Auto-save standings whenever they change (e.g. after a match completes)
  useEffect(() => {
      if (standings.length > 0 && activeDivision) {
          // Debounce could be good here, but for now simple check
          saveStandings(tournament.id, activeDivision.id, standings).catch(console.error);
      }
  }, [standings, tournament.id, activeDivision]);

  const handleGenerateFinals = async () => {
    if (!activeDivision || activeDivision.format.stageMode !== 'two_stage')
      return;
    try {
      await generateFinalsFromPools(
        tournament.id,
        activeDivision,
        standings,
        divisionTeams,
        playersCache
      );
      console.info('Finals Bracket Generated!');
    } catch (e: any) {
      console.error('Error: ' + e.message);
    }
  };

  const handleUpdateScore = async (
    matchId: string,
    score1: number,
    score2: number,
    action: 'submit' | 'confirm' | 'dispute',
    reason?: string
  ) => {
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    if (!currentUser) {
      console.warn('You must be logged in to report scores.');
      return;
    }

    // Only players in the match or organisers can enter scores
    const teamA = teams.find(t => t.id === match.teamAId);
    const teamB = teams.find(t => t.id === match.teamBId);

    const isOnTeamA = teamA?.players?.includes(currentUser.uid);
    const isOnTeamB = teamB?.players?.includes(currentUser.uid);

    const isPlayerInMatch = isOnTeamA || isOnTeamB;

    if (!isPlayerInMatch && !isOrganizer) {
      console.warn('Only players in this match (or organisers) can enter scores.');
      return;
    }

    const division = divisions.find(d => d.id === match.divisionId);
    if (!division) {
      console.error('Could not find division for this match.');
      return;
    }

    try {
      if (action === 'submit') {
        const error = validateScoreForDivision(score1, score2, division);
        if (error) {
          console.warn(error);
          return;
        }

        await submitMatchScore(
          tournament.id,
          match,
          currentUser.uid,
          score1,
          score2
        );
      } else if (action === 'confirm') {
        await confirmMatchScore(tournament.id, match, currentUser.uid);
      } else if (action === 'dispute') {
        await disputeMatchScore(
          tournament.id,
          match,
          currentUser.uid,
          reason
        );
      }
    } catch (err) {
      console.error('Failed to update score', err);
    }
  };

  const handleUpdateDivisionSettings = async (updates: Partial<Division>) => {
    if (!activeDivision) return;
    const updatedDiv = { ...activeDivision, ...updates };
    try {
      await saveTournament(tournament, [updatedDiv]);
    } catch (e) {
      console.error('Failed to update division', e);
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

    console.info('Division settings updated');
  };

  /* -------- Conflict helper (same team on multiple courts) -------- */

  const findActiveConflictMatch = (match: Match) => {
    return matches.find(m => {
      if (m.id === match.id) return false;
      if (!m.court) return false;
      if (m.status === 'completed') return false;

      // Same team appearing in another live/pending match
      return (
        m.teamAId === match.teamAId ||
        m.teamAId === match.teamBId ||
        m.teamBId === match.teamAId ||
        m.teamBId === match.teamBId
      );
    });
  };

  /* -------- Court Management -------- */

  const [newCourtName, setNewCourtName] = useState('');

  const handleAddCourt = async () => {
    if (!newCourtName) return;
    await addCourt(tournament.id, newCourtName, courts.length + 1);
    setNewCourtName('');
  };

  /**
   * Simple "Assign" used from the Courts tab queue
   * - Immediately starts the match (in_progress) on a free active court
   */
  const handleAssignCourt = async (matchId: string) => {
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    // Check for conflict
    const conflict = findActiveConflictMatch(match);
    if (conflict) {
      console.warn(
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
      console.warn('No active courts available.');
      return;
    }

    await updateMatchScore(tournament.id, matchId, {
      status: 'in_progress',
      court: freeCourt.name,
      startTime: Date.now(),
    });
  };

  // Assigns a match to a specific court, but does NOT start it yet.
  const assignMatchToCourt = async (matchId: string, courtName: string) => {
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    const conflict = findActiveConflictMatch(match);
    if (conflict) {
      console.warn(
        `Cannot assign this match: one of the teams is already playing or waiting on court ${conflict.court}. Finish that match first.`
      );
      return;
    }

    await updateMatchScore(tournament.id, matchId, {
      court: courtName,
      status: 'scheduled',
    });
  };

  // Starts the match that is currently on the given court
  const startMatchOnCourt = async (courtId: string) => {
    const court = courts.find(c => c.id === courtId);
    if (!court) return;

    const match = matches.find(
      m => m.court === court.name && m.status !== 'completed'
    );
    if (!match) return;

    await updateMatchScore(tournament.id, match.id, {
      status: 'in_progress',
      startTime: Date.now(),
    });
  };

  // When finishing a match on a court:
  const finishMatchOnCourt = async (
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
      console.warn('No active match found on this court.');
      return;
    }

    const division =
      divisions.find(d => d.id === currentMatch.divisionId) || null;

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
      console.warn('Please enter scores for both teams before finishing this match.');
      return;
    }

    if (!existingHasScores && inlineHasScores && division) {
      const validationError = validateScoreForDivision(
        scoreTeamA as number,
        scoreTeamB as number,
        division
      );
      if (validationError) {
        console.warn(validationError);
        return;
      }
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
      updates.winnerTeamId =
        sA > sB ? currentMatch.teamAId : currentMatch.teamBId;
    }

    await updateMatchScore(tournament.id, currentMatch.id, updates);

    // Find next waiting match (prefer same division, earliest round)
    const nextSameDivision = matches
      .filter(
        m =>
          (m.status === 'not_started' ||
            m.status === 'scheduled' ||
            !m.status) &&
          !m.court &&
          m.divisionId === currentMatch.divisionId
      )
      .sort((a, b) => (a.roundNumber || 1) - (b.roundNumber || 1))[0];

    const nextAnyDivision =
      nextSameDivision ||
      matches
        .filter(
          m =>
            (m.status === 'not_started' ||
              m.status === 'scheduled' ||
              !m.status) &&
            !m.court
        )
        .sort((a, b) => (a.roundNumber || 1) - (b.roundNumber || 1))[0];

    if (nextAnyDivision) {
      await assignMatchToCourt(nextAnyDivision.id, court.name);
    }
  };

  // Helper: list of team IDs that are currently busy on a court
  const getBusyTeamIds = () => {
    const busy = new Set<string>();
    matches.forEach(m => {
      if (!m.court) return;
      if (m.status === 'completed') return;
      busy.add(m.teamAId);
      busy.add(m.teamBId);
    });
    return busy;
  };

  // Auto-fill all free courts with the best next matches (no conflicts)
  const autoAssignFreeCourts = async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;

    const freeCourts = courts.filter(
      c =>
        c.active !== false &&
        !matches.some(m => m.court === c.name && m.status !== 'completed')
    );

    if (freeCourts.length === 0) {
      if (!silent) {
        console.warn('No free courts available to auto-assign.');
      }
      return;
    }

    if (rawQueue.length === 0) {
      if (!silent) {
        console.warn('No waiting matches available for auto-assignment.');
      }
      return;
    }

    const busy = getBusyTeamIds();
    const updates: Promise<any>[] = [];
    let queueIndex = 0;

    for (const court of freeCourts) {
      let matchToAssign: Match | undefined;

      while (queueIndex < rawQueue.length && !matchToAssign) {
        const candidate = rawQueue[queueIndex++];

        if (!busy.has(candidate.teamAId) && !busy.has(candidate.teamBId)) {
          matchToAssign = candidate;
          busy.add(candidate.teamAId);
          busy.add(candidate.teamBId);
        }
      }

      if (!matchToAssign) break;

      updates.push(
        updateMatchScore(tournament.id, matchToAssign.id, {
          court: court.name,
          status: 'scheduled',
        })
      );
    }

    if (updates.length === 0) {
      if (!silent) {
        console.warn(
          'All waiting matches either conflict with players already on court or have already been assigned.'
        );
      }
      return;
    }

    await Promise.all(updates);
  };

  /* -------- Tournament phase helpers (UI) -------- */

  const handleStartTournament = () => {
    setPhaseOverride('in_progress');
  };

  const tournamentPhaseLabel =
    tournamentPhase === 'registration'
      ? 'Registration'
      : tournamentPhase === 'in_progress'
      ? 'In Progress'
      : 'Completed';

  const tournamentPhaseClass =
    tournamentPhase === 'registration'
      ? 'bg-yellow-900 text-yellow-300'
      : tournamentPhase === 'in_progress'
      ? 'bg-green-900 text-green-300'
      : 'bg-blue-900 text-blue-300';

  /* -------- Player Start Match (from sidebar) -------- */

  const handlePlayerStartMatch = async (matchId: string) => {
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    if (!currentUser) {
      console.warn('You must be logged in to start the match.');
      return;
    }

    const teamA = teams.find(t => t.id === match.teamAId);
    const teamB = teams.find(t => t.id === match.teamBId);

    const isOnTeam =
      teamA?.players?.includes(currentUser.uid) ||
      teamB?.players?.includes(currentUser.uid);

    if (!isOnTeam && !isOrganizer) {
      console.warn('Only players in this match (or organisers) can start the match.');
      return;
    }

    if (!match.court) {
      console.warn('This match has not been assigned to a court yet.');
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

      {showDesk && (
          <TournamentDesk 
            tournament={tournament} 
            onClose={() => setShowDesk(false)} 
          />
      )}

      {/* Header */}
      <div className="mb-6 flex items-center gap-2 text-sm text-gray-500">
        <button
          onClick={onBack}
          className="hover:text-green-400 transition-colors"
        >
          Tournaments
        </button>
        <span>/</span>
        <span className="text-gray-300">{tournament.name}</span>
      </div>

      {/* Banner */}
      <div className="relative h-64 w-full rounded-xl overflow-hidden mb-8 shadow-2xl bg-gray-800 border border-gray-700">
        {tournament.bannerUrl && (
          <img
            src={tournament.bannerUrl}
            className="absolute inset-0 w-full h-full object-cover opacity-50"
            alt=""
          />
        )}
        <div className="absolute bottom-0 left-0 p-8 w-full bg-gradient-to-t from-gray-900 to-transparent">
          <h1 className="text-4xl font-bold text-white">{tournament.name}</h1>
        </div>
        {isOrganizer && (
          <div className="absolute top-4 right-4 flex gap-2">
            <button
              onClick={() => setShowDesk(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded shadow-lg font-bold border border-blue-400/50 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              Tournament Desk
            </button>
            <button
              onClick={() =>
                setViewMode(viewMode === 'public' ? 'admin' : 'public')
              }
              className="bg-black/50 hover:bg-black/70 backdrop-blur text-white px-4 py-2 rounded border border-white/20"
            >
              Switch to {viewMode === 'public' ? 'Manager' : 'Public'} View
            </button>
          </div>
        )}
      </div>

      {/* Division Selector */}
      <div className="mb-6">
        <label htmlFor="division-select" className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
          Select Division
        </label>
        <div className="relative">
          <select
            id="division-select"
            value={activeDivisionId}
            onChange={(e) => setActiveDivisionId(e.target.value)}
            className="w-full appearance-none bg-gray-800 text-white font-bold border border-gray-700 rounded-lg py-3 px-4 pr-10 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all hover:border-gray-600"
          >
            {divisions.map((div) => (
              <option key={div.id} value={div.id}>
                {div.name}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-400">
            <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
              <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
            </svg>
          </div>
        </div>
      </div>

      {/* ADMIN VIEW */}
      {viewMode === 'admin' ? (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
          <div className="flex justify-between mb-6 gap-4 flex-wrap">
            <h2 className="text-xl font-bold text-white">
              Manage: {activeDivision.name}
            </h2>
            <div className="flex flex-col items-end gap-2 w-full md:w-auto">
              <div className="flex items-center gap-2">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-semibold uppercase ${tournamentPhaseClass}`}
                >
                  {tournamentPhaseLabel}
                </span>
                {tournamentPhase === 'registration' && (
                  <button
                    onClick={handleStartTournament}
                    className="px-3 py-1 rounded text-xs font-semibold bg-green-600 hover:bg-green-500 text-white"
                  >
                    Start Tournament
                  </button>
                )}
              </div>
              
              {/* Admin Tabs */}
              <div className="w-full md:w-auto">
                {/* Mobile Admin Dropdown */}
                <select
                  value={adminTab}
                  onChange={(e) => setAdminTab(e.target.value as any)}
                  className="md:hidden w-full bg-gray-700 text-white border border-gray-600 rounded p-2 text-sm mt-2 focus:ring-2 focus:ring-green-500"
                >
                  <option value="livecourts">Live Courts</option>
                  <option value="participants">Participants</option>
                  <option value="courts">Courts</option>
                  <option value="settings">Settings</option>
                </select>

                {/* Desktop Admin Buttons */}
                <div className="hidden md:flex gap-2 text-sm">
                  <button
                    onClick={() => setAdminTab('participants')}
                    className={`px-3 py-1 rounded transition-colors ${
                      adminTab === 'participants'
                        ? 'bg-gray-600 text-white'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    Participants
                  </button>
                  <button
                    onClick={() => setAdminTab('courts')}
                    className={`px-3 py-1 rounded transition-colors ${
                      adminTab === 'courts'
                        ? 'bg-gray-600 text-white'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    Courts
                  </button>
                  <button
                    onClick={() => setAdminTab('settings')}
                    className={`px-3 py-1 rounded transition-colors ${
                      adminTab === 'settings'
                        ? 'bg-gray-600 text-white'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    Settings
                  </button>
                  <button
                    onClick={() => setAdminTab('livecourts')}
                    className={`px-3 py-1 rounded transition-colors ${
                      adminTab === 'livecourts'
                        ? 'bg-gray-600 text-white'
                        : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    Live Courts
                  </button>
                </div>
              </div>
            </div>
          </div>

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
                      onClick={handleGenerateFinals}
                      disabled={divisionMatches.length === 0}
                      className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded font-bold disabled:bg-gray-700"
                    >
                      Generate Finals from Pools
                    </button>
                  )}
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
            <div className="mt-6 space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold text-white">
                    Court Allocation
                  </h3>
                  <div className="inline-flex rounded-full bg-gray-900 p-1 border border-gray-700">
                    <button
                      type="button"
                      onClick={() => setAutoAllocateCourts(false)}
                      className={`px-3 py-1 text-xs font-semibold rounded-full ${
                        !autoAllocateCourts
                          ? 'bg-gray-100 text-gray-900'
                          : 'text-gray-300'
                      }`}
                    >
                      Manually allocate courts
                    </button>
                    <button
                      type="button"
                      onClick={() => setAutoAllocateCourts(true)}
                      className={`px-3 py-1 text-xs font-semibold rounded-full ${
                        autoAllocateCourts
                          ? 'bg-green-500 text-gray-900'
                          : 'text-gray-300'
                      }`}
                    >
                      Auto-allocate courts
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!autoAllocateCourts && (
                    <button
                      type="button"
                      onClick={() => autoAssignFreeCourts()}
                      className="px-3 py-1 rounded text-xs font-semibold bg-green-600 hover:bg-green-500 text-white"
                    >
                      Auto-fill free courts
                    </button>
                  )}
                  {autoAllocateCourts && (
                    <span className="text-[11px] text-gray-400">
                      Auto-allocation is ON – matches will be placed on free courts automatically.
                    </span>
                  )}
                </div>
              </div>

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
    </div>
  );
};

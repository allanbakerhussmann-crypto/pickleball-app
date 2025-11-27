


import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Schedule } from './Schedule';
import { BracketViewer } from './BracketViewer';
import { Standings } from './Standings';
import { TeamSetup } from './TeamSetup';
import { TournamentRegistrationWizard } from './registration/TournamentRegistrationWizard';
import type { Tournament, Match, Team, Division, StandingsEntry, UserProfile, Court, DivisionFormat, SeedingMethod } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { 
    subscribeToDivisions, 
    subscribeToTeams, 
    subscribeToMatches, 
    subscribeToCourts,
    addCourt,
    updateCourt,
    deleteCourt,
    updateMatchScore,
    batchCreateMatches,
    createTeam,
    deleteTeam,
    getUsersByIds,
    saveTournament,
    generatePoolsSchedule,
    generateBracketSchedule,
    generateFinalsFromPools,
    getRegistration,
    updateDivision          // ✅ add this
} from '../services/firebase';
import { getScheduledQueue } from '../services/courtAllocator';

const generateId = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36);

interface TournamentManagerProps {
    tournament: Tournament;
    onUpdateTournament: (updatedTournament: Tournament) => void;
    isVerified: boolean;
    onBack: () => void;
    initialWizardState?: { isOpen: boolean; mode?: 'full'|'waiver_only'; divisionId?: string } | null;
    clearWizardState?: () => void;
}

export const TournamentManager: React.FC<TournamentManagerProps> = ({ 
    tournament, 
    onUpdateTournament, 
    isVerified, 
    onBack,
    initialWizardState,
    clearWizardState
}) => {
    const { currentUser, userProfile, isOrganizer } = useAuth();
    const [viewMode, setViewMode] = useState<'public' | 'admin'>('public');
    const [adminTab, setAdminTab] = useState<'participants' | 'courts' | 'settings'>('participants');
    
    // Wizard State
    const [showRegistrationWizard, setShowRegistrationWizard] = useState(false);
    const [wizardProps, setWizardProps] = useState<{ mode: 'full'|'waiver_only', initialDivisionId?: string }>({ mode: 'full' });

    useEffect(() => {
        if (initialWizardState?.isOpen) {
            setShowRegistrationWizard(true);
            setWizardProps({
                mode: initialWizardState.mode || 'full',
                initialDivisionId: initialWizardState.divisionId
            });
            // Clear parent state so it doesn't reopen if we close and rerender
            if (clearWizardState) clearWizardState();
        }
    }, [initialWizardState, clearWizardState]);

    const handleOpenWizard = () => {
        setWizardProps({ mode: 'full' });
        setShowRegistrationWizard(true);
    };
    // Track if the current user has already completed a registration
const [hasCompletedRegistration, setHasCompletedRegistration] = useState(false);

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
    const [playersCache, setPlayersCache] = useState<Record<string, UserProfile>>({});

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
        seedingMethod: 'rating'
    });

    // Subscriptions
    useEffect(() => {
        const unsubDivs = subscribeToDivisions(tournament.id, setDivisions);
        const unsubTeams = subscribeToTeams(tournament.id, async (loadedTeams) => {
            setTeams(loadedTeams);
            const allPlayerIds = Array.from(new Set(loadedTeams.flatMap(t => t.players)));
            const missing = allPlayerIds.filter(id => !playersCache[id] && !id.startsWith('invite_') && !id.startsWith('tbd'));
            if (missing.length > 0) {
                const profiles = await getUsersByIds(missing);
                setPlayersCache(prev => {
                    const next = { ...prev };
                    profiles.forEach(p => next[p.id] = p);
                    return next;
                });
            }
        });
        const unsubMatches = subscribeToMatches(tournament.id, setMatches);
        const unsubCourts = subscribeToCourts(tournament.id, setCourts);

        return () => {
            unsubDivs(); unsubTeams(); unsubMatches(); unsubCourts();
        };
    }, [tournament.id]);

    // Active Selection
    const [activeDivisionId, setActiveDivisionId] = useState<string>('');
    const [activeTab, setActiveTab] = useState<'details' | 'players' | 'bracket' | 'standings'>('details');

    const activeDivision = useMemo(() => divisions.find(d => d.id === activeDivisionId) || divisions[0], [divisions, activeDivisionId]);
    
    useEffect(() => {
        if (!activeDivisionId && divisions.length > 0) {
            setActiveDivisionId(divisions[0].id);
        }
    }, [divisions, activeDivisionId]);

    // Whenever the active division changes, load its editable settings
    useEffect(() => {
        if (!activeDivision) return;
        setDivisionSettings({
            minRating: activeDivision.minRating != null ? activeDivision.minRating.toString() : '',
            maxRating: activeDivision.maxRating != null ? activeDivision.maxRating.toString() : '',
            minAge: activeDivision.minAge != null ? activeDivision.minAge.toString() : '',
            maxAge: activeDivision.maxAge != null ? activeDivision.maxAge.toString() : '',
            seedingMethod: (activeDivision.format.seedingMethod || 'rating') as SeedingMethod,
        });
    }, [activeDivision]);

    // Data Filtering
    const divisionTeams = useMemo(() => teams.filter(t => t.divisionId === activeDivision?.id && t.status !== 'withdrawn'), [teams, activeDivision]);
    const divisionMatches = useMemo(() => matches.filter(m => m.divisionId === activeDivision?.id), [matches, activeDivision]);

    // Court Allocation Data
    const { queue: rawQueue, waitTimes } = useMemo(() => {
        return getScheduledQueue(matches, courts.filter(c => c.active));
    }, [matches, courts]);

    // Helpers
    const getTeamDisplayName = useCallback((teamId: string) => {
        const team = teams.find(t => t.id === teamId);
        if (!team) return 'TBD';
        if (team.teamName) return team.teamName;
        const names = team.players.map(pid => playersCache[pid]?.displayName || 'Unknown').join(' / ');
        return names;
    }, [teams, playersCache]);

    const getTeamPlayers = useCallback((teamId: string) => {
        const team = teams.find(t => t.id === teamId);
        if (!team) return [];
        return team.players.map(pid => playersCache[pid]).filter(Boolean) as UserProfile[];
    }, [teams, playersCache]);

    // UI match Mapping
    const uiMatches = useMemo(() => divisionMatches.map(m => ({
        id: m.id,
        team1: { id: m.teamAId, name: getTeamDisplayName(m.teamAId), players: getTeamPlayers(m.teamAId).map(p => ({name: p.displayName})) },
        team2: { id: m.teamBId, name: getTeamDisplayName(m.teamBId), players: getTeamPlayers(m.teamBId).map(p => ({name: p.displayName})) },
        score1: m.scoreTeamAGames[0] ?? null,
        score2: m.scoreTeamBGames[0] ?? null,
        status: m.status,
        roundNumber: m.roundNumber || 1,
        court: m.court, 
        courtName: m.court
    })), [divisionMatches, getTeamDisplayName, getTeamPlayers]);

    const queue = useMemo(() => {
        return rawQueue.map(m => ({
            id: m.id,
            team1: { id: m.teamAId, name: getTeamDisplayName(m.teamAId), players: getTeamPlayers(m.teamAId).map(p => ({name: p.displayName})) },
            team2: { id: m.teamBId, name: getTeamDisplayName(m.teamBId), players: getTeamPlayers(m.teamBId).map(p => ({name: p.displayName})) },
            score1: m.scoreTeamAGames[0] ?? null,
            score2: m.scoreTeamBGames[0] ?? null,
            status: m.status,
            roundNumber: m.roundNumber || 1,
            court: m.court,
            courtName: m.court,
            stage: m.stage // Included for local usage in Admin view
        }));
    }, [rawQueue, getTeamDisplayName, getTeamPlayers]);

    // Actions
    const handleAddTeam = async (data: { name: string; playerIds: string[] }) => {
        if (!activeDivision) return;
        const newTeamId = generateId();
        const newTeam: Team = {
            id: newTeamId,
            tournamentId: tournament.id,
            divisionId: activeDivision.id,
            type: activeDivision.type,
            teamName: activeDivision.type === 'doubles' ? data.name : undefined,
            captainPlayerId: data.playerIds[0],
            status: 'active',
            players: data.playerIds,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        await createTeam(tournament.id, newTeam);
    };

    const handleRemoveTeam = async (id: string) => {
        await deleteTeam(tournament.id, id);
    };

    const handleGenerateSchedule = async () => {
        if (!activeDivision) return;
        if (divisionTeams.length < 2) return alert("Need at least 2 teams.");

        try {
            if (activeDivision.format.stageMode === 'single_stage') {
                if (activeDivision.format.mainFormat === 'round_robin') {
                     // Single Pool RR
                     await generatePoolsSchedule(tournament.id, { ...activeDivision, format: { ...activeDivision.format, numberOfPools: 1 } }, divisionTeams, playersCache);
                } else {
                     // Bracket (Single Elim, etc)
                     await generateBracketSchedule(tournament.id, activeDivision, divisionTeams, "Main Bracket", playersCache);
                }
            } else {
                // Two Stage - Generate Pools
                await generatePoolsSchedule(tournament.id, activeDivision, divisionTeams, playersCache);
            }
            alert("Schedule Generated!");
        } catch (e: any) {
            alert("Error: " + e.message);
        }
    };

    // Calculate Standings & H2H
    const { standings, h2hMatrix } = useMemo(() => {
        const stats: Record<string, StandingsEntry> = {};
        const h2h: Record<string, Record<string, number>> = {};

        divisionTeams.forEach(t => {
            stats[t.id] = {
                teamId: t.id,
                teamName: getTeamDisplayName(t.id),
                played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, pointDifference: 0
            };
            h2h[t.id] = {};
        });

        divisionMatches.forEach(m => {
            if (m.status === 'completed' && m.scoreTeamAGames.length > 0 && m.scoreTeamBGames.length > 0) {
                const sA = m.scoreTeamAGames.reduce((a, b) => a + b, 0);
                const sB = m.scoreTeamBGames.reduce((a, b) => a + b, 0);
                const tA = stats[m.teamAId];
                const tB = stats[m.teamBId];

                if (tA && tB) {
                    tA.played++; tB.played++;
                    tA.pointsFor += sA; tB.pointsFor += sB;
                    tA.pointsAgainst += sB; tB.pointsAgainst += sA;
                    if (sA > sB) { 
                        tA.wins++; tB.losses++; 
                        // H2H Record: teamA beat teamB
                        h2h[m.teamAId][m.teamBId] = (h2h[m.teamAId][m.teamBId] || 0) + 1;
                    }
                    else if (sB > sA) { 
                        tB.wins++; tA.losses++; 
                        // H2H Record: teamB beat teamA
                        h2h[m.teamBId][m.teamAId] = (h2h[m.teamBId][m.teamAId] || 0) + 1;
                    }
                }
            }
        });
        Object.values(stats).forEach(s => s.pointDifference = s.pointsFor - s.pointsAgainst);
        return { standings: Object.values(stats), h2hMatrix: h2h };
    }, [divisionTeams, divisionMatches, getTeamDisplayName]);

    const handleGenerateFinals = async () => {
         if (!activeDivision || activeDivision.format.stageMode !== 'two_stage') return;
         try {
             await generateFinalsFromPools(tournament.id, activeDivision, standings, divisionTeams, playersCache);
             alert("Finals Bracket Generated!");
         } catch (e: any) {
             alert("Error: " + e.message);
         }
    };

    const handleUpdateScore = async (matchId: string, score1: number, score2: number, action: 'submit' | 'confirm' | 'dispute') => {
        const match = matches.find(m => m.id === matchId);
        if (!match) return;

        if (action === 'submit' || action === 'confirm') {
            const winner = score1 > score2 ? match.teamAId : (score2 > score1 ? match.teamBId : null);
            await updateMatchScore(tournament.id, matchId, {
                scoreTeamAGames: [score1],
                scoreTeamBGames: [score2],
                winnerTeamId: winner || null,
                status: 'completed',
                endTime: Date.now(),
                court: null // Free up court
            });
        }
    };

    const handleUpdateDivisionSettings = async (updates: Partial<Division>) => {
        if (!activeDivision) return;
        const updatedDiv = { ...activeDivision, ...updates };
        try {
            // Save just this division
            await saveTournament(tournament, [updatedDiv]);
        } catch(e) {
            console.error("Failed to update division", e);
            alert("Failed to save settings.");
        }
    };

    const handleSaveDivisionSettings = async () => {
        if (!activeDivision) return;

        const minRating = divisionSettings.minRating.trim() !== '' 
            ? parseFloat(divisionSettings.minRating) 
            : null;
        const maxRating = divisionSettings.maxRating.trim() !== '' 
            ? parseFloat(divisionSettings.maxRating) 
            : null;
        const minAge = divisionSettings.minAge.trim() !== '' 
            ? parseInt(divisionSettings.minAge, 10) 
            : null;
        const maxAge = divisionSettings.maxAge.trim() !== '' 
            ? parseInt(divisionSettings.maxAge, 10) 
            : null;

        // Update the division document in Firestore
        await updateDivision(tournament.id, activeDivision.id, {
            minRating,
            maxRating,
            minAge,
            maxAge,
            format: {
                ...activeDivision.format,
                seedingMethod: divisionSettings.seedingMethod,
            }
        });

        alert('Division settings updated');
    };

    // --- Court Management Helpers ---
    const [newCourtName, setNewCourtName] = useState('');
    const handleAddCourt = async () => {
        if (!newCourtName) return;
        await addCourt(tournament.id, newCourtName, courts.length + 1);
        setNewCourtName('');
    };

    const handleAssignCourt = async (matchId: string) => {
        // Find free court
        const freeCourt = courts.find(c => c.active && !matches.some(m => m.status === 'in_progress' && m.court === c.name));
        if (!freeCourt) return alert("No active courts available.");
        
        await updateMatchScore(tournament.id, matchId, {
            status: 'in_progress',
            court: freeCourt.name,
            startTime: Date.now()
        });
    };

    if (!activeDivision) return <div className="p-8 text-center">Loading...</div>;

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



            {/* Header */}
            <div className="mb-6 flex items-center gap-2 text-sm text-gray-500">
                <button onClick={onBack} className="hover:text-green-400 transition-colors">Tournaments</button>
                <span>/</span>
                <span className="text-gray-300">{tournament.name}</span>
            </div>
            
            {/* Banner */}
            <div className="relative h-64 w-full rounded-xl overflow-hidden mb-8 shadow-2xl bg-gray-800 border border-gray-700">
                {tournament.bannerUrl && <img src={tournament.bannerUrl} className="absolute inset-0 w-full h-full object-cover opacity-50" alt="" />}
                <div className="absolute bottom-0 left-0 p-8 w-full bg-gradient-to-t from-gray-900 to-transparent">
                    <h1 className="text-4xl font-bold text-white">{tournament.name}</h1>
                </div>
                {isOrganizer && (
                    <div className="absolute top-4 right-4 flex gap-2">
                         <button 
                            onClick={() => setViewMode(viewMode === 'public' ? 'admin' : 'public')}
                            className="bg-black/50 hover:bg-black/70 backdrop-blur text-white px-4 py-2 rounded border border-white/20"
                         >
                             Switch to {viewMode === 'public' ? 'Manager' : 'Public'} View
                         </button>
                    </div>
                )}
            </div>

            {/* Division Tabs */}
            <div className="flex overflow-x-auto gap-2 mb-6 pb-2">
                {divisions.map(div => (
                    <button
                        key={div.id}
                        onClick={() => setActiveDivisionId(div.id)}
                        className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-bold border ${
                            activeDivisionId === div.id ? 'bg-white text-gray-900 border-white' : 'bg-gray-800 text-gray-400 border-gray-700'
                        }`}
                    >
                        {div.name}
                    </button>
                ))}
            </div>

            {/* ADMIN VIEW */}
            {viewMode === 'admin' ? (
                <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
                    <div className="flex justify-between mb-6">
                        <h2 className="text-xl font-bold text-white">Manage: {activeDivision.name}</h2>
                        <div className="flex gap-2">
                             <button onClick={() => setAdminTab('participants')} className={`px-3 py-1 rounded ${adminTab === 'participants' ? 'bg-gray-600' : 'text-gray-400'}`}>Participants</button>
                             <button onClick={() => setAdminTab('courts')} className={`px-3 py-1 rounded ${adminTab === 'courts' ? 'bg-gray-600' : 'text-gray-400'}`}>Courts</button>
                             <button onClick={() => setAdminTab('settings')} className={`px-3 py-1 rounded ${adminTab === 'settings' ? 'bg-gray-600' : 'text-gray-400'}`}>Settings</button>
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
                                 <button onClick={handleAddCourt} className="bg-green-600 text-white px-4 py-2 rounded">Add</button>
                             </div>
                             
                             <div className="grid gap-2">
                                 {courts.map(c => (
                                     <div key={c.id} className="flex justify-between items-center bg-gray-900 p-3 rounded">
                                         <div className="flex items-center gap-2">
                                             <span className="font-bold text-white">{c.name}</span>
                                             <span className={`text-xs px-2 rounded ${c.active ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                                                 {c.active ? 'Active' : 'Inactive'}
                                             </span>
                                         </div>
                                         <div className="flex gap-2">
                                             <button onClick={() => updateCourt(tournament.id, c.id, { active: !c.active })} className="text-sm text-blue-400">Toggle</button>
                                             <button onClick={() => deleteCourt(tournament.id, c.id)} className="text-sm text-red-400">Delete</button>
                                         </div>
                                     </div>
                                 ))}
                             </div>

                             {/* Queue Monitor */}
                             <div className="mt-8 pt-4 border-t border-gray-700">
                                 <h4 className="text-white font-bold mb-2">Pending Match Queue</h4>
                                 {queue.length === 0 ? <p className="text-gray-500">No pending matches.</p> : (
                                     <div className="bg-gray-900 rounded overflow-hidden">
                                         {queue.map((m, i) => (
                                             <div key={m.id} className="flex justify-between p-2 border-b border-gray-800 hover:bg-gray-800">
                                                 <div className="text-xs text-gray-300">
                                                     {i+1}. {m.team1.name} vs {m.team2.name} ({m.stage})
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
                                                    minRating: e.target.value
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
                                                    maxRating: e.target.value
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
                                                    minAge: e.target.value
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
                                                    maxAge: e.target.value
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
                                                seedingMethod: e.target.value as SeedingMethod
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

                            {/* Existing Settings (Name, Match Rules) - Moved below or kept as legacy/general settings */}
                            <div className="bg-gray-900 p-6 rounded border border-gray-700">
                                <h4 className="text-white font-bold mb-4 text-lg">General & Match Rules</h4>
                                <div className="grid grid-cols-1 gap-6">
                                     <div>
                                        <label className="block text-sm text-gray-400 mb-1">Division Name</label>
                                        <input 
                                            className="w-full bg-gray-800 text-white p-3 rounded border border-gray-600 focus:border-green-500 focus:outline-none"
                                            defaultValue={activeDivision.name}
                                            onBlur={(e) => {
                                                if (e.target.value !== activeDivision.name) {
                                                    handleUpdateDivisionSettings({ name: e.target.value });
                                                }
                                            }}
                                        />
                                     </div>
                                     
                                     <div className="grid grid-cols-3 gap-4">
                                          <div>
                                              <label className="block text-xs text-gray-400 mb-1">Best Of (Games)</label>
                                              <select 
                                                  className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600"
                                                  value={activeDivision.format.bestOfGames}
                                                  onChange={(e) => handleUpdateDivisionSettings({ 
                                                      format: { ...activeDivision.format, bestOfGames: parseInt(e.target.value) as any } 
                                                  })}
                                              >
                                                  <option value="1">1</option>
                                                  <option value="3">3</option>
                                                  <option value="5">5</option>
                                              </select>
                                          </div>
                                          <div>
                                              <label className="block text-xs text-gray-400 mb-1">Points</label>
                                              <select 
                                                  className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600"
                                                  value={activeDivision.format.pointsPerGame}
                                                  onChange={(e) => handleUpdateDivisionSettings({ 
                                                      format: { ...activeDivision.format, pointsPerGame: parseInt(e.target.value) as any } 
                                                  })}
                                              >
                                                  <option value="11">11</option>
                                                  <option value="15">15</option>
                                                  <option value="21">21</option>
                                              </select>
                                          </div>
                                          <div>
                                              <label className="block text-xs text-gray-400 mb-1">Win By</label>
                                              <select 
                                                  className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600"
                                                  value={activeDivision.format.winBy}
                                                  onChange={(e) => handleUpdateDivisionSettings({ 
                                                      format: { ...activeDivision.format, winBy: parseInt(e.target.value) as any } 
                                                  })}
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
                </div>
            ) : (
                /* PUBLIC VIEW */
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-6">
                         <div className="flex border-b border-gray-700">
                            {['details', 'bracket', 'players', 'standings'].map(t => (
                                <button
                                    key={t}
                                    onClick={() => setActiveTab(t as any)}
                                    className={`px-6 py-3 text-sm font-bold uppercase ${activeTab === t ? 'text-green-400 border-b-2 border-green-400' : 'text-gray-500'}`}
                                >
                                    {t}
                                </button>
                            ))}
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
                             <BracketViewer matches={uiMatches} onUpdateScore={handleUpdateScore} isVerified={isVerified} />
                        )}

                        {activeTab === 'players' && (
                            <div className="bg-gray-800 rounded-lg p-6 shadow-lg border border-gray-700">
                                <h2 className="text-xl font-bold mb-4 text-green-400">Players / Teams</h2>

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
                                                    <tr key={team.id} className="border-b border-gray-800">
                                                        <td className="py-2 pr-4 text-white">
                                                            {team.teamName || players.map(p => p.displayName).join(' / ') || 'Unnamed'}
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
                                            players: teamPlayers.map(p => p.displayName)
                                        }
                                    };
                                })} 
                                tieBreakers={[
                                    activeDivision.format.tieBreakerPrimary,
                                    activeDivision.format.tieBreakerSecondary,
                                    activeDivision.format.tieBreakerTertiary
                                ] as any}
                                h2hLookup={h2hMatrix}
                             />
                        )}
                    </div>

                    {/* Sidebar */}
                    <div>
                        <div className="bg-gray-800 p-6 rounded border border-gray-700">
                             <button 
                                onClick={handleOpenWizard}
                                className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded shadow"
                            >
                                {hasCompletedRegistration ? 'Manage Registration' : 'Register for Tournament'}
                            </button>
                            <div className="mt-4 text-xs text-gray-400 space-y-2">
                                <p><strong>Format:</strong> {activeDivision.format.stageMode === 'single_stage' ? activeDivision.format.mainFormat : `${activeDivision.format.numberOfPools} Pools + Finals`}</p>
                                <p><strong>Match Rules:</strong> Best of {activeDivision.format.bestOfGames}, {activeDivision.format.pointsPerGame}pts</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

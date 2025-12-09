import React, { useState, useEffect, useMemo } from 'react';
import { 
    subscribeToDivisions, 
    subscribeToTeams, 
    subscribeToMatches, 
    createTeamServer, 
    deleteTeam, 
    generatePoolsSchedule, 
    getUsersByIds,
    subscribeToCourts,
    updateMatchScore
} from '../services/firebase';
import { 
    submitMatchScore, 
    confirmMatchScore, 
    disputeMatchScore 
} from '../services/matchService';
import { getScheduledQueue } from '../services/courtAllocator';
import type { Tournament, Division, Team, Match, UserProfile, Court } from '../types';
import { TeamSetup } from './TeamSetup';
import { Schedule } from './Schedule';
import { Standings } from './Standings';
import { BracketViewer } from './BracketViewer';
import { TournamentRegistrationWizard } from './registration/TournamentRegistrationWizard';
import { useAuth } from '../contexts/AuthContext';
import { CourtAllocation, CourtMatch, Court as CourtUI } from './CourtAllocation';
import { MatchDisplay } from './MatchCard';

interface TournamentManagerProps {
    tournament: Tournament;
    onUpdateTournament: (t: Tournament) => void;
    isVerified: boolean;
    onBack: () => void;
    initialWizardState: { isOpen: boolean; mode?: 'full'|'waiver_only'; divisionId?: string } | null;
    clearWizardState: () => void;
}

export const TournamentManager: React.FC<TournamentManagerProps> = ({
    tournament,
    onUpdateTournament,
    isVerified,
    onBack,
    initialWizardState,
    clearWizardState
}) => {
    const { userProfile, isOrganizer } = useAuth();
    
    // Data State
    const [divisions, setDivisions] = useState<Division[]>([]);
    const [activeDivisionId, setActiveDivisionId] = useState<string>('');
    const [teams, setTeams] = useState<Team[]>([]);
    const [matches, setMatches] = useState<Match[]>([]);
    const [courts, setCourts] = useState<Court[]>([]);
    
    // UI State
    const [activeTab, setActiveTab] = useState<'teams' | 'schedule' | 'bracket' | 'standings' | 'courts'>('teams');
    const [playersCache, setPlayersCache] = useState<Record<string, UserProfile>>({});
    const [isWizardOpen, setIsWizardOpen] = useState(false);
    const [wizardMode, setWizardMode] = useState<'full'|'waiver_only'>('full');
    const [wizardDivisionId, setWizardDivisionId] = useState<string | undefined>(undefined);

    // Initial Wizard Handling
    useEffect(() => {
        if (initialWizardState?.isOpen) {
            setWizardMode(initialWizardState.mode || 'full');
            setWizardDivisionId(initialWizardState.divisionId);
            setIsWizardOpen(true);
            clearWizardState();
        }
    }, [initialWizardState, clearWizardState]);

    // Subscriptions
    useEffect(() => {
        const unsub = subscribeToDivisions(tournament.id, (divs) => {
            setDivisions(divs);
            if (divs.length > 0 && !activeDivisionId) {
                setActiveDivisionId(divs[0].id);
            }
        });
        return () => unsub();
    }, [tournament.id, activeDivisionId]);

    useEffect(() => {
        const unsub = subscribeToTeams(tournament.id, setTeams);
        return () => unsub();
    }, [tournament.id]);

    useEffect(() => {
        const unsub = subscribeToMatches(tournament.id, setMatches);
        return () => unsub();
    }, [tournament.id]);

    useEffect(() => {
        const unsub = subscribeToCourts(tournament.id, setCourts);
        return () => unsub();
    }, [tournament.id]);

    // Derived State
    const activeDivision = useMemo(() => divisions.find(d => d.id === activeDivisionId), [divisions, activeDivisionId]);
    const divisionTeams = useMemo(() => teams.filter(t => t.divisionId === activeDivisionId && t.status !== 'withdrawn'), [teams, activeDivisionId]);
    const divisionMatches = useMemo(() => matches.filter(m => m.divisionId === activeDivisionId), [matches, activeDivisionId]);

    // Player Caching
    useEffect(() => {
        const missingIds = new Set<string>();
        teams.forEach(t => {
            t.players.forEach(pid => {
                if (!playersCache[pid]) missingIds.add(pid);
            });
            if (t.pendingInvitedUserId && !playersCache[t.pendingInvitedUserId]) {
                missingIds.add(t.pendingInvitedUserId);
            }
        });
        
        if (missingIds.size > 0) {
            getUsersByIds(Array.from(missingIds)).then(users => {
                setPlayersCache(prev => {
                    const next = { ...prev };
                    users.forEach(u => next[u.id] = u);
                    return next;
                });
            });
        }
    }, [teams, playersCache]);

    // --- Actions ---

    const handleAddTeam = async (data: { name: string; playerIds: string[] }) => {
        if (!activeDivisionId) return;
        try {
            await createTeamServer({
                tournamentId: tournament.id,
                divisionId: activeDivisionId,
                playerIds: data.playerIds,
                teamName: data.name
            });
        } catch (e) {
            console.error("Add team failed", e);
            alert("Failed to add team.");
        }
    };

    const handleDeleteTeam = async (teamId: string) => {
        if (!window.confirm("Are you sure? This will remove the team.")) return;
        try {
            await deleteTeam(tournament.id, teamId);
        } catch (e) {
            console.error("Delete team failed", e);
        }
    };

    const handleGenerateSchedule = async () => {
        if (!activeDivision) return;
        try {
            if (activeDivision.format.stageMode === 'single_stage' && activeDivision.format.mainFormat === 'round_robin') {
                await generatePoolsSchedule(tournament.id, activeDivision, divisionTeams, playersCache);
            } else {
                alert("Only Single Stage Round Robin generation currently supported in this demo.");
            }
        } catch (e) {
            console.error(e);
            alert("Schedule generation failed.");
        }
    };

    const handleUpdateScore = async (matchId: string, s1: number, s2: number, action: 'submit'|'confirm'|'dispute', reason?: string) => {
        if (!userProfile) return;
        const match = matches.find(m => m.id === matchId);
        if (!match) return;

        try {
            if (action === 'submit') {
                await submitMatchScore(tournament.id, match, userProfile.id, s1, s2);
            } else if (action === 'confirm') {
                await confirmMatchScore(tournament.id, match, userProfile.id);
            } else if (action === 'dispute') {
                await disputeMatchScore(tournament.id, match, userProfile.id, reason);
            }
        } catch (e: any) {
            alert(e.message);
        }
    };

    // --- Data Transformation for UI ---

    const uiMatches: MatchDisplay[] = useMemo(() => {
        return divisionMatches.map(m => {
            const teamA = teams.find(t => t.id === m.teamAId);
            const teamB = teams.find(t => t.id === m.teamBId);
            
            // Logic for confirmation permissions
            let canConfirm = false;
            let isWaitingOnYou = false;
            
            if (userProfile && m.status === 'pending_confirmation') {
                const submittedBy = m.scoreSubmittedBy; 
                // Logic: if I am in team A and submitter is from team B (or vice versa)
                const myTeamId = teamA?.players.includes(userProfile.id) ? teamA.id : teamB?.players.includes(userProfile.id) ? teamB.id : null;
                
                // Simplified logic: strict checking would require knowing exactly who submitted. 
                // Using pendingConfirmationFor if available or logic
                if (m.pendingConfirmationFor === userProfile.id) {
                    canConfirm = true;
                    isWaitingOnYou = true;
                } else if (myTeamId && submittedBy && !teamA?.players.includes(submittedBy) && !teamB?.players.includes(submittedBy)) {
                     // Organizer submitted?
                     canConfirm = true; 
                } else if (isOrganizer) {
                    canConfirm = true;
                }
            }

            return {
                id: m.id,
                team1: { 
                    id: m.teamAId, 
                    name: teamA?.teamName || 'TBD', 
                    players: teamA?.players.map(p => ({ name: playersCache[p]?.displayName || 'Player' })) || [] 
                },
                team2: { 
                    id: m.teamBId, 
                    name: teamB?.teamName || 'TBD', 
                    players: teamB?.players.map(p => ({ name: playersCache[p]?.displayName || 'Player' })) || [] 
                },
                score1: m.scoreTeamAGames?.[0] ?? null,
                score2: m.scoreTeamBGames?.[0] ?? null,
                status: m.status || 'scheduled',
                roundNumber: m.roundNumber || 1,
                court: m.court,
                courtName: m.court,
                isWaitingOnYou,
                canCurrentUserConfirm: canConfirm || isOrganizer
            };
        }).sort((a,b) => (a.roundNumber || 0) - (b.roundNumber || 0));
    }, [divisionMatches, teams, playersCache, userProfile, isOrganizer]);

    // Standings calculation (Simplified)
    const standingsData = useMemo(() => {
        const stats: Record<string, any> = {};
        divisionTeams.forEach(t => {
            stats[t.id] = {
                teamId: t.id,
                teamName: t.teamName,
                team: t, // Pass full team object for display
                played: 0,
                wins: 0,
                losses: 0,
                pointsFor: 0,
                pointsAgainst: 0,
                pointDifference: 0
            };
        });

        divisionMatches.forEach(m => {
            if (m.status === 'completed' && m.winnerTeamId) {
                const s1 = m.scoreTeamAGames[0] || 0;
                const s2 = m.scoreTeamBGames[0] || 0;
                
                if (stats[m.teamAId]) {
                    stats[m.teamAId].played++;
                    stats[m.teamAId].pointsFor += s1;
                    stats[m.teamAId].pointsAgainst += s2;
                    stats[m.teamAId].pointDifference += (s1 - s2);
                    if (m.winnerTeamId === m.teamAId) stats[m.teamAId].wins++;
                    else stats[m.teamAId].losses++;
                }
                if (stats[m.teamBId]) {
                    stats[m.teamBId].played++;
                    stats[m.teamBId].pointsFor += s2;
                    stats[m.teamBId].pointsAgainst += s1;
                    stats[m.teamBId].pointDifference += (s2 - s1);
                    if (m.winnerTeamId === m.teamBId) stats[m.teamBId].wins++;
                    else stats[m.teamBId].losses++;
                }
            }
        });

        return Object.values(stats).sort((a: any, b: any) => {
            if (b.wins !== a.wins) return b.wins - a.wins;
            return b.pointDifference - a.pointDifference;
        });
    }, [divisionTeams, divisionMatches]);

    // --- Court Allocation Handlers ---
    
    // Map matches to CourtMatch format
    const allocationMatches: CourtMatch[] = useMemo(() => {
        // We want all matches from all divisions for court allocation, not just active division
        return matches.map(m => {
            const tA = teams.find(t => t.id === m.teamAId);
            const tB = teams.find(t => t.id === m.teamBId);
            const div = divisions.find(d => d.id === m.divisionId);
            
            let status: any = 'WAITING';
            if (m.status === 'in_progress') status = 'IN_PROGRESS';
            else if (m.status === 'completed') status = 'COMPLETED';
            else if (m.court) status = 'ASSIGNED';

            return {
                id: m.id,
                division: div?.name || 'Unknown Div',
                roundLabel: m.stage || `Round ${m.roundNumber}`,
                matchLabel: `Match ${m.matchNumber || ''}`,
                teamAName: tA?.teamName || 'TBD',
                teamBName: tB?.teamName || 'TBD',
                status: status,
                courtId: courts.find(c => c.name === m.court)?.id
            };
        });
    }, [matches, teams, divisions, courts]);

    const uiCourts: CourtUI[] = useMemo(() => {
        return courts.map(c => {
             // Find match on this court
             const m = matches.find(match => match.court === c.name && match.status !== 'completed');
             let status: any = 'AVAILABLE';
             if (!c.active) status = 'OUT_OF_SERVICE';
             else if (m) {
                 if (m.status === 'in_progress') status = 'IN_USE';
                 else status = 'ASSIGNED';
             }

             return {
                 id: c.id,
                 name: c.name,
                 status: status,
                 currentMatchId: m?.id
             };
        });
    }, [courts, matches]);

    const handleAssignMatch = async (matchId: string, courtId: string) => {
        const court = courts.find(c => c.id === courtId);
        if (!court) return;
        await updateMatchScore(tournament.id, matchId, { court: court.name, status: 'scheduled' }); // or 'assigned' if we had that status
    };

    const handleStartMatch = async (courtId: string) => {
        const court = courts.find(c => c.id === courtId);
        if (!court) return;
        const match = matches.find(m => m.court === court.name && m.status !== 'completed');
        if (!match) return;
        
        await updateMatchScore(tournament.id, match.id, { status: 'in_progress', startTime: Date.now() });
    };

    const handleFinishMatch = async (courtId: string, s1?: number, s2?: number) => {
        const court = courts.find(c => c.id === courtId);
        if (!court) return;
        const match = matches.find(m => m.court === court.name && m.status === 'in_progress');
        if (!match) return;

        if (s1 === undefined || s2 === undefined) return;

        // Logic to determine winner and save
        const winner = s1 > s2 ? match.teamAId : match.teamBId;
        await updateMatchScore(tournament.id, match.id, {
            status: 'completed',
            scoreTeamAGames: [s1],
            scoreTeamBGames: [s2],
            winnerTeamId: winner,
            endTime: Date.now(),
            court: null // Free the court
        });
    };

    // Calculate queue wait times
    const { queue, waitTimes } = useMemo(() => {
        return getScheduledQueue(matches, courts, divisions);
    }, [matches, courts, divisions]);


    return (
        <div className="flex flex-col h-full">
            {/* Header / Nav */}
            <div className="flex items-center justify-between mb-4">
                <button onClick={onBack} className="text-gray-400 hover:text-white">← Back to Dashboard</button>
                <h1 className="text-2xl font-bold text-white">{tournament.name}</h1>
                {userProfile && (
                     <button 
                        onClick={() => { setWizardMode('full'); setWizardDivisionId(undefined); setIsWizardOpen(true); }}
                        className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded font-bold"
                     >
                        Register
                     </button>
                )}
            </div>

            {/* Division Selector */}
            {activeTab !== 'courts' && divisions.length > 0 && (
                <div className="mb-6">
                    <label htmlFor="division-select" className="sr-only">Select Division</label>
                    <div className="relative">
                    <select
                        id="division-select"
                        value={activeDivisionId}
                        onChange={(e) => setActiveDivisionId(e.target.value)}
                        className="w-full bg-gray-800 text-white border border-gray-700 rounded-lg p-3 pr-10 focus:outline-none focus:ring-2 focus:ring-green-500 appearance-none cursor-pointer font-medium shadow-sm transition-all hover:border-gray-600"
                    >
                        {divisions.map((div) => (
                        <option key={div.id} value={div.id}>{div.name}</option>
                        ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-400">
                        <svg className="h-5 w-5 fill-current" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </div>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-4 mb-6 border-b border-gray-700">
                {(['teams', 'schedule', 'bracket', 'standings', 'courts'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`pb-2 px-1 capitalize ${activeTab === tab ? 'border-b-2 border-green-500 text-green-400 font-bold' : 'text-gray-400 hover:text-white'}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-grow">
                {activeTab === 'teams' && activeDivision && (
                    <TeamSetup
                        teams={divisionTeams}
                        activeDivision={activeDivision}
                        playersCache={playersCache}
                        onAddTeam={handleAddTeam}
                        onDeleteTeam={handleDeleteTeam}
                        onGenerateSchedule={handleGenerateSchedule}
                        scheduleGenerated={divisionMatches.length > 0}
                        isVerified={isVerified}
                    />
                )}
                {activeTab === 'schedule' && (
                    <Schedule
                        matches={uiMatches}
                        courts={courts}
                        queue={[]} 
                        waitTimes={{}}
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
                {activeTab === 'standings' && (
                    <Standings
                        standings={standingsData}
                    />
                )}
                {activeTab === 'courts' && (
                    <CourtAllocation
                        courts={uiCourts}
                        matches={allocationMatches}
                        onAssignMatchToCourt={handleAssignMatch}
                        onStartMatchOnCourt={handleStartMatch}
                        onFinishMatchOnCourt={handleFinishMatch}
                    />
                )}
            </div>

            {isWizardOpen && userProfile && (
                <TournamentRegistrationWizard
                    tournament={tournament}
                    userProfile={userProfile}
                    onClose={() => setIsWizardOpen(false)}
                    onComplete={() => setIsWizardOpen(false)}
                    mode={wizardMode}
                    initialDivisionId={wizardDivisionId}
                />
            )}
        </div>
    );
};
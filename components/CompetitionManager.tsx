
import React, { useState, useEffect } from 'react';
import { 
    getCompetition, 
    subscribeToCompetitionMatches, 
    subscribeToCompetitionEntries,
    subscribeToStandings,
    generateLeagueSchedule, 
    createCompetitionEntry,
    updateCompetition,
    getUsersByIds,
    searchUsers,
    logAudit,
    getCompetitionEntry
} from '../services/firebase';
import { 
    submitMatchScore, 
    confirmMatchScore, 
    disputeMatchScore 
} from '../services/matchService';
import type { Competition, Match, CompetitionEntry, StandingsEntry, UserProfile, CompetitionDivision } from '../types';
import { Schedule } from './Schedule';
import { LeagueStandings } from './LeagueStandings';
import { useAuth } from '../contexts/AuthContext';
import { CompetitionRegistrationWizard } from './registration/CompetitionRegistrationWizard';

interface CompetitionManagerProps {
    competitionId: string;
    onBack: () => void;
}

export const CompetitionManager: React.FC<CompetitionManagerProps> = ({ competitionId, onBack }) => {
    const { isOrganizer, currentUser, userProfile } = useAuth();
    const [competition, setCompetition] = useState<Competition | null>(null);
    const [matches, setMatches] = useState<Match[]>([]);
    const [entries, setEntries] = useState<CompetitionEntry[]>([]);
    const [standings, setStandings] = useState<StandingsEntry[]>([]);
    const [activeTab, setActiveTab] = useState<'standings' | 'schedule' | 'entrants'>('standings');
    const [playersCache, setPlayersCache] = useState<Record<string, UserProfile>>({});

    // Entry Management State
    const [isAddingEntry, setIsAddingEntry] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
    const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
    const [manualName, setManualName] = useState('');
    const [selectedDivisionId, setSelectedDivisionId] = useState<string>('');
    const [entryError, setEntryError] = useState<string | null>(null);

    // Wizard State
    const [showWizard, setShowWizard] = useState(false);
    const [hasEntry, setHasEntry] = useState(false);

    useEffect(() => {
        getCompetition(competitionId).then(setCompetition);
        
        const unsubMatches = subscribeToCompetitionMatches(competitionId, setMatches);
        const unsubEntries = subscribeToCompetitionEntries(competitionId, setEntries);
        const unsubStandings = subscribeToStandings(competitionId, setStandings);

        return () => {
            unsubMatches();
            unsubEntries();
            unsubStandings();
        };
    }, [competitionId]);

    // Check my entry status
    useEffect(() => {
        if (currentUser && competitionId) {
            getCompetitionEntry(competitionId, currentUser.uid).then(e => setHasEntry(!!e));
        }
    }, [currentUser, competitionId, entries.length]); // Re-check when entries list updates

    // Fetch player names for UI
    useEffect(() => {
        const fetchNames = async () => {
            const ids = entries
                .map(e => e.playerId || e.teamId)
                .filter((id): id is string => !!id && !playersCache[id]);
            
            if (ids.length > 0) {
                try {
                    const profiles = await getUsersByIds(ids);
                    setPlayersCache(prev => {
                        const next = { ...prev };
                        profiles.forEach(p => next[p.id] = p);
                        return next;
                    });
                } catch (e) {
                    console.error("Error fetching player profiles", e);
                }
            }
        };
        if (entries.length > 0) fetchNames();
    }, [entries]);

    const handleSearch = async (term: string) => {
        setSearchTerm(term);
        if (term.length < 2) {
            setSearchResults([]);
            return;
        }
        const results = await searchUsers(term);
        setSearchResults(results);
    };

    const handleSelectUser = (user: UserProfile) => {
        setSelectedUser(user);
        setSearchTerm('');
        setSearchResults([]);
        setManualName('');
    };

    const handleAddEntry = async () => {
        setEntryError(null);
        if (!selectedUser && !manualName.trim()) {
            setEntryError("Please select a user or enter a manual name.");
            return;
        }

        if (competition?.divisions && competition.divisions.length > 0 && !selectedDivisionId) {
            setEntryError("Please select a division.");
            return;
        }

        const idToCheck = selectedUser ? selectedUser.id : manualName.trim();
        
        // Duplicate Check
        const isDuplicate = entries.some(e => e.playerId === idToCheck || e.teamId === idToCheck);
        if (isDuplicate) {
            setEntryError("This user/team is already entered.");
            return;
        }

        // Division Validation
        if (selectedDivisionId && selectedUser) {
            const div = competition?.divisions?.find(d => d.id === selectedDivisionId);
            if (div) {
                const rating = competition?.type === 'league' ? selectedUser.duprSinglesRating : selectedUser.duprDoublesRating;
                // Basic rating check if user has rating
                if (rating) {
                    if (div.minRating && rating < div.minRating) {
                        setEntryError(`User rating (${rating}) is below minimum (${div.minRating}) for this division.`);
                        return;
                    }
                    if (div.maxRating && rating > div.maxRating) {
                        setEntryError(`User rating (${rating}) is above maximum (${div.maxRating}) for this division.`);
                        return;
                    }
                }
            }
        }

        const entry: CompetitionEntry = {
            id: `entry_${Date.now()}`,
            competitionId,
            entryType: selectedUser ? 'individual' : 'team', 
            playerId: selectedUser ? selectedUser.id : undefined,
            teamId: !selectedUser ? manualName.trim() : undefined, 
            divisionId: selectedDivisionId || undefined,
            status: 'active',
            createdAt: Date.now()
        };

        try {
            await createCompetitionEntry(entry);
            // Reset form
            setSelectedUser(null);
            setManualName('');
            setSearchTerm('');
            setIsAddingEntry(false);
        } catch (e: any) {
            console.error(e);
            setEntryError("Failed to add entry.");
        }
    };

    const handleGenerateSchedule = async () => {
        if (!currentUser) return;
        try {
            await generateLeagueSchedule(competitionId);
            await updateCompetition({ ...competition!, status: 'in_progress' });
            
            await logAudit(currentUser.uid, "generate_schedule", competitionId, { entrantCount: entries.length });

            const updated = await getCompetition(competitionId);
            setCompetition(updated);
            console.info("Schedule generated!");
        } catch (e) {
            console.error(e);
            console.error("Failed to generate schedule.");
        }
    };

    const handleUpdateScore = async (matchId: string, score1: number, score2: number, action: 'submit' | 'confirm' | 'dispute', reason?: string) => {
        if (!currentUser) {
            console.warn("Please log in to submit scores.");
            return;
        }

        const match = matches.find(m => m.id === matchId);
        if (!match) return;

        try {
            if (action === 'submit') {
                await submitMatchScore(competitionId, match, currentUser.uid, score1, score2);
            } else if (action === 'confirm') {
                await confirmMatchScore(competitionId, match, currentUser.uid);
            } else if (action === 'dispute') {
                await disputeMatchScore(competitionId, match, currentUser.uid, reason);
            }
        } catch (e: any) {
            console.error(e);
            console.error("Action failed: " + e.message);
        }
    };

    if (!competition) return <div className="p-10 text-center">Loading...</div>;

    const uiMatches = matches.map(m => {
        const nameA = playersCache[m.teamAId || '']?.displayName || m.teamAId || 'Unknown';
        const nameB = playersCache[m.teamBId || '']?.displayName || m.teamBId || 'Unknown';
        
        const isParticipant = currentUser && (m.teamAId === currentUser.uid || m.teamBId === currentUser.uid);
        const isPending = m.status === 'pending_confirmation';
        
        const isWaitingOnYou = isPending && isParticipant && m.lastUpdatedBy !== currentUser.uid;
        const canConfirm = isOrganizer || isWaitingOnYou;

        return {
            id: m.id,
            team1: { id: m.teamAId || '', name: nameA, players: [{ name: nameA }] },
            team2: { id: m.teamBId || '', name: nameB, players: [{ name: nameB }] },
            score1: m.scoreTeamAGames?.[0] ?? null,
            score2: m.scoreTeamBGames?.[0] ?? null,
            status: m.status || 'scheduled',
            roundNumber: m.roundNumber || 1,
            isWaitingOnYou: !!isWaitingOnYou,
            canCurrentUserConfirm: !!canConfirm
        };
    });

    const uiStandings = standings.map(s => ({
        ...s,
        teamName: playersCache[s.teamId]?.displayName || s.teamId || s.teamName
    }));

    return (
        <div className="max-w-6xl mx-auto p-4 animate-fade-in relative">
            {showWizard && userProfile && (
                <CompetitionRegistrationWizard 
                    competition={competition}
                    userProfile={userProfile}
                    onClose={() => setShowWizard(false)}
                    onComplete={() => { setShowWizard(false); setHasEntry(true); }}
                />
            )}

            <button onClick={onBack} className="text-sm text-gray-400 hover:text-white mb-4">← Back to Dashboard</button>
            
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-1">{competition.name}</h1>
                    <div className="flex flex-wrap gap-2 text-sm text-gray-400 mt-1">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                            competition.status === 'in_progress' ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-400'
                        }`}>
                            {competition.status.replace('_', ' ')}
                        </span>
                        {competition.venue && <span>• {competition.venue}</span>}
                        {competition.visibility === 'private' && <span className="text-yellow-500">• Private</span>}
                        {competition.registrationOpen && <span className="text-green-400">• Registration Open</span>}
                    </div>
                    {competition.description && (
                        <p className="text-gray-300 text-sm mt-3 max-w-2xl">{competition.description}</p>
                    )}
                </div>
                <div className="flex flex-col gap-2 items-end">
                    {competition.status === 'draft' && competition.registrationOpen && !isOrganizer && (
                        <button 
                            onClick={() => setShowWizard(true)}
                            className={`px-6 py-2 rounded font-bold shadow ${hasEntry ? 'bg-gray-700 text-gray-300' : 'bg-green-600 hover:bg-green-500 text-white'}`}
                        >
                            {hasEntry ? 'Edit Registration' : 'Join League'}
                        </button>
                    )}
                    
                    {isOrganizer && competition.status === 'draft' && (
                        <button 
                            onClick={handleGenerateSchedule}
                            className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded font-bold shadow"
                        >
                            Start League & Generate Schedule
                        </button>
                    )}
                </div>
            </div>

            <div className="flex gap-4 border-b border-gray-700 mb-6">
                <button onClick={() => setActiveTab('standings')} className={`pb-2 px-2 font-bold ${activeTab === 'standings' ? 'text-green-400 border-b-2 border-green-400' : 'text-gray-400'}`}>Standings</button>
                <button onClick={() => setActiveTab('schedule')} className={`pb-2 px-2 font-bold ${activeTab === 'schedule' ? 'text-green-400 border-b-2 border-green-400' : 'text-gray-400'}`}>Schedule</button>
                <button onClick={() => setActiveTab('entrants')} className={`pb-2 px-2 font-bold ${activeTab === 'entrants' ? 'text-green-400 border-b-2 border-green-400' : 'text-gray-400'}`}>Entrants</button>
            </div>

            {activeTab === 'standings' && (
                <LeagueStandings standings={uiStandings} />
            )}

            {activeTab === 'schedule' && (
                <Schedule 
                    matches={uiMatches} 
                    onUpdateScore={handleUpdateScore}
                    isVerified={true}
                />
            )}

            {activeTab === 'entrants' && (
                <div className="bg-gray-800 rounded p-6 border border-gray-700">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-white">League Entrants</h2>
                        {competition.maxEntrants && (
                            <span className="text-sm text-gray-400">Max: {competition.maxEntrants}</span>
                        )}
                    </div>
                    
                    {isOrganizer && competition.status === 'draft' && (
                        <div className="mb-6">
                            {!isAddingEntry ? (
                                <button onClick={() => setIsAddingEntry(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-bold text-sm">
                                    + Add Entrant (Manual)
                                </button>
                            ) : (
                                <div className="bg-gray-900 p-4 rounded border border-gray-600 animate-fade-in-up">
                                    <h3 className="text-white font-bold mb-3">Add Entrant</h3>
                                    
                                    {entryError && <div className="text-red-400 text-sm mb-3">{entryError}</div>}

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                        <div>
                                            <label className="block text-xs text-gray-400 mb-1">Search User</label>
                                            <input 
                                                className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 text-sm"
                                                placeholder="Search by name/email..."
                                                value={selectedUser ? selectedUser.displayName : searchTerm}
                                                onChange={e => !selectedUser && handleSearch(e.target.value)}
                                                readOnly={!!selectedUser}
                                            />
                                            {selectedUser && (
                                                <button onClick={() => { setSelectedUser(null); setSearchTerm(''); }} className="text-xs text-blue-400 mt-1">Clear Selection</button>
                                            )}
                                            {searchResults.length > 0 && !selectedUser && (
                                                <div className="bg-gray-800 border border-gray-600 mt-1 rounded max-h-40 overflow-y-auto">
                                                    {searchResults.map(u => (
                                                        <div key={u.id} onClick={() => handleSelectUser(u)} className="p-2 hover:bg-gray-700 cursor-pointer text-sm text-white">
                                                            {u.displayName} ({u.email})
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        
                                        {!selectedUser && (
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">Or Manual Name</label>
                                                <input 
                                                    className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 text-sm"
                                                    placeholder="Team/Player Name"
                                                    value={manualName}
                                                    onChange={e => setManualName(e.target.value)}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {competition.divisions && competition.divisions.length > 0 && (
                                        <div className="mb-4">
                                            <label className="block text-xs text-gray-400 mb-1">Division</label>
                                            <select 
                                                className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 text-sm"
                                                value={selectedDivisionId}
                                                onChange={e => setSelectedDivisionId(e.target.value)}
                                            >
                                                <option value="">Select Division...</option>
                                                {competition.divisions.map(d => (
                                                    <option key={d.id} value={d.id}>{d.name} {d.minRating ? `(${d.minRating}+)` : ''}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    <div className="flex gap-2">
                                        <button onClick={handleAddEntry} className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded text-sm font-bold">Add</button>
                                        <button onClick={() => { setIsAddingEntry(false); setEntryError(null); }} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm">Cancel</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="space-y-2">
                        {entries.length === 0 ? <p className="text-gray-500 italic">No entrants yet.</p> : entries.map(e => {
                            const division = competition.divisions?.find(d => d.id === e.divisionId);
                            return (
                                <div key={e.id} className="bg-gray-900 p-3 rounded flex justify-between items-center border border-gray-800">
                                    <div>
                                        <div className="text-white font-medium">{playersCache[e.playerId || '']?.displayName || e.playerId || e.teamId}</div>
                                        {division && <div className="text-xs text-green-400">{division.name}</div>}
                                    </div>
                                    <span className="text-xs text-gray-500 capitalize bg-gray-800 px-2 py-1 rounded border border-gray-700">{e.entryType}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

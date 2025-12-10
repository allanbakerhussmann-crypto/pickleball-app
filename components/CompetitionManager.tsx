
import React, { useState, useEffect } from 'react';
import { 
    getCompetition, 
    subscribeToCompetitionMatches, 
    subscribeToCompetitionEntries,
    subscribeToStandings,
    generateLeagueSchedule, 
    updateMatchScore, 
    updateLeagueStandings,
    createCompetitionEntry,
    updateCompetition,
    getUsersByIds
} from '../services/firebase';
import type { Competition, Match, CompetitionEntry, StandingsEntry, UserProfile } from '../types';
import { Schedule } from './Schedule';
import { LeagueStandings } from './LeagueStandings';
import { useAuth } from '../contexts/AuthContext';

interface CompetitionManagerProps {
    competitionId: string;
    onBack: () => void;
}

export const CompetitionManager: React.FC<CompetitionManagerProps> = ({ competitionId, onBack }) => {
    const { isOrganizer } = useAuth();
    const [competition, setCompetition] = useState<Competition | null>(null);
    const [matches, setMatches] = useState<Match[]>([]);
    const [entries, setEntries] = useState<CompetitionEntry[]>([]);
    const [standings, setStandings] = useState<StandingsEntry[]>([]);
    const [activeTab, setActiveTab] = useState<'standings' | 'schedule' | 'entrants'>('standings');
    const [playersCache, setPlayersCache] = useState<Record<string, UserProfile>>({});

    // New Entry State
    const [newEntryName, setNewEntryName] = useState('');

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

    // Fetch player names for UI
    useEffect(() => {
        const fetchNames = async () => {
            const ids = entries
                .map(e => e.playerId || e.teamId)
                .filter((id): id is string => !!id && !playersCache[id]);
            
            if (ids.length > 0) {
                // Optimization: In real app, check if ID looks like a user ID before fetching
                // For simplicity assuming entries might use user IDs or manual strings.
                // If using manual strings, this fetch will just return empty for them.
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

    const handleGenerateSchedule = async () => {
        if (!confirm("Generate schedule? This will create matches for all current entrants.")) return;
        try {
            await generateLeagueSchedule(competitionId);
            await updateCompetition({ ...competition!, status: 'in_progress' });
            // Re-fetch local competition state to update status UI
            const updated = await getCompetition(competitionId);
            setCompetition(updated);
            alert("Schedule generated!");
        } catch (e) {
            console.error(e);
            alert("Failed to generate schedule.");
        }
    };

    const handleAddEntry = async () => {
        if (!newEntryName.trim()) return;
        // Basic manual entry for now. In real app, search for users.
        const entry: CompetitionEntry = {
            id: `entry_${Date.now()}`,
            competitionId,
            entryType: 'individual',
            teamId: newEntryName, // Using name as ID for manual entries for simplicity
            playerId: newEntryName, // or store name elsewhere
            status: 'active',
            createdAt: Date.now()
        };
        await createCompetitionEntry(entry);
        setNewEntryName('');
    };

    const handleUpdateScore = async (matchId: string, score1: number, score2: number, action: 'submit' | 'confirm' | 'dispute') => {
        if (action !== 'submit' && action !== 'confirm') return; // Only simple submission for now
        
        try {
            const match = matches.find(m => m.id === matchId);
            if (!match) return;

            const winnerId = score1 > score2 ? match.teamAId : score2 > score1 ? match.teamBId : null;

            // 1. Update Match
            await updateMatchScore(undefined, matchId, {
                scoreTeamAGames: [score1],
                scoreTeamBGames: [score2],
                winnerTeamId: winnerId,
                status: 'completed'
            });

            // 2. Update League Standings
            await updateLeagueStandings(matchId);

        } catch (e) {
            console.error(e);
            alert("Failed to update score.");
        }
    };

    if (!competition) return <div className="p-10 text-center">Loading...</div>;

    const uiMatches = matches.map(m => {
        // Resolve names
        const nameA = playersCache[m.teamAId || '']?.displayName || m.teamAId || 'Unknown';
        const nameB = playersCache[m.teamBId || '']?.displayName || m.teamBId || 'Unknown';
        
        return {
            id: m.id,
            team1: { id: m.teamAId || '', name: nameA, players: [] },
            team2: { id: m.teamBId || '', name: nameB, players: [] },
            score1: m.scoreTeamAGames?.[0] ?? null,
            score2: m.scoreTeamBGames?.[0] ?? null,
            status: m.status || 'scheduled',
            roundNumber: m.roundNumber || 1
        };
    });

    // Hydrate standings names
    const uiStandings = standings.map(s => ({
        ...s,
        teamName: playersCache[s.teamId]?.displayName || s.teamId || s.teamName
    }));

    return (
        <div className="max-w-6xl mx-auto p-4 animate-fade-in">
            <button onClick={onBack} className="text-sm text-gray-400 hover:text-white mb-4">← Back to Dashboard</button>
            
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-1">{competition.name}</h1>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                        competition.status === 'in_progress' ? 'bg-green-900 text-green-300' : 'bg-gray-700 text-gray-400'
                    }`}>
                        {competition.status.replace('_', ' ')}
                    </span>
                </div>
                {isOrganizer && competition.status === 'draft' && (
                    <button 
                        onClick={handleGenerateSchedule}
                        className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded font-bold shadow"
                    >
                        Start League & Generate Schedule
                    </button>
                )}
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
                    isVerified={true} // Allow edits for now if verified
                />
            )}

            {activeTab === 'entrants' && (
                <div className="bg-gray-800 rounded p-6 border border-gray-700">
                    <h2 className="text-xl font-bold text-white mb-4">League Entrants</h2>
                    
                    {isOrganizer && competition.status === 'draft' && (
                        <div className="flex gap-2 mb-6">
                            <input 
                                className="bg-gray-900 text-white p-2 rounded border border-gray-600"
                                placeholder="Team/Player Name"
                                value={newEntryName}
                                onChange={e => setNewEntryName(e.target.value)}
                            />
                            <button onClick={handleAddEntry} className="bg-blue-600 text-white px-4 py-2 rounded font-bold">Add</button>
                        </div>
                    )}

                    <div className="space-y-2">
                        {entries.length === 0 ? <p className="text-gray-500">No entrants yet.</p> : entries.map(e => (
                            <div key={e.id} className="bg-gray-900 p-3 rounded flex justify-between items-center">
                                <span className="text-white font-medium">{playersCache[e.playerId || '']?.displayName || e.playerId || e.teamId}</span>
                                <span className="text-xs text-gray-500 capitalize">{e.entryType}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

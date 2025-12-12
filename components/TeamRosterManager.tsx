
import React, { useState, useEffect } from 'react';
import { getTeamRoster, manageTeamRoster, searchUsers, getUsersByIds } from '../services/firebase';
import type { Team, UserProfile, TeamRoster } from '../types';

interface TeamRosterManagerProps {
    team: Team;
    isCaptain: boolean;
    onClose: () => void;
}

export const TeamRosterManager: React.FC<TeamRosterManagerProps> = ({ team, isCaptain, onClose }) => {
    const [roster, setRoster] = useState<TeamRoster | null>(null);
    const [players, setPlayers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
    const [error, setError] = useState<string | null>(null);

    const refreshRoster = async () => {
        try {
            let r = await getTeamRoster(team.id);
            // If no dedicated roster, create default from team players
            if (!r) {
                r = {
                    id: team.id,
                    teamId: team.id,
                    players: team.players || [],
                    captainPlayerId: team.captainPlayerId,
                    updatedAt: Date.now()
                };
            }
            setRoster(r);
            
            if (r.players.length > 0) {
                const profiles = await getUsersByIds(r.players);
                setPlayers(profiles);
            } else {
                setPlayers([]);
            }
        } catch (e) {
            console.error(e);
            setError("Failed to load roster.");
        }
    };

    useEffect(() => {
        refreshRoster().then(() => setLoading(false));
    }, [team.id]);

    const handleSearch = async (term: string) => {
        setSearchTerm(term);
        if (term.length < 2) {
            setSearchResults([]);
            return;
        }
        const results = await searchUsers(term);
        setSearchResults(results.filter(u => !roster?.players.includes(u.id)));
    };

    const handleAddPlayer = async (user: UserProfile) => {
        setProcessing(true);
        setError(null);
        try {
            await manageTeamRoster({ 
                teamId: team.id, 
                action: 'add', 
                playerId: user.id 
            });
            await refreshRoster();
            setSearchResults([]);
            setSearchTerm('');
        } catch (e: any) {
            console.error(e);
            setError(e.message || "Failed to add player. They may not meet eligibility rules.");
        } finally {
            setProcessing(false);
        }
    };

    const handleRemovePlayer = async (userId: string) => {
        if (userId === team.captainPlayerId) {
            setError("Cannot remove the captain.");
            return;
        }
        setProcessing(true);
        setError(null);
        try {
            await manageTeamRoster({ 
                teamId: team.id, 
                action: 'remove', 
                playerId: userId 
            });
            await refreshRoster();
        } catch (e: any) {
            console.error(e);
            setError(e.message || "Failed to remove player.");
        } finally {
            setProcessing(false);
        }
    };

    if (loading) return <div className="p-4 text-center text-white">Loading Roster...</div>;

    return (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-800 w-full max-w-lg p-6 rounded-lg border border-gray-700 max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-white">Manage Roster</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
                </div>
                
                {error && <div className="bg-red-900/50 p-2 rounded text-red-200 text-sm mb-4">{error}</div>}

                <div className="mb-4 text-sm text-gray-400">
                    Team: <span className="font-bold text-white">{team.teamName || 'My Team'}</span>
                </div>

                <div className="flex-grow overflow-y-auto mb-4 bg-gray-900/50 rounded p-2 border border-gray-700">
                    {players.length === 0 ? (
                        <p className="text-gray-500 italic p-2">No players in roster.</p>
                    ) : (
                        players.map(p => (
                            <div key={p.id} className="flex justify-between items-center p-2 border-b border-gray-800 last:border-0">
                                <div>
                                    <span className="text-white font-medium">{p.displayName}</span>
                                    {p.id === team.captainPlayerId && <span className="ml-2 text-xs bg-yellow-900/50 text-yellow-400 px-1.5 py-0.5 rounded">Captain</span>}
                                </div>
                                {isCaptain && p.id !== team.captainPlayerId && (
                                    <button 
                                        onClick={() => handleRemovePlayer(p.id)}
                                        disabled={processing}
                                        className="text-red-400 hover:text-red-300 text-xs disabled:opacity-50"
                                    >
                                        Remove
                                    </button>
                                )}
                            </div>
                        ))
                    )}
                </div>

                {isCaptain && (
                    <div className="mt-2">
                        <label className="block text-xs text-gray-400 mb-1">Add Player</label>
                        <input 
                            className="w-full bg-gray-900 text-white p-2 rounded border border-gray-600 text-sm"
                            placeholder="Search by name..."
                            value={searchTerm}
                            onChange={e => handleSearch(e.target.value)}
                            disabled={processing}
                        />
                        {searchResults.length > 0 && (
                            <div className="bg-gray-800 border border-gray-600 mt-1 rounded max-h-40 overflow-y-auto">
                                {searchResults.map(u => (
                                    <button 
                                        key={u.id}
                                        onClick={() => handleAddPlayer(u)}
                                        disabled={processing}
                                        className="w-full text-left p-2 hover:bg-gray-700 text-sm text-white border-b border-gray-700 last:border-0"
                                    >
                                        + {u.displayName}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="mt-6 flex justify-end">
                    <button onClick={onClose} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded text-sm font-bold">Done</button>
                </div>
            </div>
        </div>
    );
};

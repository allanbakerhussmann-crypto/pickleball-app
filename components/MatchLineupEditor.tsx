
import React, { useState, useEffect } from 'react';
import type { Match, Team, UserProfile, Board } from '../types';
import { getTeamRoster, getUsersByIds, submitLineup } from '../services/firebase';

interface MatchLineupEditorProps {
    match: Match;
    teamId: string;
    onClose: () => void;
}

export const MatchLineupEditor: React.FC<MatchLineupEditorProps> = ({ match, teamId, onClose }) => {
    const [rosterPlayers, setRosterPlayers] = useState<UserProfile[]>([]);
    const [lineup, setLineup] = useState<Record<number, string[]>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const boards = match.boards || [];

    useEffect(() => {
        const load = async () => {
            try {
                // Get Roster
                const roster = await getTeamRoster(teamId);
                let playerIds = roster ? roster.players : [];
                
                // Fallback if no roster doc yet
                if (playerIds.length === 0) {
                    // Logic to fetch from team doc if needed, but assuming consistency
                }

                if (playerIds.length > 0) {
                    const profiles = await getUsersByIds(playerIds);
                    setRosterPlayers(profiles);
                }

                // Pre-fill existing lineup if present in match snapshots
                const currentAssignments: Record<number, string[]> = {};
                const isTeamA = match.teamAId === teamId;
                
                boards.forEach((b, idx) => {
                    const players = isTeamA ? b.teamAPlayers : b.teamBPlayers;
                    if (players && players.length > 0) {
                        currentAssignments[idx] = players.map(p => p.id);
                    } else {
                        currentAssignments[idx] = []; // Initialize empty
                    }
                });
                setLineup(currentAssignments);

            } catch (e) {
                console.error(e);
                setError("Failed to load team data.");
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [teamId, match.id]); // Added dependency match.id although unlikely to change

    const handleSelectPlayer = (boardIdx: number, slotIdx: number, playerId: string) => {
        setLineup(prev => {
            const currentBoardPlayers = [...(prev[boardIdx] || [])];
            currentBoardPlayers[slotIdx] = playerId;
            return { ...prev, [boardIdx]: currentBoardPlayers };
        });
    };

    const handleSubmit = async () => {
        setSaving(true);
        setError(null);

        // Validation: Ensure required slots filled? (Optional based on rules)
        // Transform to payload
        const payload = Object.entries(lineup).map(([idxStr, pIds]) => ({
            boardNumber: parseInt(idxStr) + 1,
            playerIds: (pIds as string[]).filter(id => !!id) // remove empties
        }));

        try {
            await submitLineup(match.id, teamId, payload);
            onClose();
        } catch (e: any) {
            console.error(e);
            setError(e.message || "Failed to submit lineup.");
        } finally {
            setSaving(false);
        }
    };

    // Helper to get number of slots per board type
    const getSlots = (type: string) => (type === 'singles' ? 1 : 2);

    if (loading) return <div className="fixed inset-0 bg-black/80 flex items-center justify-center text-white">Loading Lineup...</div>;

    return (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-800 w-full max-w-2xl p-6 rounded-lg border border-gray-700 max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-white">Set Lineup</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
                </div>

                {error && <div className="bg-red-900/50 p-2 rounded text-red-200 text-sm mb-4">{error}</div>}

                <div className="flex-grow overflow-y-auto pr-2 space-y-4">
                    {boards.map((board, idx) => {
                        const slots = getSlots(board.boardType);
                        const assigned = lineup[idx] || [];

                        return (
                            <div key={idx} className="bg-gray-900 p-4 rounded border border-gray-700">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="font-bold text-green-400 uppercase text-sm">Board {idx + 1}: {board.boardType.replace('_', ' ')}</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {Array.from({ length: slots }).map((_, slotIdx) => (
                                        <div key={slotIdx}>
                                            <label className="block text-xs text-gray-500 mb-1">Player {slotIdx + 1}</label>
                                            <select 
                                                className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600 text-sm"
                                                value={assigned[slotIdx] || ''}
                                                onChange={e => handleSelectPlayer(idx, slotIdx, e.target.value)}
                                            >
                                                <option value="">-- Select Player --</option>
                                                {rosterPlayers.map(p => (
                                                    <option key={p.id} value={p.id}>{p.displayName}</option>
                                                ))}
                                            </select>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="mt-6 flex justify-end gap-3">
                    <button onClick={onClose} className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded text-sm">Cancel</button>
                    <button 
                        onClick={handleSubmit} 
                        disabled={saving}
                        className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded text-sm font-bold disabled:opacity-50"
                    >
                        {saving ? 'Saving...' : 'Submit Lineup'}
                    </button>
                </div>
            </div>
        </div>
    );
};

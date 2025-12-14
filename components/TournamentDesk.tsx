
import React, { useState, useEffect, useRef } from 'react';
import { 
    subscribeToRegistrations, 
    checkInPlayer, 
    getUsersByIds 
} from '../services/firebase';
import type { Registration, UserProfile, Tournament } from '../types';

interface TournamentDeskProps {
    tournament: Tournament;
    onClose: () => void;
}

export const TournamentDesk: React.FC<TournamentDeskProps> = ({ tournament, onClose }) => {
    const [registrations, setRegistrations] = useState<Registration[]>([]);
    const [players, setPlayers] = useState<Record<string, UserProfile>>({});
    const [scanInput, setScanInput] = useState('');
    const [lastAction, setLastAction] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    
    // Stats
    const [checkedInCount, setCheckedInCount] = useState(0);
    const [totalCount, setTotalCount] = useState(0);

    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-focus the scan input on mount
    useEffect(() => {
        if (inputRef.current) inputRef.current.focus();
    }, []);

    useEffect(() => {
        const unsub = subscribeToRegistrations(tournament.id, (regs) => {
            // Only active
            const active = regs.filter(r => r.status === 'completed');
            setRegistrations(active);
            setTotalCount(active.length);
            setCheckedInCount(active.filter(r => r.checkedIn).length);
            
            // Fetch player profiles
            const missingIds = active.map(r => r.playerId).filter(pid => !players[pid]);
            if (missingIds.length > 0) {
                getUsersByIds(missingIds).then(profiles => {
                    setPlayers(prev => {
                        const next = { ...prev };
                        profiles.forEach(p => next[p.id] = p);
                        return next;
                    });
                });
            }
        });
        return () => unsub();
    }, [tournament.id, players]);

    const handleScanSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const term = scanInput.trim();
        if (!term) return;

        // "Scanning" logic: usually a QR code contains the full user ID.
        // We also support partial ID search for manual entry.
        
        // 1. Find Registration
        const reg = registrations.find(r => 
            r.playerId === term || 
            (players[r.playerId]?.displayName || '').toLowerCase().includes(term.toLowerCase())
        );

        if (!reg) {
            setLastAction({ msg: `Player not found: ${term}`, type: 'error' });
            setScanInput('');
            return;
        }

        if (reg.checkedIn) {
            setLastAction({ msg: `${players[reg.playerId]?.displayName} is already checked in.`, type: 'error' });
            setScanInput('');
            return;
        }

        try {
            await checkInPlayer(tournament.id, reg.playerId);
            const name = players[reg.playerId]?.displayName || 'Player';
            setLastAction({ msg: `Checked In: ${name}`, type: 'success' });
        } catch (err) {
            console.error(err);
            setLastAction({ msg: "Check-in failed.", type: 'error' });
        }
        
        setScanInput('');
        if (inputRef.current) inputRef.current.focus();
    };

    // Sort: Checked in at top? No, usually recent check-ins at top of a list, but for "Waiting" list, alphabetical.
    const notCheckedIn = registrations
        .filter(r => !r.checkedIn)
        .sort((a,b) => (players[a.playerId]?.displayName || '').localeCompare(players[b.playerId]?.displayName || ''));

    const checkedIn = registrations
        .filter(r => r.checkedIn)
        .sort((a,b) => (b.checkedInAt || 0) - (a.checkedInAt || 0)); // Most recent first

    return (
        <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col font-sans">
            {/* Top Bar */}
            <div className="bg-gray-800 border-b border-gray-700 p-4 flex justify-between items-center shadow-md">
                <div className="flex items-center gap-4">
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                    <div>
                        <h1 className="text-xl font-bold text-white tracking-tight">Tournament Desk</h1>
                        <div className="text-xs text-gray-400 font-mono uppercase tracking-widest">{tournament.name}</div>
                    </div>
                </div>
                
                {/* Stats */}
                <div className="flex gap-6">
                    <div className="text-center">
                        <div className="text-2xl font-black text-green-400">{checkedInCount}</div>
                        <div className="text-[10px] text-gray-500 uppercase font-bold">Checked In</div>
                    </div>
                    <div className="text-center">
                        <div className="text-2xl font-black text-white">{totalCount - checkedInCount}</div>
                        <div className="text-[10px] text-gray-500 uppercase font-bold">Pending</div>
                    </div>
                </div>
            </div>

            <div className="flex-grow flex flex-col md:flex-row overflow-hidden">
                
                {/* LEFT: Scanner & Action Area */}
                <div className="w-full md:w-1/3 bg-gray-900 border-r border-gray-800 flex flex-col p-6">
                    <form onSubmit={handleScanSubmit} className="mb-6">
                        <label className="block text-xs font-bold text-green-400 uppercase mb-2 tracking-wider">
                            Scan Player Pass or Type Name
                        </label>
                        <div className="relative">
                            <input 
                                ref={inputRef}
                                value={scanInput}
                                onChange={e => setScanInput(e.target.value)}
                                className="w-full bg-black text-white text-lg p-4 rounded-lg border-2 border-gray-700 focus:border-green-500 outline-none shadow-inner font-mono"
                                placeholder="Scan QR..."
                                autoFocus
                            />
                            <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-600">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4h2v-4zM5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                            </div>
                        </div>
                    </form>

                    {lastAction && (
                        <div className={`p-4 rounded-lg border mb-6 animate-fade-in ${
                            lastAction.type === 'success' 
                                ? 'bg-green-900/20 border-green-600 text-green-400' 
                                : 'bg-red-900/20 border-red-600 text-red-400'
                        }`}>
                            <div className="font-bold text-lg">{lastAction.type === 'success' ? 'OK' : 'ERROR'}</div>
                            <div>{lastAction.msg}</div>
                        </div>
                    )}

                    <div className="flex-grow">
                        <h3 className="text-gray-500 font-bold uppercase text-xs mb-3 border-b border-gray-800 pb-2">Recently Checked In</h3>
                        <div className="space-y-2">
                            {checkedIn.slice(0, 5).map(r => (
                                <div key={r.id} className="flex justify-between items-center text-sm p-2 rounded bg-gray-800/50">
                                    <span className="text-white font-medium">{players[r.playerId]?.displayName}</span>
                                    <span className="text-xs text-green-500 font-mono">
                                        {new Date(r.checkedInAt!).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* RIGHT: Lists */}
                <div className="flex-1 bg-gray-900 p-6 overflow-y-auto">
                    <h3 className="text-gray-500 font-bold uppercase text-xs mb-4">Pending Players ({notCheckedIn.length})</h3>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {notCheckedIn.map(r => (
                            <button 
                                key={r.id}
                                onClick={() => { setScanInput(r.playerId); handleScanSubmit(); }} 
                                className="flex items-center p-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-colors group text-left"
                            >
                                <div className="w-10 h-10 rounded-full bg-gray-700 border border-gray-600 flex items-center justify-center text-gray-400 font-bold mr-3 group-hover:border-green-500 group-hover:text-green-400">
                                    {(players[r.playerId]?.displayName || '?')[0]}
                                </div>
                                <div>
                                    <div className="font-bold text-gray-200 group-hover:text-white truncate w-32 md:w-40">
                                        {players[r.playerId]?.displayName || 'Loading...'}
                                    </div>
                                    <div className="text-xs text-gray-500">Tap to check in</div>
                                </div>
                            </button>
                        ))}
                        {notCheckedIn.length === 0 && (
                            <div className="col-span-full py-12 text-center text-gray-600 italic">
                                All players checked in!
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

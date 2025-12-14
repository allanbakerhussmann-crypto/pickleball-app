
import React, { useEffect, useState } from 'react';
import { subscribeToGameSessions } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import type { GameSession } from '../../types';

interface SocialPlayDashboardProps {
    onCreateClick: () => void;
    onSelectSession: (id: string) => void;
}

// Helper to generate consistent coordinates from a string (Location)
const getCoordinatesFromLocation = (location: string) => {
    let hash = 0;
    const str = (location || '').toLowerCase().trim();
    if (str.length === 0) return { x: 50, y: 50 }; // Default center
    
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    
    // Seed random generator with hash
    const seed = Math.abs(hash);
    
    // Generate X and Y (10% to 90% safe area)
    // We use simple modulo arithmetic on the hash parts
    const x = (seed % 80) + 10;
    const y = ((seed >> 3) % 80) + 10;
    
    return { x, y };
};

export const SocialPlayDashboard: React.FC<SocialPlayDashboardProps> = ({ onCreateClick, onSelectSession }) => {
    const { currentUser } = useAuth();
    const [sessions, setSessions] = useState<GameSession[]>([]);
    const [viewType, setViewType] = useState<'list' | 'map'>('list');
    
    useEffect(() => {
        const unsub = subscribeToGameSessions(setSessions);
        return () => unsub();
    }, []);

    return (
        <div className="max-w-5xl mx-auto mt-4 animate-fade-in px-4">
            <h1 className="text-3xl font-black text-white mb-6 tracking-tight">Social Play</h1>

            {/* Actions Grid - Matching UserDashboard style */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                <button 
                    onClick={onCreateClick} 
                    className="bg-gray-800 hover:bg-gray-700 p-6 rounded-xl text-left border border-gray-700 group transition-all shadow-lg hover:shadow-green-900/10 hover:border-green-500/50"
                >
                    <div className="w-12 h-12 bg-green-900/30 rounded-xl flex items-center justify-center mb-4 text-green-400 group-hover:scale-110 transition-transform shadow-inner">
                        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                    </div>
                    <h3 className="text-xl font-bold text-white">Create Game</h3>
                    <p className="text-sm text-gray-400 mt-1">Host a match for friends or club members</p>
                </button>

                {/* Info / Find Game Placeholder */}
                <div 
                    onClick={() => setViewType('map')}
                    className="bg-gradient-to-br from-gray-800 to-gray-900 p-6 rounded-xl border border-gray-700 flex flex-col justify-center relative overflow-hidden cursor-pointer hover:border-green-500/50 transition-colors group"
                >
                    <div className="relative z-10">
                        <h3 className="text-lg font-bold text-white mb-2">Find Local Games</h3>
                        <p className="text-sm text-gray-400 mb-4">Browse open games in your area or joined clubs.</p>
                        <div className="flex items-center gap-2 text-xs text-gray-500 font-bold bg-gray-950/30 w-fit px-3 py-1 rounded-full group-hover:bg-green-900/30 group-hover:text-green-400 transition-colors">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                            {sessions.length} active sessions
                        </div>
                    </div>
                    <div className="absolute right-[-20px] bottom-[-20px] opacity-10 text-white group-hover:opacity-20 transition-opacity">
                        <svg className="w-32 h-32" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                    </div>
                </div>
            </div>

            <div className="flex justify-between items-end mb-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    Active Sessions
                </h2>
                
                {/* View Toggle */}
                <div className="bg-gray-800 p-1 rounded-lg border border-gray-700 flex">
                    <button 
                        onClick={() => setViewType('list')}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${viewType === 'list' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                        List
                    </button>
                    <button 
                        onClick={() => setViewType('map')}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${viewType === 'map' ? 'bg-green-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                        Map
                    </button>
                </div>
            </div>

            {viewType === 'list' ? (
                <>
                    {sessions.length === 0 ? (
                        <div className="bg-gray-800 rounded-xl p-8 text-center border border-gray-700 border-dashed">
                            <div className="inline-block p-4 bg-gray-900 rounded-full mb-4">
                                <svg className="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </div>
                            <h3 className="text-lg font-bold text-white mb-2">No Active Games</h3>
                            <p className="text-gray-400 mb-6 max-w-sm mx-auto">Start a game and share the link with friends to get playing.</p>
                        </div>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {sessions.map(s => {
                                const isHost = s.hostId === currentUser?.uid;
                                const isJoined = !isHost && currentUser && s.playerIds.includes(currentUser.uid);
                                const date = new Date(s.startDatetime);
                                return (
                                    <div 
                                        key={s.id}
                                        onClick={() => onSelectSession(s.id)}
                                        className="bg-gray-800 rounded-xl p-5 border border-gray-700 hover:border-green-500 cursor-pointer transition-all hover:shadow-lg group relative overflow-hidden flex flex-col h-full"
                                    >
                                        {isHost && <div className="absolute top-0 right-0 bg-blue-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl shadow-lg">HOST</div>}
                                        {isJoined && <div className="absolute top-0 right-0 bg-green-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl shadow-lg">JOINED</div>}
                                        
                                        <div className="mb-4">
                                            <h3 className="font-bold text-white text-lg group-hover:text-green-400 transition-colors mb-1 truncate pr-8 leading-tight">{s.title}</h3>
                                            <div className="text-sm text-gray-400 flex items-center gap-2">
                                                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                                <span className="truncate">{s.location}</span>
                                            </div>
                                        </div>
                                        
                                        <div className="mt-auto pt-4 border-t border-gray-700 flex justify-between items-end">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Time</span>
                                                <span className="text-white font-medium text-sm">
                                                    {date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })} • {date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                            <div className="flex flex-col items-end">
                                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Players</span>
                                                <div className="flex items-center gap-1">
                                                    <span className={`font-bold ${s.playerIds.length >= s.maxPlayers ? 'text-red-400' : 'text-green-400'}`}>
                                                        {s.playerIds.length}
                                                    </span>
                                                    <span className="text-gray-400 text-sm">/ {s.maxPlayers}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            ) : (
                <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden h-[600px] relative animate-fade-in">
                    {/* Simulated Map UI */}
                    <div className="absolute inset-0 bg-[#242f3e] opacity-80" 
                         style={{ 
                             backgroundImage: 'radial-gradient(#374151 1px, transparent 1px)', 
                             backgroundSize: '20px 20px' 
                         }}>
                    </div>
                    
                    {/* Empty State on Map */}
                    {sessions.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="bg-gray-900/80 p-6 rounded-xl border border-gray-700 text-center">
                                <p className="text-gray-400 font-bold">No active sessions to map.</p>
                            </div>
                        </div>
                    )}

                    {/* Simulated Pins */}
                    {sessions.map((s, i) => {
                        // Use the location string to generate coordinates.
                        // This groups games at the same "location" visually.
                        const { x: baseX, y: baseY } = getCoordinatesFromLocation(s.location || 'unknown');
                        
                        // Add slight deterministic jitter so pins don't perfectly overlap if they share the exact location string
                        const jitterX = (s.id.charCodeAt(s.id.length - 1) % 5) - 2; 
                        const jitterY = (s.id.charCodeAt(0) % 5) - 2;
                        const finalX = Math.min(95, Math.max(5, baseX + jitterX));
                        const finalY = Math.min(95, Math.max(5, baseY + jitterY));

                        const isFull = s.playerIds.length >= s.maxPlayers;
                        
                        return (
                            <button 
                                key={s.id}
                                onClick={() => onSelectSession(s.id)}
                                className="absolute transform -translate-x-1/2 -translate-y-1/2 group z-10 hover:z-20 transition-all duration-300"
                                style={{ top: `${finalY}%`, left: `${finalX}%` }}
                            >
                                <div className="relative">
                                    {/* Pin */}
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 shadow-lg transition-transform group-hover:scale-125 ${
                                        isFull ? 'bg-red-900 border-red-500' : 'bg-green-600 border-white'
                                    }`}>
                                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    </div>
                                    {/* Triangle arrow */}
                                    <div className={`absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] ${
                                        isFull ? 'border-t-red-900' : 'border-t-green-600'
                                    }`}></div>
                                    
                                    {/* Tooltip Card */}
                                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-3 w-48 bg-white text-gray-900 rounded-lg p-2 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30">
                                        <div className="text-xs font-bold line-clamp-1">{s.title}</div>
                                        <div className="text-[10px] text-gray-500 truncate border-t border-gray-200 pt-1 mt-1">{s.location}</div>
                                        <div className={`text-[10px] font-semibold mt-1 ${isFull ? 'text-red-600' : 'text-green-600'}`}>
                                            {s.playerIds.length} / {s.maxPlayers} Players
                                        </div>
                                    </div>
                                </div>
                            </button>
                        );
                    })}

                    <div className="absolute bottom-4 left-4 bg-gray-900/90 p-3 rounded-lg border border-gray-700 text-xs text-gray-300 pointer-events-none">
                        <p className="font-bold mb-1">Live Map View</p>
                        <p>Showing games by location.</p>
                    </div>
                </div>
            )}
        </div>
    );
};

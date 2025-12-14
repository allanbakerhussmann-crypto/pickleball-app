
import React, { useEffect, useState } from 'react';
import { getGameSession, joinGameSession, getUsersByIds } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import type { GameSession, UserProfile } from '../../types';

interface GameSessionDetailProps {
    sessionId: string;
    onBack: () => void;
}

export const GameSessionDetail: React.FC<GameSessionDetailProps> = ({ sessionId, onBack }) => {
    const { currentUser, userProfile } = useAuth();
    const [session, setSession] = useState<GameSession | null>(null);
    const [players, setPlayers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [joining, setJoining] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);

    useEffect(() => {
        const load = async () => {
            try {
                const s = await getGameSession(sessionId);
                setSession(s);
                if (s && s.playerIds.length > 0) {
                    const p = await getUsersByIds(s.playerIds);
                    setPlayers(p);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [sessionId]);

    const handleJoin = async () => {
        if (!currentUser || !session) return;
        setJoining(true);
        try {
            await joinGameSession(session.id, currentUser.uid);
            // Refresh local state optimistically
            setSession(prev => prev ? ({ ...prev, playerIds: [...prev.playerIds, currentUser.uid] }) : null);
            if (userProfile) setPlayers(prev => [...prev, userProfile]);
        } catch (e) {
            console.error(e);
            alert("Failed to join game.");
        } finally {
            setJoining(false);
        }
    };

    const handleShare = () => {
        const url = `${window.location.origin}/?gameId=${sessionId}`;
        navigator.clipboard.writeText(url);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
    };

    if (loading) return <div className="p-10 text-center text-gray-400">Loading Game Details...</div>;
    if (!session) return <div className="p-10 text-center text-red-400">Game not found.</div>;

    const isFull = session.playerIds.length >= session.maxPlayers;
    const isJoined = currentUser && session.playerIds.includes(currentUser.uid);
    const spotsLeft = session.maxPlayers - session.playerIds.length;
    const dateStr = new Date(session.startDatetime).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const timeStr = new Date(session.startDatetime).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

    return (
        <div className="max-w-2xl mx-auto p-4 animate-fade-in">
            <button onClick={onBack} className="text-gray-400 mb-6 flex items-center gap-2 text-sm hover:text-white">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                Back to Dashboard
            </button>

            <div className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700 shadow-2xl">
                {/* Header */}
                <div className="bg-gradient-to-r from-green-900 to-gray-900 p-8 text-center relative">
                    <div className="inline-block bg-black/30 backdrop-blur rounded-full px-3 py-1 text-xs font-bold text-green-400 uppercase tracking-widest mb-4">
                        Social Play
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black text-white mb-2">{session.title}</h1>
                    <p className="text-gray-300 text-lg">Hosted by {session.hostName}</p>
                    
                    {/* Share Button Absolute */}
                    <button 
                        onClick={handleShare}
                        className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 p-2 rounded-full backdrop-blur transition-colors"
                        title="Copy Link"
                    >
                        {copySuccess ? (
                            <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        ) : (
                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                        )}
                    </button>
                </div>

                {/* Status Bar */}
                <div className="flex border-b border-gray-700 bg-gray-900/50">
                    <div className="flex-1 p-4 text-center border-r border-gray-700">
                        <div className="text-xs text-gray-500 uppercase font-bold">When</div>
                        <div className="text-white font-bold">{dateStr}</div>
                        <div className="text-green-400 text-sm">{timeStr}</div>
                    </div>
                    <div className="flex-1 p-4 text-center border-r border-gray-700">
                        <div className="text-xs text-gray-500 uppercase font-bold">Where</div>
                        <div className="text-white font-bold truncate px-2">{session.location}</div>
                        <div className="text-gray-400 text-sm">{session.courtCount} Court{session.courtCount > 1 ? 's' : ''}</div>
                    </div>
                    <div className="flex-1 p-4 text-center">
                        <div className="text-xs text-gray-500 uppercase font-bold">Availability</div>
                        <div className={`font-bold ${isFull ? 'text-red-400' : 'text-white'}`}>
                            {session.playerIds.length} / {session.maxPlayers}
                        </div>
                        <div className="text-gray-400 text-sm">{isFull ? 'Full' : `${spotsLeft} spots left`}</div>
                    </div>
                </div>

                {/* Details */}
                <div className="p-6">
                    {session.description && (
                        <div className="mb-6 bg-gray-900/50 p-4 rounded-lg text-gray-300 text-sm italic border-l-4 border-gray-600">
                            "{session.description}"
                        </div>
                    )}

                    <div className="mb-6">
                        <h3 className="text-white font-bold mb-4 flex items-center justify-between">
                            Who's Playing
                            {(session.minRating || session.maxRating) && (
                                <span className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded">
                                    Target DUPR: {session.minRating || '0'} - {session.maxRating || '∞'}
                                </span>
                            )}
                        </h3>
                        <div className="grid grid-cols-4 sm:grid-cols-5 gap-4">
                            {players.map(p => (
                                <div key={p.id} className="flex flex-col items-center text-center">
                                    <div className="w-12 h-12 rounded-full bg-gray-700 border-2 border-gray-600 flex items-center justify-center text-lg font-bold text-gray-300 mb-1">
                                        {p.photoData ? (
                                            <img src={p.photoData} className="w-full h-full rounded-full object-cover" alt="" />
                                        ) : (
                                            p.displayName?.[0] || '?'
                                        )}
                                    </div>
                                    <span className="text-[10px] text-gray-400 font-medium truncate w-full">
                                        {p.displayName?.split(' ')[0]}
                                    </span>
                                </div>
                            ))}
                            {Array.from({ length: Math.max(0, session.maxPlayers - players.length) }).map((_, i) => (
                                <div key={i} className="flex flex-col items-center opacity-30">
                                    <div className="w-12 h-12 rounded-full border-2 border-dashed border-gray-500 flex items-center justify-center"></div>
                                    <span className="text-[10px] text-gray-500 mt-1">Open</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Action */}
                    <div className="pt-4 border-t border-gray-700">
                        {isJoined ? (
                            <button disabled className="w-full bg-gray-700 text-green-400 font-bold py-4 rounded-xl border border-green-900 cursor-default">
                                ✓ You are joined
                            </button>
                        ) : isFull ? (
                            <button disabled className="w-full bg-gray-700 text-gray-400 font-bold py-4 rounded-xl cursor-not-allowed">
                                Game Full
                            </button>
                        ) : currentUser ? (
                            <button 
                                onClick={handleJoin} 
                                disabled={joining}
                                className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-4 rounded-xl shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98]"
                            >
                                {joining ? 'Joining...' : 'Join Game'}
                            </button>
                        ) : (
                            <div className="text-center">
                                <p className="text-gray-400 mb-3">Login to join this game</p>
                                {/* In real implementation, this would trigger login modal via context or prop */}
                                <button disabled className="w-full bg-blue-600 opacity-50 text-white font-bold py-3 rounded-xl">
                                    Login Required
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

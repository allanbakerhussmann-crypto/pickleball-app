
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { subscribeToSocialEvents, joinSocialEvent, leaveSocialEvent, deleteSocialEvent } from '../../services/firebase';
import type { SocialEvent } from '../../types';
import { CreateSocialPlayModal } from './CreateSocialPlayModal';

export const SocialPlayDashboard: React.FC = () => {
    const { currentUser } = useAuth();
    const [events, setEvents] = useState<SocialEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);

    useEffect(() => {
        const unsub = subscribeToSocialEvents((data) => {
            // Filter out past events (older than yesterday to keep them visible briefly)
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const cutoff = yesterday.toISOString().split('T')[0];
            
            const upcoming = data.filter(e => e.date >= cutoff);
            setEvents(upcoming);
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const handleJoin = async (e: SocialEvent) => {
        if (!currentUser) return;
        if (e.maxPlayers && e.attendees.length >= e.maxPlayers) {
            alert("Event is full");
            return;
        }
        await joinSocialEvent(e.id, currentUser.uid);
    };

    const handleLeave = async (e: SocialEvent) => {
        if (!currentUser) return;
        await leaveSocialEvent(e.id, currentUser.uid);
    };

    const handleDelete = async (eventId: string) => {
        if (window.confirm("Are you sure you want to delete this event?")) {
            await deleteSocialEvent(eventId);
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-4 animate-fade-in">
            {showCreateModal && (
                <CreateSocialPlayModal 
                    onClose={() => setShowCreateModal(false)}
                    onCreated={() => setShowCreateModal(false)}
                />
            )}

            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white">Social Play</h1>
                    <p className="text-gray-400 text-sm">Find casual games and meetups near you.</p>
                </div>
                <button 
                    onClick={() => setShowCreateModal(true)}
                    className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-full font-bold shadow-lg flex items-center gap-2"
                >
                    <span className="text-xl leading-none">+</span> Host
                </button>
            </div>

            {loading ? (
                <div className="text-center text-gray-500 py-10">Loading events...</div>
            ) : events.length === 0 ? (
                <div className="bg-gray-800 rounded-lg p-8 text-center border border-gray-700">
                    <p className="text-gray-400 mb-4">No upcoming social events found.</p>
                    <button onClick={() => setShowCreateModal(true)} className="text-green-400 hover:underline">
                        Be the first to host one!
                    </button>
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2">
                    {events.map(event => {
                        const isAttending = currentUser && event.attendees.includes(currentUser.uid);
                        const isHost = currentUser && event.hostUserId === currentUser.uid;
                        const isFull = event.maxPlayers > 0 && event.attendees.length >= event.maxPlayers;
                        const spotsLeft = event.maxPlayers > 0 ? event.maxPlayers - event.attendees.length : null;

                        return (
                            <div key={event.id} className="bg-gray-800 rounded-xl p-5 border border-gray-700 shadow-lg relative overflow-hidden group hover:border-gray-600 transition-colors">
                                {isHost && (
                                    <button 
                                        onClick={() => handleDelete(event.id)}
                                        className="absolute top-3 right-3 text-gray-500 hover:text-red-400 p-1"
                                        title="Delete Event"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                )}

                                <div className="flex justify-between items-start mb-2 pr-6">
                                    <h3 className="font-bold text-lg text-white leading-tight">{event.title}</h3>
                                </div>
                                
                                <div className="space-y-1 text-sm text-gray-400 mb-4">
                                    <div className="flex items-center gap-2">
                                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                        <span>
                                            {new Date(event.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} 
                                            <span className="mx-1">•</span>
                                            {event.startTime}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                        <span>{event.location}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                        <span>Host: <span className="text-gray-300">{event.hostName}</span></span>
                                    </div>
                                </div>

                                {event.description && (
                                    <p className="text-xs text-gray-500 mb-4 line-clamp-2">{event.description}</p>
                                )}

                                <div className="flex items-center justify-between border-t border-gray-700 pt-3">
                                    <div className="text-xs">
                                        <span className="font-bold text-white">{event.attendees.length}</span>
                                        <span className="text-gray-500"> {event.maxPlayers > 0 ? `/ ${event.maxPlayers}` : ''} attending</span>
                                        {spotsLeft !== null && spotsLeft <= 2 && spotsLeft > 0 && (
                                            <span className="ml-2 text-orange-400 font-bold">Only {spotsLeft} left!</span>
                                        )}
                                    </div>

                                    {isAttending ? (
                                        <button 
                                            onClick={() => handleLeave(event)}
                                            className="bg-gray-700 hover:bg-red-900/50 hover:text-red-300 text-gray-300 px-4 py-1.5 rounded-full text-xs font-bold transition-colors"
                                        >
                                            Leave
                                        </button>
                                    ) : (
                                        <button 
                                            onClick={() => handleJoin(event)}
                                            disabled={isFull}
                                            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
                                                isFull 
                                                ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
                                                : 'bg-green-600 hover:bg-green-500 text-white shadow-lg'
                                            }`}
                                        >
                                            {isFull ? 'Full' : 'Join'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

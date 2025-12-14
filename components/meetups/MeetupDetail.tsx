
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getMeetupById, getMeetupRSVPs, setMeetupRSVP } from '../../services/firebase';
import type { Meetup, MeetupRSVP } from '../../types';

interface MeetupDetailProps {
    meetupId: string;
    onBack: () => void;
}

export const MeetupDetail: React.FC<MeetupDetailProps> = ({ meetupId, onBack }) => {
    const { currentUser } = useAuth();
    const [meetup, setMeetup] = useState<Meetup | null>(null);
    const [rsvps, setRsvps] = useState<MeetupRSVP[]>([]);
    const [loading, setLoading] = useState(true);
    const [rsvpLoading, setRsvpLoading] = useState(false);

    const loadData = async () => {
        try {
            const [m, r] = await Promise.all([
                getMeetupById(meetupId),
                getMeetupRSVPs(meetupId)
            ]);
            setMeetup(m);
            setRsvps(r);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [meetupId]);

    const handleRSVP = async (status: 'going' | 'maybe') => {
        if (!currentUser) return;
        setRsvpLoading(true);
        try {
            await setMeetupRSVP(meetupId, currentUser.uid, status);
            await loadData(); // Refresh list
        } catch (e) {
            console.error(e);
            alert("Failed to update RSVP");
        } finally {
            setRsvpLoading(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-400">Loading details...</div>;
    if (!meetup) return <div className="p-8 text-center text-red-400">Meetup not found.</div>;

    const date = new Date(meetup.when);
    const myRsvp = rsvps.find(r => r.userId === currentUser?.uid);
    const goingCount = rsvps.filter(r => r.status === 'going').length;
    const spotsLeft = meetup.maxPlayers > 0 ? meetup.maxPlayers - goingCount : null;
    const isFull = spotsLeft !== null && spotsLeft <= 0;

    return (
        <div className="max-w-3xl mx-auto p-4 animate-fade-in">
            <button onClick={onBack} className="text-gray-400 hover:text-white mb-4 flex items-center gap-1">
                ← Back to Meetups
            </button>

            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-2xl">
                <div className="p-6 md:p-8">
                    <h1 className="text-3xl font-bold text-white mb-2">{meetup.title}</h1>
                    
                    <div className="flex flex-wrap gap-4 text-gray-300 mb-6 text-sm">
                        <div className="flex items-center gap-2">
                            <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            <span>{date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} at {date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                            <span>{meetup.locationName}</span>
                        </div>
                    </div>

                    <div className="prose prose-invert max-w-none text-gray-400 mb-8">
                        <p className="whitespace-pre-wrap">{meetup.description}</p>
                    </div>

                    {meetup.location && (
                        <a 
                            href={`https://www.google.com/maps/search/?api=1&query=${meetup.location.lat},${meetup.location.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 mb-8 text-sm font-semibold"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                            Open in Google Maps
                        </a>
                    )}

                    <div className="border-t border-gray-700 pt-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-bold text-white">RSVP</h3>
                            <div className="text-sm">
                                <span className="text-white font-bold">{goingCount}</span>
                                <span className="text-gray-500"> / {meetup.maxPlayers > 0 ? meetup.maxPlayers : '∞'} Going</span>
                                {spotsLeft !== null && spotsLeft <= 5 && spotsLeft > 0 && (
                                    <span className="ml-2 text-orange-400 font-bold text-xs">{spotsLeft} spots left!</span>
                                )}
                            </div>
                        </div>

                        {currentUser ? (
                            <div className="flex gap-3">
                                <button
                                    onClick={() => handleRSVP('going')}
                                    disabled={rsvpLoading || (isFull && myRsvp?.status !== 'going')}
                                    className={`flex-1 py-3 rounded-lg font-bold transition-all ${
                                        myRsvp?.status === 'going' 
                                            ? 'bg-green-600 text-white shadow-green-900/50 shadow-lg' 
                                            : isFull 
                                                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                    }`}
                                >
                                    {myRsvp?.status === 'going' ? '✓ Going' : isFull ? 'Full' : 'Going'}
                                </button>
                                <button
                                    onClick={() => handleRSVP('maybe')}
                                    disabled={rsvpLoading}
                                    className={`flex-1 py-3 rounded-lg font-bold transition-all ${
                                        myRsvp?.status === 'maybe' 
                                            ? 'bg-yellow-600 text-white shadow-yellow-900/50 shadow-lg' 
                                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                    }`}
                                >
                                    {myRsvp?.status === 'maybe' ? '✓ Maybe' : 'Maybe'}
                                </button>
                            </div>
                        ) : (
                            <div className="p-4 bg-gray-900 rounded text-center text-gray-400">
                                Please log in to RSVP.
                            </div>
                        )}
                    </div>
                </div>
                
                {/* Attendees List */}
                <div className="bg-gray-900 p-6 border-t border-gray-700">
                    <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Who's Going</h4>
                    {rsvps.filter(r => r.status === 'going').length === 0 ? (
                        <p className="text-gray-500 italic text-sm">Be the first to say you're going!</p>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {rsvps.filter(r => r.status === 'going').map(rsvp => (
                                <div key={rsvp.userId} className="flex items-center gap-2 bg-gray-800 p-2 rounded border border-gray-700">
                                    <div className="w-8 h-8 rounded-full bg-green-900 flex items-center justify-center text-green-300 text-xs font-bold">
                                        {rsvp.userProfile?.displayName?.charAt(0) || '?'}
                                    </div>
                                    <span className="text-sm text-gray-200 truncate">{rsvp.userProfile?.displayName || 'User'}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};


import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { getMeetups } from '../../services/firebase';
import type { Meetup } from '../../types';

interface MeetupsListProps {
    onCreateClick: () => void;
    onSelectMeetup: (id: string) => void;
}

export const MeetupsList: React.FC<MeetupsListProps> = ({ onCreateClick, onSelectMeetup }) => {
    const { currentUser } = useAuth();
    const [meetups, setMeetups] = useState<Meetup[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            const data = await getMeetups();
            // Filter out linkOnly unless user is creator (or show them but mark them? Prompt implied list them)
            // Let's list everything sorted by date, filtering past events if desired, 
            // but prompt said "order by when ascending (future first)"
            
            const now = Date.now();
            // Keep past events for 24 hours maybe? Or strict future. Let's do strict future + 24h grace
            const cutoff = now - 86400000;
            
            const upcoming = data.filter(m => m.when >= cutoff);
            setMeetups(upcoming);
            setLoading(false);
        };
        load();
    }, []);

    if (loading) return <div className="p-8 text-center text-gray-400">Loading meetups...</div>;

    return (
        <div className="max-w-4xl mx-auto p-4 animate-fade-in">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-white">Social Meetups</h1>
                    <p className="text-gray-400 text-sm">Find casual games and meetups near you.</p>
                </div>
                <button 
                    onClick={onCreateClick}
                    className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-full font-bold shadow-lg flex items-center gap-2"
                >
                    <span className="text-xl leading-none">+</span> Create Meetup
                </button>
            </div>

            {meetups.length === 0 ? (
                <div className="bg-gray-800 rounded-lg p-10 text-center border border-gray-700">
                    <p className="text-gray-400 mb-4">No upcoming meetups found.</p>
                    <button onClick={onCreateClick} className="text-green-400 hover:underline">
                        Be the first to host one!
                    </button>
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2">
                    {meetups.map(meetup => {
                        const date = new Date(meetup.when);
                        const isCreator = currentUser?.uid === meetup.createdByUserId;
                        const isLinkOnly = meetup.visibility === 'linkOnly';

                        // If it's linkOnly and I'm not creator, should I see it in the public list?
                        // "Lists meetups (public + linkOnly for logged-in users)" implies YES.
                        
                        return (
                            <div 
                                key={meetup.id} 
                                onClick={() => onSelectMeetup(meetup.id)}
                                className="bg-gray-800 rounded-xl p-5 border border-gray-700 shadow-lg hover:border-gray-500 cursor-pointer transition-all group relative overflow-hidden"
                            >
                                {isLinkOnly && (
                                    <div className="absolute top-0 right-0 bg-yellow-900/80 text-yellow-200 text-[10px] px-2 py-1 rounded-bl uppercase font-bold">
                                        Link Only
                                    </div>
                                )}
                                
                                <h3 className="font-bold text-lg text-white mb-1 group-hover:text-green-400 transition-colors">{meetup.title}</h3>
                                <div className="text-sm text-gray-400 mb-4 flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                        <span>{date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at {date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                        <span className="truncate">{meetup.locationName}</span>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between text-xs text-gray-500 border-t border-gray-700 pt-3">
                                    <span>Max: {meetup.maxPlayers > 0 ? meetup.maxPlayers : 'Unlimited'} players</span>
                                    {isCreator && <span className="text-green-500 font-bold">Host</span>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

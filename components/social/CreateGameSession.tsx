
import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { createGameSession } from '../../services/firebase';
import type { GameSession } from '../../types';

interface CreateGameSessionProps {
    onCancel: () => void;
    onCreated: () => void;
}

export const CreateGameSession: React.FC<CreateGameSessionProps> = ({ onCancel, onCreated }) => {
    const { currentUser, userProfile } = useAuth();
    const [title, setTitle] = useState('');
    const [location, setLocation] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [duration, setDuration] = useState(120); // minutes
    const [courtCount, setCourtCount] = useState(1);
    const [maxPlayers, setMaxPlayers] = useState(4);
    const [minRating, setMinRating] = useState('');
    const [maxRating, setMaxRating] = useState('');
    const [description, setDescription] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser) return;

        setIsSubmitting(true);
        try {
            const startDatetime = new Date(`${date}T${time}`).toISOString();
            
            const session: GameSession = {
                id: '', // set by firebase
                hostId: currentUser.uid,
                hostName: userProfile?.displayName || currentUser.email || 'Host',
                title,
                location,
                startDatetime,
                durationMinutes: duration,
                courtCount,
                maxPlayers,
                minRating: minRating ? parseFloat(minRating) : undefined,
                maxRating: maxRating ? parseFloat(maxRating) : undefined,
                description,
                playerIds: [currentUser.uid], // Host joins automatically
                status: 'open',
                createdAt: Date.now()
            };

            await createGameSession(session);
            onCreated();
        } catch (err) {
            console.error(err);
            alert("Failed to create session.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto bg-gray-800 rounded-xl p-6 border border-gray-700 animate-fade-in">
            <h2 className="text-2xl font-bold text-white mb-6">Create Social Game</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
                
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Title</label>
                    <input 
                        required
                        className="w-full bg-gray-900 text-white p-3 rounded-lg border border-gray-600 focus:border-green-500 outline-none"
                        placeholder="e.g. Saturday Morning Smash"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Date</label>
                        <input 
                            type="date"
                            required
                            className="w-full bg-gray-900 text-white p-3 rounded-lg border border-gray-600 focus:border-green-500 outline-none"
                            value={date}
                            onChange={e => setDate(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Time</label>
                        <input 
                            type="time"
                            required
                            className="w-full bg-gray-900 text-white p-3 rounded-lg border border-gray-600 focus:border-green-500 outline-none"
                            value={time}
                            onChange={e => setTime(e.target.value)}
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Location / Venue</label>
                    <input 
                        required
                        className="w-full bg-gray-900 text-white p-3 rounded-lg border border-gray-600 focus:border-green-500 outline-none"
                        placeholder="e.g. Central Park Courts"
                        value={location}
                        onChange={e => setLocation(e.target.value)}
                    />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Duration (mins)</label>
                        <input 
                            type="number"
                            className="w-full bg-gray-900 text-white p-3 rounded-lg border border-gray-600 focus:border-green-500 outline-none"
                            value={duration}
                            onChange={e => setDuration(parseInt(e.target.value))}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Courts</label>
                        <input 
                            type="number"
                            min="1"
                            className="w-full bg-gray-900 text-white p-3 rounded-lg border border-gray-600 focus:border-green-500 outline-none"
                            value={courtCount}
                            onChange={e => setCourtCount(parseInt(e.target.value))}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Max Players</label>
                        <input 
                            type="number"
                            min="2"
                            className="w-full bg-gray-900 text-white p-3 rounded-lg border border-gray-600 focus:border-green-500 outline-none"
                            value={maxPlayers}
                            onChange={e => setMaxPlayers(parseInt(e.target.value))}
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Skill Range (DUPR) <span className="text-gray-500 text-xs">(Optional)</span></label>
                    <div className="flex gap-4 items-center">
                        <input 
                            type="number" step="0.1"
                            className="w-24 bg-gray-900 text-white p-3 rounded-lg border border-gray-600 focus:border-green-500 outline-none"
                            placeholder="Min"
                            value={minRating}
                            onChange={e => setMinRating(e.target.value)}
                        />
                        <span className="text-gray-400">to</span>
                        <input 
                            type="number" step="0.1"
                            className="w-24 bg-gray-900 text-white p-3 rounded-lg border border-gray-600 focus:border-green-500 outline-none"
                            placeholder="Max"
                            value={maxRating}
                            onChange={e => setMaxRating(e.target.value)}
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Description / Notes</label>
                    <textarea 
                        className="w-full bg-gray-900 text-white p-3 rounded-lg border border-gray-600 focus:border-green-500 outline-none h-24"
                        placeholder="Format, ball type, or other details..."
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                    />
                </div>

                <div className="flex gap-4 pt-4">
                    <button 
                        type="button" 
                        onClick={onCancel}
                        className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg font-bold"
                    >
                        Cancel
                    </button>
                    <button 
                        type="submit" 
                        disabled={isSubmitting}
                        className="flex-1 bg-green-600 hover:bg-green-500 text-white py-3 rounded-lg font-bold shadow-lg"
                    >
                        {isSubmitting ? 'Creating...' : 'Create Game'}
                    </button>
                </div>
            </form>
        </div>
    );
};

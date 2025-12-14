
import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { createMeetup } from '../../services/firebase';
import type { Meetup } from '../../types';

interface CreateMeetupProps {
    onBack: () => void;
    onCreated: () => void;
}

export const CreateMeetup: React.FC<CreateMeetupProps> = ({ onBack, onCreated }) => {
    const { currentUser } = useAuth();
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [maxPlayers, setMaxPlayers] = useState('');
    const [locationName, setLocationName] = useState('');
    const [lat, setLat] = useState('');
    const [lng, setLng] = useState('');
    const [visibility, setVisibility] = useState<'public'|'linkOnly'>('public');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser) return;

        setIsSubmitting(true);
        try {
            // Combine date + time to epoch
            const when = new Date(`${date}T${time}`).getTime();
            if (isNaN(when)) {
                alert("Invalid date/time");
                setIsSubmitting(false);
                return;
            }

            const meetupData: Omit<Meetup, "id"|"createdAt"|"updatedAt"> = {
                title,
                description,
                when,
                visibility,
                maxPlayers: maxPlayers ? parseInt(maxPlayers, 10) : 0,
                locationName,
                location: (lat && lng) ? { lat: parseFloat(lat), lng: parseFloat(lng) } : undefined,
                createdByUserId: currentUser.uid,
            };

            await createMeetup(meetupData);
            onCreated();
        } catch (error) {
            console.error(error);
            alert("Failed to create meetup");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto p-4">
            <button onClick={onBack} className="text-gray-400 hover:text-white mb-4 flex items-center gap-1">
                ← Back
            </button>
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <h2 className="text-2xl font-bold text-white mb-6">Create New Meetup</h2>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Title</label>
                        <input 
                            required
                            className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                            placeholder="e.g. Saturday Smash"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Date</label>
                            <input 
                                type="date"
                                required
                                className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                                value={date}
                                onChange={e => setDate(e.target.value)}
                                style={{ colorScheme: 'dark' }}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Time</label>
                            <input 
                                type="time"
                                required
                                className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                                value={time}
                                onChange={e => setTime(e.target.value)}
                                style={{ colorScheme: 'dark' }}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Location Name</label>
                        <input 
                            required
                            className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                            placeholder="e.g. Central Park Courts"
                            value={locationName}
                            onChange={e => setLocationName(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Lat (Optional)</label>
                            <input 
                                type="number" step="any"
                                className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                                placeholder="Latitude"
                                value={lat}
                                onChange={e => setLat(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Lng (Optional)</label>
                            <input 
                                type="number" step="any"
                                className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                                placeholder="Longitude"
                                value={lng}
                                onChange={e => setLng(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Max Players</label>
                            <input 
                                type="number"
                                className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                                placeholder="Unlimited"
                                value={maxPlayers}
                                onChange={e => setMaxPlayers(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Visibility</label>
                            <select
                                className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                                value={visibility}
                                onChange={e => setVisibility(e.target.value as any)}
                            >
                                <option value="public">Public</option>
                                <option value="linkOnly">Link Only</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Description</label>
                        <textarea 
                            className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none h-24"
                            placeholder="Details about level, format, etc."
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                        />
                    </div>

                    <div className="pt-4 flex justify-end">
                        <button 
                            type="submit" 
                            disabled={isSubmitting}
                            className="bg-green-600 hover:bg-green-500 text-white px-8 py-3 rounded font-bold shadow-lg disabled:opacity-50"
                        >
                            {isSubmitting ? 'Creating...' : 'Create Meetup'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

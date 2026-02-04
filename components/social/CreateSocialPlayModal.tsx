
import React, { useState } from 'react';
import type { SocialEvent } from '../../types';
import { createSocialEvent } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { ModalShell } from '../shared/ModalShell';

interface CreateSocialPlayModalProps {
    onClose: () => void;
    onCreated: () => void;
}

export const CreateSocialPlayModal: React.FC<CreateSocialPlayModalProps> = ({ onClose, onCreated }) => {
    const { currentUser, userProfile } = useAuth();
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [location, setLocation] = useState('');
    const [date, setDate] = useState('');
    const [startTime, setStartTime] = useState('');
    const [maxPlayers, setMaxPlayers] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser) return;

        setIsSubmitting(true);
        try {
            const event: Omit<SocialEvent, 'id'> = {
                hostUserId: currentUser.uid,
                hostName: userProfile?.displayName || 'Host',
                title,
                description,
                date,
                startTime,
                location,
                maxPlayers: maxPlayers ? parseInt(maxPlayers, 10) : 0,
                attendees: [currentUser.uid], // Host automatically attends
                createdAt: Date.now()
            };
            await createSocialEvent(event);
            onCreated();
        } catch (error) {
            console.error(error);
            alert("Failed to create event");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <ModalShell isOpen={true} onClose={onClose} maxWidth="max-w-lg" className="flex flex-col max-h-[90dvh]">
                <div className="p-6 border-b border-gray-700 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white">Host Social Play</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl">&times;</button>
                </div>
                
                <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Title</label>
                        <input 
                            required
                            className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                            placeholder="e.g. Sunday Morning Drill & Play"
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
                            <label className="block text-sm font-medium text-gray-400 mb-1">Start Time</label>
                            <input 
                                type="time"
                                required
                                className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                                value={startTime}
                                onChange={e => setStartTime(e.target.value)}
                                style={{ colorScheme: 'dark' }}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Location</label>
                        <input 
                            required
                            className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                            placeholder="e.g. Community Courts"
                            value={location}
                            onChange={e => setLocation(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Max Players (Optional)</label>
                        <input 
                            type="number"
                            className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                            placeholder="Leave blank for unlimited"
                            value={maxPlayers}
                            onChange={e => setMaxPlayers(e.target.value)}
                        />
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

                    <div className="pt-4 flex justify-end gap-3">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white">Cancel</button>
                        <button 
                            type="submit" 
                            disabled={isSubmitting}
                            className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded font-bold disabled:opacity-50"
                        >
                            {isSubmitting ? 'Creating...' : 'Create Event'}
                        </button>
                    </div>
                </form>
        </ModalShell>
    );
};

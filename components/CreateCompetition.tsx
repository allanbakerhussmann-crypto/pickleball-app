
import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { createCompetition } from '../services/firebase';
import type { Competition, CompetitionType } from '../types';

interface CreateCompetitionProps {
    onCancel: () => void;
    onCreate: () => void;
}

export const CreateCompetition: React.FC<CreateCompetitionProps> = ({ onCancel, onCreate }) => {
    const { currentUser } = useAuth();
    const [name, setName] = useState('');
    const [type, setType] = useState<CompetitionType>('league');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    
    // Points settings
    const [winPoints, setWinPoints] = useState(3);
    const [drawPoints, setDrawPoints] = useState(1);
    const [lossPoints, setLossPoints] = useState(0);

    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser) return;
        
        setIsSubmitting(true);
        try {
            const comp: Competition = {
                id: `comp_${Date.now()}`,
                type,
                name,
                organiserId: currentUser.uid,
                startDate,
                endDate,
                status: 'draft',
                settings: {
                    points: { win: winPoints, draw: drawPoints, loss: lossPoints },
                    tieBreaker: 'point_diff'
                }
            };
            await createCompetition(comp);
            onCreate();
        } catch (error) {
            console.error(error);
            alert("Failed to create competition.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto bg-gray-800 rounded-lg p-8 border border-gray-700 mt-8">
            <h2 className="text-2xl font-bold text-white mb-6">Create New Competition</h2>
            
            <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Competition Name</label>
                    <input 
                        required
                        className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="e.g. Winter League 2024"
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Type</label>
                        <select 
                            className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                            value={type}
                            onChange={e => setType(e.target.value as CompetitionType)}
                        >
                            <option value="league">Singles/Doubles League</option>
                            <option value="team_league">Team League</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Status</label>
                        <input disabled value="Draft" className="w-full bg-gray-900/50 text-gray-500 p-3 rounded border border-gray-700 cursor-not-allowed" />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">Start Date</label>
                        <input 
                            type="date" 
                            required
                            className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">End Date</label>
                        <input 
                            type="date" 
                            required
                            className="w-full bg-gray-900 text-white p-3 rounded border border-gray-600 focus:border-green-500 outline-none"
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                        />
                    </div>
                </div>

                <div className="bg-gray-900 p-4 rounded border border-gray-700">
                    <h3 className="text-white font-bold mb-3 text-sm">League Points Settings</h3>
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Win</label>
                            <input 
                                type="number" 
                                className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600"
                                value={winPoints}
                                onChange={e => setWinPoints(Number(e.target.value))}
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Draw</label>
                            <input 
                                type="number" 
                                className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600"
                                value={drawPoints}
                                onChange={e => setDrawPoints(Number(e.target.value))}
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-400 mb-1">Loss</label>
                            <input 
                                type="number" 
                                className="w-full bg-gray-800 text-white p-2 rounded border border-gray-600"
                                value={lossPoints}
                                onChange={e => setLossPoints(Number(e.target.value))}
                            />
                        </div>
                    </div>
                </div>

                <div className="flex justify-between pt-4 border-t border-gray-700">
                    <button type="button" onClick={onCancel} className="text-gray-400 hover:text-white px-4 py-2">Cancel</button>
                    <button 
                        type="submit" 
                        disabled={isSubmitting}
                        className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded font-bold shadow-lg disabled:opacity-50"
                    >
                        {isSubmitting ? 'Creating...' : 'Create Competition'}
                    </button>
                </div>
            </form>
        </div>
    );
};

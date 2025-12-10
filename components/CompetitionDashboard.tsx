
import React, { useState, useEffect } from 'react';
import { subscribeToCompetitions } from '../services/firebase';
import type { Competition, CompetitionType } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface CompetitionDashboardProps {
    type: CompetitionType;
    onCreateClick: () => void;
    onSelect: (id: string) => void;
}

export const CompetitionDashboard: React.FC<CompetitionDashboardProps> = ({ type, onCreateClick, onSelect }) => {
    const { isOrganizer } = useAuth();
    const [competitions, setCompetitions] = useState<Competition[]>([]);
    
    useEffect(() => {
        const unsub = subscribeToCompetitions((all) => {
            // Filter locally for simplicity (can fetch by query too)
            setCompetitions(all.filter(c => c.type === type));
        });
        return () => unsub();
    }, [type]);

    return (
        <div className="max-w-6xl mx-auto p-4 animate-fade-in">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-white capitalize">{type.replace('_', ' ')}s</h1>
                {isOrganizer && (
                    <button 
                        onClick={onCreateClick}
                        className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded font-bold shadow-lg"
                    >
                        + Create New
                    </button>
                )}
            </div>

            <div className="grid gap-4">
                {competitions.length === 0 ? (
                    <div className="text-center text-gray-500 py-10 bg-gray-800 rounded border border-gray-700">
                        No active competitions found.
                    </div>
                ) : (
                    competitions.map(c => (
                        <div 
                            key={c.id} 
                            onClick={() => onSelect(c.id)}
                            className="bg-gray-800 p-4 rounded border border-gray-700 hover:border-green-500 cursor-pointer flex justify-between items-center group transition-colors"
                        >
                            <div>
                                <h3 className="text-lg font-bold text-white group-hover:text-green-400">{c.name}</h3>
                                <div className="text-sm text-gray-400 mt-1">
                                    {c.startDate} to {c.endDate}
                                </div>
                            </div>
                            <span className={`px-3 py-1 rounded text-xs font-bold uppercase ${
                                c.status === 'in_progress' ? 'bg-green-900 text-green-300' :
                                c.status === 'completed' ? 'bg-blue-900 text-blue-300' :
                                'bg-gray-700 text-gray-300'
                            }`}>
                                {c.status.replace('_', ' ')}
                            </span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

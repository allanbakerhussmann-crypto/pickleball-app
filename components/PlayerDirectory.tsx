
import React, { useEffect, useState } from 'react';
import { getAllUsers, getAllTournaments, getAllRegistrations } from '../services/firebase';
import type { UserProfile, Tournament, Registration } from '../types';

interface PlayerDirectoryProps {
    onBack: () => void;
}

export const PlayerDirectory: React.FC<PlayerDirectoryProps> = ({ onBack }) => {
    const [activeTab, setActiveTab] = useState<'users' | 'tournaments'>('users');
    const [data, setData] = useState<any[]>([]);
    
    useEffect(() => {
        if (activeTab === 'users') getAllUsers().then(setData);
        else getAllTournaments().then(setData);
    }, [activeTab]);

    return (
        <div className="max-w-6xl mx-auto">
            <button onClick={onBack} className="text-gray-400 mb-4">Back</button>
            <div className="flex gap-4 mb-4">
                <button onClick={() => setActiveTab('users')} className={`px-4 py-2 rounded ${activeTab === 'users' ? 'bg-green-600' : 'bg-gray-700'}`}>Users</button>
                <button onClick={() => setActiveTab('tournaments')} className={`px-4 py-2 rounded ${activeTab === 'tournaments' ? 'bg-green-600' : 'bg-gray-700'}`}>Tournaments</button>
            </div>
            <div className="bg-gray-900 p-4 rounded border border-gray-700 h-[600px] overflow-auto">
                <pre className="text-xs text-green-400 font-mono">{JSON.stringify(data, null, 2)}</pre>
            </div>
        </div>
    );
};

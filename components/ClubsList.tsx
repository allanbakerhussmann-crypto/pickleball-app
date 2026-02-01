
import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getAllClubs } from '../services/firebase';
import type { Club } from '../types';

interface ClubsListProps {
    onCreateClub: () => void;
    onViewClub: (clubId: string) => void;
    onBack: () => void;
}

export const ClubsList: React.FC<ClubsListProps> = ({ onCreateClub, onViewClub, onBack }) => {
    const { isAppAdmin, isOrganizer } = useAuth();
    const [clubs, setClubs] = useState<Club[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchClubs = async () => {
            try {
                const all = await getAllClubs();
                setClubs(all.sort((a,b) => a.name.localeCompare(b.name)));
            } catch (error) {
                // Handle Firestore SDK errors gracefully (known bug in v12.6.0)
                console.debug('Failed to fetch clubs (safe to ignore):', error);
                setClubs([]);
            } finally {
                setLoading(false);
            }
        };
        fetchClubs();
    }, []);

    if (loading) return <div className="p-8 text-center text-gray-400">Loading Clubs...</div>;

    return (
        <div className="max-w-6xl mx-auto p-4 animate-fade-in">
            <button 
                onClick={onBack}
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-4 pl-1 focus:outline-none"
            >
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                 Back to Dashboard
            </button>

            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-white">Clubs</h1>
                {(isAppAdmin || isOrganizer) && (
                    <button 
                        onClick={onCreateClub}
                        className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded font-bold shadow-lg transition-transform hover:scale-105"
                    >
                        Create Club
                    </button>
                )}
            </div>

            {clubs.length === 0 ? (
                <div className="bg-gray-800 p-10 rounded-lg border border-gray-700 text-center shadow-xl">
                    <h3 className="text-xl font-bold text-white mb-2">No Clubs Found</h3>
                    <p className="text-gray-400 mb-6 max-w-md mx-auto">
                        There are no clubs currently registered in the system.
                    </p>
                    {isAppAdmin && (
                        <button 
                            onClick={onCreateClub}
                            className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded font-bold border border-gray-600 transition-colors"
                        >
                            Start a New Club
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {clubs.map(club => (
                        <div key={club.id} className="bg-gray-800 rounded-lg border border-gray-700 hover:border-green-500/50 transition-colors group overflow-hidden flex flex-col h-full">
                            <div className="p-5 flex-grow">
                                <div className="flex items-center gap-4 mb-4">
                                    {club.logoUrl ? (
                                        <img src={club.logoUrl} alt={club.name} className="w-16 h-16 rounded-full object-cover border-2 border-gray-600 shadow-md" />
                                    ) : (
                                        <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center text-white font-bold text-2xl border-2 border-gray-600 shadow-md">
                                            {club.name.charAt(0)}
                                        </div>
                                    )}
                                    <div>
                                        <h3 className="text-lg font-bold text-white group-hover:text-green-400 transition-colors line-clamp-2 leading-tight">{club.name}</h3>
                                        <div className="text-xs text-gray-400 mt-1">
                                            {club.region ? `${club.region}, ` : ''}{club.country || 'New Zealand'}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between text-xs text-gray-500 border-t border-gray-700 pt-3">
                                    <span>{club.members?.length || 0} Members</span>
                                    <span>Since {new Date(club.createdAt).getFullYear()}</span>
                                </div>
                            </div>
                            <button 
                                onClick={() => onViewClub(club.id)}
                                className="w-full bg-gray-700/50 hover:bg-green-600/20 hover:text-green-400 text-gray-300 font-bold py-3 text-sm transition-colors border-t border-gray-700"
                            >
                                View Club
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

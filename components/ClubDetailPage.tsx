
import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
    subscribeToClub, 
    subscribeToClubRequests, 
    subscribeToMyClubJoinRequest,
    requestJoinClub, 
    approveClubJoinRequest, 
    declineClubJoinRequest, 
    getAllUsers 
} from '../services/firebase';
import type { Club, ClubJoinRequest, UserProfile } from '../types';
import { BulkClubImport } from './BulkClubImport';

interface ClubDetailPageProps {
    clubId: string;
    onBack: () => void;
}

export const ClubDetailPage: React.FC<ClubDetailPageProps> = ({ clubId, onBack }) => {
    const { currentUser, isAppAdmin } = useAuth();
    const [club, setClub] = useState<Club | null>(null);
    const [requests, setRequests] = useState<ClubJoinRequest[]>([]);
    const [requestUsers, setRequestUsers] = useState<Record<string, UserProfile>>({});
    const [pendingJoin, setPendingJoin] = useState(false);
    const [hasPendingRequest, setHasPendingRequest] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);

    useEffect(() => {
        const unsub = subscribeToClub(clubId, (data) => {
            setClub(data);
        });
        return () => unsub();
    }, [clubId]);

    // Track my pending request
    useEffect(() => {
        if (currentUser && clubId) {
            const unsub = subscribeToMyClubJoinRequest(clubId, currentUser.uid, setHasPendingRequest);
            return () => unsub();
        }
    }, [clubId, currentUser]);

    // Admin Logic
    const isAdmin = club && currentUser && (club.admins.includes(currentUser.uid) || isAppAdmin);
    const isMember = club && currentUser && club.members.includes(currentUser.uid);

    useEffect(() => {
        if (isAdmin) {
            const unsubReq = subscribeToClubRequests(clubId, async (reqs) => {
                setRequests(reqs);
                // Fetch user profiles for requests
                if (reqs.length > 0) {
                    const allUsers = await getAllUsers(); // Optimization: use getUsersByIds
                    const userMap: Record<string, UserProfile> = {};
                    allUsers.forEach(u => userMap[u.id] = u);
                    setRequestUsers(userMap);
                }
            });
            return () => unsubReq();
        }
    }, [clubId, isAdmin]);

    const handleJoinRequest = async () => {
        if (!currentUser || !club) return;
        setPendingJoin(true);
        try {
            await requestJoinClub(clubId, currentUser.uid);
            // Optimistic update to immediately show "Awaiting Confirmation" 
            // without waiting for the database subscription roundtrip
            setHasPendingRequest(true); 
        } catch (e) {
            console.error(e);
            alert("Failed to send request.");
        } finally {
            setPendingJoin(false);
        }
    };

    if (!club) return <div className="p-10 text-center">Loading Club...</div>;

    return (
        <div className="max-w-6xl mx-auto p-4 animate-fade-in relative">
            {isImportModalOpen && (
                <BulkClubImport 
                    clubId={clubId} 
                    onClose={() => setIsImportModalOpen(false)} 
                    onComplete={() => setIsImportModalOpen(false)} 
                />
            )}

            <button onClick={onBack} className="text-gray-400 hover:text-white mb-6">← Back to Clubs</button>
            
            {/* Header */}
            <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 shadow-xl mb-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4">
                    {isAdmin ? (
                        <span className="bg-red-900/30 text-red-400 px-3 py-1 rounded-full text-xs font-bold uppercase border border-red-900/50">Admin View</span>
                    ) : isMember ? (
                        <span className="bg-green-900/30 text-green-400 px-3 py-1 rounded-full text-xs font-bold uppercase border border-green-900/50">Member</span>
                    ) : hasPendingRequest ? (
                         <div className="bg-yellow-900/30 text-yellow-400 px-5 py-2 rounded font-bold border border-yellow-900/50 shadow-lg flex items-center gap-2 cursor-default select-none animate-pulse">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <span>Awaiting Confirmation</span>
                         </div>
                    ) : (
                        <button 
                            onClick={handleJoinRequest}
                            disabled={pendingJoin}
                            className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded font-bold shadow-lg transition-colors flex items-center gap-2 disabled:bg-green-800 disabled:text-gray-300"
                        >
                             {pendingJoin ? (
                                <>
                                    <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    <span>Sending...</span>
                                </>
                             ) : (
                                <span>Request to Join</span>
                             )}
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-6">
                    {club.logoUrl ? (
                        <img src={club.logoUrl} className="w-24 h-24 rounded-full border-4 border-gray-700 shadow-lg" alt="Logo" />
                    ) : (
                        <div className="w-24 h-24 rounded-full bg-gray-700 flex items-center justify-center text-4xl font-bold text-gray-500">
                            {club.name.charAt(0)}
                        </div>
                    )}
                    <div>
                        <h1 className="text-4xl font-black text-white mb-2">{club.name}</h1>
                        <div className="flex gap-4 text-sm text-gray-400">
                            <span>{club.region}, {club.country}</span>
                            <span>•</span>
                            <span>{club.members.length} Members</span>
                        </div>
                    </div>
                </div>
                {club.description && <p className="mt-6 text-gray-300 max-w-2xl">{club.description}</p>}
                
                {isAdmin && (
                    <div className="mt-6 pt-6 border-t border-gray-700 flex gap-4">
                         <button 
                            onClick={() => setIsImportModalOpen(true)}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-bold text-sm shadow flex items-center gap-2"
                         >
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                             Bulk Import Members
                         </button>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Main Content: Members (Future: Tournaments List) */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                        <h2 className="text-xl font-bold text-white mb-4">Tournaments</h2>
                        <p className="text-gray-500 italic">No upcoming tournaments listed.</p>
                    </div>
                </div>

                {/* Sidebar: Requests */}
                {isAdmin && (
                    <div className="space-y-6">
                        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                                Membership Requests
                                {requests.length > 0 && <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{requests.length}</span>}
                            </h2>
                            
                            {requests.length === 0 ? (
                                <p className="text-gray-500 text-sm">No pending requests.</p>
                            ) : (
                                <div className="space-y-3">
                                    {requests.map(req => {
                                        const user = requestUsers[req.userId];
                                        return (
                                            <div key={req.id} className="bg-gray-900 p-3 rounded border border-gray-700">
                                                <div className="font-bold text-white mb-1">{user?.displayName || 'Unknown User'}</div>
                                                <div className="text-xs text-gray-500 mb-2">{user?.email}</div>
                                                <div className="flex gap-2">
                                                    <button 
                                                        onClick={() => approveClubJoinRequest(clubId, req.id, req.userId)}
                                                        className="flex-1 bg-green-600 hover:bg-green-500 text-white text-xs font-bold py-1.5 rounded"
                                                    >
                                                        Approve
                                                    </button>
                                                    <button 
                                                        onClick={() => declineClubJoinRequest(clubId, req.id)}
                                                        className="flex-1 bg-red-900/50 hover:bg-red-900 text-red-300 text-xs font-bold py-1.5 rounded border border-red-900"
                                                    >
                                                        Decline
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

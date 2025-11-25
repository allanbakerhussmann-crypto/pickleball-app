


import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { subscribeToUserPartnerInvites, respondToPartnerInvite, getAllTournaments, getAllUsers, getUsersByIds, ensureRegistrationForUser } from '../services/firebase';
import type { PartnerInvite, Tournament, Division, UserProfile } from '../types';

interface PartnerInvitesProps {
    onAcceptInvite?: (tournamentId: string, divisionId: string) => void;
}

export const PartnerInvites: React.FC<PartnerInvitesProps> = ({ onAcceptInvite }) => {
    const { currentUser } = useAuth();
    const [invites, setInvites] = useState<PartnerInvite[]>([]);
    const [tournaments, setTournaments] = useState<Record<string, Tournament>>({});
    const [inviters, setInviters] = useState<Record<string, UserProfile>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!currentUser) return;

        // 1. Subscribe to invites
        const unsub = subscribeToUserPartnerInvites(currentUser.uid, (newInvites) => {
            setInvites(newInvites);
            setLoading(false);
        });

        return () => unsub();
    }, [currentUser]);

    // 2. Fetch metadata (Tournaments & Users) when invites change
    useEffect(() => {
        if (invites.length === 0) return;

        const loadMetadata = async () => {
            // Unique IDs
            const tIds = Array.from(new Set(invites.map(i => i.tournamentId))) as string[];
            const uIds = Array.from(new Set(invites.map(i => i.inviterId))) as string[];

            // Fetch Tournaments (Only need names really, but getAll for now or batch get if we had it)
            // Ideally we'd have getTournamentsByIds, but we can just fetch all tournaments as a cache
            const allTournaments = await getAllTournaments(100);
            const tMap: Record<string, Tournament> = {};
            allTournaments.forEach(t => tMap[t.id] = t);
            
            // Fetch Users
            const users = await getUsersByIds(uIds);
            const uMap: Record<string, UserProfile> = {};
            users.forEach(u => uMap[u.id] = u);

            setTournaments(tMap);
            setInviters(uMap);
        };

        loadMetadata();
    }, [invites]);

    const handleRespond = async (invite: PartnerInvite, response: 'accepted' | 'declined') => {
        try {
            const result = await respondToPartnerInvite(invite, response);
            if (response === 'accepted' && result && currentUser && onAcceptInvite) {
                // Ensure registration exists
                await ensureRegistrationForUser(result.tournamentId, currentUser.uid, result.divisionId);
                // Trigger navigation to wizard
                onAcceptInvite(result.tournamentId, result.divisionId);
            }
        } catch (error) {
            console.error("Failed to respond to invite", error);
            alert("Failed to process response. Please try again.");
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-500">Loading invites...</div>;

    return (
        <div className="max-w-4xl mx-auto p-4 animate-fade-in">
            <h1 className="text-3xl font-bold text-white mb-6">Partner Invites</h1>
            
            {invites.length === 0 ? (
                <div className="bg-gray-800 p-8 rounded-lg border border-gray-700 text-center">
                    <div className="text-gray-500 mb-2">
                        <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    </div>
                    <h3 className="text-xl font-bold text-white">No Pending Invites</h3>
                    <p className="text-gray-400 mt-2">When someone invites you to be their partner, it will show up here.</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {invites.map(invite => {
                        const tournament = tournaments[invite.tournamentId];
                        const inviter = inviters[invite.inviterId];
                        
                        return (
                            <div key={invite.id} className="bg-gray-800 p-6 rounded-lg border border-gray-700 shadow-lg flex flex-col md:flex-row justify-between items-center gap-4">
                                <div>
                                    <div className="text-xs font-bold text-green-400 uppercase tracking-wider mb-1">
                                        Partner Request
                                    </div>
                                    <h3 className="text-xl font-bold text-white">
                                        {inviter?.displayName || 'Unknown Player'}
                                    </h3>
                                    <p className="text-gray-300">
                                        wants to team up for <span className="font-bold text-white">{tournament?.name || 'Unknown Tournament'}</span>
                                    </p>
                                    <p className="text-sm text-gray-500 mt-1">
                                        Sent: {new Date(invite.createdAt).toLocaleDateString()}
                                    </p>
                                </div>
                                <div className="flex gap-3">
                                    <button 
                                        onClick={() => handleRespond(invite, 'declined')}
                                        className="px-4 py-2 rounded border border-red-500/50 text-red-400 hover:bg-red-900/20 font-bold transition-colors"
                                    >
                                        Decline
                                    </button>
                                    <button 
                                        onClick={() => handleRespond(invite, 'accepted')}
                                        className="px-6 py-2 rounded bg-green-600 hover:bg-green-500 text-white font-bold shadow-lg shadow-green-900/20 transition-all transform hover:scale-105"
                                    >
                                        Accept & Join
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

/**
 * ClubDetailPage Component
 * 
 * Shows club details, members, tournaments, and court booking
 * 
 * FILE LOCATION: components/ClubDetailPage.tsx
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
    subscribeToClub, 
    subscribeToClubRequests, 
    subscribeToMyClubJoinRequest,
    requestJoinClub, 
    approveClubJoinRequest, 
    declineClubJoinRequest, 
    getAllUsers,
    getClubBookingSettings,
    getUsersByIds,
} from '../services/firebase';
import type { Club, ClubJoinRequest, UserProfile, ClubBookingSettings } from '../types';
import { BulkClubImport } from './BulkClubImport';
import { CourtBookingCalendar } from './clubs/CourtBookingCalendar';
import { ManageCourts } from './clubs/ManageCourts';

interface ClubDetailPageProps {
    clubId: string;
    onBack: () => void;
}

export const ClubDetailPage: React.FC<ClubDetailPageProps> = ({ clubId, onBack }) => {
    const { currentUser, isAppAdmin } = useAuth();
    const [club, setClub] = useState<Club | null>(null);
    const [requests, setRequests] = useState<ClubJoinRequest[]>([]);
    const [requestUsers, setRequestUsers] = useState<Record<string, UserProfile>>({});
    const [memberProfiles, setMemberProfiles] = useState<Record<string, UserProfile>>({});
    const [pendingJoin, setPendingJoin] = useState(false);
    const [hasPendingRequest, setHasPendingRequest] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [processingRequest, setProcessingRequest] = useState<string | null>(null);
    const [loadingMembers, setLoadingMembers] = useState(false);
    
    // Tab and court booking state
    const [activeTab, setActiveTab] = useState<'overview' | 'members' | 'courts'>('overview');
    const [showCourtCalendar, setShowCourtCalendar] = useState(false);
    const [showManageCourts, setShowManageCourts] = useState(false);
    const [bookingSettings, setBookingSettings] = useState<ClubBookingSettings | null>(null);

    // Function to load booking settings - can be called multiple times
    const loadBookingSettings = useCallback(async () => {
        try {
            console.log('Loading booking settings for club:', clubId);
            const settings = await getClubBookingSettings(clubId);
            console.log('Loaded booking settings:', settings);
            console.log('Settings enabled:', settings?.enabled);
            setBookingSettings(settings);
        } catch (e) {
            console.error('Error loading booking settings:', e);
        }
    }, [clubId]);

    useEffect(() => {
        const unsub = subscribeToClub(clubId, (data) => {
            setClub(data);
        });
        return () => unsub();
    }, [clubId]);

    // Load member profiles when club changes
    useEffect(() => {
        const loadMemberProfiles = async () => {
            if (!club?.members || club.members.length === 0) {
                setMemberProfiles({});
                return;
            }
            
            setLoadingMembers(true);
            try {
                let profiles: UserProfile[] = [];
                
                if (typeof getUsersByIds === 'function') {
                    profiles = await getUsersByIds(club.members);
                } else {
                    const allUsers = await getAllUsers();
                    profiles = allUsers.filter(u => club.members.includes(u.id));
                }
                
                const profileMap: Record<string, UserProfile> = {};
                profiles.forEach(p => {
                    profileMap[p.id] = p;
                });
                setMemberProfiles(profileMap);
            } catch (e) {
                console.error('Error loading member profiles:', e);
            } finally {
                setLoadingMembers(false);
            }
        };
        
        loadMemberProfiles();
    }, [club?.members]);

    // Load booking settings on mount
    useEffect(() => {
        loadBookingSettings();
    }, [loadBookingSettings]);

    // Track my pending request
    useEffect(() => {
        if (currentUser && clubId) {
            const unsub = subscribeToMyClubJoinRequest(clubId, currentUser.uid, setHasPendingRequest);
            return () => unsub();
        }
    }, [clubId, currentUser]);

    // Admin Logic
    const isAdmin = club && currentUser && (club.admins?.includes(currentUser.uid) || isAppAdmin);
    const isMember = club && currentUser && club.members?.includes(currentUser.uid);

    useEffect(() => {
        if (isAdmin) {
            const unsubReq = subscribeToClubRequests(clubId, async (reqs) => {
                setRequests(reqs);
                if (reqs.length > 0) {
                    const allUsers = await getAllUsers();
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
            setHasPendingRequest(true); 
        } catch (e) {
            console.error(e);
            alert("Failed to send request.");
        } finally {
            setPendingJoin(false);
        }
    };

    const handleApprove = async (requestId: string, userId: string) => {
        setProcessingRequest(requestId);
        try {
            await approveClubJoinRequest(clubId, requestId, userId);
        } catch (e) {
            console.error(e);
            alert("Failed to approve request.");
        } finally {
            setProcessingRequest(null);
        }
    };

    const handleDecline = async (requestId: string) => {
        setProcessingRequest(requestId);
        try {
            await declineClubJoinRequest(clubId, requestId);
        } catch (e) {
            console.error(e);
            alert("Failed to decline request.");
        } finally {
            setProcessingRequest(null);
        }
    };

    // Handle returning from ManageCourts - reload settings!
    const handleBackFromManageCourts = () => {
        console.log('Returning from ManageCourts, reloading settings...');
        setShowManageCourts(false);
        // Reload booking settings to reflect any changes
        loadBookingSettings();
    };

    // Show Court Calendar full screen
    if (showCourtCalendar) {
        return (
            <CourtBookingCalendar
                clubId={clubId}
                isAdmin={!!isAdmin}
                isMember={!!isMember}
                onBack={() => setShowCourtCalendar(false)}
            />
        );
    }

    // Show Manage Courts full screen
    if (showManageCourts) {
        return (
            <ManageCourts
                clubId={clubId}
                onBack={handleBackFromManageCourts}
            />
        );
    }

    if (!club) return <div className="p-10 text-center">Loading Club...</div>;

    // Helper to get gender icon
    const getGenderIcon = (gender?: string) => {
        if (gender === 'male') return <span className="text-blue-400">♂</span>;
        if (gender === 'female') return <span className="text-pink-400">♀</span>;
        return null;
    };

    // Helper to format DUPR rating
    const formatDupr = (singles?: number, doubles?: number) => {
        if (!singles && !doubles) return null;
        const s = singles ? singles.toFixed(2) : '--';
        const d = doubles ? doubles.toFixed(2) : '--';
        return `${s} / ${d}`;
    };

    return (
        <div className="max-w-6xl mx-auto p-4 animate-fade-in relative">
            {isImportModalOpen && (
                <BulkClubImport 
                    clubId={clubId} 
                    onClose={() => setIsImportModalOpen(false)} 
                    onComplete={() => setIsImportModalOpen(false)} 
                />
            )}

            <button onClick={onBack} className="text-gray-400 hover:text-white mb-6 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Back to Clubs
            </button>
            
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
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    Requesting...
                                </>
                             ) : (
                                <>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                                    Join Club
                                </>
                             )}
                        </button>
                    )}
                </div>
                
                <div className="flex gap-6 items-center">
                    {club.logoUrl ? (
                        <img src={club.logoUrl} alt={club.name} className="w-24 h-24 rounded-xl object-cover border border-gray-700" />
                    ) : (
                        <div className="w-24 h-24 bg-gray-700 rounded-xl flex items-center justify-center text-4xl font-bold text-gray-500">
                            {club.name.charAt(0)}
                        </div>
                    )}
                    <div>
                        <h1 className="text-3xl font-bold text-white">{club.name}</h1>
                        <p className="text-gray-400">{club.region}, {club.country} • {club.members?.length || 0} Members</p>
                    </div>
                </div>
                
                <p className="text-gray-400 mt-4">{club.description}</p>
                
                {isAdmin && (
                    <div className="mt-6 flex flex-wrap gap-3">
                        <button 
                            onClick={() => setIsImportModalOpen(true)}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-semibold"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                            Bulk Import Members
                        </button>
                        <button 
                            onClick={() => setShowManageCourts(true)}
                            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-semibold"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            Manage Courts
                        </button>
                    </div>
                )}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-6 bg-gray-800/50 p-1 rounded-lg w-fit">
                <button
                    onClick={() => setActiveTab('overview')}
                    className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
                        activeTab === 'overview'
                            ? 'bg-gray-700 text-white'
                            : 'text-gray-400 hover:text-white'
                    }`}
                >
                    Overview
                </button>
                <button
                    onClick={() => setActiveTab('members')}
                    className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors ${
                        activeTab === 'members'
                            ? 'bg-gray-700 text-white'
                            : 'text-gray-400 hover:text-white'
                    }`}
                >
                    Members
                </button>
                <button
                    onClick={() => setActiveTab('courts')}
                    className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors flex items-center gap-2 ${
                        activeTab === 'courts'
                            ? 'bg-gray-700 text-white'
                            : 'text-gray-400 hover:text-white'
                    }`}
                >
                    Courts
                    <span className="bg-green-600 text-white text-xs px-1.5 py-0.5 rounded font-bold">NEW</span>
                </button>
            </div>

            {/* Overview Tab */}
            {activeTab === 'overview' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main Content */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Tournaments */}
                        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                            <h2 className="text-xl font-bold text-white mb-4">Tournaments</h2>
                            <p className="text-gray-500 italic">No upcoming tournaments listed.</p>
                        </div>

                        {/* Court Booking Card */}
                        {bookingSettings?.enabled && (
                            <div className="bg-gradient-to-r from-green-900/30 to-blue-900/30 rounded-lg p-6 border border-green-700/50">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h2 className="text-xl font-bold text-white mb-1">Court Booking</h2>
                                        <p className="text-gray-400 text-sm">Book a court for your next game</p>
                                    </div>
                                    <button
                                        onClick={() => setShowCourtCalendar(true)}
                                        className="bg-green-600 hover:bg-green-500 text-white px-5 py-2.5 rounded-lg font-semibold flex items-center gap-2"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                        Book a Court
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Sidebar: Membership Requests */}
                    {isAdmin && (
                        <div className="space-y-6">
                            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                                <div className="bg-gray-700/50 px-4 py-3 border-b border-gray-700">
                                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                        Membership Requests
                                        {requests.length > 0 && (
                                            <span className="bg-red-500 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full">
                                                {requests.length}
                                            </span>
                                        )}
                                    </h2>
                                </div>
                                
                                <div className="p-4">
                                    {requests.length === 0 ? (
                                        <div className="text-center py-6">
                                            <svg className="w-12 h-12 text-gray-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <p className="text-gray-500 text-sm">No pending requests</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {requests.map((req) => {
                                                const user = requestUsers[req.userId];
                                                const isProcessing = processingRequest === req.id;
                                                
                                                return (
                                                    <div key={req.id} className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                                                        <div className="flex items-center gap-3 mb-3">
                                                            <div className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center text-white font-bold">
                                                                {user?.displayName?.charAt(0) || '?'}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="font-semibold text-white truncate">
                                                                    {user?.displayName || 'Unknown User'}
                                                                </div>
                                                                <div className="text-xs text-gray-500 truncate">
                                                                    {user?.email || 'No email'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => handleApprove(req.id, req.userId)}
                                                                disabled={isProcessing}
                                                                className="flex-1 bg-green-600 hover:bg-green-500 disabled:bg-green-800 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                                                            >
                                                                {isProcessing ? (
                                                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                                ) : (
                                                                    <>
                                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                                        </svg>
                                                                        Approve
                                                                    </>
                                                                )}
                                                            </button>
                                                            <button
                                                                onClick={() => handleDecline(req.id)}
                                                                disabled={isProcessing}
                                                                className="flex-1 bg-red-600 hover:bg-red-500 disabled:bg-red-800 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                                                            >
                                                                {isProcessing ? (
                                                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                                ) : (
                                                                    <>
                                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                                        </svg>
                                                                        Decline
                                                                    </>
                                                                )}
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Members Tab */}
            {activeTab === 'members' && (
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                    {/* Privacy Gate: Only members/admins can see member list */}
                    {!isMember && !isAdmin ? (
                        <div className="text-center py-12">
                            <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            <h3 className="text-xl font-bold text-white mb-2">Members Only</h3>
                            <p className="text-gray-400 mb-4">
                                Join this club to see the member directory.
                            </p>
                            {!hasPendingRequest && currentUser && (
                                <button
                                    onClick={handleJoinRequest}
                                    disabled={pendingJoin}
                                    className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg font-semibold"
                                >
                                    Request to Join
                                </button>
                            )}
                            {hasPendingRequest && (
                                <p className="text-yellow-400 text-sm">Your membership request is pending approval.</p>
                            )}
                            {!currentUser && (
                                <p className="text-gray-500 text-sm">Sign in to request membership.</p>
                            )}
                        </div>
                    ) : (
                    <>
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-bold text-white">Members ({club.members?.length || 0})</h2>
                        {loadingMembers && (
                            <div className="flex items-center gap-2 text-gray-400 text-sm">
                                <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                                Loading profiles...
                            </div>
                        )}
                    </div>
                    
                    {(!club.members || club.members.length === 0) ? (
                        <p className="text-gray-500 italic">No members yet.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-gray-700">
                                        <th className="text-left py-3 px-4 text-gray-400 font-semibold text-sm">Member</th>
                                        <th className="text-left py-3 px-4 text-gray-400 font-semibold text-sm">DUPR (S/D)</th>
                                        <th className="text-left py-3 px-4 text-gray-400 font-semibold text-sm">Gender</th>
                                        <th className="text-left py-3 px-4 text-gray-400 font-semibold text-sm">Location</th>
                                        <th className="text-left py-3 px-4 text-gray-400 font-semibold text-sm">Role</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {club.members.map((memberId) => {
                                        const profile = memberProfiles[memberId];
                                        const isAdminMember = club.admins?.includes(memberId);
                                        const dupr = formatDupr(profile?.duprSinglesRating, profile?.duprDoublesRating);
                                        
                                        return (
                                            <tr key={memberId} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                                                <td className="py-3 px-4">
                                                    <div className="flex items-center gap-3">
                                                        {profile?.photoURL || profile?.photoData ? (
                                                            <img 
                                                                src={profile.photoData || profile.photoURL} 
                                                                alt={profile.displayName} 
                                                                className="w-10 h-10 rounded-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="w-10 h-10 bg-gray-600 rounded-full flex items-center justify-center text-white font-bold">
                                                                {profile?.displayName?.charAt(0) || '?'}
                                                            </div>
                                                        )}
                                                        <div>
                                                            <div className="text-white font-medium">
                                                                {profile?.displayName || 'Unknown'}
                                                            </div>
                                                            <div className="text-xs text-gray-500">
                                                                {profile?.email || memberId.slice(0, 8) + '...'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4">
                                                    {dupr ? (
                                                        <span className="text-green-400 font-mono text-sm">{dupr}</span>
                                                    ) : (
                                                        <span className="text-gray-500">--</span>
                                                    )}
                                                </td>
                                                <td className="py-3 px-4">
                                                    {profile?.gender ? (
                                                        <span className="flex items-center gap-1">
                                                            {getGenderIcon(profile.gender)}
                                                            <span className="text-gray-300 capitalize">{profile.gender}</span>
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-500">--</span>
                                                    )}
                                                </td>
                                                <td className="py-3 px-4">
                                                    {profile?.region || profile?.country ? (
                                                        <span className="text-gray-300">
                                                            {[profile.region, profile.country].filter(Boolean).join(', ')}
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-500">--</span>
                                                    )}
                                                </td>
                                                <td className="py-3 px-4">
                                                    {isAdminMember ? (
                                                        <span className="bg-yellow-600 text-yellow-100 text-xs px-2 py-1 rounded font-semibold">
                                                            Admin
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-400 text-sm">Member</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                    </>
                    )}
                </div>
            )}

            {/* Courts Tab */}
            {activeTab === 'courts' && (
                <div className="space-y-6">
                    {bookingSettings?.enabled ? (
                        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h2 className="text-xl font-bold text-white">Court Booking</h2>
                                    <p className="text-gray-400 text-sm">View availability and book courts</p>
                                </div>
                                <button
                                    onClick={() => setShowCourtCalendar(true)}
                                    className="bg-green-600 hover:bg-green-500 text-white px-5 py-2 rounded-lg font-semibold"
                                >
                                    Open Calendar
                                </button>
                            </div>
                            
                            <div className="bg-gray-700/30 rounded-lg p-4 text-sm text-gray-400">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div>
                                        <div className="text-gray-500">Hours</div>
                                        <div className="text-white font-medium">{bookingSettings.openTime} - {bookingSettings.closeTime}</div>
                                    </div>
                                    <div>
                                        <div className="text-gray-500">Slot Duration</div>
                                        <div className="text-white font-medium">{bookingSettings.slotDurationMinutes} min</div>
                                    </div>
                                    <div>
                                        <div className="text-gray-500">Advance Booking</div>
                                        <div className="text-white font-medium">{bookingSettings.maxAdvanceBookingDays} days</div>
                                    </div>
                                    <div>
                                        <div className="text-gray-500">Daily Limit</div>
                                        <div className="text-white font-medium">{bookingSettings.maxBookingsPerMemberPerDay} bookings</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-gray-800 rounded-lg p-8 border border-gray-700 text-center">
                            <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <h3 className="text-xl font-bold text-white mb-2">Court Booking Not Enabled</h3>
                            <p className="text-gray-400 mb-4">
                                {isAdmin 
                                    ? "Set up court booking to allow members to reserve courts."
                                    : "Court booking is not available for this club yet."
                                }
                            </p>
                            {isAdmin && (
                                <button
                                    onClick={() => setShowManageCourts(true)}
                                    className="bg-green-600 hover:bg-green-500 text-white px-5 py-2 rounded-lg font-semibold"
                                >
                                    Set Up Courts
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ClubDetailPage;
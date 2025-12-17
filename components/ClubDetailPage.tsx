/**
 * ClubDetailPage Component
 * 
 * Shows club details, members, tournaments, and court booking
 * Now includes Settings tab for admins with Stripe Connect
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
import { ClubStripeConnect } from './clubs/ClubStripeConnect';

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
    
    // Tab and court booking state - Added 'settings' tab
    const [activeTab, setActiveTab] = useState<'overview' | 'members' | 'courts' | 'settings'>('overview');
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
                clubName={club?.name}
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
                        <span className="bg-yellow-600 text-yellow-100 text-xs px-2 py-1 rounded font-semibold">Admin</span>
                    ) : isMember ? (
                        <span className="bg-green-600 text-green-100 text-xs px-2 py-1 rounded font-semibold">Member</span>
                    ) : null}
                </div>
                
                <h1 className="text-3xl font-bold text-white mb-2">{club.name}</h1>
                {club.description && <p className="text-gray-400 mb-4">{club.description}</p>}
                
                <div className="flex flex-wrap gap-4 text-sm text-gray-400">
                    {club.region && <span>📍 {club.region}</span>}
                    {club.country && <span>🌍 {club.country}</span>}
                    <span>👥 {club.members?.length || 0} members</span>
                </div>

                {/* Join Button */}
                {currentUser && !isMember && !isAdmin && (
                    <div className="mt-4">
                        {hasPendingRequest ? (
                            <span className="text-yellow-400 text-sm">⏳ Request pending approval</span>
                        ) : (
                            <button
                                onClick={handleJoinRequest}
                                disabled={pendingJoin}
                                className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg font-semibold disabled:opacity-50"
                            >
                                {pendingJoin ? 'Requesting...' : 'Request to Join'}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Admin Controls */}
            {isAdmin && (
                <div className="flex flex-wrap gap-3 mb-6">
                    <button
                        onClick={() => setIsImportModalOpen(true)}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Bulk Import Members
                    </button>
                    <button
                        onClick={() => setShowManageCourts(true)}
                        className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Manage Courts
                    </button>
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 mb-6 bg-gray-800/50 p-1 rounded-lg w-fit overflow-x-auto">
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
                {/* Settings Tab - Admin Only */}
                {isAdmin && (
                    <button
                        onClick={() => setActiveTab('settings')}
                        className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors flex items-center gap-2 ${
                            activeTab === 'settings'
                                ? 'bg-gray-700 text-white'
                                : 'text-gray-400 hover:text-white'
                        }`}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Settings
                    </button>
                )}
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

                    {/* Sidebar */}
                    <div className="space-y-6">
                        {/* Join Requests (Admin) */}
                        {isAdmin && requests.length > 0 && (
                            <div className="bg-gray-800 rounded-lg p-6 border border-yellow-700">
                                <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                                    <span className="bg-yellow-600 text-white text-xs w-6 h-6 rounded-full flex items-center justify-center">
                                        {requests.length}
                                    </span>
                                    Join Requests
                                </h2>
                                <div className="space-y-3">
                                    {requests.map((req) => {
                                        const user = requestUsers[req.userId];
                                        return (
                                            <div key={req.id} className="flex items-center justify-between bg-gray-900 rounded-lg p-3">
                                                <div>
                                                    <div className="text-white font-medium">{user?.displayName || 'Unknown'}</div>
                                                    <div className="text-gray-500 text-xs">{user?.email}</div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handleApprove(req.id, req.userId)}
                                                        disabled={processingRequest === req.id}
                                                        className="bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded text-sm font-semibold disabled:opacity-50"
                                                    >
                                                        ✓
                                                    </button>
                                                    <button
                                                        onClick={() => handleDecline(req.id)}
                                                        disabled={processingRequest === req.id}
                                                        className="bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded text-sm font-semibold disabled:opacity-50"
                                                    >
                                                        ✗
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Quick Stats */}
                        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                            <h2 className="text-lg font-bold text-white mb-4">Club Stats</h2>
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Members</span>
                                    <span className="text-white font-medium">{club.members?.length || 0}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-400">Admins</span>
                                    <span className="text-white font-medium">{club.admins?.length || 0}</span>
                                </div>
                                {bookingSettings?.enabled && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-400">Court Booking</span>
                                        <span className="text-green-400 font-medium">Active</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Members Tab */}
            {activeTab === 'members' && (
                <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                    <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                        <h2 className="text-lg font-bold text-white">
                            Members ({club.members?.length || 0})
                        </h2>
                    </div>
                    
                    {loadingMembers ? (
                        <div className="p-8 text-center text-gray-400">Loading members...</div>
                    ) : (
                    <>
                    {club.members?.length === 0 ? (
                        <div className="p-8 text-center text-gray-400">No members yet.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-900/50">
                                    <tr className="text-left text-gray-400 text-sm">
                                        <th className="py-3 px-4 font-semibold">Name</th>
                                        <th className="py-3 px-4 font-semibold">DUPR (S/D)</th>
                                        <th className="py-3 px-4 font-semibold">Location</th>
                                        <th className="py-3 px-4 font-semibold">Role</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-700">
                                    {club.members?.map((memberId) => {
                                        const profile = memberProfiles[memberId];
                                        const isAdminMember = club.admins?.includes(memberId);
                                        
                                        return (
                                            <tr key={memberId} className="hover:bg-gray-700/30">
                                                <td className="py-3 px-4">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-white font-medium">
                                                            {profile?.displayName || 'Unknown'}
                                                        </span>
                                                        {profile?.gender && getGenderIcon(profile.gender)}
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4">
                                                    {profile?.ratingSingles || profile?.ratingDoubles ? (
                                                        <span className="text-green-400 font-mono text-sm">
                                                            {formatDupr(profile.ratingSingles, profile.ratingDoubles)}
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

            {/* Settings Tab - Admin Only */}
            {activeTab === 'settings' && isAdmin && (
                <div className="space-y-6">
                    <h2 className="text-xl font-bold text-white mb-4">Club Settings</h2>
                    
                    {/* Stripe Connect */}
                    <ClubStripeConnect
                        clubId={clubId}
                        clubName={club.name}
                        clubEmail={(club as any).contactEmail}
                        isAdmin={!!isAdmin}
                    />
                    
                    {/* Club Information */}
                    <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
                        <h3 className="text-lg font-bold text-white mb-4">Club Information</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div className="bg-gray-900 rounded-lg p-4">
                                <div className="text-gray-500 mb-1">Club ID</div>
                                <div className="text-gray-300 font-mono text-xs break-all">{clubId}</div>
                            </div>
                            <div className="bg-gray-900 rounded-lg p-4">
                                <div className="text-gray-500 mb-1">Members</div>
                                <div className="text-white font-medium">{club.members?.length || 0}</div>
                            </div>
                            <div className="bg-gray-900 rounded-lg p-4">
                                <div className="text-gray-500 mb-1">Admins</div>
                                <div className="text-white font-medium">{club.admins?.length || 0}</div>
                            </div>
                            <div className="bg-gray-900 rounded-lg p-4">
                                <div className="text-gray-500 mb-1">Court Booking</div>
                                <div className={`font-medium ${bookingSettings?.enabled ? 'text-green-400' : 'text-gray-400'}`}>
                                    {bookingSettings?.enabled ? 'Enabled' : 'Disabled'}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Danger Zone */}
                    <div className="bg-gray-800 rounded-xl border border-red-900/50 p-6">
                        <h3 className="text-lg font-bold text-red-400 mb-2">Danger Zone</h3>
                        <p className="text-gray-400 text-sm mb-4">
                            These actions are irreversible. Please proceed with caution.
                        </p>
                        <div className="flex gap-3">
                            <button
                                disabled
                                className="bg-red-900/30 text-red-400 px-4 py-2 rounded-lg text-sm font-medium border border-red-900/50 opacity-50 cursor-not-allowed"
                            >
                                Delete Club (Coming Soon)
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ClubDetailPage;
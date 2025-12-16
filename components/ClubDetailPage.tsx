/**
 * ClubDetailPage Component
 * 
 * Shows club details, members, tournaments, and court booking
 * 
 * FILE LOCATION: components/ClubDetailPage.tsx
 */

import React, { useEffect, useState } from 'react';
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
    const [pendingJoin, setPendingJoin] = useState(false);
    const [hasPendingRequest, setHasPendingRequest] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    
    // NEW: Tab and court booking state
    const [activeTab, setActiveTab] = useState<'overview' | 'members' | 'courts'>('overview');
    const [showCourtCalendar, setShowCourtCalendar] = useState(false);
    const [showManageCourts, setShowManageCourts] = useState(false);
    const [bookingSettings, setBookingSettings] = useState<ClubBookingSettings | null>(null);

    useEffect(() => {
        const unsub = subscribeToClub(clubId, (data) => {
            setClub(data);
        });
        return () => unsub();
    }, [clubId]);

    // Load booking settings
    useEffect(() => {
        getClubBookingSettings(clubId).then(setBookingSettings);
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

    const handleApprove = async (requestId: string) => {
        try {
            await approveClubJoinRequest(clubId, requestId);
        } catch (e) {
            console.error(e);
            alert("Failed to approve request.");
        }
    };

    const handleDecline = async (requestId: string) => {
        try {
            await declineClubJoinRequest(clubId, requestId);
        } catch (e) {
            console.error(e);
            alert("Failed to decline request.");
        }
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
                onBack={() => setShowManageCourts(false)}
            />
        );
    }

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
                    <div className="mt-6 pt-6 border-t border-gray-700 flex gap-4 flex-wrap">
                         <button 
                            onClick={() => setIsImportModalOpen(true)}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-bold text-sm shadow flex items-center gap-2"
                         >
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                             Bulk Import Members
                         </button>
                         <button 
                            onClick={() => setShowManageCourts(true)}
                            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded font-bold text-sm shadow flex items-center gap-2"
                         >
                             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                             Manage Courts
                         </button>
                    </div>
                )}
            </div>

            {/* Tabs */}
            <div className="flex gap-4 mb-6 border-b border-gray-700">
                <button
                    onClick={() => setActiveTab('overview')}
                    className={`pb-3 px-1 text-sm font-semibold border-b-2 transition-colors ${
                        activeTab === 'overview'
                            ? 'border-blue-500 text-blue-400'
                            : 'border-transparent text-gray-400 hover:text-white'
                    }`}
                >
                    Overview
                </button>
                <button
                    onClick={() => setActiveTab('members')}
                    className={`pb-3 px-1 text-sm font-semibold border-b-2 transition-colors ${
                        activeTab === 'members'
                            ? 'border-blue-500 text-blue-400'
                            : 'border-transparent text-gray-400 hover:text-white'
                    }`}
                >
                    Members
                </button>
                {(bookingSettings?.enabled || isAdmin) && (
                    <button
                        onClick={() => setActiveTab('courts')}
                        className={`pb-3 px-1 text-sm font-semibold border-b-2 transition-colors ${
                            activeTab === 'courts'
                                ? 'border-blue-500 text-blue-400'
                                : 'border-transparent text-gray-400 hover:text-white'
                        }`}
                    >
                        Courts
                        {bookingSettings?.enabled && (
                            <span className="ml-2 bg-green-600 text-white text-xs px-1.5 py-0.5 rounded">NEW</span>
                        )}
                    </button>
                )}
            </div>

            {/* Overview Tab */}
            {activeTab === 'overview' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Main Content */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                            <h2 className="text-xl font-bold text-white mb-4">Tournaments</h2>
                            <p className="text-gray-500 italic">No upcoming tournaments listed.</p>
                        </div>
                        
                        {/* Court Booking Quick Access */}
                        {bookingSettings?.enabled && (isMember || isAdmin) && (
                            <div className="bg-gradient-to-r from-green-900/30 to-blue-900/30 rounded-lg p-6 border border-green-700/50">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h2 className="text-xl font-bold text-white mb-1">Court Booking</h2>
                                        <p className="text-gray-400 text-sm">Book a court for your next game</p>
                                    </div>
                                    <button
                                        onClick={() => setShowCourtCalendar(true)}
                                        className="bg-green-600 hover:bg-green-500 text-white px-6 py-3 rounded-lg font-bold shadow-lg transition-colors flex items-center gap-2"
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

                    {/* Sidebar: Requests */}
                    {isAdmin && (
                        <div className="space-y-6">
                            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                                <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                                    Membership Requests
                                    {requests.length > 0 && <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">{requests.length}</span>}
                                </h2>
                                
                                {requests.length === 0 ? (
                                    <p className="text-gray-500 italic">No pending requests.</p>
                                ) : (
                                    <div className="space-y-3">
                                        {requests.map((req) => {
                                            const user = requestUsers[req.userId];
                                            return (
                                                <div key={req.id} className="bg-gray-700/50 rounded-lg p-3 flex items-center justify-between">
                                                    <div>
                                                        <div className="font-semibold text-white">{user?.displayName || 'Unknown'}</div>
                                                        <div className="text-xs text-gray-400">{user?.email}</div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => handleApprove(req.id)}
                                                            className="bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded text-sm font-semibold"
                                                        >
                                                            Approve
                                                        </button>
                                                        <button
                                                            onClick={() => handleDecline(req.id)}
                                                            className="bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded text-sm font-semibold"
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
            )}

            {/* Members Tab */}
            {activeTab === 'members' && (
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                    <h2 className="text-xl font-bold text-white mb-4">Members ({club.members.length})</h2>
                    {club.members.length === 0 ? (
                        <p className="text-gray-500 italic">No members yet.</p>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {club.members.map((memberId) => (
                                <div key={memberId} className="bg-gray-700/50 rounded-lg p-3 flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center text-white font-bold">
                                        {memberId.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="text-sm text-gray-300 truncate">{memberId}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Courts Tab */}
            {activeTab === 'courts' && (
                <div className="space-y-6">
                    {!bookingSettings?.enabled ? (
                        // Booking not enabled
                        <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 text-center">
                            <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-bold text-white mb-2">Court Booking Not Enabled</h3>
                            <p className="text-gray-400 text-sm mb-4">
                                {isAdmin 
                                    ? 'Enable court booking in Manage Courts to allow members to book.'
                                    : 'This club has not enabled court booking yet.'}
                            </p>
                            {isAdmin && (
                                <button
                                    onClick={() => setShowManageCourts(true)}
                                    className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-semibold"
                                >
                                    Setup Court Booking
                                </button>
                            )}
                        </div>
                    ) : (
                        // Booking is enabled
                        <>
                            {/* Book a Court */}
                            {(isMember || isAdmin) && (
                                <button
                                    onClick={() => setShowCourtCalendar(true)}
                                    className="w-full bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white py-4 rounded-xl font-bold shadow-lg transition-all flex items-center justify-center gap-3"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    View Calendar & Book a Court
                                </button>
                            )}

                            {/* Non-member message */}
                            {!isMember && !isAdmin && (
                                <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4 text-center">
                                    <p className="text-yellow-200">
                                        Join this club to book courts.
                                    </p>
                                </div>
                            )}

                            {/* Admin: Manage Courts */}
                            {isAdmin && (
                                <button
                                    onClick={() => setShowManageCourts(true)}
                                    className="w-full bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    Manage Courts & Settings
                                </button>
                            )}

                            {/* Booking Info */}
                            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                                <h3 className="font-semibold text-white mb-3">Booking Information</h3>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="text-gray-500">Hours:</span>
                                        <span className="text-white ml-2">{bookingSettings.openTime} - {bookingSettings.closeTime}</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Slot Duration:</span>
                                        <span className="text-white ml-2">{bookingSettings.slotDurationMinutes} min</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Advance Booking:</span>
                                        <span className="text-white ml-2">{bookingSettings.maxAdvanceBookingDays} days</span>
                                    </div>
                                    <div>
                                        <span className="text-gray-500">Daily Limit:</span>
                                        <span className="text-white ml-2">{bookingSettings.maxBookingsPerMemberPerDay} bookings</span>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default ClubDetailPage;
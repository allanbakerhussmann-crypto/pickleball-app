/**
 * ClubDetailPage Component
 * 
 * Shows club details, members, tournaments, and court booking
 * Includes Settings tab for admins with Stripe Connect
 * Handles payment success/cancel URL parameters (HashRouter compatible)
 * 
 * FILE LOCATION: components/ClubDetailPage.tsx
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
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
    subscribeToOccurrenceIndex,
} from '../services/firebase';
import type { Club, ClubJoinRequest, UserProfile, ClubBookingSettings } from '../types';
import type { MeetupOccurrenceIndex } from '../types/standingMeetup';
import { formatTime } from '../utils/timeFormat';
import { BulkClubImport } from './BulkClubImport';
import { CourtBookingCalendar } from './clubs/CourtBookingCalendar';
import { ManageCourts } from './clubs/ManageCourts';
import { ClubStripeConnect } from './clubs/ClubStripeConnect';
import { MyBookings } from './clubs/MyBookings';
import { ClubSettingsForm } from './clubs/ClubSettingsForm';
import { FinanceTab } from './clubs/FinanceTab';
import { StandingMeetupsList } from './clubs/StandingMeetupsList';
import { CreateStandingMeetup } from './clubs/CreateStandingMeetup';
import { StandingMeetupDetail } from './clubs/StandingMeetupDetail';
import { WeeklyMeetupsCalendar } from './clubs/WeeklyMeetupsCalendar';

interface ClubDetailPageProps {
    clubId: string;
    onBack: () => void;
}

export const ClubDetailPage: React.FC<ClubDetailPageProps> = ({ clubId, onBack }) => {
    const { currentUser, userProfile, isAppAdmin } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    
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
    const [activeTab, setActiveTab] = useState<'overview' | 'members' | 'courts' | 'standingMeetups' | 'finance' | 'settings'>('overview');

    // Standing meetups state
    const [showCreateStandingMeetup, setShowCreateStandingMeetup] = useState(false);
    const [selectedStandingMeetupId, setSelectedStandingMeetupId] = useState<string | null>(null);
    const [weeklyMeetupsView, setWeeklyMeetupsView] = useState<'calendar' | 'management'>('calendar');
    const [selectedOccurrenceDate, setSelectedOccurrenceDate] = useState<string | null>(null);
    const [showCourtCalendar, setShowCourtCalendar] = useState(false);
    const [showManageCourts, setShowManageCourts] = useState(false);
    const [showMyBookings, setShowMyBookings] = useState(false);
    const [bookingSettings, setBookingSettings] = useState<ClubBookingSettings | null>(null);
    
    // Payment success/error state
    const [paymentSuccess, setPaymentSuccess] = useState(false);
    const [paymentError, setPaymentError] = useState<string | null>(null);

    // Upcoming sessions for Overview tab
    const [upcomingSessions, setUpcomingSessions] = useState<MeetupOccurrenceIndex[]>([]);
    const [loadingSessions, setLoadingSessions] = useState(true);

    // Stripe Connect success state
    const [stripeConnectSuccess, setStripeConnectSuccess] = useState(false);

    // Check URL parameters for tab and payment status (HashRouter compatible)
    useEffect(() => {
        const tabParam = searchParams.get('tab');
        const paymentParam = searchParams.get('payment');
        const stripeParam = searchParams.get('stripe');

        console.log('URL Params:', { tabParam, paymentParam, stripeParam });

        // Handle tab parameter
        if (tabParam === 'booking') {
            setActiveTab('courts');
            setShowCourtCalendar(true);
        } else if (tabParam === 'standingMeetups') {
            setActiveTab('standingMeetups');
        }

        // Handle court booking payment success
        if (paymentParam === 'success') {
            console.log('Payment success detected!');
            setPaymentSuccess(true);
            setActiveTab('courts');
            setShowCourtCalendar(true);

            // Clear URL params after reading them
            setSearchParams({});
        } else if (paymentParam === 'cancelled') {
            setPaymentError('Payment was cancelled. Your booking was not completed.');
            setActiveTab('courts');
            setShowCourtCalendar(true);

            // Clear URL params
            setSearchParams({});
        }

        // Handle Stripe Connect onboarding return
        if (stripeParam === 'success') {
            console.log('Stripe Connect success detected!');
            setStripeConnectSuccess(true);
            setActiveTab('settings');
            // Clear URL params after reading them
            setSearchParams({});
        } else if (stripeParam === 'refresh') {
            // User needs to complete onboarding - just go to settings
            setActiveTab('settings');
            setSearchParams({});
        }
    }, [searchParams, setSearchParams]);

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
        return () => {
            try {
                unsub();
            } catch (err) {
                // Ignore Firestore SDK errors during cleanup (race condition bug in SDK 12.6.0)
                console.debug('Subscription cleanup error (safe to ignore):', err);
            }
        };
    }, [clubId]);

    // Subscribe to upcoming sessions for this club (Overview tab)
    useEffect(() => {
        setLoadingSessions(true);
        const unsub = subscribeToOccurrenceIndex(
            (sessions) => {
                // Limit to next 7 days for compact display
                const weekFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;
                const filtered = sessions.filter(s => s.when <= weekFromNow);
                setUpcomingSessions(filtered.slice(0, 10)); // Max 10 sessions
                setLoadingSessions(false);
            },
            { clubId, limit: 20 }
        );
        return () => {
            try {
                unsub();
            } catch (err) {
                console.debug('Subscription cleanup error (safe to ignore):', err);
            }
        };
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
                console.error('Failed to load member profiles:', e);
            } finally {
                setLoadingMembers(false);
            }
        };
        
        loadMemberProfiles();
    }, [club?.members]);

    // Subscribe to join requests (admin only)
    useEffect(() => {
        if (!club || !currentUser) return;
        const isAdmin = club.admins?.includes(currentUser.uid) || club.createdByUserId === currentUser.uid || isAppAdmin;
        if (!isAdmin) return;
        
        const unsub = subscribeToClubRequests(clubId, async (reqs) => {
            setRequests(reqs);
            
            // Load user profiles for pending requests
            const pendingReqs = reqs.filter(r => r.status === 'pending');
            if (pendingReqs.length > 0) {
                const userIds = pendingReqs.map(r => r.userId);
                try {
                    let profiles: UserProfile[] = [];
                    if (typeof getUsersByIds === 'function') {
                        profiles = await getUsersByIds(userIds);
                    } else {
                        const allUsers = await getAllUsers();
                        profiles = allUsers.filter(u => userIds.includes(u.id));
                    }
                    
                    const profileMap: Record<string, UserProfile> = {};
                    profiles.forEach(p => {
                        profileMap[p.id] = p;
                    });
                    setRequestUsers(profileMap);
                } catch (e) {
                    console.error('Failed to load request user profiles:', e);
                }
            }
        });
        return () => {
            try {
                unsub();
            } catch (err) {
                // Ignore Firestore SDK errors during cleanup (race condition bug in SDK 12.6.0)
                console.debug('Subscription cleanup error (safe to ignore):', err);
            }
        };
    }, [club, currentUser, clubId, isAppAdmin]);

    // Subscribe to user's own pending request - callback receives boolean
    useEffect(() => {
        if (!currentUser) return;
        const unsub = subscribeToMyClubJoinRequest(clubId, currentUser.uid, (hasPending: boolean) => {
            setHasPendingRequest(hasPending);
        });
        return () => {
            try {
                unsub();
            } catch (err) {
                // Ignore Firestore SDK errors during cleanup (race condition bug in SDK 12.6.0)
                console.debug('Subscription cleanup error (safe to ignore):', err);
            }
        };
    }, [clubId, currentUser]);

    // Load booking settings on mount
    useEffect(() => {
        loadBookingSettings();
    }, [loadBookingSettings]);

    if (!club) return <div className="text-center py-8 text-gray-400">Loading...</div>;

    const isMember = currentUser ? club.members?.includes(currentUser.uid) : false;
    const isAdmin = currentUser ? (club.admins?.includes(currentUser.uid) || club.createdByUserId === currentUser.uid || isAppAdmin) : false;
    const pendingRequests = requests.filter(r => r.status === 'pending');

    const handleRequestJoin = async () => {
        if (!currentUser) return;
        setPendingJoin(true);
        try {
            await requestJoinClub(clubId, currentUser.uid);
        } catch (e) {
            console.error('Failed to request to join:', e);
        } finally {
            setPendingJoin(false);
        }
    };

    // approveClubJoinRequest needs 3 args: clubId, requestId, userId
    const handleApprove = async (requestId: string, userId: string) => {
        setProcessingRequest(requestId);
        try {
            await approveClubJoinRequest(clubId, requestId, userId);
        } catch (e) {
            console.error('Failed to approve request:', e);
        } finally {
            setProcessingRequest(null);
        }
    };

    const handleDecline = async (requestId: string) => {
        setProcessingRequest(requestId);
        try {
            await declineClubJoinRequest(clubId, requestId);
        } catch (e) {
            console.error('Failed to decline request:', e);
        } finally {
            setProcessingRequest(null);
        }
    };

    // Show My Bookings view
    if (showMyBookings) {
        return (
            <MyBookings
                clubId={clubId}
                settings={bookingSettings}
                isAdmin={isAdmin}
                onBack={() => setShowMyBookings(false)}
            />
        );
    }

    // Show Court Calendar if selected
    if (showCourtCalendar) {
        return (
            <>
                {/* Payment Success Banner - show on top of calendar */}
                {paymentSuccess && (
                    <div className="max-w-6xl mx-auto mb-4">
                        <div className="bg-green-900/50 border border-green-700 text-green-200 px-4 py-3 rounded-lg flex items-center gap-3">
                            <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="font-medium">Payment successful! Your court booking has been confirmed.</span>
                            <button 
                                onClick={() => setPaymentSuccess(false)}
                                className="ml-auto text-green-300 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                )}
                
                {/* Payment Error Banner */}
                {paymentError && (
                    <div className="max-w-6xl mx-auto mb-4">
                        <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg flex items-center gap-3">
                            <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            <span className="font-medium">{paymentError}</span>
                            <button 
                                onClick={() => setPaymentError(null)}
                                className="ml-auto text-red-300 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                )}
                
                <CourtBookingCalendar
                    clubId={clubId}
                    clubName={club.name}
                    isAdmin={isAdmin}
                    isMember={isMember}
                    onBack={() => {
                        setShowCourtCalendar(false);
                        setPaymentSuccess(false);
                        setPaymentError(null);
                    }}
                />
            </>
        );
    }

    // Show Manage Courts if selected (admin only)
    if (showManageCourts && isAdmin) {
        return (
            <ManageCourts
                clubId={clubId}
                onBack={() => {
                    setShowManageCourts(false);
                    loadBookingSettings(); // Refresh settings after managing courts
                }}
                stripeConnected={(club as any).stripeChargesEnabled === true}
                stripeAccountId={(club as any).stripeConnectedAccountId}
            />
        );
    }

    return (
        <div className="max-w-4xl mx-auto">
            {/* Back Button */}
            <button
                onClick={onBack}
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-4"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to Clubs
            </button>

            {/* Club Header */}
            <div className="bg-gray-800 rounded-xl p-6 mb-6 border border-gray-700">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h1 className="text-2xl font-bold text-white">{club.name}</h1>
                        {club.region && <p className="text-gray-400">{club.region}</p>}
                    </div>
                    <div className="flex gap-2">
                        {isAdmin && (
                            <span className="bg-purple-600 text-white text-xs px-2 py-1 rounded font-semibold">Admin</span>
                        )}
                        {isMember && !isAdmin && (
                            <span className="bg-green-600 text-white text-xs px-2 py-1 rounded font-semibold">Member</span>
                        )}
                    </div>
                </div>
                
                {club.description && (
                    <p className="text-gray-300 mb-4">{club.description}</p>
                )}

                <div className="flex items-center gap-6 text-sm text-gray-400">
                    <span>{club.members?.length || 0} members</span>
                </div>

                {/* Join Button */}
                {!isMember && currentUser && !hasPendingRequest && (
                    <button
                        onClick={handleRequestJoin}
                        disabled={pendingJoin}
                        className="mt-4 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
                    >
                        {pendingJoin ? 'Requesting...' : 'Request to Join'}
                    </button>
                )}

                {hasPendingRequest && (
                    <div className="mt-4 bg-yellow-900/30 border border-yellow-700 text-yellow-200 px-4 py-2 rounded-lg text-sm">
                        Your request to join is pending approval.
                    </div>
                )}
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                <button
                    onClick={() => setActiveTab('overview')}
                    className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors whitespace-nowrap ${
                        activeTab === 'overview'
                            ? 'bg-gray-700 text-white'
                            : 'text-gray-400 hover:text-white'
                    }`}
                >
                    Overview
                </button>
                <button
                    onClick={() => setActiveTab('members')}
                    className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors whitespace-nowrap ${
                        activeTab === 'members'
                            ? 'bg-gray-700 text-white'
                            : 'text-gray-400 hover:text-white'
                    }`}
                >
                    Members
                </button>
                <button
                    onClick={() => setActiveTab('courts')}
                    className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors flex items-center gap-2 whitespace-nowrap ${
                        activeTab === 'courts'
                            ? 'bg-gray-700 text-white'
                            : 'text-gray-400 hover:text-white'
                    }`}
                >
                    Courts
                    <span className="bg-green-600 text-white text-xs px-1.5 py-0.5 rounded font-bold">NEW</span>
                </button>
                {/* Weekly Meetups Tab - Visible to all users */}
                <button
                    onClick={() => setActiveTab('standingMeetups')}
                    className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors flex items-center gap-2 whitespace-nowrap ${
                        activeTab === 'standingMeetups'
                            ? 'bg-gray-700 text-white'
                            : 'text-gray-400 hover:text-white'
                    }`}
                >
                    Weekly Meetups
                    <span className="bg-lime-600 text-white text-xs px-1.5 py-0.5 rounded font-bold">NEW</span>
                </button>
                {/* Finance Tab - Admin Only, when Stripe connected */}
                {isAdmin && (club as any).stripeConnectedAccountId && (club as any).stripeChargesEnabled && (
                    <button
                        onClick={() => setActiveTab('finance')}
                        className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors flex items-center gap-2 whitespace-nowrap ${
                            activeTab === 'finance'
                                ? 'bg-gray-700 text-white'
                                : 'text-gray-400 hover:text-white'
                        }`}
                    >
                        Finance
                    </button>
                )}
                {/* Settings Tab - Admin Only */}
                {isAdmin && (
                    <button
                        onClick={() => setActiveTab('settings')}
                        className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors flex items-center gap-2 whitespace-nowrap ${
                            activeTab === 'settings'
                                ? 'bg-gray-700 text-white'
                                : 'text-gray-400 hover:text-white'
                        }`}
                    >
                        Settings
                    </button>
                )}
            </div>

            {/* Overview Tab */}
            {activeTab === 'overview' && (
                <div className="space-y-6">
                    {/* Quick Actions */}
                    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                        <h2 className="text-lg font-bold text-white mb-4">Quick Actions</h2>
                        <div className="grid grid-cols-2 gap-4">
                            {/* Weekly Meetups - always visible */}
                            <button
                                onClick={() => setActiveTab('standingMeetups')}
                                className="bg-lime-600 hover:bg-lime-500 text-white px-4 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                                Weekly Meetups
                            </button>
                            {(isMember || isAdmin) && bookingSettings?.enabled && (
                                <>
                                    <button
                                        onClick={() => setShowCourtCalendar(true)}
                                        className="bg-green-600 hover:bg-green-500 text-white px-4 py-3 rounded-lg font-semibold transition-colors"
                                    >
                                        Book a Court
                                    </button>
                                    <button
                                        onClick={() => setShowMyBookings(true)}
                                        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-lg font-semibold transition-colors"
                                    >
                                        My Bookings
                                    </button>
                                </>
                            )}
                            {isAdmin && (
                                <>
                                    <button
                                        onClick={() => setShowManageCourts(true)}
                                        className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-3 rounded-lg font-semibold transition-colors"
                                    >
                                        Manage Courts
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('settings')}
                                        className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-3 rounded-lg font-semibold transition-colors"
                                    >
                                        Payment Settings
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Upcoming Sessions This Week */}
                    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <svg className="w-5 h-5 text-lime-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                Upcoming This Week
                            </h2>
                            <button
                                onClick={() => setActiveTab('standingMeetups')}
                                className="text-lime-400 hover:text-lime-300 text-sm font-medium"
                            >
                                View All →
                            </button>
                        </div>

                        {loadingSessions ? (
                            <div className="text-center py-8">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-lime-400 mx-auto"></div>
                            </div>
                        ) : upcomingSessions.length === 0 ? (
                            <div className="text-center py-8">
                                <svg className="w-12 h-12 text-gray-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <p className="text-gray-400">No sessions scheduled this week</p>
                                {isAdmin && (
                                    <button
                                        onClick={() => setActiveTab('standingMeetups')}
                                        className="mt-3 text-lime-400 hover:text-lime-300 text-sm font-medium"
                                    >
                                        Create a Weekly Meetup →
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {upcomingSessions.map((session) => {
                                    const sessionDate = new Date(session.when);
                                    const isToday = new Date().toDateString() === sessionDate.toDateString();
                                    const dayName = sessionDate.toLocaleDateString('en-NZ', { weekday: 'short' });
                                    const dateNum = sessionDate.getDate();
                                    const monthName = sessionDate.toLocaleDateString('en-NZ', { month: 'short' });

                                    return (
                                        <button
                                            key={session.id}
                                            onClick={() => {
                                                setSelectedStandingMeetupId(session.standingMeetupId);
                                                setSelectedOccurrenceDate(session.occurrenceDate);
                                                setActiveTab('standingMeetups');
                                            }}
                                            className={`w-full flex items-center gap-4 p-3 rounded-lg border transition-colors text-left ${
                                                isToday
                                                    ? 'bg-lime-900/20 border-lime-600/50 hover:bg-lime-900/30'
                                                    : 'bg-gray-900/50 border-gray-700 hover:border-gray-600 hover:bg-gray-900'
                                            }`}
                                        >
                                            {/* Date badge */}
                                            <div className={`text-center min-w-[50px] ${isToday ? 'text-lime-400' : 'text-gray-300'}`}>
                                                <p className="text-xs uppercase font-medium">{dayName}</p>
                                                <p className="text-xl font-bold">{dateNum}</p>
                                                <p className="text-xs text-gray-500">{monthName}</p>
                                            </div>

                                            {/* Session info */}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-white font-medium truncate">{session.title}</p>
                                                <p className="text-gray-400 text-sm">
                                                    {formatTime(session.startTime)} - {formatTime(session.endTime)}
                                                </p>
                                            </div>

                                            {/* Spots indicator */}
                                            <div className="text-right">
                                                <p className="text-sm">
                                                    <span className="text-lime-400">{session.expectedCount || 0}</span>
                                                    <span className="text-gray-500">/{session.maxPlayers}</span>
                                                </p>
                                                <p className="text-gray-500 text-xs">players</p>
                                            </div>

                                            {/* Today badge */}
                                            {isToday && (
                                                <span className="px-2 py-0.5 bg-lime-600/30 text-lime-400 rounded text-xs font-medium">
                                                    TODAY
                                                </span>
                                            )}

                                            {/* Arrow */}
                                            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Pending Requests (Admin) */}
                    {isAdmin && pendingRequests.length > 0 && (
                        <div className="bg-gray-800 rounded-xl p-6 border border-yellow-700">
                            <h2 className="text-lg font-bold text-white mb-4">
                                Pending Join Requests ({pendingRequests.length})
                            </h2>
                            <div className="space-y-3">
                                {pendingRequests.map(req => {
                                    const user = requestUsers[req.userId];
                                    return (
                                        <div key={req.id} className="flex items-center justify-between bg-gray-700 rounded-lg p-3">
                                            <div>
                                                <p className="text-white font-medium">
                                                    {user?.displayName || 'Unknown User'}
                                                </p>
                                                <p className="text-gray-400 text-sm">{user?.email}</p>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleApprove(req.id, req.userId)}
                                                    disabled={processingRequest === req.id}
                                                    className="bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white px-3 py-1 rounded text-sm font-semibold"
                                                >
                                                    Approve
                                                </button>
                                                <button
                                                    onClick={() => handleDecline(req.id)}
                                                    disabled={processingRequest === req.id}
                                                    className="bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white px-3 py-1 rounded text-sm font-semibold"
                                                >
                                                    Decline
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Members Tab */}
            {activeTab === 'members' && (
                <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold text-white">Members ({club.members?.length || 0})</h2>
                        {isAdmin && (
                            <button
                                onClick={() => setIsImportModalOpen(true)}
                                className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded text-sm font-semibold"
                            >
                                Import Members
                            </button>
                        )}
                    </div>
                    
                    {loadingMembers ? (
                        <div className="text-center py-8 text-gray-400">Loading members...</div>
                    ) : club.members && club.members.length > 0 ? (
                        <div className="space-y-2">
                            {club.members.map(memberId => {
                                const profile = memberProfiles[memberId];
                                const memberIsAdmin = club.admins?.includes(memberId) || club.createdByUserId === memberId;
                                return (
                                    <div key={memberId} className="flex items-center justify-between bg-gray-700 rounded-lg p-3">
                                        <div>
                                            <p className="text-white font-medium">
                                                {profile?.displayName || 'Unknown User'}
                                            </p>
                                            <p className="text-gray-400 text-sm">{profile?.email || memberId}</p>
                                        </div>
                                        {memberIsAdmin && (
                                            <span className="bg-purple-600 text-white text-xs px-2 py-1 rounded font-semibold">Admin</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="text-gray-400 text-center py-4">No members yet.</p>
                    )}
                </div>
            )}

            {/* Courts Tab */}
            {activeTab === 'courts' && (
                <div className="space-y-6">
                    {/* Court Booking Quick Access */}
                    {bookingSettings?.enabled ? (
                        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-bold text-white">Court Booking</h2>
                                {isAdmin && (
                                    <button
                                        onClick={() => setShowManageCourts(true)}
                                        className="text-sm text-green-400 hover:text-green-300"
                                    >
                                        Manage Courts →
                                    </button>
                                )}
                            </div>
                            
                            <p className="text-gray-400 mb-4">Book courts and manage your reservations.</p>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    onClick={() => setShowCourtCalendar(true)}
                                    className="bg-green-600 hover:bg-green-500 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
                                >
                                    🎾 Book a Court
                                </button>
                                <button
                                    onClick={() => setShowMyBookings(true)}
                                    className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
                                >
                                    📅 My Bookings
                                </button>
                            </div>
                            
                            {/* Booking Settings Summary */}
                            <div className="mt-6 pt-6 border-t border-gray-700">
                                <h3 className="text-sm font-semibold text-gray-400 mb-3">Booking Settings</h3>
                                <div className="grid grid-cols-3 gap-4 text-sm">
                                    <div>
                                        <div className="text-gray-500">Hours</div>
                                        <div className="text-white font-medium">
                                            {bookingSettings.openTime} - {bookingSettings.closeTime}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-gray-500">Slot Duration</div>
                                        <div className="text-white font-medium">{bookingSettings.slotDurationMinutes} min</div>
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

            {/* Weekly Meetups Tab - Visible to all users */}
            {activeTab === 'standingMeetups' && (
                selectedStandingMeetupId ? (
                    <StandingMeetupDetail
                        standingMeetupId={selectedStandingMeetupId}
                        isAdmin={isAdmin}
                        onBack={() => {
                            setSelectedStandingMeetupId(null);
                            setSelectedOccurrenceDate(null);
                        }}
                        initialOccurrenceDate={selectedOccurrenceDate || undefined}
                    />
                ) : showCreateStandingMeetup && isAdmin ? (
                    <CreateStandingMeetup
                        clubId={clubId}
                        clubName={club.name}
                        organizerStripeAccountId={
                            // For club-hosted meetups, ALWAYS use club's Stripe account first
                            // Priority: 1. Club's stripeConnectedAccountId, 2. Club's stripeAccountId (legacy)
                            // Only fall back to organizer's personal account if club has no Stripe account
                            (club as any).stripeConnectedAccountId &&
                            !(club as any).stripeConnectedAccountId.startsWith('acct_test')
                                ? (club as any).stripeConnectedAccountId
                                : ((club as any).stripeAccountId &&
                                   !(club as any).stripeAccountId.startsWith('acct_test')
                                    ? (club as any).stripeAccountId
                                    : (userProfile as any)?.stripeConnectedAccountId || '')
                        }
                        onSuccess={(meetupId) => {
                            setShowCreateStandingMeetup(false);
                            setSelectedStandingMeetupId(meetupId);
                        }}
                        onCancel={() => setShowCreateStandingMeetup(false)}
                    />
                ) : (
                    <div className="space-y-4">
                        {/* Sub-tabs: Calendar | Management (Management only for admins) */}
                        <div className="flex gap-2 border-b border-gray-700 pb-3 overflow-x-auto">
                            <button
                                onClick={() => setWeeklyMeetupsView('calendar')}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                                    weeklyMeetupsView === 'calendar'
                                        ? 'bg-lime-600 text-white'
                                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                }`}
                            >
                                Calendar
                            </button>
                            {isAdmin && (
                                <button
                                    onClick={() => setWeeklyMeetupsView('management')}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                                        weeklyMeetupsView === 'management'
                                            ? 'bg-lime-600 text-white'
                                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                    }`}
                                >
                                    Management
                                </button>
                            )}
                        </div>

                        {/* Calendar sub-tab content */}
                        {weeklyMeetupsView === 'calendar' && (
                            <WeeklyMeetupsCalendar
                                clubId={clubId}
                                onOpenOccurrence={(meetupId, occurrenceDate) => {
                                    setSelectedStandingMeetupId(meetupId);
                                    setSelectedOccurrenceDate(occurrenceDate);
                                }}
                            />
                        )}

                        {/* Management sub-tab content - Admin only */}
                        {weeklyMeetupsView === 'management' && isAdmin && (
                            <StandingMeetupsList
                                clubId={clubId}
                                clubName={club.name}
                                isAdmin={isAdmin}
                                onCreateNew={() => setShowCreateStandingMeetup(true)}
                                onViewMeetup={(meetupId) => setSelectedStandingMeetupId(meetupId)}
                            />
                        )}
                    </div>
                )
            )}

            {/* Finance Tab - Admin Only, when Stripe connected */}
            {activeTab === 'finance' && isAdmin && (club as any).stripeConnectedAccountId && (
                <FinanceTab
                    clubId={clubId}
                    stripeAccountId={(club as any).stripeConnectedAccountId}
                />
            )}

            {/* Settings Tab - Admin Only */}
            {activeTab === 'settings' && isAdmin && (
                <div className="space-y-6">
                    <h2 className="text-xl font-bold text-white mb-4">Club Settings</h2>

                    {/* Stripe Connect Success Banner */}
                    {stripeConnectSuccess && (
                        <div className="bg-green-900/50 border border-green-700 text-green-200 px-4 py-3 rounded-lg flex items-center gap-3">
                            <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="font-medium">Stripe account connected successfully! You can now accept payments.</span>
                            <button
                                onClick={() => setStripeConnectSuccess(false)}
                                className="ml-auto text-green-300 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>
                    )}

                    {/* Club Profile Settings */}
                    <ClubSettingsForm
                        club={club}
                        onUpdate={() => {
                            // Club subscription will auto-refresh
                        }}
                    />

                    {/* Stripe Connect */}
                    <ClubStripeConnect
                        clubId={clubId}
                        clubName={club.name}
                        clubEmail={(club as any).contactEmail}
                        isAdmin={isAdmin}
                    />
                </div>
            )}

            {/* Import Modal - uses onComplete not onSuccess */}
            {isImportModalOpen && (
                <BulkClubImport
                    clubId={clubId}
                    onClose={() => setIsImportModalOpen(false)}
                    onComplete={() => {
                        setIsImportModalOpen(false);
                    }}
                />
            )}
        </div>
    );
};

export default ClubDetailPage;
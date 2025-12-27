import React, { useState, useEffect } from 'react';
import { Header } from './components/Header'; 
import { BottomNav } from './components/BottomNav';
import { Profile } from './components/Profile';
import { TournamentManager } from './components/TournamentManager';
import { TournamentDashboard } from './components/TournamentDashboard';
import { UserDashboard } from './components/UserDashboard';
import { CreateTournament } from './components/CreateTournament';
import { CreateClub } from './components/CreateClub';
import { ClubsList } from './components/ClubsList';
import { ClubDetailPage } from './components/ClubDetailPage';
import { PlayerDirectory } from './components/PlayerDirectory';
import { PartnerInvites } from './components/PartnerInvites';
import { TournamentEventSelection } from './components/registration/TournamentEventSelection';
import { AdminUsersPage } from './components/AdminUsersPage';
import { MeetupsList } from './components/meetups/MeetupsList';
import { CreateMeetup } from './components/meetups/CreateMeetup';
import { MeetupDetail } from './components/meetups/MeetupDetail';
import type { Tournament, PartnerInvite, UserProfile } from './types';
import { useAuth } from './contexts/AuthContext';
import { LoginModal } from './components/auth/LoginModal';
import { FirebaseConfigModal } from './components/auth/FirebaseConfigModal';
import { 
    subscribeToTournaments, 
    saveTournament, 
    saveFirebaseConfig, 
    hasCustomConfig,
    isFirebaseConfigured,
    subscribeToUserPartnerInvites,
    respondToPartnerInvite,
    getAllTournaments,
    getUserProfile,
    ensureRegistrationForUser
} from './services/firebase';
import { PickleballDirectorLogo } from './components/icons/PickleballDirectorLogo';
import { PickleballIcon } from './components/icons/PickleballIcon';

const VerificationBanner: React.FC = () => {
    const { resendVerificationEmail, reloadUser } = useAuth();
    const [message, setMessage] = useState('');
    const [isReloading, setIsReloading] = useState(false);

    const handleResend = async () => {
        setMessage('');
        try {
            await resendVerificationEmail();
            setMessage('Email sent! If the link is not clickable, please copy/paste it.');
        } catch (error) {
            setMessage('Failed to send verification email.');
            console.error(error);
        }
    }

    const handleCheckVerification = async () => {
        setIsReloading(true);
        setMessage('');
        try {
            await reloadUser();
        } catch (error) {
            setMessage('Error checking status. Please try again.');
            console.error(error);
        } finally {
            setIsReloading(false);
        }
    };

    return (
        <div className="bg-yellow-900/50 border-b border-yellow-700 text-yellow-300 text-sm py-3 px-4">
            <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
                <div>
                    <p className="font-bold">Action Required: Please verify your email.</p>
                    <p className="text-xs text-yellow-400/70 mt-0.5">
                        Check your spam folder. If the link isn't clickable, copy and paste it into your browser.
                    </p>
                </div>
                <div className='flex items-center gap-2 mt-1 sm:mt-0'>
                    {message && <span className="text-xs text-yellow-200 font-bold animate-pulse">{message}</span>}
                    <button onClick={handleResend} className="hover:text-white text-xs underline">Resend Email</button>
                    <span className="text-yellow-700">|</span>
                    <button 
                        onClick={handleCheckVerification} 
                        disabled={isReloading} 
                        className="bg-yellow-800/50 hover:bg-yellow-800 px-3 py-1 rounded border border-yellow-700 text-xs font-bold transition-colors"
                    >
                        {isReloading ? 'Checking...' : "I've Verified"}
                    </button>
                </div>
            </div>
        </div>
    );
};

const PlaceholderView: React.FC<{ title: string; icon?: React.ReactNode; message?: string; onBack?: () => void }> = ({ title, icon, message, onBack }) => (
    <div className="max-w-4xl mx-auto mt-8">
        {onBack && (
            <button 
                onClick={onBack}
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-4 pl-1 focus:outline-none"
            >
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                 Back to Dashboard
            </button>
        )}
        <div className="flex flex-col items-center justify-center h-[60vh] text-center p-8 bg-gray-800 rounded-xl border border-gray-700 shadow-xl">
            <div className="bg-gray-700/50 p-6 rounded-full mb-6 text-green-400">
                {icon || <PickleballIcon className="w-16 h-16" />}
            </div>
            <h2 className="text-3xl font-bold text-white mb-3">{title}</h2>
            <p className="text-gray-400 text-lg max-w-md mx-auto">
                {message || "This feature is currently under development. Check back soon!"}
            </p>
        </div>
    </div>
  );

const LoggedOutWelcome: React.FC<{ onLoginClick: () => void }> = ({ onLoginClick }) => {
    return (
        <div className="min-h-screen bg-gray-900 flex flex-col">
             <Header 
                activeView="home"
                onNavigate={() => {}}
                onLoginClick={onLoginClick}
                onLogout={() => {}}
                currentUser={null}
                userProfile={null}
             />
             <div className="flex-grow flex items-center justify-center p-4">
                <div className="text-center max-w-3xl mx-auto">
                    <div className="mb-8 flex justify-center">
                         <PickleballDirectorLogo className="h-24 w-auto" />
                    </div>
                    <h1 className="text-5xl font-extrabold text-white mb-6 tracking-tight">
                        The Professional Standard for <br/>
                        <span className="text-green-400">PickleballDirector</span>
                    </h1>
                    <p className="text-gray-400 mb-8 text-xl leading-relaxed">
                        Organize tournaments, track ratings, and manage leagues with the platform built for serious pickleball directors.
                    </p>
                    <div className="flex justify-center gap-4">
                         <button
                            onClick={onLoginClick}
                            className="bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-10 rounded-lg transition-all transform hover:scale-105 shadow-lg shadow-green-900/50 text-lg"
                        >
                            Get Started Free
                        </button>
                        <button className="bg-gray-800 hover:bg-gray-700 text-white font-bold py-4 px-10 rounded-lg transition-all border border-gray-700 text-lg">
                            View Demo
                        </button>
                    </div>
                </div>
             </div>
        </div>
    );
};

const App: React.FC = () => {
    // ==========================================
    // FIREBASE CONFIG CHECK (Added for AI Studio)
    // ==========================================
    const [firebaseReady, setFirebaseReady] = useState(false);
    const [checkingConfig, setCheckingConfig] = useState(true);
    
    useEffect(() => {
        console.log('🔍 App: Checking Firebase configuration...');
        const configured = isFirebaseConfigured();
        console.log('🔍 App: Firebase configured?', configured);
        setFirebaseReady(configured);
        setCheckingConfig(false);
    }, []);

    const { currentUser, userProfile, loading, isOrganizer, isAppAdmin, logout, reloadUser } = useAuth();
    const [isLoginModalOpen, setLoginModalOpen] = useState(false);
    const [isConfigModalOpen, setConfigModalOpen] = useState(false);
    
    // Views - Expanded for new navigation
    const [view, setView] = useState<string>('dashboard');
    const [activeTournamentId, setActiveTournamentId] = useState<string | null>(null);
    const [activeClubId, setActiveClubId] = useState<string | null>(null);
    const [activeMeetupId, setActiveMeetupId] = useState<string | null>(null);
    
    // Wizard auto-open state
    const [wizardProps, setWizardProps] = useState<{ isOpen: boolean; mode?: 'full'|'waiver_only'; divisionId?: string } | null>(null);

    // Event Selection State
    const [eventSelectionTournamentId, setEventSelectionTournamentId] = useState<string | null>(null);
    const [eventSelectionPreselectedDivisionIds, setEventSelectionPreselectedDivisionIds] = useState<string[]>([]);

    // Data
    const [tournaments, setTournaments] = useState<Tournament[]>([]);

    // Partner Invite State
    const [pendingInvites, setPendingInvites] = useState<PartnerInvite[]>([]);
    const [invitePopupVisible, setInvitePopupVisible] = useState(true);
    const [tournamentsById, setTournamentsById] = useState<Record<string, Tournament>>({});
    const [usersById, setUsersById] = useState<Record<string, UserProfile>>({});

    // Show config modal if not configured
    useEffect(() => {
        if (!checkingConfig && !firebaseReady) {
            console.log('⚠️ Firebase not configured, showing config modal');
            setConfigModalOpen(true);
        }
    }, [checkingConfig, firebaseReady]);

    useEffect(() => {
        if (currentUser && firebaseReady) {
            const unsubscribe = subscribeToTournaments(currentUser.uid, (data) => {
                setTournaments(data);
            });
            return () => unsubscribe();
        } else {
            setTournaments([]);
        }
    }, [currentUser, firebaseReady]);

    // Subscribe to Invites
    useEffect(() => {
        if (!currentUser || !firebaseReady) {
            setPendingInvites([]);
            return;
        }
        const unsub = subscribeToUserPartnerInvites(currentUser.uid, (invites) => {
            setPendingInvites(invites || []);
            if (invites && invites.length > 0) setInvitePopupVisible(true);
        });
        return () => unsub();
    }, [currentUser?.uid, firebaseReady]);

    // Load Tournament Metadata for Popup
    useEffect(() => {
        if (!firebaseReady) return;
        const load = async () => {
            const all = await getAllTournaments(200);
            const map: Record<string, Tournament> = {};
            all.forEach(t => { map[t.id] = t; });
            setTournamentsById(map);
        };
        load();
    }, [firebaseReady]);

    // Load Inviter Metadata for Popup
    useEffect(() => {
        if (!firebaseReady) return;
        const loadInviters = async () => {
            const missingIds = Array.from(
                new Set(
                    pendingInvites
                    .map(i => i.inviterId)
                    .filter(id => id && !usersById[id])
                )
            );
            if (missingIds.length === 0) return;
            
            const profiles = await Promise.all(missingIds.map(id => getUserProfile(id)));
            setUsersById(prev => {
                const map = { ...prev };
                profiles.filter(Boolean).forEach(p => { if (p) map[p.id] = p; });
                return map;
            });
        };
        if (pendingInvites.length > 0) {
            loadInviters();
        }
    }, [pendingInvites, usersById, firebaseReady]);

    // Check for verification redirect from email
    useEffect(() => {
        if (currentUser && !currentUser.emailVerified) {
            const params = new URLSearchParams(window.location.search);
            if (params.get('verified') === 'true') {
                window.history.replaceState(null, '', window.location.pathname);
                reloadUser().catch(console.error);
            }
        }
    }, [currentUser, reloadUser]);

    const handleCreateTournament = async (newTournament: Tournament) => {
        try {
            setTournaments(prev => [...prev, newTournament]);
            setActiveTournamentId(newTournament.id);
            setView('tournaments'); 
            await saveTournament(newTournament);
        } catch (e) {
            console.error("Failed to create tournament", e);
            alert("Failed to save tournament. Please check your connection.");
        }
    };

    const handleUpdateTournament = async (updatedTournament: Tournament) => {
        try {
            await saveTournament(updatedTournament);
        } catch (e) {
            console.error("Failed to update tournament", e);
            alert("Failed to save changes. Please check your connection.");
        }
    };

    const handleBackToDashboard = () => {
        setActiveTournamentId(null);
        if (view === 'createTournament') setView('tournaments');
    };

    const handleNavigate = (newView: string) => {
        if (newView === 'createTournament' && !isOrganizer) return;
        if (newView === 'adminUsers' && !isAppAdmin) return;
        
        setView(newView);
        setActiveTournamentId(null);
        setActiveClubId(null);
        setActiveMeetupId(null);
        setWizardProps(null);
    };

    const handleLogout = async () => {
        await logout();
        setView('dashboard');
    };

    const handleSaveConfig = (configJson: string) => {
        const result = saveFirebaseConfig(configJson);
        if (result.success) {
            setFirebaseReady(true);
            setConfigModalOpen(false);
        }
        return result;
    };
    
    const handleAcceptInvite = (tournamentId: string, divisionId: string) => {
        setActiveTournamentId(tournamentId);
        setWizardProps({
            isOpen: true,
            mode: 'waiver_only',
            divisionId
        });
    };

    const handlePopupAccept = async (invite: PartnerInvite) => {
        try {
            const result = await respondToPartnerInvite(invite, 'accepted');
            if (result && currentUser) {
                await ensureRegistrationForUser(result.tournamentId, currentUser.uid, result.divisionId);
                handleAcceptInvite(result.tournamentId, result.divisionId);
            }
        } catch (e) {
            console.error("Accept invite failed", e);
        }
    };

    // ==========================================
    // LOADING STATES
    // ==========================================
    
    // Show loading while checking config
    if (checkingConfig) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center text-gray-500">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
                    <p>Initializing PickleballDirector...</p>
                </div>
            </div>
        );
    }

    // Show config modal if Firebase not ready
    if (!firebaseReady) {
        return (
            <>
                <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                    <div className="text-center max-w-md p-8">
                        <PickleballDirectorLogo className="h-20 w-auto mx-auto mb-6" />
                        <h2 className="text-2xl font-bold text-white mb-4">Database Connection Required</h2>
                        <p className="text-gray-400 mb-6">
                            Please connect your Firebase database to continue.
                        </p>
                        <button
                            onClick={() => setConfigModalOpen(true)}
                            className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-lg transition-all"
                        >
                            Connect Database
                        </button>
                    </div>
                </div>
                {isConfigModalOpen && <FirebaseConfigModal onSave={handleSaveConfig} />}
            </>
        );
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center text-gray-500">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
                    <p>Loading PickleballDirector...</p>
                </div>
            </div>
        );
    }

    if (!currentUser) {
        return (
            <>
                <LoggedOutWelcome onLoginClick={() => setLoginModalOpen(true)} />

                {isLoginModalOpen && (
                    <LoginModal 
                        onClose={() => setLoginModalOpen(false)} 
                        onOpenConfig={() => {
                            setLoginModalOpen(false);
                            setConfigModalOpen(true);
                        }}
                    />
                )}

                {isConfigModalOpen && <FirebaseConfigModal onSave={handleSaveConfig} />}
            </>
        );
    }

    const activeTournament = tournaments.find(t => t.id === activeTournamentId);

    // ==========================================
    // MAIN AUTHENTICATED LAYOUT
    // ==========================================
    return (
        <div className="min-h-screen bg-gray-900 flex flex-col font-sans text-gray-100 relative w-full overflow-x-hidden">
            <Header 
                activeView={view}
                onNavigate={handleNavigate}
                onLoginClick={() => setLoginModalOpen(true)}
                onLogout={handleLogout}
                currentUser={currentUser}
                userProfile={userProfile}
                onAcceptInvite={handleAcceptInvite}
            />

            <BottomNav activeView={view} onNavigate={handleNavigate} />

            {/* Partner Invite Popup */}
            {pendingInvites.length > 0 && invitePopupVisible && (
                <div className="fixed inset-x-0 top-16 z-50 flex justify-center px-4 sm:px-0 pointer-events-none">
                    <div className="pointer-events-auto max-w-xl w-full bg-gray-900 border border-green-500/60 shadow-2xl rounded-xl p-4 sm:p-5 flex flex-col gap-3 animate-fade-in mt-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-600 text-white text-xs font-bold">
                                    {pendingInvites.length}
                                </span>
                                <h3 className="text-sm sm:text-base font-bold text-white">
                                    Partner invite{pendingInvites.length > 1 ? 's' : ''} waiting
                                </h3>
                            </div>
                            <button
                                onClick={() => setInvitePopupVisible(false)}
                                className="text-gray-400 hover:text-gray-200 text-xs sm:text-sm"
                            >
                                Dismiss
                            </button>
                        </div>

                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {pendingInvites.map(invite => {
                                const t = tournamentsById[invite.tournamentId];
                                const inviter = usersById[invite.inviterId];
                                const labelTournament = t ? t.name : 'Unknown Tournament';
                                const labelInviter = inviter ? inviter.displayName : 'Unknown Player';

                                return (
                                    <div
                                        key={invite.id}
                                        className="bg-gray-800 border border-gray-700 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                                    >
                                        <div className="text-xs sm:text-sm text-gray-200">
                                            <div className="font-semibold">
                                                {labelInviter} invited you as a doubles partner
                                            </div>
                                            <div className="text-[11px] text-gray-400">
                                                Tournament: {labelTournament}
                                            </div>
                                        </div>
                                        <div className="flex gap-2 justify-end">
                                            <button
                                                className="px-3 py-1 rounded text-xs sm:text-sm bg-green-600 hover:bg-green-500 text-white font-semibold"
                                                onClick={() => handlePopupAccept(invite)}
                                            >
                                                Accept
                                            </button>
                                            <button
                                                className="px-3 py-1 rounded text-xs sm:text-sm bg-red-700/80 hover:bg-red-600 text-white font-semibold"
                                                onClick={async () => {
                                                    await respondToPartnerInvite(invite, 'declined');
                                                }}
                                            >
                                                Decline
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="text-[11px] text-gray-500 flex justify-between items-center">
                            <span>
                                You can also manage these under <strong>My Invites</strong> in the menu.
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {currentUser && !currentUser.emailVerified && <VerificationBanner />}

            <main className="flex-grow p-4 md:p-8 pb-24 md:pb-8 overflow-y-auto w-full">
                <div className="container mx-auto">
                    {isConfigModalOpen && <FirebaseConfigModal onSave={handleSaveConfig} />}

                    {/* ==========================================
                        CONTENT SWITCHER - ALL VIEWS
                        ========================================== */}
                    {activeTournament ? (
                        <TournamentManager 
                            tournament={activeTournament} 
                            onUpdateTournament={handleUpdateTournament}
                            isVerified={!!currentUser.emailVerified} 
                            onBack={handleBackToDashboard}
                            initialWizardState={wizardProps}
                            clearWizardState={() => setWizardProps(null)}
                        />
                    ) : view === 'createTournament' ? (
                        isOrganizer ? (
                            <CreateTournament 
                                onCreateTournament={handleCreateTournament} 
                                onCancel={() => setView('tournaments')} 
                                onCreateClub={() => setView('createClub')}
                                userId={currentUser.uid}
                            />
                        ) : (
                            <div className="text-center py-20">
                                <h2 className="text-2xl font-bold text-red-400 mb-2">Access Denied</h2>
                                <button onClick={() => setView('dashboard')} className="mt-4 text-green-400 hover:underline">Back to Dashboard</button>
                            </div>
                        )
                    ) : view === 'createClub' ? (
                        <CreateClub 
                            onClubCreated={() => setView('clubs')}
                            onCancel={() => setView('clubs')}
                        />
                    ) : view === 'clubDetail' && activeClubId ? (
                        <ClubDetailPage 
                            clubId={activeClubId} 
                            onBack={() => { setActiveClubId(null); setView('clubs'); }} 
                        />
                    ) : view === 'dashboard' ? (
                        <UserDashboard 
                            userProfile={userProfile || {
                                id: currentUser.uid, 
                                email: currentUser.email || '', 
                                displayName: currentUser.displayName || 'User',
                                roles: ['player']
                            }}
                            onEditProfile={() => setView('profile')}
                            onNavigate={handleNavigate}
                        />
                    ) : view === 'profile' ? (
                        <Profile onBack={() => setView('dashboard')} />
                    ) : view === 'adminUsers' && isAppAdmin ? (
                        <AdminUsersPage onBack={() => setView('dashboard')} />
                    ) : view === 'meetups' ? (
                        <MeetupsList 
                            onCreateClick={() => setView('create_meetup')}
                            onSelectMeetup={(id) => { setActiveMeetupId(id); setView('meetup_detail'); }}
                        />
                    ) : view === 'create_meetup' ? (
                        <CreateMeetup 
                            onBack={() => setView('meetups')}
                            onCreated={() => setView('meetups')}
                        />
                    ) : view === 'meetup_detail' && activeMeetupId ? (
                        <MeetupDetail 
                            meetupId={activeMeetupId}
                            onBack={() => { setActiveMeetupId(null); setView('meetups'); }}
                        />
                    ) : view === 'tournaments' ? (
                        <TournamentDashboard 
                            tournaments={tournaments}
                            onSelectTournament={setActiveTournamentId}
                            onCreateTournamentClick={() => { if (isOrganizer) setView('createTournament'); }}
                            onlyMyEvents={false}
                            onBack={() => setView('dashboard')}
                        />
                    ) : view === 'myTournaments' ? (
                        <TournamentDashboard 
                            tournaments={tournaments}
                            onSelectTournament={setActiveTournamentId}
                            onCreateTournamentClick={() => { if (isOrganizer) setView('createTournament'); }}
                            onlyMyEvents={true}
                            onBack={() => setView('dashboard')}
                        />
                    ) : view === 'invites' ? (
                        <PartnerInvites
                            onAcceptInvites={(tournamentId, divisionIds) => {
                                setEventSelectionTournamentId(tournamentId);
                                setEventSelectionPreselectedDivisionIds(divisionIds);
                                setView('tournamentEvents');
                            }}
                            onCompleteWithoutSelection={() => setView('dashboard')}
                        />
                    ) : view === 'tournamentEvents' && eventSelectionTournamentId ? (
                        <TournamentEventSelection
                            tournamentId={eventSelectionTournamentId}
                            preselectedDivisionIds={eventSelectionPreselectedDivisionIds}
                            onBack={() => {
                                setView('invites');
                            }}
                            onContinue={(selectedDivisionIds) => {
                                if (selectedDivisionIds.length > 0) {
                                    handleAcceptInvite(eventSelectionTournamentId, selectedDivisionIds[0]);
                                }
                            }}
                        />
                    ) : view === 'myResults' ? (
                        <PlaceholderView 
                            title="My Results" 
                            icon={<svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>}
                            message="Your personal match history and statistics across all tournaments."
                            onBack={() => setView('dashboard')}
                        />
                    ) : view === 'results' ? (
                        <PlaceholderView 
                            title="Match Results" 
                            message="View recent match scores and tournament outcomes here soon." 
                            onBack={() => setView('dashboard')}
                        />
                    ) : view === 'leagues' ? (
                        <PlaceholderView 
                            title="Leagues" 
                            message="Join ladder leagues and season-long competitions." 
                            onBack={() => setView('dashboard')}
                        />
                    ) : view === 'teamLeagues' ? (
                        <PlaceholderView 
                            title="Team Leagues" 
                            message="Manage team rosters and league fixtures." 
                            onBack={() => setView('dashboard')}
                        />
                    ) : view === 'clubs' ? (
                        <ClubsList 
                            onCreateClub={() => setView('createClub')}
                            onViewClub={(id) => { setActiveClubId(id); setView('clubDetail'); }}
                            onBack={() => setView('dashboard')}
                        />
                    ) : view === 'players' ? (
                        <PlayerDirectory onBack={() => setView('dashboard')} />
                    ) : view === 'myLeagues' ? (
                        <PlaceholderView 
                            title="My Leagues" 
                            icon={<svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>}
                            message="Join ladder leagues and season-long competitions." 
                            onBack={() => setView('dashboard')}
                        />
                    ) : view === 'myTeamLeagues' ? (
                        <PlaceholderView 
                            title="My Team Leagues" 
                            icon={<svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
                            message="Manage team rosters and league fixtures." 
                            onBack={() => setView('dashboard')}
                        />
                    ) : view === 'myClub' ? (
                        <ClubsList 
                            onCreateClub={() => setView('createClub')}
                            onViewClub={(id) => { setActiveClubId(id); setView('clubDetail'); }}
                            onBack={() => setView('dashboard')}
                        />
                    ) : (
                        // Fallback
                        <UserDashboard 
                            userProfile={userProfile || {
                                id: currentUser.uid, 
                                email: currentUser.email || '', 
                                displayName: currentUser.displayName || 'User',
                                roles: ['player']
                            }}
                            onEditProfile={() => setView('profile')}
                            onNavigate={handleNavigate}
                        />
                    )}
                </div>
            </main>
            
            <footer className="p-6 pb-28 md:pb-6 text-center border-t border-gray-800 text-gray-600 text-xs bg-gray-900 hidden md:block">
                <div className="flex justify-center gap-4 mb-2">
                    <button onClick={() => setConfigModalOpen(true)} className="hover:text-gray-400">
                        {hasCustomConfig() ? 'Database Settings' : 'Connect Database'}
                    </button>
                    <span>&middot;</span>
                    <a href="#" className="hover:text-gray-400">Support</a>
                    <span>&middot;</span>
                    <a href="#" className="hover:text-gray-400">Privacy Policy</a>
                </div>
                &copy; {new Date().getFullYear()} PickleballDirector
            </footer>
        </div>
    );
};

export default App;
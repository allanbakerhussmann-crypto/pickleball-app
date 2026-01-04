/**
 * LeagueDetail Component V05.50
 *
 * Shows league details, standings, matches, and allows joining/playing.
 * Now includes player management with drag-and-drop for organizers.
 * Auto-updates league status based on registration dates.
 *
 * FILE LOCATION: components/leagues/LeagueDetail.tsx
 * VERSION: V05.50
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  getLeague,
  getLeagueDivisions,
  subscribeToLeagueMembers,
  subscribeToLeagueMatches,
  joinLeague,
  leaveLeague,
  getLeagueMemberByUserId,
  updateLeague,
  subscribeToBoxLeaguePlayers,
  checkAndUpdateLeagueStatus,
} from '../../services/firebase';
import { LeagueScheduleManager } from './LeagueScheduleManager';
import { BoxPlayerDragDrop } from './boxLeague';
import { PlayerSeedingList } from './PlayerSeedingList';
import { LeagueMatchCard } from './LeagueMatchCard';
import { LeagueScoreEntryModal } from './LeagueScoreEntryModal';
import type {
  League,
  LeagueMember,
  LeagueMatch,
  LeagueDivision,
} from '../../types';
import type { BoxLeaguePlayer } from '../../types/boxLeague';
import { LeagueStandings } from './LeagueStandings';
import { DuprControlPanel } from '../shared/DuprControlPanel';

// ============================================
// TYPES
// ============================================

interface LeagueDetailProps {
  leagueId: string;
  onBack: () => void;
}

type TabType = 'standings' | 'matches' | 'players' | 'schedule' | 'dupr' | 'info';

// ============================================
// COMPONENT
// ============================================

export const LeagueDetail: React.FC<LeagueDetailProps> = ({ leagueId, onBack }) => {
  const { currentUser, userProfile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Data state
  const [league, setLeague] = useState<League | null>(null);
  const [divisions, setDivisions] = useState<LeagueDivision[]>([]);
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [matches, setMatches] = useState<LeagueMatch[]>([]);
  const [myMembership, setMyMembership] = useState<LeagueMember | null>(null);
  const [boxPlayers, setBoxPlayers] = useState<BoxLeaguePlayer[]>([]);
  
  // UI state
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('standings');
  const [selectedDivisionId, setSelectedDivisionId] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentCancelled, setPaymentCancelled] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<LeagueMatch | null>(null);
  const [showScoreEntryModal, setShowScoreEntryModal] = useState(false);
  const [showDuprAcknowledgement, setShowDuprAcknowledgement] = useState(false); // V07.12
  const [duprAcknowledged, setDuprAcknowledged] = useState(false); // V07.12
  const [editForm, setEditForm] = useState({
    // Basic Info
    name: '',
    description: '',
    location: '',
    venue: '',
    visibility: 'public' as 'public' | 'private' | 'club_only',
    
    // Schedule
    seasonStart: '',
    seasonEnd: '',
    registrationDeadline: '',
    registrationOpens: '',
    
    // Capacity & Restrictions
    maxMembers: '',
    minRating: '',
    maxRating: '',
    minAge: '',
    maxAge: '',
    
    // Match Format
    bestOf: 3 as 1 | 3 | 5,
    gamesTo: 11 as 11 | 15 | 21,
    winBy: 2 as 1 | 2,
    matchDeadlineDays: 7,
    allowSelfReporting: true,
    requireConfirmation: true,
    
    // Scoring Points
    pointsForWin: 3,
    pointsForDraw: 1,
    pointsForLoss: 0,
    pointsForForfeit: 0,
    pointsForNoShow: -1,
    
    // Pricing
    pricingEnabled: false,
    entryFee: 0,
    entryFeeType: 'per_player' as 'per_player' | 'per_team',
    feesPaidBy: 'player' as 'player' | 'organizer',
    refundPolicy: 'partial' as 'full' | 'partial' | 'none',
    
    // Early Bird
    earlyBirdEnabled: false,
    earlyBirdFee: 0,
    earlyBirdDeadline: '',
    
    // Late Fee
    lateFeeEnabled: false,
    lateFee: 0,
    lateRegistrationStart: '',
    
    // Format-specific (Round Robin)
    roundRobinRounds: 1,
    
    // Format-specific (Swiss)
    swissRounds: 4,
  });
  const [saving, setSaving] = useState(false);

  // ============================================
  // DATA LOADING
  // ============================================

  // Load league
  useEffect(() => {
    getLeague(leagueId).then((data) => {
      setLeague(data);
      if (data) {
        // Helper to format date for input
        const formatDateForInput = (timestamp: number | null | undefined): string => {
          if (!timestamp) return '';
          return new Date(timestamp).toISOString().split('T')[0];
        };
        
        setEditForm({
          // Basic Info
          name: data.name || '',
          description: data.description || '',
          location: data.location || '',
          venue: data.venue || '',
          visibility: data.visibility || 'public',
          
          // Schedule
          seasonStart: formatDateForInput(data.seasonStart),
          seasonEnd: formatDateForInput(data.seasonEnd),
          registrationDeadline: formatDateForInput(data.registrationDeadline),
          registrationOpens: formatDateForInput(data.registrationOpens),
          
          // Capacity & Restrictions
          maxMembers: data.settings?.maxMembers?.toString() || '',
          minRating: data.settings?.minRating?.toString() || '',
          maxRating: data.settings?.maxRating?.toString() || '',
          minAge: data.settings?.minAge?.toString() || '',
          maxAge: data.settings?.maxAge?.toString() || '',
          
          // Match Format
          bestOf: data.settings?.matchFormat?.bestOf || 3,
          gamesTo: data.settings?.matchFormat?.gamesTo || 11,
          winBy: data.settings?.matchFormat?.winBy || 2,
          matchDeadlineDays: data.settings?.matchDeadlineDays ?? 7,
          allowSelfReporting: data.settings?.allowSelfReporting ?? true,
          requireConfirmation: data.settings?.requireConfirmation ?? true,
          
          // Scoring Points
          pointsForWin: data.settings?.pointsForWin ?? 3,
          pointsForDraw: data.settings?.pointsForDraw ?? 1,
          pointsForLoss: data.settings?.pointsForLoss ?? 0,
          pointsForForfeit: data.settings?.pointsForForfeit ?? 0,
          pointsForNoShow: data.settings?.pointsForNoShow ?? -1,
          
          // Pricing
          pricingEnabled: data.pricing?.enabled || false,
          entryFee: data.pricing?.entryFee || 0,
          entryFeeType: data.pricing?.entryFeeType || 'per_player',
          feesPaidBy: data.pricing?.feesPaidBy || 'player',
          refundPolicy: data.pricing?.refundPolicy || 'partial',
          
          // Early Bird
          earlyBirdEnabled: data.pricing?.earlyBirdEnabled || false,
          earlyBirdFee: data.pricing?.earlyBirdFee || 0,
          earlyBirdDeadline: formatDateForInput(data.pricing?.earlyBirdDeadline),
          
          // Late Fee
          lateFeeEnabled: data.pricing?.lateFeeEnabled || false,
          lateFee: data.pricing?.lateFee || 0,
          lateRegistrationStart: formatDateForInput(data.pricing?.lateRegistrationStart),
          
          // Format-specific
          roundRobinRounds: data.settings?.roundRobinSettings?.rounds || 1,
          swissRounds: data.settings?.swissSettings?.rounds || 4,
        });
      }
      setLoading(false);
    });
  }, [leagueId]);

  // Auto-check and update league status based on registration dates
  useEffect(() => {
    if (league) {
      // Check if league status should be updated based on dates
      // This runs for any viewer - first viewer after date passes triggers update
      checkAndUpdateLeagueStatus(league).then(({ wasUpdated, newStatus }) => {
        if (wasUpdated) {
          console.log(`League status auto-updated to: ${newStatus}`);
          // Refresh league data if status was updated
          getLeague(leagueId).then(setLeague);
        }
      });
    }
  }, [league?.id, league?.status, league?.registrationOpens, league?.registrationDeadline, leagueId]);

  // Handle payment success/cancel from Stripe redirect
  const paymentParam = searchParams.get('payment');
  useEffect(() => {
    if (paymentParam === 'success' && currentUser && userProfile) {
      console.log('Payment success detected, joining league...');
      setPaymentSuccess(true);
      
      // Clear the query param from URL immediately
      setSearchParams({});
      
      // Join the league - don't check myMembership as it may not be loaded yet
      const doJoin = async () => {
        try {
          // First check if already a member (to avoid duplicates)
          const existingMembership = await getLeagueMemberByUserId(leagueId, currentUser.uid);
          
          if (existingMembership) {
            console.log('Already a member, skipping join');
            setMyMembership(existingMembership);
          } else {
            console.log('Joining league...');
            await joinLeague(
              leagueId,
              currentUser.uid,
              userProfile.displayName || 'Player',
              null // divisionId
            );
            console.log('Join successful, fetching membership...');
            const newMembership = await getLeagueMemberByUserId(leagueId, currentUser.uid);
            setMyMembership(newMembership);
            console.log('Membership set:', newMembership);
          }
        } catch (error) {
          console.error('Failed to join league after payment:', error);
          alert('Payment successful but failed to join league. Please contact support.');
        }
      };
      
      doJoin();
      
      // Auto-hide success message after 5 seconds
      setTimeout(() => setPaymentSuccess(false), 5000);
    } else if (paymentParam === 'cancelled') {
      setPaymentCancelled(true);
      setSearchParams({});
      setTimeout(() => setPaymentCancelled(false), 5000);
    }
  }, [paymentParam, currentUser, userProfile, leagueId, setSearchParams]);

  // Load divisions
  useEffect(() => {
    if (league?.hasDivisions) {
      getLeagueDivisions(leagueId).then(setDivisions);
    }
  }, [leagueId, league?.hasDivisions]);

  // Subscribe to members
  useEffect(() => {
    const unsubscribe = subscribeToLeagueMembers(leagueId, setMembers);
    return () => unsubscribe();
  }, [leagueId]);

  // Subscribe to matches
  useEffect(() => {
    const unsubscribe = subscribeToLeagueMatches(leagueId, setMatches);
    return () => unsubscribe();
  }, [leagueId]);

  // Subscribe to box league players (only for box_league format)
  useEffect(() => {
    if (league?.format === 'box_league') {
      const unsubscribe = subscribeToBoxLeaguePlayers(leagueId, setBoxPlayers);
      return () => unsubscribe();
    }
  }, [leagueId, league?.format]);

  // Get my membership
  useEffect(() => {
    if (currentUser) {
      getLeagueMemberByUserId(leagueId, currentUser.uid).then(setMyMembership);
    }
  }, [leagueId, currentUser, members]);

  // ============================================
  // HELPERS
  // ============================================

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-gray-600 text-gray-200',
      registration: 'bg-blue-600 text-blue-100',
      active: 'bg-green-600 text-green-100',
      playoffs: 'bg-yellow-600 text-yellow-100',
      completed: 'bg-purple-600 text-purple-100',
      cancelled: 'bg-red-600 text-red-100',
    };
    const labels: Record<string, string> = {
      draft: 'Draft',
      registration: 'Registration Open',
      active: 'In Progress',
      playoffs: 'Playoffs',
      completed: 'Completed',
      cancelled: 'Cancelled',
    };
    return (
      <span className={`text-xs px-2 py-1 rounded-full font-semibold ${styles[status] || 'bg-gray-600'}`}>
        {labels[status] || status}
      </span>
    );
  };

  const getFormatLabel = (format: string) => {
    const labels: Record<string, string> = {
      ladder: '🪜 Ladder',
      round_robin: '🔄 Round Robin',
      swiss: '🎯 Swiss',
      box_league: '📦 Box League',
    };
    return labels[format] || format;
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      singles: 'Singles',
      doubles: 'Doubles',
      mixed_doubles: 'Mixed Doubles',
      team: 'Team',
    };
    return labels[type] || type;
  };

  // Filter members by division
  const filteredMembers = selectedDivisionId
    ? members.filter(m => m.divisionId === selectedDivisionId)
    : members;

  // Filter matches by division
  const filteredMatches = useMemo(() => {
    return selectedDivisionId
      ? matches.filter(m => m.divisionId === selectedDivisionId)
      : matches;
  }, [matches, selectedDivisionId]);

  // ============================================
  // ACTIONS
  // ============================================

  const handleJoin = async () => {
    if (!currentUser || !userProfile) return;

    // Debug: Log payment check
    console.log('Join clicked - Payment check:', {
      pricingEnabled: league?.pricing?.enabled,
      entryFee: league?.pricing?.entryFee,
      organizerStripeAccountId: league?.organizerStripeAccountId,
    });

    // V07.12: Check if DUPR league requires acknowledgement
    // Note: duprSettings is stored inside league.settings.duprSettings
    const duprMode = league?.settings?.duprSettings?.mode;
    const isDuprLeague = duprMode === 'optional' || duprMode === 'required';
    console.log('DUPR check:', {
      duprSettings: league?.settings?.duprSettings,
      mode: duprMode,
      isDuprLeague,
      duprAcknowledged,
    });
    if (isDuprLeague && !duprAcknowledged) {
      setShowDuprAcknowledgement(true);
      return;
    }

    // Check if league requires payment
    if (league?.pricing?.enabled && league.pricing.entryFee > 0) {
      // Show payment modal instead of direct join
      setShowPaymentModal(true);
      return;
    }

    // Free league - join directly
    setJoining(true);
    try {
      // TODO: For doubles/mixed, show partner selection modal
      await joinLeague(
        leagueId,
        currentUser.uid,
        userProfile.displayName || 'Player',
        selectedDivisionId
      );
      const membership = await getLeagueMemberByUserId(leagueId, currentUser.uid);
      setMyMembership(membership);
    } catch (e: any) {
      alert('Failed to join: ' + e.message);
    } finally {
      setJoining(false);
    }
  };
  
  // V07.12: Handle DUPR acknowledgement confirmation
  const handleDuprAcknowledge = () => {
    setDuprAcknowledged(true);
    setShowDuprAcknowledgement(false);
    // Continue with join flow
    handleJoin();
  };

  // Handle free registration (after payment or for free leagues)
  const handleFreeJoin = async () => {
    if (!currentUser || !userProfile) return;
    setJoining(true);
    try {
      await joinLeague(
        leagueId, 
        currentUser.uid, 
        userProfile.displayName || 'Player',
        selectedDivisionId
      );
      const membership = await getLeagueMemberByUserId(leagueId, currentUser.uid);
      setMyMembership(membership);
      setShowPaymentModal(false);
    } catch (e: any) {
      alert('Failed to join: ' + e.message);
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = async () => {
    if (!myMembership) return;
    if (!confirm('Are you sure you want to leave this league?')) return;
    try {
      await leaveLeague(leagueId, myMembership.id);
      setMyMembership(null);
    } catch (e: any) {
      alert('Failed to leave: ' + e.message);
    }
  };

  const handleChallenge = (member: LeagueMember) => {
    // TODO: Implement challenge modal
    alert(`Challenge ${member.displayName} - Coming soon!`);
    console.log('Challenge member:', member);
  };

  const handleScheduleGenerated = async () => {
    // Refresh league data after schedule generation
    const updated = await getLeague(leagueId);
    if (updated) setLeague(updated);
  };

  // ============================================
  // RENDER
  // ============================================

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-gray-400">Loading league...</div>
      </div>
    );
  }

  if (!league) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-bold text-white mb-2">League not found</h2>
        <button onClick={onBack} className="text-blue-400 hover:text-blue-300">
          ← Back to leagues
        </button>
      </div>
    );
  }

  const isDoublesOrMixed = league.type === 'doubles' || league.type === 'mixed_doubles';
  const isOrganizer = currentUser?.uid === league.createdByUserId;
  const canJoin = !myMembership && (league.status === 'registration' || league.status === 'active');

  // Determine which tabs to show - Schedule, Players, and DUPR tabs only for organizers
  const availableTabs: TabType[] = isOrganizer
    ? ['standings', 'matches', 'players', 'schedule', 'dupr', 'info']
    : ['standings', 'matches', 'info'];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Payment Success Banner */}
      {paymentSuccess && (
        <div className="bg-green-900/50 border border-green-500 rounded-xl p-4 mb-4 flex items-center gap-3">
          <svg className="w-6 h-6 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="font-semibold text-green-400">Payment Successful! 🎉</p>
            <p className="text-sm text-green-300">You have been registered for this league.</p>
          </div>
          <button 
            onClick={() => setPaymentSuccess(false)}
            className="ml-auto text-green-400 hover:text-green-300"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      
      {/* Payment Cancelled Banner */}
      {paymentCancelled && (
        <div className="bg-yellow-900/50 border border-yellow-500 rounded-xl p-4 mb-4 flex items-center gap-3">
          <svg className="w-6 h-6 text-yellow-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="font-semibold text-yellow-400">Payment Cancelled</p>
            <p className="text-sm text-yellow-300">Your payment was cancelled. You can try again when ready.</p>
          </div>
          <button 
            onClick={() => setPaymentCancelled(false)}
            className="ml-auto text-yellow-400 hover:text-yellow-300"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Back Button */}
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Leagues
      </button>

      {/* Organizer Controls - Only visible to league creator */}
      {isOrganizer && (
        <div className="bg-purple-900/30 border border-purple-600 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-purple-400 flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Organizer Controls
            </h3>
            <div className="flex items-center gap-2">
              {/* V07.12: Registration capacity indicator */}
              {league.settings?.maxMembers && (
                <span className={`text-xs px-2 py-1 rounded ${
                  members.length >= league.settings.maxMembers
                    ? 'bg-red-600/30 text-red-300'
                    : 'bg-gray-600/30 text-gray-300'
                }`}>
                  {members.length}/{league.settings.maxMembers} players
                  {members.length >= league.settings.maxMembers && ' (FULL)'}
                </span>
              )}
              <span className="text-xs bg-purple-600/30 text-purple-300 px-2 py-1 rounded">
                Status: {league.status.toUpperCase()}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {/* Draft -> Open Registration */}
            {league.status === 'draft' && (
              <button
                onClick={async () => {
                  if (confirm('Open registration? Players will be able to see and join this league.')) {
                    const { openLeagueRegistration } = await import('../../services/firebase');
                    await openLeagueRegistration(leagueId);
                    const updated = await getLeague(leagueId);
                    if (updated) setLeague(updated);
                  }
                }}
                className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg font-semibold text-sm transition-colors"
              >
                🚀 Open Registration
              </button>
            )}

            {/* V07.12: Close Registration (when registration is open) */}
            {league.status === 'registration' && (
              <button
                onClick={async () => {
                  if (confirm('Close registration? No more players will be able to join.')) {
                    await updateLeague(leagueId, { status: 'registration_closed' });
                    const updated = await getLeague(leagueId);
                    if (updated) setLeague(updated);
                  }
                }}
                className="bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-lg font-semibold text-sm transition-colors"
              >
                🔒 Close Registration
              </button>
            )}

            {/* Registration/Registration Closed -> Active (Start League) */}
            {(league.status === 'registration' || league.status === 'registration_closed') && (
              <button
                onClick={async () => {
                  if (members.length < 2) {
                    alert('Need at least 2 players to start the league.');
                    return;
                  }
                  if (confirm(`Start the league with ${members.length} players? Play will begin.`)) {
                    const { startLeague } = await import('../../services/firebase');
                    await startLeague(leagueId);
                    const updated = await getLeague(leagueId);
                    if (updated) setLeague(updated);
                  }
                }}
                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-semibold text-sm transition-colors"
              >
                ▶️ Start League
              </button>
            )}

            {/* Active -> Complete */}
            {league.status === 'active' && (
              <button
                onClick={async () => {
                  if (confirm('Complete the league? This will finalize standings.')) {
                    const { completeLeague } = await import('../../services/firebase');
                    await completeLeague(leagueId);
                    const updated = await getLeague(leagueId);
                    if (updated) setLeague(updated);
                  }
                }}
                className="bg-yellow-600 hover:bg-yellow-500 text-white px-4 py-2 rounded-lg font-semibold text-sm transition-colors"
              >
                🏆 Complete League
              </button>
            )}

            {/* Cancel (available for draft/registration) */}
            {(league.status === 'draft' || league.status === 'registration' || league.status === 'registration_closed') && (
              <button
                onClick={async () => {
                  if (confirm('Cancel this league? This cannot be undone.')) {
                    const { cancelLeague } = await import('../../services/firebase');
                    await cancelLeague(leagueId);
                    const updated = await getLeague(leagueId);
                    if (updated) setLeague(updated);
                  }
                }}
                className="bg-red-600/20 border border-red-600 text-red-400 hover:bg-red-600/30 px-4 py-2 rounded-lg font-semibold text-sm transition-colors"
              >
                ❌ Cancel League
              </button>
            )}
            
            {/* Edit League - available until registration deadline */}
            {(() => {
              const now = Date.now();
              const regDeadline = league.registrationDeadline;
              const canEdit = league.status === 'draft' || 
                              league.status === 'registration' || 
                              (league.status === 'active' && regDeadline && now < regDeadline);
              return canEdit ? (
                <button
                  onClick={() => setShowEditModal(true)}
                  className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded-lg font-semibold text-sm transition-colors"
                >
                  ✏️ Edit League
                </button>
              ) : null;
            })()}
            
            {/* Join as Organizer */}
            {!myMembership && (league.status === 'draft' || league.status === 'registration' || league.status === 'active') && (
              <button
                onClick={handleJoin}
                disabled={joining}
                className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg font-semibold text-sm transition-colors"
              >
                {joining ? 'Joining...' : '👤 Join as Player'}
              </button>
            )}
          </div>
          
          <p className="text-xs text-gray-400 mt-3">
            {league.status === 'draft' && "This league is not visible to other players yet. Open registration to allow signups."}
            {league.status === 'registration' && `${members.length} player${members.length !== 1 ? 's' : ''} registered. Start the league when ready.`}
            {league.status === 'active' && "League is in progress. Complete when all matches are finished."}
            {league.status === 'completed' && "This league has ended."}
            {league.status === 'cancelled' && "This league was cancelled."}
          </p>
        </div>
      )}

      {/* Header Card */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-white">{league.name}</h1>
              {getStatusBadge(league.status)}
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-400">
              <span className="bg-gray-700 px-2 py-0.5 rounded">{getTypeLabel(league.type)}</span>
              <span>{getFormatLabel(league.format)}</span>
              <span>•</span>
              <span>{league.memberCount || members.length} {isDoublesOrMixed ? 'teams' : 'players'}</span>
            </div>
          </div>
          
          {/* Join/Leave - For non-organizers */}
          {currentUser && !isOrganizer && (
            myMembership ? (
              <div className="text-right">
                <div className="text-sm text-gray-400 mb-1">
                  Your Rank: <span className="text-white font-bold text-lg">#{myMembership.currentRank}</span>
                </div>
                <div className="text-xs text-gray-500 mb-2">
                  {myMembership.stats.wins}W - {myMembership.stats.losses}L
                </div>
                <button
                  onClick={handleLeave}
                  className="text-red-400 hover:text-red-300 text-sm"
                >
                  Leave League
                </button>
              </div>
            ) : canJoin && (
              <button
                onClick={handleJoin}
                disabled={joining}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
              >
                {joining ? 'Joining...' : isDoublesOrMixed ? 'Register Team' : 'Join League'}
              </button>
            )
          )}
          
          {/* Member status for organizer who joined */}
          {currentUser && isOrganizer && myMembership && (
            <div className="text-right">
              <div className="text-sm text-gray-400 mb-1">
                Your Rank: <span className="text-white font-bold text-lg">#{myMembership.currentRank}</span>
              </div>
              <div className="text-xs text-gray-500">
                {myMembership.stats.wins}W - {myMembership.stats.losses}L
              </div>
            </div>
          )}
        </div>

        {league.description && (
          <p className="text-gray-400 text-sm mb-4">{league.description}</p>
        )}

        <div className="flex flex-wrap gap-4 pt-4 border-t border-gray-700 text-sm text-gray-500">
          <span>📅 {formatDate(league.seasonStart)} - {formatDate(league.seasonEnd)}</span>
          {league.location && <span>📍 {league.location}</span>}
          {league.clubName && <span>🏢 {league.clubName}</span>}
          {league.pricing?.enabled && (
            <span className="text-green-400">
              💰 ${(league.pricing.entryFee / 100).toFixed(2)} entry
            </span>
          )}
        </div>
      </div>

      {/* Division Selector (if applicable) */}
      {league.hasDivisions && divisions.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            <button
              onClick={() => setSelectedDivisionId(null)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                !selectedDivisionId
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              All Divisions
            </button>
            {divisions.map(div => (
              <button
                key={div.id}
                onClick={() => setSelectedDivisionId(div.id)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                  selectedDivisionId === div.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {div.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-700 overflow-x-auto">
        {availableTabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 px-4 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === tab
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {tab === 'standings' && '🏆 '}
            {tab === 'matches' && '🎾 '}
            {tab === 'players' && '👥 '}
            {tab === 'schedule' && '📅 '}
            {tab === 'dupr' && '📊 '}
            {tab === 'info' && 'ℹ️ '}
            {tab === 'dupr' ? 'DUPR' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* STANDINGS TAB */}
      {activeTab === 'standings' && league && (
        <LeagueStandings
          members={filteredMembers}
          format={league.format}
          leagueType={league.type}
          currentUserId={currentUser?.uid}
          myMembership={myMembership}
          onChallenge={league.format === 'ladder' && myMembership ? handleChallenge : undefined}
          challengeRange={league.settings?.challengeRules?.challengeRange || 3}
        />
      )}

      {/* MATCHES TAB */}
      {activeTab === 'matches' && (
        <div className="space-y-3">
          {filteredMatches.length === 0 ? (
            <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 text-center text-gray-400">
              No matches yet
            </div>
          ) : (
            filteredMatches.map(match => (
              <LeagueMatchCard
                key={match.id}
                match={match}
                currentUserId={currentUser?.uid}
                isOrganizer={isOrganizer}
                showWeek={league?.format === 'round_robin'}
                showRound={league?.format === 'swiss' || league?.format === 'box_league'}
                verificationSettings={league?.settings?.scoreVerification || undefined}
                onEnterScore={(m) => {
                  setSelectedMatch(m);
                  setShowScoreEntryModal(true);
                }}
                onViewDetails={(m) => {
                  setSelectedMatch(m);
                  setShowScoreEntryModal(true);
                }}
                onConfirmScore={(m) => {
                  setSelectedMatch(m);
                  setShowScoreEntryModal(true);
                }}
                onDisputeScore={(m) => {
                  setSelectedMatch(m);
                  setShowScoreEntryModal(true);
                }}
                leagueId={leagueId}
                duprClubId={league?.settings?.duprSettings?.duprClubId || undefined}
                leagueName={league?.name}
                showDuprButton={league?.settings?.duprSettings?.mode !== 'none'}
              />
            ))
          )}
        </div>
      )}

      {/* PLAYERS TAB - Organizer Only */}
      {activeTab === 'players' && isOrganizer && (
        <div className="space-y-4">
          {league.format === 'box_league' ? (
            // Box League: Show box-based drag-drop management
            <BoxPlayerDragDrop
              leagueId={leagueId}
              players={boxPlayers}
              boxCount={Math.ceil(boxPlayers.length / (league.settings?.boxSettings?.playersPerBox || 4))}
              boxSize={league.settings?.boxSettings?.playersPerBox || 4}
              onPlayersUpdated={() => {
                // Players will auto-update via subscription
              }}
              disabled={league.status === 'completed'}
            />
          ) : (
            // Other formats: Show seeding list
            <PlayerSeedingList
              leagueId={leagueId}
              members={filteredMembers}
              onMembersUpdated={() => {
                // Members will auto-update via subscription
              }}
              disabled={league.status === 'completed'}
              showStats={true}
            />
          )}

          {/* Help text */}
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <h4 className="text-sm font-medium text-gray-300 mb-2">
              {league.format === 'box_league' ? 'Managing Boxes' : 'Managing Seeding'}
            </h4>
            <p className="text-sm text-gray-500">
              {league.format === 'box_league'
                ? 'Drag players between boxes to rebalance skill levels. Players within a box will play against each other.'
                : 'Drag players to reorder their seeding. Seeding affects match generation and bracket placement.'}
            </p>
          </div>
        </div>
      )}

      {/* SCHEDULE TAB - Organizer Only */}
      {activeTab === 'schedule' && isOrganizer && (
        <LeagueScheduleManager
          league={league}
          members={members}
          matches={matches}
          divisions={divisions}
          onScheduleGenerated={handleScheduleGenerated}
        />
      )}

      {/* DUPR TAB - Organizer Only */}
      {activeTab === 'dupr' && isOrganizer && (
        <DuprControlPanel
          eventType="league"
          eventId={leagueId}
          eventName={league.name}
          matches={filteredMatches as any[]}
          isOrganizer={isOrganizer}
          currentUserId={currentUser?.uid || ''}
          onMatchUpdate={() => {
            // Matches will auto-update via subscription
          }}
        />
      )}

      {/* INFO TAB */}
      {activeTab === 'info' && (
        <div className="space-y-4">
          {/* Match Rules */}
          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <h3 className="text-lg font-bold text-white mb-4">Match Rules</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Format:</span>
                <span className="text-white ml-2">Best of {league.settings?.matchFormat?.bestOf || 3}</span>
              </div>
              <div>
                <span className="text-gray-500">Points/Game:</span>
                <span className="text-white ml-2">{league.settings?.matchFormat?.gamesTo || 11}</span>
              </div>
              <div>
                <span className="text-gray-500">Win By:</span>
                <span className="text-white ml-2">{league.settings?.matchFormat?.winBy || 2}</span>
              </div>
              <div>
                <span className="text-gray-500">Win Points:</span>
                <span className="text-white ml-2">{league.settings?.pointsForWin || 3}</span>
              </div>
              <div>
                <span className="text-gray-500">Draw Points:</span>
                <span className="text-white ml-2">{league.settings?.pointsForDraw || 1}</span>
              </div>
              <div>
                <span className="text-gray-500">Loss Points:</span>
                <span className="text-white ml-2">{league.settings?.pointsForLoss || 0}</span>
              </div>
            </div>
          </div>

          {/* Partner Settings (for doubles) */}
          {isDoublesOrMixed && league.settings?.partnerSettings && (
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="text-lg font-bold text-white mb-4">Partner Rules</h3>
              <ul className="text-sm text-gray-400 space-y-2">
                {league.settings.partnerSettings.allowSubstitutes && (
                  <li>• Substitutes allowed when partner unavailable</li>
                )}
                <li>
                  • Partners lock: {
                    league.settings.partnerSettings.partnerLockRule === 'registration_close' ? 'When registration closes' :
                    league.settings.partnerSettings.partnerLockRule === 'anytime' ? 'Can change anytime' :
                    `After week ${league.settings.partnerSettings.partnerLockWeek}`
                  }
                </li>
              </ul>
            </div>
          )}

          {/* Pricing */}
          {league.pricing?.enabled && (
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="text-lg font-bold text-white mb-4">Entry Fee</h3>
              <div className="text-2xl font-bold text-green-400 mb-2">
                ${(league.pricing.entryFee / 100).toFixed(2)} NZD
              </div>
              <p className="text-sm text-gray-400">
                {league.pricing.entryFeeType === 'per_team' ? 'Per team' : 'Per player'}
              </p>
              {league.pricing.earlyBirdEnabled && league.pricing.earlyBirdFee && (
                <p className="text-sm text-green-400 mt-2">
                  Early bird: ${(league.pricing.earlyBirdFee / 100).toFixed(2)}
                </p>
              )}
              <p className="text-xs text-gray-500 mt-2">
                Refund policy: {league.pricing.refundPolicy === 'full' ? 'Full refund before start' : 
                               league.pricing.refundPolicy === 'partial' ? '50% refund before start' : 'No refunds'}
              </p>
            </div>
          )}

          {/* Organizer */}
          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <h3 className="text-lg font-bold text-white mb-4">Organizer</h3>
            <p className="text-white">{league.organizerName}</p>
            {league.clubName && (
              <p className="text-sm text-gray-400 mt-1">Hosted by {league.clubName}</p>
            )}
          </div>
        </div>
      )}

{/* ================================================
    END OF PART 1 - PASTE PART 2 DIRECTLY BELOW THIS
    ================================================ */}
{/* ================================================
    PART 2 OF LeagueDetail.tsx V05.37
    Paste this DIRECTLY after Part 1 (remove this comment block)
    ================================================ */}

      {/* V07.12: DUPR Participation Acknowledgement Modal */}
      {showDuprAcknowledgement && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 w-full max-w-lg rounded-xl border border-gray-700 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-purple-900/50 px-6 py-4 border-b border-purple-600/50">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <span className="text-2xl">📊</span> DUPR League Participation Notice
                </h2>
                <button onClick={() => setShowDuprAcknowledgement(false)} className="text-gray-400 hover:text-white">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <p className="text-gray-300 mb-4">
                This league is connected to the <strong className="text-purple-300">DUPR rating system</strong>.
              </p>
              <p className="text-gray-400 mb-4">
                By joining this league, you acknowledge and agree that:
              </p>
              <ul className="space-y-3 text-sm text-gray-400 mb-6">
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-0.5">•</span>
                  <span>Match results from this league may be submitted to DUPR and may affect your DUPR rating.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-0.5">•</span>
                  <span>Players may propose and acknowledge scores, but only the organiser can finalise official results.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-0.5">•</span>
                  <span>Only organiser-finalised results are eligible for DUPR submission.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-0.5">•</span>
                  <span>If a score is disputed, the organiser will review the dispute and make the final decision.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-0.5">•</span>
                  <span>Not all matches are guaranteed to be DUPR-eligible (for example, incomplete or invalid matches).</span>
                </li>
                {league?.settings?.duprSettings?.mode === 'required' && (
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400 mt-0.5">•</span>
                    <span><strong className="text-white">This league requires DUPR.</strong> You must have a linked DUPR account before participating.</span>
                  </li>
                )}
                <li className="flex items-start gap-2">
                  <span className="text-purple-400 mt-0.5">•</span>
                  <span>By participating, you consent to your match results and relevant player identifiers being shared with DUPR for rating purposes.</span>
                </li>
              </ul>

              <label className="flex items-start gap-3 p-4 bg-gray-900/50 rounded-lg border border-gray-700 cursor-pointer hover:border-purple-600/50 transition-colors">
                <input
                  type="checkbox"
                  id="duprAcknowledgeCheckbox"
                  className="w-5 h-5 mt-0.5 accent-purple-500"
                />
                <span className="text-white text-sm">
                  I understand and agree to the DUPR participation rules for this league.
                </span>
              </label>
            </div>
            <div className="px-6 py-4 bg-gray-900 border-t border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => setShowDuprAcknowledgement(false)}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const checkbox = document.getElementById('duprAcknowledgeCheckbox') as HTMLInputElement;
                  if (checkbox?.checked) {
                    handleDuprAcknowledge();
                  } else {
                    alert('Please check the box to confirm you understand the DUPR participation rules.');
                  }
                }}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg transition-colors"
              >
                Continue to Join
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal for Paid Leagues */}
      {showPaymentModal && league?.pricing?.enabled && (() => {
        const baseAmount = league.pricing.entryFee;
        const platformFeePercent = 1.5;
        const stripeFeePercent = 2.9;
        const stripeFeeFixed = 30;
        const platformFee = Math.round(baseAmount * (platformFeePercent / 100));
        const stripeFee = Math.round(baseAmount * (stripeFeePercent / 100)) + stripeFeeFixed;
        const totalFees = platformFee + stripeFee;
        const playerPays = league.pricing.feesPaidBy === 'player' ? baseAmount + totalFees : baseAmount;
        
        return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 w-full max-w-md rounded-xl border border-gray-700 overflow-hidden">
            <div className="bg-gray-900 px-6 py-4 border-b border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">💳 League Registration</h2>
                <button onClick={() => setShowPaymentModal(false)} className="text-gray-400 hover:text-white">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="text-center mb-6">
                <h3 className="text-xl font-bold text-white mb-2">{league.name}</h3>
                <p className="text-gray-400 text-sm">{league.type === 'singles' ? 'Singles' : 'Doubles'} • {league.format.replace('_', ' ')}</p>
              </div>
              <div className="bg-gray-900 rounded-lg p-4 mb-6">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Entry Fee</span>
                  <span className="text-white font-semibold">${(baseAmount / 100).toFixed(2)}</span>
                </div>
                <div className="text-xs text-gray-500 mb-3">{league.pricing.entryFeeType === 'per_player' ? 'Per player' : 'Per team'}</div>
                {league.pricing.feesPaidBy === 'player' && (
                  <>
                    <div className="border-t border-gray-700 pt-3 mt-3 space-y-2">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500">Platform Fee ({platformFeePercent}%)</span>
                        <span className="text-gray-400">${(platformFee / 100).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500">Stripe Fee ({stripeFeePercent}% + 30¢)</span>
                        <span className="text-gray-400">${(stripeFee / 100).toFixed(2)}</span>
                      </div>
                    </div>
                    <div className="border-t border-gray-700 pt-3 mt-3">
                      <div className="flex justify-between items-center">
                        <span className="text-white font-bold">Total</span>
                        <span className="text-white font-bold text-lg">${(playerPays / 100).toFixed(2)} NZD</span>
                      </div>
                    </div>
                  </>
                )}
                {league.pricing.feesPaidBy === 'organizer' && (
                  <div className="border-t border-gray-700 pt-3 mt-3">
                    <div className="flex justify-between items-center">
                      <span className="text-white font-bold">Total</span>
                      <span className="text-white font-bold text-lg">${(baseAmount / 100).toFixed(2)} NZD</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Processing fees covered by organizer</p>
                  </div>
                )}
                {league.pricing.earlyBirdEnabled && league.pricing.earlyBirdDeadline && Date.now() < league.pricing.earlyBirdDeadline && (
                  <div className="mt-3 pt-3 border-t border-gray-700">
                    <div className="flex justify-between items-center text-green-400">
                      <span>🎉 Early Bird Price</span>
                      <span className="font-bold">${((league.pricing.earlyBirdFee || league.pricing.entryFee) / 100).toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Until {new Date(league.pricing.earlyBirdDeadline).toLocaleDateString()}</p>
                  </div>
                )}
              </div>
              <div className="text-xs text-gray-500 mb-6 text-center">
                Refund Policy: {league.pricing.refundPolicy === 'full' ? 'Full refund before league starts' : league.pricing.refundPolicy === 'partial' ? '50% refund before league starts' : 'No refunds'}
              </div>
              <div className="space-y-3">
                <button
                  onClick={async () => {
                    if (!league.organizerStripeAccountId) {
                      alert('Payment is not available yet. The organizer needs to set up Stripe. Joining as unpaid for now.');
                      await handleFreeJoin();
                      return;
                    }
                    try {
                      setJoining(true);
                      const { createCheckoutSession } = await import('../../services/stripe');
                      if (!league.pricing) throw new Error('League pricing not configured');
                      const session = await createCheckoutSession({
                        items: [{ name: `${league.name} - League Entry`, description: `${league.type} ${league.format} league registration`, amount: playerPays, quantity: 1 }],
                        successUrl: `${window.location.origin}/#/leagues/${leagueId}?payment=success`,
                        cancelUrl: `${window.location.origin}/#/leagues/${leagueId}?payment=cancelled`,
                        metadata: { type: 'league_registration', leagueId: leagueId, userId: currentUser?.uid || '', userName: userProfile?.displayName || '' },
                        organizerStripeAccountId: league.organizerStripeAccountId || undefined,
                      });
                      if (session?.url) { window.location.href = session.url; } else { throw new Error('Failed to create checkout session'); }
                    } catch (e: any) {
                      console.error('Payment error:', e);
                      alert('Payment setup failed: ' + e.message);
                    } finally { setJoining(false); }
                  }}
                  disabled={joining}
                  className="w-full py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white rounded-lg font-bold transition-colors"
                >
                  {joining ? 'Processing...' : `Pay $${(playerPays / 100).toFixed(2)} & Join`}
                </button>
                <button onClick={() => setShowPaymentModal(false)} className="w-full py-2 text-gray-400 hover:text-white transition-colors text-sm">Cancel</button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Edit League Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-gray-800 w-full max-w-3xl rounded-xl border border-gray-700 overflow-hidden my-4">
            <div className="bg-gray-900 px-6 py-4 border-b border-gray-700 sticky top-0 z-10">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">✏️ Edit League</h2>
                <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-white">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              {/* BASIC INFO */}
              <div className="bg-gray-900/50 rounded-lg p-4">
                <h3 className="text-sm font-bold text-blue-400 uppercase mb-4 flex items-center gap-2"><span>📋</span> Basic Information</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">League Name *</label>
                    <input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500" placeholder="League name" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Description</label>
                    <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500 min-h-[80px] resize-none" placeholder="Describe your league..." />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Location</label>
                      <input type="text" value={editForm.location} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500" placeholder="City, Region" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Venue</label>
                      <input type="text" value={editForm.venue} onChange={(e) => setEditForm({ ...editForm, venue: e.target.value })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500" placeholder="Venue name" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Visibility</label>
                    <select value={editForm.visibility} onChange={(e) => setEditForm({ ...editForm, visibility: e.target.value as 'public' | 'private' | 'club_only' })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500">
                      <option value="public">Public - Anyone can find and view</option>
                      <option value="private">Private - Invite only</option>
                      <option value="club_only">Club Only - Club members only</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* SCHEDULE */}
              <div className="bg-gray-900/50 rounded-lg p-4">
                <h3 className="text-sm font-bold text-green-400 uppercase mb-4 flex items-center gap-2"><span>📅</span> Schedule</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Registration Opens</label>
                    <input type="date" value={editForm.registrationOpens} onChange={(e) => setEditForm({ ...editForm, registrationOpens: e.target.value })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Registration Deadline</label>
                    <input type="date" value={editForm.registrationDeadline} onChange={(e) => setEditForm({ ...editForm, registrationDeadline: e.target.value })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Season Start</label>
                    <input type="date" value={editForm.seasonStart} onChange={(e) => setEditForm({ ...editForm, seasonStart: e.target.value })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Season End</label>
                    <input type="date" value={editForm.seasonEnd} onChange={(e) => setEditForm({ ...editForm, seasonEnd: e.target.value })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500" />
                  </div>
                </div>
              </div>

              {/* CAPACITY & RESTRICTIONS */}
              <div className="bg-gray-900/50 rounded-lg p-4">
                <h3 className="text-sm font-bold text-yellow-400 uppercase mb-4 flex items-center gap-2"><span>👥</span> Capacity & Restrictions</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Max Players/Teams</label>
                    <input type="number" value={editForm.maxMembers} onChange={(e) => setEditForm({ ...editForm, maxMembers: e.target.value })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500" placeholder="Unlimited" min="2" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Min Rating</label>
                    <input type="number" value={editForm.minRating} onChange={(e) => setEditForm({ ...editForm, minRating: e.target.value })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500" placeholder="Any" step="0.1" min="1" max="8" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Max Rating</label>
                    <input type="number" value={editForm.maxRating} onChange={(e) => setEditForm({ ...editForm, maxRating: e.target.value })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500" placeholder="Any" step="0.1" min="1" max="8" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Min Age</label>
                    <input type="number" value={editForm.minAge} onChange={(e) => setEditForm({ ...editForm, minAge: e.target.value })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500" placeholder="Any" min="1" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Max Age</label>
                    <input type="number" value={editForm.maxAge} onChange={(e) => setEditForm({ ...editForm, maxAge: e.target.value })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500" placeholder="Any" min="1" />
                  </div>
                </div>
              </div>

              {/* MATCH FORMAT */}
              <div className="bg-gray-900/50 rounded-lg p-4">
                <h3 className="text-sm font-bold text-purple-400 uppercase mb-4 flex items-center gap-2"><span>🎾</span> Match Format</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Best Of</label>
                    <select value={editForm.bestOf} onChange={(e) => setEditForm({ ...editForm, bestOf: parseInt(e.target.value) as 1 | 3 | 5 })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500">
                      <option value={1}>1 Game</option>
                      <option value={3}>Best of 3</option>
                      <option value={5}>Best of 5</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Points/Game</label>
                    <select value={editForm.gamesTo} onChange={(e) => setEditForm({ ...editForm, gamesTo: parseInt(e.target.value) as 11 | 15 | 21 })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500">
                      <option value={11}>11 Points</option>
                      <option value={15}>15 Points</option>
                      <option value={21}>21 Points</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Win By</label>
                    <select value={editForm.winBy} onChange={(e) => setEditForm({ ...editForm, winBy: parseInt(e.target.value) as 1 | 2 })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500">
                      <option value={1}>1 Point</option>
                      <option value={2}>2 Points</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Match Deadline (Days)</label>
                    <input type="number" value={editForm.matchDeadlineDays} onChange={(e) => setEditForm({ ...editForm, matchDeadlineDays: parseInt(e.target.value) || 7 })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500" min="1" max="30" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={editForm.allowSelfReporting} onChange={(e) => setEditForm({ ...editForm, allowSelfReporting: e.target.checked })} className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500" />
                    <span className="text-sm text-gray-300">Allow Self-Reporting</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={editForm.requireConfirmation} onChange={(e) => setEditForm({ ...editForm, requireConfirmation: e.target.checked })} className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500" />
                    <span className="text-sm text-gray-300">Require Score Confirmation</span>
                  </label>
                </div>
              </div>

              {/* FORMAT SPECIFIC */}
              {(league?.format === 'round_robin' || league?.format === 'swiss') && (
                <div className="bg-gray-900/50 rounded-lg p-4">
                  <h3 className="text-sm font-bold text-cyan-400 uppercase mb-4 flex items-center gap-2"><span>🔄</span> {league.format === 'round_robin' ? 'Round Robin Settings' : 'Swiss Settings'}</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {league.format === 'round_robin' && (
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">Number of Rounds</label>
                        <input type="number" value={editForm.roundRobinRounds} onChange={(e) => setEditForm({ ...editForm, roundRobinRounds: parseInt(e.target.value) || 1 })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500" min="1" max="5" />
                        <p className="text-xs text-gray-500 mt-1">How many times each player plays each opponent</p>
                      </div>
                    )}
                    {league.format === 'swiss' && (
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">Number of Rounds</label>
                        <input type="number" value={editForm.swissRounds} onChange={(e) => setEditForm({ ...editForm, swissRounds: parseInt(e.target.value) || 4 })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500" min="1" max="10" />
                        <p className="text-xs text-gray-500 mt-1">Total rounds to play</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SCORING POINTS */}
              <div className="bg-gray-900/50 rounded-lg p-4">
                <h3 className="text-sm font-bold text-orange-400 uppercase mb-4 flex items-center gap-2"><span>🏆</span> Standings Points</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Win</label>
                    <input type="number" value={editForm.pointsForWin} onChange={(e) => setEditForm({ ...editForm, pointsForWin: parseInt(e.target.value) || 0 })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Draw</label>
                    <input type="number" value={editForm.pointsForDraw} onChange={(e) => setEditForm({ ...editForm, pointsForDraw: parseInt(e.target.value) || 0 })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Loss</label>
                    <input type="number" value={editForm.pointsForLoss} onChange={(e) => setEditForm({ ...editForm, pointsForLoss: parseInt(e.target.value) || 0 })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Forfeit</label>
                    <input type="number" value={editForm.pointsForForfeit} onChange={(e) => setEditForm({ ...editForm, pointsForForfeit: parseInt(e.target.value) || 0 })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">No-Show</label>
                    <input type="number" value={editForm.pointsForNoShow} onChange={(e) => setEditForm({ ...editForm, pointsForNoShow: parseInt(e.target.value) || 0 })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500" />
                  </div>
                </div>
              </div>

              {/* PRICING */}
              <div className="bg-gray-900/50 rounded-lg p-4">
                <h3 className="text-sm font-bold text-green-400 uppercase mb-4 flex items-center gap-2"><span>💰</span> Pricing</h3>
                <label className="flex items-center gap-2 cursor-pointer mb-4">
                  <input type="checkbox" checked={editForm.pricingEnabled} onChange={(e) => setEditForm({ ...editForm, pricingEnabled: e.target.checked })} className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-green-500 focus:ring-green-500" />
                  <span className="text-sm text-gray-300">Enable Paid Registration</span>
                </label>
                {editForm.pricingEnabled && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">Entry Fee ($)</label>
                        <input type="number" value={(editForm.entryFee / 100).toFixed(2)} onChange={(e) => setEditForm({ ...editForm, entryFee: Math.round(parseFloat(e.target.value) * 100) || 0 })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500" min="0" step="0.01" />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">Fee Type</label>
                        <select value={editForm.entryFeeType} onChange={(e) => setEditForm({ ...editForm, entryFeeType: e.target.value as 'per_player' | 'per_team' })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500">
                          <option value="per_player">Per Player</option>
                          <option value="per_team">Per Team</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">Fees Paid By</label>
                        <select value={editForm.feesPaidBy} onChange={(e) => setEditForm({ ...editForm, feesPaidBy: e.target.value as 'player' | 'organizer' })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500">
                          <option value="player">Player pays fees</option>
                          <option value="organizer">Organizer absorbs fees</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Refund Policy</label>
                      <select value={editForm.refundPolicy} onChange={(e) => setEditForm({ ...editForm, refundPolicy: e.target.value as 'full' | 'partial' | 'none' })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500">
                        <option value="full">Full refund before league starts</option>
                        <option value="partial">50% refund before league starts</option>
                        <option value="none">No refunds</option>
                      </select>
                    </div>
                    {/* Early Bird */}
                    <div className="border-t border-gray-700 pt-4">
                      <label className="flex items-center gap-2 cursor-pointer mb-3">
                        <input type="checkbox" checked={editForm.earlyBirdEnabled} onChange={(e) => setEditForm({ ...editForm, earlyBirdEnabled: e.target.checked })} className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-green-500 focus:ring-green-500" />
                        <span className="text-sm text-gray-300">🎉 Enable Early Bird Pricing</span>
                      </label>
                      {editForm.earlyBirdEnabled && (
                        <div className="grid grid-cols-2 gap-4 ml-6">
                          <div>
                            <label className="block text-sm text-gray-400 mb-1">Early Bird Fee ($)</label>
                            <input type="number" value={(editForm.earlyBirdFee / 100).toFixed(2)} onChange={(e) => setEditForm({ ...editForm, earlyBirdFee: Math.round(parseFloat(e.target.value) * 100) || 0 })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500" min="0" step="0.01" />
                          </div>
                          <div>
                            <label className="block text-sm text-gray-400 mb-1">Early Bird Deadline</label>
                            <input type="date" value={editForm.earlyBirdDeadline} onChange={(e) => setEditForm({ ...editForm, earlyBirdDeadline: e.target.value })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500" />
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Late Fee */}
                    <div className="border-t border-gray-700 pt-4">
                      <label className="flex items-center gap-2 cursor-pointer mb-3">
                        <input type="checkbox" checked={editForm.lateFeeEnabled} onChange={(e) => setEditForm({ ...editForm, lateFeeEnabled: e.target.checked })} className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-red-500 focus:ring-red-500" />
                        <span className="text-sm text-gray-300">⏰ Enable Late Registration Fee</span>
                      </label>
                      {editForm.lateFeeEnabled && (
                        <div className="grid grid-cols-2 gap-4 ml-6">
                          <div>
                            <label className="block text-sm text-gray-400 mb-1">Late Fee ($)</label>
                            <input type="number" value={(editForm.lateFee / 100).toFixed(2)} onChange={(e) => setEditForm({ ...editForm, lateFee: Math.round(parseFloat(e.target.value) * 100) || 0 })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500" min="0" step="0.01" />
                          </div>
                          <div>
                            <label className="block text-sm text-gray-400 mb-1">Late Fee Starts</label>
                            <input type="date" value={editForm.lateRegistrationStart} onChange={(e) => setEditForm({ ...editForm, lateRegistrationStart: e.target.value })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <p className="text-xs text-gray-500 bg-gray-900 p-3 rounded-lg">
                💡 <strong>Note:</strong> League type ({league?.type}) and format ({league?.format}) cannot be changed after creation.
              </p>
            </div>
            
            {/* Footer Buttons */}
            <div className="bg-gray-900 px-6 py-4 border-t border-gray-700 flex gap-3 sticky bottom-0">
              <button onClick={() => setShowEditModal(false)} className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors">Cancel</button>
              <button
                onClick={async () => {
                  if (!editForm.name.trim()) { alert('League name is required'); return; }
                  setSaving(true);
                  try {
                    const settingsUpdate = {
                      ...league?.settings,
                      maxMembers: editForm.maxMembers ? parseInt(editForm.maxMembers) : null,
                      minRating: editForm.minRating ? parseFloat(editForm.minRating) : null,
                      maxRating: editForm.maxRating ? parseFloat(editForm.maxRating) : null,
                      minAge: editForm.minAge ? parseInt(editForm.minAge) : null,
                      maxAge: editForm.maxAge ? parseInt(editForm.maxAge) : null,
                      pointsForWin: editForm.pointsForWin, pointsForDraw: editForm.pointsForDraw, pointsForLoss: editForm.pointsForLoss,
                      pointsForForfeit: editForm.pointsForForfeit, pointsForNoShow: editForm.pointsForNoShow,
                      matchDeadlineDays: editForm.matchDeadlineDays, allowSelfReporting: editForm.allowSelfReporting, requireConfirmation: editForm.requireConfirmation,
                      matchFormat: { bestOf: editForm.bestOf, gamesTo: editForm.gamesTo, winBy: editForm.winBy },
                      ...(league?.format === 'round_robin' && { roundRobinSettings: { rounds: editForm.roundRobinRounds, matchesPerWeek: league?.settings?.roundRobinSettings?.matchesPerWeek ?? 2, scheduleGeneration: league?.settings?.roundRobinSettings?.scheduleGeneration ?? 'auto' } }),
                      ...(league?.format === 'swiss' && { swissSettings: { rounds: editForm.swissRounds, pairingMethod: league?.settings?.swissSettings?.pairingMethod ?? 'adjacent' } }),
                    };
                    const pricingUpdate = editForm.pricingEnabled ? {
                      paymentMode: league?.pricing?.paymentMode || 'external' as const,
                      enabled: true, entryFee: editForm.entryFee, entryFeeType: editForm.entryFeeType, feesPaidBy: editForm.feesPaidBy, refundPolicy: editForm.refundPolicy,
                      earlyBirdEnabled: editForm.earlyBirdEnabled, earlyBirdFee: editForm.earlyBirdEnabled ? editForm.earlyBirdFee : undefined,
                      earlyBirdDeadline: editForm.earlyBirdEnabled && editForm.earlyBirdDeadline ? new Date(editForm.earlyBirdDeadline).getTime() : undefined,
                      lateFeeEnabled: editForm.lateFeeEnabled, lateFee: editForm.lateFeeEnabled ? editForm.lateFee : undefined,
                      lateRegistrationStart: editForm.lateFeeEnabled && editForm.lateRegistrationStart ? new Date(editForm.lateRegistrationStart).getTime() : undefined,
                      prizePool: league?.pricing?.prizePool || { enabled: false, type: 'none' as const, amount: 0, distribution: { first: 60, second: 30, third: 10, fourth: 0 } }, currency: 'nzd' as const,
                    } : undefined;
                    const updateData: Parameters<typeof updateLeague>[1] = { name: editForm.name.trim(), visibility: editForm.visibility, settings: settingsUpdate };
                    if (editForm.description.trim()) updateData.description = editForm.description.trim();
                    if (editForm.location.trim()) updateData.location = editForm.location.trim();
                    if (editForm.venue.trim()) updateData.venue = editForm.venue.trim();
                    if (editForm.seasonStart) updateData.seasonStart = new Date(editForm.seasonStart).getTime();
                    if (editForm.seasonEnd) updateData.seasonEnd = new Date(editForm.seasonEnd).getTime();
                    if (editForm.registrationOpens) updateData.registrationOpens = new Date(editForm.registrationOpens).getTime();
                    if (editForm.registrationDeadline) updateData.registrationDeadline = new Date(editForm.registrationDeadline).getTime();
                    if (pricingUpdate) updateData.pricing = pricingUpdate;
                    await updateLeague(leagueId, updateData);
                    const updated = await getLeague(leagueId);
                    if (updated) setLeague(updated);
                    setShowEditModal(false);
                  } catch (e: any) { alert('Failed to save: ' + e.message); } finally { setSaving(false); }
                }}
                disabled={saving}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded-lg font-semibold transition-colors"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Score Entry Modal */}
      {showScoreEntryModal && selectedMatch && league && (
        <LeagueScoreEntryModal
          leagueId={leagueId}
          leagueName={league.name}
          match={selectedMatch}
          bestOf={(league.settings.matchFormat?.bestOf as 1 | 3 | 5) || 3}
          pointsPerGame={(league.settings.matchFormat?.gamesTo as 11 | 15 | 21) || 11}
          winBy={(league.settings.matchFormat?.winBy as 1 | 2) || 2}
          verificationSettings={league.settings.scoreVerification || undefined}
          isOrganizer={isOrganizer}
          onClose={() => {
            setShowScoreEntryModal(false);
            setSelectedMatch(null);
          }}
          onSuccess={() => {
            setShowScoreEntryModal(false);
            setSelectedMatch(null);
          }}
        />
      )}
    </div>
  );
};

export default LeagueDetail;
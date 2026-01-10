/**
 * LeagueDetail Component V07.14
 *
 * Shows league details, standings, matches, and allows joining/playing.
 * Now includes player management with drag-and-drop for organizers.
 * Auto-updates league status based on registration dates.
 * V07.13: Added week-based match organization with sub-tabs (Week 1, 2, ..., Overall, Finals).
 * V07.14: League standings as stored snapshots (same pattern as tournament poolResults).
 *         - Standings are derived from match data
 *         - Freshness tracking with staleness indicator
 *         - Recalculate button for organizers
 *
 * FILE LOCATION: components/leagues/LeagueDetail.tsx
 * VERSION: V07.14
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
  // V07.14: League standings snapshots
  getAllLeagueStandings,
  getStandingsStatus,
  rebuildAllStandings,
  // V07.27: Partner invites & join requests
  subscribeToUserLeaguePartnerInvites,
  respondToLeaguePartnerInviteAtomic,
  subscribeToMyOpenTeamRequests,
  respondToLeagueJoinRequest,
  // V07.29: Week state management (closed/open/locked)
  getWeekState,
  openLeagueWeek,
  closeLeagueWeek,
  lockLeagueWeek,
  isWeekUnlocked,
  // V07.26: Fetch user profiles for DUPR access token check
  getUsersByIds,
} from '../../services/firebase';
import { LeagueScheduleManager } from './LeagueScheduleManager';
import { BoxPlayerDragDrop, RotatingBoxPlayerManager, BoxLeagueAbsencePanel } from './boxLeague';
import { BoxLeagueStandings } from './boxLeague/BoxLeagueStandings';
import { PlayerSeedingList } from './PlayerSeedingList';
import { LeagueMatchCard } from './LeagueMatchCard';
import { LeagueScoreEntryModal } from './LeagueScoreEntryModal';
import type {
  League,
  LeagueMember,
  LeagueMatch,
  LeagueDivision,
  LeagueStandingsDoc,
  LeaguePartnerInvite,
  LeagueJoinRequest,
  UserProfile,
} from '../../types';
import type { BoxLeaguePlayer } from '../../types/boxLeague';
import { LeagueStandings } from './LeagueStandings';
import { LeagueCommsTab } from './LeagueCommsTab';
import { LeagueRegistrationWizard } from './LeagueRegistrationWizard';
import { DuprControlPanel } from '../shared/DuprControlPanel';
import { getDuprLoginIframeUrl, parseDuprLoginEvent } from '../../services/dupr';
import { doc, updateDoc } from '@firebase/firestore';
import { db } from '../../services/firebase';
import { StandingsPointsCard, RoundsSlider, type StandingsPointsConfig } from '../shared/PointsSlider';
import { DEFAULT_WAIVER_TEXT } from '../../constants';

// ============================================
// TYPES
// ============================================

interface LeagueDetailProps {
  leagueId: string;
  onBack: () => void;
}

type TabType = 'standings' | 'matches' | 'players' | 'courts' | 'schedule' | 'dupr' | 'info' | 'comms';

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
  // V07.26: User profiles for DUPR access token checking
  const [userProfiles, setUserProfiles] = useState<Map<string, UserProfile>>(new Map());

  // V07.14: Standings snapshots from Firestore
  const [overallStandings, setOverallStandings] = useState<LeagueStandingsDoc | null>(null);
  const [weekStandings, setWeekStandings] = useState<Map<number, LeagueStandingsDoc>>(new Map());
  const [standingsStatus, setStandingsStatus] = useState<'current' | 'stale' | 'missing'>('missing');
  const [isRecalculating, setIsRecalculating] = useState(false);

  // UI state
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('standings');
  const [selectedDivisionId, setSelectedDivisionId] = useState<string | null>(null);
  const [activeWeekTab, setActiveWeekTab] = useState<string>(''); // For matches sub-tabs
  const [activeStandingsTab, setActiveStandingsTab] = useState<string>('overall'); // V07.16: For standings sub-tabs
  const [joining, setJoining] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [paymentCancelled, setPaymentCancelled] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<LeagueMatch | null>(null);
  const [showScoreEntryModal, setShowScoreEntryModal] = useState(false);
  const [showDuprAcknowledgement, setShowDuprAcknowledgement] = useState(false); // V07.12
  const [duprAcknowledged, setDuprAcknowledged] = useState(false); // V07.12
  const [duprCheckboxChecked, setDuprCheckboxChecked] = useState(false); // V07.15: Local state for checkbox
  const [showDuprRequiredModal, setShowDuprRequiredModal] = useState(false); // V07.15: DUPR linking modal
  const [duprLinking, setDuprLinking] = useState(false); // V07.15: DUPR linking in progress
  const [showWaiverModal, setShowWaiverModal] = useState(false); // V07.25: Waiver acceptance modal
  const [waiverAccepted, setWaiverAccepted] = useState(false); // V07.25: Waiver checkbox state
  const [showRegistrationWizard, setShowRegistrationWizard] = useState(false); // V07.27: Registration wizard for doubles
  const [pendingInvites, setPendingInvites] = useState<LeaguePartnerInvite[]>([]); // V07.27: Partner invites for current user
  const [respondingToInvite, setRespondingToInvite] = useState<string | null>(null); // V07.27: Invite being responded to
  const [confirmingInvite, setConfirmingInvite] = useState<LeaguePartnerInvite | null>(null); // V07.27: Invite awaiting confirmation
  const [inviteAcknowledged, setInviteAcknowledged] = useState(false); // V07.27: User acknowledged league rules
  // V07.27: Join requests now use direct join (no approval needed) - subscription kept for cleanup
  const [pendingJoinRequests, setPendingJoinRequests] = useState<LeagueJoinRequest[]>([]);
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
    refundPolicy: 'partial' as 'full' | 'full_7days' | 'full_14days' | '75_percent' | 'partial' | '25_percent' | 'admin_fee_only' | 'none',
    
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

  // V07.26: Fetch user profiles for DUPR access token checking
  useEffect(() => {
    const fetchUserProfiles = async () => {
      if (members.length === 0) return;

      const userIds = members.map(m => m.userId);
      try {
        const profiles = await getUsersByIds(userIds);
        const profileMap = new Map<string, UserProfile>();
        profiles.forEach(p => {
          if (p.odUserId) {
            profileMap.set(p.odUserId, p);
          }
        });
        setUserProfiles(profileMap);
      } catch (error) {
        console.error('Failed to fetch user profiles for DUPR check:', error);
      }
    };

    fetchUserProfiles();
  }, [members]);

  // Subscribe to matches
  useEffect(() => {
    const unsubscribe = subscribeToLeagueMatches(leagueId, setMatches);
    return () => unsubscribe();
  }, [leagueId]);

  // Subscribe to box league players (only for LEGACY box_league format, not rotating_doubles_box)
  // V07.25: rotating_doubles_box uses members subcollection with RotatingBoxPlayerManager
  useEffect(() => {
    // Only subscribe for old box_league format, not new rotating_doubles_box
    const isLegacyBoxLeague = league?.format === 'box_league' && !league?.competitionFormat;
    if (isLegacyBoxLeague) {
      const unsubscribe = subscribeToBoxLeaguePlayers(leagueId, setBoxPlayers);
      return () => unsubscribe();
    }
  }, [leagueId, league?.format, league?.competitionFormat]);

  // Get my membership
  useEffect(() => {
    if (currentUser) {
      getLeagueMemberByUserId(leagueId, currentUser.uid).then(setMyMembership);
    }
  }, [leagueId, currentUser, members]);

  // V07.27: Subscribe to pending partner invites for this league
  useEffect(() => {
    if (!currentUser) {
      setPendingInvites([]);
      return;
    }

    const unsubscribe = subscribeToUserLeaguePartnerInvites(currentUser.uid, (invites) => {
      // Filter to only invites for this league
      const leagueInvites = invites.filter(inv => inv.leagueId === leagueId);
      setPendingInvites(leagueInvites);
    });

    return () => unsubscribe();
  }, [leagueId, currentUser]);

  // V07.27: Subscribe to join requests for my open team in this league
  useEffect(() => {
    if (!currentUser) {
      setPendingJoinRequests([]);
      return;
    }

    const unsubscribe = subscribeToMyOpenTeamRequests(currentUser.uid, (requests) => {
      // Filter to only requests for this league
      const leagueRequests = requests.filter(req => req.leagueId === leagueId);
      setPendingJoinRequests(leagueRequests);
    });

    return () => unsubscribe();
  }, [leagueId, currentUser]);

  // V07.14: Load standings snapshots from Firestore
  useEffect(() => {
    const loadStandings = async () => {
      try {
        // Load all standings (overall + weeks)
        const allStandings = await getAllLeagueStandings(leagueId);

        // Separate overall from week standings
        const overall = allStandings.find(s => s.standingsKey === 'overall') || null;
        setOverallStandings(overall);

        // Build week standings map
        const weekMap = new Map<number, LeagueStandingsDoc>();
        allStandings
          .filter(s => s.weekNumber !== null)
          .forEach(s => weekMap.set(s.weekNumber!, s));
        setWeekStandings(weekMap);

        // Check staleness
        if (overall && matches.length > 0) {
          const status = getStandingsStatus(overall, matches);
          setStandingsStatus(status.status);
        } else if (!overall && matches.some(m => m.status === 'completed')) {
          setStandingsStatus('missing');
        } else {
          setStandingsStatus('current');
        }
      } catch (err) {
        console.error('[LeagueDetail] Failed to load standings:', err);
      }
    };

    loadStandings();
  }, [leagueId, matches]);

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

  // V07.26: Build member lookup for name and DUPR linked status
  // A player has DUPR properly linked ONLY if they have duprConnected: true in their user profile
  const memberLookup = useMemo(() => {
    const lookup = new Map<string, { displayName: string; duprId?: string; duprLinked: boolean }>();
    members.forEach(m => {
      // Check user profile for duprConnected - this is the definitive indicator DUPR is linked via SSO
      const profile = userProfiles.get(m.userId);
      const hasDuprConnected = Boolean(profile?.duprConnected);

      lookup.set(m.userId, {
        displayName: m.displayName || 'Unknown',
        // Only include duprId if they have duprConnected: true (actually linked via SSO)
        duprId: hasDuprConnected ? (profile?.duprId || m.duprId) : undefined,
        duprLinked: hasDuprConnected,
      });
    });
    return lookup;
  }, [members, userProfiles]);

  // V07.26: Enrich box league matches with player names and DUPR IDs from members
  // DUPR IDs are only included if the player has duprConnected: true (actually linked via SSO)
  const enrichBoxLeagueMatch = (match: LeagueMatch): LeagueMatch => {
    // Only enrich box league matches with sideA/sideB
    const sideA = (match as any).sideA;
    const sideB = (match as any).sideB;

    if (!sideA || !sideB) return match;
    if (memberLookup.size === 0) return match;

    // Always enrich with DUPR IDs for eligibility checking, and names if needed
    const resolvedSideA = { ...sideA };
    const resolvedSideB = { ...sideB };

    if (sideA.playerIds?.length >= 2) {
      const member1 = memberLookup.get(sideA.playerIds[0]);
      const member2 = memberLookup.get(sideA.playerIds[1]);
      const name1 = member1?.displayName || 'Unknown';
      const name2 = member2?.displayName || 'Unknown';

      // Always update names and DUPR IDs
      resolvedSideA.name = `${name1} & ${name2}`;
      resolvedSideA.playerNames = [name1, name2];
      // Only include duprId if player has duprConnected: true (linked via SSO)
      resolvedSideA.duprIds = [member1?.duprId, member2?.duprId].filter(Boolean) as string[];
    }

    if (sideB.playerIds?.length >= 2) {
      const member1 = memberLookup.get(sideB.playerIds[0]);
      const member2 = memberLookup.get(sideB.playerIds[1]);
      const name1 = member1?.displayName || 'Unknown';
      const name2 = member2?.displayName || 'Unknown';

      resolvedSideB.name = `${name1} & ${name2}`;
      resolvedSideB.playerNames = [name1, name2];
      resolvedSideB.duprIds = [member1?.duprId, member2?.duprId].filter(Boolean) as string[];
    }

    return {
      ...match,
      sideA: resolvedSideA,
      sideB: resolvedSideB,
    } as LeagueMatch;
  };

  // Filter matches by division and enrich box league matches
  const filteredMatches = useMemo(() => {
    const filtered = selectedDivisionId
      ? matches.filter(m => m.divisionId === selectedDivisionId)
      : matches;

    // Enrich box league matches with player names
    return filtered.map(enrichBoxLeagueMatch);
  }, [matches, selectedDivisionId, memberLookup]);

  // Group matches by week for sub-tabs
  const matchesByWeek = useMemo(() => {
    const grouped: Record<number, LeagueMatch[]> = {};
    filteredMatches.forEach(match => {
      const week = match.weekNumber || 0;
      if (!grouped[week]) grouped[week] = [];
      grouped[week].push(match);
    });
    return grouped;
  }, [filteredMatches]);

  // Get sorted weeks array
  const weeks = useMemo(() => {
    return Object.keys(matchesByWeek).map(Number).filter(w => w > 0).sort((a, b) => a - b);
  }, [matchesByWeek]);

  // Get finals matches (weekNumber === 0 or isFinal flag)
  const finalsMatches = useMemo(() => {
    return filteredMatches.filter(m => (m as any).isFinal || m.weekNumber === 0);
  }, [filteredMatches]);

  // Find last played week (has completed matches)
  const lastPlayedWeek = useMemo(() => {
    let lastWeek = weeks[0] || 1;
    weeks.forEach(week => {
      if ((matchesByWeek[week] || []).some(m => m.status === 'completed')) {
        lastWeek = week;
      }
    });
    return lastWeek;
  }, [weeks, matchesByWeek]);

  // Default to last played week on mount (only when matches tab is active)
  useEffect(() => {
    if (activeTab === 'matches' && !activeWeekTab && weeks.length > 0) {
      setActiveWeekTab(`week-${lastPlayedWeek}`);
    }
  }, [activeTab, activeWeekTab, lastPlayedWeek, weeks]);

  // ============================================
  // ACTIONS
  // ============================================

  // V07.14: Recalculate standings from matches
  const handleRecalculateStandings = async () => {
    if (!league) return;
    setIsRecalculating(true);
    try {
      await rebuildAllStandings(leagueId, members, matches, league.settings);

      // Reload standings after rebuild
      const allStandings = await getAllLeagueStandings(leagueId);
      const overall = allStandings.find(s => s.standingsKey === 'overall') || null;
      setOverallStandings(overall);

      const weekMap = new Map<number, LeagueStandingsDoc>();
      allStandings
        .filter(s => s.weekNumber !== null)
        .forEach(s => weekMap.set(s.weekNumber!, s));
      setWeekStandings(weekMap);

      setStandingsStatus('current');
      console.log('[LeagueDetail] Standings recalculated successfully');
    } catch (err) {
      console.error('[LeagueDetail] Failed to recalculate standings:', err);
      alert('Failed to recalculate standings. Check console for details.');
    } finally {
      setIsRecalculating(false);
    }
  };

  // V07.29: Set week state (closed/open/locked)
  // V07.30: Auto-generate standings when locking a week
  type WeekState = 'closed' | 'open' | 'locked';

  const handleSetWeekState = async (weekNumber: number, newState: WeekState) => {
    if (!league) return;

    try {
      if (newState === 'closed') {
        await closeLeagueWeek(leagueId, weekNumber);
        console.log(`[LeagueDetail] Week ${weekNumber} closed`);
      } else if (newState === 'open') {
        await openLeagueWeek(leagueId, weekNumber);
        console.log(`[LeagueDetail] Week ${weekNumber} opened for scoring`);
      } else if (newState === 'locked') {
        // Locking the week - finalize and auto-generate standings
        await lockLeagueWeek(leagueId, weekNumber);
        console.log(`[LeagueDetail] Week ${weekNumber} locked - regenerating standings...`);

        setIsRecalculating(true);
        try {
          await rebuildAllStandings(leagueId, members, matches, league.settings);

          // Reload standings after rebuild
          const allStandings = await getAllLeagueStandings(leagueId);
          const overall = allStandings.find(s => s.standingsKey === 'overall') || null;
          setOverallStandings(overall);

          const weekMap = new Map<number, LeagueStandingsDoc>();
          allStandings
            .filter(s => s.weekNumber !== null)
            .forEach(s => weekMap.set(s.weekNumber!, s));
          setWeekStandings(weekMap);

          setStandingsStatus('current');
          console.log(`[LeagueDetail] Standings regenerated after locking week ${weekNumber}`);
        } catch (standingsErr) {
          console.error('[LeagueDetail] Failed to regenerate standings:', standingsErr);
        } finally {
          setIsRecalculating(false);
        }
      }

      // V07.32: Refresh league state to update UI (no subscription for league doc)
      const updatedLeague = await getLeague(leagueId);
      if (updatedLeague) {
        setLeague(updatedLeague);
        console.log(`[LeagueDetail] League refreshed - weekStates:`, updatedLeague.weekStates);
      }
    } catch (err) {
      console.error('[LeagueDetail] Failed to set week state:', err);
      alert('Failed to update week status');
    }
  };

  // V07.15: skipDuprCheck param allows bypassing the acknowledgement check after user has confirmed
  // V07.25: skipWaiverCheck param allows bypassing after waiver has been accepted
  const handleJoin = async (skipDuprCheck: boolean = false, skipWaiverCheck: boolean = false) => {
    if (!currentUser || !userProfile) return;

    // V07.15: Refresh league data to get current member count
    const freshLeague = await getLeague(leagueId);
    if (!freshLeague) {
      alert('League not found');
      return;
    }

    // V07.25: Check waiver requirement first
    const waiverRequired = freshLeague.settings?.waiverRequired;
    if (waiverRequired && !skipWaiverCheck) {
      setWaiverAccepted(false);
      setShowWaiverModal(true);
      return;
    }

    // V07.15: Check if league is full before attempting to join
    // V07.27: Allow joining if there are open teams (joining completes existing team, doesn't create new)
    const maxMembers = freshLeague.maxMembers || freshLeague.settings?.maxMembers;
    const isLeagueFull = maxMembers && (freshLeague.memberCount || 0) >= maxMembers;
    if (isLeagueFull && !hasOpenTeams) {
      alert(`League is full (${freshLeague.memberCount}/${maxMembers} players)`);
      return;
    }

    // V07.15: Check DUPR requirement BEFORE acknowledgement modal
    const duprMode = freshLeague.settings?.duprSettings?.mode;
    const isDuprLeague = duprMode === 'optional' || duprMode === 'required';

    // If DUPR is REQUIRED, user must have a linked DUPR account
    if (duprMode === 'required' && !userProfile.duprId) {
      setShowDuprRequiredModal(true);
      return;
    }

    // Debug: Log payment check
    console.log('Join clicked - Payment check:', {
      pricingEnabled: freshLeague.pricing?.enabled,
      entryFee: freshLeague.pricing?.entryFee,
      organizerStripeAccountId: freshLeague.organizerStripeAccountId,
    });

    console.log('DUPR check:', {
      duprSettings: freshLeague.settings?.duprSettings,
      mode: duprMode,
      isDuprLeague,
      duprAcknowledged,
      skipDuprCheck,
      userDuprId: userProfile.duprId,
    });

    // Show acknowledgement modal for DUPR leagues (optional or required)
    // Skip this check if we just came from the acknowledgement modal
    if (isDuprLeague && !duprAcknowledged && !skipDuprCheck) {
      setDuprCheckboxChecked(false); // V07.15: Reset checkbox when modal opens
      setShowDuprAcknowledgement(true);
      return;
    }

    // Check if league requires payment
    if (league?.pricing?.enabled && league.pricing.entryFee > 0) {
      // Show payment modal instead of direct join
      setShowPaymentModal(true);
      return;
    }

    // V07.27: For doubles/mixed leagues, show registration wizard with partner flow
    const isDoublesType = freshLeague.type === 'doubles' || freshLeague.type === 'mixed_doubles';
    if (isDoublesType) {
      setShowRegistrationWizard(true);
      return;
    }

    // Singles league - join directly
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
    } catch (e: any) {
      alert('Failed to join: ' + e.message);
    } finally {
      setJoining(false);
    }
  };
  
  // V07.25: Handle waiver acceptance
  const handleWaiverAccept = () => {
    setShowWaiverModal(false);
    // Continue with join flow - pass skipWaiverCheck: true since waiver was just accepted
    handleJoin(false, true);
  };

  // V07.12: Handle DUPR acknowledgement confirmation
  const handleDuprAcknowledge = () => {
    setDuprAcknowledged(true);
    setShowDuprAcknowledgement(false);
    // Continue with join flow - pass true to skip DUPR check and waiver check (already completed)
    handleJoin(true, true);
  };

  // V07.15: Handle DUPR iframe login message for required leagues
  const handleDuprLinkMessage = async (event: MessageEvent) => {
    const loginData = parseDuprLoginEvent(event);
    if (!loginData || !currentUser?.uid) return;

    console.log('DUPR login successful from league join:', loginData);
    setDuprLinking(true);

    try {
      // Update user profile with DUPR data
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, {
        duprId: loginData.duprId,
        duprConnected: true,
        duprConnectedAt: Date.now(),
        duprDoublesRating: loginData.stats?.doublesRating || null,
        duprSinglesRating: loginData.stats?.singlesRating || null,
        duprAccessToken: loginData.userToken,
        duprRefreshToken: loginData.refreshToken,
        duprTokenUpdatedAt: Date.now(),
        updatedAt: Date.now(),
      });

      // Close modal and continue with join
      setShowDuprRequiredModal(false);
      setDuprLinking(false);

      // Now that DUPR is linked, try to join again
      setTimeout(() => {
        handleJoin();
      }, 500);
    } catch (err: any) {
      console.error('Failed to save DUPR data:', err);
      alert('Failed to link DUPR account: ' + err.message);
      setDuprLinking(false);
    }
  };

  // Listen for DUPR iframe messages when modal is open
  useEffect(() => {
    if (showDuprRequiredModal) {
      window.addEventListener('message', handleDuprLinkMessage);
      return () => window.removeEventListener('message', handleDuprLinkMessage);
    }
  }, [showDuprRequiredModal, currentUser?.uid]);

  // Handle free registration (after payment or for free leagues)
  const handleFreeJoin = async () => {
    if (!currentUser || !userProfile) return;

    // V07.15: Final check before joining - get fresh data
    const freshLeague = await getLeague(leagueId);
    if (!freshLeague) {
      alert('League not found');
      return;
    }

    // Check max members one more time
    // V07.27: Allow joining if there are open teams
    const maxMembers = freshLeague.maxMembers || freshLeague.settings?.maxMembers;
    if (maxMembers && (freshLeague.memberCount || 0) >= maxMembers && !hasOpenTeams) {
      alert(`League is full (${freshLeague.memberCount}/${maxMembers} players)`);
      setShowPaymentModal(false);
      return;
    }

    // Check DUPR requirement
    const duprMode = freshLeague.settings?.duprSettings?.mode;
    if (duprMode === 'required' && !userProfile.duprId) {
      setShowPaymentModal(false);
      setShowDuprRequiredModal(true);
      return;
    }

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
    if (!myMembership || !currentUser) return;

    // V07.27: Check if current user is the partner (not primary member)
    const isPartner = myMembership.partnerUserId === currentUser.uid && myMembership.userId !== currentUser.uid;

    const confirmMessage = isPartner
      ? 'Are you sure you want to leave this team? The team owner will need to find a new partner.'
      : 'Are you sure you want to leave this league?';

    if (!confirm(confirmMessage)) return;

    try {
      // V07.27: Pass userId so leaveLeague knows if partner or primary is leaving
      await leaveLeague(leagueId, myMembership.id, currentUser.uid);
      setMyMembership(null);
    } catch (e: any) {
      alert('Failed to leave: ' + e.message);
    }
  };

  // V07.27: Handle partner invite response (accept/decline)
  const handleInviteResponse = async (inviteId: string, response: 'accepted' | 'declined') => {
    setRespondingToInvite(inviteId);
    try {
      const result = await respondToLeaguePartnerInviteAtomic(inviteId, response);

      if (response === 'accepted' && result) {
        // Refresh membership after accepting
        if (currentUser) {
          const membership = await getLeagueMemberByUserId(leagueId, currentUser.uid);
          setMyMembership(membership);
        }
      }
    } catch (e: any) {
      alert('Failed to respond to invite: ' + e.message);
    } finally {
      setRespondingToInvite(null);
    }
  };

  // V07.27: Join request handler removed - direct join flow now used

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
  // V07.15: Check both league.maxMembers and league.settings.maxMembers (stored in settings)
  const effectiveMaxMembers = league.maxMembers || league.settings?.maxMembers;
  const isFull = effectiveMaxMembers ? (league.memberCount || 0) >= effectiveMaxMembers : false;

  // V07.27: Check if there are open teams looking for partners
  const openTeams = members.filter(m =>
    m.status === 'pending_partner' &&
    m.isLookingForPartner &&
    !m.pendingRequesterName // Not already have someone requesting to join
  );
  const hasOpenTeams = openTeams.length > 0;

  // V07.27: For doubles leagues, allow joining open teams even when league is "full"
  // (joining an open team doesn't create a new team, it completes an existing one)
  const canJoinOpenTeam = isDoublesOrMixed && isFull && hasOpenTeams && !myMembership &&
    (league.status === 'registration' || league.status === 'active');
  const canJoin = !myMembership && (league.status === 'registration' || league.status === 'active') && (!isFull || canJoinOpenTeam);

  // V07.27: Join requests now use direct join - no approval UI needed
  // pendingJoinRequests subscription kept for potential cleanup of old data

  // Determine which tabs to show - Schedule, Players, DUPR, and Comms tabs only for organizers
  // V07.25: Courts tab only for box league organizers (check both competitionFormat and legacy format)
  // V07.26: DUPR tab only if league has DUPR enabled (mode is 'optional' or 'required')
  const isBoxLeagueFormat = league?.competitionFormat === 'rotating_doubles_box' || league?.competitionFormat === 'fixed_doubles_box' || league?.format === 'box_league';
  const isDuprEnabled = league?.settings?.duprSettings?.mode && league.settings.duprSettings.mode !== 'none';
  const availableTabs: TabType[] = isOrganizer
    ? isBoxLeagueFormat
      ? isDuprEnabled
        ? ['standings', 'matches', 'players', 'courts', 'schedule', 'dupr', 'info', 'comms']
        : ['standings', 'matches', 'players', 'courts', 'schedule', 'info', 'comms']
      : isDuprEnabled
        ? ['standings', 'matches', 'players', 'schedule', 'dupr', 'info', 'comms']
        : ['standings', 'matches', 'players', 'schedule', 'info', 'comms']
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
                onClick={() => handleJoin()}
                disabled={joining || (isFull && !canJoinOpenTeam)}
                className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg font-semibold text-sm transition-colors"
              >
                {isFull && !canJoinOpenTeam
                  ? '🚫 League Full'
                  : joining
                  ? 'Joining...'
                  : canJoinOpenTeam
                  ? '🤝 Join Open Team'
                  : '👤 Join as Player'}
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
              <span>
                {league.memberCount || members.length}
                {(league.maxMembers || league.settings?.maxMembers) ? `/${league.maxMembers || league.settings?.maxMembers}` : ''} {isDoublesOrMixed ? 'teams' : 'players'}
              </span>
            </div>

            {/* V07.15: Requirements badges */}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {/* DUPR Rating Range */}
              {(league.settings?.duprSettings?.minDuprRating || league.settings?.duprSettings?.maxDuprRating) && (
                <span className="bg-[#00B4D8]/20 text-[#00B4D8] px-2 py-0.5 rounded text-xs font-medium">
                  DUPR {league.settings.duprSettings.minDuprRating?.toFixed(1) || '0.0'} - {league.settings.duprSettings.maxDuprRating?.toFixed(1) || '8.0'}
                </span>
              )}
              {/* DUPR Required/Optional badge */}
              {league.settings?.duprSettings?.mode === 'required' && (
                <span className="bg-[#00B4D8]/20 text-[#00B4D8] px-2 py-0.5 rounded text-xs font-medium">
                  DUPR Required
                </span>
              )}
              {league.settings?.duprSettings?.mode === 'optional' && (
                <span className="bg-[#00B4D8]/10 text-[#00B4D8]/80 px-2 py-0.5 rounded text-xs">
                  DUPR Optional
                </span>
              )}
              {/* Age Range */}
              {(league.settings?.minAge || league.settings?.maxAge) && (
                <span className="bg-purple-600/20 text-purple-400 px-2 py-0.5 rounded text-xs font-medium">
                  {league.settings.minAge && league.settings.maxAge
                    ? `Ages ${league.settings.minAge}-${league.settings.maxAge}`
                    : league.settings.minAge
                      ? `Ages ${league.settings.minAge}+`
                      : `Ages ${league.settings.maxAge} & under`
                  }
                </span>
              )}
              {/* Rating Range (non-DUPR) */}
              {(league.settings?.minRating || league.settings?.maxRating) && !league.settings?.duprSettings?.minDuprRating && !league.settings?.duprSettings?.maxDuprRating && (
                <span className="bg-orange-600/20 text-orange-400 px-2 py-0.5 rounded text-xs font-medium">
                  {league.settings.minRating?.toFixed(1) || '0.0'} - {league.settings.maxRating?.toFixed(1) || '5.0'} Rating
                </span>
              )}
              {/* Almost Full indicator (not full yet) */}
              {effectiveMaxMembers && !isFull && (league.memberCount || 0) >= effectiveMaxMembers * 0.8 && (
                <span className="bg-yellow-600/20 text-yellow-400 px-2 py-0.5 rounded text-xs font-medium">
                  ⚡ Almost Full ({effectiveMaxMembers - (league.memberCount || 0)} spots left)
                </span>
              )}
            </div>

            {/* V07.26: Venue & Game Times */}
            {(league.venue || league.location || league.settings?.gameTime) && (
              <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-400">
                {(league.venue || league.location) && (
                  <div className="flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>{league.venue || league.location}</span>
                  </div>
                )}
                {league.settings?.gameTime && (
                  <div className="flex items-center gap-1.5">
                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>{league.settings.gameTime}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Full league notice - subtle inline display */}
          {isFull && (
            <div className={`rounded-lg px-4 py-2 flex items-center gap-3 ${
              hasOpenTeams
                ? 'bg-lime-900/30 border border-lime-600/50'
                : 'bg-gray-700/50 border border-gray-600'
            }`}>
              <span className={`px-2 py-1 rounded text-sm font-medium ${
                hasOpenTeams
                  ? 'bg-lime-500/20 text-lime-400'
                  : 'bg-orange-500/20 text-orange-400'
              }`}>
                {hasOpenTeams ? 'Open Teams' : 'Full'}
              </span>
              <span className="text-gray-300 text-sm">
                {hasOpenTeams
                  ? `${openTeams.length} team${openTeams.length !== 1 ? 's' : ''} looking for partners — You can still join!`
                  : `${effectiveMaxMembers}/${effectiveMaxMembers} ${isDoublesOrMixed ? 'teams' : 'players'} — Registration closed`
                }
              </span>
            </div>
          )}

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
                onClick={() => handleJoin()}
                disabled={joining}
                className={`${canJoinOpenTeam ? 'bg-lime-600 hover:bg-lime-500' : 'bg-blue-600 hover:bg-blue-500'} disabled:bg-gray-600 text-white px-6 py-2 rounded-lg font-semibold transition-colors`}
              >
                {joining
                  ? 'Joining...'
                  : canJoinOpenTeam
                  ? '🤝 Join Open Team'
                  : isDoublesOrMixed
                  ? 'Register Team'
                  : 'Join League'}
              </button>
            )
          )}
          
          {/* Member status for organizer who joined */}
          {currentUser && isOrganizer && myMembership && (
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

      {/* V07.27: Pending Partner Invites Banner */}
      {pendingInvites.length > 0 && (
        <div className="mb-4 space-y-3">
          {pendingInvites.map((invite) => (
            <div
              key={invite.id}
              className="bg-gradient-to-r from-lime-900/40 to-lime-800/20 border border-lime-600/50 rounded-xl p-4"
            >
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-lime-600/30 flex items-center justify-center">
                    <span className="text-lime-400 text-lg">🤝</span>
                  </div>
                  <div>
                    <p className="text-white font-semibold">
                      Partner Invitation from {invite.inviterName}
                    </p>
                    <p className="text-gray-400 text-sm">
                      You've been invited to join their team in this league
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleInviteResponse(invite.id, 'declined')}
                    disabled={respondingToInvite === invite.id}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-gray-300 rounded-lg text-sm font-semibold transition-colors"
                  >
                    Decline
                  </button>
                  <button
                    onClick={() => {
                      setConfirmingInvite(invite);
                      setInviteAcknowledged(false);
                    }}
                    disabled={respondingToInvite === invite.id}
                    className="px-4 py-2 bg-lime-600 hover:bg-lime-500 disabled:bg-lime-800 text-white rounded-lg text-sm font-semibold transition-colors"
                  >
                    {respondingToInvite === invite.id ? 'Accepting...' : 'Review & Accept'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* V07.27: Join requests are now handled via direct join - no approval needed */}
      {/* Old pending requests will be auto-cancelled when someone joins the team */}

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
            {tab === 'comms' && '📨 '}
            {tab === 'dupr' ? 'DUPR' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* STANDINGS TAB */}
      {activeTab === 'standings' && league && (
        <div className="space-y-4">
          {/* V07.26: Use BoxLeagueStandings for rotating_doubles_box format */}
          {league.competitionFormat === 'rotating_doubles_box' ? (
            <BoxLeagueStandings
              leagueId={leagueId}
              members={filteredMembers}
              isOrganizer={isOrganizer}
              currentUserId={currentUser?.uid}
            />
          ) : (
          <>
          {/* V07.16: Standings Sub-Tabs (Overall + Weekly) */}
          <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-700">
            {/* Overall Tab */}
            <button
              onClick={() => setActiveStandingsTab('overall')}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeStandingsTab === 'overall'
                  ? 'bg-lime-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              🏆 Overall
            </button>
            {/* Weekly Tabs */}
            {weeks.map(week => {
              const weekMatches = matchesByWeek[week] || [];
              const completedCount = weekMatches.filter(m => m.status === 'completed').length;
              const isActive = activeStandingsTab === `week-${week}`;
              return (
                <button
                  key={week}
                  onClick={() => setActiveStandingsTab(`week-${week}`)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Week {week}
                  {completedCount > 0 && (
                    <span className="ml-1 text-xs opacity-70">({completedCount})</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* V07.14: Staleness indicator for organizers */}
          {isOrganizer && standingsStatus === 'stale' && (
            <div className="bg-yellow-900/30 border border-yellow-600/50 p-3 rounded-lg flex items-center justify-between">
              <span className="text-yellow-400 text-sm">
                ⚠️ Standings may be outdated - a match was edited after last calculation
              </span>
              <button
                onClick={handleRecalculateStandings}
                disabled={isRecalculating}
                className="bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
              >
                {isRecalculating ? 'Recalculating...' : 'Recalculate'}
              </button>
            </div>
          )}
          {isOrganizer && standingsStatus === 'missing' && matches.some(m => m.status === 'completed') && (
            <div className="bg-blue-900/30 border border-blue-600/50 p-3 rounded-lg flex items-center justify-between">
              <span className="text-blue-400 text-sm">
                📊 Standings snapshot not yet created - click to generate from match results
              </span>
              <button
                onClick={handleRecalculateStandings}
                disabled={isRecalculating}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
              >
                {isRecalculating ? 'Generating...' : 'Generate Standings'}
              </button>
            </div>
          )}
          {/* V07.16: Show recalculate when standings have errors */}
          {isOrganizer && overallStandings && overallStandings.errors && overallStandings.errors.length > 0 && standingsStatus !== 'stale' && (
            <div className="bg-red-900/30 border border-red-600/50 p-3 rounded-lg flex items-center justify-between">
              <span className="text-red-400 text-sm">
                ⚠️ {overallStandings.errors.length} match errors found - recalculate to apply latest fixes
              </span>
              <button
                onClick={handleRecalculateStandings}
                disabled={isRecalculating}
                className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white px-3 py-1 rounded text-sm font-medium transition-colors"
              >
                {isRecalculating ? 'Recalculating...' : 'Recalculate'}
              </button>
            </div>
          )}

          {/* Overall Standings View - Uses stored Firestore data */}
          {activeStandingsTab === 'overall' && (() => {
            // V07.16: Use stored overallStandings from Firestore (same pattern as weekly)
            if (overallStandings && overallStandings.rows.length > 0) {
              // Convert LeagueStandingsRow[] to LeagueMember[] for the component
              const overallMembers: LeagueMember[] = overallStandings.rows.map(row => {
                const originalMember = filteredMembers.find(m => m.id === row.memberId);
                return {
                  id: row.memberId,
                  userId: originalMember?.userId || row.memberId,
                  displayName: row.displayName,
                  // V07.32: Include partner display name for doubles teams
                  partnerDisplayName: row.partnerDisplayName || originalMember?.partnerDisplayName || null,
                  leagueId: leagueId,
                  currentRank: row.rank,
                  joinedAt: originalMember?.joinedAt || Date.now(),
                  status: originalMember?.status || 'active',
                  role: originalMember?.role || 'member',
                  paymentStatus: originalMember?.paymentStatus || 'not_required',
                  stats: {
                    played: row.played,
                    wins: row.wins,
                    losses: row.losses,
                    draws: 0,
                    forfeits: 0,
                    points: row.leaguePoints,
                    gamesWon: row.gamesWon,
                    gamesLost: row.gamesLost,
                    pointsFor: row.pointsFor,
                    pointsAgainst: row.pointsAgainst,
                    currentStreak: 0,
                    bestWinStreak: 0,
                    recentForm: [],
                  },
                  duprId: originalMember?.duprId,
                } as unknown as LeagueMember;
              });

              return (
                <>
                  <div className="bg-lime-900/30 rounded-lg p-3 border border-lime-600/50 mb-2">
                    <p className="text-sm text-gray-300">
                      🏆 <span className="text-white font-medium">Season Standings</span> —
                      {overallStandings.completedMatches} of {overallStandings.totalMatches} matches completed
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Last calculated: {new Date(overallStandings.generatedAt).toLocaleString()}
                    </p>
                  </div>
                  <LeagueStandings
                    members={overallMembers}
                    format={league.format}
                    leagueType={league.type}
                    currentUserId={currentUser?.uid}
                    myMembership={myMembership}
                    onChallenge={league.format === 'ladder' && myMembership ? handleChallenge : undefined}
                    challengeRange={league.settings?.challengeRules?.challengeRange || 3}
                    showPointsForAgainst={true}
                  />
                </>
              );
            }

            // Fallback: no standings yet, show empty state with original members
            return (
              <>
                <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700 mb-2">
                  <p className="text-sm text-gray-400">
                    📊 <span className="text-white font-medium">Season Standings</span> — No matches completed yet
                  </p>
                </div>
                <LeagueStandings
                  members={filteredMembers}
                  format={league.format}
                  leagueType={league.type}
                  currentUserId={currentUser?.uid}
                  myMembership={myMembership}
                  onChallenge={league.format === 'ladder' && myMembership ? handleChallenge : undefined}
                  challengeRange={league.settings?.challengeRules?.challengeRange || 3}
                  showPointsForAgainst={true}
                />
              </>
            );
          })()}

          {/* Weekly Standings View - Uses stored Firestore data */}
          {activeStandingsTab.startsWith('week-') && (() => {
            const weekNum = parseInt(activeStandingsTab.replace('week-', ''));
            const weekMatches = matchesByWeek[weekNum] || [];
            const storedWeekStandings = weekStandings.get(weekNum);

            // If we have stored standings from Firestore, use them
            if (storedWeekStandings && storedWeekStandings.rows.length > 0) {
              // Convert LeagueStandingsRow[] to LeagueMember[] for the component
              const weeklyMembers: LeagueMember[] = storedWeekStandings.rows.map(row => {
                // Find the original member to get additional data
                const originalMember = filteredMembers.find(m => m.id === row.memberId);
                return {
                  id: row.memberId,
                  userId: originalMember?.userId || row.memberId,
                  displayName: row.displayName,
                  // V07.32: Include partner display name for doubles teams
                  partnerDisplayName: row.partnerDisplayName || originalMember?.partnerDisplayName || null,
                  leagueId: leagueId,
                  currentRank: row.rank,
                  joinedAt: originalMember?.joinedAt || Date.now(),
                  status: originalMember?.status || 'active',
                  role: originalMember?.role || 'member',
                  paymentStatus: originalMember?.paymentStatus || 'not_required',
                  stats: {
                    played: row.played,
                    wins: row.wins,
                    losses: row.losses,
                    draws: 0,
                    forfeits: 0,
                    points: row.leaguePoints,
                    gamesWon: row.gamesWon,
                    gamesLost: row.gamesLost,
                    pointsFor: row.pointsFor,
                    pointsAgainst: row.pointsAgainst,
                    currentStreak: 0,
                    bestWinStreak: 0,
                    recentForm: [],
                  },
                  duprId: originalMember?.duprId,
                } as unknown as LeagueMember;
              });

              return (
                <>
                  <div className="bg-blue-900/30 rounded-lg p-3 border border-blue-600/50 mb-2">
                    <p className="text-sm text-gray-300">
                      📅 <span className="text-white font-medium">Week {weekNum} Standings</span> —
                      {storedWeekStandings.completedMatches} of {storedWeekStandings.totalMatches} matches completed
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Last calculated: {new Date(storedWeekStandings.generatedAt).toLocaleString()}
                    </p>
                  </div>
                  <LeagueStandings
                    members={weeklyMembers}
                    format={league.format}
                    leagueType={league.type}
                    currentUserId={currentUser?.uid}
                    myMembership={myMembership}
                    showPointsForAgainst={true}
                  />
                </>
              );
            }

            // Fallback: No stored standings yet - show message
            return (
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 text-center">
                <p className="text-gray-400 mb-2">
                  📅 Week {weekNum} standings not yet calculated
                </p>
                <p className="text-sm text-gray-500">
                  {weekMatches.filter(m => m.status === 'completed').length} of {weekMatches.length} matches completed
                </p>
                {isOrganizer && (
                  <button
                    onClick={handleRecalculateStandings}
                    disabled={isRecalculating}
                    className="mt-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    {isRecalculating ? 'Calculating...' : 'Calculate Standings'}
                  </button>
                )}
              </div>
            );
          })()}
          </>
          )}
        </div>
      )}

      {/* MATCHES TAB */}
      {activeTab === 'matches' && (
        <div className="space-y-4">
          {/* V07.31: Compact Week State Control Strip (Organizer Only) */}
          {isOrganizer && weeks.length > 0 && (
            <div className="bg-gray-800/80 backdrop-blur border border-gray-700/50 rounded-xl p-3">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                {/* Control strip */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Week Status</span>
                  <div className="flex items-center gap-1 bg-gray-900/50 rounded-lg p-1">
                    {weeks.map(week => {
                      const weekState = league ? getWeekState(league, week) : 'open';
                      const weekMatches = matchesByWeek[week] || [];
                      const completedCount = weekMatches.filter(m => m.status === 'completed').length;
                      const allComplete = weekMatches.length > 0 && completedCount === weekMatches.length;

                      // Cycle through states: closed -> open -> locked -> closed
                      const nextState = weekState === 'closed' ? 'open' : weekState === 'open' ? 'locked' : 'closed';

                      return (
                        <button
                          key={`state-${week}`}
                          onClick={() => handleSetWeekState(week, nextState)}
                          disabled={isRecalculating}
                          className={`
                            relative w-8 h-8 rounded-lg font-mono text-sm font-bold
                            transition-all duration-200 ease-out
                            ${isRecalculating ? 'opacity-50 cursor-not-allowed' : 'hover:scale-110 hover:z-10'}
                            ${weekState === 'closed'
                              ? 'bg-gray-700 text-gray-400 border-2 border-gray-600'
                              : weekState === 'open'
                                ? 'bg-lime-500/20 text-lime-400 border-2 border-lime-500 shadow-lg shadow-lime-500/20'
                                : 'bg-blue-500/20 text-blue-400 border-2 border-blue-500 shadow-lg shadow-blue-500/20'
                            }
                          `}
                          title={`Week ${week}: ${weekState === 'closed' ? 'Not Started' : weekState === 'open' ? 'Scoring Open' : 'Finalized'}${allComplete ? ' ✓' : ''} - Click to change`}
                        >
                          {week}
                          {weekState === 'locked' && (
                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full flex items-center justify-center">
                              <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                              </svg>
                            </span>
                          )}
                          {allComplete && weekState !== 'locked' && (
                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Legend - V07.32: More descriptive labels */}
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-gray-700 border border-gray-600" />
                    <span className="text-gray-500">Not Started</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-lime-500/20 border border-lime-500" />
                    <span className="text-gray-500">Scoring Open</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded bg-blue-500/20 border border-blue-500" />
                    <span className="text-gray-500">Finalized</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Week Sub-Tabs (Navigation Only) */}
          <div className="flex gap-1 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-700">
            {weeks.map(week => {
              const weekMatches = matchesByWeek[week] || [];
              const completedCount = weekMatches.filter(m => m.status === 'completed').length;
              const isCurrentWeek = activeWeekTab === `week-${week}`;
              const weekState = league ? getWeekState(league, week) : 'open';

              return (
                <button
                  key={`week-${week}`}
                  onClick={() => setActiveWeekTab(`week-${week}`)}
                  className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isCurrentWeek
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Week {week}
                  {weekState === 'closed' && <span className="ml-1 opacity-60">⏸</span>}
                  {weekState === 'locked' && <span className="ml-1 text-blue-300">🔒</span>}
                  {completedCount > 0 && (
                    <span className={`ml-1 text-xs ${isCurrentWeek ? 'text-blue-200' : 'text-gray-500'}`}>
                      ({completedCount}/{weekMatches.length})
                    </span>
                  )}
                </button>
              );
            })}

            {/* Finals Tab - Only show if there are finals matches */}
            {finalsMatches.length > 0 && (
              <button
                onClick={() => setActiveWeekTab('finals')}
                className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeWeekTab === 'finals'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Finals
              </button>
            )}
          </div>

          {/* Content based on selected sub-tab */}
          {filteredMatches.length === 0 ? (
            <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 text-center text-gray-400">
              No matches yet
            </div>
          ) : activeWeekTab === 'finals' ? (
            /* Finals Matches */
            <div className="space-y-3">
              <div className="bg-purple-900/30 rounded-lg p-4 border border-purple-600/50 mb-4">
                <h3 className="font-semibold text-purple-300 flex items-center gap-2">
                  Finals Evening
                </h3>
                <p className="text-sm text-gray-400 mt-1">
                  Playoff matches to determine the league champion.
                </p>
              </div>
              {finalsMatches.map(match => (
                <LeagueMatchCard
                  key={match.id}
                  match={match}
                  currentUserId={currentUser?.uid}
                  isOrganizer={isOrganizer}
                  showWeek={false}
                  showRound={true}
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
              ))}
            </div>
          ) : (
            /* Week Matches */
            <div className="space-y-3">
              {(() => {
                const currentWeekNumber = parseInt(activeWeekTab.replace('week-', ''), 10) || lastPlayedWeek;
                const weekMatches = matchesByWeek[currentWeekNumber] || [];
                const currentWeekState = league ? getWeekState(league, currentWeekNumber) : 'open';
                const weekLocked = currentWeekState !== 'open'; // Scoring disabled if not 'open'

                if (weekMatches.length === 0) {
                  return (
                    <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 text-center text-gray-400">
                      No matches scheduled for Week {currentWeekNumber}
                    </div>
                  );
                }

                // V07.26: Group matches by box for box leagues
                const isBoxLeague = league?.competitionFormat === 'rotating_doubles_box' ||
                                   league?.competitionFormat === 'fixed_doubles_box';

                // Group matches by box number
                const matchesByBox: Record<number, typeof weekMatches> = {};
                if (isBoxLeague) {
                  weekMatches.forEach(match => {
                    const boxNum = match.boxNumber || 0;
                    if (!matchesByBox[boxNum]) matchesByBox[boxNum] = [];
                    matchesByBox[boxNum].push(match);
                  });
                }
                const boxNumbers = Object.keys(matchesByBox).map(Number).sort((a, b) => a - b);

                // Box colors - gradient from darker (top box) to lighter (bottom box)
                const BOX_COLORS = [
                  'from-blue-900/40 to-blue-900/20 border-blue-700/50',      // Box 1 - darkest
                  'from-blue-800/40 to-blue-800/20 border-blue-600/50',      // Box 2
                  'from-sky-800/40 to-sky-800/20 border-sky-600/50',         // Box 3
                  'from-sky-700/40 to-sky-700/20 border-sky-500/50',         // Box 4
                  'from-cyan-700/40 to-cyan-700/20 border-cyan-500/50',      // Box 5
                  'from-cyan-600/40 to-cyan-600/20 border-cyan-400/50',      // Box 6
                  'from-teal-600/40 to-teal-600/20 border-teal-400/50',      // Box 7
                  'from-teal-500/40 to-teal-500/20 border-teal-300/50',      // Box 8 - lightest
                ];
                const getBoxColor = (boxNum: number) => BOX_COLORS[Math.min(boxNum - 1, BOX_COLORS.length - 1)] || BOX_COLORS[0];

                return (
                  <>
                    {/* V07.29: Show week state banner for players */}
                    {currentWeekState === 'closed' && !isOrganizer && (
                      <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-lg p-3 flex items-center gap-2">
                        <span className="text-lg">⏸</span>
                        <div>
                          <p className="text-yellow-300 font-medium text-sm">Week {currentWeekNumber} is not yet open for scoring</p>
                          <p className="text-yellow-200/70 text-xs">The organizer will open this week when it's time to play.</p>
                        </div>
                      </div>
                    )}
                    {currentWeekState === 'locked' && !isOrganizer && (
                      <div className="bg-blue-900/30 border border-blue-600/50 rounded-lg p-3 flex items-center gap-2">
                        <span className="text-lg">🔒</span>
                        <div>
                          <p className="text-blue-300 font-medium text-sm">Week {currentWeekNumber} has been finalized</p>
                          <p className="text-blue-200/70 text-xs">Results are locked and standings have been updated.</p>
                        </div>
                      </div>
                    )}

                    {/* V07.26: Box League - Group by boxes */}
                    {isBoxLeague && boxNumbers.length > 0 ? (
                      <div className="space-y-6">
                        {boxNumbers.map(boxNum => {
                          const boxMatches = matchesByBox[boxNum] || [];
                          // Sort by round number
                          boxMatches.sort((a, b) => (a.roundNumber || 0) - (b.roundNumber || 0));
                          const completedCount = boxMatches.filter(m => m.status === 'completed').length;

                          return (
                            <div
                              key={`box-${boxNum}`}
                              className={`rounded-xl border bg-gradient-to-b ${getBoxColor(boxNum)} overflow-hidden`}
                            >
                              {/* Box Header */}
                              <div className="px-4 py-3 border-b border-gray-700/50 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <span className="text-2xl font-bold text-white">Box {boxNum}</span>
                                  <span className="text-sm text-gray-400">
                                    {boxMatches.length} matches
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {completedCount === boxMatches.length ? (
                                    <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-full">
                                      ✓ Complete
                                    </span>
                                  ) : (
                                    <span className="text-xs bg-gray-700/50 text-gray-400 px-2 py-1 rounded-full">
                                      {completedCount}/{boxMatches.length} played
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Box Matches */}
                              <div className="p-3 space-y-2">
                                {boxMatches.map(match => (
                                  <LeagueMatchCard
                                    key={match.id}
                                    match={match}
                                    currentUserId={currentUser?.uid}
                                    isOrganizer={isOrganizer}
                                    showWeek={false}
                                    showRound={true}
                                    compact={true}
                                    verificationSettings={league?.settings?.scoreVerification || undefined}
                                    weekLocked={weekLocked}
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
                                    showDuprButton={false}
                                  />
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      /* Non-box league - flat list */
                      weekMatches.map(match => (
                        <LeagueMatchCard
                          key={match.id}
                          match={match}
                          currentUserId={currentUser?.uid}
                          isOrganizer={isOrganizer}
                          showWeek={false}
                          showRound={league?.format === 'swiss' || league?.format === 'box_league'}
                          verificationSettings={league?.settings?.scoreVerification || undefined}
                          weekLocked={weekLocked}
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
                  </>
                );
              })()}
            </div>
          )}

          {/* V07.28: Box League Absence Panel */}
          {(league.competitionFormat === 'rotating_doubles_box' || league.competitionFormat === 'fixed_doubles_box') && currentUser && (
            <BoxLeagueAbsencePanel
              leagueId={leagueId}
              league={league}
              currentUserId={currentUser.uid}
              isOrganizer={isOrganizer}
              members={members}
            />
          )}
        </div>
      )}

      {/* PLAYERS TAB - Organizer Only */}
      {activeTab === 'players' && isOrganizer && (
        <div className="space-y-4">
          {league.competitionFormat === 'rotating_doubles_box' || league.competitionFormat === 'fixed_doubles_box' ? (
            // V07.25: Rotating/Fixed Doubles Box - Show new box management component
            <RotatingBoxPlayerManager
              leagueId={leagueId}
              members={members}
              isOrganizer={isOrganizer}
              disabled={league.status === 'completed'}
            />
          ) : league.format === 'box_league' && !league.competitionFormat ? (
            // Legacy Box League: Show old box-based drag-drop management
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
              {isBoxLeagueFormat ? 'Managing Boxes' : 'Managing Seeding'}
            </h4>
            <p className="text-sm text-gray-500">
              {isBoxLeagueFormat
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

      {/* COURTS TAB - Box League Organizer Only */}
      {activeTab === 'courts' && isOrganizer && isBoxLeagueFormat && (
        <div className="space-y-6">
          {/* Header */}
          <div className="bg-lime-900/20 p-4 rounded-xl border border-lime-700/50">
            <h3 className="font-semibold text-lime-400 flex items-center gap-2">
              <span>🏟️</span> Courts & Sessions Management
            </h3>
            <p className="text-sm text-gray-400 mt-1">
              Manage courts and session time slots for your box league.
            </p>
          </div>

          {/* Current Configuration */}
          <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
            <h4 className="text-lg font-bold text-white mb-4">Current Configuration</h4>

            {league.settings?.rotatingDoublesBox?.venue?.courts && league.settings.rotatingDoublesBox.venue.courts.length > 0 ? (
              <div className="space-y-4">
                {/* Courts List */}
                <div>
                  <h5 className="text-sm font-medium text-gray-400 mb-2">Courts ({league.settings.rotatingDoublesBox.venue.courts.length})</h5>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {league.settings.rotatingDoublesBox.venue.courts.map((court, idx: number) => (
                      <div
                        key={court.id || idx}
                        className={`
                          p-3 rounded-lg border
                          ${court.active !== false
                            ? 'bg-lime-900/20 border-lime-700/50 text-lime-400'
                            : 'bg-gray-900 border-gray-700 text-gray-500'
                          }
                        `}
                      >
                        <div className="font-medium">{court.name || `Court ${idx + 1}`}</div>
                        <div className="text-xs opacity-75">
                          {court.active !== false ? 'Active' : 'Inactive'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sessions (if box league has them) */}
                {league.settings?.rotatingDoublesBox?.venue?.sessions && league.settings.rotatingDoublesBox.venue.sessions.length > 0 && (
                  <div>
                    <h5 className="text-sm font-medium text-gray-400 mb-2">
                      Sessions ({league.settings.rotatingDoublesBox.venue.sessions.length})
                    </h5>
                    <div className="space-y-2">
                      {league.settings.rotatingDoublesBox.venue.sessions.map((session, idx: number) => (
                        <div
                          key={session.id || idx}
                          className={`
                            p-3 rounded-lg border flex items-center justify-between
                            ${session.active !== false
                              ? 'bg-cyan-900/20 border-cyan-700/50'
                              : 'bg-gray-900 border-gray-700 opacity-50'
                            }
                          `}
                        >
                          <div>
                            <div className="font-medium text-white">{session.name || `Session ${idx + 1}`}</div>
                            <div className="text-xs text-gray-400">
                              {session.startTime} - {session.endTime}
                            </div>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded ${session.active !== false ? 'bg-cyan-500/20 text-cyan-400' : 'bg-gray-700 text-gray-500'}`}>
                            {session.active !== false ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Capacity Summary */}
                <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                  <h5 className="text-sm font-medium text-gray-400 mb-3">Capacity Summary</h5>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-white">
                        {league.settings.rotatingDoublesBox.venue.courts.filter((c) => c.active !== false).length}
                      </div>
                      <div className="text-xs text-gray-500">Courts</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-white">
                        {league.settings?.rotatingDoublesBox?.venue?.sessions?.filter((s) => s.active !== false).length || 1}
                      </div>
                      <div className="text-xs text-gray-500">Sessions</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-lime-400">
                        {(league.settings.rotatingDoublesBox.venue.courts.filter((c) => c.active !== false).length) *
                         (league.settings?.rotatingDoublesBox?.venue?.sessions?.filter((s) => s.active !== false).length || 1)}
                      </div>
                      <div className="text-xs text-gray-500">Boxes</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-lime-400">
                        {(league.settings.rotatingDoublesBox.venue.courts.filter((c) => c.active !== false).length) *
                         (league.settings?.rotatingDoublesBox?.venue?.sessions?.filter((s) => s.active !== false).length || 1) *
                         (league.settings?.rotatingDoublesBox?.settings?.boxSize || 5)}
                      </div>
                      <div className="text-xs text-gray-500">Max Players</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="text-4xl mb-3">🏟️</div>
                <p className="text-gray-400">No venue configured for this league.</p>
                <p className="text-sm text-gray-500 mt-1">
                  Courts and sessions were not set up during league creation.
                </p>
              </div>
            )}
          </div>

          {/* Edit Notice */}
          <div className="bg-gray-700/30 p-4 rounded-lg border border-gray-600">
            <p className="text-gray-400 text-sm">
              <strong className="text-white">Note:</strong> To modify courts or sessions,
              edit the league settings. Changes will affect future weeks only.
            </p>
          </div>
        </div>
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
                Refund policy: {
                  league.pricing.refundPolicy === 'full' ? '100% refund before start' :
                  league.pricing.refundPolicy === 'full_14days' ? '100% refund up to 14 days before' :
                  league.pricing.refundPolicy === 'full_7days' ? '100% refund up to 7 days before' :
                  league.pricing.refundPolicy === '75_percent' ? '75% refund before start' :
                  league.pricing.refundPolicy === 'partial' ? '50% refund before start' :
                  league.pricing.refundPolicy === '25_percent' ? '25% refund before start' :
                  league.pricing.refundPolicy === 'admin_fee_only' ? 'Full minus $5 admin fee' :
                  'No refunds'
                }
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

          {/* V07.26: Box League Organizer Guide */}
          {isOrganizer && (league.competitionFormat === 'rotating_doubles_box' || league.competitionFormat === 'fixed_doubles_box') && (
            <div className="bg-gradient-to-br from-blue-900/30 to-purple-900/30 rounded-xl p-5 border border-blue-700/50">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <span className="text-2xl">📋</span>
                Organizer Guide - Running Your Box League
              </h3>

              {/* Starting the League */}
              <div className="mb-6">
                <h4 className="font-semibold text-lime-400 mb-2">1. Starting the League</h4>
                <ul className="text-sm text-gray-300 space-y-1 ml-4">
                  <li>• Go to <span className="text-white font-medium">Schedule tab</span></li>
                  <li>• Click <span className="text-white font-medium">"Generate Schedule"</span></li>
                  <li>• Week 1 is created with players sorted by DUPR rating into boxes</li>
                  <li>• Matches are automatically generated for all boxes</li>
                </ul>
              </div>

              {/* Week States */}
              <div className="mb-6">
                <h4 className="font-semibold text-lime-400 mb-2">2. Week States</h4>
                <p className="text-sm text-gray-400 mb-2">Control week states from the strip at the top of the Matches tab:</p>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                    <div className="w-6 h-6 mx-auto mb-1 rounded bg-gray-700 border border-gray-600 flex items-center justify-center text-gray-400">⏸</div>
                    <span className="text-gray-400">Not Started</span>
                    <p className="text-gray-500 mt-1">Players can't score</p>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                    <div className="w-6 h-6 mx-auto mb-1 rounded bg-lime-500/20 border border-lime-500 flex items-center justify-center text-lime-400">●</div>
                    <span className="text-lime-400">Scoring Open</span>
                    <p className="text-gray-500 mt-1">Players enter scores</p>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                    <div className="w-6 h-6 mx-auto mb-1 rounded bg-blue-500/20 border border-blue-500 flex items-center justify-center text-blue-400">🔒</div>
                    <span className="text-blue-400">Finalized</span>
                    <p className="text-gray-500 mt-1">Scores locked</p>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">Click week numbers to cycle through states</p>
              </div>

              {/* Entering Scores */}
              <div className="mb-6">
                <h4 className="font-semibold text-lime-400 mb-2">3. Score Entry Flow</h4>
                <div className="bg-gray-800/50 rounded-lg p-3 text-sm">
                  <div className="flex items-center gap-2 text-gray-300">
                    <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded">Player A</span>
                    <span>enters score</span>
                    <span className="text-gray-500">→</span>
                    <span className="bg-yellow-600/20 text-yellow-400 text-xs px-2 py-0.5 rounded">Awaiting Confirmation</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-300 mt-2">
                    <span className="bg-purple-600 text-white text-xs px-2 py-0.5 rounded">Opponent</span>
                    <span>confirms</span>
                    <span className="text-gray-500">→</span>
                    <span className="bg-green-600/20 text-green-400 text-xs px-2 py-0.5 rounded">Completed</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">You can override/enter any score as organizer</p>
                </div>
              </div>

              {/* Ending a Week */}
              <div className="mb-6">
                <h4 className="font-semibold text-lime-400 mb-2">4. Ending a Week</h4>
                <ul className="text-sm text-gray-300 space-y-1 ml-4">
                  <li>• Wait for all boxes to show <span className="text-green-400">✓ Complete</span></li>
                  <li>• Click week number to change to <span className="text-blue-400">Finalized 🔒</span></li>
                  <li>• Standings are automatically recalculated</li>
                </ul>
              </div>

              {/* Moving to Next Week */}
              <div className="mb-6">
                <h4 className="font-semibold text-lime-400 mb-2">5. Moving to Next Week</h4>
                <ul className="text-sm text-gray-300 space-y-1 ml-4">
                  <li>• Go to <span className="text-white font-medium">Schedule tab</span></li>
                  <li>• Click <span className="text-white font-medium">"Generate Next Week"</span></li>
                  <li>• Promotions/relegations are applied automatically</li>
                  <li>• New matches generated with updated box assignments</li>
                </ul>
              </div>

              {/* Promotion Rules */}
              <div className="bg-gray-800/50 rounded-lg p-3">
                <h4 className="font-semibold text-white mb-2 text-sm">Promotion & Relegation</h4>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1">
                    <span className="text-green-400 font-bold">▲</span>
                    <span className="text-gray-400">Top players promote up</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-red-400 font-bold">▼</span>
                    <span className="text-gray-400">Bottom players relegate down</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">Box 1 (top): No promotion • Last box: No relegation</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* COMMS TAB - V07.17: League Communications */}
      {activeTab === 'comms' && isOrganizer && (
        <LeagueCommsTab
          league={league}
          divisions={divisions}
          members={members}
          currentUserId={currentUser?.uid || ''}
        />
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
                  checked={duprCheckboxChecked}
                  onChange={(e) => setDuprCheckboxChecked(e.target.checked)}
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
                  if (duprCheckboxChecked) {
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

      {/* V07.15: DUPR Required Modal - Link DUPR account to join */}
      {showDuprRequiredModal && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 w-full max-w-lg rounded-xl border border-gray-700 overflow-hidden">
            {/* Header */}
            <div className="bg-[#00B4D8]/20 px-6 py-4 border-b border-[#00B4D8]/30">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <span className="text-2xl">📊</span> DUPR Account Required
                </h2>
                <button
                  onClick={() => setShowDuprRequiredModal(false)}
                  disabled={duprLinking}
                  className="text-gray-400 hover:text-white disabled:opacity-50"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              <div className="bg-[#00B4D8]/10 border border-[#00B4D8]/30 rounded-lg p-4 mb-4">
                <p className="text-[#00B4D8] font-medium mb-2">
                  This league requires a DUPR account
                </p>
                <p className="text-gray-400 text-sm">
                  Link your DUPR account below to join this league. Your match results will be submitted to DUPR for official rating.
                </p>
              </div>

              {/* Loading state when linking */}
              {duprLinking ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 border-4 border-[#00B4D8] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-white">Linking your DUPR account...</p>
                </div>
              ) : (
                <>
                  {/* DUPR Login iframe */}
                  <div className="bg-white rounded-lg overflow-hidden mb-4">
                    <iframe
                      src={getDuprLoginIframeUrl()}
                      title="Login with DUPR"
                      className="w-full h-[400px] border-0"
                      allow="clipboard-read; clipboard-write"
                    />
                  </div>

                  {/* Register link */}
                  <p className="text-xs text-gray-500 text-center">
                    Don't have a DUPR account?{' '}
                    <a
                      href="https://mydupr.com/signup"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#00B4D8] hover:underline"
                    >
                      Create one for free at mydupr.com
                    </a>
                  </p>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-900 border-t border-gray-700">
              <button
                onClick={() => setShowDuprRequiredModal(false)}
                disabled={duprLinking}
                className="w-full py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* V07.25: Waiver Acceptance Modal - Purple Theme */}
      {showWaiverModal && league?.settings?.waiverRequired && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-xl max-w-2xl w-full shadow-xl border border-violet-500/30 overflow-hidden">
            {/* Header - Purple gradient */}
            <div className="px-6 py-4 border-b border-violet-500/30 bg-gradient-to-r from-violet-600/20 to-purple-600/20">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                📋 Waiver Agreement
              </h3>
              <p className="text-sm text-gray-400 mt-1">
                Please read and accept the waiver before joining
              </p>
            </div>

            {/* Body - Scrollable content */}
            <div className="p-6 space-y-4">
              <div className="bg-gray-900/50 rounded-lg p-4 border border-violet-500/20 max-h-[50vh] overflow-y-auto">
                <p className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">
                  {DEFAULT_WAIVER_TEXT}
                </p>
              </div>

              <label className="flex items-start gap-3 p-4 bg-gray-900/50 rounded-lg border border-violet-500/20 cursor-pointer hover:border-violet-500/50 transition-colors">
                <input
                  type="checkbox"
                  checked={waiverAccepted}
                  onChange={(e) => setWaiverAccepted(e.target.checked)}
                  className="w-5 h-5 mt-0.5 accent-violet-500"
                />
                <span className="text-white text-sm">
                  I have read and agree to the League & Tournament Participation Waiver.
                </span>
              </label>
            </div>

            {/* Footer - Purple button */}
            <div className="px-6 py-4 bg-gray-900 border-t border-violet-500/30 flex justify-end gap-3">
              <button
                onClick={() => setShowWaiverModal(false)}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (waiverAccepted) {
                    handleWaiverAccept();
                  } else {
                    alert('Please check the box to accept the waiver.');
                  }
                }}
                disabled={!waiverAccepted}
                className="px-6 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
              >
                Accept & Continue
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
                Refund Policy: {
                  league.pricing.refundPolicy === 'full' ? '100% refund before league starts' :
                  league.pricing.refundPolicy === 'full_14days' ? '100% refund up to 14 days before' :
                  league.pricing.refundPolicy === 'full_7days' ? '100% refund up to 7 days before' :
                  league.pricing.refundPolicy === '75_percent' ? '75% refund before league starts' :
                  league.pricing.refundPolicy === 'partial' ? '50% refund before league starts' :
                  league.pricing.refundPolicy === '25_percent' ? '25% refund before league starts' :
                  league.pricing.refundPolicy === 'admin_fee_only' ? 'Full minus $5 admin fee' :
                  'No refunds'
                }
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

              {/* FORMAT SPECIFIC - Round Robin */}
              {league?.format === 'round_robin' && (
                <RoundsSlider
                  value={editForm.roundRobinRounds}
                  onChange={(v) => setEditForm({ ...editForm, roundRobinRounds: v })}
                  min={1}
                  max={5}
                  label="Number of Rounds"
                  hint="How many times each player plays each opponent"
                />
              )}

              {/* FORMAT SPECIFIC - Swiss */}
              {league?.format === 'swiss' && (
                <RoundsSlider
                  value={editForm.swissRounds}
                  onChange={(v) => setEditForm({ ...editForm, swissRounds: v })}
                  min={1}
                  max={10}
                  label="Swiss Rounds"
                  hint="Total rounds to play"
                />
              )}

              {/* SCORING POINTS */}
              <StandingsPointsCard
                values={{
                  win: editForm.pointsForWin,
                  draw: editForm.pointsForDraw,
                  loss: editForm.pointsForLoss,
                  forfeit: editForm.pointsForForfeit,
                  noShow: editForm.pointsForNoShow,
                }}
                onChange={(newValues: StandingsPointsConfig) => setEditForm({
                  ...editForm,
                  pointsForWin: newValues.win,
                  pointsForDraw: newValues.draw,
                  pointsForLoss: newValues.loss,
                  pointsForForfeit: newValues.forfeit,
                  pointsForNoShow: newValues.noShow,
                })}
              />

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
                        <input type="number" value={(editForm.entryFee / 100).toFixed(2)} onChange={(e) => setEditForm({ ...editForm, entryFee: Math.round(parseFloat(e.target.value) * 100) || 0 })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500" min="0" step="1" />
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
                      <select value={editForm.refundPolicy} onChange={(e) => setEditForm({ ...editForm, refundPolicy: e.target.value as 'full' | 'full_7days' | 'full_14days' | '75_percent' | 'partial' | '25_percent' | 'admin_fee_only' | 'none' })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500">
                        <option value="full">100% refund before league starts</option>
                        <option value="full_14days">100% refund up to 14 days before</option>
                        <option value="full_7days">100% refund up to 7 days before</option>
                        <option value="75_percent">75% refund before league starts</option>
                        <option value="partial">50% refund before league starts</option>
                        <option value="25_percent">25% refund before league starts</option>
                        <option value="admin_fee_only">Full refund minus $5 admin fee</option>
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
                            <input type="number" value={(editForm.earlyBirdFee / 100).toFixed(2)} onChange={(e) => setEditForm({ ...editForm, earlyBirdFee: Math.round(parseFloat(e.target.value) * 100) || 0 })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500" min="0" step="1" />
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
                            <input type="number" value={(editForm.lateFee / 100).toFixed(2)} onChange={(e) => setEditForm({ ...editForm, lateFee: Math.round(parseFloat(e.target.value) * 100) || 0 })} className="w-full bg-gray-900 border border-gray-700 text-white p-3 rounded-lg focus:outline-none focus:border-blue-500" min="0" step="1" />
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

      {/* V07.27: Registration Wizard Modal (for doubles/mixed leagues) */}
      {showRegistrationWizard && league && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-hidden shadow-2xl border border-gray-700">
            <LeagueRegistrationWizard
              league={league}
              onClose={() => setShowRegistrationWizard(false)}
              onComplete={async () => {
                setShowRegistrationWizard(false);
                // Refresh membership
                if (currentUser) {
                  const membership = await getLeagueMemberByUserId(leagueId, currentUser.uid);
                  setMyMembership(membership);
                }
              }}
              onlyJoinOpen={canJoinOpenTeam}
            />
          </div>
        </div>
      )}

      {/* V07.27: Partner Invite Confirmation Modal */}
      {confirmingInvite && league && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-2xl max-w-md w-full shadow-2xl border border-gray-700 overflow-hidden">
            {/* Header */}
            <div className="bg-lime-600/20 border-b border-lime-500/30 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-lime-600/30 flex items-center justify-center">
                  <span className="text-2xl">🤝</span>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">Join Team</h3>
                  <p className="text-lime-400 text-sm">
                    Partner with {confirmingInvite.inviterName}
                  </p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* League Info */}
              <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                <h4 className="text-white font-semibold mb-2">{league.name}</h4>
                {league.description && (
                  <p className="text-gray-400 text-sm mb-3">{league.description}</p>
                )}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Type:</span>
                    <span className="text-gray-300 capitalize">{league.type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Format:</span>
                    <span className="text-gray-300 capitalize">{league.format.replace('_', ' ')}</span>
                  </div>
                  {league.venue && (
                    <div className="flex justify-between col-span-2">
                      <span className="text-gray-500">Venue:</span>
                      <span className="text-gray-300">{league.venue}</span>
                    </div>
                  )}
                  {league.settings?.gameTime && (
                    <div className="flex justify-between col-span-2">
                      <span className="text-gray-500">Game Time:</span>
                      <span className="text-gray-300">{league.settings.gameTime}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* What you're agreeing to */}
              <div className="bg-amber-900/20 border border-amber-600/30 rounded-lg p-4">
                <h5 className="text-amber-400 font-semibold text-sm mb-2">By accepting this invitation, you agree to:</h5>
                <ul className="text-gray-300 text-sm space-y-1">
                  <li className="flex items-start gap-2">
                    <span className="text-amber-400 mt-0.5">•</span>
                    <span>Play your scheduled matches or communicate with your opponent in advance</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-400 mt-0.5">•</span>
                    <span>Report scores accurately and honestly</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-400 mt-0.5">•</span>
                    <span>Follow the league rules and format</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-400 mt-0.5">•</span>
                    <span>Play as a team with {confirmingInvite.inviterName} for the duration of this league</span>
                  </li>
                </ul>
              </div>

              {/* Acknowledgement checkbox */}
              <label className="flex items-start gap-3 cursor-pointer p-3 bg-gray-900/30 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors">
                <input
                  type="checkbox"
                  checked={inviteAcknowledged}
                  onChange={(e) => setInviteAcknowledged(e.target.checked)}
                  className="mt-1 w-5 h-5 rounded border-gray-600 bg-gray-700 text-lime-500 focus:ring-lime-500 focus:ring-offset-gray-800"
                />
                <span className="text-gray-300 text-sm">
                  I understand and agree to participate in this league as {confirmingInvite.inviterName}'s partner
                </span>
              </label>
            </div>

            {/* Footer */}
            <div className="bg-gray-900/50 border-t border-gray-700 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => {
                  setConfirmingInvite(null);
                  setInviteAcknowledged(false);
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!confirmingInvite) return;
                  const inviteId = confirmingInvite.id;
                  setConfirmingInvite(null);
                  setInviteAcknowledged(false);
                  await handleInviteResponse(inviteId, 'accepted');
                }}
                disabled={!inviteAcknowledged || respondingToInvite === confirmingInvite.id}
                className="px-6 py-2 bg-lime-600 hover:bg-lime-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-sm font-semibold transition-colors"
              >
                {respondingToInvite === confirmingInvite.id ? 'Joining...' : 'Accept & Join Team'}
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
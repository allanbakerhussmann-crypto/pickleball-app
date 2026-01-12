/**
 * LeagueScheduleManager Component V07.43
 *
 * Organizer tool to generate and manage league match schedules.
 * V07.39: Added box league weeks management with idempotent activation
 * V07.42: Added "Create Next Week" button for finalized weeks
 * V07.43: Added BoxDraftWeekPanel for editing draft week assignments
 *
 * FILE LOCATION: components/leagues/LeagueScheduleManager.tsx
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  generateLeagueSchedule,
  generateSwissRound,
  clearLeagueMatches,
} from '../../services/firebase/leagueMatchGeneration';
import {
  generateBoxLeagueSchedule,
  canGenerateSchedule,
  formatPackingForDisplay,
  activateWeek,
  deactivateWeek,
  refreshDraftWeekAssignments,
  getMatchesForWeek,
  startClosing,
  finalizeWeek,
} from '../../services/rotatingDoublesBox';
import type { BoxLeagueWeek } from '../../types/rotatingDoublesBox';
import { doc, updateDoc, getDoc, collection, query, orderBy, onSnapshot } from '@firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import type { League, LeagueMember, LeagueMatch, LeagueDivision, UserProfile } from '../../types';
import { BoxDraftWeekPanel } from './boxLeague';

// ============================================
// LOCAL TYPES
// ============================================

interface LeagueCourt { 
  id: string; 
  name: string; 
  order: number; 
  active: boolean; 
}

interface LeagueVenueSettings {
  venueName: string;
  venueAddress?: string;
  courts: LeagueCourt[];
  timeSlots: { id: string; dayOfWeek: string; startTime: string; endTime: string; }[];
  matchDurationMinutes: number;
  bufferMinutes: number;
  schedulingMode: 'venue_based' | 'self_scheduled';
  autoAssignCourts: boolean;
  balanceCourtUsage: boolean;
}

interface GenerationResult {
  success: boolean;
  matchesCreated: number;
  error?: string;
}

interface LeagueScheduleManagerProps {
  league: League;
  members: LeagueMember[];
  matches: LeagueMatch[];
  divisions: LeagueDivision[];
  onScheduleGenerated: () => void;
}

// Week info for display
interface WeekInfo {
  weekNumber: number;
  roundNumber: number;
  weekDate: number | null;
  scheduledMatchCount: number;
  completedMatchCount: number;
}

// ============================================
// COMPONENT
// ============================================

export const LeagueScheduleManager: React.FC<LeagueScheduleManagerProps> = ({
  league,
  members,
  matches,
  divisions,
  onScheduleGenerated,
}) => {
  // Auth context
  const { currentUser } = useAuth();
  const currentUserId = currentUser?.uid || '';

  // State
  const [generating, setGenerating] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedDivisionId, setSelectedDivisionId] = useState<string | null>(null);
  const [swissRound, setSwissRound] = useState(1);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [activeTab, setActiveTab] = useState<'generate' | 'courts' | 'weeks' | 'timeline'>('generate');

  // Court assignment state
  const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set());
  const [bulkCourt, setBulkCourt] = useState<string>('');

  // V07.39: Box league weeks state
  const [boxWeeks, setBoxWeeks] = useState<BoxLeagueWeek[]>([]);
  const [loadingWeekAction, setLoadingWeekAction] = useState<number | null>(null);

  // V07.43: Draft week panel state
  const [expandedDraftWeek, setExpandedDraftWeek] = useState<number | null>(null);
  const [userRatings, setUserRatings] = useState<Map<string, number | undefined>>(new Map());

  // Get venue settings from league
  const venueSettings = (league.settings as any)?.venueSettings as LeagueVenueSettings | null;
  const hasVenue = !!venueSettings && venueSettings.courts && venueSettings.courts.length > 0;
  const courts = venueSettings?.courts || [];

  // ============================================
  // COMPUTED VALUES
  // ============================================

  const activeMembers = useMemo(() => 
    members.filter(m => m.status === 'active'),
    [members]
  );

  const divisionMembers = useMemo(() => 
    selectedDivisionId 
      ? activeMembers.filter(m => m.divisionId === selectedDivisionId)
      : activeMembers,
    [activeMembers, selectedDivisionId]
  );

  const divisionMatches = useMemo(() =>
    selectedDivisionId
      ? matches.filter(m => m.divisionId === selectedDivisionId)
      : matches,
    [matches, selectedDivisionId]
  );

  const matchStats = useMemo(() => {
    const scheduled = divisionMatches.filter(m => m.status === 'scheduled').length;
    const completed = divisionMatches.filter(m => m.status === 'completed').length;
    const pending = divisionMatches.filter(m => m.status === 'pending_confirmation').length;
    const withCourt = divisionMatches.filter(m => m.court).length;
    const total = divisionMatches.length;

    return { scheduled, completed, pending, withCourt, total };
  }, [divisionMatches]);

  const currentSwissRound = useMemo(() => {
    if (league.format !== 'swiss') return 1;
    const maxRound = Math.max(0, ...divisionMatches.map(m => m.roundNumber || 0));
    return maxRound + 1;
  }, [league.format, divisionMatches]);

  // Court usage stats
  const courtUsage = useMemo(() => {
    const usage: Record<string, number> = {};
    courts.forEach(c => { usage[c.name] = 0; });
    divisionMatches.forEach(m => {
      if (m.court && usage[m.court] !== undefined) {
        usage[m.court]++;
      }
    });
    return usage;
  }, [courts, divisionMatches]);

  // Matches without courts
  const unassignedMatches = useMemo(() => 
    divisionMatches.filter(m => !m.court && m.status === 'scheduled'),
    [divisionMatches]
  );

  // Matches grouped by round
  const matchesByRound = useMemo(() => {
    const grouped: Record<number, LeagueMatch[]> = {};
    divisionMatches.forEach(m => {
      const round = m.roundNumber || 1;
      if (!grouped[round]) grouped[round] = [];
      grouped[round].push(m);
    });
    return grouped;
  }, [divisionMatches]);

  // V05.37: Matches grouped by week with stats
  const matchesByWeek = useMemo(() => {
    const grouped: Record<number, LeagueMatch[]> = {};
    divisionMatches.forEach(m => {
      const week = m.weekNumber || 1;
      if (!grouped[week]) grouped[week] = [];
      grouped[week].push(m);
    });
    return grouped;
  }, [divisionMatches]);

  // Week info for display
  const weekInfoList = useMemo((): WeekInfo[] => {
    const weeks: WeekInfo[] = [];

    Object.entries(matchesByWeek).forEach(([weekStr, weekMatches]) => {
      const weekNumber = parseInt(weekStr);
      const scheduledCount = weekMatches.filter(m => m.status === 'scheduled').length;
      const completedCount = weekMatches.filter(m => m.status === 'completed').length;

      // Get the earliest scheduled date for this week
      const dates = weekMatches
        .map(m => m.scheduledDate)
        .filter((d): d is number => d !== null && d !== undefined);
      const weekDate = dates.length > 0 ? Math.min(...dates) : null;

      // Get round number (should be same for all matches in week)
      const roundNumber = weekMatches[0]?.roundNumber || 1;

      weeks.push({
        weekNumber,
        roundNumber,
        weekDate,
        scheduledMatchCount: scheduledCount,
        completedMatchCount: completedCount,
      });
    });

    return weeks.sort((a, b) => a.weekNumber - b.weekNumber);
  }, [matchesByWeek]);

  // Format info (V07.25: use competitionFormat for accurate detection of rotating doubles box)
  const formatInfo = useMemo(() => {
    // Check competitionFormat first for new unified format detection
    if (league.competitionFormat === 'rotating_doubles_box' || league.competitionFormat === 'fixed_doubles_box') {
      const rdBoxSize = (league.settings as any)?.rotatingDoublesBox?.settings?.boxSize || 5;
      return {
        description: `Boxes of ${rdBoxSize}, rotating partners, promotion/relegation`,
        expectedMatches: null,
        isRotatingBox: true,
      };
    }

    // Fall back to legacy format
    switch (league.format) {
      case 'round_robin':
        const rounds = (league.settings as any)?.roundRobinSettings?.rounds || 1;
        const n = divisionMembers.length;
        const matchesPerRound = n % 2 === 0 ? (n / 2) * (n - 1) : ((n - 1) / 2) * n;
        return {
          description: `Everyone plays everyone ${rounds === 1 ? 'once' : `${rounds} times`}`,
          expectedMatches: matchesPerRound * rounds,
        };
      case 'swiss':
        const swissRounds = (league.settings as any)?.swissSettings?.rounds || 4;
        return {
          description: `${swissRounds} rounds, paired by standings`,
          expectedMatches: Math.floor(divisionMembers.length / 2) * swissRounds,
        };
      case 'box_league':
        const boxSize = (league.settings as any)?.boxSettings?.playersPerBox || 4;
        return {
          description: `Boxes of ${boxSize}, promotion/relegation`,
          expectedMatches: null,
        };
      case 'ladder':
        return {
          description: 'Challenge-based ranking',
          expectedMatches: null,
        };
      default:
        return { description: 'Unknown format', expectedMatches: null };
    }
  }, [league.format, league.competitionFormat, league.settings, divisionMembers.length]);

  // V07.39: Check if rotating doubles box format
  const isRotatingBox = league.competitionFormat === 'rotating_doubles_box' || league.competitionFormat === 'fixed_doubles_box';

  // ============================================
  // V07.39: BOX WEEKS SUBSCRIPTION + RECOVERY
  // ============================================

  useEffect(() => {
    if (!isRotatingBox) {
      setBoxWeeks([]);
      return;
    }

    // Subscribe to boxWeeks collection with onSnapshot for real-time updates
    const weeksRef = collection(db, 'leagues', league.id, 'boxWeeks');
    const q = query(weeksRef, orderBy('weekNumber', 'asc'));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const weeks = snapshot.docs.map(doc => doc.data() as BoxLeagueWeek);

      // Recovery guard: If week is 'active' but matchIds missing, rebuild from query
      for (const week of weeks) {
        if (week.state === 'active' && (!week.matchIds || week.matchIds.length === 0)) {
          console.warn(`[Recovery] Week ${week.weekNumber} active but missing matchIds, attempting rebuild...`);
          try {
            const weekMatches = await getMatchesForWeek(league.id, week.weekNumber);
            const matchIds = weekMatches.map(m => m.id);

            if (matchIds.length > 0 && currentUserId) {
              // Only patch if user is organizer (silent fail if not)
              try {
                const weekRef = doc(db, 'leagues', league.id, 'boxWeeks', week.weekNumber.toString());
                await updateDoc(weekRef, {
                  matchIds,
                  totalMatches: matchIds.length,
                });
                week.matchIds = matchIds;
                week.totalMatches = matchIds.length;
                console.log(`[Recovery] Week ${week.weekNumber} matchIds patched: ${matchIds.length} matches`);
              } catch (patchErr) {
                // Ignore patch failure - don't block UI
                console.log(`[Recovery] Could not patch week ${week.weekNumber} (likely not organizer)`);
              }
            }
          } catch (err) {
            console.error(`[Recovery] Failed to query matches for week ${week.weekNumber}:`, err);
          }
        }
      }

      setBoxWeeks(weeks);
    }, (err) => {
      console.error('[BoxWeeks] Subscription error:', err);
    });

    return () => unsubscribe();
  }, [league.id, isRotatingBox, currentUserId]);

  // V07.43: Fetch DUPR ratings for all members (for draft panel)
  useEffect(() => {
    if (!isRotatingBox) return;

    const fetchRatings = async () => {
      const ratings = new Map<string, number | undefined>();

      for (const member of members) {
        try {
          const userDoc = await getDoc(doc(db, 'users', member.userId));
          if (userDoc.exists()) {
            const user = userDoc.data() as UserProfile;
            if (user.duprId) {
              const rating = user.duprDoublesRating ?? user.duprSinglesRating ?? undefined;
              ratings.set(member.userId, rating);
            }
          }
        } catch (err) {
          // Ignore individual fetch errors
        }
      }

      setUserRatings(ratings);
    };

    if (members.length > 0) {
      fetchRatings();
    }
  }, [members, isRotatingBox]);

  // ============================================
  // V07.39: BOX WEEK HANDLERS
  // ============================================

  const handleActivateWeek = useCallback(async (weekNumber: number) => {
    if (!currentUserId) {
      alert('You must be logged in to activate a week');
      return;
    }

    setLoadingWeekAction(weekNumber);
    setError(null);
    try {
      const result = await activateWeek(league.id, weekNumber, currentUserId);
      setResult({
        success: true,
        matchesCreated: result.matchIds.length,
      });
      // Refresh matches list
      onScheduleGenerated();
    } catch (err) {
      console.error('[handleActivateWeek] Error:', err);
      setError(`Failed to activate week: ${(err as Error).message}`);
    } finally {
      setLoadingWeekAction(null);
    }
  }, [league.id, currentUserId, onScheduleGenerated]);

  // V07.40: Deactivate week handler (for testing/fixing)
  const handleDeactivateWeek = useCallback(async (weekNumber: number) => {
    if (!confirm(`Are you sure you want to deactivate Week ${weekNumber}? This will DELETE all matches for this week.`)) {
      return;
    }

    setLoadingWeekAction(weekNumber);
    setError(null);
    try {
      const deactivateResult = await deactivateWeek(league.id, weekNumber);
      console.log(`[handleDeactivateWeek] Week ${weekNumber} deactivated. Deleted ${deactivateResult.deletedMatchCount} matches.`);
      setResult({
        success: true,
        matchesCreated: 0, // Reset - matches were deleted
      });
      onScheduleGenerated();
    } catch (err) {
      console.error('[handleDeactivateWeek] Error:', err);
      setError(`Failed to deactivate week: ${(err as Error).message}`);
    } finally {
      setLoadingWeekAction(null);
    }
  }, [league.id, onScheduleGenerated]);

  const handleRecalculateBoxes = useCallback(async (weekNumber: number) => {
    // Guardrails
    const week = boxWeeks.find(w => w.weekNumber === weekNumber);
    const prevWeek = boxWeeks.find(w => w.weekNumber === weekNumber - 1);

    if (!week || week.state !== 'draft') {
      alert('Can only recalculate boxes for draft weeks');
      return;
    }
    if (!prevWeek || prevWeek.state !== 'finalized') {
      alert('Previous week must be finalized first');
      return;
    }

    setLoadingWeekAction(weekNumber);
    setError(null);
    try {
      const result = await refreshDraftWeekAssignments(league.id, weekNumber);
      const movedCount = result.movements.filter(m => m.reason !== 'stayed').length;
      setResult({
        success: true,
        matchesCreated: 0,
        error: `Boxes recalculated from Week ${weekNumber - 1} results. ${movedCount} player(s) moved.`,
      });
    } catch (err) {
      console.error('[handleRecalculateBoxes] Error:', err);
      setError(`Failed to recalculate boxes: ${(err as Error).message}`);
    } finally {
      setLoadingWeekAction(null);
    }
  }, [league.id, boxWeeks]);

  // V07.40: Lock Week (active → closing)
  const handleLockWeek = useCallback(async (weekNumber: number) => {
    if (!currentUser?.uid) return;

    setLoadingWeekAction(weekNumber);
    setError(null);
    try {
      const lockResult = await startClosing(league.id, weekNumber);
      console.log(`[handleLockWeek] Week ${weekNumber} locked. Pending: ${lockResult.pendingCount}, Disputed: ${lockResult.disputedCount}`);

      if (lockResult.pendingCount > 0 || lockResult.disputedCount > 0) {
        setResult({
          success: true,
          matchesCreated: 0,
          error: `Week ${weekNumber} locked. ${lockResult.pendingCount} pending, ${lockResult.disputedCount} disputed matches need resolution.`,
        });
      } else {
        setResult({
          success: true,
          matchesCreated: 0,
          error: `Week ${weekNumber} locked. Ready to finalize.`,
        });
      }
      onScheduleGenerated();
    } catch (err) {
      console.error('[handleLockWeek] Error:', err);
      setError(`Failed to lock week: ${(err as Error).message}`);
    } finally {
      setLoadingWeekAction(null);
    }
  }, [league.id, currentUser?.uid, onScheduleGenerated]);

  // V07.40: Finalize Week (closing → finalized)
  const handleFinalizeWeek = useCallback(async (weekNumber: number) => {
    if (!currentUser?.uid) return;

    setLoadingWeekAction(weekNumber);
    setError(null);
    try {
      const finalizeResult = await finalizeWeek(league.id, weekNumber, currentUser.uid);
      console.log(`[handleFinalizeWeek] Week ${weekNumber} finalized.`, finalizeResult);

      const movementCount = finalizeResult.movements?.filter(m => m.reason !== 'stayed').length || 0;
      setResult({
        success: true,
        matchesCreated: 0,
        error: finalizeResult.nextWeekCreated
          ? `Week ${weekNumber} finalized! ${movementCount} player(s) moved. Week ${weekNumber + 1} draft created.`
          : `Week ${weekNumber} finalized! ${movementCount} player(s) moved.`,
      });
      onScheduleGenerated();
    } catch (err) {
      console.error('[handleFinalizeWeek] Error:', err);
      setError(`Failed to finalize week: ${(err as Error).message}`);
    } finally {
      setLoadingWeekAction(null);
    }
  }, [league.id, currentUser?.uid, onScheduleGenerated]);

  // V07.42: Create Next Week from finalized week (if it wasn't auto-created)
  const handleCreateNextWeek = useCallback(async (weekNumber: number) => {
    if (!currentUser?.uid) return;

    setLoadingWeekAction(weekNumber);
    setError(null);
    try {
      // Import services
      const { createWeekDraft, getWeek, getSeason } = await import('../../services/rotatingDoublesBox');
      const { applyMovements, generateNextWeekAssignments } = await import('../../services/rotatingDoublesBox/boxLeaguePromotion');

      // Get the finalized week
      const finalizedWeek = await getWeek(league.id, weekNumber);
      if (!finalizedWeek || finalizedWeek.state !== 'finalized') {
        throw new Error(`Week ${weekNumber} is not finalized`);
      }

      if (!finalizedWeek.standingsSnapshot?.boxes) {
        throw new Error(`Week ${weekNumber} has no standings snapshot`);
      }

      // Get season info
      const season = await getSeason(league.id, finalizedWeek.seasonId);
      if (!season) {
        throw new Error('Season not found');
      }

      // Calculate movements from finalized standings
      const movements = applyMovements(finalizedWeek, finalizedWeek.standingsSnapshot.boxes);

      // Generate next week assignments
      const nextWeekAssignments = generateNextWeekAssignments(finalizedWeek.boxAssignments, movements);

      // Determine scheduled date
      const nextWeekNumber = weekNumber + 1;
      const nextWeekSchedule = season.weekSchedule.find(w => w.weekNumber === nextWeekNumber);
      const scheduledDate = nextWeekSchedule?.scheduledDate || Date.now() + 7 * 24 * 60 * 60 * 1000;

      // Create the next week draft
      await createWeekDraft({
        leagueId: league.id,
        seasonId: finalizedWeek.seasonId,
        weekNumber: nextWeekNumber,
        scheduledDate,
        boxAssignments: nextWeekAssignments,
        sessions: finalizedWeek.sessions,
        courtAssignments: finalizedWeek.courtAssignments,
        settings: season.rulesSnapshot,
      });

      const movementCount = movements.filter(m => m.reason !== 'stayed').length;
      setResult({
        success: true,
        matchesCreated: 0,
        error: `Week ${nextWeekNumber} draft created with ${movementCount} player movement(s)!`,
      });
      onScheduleGenerated();
    } catch (err) {
      console.error('[handleCreateNextWeek] Error:', err);
      setError(`Failed to create next week: ${(err as Error).message}`);
    } finally {
      setLoadingWeekAction(null);
    }
  }, [league.id, currentUser?.uid, onScheduleGenerated]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleGenerate = async () => {
    if (league.format === 'ladder') {
      setError('Ladder leagues use on-demand challenges. Matches are created when players challenge each other.');
      return;
    }

    // Check for rotating doubles box format (V07.25: use competitionFormat for accurate detection)
    const isRotatingBox = league.competitionFormat === 'rotating_doubles_box' || league.competitionFormat === 'fixed_doubles_box';

    if (!isRotatingBox && divisionMembers.length < 2) {
      setError('Need at least 2 active members to generate a schedule');
      return;
    }

    // V07.15: Block generation if matches already exist (prevent duplicates)
    // For Swiss, allow generating new rounds. For other formats, BLOCK if matches exist.
    if (league.format !== 'swiss' && !isRotatingBox && matchStats.total > 0) {
      setError(`Schedule already exists (${matchStats.total} matches). Use "Clear" to delete existing matches before regenerating.`);
      return;
    }

    setGenerating(true);
    setError(null);
    setResult(null);

    try {
      let genResult: GenerationResult;

      if (isRotatingBox) {
        // Handle rotating doubles box format
        const validation = await canGenerateSchedule(league.id);

        if (!validation.canGenerate) {
          setError(validation.blockers.join('. '));
          setGenerating(false);
          return;
        }

        // Get week dates from league schedule config
        const scheduleConfig = (league.settings as any)?.venueSettings?.scheduleConfig;
        const weekDates: Date[] = [];
        const numberOfWeeks = scheduleConfig?.numberOfWeeks || 10;
        const startDate = new Date(league.seasonStart || Date.now());

        // Generate week dates (one per week)
        if (scheduleConfig?.matchNights && scheduleConfig.matchNights.length > 0) {
          // Use configured match nights
          scheduleConfig.matchNights.forEach((dateStr: string) => {
            weekDates.push(new Date(dateStr));
          });
        } else {
          // Generate weekly dates
          for (let i = 0; i < numberOfWeeks; i++) {
            const weekDate = new Date(startDate);
            weekDate.setDate(weekDate.getDate() + (i * 7));
            weekDates.push(weekDate);
          }
        }

        const boxResult = await generateBoxLeagueSchedule({
          leagueId: league.id,
          seasonName: `Season ${new Date().getFullYear()}`,
          startDate,
          numberOfWeeks,
          weekDates,
        });

        if (boxResult.success) {
          // V07.25: Show both box count and matches created
          const boxInfo = boxResult.packingResult
            ? `Created ${boxResult.boxAssignments?.length} boxes: ${formatPackingForDisplay(boxResult.packingResult)}`
            : '';
          const matchInfo = boxResult.matchesCreated
            ? `${boxResult.matchesCreated} matches generated for Week 1`
            : '';

          genResult = {
            success: true,
            matchesCreated: boxResult.matchesCreated || 0,
            error: [boxInfo, matchInfo].filter(Boolean).join('. ') || undefined,
          };
        } else {
          genResult = {
            success: false,
            matchesCreated: 0,
            error: boxResult.error || 'Failed to generate box league schedule',
          };

          // Add suggestions if available
          if (boxResult.suggestions && boxResult.suggestions.length > 0) {
            genResult.error += '\n\nSuggestions:\n• ' + boxResult.suggestions.join('\n• ');
          }
        }
      } else if (league.format === 'swiss') {
        genResult = await generateSwissRound(
          league,
          divisionMembers,
          swissRound,
          divisionMatches,
          selectedDivisionId
        );

        if (genResult.success) {
          setSwissRound(swissRound + 1);
        }
      } else {
        genResult = await generateLeagueSchedule(league, activeMembers, {
          divisionId: selectedDivisionId,
        });
      }

      setResult(genResult);

      if (genResult.success) {
        onScheduleGenerated();

        // Switch to courts tab if venue-based and auto-assign enabled
        if (hasVenue && venueSettings?.autoAssignCourts) {
          setTimeout(() => {
            handleAutoAssignCourts();
          }, 500);
        }
      } else {
        setError(genResult.error || 'Generation failed');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate schedule');
    } finally {
      setGenerating(false);
    }
  };

  const handleClearMatches = async () => {
    setClearing(true);
    setError(null);

    try {
      const deleted = await clearLeagueMatches(league.id, {
        divisionId: selectedDivisionId,
        statusFilter: ['scheduled'],
      });

      setResult({
        success: true,
        matchesCreated: 0,
        error: `Cleared ${deleted} scheduled matches`,
      });
      
      setShowConfirmClear(false);
      onScheduleGenerated();
    } catch (err: any) {
      setError(err.message || 'Failed to clear matches');
    } finally {
      setClearing(false);
    }
  };

  // Auto-assign courts
  const handleAutoAssignCourts = async () => {
    if (!hasVenue || unassignedMatches.length === 0) return;

    setAssigning(true);
    setError(null);

    try {
      const activeCourts = courts.filter(c => c.active);
      if (activeCourts.length === 0) {
        setError('No active courts available');
        return;
      }

      // Track court usage for balancing
      const courtAssignments: Record<string, number> = {};
      activeCourts.forEach(c => { courtAssignments[c.name] = courtUsage[c.name] || 0; });

      // Sort matches by round number
      const sortedMatches = [...unassignedMatches].sort((a, b) => {
        return (a.roundNumber || 0) - (b.roundNumber || 0);
      });

      // Assign courts with balancing
      const updates: Promise<void>[] = [];
      
      for (const match of sortedMatches) {
        // Find the court with least assignments (for balance)
        let bestCourt = activeCourts[0].name;
        let minAssignments = courtAssignments[bestCourt];
        
        if (venueSettings?.balanceCourtUsage) {
          for (const court of activeCourts) {
            if (courtAssignments[court.name] < minAssignments) {
              minAssignments = courtAssignments[court.name];
              bestCourt = court.name;
            }
          }
        } else {
          // Round-robin through courts
          const totalAssigned = Object.values(courtAssignments).reduce((a, b) => a + b, 0);
          const courtIndex = totalAssigned % activeCourts.length;
          bestCourt = activeCourts[courtIndex].name;
        }

        // Update assignment count
        courtAssignments[bestCourt]++;

        // Queue the update
        const matchRef = doc(db, 'leagues', league.id, 'matches', match.id);
        updates.push(updateDoc(matchRef, { 
          court: bestCourt,
          venue: venueSettings?.venueName || null,
        }));
      }

      await Promise.all(updates);
      
      setResult({
        success: true,
        matchesCreated: 0,
        error: `Assigned ${sortedMatches.length} matches to courts`,
      });
      
      onScheduleGenerated();
    } catch (err: any) {
      setError(err.message || 'Failed to auto-assign courts');
    } finally {
      setAssigning(false);
    }
  };

  // Clear all court assignments
  const handleClearCourtAssignments = async () => {
    const matchesWithCourts = divisionMatches.filter(m => m.court && m.status === 'scheduled');
    if (matchesWithCourts.length === 0) return;

    setAssigning(true);
    setError(null);

    try {
      const updates = matchesWithCourts.map(match => {
        const matchRef = doc(db, 'leagues', league.id, 'matches', match.id);
        return updateDoc(matchRef, { court: null, venue: null });
      });

      await Promise.all(updates);
      onScheduleGenerated();
    } catch (err: any) {
      setError(err.message || 'Failed to clear court assignments');
    } finally {
      setAssigning(false);
    }
  };

  // Bulk assign courts
  const handleBulkAssign = async () => {
    if (!bulkCourt || selectedMatches.size === 0) return;

    setAssigning(true);
    setError(null);

    try {
      const updates = Array.from(selectedMatches).map(matchId => {
        const matchRef = doc(db, 'leagues', league.id, 'matches', matchId);
        return updateDoc(matchRef, { 
          court: bulkCourt,
          venue: venueSettings?.venueName || null,
        });
      });

      await Promise.all(updates);
      setSelectedMatches(new Set());
      setBulkCourt('');
      onScheduleGenerated();
    } catch (err: any) {
      setError(err.message || 'Failed to assign courts');
    } finally {
      setAssigning(false);
    }
  };

  // Toggle match selection
  const toggleMatchSelection = (matchId: string) => {
    const newSet = new Set(selectedMatches);
    if (newSet.has(matchId)) {
      newSet.delete(matchId);
    } else {
      newSet.add(matchId);
    }
    setSelectedMatches(newSet);
  };

  // Select all unassigned
  const selectAllUnassigned = () => {
    setSelectedMatches(new Set(unassignedMatches.map(m => m.id)));
  };

  // Helper: Format date
  const formatDate = (timestamp: number | null) => {
    if (!timestamp) return 'TBD';
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  };

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-700 bg-gray-900">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          📅 Schedule Manager
        </h3>
        <p className="text-sm text-gray-400 mt-1">
          Generate and manage match schedules
        </p>
      </div>

      {/* Tabs - V07.41: Updated styling to match main tabs */}
      <div className="flex gap-1 border-b border-gray-700 overflow-x-auto">
        <button
          onClick={() => setActiveTab('generate')}
          className={`pb-3 px-4 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'generate'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          🎲 Generate
        </button>
        <button
          onClick={() => setActiveTab('weeks')}
          className={`pb-3 px-4 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'weeks'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          📆 Weeks
        </button>
        {hasVenue && (
          <button
            onClick={() => setActiveTab('courts')}
            className={`pb-3 px-4 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'courts'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            🏟️ Courts
          </button>
        )}
        {hasVenue && (
          <button
            onClick={() => setActiveTab('timeline')}
            className={`pb-3 px-4 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'timeline'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            📊 Timeline
          </button>
        )}
      </div>

      {/* Division Selector */}
      {divisions.length > 0 && (
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center gap-2 overflow-x-auto">
            <button
              onClick={() => setSelectedDivisionId(null)}
              className={`px-3 py-1.5 rounded text-sm font-medium whitespace-nowrap ${
                !selectedDivisionId ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
              }`}
            >
              All
            </button>
            {divisions.map(div => (
              <button
                key={div.id}
                onClick={() => setSelectedDivisionId(div.id)}
                className={`px-3 py-1.5 rounded text-sm font-medium whitespace-nowrap ${
                  selectedDivisionId === div.id ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
                }`}
              >
                {div.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error/Result Display */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-900/30 border border-red-600 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}
      {result && (
        <div className={`mx-4 mt-4 p-3 rounded-lg text-sm ${
          result.success 
            ? 'bg-green-900/30 border border-green-600 text-green-400'
            : 'bg-red-900/30 border border-red-600 text-red-400'
        }`}>
          {result.success 
            ? result.matchesCreated > 0 
              ? `✅ Generated ${result.matchesCreated} matches!`
              : result.error
            : `❌ ${result.error}`
          }
        </div>
      )}

      {/* GENERATE TAB */}
      {activeTab === 'generate' && (
        <div className="p-4 space-y-4">
          {/* Format Info */}
          <div className="bg-gray-900/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium text-white">{league.format.replace('_', ' ').toUpperCase()}</span>
              <span className="text-sm text-gray-400">{divisionMembers.length} members</span>
            </div>
            <p className="text-sm text-gray-400">{formatInfo.description}</p>
            {formatInfo.expectedMatches && (
              <p className="text-xs text-gray-500 mt-1">
                Expected: ~{formatInfo.expectedMatches} matches
              </p>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-gray-900 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-white">{matchStats.total}</div>
              <div className="text-xs text-gray-500">Total</div>
            </div>
            <div className="bg-gray-900 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-blue-400">{matchStats.scheduled}</div>
              <div className="text-xs text-gray-500">Scheduled</div>
            </div>
            <div className="bg-gray-900 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-green-400">{matchStats.completed}</div>
              <div className="text-xs text-gray-500">Completed</div>
            </div>
          </div>

          {/* Swiss Round Selector */}
          {league.format === 'swiss' && (
            <div className="bg-gray-900/50 rounded-lg p-4">
              <label className="block text-sm text-gray-400 mb-2">Generate Round:</label>
              <div className="flex items-center gap-3">
                <select
                  value={swissRound}
                  onChange={(e) => setSwissRound(parseInt(e.target.value))}
                  className="bg-gray-900 border border-gray-700 text-white p-2 rounded"
                >
                  {Array.from({ length: 10 }, (_, i) => i + 1).map(r => (
                    <option key={r} value={r}>Round {r}</option>
                  ))}
                </select>
                <span className="text-sm text-gray-500">
                  Current: Round {currentSwissRound - 1 || 'None'}
                </span>
              </div>
            </div>
          )}

          {/* V07.15: Warning when matches already exist */}
          {matchStats.total > 0 && league.format !== 'swiss' && (
            <div className="bg-yellow-900/20 border border-yellow-600 rounded-lg p-3 text-yellow-400 text-sm">
              ⚠️ {matchStats.total} matches already generated. Use "Clear" first if you want to regenerate.
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleGenerate}
              disabled={generating || divisionMembers.length < 2}
              className={`flex-1 py-3 ${
                matchStats.total > 0 && league.format !== 'swiss'
                  ? 'bg-gray-600 hover:bg-gray-500' // Dimmed when matches exist
                  : 'bg-blue-600 hover:bg-blue-500'
              } disabled:bg-gray-600 text-white rounded-lg font-semibold transition-colors`}
            >
              {generating ? '⏳ Generating...' : league.format === 'swiss' ? `🎲 Generate Round ${swissRound}` : '🎲 Generate Schedule'}
            </button>

            {matchStats.total > 0 && (
              <button
                onClick={() => setShowConfirmClear(true)}
                className="px-4 py-3 bg-red-600/20 border border-red-600 text-red-400 hover:bg-red-600/30 rounded-lg font-semibold transition-colors"
              >
                🗑️ Clear
              </button>
            )}
          </div>

          {/* Ladder Note */}
          {league.format === 'ladder' && (
            <div className="bg-yellow-900/20 border border-yellow-600 rounded-lg p-4">
              <p className="text-yellow-400 text-sm">
                ⚠️ Ladder leagues use on-demand challenges. Players challenge each other to create matches.
              </p>
            </div>
          )}
        </div>
      )}

{/* ================================================
    END OF PART 1 - PASTE PART 2 DIRECTLY BELOW THIS
    ================================================ */}


      {/* WEEKS TAB */}
      {activeTab === 'weeks' && (
        <div className="p-4 space-y-4">
          {/* V07.39: Box League Weeks - authoritative from boxWeeks collection */}
          {isRotatingBox ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-white">Box League Weeks</h4>
                <span className="text-sm text-gray-400">
                  {boxWeeks.length} week{boxWeeks.length !== 1 ? 's' : ''}
                </span>
              </div>

              {boxWeeks.length === 0 ? (
                <div className="bg-gray-900/50 rounded-lg p-8 text-center text-gray-400">
                  No weeks created yet. Generate a schedule first.
                </div>
              ) : (
                <div className="space-y-3">
                  {boxWeeks.map(week => {
                    const prevWeek = boxWeeks.find(w => w.weekNumber === week.weekNumber - 1);
                    const canRecalculate = week.state === 'draft' &&
                                          week.weekNumber > 1 &&
                                          prevWeek?.state === 'finalized';

                    // Compute match counts from actual matches (more reliable than cached week.completedMatches)
                    const weekMatches = matches.filter(m => m.weekNumber === week.weekNumber);
                    // Check both status === 'completed' and scoreState === 'official' for DUPR compliance
                    const completedMatches = weekMatches.filter(m =>
                      m.status === 'completed' || m.scoreState === 'official' || m.scoreState === 'submittedToDupr'
                    ).length;
                    const totalMatches = week.totalMatches ?? weekMatches.length;

                    return (
                      <div key={week.weekNumber} className="bg-gray-800 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {/* Week Number Badge */}
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                              week.state === 'draft' ? 'bg-yellow-500/20 text-yellow-400' :
                              week.state === 'active' ? 'bg-blue-600/20 text-blue-400' :
                              week.state === 'closing' ? 'bg-orange-500/20 text-orange-400' :
                              'bg-green-600/20 text-green-400'
                            }`}>
                              {week.weekNumber}
                            </div>
                            <div>
                              <div className="font-medium text-white">Week {week.weekNumber}</div>
                              <div className="text-sm text-gray-400">
                                {week.state === 'draft' && 'Draft - Not yet scheduled'}
                                {week.state === 'active' && `Active - ${completedMatches}/${totalMatches} matches`}
                                {week.state === 'closing' && 'Closing - Ready to finalize'}
                                {week.state === 'finalized' && `Finalized - ${completedMatches} matches completed`}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Status Badge */}
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              week.state === 'draft' ? 'bg-yellow-500/20 text-yellow-400' :
                              week.state === 'active' ? 'bg-blue-500/20 text-blue-400' :
                              week.state === 'closing' ? 'bg-orange-500/20 text-orange-400' :
                              'bg-green-500/20 text-green-400'
                            }`}>
                              {week.state.charAt(0).toUpperCase() + week.state.slice(1)}
                            </span>

                            {/* Action Buttons - Draft State Only */}
                            {week.state === 'draft' && (
                              <>
                                {/* Recalculate Boxes - only when previous week finalized */}
                                {canRecalculate && (
                                  <button
                                    onClick={() => handleRecalculateBoxes(week.weekNumber)}
                                    disabled={loadingWeekAction === week.weekNumber}
                                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
                                    title={`Recalculate box assignments based on Week ${week.weekNumber - 1} final standings`}
                                  >
                                    {loadingWeekAction === week.weekNumber ? '...' : 'Recalculate Boxes'}
                                  </button>
                                )}
                                {/* V07.43: Edit Assignments */}
                                <button
                                  onClick={() => setExpandedDraftWeek(expandedDraftWeek === week.weekNumber ? null : week.weekNumber)}
                                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                                    expandedDraftWeek === week.weekNumber
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-gray-600 hover:bg-gray-500 text-white'
                                  }`}
                                  title="Edit box assignments before activation"
                                >
                                  {expandedDraftWeek === week.weekNumber ? 'Close Editor' : 'Edit Assignments'}
                                </button>
                                {/* Activate Week */}
                                <button
                                  onClick={() => handleActivateWeek(week.weekNumber)}
                                  disabled={loadingWeekAction === week.weekNumber}
                                  className="px-3 py-1.5 bg-lime-600 hover:bg-lime-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
                                >
                                  {loadingWeekAction === week.weekNumber ? 'Activating...' : 'Activate Week'}
                                </button>
                              </>
                            )}

                            {/* Action Buttons - Active State */}
                            {week.state === 'active' && (
                              <>
                                {/* V07.41: Renamed to "Close Week" for consistency with Standings tab */}
                                {completedMatches === totalMatches && totalMatches > 0 && (
                                  <button
                                    onClick={() => handleLockWeek(week.weekNumber)}
                                    disabled={loadingWeekAction === week.weekNumber}
                                    className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
                                    title="Close week and prepare for finalization"
                                  >
                                    {loadingWeekAction === week.weekNumber ? 'Closing...' : 'Close Week'}
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDeactivateWeek(week.weekNumber)}
                                  disabled={loadingWeekAction === week.weekNumber}
                                  className="px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
                                  title="Reset to draft and delete all matches (for testing)"
                                >
                                  {loadingWeekAction === week.weekNumber ? 'Deactivating...' : 'Deactivate'}
                                </button>
                              </>
                            )}

                            {/* Action Buttons - Closing State */}
                            {week.state === 'closing' && (
                              <button
                                onClick={() => handleFinalizeWeek(week.weekNumber)}
                                disabled={loadingWeekAction === week.weekNumber}
                                className="px-3 py-1.5 bg-lime-600 hover:bg-lime-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
                                title="Finalize week, apply promotion/relegation, and create next week draft"
                              >
                                {loadingWeekAction === week.weekNumber ? 'Finalizing...' : 'Finalize Week'}
                              </button>
                            )}

                            {/* Action Buttons - Finalized State: Create Next Week if missing */}
                            {week.state === 'finalized' && !boxWeeks.some(w => w.weekNumber === week.weekNumber + 1) && (
                              <button
                                onClick={() => handleCreateNextWeek(week.weekNumber)}
                                disabled={loadingWeekAction === week.weekNumber}
                                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-sm font-medium transition-colors"
                                title="Create next week draft from this week's standings"
                              >
                                {loadingWeekAction === week.weekNumber ? 'Creating...' : 'Create Next Week'}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Box Assignments Preview for Draft Weeks */}
                        {week.state === 'draft' && week.boxAssignments && week.boxAssignments.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-700">
                            <div className="text-sm text-gray-400 mb-2">Box Assignments:</div>
                            <div className="flex flex-wrap gap-2">
                              {week.boxAssignments.map(box => (
                                <span key={box.boxNumber} className="px-2 py-1 bg-gray-700 rounded text-xs">
                                  Box {box.boxNumber}: {box.playerIds.length} players
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* V07.43: Draft Week Panel - shown when a draft week is expanded */}
              {expandedDraftWeek !== null && (
                (() => {
                  const selectedWeek = boxWeeks.find(w => w.weekNumber === expandedDraftWeek);
                  if (!selectedWeek || selectedWeek.state !== 'draft') return null;

                  return (
                    <div className="mt-4">
                      <BoxDraftWeekPanel
                        leagueId={league.id}
                        week={selectedWeek}
                        members={members}
                        userRatings={userRatings}
                        isOrganizer={true}
                        currentUserId={currentUserId}
                        onClose={() => setExpandedDraftWeek(null)}
                        onActivated={() => {
                          setExpandedDraftWeek(null);
                          onScheduleGenerated();
                        }}
                      />
                    </div>
                  );
                })()
              )}
            </>
          ) : (
            /* Non-box league weeks (original view) */
            <>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-white">Week Overview</h4>
                <span className="text-sm text-gray-400">
                  {weekInfoList.length} week{weekInfoList.length !== 1 ? 's' : ''}
                </span>
              </div>

              {weekInfoList.length === 0 ? (
                <div className="bg-gray-900/50 rounded-lg p-8 text-center text-gray-400">
                  No weeks scheduled yet. Generate a schedule first.
                </div>
              ) : (
                <div className="space-y-2">
                  {weekInfoList.map(weekInfo => {
                    const weekMatches = matchesByWeek[weekInfo.weekNumber] || [];
                    const allCompleted = weekInfo.completedMatchCount === weekMatches.length && weekMatches.length > 0;

                    return (
                      <div
                        key={weekInfo.weekNumber}
                        className={`bg-gray-900 rounded-lg p-4 border ${
                          allCompleted ? 'border-green-500/50' : 'border-gray-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                              allCompleted ? 'bg-green-600/20 text-green-400' : 'bg-blue-600/20 text-blue-400'
                            }`}>
                              {weekInfo.weekNumber}
                            </div>
                            <div>
                              <div className="font-medium text-white flex items-center gap-2">
                                Week {weekInfo.weekNumber}
                                {allCompleted && (
                                  <span className="text-xs bg-green-600/20 text-green-400 px-2 py-0.5 rounded">
                                    ✅ Complete
                                  </span>
                                )}
                              </div>
                              <div className="text-sm text-gray-400 flex items-center gap-3">
                                <span>Round {weekInfo.roundNumber}</span>
                                <span>•</span>
                                <span>{weekMatches.length} matches</span>
                                {weekInfo.weekDate && (
                                  <>
                                    <span>•</span>
                                    <span>{formatDate(weekInfo.weekDate)}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 text-xs">
                            {weekInfo.completedMatchCount > 0 && (
                              <span className="bg-green-600/20 text-green-400 px-2 py-1 rounded">
                                {weekInfo.completedMatchCount} done
                              </span>
                            )}
                            {weekInfo.scheduledMatchCount > 0 && (
                              <span className="bg-blue-600/20 text-blue-400 px-2 py-1 rounded">
                                {weekInfo.scheduledMatchCount} pending
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* COURTS TAB */}
      {activeTab === 'courts' && hasVenue && (
        <div className="p-4 space-y-4">
          {/* Court Usage Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {courts.filter(c => c.active).map(court => (
              <div key={court.id} className="bg-gray-900 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-white">{courtUsage[court.name] || 0}</div>
                <div className="text-xs text-gray-500 truncate">{court.name}</div>
              </div>
            ))}
          </div>

          {/* Auto-Assign Button */}
          {unassignedMatches.length > 0 && (
            <button
              onClick={handleAutoAssignCourts}
              disabled={assigning}
              className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 text-white rounded-lg font-semibold"
            >
              {assigning ? '⏳ Assigning...' : `⚡ Auto-Assign ${unassignedMatches.length} Matches`}
            </button>
          )}

          {/* Bulk Actions */}
          {selectedMatches.size > 0 && (
            <div className="flex items-center gap-2 p-3 bg-blue-900/20 border border-blue-600 rounded-lg">
              <span className="text-blue-400 text-sm">{selectedMatches.size} selected</span>
              <select
                value={bulkCourt}
                onChange={e => setBulkCourt(e.target.value)}
                className="flex-1 bg-gray-900 border border-gray-700 text-white p-2 rounded text-sm"
              >
                <option value="">Select court...</option>
                {courts.filter(c => c.active).map(c => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
              <button
                onClick={handleBulkAssign}
                disabled={!bulkCourt || assigning}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded text-sm font-medium"
              >
                Assign
              </button>
              <button
                onClick={() => setSelectedMatches(new Set())}
                className="px-3 py-2 text-gray-400 hover:text-white text-sm"
              >
                Clear
              </button>
            </div>
          )}

          {/* Match List by Round */}
          <div className="space-y-4">
            {Object.entries(matchesByRound)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([round, roundMatches]) => (
                <div key={round} className="bg-gray-900/50 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-gray-900 border-b border-gray-700 flex items-center justify-between">
                    <span className="font-medium text-white">
                      Round {round}
                    </span>
                    <span className="text-xs text-gray-500">
                      {roundMatches.filter(m => m.court).length}/{roundMatches.length} assigned
                    </span>
                  </div>
                  <div className="divide-y divide-gray-700">
                    {roundMatches.map(match => {
                      const isSelected = selectedMatches.has(match.id);
                      const isCompleted = match.status === 'completed';

                      return (
                        <div
                          key={match.id}
                          className={`p-3 flex items-center gap-3 ${
                            isCompleted ? 'opacity-50' : ''
                          }`}
                        >
                          {!isCompleted && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleMatchSelection(match.id)}
                              className="w-4 h-4 rounded bg-gray-700 border-gray-600"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-white truncate">
                              {match.memberAName} vs {match.memberBName}
                            </div>
                            <div className="text-xs text-gray-500">
                              Week {match.weekNumber}
                            </div>
                          </div>
                          {match.court ? (
                            <span className="text-xs bg-green-600/20 text-green-400 px-2 py-1 rounded">
                              {match.court}
                            </span>
                          ) : !isCompleted ? (
                            <select
                              value=""
                              onChange={(e) => {
                                if (e.target.value) {
                                  const matchRef = doc(db, 'leagues', league.id, 'matches', match.id);
                                  updateDoc(matchRef, {
                                    court: e.target.value,
                                    venue: venueSettings?.venueName || null,
                                  }).then(() => onScheduleGenerated());
                                }
                              }}
                              className="bg-gray-900 border border-gray-700 text-white text-xs p-1 rounded"
                            >
                              <option value="">Assign...</option>
                              {courts.filter(c => c.active).map(c => (
                                <option key={c.id} value={c.name}>{c.name}</option>
                              ))}
                            </select>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>

          {/* Clear All Assignments */}
          {matchStats.withCourt > 0 && (
            <button
              onClick={handleClearCourtAssignments}
              disabled={assigning}
              className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm"
            >
              Clear All Court Assignments ({matchStats.withCourt})
            </button>
          )}
        </div>
      )}

      {/* TIMELINE TAB - V07.27: Grid view of Court × Time */}
      {activeTab === 'timeline' && hasVenue && (
        <div className="p-4 space-y-4">
          {/* Session Info */}
          <div className="bg-lime-500/10 border border-lime-500/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lime-400 text-lg">📊</span>
              <span className="font-semibold text-lime-300">Session Timeline</span>
            </div>
            <p className="text-sm text-gray-400">
              View matches organized by court and time slot. Each row is a time slot, each column is a court.
            </p>
          </div>

          {/* Timeline Grid */}
          {(() => {
            // Get scheduled matches with time slots
            const scheduledMatches = divisionMatches.filter(m => m.startTime && m.court);

            if (scheduledMatches.length === 0) {
              return (
                <div className="bg-gray-800 rounded-lg p-8 text-center">
                  <div className="text-gray-500 text-4xl mb-3">📋</div>
                  <p className="text-gray-400">No matches scheduled yet</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Generate matches and they'll be auto-scheduled to courts and time slots
                  </p>
                </div>
              );
            }

            // Get unique time slots and courts
            const timeSlots = [...new Set(scheduledMatches.map(m => m.startTime))].filter(Boolean).sort() as string[];
            const activeCourts = courts.filter(c => c.active).sort((a, b) => a.order - b.order);

            // Build grid data: grid[timeSlot][courtName] = match
            const grid: Record<string, Record<string, LeagueMatch | null>> = {};
            timeSlots.forEach(slot => {
              grid[slot] = {};
              activeCourts.forEach(court => {
                grid[slot][court.name] = null;
              });
            });

            scheduledMatches.forEach(match => {
              if (match.startTime && match.court && grid[match.startTime]) {
                grid[match.startTime][match.court] = match;
              }
            });

            // Stats
            const totalSlots = timeSlots.length * activeCourts.length;
            const filledSlots = scheduledMatches.length;
            const unscheduledCount = divisionMatches.filter(m => !m.startTime || !m.court).length;

            return (
              <>
                {/* Stats Bar */}
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-400">
                    <span className="text-white font-medium">{filledSlots}</span>/{totalSlots} slots used
                  </span>
                  {unscheduledCount > 0 && (
                    <span className="text-amber-400">
                      ⚠️ {unscheduledCount} unscheduled
                    </span>
                  )}
                </div>

                {/* Grid */}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] border-collapse">
                    <thead>
                      <tr>
                        <th className="text-left text-xs text-gray-500 font-medium p-2 border-b border-gray-700 w-20">
                          Time
                        </th>
                        {activeCourts.map(court => (
                          <th
                            key={court.id}
                            className="text-center text-xs text-gray-400 font-medium p-2 border-b border-gray-700"
                          >
                            {court.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {timeSlots.map((slot, slotIdx) => (
                        <tr key={slot} className={slotIdx % 2 === 0 ? 'bg-gray-800/30' : ''}>
                          <td className="text-xs text-gray-400 font-mono p-2 border-b border-gray-800 whitespace-nowrap">
                            {slot}
                          </td>
                          {activeCourts.map(court => {
                            const match = grid[slot][court.name];
                            return (
                              <td
                                key={court.id}
                                className="p-1 border-b border-gray-800"
                              >
                                {match ? (
                                  <div className={`rounded p-2 text-xs ${
                                    match.status === 'completed'
                                      ? 'bg-green-500/20 border border-green-500/30'
                                      : 'bg-blue-500/20 border border-blue-500/30'
                                  }`}>
                                    <div className="font-medium text-white truncate">
                                      {match.memberAName?.split(' ')[0] || 'A'}
                                    </div>
                                    <div className="text-gray-400">vs</div>
                                    <div className="font-medium text-white truncate">
                                      {match.memberBName?.split(' ')[0] || 'B'}
                                    </div>
                                    {match.status === 'completed' && (
                                      <div className="text-green-400 text-[10px] mt-1">✓ Done</div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="h-16 rounded bg-gray-800/50 border border-dashed border-gray-700" />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Legend */}
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-blue-500/20 border border-blue-500/30" />
                    <span>Scheduled</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-green-500/20 border border-green-500/30" />
                    <span>Completed</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-gray-800/50 border border-dashed border-gray-700" />
                    <span>Empty</span>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Clear Confirmation Modal */}
      {showConfirmClear && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full border border-gray-700">
            <h3 className="text-lg font-bold text-white mb-3">
              🗑️ Clear Scheduled Matches?
            </h3>
            <p className="text-gray-400 text-sm mb-2">
              This will delete {matchStats.scheduled} scheduled matches.
              Completed matches will not be affected.
            </p>
            <p className="text-gray-500 text-sm mb-4">
              You can regenerate the schedule after clearing.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmClear(false)}
                className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleClearMatches}
                disabled={clearing}
                className="flex-1 py-2 bg-red-600 hover:bg-red-500 disabled:bg-gray-600 text-white rounded-lg font-semibold"
              >
                {clearing ? 'Clearing...' : 'Clear Matches'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default LeagueScheduleManager;
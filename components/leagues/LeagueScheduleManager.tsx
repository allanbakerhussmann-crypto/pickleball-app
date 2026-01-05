/**
 * LeagueScheduleManager Component V05.44
 *
 * Organizer tool to generate and manage league match schedules.
 *
 * FILE LOCATION: components/leagues/LeagueScheduleManager.tsx
 */

import React, { useState, useMemo } from 'react';
import {
  generateLeagueSchedule,
  generateSwissRound,
  clearLeagueMatches,
} from '../../services/firebase/leagueMatchGeneration';
import { doc, updateDoc } from '@firebase/firestore';
import { db } from '../../services/firebase';
import type { League, LeagueMember, LeagueMatch, LeagueDivision } from '../../types';

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
  // State
  const [generating, setGenerating] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedDivisionId, setSelectedDivisionId] = useState<string | null>(null);
  const [swissRound, setSwissRound] = useState(1);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [activeTab, setActiveTab] = useState<'generate' | 'courts' | 'weeks'>('generate');
  
  // Court assignment state
  const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set());
  const [bulkCourt, setBulkCourt] = useState<string>('');

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

  // Format info
  const formatInfo = useMemo(() => {
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
  }, [league.format, league.settings, divisionMembers.length]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleGenerate = async () => {
    if (league.format === 'ladder') {
      setError('Ladder leagues use on-demand challenges. Matches are created when players challenge each other.');
      return;
    }

    if (divisionMembers.length < 2) {
      setError('Need at least 2 active members to generate a schedule');
      return;
    }

    // V07.15: Block generation if matches already exist (prevent duplicates)
    // For Swiss, allow generating new rounds. For other formats, BLOCK if matches exist.
    if (league.format !== 'swiss' && matchStats.total > 0) {
      setError(`Schedule already exists (${matchStats.total} matches). Use "Clear" to delete existing matches before regenerating.`);
      return;
    }

    setGenerating(true);
    setError(null);
    setResult(null);

    try {
      let genResult: GenerationResult;

      if (league.format === 'swiss') {
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

      {/* Tabs - V05.37: Added Weeks tab */}
      <div className="flex border-b border-gray-700">
        <button
          onClick={() => setActiveTab('generate')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            activeTab === 'generate' 
              ? 'bg-gray-700 text-white border-b-2 border-blue-500' 
              : 'text-gray-400 hover:text-white'
          }`}
        >
          🎲 Generate
        </button>
        <button
          onClick={() => setActiveTab('weeks')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            activeTab === 'weeks' 
              ? 'bg-gray-700 text-white border-b-2 border-blue-500' 
              : 'text-gray-400 hover:text-white'
          }`}
        >
          📆 Weeks
        </button>
        {hasVenue && (
          <button
            onClick={() => setActiveTab('courts')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'courts' 
                ? 'bg-gray-700 text-white border-b-2 border-blue-500' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            🏟️ Courts
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
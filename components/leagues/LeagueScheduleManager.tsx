/**
 * LeagueScheduleManager Component V05.34
 * 
 * Organizer tool to generate and manage league match schedules.
 * NEW: Court assignment with auto-assign logic
 * FIXED: Removed unused variables (formatTime, addMinutes, DAY_NAMES, timeSlots)
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
  const [activeTab, setActiveTab] = useState<'generate' | 'courts'>('generate');
  
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
        const numBoxes = Math.ceil(divisionMembers.length / boxSize);
        const matchesPerBox = (boxSize * (boxSize - 1)) / 2;
        return {
          description: `${numBoxes} boxes of ~${boxSize} players each`,
          expectedMatches: numBoxes * matchesPerBox,
        };
        
      case 'ladder':
        return {
          description: 'Challenge system - no pre-generated matches',
          expectedMatches: 0,
        };
        
      default:
        return { description: '', expectedMatches: 0 };
    }
  }, [league.format, league.settings, divisionMembers.length]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleGenerate = async () => {
    if (league.format === 'ladder') {
      setError('Ladder leagues use challenges. Matches are created when players challenge each other.');
      return;
    }

    if (divisionMembers.length < 2) {
      setError('Need at least 2 active members to generate a schedule');
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

  // Assign a single match to a court
  const handleAssignCourt = async (matchId: string, courtName: string) => {
    try {
      const matchRef = doc(db, 'leagues', league.id, 'matches', matchId);
      await updateDoc(matchRef, { 
        court: courtName || null,
        venue: venueSettings?.venueName || null,
      });
      onScheduleGenerated();
    } catch (err: any) {
      setError(err.message || 'Failed to assign court');
    }
  };

  // Bulk assign selected matches
  const handleBulkAssign = async () => {
    if (!bulkCourt || selectedMatches.size === 0) return;
    
    setAssigning(true);
    setError(null);

    try {
      const promises = Array.from(selectedMatches).map(matchId => {
        const matchRef = doc(db, 'leagues', league.id, 'matches', matchId);
        return updateDoc(matchRef, { 
          court: bulkCourt,
          venue: venueSettings?.venueName || null,
        });
      });

      await Promise.all(promises);
      setSelectedMatches(new Set());
      setBulkCourt('');
      onScheduleGenerated();
    } catch (err: any) {
      setError(err.message || 'Failed to bulk assign courts');
    } finally {
      setAssigning(false);
    }
  };

  // Auto-assign courts to all unassigned matches
  const handleAutoAssignCourts = async () => {
    if (!hasVenue || unassignedMatches.length === 0) {
      if (unassignedMatches.length === 0) {
        setError('No unassigned matches to assign');
      }
      return;
    }

    setAssigning(true);
    setError(null);

    try {
      const activeCourts = courts.filter(c => c.active);
      if (activeCourts.length === 0) {
        setError('No active courts available');
        setAssigning(false);
        return;
      }

      // Track court assignments for balancing
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

      {/* Tabs */}
      {hasVenue && (
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
            onClick={() => setActiveTab('courts')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'courts' 
                ? 'bg-gray-700 text-white border-b-2 border-blue-500' 
                : 'text-gray-400 hover:text-white'
            }`}
          >
            🎾 Courts
            {unassignedMatches.length > 0 && (
              <span className="ml-2 bg-yellow-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                {unassignedMatches.length}
              </span>
            )}
          </button>
        </div>
      )}

      <div className="p-4 space-y-4">
        {/* Division Selector */}
        {divisions.length > 0 && (
          <div>
            <label className="block text-sm text-gray-400 mb-1">Division</label>
            <select
              value={selectedDivisionId || ''}
              onChange={e => setSelectedDivisionId(e.target.value || null)}
              className="w-full bg-gray-900 border border-gray-700 text-white p-2 rounded-lg"
            >
              <option value="">All Divisions</option>
              {divisions.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-gray-900 p-3 rounded-lg text-center">
            <div className="text-2xl font-bold text-white">{matchStats.total}</div>
            <div className="text-xs text-gray-500">Total Matches</div>
          </div>
          <div className="bg-gray-900 p-3 rounded-lg text-center">
            <div className="text-2xl font-bold text-blue-400">{matchStats.scheduled}</div>
            <div className="text-xs text-gray-500">Scheduled</div>
          </div>
          <div className="bg-gray-900 p-3 rounded-lg text-center">
            <div className="text-2xl font-bold text-green-400">{matchStats.completed}</div>
            <div className="text-xs text-gray-500">Completed</div>
          </div>
          {hasVenue && (
            <div className="bg-gray-900 p-3 rounded-lg text-center">
              <div className="text-2xl font-bold text-purple-400">{matchStats.withCourt}</div>
              <div className="text-xs text-gray-500">With Court</div>
            </div>
          )}
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="bg-red-900/20 border border-red-600 text-red-400 p-3 rounded-lg text-sm">
            {error}
          </div>
        )}
        
        {result && (
          <div className={`p-3 rounded-lg text-sm ${
            result.success 
              ? 'bg-green-900/20 border border-green-600 text-green-400' 
              : 'bg-red-900/20 border border-red-600 text-red-400'
          }`}>
            {result.success 
              ? result.matchesCreated > 0 
                ? `✓ Generated ${result.matchesCreated} matches` 
                : result.error 
              : result.error}
          </div>
        )}

        {/* Generate Tab */}
        {activeTab === 'generate' && (
          <>
            {/* Format Info */}
            <div className="bg-gray-900/50 p-3 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-gray-400 text-sm">Format: </span>
                  <span className="text-white font-medium capitalize">
                    {league.format.replace('_', ' ')}
                  </span>
                </div>
                <div className="text-sm text-gray-500">
                  {divisionMembers.length} members
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-1">{formatInfo.description}</p>
              {formatInfo.expectedMatches > 0 && (
                <p className="text-xs text-gray-600 mt-1">
                  Expected: ~{formatInfo.expectedMatches} matches
                </p>
              )}
            </div>

            {/* Swiss Round Selector */}
            {league.format === 'swiss' && (
              <div className="bg-gray-900/50 p-3 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Generate Round:</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSwissRound(Math.max(1, swissRound - 1))}
                      className="w-8 h-8 bg-gray-700 rounded text-white"
                      disabled={swissRound <= 1}
                    >
                      -
                    </button>
                    <span className="text-white font-bold w-8 text-center">{swissRound}</span>
                    <button
                      onClick={() => setSwissRound(swissRound + 1)}
                      className="w-8 h-8 bg-gray-700 rounded text-white"
                    >
                      +
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Current highest round in schedule: {currentSwissRound - 1 || 'None'}
                </p>
              </div>
            )}

            {/* Generate Button */}
            {league.format !== 'ladder' && (
              <button
                onClick={handleGenerate}
                disabled={generating || divisionMembers.length < 2}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded-lg font-semibold transition-colors"
              >
                {generating ? '⏳ Generating...' : `🎲 Generate ${league.format === 'swiss' ? `Round ${swissRound}` : 'Schedule'}`}
              </button>
            )}

            {league.format === 'ladder' && (
              <div className="text-center py-4 text-gray-400">
                <p>🪜 Ladder leagues don't need pre-generated schedules.</p>
                <p className="text-sm mt-1">Matches are created when players challenge each other.</p>
              </div>
            )}

            {/* Clear Matches */}
            {matchStats.scheduled > 0 && (
              <button
                onClick={() => setShowConfirmClear(true)}
                className="w-full py-2 border border-red-600 text-red-400 rounded-lg hover:bg-red-600/10 transition-colors text-sm"
              >
                🗑️ Clear Scheduled Matches ({matchStats.scheduled})
              </button>
            )}
          </>
        )}

        {/* Courts Tab */}
        {activeTab === 'courts' && hasVenue && (
          <>
            {/* Court Usage */}
            <div className="bg-gray-900/50 p-3 rounded-lg">
              <h4 className="text-sm font-medium text-white mb-2">Court Usage</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {courts.map(court => (
                  <div 
                    key={court.id} 
                    className={`p-2 rounded text-center ${
                      court.active ? 'bg-gray-800' : 'bg-gray-800/50'
                    }`}
                  >
                    <div className={`font-medium ${court.active ? 'text-white' : 'text-gray-500'}`}>
                      {court.name}
                    </div>
                    <div className="text-lg font-bold text-blue-400">
                      {courtUsage[court.name] || 0}
                    </div>
                    <div className="text-xs text-gray-500">matches</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Auto-Assign Button */}
            {unassignedMatches.length > 0 && (
              <button
                onClick={handleAutoAssignCourts}
                disabled={assigning}
                className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 text-white rounded-lg font-semibold transition-colors"
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
                              isCompleted ? 'bg-gray-800/30' : ''
                            }`}
                          >
                            {!isCompleted && (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleMatchSelection(match.id)}
                                className="w-4 h-4 accent-blue-500"
                              />
                            )}
                            
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-white truncate">
                                {match.memberAName}
                              </div>
                              <div className="text-xs text-gray-500">vs</div>
                              <div className="text-sm text-white truncate">
                                {match.memberBName}
                              </div>
                            </div>
                            
                            {isCompleted ? (
                              <span className="text-xs text-green-400 bg-green-900/30 px-2 py-1 rounded">
                                ✓ Done
                              </span>
                            ) : (
                              <select
                                value={match.court || ''}
                                onChange={e => handleAssignCourt(match.id, e.target.value)}
                                className={`bg-gray-800 border text-sm p-1.5 rounded ${
                                  match.court 
                                    ? 'border-green-600 text-green-400' 
                                    : 'border-gray-600 text-gray-400'
                                }`}
                              >
                                <option value="">No court</option>
                                {courts.filter(c => c.active).map(c => (
                                  <option key={c.id} value={c.name}>{c.name}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>

            {/* Quick Actions */}
            <div className="flex gap-2">
              {unassignedMatches.length > 0 && (
                <button
                  onClick={selectAllUnassigned}
                  className="flex-1 py-2 border border-gray-600 text-gray-400 rounded-lg hover:border-gray-500 hover:text-white text-sm"
                >
                  Select All Unassigned
                </button>
              )}
              {matchStats.withCourt > 0 && (
                <button
                  onClick={handleClearCourtAssignments}
                  disabled={assigning}
                  className="flex-1 py-2 border border-yellow-600 text-yellow-400 rounded-lg hover:bg-yellow-600/10 text-sm"
                >
                  Clear All Courts
                </button>
              )}
            </div>
          </>
        )}

        {/* No Venue Message */}
        {!hasVenue && activeTab === 'courts' && (
          <div className="text-center py-8 text-gray-400">
            <p>🏟️ No venue configured for this league.</p>
            <p className="text-sm mt-2">
              Edit the league to add venue and court settings.
            </p>
          </div>
        )}
      </div>

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
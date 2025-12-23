/**
 * Schedule Builder - Main Component
 *
 * Post-registration schedule generation with conflict detection.
 * Used after registration closes to create the tournament schedule.
 *
 * FILE LOCATION: components/tournament/scheduleBuilder/ScheduleBuilder.tsx
 * VERSION: V06.00
 */

import React, { useState, useMemo, useCallback } from 'react';
import type {
  ScheduledMatch,
  ScheduleConflict,
  DivisionScheduleBlock,
  CourtAvailability,
  ScheduleGenerationOptions,
  TournamentDay,
} from '../../../types';
import { DEFAULT_SCHEDULE_OPTIONS } from '../../../types';
import {
  generateDivisionBlocks,
  generateSchedule,
  detectConflicts,
  autoFixAllConflicts,
} from '../../../services/scheduleBuilder';
import { TimelineView } from './TimelineView';
import { ConflictPanel } from './ConflictPanel';

interface Division {
  id: string;
  name: string;
  matchCount: number;
  poolMatchCount?: number;
  bracketMatchCount?: number;
}

interface Registration {
  divisionId: string;
  teamId: string;
  teamName: string;
  playerIds: string[];
}

interface Matchup {
  divisionId: string;
  matchId: string;
  stage: 'pool' | 'bracket' | 'medal';
  roundNumber?: number;
  matchNumber: number;
  teamAId: string;
  teamBId: string;
}

interface ScheduleBuilderProps {
  tournamentId: string;
  tournamentName: string;
  days: TournamentDay[];
  divisions: Division[];
  courts: CourtAvailability[];
  registrations: Registration[];
  matchups: Matchup[];
  onPublish: (matches: ScheduledMatch[]) => void;
  onCancel: () => void;
}

export const ScheduleBuilder: React.FC<ScheduleBuilderProps> = ({
  tournamentId,
  tournamentName,
  days,
  divisions,
  courts,
  registrations,
  matchups,
  onPublish,
  onCancel,
}) => {
  // State
  const [options, setOptions] = useState<ScheduleGenerationOptions>(DEFAULT_SCHEDULE_OPTIONS);
  const [enabledDivisions, setEnabledDivisions] = useState<Set<string>>(
    new Set(divisions.map((d) => d.id))
  );
  const [enabledCourts, setEnabledCourts] = useState<Set<string>>(
    new Set(courts.filter((c) => c.available).map((c) => c.courtId))
  );
  const [matches, setMatches] = useState<ScheduledMatch[]>([]);
  const [conflicts, setConflicts] = useState<ScheduleConflict[]>([]);
  const [isGenerated, setIsGenerated] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  // Filter enabled divisions and courts
  const activeDivisions = useMemo(
    () => divisions.filter((d) => enabledDivisions.has(d.id)),
    [divisions, enabledDivisions]
  );

  const activeCourts = useMemo(
    () => courts.map((c) => ({
      ...c,
      available: enabledCourts.has(c.courtId),
    })),
    [courts, enabledCourts]
  );

  // Generate division blocks for timeline
  const divisionBlocks = useMemo(() => {
    return generateDivisionBlocks(activeDivisions, days, activeCourts, options);
  }, [activeDivisions, days, activeCourts, options]);

  // Generate schedule
  const handleGenerate = useCallback(() => {
    // Filter matchups for enabled divisions
    const activeMatchups = matchups.filter((m) => enabledDivisions.has(m.divisionId));

    // Generate initial schedule
    let newMatches = generateSchedule(
      divisionBlocks,
      registrations,
      activeMatchups,
      activeCourts,
      options
    );

    // Auto-fix conflicts if enabled
    if (options.autoResolveConflicts) {
      const result = autoFixAllConflicts(newMatches, activeCourts, options);
      newMatches = result.matches;
      setConflicts(result.remainingConflicts);
    } else {
      setConflicts(detectConflicts(newMatches, options));
    }

    // Mark matches with conflicts
    const conflictMatchIds = new Set(
      conflicts.flatMap((c) => c.matchIds)
    );
    newMatches = newMatches.map((m) => ({
      ...m,
      hasConflict: conflictMatchIds.has(m.matchId),
    }));

    setMatches(newMatches);
    setIsGenerated(true);
  }, [divisionBlocks, registrations, matchups, activeCourts, options, enabledDivisions, conflicts]);

  // Handle conflict ignore
  const handleIgnoreConflict = useCallback((conflictId: string) => {
    setConflicts((prev) =>
      prev.map((c) => (c.id === conflictId ? { ...c, ignored: true } : c))
    );
  }, []);

  // Handle conflict auto-fix
  const handleAutoFixConflict = useCallback((conflictId: string) => {
    const conflict = conflicts.find((c) => c.id === conflictId);
    if (!conflict) return;

    const result = autoFixAllConflicts(matches, activeCourts, options);
    setMatches(result.matches);
    setConflicts(result.remainingConflicts);
  }, [conflicts, matches, activeCourts, options]);

  // Toggle division
  const toggleDivision = useCallback((divisionId: string) => {
    setEnabledDivisions((prev) => {
      const next = new Set(prev);
      if (next.has(divisionId)) {
        next.delete(divisionId);
      } else {
        next.add(divisionId);
      }
      return next;
    });
    setIsGenerated(false);
  }, []);

  // Toggle court
  const toggleCourt = useCallback((courtId: string) => {
    setEnabledCourts((prev) => {
      const next = new Set(prev);
      if (next.has(courtId)) {
        next.delete(courtId);
      } else {
        next.add(courtId);
      }
      return next;
    });
    setIsGenerated(false);
  }, []);

  // Count unresolved conflicts
  const unresolvedCount = conflicts.filter((c) => !c.ignored).length;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📅</span>
            <div>
              <h1 className="text-xl font-bold">Schedule Builder</h1>
              <p className="text-sm text-gray-400">{tournamentName}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onPublish(matches)}
              disabled={!isGenerated || unresolvedCount > 0}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                isGenerated && unresolvedCount === 0
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
            >
              Publish Schedule
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Left sidebar - Controls */}
          <div className="col-span-3 space-y-4">
            {/* Divisions */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="font-medium text-white mb-3">Divisions</h3>
              <div className="space-y-2">
                {divisions.map((div) => (
                  <label
                    key={div.id}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={enabledDivisions.has(div.id)}
                      onChange={() => toggleDivision(div.id)}
                      className="w-4 h-4 rounded border-gray-600 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-gray-300">{div.name}</span>
                    <span className="text-xs text-gray-500">
                      ({div.matchCount} matches)
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Courts */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="font-medium text-white mb-3">Courts</h3>
              <div className="space-y-2">
                {[...new Set(courts.map((c) => c.courtId))].map((courtId) => {
                  const court = courts.find((c) => c.courtId === courtId);
                  return (
                    <label
                      key={courtId}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={enabledCourts.has(courtId)}
                        onChange={() => toggleCourt(courtId)}
                        className="w-4 h-4 rounded border-gray-600 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-gray-300">{court?.courtName}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Options */}
            <div className="bg-gray-800 rounded-lg p-4">
              <button
                onClick={() => setShowOptions(!showOptions)}
                className="flex items-center justify-between w-full text-white"
              >
                <span className="font-medium">Options</span>
                <span>{showOptions ? '▲' : '▼'}</span>
              </button>

              {showOptions && (
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      Min Rest (minutes)
                    </label>
                    <input
                      type="number"
                      value={options.minRestMinutes}
                      onChange={(e) =>
                        setOptions({
                          ...options,
                          minRestMinutes: parseInt(e.target.value) || 10,
                        })
                      }
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      Slot Duration (minutes)
                    </label>
                    <input
                      type="number"
                      value={options.slotDurationMinutes}
                      onChange={(e) =>
                        setOptions({
                          ...options,
                          slotDurationMinutes: parseInt(e.target.value) || 25,
                        })
                      }
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                    />
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={options.autoResolveConflicts}
                      onChange={(e) =>
                        setOptions({
                          ...options,
                          autoResolveConflicts: e.target.checked,
                        })
                      }
                      className="w-4 h-4 rounded border-gray-600 text-blue-600"
                    />
                    <span className="text-sm text-gray-300">Auto-resolve conflicts</span>
                  </label>
                </div>
              )}
            </div>

            {/* Generate button */}
            <button
              onClick={handleGenerate}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
            >
              {isGenerated ? 'Regenerate Schedule' : 'Generate Schedule'}
            </button>
          </div>

          {/* Main content - Timeline and Conflicts */}
          <div className="col-span-9 space-y-4">
            {/* Timeline */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="font-medium text-white mb-4">
                Timeline {isGenerated ? `(${matches.length} matches)` : '(Preview)'}
              </h3>
              <TimelineView
                days={days}
                divisionBlocks={divisionBlocks}
                matches={isGenerated ? matches : []}
              />
            </div>

            {/* Conflicts */}
            {isGenerated && conflicts.length > 0 && (
              <ConflictPanel
                conflicts={conflicts}
                onIgnore={handleIgnoreConflict}
                onAutoFix={handleAutoFixConflict}
              />
            )}

            {/* Success message */}
            {isGenerated && unresolvedCount === 0 && (
              <div className="bg-green-900/30 border border-green-700 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">✅</span>
                  <div>
                    <p className="font-medium text-green-400">
                      Schedule ready to publish!
                    </p>
                    <p className="text-sm text-green-300/80">
                      {matches.length} matches scheduled across {days.length} day(s)
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScheduleBuilder;
